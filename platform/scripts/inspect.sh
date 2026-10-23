#!/usr/bin/env bash
# Kiểm tra VPS trước khi triển khai — CHỈ ĐỌC, không thay đổi gì.
# Thoát mã 3 nếu cổng 80/443 đang bị dịch vụ khác (không phải AccEdu) chiếm.
set -uo pipefail

section() { printf '\n== %s ==\n' "$1"; }

section "Hệ điều hành"
. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"
uname -srm
uptime -p 2>/dev/null || uptime

section "Tài nguyên"
free -h | sed -n '1,2p'
nproc | sed 's/^/CPU: /'
df -h / /opt 2>/dev/null | awk 'NR == 1 || !seen[$0]++'

section "Docker"
if command -v docker >/dev/null 2>&1; then
  docker --version
  docker compose version 2>/dev/null || echo "(chưa có docker compose plugin)"
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null
else
  echo "Chưa cài Docker (sẽ cài khi triển khai)"
fi

section "Cổng đang lắng nghe"
ss -ltnp 2>/dev/null | awk 'NR == 1 || /LISTEN/' | sed 's/users:((/  /; s/))$//'

section "Tường lửa"
if command -v ufw >/dev/null 2>&1; then ufw status 2>/dev/null | head -20; else echo "Không có ufw"; fi

section "Kiểm tra xung đột cổng 80/443"
conflict=0
for p in 80 443; do
  line=$(ss -ltnpH "sport = :$p" 2>/dev/null)
  others=""
  if command -v docker >/dev/null 2>&1; then
    # Container khác (không thuộc dự án compose "accedu") đang publish cổng này
    others=$(docker ps --filter "publish=$p" --format '{{.Names}} {{.Label "com.docker.compose.project"}}' 2>/dev/null | awk '$2 != "accedu" {print $1}')
  fi
  if [ -n "$others" ]; then
    echo "✗ Cổng $p đang được container khác dùng: $others"
    conflict=1
  elif [ -n "$line" ] && ! grep -q 'docker-proxy' <<<"$line"; then
    echo "✗ Cổng $p đang được tiến trình khác dùng: $line"
    conflict=1
  else
    echo "✓ Cổng $p sẵn sàng cho AccEdu"
  fi
done

if [ -d /opt/accedu ]; then
  section "AccEdu hiện tại"
  ls -la /opt/accedu
fi

if [ "$conflict" = 1 ]; then
  echo
  echo "Dừng triển khai: cổng 80/443 đang phục vụ dịch vụ khác. Cần quyết định trước (đổi cổng, gộp reverse proxy, hoặc tắt dịch vụ cũ)."
  exit 3
fi
