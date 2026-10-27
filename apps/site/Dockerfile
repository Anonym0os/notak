# notak.app : l'édition locale de Notak (tout dans le navigateur, sans compte ni serveur), servie en fichiers
# statiques par nginx, et la page « À propos ». À construire depuis la racine du dépôt :
#   docker build -f apps/site/Dockerfile --build-arg VITE_CONTACT=contact@exemple.fr -t notak-site .

FROM oven/bun:1.4.4 AS construction
WORKDIR /notak
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY apps/serveur/package.json apps/serveur/
COPY packages/tableau/package.json packages/tableau/
RUN bun install --frozen-lockfile
COPY . .
# L'adresse proposée pour « Nous écrire » (temps réel, hébergement) ; vide, seul le lien vers le dépôt s'affiche.
ARG VITE_CONTACT=""
ENV VITE_EDITION=locale VITE_CONTACT=$VITE_CONTACT
RUN cd apps/web && bun run build

FROM nginx:1.27-alpine
COPY apps/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/site/entetes.conf apps/site/csp.conf /etc/nginx/notak/
COPY --from=construction /notak/apps/web/dist /usr/share/nginx/html
COPY apps/site/public /usr/share/nginx/html
EXPOSE 80
