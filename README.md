# Goama — messagerie souveraine de l'administration

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

## Installation locale

Prérequis : Git, Docker Engine avec Docker Compose, et OpenSSL.

```bash
git clone https://github.com/YaogoGerard/goama.git
cd goama
./setup.sh
```

Le script demande le matricule et le mot de passe de l'administrateur initial, génère des secrets locaux (PostgreSQL, `JWT_SECRET`, clé dédiée de chiffrement des secrets TOTP), lance les services et applique les migrations. Les fichiers `.env` ne sont jamais committés et sont créés avec des permissions restrictives. Les ports applicatifs sont liés en `127.0.0.1` par défaut ; PostgreSQL n'est pas publié sur l'hôte.

- Messagerie agent : http://localhost:3000
- Administration : http://localhost:5173
- API : http://localhost:8080 (`/healthz`)

Le secret TOTP de l'administrateur initial est affiché dans les journaux : `docker compose logs api`. Comptes et données de démonstration sont strictement fictifs.

## Vérification

```bash
cd backend && npm ci && npm run typecheck && npm test
cd ../admin && npm ci && npm run build && npm run test:e2e
cd ../web && npm ci && npm run build && npm run test:e2e
```

- Tests backend : contrôle d'accès (JWT, 2FA, verrouillage, révocation immédiate, session unique, parrainage), stockage opaque de contenus, enveloppes Megolm/Olm, signatures Ed25519, chiffrement au repos du TOTP.
- Tests admin : parcours d'interface (vitest/happy-dom) et tests de fumée Playwright contre la stack Docker (`npm run test:smoke`).
- Tests web : parcours d'interface, publication de clés Olm et absence de texte en clair (Playwright).

## Sécurité

- Agent enrôlé uniquement, authentification à deux facteurs (secret + TOTP), verrouillage après échecs, session unique par agent ; révocation immédiate : sessions, WebSockets (code 4003), pré-clés et génération de groupe invalidés en une opération auditée.
- Secrets TOTP chiffrés au repos (AES-256-GCM, clé dédiée et séparée du secret JWT) ; jamais de clé Megolm brute ni de clé privée côté serveur.
- Limites connues : identités épinglées en TOFU (vérification institutionnelle hors bande à construire), forward secrecy de Megolm partielle (d'où rotation à 100 messages / 7 jours et après tout changement de membres). Pour la liste complète et les règles de déploiement : `docs/NOTE_SECURITE.md`.

## Documentation

- `docs/` — corpus d'ingénierie numéroté 00 à 10 : fondation, exigences produit, SRS, invariants, modélisation C4/UML, décisions d'architecture (ADRs), tests d'acceptation, interfaces API, modèle de données, convention du dépôt.
- `docs/13_protocole_olm_megolm.md` — détail du protocole retenu (publication de clés, distribution, rotation, limites).
- `docs/NOTE_SECURITE.md` — règles de déploiement et limites cryptographiques.
- `docs/TECHNOLOGIES_LICENCES.md` — inventaire des technologies et licences.

## Licence

Code projet sous licence **MIT** (`LICENSE`). Les technologies tierces et leurs licences sont répertoriées dans `docs/TECHNOLOGIES_LICENCES.md`.
