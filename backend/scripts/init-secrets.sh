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

chmod 600 "$DIR"/*
echo "Secrets locaux vérifiés (générés au premier démarrage, persistés dans le volume)."
