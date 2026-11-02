#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${GOAMA_ENV_FILE:-$ROOT_DIR/.env}"
BACKUP_DIR="${1:-}"
IDENTITY="${AGE_IDENTITY_FILE:-}"

[[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR" ]] || { echo "Usage: $0 <dossier-de-sauvegarde> --confirm" >&2; exit 2; }
[[ "${2:-}" == "--confirm" ]] || { echo "Restauration destructive : relancer avec --confirm après avoir isolé la cible et sauvegardé son état actuel." >&2; exit 2; }
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"
[[ -r "$ENV_FILE" ]] || { echo "Fichier d'environnement absent : $ENV_FILE" >&2; exit 1; }
[[ -r "$IDENTITY" ]] || { echo "Définir AGE_IDENTITY_FILE vers la clé privée age autorisée" >&2; exit 1; }
command -v age >/dev/null || { echo "age est requis" >&2; exit 1; }

MANIFEST="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'goama-*.manifest.txt' -print | sort | tail -n 1)"
[[ -n "$MANIFEST" && -r "$MANIFEST.sha256" ]] || { echo "Manifest ou sommes de contrôle introuvables dans $BACKUP_DIR" >&2; exit 1; }
DB_NAME="$(sed -n 's/^postgres_archive=//p' "$MANIFEST")"
MEDIA_NAME="$(sed -n 's/^media_archive=//p' "$MANIFEST")"
[[ "$DB_NAME" =~ ^goama-[0-9]{8}T[0-9]{6}Z\.postgres\.dump\.age$ ]] || { echo "Nom d'archive PostgreSQL invalide dans le manifest" >&2; exit 1; }
[[ "$MEDIA_NAME" =~ ^goama-[0-9]{8}T[0-9]{6}Z\.media\.tar\.gz\.age$ ]] || { echo "Nom d'archive média invalide dans le manifest" >&2; exit 1; }
DB_ARCHIVE="$BACKUP_DIR/$DB_NAME"
MEDIA_ARCHIVE="$BACKUP_DIR/$MEDIA_NAME"
[[ -r "$DB_ARCHIVE" && -r "$MEDIA_ARCHIVE" ]] || { echo "Une archive déclarée dans le manifest est absente" >&2; exit 1; }
(cd "$BACKUP_DIR" && sha256sum --check "$(basename "$MANIFEST").sha256")

cd "$ROOT_DIR"
COMPOSE=(docker compose --env-file "$ENV_FILE")
echo "ATTENTION : la base PostgreSQL et le volume médias cibles vont être remplacés."
echo "Vérifiez que cette stack est isolée et que son état actuel est sauvegardé."

"${COMPOSE[@]}" exec -T db sh -ec '
  case "$POSTGRES_DB" in ""|*[!A-Za-z0-9_]*) echo "POSTGRES_DB invalide pour une restauration" >&2; exit 1;; esac
  psql --set=ON_ERROR_STOP=1 --username="$POSTGRES_USER" --dbname=postgres \
    --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '\''$POSTGRES_DB'\'' AND pid <> pg_backend_pid()" \
    --command="DROP DATABASE IF EXISTS \"$POSTGRES_DB\"" \
    --command="CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\""
  pg_restore --no-owner --exit-on-error --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"
' \
  < <(age --decrypt --identity "$IDENTITY" "$DB_ARCHIVE")

age --decrypt --identity "$IDENTITY" "$MEDIA_ARCHIVE" \
  | "${COMPOSE[@]}" exec -T api sh -ec 'mkdir -p /data/files && find /data/files -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar -xzf - -C /data'

echo "Restauration terminée. Vérifier /readyz, les références média, les secrets et le parcours TOTP avant réouverture du trafic."
