# Goama — Backend (sprint pré-hackathon 2026)

Backend de la **messagerie administrative souveraine, chiffrée de bout en bout**
(Hackathon 226 — MTDPCE/DGTD, Burkina Faso). Ce dépôt est la partie serveur : un
**relais aveugle** qui authentifie des agents enrôlés, relaie des blobs chiffrés MLS
et applique l'ordre des messages — **sans jamais pouvoir lire le contenu**.

> 📘 **Lisez [`EXPLICATIONS.md`](EXPLICATIONS.md)** : chaque mécanisme de sécurité
> expliqué, la fiche de préparation aux épreuves du jury et les limites connues.

## Architecture

```
Client Vue 3 + OpenMLS (WASM)  ←→  API Fastify (ce dépôt)  ←→  PostgreSQL
        E2EE côté client               relais aveugle           blobs opaques
```

- **Authentification forte** : pré-inscription par l'Administrateur, code d'activation
  à usage unique (24 h, haché), secret personnel (scrypt) + **TOTP** (RFC 6238).
- **Session unique** : une seule session active par agent ; le JWT pointe vers une
  session vérifiée en base à chaque requête → **révocation immédiate**.
- **Ordre total** : numéro de séquence par groupe attribué en transaction
  (`SELECT … FOR UPDATE`), refus `409` des commits d'epoch périmés.
- **Révocation en deux temps** (ADR-08) : coupure serveur (sessions + WebSocket) puis
  retrait cryptographique MLS émis par les clients.
- **Minimisation** : aucun contenu en clair en base ; pas de nom de groupe côté
  serveur (il voyage chiffré) ; présence en mémoire, jamais stockée.
- **Aucune cryptographie maison** : primitives standard Node.js, `otpauth`,
  `@fastify/jwt`, et **OpenMLS (RFC 9420)** côté client.

## Technologies et licences

| Technologie | Rôle | Licence |
|---|---|---|
| [Node.js 22](https://nodejs.org) | exécution | MIT |
| [Fastify](https://fastify.dev) + `@fastify/jwt`, `@fastify/websocket`, `@fastify/rate-limit`, `@fastify/cors`, `@fastify/multipart` | API, temps réel | MIT |
| [Prisma ORM](https://www.prisma.io) + `@prisma/adapter-pg` | accès données | Apache-2.0 |
| [PostgreSQL 17](https://www.postgresql.org) | base | PostgreSQL License |
| [otpauth](https://github.com/hectorm/otpauth) | TOTP RFC 6238 | MIT |
| [Zod](https://zod.dev) | validation | MIT |
| [ws](https://github.com/websockets/ws) | WebSocket | MIT |
| [TypeScript](https://www.typescriptlang.org), [tsx](https://tsx.is), [Vitest](https://vitest.dev) | outils | Apache-2.0 / MIT |
| [Docker Compose](https://docs.docker.com/compose/) | déploiement souverain | Apache-2.0 |
| [OpenMLS](https://openmls.tech) | E2EE (RFC 9420), **côté client** | MIT / Apache-2.0 |

**Niveau d'engagement : Créer** — application nouvelle reposant sur des bibliothèques
éprouvées (OpenMLS), conformément aux termes de référence du sprint.

## Installation (une commande)

```bash
docker compose up -d          # PostgreSQL + API : hébergement souverain, sans service tiers
docker compose exec api npm run db:seed   # comptes de démonstration fictifs
# (les migrations s'appliquent automatiquement au démarrage)
```

Développement local sans Docker : `npm install`, copier `.env.example` en `.env`,
puis `npm run db:deploy && npm run bootstrap:admin && npm run dev`.

Vérifications : `curl localhost:8080/healthz` · `npm run demo` (flux complet) ·
`npm test` (12 tests de sécurité : DB sans clair, révocation, intrus — bonus §5).

## Structure

```
src/
├── app.ts            # assemblage + gardes de sécurité (requireAuth 3 verrous)
├── config.ts         # env validées Zod          └── server.ts   # démarrage, purge
├── lib/              # scrypt, TOTP, validation Zod, erreurs
├── plugins/          # Prisma (adaptateur pg), journal d'audit
├── auth/             # enrôlement, activation, TOTP, sessions
├── messaging/        # groupes, messages (seq/epoch), WebSocket, KeyPackages
├── agents/           # annuaire, révocation, présence
├── media/            # blobs de fichiers chiffrés
└── jobs/             # purge 30 j / audit 90 j
prisma/               # schéma + migration initiale        tests/  # épreuves du jury en Vitest
```

## Limites (résumé — détail dans EXPLICATIONS.md §10)

- Clés dans le navigateur : protégées (WebCrypto non extractible, CSP stricte), mais
  un script injecté pourrait les *utiliser* — limite du client web, assumée.
- Le serveur voit les métadonnées de graphe (appartenance aux groupes) : nécessaire
  à la livraison, documentée et réduite (présence en mémoire, ids aléatoires).
- Sprint : une instance API (présence en mémoire), fichiers sur volume local,
  BullMQ/Redis/MinIO/Caddy prévus en finale — écarts listés dans EXPLICATIONS.md §9.
- Secrets et comptes du dépôt **100 % fictifs**, pour la démonstration uniquement.
