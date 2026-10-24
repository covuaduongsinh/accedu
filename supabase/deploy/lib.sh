#!/usr/bin/env bash
# Hàm dùng chung cho inspect.sh / deploy.sh (chạy trên VPS). Xác định đúng stack Supabase của AccEdu:
#   SUPABASE_COMPOSE_DIR  thư mục docker compose của stack (label com.docker.compose.project.working_dir)
#   SUPABASE_DB_CONTAINER / SUPABASE_FUNCTIONS_CONTAINER  (tùy chọn) chỉ định thẳng tên container

stacks() { # Liệt kê mọi Postgres của Supabase đang chạy: tên container, image, thư mục compose
  docker ps --format '{{.Names}}\t{{.Image}}\t{{.Label "com.docker.compose.project.working_dir"}}' |
    awk -F'\t' '$2 ~ /supabase\/postgres:/ {printf "  %-40s %-34s %s\n", $1, $2, ($3 == "" ? "(không có compose)" : $3)}'
}

container_in() { # container_in DIR IMAGE_REGEX → tên container đầu tiên khớp
  # Khớp đúng thư mục hoặc thư mục con (Dokploy chạy compose trong …/<app>/code)
  local d=${1%/}
  docker ps --format '{{.Names}}\t{{.Image}}\t{{.Label "com.docker.compose.project.working_dir"}}' |
    awk -F'\t' -v d="$d" -v r="$2" '($3 == d || index($3, d "/") == 1) && $2 ~ r {print $1; exit}'
}

resolve_stack() { # đặt DB_C, FN_C, FN_DIR
  DB_C="${SUPABASE_DB_CONTAINER:-}"
  FN_C="${SUPABASE_FUNCTIONS_CONTAINER:-}"
  if [ -n "${SUPABASE_COMPOSE_DIR:-}" ]; then
    [ -n "$DB_C" ] || DB_C=$(container_in "$SUPABASE_COMPOSE_DIR" 'supabase/postgres:')
    [ -n "$FN_C" ] || FN_C=$(container_in "$SUPABASE_COMPOSE_DIR" 'supabase/edge-runtime:')
  fi
  FN_DIR="${SUPABASE_FUNCTIONS_DIR:-}"
  if [ -z "$FN_DIR" ] && [ -n "$FN_C" ]; then
    FN_DIR=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/deno/functions"}}{{.Source}}{{end}}{{end}}' "$FN_C")
  fi
}

container_env() { # container_env CONTAINER NAME → giá trị biến môi trường (không in ra log)
  docker exec "$1" printenv "$2" 2>/dev/null || true
}

psql_db() { # psql trong container db; mật khẩu đọc ngay trong container, không rời máy chủ
  if [ -z "${PSQL_MODE:-}" ]; then
    if docker exec "$DB_C" psql -U postgres -d postgres -X -qAt -c 'select 1' >/dev/null 2>&1; then PSQL_MODE=socket; else PSQL_MODE=tcp; fi
  fi
  if [ "$PSQL_MODE" = socket ]; then
    docker exec -i "$DB_C" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"
  else
    docker exec -i "$DB_C" sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -h 127.0.0.1 -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"' psql "$@"
  fi
}
