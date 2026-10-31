<p align="center">
  <img src="docs/design/logo.png" alt="Logo Goama" width="180">
</p>

<h1 align="center">Goama</h1>

[![Vue.js](https://img.shields.io/badge/Vue.js-3-42b883?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169e1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ed?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![Tailwind CSS](https://img.shields.io/badge/Admin-Tailwind_CSS-06b6d4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![OpenMLS](https://img.shields.io/badge/E2EE-OpenMLS%20%2F%20WASM-7b42bc?logo=rust&logoColor=white)](https://openmls.tech/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](backend/LICENSE)

**Goama** est un prototype de messagerie administrative souveraine pour le
Hackathon 226 — édition 2026. Le projet fournit une API, une interface web et
un espace d’administration déployables sur une infrastructure maîtrisée.

> **Statut : prototype de sprint.** Les fonctions de chiffrement de bout en
> bout et de messagerie complète doivent encore être intégrées et validées
> avant toute présentation comme solution conforme au socle de sécurité.

## Architecture

```text
┌──────────────┐     ┌──────────────┐
│ Web :3000    │     │ Admin :5173  │
│ Vue 3 +      │     │ Vue 3 +      │
│ OpenMLS/WASM │     │ Tailwind CSS │
│ Nginx        │     │ Nginx        │
└──────┬───────┘     └──────┬───────┘
       └──────────────┬─────┘
                      │ /api
               ┌──────▼──────┐
               │ API :8080   │
               │ Fastify     │
               └──────┬──────┘
                      │
               ┌──────▼──────┐
               │ PostgreSQL  │
               └─────────────┘
```

La stack complète est orchestrée par [`docker-compose.yml`](docker-compose.yml).
Les services web et admin restent séparés ; le frontend public `web/` n’est pas
modifié par la refonte de l’administration.

## Fonctionnalités actuelles

- authentification administrateur avec mot de passe et TOTP ;
- protocole E2EE retenu : MLS via OpenMLS compilé en WebAssembly côté client
  (intégration à finaliser) ;
- rôles, pré-inscription et suspension/révocation d’agents ;
- journal d’audit et suivi des retraits ;
- interface d’administration responsive avec thème clair/sombre ;
- bootstrap automatique du premier administrateur au démarrage de l’API ;
- déploiement local reproductible avec Docker Compose ;
- tests backend et tests de l’interface admin.

## Prérequis

- Docker et Docker Compose ;
- Git ;
- OpenSSL, pour générer la clé JWT locale.

## Lancer le projet

Depuis la racine :

```bash
openssl rand -hex 32 | sed 's/^/JWT_SECRET=/' > backend/.env
docker compose up -d --build
```

Adresses locales :

| Service | Adresse |
|---|---|
| Application web | http://localhost:3000 |
| Administration | http://localhost:5173 |
| API | http://localhost:8080 |
| PostgreSQL | localhost:5432 |

Au premier démarrage, l’API applique les migrations et crée un administrateur
si aucun compte administrateur n’existe. Les valeurs peuvent être personnalisées
dans `backend/.env` :

```env
ADMIN_MATRICULE=ADMIN001
ADMIN_PASSWORD=changez-ce-mot-de-passe
```

Le secret TOTP initial est affiché une seule fois dans les logs :

```bash
docker compose logs api
```

Arrêter la stack sans supprimer les volumes :

```bash
docker compose down
```

## Développement et validation

```bash
cd backend && npm ci && npm run typecheck && npm test
cd ../admin && npm ci && npm run build && npm run test:e2e
cd ../web && npm ci && npm run build
```

## Technologies et licences

| Composant | Technologie | Licence |
|---|---|---|
| API | Node.js, TypeScript, Fastify | MIT |
| Données | PostgreSQL, Prisma | PostgreSQL License / Apache 2.0 |
| Interface web | Vue 3, Vite, TypeScript | MIT |
| Interface admin | Vue 3, Vite, Tailwind CSS | MIT |
| Chiffrement E2E cible | OpenMLS, MLS/RFC 9420, WebAssembly | MIT / Apache-2.0 |
| Conteneurs | Docker Compose, Nginx | Apache 2.0 / BSD-2-Clause |

Les licences et notices des dépendances transitives doivent être vérifiées
avant le dépôt final. La licence du prototype est disponible dans
[`backend/LICENSE`](backend/LICENSE).

## Documentation

- [Fondations et méthode](docs/00_foundation_engineering_mindset.md)
- [Exigences produit](docs/01_requirements_prd.md)
- [Exigences système](docs/02_requirements_srs.md)
- [Garanties et invariants](docs/03_design_contract_invariants.md)
- [Décisions d’architecture](docs/06_architecture_decisions.md)
- [Tests d’acceptation](docs/07_acceptance_tests.md)
- [Contrat API](docs/08_interfaces_api.md)
- [Modèle de données](docs/09_data_model.md)

## Limites connues

Le prototype ne doit pas être présenté comme une messagerie souveraine complète
tant que le protocole de chiffrement de bout en bout éprouvé, les conversations,
les groupes et les fichiers chiffrés ne sont pas intégrés et démontrés. Les
données et comptes utilisés pour les tests sont fictifs.
