#!/bin/sh
set -eu

# 1. Schéma de base à jour.
npx prisma migrate deploy

# 2. Secrets applicatifs : générés au premier démarrage et persistés dans
# le volume configuré sur /config (réutilisés aux redémarrages). En
# déploiement réel, fournir JWT_SECRET et TOTP_ENCRYPTION_KEY via le
# gestionnaire de secrets : la génération locale est alors ignorée.
SECRETS_DIR=/config
mkdir -p "$SECRETS_DIR"
ensure_secret() {
  var="$1"
  file="$SECRETS_DIR/$var"
  eval "valeur=\"\${$var:-}\""
  if [ -z "$valeur" ]; then
    if [ -f "$file" ]; then
      valeur=$(cat "$file")
    else
      valeur=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
      umask 077
      printf '%s' "$valeur" > "$file"
    fi
    eval "export $var=\"\$valeur\""
  fi
}
ensure_secret JWT_SECRET
ensure_secret TOTP_ENCRYPTION_KEY

# 3. Comptes d'amorçage (administrateur + agents de démonstration) et
#    affichage des identifiants de connexion dans les journaux.
node dist/bootstrap-accounts.js

exec "$@"
