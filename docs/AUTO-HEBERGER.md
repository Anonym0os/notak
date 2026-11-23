# Installer son propre serveur Notak

L'édition serveur, c'est un conteneur qui sert tout : l'application, les comptes, la synchro en temps réel ; à côté,
OpenFGA évalue les droits (qui lit, commente, écrit ou possède chaque tableau et chaque élément). Elle tourne
derrière un relais HTTPS, sous votre nom de domaine. Elle porte votre nom et votre thème, et vous décidez qui peut
s'y inscrire.

## Démarrer

Il suffit de [`compose.yaml`](../compose.yaml), dans un dossier à lui, et d'un fichier `.env` à côté pour les
réglages :

```bash
mkdir notak && cd notak
curl -fsSLO https://github.com/Anonym0os/notak/releases/latest/download/compose.yaml
printf 'NOTAK_ORIGINE=https://notak.exemple.fr\nNOTAK_ADMINS=vous@exemple.fr\n' > .env
docker compose up -d
```

Le `compose.yaml` est celui de la dernière version publiée, qui va avec son image ; chaque mise à jour le reprend (voir
« Mettre à jour »). N'y écrivez donc rien : les réglages vont dans le `.env`, et ce que vous ajouteriez à Compose (le
volume d'une clé, un réseau) dans un `compose.override.yaml` à côté, que Compose lit de lui-même.

Il tire l'image publiée, `ghcr.io/anonym0os/notak` (pour amd64 et arm64 : un serveur Intel ou AMD, un Raspberry Pi 4
ou 5, un Mac Apple), la sert sur le port 3005 de la machine, pour elle seule (voir « Le relais HTTPS »), et lance
OpenFGA à côté. Il faut Docker Compose 2.24 ou plus récent (`docker compose version`).

**Les réglages vivent dans le `.env`**, une ligne par variable (la liste est plus bas) : chacune arrive au serveur.
Après un changement, `docker compose up -d` recrée le conteneur avec les nouveaux réglages. Une variable placée devant
la commande (`NOTAK_ADMINS=… docker compose up -d`) ne vaut que pour cette commande : la mise à jour suivante
l'oublierait, et le serveur repartirait sans elle.

**`NOTAK_ORIGINE` est l'adresse que tout le monde tape**, dans le navigateur comme dans l'app de bureau : `https://`
et le nom du serveur, sans chemin ni `/` final. Notak se sert à la racine de son adresse. Écrite autrement
(`HTTPS://Notak.exemple.fr/`), le serveur la corrige et le dit dans son journal ; une adresse qui n'en est pas une
l'empêche de démarrer. L'app de bureau compare l'adresse qu'on y tape à celle-ci : si elles diffèrent (un `www.` en
plus, un autre nom), elle dit « Ce serveur se trouve à … » et propose la bonne.

Les données vivent dans le volume monté sur `/donnees` : la base SQLite (`notak.db`), les fichiers déposés
(`fichiers/`) et les thèmes (`habillages/`). Compose nomme ce volume d'après le dossier : `notak_notak-donnees` pour
un dossier `notak` (`docker volume ls`). OpenFGA n'en tient qu'une copie, dans son propre volume (`notak_openfga`) :
s'il la perd (son volume effacé), Notak la refait au démarrage.

**Sans Docker** : Node 22.18 ou plus récent, un OpenFGA (`openfga run`, voir openfga.dev ; la version que nomme
`compose.yaml`), le dépôt cloné à l'étiquette d'une version (`git checkout v0.2.0`), puis `bun install
--frozen-lockfile`, `bun run build`, et :

```bash
NOTAK_ORIGINE=https://notak.exemple.fr NOTAK_COOKIE_SECURISE=1 NOTAK_RELAIS=1 NOTAK_HOTE=127.0.0.1 \
  NOTAK_OPENFGA_URL=http://localhost:8080 NOTAK_WEB=apps/web/dist bun run serveur
```

Hors de l'image, `NOTAK_COOKIE_SECURISE` et `NOTAK_RELAIS` valent `0` : derrière un relais HTTPS, donnez-les.
**`NOTAK_HOTE=127.0.0.1` va avec `NOTAK_RELAIS=1`** : le serveur n'écoute alors que sur la boucle locale, où le joint le
relais de la même machine (Caddy : `reverse_proxy localhost:3005`). Sans elle, il écoute sur toutes les interfaces, et
quiconque joint le port 3005 écrit lui-même `X-Forwarded-For`, que le serveur croit : chaque requête aurait sa propre
limite d'essais, et la page de confirmation de l'app de bureau montrerait l'adresse qu'il a choisie. Un relais sur une
autre machine : l'adresse de l'interface qui le reçoit, et un pare-feu qui ne laisse joindre le port qu'à lui. Sans
`NOTAK_ORIGINE`, le serveur se croit en développement (les pages viennent de Vite, aucune vérification des mises à
jour). Pour un service qui dure, ces variables vont dans son fichier d'environnement (systemd : `EnvironmentFile=`).

## Le relais HTTPS

L'image attend un relais devant elle : elle pose des cookies `Secure` (`NOTAK_COOKIE_SECURISE=1`) et lit l'adresse du
client dans `X-Forwarded-For` (`NOTAK_RELAIS=1`). Le relais doit laisser passer les WebSocket sur `/sync`.

Le serveur croit le relais sur l'adresse du client : c'est elle qui compte les essais de connexion (une adresse IPv6
compte pour son `/64`, que tient d'ordinaire un seul client), et que montre la page où l'on confirme le code de l'app de
bureau. Il lit donc l'entrée qu'ajoute le relais, la dernière de `X-Forwarded-For`, jamais celle que le client écrit
lui-même. Et personne d'autre que le relais ne doit joindre le port : `compose.yaml` ne le publie que sur la boucle
locale de la machine (`127.0.0.1:3005`).

**Derrière deux relais l'un après l'autre** (un CDN comme Cloudflare, puis Caddy) : `NOTAK_RELAIS=2`, à une condition.
Le second doit croire le premier, sinon il remplace `X-Forwarded-For` par l'adresse de qui le joint (celle du CDN) :
le serveur n'y trouve plus celle du client, tous les clients comptent pour un seul, et dix connexions par minute
ferment la porte à tout le monde. Caddy : dans son bloc global, `servers { trusted_proxies static <les plages du CDN> }`
(celles de Cloudflare : cloudflare.com/ips, que le module `caddy-cloudflare-ip` tient à jour avec `trusted_proxies
cloudflare`). Traefik : `forwardedHeaders.trustedIPs` sur son point d'entrée. Le serveur le dit une fois dans son
journal quand `X-Forwarded-For` n'a pas l'adresse attendue. `NOTAK_RELAIS` est un nombre entier : une autre valeur
(`oui`) vaut `0`, ce que le journal dit aussi.

- **Caddy, sur la même machine** : `notak.exemple.fr { reverse_proxy localhost:3005 }` suffit.
- **Un relais dans un conteneur, sur le même réseau Docker** (Traefik, celui de Coolify) : il joint `notak:3005` par
  ce réseau, le port publié ne lui sert pas.
- **Un relais sur une autre machine, ou dans un conteneur qui passe par celle-ci** (`host.docker.internal`) :
  `NOTAK_ECOUTE=0.0.0.0` (ou l'adresse de l'interface voulue) dans le `.env`, et un pare-feu qui ne laisse joindre le
  port qu'au relais. Docker contourne souvent `ufw` : la règle se pose dans la chaîne `DOCKER-USER`, ou chez l'hébergeur.
- **Coolify** : une application « Docker Compose » avec ce `compose.yaml` (ou « Docker Image »
  `ghcr.io/anonym0os/notak:latest`, à côté d'un OpenFGA), le port 3005, un volume persistant monté sur `/donnees`,
  et les variables ci-dessous dans l'onglet *Environment Variables*. Pour construire depuis le dépôt à chaque
  poussée, l'application pointe plutôt sur `compose.coolify.yaml` : le domaine se donne au service `notak`
  (`https://notak.exemple.fr:3005`), aucun port ne s'ouvre sur la machine, et seules les variables qu'il nomme
  arrivent au serveur. Si l'une n'arrive pas au serveur
  (`GET /api/instance` montre le nom et les inscriptions qu'il a compris), ajoutez-la sous `environment:` dans le
  `compose.yaml` que tient Coolify, sous la forme `NOTAK_INSCRIPTIONS: ${NOTAK_INSCRIPTIONS}`.

Pour un essai en HTTP sur sa machine, sans relais : `NOTAK_COOKIE_SECURISE=0` et `NOTAK_RELAIS=0` dans le `.env`, et
pas de `NOTAK_ORIGINE` (elle vaut alors `http://localhost:3005`).

## Un serveur à la maison, sans nom de domaine

Un Raspberry Pi ou un NAS du réseau local, joint en `http://192.168.1.10:3005`, ne convient pas à l'app de bureau :
elle n'accepte que HTTPS avec un certificat reconnu (seul `localhost` s'en passe), et Let's Encrypt ne délivre pas de
certificat par le défi HTTP à une machine qu'Internet ne joint pas. L'adresse tapée sans
`https://` dans l'app se lit en HTTPS : un serveur qui ne répond qu'en HTTP y passe pour injoignable. Trois chemins :

- **Tailscale**, le plus simple : les appareils qui s'en servent rejoignent votre réseau Tailscale, où le serveur reçoit
  un nom et un vrai certificat. Dans la console de Tailscale, page *DNS* : activez *MagicDNS* et *HTTPS Certificates*.
  Puis, sur le serveur, Tailscale installé :

  ```bash
  sudo tailscale serve --bg 3005      # https://pi.<votre-réseau>.ts.net vers le port 3005 de la machine
  ```

  Dans le `.env` : `NOTAK_ORIGINE=https://pi.<votre-réseau>.ts.net` (le nom que montre `tailscale serve status`), puis
  `docker compose up -d`. Tailscale sert de relais HTTPS : il écrit l'adresse de l'appareil dans `X-Forwarded-For`, et
  le `NOTAK_RELAIS=1` de l'image convient ; le port reste sur `127.0.0.1`. Les limites : seuls les appareils de votre
  réseau Tailscale joignent le serveur (chaque ordinateur, chaque téléphone y installe Tailscale ; les autres personnes
  s'y invitent, ou reçoivent la machine en partage), et le nom en `ts.net` est public, inscrit dans les journaux de
  certificats, sans que cela ouvre l'accès au serveur. `tailscale funnel --bg 3005` à la place ouvre le serveur à tout
  Internet : c'est alors un serveur public, comme sous un nom de domaine.
- **Un nom de domaine à vous, sans rien ouvrir** : Caddy obtient le certificat par le défi DNS (le module de votre
  fournisseur DNS, `tls { dns … }`), sans qu'Internet joigne la machine, et le réseau local résout ce nom vers elle
  (une entrée dans la box ou le DNS local).
- **Une autorité de certification à vous** (`tls internal` de Caddy, ou mkcert) : son certificat racine s'installe
  alors sur chaque ordinateur qui se connecte (l'app se fie aux certificats du système), et sur chaque téléphone ;
  Firefox tient sa propre liste. À réserver à des machines que vous tenez vous-même.

## Les variables

Toutes se mettent dans le `.env`, sauf les trois dernières, que l'image règle elle-même.

| Variable | Par défaut | Ce qu'elle règle |
|---|---|---|
| `NOTAK_ORIGINE` | `http://localhost:3005` dans `compose.yaml`, aucune hors de lui (développement) | l'adresse publique du serveur, telle qu'on la tape (`https://notak.exemple.fr`, sans chemin ni `/` final) : liens envoyés, retours de connexion, l'adresse que l'app de bureau attend, et celle des images d'aperçu des liens |
| `NOTAK_ADRESSE_PUBLIQUE` | `NOTAK_ORIGINE` | l'adresse où un autre appareil joint le serveur, quand elle diffère de `NOTAK_ORIGINE` (en développement : celle du Mac sur le réseau local ou Tailscale). La page « Envoyer vers Notak » la donne aux Raccourcis de l'iPhone ; sans elle, et sur une page ouverte en `localhost`, elle dit qu'un iPhone ne peut rien envoyer |
| `NOTAK_AUTRES_ORIGINES` | aucune | d'autres origines, séparées par des virgules, dont les pages peuvent se connecter, se synchroniser et écrire (sans `NOTAK_ORIGINE`, `http://localhost:5173` l'est déjà). Une écriture vers l'API (`POST`, `PUT`, `PATCH`, `DELETE`) qui porte une autre origine est refusée (403, `origine_refusee`), même d'un sous-domaine voisin qui reçoit le cookie ; seules la connexion (Better Auth) et l'arrivée par jeton n'y sont pas soumises |
| `NOTAK_OPENFGA_URL` | `http://localhost:8080` | l'OpenFGA qui évalue les droits (`compose.yaml` le fixe à `http://openfga:8080`) |
| `NOTAK_NOM` | `Notak` | le nom affiché sur l'écran de connexion et dans l'aperçu des liens |
| `NOTAK_INSCRIPTIONS` | `ouvertes` | `fermees` : personne ne crée de compte seul (voir plus bas) |
| `NOTAK_MOTS_DE_PASSE` | `actives` | `desactives` : la connexion par mot de passe se ferme, l'écran d'entrée ne propose plus que le SSO d'un espace et les fournisseurs (voir plus bas) |
| `NOTAK_HABILLAGES` | `/donnees/habillages` | le dossier des thèmes à fournir aux comptes |
| `NOTAK_HABILLAGE_DEFAUT` | aucun | l'identifiant du thème proposé à qui n'en a pas choisi |
| `NOTAK_HABILLAGE` | aucun | l'identifiant du thème imposé à tous : le choix de chacun ne compte plus |
| `NOTAK_CLE`, `NOTAK_CLE_FICHIER` | aucune | la clé du chiffrement au repos (voir plus bas) |
| `NOTAK_SECRET` | tiré au premier démarrage, gardé dans `/donnees/secret` | signe les cookies de session ; le changer déconnecte tout le monde |
| `NOTAK_GOOGLE_ID`, `NOTAK_GOOGLE_SECRET` | aucun | « Continuer avec Google » ; de même `MICROSOFT` et `GITHUB`. Retour : `<NOTAK_ORIGINE>/api/auth/callback/<fournisseur>` |
| `NOTAK_SMTP_URL`, `NOTAK_EXPEDITEUR` | aucun | les courriels (mot de passe oublié, invitations) ; sans eux, les liens vont au journal |
| `NOTAK_IDP_INTERNES` | aucune | les origines des fournisseurs d'identité du réseau interne qu'un espace peut déclarer en SSO, séparées par des virgules (`http://keycloak.lan`) ; écrites autrement, corrigées comme `NOTAK_ORIGINE` |
| `NOTAK_RATTACHEMENTS` | aucun | les autres outils (un CRM, un gestionnaire de projets…) dont chaque fiche peut avoir son dossier ici, en JSON (voir « Rattacher les fiches d'un autre outil ») |
| `NOTAK_ADMINS` | aucun | les adresses des admins du serveur, séparées par des virgules : ils voient, dans l'app, qu'une nouvelle version existe. Aucun droit de plus sur les tableaux ni les espaces |
| `NOTAK_VERIFIER_MAJ` | `1` | `0` : le serveur ne regarde plus s'il existe une nouvelle version (voir « Mettre à jour ») |
| `NOTAK_SIGNALEMENTS` | aucun | le dossier où ranger les signalements de bugs (⇧⌘S dans l'app, par un compte connecté), dans l'image un dossier de `/donnees` (`/donnees/signalements`) ; sans lui, le serveur n’en reçoit pas. `bun run signalements` les lit ; un outil rattaché avec `signalements: true` en fait des tickets |
| `PEXELS_API_KEY` | aucune | la banque d'images du panneau « Image » ; sans elle, seulement ses propres fichiers |
| `NOTAK_COOKIE_SECURISE` | `1` dans l'image, `0` hors d'elle | des cookies `Secure`, qui ne passent qu'en HTTPS : derrière un relais |
| `NOTAK_RELAIS` | `1` dans l'image, `0` hors d'elle | le nombre de relais de confiance devant le serveur : l'adresse du client est l'entrée que le dernier ajoute à `X-Forwarded-For`. `0` : aucun, c'est l'adresse de la connexion. `2` seulement si le second croit le premier (voir « Le relais HTTPS ») |
| `NOTAK_HOTE` | toutes les interfaces | hors de l'image : l'adresse où le serveur écoute, `127.0.0.1` derrière un relais de la même machine (voir « Sans Docker »). Dans l'image, laissez-la vide : c'est `NOTAK_ECOUTE` qui choisit où le port s'ouvre sur la machine |
| `PORT` | `3005` | le port d'écoute, dans le conteneur |
| `NOTAK_DONNEES` | `/donnees` | le dossier des données |
| `NOTAK_WEB` | `/notak/web` dans l'image | le dossier de l'application web construite (`apps/web/dist`), servie avec l'API ; sans lui, l'API seule (en développement, Vite sert les pages) |

Et pour `compose.yaml` seulement, dans le même `.env` : `NOTAK_VERSION` (l'image à prendre, `latest` par défaut, voir
« Mettre à jour »), `NOTAK_PORT` (le port de la machine, `3005` par défaut) et `NOTAK_ECOUTE` (l'adresse de la
machine où il s'ouvre, `127.0.0.1` par défaut, voir « Le relais HTTPS »).

Ces réglages se lisent au démarrage : après un changement, `docker compose up -d` recrée le conteneur avec eux
(`docker compose restart` ne relit pas le `.env`). `GET /api/instance` rend ce que le serveur en a compris : nom,
inscriptions, thèmes, version. `GET /api/sante` dit, sans compte, que le serveur répond (`{ "produit": "notak",
"version": …, "origine": …, "ok": true }`) : c'est ce que surveille le conteneur.

Les admins sont reconnus à leur adresse : créez leur compte tôt (ou par `compte.ts`, plus bas), avant qu'un autre ne
s'inscrive avec la même.

## Rattacher les fiches d'un autre outil

Un autre outil, un CRM par exemple, peut donner à chacune de ses fiches son dossier dans Notak : un bouton de la fiche
ouvre l'adresse `/relier` du serveur, qui ouvre le dossier de la fiche, ou propose de le créer s'il n'existe pas encore.
Rien ne se crée avant ce clic : les fiches qu'on n'ouvre jamais n'ont pas de dossier, et la bibliothèque ne s'encombre
pas de toutes les autres. Les dossiers d'un outil sont rangés dans un seul, « Clients » par exemple, posé dans l'accueil
de l'espace ; dedans, chacun range autant de toiles, de pages et de cartes mentales qu'il veut.

Chaque outil se déclare dans `NOTAK_RATTACHEMENTS`, une liste JSON :

```
NOTAK_RATTACHEMENTS=[{"source":"crm","nom":"Mon CRM","dossier":"Clients","origine":"https://crm.exemple.fr","espace":"<id de l'espace>"}]
```

| Champ | Ce qu'il dit |
|---|---|
| `source` | ce que l'outil écrit dans l'adresse, en minuscules, chiffres et tirets |
| `nom` | le nom de l'outil, tel qu'on le lit dans Notak (« Ouvrir la fiche dans Mon CRM ») |
| `dossier` | le titre du dossier qui range ceux de l'outil |
| `origine` | l'adresse de l'outil : le lien de retour vers une fiche doit y être, sans quoi il est refusé |
| `espace` | facultatif : l'espace où ranger les dossiers, pour qu'une équipe les partage. Sans lui, chacun a les siens, dans son espace personnel. Nommé après coup, l'outil ne voit plus que les dossiers de cet espace. Ceux rangés avant dans un espace personnel et restés vides y passent au démarrage (recréés au même titre, par la même personne, l'outil prévenu par `dossier.cree`), et l'ancien dossier de la source part à la corbeille de son espace ; ceux qui rangent quelque chose restent à qui les a créés, et l'outil n'en est plus prévenu |
| `secret` | facultatif, 32 caractères au moins : il signe ce que l'outil demande à Notak et ce que Notak lui envoie (voir « Le catalogue »). Jamais rendu par l'API |
| `webhook` | facultatif, avec `secret` : l'adresse, en https, où Notak prévient l'outil de ce que les gens font des dossiers |
| `signalements` | facultatif, `true`, avec `secret` et `webhook` : l'outil reçoit aussi les signalements de bugs (⇧⌘S) pour en faire des tickets (voir « Le catalogue ») |
| `agentAdresse` | facultatif, avec la porte des agents ouverte (`agents`, voir `docs/AGENTS.md`) : l'adresse, en https, où Notak relaie ce qu'on demande à l'agent de l'outil depuis un tableau (voir « Solliciter l'agent depuis un tableau »). Sans elle, le panneau de l'agent ne paraît pas |

Le bouton de la fiche ouvre :

```
https://notak.exemple.fr/relier?source=crm&cle=societe:42&titre=Dupont%20SARL&retour=https://crm.exemple.fr/societes/42
```

`cle` est l'identifiant de la fiche dans l'outil (lettres, chiffres, `:`, `.`, `_` et `-`, 128 au plus) : une fiche n'a
qu'un dossier par espace. `titre` nomme le dossier à sa création, et il le garde. `retour` est l'adresse de la fiche,
que le dossier rappelle par un lien. Quelqu'un qui n'est pas connecté passe d'abord par l'écran de connexion, puis
revient à la même adresse. Un dossier jeté à la corbeille y reste : le bouton propose de le remettre, jamais d'en faire
un second.

### Une fiche rangée sous d'autres : `dans`

Une fiche qui appartient à d'autres (un projet à son client, ou à plusieurs : une société et ses établissements) se
range sous elles, avec `dans`, une ou plusieurs fiches de la même source. Elle garde **un seul dossier** : son vrai
parent est le dossier de la première, et sous chacune des autres, un **raccourci** y mène, une carte qui ouvre le même
dossier sans en être une copie.

```
https://notak.exemple.fr/relier?source=crm&cle=projet:7&titre=Refonte%20du%20site&dans=societe:12%20Dupont%20SARL&dans=etablissement:4
```

`dans` se répète, une fiche chacun : sa clé, puis, après une espace, le titre de son dossier s'il faut le créer (à
défaut, la clé). Sans `dans`, rien ne change : le dossier se range dans celui de l'outil. La page le transmet à
`POST /api/rattachements/<source>/<cle>`, en JSON, `{ "titre", "adresse", "dans": ["societe:12", { "cle":
"etablissement:4", "titre": "Atelier de Limoges" }] }` : chaque entrée est une clé, ou `{ cle, titre }` ; 20 au plus,
sans la fiche elle-même. Une liste mal écrite est refusée (400, `dans_invalide`), et rien n'est créé.

**À la création** (le clic sur « Créer le dossier ») :

- le dossier de la fiche se range dans celui de la première fiche liée où la personne peut écrire, ce dernier créé au
  besoin dans le dossier de l'outil (lui-même fait au besoin), au titre donné, et l'outil en est prévenu par
  `dossier.cree` ;
- une fiche liée dont le dossier est fermé à la personne (elle ne le voit pas, ou n'y écrit pas) ou à la corbeille est
  passée : la suivante range le dossier. Si aucune ne le peut, il va dans le dossier de l'outil, comme sans `dans` ;
  et si la personne n'y écrit pas non plus, la création est refusée (403, `interdit`) ;
- sous chacune des autres, un raccourci est posé, là où la personne peut écrire.

**Au rappel** d'un dossier déjà là, avec une liste changée : la page `/relier`, ouverte avec `dans`, accorde les
raccourcis avant d'ouvrir le dossier, sans clic, puisqu'elle ne crée aucun dossier.

- le vrai parent ne bouge jamais, même si sa fiche sort de la liste ;
- une fiche liée nouvelle reçoit un raccourci, si son dossier existe et que la personne y écrit. Une fiche liée sans
  dossier n'en reçoit pas au rappel : il se crée quand on ouvre sa fiche, et le rappel suivant y pose le raccourci ;
- sous une fiche sortie de la liste, le raccourci que Notak a posé est retiré, s'il est resté tel quel. Celui que
  quelqu'un a déplacé, rangé ou jeté reste, et Notak l'oublie ; un raccourci posé à la main n'est jamais retiré ;
- un raccourci que Notak a déjà posé n'est pas reposé, même si quelqu'un l'a retiré depuis ;
- `dans=` vide, seul, vaut une liste vide : Notak retire ses raccourcis restés tels quels.

On n'écrit que là où la personne peut écrire : un raccourci sous une fiche qu'elle ne peut pas toucher n'est ni posé
ni retiré, et attend le rappel de quelqu'un qui le peut. La réponse de `POST`, quand la demande porte `dans`, dit ce
qu'il en est de chacune, dans l'ordre donné : `"dans": [{ "cle", "lien", "tableau"? }]`, où `lien` vaut `dossier` (elle
range le vrai parent), `raccourci` (un raccourci y mène), `interdit` (son dossier est fermé à la personne), `jete` (il
est à la corbeille) ou `absent` (pas encore de dossier, au rappel). `GET …/<cle>` ne change pas.

Le dossier de chaque entité montre le projet, dans la bibliothèque comme dans `GET …/<cle>/contenu` : sous la
première, c'est le vrai parent ; sous les autres, l'entrée porte `"raccourci": true`, et son `chemin` mène au même
dossier, rangé ailleurs. Seulement pour qui lit le projet : un raccourci vers un dossier privé, bloqué ou fermé à la
personne ne montre rien. Dans la bibliothèque, le raccourci est marqué d'une flèche devant le titre ; on l'ouvre d'ici,
mais on ne le déplace, ne le renomme ni ne le jette d'ici : la vraie toile est rangée chez la première entité.

Ces dossiers, celui de chaque fiche et celui qui les range, sont générés par l'outil, et Notak le dit à la suite de leur
titre. Personne ne les renomme, ne les déplace, ne les jette ni ne les modifie plus : ni leur nom, ni leur couleur, ni
leur mot de passe, ni leur carte, qui ne fait que changer de place sur la toile qui la porte : elle n'en part pas, et ne
se pose nulle part une seconde fois (un raccourci, si). Seul l'outil le peut : il les crée, et il les jette ou les
remet par son catalogue (plus bas). Le serveur refuse ces gestes, avec le code `dossier_genere`, et la synchro annule
ceux qui lui arriveraient d'une app plus ancienne. On range dedans ce qu'on veut ; on les partage, on les met en
favori, on copie leur lien, on les duplique (la copie, elle, n'est plus générée). Un ancien dossier que l'outil ne lit
plus (une source qui a nommé son `espace` après coup, ou qu'on ne déclare plus) redevient un dossier comme un autre.

L'outil peut aussi montrer, sur la fiche, ce que range son dossier. Ses pages lisent, avec la session de la personne :

| Adresse | Ce qu'elle rend |
|---|---|
| `GET /api/rattachements/<source>/<cle>` | `etat` : `present` ou `corbeille` (avec `tableau` et `titre`), `cache` (le dossier existe, la personne ne le voit pas) ou `absent` |
| `GET /api/rattachements/<source>/<cle>/contenu` | le même `etat`, et pour un dossier présent, `elements` : chaque toile, page, carte mentale, photo, lien ou fichier qu'il range et que la personne lit, avec `genre`, `titre`, `modifie` (ms, ou `null`) et `chemin` (à ajouter à l'adresse du serveur), du plus récemment changé au plus ancien ; une toile qu'un raccourci y montre, rangée ailleurs, porte en plus `raccourci: true` |

Ces deux adresses ne s'ouvrent (CORS, avec les cookies) qu'à l'`origine` déclarée de l'outil, et seulement en lecture.
L'appel se fait avec `credentials: 'include'`. Le cookie de session ne part que si l'outil et Notak sont sur le même
site (`crm.exemple.fr` et `notak.exemple.fr`) ; ailleurs, l'outil n'a que le bouton. Sans session, la réponse est un
401 : l'outil propose alors de se connecter à Notak.

### Le catalogue : ce que l'outil et Notak se disent

Un outil qui a un `secret` dialogue aussi avec Notak de serveur à serveur, sans session, par un catalogue fermé. Rien,
dans ce catalogue, n'efface quoi que ce soit : un dossier va à la corbeille de sa toile, et en revient.

Chaque message est signé : l'en-tête `Notak-Signature: t=<secondes unix>,v1=<hex>` porte l'HMAC-SHA256 de
`<t>.<corps brut>` par le secret, et n'est valable que cinq minutes. Plusieurs `v1` passent, pour changer de secret sans
coupure.

**Ce que l'outil demande** : `POST /api/outils/<source>`, en JSON, `{ "id": …, "action": …, "cle": … }`. L'`id` (8 à
128 caractères) rend la demande sûre à renvoyer : la même, sept jours durant, rend la même réponse sans rien refaire.

| Action | Ce que fait Notak |
|---|---|
| `lire` | rien ; rend `{ etat, dossiers: [{ espace, etat, tableau, titre, jete_par }] }`, `etat` valant `present`, `corbeille` ou `absent` |
| `jeter` | met le dossier de la fiche à la corbeille, dans chaque espace, en notant que l'outil l'y a mis ; rend comme `lire` |
| `remettre` | le remet, seulement si c'est l'outil qui l'avait jeté : ce qu'une personne a jeté reste jeté ; rend comme `lire` |
| `fusionner` | réservé : refusé (`action_reservee`) |
| `lire_signalement` | seulement pour un outil qui reçoit les signalements, avec `cle` = `signalement:<id>` ; ne change rien et rend `{ etat, id, texte, contexte, par, quand, captures }`, `etat` valant `a-traiter`, `traite` ou `absent`, `texte` les mots de la personne tels quels (vide si elle n'a rien écrit), `par` `{ nom, email }`, `captures` `[{ nom, png }]` en base64. Cette réponse ne se garde pas : la même demande se refait |
| `classer_signalement` | de même, avec en plus `ticket` facultatif (la référence du ticket, lettres, chiffres, `.`, `_`, `:` et `-`) : l'écrit au bas du signalement et le range dans les traités ; rend `{ etat }`, `traite` ou `absent` |

Les refus : 404 si la source n'a pas de secret, 401 (`signature_invalide`) si la signature ne va pas, 400 pour une
demande hors du catalogue. Un dossier remis après qu'on a vidé la corbeille de sa toile y retrouve une carte neuve.

**Ce que Notak envoie** à `webhook`, signé de même : `{ "id", "type", "cle", "quand", "par" }`, où `type` vaut
`dossier.cree`, `dossier.jete` ou `dossier.remis`, `quand` est en millisecondes et `par` est le nom de qui a fait le
geste. Un outil qui reçoit les signalements reçoit aussi `signalement.depose`, où `id` et `cle` valent tous deux
`signalement:<id>` : le même `id` à chaque essai. Les signalements qui attendaient quand on a réglé `signalements` lui
sont annoncés au démarrage du serveur, une seule fois chacun. Un envoi qui n'obtient pas de réponse 2xx est relancé (une minute, puis le double, une heure au plus) pendant
environ une semaine. Un geste que l'outil a lui-même demandé ne lui est pas renvoyé. L'envoi ne fait que prévenir :
l'outil relit l'état par `lire` avant d'en tirer quoi que ce soit.

### Solliciter l'agent depuis un tableau

Avec `agents: true` et `agentAdresse`, l'agent (`agent`, « Fram ») paraît dans Notak pour qui **lit** le tableau et dont
le compte est lié au SSO de l'outil (`fournisseur`, à défaut le nom de la source) ; il agit avec les droits de cette
personne, et la porte des agents refuse ce qu'elle ne pourrait pas faire. On y écrit ce qu'on attend (« fais une carte
mentale de ce client à côté », « crée une page pour ce rendez-vous », « range ce tableau dans le dossier Clients ») ;
Notak relaie la demande, signée du `secret`, à `agentAdresse`, et suit le tour **en direct** jusqu'à sa réponse, aussi
longtemps qu'il dure (un tour peut prendre vingt minutes). L'agent agit par la porte des agents : ses gestes arrivent en direct. Rien n'est gardé dans Notak : le fil des
échanges est celui de l'outil (`apps/serveur/src/fram.ts`). La demande se rattache au tableau d'où l'on écrit : une
toile, un dossier, ou l'accueil depuis la bibliothèque.

Ce que Notak envoie, `POST agentAdresse`, signé comme le reste (`Notak-Signature`) ; la personne y est désignée par le
sujet de son compte lié (`sub`) et son adresse :

| `type` | Corps | Réponse attendue |
|---|---|---|
| `fram.demander` | `{ id, personne: { sub, email }, tableau: { id, titre, lien }, selection: [{ id, texte }], message, pieces? }`, `id` un UUID neuf par demande ; `pieces` : les identifiants rendus par `fram.piece`, 10 au plus, absent sans pièce ; `message` peut être vide quand `pieces` ne l'est pas | `{ tour, fil, etat }` ; pendant un tour, le message est mis en file : `{ tour, fil, etat: "waiting" }` |
| `fram.journal` | `{ personne, tableau, tour, depuis }`, `depuis` la dernière `suite` rendue (`0` à la première lecture) | `{ tour, etat, fini, suite, encore, evenements, crees, ouvrir, texte, echec, cartes }` (voir plus bas) |
| `fram.arreter` | `{ id, personne, tableau, tour }`, `id` un UUID neuf | `{ tour, etat }` |
| `fram.lire` | `{ personne, tableau, tour }` | `{ tour, etat, fini, texte, echec, cartes }`, et peut-être `crees`, `ouvrir` |
| `fram.fil` | `{ personne, tableau }` | `{ fil, echanges: [{ qui, texte, quand }], tour, parties? }`, `parties` : `[{ id, debut, fin, resume }]`, la plus récente d'abord, 20 au plus |
| `fram.decider` | `{ id, personne, tableau, tour, cartes: [{ id, accord, toujours }] }`, `id` un UUID neuf | `{ tour, etat }` |

Et à une adresse à part, `POST agentAdresse/pieces`, même signature, un corps de 36 Mo au plus :

| `type` | Corps | Réponse attendue |
|---|---|---|
| `fram.piece` | `{ id, personne, tableau, nom, type_mime, contenu }`, `id` un UUID neuf, `contenu` le fichier en base64 (25 Mo au plus avant encodage) | `{ piece, nom, taille }` ; un refus : `{ erreur: "<phrase>" }` (avec un statut 4xx autre que 404) |

`fram.lire` rend aussi les cartes du tour arrêté sur elles, `[{ id, resume, definitif }]` : la bulle les montre avec « Autoriser », « Toujours dans cette conversation » (jamais pour un geste définitif) et « Refuser », et relaie la réponse par `fram.decider`. La conversation est une par personne, d'un tableau à l'autre : « toujours » vaut pour elle. Un 404 de l'outil vaut « pas pour cette personne » : la bulle ne paraît pas. Un 409 se dit (« ne peut pas prendre ce
message maintenant ») ; le reste vaut une panne passagère.

`fram.lire` peut dire aussi ce que le tour a créé, `crees: [{ type, titre, tableau, element? }]`, et ce que l'agent veut
montrer à la personne, `ouvrir: { tableau, element? } | null`. Notak n'en garde que ce que la personne lit, et en refait
le titre, le genre et l'adresse (celle que donnerait « Copier le lien » de la bibliothèque) : l'outil ne fabrique jamais
un lien que l'app suivrait. L'app en tire un bouton « Ouvrir » par création, et ouvre une fois ce que l'agent veut
montrer. Les deux champs sont facultatifs : un outil qui ne les donne pas reçoit `crees: []` et `ouvrir: null`.

#### Le direct d'un tour

Pendant un tour, la bulle lit `fram.journal` chaque seconde, depuis la dernière `suite`. `encore: true` dit que d'autres
événements attendent : elle relit aussitôt. Il n'y a plus de coupure : la bulle suit le tour jusqu'à `fini: true`.
`crees` et `ouvrir` ont la forme et le traitement de `fram.lire` ; `crees` donne la liste à jour à chaque lecture (ce qui
est créé paraît en puce « Ouvrir » dès que c'est écrit) ; `cartes` aussi, quand `etat` vaut `awaiting_approval`. Chaque
événement porte un numéro `seq` (croissant, jamais rejoué) et un `genre` :

| `genre` | Champs | Ce que la bulle en fait |
|---|---|---|
| `etat` | `etat` (`queued`, `waiting`, `running`, `awaiting_approval`, `cancelling`, `cancelled`, `failed`, `done`) | la ligne vivante dit l'état |
| `texte` | `bloc`, `ajout`, `etape` | `ajout` s'ajoute au bloc ; `etape: false`, c'est la réponse, écrite au fil de l'eau ; `etape: true`, une étape du fil conducteur |
| `pensee` | `titre`, `resume?` | un pas du fil conducteur |
| `geste` | `id`, `statut` (`en_cours`, `attente`, `fait`, `echec`, `refuse`), `phrase` | un pas du fil ; un `geste` de même `id` remplace le précédent. `phrase` est toujours là, en français, au présent pendant le geste, au passé une fois fait (« Je lis le tableau… », « J'ai lu le tableau ») |
| `plan` | `etapes: [{ titre, statut }]` (`a_faire`, `en_cours`, `fait`, `echec`, `saute`) | le plan, remplacé à chaque événement |
| `echec` | `message` | la ligne vivante le dit |
| `fin` | | le tour est fini ; `fini: true` le confirme |

La **ligne vivante**, sous la question, dit le dernier événement, et le temps écoulé à la seconde. L'outil garantit un
événement toutes les huit secondes au moins, pour que la personne ne lise jamais longtemps la même phrase. Le fil
conducteur (gestes, pensées, étapes écrites) se replie sous la réponse quand le tour finit (« 5 étapes · 1 min 12 ») ;
il ne survit pas à un rechargement, ni les puces. Un genre que Notak ne connaît pas est tu ; les textes sont bornés
(20 000 signes par `ajout`, 300 par phrase, 500 événements par lecture).

« Arrêter » envoie `fram.arreter` ; le journal dit ensuite la fin (`etat: "cancelled"`), et la réponse est marquée
« Arrêté ». Le champ reste ouvert pendant un tour : un message envoyé alors part aussitôt, l'outil le met en file
(`etat: "waiting"`), et la bulle le montre « en attente » jusqu'à la fin du tour en cours, puis suit son tour à lui.

#### Les pièces jointes

Une ou plusieurs images collées (⌘V), des fichiers de tout genre déposés sur la conversation ou sur la bulle, ou
choisis par le trombone : chacun part dès qu'on le joint, par le serveur de Notak (`POST /api/tableaux/:id/agent/pieces?nom=…`,
les octets tels quels, leur genre dans `content-type`), qui le borne à 25 Mo et le relaie à l'outil (`fram.piece`).
Rien n'est gardé dans Notak. Les limites se disent avant l'envoi : 25 Mo par fichier, 10 par message, aucun fichier
vide. Un refus de l'outil (`{ erreur }`) se lit sur la pièce, et retient le message tant qu'elle n'est pas retirée.
Le message part quand toutes ses pièces sont arrivées, avec leurs identifiants dans `pieces`.

#### Les parties précédentes

`fram.fil` peut rendre les parties précédentes de la conversation (`parties`) : « Plus tôt » les déplie en tête du fil,
de la plus ancienne à la dernière, chacune avec sa date et son résumé (Markdown). Sans le champ, rien ne paraît.

#### La page ou la carte ouverte

Une demande faite depuis une page ou une carte mentale ouverte en grand la dit ouverte : Notak la met en tête de la
sélection, `{ id, texte: "La page « … » est ouverte en grand : <adresse>" }`, sans rien ajouter d'autre au corps. Le
`lien` du tableau est son adresse dans l'app : `/t/<id>` pour une toile, `/?dossier=<id>` pour un dossier.

## Fermer les inscriptions

Avec `NOTAK_INSCRIPTIONS=fermees` dans le `.env` (puis `docker compose up -d`), l'écran de connexion ne propose plus
de créer un compte, et l'API refuse l'inscription, par mot de passe comme par un fournisseur (`403`, code
`INSCRIPTIONS_FERMEES`). Le SSO d'un espace, qu'un admin d'espace a déclaré, fait encore entrer les gens de son
entreprise. Les comptes se créent depuis la machine du serveur :

```bash
docker compose exec notak node apps/serveur/src/compte.ts --email ana@exemple.fr --nom Ana
```

Le mot de passe est tiré au hasard et écrit une fois dans le terminal, ou pris dans `NOTAK_MOT_DE_PASSE`. Il ne passe
jamais par la ligne de commande, qui reste dans l'historique. Un tableau partagé avec une adresse sans compte
attend toujours son invitée : il la retrouve quand son compte est créé.

## Fermer la connexion par mot de passe

Avec `NOTAK_MOTS_DE_PASSE=desactives` dans le `.env` (puis `docker compose up -d`), le serveur refuse la connexion,
l'inscription, la réinitialisation et le changement de mot de passe, et n'envoie plus aucun courriel de compte
(réinitialisation, vérification d'adresse) : `403`, code `MOTS_DE_PASSE_FERMES`. L'écran d'entrée ouvre
sur le SSO, sa seule porte. Un seul fournisseur SSO déclaré sur le serveur, et l'écran y va droit, sans même demander
d'adresse — elle ne sert qu'à le départir de plusieurs. Les fournisseurs déclarés par l'environnement (Google,
Microsoft, GitHub) restent proposés à côté. Le compte créé en ligne de commande (`serveur:compte`) passe par l'API
interne de Better Auth et reste possible, mais personne ne se connecte plus par son mot de passe. Pour reprendre la
main si le SSO tombe, remettez `NOTAK_MOTS_DE_PASSE=actives` (ou ôtez la ligne) et redémarrez. Sans la variable, le mot de passe reste ouvert et rien ne change.

## L'aperçu des liens

Un lien vers le serveur collé dans iMessage, WhatsApp, Slack, Teams, Discord, LinkedIn, Signal ou un courriel s'y
montre en carte : un titre, une phrase, et une image de 1200 × 630 que le serveur dessine lui-même (balises Open Graph,
`apps/serveur/src/apercuLien.ts`). Le robot qui la lit n'a pas de session, et ne reçoit que ce que l'adresse ouvre déjà :

- une toile ou un élément (`/t/…`) : leur nom, jamais leur contenu. Son propriétaire peut le masquer dans « Partager »
  (« Montrer le nom dans l'aperçu du lien ») ; une toile protégée par un mot de passe ne le dit jamais ;
- un lien visiteur (`/p/…`) : le titre de la toile, un extrait de son texte et son plan, avec ses photos. Un lien
  inconnu, échu, révoqué ou protégé par un mot de passe n'en dit rien ;
- une invitation : son jeton reste après `#`, l'aperçu ne nomme personne.

L'image et l'adresse des cartes viennent de `NOTAK_ORIGINE` : sans elle, de l'adresse où la page est demandée. Le
texte y est dessiné avec Inter, rangée dans `apps/serveur/src/polices` (licence SIL OFL) : l'image du serveur n'a besoin
d'aucune police installée. `NOTAK_NOM` y remplace « Notak ». Les plateformes gardent une carte des jours durant :
pour revoir celle d'une adresse déjà partagée, passez-la dans leur outil de débogage (celui de Facebook, ou
`/unfurl` de Slack), ou ajoutez-y `?` puis n'importe quoi.

## Ajouter un thème

Déposez le fichier dans le dossier des thèmes (le serveur le crée au démarrage), puis redémarrez. Par exemple avec
le thème d'exemple du dépôt :

```bash
curl -fsSLO https://raw.githubusercontent.com/Anonym0os/notak/main/exemples/habillages/silak.json
docker compose cp silak.json notak:/donnees/habillages/silak.json
docker compose restart notak
```

Votre propre thème est un fichier `.json` du même format, décrit dans [`HABILLAGES.md`](HABILLAGES.md). Au démarrage,
chaque fichier est relu par la même liste blanche que dans le navigateur. Un fichier refusé est signalé dans le
journal du conteneur et laissé de côté : il n'empêche pas le serveur de démarrer. Les thèmes du serveur apparaissent
dans les réglages de chacun, à côté de ceux qu'on importe soi-même.

## Chiffrer au repos

Avec une clé (`NOTAK_CLE`, 32 octets en base64 tirés par `openssl rand -base64 32`, ou `NOTAK_CLE_FICHIER`), le
serveur écrit chiffrés le contenu des tableaux et les fichiers déposés. **Perdre la clé, c'est perdre les données** :
on la garde hors du serveur, et on la sauvegarde à part.

- `NOTAK_CLE=…` dans le `.env` : le `.env` tient alors la clé, gardez-le pour vous seul (`chmod 600 .env`).
- Ou `NOTAK_CLE_FICHIER=/run/secrets/notak_cle` dans le `.env`, avec le fichier monté dans le conteneur par un
  `compose.override.yaml` à côté de `compose.yaml` (que la mise à jour remplace) :

  ```yaml
  services:
    notak:
      volumes:
        - /root/notak_cle:/run/secrets/notak_cle:ro
  ```

  Le fichier doit se lire par l'utilisateur `node` de l'image. L'une ou l'autre, jamais les deux.

Ce qui était écrit avant se chiffre à sa prochaine écriture. Pour tout chiffrer d'un coup, la clé écrite dans le `.env` :

```bash
docker compose stop notak
docker compose run --rm --no-deps notak node apps/serveur/outils/chiffrer.ts
docker compose up -d
```

L'outil dit combien de documents et de fichiers il a chiffrés. « 0 document(s) et 0 fichier(s) » sur un serveur qui a
des tableaux veut dire qu'il n'a pas ouvert le bon dossier. Ce qui reste en clair et le refus de démarrer sur une clé
fausse sont décrits dans le [README](../README.fr.md), section « Le chiffrement au repos ».

## Sauvegarder

Tout est dans `/donnees`. Avec le chiffrement, une sauvegarde ne se relit qu'avec la même clé (et le `.env` la tient
peut-être : sauvegardez-le à part). Une copie du volume, serveur arrêté, ou `sqlite3 notak.db ".backup copie.db"`
pour la base, suffit à tout remettre en place.

Pour restaurer une base sur la même machine, effacez aussi le volume d'OpenFGA avant de redémarrer, comme pour
« Revenir en arrière » (plus bas) : il tient les droits d'après la base qu'on remplace. Sur une machine neuve, son
volume est vide et Notak le remplit de lui-même.

## Mettre à jour

Dans le dossier de `compose.yaml` :

```bash
curl -fsSLO https://github.com/Anonym0os/notak/releases/latest/download/compose.yaml
docker compose pull && docker compose up -d
```

La première ligne reprend le `compose.yaml` de la dernière version publiée : c'est lui qui fixe la version d'OpenFGA,
et `docker compose pull` seul ne la change jamais, puisqu'il relit le fichier qu'on a. Sans elle, les correctifs
d'OpenFGA n'arrivent pas. Le fichier se remplace sans rien perdre : les réglages sont dans le `.env`, vos ajouts dans
`compose.override.yaml`. Il se prend toujours à la dernière version, même pour un serveur tenu à une version plus
ancienne : il ne fixe que la version d'OpenFGA, qui ne fait que monter ; celle de Notak suit `NOTAK_VERSION`.

La commande relit le `.env` : les réglages restent. Chaque version publiée de Notak a son image :
`ghcr.io/anonym0os/notak:0.2.0`, `:0.2` (la dernière 0.2.x) et `:latest` (la dernière tout court), que `compose.yaml`
prend par défaut. Un serveur regarde de lui-même, une minute après son démarrage puis toutes les douze heures, s'il en
existe une plus récente : il l'écrit une fois dans son journal (`docker compose logs notak`), avec la commande
ci-dessus, et les admins (`NOTAK_ADMINS`) la voient dans l'app, avec ses notes. Il ne fait que le dire : rien ne
s'installe sans vous. Cette vérification lit le même fichier que les apps de bureau
(`https://github.com/Anonym0os/notak/releases/latest/download/latest.json`) : GitHub voit l'adresse IP du serveur, rien
d'autre ne part. `NOTAK_VERIFIER_MAJ=0` la coupe.

**La base se sauvegarde d'elle-même** : avant chaque migration, le serveur en écrit une copie,
`/donnees/notak.db.avant-<n>` (`<n>` : le numéro de la migration qui suit), et n'y touche qu'ensuite. Une migration qui
échoue est annulée en entier, et le serveur s'arrête sans rien servir. Une base neuve, vide, n'est pas copiée.

**Pour se tenir à une version**, plutôt que de suivre `latest` : `NOTAK_VERSION=0.2.0` dans le `.env`. `0.2` reçoit
les corrections de la 0.2 seulement, mais les reçoit dès leur publication ; seule une version exacte ne change jamais.

**Pour mettre à jour tout seul**, une tâche planifiée suffit ; par exemple, chaque nuit à 4 h (`crontab -e`) :

```cron
0 4 * * * cd /srv/notak && curl -fsSLO https://github.com/Anonym0os/notak/releases/latest/download/compose.yaml && docker compose pull -q && docker compose up -d
```

ou, avec systemd, un service `notak-maj.service` (`Type=oneshot`, `WorkingDirectory=/srv/notak`, et
`ExecStart=/bin/sh -c '…'` avec la même commande, sans le `cd`) et son minuteur `notak-maj.timer`
(`OnCalendar=*-*-* 04:00`, `Persistent=true`, puis `systemctl enable --now notak-maj.timer`). La tâche suit ce que dit
le `.env` : `latest`, donc chaque version dès sa publication, ou la version à laquelle vous vous tenez.

**Les autres installations** :

- **Depuis les sources** (`compose.source.yaml`) : `git pull` (ou `git checkout` de l'étiquette voulue), puis la même
  commande qu'à l'installation ; le `compose.yaml` du dépôt vient avec.
- **Coolify** : *Redeploy* dans son interface. S'il garde sa propre copie de `compose.yaml` (collée à la main),
  remplacez-la d'abord par celle de la version ; avec « Docker Image », montez aussi à la main l'image d'OpenFGA.
- **Sans Docker** : dans le dépôt, `git fetch --tags && git checkout v0.3.0` (la version voulue), `bun install
  --frozen-lockfile`, `bun run build`, puis redémarrez le service ; OpenFGA, à la version que nomme `compose.yaml`.

**Revenir en arrière.** Une base migrée refuse un code plus ancien qu'elle (le serveur ne démarre pas, plutôt que de
l'abîmer). Pour revenir à la version d'avant, il faut donc aussi reprendre la base d'avant. D'abord, les copies :

```bash
docker compose down        # pas « down -v » : il effacerait aussi le volume des données
docker compose run --rm --no-deps --entrypoint sh notak -c 'ls -lt /donnees'
```

Les copies `notak.db.avant-<n>` que la mise à jour vient d'écrire portent son heure. Prenez, parmi elles, celle dont
le `<n>` est le plus petit : c'est la base d'avant la mise à jour. Puis, `N` réglé à ce numéro (rien ne bouge si la
copie n'existe pas) :

```bash
N=8                                # le numéro de la copie choisie
docker compose run --rm --no-deps -e N="$N" --entrypoint sh notak -c 'cd /donnees && test -f "notak.db.avant-$N" &&
  d=$(date +%Y%m%d-%H%M) && mv notak.db "notak.db.abandonnee-$d" && rm -f notak.db-wal notak.db-shm &&
  mv "notak.db.avant-$N" notak.db && mkdir "copies-$d" && mv notak.db.avant-* "copies-$d"/; ls -l'
docker volume rm notak_openfga     # le volume d'OpenFGA (docker volume ls) : Notak le refait depuis la base
```

Écrivez ensuite dans le `.env` la version d'avant (`NOTAK_VERSION=0.2.0`, par exemple ; changez la ligne si elle y est
déjà), puis `docker compose up -d`. La tâche planifiée, s'il y en a une, s'y tient aussi ; pour suivre de nouveau
`latest`, retirez la ligne.

Pourquoi chaque geste :

- `mv`, pas `cp` : la prochaine mise à jour écrit une copie fraîche. Une copie qui existe déjà est gardée telle quelle
  (elle vient d'un essai qui a échoué), donc les autres copies sont mises de côté dans `copies-<date>`.
- La base abandonnée reste à côté, datée : rien n'est effacé. Ce qui a été fait depuis la mise à jour n'est plus dans
  la base reprise ; les fichiers déposés, eux, restent.
- OpenFGA ne tient qu'une copie des droits : gardé, il garderait les partages et les retraits faits depuis la mise à
  jour, que la base reprise ne connaît plus, et un tableau resterait ouvert à quelqu'un sans que l'écran de partage le
  montre. Son volume effacé, Notak le refait depuis la base au démarrage (le journal dit « le magasin OpenFGA … a
  disparu, il est recréé et rempli depuis la base »).

Une mise à jour qui n'a écrit aucune copie n'avait pas de migration : l'image d'avant suffit, la base et OpenFGA
restent.

## Construire depuis les sources

Pour une version modifiée (l'AGPL demande alors d'en publier le code à qui s'en sert), ou pour ne dépendre d'aucune
image publiée :

```bash
git clone https://github.com/Anonym0os/notak
cd notak
docker compose -f compose.yaml -f compose.source.yaml up -d --build
```

[`compose.source.yaml`](../compose.source.yaml) remplace l'image publiée par celle que construit le `Dockerfile` du
dépôt ; les réglages vont dans le `.env` du dépôt cloné, comme plus haut. Avec ces deux `-f`, Compose ne lit plus
`compose.override.yaml` de lui-même : ajoutez `-f compose.override.yaml` s'il y en a un. Pour mettre à jour : `git
pull`, puis la même commande.

## Vérifier l'image

Chaque image publiée porte une attestation de provenance, signée par GitHub : elle a été construite par la publication
de ce dépôt, depuis l'étiquette de sa version, et rien d'autre. Avec la CLI de GitHub :

```bash
gh attestation verify oci://ghcr.io/anonym0os/notak:0.2.0 -R Anonym0os/notak
```

Les étiquettes `x.y` et `latest` ne sont posées que sur une image dont cette attestation a été vérifiée. L'image porte
aussi son numéro, son dépôt et sa licence dans ses étiquettes (`org.opencontainers.image.version`, `.source`,
`.licenses`).

## Depuis l'app de bureau

L'app de bureau (Mac, Windows, Linux) s'ouvre sur les toiles de l'ordinateur, sans serveur. Elle peut aussi se
connecter au vôtre : elle ouvre alors ses pages dans sa fenêtre, avec les comptes, le partage et le travail à plusieurs
en direct, comme dans un navigateur. Elle se télécharge sur la
[page des versions](https://github.com/Anonym0os/notak/releases/latest) ; le fichier à prendre pour chaque système, et
ce que demande le premier lancement : [README](../README.fr.md#installer-lapp-de-bureau), « Installer l'app de bureau ».

- **L'écran « Se connecter à un serveur Notak »** demande l'adresse du serveur, celle de `NOTAK_ORIGINE`. On y arrive
  par le bandeau du premier lancement (« Vous avez un serveur Notak ? »), par « Se connecter à un serveur Notak… »
  dans « Où sont mes toiles ? », ou par « Changer de serveur… » dans les réglages. L'app vérifie que c'est bien un
  serveur Notak, assez récent (`GET /api/sante`), et qu'il se dit à cette adresse ; sinon elle dit pourquoi, et
  propose l'adresse qu'il annonce. L'écran rappelle le serveur retenu, et « Oublier ce serveur » ferme sa session sur
  cet ordinateur.
- **Deux lieux qui restent séparés** : les toiles de l'ordinateur y restent, celles du serveur restent sur le serveur.
  « Toiles de cet ordinateur » les montre le temps de cette session, sans changer l'endroit où Notak s'ouvre ;
  « Revenir sur notak.exemple.fr » ramène au serveur. Sur Mac, le menu « Notak » propose aussi « Changer de
  serveur… » et « Toiles de cet ordinateur », même quand la page du serveur ne répond plus.
- **« Copier mes toiles sur notak.exemple.fr »**, dans « Où sont mes toiles ? », prépare une copie des toiles de
  l'ordinateur et ouvre le serveur, qui demande « Importer les toiles de cet ordinateur sur notak.exemple.fr ? » :
  la copie s'ajoute à votre accueil sur le serveur une fois que vous l'acceptez, et rien n'est supprimé sur
  l'ordinateur. Un fichier `.notak` ouvert d'un double clic pendant qu'on est sur le serveur s'y propose de même.
- **Les réglages** (⌘, sur Mac, Ctrl+, ailleurs, puis « App de bureau ») disent où Notak s'ouvre au démarrage, sur cet ordinateur ou sur
  notak.exemple.fr, et le changent ; on y trouve aussi « Changer de serveur… » et les mises à jour de l'app. Si le
  serveur ne répond pas au lancement, l'app propose d'ouvrir les toiles de l'ordinateur pour cette fois.
- **HTTPS avec un vrai certificat** (Let's Encrypt par Caddy, par exemple) est exigé : l'app refuse un certificat
  auto-signé ou expiré, et le HTTP en clair. Seule exception : `http://localhost`, pour un essai sur sa machine. Un
  serveur du réseau local, sans nom de domaine : voir « Un serveur à la maison, sans nom de domaine ».
- **La connexion par mot de passe** se fait dans l'app. **Celle par Google, Microsoft, GitHub ou le SSO d'un espace**
  passe par votre navigateur : ces fournisseurs refusent de s'afficher dans une app. L'app montre un code, ouvre la page
  `/bureau/autoriser` de votre serveur dans le navigateur, où vous vous connectez comme d'habitude ; la page dit d'où et
  quand le code a été demandé, vous le confirmez, et l'app est connectée. Un code ne vaut que dix minutes, et pour la
  seule app qui l'a demandé : confirmez seulement un code que vous voyez dans votre propre app.
- **Le contenu vient du serveur**, à jour à chaque ouverture ; la coque de l'app se met à jour de son côté, comme
  toujours. Un serveur trop ancien pour l'app le dit, avec la commande de mise à jour.
