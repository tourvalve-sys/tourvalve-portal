# Forgot Password (Agents)

Self-service flow that emails an agent a temporary password when they can't log in. No admin approval step is involved.

## Flow

1. Agent clicks "Forgot password" on `/login` → lands on `/forgot-password`.
2. Agent enters their email and submits.
3. Backend generates a random temporary password, emails it to the agent's registered address, and overwrites their stored password with it.
4. Agent logs in with the temporary password. There is no forced "set a new password" step — they can keep using the temp password indefinitely.

## Frontend

- `frontend/app/forgot-password/page.tsx` — email-only form, calls `forgotPassword(email)`.
- `frontend/app/login/login-client.tsx:255` — "Forgot password" link pointing to the page above.
- `forgotPassword()` in `frontend/lib/api.ts:1005` — `POST {API_BASE}/api/auth/forgot-password` with `{ email }`, via `portalFetch` + `readJson`.

## Backend

`POST api/auth/forgot-password` — `backend/TourValve.Api/Controllers/AuthController.cs:77-129`:

- Looks up the `Agent` by lowercased email in `TourValveDbContext.Agents`.
- If no agent is found, or the agent is inactive, still returns the same generic `200 OK` message: `"If an account exists for this email, a temporary password has been sent to the registered inbox."` This is intentional anti-enumeration behavior — the response never reveals whether an email is registered.
- If found: generates a 10-character temporary password via `GenerateTemporaryPassword()` (`AuthController.cs:195-207`, crypto-random from a fixed alphabet).
- Overwrites `agent.PasswordHash` with `BCrypt.Net.BCrypt.HashPassword(temporaryPassword)` — the same hashing scheme `Login` verifies against, so no other auth code needs to change.
- Auto-approves any pending rows in `PasswordResetApprovalRequests` for that email. This table is a leftover from an earlier admin-approval-only design; nothing in the current codebase inserts rows into it, so this step is effectively a no-op today.
- Emails the plaintext temporary password via `EmailTemplates.PasswordResetApproved(email, temporaryPassword)` through `IEmailService`, wrapped in a `TrySendEmailAsync` helper that swallows send failures so the request never fails due to SMTP issues (see `docs/smtp-email.md`).
- Writes an audit trail entry (`IAuditTrailService`, action `PASSWORD_RESET_SELF_SERVICE`) and creates an in-app notification for the agent.
- The entire DB/email/audit block is wrapped in a `try/catch` that swallows all exceptions — the endpoint always returns the same generic 200, even on internal errors.

## Supporting pieces

- **Password hashing**: BCrypt (`BCrypt.Net.BCrypt.HashPassword` / `.Verify`) everywhere — no ASP.NET Identity.
- **Email delivery**: `IEmailService` → `SmtpEmailService`. If `Smtp:Enabled` is false, sends are logged and no-op'd — see `docs/smtp-email.md` for the full mechanics and how to debug delivery failures.
- **Templates**: `EmailTemplates.PasswordResetApproved(...)` in `backend/TourValve.Infrastructure/Services/EmailTemplates.cs`.
- **Data model**: `Agent` entity (`backend/TourValve.Domain/Agent.cs`) — `Email`, `PasswordHash`, `Role`, `IsActive`, etc. — is the row that gets updated.

## Known gaps

- **Admin login isn't covered.** Admin auth is a hardcoded email/password check in `AuthController.Login` (`AuthController.cs:136`) with no `Agent`/DB row at all, so forgot-password has nothing to reset for the admin account.
- **No forced password change.** After logging in with the temp password, the agent isn't required to set a new one.
- **`PasswordResetApprovalRequest` table is vestigial.** Nothing currently creates rows in it.
- **Silent failure on email issues.** If SMTP is disabled or misconfigured, the endpoint still returns success even though the agent never receives the email — always verify via logs, not the API response (see `docs/smtp-email.md`).

## Verification

1. Ensure `Smtp:Enabled=true` and valid SMTP credentials are configured in the target environment.
2. `POST /api/auth/forgot-password` with `{ "email": "<existing agent email>" }` and confirm a 200 response and that an email with a temporary password arrives.
3. Log in via `/login` (or `POST /api/auth/login`) using that temporary password to confirm `BCrypt.Verify` accepts it.
