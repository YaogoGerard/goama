#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE="$ROOT_DIR/backend/.env"
COMPOSE_ENV="$ROOT_DIR/.env"

if [ "$#" -gt 1 ]; then
  echo "Usage: $0 [matricule]" >&2
  exit 2
fi

matricule=${1:-${ADMIN_MATRICULE:-ADMIN001}}

# Secrets de démonstration locaux générés automatiquement ; la base n'est
# publiée que sur le réseau Docker interne et les ports HTTP sont liés à localhost.
umask 077
if [ ! -f "$COMPOSE_ENV" ]; then
  postgres_password=$(openssl rand -hex 32)
  {
    printf 'POSTGRES_USER=goama\nPOSTGRES_PASSWORD=%s\nPOSTGRES_DB=goama\n' "$postgres_password"
    printf 'NODE_ENV=development\n'
  } > "$COMPOSE_ENV"
fi
postgres_password=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$COMPOSE_ENV" | tail -n 1)
if [ -z "$postgres_password" ]; then
  postgres_password=$(openssl rand -hex 32)
  printf 'POSTGRES_PASSWORD=%s\n' "$postgres_password" >> "$COMPOSE_ENV"
fi
printf 'Mot de passe administrateur (12 caractères minimum) : '
stty -echo
IFS= read -r mot_de_passe
stty echo
printf '\n'

case "$matricule" in
  *[!A-Za-z0-9_-]*|"") echo "Matricule invalide." >&2; exit 2 ;;
esac

[ "${#mot_de_passe}" -ge 12 ] || {
  echo "Le mot de passe doit contenir au moins 12 caractères." >&2
  exit 2
}

if [ -f "$ENV_FILE" ]; then
  tmp_file=$(mktemp)
  trap 'rm -f "$tmp_file"' EXIT
  grep -vE '^(ADMIN_MATRICULE|ADMIN_PASSWORD|DEMO_AUTH_BYPASS_TOTP|DEMO_ADMIN_MATRICULE|DATABASE_URL|JWT_SECRET|TOTP_ENCRYPTION_KEY)=' "$ENV_FILE" > "$tmp_file" || true
  jwt_secret=$(grep '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2- || true)
  totp_key=$(grep '^TOTP_ENCRYPTION_KEY=' "$ENV_FILE" | cut -d= -f2- || true)
  [ -n "$jwt_secret" ] || jwt_secret=$(openssl rand -hex 32)
  [ -n "$totp_key" ] || totp_key=$(openssl rand -hex 32)
  printf 'JWT_SECRET=%s\nTOTP_ENCRYPTION_KEY=%s\nDATABASE_URL=postgresql://goama:%s@db:5432/goama\n' "$jwt_secret" "$totp_key" "$postgres_password" >> "$tmp_file"
  printf 'ADMIN_MATRICULE=%s\nADMIN_PASSWORD=%s\n' "$matricule" "$mot_de_passe" >> "$tmp_file"
  printf 'DEMO_AUTH_BYPASS_TOTP=false\nDEMO_ADMIN_MATRICULE=%s\n' "$matricule" >> "$tmp_file"
  umask 077
  mv "$tmp_file" "$ENV_FILE"
else
  umask 077
  jwt_secret=$(openssl rand -hex 32)
  totp_key=$(openssl rand -hex 32)
  {
    printf 'JWT_SECRET=%s\nTOTP_ENCRYPTION_KEY=%s\nDATABASE_URL=postgresql://goama:%s@db:5432/goama\n' "$jwt_secret" "$totp_key" "$postgres_password"
    printf 'ADMIN_MATRICULE=%s\n' "$matricule"
    printf 'ADMIN_PASSWORD=%s\n' "$mot_de_passe"
    printf 'DEMO_AUTH_BYPASS_TOTP=false\n'
    printf 'DEMO_ADMIN_MATRICULE=%s\n' "$matricule"
  } > "$ENV_FILE"
fi

cd "$ROOT_DIR"
docker compose up -d --build

echo "Administrateur configuré : $matricule"
echo "Secrets locaux générés dans .env et backend/.env (fichiers ignorés par Git)."
echo "Le secret TOTP initial est disponible dans les logs de l'API :"
echo "  docker compose logs api"
