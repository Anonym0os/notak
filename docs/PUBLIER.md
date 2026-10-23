# Publier Notak gratuitement, souverain, sans stocker les données des autres

> Proposition du 23/10/2026, revue le même jour. Contraintes :
> - **100 % souverain** : aucun service tiers (ni Cloudflare, ni Google, ni Dropbox, ni S3, ni CDN), aucune API
>   extérieure appelée par l'application.
> - **Un seul serveur, le nôtre**, qui sert l'application et quelques services légers.
> - **Aucun stockage à payer pour les utilisateurs** : le serveur ne garde ni leurs tableaux ni leurs fichiers.
> - **Gratuit pour les gens**, et pourtant leurs tableaux les suivent d'un appareil à l'autre et se partagent.
>
> Le serveur actuel (`apps/serveur`, comptes et stockage) reste l'édition auto-hébergée, pour qui veut tout chez
> soi (association, entreprise, famille). Cette page décrit l'édition publique de notak.app.

## 1. Le principe : les données vivent sur les appareils, le serveur ne fait que mettre en relation

Notak est déjà *local d'abord* : chaque tableau est un document Yjs gardé dans IndexedDB, et deux copies d'un même
tableau se fusionnent toujours, sans conflit, dans n'importe quel ordre. Un serveur qui conserve n'est donc pas
nécessaire. Il suffit que les appareils **se trouvent** et **s'échangent** ce qui leur manque.

```
   Téléphone ◄──────── WebRTC direct (chiffré) ────────► Ordinateur
       │                                                     │
       └──────────► notre serveur : se trouver, ◄────────────┘
                    relayer si le direct échoue,
                    garder un transit chiffré borné
                    (jamais la seule copie, jamais d'images)
```

Le serveur rend six services, tous sans compte et sans stockage qui grossisse avec les utilisateurs :

| Service | Ce qu'il fait | Ce qu'il coûte |
|---|---|---|
| Fichiers de l'application | sert le site (HTML, JS, CSS, polices) | rien de plus qu'aujourd'hui |
| Rendez-vous | met en relation les appareils d'une même salle (signalisation WebRTC) | des messages de quelques octets |
| STUN / TURN (`coturn`) | aide les appareils à se joindre en direct ; relaie quand le direct est impossible | de la bande passante seulement |
| Relais WebSocket | rediffuse les mises à jour **chiffrées** entre présents, en mémoire | de la bande passante seulement |
| Boîte de transit | garde les mises à jour chiffrées le temps qu'un autre appareil vienne les chercher | **un plafond fixe**, voir § 4.4 |
| Aperçus de liens | lit une page et rend titre et image (déjà fait par `apercu.ts`) | du calcul ; rien n'est gardé |

Le serveur ne voit jamais un tableau en clair : la clé ne quitte pas les appareils. Il n'a pas de base
d'utilisateurs, pas de mots de passe, pas de fichiers envoyés. Côté RGPD et LCEN, il n'est pas l'hébergeur des
contenus : il transporte des octets illisibles.

## 2. Les espaces et les salles, sans compte

- **Un espace** = tous les tableaux d'une personne. Au premier lancement, l'appareil tire au hasard une clé d'espace
  (256 bits). C'est elle qui chiffre tout, et son empreinte nomme la salle de rendez-vous sur le serveur.
- **Relier un appareil** = lui donner cette clé, par un **QR code** ou un **code de 6 mots** affiché sur le premier
  appareil. Le code ne sert qu'une fois et expire au bout de 10 minutes : le premier appareil envoie la vraie clé,
  chiffrée, par la salle d'appariement.
- **Un tableau partagé** a sa propre clé et sa propre salle, séparées de l'espace : on peut partager un tableau sans
  ouvrir son espace.

## 3. L'expérience, du premier clic au travail à plusieurs

### 3.1 Arriver
- notak.app → **un tableau vide tout de suite**, sans inscription ni écran de bienvenue. C'est la différence la plus
  visible avec Milanote.
- Les bulles de découverte existantes (`BullesDecouverte`) font le reste.
- On ne demande rien. Le prénom ne sert qu'à la présence ; on le demande au premier partage, une fois.

### 3.2 Ne rien perdre
Sans serveur qui garde une copie, l'appareil est le coffre. Ça doit se voir dans l'interface, dès la première
version :

- `navigator.storage.persist()` au premier contenu, et une invitation à **installer** Notak (la PWA existe :
  `apps/web/pwa`). Installé, Safari n'efface plus les données au bout de 7 jours sans visite.
- Une **pastille d'état** dans l'en-tête, toujours au même endroit :
  - « Sur cet appareil seulement » (gris) → *Relier un autre appareil*, *Télécharger une copie*
  - « À jour avec 2 appareils » (vert)
  - « 3 changements en route vers votre téléphone » (orange : ils attendent dans le transit ou sur l'appareil)
  - « Votre téléphone n'a rien reçu depuis 12 jours » (rouge doux : l'ouvrir suffit)
- **Exporter / Importer** un `.notak` (zip : documents Yjs et images) marche toujours, sans réseau.
- Sans second appareil relié, un rappel par mois : « Dernière copie il y a 30 jours ».
- Un **dossier de sauvegarde** au choix : l'application de bureau (Tauri) et Chrome (API d'accès aux fichiers)
  peuvent écrire une copie continue dans un dossier. Si ce dossier est synchronisé par un outil que la personne a
  déjà (Syncthing, Nextcloud, kDrive, une clé USB), c'est son affaire et sa place, pas la nôtre.

### 3.3 Retrouver ses tableaux sur un autre appareil
- Réglages → **Mes appareils** → *Relier un appareil* → QR code + code de 6 mots.
- Sur l'autre appareil : premier écran → **J'ai déjà Notak ailleurs** → scanner ou taper les mots.
- Les deux espaces **s'additionnent** (fusion Yjs) : on ne choisit jamais « garder celui-ci ou celui-là ».
- Chaque appareil relié apparaît dans la liste avec son nom et sa dernière vue (« iPhone · il y a 3 h »), et se
  retire d'un geste (la clé d'espace change alors, les autres appareils la reçoivent).
- Les changements partent **en direct** si l'autre appareil est allumé, sinon **par le transit** (§ 4.4), qui les
  lui remet à sa prochaine ouverture.

### 3.4 Les images
Elles ne passent jamais par le stockage du serveur. Le texte voyage partout, les images voyagent d'appareil à
appareil :

- À l'ajout, l'image est réduite dans le navigateur (1600 px, WebP), rangée en OPFS sous son empreinte, et le
  tableau garde une **miniature floue** (quelques centaines d'octets) et ses proportions.
- Un appareil qui n'a pas encore l'image affiche la miniature floue, à la bonne taille, et la demande aux autres
  appareils présents. Dès qu'il l'a, il peut à son tour la donner (comme un essaim).
- Si personne qui l'a n'est en ligne, la carte le dit simplement : « L'image arrivera quand votre ordinateur sera
  allumé » (ou « quand Léa sera en ligne » sur un tableau partagé).
- Les transferts passent en WebRTC direct ; quand le direct est impossible, par TURN : c'est de la bande passante,
  pas du disque.

### 3.5 Partager et travailler à plusieurs
- **Partager** → *Peut modifier* / *Peut voir* → le lien est copié : `notak.app/p/<salle>#<clé>`. La partie après
  `#` ne quitte jamais le navigateur.
- La personne invitée ouvre le lien, tape son prénom, travaille. Le tableau rejoint son espace, sous « Partagés
  avec moi », et la suit sur ses propres appareils.
- *Peut voir* : le relais refuse toute écriture qui ne présente pas le secret d'écriture, que seul le lien
  *modifier* contient.
- **Retirer l'accès** = changer de clé. Le tableau passe dans une nouvelle salle, les anciens liens meurent ; on
  renvoie le nouveau lien à qui doit le garder.
- **Mot de passe** sur un tableau : la clé est tirée du mot de passe (Argon2id dans le navigateur).
- **Asynchrone** : Léa modifie le soir, Samy ouvre le lendemain matin. Les mises à jour attendent Samy dans le
  transit ; les images, elles, attendent qu'un appareil qui les a soit en ligne.

### 3.6 Quand le plafond du transit est atteint
Rien ne se perd, puisque le transit n'est jamais la seule copie : les changements restent sur l'appareil qui les a
faits et partent en direct dès que l'autre est là. La pastille le dit : « Votre téléphone recevra ces changements
la prochaine fois que les deux seront ouverts en même temps. »

## 4. Comment ça marche dessous

### 4.1 Les coutures existent déjà
`packages/tableau/src/coeur/espaceDistant.ts` définit `Reseau` (`persister`, `connecter`, `declarer`) ;
`DepotFichiers` sert les images. Le serveur actuel n'est qu'une implémentation (`creerReseauNavigateur`). L'édition
publique en ajoute deux, qu'on compose :

| Implémentation | Rôle |
|---|---|
| `creerReseauLocal` | IndexedDB seul ; `declarer` range le tableau dans l'index de l'espace (`index.yjs`) |
| `creerReseauPair(salle, cle)` | WebRTC entre appareils d'une salle, repli sur le relais WebSocket, puis sur le transit ; chiffrement AES-GCM de chaque mise à jour |
| `creerReseauNavigateur` | l'actuel, pour l'édition auto-hébergée |
| `DepotFichiers` en OPFS + essaim | images rangées par empreinte, demandées aux pairs présents |

L'application choisit à la construction (`VITE_EDITION=publique|serveur`).

### 4.2 Le serveur de l'édition publique
Un petit programme Node à côté de l'actuel, sans base de comptes (`apps/relais`) :

- `/salle` (WebSocket) : on rejoint une salle par l'empreinte de sa clé ; le serveur relaie la signalisation WebRTC
  et, à défaut de direct, les mises à jour chiffrées. Tout en mémoire.
- `/transit` : dépôt et retrait de mises à jour chiffrées (§ 4.4).
- `/apercu` : l'actuel `apercu.ts`, limité en débit par adresse IP (`debit.ts` existe), avec un cache en mémoire.
- `coturn` à côté pour STUN/TURN, avec des identifiants temporaires délivrés par `/salle`.

### 4.3 Ce qui voyage
- Les mises à jour Yjs, chiffrées une à une, regroupées à la seconde comme aujourd'hui.
- À l'arrivée dans une salle : chacun annonce son vecteur d'état (chiffré), et l'on s'envoie seulement ce qui
  manque. C'est le protocole de synchro Yjs habituel, simplement chiffré.
- La présence et les curseurs (awareness), chiffrés aussi, jamais gardés.

### 4.4 La boîte de transit, bornée
C'est le seul disque utilisé sur le serveur, et il est **plafonné quel que soit le nombre d'utilisateurs** :

- Elle garde des **mises à jour texte chiffrées**, jamais d'images.
- Une salle annonce ses membres (appareils ou personnes, sous un nom opaque) ; une mise à jour est effacée dès que
  tous l'ont accusée reçue. En régime normal, la boîte est presque vide.
- Plafonds : 1 Mo par salle, 30 jours au plus par mise à jour, et un plafond global choisi une fois pour toutes
  (2 Go par exemple, dans un fichier SQLite). Au-delà, les plus anciennes partent d'abord.
- Le transit n'est **jamais la seule copie** : ce qu'il perd reste sur l'appareil d'origine et repartira en direct.

Pour un ordre de grandeur, une journée de travail sur un tableau de texte pèse quelques dizaines de Ko de mises à
jour Yjs. 2 Go absorbent des dizaines de milliers de salles actives. Et si l'on refuse même ce disque-là, il suffit
de régler le plafond à zéro : tout marche encore, mais seulement entre appareils ouverts en même temps.

### 4.5 Ce que fait le serveur actuel, et où ça va

| Aujourd'hui (`/api/…`) | Édition publique |
|---|---|
| inscription, connexion, sessions | supprimé : la clé d'espace remplace le compte |
| `fichiers`, `fichiers/:id` | OPFS sur chaque appareil, échange entre pairs |
| `apercu`, `fichiers/rapatrier` | `/apercu` du relais ; l'image rapatriée est rangée sur l'appareil |
| `recherche` | dans le navigateur (`coeur/recherche.ts` existe) |
| `tableaux/:id/export`, `medias` | dans le navigateur (`fflate` est déjà une dépendance du web) |
| `partage`, `acces`, `lien`, `mot-de-passe`, `public` | clés de salle (§ 3.5) |
| `activite`, `notifications`, `recents` | tirés du document Yjs (qui a changé quoi depuis ma dernière visite), sans notification poussée |
| `favoris`, `vu`, réglages du compte | `index.yjs`, le document de l'espace, donc suivis d'un appareil à l'autre |
| `jetons`, `arrivee` (Raccourci iOS, envoi par jeton) | la cible de partage de la PWA suffit sur l'appareil ; l'envoi par jeton reste une fonction de l'édition serveur |
| page publique | un lien *voir* ; elle ne s'affiche que si un appareil qui a le tableau est en ligne, ou si l'auteur l'a « publiée » en fichier statique (export HTML qu'il héberge où il veut) |

## 5. Ce qu'on a écarté

| Piste | Pourquoi non |
|---|---|
| Cloudflare, Google Drive, Dropbox, OneDrive, S3 | services tiers, non souverains |
| Le serveur actuel ouvert à tous | on stockerait les tableaux et les fichiers de chacun : un disque qui grossit, des sauvegardes, le statut d'hébergeur |
| Pair à pair sans aucun serveur | les appareils ne se trouvent pas sans rendez-vous, et le direct échoue derrière beaucoup de réseaux mobiles sans TURN |
| Stockage chez l'utilisateur par WebDAV (Nextcloud…) | souverain, mais rare chez le grand public, et les règles CORS des serveurs WebDAV obligent souvent à passer par un proxy ; à garder pour plus tard, en option |
| Faire payer | contraire au but ; si la bande passante devient un sujet, des dons (Liberapay) ou l'édition auto-hébergée |

## 6. Les risques, dits franchement

- **Un seul appareil, pas de copie** : on perd tout en perdant l'appareil. La pastille, l'installation, le
  rappel mensuel et la liaison d'un second appareil sont là pour ça ; ils font partie du minimum.
- **Images en attente** : entre deux appareils jamais allumés ensemble, une image n'arrive pas tant que celui qui
  l'a n'est pas rouvert. C'est le prix de « pas de stockage » ; la miniature floue rend l'attente lisible.
- **Clé perdue = espace perdu** : pas de « mot de passe oublié ». Tant qu'un appareil relié existe, on relie les
  nouveaux à partir de lui.
- **Lien = clé** : qui a le lien a le tableau. Il faut le dire au moment de copier le lien.
- **Bande passante TURN** : c'est le seul poste qui grandit avec l'usage. Sur un serveur à trafic illimité (offre
  courante chez les hébergeurs français), ça ne change pas la facture ; on peut aussi plafonner le débit par salle.

## 7. Dans quel ordre

| Passe | Contenu | Livre |
|---|---|---|
| A | `creerReseauLocal`, images en OPFS, `/apercu` sans compte, construction statique servie par notre serveur | notak.app utilisable, sans compte, sur un appareil |
| B | pastille d'état, `persist()`, invitation à installer, export/import `.notak`, rappel de copie, dossier de sauvegarde | on ne perd plus rien par surprise |
| C | `apps/relais` + `coturn` : salles, appariement par QR code et 6 mots, synchro chiffrée entre ses appareils, images par essaim | ses tableaux sur tous ses appareils |
| D | boîte de transit bornée | la synchro quand les appareils ne sont pas allumés ensemble |
| E | tableaux partagés : liens *voir* / *modifier*, présence, curseurs, mot de passe, retrait d'accès | le travail à plusieurs |
| F | `VITE_EDITION` : la même interface ; l'édition serveur garde comptes, notifications et envoi par jeton | deux éditions, un seul code |

La passe A suffit à publier. Chaque passe suivante ajoute un étage sans rien retirer au précédent.
