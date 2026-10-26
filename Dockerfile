# Le conteneur de Notak : le serveur Node sert l'API, la synchro (/sync) et l'application web construite. Les droits
# sont évalués par OpenFGA, un second conteneur (voir compose.yaml) que désigne NOTAK_OPENFGA_URL.
#
# Publiée pour amd64 et arm64 (ghcr.io/anonym0os/notak, voir docs/MISES-A-JOUR.md). L'application web ne dépend pas
# de la machine : elle se construit sur celle qui construit. Les dépendances du serveur, elles, ont du code natif
# (sharp, argon2) : elles s'installent sur l'architecture de l'image.

FROM --platform=$BUILDPLATFORM oven/bun:1.3.12 AS construction
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
# Le numéro que porte l'image, donné par la publication (`--build-arg NOTAK_VERSION=0.2.0`) ; « dev » pour une image
# construite à la main. Le serveur, lui, dit le sien (`GET /api/sante`), tiré du code.
ARG NOTAK_VERSION=dev
LABEL org.opencontainers.image.title="Notak" \
      org.opencontainers.image.description="Notak, l'édition serveur : comptes, partage et travail à plusieurs en direct" \
      org.opencontainers.image.source="https://github.com/Anonym0os/notak" \
      org.opencontainers.image.url="https://github.com/Anonym0os/notak" \
      org.opencontainers.image.documentation="https://github.com/Anonym0os/notak/blob/main/docs/AUTO-HEBERGER.md" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.version="${NOTAK_VERSION}"
# Derrière un relais HTTPS : cookies `Secure`, et l'adresse du client lue dans l'entrée qu'un relais ajoute à
# X-Forwarded-For (NOTAK_RELAIS : combien de relais de confiance). docs/AUTO-HEBERGER.md, « Le relais HTTPS ».
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
# Le package.json de la toile : sans lui, Node ne trouve pas `@notak/tableau/securite` ni `@notak/tableau/habillage`.
COPY packages/tableau/package.json packages/tableau/
COPY packages/tableau/src packages/tableau/src
COPY --from=construction /notak/apps/web/dist ./web
RUN mkdir -p /donnees && chown node:node /donnees
USER node
VOLUME /donnees
EXPOSE 3005
# Au démarrage, le serveur attend OpenFGA jusqu'à une minute, et migre la base s'il le faut.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3005)+'/api/sante').then(r=>r.json()).then(s=>process.exit(s.ok===true?0:1),()=>process.exit(1))"
CMD ["node", "apps/serveur/src/index.ts"]
