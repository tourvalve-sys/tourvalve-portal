# PostgreSQL Backup Routine

This runbook covers simple database backups for the live TourValve VPS.

## Files

- Script: `ops/backup-postgres.sh`
- Default backup path on VPS: `/var/backups/tourvalve`

## One-time setup on the VPS

Copy the repo updates to the server, then make the script executable:

```bash
chmod +x /var/www/tourvalve-portal/ops/backup-postgres.sh
```

Optional: store backup secrets outside the repo:

```bash
mkdir -p /etc/tourvalve
nano /etc/tourvalve/backup.env
```

Suggested content:

```bash
export DB_NAME="tourvalve_db"
export DB_USER="tourvalve_user"
export DB_HOST="localhost"
export PGPASSWORD="your-db-password"
export BACKUP_DIR="/var/backups/tourvalve"
export RETENTION_DAYS="14"
```

Protect that file:

```bash
chmod 600 /etc/tourvalve/backup.env
```

## Run a manual backup

```bash
/var/www/tourvalve-portal/ops/backup-postgres.sh
```

You should get a `.dump` file such as:

```text
/var/backups/tourvalve/tourvalve_db-20260406-153000.dump
```

## Restore a backup

Stop the backend first:

```bash
systemctl stop tourvalve-backend
```

Recreate the database if needed:

```bash
sudo -u postgres dropdb --if-exists tourvalve_db
sudo -u postgres createdb -O tourvalve_user tourvalve_db
```

Restore:

```bash
PGPASSWORD="your-db-password" pg_restore -h localhost -U tourvalve_user -d tourvalve_db /var/backups/tourvalve/tourvalve_db-YYYYMMDD-HHMMSS.dump
```

Start the backend again:

```bash
systemctl start tourvalve-backend
```

## Optional daily cron

Example root cron entry for a 3:15 AM backup:

```cron
15 3 * * * /var/www/tourvalve-portal/ops/backup-postgres.sh >> /var/log/tourvalve-backup.log 2>&1
```

## Notes

- The script keeps the last `RETENTION_DAYS` worth of dumps and deletes older ones.
- Dumps are created in PostgreSQL custom format (`pg_dump -Fc`) for flexible restores.
- Test a restore once before relying on backups as your only recovery path.
