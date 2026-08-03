# Server Setup & Deployment Guide (Ubuntu)

> **This file is a generic/aspirational reference, not what's actually running.**
> For routine deploys and the real, verified state of the production server
> (service names, ports, domains, database, and known issues), see
> [DEPLOYMENT.md](DEPLOYMENT.md) instead. This file is only useful as a rough
> starting point for provisioning a *new* box from scratch — verify every
> step against the real server rather than following it literally.

Project root on server: `/var/www/tourvalve-portal`

---

## Services Overview

| Service | Technology | Runs on |
|---------|-----------|---------|
| Frontend | Next.js 15 | `localhost:3000` (proxied by Nginx) |
| API | .NET 8 | `localhost:5274` (proxied by Nginx) |
| Travelport Proxy | Node.js | `localhost:4000` (internal only) |
| Database | PostgreSQL | `localhost:5432` |

---

## First-Time Setup

### 1. System packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nginx certbot python3-certbot-nginx
```

### 2. Install .NET 8

```bash
wget https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/packages-microsoft-prod.deb -O packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
rm packages-microsoft-prod.deb
sudo apt update
sudo apt install -y dotnet-sdk-8.0
```

Verify: `dotnet --version`

### 3. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify: `node --version` and `npm --version`

### 4. Install PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

Create the database and user:

```bash
sudo -u postgres psql <<EOF
CREATE USER tourvalve WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE tourvalve_db OWNER tourvalve;
EOF
```

### 5. Install PM2 (process manager for Node.js services)

```bash
sudo npm install -g pm2
```

### 6. Clone the repository

```bash
sudo mkdir -p /var/www/tourvalve-portal
sudo chown $USER:$USER /var/www/tourvalve-portal
git clone <your-repo-url> /var/www/tourvalve-portal
```

---

## Configuration

### API — appsettings.Production.json

Create `/var/www/tourvalve-portal/backend/TourValve.Api/appsettings.Production.json`:

```json
{
  "ConnectionStrings": {
    "Default": "Host=localhost;Port=5432;Database=tourvalve_db;Username=tourvalve;Password=CHANGE_ME_STRONG_PASSWORD"
  },
  "Jwt": {
    "Key": "CHANGE_ME_TO_A_LONG_RANDOM_SECRET_AT_LEAST_32_CHARS",
    "Issuer": "yourdomain.com",
    "Audience": "yourdomain.com",
    "ExpireMinutes": 120
  },
  "Smtp": {
    "Enabled": true,
    "Host": "smtp.gmail.com",
    "Port": 587,
    "UseSsl": true,
    "Username": "your-email@gmail.com",
    "Password": "your-app-password",
    "FromEmail": "your-email@gmail.com",
    "FromName": "TourValve",
    "AdminInboxEmail": "your-email@gmail.com"
  }
}
```

This file is gitignored — it must be created manually on the server and never committed.

### Frontend — .env.production

Create `/var/www/tourvalve-portal/frontend/.env.production`:

```env
NEXT_PUBLIC_API_BASE_URL=https://yourdomain.com
```

### Travelport Proxy — environment file

Create `/var/www/tourvalve-portal/travelport-proxy/.env`:

```env
PORT=4000
TRAVELPORT_USERNAME=Universal API/CHANGE_ME
TRAVELPORT_PASSWORD=CHANGE_ME
```

This file is gitignored — create it manually on the server.

---

## Building & Running

### API

```bash
cd /var/www/tourvalve-portal/backend/TourValve.Api

# Restore and run migrations
dotnet restore
dotnet ef database update

# Publish a production build
dotnet publish -c Release -o /var/www/tourvalve-portal/backend/publish
```

### Frontend

```bash
cd /var/www/tourvalve-portal/frontend
npm install
npm run build
```

### Travelport Proxy

```bash
cd /var/www/tourvalve-portal/travelport-proxy
npm install
```

---

## Systemd Service — .NET API

Create `/etc/systemd/system/tourvalve-api.service`:

```ini
[Unit]
Description=TourValve .NET API
After=network.target postgresql.service

[Service]
WorkingDirectory=/var/www/tourvalve-portal/backend/publish
ExecStart=/usr/bin/dotnet /var/www/tourvalve-portal/backend/publish/TourValve.Api.dll
Restart=always
RestartSec=10
SyslogIdentifier=tourvalve-api
User=www-data
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://localhost:5274

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable tourvalve-api
sudo systemctl start tourvalve-api
sudo systemctl status tourvalve-api
```

---

## PM2 — Frontend & Proxy

Start both services with PM2:

```bash
# Frontend
cd /var/www/tourvalve-portal/frontend
pm2 start npm --name "tourvalve-frontend" -- start

# Travelport Proxy
cd /var/www/tourvalve-portal/travelport-proxy
pm2 start server.js --name "tourvalve-proxy"

# Save so they restart on reboot
pm2 save
pm2 startup  # follow the printed command to register PM2 with systemd
```

Check status: `pm2 status`

---

## Nginx Configuration

Create `/etc/nginx/sites-available/tourvalve`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend (Next.js)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # .NET API
    location /api/ {
        proxy_pass http://localhost:5274;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/tourvalve /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### HTTPS with Let's Encrypt

```bash
sudo certbot --nginx -d yourdomain.com
```

Certbot will automatically update the Nginx config for HTTPS and set up auto-renewal.

---

## Deploying Updates

Run this whenever you pull new code:

```bash
cd /var/www/tourvalve-portal
git pull

# Rebuild and restart API
cd backend/TourValve.Api
dotnet restore
dotnet ef database update
dotnet publish -c Release -o /var/www/tourvalve-portal/backend/publish
sudo systemctl restart tourvalve-api

# Rebuild and restart frontend
cd /var/www/tourvalve-portal/frontend
npm install
npm run build
pm2 restart tourvalve-frontend

# Restart proxy if dependencies changed
cd /var/www/tourvalve-portal/travelport-proxy
npm install
pm2 restart tourvalve-proxy
```

---

## Useful Commands

| Task | Command |
|------|---------|
| View API logs | `sudo journalctl -u tourvalve-api -f` |
| View frontend logs | `pm2 logs tourvalve-frontend` |
| View proxy logs | `pm2 logs tourvalve-proxy` |
| Restart all | `sudo systemctl restart tourvalve-api && pm2 restart all` |
| Check Nginx logs | `sudo tail -f /var/log/nginx/error.log` |
| PostgreSQL shell | `sudo -u postgres psql tourvalve_db` |

---

## Common Issues

### `dotnet-ef` not found after install
```bash
export PATH="$PATH:$HOME/.dotnet/tools"
echo 'export PATH="$PATH:$HOME/.dotnet/tools"' >> ~/.bashrc
source ~/.bashrc
```

### Port 3000/5274 not responding
Check the service is running: `pm2 status` and `sudo systemctl status tourvalve-api`

### PostgreSQL authentication failed
Make sure `appsettings.Production.json` has the correct username/password matching what was set in the `CREATE USER` step.

### Nginx 502 Bad Gateway
The upstream service (Next.js or API) isn't running. Check `pm2 status` and `sudo systemctl status tourvalve-api`.
