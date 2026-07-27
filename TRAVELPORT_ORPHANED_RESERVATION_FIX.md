# Travelport "could not keep a live fare attached" — root cause and fix

## Status: Implemented

## The report
A live Travelport booking attempt failed with this message shown directly on the confirm-booking page:

> "The airline system could not keep a live fare attached to this itinerary during reservation creation. Search again and choose a newly priced fare before booking."

No booking was saved locally. The concern: is this the same class of problem as the earlier cash-payment-restriction issue, where a reservation was actually made with the provider but the portal failed to reflect it as confirmed — i.e. can a real reservation get silently "ignored" when an error is returned?

## Root cause

The failing request was preserved by the existing debug snapshot (`backend/TourValve.Api/bin/Debug/net8.0/travelport-last-booking-debug.json`, captured 2026-07-27T07:08:59Z, a real TR638 SIN→BKK attempt). Its raw `AirCreateReservationRsp` shows:

```
ResponseMessage Type="Warning": "NO FARES"
ResponseMessage Type="Warning": "Some of the requested AirPricingInfos could not be saved for the requested provider."
ResponseMessage Type="Warning": "NO VALID FARE FOR INPUT CRITERIA"
UniversalRecord LocatorCode="37BI0Q"
ProviderReservationInfo LocatorCode="H05RLH" ProviderCode="1G" OwningPCC="3T7G"
AirReservation LocatorCode="37BI0S"
AirSegment ... Status="NO" ETicketability="No"
SellMessage: "*SECURED SELL NOT AVAILABLE*"
```

**Confirmed: yes, for Travelport, a genuinely live PNR (`H05RLH`) and Universal Record (`37BI0Q`) were created at the GDS host**, even though Travelport could not keep a valid stored fare attached to it (the segment was sold "not confirmed" and non-ticketable). This happened *after* our own repricing step already found valid stored pricing — the fare went stale specifically in the few seconds between our reprice call and Travelport's reservation-creation call. That volatility is a host/airline-side condition outside our control (common with secure-sell LCC content routed through a GDS — Scoot/TR via 1G here).

**The bug was in how the portal handled it.** `AirBookingController.Book()` detects blocking marker text (`NO FARES`, `SECURED SELL NOT AVAILABLE`, `UNABLE TO SELL`, `SELL CHECK FAILED`, `NO VALIDATING CARRIER`, `CLASS NOT AVAILABLE`, etc.) in the raw response and throws immediately — before checking whether a real locator was also present in that same response. The wallet hold was correctly released and a generic "Booking failed" audit/notification was written, but the actual locator (`H05RLH` / `37BI0Q`) was never captured anywhere durable: not the booking table (nothing is persisted on this path), not the audit log, not notifications. It only ever existed in the single debug JSON file, which gets overwritten on the very next booking attempt.

Net effect: a live, broken PNR could sit at the Travelport/GDS host — invisible to the portal and to admins — until it self-purged (this response even carried `PNRPurgeDate="20260822"`, ~26 days out).

### Atlas: investigated, not exposed to this failure mode
`AtlasBookingController.Book()`'s `OrderAsync` only throws `AtlasApiException` when Atlas's own JSON response reports an explicit non-success `Status` code (`AtlasApiClient.cs`), or on an HTTP/parse failure. Atlas doesn't have Travelport's pattern of an overall-"successful" SOAP envelope that embeds Warning-level partial-failure messages alongside a live order. A thrown exception from Atlas's order call reflects Atlas's own explicit statement that no order was created. No fix needed on the Atlas side for this class of bug.

### How this differs from the earlier cash-payment-restriction issue
That issue involved a booking that *was* persisted locally, with a ticketing-time error mis-reported after the fact. This issue involves a reservation that could exist at Travelport with **no local booking record at all** — a strictly worse gap, since reconciliation first requires knowing the locator even exists.

## Fix

In `backend/TourValve.Api/Controllers/AirBookingController.cs`:
- Hoisted a new `orphanedProviderReferenceSummary` variable above the reservation `try` block.
- As soon as `ExtractReservationReferences` finds any real locator in the `AirCreateReservationRsp` (regardless of whether the response is subsequently treated as a blocking failure), that locator summary is captured.
- The outer `catch` block now checks this summary: if set, it writes a distinct audit entry (`RESERVATION_ORPHANED_AT_PROVIDER`) containing the actual `UniversalRecordLocator` / `ProviderLocator` / `AirlineLocator`, and sends an ADMIN notification explicitly stating that a live Travelport reservation may exist under those locators and needs manual review/cancellation at the GDS.
- The user-facing error message and retry advice are unchanged — retrying with a fresh search is still the correct move for the user. This fix is purely about admin visibility and durability of the locator, not about changing what the end user sees.
- No auto-cancellation of the stray Travelport PNR was implemented — the codebase has no existing "cancel unticketed reservation" call (only `AirVoidDocumentReq`, for voiding already-issued e-tickets, exists in `BookingTicketingService.cs`). Building a cancel-PNR capability is a larger, separate effort; for now, orphaned reservations flagged by this fix are resolved manually by ops in the GDS.

## Verification
- `dotnet build` succeeds with no warnings/errors.
- Code review confirmed `orphanedProviderReferenceSummary` is only read in the catch block and defaults to `null`, so failures that occur before a locator is ever extracted (e.g. the reprice step itself throwing) safely skip the new notification path.
