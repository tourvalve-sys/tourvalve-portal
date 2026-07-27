# Remove "Inventory Source" selector — always search all providers

## Context
On the flight search page, users currently see an "Inventory Source" selector that forces them to pick between "Full service (GDS)" (Travelport) and "Low-cost (LCC)" (Atlas) *before* searching. This exposes an internal implementation detail (which backend/provider integration serves the results) as a user-facing decision, which isn't the user's concern — they just want flights. The fix is to remove that selector entirely and have every search query both providers and merge the results into one list.

This is purely a frontend change. Both provider endpoints already exist independently and there is no backend aggregation service — the plan calls both endpoints from the client and merges responses, which the existing results-rendering pipeline (filtering/sorting/booking) already supports without modification.

## Key findings from investigation
- UI block to remove: [frontend/app/flight-search/page.tsx:3103-3139](frontend/app/flight-search/page.tsx#L3103-L3139) — the "Inventory Source" heading + two toggle buttons calling `selectContentSource(...)`.
- State driving it: `contentSource: "travelport" | "atlas"` ([page.tsx:1012-1013](frontend/app/flight-search/page.tsx#L1012-L1013)), handler `selectContentSource` ([page.tsx:1598-1611](frontend/app/flight-search/page.tsx#L1598-L1611)).
- Search dispatch is single-provider today: `const searchFn = contentSource === "atlas" ? searchAtlasFlights : searchFlights;` ([page.tsx:2079](frontend/app/flight-search/page.tsx#L2079)), calling one of the two API functions in [frontend/lib/api.ts:1022](frontend/lib/api.ts#L1022) (`searchFlights` → `POST /api/flights/search`, Travelport) and [frontend/lib/api.ts:1045](frontend/lib/api.ts#L1045) (`searchAtlasFlights` → `POST /api/atlas/flights/search`, Atlas). Both return the same shape: `{ flights: FlightResult[], diagnosticMessage?: string }`.
- No backend change needed: there's no shared search endpoint or provider field in `FlightSearchRequest` — the provider choice is 100% a client-side routing decision today, and aggregation can happen entirely client-side.
- Downstream code already keys off **per-flight** `providerCode` (e.g. `isAtlasProviderCode()` at [page.tsx:675-678](frontend/app/flight-search/page.tsx#L675-L678), and booking flow in `frontend/app/booking/page.tsx` and `frontend/app/context/BookingContext.tsx`), not off the page-level `contentSource`. So a merged list of flights from both providers flows through the existing filter/sort/render/booking pipeline (`filteredResults` at [page.tsx:2463](frontend/app/flight-search/page.tsx#L2463), `displayResultItems` at [page.tsx:2599](frontend/app/flight-search/page.tsx#L2599)) with no changes required there.
- Provider-specific constraints that must be preserved (not removed, just re-attached to fixed logic instead of a user toggle):
  - Atlas doesn't support **multi-city** search.
  - Atlas doesn't support **Air Availability** search mode (only "Low Fare"). The separate "Search Source" (Low Fare vs Air Availability) selector at [page.tsx:3141-3179](frontend/app/flight-search/page.tsx#L3141-L3179) stays — it's a legitimate, user-relevant choice (bookable fares vs. schedule-only diagnostics), unrelated to which provider serves it.

## Implementation

### 1. `handleSearch` — call both providers and merge
In [frontend/app/flight-search/page.tsx](frontend/app/flight-search/page.tsx), replace the single `searchFn` call (~line 2079) with logic that:
- Always calls `searchFlights` (Travelport).
- Also calls `searchAtlasFlights` (Atlas), **unless** `tripType === "multicity"` or the active search mode is `"availability"` — in those cases skip the Atlas call silently (no user-facing toggle, no error), since Atlas structurally doesn't support them.
- Uses `Promise.allSettled` for the calls issued, then:
  - Merges `flights` arrays from all fulfilled responses into one array for `setResults(...)`.
  - Combines non-empty `diagnosticMessage`s (e.g. join with a separator, or show the first non-empty one) for `setSearchNotice(...)`.
  - Only calls `setError(...)` if *every* issued call rejected; if at least one succeeds, show its results and drop the failed one silently (or fold a short note into the notice).
- Remove the `contentSource === "atlas" && tripType === "multicity"` guard/error at [page.tsx:2000-2003](frontend/app/flight-search/page.tsx#L2000-L2003) (multi-city just won't include Atlas results — no need to block the whole search).
- Remove `activeSearchMode = contentSource === "atlas" ? "lowfare" : searchModeRef.current` (line 2005) — the search mode simply comes from `searchModeRef.current`/`searchMode` directly now, no longer influenced by provider.

### 2. Remove the "Inventory Source" UI block
Delete [page.tsx:3103-3139](frontend/app/flight-search/page.tsx#L3103-L3139) entirely (the heading, description, and two toggle buttons).

Keep the "Search Source" block ([page.tsx:3141-3179](frontend/app/flight-search/page.tsx#L3141-L3179)) but remove its dependency on `contentSource`:
- Drop `disabled={contentSource === "atlas"}` on the "Air Availability" button (line 3167) — Air Availability is always available now (it will just only return Travelport results, since Atlas doesn't support it).
- Remove the `contentSource === "atlas" && mode === "availability"` early-return in `selectSearchMode` ([page.tsx:1588-1591](frontend/app/flight-search/page.tsx#L1588-L1591)).

### 3. Remove `contentSource` state and all its plumbing
Delete/adjust every reference found via `grep -rn "contentSource" frontend/`:
- `selectContentSource` function ([page.tsx:1598-1611](frontend/app/flight-search/page.tsx#L1598-L1611)) — delete entirely.
- `useState` declaration ([page.tsx:1012-1013](frontend/app/flight-search/page.tsx#L1012-L1013)) — delete.
- `FlightSearchUiState` type field (line 272), `createDefaultFlightSearchUiState` default (line 331), `buildSearchSignature` param/usage (lines 814-826), `sanitizePersistedFlightSearchUiState` validation/normalization (lines 858-859, 903) — remove `contentSource` from all of these.
- `clearFlightSearchState` (line 1081: `setContentSource(defaults.contentSource)`) — remove.
- The two persistence `useEffect`s that snapshot state into `flightSearchState`/`sessionStorage` (lines 1120-1147 and 1149-1187) — remove `contentSource` from both the object literal and the dependency array.
- `currentSearchKey` `useMemo` (lines 1189-1199) — remove `contentSource` from the `buildSearchSignature` call and dependency array.
- `frontend/app/context/BookingContext.tsx:9` — remove `contentSource` from the shared `FlightSearchUiState`/`FlightSearchState` type (confirmed unused elsewhere in the booking flow, which keys off per-flight `providerCode` instead).

Note: this is a UI-state shape change, so any state persisted in `sessionStorage` under the old shape will simply be ignored (the sanitizer already treats unrecognized/invalid shapes as "no restored state" and falls back to defaults) — no migration needed.

### 4. Sanity-check imports
Confirm `searchAtlasFlights` and `searchFlights` are both still imported from `frontend/lib/api.ts` in `page.tsx` (both already are, since each was used in the old single-branch call).

## Verification
1. Start the frontend dev server (`npm run dev` in `frontend/`) and open `/flight-search`.
2. Confirm the "Inventory Source" section is gone; only "Search Source" (Low Fare / Air Availability) remains, both options enabled.
3. Run a one-way/return search in "Low Fare" mode: confirm results include flights from both providers (spot-check `providerCode` in network responses or badge/labels in the UI that key off it), not just Travelport.
4. Run a search with "Air Availability" mode: confirm it still returns results (Travelport-only, since Atlas doesn't support this mode) without any error about provider selection.
5. Run a multi-city search: confirm it works and returns Travelport results without the old "Low-cost carrier shopping currently supports one-way and return searches only" error blocking it.
6. Simulate one provider failing (e.g. temporarily break the Atlas endpoint URL) and confirm the search still succeeds and shows Travelport results with no hard failure — then restore.
7. Confirm booking flow still works end-to-end for a flight originating from each provider (selecting a flight → `/booking`), since that relies on `providerCode`, unaffected by this change.

## Status
**Implemented.** The "Inventory Source" selector has been removed from `frontend/app/flight-search/page.tsx`; searches now call both `searchFlights` (Travelport) and `searchAtlasFlights` (Atlas) via `Promise.allSettled` and merge the results, skipping the Atlas call for multi-city or Air Availability searches (which it doesn't support). `contentSource` state and all its plumbing were removed from `page.tsx` and `frontend/app/context/BookingContext.tsx`. Verified with `tsc --noEmit` and `next lint` (both clean). Manual verification against a running dev server (per the Verification section above) is still recommended before merging.

---

# Follow-up: Remove "Air Availability" search mode — Low Fare only

## Context
Users shouldn't be shown flight schedules with no price attached — deciding between "Low Fare" (priced, bookable results) and "Air Availability" (schedule-only, requires manual pricing before booking) is an internal/agent workflow concern, not something the end user needs to decide. This removes the "Air Availability" option and the "Search Source" selector entirely; every search now runs in Low Fare mode only.

This is purely a frontend change. The backend (`FlightSearchRequest.SearchMode` in `backend/TourValve.Application/Flights/FlightSearchRequest.cs`) already defaults to `"lowfare"` when the field is omitted, so the frontend simply stops sending a `searchMode` field. The backend's availability-mode code path is left intact (e.g. for Postman/manual diagnostics per `TRAVELPORT_POSTMAN_TESTING.md`) — only the frontend's ability to trigger it is removed.

## Key findings
All contained in `frontend/app/flight-search/page.tsx` plus one shared type in `frontend/app/context/BookingContext.tsx`:
- `type SearchMode = "lowfare" | "availability"` and all its plumbing (state, ref, persisted-UI-state field, `buildSearchSignature`, `sanitizePersistedFlightSearchUiState`, `clearFlightSearchState`, the two persistence effects, `currentSearchKey`) — same shape as the `contentSource` plumbing already removed above.
- The "Search Source" UI block — heading, description, and "Low Fare"/"Air Availability" toggle buttons calling `selectSearchMode(...)`.
- `handleSearch`'s `activeSearchMode`, its inclusion in the request payload, and its use in `canSearchAtlas` (which simplifies to just `tripType !== "multicity"` once availability mode can't be selected).
- `isAvailabilitySearch`/`isAvailabilityCard` — once `searchMode` can only ever be `"lowfare"`, these are permanently `false`. Five UI spots (badge style+label, price heading, subtext, action button label, notes copy) branch on `isAvailabilityCard` to show "Availability"/"Price needed" copy — these collapse to their existing non-bookable fallback copy ("Needs pricing"/"Fare unavailable"/"Price Flight"/etc.) instead of being left as dead conditionals.
- `frontend/app/context/BookingContext.tsx` — `searchMode` field removed from the shared `FlightSearchUiState` type (unused elsewhere in that file).
- `frontend/lib/api.ts`'s `FlightSearchPayload.searchMode` field stays as-is (harmless optional backend contract field); the frontend just stops populating it.

## Implementation
1. Delete the "Search Source" UI block entirely.
2. Remove `searchMode`/`SearchMode` state and all its plumbing (mirroring the `contentSource` removal above), including dropping `searchMode` from the outgoing search payload and simplifying `canSearchAtlas`.
3. Remove `isAvailabilitySearch`/`isAvailabilityCard` and simplify the 5 UI spots that branched on them to their non-bookable fallback copy.

## Verification
1. `npx tsc --noEmit` and `npx next lint` in `frontend/` — clean.
2. `grep -rn "searchMode\|SearchMode\|isAvailability\|Air Availability\|Search Source" frontend/` (excluding `.next/`) — no remaining references outside the intentionally-kept `lib/api.ts` field.
3. Manually confirm `/flight-search` no longer shows "Search Source", and normal searches/booking flow still work.

## Status
**Implemented.** The "Search Source" selector and `searchMode`/`SearchMode` state (and its persistence plumbing) were removed from `frontend/app/flight-search/page.tsx` and `frontend/app/context/BookingContext.tsx`. The dead `isAvailabilitySearch`/`isAvailabilityCard` branches were collapsed to their non-bookable fallback copy. Verified with `tsc --noEmit` and `next lint` (both clean) and a repo-wide grep confirming no leftover references outside the intentionally-kept `lib/api.ts` field. Manual browser verification is still recommended before merging.
