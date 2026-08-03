# Deploying to the Ubuntu VPS

This is the actual, tested step-by-step for shipping a feature/branch to the production VPS. It reflects what runs on the server today, confirmed by a live read-only audit — for first-time server provisioning (installing .NET, Postgres, Nginx, etc.) see [SERVER_SETUP.md](SERVER_SETUP.md), which is a generic/aspirational reference and is **not** in sync with this doc (see [Known differences](#known-differences-from-server_setupmd) below).

Project path on server: `/var/www/tourvalve-portal`
Deployed branch (as of writing): `codex/seatmap-baggage-timer` — **production does not track `main`**. Confirm this is still the intended branch before deploying, and update this line if that convention changes.

---

## 0. Access

- Host: `101.99.84.242`
- SSH port: **`20203`** — not the default 22, connections to port 22 will hang/time out.
- User: `root`
- Credentials are held outside this repo (password manager). **Never commit the password or any secret value to this file or anywhere in git.**

```bash
ssh -p 20203 root@101.99.84.242
```

---

## 1. SSH in and pull the code

```bash
cd /var/www/tourvalve-portal
git status   # sanity check — nothing you care about should be uncommitted
git pull
```

`git status` will normally show two untracked things that are expected and should **not** be committed:
- `backend/TourValve.Api/appsettings.Production.json` — local copy used by `dotnet publish`, see [Backend config](#backend-config) below
- `publish/` — build output directory

---

## 2. Backend config (only if it changed)

Edit the production settings file directly on the server:

```bash
nano backend/TourValve.Api/appsettings.Production.json
```

This file is **not** committed to git and must be maintained by hand on the server.

> **Note on secrets:** the systemd unit (`tourvalve-backend.service`) has an `ExecStartPre` that symlinks `/etc/tourvalve/appsettings.Production.json` over whatever ends up in the publish output on every service start. So the file you edit above only matters for anything `dotnet publish` needs to copy at build time — the real runtime secrets live in `/etc/tourvalve/appsettings.Production.json` (permissions `600`, root-only) and are re-linked in automatically each time the service (re)starts. If you need to change a real secret (DB password, Atlas credentials, JWT key, SMTP creds), edit `/etc/tourvalve/appsettings.Production.json` instead.
>
> Atlas credentials in particular are **not** in that JSON file at all — they're injected as environment variables via the systemd drop-in at `/etc/systemd/system/tourvalve-backend.service.d/override.conf` (`Atlas__Enabled`, `Atlas__BaseUrl`, `Atlas__SearchBaseUrl`, `Atlas__ClientId`, `Atlas__ClientSecret`, `Atlas_Currency`, `Atlas__ResidentCode`). Edit that file (then `systemctl daemon-reload`) if an Atlas credential needs to change. **Careful:** `systemctl cat` prints this drop-in's contents inline, secret values and all — don't paste that output anywhere it could be logged or shared (chat, tickets, docs).

---

## 3. Build and deploy the backend

```bash
cd /var/www/tourvalve-portal/backend/TourValve.Api
dotnet restore
dotnet publish -c Release -o /var/www/tourvalve-portal/publish/backend
```

You must run `dotnet publish` from inside `backend/TourValve.Api` — running it from the repo root fails with `MSB1003: Specify a project or solution file`.

### 3.5. Apply database migrations (if any were added)

```bash
cd /var/www/tourvalve-portal/backend/TourValve.Api
dotnet ef database update
```

`dotnet-ef` (currently `10.0.9`) is already installed globally on the box. Run this **before** restarting the backend service, so the running app never sees a schema newer or older than what it expects. If a change didn't touch `backend/*/Migrations/`, skip this step.

Restart the service:

```bash
sudo systemctl daemon-reload   # only needed if the .service or override.conf file changed
sudo systemctl restart tourvalve-backend.service
```

`daemon-reload` is safe to run every time; systemd will just no-op if nothing changed. Skipping it when a unit file *did* change means systemd keeps running the old unit definition and will warn: `Warning: The unit file ... changed on disk`.

Check it came up clean:

```bash
sudo systemctl status tourvalve-backend.service
sudo journalctl -u tourvalve-backend.service -f
```

---

## 4. Build and deploy the frontend

```bash
cd /var/www/tourvalve-portal/frontend
npm install
npm run build
sudo systemctl restart tourvalve-frontend.service
```

The frontend runs as a systemd service (**not** PM2), started via `npm run start -- --hostname 127.0.0.1 --port 3001`. Check it:

```bash
sudo systemctl status tourvalve-frontend.service
sudo journalctl -u tourvalve-frontend.service -f
```

If you see repeated `Failed to find Server Action "..."` errors in the logs shortly after a deploy, that's browser tabs left open from the *previous* build hitting the new server — it's expected noise after a deploy, not a crash. Users on those tabs need to hard-refresh.

---

## Quick reference — full deploy

```bash
cd /var/www/tourvalve-portal
git pull

cd backend/TourValve.Api
dotnet restore
dotnet ef database update
dotnet publish -c Release -o /var/www/tourvalve-portal/publish/backend
sudo systemctl daemon-reload
sudo systemctl restart tourvalve-backend.service

cd /var/www/tourvalve-portal/frontend
npm install
npm run build
sudo systemctl restart tourvalve-frontend.service
```

If only the frontend or only the backend changed, you can skip the other half (skip the `dotnet ef database update` line too if there's no new migration).

---

## Rollback

There's no automated rollback tooling — do it manually:

```bash
cd /var/www/tourvalve-portal
git log --oneline -10          # find the last known-good commit
git checkout <good-commit-sha>  # or a tag/branch, if you have one
```

Then repeat the backend and frontend build/restart steps above (sections 3–4)
against that checked-out commit.

**Database migrations are not automatically reversible.** If the broken
deploy included a new EF Core migration, rolling the app code back does
**not** roll the schema back. Before restarting the backend against an
older commit:
- Check whether the older code actually needs the newer schema removed
  (often it doesn't — additive migrations are usually backward-compatible).
- If a genuine rollback of the schema is required, you'll need to run
  `dotnet ef database update <PreviousMigrationName>` by hand, from the
  older commit's `backend/TourValve.Api` — review the migration's `Down()`
  method first, since not all migrations in this repo have been written with
  a clean down-path.
- When in doubt, restore from a known-good Postgres backup instead of
  attempting a migration-level rollback (see [Known Issues](#known-issues) —
  backups are currently broken and must be fixed before relying on this path).

---

## Services on this box

```bash
systemctl list-units --type=service --all | grep -i tourvalve
```

| Service | What it is | Working directory | Port | Status |
|---|---|---|---|---|
| `tourvalve-backend.service` | .NET API — the one actually in use, has the Atlas `override.conf` attached | `/var/www/tourvalve-portal/publish/backend` | `127.0.0.1:5274` (also binds `7274` internally) | Healthy |
| `tourvalve-frontend.service` | Next.js frontend | `/var/www/tourvalve-portal/frontend` | `127.0.0.1:3001` | Healthy |
| `tourvalve-api.service` | Legacy .NET deployment in a **separate** directory (`/var/www/tourvalve-api/`), runs as `www-data` | `/var/www/tourvalve-api/publish` | none — confirmed via `ss -tlnp` it never binds a port | **Confirmed dead: crash-looping (200k+ restarts, SIGABRT/core-dump every ~10s), serves zero traffic.** See [Known Issues](#known-issues). |
| `tourvalve-postgres-backup.service` + `tourvalve-postgres-backup.timer` | Nightly Postgres backup, triggered by a **systemd timer** (03:15 daily) — not cron | n/a | n/a | **Confirmed broken since ~2026-04-16.** See [Known Issues](#known-issues). |

View unit definitions with `systemctl cat <service-name>`.

### Domains / Nginx

Two enabled nginx sites route to the same frontend/backend pair:

| Site config | Domains |
|---|---|
| `/etc/nginx/sites-available/tourvalve` | `tourvalve.com`, `www.tourvalve.com` |
| `/etc/nginx/sites-available/flyviass` | `flyviass.com`, `www.flyviass.com` |

Both route `location /` → `http://127.0.0.1:3001` (frontend) and `location /api/` → `http://127.0.0.1:5274` (backend), with HTTP→HTTPS redirect. TLS is via Let's Encrypt/certbot for both domains — check current cert status/expiry with:

```bash
sudo certbot certificates
```

### Database

- Postgres 16 (`postgresql@16-main.service`), listening on `127.0.0.1:5432` only (not externally exposed).
- Database: `tourvalve_db`, owner `tourvalve_user` (name intentionally not changed during the FlyViaSS rebrand — see `APP_RENAME_PLAN.md`).
- Migrations are tracked in `__EFMigrationsHistory`; apply new ones with `dotnet ef database update` (see step 3.5 above). `dotnet-ef 10.0.9` is installed globally on the box.

### travelport-proxy — not deployed

Source code for an older `travelport-proxy` Node service exists on disk in two
stale copies (`/var/www/tourvalve-portal/travelport-proxy` and an orphaned
`/var/www/tourvalve/tourvalve-portal/travelport-proxy`), but it is **not**
running anywhere in production — no process, no port 4000 listener, no
systemd unit. `SERVER_SETUP.md`'s description of a live proxy is outdated;
Atlas is called directly by the backend today.

---

## Known Issues

Two confirmed problems exist on the server as of this audit. Both were
deliberately left **as found** (not fixed) — fix them in a separate,
intentional change once you're ready to act on them.

### 1. Postgres backups have been broken since ~2026-04-16

**Root cause:** `ops/backup-postgres.sh` lost its executable bit (`ls -la`
shows `-rw-r--r--`) at some point, likely overwritten by a `git pull`/redeploy
that didn't preserve it. The `tourvalve-postgres-backup.service`
(triggered daily at 03:15 by `tourvalve-postgres-backup.timer`) has been
failing every single day since with `status=203/EXEC`. The last successful
dump in `/var/backups/tourvalve` is dated **2026-04-16** — nothing since.

**Fix (not yet applied):**

```bash
chmod +x /var/www/tourvalve-portal/ops/backup-postgres.sh
sudo systemctl start tourvalve-postgres-backup.service   # trigger once to confirm it now succeeds
sudo systemctl status tourvalve-postgres-backup.service
ls -la /var/backups/tourvalve   # confirm a fresh dump appears
```

Also see [docs/operations-backups.md](docs/operations-backups.md), which has
been corrected to describe the systemd timer instead of the cron entry it
previously (inaccurately) suggested.

### 2. `tourvalve-api.service` is a dead, crash-looping legacy service

A separate, older backend deployment at `/var/www/tourvalve-api/` is stuck in
a permanent restart loop (200,000+ restarts and climbing, SIGABRT/core-dump
roughly every 10 seconds). Confirmed via `ss -tlnp` that it never successfully
binds a port — it serves **no traffic** and is unrelated to the live
`tourvalve-backend.service`. It's wasted CPU and disk (core dumps) with no
user-facing impact either way.

**Fix (not yet applied):**

```bash
sudo systemctl stop tourvalve-api.service
sudo systemctl disable tourvalve-api.service
# optional cleanup once confirmed safe:
# sudo rm -rf /var/www/tourvalve-api
```

Worth also checking accumulated core dump storage from months of crashes:
`coredumpctl list` / `du -sh /var/lib/systemd/coredump` — not checked during
this audit.

---

## Known differences from SERVER_SETUP.md

`SERVER_SETUP.md` is a generic/aspirational setup guide. These differences
are now **confirmed**, not suspected:

- It describes the frontend running under **PM2**; in reality it's a systemd
  service (`tourvalve-frontend.service`) on port **3001**, not PM2 on port 3000.
- It describes the backend service as `tourvalve-api.service` publishing to
  `backend/publish`; the service actually in use is `tourvalve-backend.service`,
  publishing to `/var/www/tourvalve-portal/publish/backend`. `tourvalve-api.service`
  does exist on the server, but it's confirmed dead weight (see
  [Known Issues](#known-issues)), not an alternate production path.
- It describes a live `travelport-proxy` on port 4000; confirmed **not
  deployed** — the code exists on disk but nothing runs it.
- It doesn't mention that nginx serves **two domains** (`tourvalve.com` and
  `flyviass.com`) off the same frontend/backend.
- It has no equivalent of the `dotnet ef database update` step at all.

Treat this file (`DEPLOYMENT.md`) as the source of truth for routine deploys,
and `SERVER_SETUP.md` as a rough reference for what a from-scratch box needs
(package installs, first-time Nginx/Postgres config shape) — but verify
everything against the real server rather than following it literally.
