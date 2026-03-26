#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Load .env if present (so DATABASE_URL is available for local dev)
if [ -f ".env" ]; then
  # shellcheck disable=SC1091
  source ".env"
fi

DATABASE_URL="${DATABASE_URL:-sqlite+aiosqlite:///./crm.db}"
TS="$(date +%Y%m%d_%H%M%S)"

mkdir -p backups

if [[ "$DATABASE_URL" == sqlite* ]]; then
  # Example: sqlite+aiosqlite:///./crm.db  -> ./crm.db
  DB_PATH="$(echo "$DATABASE_URL" | sed -E 's#sqlite\\+aiosqlite:///##')"
  if [ ! -f "$DB_PATH" ]; then
    echo "DB file not found: $DB_PATH"
    exit 1
  fi

  DEST="backups/crm.db.${TS}.bak"
  cp "$DB_PATH" "$DEST"
  echo "Backup created: $DEST"
  exit 0
fi

echo "Backups for this DATABASE_URL are not implemented yet: $DATABASE_URL"
exit 2

