# Deployment / Release Runbook

This repo is deployed as two services:

- Frontend: Next.js (`tourvalve-frontend`)
- Backend: ASP.NET Core API (`tourvalve-backend`)

## GitHub (local dev machine)

```bash
cd /path/to/your/local/tourvalve-portal   # your repo root
git status

git checkout main
git pull origin main

git checkout -b codex/<short-name>
git add -A
git commit -m "<message>"

git push -u origin HEAD
```

## Server commands

```bash
cd /var/www/tourvalve-portal
git checkout main
git pull origin main
git rev-parse --short HEAD
```

### Frontend

```bash
cd /var/www/tourvalve-portal/frontend
npm ci
npm run build
sudo systemctl restart tourvalve-frontend
sudo systemctl status tourvalve-frontend --no-pager -n 30
```

### Backend

```bash
cd /var/www/tourvalve-portal/backend
dotnet publish TourValve.Api/TourValve.Api.csproj -c Release -o /var/www/tourvalve-portal/publish/backend
sudo systemctl restart tourvalve-backend
sudo systemctl status tourvalve-backend --no-pager -n 50
```

