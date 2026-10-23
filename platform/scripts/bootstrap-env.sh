#!/usr/bin/env bash
# Tạo file .env lần đầu với secret ngẫu nhiên (sinh ngay trên máy chủ, không rời khỏi máy).
# Lần sau chỉ cập nhật API_DOMAIN / CORS / cổng nếu truyền vào, giữ nguyên secret cũ.
# ENV_FILE: đường dẫn file (mặc định platform/.env; trên VPS là /opt/accedu/.env, nằm ngoài thư mục mã nguồn).
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE="${ENV_FILE:-.env}"
rand() { openssl rand -hex 32; }
set_kv() { # set_kv KEY VALUE (thay hoặc thêm; an toàn với ký tự đặc biệt trong regex)
  { grep -v "^$1=" "$ENV_FILE" || true; printf '%s=%s\n' "$1" "$2"; } > "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
}
if [ ! -f "$ENV_FILE" ]; then
  umask 077
  cat > "$ENV_FILE" <<EOT
POSTGRES_PASSWORD=$(rand)
AUTHENTICATOR_PASSWORD=$(rand)
SERVER_DB_PASSWORD=$(rand)
JWT_SECRET=$(rand)
ANON_KEY=accedu-public-anon
EOT
  echo "Đã tạo $ENV_FILE với secret mới"
fi
chmod 600 "$ENV_FILE"
for k in API_DOMAIN HTTP_PORT HTTPS_PORT BACKUP_DIR; do
  [ -n "${!k:-}" ] && set_kv "$k" "${!k}"
done
[ -n "${CORS_ORIGIN_REGEX:-}" ] && set_kv CORS_ORIGIN_REGEX "'$CORS_ORIGIN_REGEX'"
# Tối ưu Postgres theo RAM máy (chỉ lần đầu): shared_buffers 25% (≤ 1 GB), effective_cache_size 50% (≤ 4 GB)
if ! grep -q '^PG_SHARED_BUFFERS=' "$ENV_FILE" && [ -r /proc/meminfo ]; then
  mem_mb=$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)
  sb=$((mem_mb / 4)); [ "$sb" -gt 1024 ] && sb=1024; [ "$sb" -lt 128 ] && sb=128
  ec=$((mem_mb / 2)); [ "$ec" -gt 4096 ] && ec=4096; [ "$ec" -lt 256 ] && ec=256
  set_kv PG_SHARED_BUFFERS "${sb}MB"
  set_kv PG_EFFECTIVE_CACHE "${ec}MB"
fi
chmod 600 "$ENV_FILE"
grep -q '^API_DOMAIN=' "$ENV_FILE" || { echo "Thiếu API_DOMAIN"; exit 1; }
echo "Cấu hình: $(grep -E '^(API_DOMAIN|ANON_KEY)=' "$ENV_FILE" | tr '\n' ' ')"
