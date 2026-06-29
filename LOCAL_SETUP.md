# Local Setup Guide (macOS)

## Prerequisites

Install the following if you don't have them already.

### 1. Homebrew
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. .NET 8 SDK (for the backend API)

The backend targets `net8.0` — you must install the .NET 8 SDK specifically. Installing a newer version (9, 10, etc.) alone will not work.

```bash
brew install --cask dotnet-sdk@8
```

Verify:
```bash
dotnet --list-sdks   # should show an 8.x.x entry
```

If you already have a newer .NET version installed, you can have both side-by-side — that's fine. Just make sure 8.x appears in the list above.

### 3. Node.js (for the frontend and proxy)
```bash
brew install node
```
Verify: `node --version` and `npm --version`

### 4. PostgreSQL
```bash
brew install postgresql@16
brew services start postgresql@16
```
Verify: `psql --version`

---

## Project Structure

```
tourvalve-portal/
├── frontend/          # Next.js 15 app (port 3000)
├── backend/           # .NET API (port 7274 HTTPS / 5274 HTTP)
│   ├── TourValve.Api
│   ├── TourValve.Application
│   ├── TourValve.Domain
│   └── TourValve.Infrastructure
└── travelport-proxy/  # Node.js proxy for Travelport API
```

---

## Step 1 — Database Setup

When PostgreSQL is installed via Homebrew on macOS, the default superuser is your **macOS username** — there is no `postgres` role by default.

Create the database using:

```bash
createdb tourvalve_db
```

That's it. `createdb` connects as your current macOS user automatically.

To verify it worked:
```bash
psql tourvalve_db -c "\conninfo"
```

---

## Step 2 — Backend (.NET API)

### Configure appsettings

Edit `backend/TourValve.Api/appsettings.json` and update the connection string to use your macOS username (run `whoami` in terminal to get it):

```json
"ConnectionStrings": {
  "Default": "Host=localhost;Port=5432;Database=tourvalve_db;Username=YOUR_MAC_USERNAME;Password="
},
"Jwt": {
  "Key": "any-long-random-string-at-least-32-chars"
}
```

> Homebrew PostgreSQL uses peer/trust auth locally so the password can be left empty for dev.

> **Tip:** For local dev you can also create `backend/TourValve.Api/appsettings.Development.json` to override values without touching the shared config file.

### Run database migrations

**1. Install the EF Core CLI tool** (required — not included with the .NET SDK):

```bash
dotnet tool install --global dotnet-ef
```

**2. Add the .NET tools directory to your PATH.**

The installer won't do this automatically. Add it permanently to your shell profile:

```bash
cat << \EOF >> ~/.zprofile
# Add .NET Core SDK tools
export PATH="$PATH:/Users/$(whoami)/.dotnet/tools"
EOF
```

Then reload your shell so it takes effect in the current session:

```bash
source ~/.zprofile
```

Verify `dotnet ef` is now found:

```bash
dotnet ef --version
```

**3. Restore NuGet packages** (required before EF can read the project):

```bash
cd backend/TourValve.Api
dotnet restore
```

**4. Run the migrations:**

```bash
dotnet ef database update
```

### Start the API

```bash
cd backend/TourValve.Api
dotnet run
```

The API will be available at:
- `https://localhost:7274` (HTTPS)
- `http://localhost:5274` (HTTP)

The first time you run it, .NET will generate a local dev certificate. If your browser warns about it, trust it with:
```bash
dotnet dev-certs https --trust
```

---

## Step 3 — Travelport Proxy

```bash
cd travelport-proxy
npm install
npm run dev
```

---

## Step 4 — Frontend (Next.js)

### Configure environment

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=https://localhost:7274
```

### Install and run

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:3000`.

---

## Running Everything at Once

Open three terminal tabs and run each service:

| Tab | Directory | Command |
|-----|-----------|---------|
| 1 | `backend/TourValve.Api` | `dotnet run` |
| 2 | `travelport-proxy` | `npm run dev` |
| 3 | `frontend` | `npm run dev` |

---

## Common Issues

### `dotnet: command not found`
The .NET SDK isn't on your PATH. Add this to your `~/.zshrc`:
```bash
export PATH="$PATH:/usr/local/share/dotnet"
```
Then run `source ~/.zshrc`.

### `role "postgres" does not exist`
Homebrew PostgreSQL doesn't create a `postgres` superuser — your macOS username is the superuser. Use `createdb tourvalve_db` (no `-U` flag) and set `Username=YOUR_MAC_USERNAME` (output of `whoami`) in `appsettings.json`.

### PostgreSQL connection refused
Make sure the service is running: `brew services list | grep postgresql`
Start it if needed: `brew services start postgresql@16`

### SSL certificate errors in the browser
Trust the dev cert: `dotnet dev-certs https --trust`

### Port 3000 already in use
Find and kill the process: `lsof -ti:3000 | xargs kill -9`
