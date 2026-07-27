# Support two Atlas/AtripTech base URLs (search vs. everything else), with a single-URL fallback for sandbox

## Context
Production AtripTech (the vendor behind our "Atlas" integration) exposes **two different base URLs**: one for flight search, and a different one for everything else (order, pay, void, query). Confirmed by direct code investigation: today the system only supports a **single** configured base URL for the entire Atlas surface — every operation (search, verify, order, luggage, seat availability, pay, query order details, void quotation, void, query void orders) resolves against the one `AtlasOptions.BaseUrl` value. This plan adds a second, optional base URL for search only, while preserving today's single-URL behavior for sandbox/dev (which only exposes one host for everything). This is a **documentation-only deliverable** — no code has been changed as part of this plan.

**Operation-to-host mapping, confirmed with the user:**
- **Search URL**: `search.do` only.
- **Base URL** (the existing `BaseUrl`, unchanged): everything else — `verify.do`, `order.do`, `getLuggage.do`, `seatAvailability.do`, `pay.do`, `queryOrderDetails.do`, `voidQuotation.do`, `void.do`, `queryVoidOrders.do`.

## Findings (confirmed by direct code read)

- **`backend/TourValve.Infrastructure/Atlas/AtlasOptions.cs`** — a single `[Required] public string BaseUrl { get; set; } = "https://sandbox.atriptech.com";`. No second URL property exists, no hint of one in a comment.
- **`backend/TourValve.Infrastructure/Atlas/AtlasApiClient.cs`** (116 lines) — every one of the 10 public methods (lines 29-59) delegates to a single private `SendAsync<TRequest,TResponse>(string path, ...)` helper (lines 61-103), which constructs `new HttpRequestMessage(HttpMethod.Post, path)` using a **relative** path (e.g. `"/search.do"`). The absolute host is resolved entirely via `HttpClient.BaseAddress`, set **once** at DI-registration time in `Program.cs`. There is zero per-operation branching anywhere in this file today.
- **`backend/TourValve.Api/Program.cs`** (~lines 133, 142-150) — registers `AtlasOptions` from config section `"Atlas"`, then:
  ```csharp
  builder.Services.AddHttpClient<AtlasApiClient>((sp, client) =>
  {
      var options = sp.GetRequiredService<IOptions<AtlasOptions>>().Value;
      client.Timeout = TimeSpan.FromSeconds(60);
      if (!string.IsNullOrWhiteSpace(options.BaseUrl))
          client.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/");
  });
  ```
  This is the single choke point where a second host needs to be introduced.
- **Config today**: `appsettings.Development.json`/`.example.json` both set only `Atlas:BaseUrl = "https://sandbox.atriptech.com"` (confirms the single-URL sandbox scenario). **Production `appsettings.json` has no `Atlas` section at all** — Atlas is entirely unconfigured in prod right now, so this is greenfield config work, not a breaking change to something already live.
- No other file in the Atlas integration makes its own HTTP calls — `AtlasTicketingService`/`AtlasTicketingStrategy` and both `AtlasFlightsController`/`AtlasBookingController` all route through this same single `AtlasApiClient`, so fixing it in one place covers the whole surface.

## Recommended design

- **`AtlasOptions.cs`**: add one new optional property, `public string? SearchBaseUrl { get; set; }`, with a doc comment explaining: "If unset/blank, search operations fall back to `BaseUrl` — this is what makes sandbox/dev (a single host for everything) keep working unchanged." `BaseUrl` itself is unchanged (still `[Required]`) and becomes, implicitly, "the base host for everything except search."
- **`AtlasApiClient.cs`**:
  - Add a small private resolver: `ResolveBaseUrl(bool isSearchOperation)` → returns `SearchBaseUrl` when `isSearchOperation` is true and `SearchBaseUrl` is non-blank, otherwise falls back to `BaseUrl`.
  - Add a `bool isSearchOperation = false` parameter to the shared `SendAsync<TRequest,TResponse>` helper; build the **absolute** request URI there (`{ResolveBaseUrl(...)}{path}`) instead of relying on `HttpClient.BaseAddress` — this is the one mechanical change needed, since a request built with an absolute URI ignores `HttpClient.BaseAddress` entirely, letting different calls target different hosts on the same shared `HttpClient`.
  - Update only `SearchAsync` to pass `isSearchOperation: true`; all other 9 methods (`VerifyAsync`, `OrderAsync`, `GetLuggageAsync`, `SeatAvailabilityAsync`, `PayAsync`, `QueryOrderDetailsAsync`, `VoidQuotationAsync`, `VoidAsync`, `QueryVoidOrdersAsync`) stay on the default (`BaseUrl`).
  - `EnsureConfigured()` needs no change — `BaseUrl` stays the required/primary value; `SearchBaseUrl` is optional and safely falls back.
- **`Program.cs`**: since `SendAsync` will now always build an absolute URI, the `client.BaseAddress = ...` line in the `AddHttpClient<AtlasApiClient>` factory becomes dead code — remove it for clarity (harmless to leave, but misleading to a future reader since it no longer has any effect).
- **Config**:
  - `appsettings.Development.json`/`.example.json`: no change needed — `SearchBaseUrl` stays unset, so everything correctly falls back to the single sandbox `BaseUrl`, exactly matching today's working dev setup.
  - **Production**: since there's no `Atlas` section in prod today, turning Atlas on there means adding both `Atlas__BaseUrl` (base host) and `Atlas__SearchBaseUrl` (search host) as environment variables — following the same env-var convention already established for other production secrets in this codebase (no real prod credentials get committed to `appsettings.json`), alongside the existing `Atlas__Enabled`/`Atlas__ClientId`/`Atlas__ClientSecret`.

## Implementation outline (for a future coding turn — not done now)
1. Add `SearchBaseUrl` to `AtlasOptions.cs`.
2. Add `ResolveBaseUrl(bool isSearchOperation)` and the `isSearchOperation` parameter to `SendAsync` in `AtlasApiClient.cs`; switch to building an absolute request URI.
3. Mark only `SearchAsync` as a search-host call; leave the other 9 methods as-is (default = `BaseUrl`).
4. Remove the now-dead `client.BaseAddress = ...` line in `Program.cs`'s `AddHttpClient<AtlasApiClient>` factory.
5. Document the two new required prod env vars (`Atlas__BaseUrl`, `Atlas__SearchBaseUrl`) wherever the other prod env-var requirements are tracked (e.g. alongside the `DOMAIN_MIGRATION_PLAN.md` prod checklist, or a dedicated ops doc) — actual values to be supplied by whoever holds the AtripTech production credentials, not by this plan.

## Verification (for a future coding turn)
1. `dotnet build` — confirm no compile errors from the new parameter/property.
2. Local/sandbox regression: with `SearchBaseUrl` left unset, run a flight search (search.do) and a full booking flow (verify → order → pay) against the sandbox `BaseUrl` and confirm both still work identically to today — proving the single-URL fallback path is intact.
3. Once real production URLs are available: set both `Atlas__BaseUrl` and `Atlas__SearchBaseUrl` to two different (even temporarily fake/staging) hosts locally, and confirm via request logging/network inspection that only `search.do` requests go to `SearchBaseUrl` while every other operation (`verify.do`, `order.do`, `getLuggage.do`, `seatAvailability.do`, `pay.do`, `void.do`, etc.) goes to `BaseUrl`.

## Implementation notes (as built)
- `AtlasOptions.SearchBaseUrl` added as `string?` (optional, no `[Required]`), with a doc comment explaining the sandbox/dev fallback behavior.
- `AtlasApiClient.SendAsync` gained a `bool isSearchOperation = false` parameter and now builds an absolute request URI via a new private `ResolveBaseUrl(bool isSearchOperation)` helper, instead of relying on `HttpClient.BaseAddress`.
- Only `SearchAsync` passes `isSearchOperation: true`; all other 9 methods are unchanged and continue to resolve against `BaseUrl`.
- `Program.cs`'s `AddHttpClient<AtlasApiClient>` factory no longer sets `client.BaseAddress` (now dead code, since every request URI is built explicitly per call) — replaced with a comment explaining why.
- No `appsettings*.json` changes were needed: `SearchBaseUrl` is absent from all of them, so sandbox/dev continues to resolve every operation (including search) against the single `BaseUrl`, unchanged from before.
- Verified with `dotnet build` — clean, 0 warnings/errors.

## Status
**Implemented.** `Atlas__SearchBaseUrl` is now a real, optional environment/config value — production can set both `Atlas__BaseUrl` and `Atlas__SearchBaseUrl` to the two real AtripTech hosts once available; sandbox/dev needs no change and keeps working exactly as before. Manual live-request verification (confirming `search.do` actually hits `SearchBaseUrl` once a real second host is configured) is still recommended before relying on this in production, per the Verification section above.
