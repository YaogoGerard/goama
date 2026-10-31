# Image multi-étapes : le build compile TypeScript, l'image finale est légère.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY package.json ./
EXPOSE 8080
# Migrations au démarrage (REQ-OPS-001), puis l'API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
