#!/usr/bin/env bash
# Postgres 16 local để chạy migration + test khi không có Docker/Supabase CLI.
# Dùng: bash supabase/scripts/local-pg.sh start|stop|reset|psql
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$ROOT/.pgdata"
PORT="${PGPORT:-54329}"
export PGHOST="$DATA" PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres

as_pg() {
  if [ "$(id -u)" = "0" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi
}

start() {
  if [ ! -f "$DATA/PG_VERSION" ]; then
    mkdir -p "$DATA"
    [ "$(id -u)" = "0" ] && chown postgres "$DATA"
    as_pg "'$PGBIN/initdb' -D '$DATA' -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null"
  fi
  if ! as_pg "'$PGBIN/pg_ctl' -D '$DATA' status" >/dev/null 2>&1; then
    as_pg "'$PGBIN/pg_ctl' -D '$DATA' -l '$DATA/server.log' -o \"-p $PORT -k '$DATA' -c listen_addresses=''\" -w start" >/dev/null
  fi
  echo "Postgres chạy tại socket $DATA, cổng $PORT"
}

stop() { as_pg "'$PGBIN/pg_ctl' -D '$DATA' -m fast stop" >/dev/null 2>&1 || true; }

reset() {
  start
  psql -q -v ON_ERROR_STOP=1 -c "drop database if exists accedu_test" -c "create database accedu_test"
  export PGDATABASE=accedu_test
  psql -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/stubs/supabase.sql"
  for f in "$ROOT"/supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -f "$f"; done
  psql -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/seed.sql"
  echo "Đã tạo lại CSDL accedu_test"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  reset) reset ;;
  psql) shift; PGDATABASE=accedu_test psql "$@" ;;
  *) echo "start|stop|reset|psql"; exit 1 ;;
esac
