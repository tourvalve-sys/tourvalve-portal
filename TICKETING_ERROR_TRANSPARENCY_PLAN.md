# Transparent booking/ticketing error reporting

## Context
This Travelport account currently has an IATA-related account problem that blocks ticket issuance entirely, while reservations still succeed normally. When the post-reservation auto-ticketing step then fails, the booking-confirmation page still reads to the user as a success/"ticketed" outcome, even though the booking is really only reserved. The bookings list, by contrast, already shows the correct "CONFIRMED (not ticketed)" status. The user asked for (1) the specific bug fixed, (2) a page that transparently explains what actually happened whenever an error occurs, and (3) a full survey of other places in the booking flow where errors are silently swallowed or downgraded, since this is bigger than just one bug. This is a **documentation-only deliverable** — no code has been changed as part of this plan.

## Root cause of the reported bug (confirmed by reading the actual code)

**The concrete bug:** in `backend/TourValve.Api/Controllers/AirBookingController.cs`, the success response built right after calling `_airTicketingWorkflow.IssueAsync(...)` (lines 269-298) sets `AirlinePortalReady = true` **unconditionally**, any time `IssueAsync` doesn't throw — regardless of whether `issueResult.TicketNumbers.Count > 0`. `AirlinePortalReady` was intended to mean "the booking has a real backend record + Travelport PNR, ready for servicing," not "the ticket was issued" (contrast with the earlier branch at line 235, where `AirlinePortalReady = false` because the DB record itself failed to sync).

On the frontend, `frontend/app/booking-confirmation/page.tsx` (lines 44-48) derives its headline "ticket issued" state as:
```ts
const ticketIssued =
    Boolean(confirmation?.airlinePortalReady) ||
    Boolean(confirmation?.ticketedAt) ||
    ticketNumbers.length > 0 ||
    confirmation?.airTicketingStatus === "ISSUED";
```
Because `airlinePortalReady` is folded into this OR, **any non-exceptional ticketing attempt reads as "ticket issued" on the confirmation page**, even when `TicketIssued` (the correctly-computed field, `issueResult.TicketNumbers.Count > 0`) is `false` in the very same API response. This is the exact mismatch the user observed.

**Why it doesn't always look this bad, and a second related bug:** `backend/TourValve.Infrastructure/Travelport/Air/AirTicketingWorkflowService.cs` (`IssueAsync`, lines ~279-323) has a fragile classifier, `BookingTicketingService.IsTicketingEvidencePending` (`BookingTicketingService.cs` lines 355-370), that decides whether a "no ticket numbers returned" result is temporary ("awaiting evidence," doesn't throw) or permanent ("failed," throws → caught by the controller's `catch (Exception issueEx)` at line 300 → correctly returns an HTTP 502 with `{error, detail, bookingId, bookingReference}`). This classifier currently only treats a message as "pending" if it literally contains the phrase `"has no tickets yet"` — a phrase that doesn't appear to be produced by the actual current fallback text (`ExtractTicketingFailureDetail`'s generic fallback reads differently) — so it's effectively rotted/unreliable. Depending on the exact wording Travelport returns for this account's IATA problem, the flow could go either way:
- If classified "permanent" → throws → 502 → frontend's `catch` block shows a generic error banner and does **not** navigate to the confirmation page (this path is already mostly correct on the backend, but loses information on the way — see catalog item C1 below).
- If classified "pending" (or if the phrasing ever matches, even by accident) → doesn't throw → 200 OK with `AirlinePortalReady: true` → **hits the confirmation-page bug above**.

Both branches need fixing for this to be reliably correct regardless of the exact error text: the frontend's `ticketIssued` derivation must stop treating `airlinePortalReady` as ticket-issuance evidence, and the "pending vs. permanent" classifier needs a real fix so an IATA-type account-wide failure gets classified as permanently `FAILED` (not stuck in "awaiting evidence" showing "refresh shortly" forever).

## Design: one shared "what happened" transparency layer

Rather than one-off copy tweaks, introduce a single reusable concept both the confirmation page and the bookings list/detail view render from, so "what happened" is told consistently everywhere a booking's outcome is shown:

**Canonical outcome states** (derived from existing `Status`/`AirTicketingStatus`/`AirTicketingLastError` fields — no new DB columns needed for this part):
- `TICKETED` — `AirTicketingStatus == "ISSUED"`, ticket numbers present.
- `RESERVED_PENDING_TICKET` — `AirTicketingStatus == "AWAITING_EVIDENCE"` or `"IN_PROGRESS"`/`"SCHEDULED"` — genuinely still in progress, "refresh shortly" language is honest here.
- `RESERVED_TICKETING_FAILED` — `AirTicketingStatus == "FAILED"` — a real, likely-permanent failure; show the actual reason (`AirTicketingLastError`, run through the existing sanitizer) and a clear "this did not get ticketed" message, not a hopeful "refresh shortly."
- `RESERVATION_SYNC_PENDING` — `PortalSyncPending == true` (the DB-record-creation-failed branch) — different explanation ("we're still syncing your booking record").
- `CANCELLED` / `VOIDED` — existing terminal states.

**New shared frontend component**, e.g. `frontend/components/BookingOutcomeBanner.tsx`, that takes `{ status, airTicketingStatus, airTicketingLastError, ticketNumbers, portalSyncPending }` and renders the right tone (green/amber/red), headline, explanation, and next-action copy for whichever state applies. Reused in three places:
1. `frontend/app/booking-confirmation/page.tsx` — replaces the current binary `ticketIssued` logic with the canonical-state derivation above (dropping `airlinePortalReady` from the check entirely).
2. `frontend/app/bookings/page.tsx` — list status pill upgraded to key off `airTicketingStatus` in addition to `status` (a `"CONFIRMED"` booking whose `airTicketingStatus == "FAILED"` should not render as a plain green success pill), and the detail drawer renders `AirTicketingLastError` (already fetched by the API per `BookingsController.Detail()`, currently unused in the UI) via the same banner component.
3. New capability: since `RESERVED_TICKETING_FAILED` is a real, likely-permanent condition, the banner's "next action" copy should point the user to the bookings section / support contact rather than implying a refresh will fix it.

**Backend support needed:** propagate the real diagnostic text further than it currently goes:
- Add a `TicketingErrorDetail` (or reuse `TicketingMessage` but stop overwriting it with the generic "still in progress" string when the status is actually `FAILED`) field to `AirBookingResponse` so the confirmation page can show the sanitized real reason immediately after booking, not just on a later `bookings` page visit.
- `BookingsController.List()` currently omits `AirTicketingLastError` (only `Detail()` includes it) — add it to the list payload too (or at minimum a boolean "hasTicketingError" flag) so the bookings table can flag it without an extra round-trip per row.

## Full scenario catalog (all found during the survey — each needs its own targeted fix)

### A. Core ticketing-status transparency (the reported bug)
- **A1.** `AirlinePortalReady` conflated with "ticket issued" — `AirBookingController.cs:283` (backend, sets the flag) + `booking-confirmation/page.tsx:44-48` (frontend, misuses it). *Fix: drop `airlinePortalReady` from the `ticketIssued` derivation; rely only on ticket-number/`ISSUED` evidence.*
- **A2.** `IsTicketingEvidencePending` classifier is fragile/rotted (`BookingTicketingService.cs:355-370`, matches the literal string `"has no tickets yet"` which the real fallback text doesn't produce). *Fix: replace with an explicit allowlist of known-temporary Travelport messages (e.g. time-limit/queue messages) vs. treat everything else — including any IATA/agency-authority error text — as permanent `FAILED` by default (fail closed, not open).*
- **A3.** Same silent-bypass risk applies identically to Atlas bookings via the shared `AirTicketingWorkflowService.IssueAsync` — though research found Atlas's own `AtlasTicketingStrategy.IssueAsync` (`backend/TourValve.Infrastructure/Atlas/AtlasTicketingStrategy.cs:15-27`) is already stricter (always throws on zero ticket numbers), so Atlas is lower-risk here but should be covered by the same shared fix for consistency.
- **A4.** `AirBookingResponse` (`backend/TourValve.Api/Models/AirBookingResponse.cs`) has no field carrying the real failure reason when ticketing is stuck — `TicketingMessage`/`Message` are always the same generic "still in progress" string regardless of the real `AirTicketingLastError`. *Fix: per Design section above.*

### B. Money-risk: wallet holds that can get stuck or silently released without telling the user
- **B1.** `AirBookingController.TryCreatePortalBookingAsync` (lines ~493-566, swallows via a catch at ~559) — if the local DB `Booking` row fails to insert after a successful Travelport reservation, a wallet hold may already exist with no DB booking to tie it to, before the capture/release step even runs. *Fix: ensure the wallet hold is captured or released as part of this failure path, and surface a clear "your card was authorized but the booking record needs manual reconciliation — contact support with this reference" message rather than a generic "still syncing" one.*
- **B2.** `AirBookingController.TryReleaseWalletHoldAsync` (lines ~568-577) and `AtlasBookingController`'s equivalent — release failures on the reservation-failure path are swallowed (`catch {}` "keep main provider error as primary"). *Fix: log/notify distinctly when hold release itself fails, so a stuck hold doesn't go unnoticed indefinitely.*
- **B3.** `AirBookingController.TryCaptureReservationWalletChargeAsync` (lines ~605-647) — capture failures fall through nested try/catch blocks that also swallow. *Fix: same as B2 — a failed capture (fare charged as hold but never captured) needs its own notification/flag, not silence.*
- **B4.** `BookingsController.Cancel()` (lines ~724-738) — wallet-hold release on cancellation is wrapped in a swallowing catch ("keep cancellation success as primary outcome"), so a user can be told "cancelled successfully" while funds are still held. *Fix: cancellation response should include a distinct warning field when the refund/release step itself failed, rather than reporting unconditional success.*
- **B5.** `BookingsController.CreateAncillaryOrder` (lines ~560-576) — wallet-hold release on ancillary-purchase failure is wrapped in a nested swallowing catch. *Fix: same pattern as B2/B4 — surface release failures distinctly.*
- **B6.** `AtlasBookingController`'s ancillary-order retry path (lines ~187-215) has the same nested swallowing release-failure pattern as B5.

### C. Error responses that lose information on the way to the user
- **C1.** `frontend/lib/api.ts` `readJson` (lines ~804-834) discards every field except `detail`/`error` from non-OK responses, so the `bookingId`/`bookingReference` returned by the 502 "reservation created, but ticket purchase failed" response (`AirBookingController.cs:305-311`, `AtlasBookingController.cs` equivalent) never reaches the UI. *Fix: preserve the full error payload shape so the frontend can tell the user "your reservation reference is X — don't rebook, go check your bookings" instead of a bare error string that looks like the whole booking failed.*
- **C2.** `frontend/app/booking/page.tsx` `handleBooking()` (around line 993) treats "the HTTP call didn't throw" as "proceed to confirmation," with no check of `reservation.ticketIssued`/`airTicketingStatus` before navigating — this is the frontend half of bug A1; fixed together with the shared banner component.
- **C3.** `VoidAirTicket` endpoint (`BookingsController.cs:937-969`) only catches `InvalidOperationException` (line 965) — any other exception type produces a raw unhandled ASP.NET 500, breaking the `{error, detail}` contract every other endpoint follows. *Fix: add a general `catch (Exception)` fallback consistent with the rest of the controller.*

### D. Status-visibility gaps (data already exists in the DB, just never shown)
- **D1.** `Booking.Status` (`backend/TourValve.Domain/Booking.cs:49`) has no `"TICKETING_FAILED"`-equivalent value — it stays `"CONFIRMED"` forever even when `AirTicketingStatus == "FAILED"`, so anyone looking only at the coarse `Status` (e.g. an admin report, or the bookings list pill) can't tell a genuinely stuck booking from a normal confirmed one. *Fix: covered by the shared outcome-state design above (combine both fields for display) rather than changing the stored `Status` value itself, to avoid a data migration.*
- **D2.** `BookingsController.List()` doesn't return `AirTicketingLastError` (only `Detail()` does), and even where it is returned, `frontend/app/bookings/page.tsx`'s detail drawer never renders it for non-admin agents. *Fix: per Design section — add to `List()` and render via the shared banner.*
- **D3.** Bookings list status pill (`bookings/page.tsx:474-478`) only special-cases `"CONFIRMED"`/`"CANCELLED"`; a `"CONFIRMED"` booking with `AirTicketingStatus == "FAILED"` still renders the plain green success pill. *Fix: covered by Design section item 2.*

### E. Lower-severity swallowed operational errors (still worth fixing, but not user-money-affecting)
- **E1.** Booking-confirmation and admin-notice emails (`AirBookingController.cs` ~1571-1675) — send failures swallowed; page still says "confirmation email has been prepared."
- **E2.** PDF/attachment builder (`AirBookingController.cs` ~1677-1754) — failures swallowed, emails silently go out without the attachment.
- **E3.** Audit-trail writes and wallet-alert generation on booking creation (`BookingsController.cs` ~657-682) — swallowed, no fallback if the audit/alerting pipeline itself is broken.
- **E4.** Live-record refresh during `Document()` export and `RefreshLiveTicketingStateIfNeededAsync` (`BookingsController.cs` ~979-1027, ~1081-1191) — swallowed, so PDFs/detail views can silently use stale locator/ticket data with no "this may be outdated" disclosure.
- **E5.** Live ancillary-offer catalog fetch (`BookingsController.cs` ~283-289) — falls back to a static/parsed catalog silently on failure, no "live pricing unavailable" indicator.
- **E6.** The only place the *true* ticketing-failure reason currently reaches an agent at all is a WARN entry in the notification bell (`AirTicketingWorkflowService.NotifyAsync`, fires correctly on failure) — but it's easy to miss, disappears once read (default fetch is `unreadOnly=true`), and isn't linked prominently from the confirmation/bookings pages. *Fix: once the shared banner (Design section) surfaces the same information persistently on the confirmation/bookings pages, the notification becomes a secondary/redundant channel rather than the only one — no notification-system change strictly required, but worth cross-linking.*

## Implementation outline (phased, for a future coding turn — not done now)
1. **Phase 1 — core transparency fix (the reported bug):** A1-A4, C2, plus the shared `BookingOutcomeBanner` component and its use in `booking-confirmation/page.tsx` and `bookings/page.tsx` (D2, D3).
2. **Phase 2 — money-risk hardening:** B1-B6 — ensure wallet hold capture/release failures are never silent, add distinct warning fields to the relevant API responses.
3. **Phase 3 — remaining transparency/consistency:** C1, C3, and rounding out D1's display logic anywhere else `Status` is read as the sole truth.
4. **Phase 4 — lower-severity operational hardening:** E1-E5 (structured logging/alerting at minimum, since these are best-effort by nature), E6 (cross-link, no change required if Phase 1 ships).

## Verification (for a future coding turn)
1. Reproduce the exact reported scenario against a Travelport sandbox/account known to fail ticketing (or a mocked `IssueAsync` that returns zero ticket numbers without throwing) — confirm the confirmation page now shows a clear "not ticketed, here's why" state instead of a success state.
2. Confirm the bookings list pill changes color/label for a `CONFIRMED` + `AirTicketingStatus=FAILED` booking, and that the detail drawer shows the real `AirTicketingLastError` text.
3. Force each Phase 2 failure path (e.g., temporarily break wallet hold release) in a test/staging environment and confirm a warning is now surfaced rather than silence.
4. `npx tsc --noEmit` / `npx next lint` in `frontend/`, `dotnet build` in `backend/` after implementation.

## Status
**Implemented — all four phases.**

**Phase 1 (core transparency fix):**
- `BookingTicketingService.IsTicketingEvidencePending` now also fails closed on more account-level keywords (IATA, NOT AUTHORIZED, AGENT SINE, SECURITY VIOLATION, PLATING CARRIER, TICKETING AUTHORITY) and takes a `scheduledAt` parameter so a message stops being treated as "pending" once `EvidencePendingWindow` (30 minutes) has passed, regardless of wording.
- `AirTicketingWorkflowService.RefreshTicketEvidenceAsync` no longer loops in `AWAITING_EVIDENCE` forever — once the evidence window is exceeded it escalates to `FAILED`, writes an audit entry, and sends a WARN notification.
- `AirBookingResponse` gained a `TicketingErrorDetail` field; both `AirBookingController.Book` and `AtlasBookingController.Book` now differentiate ISSUED / FAILED / still-pending outcomes explicitly instead of collapsing everything into "still in progress," and populate the real diagnostic when `WorkflowStatus == FAILED`.
- `BookingsController.List()` now includes `AirTicketingLastError` (previously `Detail()`-only).
- New shared `frontend/components/BookingOutcomeBanner.tsx` (`deriveBookingOutcome` + `BookingOutcomeBanner`) is the single source of truth for "what happened," used by:
  - `frontend/app/booking-confirmation/page.tsx` — no longer treats `airlinePortalReady` as evidence of ticket issuance (the exact bug reported); shows a distinct red "ticket purchase failed" state with the real reason when `AirTicketingStatus == FAILED`.
  - `frontend/app/bookings/page.tsx` — the list status pill now turns red (with a "Ticketing failed" note) when a `CONFIRMED` booking's ticketing has failed, instead of always showing green; the detail drawer's Ticketing panel renders the shared banner with the real `airTicketingLastError`.

**Phase 2 (money-risk hardening, B1-B6):** wallet hold capture/release failures are no longer silent — `AirBookingController` (`TryCreatePortalBookingAsync`'s failure branch, `TryReleaseWalletHoldAsync`, `TryCaptureReservationWalletChargeAsync`), `BookingsController.Cancel()` (now returns a `walletReleaseWarning` field, surfaced in the frontend), `BookingsController.CreateAncillaryOrder`, and `AtlasBookingController`'s order/retry failure paths all now send an ADMIN WARN notification when a hold release or capture fails, instead of swallowing it.

**Phase 3 (C1, C3):** `frontend/lib/api.ts` has a new `ApiError` class carrying the full error payload (not just the message) — `booking/page.tsx`'s booking-submission handler now tells the user their reservation reference if a 502 "reservation created, ticket purchase failed" response included one, so they know not to rebook. `BookingsController.VoidAirTicket` now has a general `catch (Exception)` fallback alongside its `InvalidOperationException` catch, matching the `{error, detail}` contract used everywhere else.

**Phase 4 (E1-E5, lower-severity):** booking-confirmation/admin-notice email failures, audit-trail/notification/wallet-alert failures on booking creation, live-record refresh failures (`Document()` export and `RefreshLiveTicketingStateIfNeededAsync`), and live ancillary-offer-catalog fetch failures now write an audit entry or ADMIN notification (with cross-channel fallback where the primary channel is what failed) instead of failing completely silently; the ancillary catalog fallback also now carries a "live pricing unavailable" message when applicable.

**Verified:** `dotnet build` (backend) and `npx tsc --noEmit` / `npx next lint` (frontend) all pass clean. Not yet done: a live/sandbox reproduction of the exact IATA-blocked-ticketing scenario end-to-end, and manual verification of the money-risk (Phase 2) paths against a staging wallet — recommended before shipping.
