# Immediate Purchase Implementation — What Changed

This document explains, file by file, the implementation that made order = purchase (atomic, synchronous ticketing) the default for both Atriptech (Atlas) and Travelport, and removed the "reserve now, ticket later" admin scheduling feature. It follows on from [ATRIPTECH_TRAVELPORT_WORKFLOW.md](ATRIPTECH_TRAVELPORT_WORKFLOW.md), which describes the *before* state and the target design; this document describes what was actually built.

---

## 1. Summary

| Area | Before | After |
|---|---|---|
| Atlas booking | `order.do` → **admin manually triggers** `pay.do` later | `order.do` → `pay.do` (+ polling) **in the same request** |
| Travelport booking | `AirCreateReservationReq` → **scheduled/admin-triggered** `AirTicketingReq` later | `AirCreateReservationReq` → `AirTicketingReq` **in the same request** |
| Failure handling | Booking left in `PENDING_TICKETING`/`NOT_STARTED` indefinitely | Booking marked `FAILED`, wallet hold released, error returned to the caller immediately |
| Atlas void | Not implemented — voiding an Atlas ticket would incorrectly call Travelport's SOAP void | Real `voidQuotation.do` → `void.do` → `queryVoidOrders.do` integration |
| Admin scheduling UI | `/air-ticketing/[bookingId]` workspace + `/ticket-queue` queue page | Removed entirely |
| Background worker | Ticketing scheduler, gated by `AirTicketing:AutoIssueEnabled` (`false` in config, so effectively dormant) | Always-on crash-recovery net for interrupted/pending bookings |
| Confirmation page | "Notify admin for ticket issuance" modal/CTA | Shows the real ticket number/status immediately |

---

## 2. Backend changes

### 2.1 New Atlas void API integration

Atriptech's void flow is a three-call sequence, newly implemented:

```
voidQuotation.do  → check isVoidable + get voidOfferId   (AtlasApiClient.VoidQuotationAsync)
void.do           → submit the void using that offer id  (AtlasApiClient.VoidAsync)
queryVoidOrders.do → poll for a terminal voidStatus       (AtlasApiClient.QueryVoidOrdersAsync)
```

**New files** (`backend/TourValve.Infrastructure/Atlas/Models/`):
- `AtlasVoidQuotationRequest.cs` / `AtlasVoidQuotationResponse.cs` — `orderNo` in, `isVoidable`/`voidOfferId`/`voidWindow`/`voidFareAmount` etc. out.
- `AtlasVoidRequest.cs` / `AtlasVoidResponse.cs` — `orderNo` + `voidOfferId` in, `voidCode`/`voidStatus` (0–6) out.
- `AtlasQueryVoidOrdersRequest.cs` / `AtlasQueryVoidOrdersResponse.cs` — polls by `orderNo`/`voidCode`.
- `AtlasVoidTicket.cs` — shared sub-models (`AtlasVoidTicket`, `AtlasVoidFareAmount`, `AtlasVoidServiceFee`, `AtlasVoidPostTicketingServiceAmount`).
- `AtlasVoidWindow.cs` — same-day deadline / eligibility window fields.

**`AtlasApiClient.cs`**: three new methods (`VoidQuotationAsync`, `VoidAsync`, `QueryVoidOrdersAsync`), each a thin `POST` wrapper matching the existing `SendAsync<TRequest, TResponse>` pattern used by `search.do`/`order.do`/`pay.do`.

**`AtlasTicketingService.cs`**: new `VoidAsync(Booking booking, CancellationToken)`:
1. Calls `voidQuotation.do`. If `isVoidable != true` or no `voidOfferId`, throws (order is outside the airline's void window — must use refund instead, per Atriptech's docs).
2. Calls `void.do` with the returned `voidOfferId`.
3. Polls `queryVoidOrders.do` up to 3 times (3s apart) for a terminal `voidStatus` (`2`=refunded, `4`=rejected, `5`=fulfillment done, `6`=withdrew), returning whatever status is known if it never reaches a terminal state in that window (Atriptech's own docs say a void decision can take ~5 minutes, so this is a best-effort check, not a long block).
4. Returns `AtlasVoidResult` (ticket numbers voided, void code, final status, raw JSON).

**Important caveat carried over from the design doc**: this void flow only works on an **already-ticketed** Atlas order (Atriptech's `voidQuotation.do` response includes `voidTickets` with real `ticketNo` values). If `pay.do` itself fails before any ticket is issued, there is nothing to void — see §4.

### 2.2 Strategy extraction (`IAirTicketingStrategy`)

**New**: `backend/TourValve.Infrastructure/Ticketing/IAirTicketingStrategy.cs` — a small interface (`IssueAsync`, `VoidAsync`) plus two result records (`AirTicketingStrategyIssueResult`, `AirTicketingStrategyVoidResult`).

**New**: `backend/TourValve.Infrastructure/Atlas/AtlasTicketingStrategy.cs` — implements the interface by wrapping `AtlasTicketingService`. This is what used to be ~70 lines of Atlas-specific logic inline inside `AirTicketingWorkflowService`.

**`AirTicketingWorkflowService.cs`** changes:
- Constructor now takes `AtlasTicketingStrategy` instead of `AtlasTicketingService` directly.
- Added `IsAtlas(Booking)` helper.
- `IssueAsync`: the `if (ProviderCode == "ATLAS") { ...inline Atlas API calls... }` block was replaced with `var atlasIssue = await _atlasStrategy.IssueAsync(booking, cancellationToken);` — the shared wallet-capture/state-machine/audit/notify logic around it is unchanged, so Travelport behavior is untouched.
- `VoidAsync`: now branches — Atlas bookings call `_atlasStrategy.VoidAsync(...)`; GDS bookings keep calling the existing `BookingTicketingService.VoidAsync` (Travelport SOAP). **This fixes a real pre-existing bug**: previously `VoidAsync` unconditionally called the Travelport-only void path for *any* provider, so voiding an Atlas-ticketed booking would have sent a malformed Travelport SOAP request using Atlas's `orderNo` as if it were a Travelport locator.
- Fixed the same class of bug in `IssueAsync`: `RefreshProviderDetailsIfNeededAsync` (which calls Travelport's `UniversalRecordService.RetrieveAsync`) is now skipped entirely for Atlas bookings. Previously it ran unconditionally before the Atlas/Travelport branch — since an Atlas booking's `AirlineLocator` is empty until ticketed, this method's early-return guard never triggered, so it would have attempted a live Travelport SOAP call using Atlas's `orderNo`/`"ATLAS"` as the provider code and locator. This was a latent bug that would have surfaced the first time Atlas ticketing was actually exercised through this path.

**Scoping note**: Travelport's issue/void logic (`RefreshProviderDetailsIfNeededAsync`, `ApplySnapshot`, `RefreshTicketEvidenceAsync`) was intentionally **not** extracted into its own strategy class. That logic is deeply coupled to Universal Record retrieval and is shared across `ScheduleAsync`/`IssueAsync`/`VoidAsync`/the evidence-refresh path — pulling it apart risked destabilizing the live Travelport path for a cosmetic symmetry gain. The Atlas extraction was the one that mattered: it was the tangled, bug-prone side.

### 2.3 Synchronous purchase in both booking controllers

**`AtlasBookingController.cs`** (`Book` action):
- Now takes `AirTicketingWorkflowService` as a constructor dependency.
- After the `Booking` row is created (and after wallet-hold capture, or a new CASH default for admin/no-wallet bookings — see §2.4), it immediately calls:
  ```csharp
  await _airTicketingWorkflow.IssueAsync(booking, actorId, actorEmail,
      backgroundTriggered: false, releaseWalletHoldOnFailure: true, cancellationToken);
  ```
- On success, the HTTP response now reflects the **real outcome**: `Status`, `AirTicketingStatus`, `TicketNumbers`, `TicketedAt`, and `TicketIssued` all come from the issue result, not hardcoded placeholders.
- On failure, the booking is already marked `FAILED` and the wallet hold released (inside `IssueAsync`'s own catch block); the controller catches the exception, logs a notification, and returns **HTTP 502** with `{ error, detail, bookingId, bookingReference }` instead of a misleading 200 OK.
- The "portal sync pending" fallback (DB insert failed after the provider reservation succeeded) still exists, but its message was reworded — it no longer says "contact admin for ticket issuance" since that path no longer exists.

**`AirBookingController.cs`** (`Book` action) — mirrors the same structure:
- If `TryCreatePortalBookingAsync` didn't return a tracked `Booking` (rare DB-sync edge case), returns early with a "still syncing" response, same as before.
- Otherwise: wallet capture (or CASH default) → `_airTicketingWorkflow.IssueAsync(...)` synchronously → success response with real ticket data, or **HTTP 502** on failure.
- `TrySendBookingConfirmationAsync`/`TrySendAdminBookingNoticeAsync` (customer/admin emails) still fire right after reservation, before ticketing — these are best-effort notifications, not part of the purchase transaction itself.

### 2.4 New CASH default for wallet-less bookings

Both controllers have a reserved-admin path (`admin@tourvalve.com`) that skips wallet debiting entirely (used for internal/certification bookings). Previously this left `Booking.AirTicketingFormOfPayment` empty, which is fine when ticketing is a separate manual step — but `IssueAsync` requires a form of payment to be set (`EnsureIssueable`). Both controllers now call a new private helper, `TrySetCashTicketingDefaultAsync`, which sets `AirTicketingFormOfPayment = CASH` and `AirTicketingPaymentStatus = UNPAID` right before calling `IssueAsync` when there's no wallet hold.

### 2.5 Removed scheduling endpoints (`BookingsController.cs`)

Deleted entirely:
- `GET /api/bookings/pending-ticketing` (`PendingTicketingQueue`) — the admin queue of bookings "awaiting issuance." With ticketing happening at booking time, nothing should ever sit in this queue.
- `POST /api/bookings/{id}/air-ticketing/schedule` (`ScheduleAirTicketing`) — set a future `AirTicketingDate` and form of payment. No longer meaningful.
- `POST /api/bookings/{id}/notify-ticketing` (`NotifyTicketing`) — emailed the admin inbox "Pending Ticket Issuance (Urgent)" with a link into the now-deleted workspace page.
- The now-unused `AirTicketingScheduleRequest` record.

**Kept** (repurposed as admin recovery tools, not a scheduling feature):
- `POST /api/bookings/{id}/issue-ticket` — now effectively a "retry ticketing" action for a booking that ended up `FAILED` or `AWAITING_EVIDENCE`.
- `POST /api/bookings/{id}/air-ticketing/cancel` — releases a leftover wallet hold and resets workflow state (cleanup for a failed attempt).
- `POST /api/bookings/{id}/air-ticketing/mark-paid`, `POST /api/bookings/{id}/air-ticketing/void` — unchanged, now also functional for Atlas thanks to §2.2's fix.

`AirTicketingWorkflowService.BuildWorkspacePath` (used to build the route embedded in in-app notifications) was changed from `/air-ticketing/{id}` to `/bookings?bookingId={id}`, since the workspace page no longer exists.

### 2.6 `AirTicketingWorker` / `Program.cs`

The worker (`backend/TourValve.Api/Services/AirTicketingWorker.cs`) polls every minute for bookings still in `SCHEDULED`/`AWAITING_EVIDENCE`/a specific transient-`FAILED` state whose `AirTicketingDate <= today`, and calls `IssueAsync` on them. It was previously gated behind `AirTicketing:AutoIssueEnabled` in `appsettings.json` (`false`, so effectively never running).

`Program.cs` now registers it unconditionally:
```csharp
// Booking now purchases (reserves + tickets) synchronously in the booking request itself.
// This worker is a crash-recovery safety net for bookings that didn't finish ticketing inline
// (e.g. the request was interrupted, or a GDS booking is still awaiting document evidence) —
// it is not a scheduling feature, so it always runs.
builder.Services.AddHostedService<AirTicketingWorker>();
```
No query-logic changes were needed: both controllers still set `AirTicketingDate = today` when they capture the wallet hold, so any booking that gets interrupted mid-flight (crashes between reservation and ticketing) is still picked up by the worker's existing `<= today` filter on the next pass. `AtlasTicketingStrategy` is registered as a new scoped service (`builder.Services.AddScoped<AtlasTicketingStrategy>();`) alongside the existing `AtlasTicketingService` registration.

---

## 3. Frontend changes

### 3.1 Deleted

- `frontend/app/air-ticketing/[bookingId]/page.tsx` and `frontend/app/air-ticketing/layout.tsx` — the admin "AirTicketing Workspace" (date picker, form-of-payment selector, Save Workflow / Issue Now / Cancel / Mark Paid / Void buttons).
- `frontend/app/ticket-queue/page.tsx` — the admin queue list.
- Sidebar entry "Ticket Queue" and its `reservedAdminOnlyPaths` gate, in `frontend/components/Sidebar.tsx`.

### 3.2 `frontend/lib/api.ts`

Removed: `getPendingTicketingQueue`, `scheduleBookingAirTicketing`, `notifyBookingTicketing`, and their associated types (`PendingTicketingQueueItem`, `AirTicketingScheduleResponse`).

Kept: `issueBookingTicket`, `cancelBookingAirTicketing`, `markBookingAirTicketPaid`, `voidBookingAirTicket` — these still back real admin recovery actions.

### 3.3 `frontend/app/booking-confirmation/page.tsx`

Removed:
- The "Proceed for ticketing?" modal (admin-only, linked to the deleted workspace page).
- The "Notify admin for ticket issuance" modal and CTA (non-admin), and the `notifyStatus`/`notifyError`/`notifyMessage`/`promptDismissedBookingId` state that backed both modals.
- The `isReservedAdmin`/`getUserFromToken` usage that only existed to gate those two modals.

Changed:
- Headline/intro copy no longer references "contact admin" — since ticketing now happens inline, the non-issued case is described as "still finishing up on the airline's side," matching the rare `AWAITING_EVIDENCE` state rather than a manual admin step.
- "Ticketing status" fallback text changed from `PENDING_REVIEW` to `IN_PROGRESS`.
- The "Next Actions" panel now shows either the existing "Add Baggage, Meals & Seats" button (when ticketed) or a plain informational line ("Ticket confirmation is still in progress...") — no more branching into a deleted page or an admin-notify action.

### 3.4 `frontend/app/bookings/page.tsx`

- `handleIssueTicket` no longer does `window.open("/air-ticketing/...")`. It now calls `issueBookingTicket(bookingId)` directly (newly imported from `lib/api`), reloads the bookings list, and refreshes the selected booking's detail — mirroring the existing `handleCancel` pattern in the same file.
- Both places this button renders (the table row action and the detail-drawer button) now:
  - Only show when `status !== "TICKETED"` (previously showed always, toggling label between "Issue Ticket"/"Open AirTicketing").
  - Are labeled "Retry Ticketing" and disable themselves while the retry is in flight (`serviceAction === "issue-ticket"`).
- The ticketing-panel description text was reworded to describe automatic purchase-at-booking-time with retry as the fallback, instead of describing the (now-removed) scheduling workspace.

---

## 4. Known limitation carried forward

Atriptech's `void.do` requires an existing ticket (its `voidQuotation.do` response includes `voidTickets` with real ticket numbers). If `pay.do` fails **before** a ticket is ever issued, there is no supplier-side action available to cancel that dangling, unpaid Atlas order — the booking is marked `FAILED` and the wallet hold is released on the TourValve side, but the order itself may remain open on Atriptech's system until it expires on their end or an admin follows up manually. Closing this fully would require Atriptech to expose a genuine "cancel unticketed order" endpoint, which isn't part of the API surface documented so far.

---

## 5. Files touched

```
Backend (new):
  backend/TourValve.Infrastructure/Ticketing/IAirTicketingStrategy.cs
  backend/TourValve.Infrastructure/Atlas/AtlasTicketingStrategy.cs
  backend/TourValve.Infrastructure/Atlas/Models/AtlasVoid*.cs (6 files)
  backend/TourValve.Infrastructure/Atlas/Models/AtlasQueryVoidOrders*.cs (2 files)

Backend (modified):
  backend/TourValve.Api/Controllers/AirBookingController.cs
  backend/TourValve.Api/Controllers/AtlasBookingController.cs
  backend/TourValve.Api/Controllers/BookingsController.cs
  backend/TourValve.Api/Program.cs
  backend/TourValve.Infrastructure/Atlas/AtlasApiClient.cs
  backend/TourValve.Infrastructure/Atlas/AtlasTicketingService.cs
  backend/TourValve.Infrastructure/Travelport/Air/AirTicketingWorkflowService.cs

Frontend (deleted):
  frontend/app/air-ticketing/[bookingId]/page.tsx
  frontend/app/air-ticketing/layout.tsx
  frontend/app/ticket-queue/page.tsx

Frontend (modified):
  frontend/app/booking-confirmation/page.tsx
  frontend/app/bookings/page.tsx
  frontend/components/Sidebar.tsx
  frontend/lib/api.ts
```

---

## 6. Verification status

Build verification (`dotnet build` / `npm run build`) was **not** run as part of this change — per instruction, since the environment is local, verification is left to you. Each edit did pass through the IDE's live diagnostics during implementation (flagging, and confirming resolution of, a handful of now-unused-symbol hints), but that is not a substitute for a full build and an end-to-end booking run on both providers.

**Suggested manual test plan before relying on this in any live scenario:**
1. `dotnet build` in `backend/` — confirm no compile errors from the `AirTicketingWorkflowService`/controller/strategy changes.
2. `npm run build` (or `tsc --noEmit`) in `frontend/` — confirm no type errors from the deleted pages/removed API functions.
3. Book a flight end-to-end on the Atlas (LCC) path in sandbox and confirm the response comes back with `TICKETED`/ticket numbers directly, with no manual "issue ticket" step needed.
4. Book a flight end-to-end on the Travelport path and confirm the same synchronous behavior.
5. Force a failure (e.g. an invalid fare/expired session) after reservation and confirm: the booking shows `FAILED`, the wallet hold was released, and the API returns a 502 with a readable error — not a silent "reservation pending" success.
6. As the reserved admin, exercise "Retry Ticketing" on a booking left in `FAILED`/`AWAITING_EVIDENCE` state, and "Void" on a ticketed Atlas booking, to confirm the new Atlas void path actually calls Atriptech and updates status.
