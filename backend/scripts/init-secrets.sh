#!/bin/sh
# Génération idempotente des secrets applicatifs dans le volume partagé.
# Au premier `docker compose up`, chaque fichier absent est créé avec des
# octets aléatoires ; aux redémarrages, les fichiers existants sont conservés
# pour garantir la stabilité des secrets. Aucun secret n'est journalisé.
set -eu
DIR="${SECRETS_DIR:-/run/goama-secrets}"
mkdir -p "$DIR"

hex32() {
  file="$DIR/$1"
  [ -s "$file" ] && return 0
  node -e 'const c=require("crypto");process.stdout.write(c.randomBytes(32).toString("hex"))' > "$file"
}

hex32 postgres_password
hex32 jwt_secret
hex32 totp_encryption_key
hex32 group_request_encryption_key

# Mot de passe administrateur lisible-typo (base64url, sans caractères ambigus).
file="$DIR/admin_password"
[ -s "$file" ] || node -e 'const c=require("crypto");process.stdout.write(c.randomBytes(20).toString("base64url"))' > "$file"

# Secret TOTP administrateur en Base32 (A-Z, 2-7, 16 à 64 caractères).
file="$DIR/admin_totp_secret"
[ -s "$file" ] || node -e 'const c=require("crypto");const A="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let s="";for(const x of c.randomBytes(20)) s+=A[x%32];process.stdout.write(s)' > "$file"

# Copie lisible conservée par l'opérateur : le fichier .env à la racine du
# dépôt (non versionné) est créé au premier démarrage uniquement. Les
# démarrages suivants le laissent inchangé ; régénérer = réinitialiser les
# volumes (docker compose down -v). Aucun secret n'est journalisé.
if [ -n "${ENV_FILE_DIR:-}" ]; then
  envfile="$ENV_FILE_DIR/.env"
  if [ ! -s "$envfile" ]; then
    {
      echo "# Goama — configuration locale de démonstration, générée au premier démarrage."
      echo "# Fichier non versionné (ignoré par git, autorisations 600)."
      echo "# Pour tout régénérer : docker compose down -v && docker compose up --build -d."
      echo "JWT_SECRET=$(cat "$DIR/jwt_secret")"
      echo "TOTP_ENCRYPTION_KEY=$(cat "$DIR/totp_encryption_key")"
      echo "GROUP_REQUEST_ENCRYPTION_KEY=$(cat "$DIR/group_request_encryption_key")"
      echo "POSTGRES_PASSWORD=$(cat "$DIR/postgres_password")"
      echo "ADMIN_PASSWORD=$(cat "$DIR/admin_password")"
      echo "ADMIN_TOTP_SECRET=$(cat "$DIR/admin_totp_secret")"
      echo "ADMIN_MATRICULE=${ADMIN_MATRICULE:-ADMIN001}"
      echo "CORS_ORIGIN=${CORS_ORIGIN:-http://localhost:3000,http://localhost:5173}"
      echo "PUBLIC_WEB_URL=${PUBLIC_WEB_URL:-http://localhost:3000}"
      echo "PUBLIC_ADMIN_URL=${PUBLIC_ADMIN_URL:-http://localhost:5173}"
      echo "PUBLIC_API_URL=${PUBLIC_API_URL:-http://localhost:8080}"
    } > "$envfile"
    chmod 600 "$envfile"
    chown "${LOCAL_UID:-1000}:${LOCAL_GID:-1000}" "$envfile" 2>/dev/null || true
    echo "Fichier .env créé à la racine du dépôt (identifiants inclus, non versionné)."
  else
    echo "Fichier .env déjà présent à la racine du dépôt : conservé sans changement."
  fi
fi

chmod 600 "$DIR"/*
echo "Secrets locaux vérifiés (générés au premier démarrage, persistés dans le volume)."
