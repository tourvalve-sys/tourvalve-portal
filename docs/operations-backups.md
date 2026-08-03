# PostgreSQL Backup Routine

This runbook covers simple database backups for the live TourValve VPS.

> **Known issue:** as of the last audit, backups on the production server
> have been silently failing every day since ~2026-04-16 — `ops/backup-postgres.sh`
> lost its executable bit, so the scheduled job can't run at all. See
> [DEPLOYMENT.md's Known Issues section](../DEPLOYMENT.md#known-issues) for
> the root cause and fix. Don't assume backups are current until that's
> confirmed fixed.

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

## Daily schedule

The production server does not use cron for this at all (no cron package is
even installed) — scheduling is done via a **systemd timer**, `tourvalve-postgres-backup.timer`,
which fires `tourvalve-postgres-backup.service` (a oneshot unit running this
script as root) daily at 03:15. Check its state with:

```bash
systemctl status tourvalve-postgres-backup.timer
systemctl status tourvalve-postgres-backup.service
journalctl -u tourvalve-postgres-backup.service -n 50 --no-pager
```

If you're setting this up on a new box and prefer cron instead, an equivalent
entry would be:

```cron
15 3 * * * /var/www/tourvalve-portal/ops/backup-postgres.sh >> /var/log/tourvalve-backup.log 2>&1
```

but that is **not** what production actually runs — match whichever
mechanism is already in place on the box you're working on.

## Notes

- The script keeps the last `RETENTION_DAYS` worth of dumps and deletes older ones.
- Dumps are created in PostgreSQL custom format (`pg_dump -Fc`) for flexible restores.
- Test a restore once before relying on backups as your only recovery path.
