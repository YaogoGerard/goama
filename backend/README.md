# Goama — backend

API Fastify 5 / TypeScript / Prisma 7 / PostgreSQL 17. Le serveur est un relais aveugle : il authentifie les agents, contrôle les rôles et conserve des objets chiffrés sans détenir les clés de conversation.

## Chiffrement de groupe

Le protocole retenu est **Olm + Megolm** (ADR-19, `../docs/06_architecture_decisions.md`). Le backend :

- vérifie les signatures Ed25519 des paquets de clés publiques publiés (`POST /devices/olm-keys`) et las stocke sans clé privée (`KeyPackage.payload`, JSON public) ;
- attribue atomiquement une pré-clé à usage unique par couple émetteur/destinataire (`POST /groupes/:id/olm-keys`), avec réinitialisation administrative auditable (`DELETE /admin/agents/:agentId/olm-keys`) ;
- relaye les enveloppes `megolm_app` et `megolm_key_share` comme contenus opaques, ordonnés par séquence et repérés par génération de groupe (`epoch`) ;

Le serveur ne doit jamais recevoir de clé Megolm brute ni de clé privée Olm. La rotation des sessions Megolm (100 messages / 7 jours, et après tout changement de membres) est pilotée par le client ; les règles sont détaillées dans `../docs/13_protocole_olm_megolm.md`.

## Architecture du serveur

- **Authentification et sessions** : pré-inscription administrative, activation (code à usage unique + TOTP), connexion à deux facteurs, verrouillage après échecs, session unique par agent vérifiée à chaque requête et à chaque socket, révocation immédiate (sessions, WebSockets 4003, pré-clés, génération de groupe) auditée.
- **Groupes** : création selon l'habilitation du poste, demandes de groupe adressées à un parrain habilité (validation/rejet co-signés), membres, retraits et départ.
- **Messages et médias** : enveloppes chiffrées ordonnées, pièces jointes chiffrées (AES-GCM côté client, clé dans le flux Megolm), aucun clair en base.
- **Administration** : annuaire, statistiques, journal d'audit, autorisations d'enrôlement, réinitialisations cryptographiques.

## Installation et commandes

```bash
npm ci
cp .env.example .env       # puis renseigner les secrets (voir .env.example)
npm run db:deploy          # prisma migrate deploy
npm run build
npm test                   # vitest, base PostgreSQL requise
```

À la racine du dépôt, `./setup.sh` génère `backend/.env` automatiquement (secrets PostgreSQL, `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`, compte administrateur initial) et lance la stack complète via Docker Compose.

Descriptions des variables dans `.env.example` ; les secrets sont exclus du dépôt et chiffrés au repos lorsque le serveur en détient (`TOTP_ENCRYPTION_KEY`).

## Tests

`npm test` exécute la suite de contrats sur une base PostgreSQL à la disposition du développeur (voir `tests/setup.ts`) : intrusion/anti-énumération, verrouillage TOTP, révocation immédiate, parrainage et demandes de groupe, stockage opaque, enveloppes Megolm/Olm, signatures Ed25519, chiffrement au repos du TOTP.
