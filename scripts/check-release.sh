#!/bin/sh
# Vérifications avant livraison d'une archive projet Goama.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
errors=0

# Aucun environnement local ni artefact de build ne doit entrer dans l'archive.
if find "$ROOT" -type d \( -name node_modules -o -name dist \) -print -quit | grep -q .; then
  echo "ERREUR: artefact de développement présent (node_modules/dist)." >&2
  errors=1
fi
if find "$ROOT" -type f \( -name '.env' -o -name '.env.*.local' \) ! -name '.env.example' -print -quit | grep -q .; then
  echo "ERREUR: fichier d'environnement local présent dans la livraison." >&2
  errors=1
fi
if [ ! -f "$ROOT/backend/.env.example" ]; then
  echo "ERREUR: backend/.env.example absent." >&2
  errors=1
fi
if [ ! -f "$ROOT/backend/.env" ]; then
  echo "ERREUR: backend/.env absent (généré par ./setup.sh)." >&2
  errors=1
fi

# Documents de référence du dépôt.
for required in LICENSE README.md docs/NOTE_SECURITE.md docs/TECHNOLOGIES_LICENCES.md docs/13_protocole_olm_megolm.md backend/README.md; do
  if [ ! -f "$ROOT/$required" ]; then
    echo "ERREUR: document absent: $required" >&2
    errors=1
  fi
done

if [ "$errors" -ne 0 ]; then exit 1; fi
echo "OK: archive cohérente (aucun .env local, node_modules ou dist; documents de référence présents)."
