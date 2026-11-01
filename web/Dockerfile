# Étape de build sur glibc (Debian) : vite ^8 s'appuie sur rolldown, un binaire
# natif. Le lockfile contient le binding linux-x64-gnu ; Alpine (musl) n'aurait
# pas le sien à cause du bug npm #4828 sur les dépendances optionnelles.
FROM node:22-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
