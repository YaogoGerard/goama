#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE="$ROOT_DIR/backend/.env"

if [ "$#" -gt 1 ]; then
  echo "Usage: $0 [matricule]" >&2
  exit 2
fi

matricule=${1:-${ADMIN_MATRICULE:-ADMIN001}}
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
  grep -vE '^(ADMIN_MATRICULE|ADMIN_PASSWORD|DEMO_AUTH_BYPASS_TOTP|DEMO_ADMIN_MATRICULE)=' "$ENV_FILE" > "$tmp_file" || true
  printf 'ADMIN_MATRICULE=%s\nADMIN_PASSWORD=%s\n' "$matricule" "$mot_de_passe" >> "$tmp_file"
  printf 'DEMO_AUTH_BYPASS_TOTP=false\nDEMO_ADMIN_MATRICULE=%s\n' "$matricule" >> "$tmp_file"
  umask 077
  mv "$tmp_file" "$ENV_FILE"
else
  umask 077
  jwt_secret=$(openssl rand -hex 32)
  {
    printf 'JWT_SECRET=%s\n' "$jwt_secret"
    printf 'ADMIN_MATRICULE=%s\n' "$matricule"
    printf 'ADMIN_PASSWORD=%s\n' "$mot_de_passe"
    printf 'DEMO_AUTH_BYPASS_TOTP=false\n'
    printf 'DEMO_ADMIN_MATRICULE=%s\n' "$matricule"
  } > "$ENV_FILE"
fi

cd "$ROOT_DIR"
docker compose up -d --build

echo "Administrateur configuré : $matricule"
echo "Le secret TOTP initial est disponible dans les logs de l'API :"
echo "  docker compose logs api"
