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

# Mot de passe administrateur lisible (base64url, sans caractères ambigus).
file="$DIR/admin_password"
[ -s "$file" ] || node -e 'const c=require("crypto");process.stdout.write(c.randomBytes(20).toString("base64url"))' > "$file"

# Secret TOTP administrateur en Base32 (A-Z, 2-7, 16 à 64 caractères).
file="$DIR/admin_totp_secret"
[ -s "$file" ] || node -e 'const c=require("crypto");const A="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let s="";for(const x of c.randomBytes(20)) s+=A[x%32];process.stdout.write(s)' > "$file"

# Copie lisible conservée par l'opérateur : le fichier .env à la racine du
# dépôt (non versionné) reflète en permanence les secrets du volume. Les clés
# gérées sont réalignées à chaque démarrage (le volume fait foi : une
# recréation du volume met la copie à jour) ; les clés additionnelles déjà
# présentes sont conservées telles quelles. Aucun secret n'est journalisé.
if [ -n "${ENV_FILE_DIR:-}" ]; then
  DIR="$DIR" ENV_FILE_DIR="$ENV_FILE_DIR" LOCAL_UID="${LOCAL_UID:-1000}" LOCAL_GID="${LOCAL_GID:-1000}" \
  node <<'NODE'
const fs = require("node:fs");
const dir = process.env.DIR;
const cible = `${process.env.ENV_FILE_DIR}/.env`;
const lit = (nom) => fs.readFileSync(`${dir}/${nom}`, "utf8").trim();
const gerees = new Map([
  ["JWT_SECRET", lit("jwt_secret")],
  ["TOTP_ENCRYPTION_KEY", lit("totp_encryption_key")],
  ["GROUP_REQUEST_ENCRYPTION_KEY", lit("group_request_encryption_key")],
  ["POSTGRES_PASSWORD", lit("postgres_password")],
  ["ADMIN_PASSWORD", lit("admin_password")],
  ["ADMIN_TOTP_SECRET", lit("admin_totp_secret")],
  ["ADMIN_MATRICULE", process.env.ADMIN_MATRICULE || "ADMIN001"],
  ["CORS_ORIGIN", process.env.CORS_ORIGIN || "http://localhost:3000,http://localhost:5173"],
  ["PUBLIC_WEB_URL", process.env.PUBLIC_WEB_URL || "http://localhost:3000"],
  ["PUBLIC_ADMIN_URL", process.env.PUBLIC_ADMIN_URL || "http://localhost:5173"],
  ["PUBLIC_API_URL", process.env.PUBLIC_API_URL || "http://localhost:8080"],
]);
const entetes = [
  "# Goama — configuration locale de démonstration.",
  "# Fichier non versionné (ignoré par git, autorisations 600).",
  "# Secrets réalignés sur le volume des secrets à chaque démarrage : le volume fait foi.",
  "# Pour tout régénérer : docker compose down -v && docker compose up --build -d.",
];
const lignes = fs.existsSync(cible) ? fs.readFileSync(cible, "utf8").split("\n") : [];
const cles = new Set([...gerees.keys()]);
const additionnelles = lignes.filter((l) => {
  const m = /^([A-Z0-9_]+)=/.exec(l);
  return m && !cles.has(m[1]);
});
const corps = [...gerees.entries()].map(([k, v]) => `${k}=${v}`);
fs.writeFileSync(cible, `${entetes.join("\n")}\n${additionnelles.length ? additionnelles.join("\n") + "\n" : ""}${corps.join("\n")}\n`, { mode: 0o600 });
fs.chmodSync(cible, 0o600);
try { fs.chownSync(cible, Number(process.env.LOCAL_UID), Number(process.env.LOCAL_GID)); } catch {}
process.stdout.write("Fichier .env réaligné sur le volume des secrets (copie lisible, non versionnée).\n");
NODE
fi

chmod 600 "$DIR"/*
echo "Secrets locaux vérifiés (générés au premier démarrage, persistés dans le volume)."
