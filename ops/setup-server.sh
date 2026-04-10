#!/usr/bin/env bash
# ops/setup-server.sh
# One-time bootstrap for a fresh Ubuntu VPS.
# Run as root or with sudo: sudo bash ops/setup-server.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tourvalve-portal}"
API_PUBLISH_DIR="/var/www/tourvalve-api/publish"
DOTNET_VERSION="8.0"
NODE_VERSION="20"
REPO_URL="${REPO_URL:-https://github.com/tourvalve-sys/tourvalve-portal.git}"

echo "======================================"
echo " TourValve Portal — Server Bootstrap"
echo "======================================"

# ── System packages ──────────────────────────────────────────────────────────
apt-get update -y
apt-get install -y curl git nginx ufw

# ── Node.js ──────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "==> Installing Node.js ${NODE_VERSION}..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
fi
echo "Node $(node -v) / npm $(npm -v)"

# ── PM2 ───────────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  echo "==> Installing PM2..."
  npm install -g pm2
  pm2 startup systemd -u "$SUDO_USER" --hp "/home/$SUDO_USER"
fi

# ── .NET SDK ─────────────────────────────────────────────────────────────────
if ! command -v dotnet &>/dev/null; then
  echo "==> Installing .NET ${DOTNET_VERSION} SDK..."
  wget -q "https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/packages-microsoft-prod.deb" \
    -O /tmp/packages-microsoft-prod.deb
  dpkg -i /tmp/packages-microsoft-prod.deb
  apt-get update -y
  apt-get install -y "dotnet-sdk-${DOTNET_VERSION}"
fi
echo "dotnet $(dotnet --version)"

# ── Clone repo ────────────────────────────────────────────────────────────────
if [ ! -d "$APP_DIR/.git" ]; then
  echo "==> Cloning repository to ${APP_DIR}..."
  git clone "$REPO_URL" "$APP_DIR"
else
  echo "==> Repository already exists at ${APP_DIR}, skipping clone."
fi

mkdir -p "$API_PUBLISH_DIR"

# ── Build frontend ────────────────────────────────────────────────────────────
echo "==> Building Next.js frontend..."
cd "$APP_DIR/frontend"
npm ci
npm run build

# ── Start frontend with PM2 ───────────────────────────────────────────────────
pm2 start npm \
  --name tourvalve-frontend \
  --cwd "$APP_DIR/frontend" \
  -- start || pm2 restart tourvalve-frontend
pm2 save

# ── Publish .NET backend ──────────────────────────────────────────────────────
echo "==> Publishing .NET backend..."
cd "$APP_DIR/backend"
dotnet publish TourValve.Api/TourValve.Api.csproj \
  -c Release \
  -o "$API_PUBLISH_DIR" \
  --nologo

# ── systemd service for .NET API ──────────────────────────────────────────────
cat > /etc/systemd/system/tourvalve-api.service <<EOF
[Unit]
Description=TourValve .NET API
After=network.target

[Service]
WorkingDirectory=${API_PUBLISH_DIR}
ExecStart=/usr/bin/dotnet ${API_PUBLISH_DIR}/TourValve.Api.dll
Restart=always
RestartSec=10
KillSignal=SIGINT
SyslogIdentifier=tourvalve-api
User=www-data
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=DOTNET_PRINT_TELEMETRY_MESSAGE=false

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable tourvalve-api
systemctl restart tourvalve-api

# ── Nginx reverse proxy ───────────────────────────────────────────────────────
cat > /etc/nginx/sites-available/tourvalve <<'EOF'
server {
    listen 80;
    server_name _;          # replace with your domain, e.g. portal.tourvalve.com

    # Next.js frontend (port 3000)
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # .NET API (port 5000)
    location /api/ {
        proxy_pass         http://127.0.0.1:5000/;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/tourvalve /etc/nginx/sites-enabled/tourvalve
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# ── UFW firewall ──────────────────────────────────────────────────────────────
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "======================================"
echo " Bootstrap complete!"
echo " Frontend : http://<your-server-ip>/"
echo " API      : http://<your-server-ip>/api/"
echo "======================================"
echo ""
echo "Next steps:"
echo "  1. Add GitHub Secrets (see README or docs/deployment.md)"
echo "  2. Point your domain to this server's IP"
echo "  3. Run: sudo certbot --nginx   (for HTTPS)"
