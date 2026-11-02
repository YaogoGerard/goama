<div align="center">

<img src="docs/design/logo_removedbg.png" alt="Goama" width="200"/>

# Goama

**Messagerie souveraine et chiffrée de bout en bout pour l'administration publique**

*Le serveur relaye, il ne lit jamais.*

[![License: MIT](https://img.shields.io/badge/Licence-MIT-1a1a1e?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vue.js](https://img.shields.io/badge/Vue.js-3-4FC08D?style=flat-square&logo=vue.js&logoColor=white)](https://vuejs.org)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?style=flat-square&logo=fastify&logoColor=white)](https://fastify.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io)
[![Docker Compose](https://img.shields.io/badge/Deployment-Docker%20Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docs.docker.com/compose/)

[![E2EE: Olm + Megolm](https://img.shields.io/badge/E2EE-Olm%20%2B%20Megolm%20(WASM)-ef6c20?style=flat-square)](https://gitlab.matrix.org/matrix-org/olm)
[![Souveraineté: auto-hébergé](https://img.shields.io/badge/Souverainet%C3%A9-auto%2Dh%C3%A9berg%C3%A9-1a1a52?style=flat-square)](docs/NOTE_SECURITE.md)

</div>

---

**Équipe projet :** Codalchemists — Burkina Institute of Technology, Koudougou
**Dépôt :** https://github.com/YaogoGerard/goama

Goama est une messagerie web destinée aux échanges professionnels des agents publics du Burkina Faso : conversations individuelles et de groupe, partage de fichiers chiffrés, enrôlement institutionnel, authentification multifacteur, rôles et révocation. Le projet est conçu pour être auto-hébergé, sans service SaaS indispensable : l'État conserve la maîtrise de ses données et de son infrastructure.

## Principe de conception

Le serveur est un **relais aveugle** : il authentifie les agents, applique les règles institutionnelles et relaye uniquement des enveloppes chiffrées. Il ne détient aucune clé de conversation : l'Administrateur ne peut pas lire les messages, y compris dans un groupe dont il gère la vie institutionnelle. Il ne conserve que les métadonnées documentées dans les documents d'architecture et de sécurité.

Le chiffrement de groupe repose sur **Olm + Megolm** (via libolm en WebAssembly côté navigateur) : Megolm chiffre les messages du groupe, Olm transporte individuellement chaque clé de session vers un autre membre, sur un canal authentifié et vérifié par signatures Ed25519. Les pièces jointes sont chiffrées côté client (AES-GCM via Web Crypto) avec la clé transmise dans le flux Megolm. Le périmètre cryptographique est strictement **mono-appareil** : une seule session active par agent ; le multi-appareil est hors périmètre actuel.

## Architecture

- **Client agent (`web/`)** : Vue 3, TypeScript, Vite ; Megolm/Olm en WebAssembly, IndexedDB chiffrée localement.
- **Console d'administration (`admin/`)** : Vue 3 ; pré-inscription, enrôlement, révocation, journal d'audit.
- **API (`backend/`)** : Node.js, Fastify 5, TypeScript, Prisma 7 ; authentification 2FA, sessions uniques, habilitations et parrainage, relais de messages, WebSockets.
- **Données :** PostgreSQL 17 ; stockage d'enveloppes opaques (aucun clair en base).
- **Déploiement :** Docker Compose, Nginx en terminaison statique et proxy `/api`.

## Déploiement

Goama ne crée **aucun compte de démonstration** et ne génère aucun secret de production au démarrage. Le déploiement nécessite Docker Engine + Compose v2, un domaine HTTPS, une liste explicite des reverse proxies de confiance, et des fichiers de secrets préparés hors du dépôt. La procédure complète et le modèle de configuration sont décrits dans [`docs/DEPLOIEMENT_SECURITE.md`](docs/DEPLOIEMENT_SECURITE.md).

```bash
git clone https://github.com/YaogoGerard/goama.git
cd goama
# Préparer les fichiers secrets et .env selon docs/DEPLOIEMENT_SECURITE.md
docker compose --env-file .env config -q
docker compose --env-file .env up --build -d
```

Le premier démarrage applique les migrations et provisionne un unique administrateur à partir d'un matricule et de secrets explicitement fournis. Les identifiants et secrets ne sont jamais écrits dans les journaux. Les ports sont liés à la boucle locale par défaut ; placez un reverse proxy TLS correctement configuré devant la stack.

| Service (à adapter au domaine configuré) | URL locale par défaut |
|---|---|
| Messagerie agent | http://localhost:3000 |
| Administration | http://localhost:5173 |
| API | http://localhost:8080 (`/healthz`) |

Arrêt de la stack : `docker compose --env-file .env down` (données conservées). Ne supprimez pas les volumes PostgreSQL ou médias pour une mise à jour ordinaire.

## Vérification

```bash
cd backend && npm ci && npm run typecheck && npm run test:isolated
cd ../admin && npm ci && npm run build && npm run test:e2e
cd ../web && npm ci && npm run build && npm run test:e2e
```

- Tests backend : contrôle d'accès (JWT court, renouvellement cookie HttpOnly, 2FA, verrouillage, révocation immédiate, session unique, parrainage), stockage opaque, enveloppes Megolm/Olm, signatures Ed25519, chiffrement au repos.
- Tests admin : parcours d'interface (vitest/happy-dom) et tests de fumée Playwright contre la stack Docker (`npm run test:smoke`).
- Tests web : parcours d'interface, publication de clés Olm et absence de texte en clair (Playwright).
- CI : le workflow `Validation Goama` relance automatiquement ces vérifications sur chaque push et chaque pull request.

## Sécurité

- Agent enrôlé uniquement, authentification à deux facteurs (secret + TOTP), verrouillage après échecs, session unique par agent ; révocation immédiate : sessions, WebSockets (code 4003), pré-clés et génération de groupe invalidés en une opération auditée.
- Secrets TOTP chiffrés au repos (AES-256-GCM, clé dédiée et séparée du secret JWT) ; jamais de clé Megolm brute ni de clé privée côté serveur.
- Limites connues : identités épinglées en TOFU (vérification institutionnelle hors bande encore requise) et protocole crypto non audité indépendamment. Les événements WebSocket, la présence et les compteurs de débit sont maintenant partagés via PostgreSQL entre instances, mais doivent encore passer des tests d'intégration sous charge et en cas de partition réseau. Les reçus applicatifs de distribution Megolm suivent chaque destinataire et chaque epoch, mais ne constituent pas à eux seuls une preuve cryptographique indépendante. Sauvegarde/restauration et revue cryptographique restent des prérequis avant toute donnée administrative réelle. Pour les règles de déploiement : `docs/NOTE_SECURITE.md` et `docs/DEPLOIEMENT_SECURITE.md`.

## Documentation

- `docs/` — corpus d'ingénierie numéroté 00 à 10 : fondation, exigences produit, SRS, invariants, modélisation C4/UML, décisions d'architecture (ADRs), tests d'acceptation, interfaces API, modèle de données, convention du dépôt.
- `docs/13_protocole_olm_megolm.md` — détail du protocole retenu (publication de clés, distribution, rotation, limites).
- `docs/NOTE_SECURITE.md` — règles de déploiement et limites cryptographiques.
- `docs/TECHNOLOGIES_LICENCES.md` — inventaire des technologies et licences.

## Licence

Code projet sous licence **MIT** (`LICENSE`). Les technologies tierces et leurs licences sont répertoriées dans `docs/TECHNOLOGIES_LICENCES.md`.
