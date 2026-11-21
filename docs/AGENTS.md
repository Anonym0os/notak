# La porte des agents

Un agent d'un outil rattaché (Fram, l'assistant de Silak) agit dans Notak **comme la personne pour qui il travaille** :
il trouve ses tableaux, les lit, en crée, y pose des notes, des listes, des tables, des cartes mentales, les modifie, les
range et les jette à la corbeille. Il passe par une seule route, signée du secret de son outil. Ses gestes arrivent en
direct chez ceux qui ont le tableau ouvert, et l'activité les dit « Samy avec Fram ». Une note qu'une personne est en train
d'écrire au même instant garde ce qu'elle y tape : mieux vaut ne pas récrire une note ouverte.

La porte ne pense pas à la place de l'agent : elle lui donne de quoi raisonner (un tableau lu en clair, sa mise en page,
des erreurs qui disent quoi faire) et elle fait le travail mécanique (les formats de l'app, les positions, l'absence de
chevauchement). Le contrat est **tiré du code** : `apps/serveur/src/agentsContrat.ts` porte les opérations et le schéma
JSON de leurs arguments ; `docs/agents.schemas.json` en est la copie que l'outil recopie dans les outils de son modèle
(`node scripts/schemas-agents.ts` la récrit, un essai vérifie qu'elle suit le code).

| Fichier | Rôle |
|---|---|
| `apps/serveur/src/agentsContrat.ts` | Les opérations, leurs schémas, la validation. |
| `apps/serveur/src/agents.ts` | Chaque opération, au nom de la personne et avec ses droits. |
| `apps/serveur/src/app.ts` | La route, la signature, la personne, l'idempotence. |
| `packages/tableau/src/agents/` | Ce qui se partage avec l'app : le Markdown des notes (`texte.ts`), les éléments neufs, leur place et l'écriture dans le document (`poser.ts`), la lecture pour un agent (`lire.ts`). Un essai y vérifie que tout passe les schémas des éditeurs et la validation de la toile. |

## Allumer la porte

Elle est **éteinte par défaut**. On l'allume pour une source de `NOTAK_RATTACHEMENTS` qui a déjà son `secret` :

```json
[{ "source": "silak", "nom": "Silak", "dossier": "Clients", "origine": "https://silak.fr", "secret": "…",
   "agents": true, "agent": "Fram" }]
```

| Clé | Sens |
|---|---|
| `agents` | `true` ouvre la porte à cette source. Absente, la route répond 404, comme si elle n'existait pas. |
| `agent` | Le nom de l'agent, tel que l'activité le montre (« Samy avec Fram »). 40 caractères au plus ; à défaut, « l'assistant ». |
| `fournisseur` | Le fournisseur SSO dont les comptes liés désignent les personnes ; à défaut, le nom de la source (`silak`). |
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
  "au_nom_de": { "sujet": "42", "courriel": "samy@silak.fr" },
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
| 404 | `element_introuvable` | Un élément nommé n'est pas (ou plus) sur le tableau. |
| 422 | `impossible` | La demande est bien formée mais ne se fait pas (une colonne dans une colonne…). |
| 409 | `id_reutilise` | Cet `id` a déjà servi pour une autre demande. |

## Les unités et la place

Les positions et les tailles sont en **unités de grille** (UG, 10 px à l'échelle 1) : `x`, `y` le coin haut gauche, `l` la
largeur, `h` la hauteur. Une note fait 34 UG de large, une colonne 34, une carte mentale 40 × 20. La hauteur d'un élément
qui suit son texte est estimée par le serveur, qui ne dessine pas : elle sert à raisonner sur la mise en page, pas au
pixel. Un élément rangé dans une colonne n'a pas de place à lui : il a `colonne` (l'identifiant de la colonne) et `rang`.

## Les opérations

### `trouver`

Où travailler. Arguments, tous facultatifs : `texte`, `dans`, `fiche`, `limite`.

```json
{
  "personne": { "nom": "Samy Agher" },
  "espaces": [{ "id": "…", "nom": "Agher Créations", "accueil": "<tableau>", "personnel": true }],
  "recents": [{ "tableau": "…", "titre": "Plan de lancement", "genre": "toile", "modifie": 1763700000000 }],
  "resultats": [{ "tableau": "…", "titre": "…", "element": "…", "extrait": "…relancer le …" }],
  "contenu": [{ "tableau": "…", "titre": "…", "genre": "toile" }],
  "fiche": { "etat": "present", "tableau": "…", "titre": "Boulangerie Martin" }
}
```

`recents` sans `texte` ni `dans` ; `resultats` avec `texte` (les tableaux dont le titre le contient, puis les éléments
qui le contiennent) ; `contenu` avec `dans` ; `fiche` avec `fiche` (`etat` : `present`, `corbeille`, `absent`, ou
`inaccessible` quand le dossier existe sans que la personne y ait accès).

### `lire_tableau`

Arguments : `tableau`, et `elements` (seulement ceux-là), `corbeille` (inclure les jetés).

```json
{
  "tableau": { "id": "…", "titre": "Plan de lancement", "droits": "edition", "adresse": "https://notak.silak.fr/t/…" },
  "elements": [
    { "id": "…", "type": "titre", "x": 0, "y": 0, "l": 34, "h": 6, "texte": "Lancement" },
    { "id": "…", "type": "note", "x": 0, "y": 8, "l": 34, "h": 12, "texte": "# Objectif\nOuvrir **en mars**.", "couleur": "jaune" },
    { "id": "…", "type": "taches", "x": 36, "y": 8, "l": 34, "h": 14, "titre": "À faire",
      "taches": [{ "texte": "Devis imprimeur", "faite": true }, { "texte": "Maquette", "faite": false }] },
    { "id": "…", "type": "colonne", "x": 72, "y": 0, "l": 34, "h": 40, "titre": "Idées", "elements": ["…", "…"] },
    { "id": "…", "type": "note", "colonne": "…", "rang": 0, "l": 34, "h": 8, "texte": "Un salon" },
    { "id": "…", "type": "table", "x": 0, "y": 30, "l": 60, "h": 12, "lignes": [["Poste", "Coût"], ["Imprimeur", "300"]] },
    { "id": "…", "type": "carte_mentale", "x": 110, "y": 0, "l": 40, "h": 20,
      "plan": { "id": "…", "titre": "Lancement", "enfants": [{ "id": "…", "titre": "Communication", "enfants": [] }] } },
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
citations `>`). Les autres types (image, fichier, document, commentaire, nuancier, lieu, dessin…) se lisent avec ce qu'ils
ont de texte (`legende`, `nom`, `titre`, `texte`). Une zone est un groupe d'éléments proches les uns des autres ; son `titre`
est celui d'un titre posé en tête. `place_libre` est un coin où poser du neuf sans rien recouvrir.

### `creer_tableau`

Arguments : `titre`, et `dans` (un tableau ou un dossier), ou `fiche` (`{ "cle": "societe:42", "titre": "Boulangerie
Martin" }` : le dossier de la fiche, créé s'il manque et que `titre` est donné), `couleur`, `dossier`. Sans `dans` ni
`fiche` : l'accueil de l'espace personnel.

```json
{ "tableau": { "id": "…", "titre": "Plan de lancement", "adresse": "https://notak.silak.fr/t/…" }, "dans": { "id": "…", "titre": "Boulangerie Martin" }, "carte": "…" }
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

Tous acceptent `largeur` (UG). `place` : `pres_de` + `cote` (`droite` par défaut), `dans_colonne`, ou `x` + `y` ; sans
rien, une place libre à droite de ce qui est là. `disposition` : `ligne` (côte à côte, par défaut), `pile`, `grille`.
Rien ne se pose par-dessus un autre élément : la porte décale jusqu'à la première place libre.

```json
{ "crees": [{ "id": "…", "type": "carte_mentale", "x": 154, "y": 0, "l": 40, "h": 20,
              "plan": { "id": "…", "titre": "Lancement", "enfants": [{ "id": "…", "titre": "Communication", "enfants": [] }] } }] }
```

Une colonne rend aussi `elements` (les identifiants de ce qu'elle range) ; une carte rend son `plan` avec les
identifiants de ses sujets, de quoi la modifier ensuite. Posés dans une colonne (`dans_colonne`), les éléments rendent
`colonne` au lieu de `x` et `y`.

**Une bonne carte mentale** : un central court ; trois à sept branches principales, de même niveau logique ; des titres
de quelques mots, sans phrase ; le détail dans `note`. La porte la met en page comme l'app (la disposition `structure`).

### `modifier_elements`

Arguments : `tableau`, `modifications` (`[{ "id", … }]`). Ce qui n'est pas donné ne change pas.

| Champ | Pour |
|---|---|
| `texte` | note, titre : le nouveau texte, en Markdown simple |
| `titre` | tâches, colonne, table, lien ; carte mentale : le sujet central |
| `couleur` | une couleur de la palette, ou `aucune` |
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
  "avant": { "<élément>": { "texte": "…", "couleur": "aucune", "cocher": [{ "rang": 1, "faite": false }], "place": { "x": 0, "y": 8 } } },
  "plans": { "<carte>": { "id": "…", "titre": "…", "enfants": [] } },
  "plans_avant": { "<carte>": { "id": "…", "titre": "…", "enfants": [] } } }
```

`avant` dit, pour chaque élément touché, ce que valait chaque champ changé, dans les mots de l'opération (`texte` en
Markdown simple, `couleur` à `aucune` s'il n'y en avait pas, `taches`, `cocher` avec l'état d'avant de chaque rang,
`lignes`, `titre`, `place` : `{ "x", "y" }` ou `{ "colonne", "rang" }`) : le renvoyer tel quel défait le changement. Une
carte mentale rend son plan d'avant (`plans_avant`).

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
Un élément verrouillé sur la toile, ou la carte du dossier d'une fiche, reste où il est (`impossible`).

```json
{ "jetes": ["…"], "deja": [] }
```

## Défaire

Chaque écriture rend de quoi la défaire, pour l'« Annuler » de l'agent :

| Pour défaire | Envoyer |
|---|---|
| `ajouter_elements` | `jeter_elements` avec les `crees` |
| `creer_tableau` | `jeter_elements` avec sa `carte`, dans `dans` |
| `modifier_elements` | `modifier_elements` avec chaque `avant` (`place` se renvoie en `x`/`y` ou `colonne`/`rang`) ; pour une carte, `remplacer` sur le central avec `plans_avant` (de nouveaux identifiants de sujets) |
| `ranger` | `modifier_elements` qui remet chaque `avant` à sa place, **puis** `jeter_elements` avec les `titres` et `colonnes` neufs (une colonne jetée emporte ce qu'elle range : la vider d'abord) |
| `jeter_elements` | `remettre_elements` avec les `jetes` |
| `remettre_elements` | `jeter_elements` avec les `remis` |

## Une transaction par demande

Une demande d'écriture est **une seule transaction** sur le document du tableau, préparée en entier avant d'écrire :
tout passe, ou rien (une erreur sur le dixième élément n'en laisse pas neuf). `creer_tableau` touche deux documents (le
tableau neuf, et celui qui porte sa carte), chacun d'une transaction. Elle est diffusée en direct à ceux qui ont le tableau ouvert et enregistrée comme
leurs propres gestes. Les éléments créés sont exactement ceux que crée l'app (les mêmes constructeurs et le même format :
`packages/tableau`), et l'activité du tableau les attribue à la personne, avec l'agent.
