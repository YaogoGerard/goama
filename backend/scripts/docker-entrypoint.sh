#!/bin/sh
set -eu

# Les secrets sont montés en lecture seule par Docker sous /run/secrets.
# Aucun secret applicatif n'est généré, écrit dans un volume ou journalisé.
read_secret() {
  name="$1"
  file="/run/secrets/$name"
  if [ ! -s "$file" ]; then
    echo "Secret Docker obligatoire absent ou vide : $name" >&2
    exit 1
  fi
  value=$(cat "$file")
  if [ -z "$value" ]; then
    echo "Secret Docker vide : $name" >&2
    exit 1
  fi
  export "$2=$value"
}

if [ "${NODE_ENV:-production}" = "production" ]; then
  read_secret jwt_secret JWT_SECRET
  read_secret totp_encryption_key TOTP_ENCRYPTION_KEY
  read_secret group_request_encryption_key GROUP_REQUEST_ENCRYPTION_KEY
  read_secret postgres_password POSTGRES_PASSWORD
  read_secret admin_password ADMIN_PASSWORD
  read_secret admin_totp_secret ADMIN_TOTP_SECRET

  : "${ADMIN_MATRICULE:?ADMIN_MATRICULE doit être fourni}"
  : "${TRUST_PROXY:?TRUST_PROXY doit être fourni (IP/CIDR)}"
  : "${CORS_ORIGIN:?CORS_ORIGIN doit être fourni}"
  : "${POSTGRES_USER:?POSTGRES_USER doit être fourni}"
  : "${POSTGRES_DB:?POSTGRES_DB doit être fourni}"

  # Encoder les caractères réservés du mot de passe dans l'URI PostgreSQL.
  DATABASE_PASSWORD_ENCODED=$(node -e 'process.stdout.write(encodeURIComponent(process.env.POSTGRES_PASSWORD))')
  export DATABASE_URL="postgresql://${POSTGRES_USER}:${DATABASE_PASSWORD_ENCODED}@db:5432/${POSTGRES_DB}"
fi

npx prisma migrate deploy
node dist/bootstrap-accounts.js
exec "$@"
