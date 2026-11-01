#!/bin/sh
set -eu

npx prisma migrate deploy
node /app/dist/bootstrap-admin.js

echo ""
echo "Goama est disponible :"
echo "  Web   : ${PUBLIC_WEB_URL:-http://localhost:3000}"
echo "  Admin : ${PUBLIC_ADMIN_URL:-http://localhost:5173}"
echo "  API   : ${PUBLIC_API_URL:-http://localhost:8080}"
if [ "${NODE_ENV:-development}" != "production" ]; then
  echo ""
  echo "Compte administrateur configuré : ${ADMIN_MATRICULE}"
fi
echo ""

exec "$@"
