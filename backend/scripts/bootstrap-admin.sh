#!/bin/sh
set -eu

if [ -z "${ADMIN_MATRICULE:-}" ] || [ -z "${ADMIN_PASSWORD:-}" ]; then
  echo "ADMIN_MATRICULE and ADMIN_PASSWORD must be set" >&2
  exit 1
fi

exec node /app/dist/bootstrap-admin.js
