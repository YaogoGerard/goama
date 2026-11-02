#!/usr/bin/env bash
set -Eeuo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker est requis pour les tests backend isolés." >&2
  exit 1
fi

container_name="goama-test-postgres-$$"
test_files_dir="$(mktemp -d "${TMPDIR:-/tmp}/goama-test-files.XXXXXX")"

cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  rm -r -- "$test_files_dir"
}
trap cleanup EXIT

docker run -d --rm \
  --name "$container_name" \
  --tmpfs /var/lib/postgresql/data:rw \
  -e POSTGRES_USER=goama \
  -e POSTGRES_PASSWORD=goama \
  -e POSTGRES_DB=goama \
  -p 127.0.0.1::5432 \
  postgres:17-alpine >/dev/null

for attempt in $(seq 1 30); do
  if docker exec "$container_name" pg_isready -U goama -d goama >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == "30" ]]; then
    echo "PostgreSQL de test n'est pas devenu disponible." >&2
    exit 1
  fi
  sleep 1
done

port="$(docker port "$container_name" 5432/tcp | sed -n 's/.*://p' | head -n 1)"
if [[ ! "$port" =~ ^[0-9]+$ ]]; then
  echo "Impossible de déterminer le port PostgreSQL de test." >&2
  exit 1
fi

export NODE_ENV=test
export DATABASE_URL="postgresql://goama:goama@127.0.0.1:${port}/goama"
export TEST_DATABASE_URL="$DATABASE_URL"
export FILES_DIR="$test_files_dir"
export JWT_SECRET="secret-de-test"
export TOTP_ENCRYPTION_KEY="$(printf 'a%.0s' {1..64})"
export GROUP_REQUEST_ENCRYPTION_KEY="$(printf 'b%.0s' {1..64})"
export LOGIN_RATE_MAX=1000
export GLOBAL_RATE_MAX=10000
export WS_AUTH_TIMEOUT_MS=2000

echo "Migrations PostgreSQL de test..."
npx prisma migrate deploy
echo "Suite backend isolée..."
npm test
