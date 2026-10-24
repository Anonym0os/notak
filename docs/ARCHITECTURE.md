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
  modeles/            les tableaux modèles (accueil, réunion, voyage…)
apps/web              l'application : deux éditions, choisies à la construction
  main.tsx            charge edition/locale.tsx ou edition/serveur.tsx selon VITE_EDITION
  edition/            ce qui est propre à chaque édition (services, en-tête, routes)
  local/              l'édition locale : fichiers, copies .notak, panneau « Où sont mes tableaux ? », synchro
apps/serveur          l'édition serveur : Hono (API, comptes, fichiers), Hocuspocus (synchro), SQLite
apps/site             notak.app : l'édition locale derrière nginx, et la page « À propos »
apps/bureau           la coque de bureau (Tauri)
```

## Le cœur : un tableau est un document Yjs

Un tableau est un document Yjs (`coeur/magasinYjs.ts`) :

| Clé | Contenu |
|---|---|
| `elements` | id → l'élément entier (JSON) et sa place dans l'empilement |
| `meta` | titre, couleur, étiquettes |
| `textes` | le texte riche de chaque note (Tiptap, écrit à plusieurs) |
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
session et les droits à chaque connexion ; `base.ts` est la base SQLite (comptes, tableaux, droits, activité, index
de recherche). Le serveur lit les tableaux avec le même code que l'application (`packages/tableau/src/export/`).

## Les essais

Vitest, à côté des sources (`x.ts` → `x.test.ts`), en Node par défaut, jsdom quand un fichier commence par
`// @vitest-environment jsdom`, `fake-indexeddb` pour ce qui touche IndexedDB. Les scénarios de synchro tirés au
hasard (`dossier/proprietes.test.ts`) se rejouent par leur graine : `NOTAK_GRAINE=42 bun run test proprietes`.
