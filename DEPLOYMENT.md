# Deploying to the Ubuntu VPS

This is the actual, tested step-by-step for shipping a feature/branch to the production VPS. It reflects what runs on the server today — for first-time server provisioning (installing .NET, Postgres, Nginx, etc.) see [SERVER_SETUP.md](SERVER_SETUP.md), which is a more generic reference and is not fully in sync with this doc (see [Known differences](#known-differences-from-server_setupmd) below).

Project path on server: `/var/www/tourvalve-portal`
Deployed branch (as of writing): `codex/seatmap-baggage-timer`

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

> **Note on secrets:** the systemd unit (`tourvalve-backend.service`) has an `ExecStartPre` that symlinks `/etc/tourvalve/appsettings.Production.json` over whatever ends up in the publish output on every service start. So the file you edit above only matters for anything `dotnet publish` needs to copy at build time — the real runtime secrets live in `/etc/tourvalve/appsettings.Production.json` and are re-linked in automatically each time the service (re)starts. If you need to change a real secret (DB password, Atlas credentials, JWT key, SMTP creds), edit `/etc/tourvalve/appsettings.Production.json` instead.
>
> Atlas credentials in particular are **not** in that JSON file at all — they're injected as environment variables via the systemd drop-in at `/etc/systemd/system/tourvalve-backend.service.d/override.conf`. Edit that file (then `systemctl daemon-reload`) if an Atlas credential needs to change.

---

## 3. Build and deploy the backend

```bash
cd /var/www/tourvalve-portal/backend/TourValve.Api
dotnet restore
dotnet publish -c Release -o /var/www/tourvalve-portal/publish/backend
```

You must run `dotnet publish` from inside `backend/TourValve.Api` — running it from the repo root fails with `MSB1003: Specify a project or solution file`.

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

---

## Quick reference — full deploy

```bash
cd /var/www/tourvalve-portal
git pull

cd backend/TourValve.Api
dotnet restore
dotnet publish -c Release -o /var/www/tourvalve-portal/publish/backend
sudo systemctl daemon-reload
sudo systemctl restart tourvalve-backend.service

cd /var/www/tourvalve-portal/frontend
npm install
npm run build
sudo systemctl restart tourvalve-frontend.service
```

If only the frontend or only the backend changed, you can skip the other half.

---

## Services on this box

```bash
systemctl list-units --type=service | grep -i tourvalve
```

| Service | What it is | Working directory | Port |
|---|---|---|---|
| `tourvalve-backend.service` | .NET API (the one actually in use — has the Atlas override.conf attached) | `/var/www/tourvalve-portal/publish/backend` | `127.0.0.1:5274` |
| `tourvalve-frontend.service` | Next.js frontend | `/var/www/tourvalve-portal/frontend` | `127.0.0.1:3001` |
| `tourvalve-api.service` | Also present/running — appears to be a legacy/duplicate of `tourvalve-backend.service`; confirm before touching (see below) |  |  |
| `tourvalve-postgres-backup.service` | Postgres backup job — was in a `failed` state during the last check, unrelated to app deploys but worth investigating separately |  |  |

View unit definitions with `systemctl cat <service-name>`.

---

## Known differences from SERVER_SETUP.md

`SERVER_SETUP.md` is a generic/aspirational setup guide and doesn't match what's actually running:

- It describes the frontend running under **PM2**; in reality it's a systemd service (`tourvalve-frontend.service`) on port **3001**, not PM2 on port 3000.
- It describes the backend service as `tourvalve-api.service` publishing to `backend/publish`; the service actually in use is `tourvalve-backend.service`, publishing to `/var/www/tourvalve-portal/publish/backend`.
- `tourvalve-api.service` does still exist and show as active on the server — it's unclear whether it's dead weight or serving some other purpose. Worth confirming with whoever set it up before deleting it.

Treat this file (`DEPLOYMENT.md`) as the source of truth for routine deploys, and `SERVER_SETUP.md` as a reference for what a from-scratch box roughly needs (Nginx, Postgres, Node/.NET install steps) — but verify against the real server before following it literally.
