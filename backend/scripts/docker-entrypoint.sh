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
  echo "Compte administrateur de développement :"
  echo "  Matricule    : ${ADMIN_MATRICULE}"
  echo "  Mot de passe : ${ADMIN_PASSWORD}"
  if [ "${DEMO_AUTH_BYPASS_TOTP:-false}" = "true" ]; then
    echo "  Code TOTP    : 000000 (mode démo)"
  else
    echo "  TOTP         : requis — voir le secret dans les logs du premier bootstrap"
  fi
fi
echo ""

exec "$@"
