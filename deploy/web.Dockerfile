# Dockerfile de déploiement pour le service `web` (Goama).
#
# Il vit EN DEHORS de web/ (root docker-compose.yml le pointe via
# dockerfile: ../deploy/web.Dockerfile avec context: ./web) : le dossier
# web/ reste strictement celui du dépôt distance (commit 84e5bad), jamais
# retouché pour l'infrastructure.
#
# Le frontend déclare toutes ses dépendances dans package.json :
# l'image utilise donc uniquement le lockfile versionné et le build complet.
# Pourquoi node:22-slim (glibc) et pas alpine (musl) : vite ^8 repose sur
# rolldown, un binaire natif ; le lockfile (généré sur glibc) ne contient que
# @rolldown/binding-linux-x64-gnu et npm n'installe pas le binding musl
# (bug npm cli#4828 des dépendances optionnelles) → échec de build sur Alpine.
FROM node:22-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-factor 2 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
