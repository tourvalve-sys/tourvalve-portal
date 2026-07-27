# Rename app display name "TourValve" → "FlyViaSS", made env-configurable

## Context
The product is rebranding its display name from "TourValve" to "FlyViaSS." A repo-wide survey found "TourValve" hardcoded as user-facing text in well over 100 places — page titles, UI branding (sidebar/topbar/footer), legal pages, error messages, email subject lines and body copy, generated PDF titles/filenames, and admin-report export titles. Rather than doing a one-time find/replace, this plan follows the same pattern already established for the site's public URL (`AppOptions.PublicBaseUrl` on the backend, `NEXT_PUBLIC_SITE_URL`/`getSiteUrl()` on the frontend, from the recent domain-migration work) so the app's display name becomes a single configuration value, not a string baked into dozens of files. This is a **documentation-only deliverable** — no code has been changed as part of this plan.

**Scope, confirmed with the user:**
- **In scope:** all user-facing display text (titles, UI copy, legal pages, error messages, email templates, PDF titles/filenames, report export titles, config-driven display values like the SMTP `FromName` and Billplz `DescriptionPrefix`).
- **Out of scope (explicitly confirmed, leave as "TourValve"):**
  - GDS/supplier-facing identifiers sent to third parties: Travelport's `AuthorizedBy="TourValve"` XML attribute (booking/PNR remarks) and Atlas/AtripTech's `RequestSource: "TourValve"` value — these identify the agency to external partners and changing them needs separate coordination, not a simple text swap.
  - Structural internals: the C# namespaces/project names (`TourValve.Api`, `TourValve.Domain`, `TourValve.Application`, `TourValve.Infrastructure`), `frontend/package.json`'s `"name": "tourvalve-frontend"`, and the Postgres database name (`tourvalve_db`) — zero user-facing benefit, real migration/refactor risk.
  - `Jwt:Issuer`/`Jwt:Audience` = `"tourvalve.local"` — an internal auth token claim, never displayed to a user; left alone as out-of-scope/not worth the churn.

## Findings (representative — full detail already gathered, not re-listing every line)

### Frontend (~36 lines across ~16 files)
- **Metadata/titles**: `frontend/app/layout.tsx` (root `Metadata` object: `title.default`, `title.template`, `applicationName`, `description`), and 4 `head.tsx` files (`login`, `register`, `forgot-password`, `dashboard`) each with their own hardcoded `<title>`/description.
- **UI branding components**: `frontend/components/Sidebar.tsx` (logo text, 2 spots for collapsed/expanded), `frontend/components/Topbar.tsx` (fallback page title, "TourValve Workspace" kicker, fallback user display name), `frontend/components/SiteFooter.tsx` (footer brand text).
- **Copy strings scattered across pages**: legal pages (`refund-policy`, `terms-and-conditions`, `privacy-policy`), `maintenance/page.tsx`, `reports/page.tsx`, `bookings/page.tsx`, `booking/page.tsx` (4 spots), `flight-search/page.tsx`, `lib/bookingWorkflow.ts`, `lib/promotions.ts`.
- **No existing app-name env var** — only `NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_API_BASE_URL` exist today (`frontend/.env.local`, consumed via `frontend/lib/authFetch.ts`'s `getSiteUrl()`/`getApiBase()`).

### Backend (~60+ genuinely user-facing lines, out of 153 raw matches — the rest are namespace usages, out of scope)
- **`backend/TourValve.Infrastructure/Services/EmailTemplates.cs`** — the single highest-leverage file: every email (registration, approval/rejection, password reset, booking confirmation, pending-ticket notices) has a subject line and/or body copy saying "TourValve," and the shared `Wrap()` helper (used by literally every template) renders a "TourValve" branding kicker `<div>` once, centrally.
- **Config defaults**: `SmtpOptions.cs`'s `FromName` C# default + `appsettings*.json`'s `Smtp:FromName` value (currently `"TourValve"` in prod config, though `appsettings.Development.json` already independently uses a `flyviass@gmail.com` sending account per the recent forgot-password investigation — worth reconciling in the same pass); `BillplzOptions.cs`'s `DescriptionPrefix` default + `Billplz:DescriptionPrefix` config value.
- **Controllers with literal "TourValve" strings**: `AuthController.cs`, `AdminAgentsController.cs` (email subjects, in-app notification body), `BookingsController.cs` (403 error messages ×4, fallback PDF title/body), `ReportsController.cs` (403 error messages ×5, 4 export-sheet titles), `AirBookingController.cs` (email subjects, PDF attachment filename, wallet/error copy), `AtlasBookingController.cs` (wallet error copy), `WalletController.cs` (PDF statement title), `AirTicketingWorkflowService.cs`/`TravelportBookingSupportInspector.cs` (wallet/error copy referencing "TourValve Wallet").
- **Root `README.md:1`** — `# TourValve` H1 heading.

## Recommended design

**Backend — extend the existing `AppOptions` (`backend/TourValve.Infrastructure/Services/AppOptions.cs`):**
- Add `DisplayName` (e.g. defaulting to `"FlyViaSS"`), bound the same way `PublicBaseUrl` already is (from the `"App"` config section, overridable via `App__DisplayName` env var in any environment).
- Every controller/service that needs the brand name gets `AppOptions` injected — several (`AirBookingController`, `BookingsController`, `AdminAgentsController`, `AuthController`) already have it wired up from the domain-migration work; the rest (`ReportsController`, `WalletController`, `AtlasBookingController`) need the same `IOptions<AppOptions>` constructor injection added.
- `EmailTemplates.cs`: since almost every method needs the brand name (not just a couple, unlike the earlier `baseUrl` addition), extend the same parameter-threading pattern already used for `RegistrationApproved`/`PasswordResetApproved`'s `baseUrl` param — add a `displayName` parameter to each public template method (including the shared `Wrap()` helper, so the one central branding kicker only needs the value passed once per call), threaded from each caller's `_appOptions.DisplayName`.
- `SmtpOptions.FromName` and `BillplzOptions.DescriptionPrefix`: apply the same "derive default from `AppOptions` when not explicitly configured" pattern already introduced for `BillplzOptions.CallbackUrl`/`RedirectUrl` (a `PostConfigure<IOptions<AppOptions>>` step in `Program.cs`), so these config values don't need to be updated by hand in every `appsettings*.json` file separately.
- PDF titles/filenames (`BookingItineraryPdfBuilder`'s attachment filename in `AirBookingController.cs`, `WalletController.cs`'s statement title, `BookingsController.cs`'s fallback PDF title) read from `_appOptions.DisplayName` at their existing call sites — same mechanical pattern as the `PublicDomain` PDF-footer fix from the domain migration.

**Frontend — new `getAppName()` helper, mirroring `getSiteUrl()`:**
- New `NEXT_PUBLIC_APP_NAME` env var (e.g. `.env.local` sets it to `FlyViaSS` for local dev).
- New exported `getAppName()` function — recommend a new small `frontend/lib/branding.ts` (rather than folding into `authFetch.ts`, since this isn't a fetch/auth concern) that reads `process.env.NEXT_PUBLIC_APP_NAME` with a fallback default.
- Update `app/layout.tsx`'s `Metadata`, the 4 `head.tsx` files, `Sidebar.tsx`, `Topbar.tsx`, `SiteFooter.tsx`, and each of the copy-string locations above to call `getAppName()` instead of a literal string. `NEXT_PUBLIC_*` vars are inlined at build time by Next.js, so this works identically in both server and client components — no special handling needed for `"use client"` files like `Sidebar.tsx`/`Topbar.tsx`.

## Implementation outline (for a future coding turn — not done now)
1. Add `DisplayName` to `AppOptions.cs`; add the `PostConfigure` derivation for `SmtpOptions.FromName`/`BillplzOptions.DescriptionPrefix` in `Program.cs`, following the existing Billplz-URL precedent.
2. Update `EmailTemplates.cs`: add `displayName` param to `Wrap()` and every public template method; update all call sites (`AuthController.cs`, `AdminAgentsController.cs`, `AirBookingController.cs`) to pass `_appOptions.DisplayName`.
3. Inject `IOptions<AppOptions>` into `ReportsController.cs`, `WalletController.cs`, `AtlasBookingController.cs` (wherever not already present); replace their literal "TourValve" strings.
4. Replace remaining literal strings in `BookingsController.cs`, `AirBookingController.cs`, `AirTicketingWorkflowService.cs`, `TravelportBookingSupportInspector.cs` with `_appOptions.DisplayName` interpolations (these classes already have or will have `AppOptions` injected per steps above).
5. Frontend: create `frontend/lib/branding.ts` with `getAppName()`; add `NEXT_PUBLIC_APP_NAME=FlyViaSS` to `.env.local`; update `layout.tsx`, the 4 `head.tsx` files, `Sidebar.tsx`, `Topbar.tsx`, `SiteFooter.tsx`, and the remaining copy-string files listed above.
6. Update `appsettings.json`/`appsettings.Development.json`/`appsettings.Development.example.json`'s `App` section to add `DisplayName: "FlyViaSS"` (mirroring how `PublicBaseUrl` is already set there); leave `Smtp:FromName`/`Billplz:DescriptionPrefix` blank so they derive from it (or set explicitly if a different display variant is wanted for those specific surfaces).
7. Update root `README.md:1`'s `# TourValve` heading to `# FlyViaSS`.
8. Final sweep: `grep -rni "tourvalve"` across the repo (excluding `bin/obj/node_modules/.next`) and confirm only the explicitly out-of-scope items remain (GDS/supplier identifiers, C# namespaces/projects, `tourvalve-frontend` package name, `tourvalve_db`, `tourvalve.local` JWT issuer/audience).

## Verification (for a future coding turn)
1. `dotnet build` (backend), `npx tsc --noEmit` / `npm run lint` (frontend).
2. Locally, set `NEXT_PUBLIC_APP_NAME=FlyViaSS` and `App:DisplayName=FlyViaSS`, then confirm: browser tab title, sidebar/topbar/footer branding, a test registration-approval or forgot-password email's subject/body/kicker, and a generated booking or wallet PDF's title all say "FlyViaSS" instead of "TourValve."
3. `grep -rni "tourvalve"` across the repo afterward — only the confirmed out-of-scope items (GDS/supplier IDs, namespaces, package name, DB name, JWT issuer) should remain.

## Status
**Plan only — no code changes have been made yet.** Implementation will begin once this plan is reviewed and approved.
