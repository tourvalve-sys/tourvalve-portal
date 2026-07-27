# Make the production domain configurable (remove hardcoded tourvalve.com)

## Context
The app is about to move to a new production domain. Today "tourvalve.com" is hardcoded in ~15 places across both the frontend and backend — CORS allowed origins, "manage your booking" links embedded in emails, sign-in links in account emails, the sitemap/robots.txt, canonical `<link>` tags, a PDF footer, and the Billplz payment-gateway callback/redirect URLs. Changing the domain today would require editing and redeploying code in multiple files instead of just updating configuration. This plan makes every one of those a configuration/env value, and separately lists the non-code steps (DNS, reverse proxy, TLS, third-party dashboards) needed to actually cut the domain over in production, since Claude only has access to the local repo, not the production environment.

**Scope, confirmed with the user:** this covers only actual domain/URL hardcodes. It deliberately does **not** touch the ~30 separate hardcoded checks for the string `"admin@tourvalve.com"` used as the reserved super-admin identity across the app (e.g. `AirBookingController.cs:32`, `frontend/components/Sidebar.tsx:53`, etc.) — that's a distinct, much larger refactor (admin identity, not domain) and was explicitly ruled out of scope for this change.

This is a **documentation-only deliverable** — no code has been changed as part of this plan.

## Findings: every hardcoded domain/URL reference

### Frontend
- `frontend/app/sitemap.ts:4` — `const baseUrl = "https://tourvalve.com";`
- `frontend/app/robots.ts:11-12` — `sitemap: "https://tourvalve.com/sitemap.xml"`, `host: "https://tourvalve.com"`
- `frontend/app/register/head.tsx:9`, `frontend/app/forgot-password/head.tsx:9`, `frontend/app/dashboard/head.tsx:10`, `frontend/app/login/head.tsx:9` — each has a hardcoded `<link rel="canonical" href="https://tourvalve.com/...">`.
- **Existing convention to reuse**: `frontend/lib/authFetch.ts:39-64` (`getApiBase()`) already reads `process.env.NEXT_PUBLIC_SITE_URL` / `SITE_URL` as a fallback base, but there's no exported helper for *other* files to get the canonical site URL — each of the files above hardcodes its own copy instead of using this existing env var.

### Backend
- `backend/TourValve.Api/Program.cs:39-47` — CORS `AllowedOrigins` policy hardcodes `http/https://tourvalve.com`, `http/https://www.tourvalve.com`, plus `localhost:3000` and a raw production IP (`101.99.84.242`), all baked into the compiled app.
- `backend/TourValve.Api/Controllers/AirBookingController.cs:1632` and `:1682` — `var baseUrl = "https://tourvalve.com";`, used to build the "manage booking" link embedded in the booking-confirmation and admin-notice emails sent right after every booking.
- `backend/TourValve.Infrastructure/Services/EmailTemplates.cs:37,57` — `RegistrationApproved(string email)` and `PasswordResetApproved(string email, string temporaryPassword)` hardcode `https://tourvalve.com/login` sign-in links directly in the HTML; unlike `BookingConfirmed(...)`, these two methods don't currently accept a base-URL parameter at all.
- `backend/TourValve.Infrastructure/Services/BillplzOptions.cs:10-11` and `backend/TourValve.Api/appsettings.json:47-48` — Billplz `CallbackUrl`/`RedirectUrl` default to `https://tourvalve.com/api/payments/billplz/callback` and `https://tourvalve.com/wallet?billplz=return`, both as the C# property's hardcoded default *and* as the checked-in `appsettings.json` value. These already flow through `IOptions<BillplzOptions>`, so they're a config *value* to update rather than a code hardcode — but the redundant C# hardcoded default should also be removed so a missing/misconfigured setting doesn't silently fall back to the old domain.
- `backend/TourValve.Api/Pdf/BookingItineraryPdfBuilder.cs:419` — `gfx.DrawString("tourvalve.com", ...)` draws the domain as static branding text in every generated booking-itinerary PDF footer.

## Recommended design

**Frontend — one shared helper, reusing the env var that already exists:**
- Add an exported `getSiteUrl()` function (natural home: `frontend/lib/authFetch.ts`, right next to `getApiBase()`, since it already reads `NEXT_PUBLIC_SITE_URL`) that returns the configured `NEXT_PUBLIC_SITE_URL` (normalized, trailing slash stripped), falling back to a sensible default only in local dev.
- Update `sitemap.ts`, `robots.ts`, and the four `head.tsx` files to import `getSiteUrl()` instead of hardcoding the string.
- `.env.local` (dev) keeps `NEXT_PUBLIC_SITE_URL=https://tourvalve.com` (or whatever the dev-facing value should be) as a local default; production sets its own `NEXT_PUBLIC_SITE_URL` to the new domain (see production checklist below) — no code change needed to cut over once this ships.

**Backend — a small `AppOptions` config section, following the existing `BillplzOptions`/`SmtpOptions` pattern:**
- New `AppOptions` class (`PublicBaseUrl` property, e.g. `"https://tourvalve.com"`), bound from a new `"App"` section in `appsettings.json`, registered in `Program.cs` via `builder.Services.Configure<AppOptions>(builder.Configuration.GetSection("App"))` — mirrors how `BillplzOptions`/`SmtpOptions`/`TravelportConfig` are already wired up.
- `AirBookingController.cs`'s two `baseUrl = "https://tourvalve.com"` locals become `_appOptions.PublicBaseUrl` (inject `IOptions<AppOptions>` alongside the controller's existing options dependencies).
- `EmailTemplates.RegistrationApproved`/`PasswordResetApproved` gain a `string baseUrl` parameter (matching the pattern `BookingConfirmed` already uses for `manageBookingUrl`), threaded from `AppOptions` at their call sites in `AdminAgentsController.cs`.
- `BookingItineraryPdfModel` (already passed into `BookingItineraryPdfBuilder.Build(...)` per booking) gains a `PublicDomain` (or similar) property, populated from `AppOptions.PublicBaseUrl` at each of the ~2-3 places that construct the model; `DrawFooter` reads `model.PublicDomain` instead of the literal string.
- `BillplzOptions.cs`'s C# property defaults for `CallbackUrl`/`RedirectUrl` are simplified to derive from `AppOptions.PublicBaseUrl` (e.g. `{PublicBaseUrl}/api/payments/billplz/callback`) instead of a second hardcoded domain string, so there's only one place the domain is asserted as a fallback.
- CORS: replace the hardcoded `.WithOrigins(...)` list in `Program.cs` with an allowed-origins list read from configuration — recommend a single comma-separated `CORS_ALLOWED_ORIGINS` environment variable (parsed with `.Split(',')`), since that's the simplest single knob to turn during a domain cutover without editing a JSON array; `appsettings.json` keeps the current known origins (localhost + old domain + the current prod IP) as the local-dev default/fallback when the env var isn't set.

## Implementation outline (for a future coding turn — not done now)
1. `frontend/lib/authFetch.ts`: add and export `getSiteUrl()`.
2. Update `frontend/app/sitemap.ts`, `frontend/app/robots.ts`, and the four `head.tsx` files to use it.
3. Backend: add `AppOptions` (new small file, e.g. `backend/TourValve.Api/Services/AppOptions.cs` or alongside `BillplzOptions.cs`), register in `Program.cs`.
4. Update `Program.cs`'s CORS policy to read `CORS_ALLOWED_ORIGINS` (env var, comma-separated) with the current list as the config-file fallback.
5. Update `AirBookingController.cs`'s two `baseUrl` locals to use injected `AppOptions`.
6. Add `baseUrl` parameters to `EmailTemplates.RegistrationApproved`/`PasswordResetApproved`; update call sites in `AdminAgentsController.cs`.
7. Add `PublicDomain` to `BookingItineraryPdfModel`; update `DrawFooter` and the model-construction call sites.
8. Simplify `BillplzOptions.cs`'s hardcoded defaults to derive from `AppOptions.PublicBaseUrl`; update `appsettings.json`'s `Billplz` section comment/value to match the domain that will actually be live.
9. Confirm no other file reads these hardcoded strings via a search (`grep -rni "tourvalve.com"`) after the change — only the ~30 out-of-scope admin-email hardcodes should remain.

## Verification (for a future coding turn)
1. `npx tsc --noEmit` / `npx next lint` in `frontend/`, `dotnet build` in `backend/`.
2. Locally, set `NEXT_PUBLIC_SITE_URL` and `App:PublicBaseUrl`/`CORS_ALLOWED_ORIGINS` to a throwaway test domain and confirm the sitemap, robots.txt, canonical tags, a test booking-confirmation email's "manage booking" link, and a generated booking PDF's footer all reflect the new value instead of tourvalve.com.
3. Confirm the app still loads locally against `localhost` origins (CORS fallback still includes dev origins).
4. `grep -rni "tourvalve.com"` across the repo afterward — only the intentionally-excluded admin-email checks should remain.

## Production cutover checklist (non-code, ops/infra — since Claude has no access to production)
Given locally I can't touch production, here's what needs to happen there when the domain changes, roughly in order:

1. **Register/confirm the new domain** with a registrar, and decide the exact hostnames needed (e.g. apex domain, `www`, and whether the API is served on the same host or a subdomain like `api.newdomain.com`).
2. **DNS records**: point the new domain's A/AAAA (or CNAME, if hosted behind a platform like Vercel/a load balancer) records at the production frontend host; if the API is on a separate host/subdomain, add its own DNS record too. Keep old DNS records live in parallel until the cutover is verified (don't delete tourvalve.com's records immediately).
3. **TLS/SSL certificate** for the new domain — either provision a new cert (Let's Encrypt/ACM/whatever the current setup uses) covering the new hostname(s), or confirm the existing reverse proxy/load balancer auto-provisions one (e.g. Caddy, Certbot, a managed platform) once DNS resolves.
4. **Reverse proxy / web server config** (nginx, Caddy, IIS, or whatever fronts the API and frontend in production): update `server_name`/host-matching rules to accept the new domain, alongside or instead of the old one.
5. **Environment variables to set in production** (matching this plan's new config keys):
   - Frontend: `NEXT_PUBLIC_SITE_URL=https://<new-domain>` (and `NEXT_PUBLIC_API_BASE_URL` if the API lives on a different host than before).
   - Backend: `App__PublicBaseUrl=https://<new-domain>` (or whatever key name is chosen for `AppOptions`), `CORS_ALLOWED_ORIGINS=https://<new-domain>,https://www.<new-domain>` (plus any other legitimate origins, e.g. an admin-only IP if still needed), and `Billplz__CallbackUrl` / `Billplz__RedirectUrl` if not derived automatically.
6. **Billplz merchant dashboard**: the payment gateway's registered callback/webhook URL must be updated to the new domain in Billplz's own dashboard/settings — this is external to your infra and easy to miss; payments will silently fail to confirm if this is skipped.
7. **SMTP/email sender domain considerations**: if outbound email uses SPF/DKIM/DMARC tied to the old domain, confirm the new domain (or the existing sending domain, if unrelated) still authenticates correctly — check `Smtp` config in `appsettings.json` isn't itself domain-coupled beyond what's already covered above.
8. **Rebuild and redeploy** both frontend and backend with the new environment variables in place (this is where the code changes from this plan actually take effect).
9. **Smoke test in production** end-to-end: load the new domain, log in, run a search, complete a test booking, confirm the confirmation email's links point to the new domain, download a booking PDF and confirm the footer, and do a small Billplz top-up to confirm the callback round-trips correctly.
10. **Update any external references** you control: search-console/analytics property, any marketing links, app store or partner-facing docs, and the old domain's DNS (once confident, consider a redirect from the old domain to the new one rather than dropping it outright, so old links/bookmarks don't break).
11. **Monitor logs** (application + reverse proxy) after cutover for CORS rejections, failed webhook calls, or 404s that indicate a stale reference was missed.

## Status
**Implemented.**

**Frontend:**
- `frontend/lib/authFetch.ts` gained an exported `getSiteUrl()` (reads `NEXT_PUBLIC_SITE_URL`/`SITE_URL`, browser-origin fallback, dev-only placeholder — no hardcoded production domain).
- `frontend/app/sitemap.ts`, `frontend/app/robots.ts`, and the four `head.tsx` files (`register`, `forgot-password`, `dashboard`, `login`) now build their URLs from `getSiteUrl()` instead of a literal string.
- `frontend/.env.local` now sets `NEXT_PUBLIC_SITE_URL=http://localhost:3000` for local dev.

**Backend:**
- New `AppOptions` (`backend/TourValve.Infrastructure/Services/AppOptions.cs`) with `PublicBaseUrl` (config-bound from a new `"App"` section in `appsettings.json`) and a computed `PublicDomain` (host-only, for display use like the PDF footer).
- `Program.cs`: registers `AppOptions`; `BillplzOptions` is now bound via `AddOptions<BillplzOptions>().Bind(...).PostConfigure<IOptions<AppOptions>>(...)`, deriving `CallbackUrl`/`RedirectUrl` from `AppOptions.PublicBaseUrl` whenever they're left blank in config (both are now blank in `appsettings.json` by default, so the derived value applies unless explicitly overridden). `BillplzOptions.cs`'s hardcoded domain defaults were removed.
- CORS: `Program.cs` now reads a `CORS_ALLOWED_ORIGINS` env var (comma-separated) first, falling back to a new `Cors:AllowedOrigins` array in `appsettings.json` (which keeps the previous hardcoded list as the local/default fallback).
- `AirBookingController.cs`'s two `baseUrl` locals (used for "manage booking" links in booking-confirmation/admin-notice emails) now read `_appOptions.PublicBaseUrl` via injected `IOptions<AppOptions>`.
- `EmailTemplates.RegistrationApproved`/`PasswordResetApproved` gained a `baseUrl` parameter for their sign-in links; call sites updated in `AdminAgentsController.cs` (2 sites) and `AuthController.cs`'s self-service forgot-password flow (1 site, found during build verification — not originally listed in the plan's findings).
- `BookingItineraryPdfModel` gained a `PublicDomain` field; `BuildModel(...)` takes it as a new parameter; `DrawFooter` reads `model.PublicDomain` instead of a literal string. Both call sites (`BookingsController.cs`'s `Document()` export and `AirBookingController.cs`'s `BuildBookingEmailAttachments`, which was changed from `static` to an instance method to access `_appOptions`) now pass `_appOptions.PublicDomain`.

**Local-dev consistency fix (follow-up):** `appsettings.json`'s base `App:PublicBaseUrl` default (`https://tourvalve.com`) was still being inherited by local Development runs, which would have made backend-built links (email sign-in links, Billplz redirect, PDF footer) point at production instead of the local frontend even when running everything on localhost. Added an `"App": { "PublicBaseUrl": "http://localhost:3000" }` override to both `backend/TourValve.Api/appsettings.Development.json` (the actual local config, gitignored) and `appsettings.Development.example.json` (the checked-in template for new setups), matching the frontend dev server. `Cors:AllowedOrigins` already included `localhost:3000` in the base config, and `frontend/.env.local`'s `NEXT_PUBLIC_API_BASE_URL=https://localhost:7274` already matched the backend's dev launch profile (`applicationUrl` in `launchSettings.json`) — both confirmed correct, no change needed there. `dotnet build` re-verified clean after this change.

**Verified:** `dotnet build` (backend) and `npx tsc --noEmit` / `npm run lint` (frontend) all pass clean. `grep -rni "tourvalve.com"` across the repo afterward shows only the intentionally-excluded `admin@tourvalve.com`/`system@tourvalve.com` reserved-identity checks, plus the (expected) config-file default values in `appsettings.json` and doc-comment examples in `AppOptions.cs` — no remaining code-level hardcodes.

**Not done (per plan, requires production access):** every item in the "Production cutover checklist" section above — DNS, TLS, reverse proxy, setting the new env vars in the actual production environment, updating the Billplz merchant dashboard, and the end-to-end smoke test. Those remain manual ops steps for whoever has production access.
