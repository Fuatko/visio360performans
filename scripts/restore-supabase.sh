#!/usr/bin/env bash
set -Eeuo pipefail

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing command: $1" >&2
    exit 127
  }
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing environment variable: $name" >&2
    exit 2
  fi
}

require_cmd pg_restore
require_cmd openssl

require_env RESTORE_DB_URL
require_env BACKUP_ENCRYPTION_PASSWORD

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /path/to/visio360_full_YYYYMMDD.dump.enc" >&2
  exit 2
fi

ENC_FILE="$1"
if [[ ! -f "$ENC_FILE" ]]; then
  echo "Encrypted backup file not found: $ENC_FILE" >&2
  exit 2
fi

PLAIN_FILE="${ENC_FILE%.enc}"

echo "Decrypting backup..."
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "$ENC_FILE" \
  -out "$PLAIN_FILE" \
  -pass "env:BACKUP_ENCRYPTION_PASSWORD"

cleanup() {
  rm -f "$PLAIN_FILE"
}
trap cleanup EXIT

echo "Restoring into RESTORE_DB_URL..."
pg_restore "$PLAIN_FILE" \
  --dbname="$RESTORE_DB_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl

echo "Restore completed."
