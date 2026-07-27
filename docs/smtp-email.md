# SMTP Email Sending

How TourValve sends outbound email (password resets, registration/approval notices, booking confirmations), and how to debug delivery failures in production.

## Code path

- `IEmailService` (`backend/TourValve.Infrastructure/Services/IEmailService.cs`) — `SendAsync(toEmail, subject, htmlBody, attachments?)`.
- `SmtpEmailService` (`backend/TourValve.Infrastructure/Services/SmtpEmailService.cs`) — the only implementation, backed by plain `System.Net.Mail.SmtpClient`. No SendGrid/MailKit/etc.
- `SmtpOptions` (`backend/TourValve.Infrastructure/Services/SmtpOptions.cs`) — `Host`, `Port`, `UseSsl`, `Username`, `Password`, `FromEmail`, `FromName`, `AdminInboxEmail`, `Enabled`. Bound from the `Smtp` config section in `Program.cs:114`.
- Default config in `appsettings.json:20-30` ships with `"Enabled": false` and Gmail defaults (`smtp.gmail.com:587`). There is **no committed `appsettings.Production.json`** in the repo — production must override these values via environment variables (`Smtp__Enabled`, `Smtp__Password`, etc. — double underscore for nested keys) or an untracked config file on the server.
- Callers (`AuthController`, `AdminAgentsController`) wrap every send in a local `TrySendEmailAsync` helper that catches and logs exceptions via `Console.WriteLine` rather than letting them fail the request — email problems never surface as an API error, only in logs.

## How SMTP relaying actually works

Your server is only ever an **SMTP client** talking to one relay (Gmail). It never talks to the recipient's mail server directly.

1. **Connect**: `SmtpEmailService` opens a TCP connection to `Host:Port` (`smtp.gmail.com:587`).
2. **STARTTLS**: `EnableSsl = _options.UseSsl` upgrades the connection to an encrypted TLS tunnel before any credentials or message content are sent.
3. **AUTH**: the server authenticates as `Username`/`Password` over that encrypted channel. This is where the app proves it's allowed to send *as* that Gmail account.
4. **Message handoff**: `client.SendMailAsync(message)` executes the underlying SMTP conversation (`MAIL FROM` / `RCPT TO` / `DATA`) and hands the message to Gmail. Once Gmail responds `250 OK`, the app's job is done — it has no further visibility into what happens next.
5. **Gmail relays onward**: Gmail looks up the recipient's domain via DNS **MX records** and connects to *that* provider's mail servers (Microsoft's for `outlook.com`/`hotmail.com`, Yahoo's for `yahoo.com`, a company's own mail server for a custom domain, etc.) to hand off the message — the same kind of SMTP handshake the app just did with Gmail.
6. **Recipient's server runs auth checks** (SPF/DKIM/DMARC) and delivers to the inbox (or spam folder).

**Consequence**: the recipient's email provider is irrelevant to this app. Once the app successfully authenticates and hands a message to Gmail, delivery to any provider works identically — Gmail does the inter-provider relaying, not this server.

## Why Gmail requires an App Password

Google deprecated plain-password SMTP auth ("less secure app access") in 2022. To authenticate via `smtp.gmail.com`, the sending account needs:

1. **2-Step Verification enabled**, and
2. An **App Password** (16-character generated credential from `myaccount.google.com/apppasswords`) used as `Smtp:Password` — never the real account login password.

If the account is a Google Workspace address rather than personal Gmail, a workspace admin can block app passwords entirely via admin console policy.

Gmail also has sending volume caps and can flag a new/unfamiliar server IP as suspicious. A transactional provider (SendGrid, Mailgun, SES, Postmark) avoids this whole class of issue and gives real delivery logs — worth considering if this keeps causing friction, though not required today.

## Debugging "production isn't sending email"

The API always returns 200 from `/api/auth/forgot-password` regardless of whether the email actually sent (anti-enumeration + swallowed exceptions) — never use the API response as a signal. Check the actual logs and config instead.

**1. Confirm `Smtp:Enabled` is true in the effective prod config:**

```bash
find / -iname "appsettings.Production.json" 2>/dev/null
printenv | grep -i smtp
systemctl cat tourvalve-backend | grep -i smtp
```

**2. Check the service logs:**

```bash
journalctl -u tourvalve-backend -n 500 --no-pager | grep -i -E "smtp|email"
```

- `"SMTP disabled. Skipping email to..."` → `Smtp:Enabled` isn't true in the effective config (env var not set, or set with a colon instead of `__`).
- `"Email send failed to <email>: <exception message>"` → `Enabled=true` but the send itself threw. The exception message says why (e.g. `5.7.0 Authentication Required` = bad/missing Gmail App Password).

**3. Isolate SMTP from the app** by testing the same host/credentials directly from the server:

```bash
nc -zv smtp.gmail.com 587   # rules out network/firewall blocking

swaks --to yourtest@example.com \
      --from "tourvalve@gmail.com" \
      --server smtp.gmail.com:587 \
      --auth LOGIN \
      --auth-user "tourvalve@gmail.com" \
      --auth-password "<password from config>" \
      --tls
```

- `nc` fails to connect → outbound port blocked by `ufw` or the cloud provider's firewall/security group.
- `swaks` connects but auth fails → wrong or missing Gmail App Password reaching prod.
- `swaks` succeeds → SMTP itself is fine; the app just isn't loading the config (back to step 1) — restart the service after fixing config, since a change to env vars or a config file needs a restart to take effect.

**4. Fixing a Gmail `5.7.0 Authentication Required` error:**

1. Enable 2-Step Verification on the sending Gmail account.
2. Generate an App Password at `myaccount.google.com/apppasswords`.
3. Set `Smtp__Password` to that 16-character value in prod (env var or config file).
4. `sudo systemctl restart tourvalve-backend`.
5. Re-check `journalctl -u tourvalve-backend -f | grep -i -E "smtp|email"` for the absence of further failures, and confirm the test email arrives.
