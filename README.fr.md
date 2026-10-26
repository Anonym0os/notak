# Notak

**Des tableaux visuels libres : notes, images, liens, colonnes, flèches, tâches, croquis, sur une toile sans bords.**
Une alternative open source à Milanote, en TypeScript et React. *[Read in English](README.md)*

![Le tableau d'accueil de Notak](docs/captures/accueil.png)

## L'essayer

**[notak.app](https://notak.app)** tourne entièrement dans votre navigateur : pas de compte, pas de serveur, rien ne
quitte votre appareil. Vos tableaux vivent dans le navigateur ; **Cmd+S** en garde une copie `.notak` où vous voulez
(votre disque, iCloud Drive, une clé USB), **Cmd+O** en rouvre une. Sur Chrome et Edge pour ordinateur, on peut
aussi synchroniser un dossier de son nuage (expérimental).

**L'app de bureau** (macOS, Windows, Linux) embarque la même édition locale : rien ne passe par un serveur, et elle se
met à jour d'elle-même, de versions signées ([`apps/bureau`](apps/bureau/README.md),
[`docs/MISES-A-JOUR.md`](docs/MISES-A-JOUR.md)). Ce qui peut sortir de l'appareil, et vers qui :
[`docs/PUBLIER.md`](docs/PUBLIER.md#ce-qui-sort-de-lappareil).

Pour travailler à plusieurs en temps réel (comptes, partage, curseurs en direct), installez votre propre Notak : il
est libre et s'installe d'un seul fichier `docker compose` (voir [Héberger](#héberger)).

## Deux éditions, un seul code

| | **Locale** (notak.app) | **Serveur** (auto-hébergée) |
|---|---|---|
| Où vivent les tableaux | dans le navigateur (IndexedDB), et dans des copies `.notak` | sur votre serveur (SQLite), gardés hors ligne dans le navigateur |
| Comptes | aucun | oui |
| À plusieurs | on s'échange des `.notak`, ou un dossier partagé synchronisé | en direct : présence, curseurs, commentaires, partage par adresse ou par lien |
| Aperçus de liens | l'adresse seule (un navigateur ne peut pas lire les autres sites) | titre, image, lecteur |
| Tourne sur | n'importe quel hébergement statique | Docker (Notak et OpenFGA, amd64 ou arm64) |

Les deux se construisent depuis `apps/web` ; `VITE_EDITION=locale` choisit l'édition locale à la construction, et
aucun des deux paquets ne contient le code de l'autre.

Notak couvre presque toutes les fonctionnalités de Milanote : voir [`docs/FONCTIONNALITES.md`](docs/FONCTIONNALITES.md).

## Développer

Il faut [Bun](https://bun.sh) 1.3 et Node 22.18 ou plus récent (le serveur lance son TypeScript tel quel ; la CI et
l'image prennent Node 24).

```bash
bun install
bun run dev:locale          # l'édition locale, sur http://localhost:5173
```

L'édition serveur a aussi besoin de son serveur :

```bash
bun run serveur             # terminal 1 : API, comptes et synchro en direct sur :3005
bun run dev                 # terminal 2 : l'application, relayée vers le serveur
```

Vérifications : `bun run typecheck` et `bun run test` (environ 1 500 essais, dont quelques centaines de scénarios
de synchro tirés au hasard). Le code est décrit dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

> Notak est l'outil dont on se sert chaque jour, publié tel quel et gratuit pour de bon. Les issues et les pull
> requests ne sont pas suivies : reprenez-le, adaptez-le, servez-vous-en comme vous voulez.

| Geste | Effet |
|---|---|
| Double-clic sur le vide | nouvelle note |
| Double-clic sur une note, ou Entrée | écrire dedans ; Échap pour sortir |
| Glisser une note | la déplacer (Maj : sur un seul axe) |
| Glisser sur le vide | lasso (Maj ou Cmd : inverse) |
| Molette, espace + glisser, bouton du milieu | défiler |
| Cmd + molette, pincement | zoomer |
| Z | tout voir ; encore Z : 100 % |
| Cmd+Z / Cmd+Maj+Z | annuler, rétablir |
| / | tous les raccourcis |

## Héberger

### L'édition serveur (comptes, travail à plusieurs en direct)

Deux conteneurs : Notak sert l'application, les comptes et le travail à plusieurs, sur le port 3005, et
[OpenFGA](https://openfga.dev) évalue les droits (qui lit, commente, écrit ou possède chaque tableau). Les données de
Notak (base SQLite et fichiers envoyés) vivent dans un volume de Compose nommé d'après le dossier
(`notak_notak-donnees` pour un dossier `notak` : `docker volume ls`) et font foi : OpenFGA n'en tient qu'une copie,
refaite depuis elles s'il la perd. L'image est publiée pour amd64 et arm64 (`ghcr.io/anonym0os/notak`) ; il suffit de
[`compose.yaml`](compose.yaml) et d'un fichier `.env` à côté (Docker Compose 2.24 ou plus récent) :

```bash
mkdir notak && cd notak
curl -fsSLO https://raw.githubusercontent.com/Anonym0os/notak/main/compose.yaml
printf 'NOTAK_ORIGINE=https://notak.exemple.fr\nNOTAK_ADMINS=vous@exemple.fr\n' > .env
docker compose up -d
```

**Les réglages vivent dans le `.env`**, une ligne par variable, et chacune arrive au serveur. Après un changement,
`docker compose up -d` recrée le conteneur avec. Une variable placée devant la commande
(`NOTAK_ADMINS=… docker compose up -d`) ne vaut que pour cette commande : la mise à jour suivante l'oublierait.
`NOTAK_ORIGINE` est l'adresse que tout le monde tape, dans le navigateur comme dans l'app de bureau : `https://` et le
nom du serveur, sans chemin ni `/` final.

Pour lancer l'image seule, sans `compose.yaml` : lui donner un OpenFGA (`NOTAK_OPENFGA_URL`), un volume sur `/donnees`
et les mêmes variables.

Mettre à jour : `docker compose pull && docker compose up -d` ; le `.env` est relu, les réglages restent. Le serveur
dit de lui-même qu'une nouvelle version existe, dans son journal et dans l'app pour les adresses de `NOTAK_ADMINS`, en
lisant toutes les douze heures la même annonce que l'app de bureau (`NOTAK_VERIFIER_MAJ=0` la coupe). Pour se tenir à
une version : `NOTAK_VERSION=0.2.0` dans le `.env` (`0.2` suit les corrections de la 0.2 dès leur publication). Pour
construire depuis les sources : `docker compose -f compose.yaml -f compose.source.yaml up -d --build`. Chaque image
publiée porte une attestation de provenance :
`gh attestation verify oci://ghcr.io/anonym0os/notak:0.2.0 -R Anonym0os/notak`.

L'image suppose un relais HTTPS devant elle : elle pose un cookie `Secure`, et prend l'adresse du client dans l'entrée
que le relais ajoute à `X-Forwarded-For` (`NOTAK_RELAIS=2` derrière deux relais). `compose.yaml` ne publie donc le port
3005 que sur la boucle locale de la machine (`127.0.0.1`), pour un relais sur la même machine (Caddy :
`reverse_proxy localhost:3005`) ; pour un relais ailleurs, `NOTAK_ECOUTE` et un pare-feu (voir
[`docs/AUTO-HEBERGER.md`](docs/AUTO-HEBERGER.md)). Pour l'essayer en HTTP sur sa machine : `NOTAK_COOKIE_SECURISE=0`
et `NOTAK_RELAIS=0` dans le `.env`, et pas de `NOTAK_ORIGINE`.

L'app de bureau se connecte à votre serveur : « Se connecter à un serveur Notak… », puis son adresse (en HTTPS avec un
vrai certificat, sauf sur `localhost`). Les toiles du serveur restent sur le serveur, celles de l'ordinateur sur
l'ordinateur, jusqu'à « Copier mes toiles sur… », qui en porte une copie au serveur. La connexion par Google,
Microsoft, GitHub ou le SSO d'un espace passe par le navigateur et un code à confirmer.

Les comptes passent par [Better Auth](https://www.better-auth.com). Réglages facultatifs, dans le `.env` :

| Variable | Effet |
|---|---|
| `NOTAK_SECRET` | Signe les cookies de session. Sans elle, il est tiré au premier démarrage et gardé dans `/donnees/secret`. Le changer déconnecte tout le monde. |
| `NOTAK_GOOGLE_ID`, `NOTAK_GOOGLE_SECRET` | Ajoute « Continuer avec Google ». De même pour `MICROSOFT` et `GITHUB`. Le retour est `<NOTAK_ORIGINE>/api/auth/callback/<fournisseur>`. |
| `NOTAK_IDP_INTERNES` | Les origines, séparées par des virgules, des fournisseurs d'identité de votre réseau privé (par exemple `http://keycloak.lan`) qu'un espace d'équipe peut déclarer en SSO. Les fournisseurs publics (Okta, Entra ID, Google Workspace) n'ont besoin de rien. |
| `NOTAK_SMTP_URL`, `NOTAK_EXPEDITEUR` | Envoie les courriels de mot de passe oublié et de vérification (`smtps://compte:motdepasse@hote:465`). Sans elle, les liens vont au journal du serveur, que l'admin transmet. |

Avant chaque migration, le serveur copie la base dans `notak.db.avant-<n>` (dans `/donnees`), puis la migre. Une base
migrée refuse un code plus ancien : revenir en arrière demande l'image d'avant et cette copie, et de laisser OpenFGA se
refaire depuis elle (voir [`docs/AUTO-HEBERGER.md`](docs/AUTO-HEBERGER.md), « Mettre à jour »).

La banque d'images du panneau « Image » interroge Pexels : une clé gratuite dans le `.env` (`PEXELS_API_KEY=…`). Sans
elle, le panneau ne propose que l'envoi de ses propres fichiers.

Le nom de l'instance, les inscriptions fermées, les thèmes fournis ou imposés, Coolify, les sauvegardes, les mises à
jour (et le retour en arrière), la vérification de l'image et l'app de bureau :
[`docs/AUTO-HEBERGER.md`](docs/AUTO-HEBERGER.md).

#### Le chiffrement au repos

> **Perdre la clé, c'est perdre les données.** Rien ne déchiffre les tableaux ni les fichiers sans elle : en garder
> une copie hors du serveur (un gestionnaire de mots de passe, une feuille imprimée dans un tiroir), et la
> sauvegarder à part des données.

Avec une clé, le serveur écrit le contenu des tableaux (leur état Yjs) et les fichiers envoyés, copies réduites
comprises, chiffrés sur le disque en AES-256-GCM. Le serveur garde la clé et déchiffre en mémoire : la recherche,
l'activité, l'export et les liens publics continuent de fonctionner. C'est une protection du disque et de ses
sauvegardes, pas un chiffrement de bout en bout.

| Variable | Rôle |
|---|---|
| `NOTAK_CLE` | La clé : 32 octets tirés au hasard, en base64, faits par `openssl rand -base64 32`. Dans le `.env`, gardez ce fichier pour vous seul (`chmod 600 .env`). |
| `NOTAK_CLE_FICHIER` | Ou le chemin d'un fichier qui la contient (un secret Docker, par exemple), lisible par l'utilisateur `node` de l'image : avec Compose, le monter par une ligne `- /root/notak_cle:/run/secrets/notak_cle:ro` sous `volumes:` du service `notak`, et mettre `NOTAK_CLE_FICHIER=/run/secrets/notak_cle` dans le `.env`. L'une ou l'autre, jamais les deux. |

Sans clé, rien ne change. Avec une clé, ce qui a été écrit avant se lit toujours et repart chiffré à sa prochaine
écriture. Pour tout chiffrer d'un coup, la clé dans le `.env` :

```bash
docker compose stop notak
docker compose run --rm --no-deps notak node apps/serveur/outils/chiffrer.ts
docker compose up -d
```

L'outil dit combien de documents et de fichiers il a chiffrés : « 0 document(s) et 0 fichier(s) » sur un serveur qui a
des tableaux veut dire qu'il n'a pas ouvert le bon dossier. Sans Docker : arrêter le serveur et lancer
`bun run serveur:chiffrer` avec les mêmes variables (`NOTAK_DONNEES` pour le dossier des données). Une clé fausse, ou
une clé absente devant des données chiffrées, arrête le serveur au démarrage plutôt que de servir des tableaux vides.

Ce qui reste **en clair**, parce que le serveur doit le lire sans ouvrir chaque tableau : les titres des tableaux,
l'index de recherche (FTS5 de SQLite, qui contient le texte des éléments), les extraits d'activité et de
notification, et les adresses e-mail des comptes (avec leurs noms, couleurs et droits de partage). Chiffrer aussi le
disque de l'hôte, donc (LUKS, un volume chiffré chez l'hébergeur) : la clé couvre le contenu, le disque couvre le
reste.

### L'édition locale (comme notak.app)

Des fichiers statiques servis par nginx, sans API :

```bash
docker build -f apps/site/Dockerfile --build-arg VITE_CONTACT=vous@exemple.fr -t notak-site .
docker run -d -p 8080:80 notak-site
```

`VITE_CONTACT` est l'adresse proposée sous « Nous écrire » dans l'application ; sans elle, seul le lien vers ce
dépôt s'affiche. On peut aussi construire les fichiers soi-même (`bun run build:locale`, dans `apps/web/dist`) et
les poser sur n'importe quel hébergement statique, toute adresse inconnue renvoyant vers `index.html`.

## Dépôt

| Dossier | Rôle |
|---|---|
| `packages/tableau` | `@notak/tableau` : le cœur (caméra, sélection, historique, magasin Yjs), la toile React, les types d'éléments, le moteur de synchro par dossier |
| `apps/web` | l'application web, les deux éditions |
| `apps/serveur` | le serveur de l'édition serveur (Hono, Hocuspocus, SQLite) |
| `apps/site` | notak.app : l'édition locale derrière nginx, et la page « À propos » |
| `apps/bureau` | l'app de bureau (Tauri) : l'édition locale embarquée, et ses mises à jour signées |
| `docs/SPEC.md` | ce que Notak doit faire, geste par geste |
| `docs/FONCTIONNALITES.md` | chaque fonctionnalité de Milanote, et où en est Notak |
| `docs/ARCHITECTURE.md` | comment le code est rangé |
| `docs/PUBLIER.md` | le modèle de notak.app : gratuit, local, honnête |
| `docs/STOCKAGE.md` | le format du dossier synchronisé, et ce qui le prouve |

## Licence

AGPL-3.0. Qui héberge une version modifiée doit en publier le code.
