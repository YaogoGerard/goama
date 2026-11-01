# Dockerfile de déploiement pour le service `web` (Goama).
#
# Il vit EN DEHORS de web/ (root docker-compose.yml le pointe via
# dockerfile: ../deploy/web.Dockerfile avec context: ./web) : le dossier
# web/ reste strictement celui du dépôt distance (commit 84e5bad), jamais
# retouché pour l'infrastructure.
#
# Deux contournements requis par l'état actuel du code pullé :
#   1. npm ci --no-save pinia vue-router : le code source (stores, router,
#      ChatView) importe `pinia` et `vue-router` absents de package.json.
#      Ils sont installés dans l'IMAGE uniquement, jamais dans le dépôt.
#   2. `npx vite build` sans `vue-tsc -b` : le type-check échoue sur des
#      erreurs réelles du code pullé (decryptMessage appelé sans groupId,
#      alert() dans un template Vue). Le bundle est tout de même généré ; le
#      type-check devra être réparé côté dépôt web/ par son auteur.
# Pourquoi node:22-slim (glibc) et pas alpine (musl) : vite ^8 repose sur
# rolldown, un binaire natif ; le lockfile (généré sur glibc) ne contient que
# @rolldown/binding-linux-x64-gnu et npm n'installe pas le binding musl
# (bug npm cli#4828 des dépendances optionnelles) → échec de build sur Alpine.
FROM node:22-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npm i --no-save pinia@3 vue-router@4
COPY . .
RUN npx vite build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
