#!/usr/bin/env bash
# Start Postgres (with pgvector) and Redis for local development.
# Postgres runs as the unprivileged 'postgres' user on 127.0.0.1:5433.
set -e
PGDATA=${PGDATA:-/var/lib/enazpg/data}
PGBIN=/usr/lib/postgresql/16/bin
if ! su postgres -c "$PGBIN/pg_ctl -D $PGDATA status" >/dev/null 2>&1; then
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-p 5433 -c listen_addresses=127.0.0.1' -l /var/lib/enazpg/pg.log start"
fi
if ! redis-cli ping >/dev/null 2>&1; then
  redis-server --daemonize yes --save '' --appendonly no >/dev/null
fi
echo "postgres: $(su postgres -c "$PGBIN/pg_ctl -D $PGDATA status" >/dev/null 2>&1 && echo up || echo down) | redis: $(redis-cli ping 2>/dev/null || echo down)"
