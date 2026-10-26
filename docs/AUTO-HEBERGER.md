# Installer son propre serveur Notak

L'édition serveur, c'est un conteneur qui sert tout : l'application, les comptes, la synchro en temps réel ; à côté,
OpenFGA évalue les droits (qui lit, commente, écrit ou possède chaque tableau et chaque élément). Elle tourne
derrière un relais HTTPS, sous votre nom de domaine. Elle porte votre nom et votre thème, et vous décidez qui peut
s'y inscrire.

## Démarrer

Il suffit de [`compose.yaml`](../compose.yaml), dans un dossier à lui :

```bash
mkdir notak && cd notak
curl -fsSLO https://raw.githubusercontent.com/Anonym0os/notak/main/compose.yaml
NOTAK_ORIGINE=https://notak.exemple.fr NOTAK_ADMINS=vous@exemple.fr docker compose up -d
```

Il tire l'image publiée, `ghcr.io/anonym0os/notak` (pour amd64 et arm64 : un serveur Intel ou AMD, un Raspberry Pi 4
ou 5, un Mac Apple), la sert sur le port 3005, et lance OpenFGA à côté. Les réglages peuvent aussi vivre dans un fichier
`.env` à côté de `compose.yaml` (`NOTAK_ORIGINE=…`, une ligne par variable) : `docker compose` le lit tout seul.

Les données vivent dans le volume `/donnees` : la base SQLite (`notak.db`), les fichiers déposés (`fichiers/`) et les
thèmes (`habillages/`). OpenFGA n'en tient qu'une copie, dans son propre volume : s'il la perd, Notak la refait.

Sans Docker : lancer un OpenFGA (`openfga run`, voir openfga.dev), puis `bun install`, `bun run build`, et
`NOTAK_OPENFGA_URL=http://localhost:8080 NOTAK_WEB=apps/web/dist bun run serveur`.

## Le relais HTTPS

L'image attend un relais devant elle : elle pose des cookies `Secure` (`NOTAK_COOKIE_SECURISE=1`) et lit l'adresse du
client dans `X-Forwarded-For` (`NOTAK_RELAIS=1`). Le relais doit laisser passer les WebSocket sur `/sync`.

- **Caddy** : `notak.exemple.fr { reverse_proxy localhost:3005 }` suffit.
- **Coolify** : une application « Docker Compose » avec ce `compose.yaml` (ou « Docker Image »
  `ghcr.io/anonym0os/notak:latest`, à côté d'un OpenFGA), le port 3005, un volume persistant monté sur `/donnees`,
  et les variables ci-dessous dans l'onglet *Environment Variables*.

Pour un essai en HTTP sur sa machine : `NOTAK_COOKIE_SECURISE=0` et `NOTAK_RELAIS=0`.

## Les variables

| Variable | Par défaut | Ce qu'elle règle |
|---|---|---|
| `NOTAK_ORIGINE` | `http://localhost:3005` | l'adresse publique du serveur : liens envoyés, retours de connexion |
| `NOTAK_AUTRES_ORIGINES` | aucune | d'autres origines, séparées par des virgules, dont les pages peuvent se connecter et se synchroniser (sans `NOTAK_ORIGINE`, `http://localhost:5173` l'est déjà) |
| `NOTAK_OPENFGA_URL` | `http://localhost:8080` | l'OpenFGA qui évalue les droits (`http://openfga:8080` dans `compose.yaml`) |
| `NOTAK_NOM` | `Notak` | le nom affiché sur l'écran de connexion |
| `NOTAK_INSCRIPTIONS` | `ouvertes` | `fermees` : personne ne crée de compte seul (voir plus bas) |
| `NOTAK_HABILLAGES` | `/donnees/habillages` | le dossier des thèmes à fournir aux comptes |
| `NOTAK_HABILLAGE_DEFAUT` | aucun | l'identifiant du thème proposé à qui n'en a pas choisi |
| `NOTAK_HABILLAGE` | aucun | l'identifiant du thème imposé à tous : le choix de chacun ne compte plus |
| `NOTAK_CLE`, `NOTAK_CLE_FICHIER` | aucune | la clé du chiffrement au repos (voir plus bas) |
| `NOTAK_SECRET` | tiré au premier démarrage, gardé dans `/donnees/secret` | signe les cookies de session ; le changer déconnecte tout le monde |
| `NOTAK_GOOGLE_ID`, `NOTAK_GOOGLE_SECRET` | aucun | « Continuer avec Google » ; de même `MICROSOFT` et `GITHUB`. Retour : `<NOTAK_ORIGINE>/api/auth/callback/<fournisseur>` |
| `NOTAK_SMTP_URL`, `NOTAK_EXPEDITEUR` | aucun | les courriels (mot de passe oublié, invitations) ; sans eux, les liens vont au journal |
| `NOTAK_IDP_INTERNES` | aucune | les origines des fournisseurs d'identité du réseau interne qu'un espace peut déclarer en SSO |
| `NOTAK_ADMINS` | aucun | les adresses des admins du serveur, séparées par des virgules : ils voient, dans l'app, qu'une nouvelle version existe. Aucun droit de plus sur les tableaux ni les espaces |
| `NOTAK_VERIFIER_MAJ` | `1` | `0` : le serveur ne regarde plus s'il existe une nouvelle version (voir « Mettre à jour ») |
| `NOTAK_SIGNALEMENTS` | aucun | le dossier où ranger les signalements de bugs (⇧⌘S dans l'app, par un compte connecté) ; sans lui, le serveur n'en reçoit pas. `bun run signalements` les lit |
| `PEXELS_API_KEY` | aucune | la banque d'images du panneau « Image » ; sans elle, seulement ses propres fichiers |
| `PORT` | `3005` | le port d'écoute |
| `NOTAK_DONNEES` | `/donnees` | le dossier des données |
| `NOTAK_WEB` | `/notak/web` dans l'image | le dossier de l'application web construite (`apps/web/dist`), servie avec l'API ; sans lui, l'API seule (en développement, Vite sert les pages) |
| `NOTAK_COOKIE_SECURISE`, `NOTAK_RELAIS` | `1` | voir « Le relais HTTPS » |

Et pour `compose.yaml` seulement : `NOTAK_VERSION` (l'image à prendre, `latest` par défaut, voir « Mettre à jour ») et
`NOTAK_PORT` (le port de la machine, `3005` par défaut).

Ces réglages se lisent au démarrage : on redémarre le conteneur après les avoir changés. `GET /api/instance` rend ce
que le serveur en a compris : nom, inscriptions, thèmes, version. `GET /api/sante` dit, sans compte, que le serveur
répond (`{ "produit": "notak", "version": …, "origine": …, "ok": true }`) : c'est ce que surveille le conteneur.

Les admins sont reconnus à leur adresse : créez leur compte tôt (ou par `compte.ts`, plus bas), avant qu'un autre ne
s'inscrive avec la même.

## Fermer les inscriptions

Avec `NOTAK_INSCRIPTIONS=fermees`, l'écran de connexion ne propose plus de créer un compte, et l'API refuse
l'inscription, par mot de passe comme par un fournisseur (`403`, code `INSCRIPTIONS_FERMEES`). Le SSO d'un espace, qu'un
admin d'espace a déclaré, fait encore entrer les gens de son entreprise. Les comptes se créent depuis la machine du serveur :

```bash
docker compose exec notak node apps/serveur/src/compte.ts --email ana@exemple.fr --nom Ana
```

Le mot de passe est tiré au hasard et écrit une fois dans le terminal, ou pris dans `NOTAK_MOT_DE_PASSE`. Il ne passe
jamais par la ligne de commande, qui reste dans l'historique. Un tableau partagé avec une adresse sans compte
attend toujours son invitée : il la retrouve quand son compte est créé.

## Ajouter un thème

Déposez le fichier dans le dossier des thèmes, puis redémarrez :

```bash
docker compose cp exemples/habillages/silak.json notak:/donnees/habillages/silak.json
docker compose restart notak
```

Le format est décrit dans [`HABILLAGES.md`](HABILLAGES.md). Au démarrage, chaque fichier est relu par la même liste
blanche que dans le navigateur. Un fichier refusé est signalé dans le journal du conteneur et laissé de côté : il
n'empêche pas le serveur de démarrer. Les thèmes du serveur apparaissent dans les réglages de chacun, à côté de ceux
qu'on importe soi-même.

## Chiffrer au repos

Avec une clé (`NOTAK_CLE`, 32 octets en base64 tirés par `openssl rand -base64 32`, ou `NOTAK_CLE_FICHIER`), le
serveur écrit chiffrés le contenu des tableaux et les fichiers déposés. **Perdre la clé, c'est perdre les données** :
on la garde hors du serveur, et on la sauvegarde à part. Ce qui reste en clair, la migration des données existantes
(`bun run serveur:chiffrer`) et le refus de démarrer sur une clé fausse sont décrits dans le
[README](../README.fr.md), section « Le chiffrement au repos ».

## Sauvegarder

Tout est dans `/donnees`. Avec le chiffrement, une sauvegarde ne se relit qu'avec la même clé. Une copie du volume, serveur arrêté ou avec `sqlite3 notak.db ".backup copie.db"` pour la
base, suffit à tout remettre en place.

## Mettre à jour

```bash
docker compose pull && docker compose up -d
```

Chaque version publiée de Notak a son image : `ghcr.io/anonym0os/notak:0.2.0`, `:0.2` (la dernière 0.2.x) et `:latest`
(la dernière tout court), que `compose.yaml` prend par défaut. Un serveur regarde de lui-même, une minute après son
démarrage puis toutes les douze heures, s'il en existe une plus récente : il l'écrit une fois dans son journal (`docker
compose logs notak`), avec la commande ci-dessus, et les admins (`NOTAK_ADMINS`) la voient dans l'app. Il ne fait que
le dire : rien ne s'installe sans vous. Cette vérification lit le même fichier que les apps de bureau
(`https://github.com/Anonym0os/notak/releases/latest/download/latest.json`) : GitHub voit l'adresse IP du serveur, rien
d'autre ne part. `NOTAK_VERIFIER_MAJ=0` la coupe.

**La base se sauvegarde d'elle-même** : avant chaque migration, le serveur en écrit une copie,
`/donnees/notak.db.avant-<n>` (`<n>` : le numéro de la migration qui suit), et n'y touche qu'ensuite. Une migration qui
échoue est annulée en entier, et le serveur s'arrête sans rien servir.

**Pour se tenir à une version**, plutôt que de suivre `latest` : `NOTAK_VERSION=0.2.0` (ou `0.2`, pour recevoir les
corrections de la 0.2 seulement) dans le `.env` à côté de `compose.yaml`.

**Pour mettre à jour tout seul**, une tâche planifiée suffit ; par exemple, chaque nuit à 4 h (`crontab -e`) :

```cron
0 4 * * * cd /srv/notak && docker compose pull -q && docker compose up -d
```

ou, avec systemd, un service `notak-maj.service` (`Type=oneshot`, `WorkingDirectory=/srv/notak`,
`ExecStart=/bin/sh -c 'docker compose pull -q && docker compose up -d'`) et son minuteur `notak-maj.timer`
(`OnCalendar=*-*-* 04:00`, `Persistent=true`, puis `systemctl enable --now notak-maj.timer`).

**Revenir en arrière.** Une base migrée refuse un code plus ancien qu'elle (le serveur ne démarre pas, plutôt que de
l'abîmer). Pour revenir à la version d'avant, il faut donc aussi reprendre la base d'avant :

```bash
docker compose down
docker compose run --rm --no-deps --entrypoint sh notak -c 'ls -l /donnees'     # les copies notak.db.avant-<n>
docker compose run --rm --no-deps --entrypoint sh notak -c \
  'cd /donnees && mv notak.db notak.db.abandonnee && rm -f notak.db-wal notak.db-shm && cp notak.db.avant-7 notak.db'
NOTAK_VERSION=0.1.0 docker compose up -d                                         # la version d'avant
```

(`avant-7` : la première copie écrite par la mise à jour, celle de la version d'avant.) Ce qui a été fait depuis la
mise à jour est perdu ; les fichiers déposés, eux, restent. Une mise à jour qui n'a écrit aucune copie n'avait pas de
migration : l'image d'avant suffit, la base reste.

## Construire depuis les sources

Pour une version modifiée (l'AGPL demande alors d'en publier le code à qui s'en sert), ou pour ne dépendre d'aucune
image publiée :

```bash
git clone https://github.com/Anonym0os/notak
cd notak
docker compose -f compose.yaml -f compose.source.yaml up -d --build
```

[`compose.source.yaml`](../compose.source.yaml) remplace l'image publiée par celle que construit le `Dockerfile` du
dépôt. Pour mettre à jour : `git pull`, puis la même commande.

## Vérifier l'image

Chaque image publiée porte une attestation de provenance, signée par GitHub : elle a été construite par la publication
de ce dépôt, depuis l'étiquette de sa version, et rien d'autre. Avec la CLI de GitHub :

```bash
gh attestation verify oci://ghcr.io/anonym0os/notak:0.2.0 -R Anonym0os/notak
```

Elle porte aussi son numéro, son dépôt et sa licence dans ses étiquettes (`org.opencontainers.image.version`, `.source`,
`.licenses`).

## Depuis l'app de bureau

L'app de bureau (Mac, Windows, Linux) se connecte à votre serveur : entrez son adresse dans l'app
(`https://notak.exemple.fr`). Elle vérifie que c'est bien un serveur Notak et assez récent, puis ouvre ses pages dans sa
fenêtre : comptes, partage, travail à plusieurs en direct, comme dans un navigateur.

- **HTTPS avec un vrai certificat** (Let's Encrypt par Caddy, par exemple) est exigé : l'app refuse un certificat
  auto-signé ou expiré, et le HTTP en clair. Seule exception : `http://localhost`, pour un essai sur sa machine.
- **La connexion par mot de passe** se fait dans l'app. **Celle par Google, Microsoft, GitHub ou le SSO d'un espace**
  passe par votre navigateur : ces fournisseurs refusent de s'afficher dans une app. L'app montre un code, ouvre la page
  `/bureau/autoriser` de votre serveur dans le navigateur, où vous vous connectez comme d'habitude ; la page dit d'où et
  quand le code a été demandé, vous le confirmez, et l'app est connectée. Un code ne vaut que dix minutes, et pour la
  seule app qui l'a demandé : confirmez seulement un code que vous voyez dans votre propre app.
