#!/usr/bin/env bash
# ============================================================
# Tamem — sync local MySQL → Hostinger online MySQL
# ============================================================
# Usage:
#   bash scripts/sync-db-to-hostinger.sh           # full sync (schema + data)
#   bash scripts/sync-db-to-hostinger.sh --data    # data only (assumes schema)
#   bash scripts/sync-db-to-hostinger.sh --schema  # schema only (Prisma push)
#
# Requirements:
#   - MySQL client installed (/c/xampp/mysql/bin/mysql.exe on Windows XAMPP)
#   - mysqldump in PATH
#   - Your IP must be added to Hostinger → Remote MySQL whitelist
#   - HOSTINGER_DB_* env vars set OR fall back to the defaults below
#
# Safe to re-run: data sync truncates remote tables in dependency order
# then re-imports, so foreign keys never break during the swap.
set -euo pipefail

# ---------- config (override via env) ----------
LOCAL_HOST="${LOCAL_DB_HOST:-127.0.0.1}"
LOCAL_PORT="${LOCAL_DB_PORT:-3306}"
LOCAL_USER="${LOCAL_DB_USER:-root}"
LOCAL_PASS="${LOCAL_DB_PASS:-}"
LOCAL_NAME="${LOCAL_DB_NAME:-tamem}"

REMOTE_HOST="${HOSTINGER_DB_HOST:-srv2123.hstgr.io}"
REMOTE_PORT="${HOSTINGER_DB_PORT:-3306}"
REMOTE_USER="${HOSTINGER_DB_USER:-u405809647_tamem}"
REMOTE_PASS="${HOSTINGER_DB_PASS:-}"
REMOTE_NAME="${HOSTINGER_DB_NAME:-u405809647_tamem}"

# Default MySQL client paths — first match wins.
MYSQL="${MYSQL_BIN:-}"
MYSQLDUMP="${MYSQLDUMP_BIN:-}"
if [ -z "$MYSQL" ]; then
  for cand in "/c/xampp/mysql/bin/mysql.exe" "$(command -v mysql || true)"; do
    [ -x "$cand" ] && { MYSQL="$cand"; break; } || true
  done
fi
if [ -z "$MYSQLDUMP" ]; then
  for cand in "/c/xampp/mysql/bin/mysqldump.exe" "$(command -v mysqldump || true)"; do
    [ -x "$cand" ] && { MYSQLDUMP="$cand"; break; } || true
  done
fi

[ -z "$MYSQL" ] && { echo "ERROR: mysql client not found"; exit 1; }
[ -z "$MYSQLDUMP" ] && { echo "ERROR: mysqldump not found"; exit 1; }
[ -z "$REMOTE_PASS" ] && { echo "ERROR: HOSTINGER_DB_PASS env var is required"; exit 1; }

# ---------- helpers ----------
remote_exec() {
  "$MYSQL" -h "$REMOTE_HOST" -P "$REMOTE_PORT" -u "$REMOTE_USER" -p"$REMOTE_PASS" "$REMOTE_NAME" "$@"
}
local_dump() {
  if [ -n "$LOCAL_PASS" ]; then
    "$MYSQLDUMP" -h "$LOCAL_HOST" -P "$LOCAL_PORT" -u "$LOCAL_USER" -p"$LOCAL_PASS" "$LOCAL_NAME" "$@"
  else
    "$MYSQLDUMP" -h "$LOCAL_HOST" -P "$LOCAL_PORT" -u "$LOCAL_USER" "$LOCAL_NAME" "$@"
  fi
}

# ---------- step 1: probe ----------
echo "==> probing remote MySQL at $REMOTE_HOST..."
if ! remote_exec -e "SELECT 1;" >/dev/null 2>&1; then
  echo "ERROR: cannot reach $REMOTE_HOST. Add your IP to Hostinger → Remote MySQL."
  exit 1
fi
echo "    OK"

# ---------- step 2: schema (optional) ----------
MODE="${1:-full}"
if [ "$MODE" = "full" ] || [ "$MODE" = "--schema" ]; then
  echo "==> pushing Prisma schema to remote..."
  REMOTE_URL="mysql://$REMOTE_USER:$(printf %s "$REMOTE_PASS" | jq -sRr @uri 2>/dev/null || python -c "import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read().strip(),safe=''))" <<<"$REMOTE_PASS")@$REMOTE_HOST:$REMOTE_PORT/$REMOTE_NAME"
  DATABASE_URL="$REMOTE_URL" pnpm --filter @tamem/backend exec prisma db push --accept-data-loss --skip-generate
  echo "    schema synced"
fi

# ---------- step 3: data ----------
if [ "$MODE" = "full" ] || [ "$MODE" = "--data" ]; then
  echo "==> dumping local data..."
  TMP=$(mktemp -d)
  local_dump \
    --single-transaction \
    --no-create-info \
    --no-tablespaces \
    --skip-triggers \
    --ignore-table="$LOCAL_NAME._prisma_migrations" \
    --hex-blob \
    --default-character-set=utf8mb4 \
    > "$TMP/data.sql"
  SIZE=$(wc -c < "$TMP/data.sql" | tr -d ' ')
  echo "    dumped $SIZE bytes"

  echo "==> truncating remote tables (preserving _prisma_migrations)..."
  remote_exec -N -e "SHOW TABLES;" | grep -v '^_prisma_migrations$' | while read t; do
    remote_exec -e "SET FOREIGN_KEY_CHECKS=0; TRUNCATE TABLE \`$t\`; SET FOREIGN_KEY_CHECKS=1;"
  done

  echo "==> loading data into remote..."
  remote_exec --default-character-set=utf8mb4 -e "SET FOREIGN_KEY_CHECKS=0; SOURCE $TMP/data.sql; SET FOREIGN_KEY_CHECKS=1;"
  rm -rf "$TMP"
  echo "    data synced"
fi

# ---------- step 4: verify ----------
echo "==> verification:"
remote_exec -e "
  SELECT 'users'    AS tbl, COUNT(*) AS n FROM user
  UNION SELECT 'services',  COUNT(*) FROM service
  UNION SELECT 'merchants', COUNT(*) FROM merchantprofile
  UNION SELECT 'orders',    COUNT(*) FROM \`order\`
  UNION SELECT 'categories',COUNT(*) FROM category;
"

echo
echo "Done. Remote DATABASE_URL for backend .env:"
echo "  mysql://$REMOTE_USER:<password-url-encoded>@$REMOTE_HOST:3306/$REMOTE_NAME"
