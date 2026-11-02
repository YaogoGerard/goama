# Inventaire des technologies open source et licences

Les licences ci-dessous correspondent aux licences amont des projets référencés. Les dépendances directes sont figées dans les fichiers `package-lock.json`. Vodozemac est une cible de mise à niveau documentée, non une dépendance présente dans cette version. Les licences transitives doivent être extraites des lockfiles avec un outil de génération SBOM avant une diffusion de production.

| Technologie / composant direct | Usage dans Goama | Licence amont | Projet officiel |
|---|---|---|---|
| Vue.js 3 | Interfaces web | MIT | https://github.com/vuejs/core |
| Vue Router | Routage client | MIT | https://github.com/vuejs/router |
| Pinia | État client | MIT | https://github.com/vuejs/pinia |
| TypeScript | Langage et vérification | Apache-2.0 | https://github.com/microsoft/TypeScript |
| Vite | Construction frontend | MIT | https://github.com/vitejs/vite |
| Vue TSC / Vue TSConfig | Vérification Vue et configuration TS | MIT | https://github.com/vuejs/language-tools |
| Tailwind CSS | Styles des interfaces | MIT | https://github.com/tailwindlabs/tailwindcss |
| @tailwindcss/vite | Intégration Tailwind/Vite | MIT | https://github.com/tailwindlabs/tailwindcss |
| Fastify | API HTTP | MIT | https://github.com/fastify/fastify |
| @fastify/cors | Politique CORS | MIT | https://github.com/fastify/fastify-cors |
| @fastify/jwt | Authentification JWT | MIT | https://github.com/fastify/fastify-jwt |
| @fastify/multipart | Réception de fichiers | MIT | https://github.com/fastify/fastify-multipart |
| @fastify/rate-limit | Limitation de débit | MIT | https://github.com/fastify/fastify-rate-limit |
| @fastify/websocket | WebSocket | MIT | https://github.com/fastify/fastify-websocket |
| Node.js | Runtime serveur | MIT | https://github.com/nodejs/node |
| Zod | Validation des données | MIT | https://github.com/colinhacks/zod |
| OTPAuth | Génération / validation TOTP | MIT | https://github.com/hectorm/otpauth |
| dotenv | Chargement des variables d’environnement | BSD-2-Clause | https://github.com/motdotla/dotenv |
| ws | WebSocket côté serveur | MIT | https://github.com/websockets/ws |
| Prisma ORM / Client / adapter-pg | Accès PostgreSQL et migrations | Apache-2.0 | https://github.com/prisma/prisma |
| PostgreSQL | Base de données | PostgreSQL License | https://www.postgresql.org/ |
| Matrix libolm 3.2.15 | Primitives locales Megolm actuellement utilisées ; projet déprécié | Apache-2.0 | https://gitlab.matrix.org/matrix-org/olm |
| Matrix Vodozemac | Implémentation Rust recommandée d'Olm/Megolm ; non intégrée directement | Apache-2.0 | https://github.com/matrix-org/vodozemac |
| `@matrix-org/matrix-sdk-crypto-wasm` | Binding WASM officiel de `matrix-sdk-crypto` / `OlmMachine`, cible de migration Web ; non intégré | Apache-2.0 | https://matrix-org.github.io/matrix-sdk-crypto-wasm/ |
| Web Crypto API | AES-GCM côté navigateur | API de plateforme web (pas un paquet tiers) | https://developer.mozilla.org/docs/Web/API/Web_Crypto_API |
| qrcode | Génération de QR code | MIT | https://github.com/soldair/node-qrcode |
| Nginx | Serveur statique / reverse proxy | BSD-2-Clause | https://nginx.org/ |
| Docker Compose | Orchestration locale | Apache-2.0 | https://github.com/docker/compose |
| Playwright | Tests navigateur | Apache-2.0 | https://github.com/microsoft/playwright |
| Vitest | Tests unitaires et d’intégration | MIT | https://github.com/vitest-dev/vitest |
| Vue Test Utils | Tests composants Vue | MIT | https://github.com/vuejs/test-utils |
| happy-dom | DOM simulé pour les tests | MIT | https://github.com/capricorn86/happy-dom |
| PostCSS / Autoprefixer | Traitement CSS | MIT | https://github.com/postcss/postcss |

Le code original Goama est distribué sous licence **MIT** ; le texte intégral figure dans `LICENSE` à la racine. Les composants tiers conservent leurs propres licences et notices. Cette liste couvre les technologies et dépendances directes identifiées dans les manifestes ; elle ne remplace pas un inventaire juridique exhaustif des dépendances transitives et des images de conteneurs.
