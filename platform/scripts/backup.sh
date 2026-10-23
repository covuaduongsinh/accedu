#!/bin/sh
# Sao lưu CSDL mỗi ngày lúc ~02:00 (giờ VN), giữ KEEP_DAYS ngày.
set -eu
umask 077  # bản sao lưu chứa hash mật khẩu — chỉ root đọc được
while true; do
  now=$(date +%H%M)
  if [ "$now" -ge 0200 ] && [ ! -f "/backups/accedu-$(date +%F).sql.gz" ]; then
    pg_dump -h db -U postgres -d accedu --no-owner | gzip > "/backups/accedu-$(date +%F).sql.gz.tmp"
    mv "/backups/accedu-$(date +%F).sql.gz.tmp" "/backups/accedu-$(date +%F).sql.gz"
    find /backups -name 'accedu-*.sql.gz' -mtime +"${KEEP_DAYS:-14}" -delete
    echo "$(date -Iseconds) đã sao lưu"
  fi
  sleep 600
done
