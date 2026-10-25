# Installer son propre serveur Notak

L'édition serveur, c'est un conteneur qui sert tout : l'application, les comptes, la synchro en temps réel. Elle tourne
derrière un relais HTTPS, sous votre nom de domaine. Elle porte votre nom et votre thème, et vous décidez qui peut
s'y inscrire.

## Démarrer

```bash
git clone https://github.com/Anonym0os/notak
cd notak
docker compose up -d
```

[`compose.yaml`](../compose.yaml) construit l'image (`Dockerfile`) et la sert sur le port 3005. Les données vivent
dans le volume `/donnees` : la base SQLite (`notak.db`), les fichiers déposés (`fichiers/`) et les thèmes
(`habillages/`).

Sans Docker : `bun install`, `bun run build`, puis `NOTAK_WEB=apps/web/dist bun run serveur`.

## Le relais HTTPS

L'image attend un relais devant elle : elle pose des cookies `Secure` (`NOTAK_COOKIE_SECURISE=1`) et lit l'adresse du
client dans `X-Forwarded-For` (`NOTAK_RELAIS=1`). Le relais doit laisser passer les WebSocket sur `/sync`.

- **Caddy** : `notak.exemple.fr { reverse_proxy localhost:3005 }` suffit.
- **Coolify** : une application « Dockerfile » sur le dépôt, le port 3005, un volume persistant monté sur `/donnees`,
  et les variables ci-dessous dans l'onglet *Environment Variables*.

Pour un essai en HTTP sur sa machine : `NOTAK_COOKIE_SECURISE=0` et `NOTAK_RELAIS=0`.

## Les variables

| Variable | Par défaut | Ce qu'elle règle |
|---|---|---|
| `NOTAK_NOM` | `Notak` | le nom affiché sur l'écran de connexion |
| `NOTAK_INSCRIPTIONS` | `ouvertes` | `fermees` : personne ne crée de compte seul (voir plus bas) |
| `NOTAK_HABILLAGES` | `/donnees/habillages` | le dossier des thèmes à fournir aux comptes |
| `NOTAK_HABILLAGE_DEFAUT` | aucun | l'identifiant du thème proposé à qui n'en a pas choisi |
| `NOTAK_HABILLAGE` | aucun | l'identifiant du thème imposé à tous : le choix de chacun ne compte plus |
| `NOTAK_CLE`, `NOTAK_CLE_FICHIER` | aucune | la clé du chiffrement au repos (voir plus bas) |
| `PEXELS_API_KEY` | aucune | la banque d'images du panneau « Image » ; sans elle, seulement ses propres fichiers |
| `PORT` | `3005` | le port d'écoute |
| `NOTAK_DONNEES` | `/donnees` | le dossier des données |
| `NOTAK_COOKIE_SECURISE`, `NOTAK_RELAIS` | `1` | voir « Le relais HTTPS » |

Ces réglages se lisent au démarrage : on redémarre le conteneur après les avoir changés. `GET /api/instance` rend ce
que le serveur en a compris : nom, inscriptions, thèmes.

## Fermer les inscriptions

Avec `NOTAK_INSCRIPTIONS=fermees`, l'écran de connexion ne propose plus de créer un compte, et l'API refuse
l'inscription (`403`, code `inscriptions_fermees`). Les comptes se créent depuis la machine du serveur :

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
