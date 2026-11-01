# Image multi-étapes : le build compile TypeScript, l'image finale est légère.
FROM node:22-alpine AS build
WORKDIR /app
ENV DATABASE_URL=postgresql://goama:goama@db:5432/goama
COPY package.json package-lock.json ./
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-factor 2 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm ci --ignore-scripts
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY scripts/docker-entrypoint.sh scripts/bootstrap-admin.sh ./scripts/
COPY package.json ./
RUN chmod 755 ./scripts/docker-entrypoint.sh ./scripts/bootstrap-admin.sh
EXPOSE 8080
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
