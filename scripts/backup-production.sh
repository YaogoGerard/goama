#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${GOAMA_ENV_FILE:-$ROOT_DIR/.env}"
BACKUP_DIR="${GOAMA_BACKUP_DIR:-$ROOT_DIR/backups}"
RECIPIENT="${AGE_RECIPIENT:-}"

[[ -r "$ENV_FILE" ]] || { echo "Fichier d'environnement absent : $ENV_FILE" >&2; exit 1; }
[[ -n "$RECIPIENT" ]] || { echo "Définir AGE_RECIPIENT (clé publique age)" >&2; exit 1; }
command -v age >/dev/null || { echo "age est requis pour chiffrer les sauvegardes" >&2; exit 1; }
command -v docker >/dev/null || { echo "docker est requis" >&2; exit 1; }

cd "$ROOT_DIR"
COMPOSE=(docker compose --env-file "$ENV_FILE")
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DB_BACKUP="$BACKUP_DIR/goama-$STAMP.postgres.dump.age"
MEDIA_BACKUP="$BACKUP_DIR/goama-$STAMP.media.tar.gz.age"
MANIFEST="$BACKUP_DIR/goama-$STAMP.manifest.txt"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Sauvegarde PostgreSQL chiffrée…"
"${COMPOSE[@]}" exec -T db sh -ec 'pg_dump --format=custom --no-owner --username="$POSTGRES_USER" "$POSTGRES_DB"' \
  | age --encrypt --recipient "$RECIPIENT" --output "$DB_BACKUP"

echo "Sauvegarde des médias chiffrés…"
"${COMPOSE[@]}" exec -T api sh -ec 'tar -C /data -czf - files' \
  | age --encrypt --recipient "$RECIPIENT" --output "$MEDIA_BACKUP"

{
  echo "goama_backup_version=1"
  echo "created_at_utc=$STAMP"
  echo "git_commit=$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "postgres_archive=$(basename "$DB_BACKUP")"
  echo "media_archive=$(basename "$MEDIA_BACKUP")"
  echo "encryption=age"
  echo "note=Secrets sauvegardés séparément dans le coffre institutionnel, jamais dans cette archive."
} > "$MANIFEST"

(cd "$BACKUP_DIR" && sha256sum "$(basename "$DB_BACKUP")" "$(basename "$MEDIA_BACKUP")" "$(basename "$MANIFEST")" > "$(basename "$MANIFEST").sha256")
chmod 600 "$DB_BACKUP" "$MEDIA_BACKUP" "$MANIFEST" "$MANIFEST.sha256"
echo "Sauvegarde terminée : $DB_BACKUP, $MEDIA_BACKUP"
echo "Copier les archives et leurs sommes de contrôle sur un stockage externe immuable."
