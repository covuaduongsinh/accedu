#!/usr/bin/env bash
# Triển khai AccEdu Platform trên VPS (chạy bằng root, do workflow platform-deploy gọi qua SSH).
# Đầu vào trong $STAGE: accedu.tgz (mã nguồn), deploy.conf (cấu hình không bí mật), owner.env (tùy chọn, xóa ngay sau khi dùng).
# Secret của nền tảng (mật khẩu CSDL, JWT) được sinh tại chỗ trong /opt/accedu/.env và không rời khỏi máy chủ.
set -euo pipefail

STAGE="${STAGE:-/tmp/accedu-deploy}"
ROOT=/opt/accedu
trap 'rm -rf "$STAGE"' EXIT
# shellcheck source=/dev/null
. "$STAGE/deploy.conf"

log() { printf '\n▶ %s\n' "$1"; }

log "Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y -qq docker-compose-plugin
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker --version && docker compose version

log "Mã nguồn → $ROOT/src"
mkdir -p "$ROOT/backups"
rm -rf "$ROOT/src.new" && mkdir -p "$ROOT/src.new"
tar -xzf "$STAGE/accedu.tgz" -C "$ROOT/src.new"
rm -rf "$ROOT/src.old"
[ -d "$ROOT/src" ] && mv "$ROOT/src" "$ROOT/src.old"
mv "$ROOT/src.new" "$ROOT/src"
cd "$ROOT/src/platform"
chmod +x scripts/*.sh

log "Cấu hình $ROOT/.env (secret giữ nguyên nếu đã có)"
ENV_FILE="$ROOT/.env" BACKUP_DIR="$ROOT/backups" API_DOMAIN="$API_DOMAIN" CORS_ORIGIN_REGEX="$CORS_ORIGIN_REGEX" \
  HTTP_PORT=80 HTTPS_PORT=443 ./scripts/bootstrap-env.sh

C=(docker compose --env-file "$ROOT/.env" -f docker-compose.yml)

log "Build image server"
"${C[@]}" build

log "Khởi động (migrate chạy trước, rồi rest/server/caddy/backup)"
"${C[@]}" up -d --remove-orphans

# File bind-mount (Caddyfile, backup.sh) trỏ tới bản cũ: đổi nội dung thì tạo lại container
sum=$(cat Caddyfile scripts/backup.sh | sha256sum | cut -d' ' -f1)
if [ "$(cat "$ROOT/.mounts.sha256" 2>/dev/null)" != "$sum" ]; then
  "${C[@]}" up -d --force-recreate --no-deps caddy backup
  echo "$sum" > "$ROOT/.mounts.sha256"
fi

log "Chờ server sẵn sàng"
for _ in $(seq 60); do
  id=$("${C[@]}" ps -q server)
  st=$([ -n "$id" ] && docker inspect --format '{{.State.Health.Status}}' "$id" 2>/dev/null || echo starting)
  [ "$st" = healthy ] && break
  sleep 3
done
[ "$st" = healthy ] || { "${C[@]}" logs --tail 100 migrate server; echo "Server không khỏe ($st)"; exit 1; }
"${C[@]}" logs --no-log-prefix migrate | tail -12

if [ -f "$STAGE/owner.env" ]; then
  log "Chủ sở hữu + đơn vị $TENANT_SLUG (bỏ qua nếu đã có)"
  set -a
  # shellcheck source=/dev/null
  . "$STAGE/owner.env"
  set +a
  rm -f "$STAGE/owner.env"
  "${C[@]}" run --rm --no-deps -e OWNER_EMAIL -e OWNER_PASSWORD migrate \
    node src/cli.ts create-owner --tenant-slug "$TENANT_SLUG" --tenant-name "$TENANT_NAME" \
    --regime "$TENANT_REGIME" --start-date "$TENANT_START" --name "$OWNER_NAME"
  unset OWNER_PASSWORD
fi

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
  log "UFW đang bật: mở 80/443 cho AccEdu"
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ufw allow 443/udp >/dev/null
fi

log "Dọn dẹp"
rm -rf "$ROOT/src.old"
docker image prune -f >/dev/null

log "Trạng thái"
"${C[@]}" ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'
