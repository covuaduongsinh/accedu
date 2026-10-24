#!/usr/bin/env bash
# Triển khai CSDL + Edge Function của AccEdu lên Supabase tự host (chạy trên VPS qua SSH, sau inspect.sh).
# Đầu vào trong thư mục chứa script ($STAGE): deploy.conf, migrations/*.sql, seed.sql, functions/,
# owner.env (tùy chọn — email/mật khẩu tạm của chủ sở hữu, xóa ngay khi script kết thúc).
# Mật khẩu CSDL và service_role đọc ngay trong container, không rời máy chủ.
set -euo pipefail
STAGE=$(cd "$(dirname "$0")" && pwd)
trap 'rm -rf "$STAGE"' EXIT
# shellcheck source=supabase/deploy/lib.sh
. "$STAGE/lib.sh"
# shellcheck source=/dev/null
. "$STAGE/deploy.conf"
resolve_stack
[ -n "$DB_C" ] || { echo "✗ Không xác định được container CSDL"; exit 2; }
log() { printf '\n▶ %s\n' "$1"; }

log "Migration → $DB_C"
psql_db -c "create schema if not exists supabase_migrations;
            create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);"
applied=$(psql_db -At -c "select version from supabase_migrations.schema_migrations")
for f in "$STAGE"/migrations/*.sql; do
  base=$(basename "$f" .sql)
  ver=${base%%_*}
  name=${base#*_}
  if grep -qx "$ver" <<<"$applied"; then
    echo "  · $base (đã áp)"
    continue
  fi
  # Ghi vết cùng transaction với migration — lỗi thì không ghi gì
  { cat "$f"; printf "\ninsert into supabase_migrations.schema_migrations (version, name) values ('%s', '%s');\n" "$ver" "$name"; } |
    psql_db --single-transaction -f -
  echo "  ✓ $base"
done
psql_db -f - < "$STAGE/seed.sql"
psql_db -c "notify pgrst, 'reload schema'"
echo "  ✓ seed hệ thống tài khoản + nạp lại schema PostgREST"

if [ -n "$FN_C" ] && [ -n "$FN_DIR" ]; then
  log "Edge Function → $FN_DIR"
  for src in "$STAGE"/functions/*/; do
    fn=$(basename "$src")
    if diff -rq "$src" "$FN_DIR/$fn" >/dev/null 2>&1; then
      echo "  · $fn (không đổi)"
      continue
    fi
    rm -rf "${FN_DIR:?}/$fn"
    cp -r "$src" "$FN_DIR/$fn"
    restart=1
    echo "  ✓ $fn"
  done
  if [ "${restart:-0}" = 1 ]; then
    docker restart "$FN_C" >/dev/null
    echo "  ✓ khởi động lại $FN_C"
  fi
else
  echo "⚠ Không thấy container edge-runtime — bỏ qua Edge Function (nút Tạo tài khoản sẽ không chạy)"
fi

json_str() { # chuỗi → JSON string
  local s=$1
  s=${s//\\/\\\\}; s=${s//\"/\\\"}; s=${s//$'\t'/\\t}; s=${s//$'\r'/}; s=${s//$'\n'/\\n}
  printf '"%s"' "$s"
}

if [ -f "$STAGE/owner.env" ]; then
  log "Chủ sở hữu + đơn vị $TENANT_SLUG"
  # shellcheck source=/dev/null
  . "$STAGE/owner.env"
  rm -f "$STAGE/owner.env"
  key=$(container_env "${FN_C:-$DB_C}" SUPABASE_SERVICE_ROLE_KEY)
  [ -n "$key" ] || key=$(container_env "${FN_C:-$DB_C}" SERVICE_ROLE_KEY)
  [ -n "$key" ] || { echo "✗ Không đọc được service_role key trong container"; exit 6; }
  hdr=$(mktemp)
  body=$(mktemp)
  chmod 600 "$hdr" "$body"
  printf 'apikey: %s\nAuthorization: Bearer %s\nContent-Type: application/json\n' "$key" "$key" > "$hdr"
  printf '{"email":%s,"password":%s,"email_confirm":true,"user_metadata":{"full_name":%s,"must_change_password":true}}' \
    "$(json_str "$OWNER_EMAIL")" "$(json_str "$OWNER_PASSWORD")" "$(json_str "$OWNER_NAME")" > "$body"
  unset key OWNER_PASSWORD
  code=$(curl -sS -o "$STAGE/owner-res.json" -w '%{http_code}' -X POST "$SUPABASE_URL/auth/v1/admin/users" -H @"$hdr" --data-binary @"$body")
  rm -f "$hdr" "$body"
  case "$code" in
    200 | 201) echo "  ✓ đã tạo tài khoản $OWNER_EMAIL (phải đổi mật khẩu ở lần đăng nhập đầu)" ;;
    422) grep -q 'email_exists\|already' "$STAGE/owner-res.json" && echo "  · tài khoản $OWNER_EMAIL đã có (giữ nguyên mật khẩu)" ||
      { cat "$STAGE/owner-res.json"; exit 7; } ;;
    *) echo "✗ GoTrue trả $code"; cat "$STAGE/owner-res.json"; exit 7 ;;
  esac
  uid=$(printf "select id from auth.users where lower(email) = lower(:'email');" | psql_db -At -v email="$OWNER_EMAIL" -f -)
  [ -n "$uid" ] || { echo "✗ Không tìm thấy tài khoản $OWNER_EMAIL"; exit 7; }
  printf "select app.bootstrap_owner(:'uid', :'slug', :'name', :'regime', :'start'::date);" |
    psql_db -At -v uid="$uid" -v slug="$TENANT_SLUG" -v name="$TENANT_NAME" -v regime="$TENANT_REGIME" -v start="$TENANT_START" -f -
fi

log "Xong"
