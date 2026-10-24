#!/usr/bin/env bash
# Kiểm tra VPS trước khi triển khai — CHỈ ĐỌC. Thoát khác 0 (dừng workflow) khi:
#   - chưa xác định được stack Supabase của AccEdu (in danh sách để Thầy chọn SUPABASE_COMPOSE_DIR)
#   - anon key của stack không khớp SUPABASE_ANON_KEY (trỏ nhầm sang Supabase của dự án khác)
#   - CSDL đích đã có bảng ở public mà chưa từng áp migration AccEdu (CSDL của ứng dụng khác)
set -uo pipefail
here=$(dirname "$0")
# shellcheck source=supabase/deploy/lib.sh
. "$here/lib.sh"
. "$here/deploy.conf"

echo "== Máy chủ =="
(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME") ; free -h | sed -n 2p; df -h / | tail -1
echo
echo "== Các stack Supabase đang chạy =="
stacks

resolve_stack
echo
echo "== Stack đích (SUPABASE_COMPOSE_DIR=${SUPABASE_COMPOSE_DIR:-chưa đặt}) =="
if [ -z "$DB_C" ]; then
  echo "✗ Chưa xác định được container CSDL. Đặt biến Actions SUPABASE_COMPOSE_DIR = một thư mục trong danh sách trên"
  echo "  (hoặc SUPABASE_DB_CONTAINER / SUPABASE_FUNCTIONS_CONTAINER nếu stack không chạy bằng docker compose)."
  exit 2
fi
echo "CSDL:      $DB_C"
echo "Functions: ${FN_C:-(không có)}  →  ${FN_DIR:-(không thấy thư mục functions)}"

# Đúng stack phía sau SUPABASE_URL? So anon key (khóa công khai) của container với biến Actions
probe=${FN_C:-$DB_C}
key=$(container_env "$probe" SUPABASE_ANON_KEY)
if [ -n "$key" ] && [ -n "${SUPABASE_ANON_KEY:-}" ] && [ "$key" != "$SUPABASE_ANON_KEY" ]; then
  echo "✗ Anon key của stack này KHÁC SUPABASE_ANON_KEY — có thể đang trỏ nhầm sang Supabase của dự án khác. Dừng."
  exit 3
fi
[ -n "$key" ] && echo "✓ Anon key khớp với $SUPABASE_URL"

public_tables=$(psql_db -At -c "select count(*) from pg_tables where schemaname = 'public'") ||
  { echo "✗ Không truy vấn được CSDL trong $DB_C"; exit 4; }
accedu_applied=no
if [ "$(psql_db -At -c "select to_regclass('supabase_migrations.schema_migrations') is not null")" = t ] &&
   [ "$(psql_db -At -c "select count(*) from supabase_migrations.schema_migrations where version = '20261023000001'")" = 1 ]; then
  accedu_applied=yes
fi
echo "Bảng ở public: $public_tables — đã có migration AccEdu: $accedu_applied"
if [ "$public_tables" -gt 0 ] && [ "$accedu_applied" = no ]; then
  echo "✗ CSDL đích đã có $public_tables bảng nhưng chưa từng chạy migration AccEdu — đây là CSDL của ứng dụng khác. Dừng."
  exit 5
fi
echo "✓ Sẵn sàng triển khai"
