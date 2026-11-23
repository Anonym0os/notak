# La porte des agents

Un agent d'un outil rattaché (son assistant, « Fram » par exemple) agit dans Notak **comme la personne pour qui il travaille** :
il parcourt sa bibliothèque, trouve ses tableaux, les lit, en crée, y pose des notes, des listes, des tables, des cartes
mentales, des pages et des lignes, les modifie, les range, les renomme, les range ailleurs et les jette à la corbeille. Il
passe par une seule route, signée du secret de son outil. Ses gestes arrivent en direct chez ceux qui ont le tableau
ouvert, et l'activité les dit « Samy avec Fram ». Une note qu'une personne est en train d'écrire au même instant garde ce
qu'elle y tape : mieux vaut ne pas récrire une note ouverte. Une page ouverte en écriture, elle, ne se modifie pas du
tout (`en_edition`).

**Version 2 du contrat** (`version` de `docs/agents.schemas.json`), le 22/11/2026 : les pages, les lignes, l'ajout à la
fin d'un texte et son retrait, l'empreinte d'une page (`attendu`), `modifier_tableau`, `deplacer`, la bibliothèque dans
`trouver`, et une adresse pour chaque création et pour chaque page ou carte mentale lue. Rien de la version 1 ne change
de sens, sauf qu'un élément `document` se lit maintenant sous le type `page`, en Markdown. Il n'y a pas de négociation :
un outil qui n'emploie pas les champs neufs fait ce qu'il faisait.

La porte ne pense pas à la place de l'agent : elle lui donne de quoi raisonner (un tableau lu en clair, sa mise en page,
des erreurs qui disent quoi faire) et elle fait le travail mécanique (les formats de l'app, les positions, l'absence de
chevauchement). Le contrat est **tiré du code** : `apps/serveur/src/agentsContrat.ts` porte les opérations et le schéma
JSON de leurs arguments ; `docs/agents.schemas.json` en est la copie que l'outil recopie dans les outils de son modèle
(`node scripts/schemas-agents.ts` la récrit, un essai vérifie qu'elle suit le code).

| Fichier | Rôle |
|---|---|
| `apps/serveur/src/agentsContrat.ts` | Les opérations, leurs schémas, la validation. |
| `apps/serveur/src/agents.ts` | Chaque opération, au nom de la personne et avec ses droits. |
| `apps/serveur/src/app.ts` | La route, la signature, la personne, l'idempotence ; ce que la porte demande au serveur (droits, présence de la synchro, rangement d'une toile, bibliothèque). |
| `apps/serveur/src/adresses.ts` | Les adresses, avec les règles de « Copier le lien » de la bibliothèque (`adresseDe`), pour la porte et le relais de l'agent (`fram.ts`). |
| `packages/tableau/src/agents/` | Ce qui se partage avec l'app : le Markdown des notes et des pages (`texte.ts`, qui reprend le collage du Markdown de l'app, `blocs/collageMarkdown.ts`), les éléments neufs, leur place et l'écriture dans le document (`poser.ts`), la lecture pour un agent (`lire.ts`). Un essai y vérifie que tout passe les schémas des éditeurs (celui des notes, celui du moteur des pages) et la validation de la toile, et que les tailles et les défauts sont ceux de l'app. Tout se charge sous Node, sans bundler. |

## Allumer la porte

Elle est **éteinte par défaut**. On l'allume pour une source de `NOTAK_RATTACHEMENTS` qui a déjà son `secret` :

```json
[{ "source": "crm", "nom": "Comptoir", "dossier": "Clients", "origine": "https://crm.exemple.fr", "secret": "…",
   "agents": true, "agent": "Fram" }]
```

| Clé | Sens |
|---|---|
| `agents` | `true` ouvre la porte à cette source. Absente, la route répond 404, comme si elle n'existait pas. |
| `agent` | Le nom de l'agent, tel que l'activité le montre (« Samy avec Fram »). 40 caractères au plus ; à défaut, « l'assistant ». |
| `fournisseur` | Le fournisseur SSO dont les comptes liés désignent les personnes ; à défaut, le nom de la source (`crm`). |
| `agentAdresse` | Où relayer ce qu'on demande à l'agent depuis un tableau (son panneau, `apps/serveur/src/fram.ts`) : en https. Sans elle, la porte s'ouvre, le panneau ne paraît pas. |

Tout se lit et se valide à un seul endroit, `sourcesDe` (`apps/serveur/src/rattachements.ts`) ; une clé écrite de
travers est oubliée, et le démarrage le dit.

Sans `secret`, la porte reste fermée, et le démarrage le dit.

Allumer la porte, c'est **faire confiance à l'outil** pour dire au nom de qui il agit : il peut désigner toute personne
dont le compte est lié à son SSO, ou dont le courriel est vérifié dans Notak, et il agit alors avec tous ses droits.
C'est la même confiance que le secret donne déjà à ses autres demandes ; elle ne vaut que pour une source qu'on tient.

## La demande

`POST /api/outils/{source}/agent`, un corps JSON de **512 Ko au plus**, signé comme les autres demandes de l'outil :

```
Notak-Signature: t=<secondes>,v1=<hex de HMAC-SHA256(secret, "<t>.<corps>")>
```

La signature vaut cinq minutes autour de l'horloge du serveur ; plusieurs `v1` passent (le temps de changer de secret).

```json
{
  "id": "fram-7f3c2a91-0001",
  "au_nom_de": { "sujet": "42", "courriel": "ana@exemple.fr" },
  "operation": "ajouter_elements",
  "arguments": { "tableau": "01JD…", "elements": [{ "type": "note", "texte": "# Relance\nAppeler **lundi**." }] }
}
```

- **`id`** : unique par demande (8 à 128 caractères, lettres, chiffres, `._:-`). La même demande renvoyée rend la même
  réponse pendant sept jours, sans rien refaire : un agent qui n'a pas reçu sa réponse renvoie sans crainte. Le même `id`
  pour une **autre** demande est refusé (`id_reutilise`). Les lectures (`trouver`, `lire_tableau`) se refont toujours.
- **`au_nom_de`** : la personne. D'abord `sujet`, l'identifiant de son compte chez l'outil, celui que le SSO a lié à son
  compte Notak ; sinon `courriel`, à condition que son adresse soit vérifiée dans Notak. **Aucun compte n'est jamais
  créé** : une personne qui ne s'est jamais connectée à Notak est refusée (`personne_inconnue`).
- **`operation`**, **`arguments`** : ci-dessous ; chaque opération a son schéma dans `docs/agents.schemas.json`.

## Les droits

Exactement ceux de la personne, jamais plus : elle doit lire le tableau pour le lire, l'éditer pour y écrire, et les
éléments qui ont leurs propres droits gardent les leurs. Un tableau protégé par un mot de passe qu'elle n'a pas ouvert
reste fermé à l'agent. Les cartes des toiles qu'elle ne lit pas n'apparaissent pas.

## La réponse

Réussie, en 200 : `{ "ok": true, "operation": "…", "resultat": { … } }`.

Refusée : `{ "ok": false, "code": "…", "erreur": "…" }`. `erreur` est une phrase faite pour le modèle : elle dit ce qui
ne va pas et quoi faire (« élément introuvable : 01JD…. Relis le tableau avec lire_tableau. »).

| Statut | `code` | Quand |
|---|---|---|
| 404 | `introuvable` | La porte est éteinte pour cette source, ou la source n'existe pas. |
| 401 | `signature_invalide` | Signature absente, fausse ou périmée. |
| 413 | `trop_gros` | Corps de plus de 512 Ko : découper la demande. |
| 400 | `corps_invalide` | L'enveloppe ne va pas (`id`, `au_nom_de`, `operation`). |
| 400 | `arguments_invalides` | Les arguments ne suivent pas le schéma ; `erreur` dit lequel (`elements[2].type : …`). |
| 403 | `personne_inconnue` | Aucun compte Notak lié à cette personne. |
| 404 | `tableau_introuvable` | Le tableau n'existe pas, ou la personne ne le lit pas. |
| 403 | `lecture_seule` | La personne lit ce tableau sans pouvoir l'écrire. |
| 423 | `verrouille` | Le tableau est protégé par un mot de passe qu'elle n'a pas ouvert. |
| 403 | `interdit` | La personne n'a pas le droit de faire ce geste-là, même en écrivant le tableau (`deplacer` : seul le propriétaire range un tableau ailleurs). |
| 423 | `en_edition` | La page est ouverte en écriture (par la personne ou par une autre) : son éditeur récrirait son contenu. Rien n'a changé ; une fois la page refermée, on recommence. |
| 404 | `element_introuvable` | Un élément nommé n'est pas (ou plus) sur le tableau. |
| 422 | `impossible` | La demande est bien formée mais ne se fait pas (une colonne dans une colonne, une boucle de dossiers, une note dans un dossier…). |
| 409 | `modifie_depuis` | La page a changé depuis que l'agent l'a lue ou modifiée (`attendu` n'est plus son empreinte) : rien n'a changé. |
| 409 | `acces_change` | Ranger ce tableau ailleurs changerait qui y a accès : rien n'a bougé. `erreur` dit qui y gagne ou y perd l'accès ; on recommence avec `accepter_acces` une fois l'accord de la personne obtenu. |
| 409 | `id_reutilise` | Cet `id` a déjà servi pour une autre demande. |

## Les adresses

Les liens à donner à la personne, sur l'origine du serveur (`https://notak.exemple.fr`), avec les règles de « Copier le
lien » de la bibliothèque (`apps/serveur/src/adresses.ts`) :

| Quoi | Adresse |
|---|---|
| un tableau (une toile, l'accueil compris) | `/t/<tableau>` |
| un dossier (il s'ouvre dans la bibliothèque, jamais en toile) | `/?dossier=<tableau>` |
| une page ou une carte mentale (elle s'ouvre en grand, où qu'elle soit) | `/t/<tableau>/e/<element>` |
| un autre élément, sur une toile (elle s'ouvre sur lui) | `/t/<tableau>/e/<element>` |
| un autre élément, dans un dossier ou sur l'accueil (il s'y choisit dans la bibliothèque) | `/?dossier=<tableau>&element=<element>` |

La porte rend toujours l'adresse toute faite, en entier : celle du tableau (`lire_tableau`, `creer_tableau`,
`modifier_tableau`, `deplacer`), celle de chaque élément créé (`ajouter_elements`), de chaque page et carte mentale lue
(`lire_tableau`), de chaque entrée de la bibliothèque et de ce que range un tableau (`trouver`).

## Les unités et la place

Les positions et les tailles sont en **unités de grille** (UG, 10 px à l'échelle 1) : `x`, `y` le coin haut gauche, `l` la
largeur, `h` la hauteur. Une note fait 34 UG de large, une colonne 34, une carte mentale 40 × 20. La hauteur d'un élément
qui suit son texte est estimée par le serveur, qui ne dessine pas : elle sert à raisonner sur la mise en page, pas au
pixel. Un élément rangé dans une colonne n'a pas de place à lui : il a `colonne` (l'identifiant de la colonne) et `rang`.

## Les opérations

### `trouver`

Où travailler. Arguments, tous facultatifs : `texte`, `dans`, `fiche`, `bibliotheque`, `genres`, `curseur`, `limite`.

```json
{
  "personne": { "nom": "Samy Agher" },
  "espaces": [{ "id": "…", "nom": "Agher Créations", "accueil": "<tableau>", "personnel": true }],
  "recents": [{ "tableau": "…", "titre": "Plan de lancement", "genre": "toile", "modifie": 1763700000000 }],
  "resultats": [{ "tableau": "…", "titre": "…", "element": "…", "extrait": "…relancer le …" }],
  "contenu": [{ "tableau": "…", "titre": "Prism", "genre": "toile", "element": "<sa carte>", "adresse": "https://…/t/…" },
              { "genre": "page", "titre": "Wilfried Robert", "element": "…", "adresse": "https://…/t/…/e/…" }],
  "fiche": { "etat": "present", "tableau": "…", "titre": "Boulangerie Martin" },
  "bibliotheque": {
    "entrees": [{ "genre": "dossier", "titre": "Clients", "tableau": "…", "adresse": "https://…/?dossier=…" },
                { "genre": "toile", "titre": "Prism", "tableau": "…", "dans": "<Clients>", "ou": "Clients", "adresse": "https://…/t/…", "favori": true },
                { "genre": "page", "titre": "Wilfried Robert", "tableau": "<Prism>", "element": "…", "ou": "Prism", "adresse": "https://…/t/…/e/…" }],
    "total": 132,
    "suite": "50"
  }
}
```

`recents` sans autre argument ; `resultats` avec `texte` (les tableaux dont le titre le contient, puis les éléments
qui le contiennent) ; `contenu` avec `dans` : ses toiles et ses dossiers (`genre`, `element` étant leur carte), puis ses
pages et ses cartes mentales ; `fiche` avec `fiche` (`etat` : `present`, `corbeille`, `absent`, ou `inaccessible` quand le
dossier existe sans que la personne y ait accès).

`bibliotheque: true` parcourt la bibliothèque de la personne, les plus récentes d'abord : ses toiles, ses dossiers, et
les pages et cartes mentales qu'ils portent (`genres` : `toile`, `dossier`, `page`, `carte_mentale`, pour n'en garder que
certains). Chaque entrée dit ce qui la range : `dans` (le dossier ou la toile d'une toile ; absent sur l'accueil) et son
titre `ou` ; pour une page ou une carte, `tableau` est la toile qui la porte. `favori`, `partage` et `outil` (un dossier
qu'un outil a fait) ne paraissent que vrais. 50 entrées par défaut (`limite`), `total` en tout, et `suite` quand il en
reste : la redonner en `curseur` donne les suivantes. Les champs sont légers (rien de ce qui ne sert qu'à dessiner une
vignette) ; cinquante entrées font environ 11 000 signes, l'essentiel en identifiants.

### `lire_tableau`

Arguments : `tableau`, et `elements` (seulement ceux-là), `corbeille` (inclure les jetés).

```json
{
  "tableau": { "id": "…", "titre": "Plan de lancement", "droits": "edition", "adresse": "https://notak.exemple.fr/t/…" },
  "elements": [
    { "id": "…", "type": "titre", "x": 0, "y": 0, "l": 34, "h": 6, "texte": "Lancement" },
    { "id": "…", "type": "note", "x": 0, "y": 8, "l": 34, "h": 12, "texte": "# Objectif\nOuvrir **en mars**.", "couleur": "jaune" },
    { "id": "…", "type": "taches", "x": 36, "y": 8, "l": 34, "h": 14, "titre": "À faire",
      "taches": [{ "texte": "Devis imprimeur", "faite": true }, { "texte": "Maquette", "faite": false }] },
    { "id": "…", "type": "colonne", "x": 72, "y": 0, "l": 34, "h": 40, "titre": "Idées", "elements": ["…", "…"] },
    { "id": "…", "type": "note", "colonne": "…", "rang": 0, "l": 34, "h": 8, "texte": "Un salon" },
    { "id": "…", "type": "table", "x": 0, "y": 30, "l": 60, "h": 12, "lignes": [["Poste", "Coût"], ["Imprimeur", "300"]] },
    { "id": "…", "type": "carte_mentale", "x": 110, "y": 0, "l": 40, "h": 20, "adresse": "https://…/t/…/e/…",
      "plan": { "id": "…", "titre": "Lancement", "enfants": [{ "id": "…", "titre": "Communication", "enfants": [] }] } },
    { "id": "…", "type": "page", "x": 0, "y": 72, "l": 10, "h": 12, "titre": "Wilfried Robert",
      "texte": "# Rendez-vous\nLe **12 décembre**.\n- [ ] Envoyer le devis", "empreinte": "3f9c0a1b2c3d4e5f", "adresse": "https://…/t/…/e/…" },
    { "id": "…", "type": "lien", "x": 0, "y": 50, "l": 34, "h": 20, "url": "https://…", "titre": "…" },
    { "id": "…", "type": "tableau", "x": 40, "y": 50, "l": 10, "h": 12, "cible": "…", "titre": "Archives" },
    { "id": "…", "type": "ligne", "de": "…", "vers": "…" }
  ],
  "structure": {
    "cadre": { "x": 0, "y": 0, "l": 150, "h": 70 },
    "zones": [{ "titre": "Lancement", "elements": ["…", "…"], "cadre": { "x": 0, "y": 0, "l": 70, "h": 22 } }],
    "chevauchements": [["…", "…"]],
    "place_libre": { "x": 154, "y": 0 }
  }
}
```

Le texte des notes se lit en **Markdown simple** (titres `#`, listes `-` et `1.`, `**gras**`, `_italique_`, liens,
citations `>`). Une **page** (l'élément `document` de l'app) se lit sous le type `page`, en Markdown : celui qu'on lui écrit,
avec ses tâches `- [ ]`, son code et ses titres jusqu'au troisième niveau. Elle rend l'`empreinte` de son texte entier (de
quoi la modifier sans écraser une retouche, `attendu`) et son `adresse` ; `apercu` quand sa carte montre le début du
texte, `riche` quand elle porte ce que son Markdown ne dit pas (une image, des colonnes, un tableau, un aperçu de lien, un
dépliant, un encadré, un passage commenté, une couleur, un lien vers un tableau ou une personne) : son texte ne se
remplace pas, on y ajoute. Le tableau entier ne donne que le début d'une longue page (4 000 signes, `tronque`) : la lire
seule (`elements`) donne son texte entier, 50 000 signes au plus. Une carte mentale rend aussi son `adresse`. Les autres
types (image, fichier, commentaire, nuancier, lieu, dessin…) se lisent avec ce qu'ils ont de texte (`legende`, `nom`,
`titre`, `texte`). Une ligne se lit avec ses bouts (`de`, `vers` : l'élément qu'elle relie, ou une place) et son `libelle`.
Une zone est un groupe d'éléments proches les uns des autres ; son `titre` est celui d'un titre posé en tête. `place_libre`
est un coin où poser du neuf sans rien recouvrir.

### `creer_tableau`

Arguments : `titre`, et `dans` (un tableau ou un dossier), ou `fiche` (`{ "cle": "societe:42", "titre": "Boulangerie
Martin" }` : le dossier de la fiche, créé s'il manque et que `titre` est donné), `couleur`, `dossier`. Sans `dans` ni
`fiche` : l'accueil de l'espace personnel.

```json
{ "tableau": { "id": "…", "titre": "Plan de lancement", "adresse": "https://notak.exemple.fr/t/…" }, "dans": { "id": "…", "titre": "Boulangerie Martin" }, "carte": "…" }
```

`carte` est l'élément qui range le tableau dans `dans` : le jeter (`jeter_elements`) met le tableau à la corbeille,
comme dans l'app.

### `ajouter_elements`

Arguments : `tableau`, `elements` (60 au plus), `place`.

| `type` | Champs |
|---|---|
| `note` | `texte` (Markdown simple), `couleur` |
| `titre` | `texte` : un titre posé sur la toile, sans fond |
| `taches` | `titre`, `taches` (`[{ "texte", "faite" }]`), `couleur` |
| `lien` | `url`, `titre` ; l'aperçu de la page se charge comme dans l'app |
| `colonne` | `titre`, `couleur`, `elements` (ce qu'elle range : notes, titres, tâches, liens, tables) |
| `table` | `lignes` (la première est l'en-tête), `titre` |
| `carte_mentale` | `central`, `branches` (`[{ "titre", "note", "enfants": [...] }]`), `structure` |
| `page` | `titre` (obligatoire), `texte` (Markdown), `couleur`, `apercu` (sa carte montre le début du texte, 34 UG ; sinon une feuille et son titre, 10 UG) |
| `ligne` | `de`, `vers`, `libelle`, `fleche` (`false` : un simple trait ; sinon une flèche à l'arrivée, comme l'outil Ligne) |

Tous acceptent `largeur` (UG), sauf la page, dont la largeur est celle de l'app, et la ligne, qui n'en a pas. Le texte d'une note ou d'une page va
jusqu'à 50 000 signes. `place` : `pres_de` + `cote` (`droite` par défaut), `dans_colonne`, ou `x` + `y` ; sans rien, une
place libre à droite de ce qui est là. `disposition` : `ligne` (côte à côte, par défaut), `pile`, `grille`. Rien ne se pose
par-dessus un autre élément : la porte décale jusqu'à la première place libre.

**Une ligne** relie deux éléments posés sur la toile. `de` et `vers` sont l'identifiant d'un élément du tableau, ou
`"#n"` : le n-ième élément de la même demande, `#1` étant le premier (`[note, note, { "type": "ligne", "de": "#1", "vers":
"#2" }]`). Les lignes se posent après le reste ; elles ne prennent pas de place sur la toile. Chaque bout doit être là,
visible de la personne, ni verrouillé, ni une ligne, ni rangé dans une colonne (on relie alors la colonne), et les deux
bouts sont différents. Une ligne ne va ni dans une colonne, ni dans un dossier.

**Dans un dossier ou sur l'accueil** d'un espace, la porte ne pose que des pages, des cartes mentales et des liens : la
bibliothèque n'y montre rien d'autre (`impossible` sinon, qui dit de créer un tableau dedans).

```json
{ "crees": [{ "id": "…", "type": "carte_mentale", "x": 154, "y": 0, "l": 40, "h": 20,
              "plan": { "id": "…", "titre": "Lancement", "enfants": [{ "id": "…", "titre": "Communication", "enfants": [] }] } }] }
```

`crees` suit l'ordre de `elements`. Chaque création rend son `adresse`. Une colonne rend aussi `elements` (les
identifiants de ce qu'elle range) ; une carte rend son `plan` avec les identifiants de ses sujets, de quoi la modifier
ensuite ; une ligne rend `de` et `vers`, les éléments qu'elle relie (les `#n` lus), sans place. Posés dans une colonne
(`dans_colonne`), les éléments rendent `colonne` au lieu de `x` et `y`.

**Une bonne carte mentale** : un central court ; trois à sept branches principales, de même niveau logique ; des titres
de quelques mots, sans phrase ; le détail dans `note`. La porte la met en page comme l'app (la disposition `structure`).

### `modifier_elements`

Arguments : `tableau`, `modifications` (`[{ "id", … }]`). Ce qui n'est pas donné ne change pas.

| Champ | Pour |
|---|---|
| `texte` | note, titre, page : le nouveau texte, en Markdown, qui remplace l'ancien (pas sur une page `riche`) |
| `ajouter_texte` | note, page : du Markdown ajouté à la fin, sans toucher au reste (à la place du paragraphe vide d'une page vide) |
| `retirer_blocs` | page : retire ces blocs de son texte, par leur id (ce qui défait un `ajouter_texte`) |
| `attendu` | page : l'empreinte de son texte tel que l'agent l'a lu (`empreinte`) ou laissé (`empreintes`) ; s'il a changé depuis, rien ne se fait (`modifie_depuis`) |
| `titre` | tâches, colonne, table, lien, page ; carte mentale : le sujet central |
| `couleur` | une note, une liste, une colonne, un lien, une page : une couleur de la palette, ou `aucune` |
| `taches` | la liste entière, qui remplace l'ancienne |
| `cocher` | `[{ "rang": 0, "faite": true }]` : cocher ou décocher par rang |
| `lignes` | table : toutes les lignes |
| `branches` | carte mentale : `[{ "action": "ajouter", "sujet": "…", "titre": "…", "enfants": [...] }, …]` |
| `x`, `y` | la place sur la toile, **exactement** là (sans décalage) ; l'élément sort de sa colonne s'il y était |
| `colonne`, `rang` | range l'élément dans cette colonne, au rang donné (à la fin sinon) |

Les gestes des branches, dans l'ordre : `ajouter` (sous `sujet`, le central s'il manque, à `position`), `renommer`
(`sujet`, `titre`), `deplacer` (`sujet` sous `vers`, à `position`), `remplacer` (les sous-branches de `sujet` deviennent
`enfants`), `retirer` (`sujet` et sa branche). Une carte modifiée rend son nouveau `plan`.

```json
{ "modifies": ["…"],
  "avant": { "<élément>": { "texte": "…", "couleur": "aucune", "cocher": [{ "rang": 1, "faite": false }], "place": { "x": 0, "y": 8 } },
             "<page>": { "retirer_blocs": ["k3j9x0a2mq", "p0d8e7f6g5"], "attendu": "9b1c…" } },
  "empreintes": { "<page>": "9b1c…" },
  "plans": { "<carte>": { "id": "…", "titre": "…", "enfants": [] } },
  "plans_avant": { "<carte>": { "id": "…", "titre": "…", "enfants": [] } } }
```

**Le texte d'une page.** Un seul geste de texte par modification (`texte`, `ajouter_texte` ou `retirer_blocs`), et un
seul par page et par demande. Une page ouverte en écriture (la présence de la synchro le dit) refuse tout changement de
son texte, de son titre ou de sa couleur (`en_edition`), sans rien écrire ; sa place, non. `empreintes` rend l'empreinte
de son texte après le geste, de quoi enchaîner avec `attendu`. Dans `avant`, une page touchée dans son texte reçoit
`attendu` : renvoyer `avant` tel quel défait le geste, **sauf** si la page a été retouchée d'ici là (`modifie_depuis`), et
l'annulation n'écrase pas la retouche. Défaire `texte` remet l'ancien texte (`avant.texte`, entier) ; défaire
`ajouter_texte` retire les blocs ajoutés (`avant.retirer_blocs`) ; défaire `retirer_blocs` remet à la fin ce qui est
parti (`avant.ajouter_texte`). Une note n'a ni empreinte ni ids de blocs : défaire son `ajouter_texte` remet son ancien
texte (`avant.texte`).

`avant` dit, pour chaque élément touché, ce que valait chaque champ changé, dans les mots de l'opération (`texte` en
Markdown simple, `couleur` à `aucune` s'il n'y en avait pas, `taches`, `cocher` avec l'état d'avant de chaque rang,
`lignes`, `titre`, `place` : `{ "x", "y" }` ou `{ "colonne", "rang" }`) : le renvoyer tel quel défait le changement. Une
carte mentale rend son plan d'avant (`plans_avant`).

### `modifier_tableau`

Arguments : `tableau`, et `titre`, `couleur` (de la palette, ou `aucune`), `dossier` (`true` : il se montre en dossier
dans la bibliothèque ; `false` : de nouveau en toile). Ce qui n'est pas donné ne change pas. Il faut pouvoir écrire le
tableau ; un dossier qu'un outil a fait (celui d'une fiche, ou celui qui les range) reste tel quel, et l'accueil ne se
montre pas en dossier (`impossible`). Le titre s'écrit aussitôt en base : la recherche et la bibliothèque le lisent tout de
suite.

```json
{ "tableau": { "id": "…", "titre": "Plan 2027", "adresse": "https://…/?dossier=…", "dossier": true },
  "avant": { "titre": "Brouillon", "couleur": "aucune", "dossier": false } }
```

`avant` renvoyé tel quel (`modifier_tableau` avec `tableau` et `avant`) défait le changement.

### `deplacer`

Arguments : `tableau`, `vers` (le tableau ou le dossier où le ranger), `essai`, `accepter_acces`.

Range un tableau ou un dossier dans un autre, comme le glisser de la bibliothèque : sa carte est recréée chez `vers` (son
icône, son image, sa couleur), puis retirée de celui qui la portait, et ses accès suivent son nouveau parent (le serveur
fait le même rangement que `PUT /api/tableaux/:id/parent`). Seul le **propriétaire** du tableau le range ailleurs
(`interdit`) ; il faut écrire dans `vers` et là où est sa carte (`lecture_seule`). Ne se range pas : l'accueil d'un
espace, un dossier qu'un outil a fait, un tableau à la corbeille, un tableau dans lui-même ou dans ce qu'il contient (une
boucle, que `erreur` dit d'une phrase), ni d'un espace à un autre (`impossible`).

**Les accès.** Si le rangement change qui y a accès (des personnes ou des équipes qui le gagnent ou le perdent, des accès
limités qui deviendraient permanents, des liens de visiteurs qui y mèneraient ou n'y mèneraient plus, des membres de
l'espace qui le perdraient sous une toile privée ou le retrouveraient), rien ne bouge : `409 acces_change`, dont `erreur`
dit ce qui changerait. On le dit à la personne, et on recommence avec `accepter_acces: true` une fois son accord obtenu.
`essai: true` dit ce qui changerait (`acces`), sans rien ranger.

```json
{ "tableau": { "id": "…", "titre": "Prism", "adresse": "https://…/t/…" },
  "de": { "id": "…", "titre": "Mon espace" }, "vers": { "id": "…", "titre": "Clients" },
  "carte": "<la carte chez vers>",
  "acces": { "change": true, "gagnent": 1, "perdent": 0, "deviennent_permanents": 0, "liens_ouverts": 0, "liens_eteints": 0,
             "membres_perdent": 0, "membres_gagnent": 0, "resume": "1 personne ou équipe y gagnerait l’accès." },
  "avant": { "dans": "<de>" } }
```

Avec `essai`, la réponse porte `essai: true`, sans `carte` ni `avant`. Un tableau déjà dans `vers` ne bouge pas.
`deplacer` vers `avant.dans` le remet (avec `accepter_acces` si les accès changent de nouveau).

### `ranger`

Arguments : `tableau`, `groupes` (`[{ "titre", "elements": [...], "en_colonne", "couleur" }]`), `disposition`
(`colonnes` : les groupes côte à côte, par défaut ; `lignes` : les uns sous les autres), `origine` (`{ "x", "y" }`).

Chaque groupe s'empile de haut en bas, dans l'ordre donné. Un groupe titré reçoit un titre au-dessus de lui ; avec
`en_colonne`, ses éléments entrent dans une colonne de ce titre (celle qui le porte déjà, sinon une neuve). Le
rangement commence au coin haut gauche des éléments rangés (ou à `origine`) ; s'il recouvrirait ce qui n'est pas rangé,
il part dans une place libre. **Rien n'est supprimé**, ce qui n'est pas nommé ne bouge pas.

```json
{ "ranges": [{ "id": "…", "x": 0, "y": 8 }, { "id": "…", "colonne": "…", "rang": 0 }], "titres": ["…"], "colonnes": ["…"],
  "cadre": { "x": 0, "y": 0, "l": 106, "h": 60 },
  "avant": { "<élément>": { "x": 40, "y": 12 }, "<autre>": { "colonne": "…", "rang": 2 } } }
```

`avant` : où était tout ce qui a bougé (les éléments rangés, et les titres ou colonnes repris).

### `jeter_elements`, `remettre_elements`

Arguments : `tableau`, `elements`. Jeter met à la corbeille du tableau (une colonne y part avec ce qu'elle range, les
lignes accrochées suivent) ; la personne les remet depuis l'app, ou l'agent avec `remettre_elements`. Rien ne s'efface.
Les lignes jetées avec ce qu'elles relient reviennent avec, quand leurs deux bouts sont de nouveau sur la toile ; une
ligne nommée revient toujours. Un élément verrouillé sur la toile, ou la carte du dossier d'une fiche, reste où il est
(`impossible`).

```json
{ "jetes": ["…"], "deja": [] }
```

## Défaire

Chaque écriture rend de quoi la défaire, pour l'« Annuler » de l'agent :

| Pour défaire | Envoyer |
|---|---|
| `ajouter_elements` | `jeter_elements` avec les `crees` |
| `creer_tableau` | `jeter_elements` avec sa `carte`, dans `dans` |
| `modifier_elements` | `modifier_elements` avec chaque `avant` (`place` se renvoie en `x`/`y` ou `colonne`/`rang`) ; pour une carte, `remplacer` sur le central avec `plans_avant` (de nouveaux identifiants de sujets) ; pour une page, `avant` porte `attendu` : une page retouchée depuis n'est pas écrasée (`modifie_depuis`) |
| `modifier_tableau` | `modifier_tableau` avec `avant` |
| `deplacer` | `deplacer` vers `avant.dans` (avec `accepter_acces` si les accès changent) |
| `ranger` | `modifier_elements` qui remet chaque `avant` à sa place, **puis** `jeter_elements` avec les `titres` et `colonnes` neufs (une colonne jetée emporte ce qu'elle range : la vider d'abord) |
| `jeter_elements` | `remettre_elements` avec les `jetes` |
| `remettre_elements` | `jeter_elements` avec les `remis` |

## Une transaction par demande

Une demande d'écriture est **une seule transaction** sur le document du tableau, préparée en entier avant d'écrire :
tout passe, ou rien (une erreur sur le dixième élément n'en laisse pas neuf). `creer_tableau` touche deux documents (le
tableau neuf, et celui qui porte sa carte), chacun d'une transaction ; `deplacer` range la toile en base, puis touche
`vers` (sa carte posée) et l'ancien porteur (sa carte retirée), toutes les vérifications faites avant. Elle est diffusée en direct à ceux qui ont le tableau ouvert et enregistrée comme
leurs propres gestes. Les éléments créés sont exactement ceux que crée l'app (les mêmes constructeurs et le même format :
`packages/tableau`), et l'activité du tableau les attribue à la personne, avec l'agent.
