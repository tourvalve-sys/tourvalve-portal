#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${DB_NAME:-tourvalve_db}"
DB_USER="${DB_USER:-tourvalve_user}"
DB_HOST="${DB_HOST:-localhost}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/tourvalve}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}-${STAMP}.dump"

if [[ -f /etc/tourvalve/backup.env ]]; then
  # shellcheck disable=SC1091
  source /etc/tourvalve/backup.env
fi

mkdir -p "${BACKUP_DIR}"

echo "[tourvalve-backup] starting dump for ${DB_NAME} at ${STAMP}"
PGPASSWORD="${PGPASSWORD:-}" pg_dump \
  -h "${DB_HOST}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -Fc \
  -f "${BACKUP_FILE}"

find "${BACKUP_DIR}" -maxdepth 1 -type f -name "${DB_NAME}-*.dump" -mtime +"${RETENTION_DAYS}" -delete

echo "[tourvalve-backup] completed: ${BACKUP_FILE}"
