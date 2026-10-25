# Notak

**Des tableaux visuels libres : notes, images, liens, colonnes, flèches, tâches, croquis, sur une toile sans bords.**
Une alternative open source à Milanote, en TypeScript et React. *[Read in English](README.md)*

![Le tableau d'accueil de Notak](docs/captures/accueil.png)

## L'essayer

**[notak.app](https://notak.app)** tourne entièrement dans votre navigateur : pas de compte, pas de serveur, rien ne
quitte votre appareil. Vos tableaux vivent dans le navigateur ; **Cmd+S** en garde une copie `.notak` où vous voulez
(votre disque, iCloud Drive, une clé USB), **Cmd+O** en rouvre une. Sur Chrome et Edge pour ordinateur, on peut
aussi synchroniser un dossier de son nuage (expérimental).

Pour travailler à plusieurs en temps réel (comptes, partage, curseurs en direct), installez votre propre Notak : il
est libre et tient dans un conteneur (voir [Héberger](#héberger)).

## Deux éditions, un seul code

| | **Locale** (notak.app) | **Serveur** (auto-hébergée) |
|---|---|---|
| Où vivent les tableaux | dans le navigateur (IndexedDB), et dans des copies `.notak` | sur votre serveur (SQLite), gardés hors ligne dans le navigateur |
| Comptes | aucun | oui |
| À plusieurs | on s'échange des `.notak`, ou un dossier partagé synchronisé | en direct : présence, curseurs, commentaires, partage par adresse ou par lien |
| Aperçus de liens | l'adresse seule (un navigateur ne peut pas lire les autres sites) | titre, image, lecteur |
| Tourne sur | n'importe quel hébergement statique | un conteneur Docker |

Les deux se construisent depuis `apps/web` ; `VITE_EDITION=locale` choisit l'édition locale à la construction, et
aucun des deux paquets ne contient le code de l'autre.

Notak couvre presque toutes les fonctionnalités de Milanote : voir [`docs/FONCTIONNALITES.md`](docs/FONCTIONNALITES.md).

## Développer

Il faut [Bun](https://bun.sh) 1.3 et Node 22.13 ou plus récent.

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
de synchro tirés au hasard). Les contributions sont bienvenues : commencez par [`CONTRIBUTING.md`](CONTRIBUTING.md)
et [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

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

Un seul conteneur sert l'application, les comptes et le travail à plusieurs, sur le port 3005. Les données (base
SQLite et fichiers envoyés) vivent dans le volume `/donnees`.

```bash
git clone https://github.com/Anonym0os/notak
cd notak
docker build -t notak .
docker run -d -p 3005:3005 -v notak-donnees:/donnees notak
```

L'image suppose un relais HTTPS devant elle (cookie `Secure`, adresse du client lue dans `X-Forwarded-For`).
Pour l'essayer en HTTP sur sa machine : `-e NOTAK_COOKIE_SECURISE=0 -e NOTAK_RELAIS=0`.

La banque d'images du panneau « Image » interroge Pexels : donner une clé gratuite par `-e PEXELS_API_KEY=…`. Sans
elle, le panneau ne propose que l'envoi de ses propres fichiers.

Le nom de l'instance, les inscriptions fermées, les thèmes fournis ou imposés, Coolify et les sauvegardes :
[`docs/AUTO-HEBERGER.md`](docs/AUTO-HEBERGER.md), avec un [`compose.yaml`](compose.yaml) prêt à l'emploi.

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
| `NOTAK_CLE` | La clé : 32 octets tirés au hasard, en base64, faits par `openssl rand -base64 32`. |
| `NOTAK_CLE_FICHIER` | Ou le chemin d'un fichier qui la contient (un secret Docker, par exemple), lisible par l'utilisateur `node` de l'image. L'une ou l'autre, jamais les deux. |

```bash
docker run -d -p 3005:3005 -v notak-donnees:/donnees -e NOTAK_CLE_FICHIER=/run/secrets/notak_cle \
  -v /root/notak_cle:/run/secrets/notak_cle:ro notak
```

Sans clé, rien ne change. Avec une clé, ce qui a été écrit avant se lit toujours et repart chiffré à sa prochaine
écriture ; pour tout chiffrer d'un coup, arrêter le serveur et lancer `bun run serveur:chiffrer` avec les mêmes
variables (`NOTAK_DONNEES` pour le dossier des données), ou dans l'image :
`docker run --rm -v notak-donnees:/donnees -e NOTAK_CLE=… notak node apps/serveur/outils/chiffrer.ts`.
Une clé fausse, ou une clé absente devant des données chiffrées, arrête le serveur au démarrage plutôt que de servir
des tableaux vides.

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
| `apps/bureau` | la coque de bureau (Tauri) |
| `docs/SPEC.md` | ce que Notak doit faire, geste par geste |
| `docs/FONCTIONNALITES.md` | chaque fonctionnalité de Milanote, et où en est Notak |
| `docs/ARCHITECTURE.md` | comment le code est rangé |
| `docs/PUBLIER.md` | le modèle de notak.app : gratuit, local, honnête |
| `docs/STOCKAGE.md` | le format du dossier synchronisé, et ce qui le prouve |

## Licence

AGPL-3.0. Qui héberge une version modifiée doit en publier le code.
