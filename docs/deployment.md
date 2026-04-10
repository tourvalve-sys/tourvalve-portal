# Deploying to Ubuntu VPS

## Architecture

| Service | Process manager | Port |
|---|---|---|
| Next.js frontend | PM2 | 3000 |
| .NET API | systemd | 5000 |
| Reverse proxy | Nginx | 80 / 443 |

---

## One-time server setup

SSH into your VPS and run:

```bash
# 1. Clone the repo (skip if already cloned)
git clone https://github.com/tourvalve-sys/tourvalve-portal.git /var/www/tourvalve-portal
cd /var/www/tourvalve-portal

# 2. Make sure you are on the branch that contains ops/setup-server.sh
#    Until this PR is merged into main, check out the setup branch:
git fetch origin
git checkout copilot/check-portal-needs-changes

# 3. Run the bootstrap script (as root)
sudo REPO_URL=https://github.com/tourvalve-sys/tourvalve-portal.git \
     bash ops/setup-server.sh
```

> **Note:** Once this branch is merged into `main` the `git checkout` step above is no longer needed — `ops/setup-server.sh` will be present on `main` and a plain `git pull` will suffice.

This will install Node.js, PM2, .NET SDK, Nginx, configure UFW, create a systemd service for the API, and start everything.

---

## GitHub Actions automatic deployment

Every push to `main` triggers `.github/workflows/deploy.yml`, which SSHes into your server, pulls the latest code, rebuilds, and restarts the services.

### Required GitHub Secrets

Go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret name | Value |
|---|---|
| `VPS_HOST` | Your server IP or domain (e.g. `123.45.67.89`) |
| `VPS_USER` | SSH username (e.g. `ubuntu` or `root`) |
| `VPS_SSH_KEY` | Contents of your **private** SSH key (`cat ~/.ssh/id_ed25519`) |
| `VPS_PORT` | SSH port — omit if 22 (default) |
| `APP_DIR` | Repo path on server — omit to use `/var/www/tourvalve-portal` |

### Generate an SSH key pair (if you don't have one)

```bash
# On your local machine:
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/tourvalve_deploy

# Copy the PUBLIC key to your server:
ssh-copy-id -i ~/.ssh/tourvalve_deploy.pub ubuntu@<your-server-ip>

# Paste the PRIVATE key content into the VPS_SSH_KEY secret:
cat ~/.ssh/tourvalve_deploy
```

---

## HTTPS (optional but recommended)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d portal.yourdomain.com
```

Certbot auto-renews the certificate via a systemd timer.

---

## Useful commands on the server

```bash
# Check frontend status
pm2 status
pm2 logs tourvalve-frontend

# Check API status
sudo systemctl status tourvalve-api
sudo journalctl -u tourvalve-api -f

# Restart everything manually
pm2 restart tourvalve-frontend
sudo systemctl restart tourvalve-api
sudo systemctl restart nginx
```
