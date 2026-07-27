# Atriptech (Atlas) vs Travelport: Order/Purchase Workflow

## TL;DR

Today, **both** providers already work the same way, and it's the opposite of the assumption that kicked this off: neither one forces immediate purchase. Both create a reservation first and defer the actual airline ticket purchase to a later, separate step:

- **Atriptech ("Atlas" internally)**: `order.do` creates a reservation now; `pay.do` (the real purchase) happens later, today triggered manually ("Contact admin for ticket issuance").
- **Travelport**: `AirCreateReservationReq` creates a PNR/Universal Record now; `AirTicketingReq` (the real purchase) happens later, either via a scheduled date or an auto-issue background worker.

They already converge on one shared `Booking` database entity and one shared ticketing state machine — so at the data-model level they are *not* clashing. The real problems are (a) each provider defers ticketing in a different, ad-hoc way, and (b) **the deferral itself is not what's wanted going forward.**

**Target direction (confirmed):** order should equal purchase, atomically, for both providers. This document lays out today's flow for each provider, where they already share code, where they diverge, and a concrete design to collapse both into one synchronous "order = purchase" pipeline.

---

## 1. Atriptech (Atlas) workflow today

Internal naming note: the codebase never uses the string "Atriptech" — it's codenamed **"Atlas"** everywhere (config, classes, DB fields). The frontend even actively scrubs "atlas" out of anything shown to users (`frontend/lib/scrubProviderMentions.ts`).

**Call sequence:**

```
search.do          → flight/fare search
verify.do           → verify/price a chosen fare (also called again just before booking)
getLuggage.do       → optional: baggage ancillary options
seatAvailability.do → optional: seat map
order.do            → creates the reservation                [ORDER — happens now]
──────────────────────────────────────────────────────────────────────────
pay.do              → pays for the order, triggers ticketing  [PURCHASE — happens LATER]
queryOrderDetails.do → polled up to 12x with backoff (5s→20s) until ticket numbers appear
```

**Where this lives in code:**
- `backend/TourValve.Infrastructure/Atlas/AtlasApiClient.cs` — raw client for all 7 endpoints above
- `backend/TourValve.Api/Controllers/AtlasFlightsController.cs` (`api/atlas/flights`) — search, prebook-ancillaries
- `backend/TourValve.Api/Controllers/AtlasBookingController.cs` (`api/atlas/booking`) — calls `verify.do` then `order.do`
- `backend/TourValve.Infrastructure/Atlas/AtlasTicketingService.cs` — the deferred `pay.do` + polling step
- Frontend: `searchAtlasFlights` / `bookAtlasFlight` in `frontend/lib/api.ts`

**What happens on order (`order.do`):** a `Booking` row is created with `Status = "CONFIRMED"`, `AirTicketingStatus = "NOT_STARTED"`, `AirTicketingPaymentStatus = "UNPAID"`. The API response literally says *"Reservation created successfully. Contact admin for ticket issuance."* No money moves, no ticket is issued.

**What triggers the purchase step today:** an admin/agent action via `BookingsController.cs` (`AirTicketing` issue endpoint), which calls `AirTicketingWorkflowService.IssueAsync` → Atlas's `pay.do` → polls `queryOrderDetails.do` until ticket numbers/airline PNR show up. Only then does `Booking.Status` become `"TICKETED"`.

**Notable gap:** Atlas has **no known hold-duration or expiry concept**. Nothing in the code (or, as far as we can tell, in Atriptech's API) says how long an `order.do` reservation stays valid before price or seat availability could change or the order silently expires. This is an unverified supplier-side risk, not a code design choice — worth confirming with Atriptech directly.

**Environment:** Atlas is **sandbox-only**. `AtlasOptions.cs` and the dev appsettings hardcode `BaseUrl = "https://sandbox.atriptech.com"`. Production `appsettings.json` has **no `Atlas` section at all** — Atlas cannot currently process a real booking in production.

---

## 2. Travelport workflow today

**Call sequence:**

```
LowFareSearchReq        → flight/fare search
AirPriceReq              → re-price the selected itinerary
AirCreateReservationReq  → creates PNR / Universal Record, NO ticketing   [ORDER — happens now]
──────────────────────────────────────────────────────────────────────────
AirTicketingReq          → issues the actual ticket                       [PURCHASE — happens LATER]
AirRetrieveDocumentReq   → verifies the ticket was issued (retry loop)
AirVoidDocumentReq       → voids a ticket if needed
```

**Where this lives in code:**
- `backend/TourValve.Infrastructure/Travelport/Air/AirBookService.cs`, `AirSearchService.cs`, `AirPriceService.cs` — search/price/reserve
- `backend/TourValve.Api/Controllers/AirBookingController.cs` (`api/air-booking`) — re-prices then builds `AirCreateReservationReq`
- `backend/TourValve.Infrastructure/Travelport/Air/UniversalRecordService.cs` — PNR/Universal Record retrieve
- `backend/TourValve.Infrastructure/Travelport/Air/BookingTicketingService.cs` — the deferred ticketing step
- `backend/TourValve.Infrastructure/Travelport/Air/AirTicketingWorkflowService.cs` — schedules/issues/voids, shared with Atlas (see below)
- `backend/TourValve.Api/Services/AirTicketingWorker.cs` — background auto-issue worker
- Frontend: `searchFlights` / `bookFlight` in `frontend/lib/api.ts`

**What happens on reservation (`AirCreateReservationReq`):** a `Booking` row is created with `Status = "PENDING_TICKETING"`. The reservation request also injects a Travelport `TAW` (Ticket-Auto-Waitlist) `ActionStatus` with a `TicketDate` — a time-limit required by Travelport itself to avoid error 7228. No ticket is issued yet.

**What triggers the purchase step today:**
- Explicit: `AirTicketingWorkflowService.ScheduleAsync` sets `AirTicketingDate` (validated 0–5 days out) → later, `IssueAsync` runs `AirTicketingReq`.
- Automatic: `AirTicketingWorker.cs` polls every 1 minute for bookings whose `AirTicketingDate <= now` and auto-issues them — gated by `appsettings.json`'s `AirTicketing.AutoIssueEnabled` (currently **`false`**, i.e. not actually running today even though the mechanism exists).

**Environment:** Travelport is **live in production**. `README.md` states "the backend is configured for live Travelport only"; `appsettings.json` points at `apac.universal-api.pp.travelport.com`; `TravelportConfig.HasLiveCredentials()` gates real bookings.

---

## 3. Where the two providers already share code

This is the important nuance: **the two flows are not architecturally isolated from each other.** They already converge on:

| Shared piece | File | What it does for both providers |
|---|---|---|
| `Booking` entity/table | `backend/TourValve.Domain/Booking.cs` | One table, `ProviderCode` field distinguishes "ATLAS" vs GDS codes (e.g. "1G") |
| `CreateBookingCommand` + handler | `backend/TourValve.Application/Bookings/Commands/CreateBookingCommandHandler.cs` | Both `AirBookingController` and `AtlasBookingController` call the same MediatR command to create the `Booking` row |
| `AirTicketingWorkflowService` | `backend/TourValve.Infrastructure/Travelport/Air/AirTicketingWorkflowService.cs` | Orchestrates schedule/issue/void for both, with an internal `if (ProviderCode == "ATLAS")` branch vs the GDS branch |
| `AirTicketingStatus` / `AirTicketingPaymentStatus` | on `Booking` | Same state machine values for both: `NOT_STARTED → SCHEDULED → IN_PROGRESS → AWAITING_EVIDENCE → ISSUED/FAILED/VOIDED`, and `UNPAID → HOLD_ACTIVE → PAID → VOIDED` |
| Wallet hold/capture | `IWalletService` (`CreateHoldForUserAsync`/`CaptureHoldAsync`/`ReleaseHoldAsync`) | Used identically by both booking controllers |

So the two suppliers are not clashing at the data or workflow-state level — they're deliberately unified there. The divergence is narrower than it first appears.

---

## 4. Where they actually diverge (the real problems)

1. **Both defer purchase, in different, ad-hoc ways.** Atlas has no expiry/time-limit concept at all — it's an indefinite "contact admin" step. Travelport has an explicit TAW time-limit (0–5 days) plus a background auto-issue worker (currently disabled). Neither shape matches the desired "order = purchase" behavior — this isn't one provider being stricter than the other, it's both being looser than wanted.
2. **Duplicated provider-specific plumbing.** Separate controllers (`AirBookingController` vs `AtlasBookingController`), separate endpoints (`api/flights/*` vs `api/atlas/flights/*`), separate frontend functions (`searchFlights`/`searchAtlasFlights`, `bookFlight`/`bookAtlasFlight` in `frontend/lib/api.ts`), and scattered `isAtlasProviderCode()` checks in `frontend/app/flight-search/page.tsx` — all doing informal dispatch instead of going through one shared abstraction. This adds maintenance/consistency risk on top of the timing issue.
3. **Atlas is sandbox-only today.** No production config exists for it, so this entire class of problem is currently latent for Atlas — it will only bite once Atlas is turned on in production alongside live Travelport.

---

## 5. Target design: order = purchase, atomically, for both providers

The goal is to eliminate the deferred-ticketing gap entirely — not to make it more consistent, but to remove it.

**a) Collapse reserve + ticket into one synchronous operation per provider.**
- `AtlasBookingController.Book`: after `order.do` succeeds, immediately chain into `pay.do` (`AtlasTicketingService`) and poll `queryOrderDetails.do` inline, before returning a response to the user. "Contact admin for ticket issuance" stops being a real workflow step.
- `AirBookingController.Book`: after `AirCreateReservationReq` succeeds, immediately chain into `AirTicketingReq` (`AirTicketingWorkflowService.IssueAsync`) in the same request, instead of `ScheduleAsync`-ing it for later.
- Both providers expose one combined `PurchaseAsync` operation (reserve + ticket) as the primary path, rather than separate reserve/schedule/issue steps.

**b) Synchronous failure handling — the hard part.**
If ticketing fails immediately after reservation (price changed, seat gone, supplier error), the booking must fail loudly and roll back within the same request: void/cancel the reservation (`AirVoidDocumentReq` for Travelport) and release/refund the wallet hold. **Atlas currently has no void endpoint** — this is a gap that needs closing before Atlas can safely support immediate-purchase, since a failed `pay.do` with no way to void the underlying `order.do` would leave a dangling reservation.

**c) Strict wallet ordering.**
Capture the wallet hold immediately before invoking ticketing (not "often immediate" as today), so money is only taken right as a ticket is about to be issued. On ticketing failure, release/refund synchronously as part of the same rollback.

**d) Demote scheduling to a resiliency fallback, not a feature.**
Keep `AirTicketingDate` / `AirTicketingWorker` / Atlas's admin-issue path only as an internal retry mechanism for transient failures during the synchronous attempt (e.g. a supplier timeout) — not as a supported "reserve now, pay whenever" UX. This should be documented clearly so it isn't reintroduced later as a feature.

**e) Replace the hardcoded provider branching with a strategy pattern.**
Introduce `IAirTicketingStrategy` (`Issue` / `Void` / `PollStatus`) with a Travelport implementation and an Atlas implementation, so `AirTicketingWorkflowService` becomes a thin per-booking orchestrator instead of containing `if (ProviderCode == "ATLAS")` branches.

**f) Unify the frontend.**
Collapse `searchFlights`/`searchAtlasFlights` and `bookFlight`/`bookAtlasFlight` into single provider-parameterized functions. Once booking is synchronous, the booking call returns a final ticketed/failed result directly — no more "reservation pending" UI state or polling-for-admin-action on the confirmation page.

**g) Rollout gate before Atlas goes live in production.**
Before adding real `Atlas` production config:
- Close the Atlas void-endpoint gap (needed for safe rollback).
- Confirm Atriptech's `pay.do` latency/reliability is acceptable for a request-blocking call — may need a bounded timeout with fallback to the resiliency retry path.
- Complete the strategy-pattern refactor so Atlas's path is independently testable.
- Add a real `AtlasConfig` prod section with a `HasLiveCredentials()`-style guard, matching `TravelportConfig`.
- Load-test the synchronous chain, and consider a feature-flagged, limited-inventory rollout before enabling for all Atlas traffic.

**h) Remove the admin "schedule ticketing for later" feature entirely.**
Once purchase is immediate, there is nothing left to schedule — so this shouldn't just be demoted, it should be deleted:
- `frontend/app/air-ticketing/[bookingId]/page.tsx` — the admin-only "AirTicketing Workspace" (gated to `admin@tourvalve.com`): its date picker for `ticketingDate` (today..+5 days), form-of-payment selector, and "Save Workflow" (schedule) button exist specifically to manage the multi-day gap between reservation and ticketing. That gap no longer exists once purchase happens at order time.
- `frontend/app/ticket-queue/page.tsx` — the admin queue of bookings "awaiting issuance" (`getPendingTicketingQueue` → `GET /api/bookings/pending-ticketing`). With nothing left pending, this queue has no bookings to ever show.
- Backing API calls to remove: `scheduleBookingAirTicketing` (`POST /api/bookings/{id}/air-ticketing/schedule`) and `getPendingTicketingQueue` in `frontend/lib/api.ts`, and the corresponding `ScheduleAirTicketing` / pending-ticketing-list endpoints in `BookingsController.cs`.
- What should stay (not part of the removal): `voidBookingAirTicket` and `markBookingAirTicketPaid` — these are still needed as reconciliation tools for a failed/rolled-back synchronous purchase (see point b above), just no longer reachable through a forward-looking "schedule for later" UI.

**i) Booking page shows the ticket's status immediately, since it's now known synchronously.**
Today, `frontend/app/booking-confirmation/page.tsx` shows a `"PENDING_REVIEW"` ticketing-status fallback and a "Notify admin for ticket issuance" CTA (`notifyStatus` state) whenever ticketing hasn't happened yet — this assumes a later, separate ticketing event. Once ticketing is synchronous within the booking request, that assumption is gone:
- On success, the confirmation page should show the real outcome immediately: ticket number(s) and airline PNR/locator, pulled straight from the booking response instead of showing "Pending" placeholders.
- On failure, it should show a clear failure message (and, per point b above, the booking itself should already have been rolled back/voided rather than left dangling) — not the current "Notify admin" CTA, which implies someone still needs to manually finish the job.
- The same applies to the status pill/toggle in `frontend/app/bookings/page.tsx` (currently keyed off `status === "TICKETED"` to decide whether to show "Open AirTicketing" vs "Issue Ticket") — once every booking is ticketed-or-failed at creation time, there's no longer an intermediate state for that toggle to represent.

---

## 6. Key files reference

| Area | File |
|---|---|
| Atlas API client | `backend/TourValve.Infrastructure/Atlas/AtlasApiClient.cs` |
| Atlas config | `backend/TourValve.Infrastructure/Atlas/AtlasOptions.cs` |
| Atlas booking controller | `backend/TourValve.Api/Controllers/AtlasBookingController.cs` |
| Atlas search controller | `backend/TourValve.Api/Controllers/AtlasFlightsController.cs` |
| Atlas deferred ticketing | `backend/TourValve.Infrastructure/Atlas/AtlasTicketingService.cs` |
| Travelport reserve | `backend/TourValve.Infrastructure/Travelport/Air/AirBookService.cs` |
| Travelport booking controller | `backend/TourValve.Api/Controllers/AirBookingController.cs` |
| Travelport PNR/Universal Record | `backend/TourValve.Infrastructure/Travelport/Air/UniversalRecordService.cs` |
| Travelport deferred ticketing | `backend/TourValve.Infrastructure/Travelport/Air/BookingTicketingService.cs` |
| Auto-issue background worker | `backend/TourValve.Api/Services/AirTicketingWorker.cs` |
| Shared ticketing orchestrator | `backend/TourValve.Infrastructure/Travelport/Air/AirTicketingWorkflowService.cs` |
| Shared booking creation | `backend/TourValve.Application/Bookings/Commands/CreateBookingCommandHandler.cs` |
| Shared domain entity | `backend/TourValve.Domain/Booking.cs` |
| Frontend API client | `frontend/lib/api.ts` |
| Frontend provider-support logic | `frontend/lib/bookingWorkflow.ts` |
| Frontend search page | `frontend/app/flight-search/page.tsx` |

---

## Notes on accuracy

Every claim above traces to a specific file in this repo, confirmed to exist as of 2026-07-15. Where something describes real-world supplier behavior rather than a confirmed code fact — specifically, how long an Atlas `order.do` reservation actually stays valid before it expires or price/availability can change — it is flagged as **unverified** and should be confirmed directly with Atriptech before relying on it.
