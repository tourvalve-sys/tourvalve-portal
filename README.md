# TourValve

This workspace contains three local services:

- `frontend`: Next.js app on `http://localhost:3000`
- `backend/TourValve.Api`: ASP.NET Core API on `https://localhost:7274`
- `travelport-proxy`: optional Node proxy on `http://localhost:4000`

The backend is configured for live Travelport only. AirSearch and AirBook require valid Travelport credentials.

## First-time setup

1. Copy `frontend/.env.local.example` to `frontend/.env.local`.
2. Copy `backend/TourValve.Api/appsettings.Development.example.json` to `backend/TourValve.Api/appsettings.Development.json`.
3. Copy `travelport-proxy/.env.example` to `travelport-proxy/.env`.
4. Fill in your PostgreSQL and Travelport credentials in the copied files.
6. Install dependencies if needed:
   - `cd frontend && npm install`
   - `cd travelport-proxy && npm install`
   - `cd backend/TourValve.Api && dotnet restore`

## Start everything

Run from the repo root:

```powershell
.\start-dev.ps1
```

That opens separate PowerShell windows for the backend, frontend, and proxy.

## Manual start commands

```powershell
cd frontend
npm run dev
```

```powershell
cd backend\TourValve.Api
dotnet run
```

```powershell
cd travelport-proxy
npm run dev
```

## Deployment

See `DEPLOYMENT.md`.

## Notes

- The frontend reads the API base URL from `NEXT_PUBLIC_API_BASE`.
- The backend expects PostgreSQL to be available at the configured connection string.
- The default PostgreSQL connection is aligned to `Host=localhost;Port=5432;Database=tourvalve_db;Username=postgres;Password=...`
- Login has a built-in fallback admin account for local development:
  - Email: `admin@tourvalve.com`
  - Password: `Admin@123`
