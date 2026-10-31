# 10 — Structure du projet Goama

**Version :** 0.1  
**Date :** 31 octobre 2026  
**Statut :** Indicatif — peut évoluer au cours du développement

## 1. Objectif

L'objectif est de garder `web/`, `admin/` et `backend/` **aussi indépendants que possible**.

L'idée n'est pas de figer une arborescence à tout prix, mais d'avoir un point de départ simple, lisible et facilement séparable si besoin.

## 2. Structure retenue

```text
goama/
├── web/              # Client agent (Vue 3 + Vite + OpenMLS en WebAssembly)
├── admin/            # Tableau de bord Administrateur (Vue 3 + Vite)
├── backend/          # API REST + WebSocket (Fastify, monolithe modulaire)
├── docs/             # Documentation du projet
├── docker-compose.yml
├── .env.example
└── README.md
```

## 3. Principes directeurs

- **Autonomie** : Chacun des trois dossiers doit pouvoir être copié seul, installé et lancé sans dépendre directement du code des autres.
- **API-first** : Le contrat entre front et back passe uniquement par HTTP. On ne partage **pas** de dossier `shared/` commun.
- **Monolithe modulaire côté backend** : `backend/` reste un monolithe modulaire par domaine (`auth`, `groups`, `messages`, `admin`, etc.), conformément à `docs/02_requirements_srs.md` (C-12).
- **Chiffrement côté client** : Toute la logique OpenMLS, l'état MLS et le stockage local chiffré restent dans `web/`. `admin/` n'y touche en aucun cas.
- **Déploiement unifié** : `docker-compose.yml` à la racine doit permettre de tout lancer avec `docker compose up -d` (`REQ-OPS-001`).

## 4. Organisation interne

### `backend/`

```text
backend/src/
├── modules/   # Découpage par domaine métier
├── plugins/   # Plugins Fastify (auth, rate-limit, erreurs)
├── middlewares/# Middlewares
├── jobs/      # Tâches asynchrones BullMQ
├── ws/        # WebSocket
├── db/        # Connexion PostgreSQL + migrations
└── server.ts  / app.ts
```

### `web/`

```text
web/src/
├── views/     # Pages
├── components/# Composants Vue
├── stores/    # Pinia
├── services/  # Appels API / WebSocket
├── crypto/    # Wrapper OpenMLS WASM
├── db/        # IndexedDB chiffré
└── types/     # Types générés depuis l'API
```

### `admin/`

```text
admin/src/
├── views/     # Pages du tableau de bord
├── components/# Composants Vue
├── stores/    # Pinia
├── services/  # Appels API vers /admin
└── types/     # Types générés depuis l'API
```

## 5. Typage via OpenAPI

Plutôt que de partager du code, on utilise le contrat OpenAPI du backend.

1. **Côté `backend/`** : Utiliser `@fastify/swagger` pour exposer la spécification OpenAPI. 
2. **Côté `web/` et `admin/`** : Utiliser [`openapi-typescript`](https://github.com/drwpow/openapi-typescript) pour générer leurs propres types à partir de `http://localhost:8080/documentation/json`.
3. **Fichier généré** : `web/src/types/api.ts` et `admin/src/types/api.ts`. 

Ces fichiers sont propres à chaque front. Ils peuvent être **commités** pour faciliter le build sans avoir obligatoirement le backend lancé.

## 6. Remarques

- **Évolutif** : Cette structure est pensée pour le sprint. Si le besoin se fait sentir, elle peut être ajustée sans impacter les garanties de la documentation.
- **Indépendance avant factorisation** : Mieux vaut dupliquer un petit type plutôt que de créer un couplage entre les dossiers.
- **Pragmatique** : L'objectif est avant tout de coller à la stack définie dans `docs/02_requirements_srs.md` et de pouvoir démontrer le projet dans de bonnes conditions.