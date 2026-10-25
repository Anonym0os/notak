# L'architecture de Notak, en une page

```
packages/tableau      @notak/tableau : tout ce qui ne dépend ni d'un serveur ni d'une application
  coeur/              le modèle, sans React : tableaux, géométrie, caméra, sélection, historique, magasins
  elements/           un dossier par type d'élément (note, lien, image, colonne…), inscrits au registre
  Toile.tsx           la toile : dessin, gestes, sélection, glisser, zoom
  EspaceNotak.tsx     l'espace : en-tête, fil d'Ariane, barre d'outils, et la toile du tableau ouvert
  reseau.ts           le réseau de l'édition serveur (Hocuspocus sur WebSocket, IndexedDB pour le hors-ligne)
  reseauLocal.ts      le réseau de l'édition locale (IndexedDB, relais entre onglets)
  dossier/            le moteur de synchro par dossier (le « coffre ») et ses essais
  export/             le texte, le Markdown et les médias d'un tableau (partagé avec le serveur)
  fichierEspace.ts    le format .notak
  habillage/          les thèmes en fichier (couleurs, rayons, polices, Pitch, cartes) : format, feuille, choix (docs/HABILLAGES.md)
  modeles/            les tableaux modèles (accueil, réunion, voyage…)
apps/web              l'application : deux éditions, choisies à la construction
  main.tsx            charge edition/locale.tsx ou edition/serveur.tsx selon VITE_EDITION
  edition/            ce qui est propre à chaque édition (services, en-tête, routes)
  local/              l'édition locale : fichiers, copies .notak, panneau « Où sont mes tableaux ? », synchro
apps/serveur          l'édition serveur : Hono (API, fichiers), Better Auth (comptes, sessions), Hocuspocus (synchro), SQLite
apps/site             notak.app : l'édition locale derrière nginx, et la page « À propos »
apps/bureau           la coque de bureau (Tauri)
```

## Le cœur : un tableau est un document Yjs

Un tableau est un document Yjs (`coeur/magasinYjs.ts`) :

| Clé | Contenu |
|---|---|
| `elements` | id → l'élément entier (JSON) et sa place dans l'empilement |
| `meta` | titre, couleur, étiquettes |
| `textes` | le texte riche de chaque note, liste de tâches et document (Tiptap, écrit à plusieurs) |
| `lignes` | les lignes de texte simples |
| `arbres` | les sujets, relations, limites et résumés des cartes mentales, une entrée par objet (`<élément>␟<dictionnaire>␟<id>`, `coeur/arbresYjs.ts`) |

La toile ne voit pas Yjs. Elle parle à un `Magasin` (`coeur/magasin.ts`) : `lire()`, `faire(opérations)`,
`annuler()`. Les opérations (`coeur/tableau.ts`) sont des données (`creer`, `deplacer`, `contenu`, …), qu'on sait
inverser, ce qui donne l'historique. Ce qu'on lit d'un document passe par `coeur/valider.ts` : il peut venir d'un
autre appareil ou d'une autre version, et un élément mal formé est caché sans rien faire planter.

## Les éléments : un registre

Chaque type d'élément s'inscrit au registre (`elements/registre.ts`) avec `registre.type({...})`. Il y déclare :
- son rendu ;
- ses outils (barre de gauche, barre de sélection) ;
- ce qu'il accepte quand on colle ou qu'on dépose ;
- ses proportions, s'il s'édite, s'il range d'autres éléments.

La toile ne connaît aucun type par son nom. Pour en ajouter un, voir `CONTRIBUTING.md`.

## Le moteur de blocs

Le document s'édite comme une page Notion (`docs/NOTION.md`) : menu « / », poignée, sélection de blocs, colonnes.
Le moteur vit dans `blocs/`, à part de l'élément, pour qu'un autre élément puisse le monter tel quel.

**Décision : un moteur hybride.** Notion range chaque bloc comme un enregistrement (`{id, type, properties,
content, format, parent}`) et donne à chaque bloc son propre champ éditable. Notak garde un seul éditeur
ProseMirror, dont chaque nœud de bloc porte un **id stable** (`blocs/ids.ts`), et une couche (`blocs/modele.ts`)
qui relit l'arbre comme des enregistrements à la Notion. Les gestes sur les blocs (`blocs/gestes.ts`,
`blocs/colonnes.ts`) les désignent par leurs ids. Motif : la sélection entre blocs, le collage, l'annulation, la
saisie des langues à composition et l'écriture à plusieurs par Yjs sont déjà justes dans ProseMirror ; un champ par
bloc obligerait à tout réécrire. Le prix : un bloc synchronisé (le même bloc à deux endroits) ou une base dont les
lignes sont des pages demanderont un stockage par bloc, que l'id stable prépare.

**Décision (24/10/2026) : des blocs à plat, rangés par leur retrait.** Chez Notion, tout bloc de texte peut porter
des enfants (Tab range un paragraphe sous un autre). Plutôt que d'imbriquer des nœuds, chaque bloc est un frère dans
la page (ou dans une colonne) et porte un `retrait` : ses enfants sont les blocs qui le suivent, plus en retrait
(`blocs/plats.ts`, `blocs/rang.ts`). Motif : les règles de Notion tombent d'elles-mêmes (Tab sur un bloc seul laisse
ses enfants en place ; Maj+Tab fait des frères suivants ses enfants), ProseMirror garde ses gestes de texte sur des
frères, et un bloc qui change de parent ne change qu'un attribut, ce qui laisse le fragment Yjs intact. Le prix : la
numérotation, ce qu'un dépliant fermé cache et le cadre d'un encadré se calculent (`blocs/structure.ts`, en
décorations), et un texte écrit dans l'écriture imbriquée (une note, un document d'avant) passe par
`blocs/migration.ts` : aplati à l'ouverture, déplié pour les exports et la conversion en note. Ce moteur deviendra
l'éditeur de toute l'application.

Un vieux client qui lit un bloc qu'il ne connaît pas ouvre le document en lecture seule plutôt que de le vider
(`blocs/lisible.ts`).

## L'espace et le réseau : ce qui distingue les deux éditions

`EspaceNotak` reçoit un `EspaceNavigable` : la liste des tableaux et leur magasin, la navigation de l'un à l'autre.
Les deux éditions le fabriquent avec `creerEspaceDistant` (`coeur/espaceDistant.ts`), qui ouvre un document par
tableau quand on en a besoin, le ferme ensuite, et le confie à un **`Reseau`** :

| | `persister` | `connecter` | `declarer` (un tableau neuf) |
|---|---|---|---|
| **Serveur** (`reseau.ts`) | IndexedDB, pour le hors-ligne | Hocuspocus : présence, droits, lecture seule | `POST /api/tableaux` |
| **Locale** (`reseauLocal.ts`) | IndexedDB, et un `BroadcastChannel` entre onglets | rien à relier : toujours « à jour » | l'inscrire dans l'index de l'espace (`coeur/indexEspace.ts`) |

Le reste vient de l'application, par les `Services` (`elements/types.ts`) :
- **où vont les fichiers** : le serveur, ou IndexedDB ;
- **la recherche dans tous les tableaux** : le serveur, ou une lecture locale ;
- **les aperçus de liens** : le serveur seulement ;
- **la liste des tableaux**, pour les mentions `[[`.

Un service absent fait simplement disparaître ce qui en dépend.

## L'édition locale

- **Copies `.notak`** (`fichierEspace.ts`, `apps/web/src/local/copie.ts`) : un zip qui contient l'état Yjs de chaque
  tableau et ses fichiers. Rouvrir fusionne : sa propre copie ne duplique rien.
- **Synchroniser avec un dossier** (`dossier/`, `apps/web/src/local/synchro.ts`) : le coffre écrit l'espace dans un
  dossier (iCloud Drive, OneDrive, Dropbox), dans un format sans conflit possible entre appareils. Son format et ses
  garanties sont dans `docs/STOCKAGE.md`. Il est éprouvé contre un faux logiciel de synchro qui retarde, réordonne,
  tronque et duplique (`dossier/essais/`).

## L'édition serveur

`apps/serveur/src/app.ts` décrit toutes les routes de l'API ; `synchro.ts` branche Hocuspocus, qui vérifie la
session et les droits à chaque connexion, et refuse une page venue d'un autre site ; `base.ts` est la base SQLite
(comptes, tableaux, droits, activité, index de recherche). Le serveur lit les tableaux avec le même code que
l'application (`packages/tableau/src/export/`).

Les comptes et les sessions sont confiés à Better Auth (`auth.ts`), monté sur `/api/auth/*` et branché sur la même
base : il écrit `utilisateurs` (ses champs anglais y portent nos noms), `account`, `session` et `verification`. Le
hachage reste Argon2 (`motsDePasse.ts`), pour que les empreintes d'avant restent valables. Ce qui suit une
inscription et qui est à Notak, l'accueil et les invitations en attente, est dans `comptes.ts`, appelé par un crochet
de Better Auth. Le schéma vient de `migrations.ts` : des migrations numérotées, suivies par `PRAGMA user_version`,
et un essai vérifie que Better Auth n'y trouve rien à ajouter.

Les espaces sont les organisations de Better Auth (`espaces.ts`) : ses rôles fixes gardent leurs noms anglais
(`owner`, `admin`, `member`, et `guest` en plus), parce que ses plugins s'y réfèrent. Un tableau appartient à un
espace (`tableaux.espace`), et la table `espaces` donne l'accueil de chacun. Le SSO d'un espace passe par `@better-auth/sso` ; sa découverte OIDC se fait dans `sso.ts`, sous la
garde réseau des aperçus de liens.

Les droits sont évalués par OpenFGA, d'après le modèle `apps/serveur/autorisation/modele.fga` et ses essais
(`modele.fga.yaml`, lancés par la CLI d'OpenFGA). Notak décrit ce que chacun a reçu en relations (objet, relation,
sujet) dans sa table `relations`, qui reste la vérité : un partage, un tableau qui hérite de son parent, l'espace d'un
tableau, un rôle d'espace et ce qu'il permet, une équipe, un lien public, un blocage. Chaque changement passe par la
`boite_envoi` dans la même transaction, puis part vers OpenFGA (`autorisation.ts`) ; une vérification vide d'abord la
boîte, et un magasin OpenFGA disparu se refait depuis la base. Les membres, rôles et équipes que Better Auth change
sont suivis par des déclencheurs SQL (`espaces_a_synchroniser`), puis recalculés (`synchroniserEspaces`). Le modèle
sait aussi les droits d'un élément.

La synchro contrôle ce qu'envoient un commentateur et quiconque écrit un tableau dont des éléments ont leurs droits
propres (`controle.ts`). Une mise à jour y est appliquée sous une origine suivie, ses changements relevés élément par
élément, et annulée aussitôt par un `Y.UndoManager` si elle n'est pas permise : l'annulation part chez tout le monde,
son auteur compris, si bien qu'un refus ne laisse ni divergence ni renvoi sans fin. La règle (écrire ou seulement
commenter) est dans `packages/tableau/src/coeur/reglesDroits.ts`, lue telle quelle par le serveur ; la toile s'en sert
pour ne proposer que les gestes permis (`droitsElements.ts`, `filtrerMagasin`).

### Le chiffrement au repos

**Perdre la clé, c'est perdre les données** : aucune porte de secours, c'est le principe.

- **La clé** vient de `NOTAK_CLE` (32 octets en base64) ou de `NOTAK_CLE_FICHIER` (le chemin d'un fichier qui la
  contient), lue par `index.ts` et passée à `demarrer`, puis à `ouvrirBase` et au contexte de `creerApp`.
- **L'enveloppe** (`chiffrement.ts`) : `NKC1` | id de clé (1 octet) | nonce (12) | tag (16) | données, en
  AES-256-GCM ; l'en-tête est authentifié avec les données. L'id de clé (1 aujourd'hui) prépare une rotation.
- **Ce qui est chiffré** : `documents.etat`, l'état Yjs de chaque tableau (`base.ts`, `document` et
  `enregistrerDocument`, par où passent aussi la synchro, l'export, la recherche et les pages publiques), et les
  fichiers de `fichiers/`, originaux et copies réduites (`app.ts`, `ranger`, `servirFichier`, `copieReduite`, l'archive
  des médias). Avec une clé, SQLite met à zéro ce qu'il efface (`secure_delete`).
- **Ce qui reste en clair** : les titres des tableaux, l'index FTS5 de la recherche, les extraits d'activité et de
  notification, les e-mails, noms et droits des comptes. Le serveur s'en sert sans ouvrir les tableaux ; on conseille
  de chiffrer aussi le disque de l'hôte.
- **La lecture est tolérante** : sans en-tête, une donnée est d'avant le chiffrement et se lit en clair ; elle repart
  chiffrée à sa prochaine écriture. Sans clé, le serveur est exactement celui d'avant (les fichiers sont même encore
  servis en flux). `bun run serveur:chiffrer` (`outils/chiffrer.ts`, `chiffrerTout.ts`) chiffre l'existant d'un coup :
  les documents dans une seule transaction suivie d'un `VACUUM`, les fichiers écrits à côté puis posés par `rename`.
- **Au démarrage**, `ouvrirBase` déchiffre un document chiffré s'il en existe un : une clé fausse, ou l'absence de
  clé, refuse d'ouvrir. Sinon la synchro partirait d'un document vide et l'enregistrerait par-dessus le vrai.

## Les essais

Vitest, à côté des sources (`x.ts` → `x.test.ts`), en Node par défaut, jsdom quand un fichier commence par
`// @vitest-environment jsdom`, `fake-indexeddb` pour ce qui touche IndexedDB. Les essais du serveur démarrent
un OpenFGA en mémoire par Docker (`vitest.openfga.ts`), ou se servent de celui que désigne `NOTAK_OPENFGA_ESSAI`. Les scénarios de synchro tirés au
hasard (`dossier/proprietes.test.ts`) se rejouent par leur graine : `NOTAK_GRAINE=42 bun run test proprietes`.
