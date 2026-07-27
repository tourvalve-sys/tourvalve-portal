# Forgot-password not sending email for sittravellsivanthi@gmail.com

## Context
The user tried the "forgot password" feature for `sittravellsivanthi@gmail.com` on their local environment and never received the email, despite the UI showing a success message. This document records the investigation into why, and the fix.

## Investigation

1. **`backend/TourValve.Api/Controllers/AuthController.cs`** — `ForgotPassword` action (lines 80-132):
   - Looks up the agent by email, updates `PasswordHash` to a new temporary password, saves it, then calls `TrySendEmailAsync(...)` to send `EmailTemplates.PasswordResetApproved(...)`.
   - The entire body is wrapped in a bare `catch { }` (line 126-129) — any exception (DB, email, etc.) is swallowed and the endpoint **always** returns the same generic success message (`"If an account exists for this email, a temporary password has been sent..."`), by design, to avoid leaking whether an account exists.
   - `TrySendEmailAsync` (lines 212-222) also swallows send failures, only doing `Console.WriteLine(...)` — never surfaced to the caller or the frontend.
2. **`frontend/app/forgot-password/page.tsx`** — correctly calls `forgotPassword(email)` and displays whatever `message` the backend returns. No frontend bug — it faithfully shows the generic success text every time, which is why the user saw an apparent "success" with no email arriving.
3. **Database check** (`psql` against the local `tourvalve_db`): the `Agents` row for `sittravellsivanthi@gmail.com` **exists and `IsActive = true`** — ruling out the "account doesn't exist / inactive → silently no-ops" path in the code above.
4. **`backend/TourValve.Infrastructure/Services/SmtpEmailService.cs`** (lines 20-26):
   ```csharp
   if (!_options.Enabled)
   {
       _logger.LogInformation("SMTP disabled. Skipping email to {Email} with subject {Subject}.", toEmail, subject);
       return;
   }
   ```
   **This is the root cause.** `backend/TourValve.Api/appsettings.Development.json`'s `Smtp` section had real Gmail credentials configured (`flyviass@gmail.com` + an app password) but **`"Enabled": false`** — so every outbound email in this local environment (registration approval requests, password resets, booking confirmations, everything) silently no-op'd with only an info-level log line. No file-based logging is configured (console-only), so this log line would only ever have been visible in whichever terminal was running the `dotnet` process — there was no log file to retroactively inspect.

## Root cause, in one line
`Smtp.Enabled` was `false` in the local dev config, so `SmtpEmailService` never attempted to send anything — the forgot-password flow otherwise ran correctly (DB lookup, password reset, generic success response), it just never got past the email-send no-op.

## Secondary (lower-priority) finding
Even with SMTP enabled, if a send ever genuinely fails (bad credentials, Gmail blocking, network issue), the user will still see the same generic success message — the same "silently swallowed error, no transparency" pattern already identified and partly fixed elsewhere in this codebase (the ticketing-error-transparency work). Not fixed as part of this investigation; flagged here as a candidate for the same kind of audit-trail/notification treatment if wanted later.

## Fix applied and live test result
1. Set `Smtp.Enabled` to `true` in `backend/TourValve.Api/appsettings.Development.json` (credentials for `flyviass@gmail.com` were already present).
2. `IOptions<SmtpOptions>` is captured once at startup and does not hot-reload, so the already-running local backend process (`dotnet run`, PID 81751) was restarted to pick up the change.
3. Called `POST https://localhost:7274/api/auth/forgot-password` with `{"email":"sittravellsivanthi@gmail.com"}` directly (bypassing the UI, same endpoint the frontend calls).
   - Response: `200 OK`, `{"message":"If an account exists for this email, a temporary password has been sent to the registered inbox."}`
   - Server log shows the DB flow ran correctly (agent found, `PasswordHash` updated, audit trail written) and — critically — **no** `"SMTP disabled. Skipping email..."` log line and **no** `"Email send failed..."` line, meaning the send path was actually exercised this time and completed without throwing.
4. **Could not personally verify inbox delivery** (no access to that Gmail account) — asked the user to check `sittravellsivanthi@gmail.com` (including spam/junk, since the sender is `flyviass@gmail.com`, a different address) for an email titled "Your TourValve temporary password."

**Important side effect:** this test reset the real password on the `sittravellsivanthi@gmail.com` agent account. The new temporary password only exists in that email — sign in with it once received, then change it.

## Status
**Root cause fixed and live-tested from the server side (no errors logged).** Awaiting user confirmation that the email actually arrived in the inbox to fully close this out. If it didn't arrive despite no server-side error, the next thing to check would be the Gmail account's sending limits/app-password validity, or spam filtering — not application code, since the app's behavior at this point looks correct.
