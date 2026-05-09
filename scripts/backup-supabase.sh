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

require_cmd pg_dump
require_cmd psql
require_cmd openssl
require_cmd shasum

require_env SUPABASE_DB_URL
require_env BACKUP_ENCRYPTION_PASSWORD

BACKUP_KIND="${BACKUP_KIND:-full}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STORAGE_PROVIDER="${BACKUP_STORAGE_PROVIDER:-local}"
RETENTION_DAYS="${BACKUP_LOCAL_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

TS="$(date -u +"%Y%m%dT%H%M%SZ")"
PLAIN_FILE="${BACKUP_DIR}/visio360_${BACKUP_KIND}_${TS}.dump"
ENC_FILE="${PLAIN_FILE}.enc"
SHA_FILE="${ENC_FILE}.sha256"
STORAGE_PATH=""
STATUS="running"
ERROR_MESSAGE=""
RUN_ID=""

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

record_started() {
  local result
  result="$(psql "$SUPABASE_DB_URL" -Atqc "insert into public.backup_runs(status, backup_kind, storage_provider, encrypted, meta) values ('running', '$(sql_escape "$BACKUP_KIND")', '$(sql_escape "$STORAGE_PROVIDER")', true, jsonb_build_object('runner', 'scripts/backup-supabase.sh')) returning id;" 2>/dev/null || true)"
  RUN_ID="$(printf "%s" "$result" | tr -d '[:space:]')"
}

record_finished() {
  local status="$1"
  local error="${2:-}"
  local size="null"
  local sha="null"
  local path_sql="null"
  local error_sql="null"

  if [[ -f "$ENC_FILE" ]]; then
    size="$(wc -c < "$ENC_FILE" | tr -d ' ')"
    sha="'$(sql_escape "$(shasum -a 256 "$ENC_FILE" | awk '{print $1}')")'"
  fi
  if [[ -n "$STORAGE_PATH" ]]; then
    path_sql="'$(sql_escape "$STORAGE_PATH")'"
  fi
  if [[ -n "$error" ]]; then
    error_sql="'$(sql_escape "$error")'"
  fi

  if [[ -n "$RUN_ID" ]]; then
    psql "$SUPABASE_DB_URL" -qc "update public.backup_runs set status='$(sql_escape "$status")', finished_at=now(), storage_path=$path_sql, file_size_bytes=$size, sha256=$sha, error_message=$error_sql where id='$(sql_escape "$RUN_ID")';" >/dev/null 2>&1 || true
  else
    psql "$SUPABASE_DB_URL" -qc "insert into public.backup_runs(status, backup_kind, storage_provider, storage_path, file_size_bytes, sha256, encrypted, error_message, finished_at) values ('$(sql_escape "$status")', '$(sql_escape "$BACKUP_KIND")', '$(sql_escape "$STORAGE_PROVIDER")', $path_sql, $size, $sha, true, $error_sql, now());" >/dev/null 2>&1 || true
  fi
}

on_error() {
  local exit_code=$?
  ERROR_MESSAGE="Backup failed at line ${BASH_LINENO[0]} with exit code ${exit_code}"
  record_finished "failed" "$ERROR_MESSAGE"
  rm -f "$PLAIN_FILE"
  echo "$ERROR_MESSAGE" >&2
  exit "$exit_code"
}

trap on_error ERR

record_started

echo "Creating compressed pg_dump..."
pg_dump "$SUPABASE_DB_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  --file="$PLAIN_FILE"

echo "Encrypting backup..."
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
  -in "$PLAIN_FILE" \
  -out "$ENC_FILE" \
  -pass "env:BACKUP_ENCRYPTION_PASSWORD"
rm -f "$PLAIN_FILE"

shasum -a 256 "$ENC_FILE" > "$SHA_FILE"

case "$STORAGE_PROVIDER" in
  s3|r2)
    require_cmd aws
    require_env BACKUP_S3_BUCKET
    S3_PREFIX="${BACKUP_S3_PREFIX:-visio360/db}"
    STORAGE_PATH="s3://${BACKUP_S3_BUCKET}/${S3_PREFIX}/$(basename "$ENC_FILE")"
    AWS_ARGS=()
    if [[ -n "${BACKUP_S3_ENDPOINT:-}" ]]; then
      AWS_ARGS+=(--endpoint-url "$BACKUP_S3_ENDPOINT")
    fi
    echo "Uploading encrypted backup to $STORAGE_PATH..."
    aws "${AWS_ARGS[@]}" s3 cp "$ENC_FILE" "$STORAGE_PATH" --only-show-errors
    aws "${AWS_ARGS[@]}" s3 cp "$SHA_FILE" "${STORAGE_PATH}.sha256" --only-show-errors
    ;;
  local)
    STORAGE_PATH="$ENC_FILE"
    ;;
  *)
    echo "Unsupported BACKUP_STORAGE_PROVIDER: $STORAGE_PROVIDER" >&2
    exit 2
    ;;
esac

find "$BACKUP_DIR" -type f -name "visio360_*.dump.enc*" -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true

record_finished "success"

echo "Backup completed: $STORAGE_PATH"
