# Le conteneur de Notak : le serveur Node sert l'API, la synchro (/sync) et l'application web construite. Les droits
# sont évalués par OpenFGA, un second conteneur (voir compose.yaml) que désigne NOTAK_OPENFGA_URL.

FROM oven/bun:1.3.12 AS construction
WORKDIR /notak
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY apps/serveur/package.json apps/serveur/
COPY packages/tableau/package.json packages/tableau/
RUN bun install --frozen-lockfile
COPY . .
RUN cd apps/web && bun run build

FROM oven/bun:1.3.12 AS dependances
WORKDIR /notak
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY apps/serveur/package.json apps/serveur/
COPY packages/tableau/package.json packages/tableau/
RUN bun install --frozen-lockfile --production --filter @notak/serveur

FROM node:24-slim
ENV NODE_ENV=production \
    PORT=3005 \
    NOTAK_DONNEES=/donnees \
    NOTAK_WEB=/notak/web \
    NOTAK_RELAIS=1 \
    NOTAK_COOKIE_SECURISE=1
WORKDIR /notak
COPY --from=dependances /notak/node_modules ./node_modules
COPY --from=dependances /notak/apps/serveur/node_modules ./apps/serveur/node_modules
COPY apps/serveur/package.json apps/serveur/
COPY apps/serveur/src apps/serveur/src
COPY apps/serveur/autorisation apps/serveur/autorisation
COPY apps/serveur/outils/chiffrer.ts apps/serveur/outils/
COPY packages/tableau/src packages/tableau/src
COPY --from=construction /notak/apps/web/dist ./web
RUN mkdir -p /donnees && chown node:node /donnees
USER node
VOLUME /donnees
EXPOSE 3005
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3005/api/moi').then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"
CMD ["node", "apps/serveur/src/index.ts"]
