# Notak · le document à blocs, d'après Notion

Ce document dit ce que doit faire le document de Notak quand on l'ouvre en grand. Il est écrit d'après la
lecture de Notion Desktop 7.24.0 (octobre 2026) : son client web mis en cache, sa base locale et ses fichiers
de langue, cartographiés avec REA (github.com/morluto/rea), puis **mesuré en direct** dans l'application (styles
calculés, gestes rejoués sur une page de brouillon). Les relevés détaillés, non versionnés, sont dans
`~/Documents/CODE/notak-chantiers/interface-notion/`. Le moteur de blocs deviendra l'éditeur de toute
l'application. Comme `docs/SPEC.md` pour Milanote et `docs/XMIND.md` pour la carte mentale, il décrit des
**comportements**. Ni code, ni icône, ni texte de Notion n'est repris.

Le moteur de blocs vit dans `packages/tableau/src/blocs/`. Il ne dépend pas de l'élément document, pour
qu'un autre élément puisse le monter tel quel.

Les décisions propres à Notak, quand elles s'écartent de Notion, sont marquées **→ Notak**.

---

## 1. L'objet

- **Tout est bloc.** Un document est une suite de blocs, et tout bloc de texte peut en porter d'autres, ses
  enfants : un paragraphe, une puce, une tâche, un dépliant, une citation. Un bloc emporte toujours ses
  enfants (supprimer, dupliquer, déplacer, colorer).
- **Chez Notion**, un bloc est un enregistrement `{id, type, properties, content, format, parent}`.
  `properties.title` porte le texte riche du bloc, `content` la liste ordonnée des ids de ses enfants, et
  `format` son habillage (couleur, largeur, icône…).
- **→ Notak** : le document est un texte ProseMirror dont les blocs sont **à plat** : chaque bloc est un frère
  dans la page (ou dans une colonne) et porte un **`retrait`** ; ses enfants sont les blocs qui le suivent avec un
  retrait plus grand. Le parent d'un bloc est le dernier bloc moins en retrait au-dessus de lui, et un retrait qui
  saute un cran est ramené au cran d'après (`blocs/rang.ts`). Chaque bloc porte aussi un **`id` stable**, donné à
  la création, à la coupure, à la duplication et au collage (dédoublonné). `blocs/modele.ts` relit le texte comme
  des enregistrements à la Notion (`id`, type, parent, enfants, fin du sous-arbre), et c'est par lui que passent
  les gestes sur les blocs. L'arbre de Notion est ainsi rendu sans nœuds imbriqués : ProseMirror garde ses gestes
  de texte (coupure, fusion, sélection d'un bloc à l'autre), et le texte écrit à plusieurs n'a jamais de
  structure à réécrire quand un bloc change de parent.
- **→ Notak** : un texte écrit avant les blocs à plat (une note, un document d'avant le 24/10/2026), dont les
  listes, citations, encadrés et dépliants contiennent leurs blocs, s'ouvre **aplati** (`blocs/migration.ts`) ;
  les exports et la conversion en note le reçoivent **déplié** dans cette écriture imbriquée.
- **Couleur d'un bloc.** Un bloc peut porter une couleur, soit sur le texte, soit sur le fond.
- **Couleurs du texte.** Elles se posent aussi sur un passage, texte ou fond.
- **Les couleurs disponibles** :

  | Couleur | En texte | En fond |
  |---|---|---|
  | par défaut | ✓ | ✓ |
  | gris | ✓ | ✓ |
  | brun | ✓ | ✓ |
  | orange | ✓ | ✓ |
  | jaune | ✓ | ✓ |
  | vert | ✓ | ✓ |
  | bleu | ✓ | ✓ |
  | violet | ✓ | ✓ |
  | rose | ✓ | ✓ |
  | rouge | ✓ | ✓ |

  Les valeurs sont celles mesurées dans Notion : le texte d'une teinte est le même dans les deux thèmes, son fond
  change (`blocs/blocs.css`).
- **→ Notak** : un vieux client qui ouvre un document contenant un bloc qu'il ne connaît pas le montre **en
  lecture seule**. Il ne le remplace jamais par un document vide.

## 2. Types de blocs

| Bloc | Comportement |
|---|---|
| Texte | Le paragraphe. Un bloc vide qui a le curseur montre une invite grise. |
| Titre 1, 2, 3 | Trois tailles. Un titre peut être **dépliant** : un triangle devant lui cache ou montre les blocs rangés dessous. |
| Liste à puces | La puce change de forme avec la profondeur : disque, cercle, carré. |
| Liste numérotée | La numérotation suit la profondeur : 1, 2, 3, puis a, b, c, puis i, ii, iii. |
| Liste de tâches | Une case à cocher. Le texte d'une tâche cochée est grisé et barré. |
| Dépliant | Une ligne de résumé avec un triangle, et des blocs enfants qui se cachent. Un dépliant fermé et vide invite à cliquer pour ajouter un bloc dedans. |
| Citation | Un trait vertical à gauche, le texte un peu plus grand. |
| Encadré | Une icône (émoji) et un fond coloré, le texte à côté. Un clic sur l'icône la change. |
| Séparateur | Une ligne fine. |
| Code | Police à chasse fixe, un langage au choix, un bouton Copier, retour à la ligne réglable. Tab y insère une tabulation. |
| Image | Une image du tableau ou collée, avec sa largeur réglable aux bords, son alignement et une légende. |
| Aperçu de lien | Une adresse montrée en carte : titre, description, image, comme les liens de Notak. |
| Tableau | Le tableau simple de la note, avec une ligne et une colonne d'en-tête au choix. |
| Colonnes | Des colonnes côte à côte, chacune contenant des blocs (§ 8). |

**→ Notak** : sont écartés pour l'instant :
- les bases de données et leurs vues ;
- les sous-pages et le lien vers une page ;
- les blocs synchronisés ;
- le bouton ;
- la table des matières et le fil d'Ariane ;
- l'équation ;
- la vidéo, l'audio, le PDF et les intégrations ;
- le titre 4 ;
- les onglets.

Le moteur garde une place pour ces blocs (§ 1), qui viendront plus tard.

## 3. Le menu « / »

- **Où il s'ouvre.** Taper `/` dans un bloc ouvre un menu sous le curseur. Le texte tapé après `/` le
  filtre.
- **Comment il cherche.** Chaque entrée a un nom et des **mots-clés** (`h1`, `#`, `todo`, `puce`, `hr`,
  `img`…). La recherche est approchée, sur le début des mots, sans tenir compte des accents ni de la casse.
- **Catégories.** Les entrées sont rangées en *Blocs de base*, *Médias* et *Mise en page*. Sous les blocs
  viennent les **couleurs**, texte puis fond, qui colorent le bloc courant, puis les **actions** :
  Dupliquer, Supprimer, Transformer en.
- **Naviguer.** Les flèches parcourent les entrées, Entrée ou Tab choisit, Échap ferme le menu en laissant
  le texte tapé.
- **Fermeture d'elle-même.** Le menu se ferme quand aucune entrée ne répond au filtre et que l'on a tapé
  trois caractères de plus, ou quand on tape une espace juste après `/`.
- **Ce que fait le choix.** Choisir un bloc **transforme** le bloc courant s'il est vide. S'il ne l'est
  pas, le nouveau bloc est **inséré dessous**. Dans les deux cas, le `/` et le filtre tapé sont retirés.

## 4. Raccourcis markdown

**En début de bloc**, suivis d'une espace :

| Saisie | Bloc |
|---|---|
| `#`, `##`, `###` | Titre 1, 2, 3 |
| `-`, `*`, `+` | Liste à puces |
| `1.`, `a.`, `i.` | Liste numérotée |
| `[]` | Tâche |
| `[x]` | Tâche cochée |
| `>` | Dépliant |
| `"` | Citation |
| ` ``` ` (sans espace) | Code |
| `---` (sans espace) | Séparateur |

**→ Notak** : dans une **note**, `>` reste la citation, comme dans Milanote. La règle Notion ne vaut que dans
le moteur de blocs.

**En ligne** :

| Saisie | Effet |
|---|---|
| `**gras**`, `__gras__` | gras |
| `*italique*`, `_italique_` | italique |
| `~barré~` | barré |
| `` `code` `` | code |
| `[texte](adresse)` | lien |

**Remplacements typographiques** :

| Saisie | Devient |
|---|---|
| `->` | → |
| `<-` | ← |
| `<->` | ↔ |
| `=>` | ⇒ |
| `>=` | ≥ |
| `<=` | ≤ |
| `!=` | ≠ |
| `--` | — |
| `...` | … |

Les guillemets droits deviennent typographiques : “ ” et ‘ ’, quelle que soit la langue, comme chez Notion (ouvrants en tête de bloc et après une espace, fermants ailleurs).

- **Annuler un raccourci.** ⌘Z juste après un raccourci markdown ou un remplacement l'annule et rend le texte
  tapé.

## 5. Clavier

**Écrire**

| Touche | Geste |
|---|---|
| Entrée | Coupe le bloc (règles ci-dessous). |
| Maj+Entrée | Saut de ligne dans le bloc ; dans un code, on en sort par un texte neuf dessous. |
| Retour arrière en tête de bloc | Règles ci-dessous. ⌘ + Retour arrière fusionne sans convertir. |
| Suppr en fin de bloc | Un bloc vide part ; sinon le bloc de texte suivant (quel que soit son type) le rejoint. |
| Tab, Maj+Tab | Imbriquer sous le frère d'avant, ou sortir du parent (règles ci-dessous). Jamais d'espace tapée. |
| ⌘Entrée | Cocher ou décocher une tâche, ouvrir ou fermer un dépliant |
| ⌘⌥0 | Transformer en texte |
| ⌘⌥1, 2, 3 | Transformer en titre 1, 2, 3 |
| ⌘⌥4 | Transformer en tâche |
| ⌘⌥5 | Transformer en liste à puces |
| ⌘⌥6 | Transformer en liste numérotée |
| ⌘⌥7 | Transformer en dépliant |
| ⌘⌥8 | Transformer en code |
| ⌘/ | Ouvrir le menu du bloc (avec son champ de recherche) sur le bloc courant ou les blocs choisis |

**Entrée, Retour arrière et Tab selon le bloc** (lus dans le code de Notion)

| Bloc | Entrée en fin | Entrée sur un bloc vide | 1er Retour arrière en tête | Peut recevoir des enfants |
|---|---|---|---|---|
| Texte | texte | texte vide ajouté | fusion avec le texte d'avant | oui |
| Titre 1 à 3 | **texte** (au milieu, la 2e moitié est du texte) | → texte | **fusion directe** | non |
| Titre dépliant | ouvert : texte, premier enfant ; fermé : texte frère, après ses enfants | → texte | → titre simple | oui |
| Puce, numéro | même type | remonte d'un cran si dernier enfant, sinon → texte | → texte (à sa place) | oui |
| Tâche | tâche **décochée** | idem | décochée → texte | oui |
| Dépliant | ouvert : texte, premier enfant ; fermé : dépliant frère après ses enfants | → texte | → texte | oui |
| Citation | **texte** | → texte | → texte | oui |
| Encadré | ses enfants : un premier enfant ; sinon texte | → texte | → texte, couleur effacée | non |
| Code | saut de ligne | — | rien | non |

- Entrée **en tête** d'un bloc non vide glisse un bloc vide au-dessus ; le curseur reste.
- Une coupure fait passer les enfants du bloc sous le bloc neuf (sauf pour un dépliant).
- La **fusion** saute les blocs sans texte (séparateur, image) et ce qu'un dépliant fermé cache ; les enfants du
  bloc fusionné prennent sa place. Un **dernier enfant** remonte d'un cran au lieu de fusionner.
- **Tab** range le bloc sous son frère d'avant, si celui-ci peut recevoir des enfants ; un bloc seul se décale
  **sans** ses enfants (ils restent où ils sont), plusieurs blocs choisis se décalent avec les leurs ; un dépliant
  fermé qui reçoit un enfant s'ouvre. **Maj+Tab** sort le bloc avec ses enfants, et ses frères d'après deviennent
  ses enfants ; refusé sous un encadré. Dans un code, Tab met une tabulation en tête de chaque ligne touchée.
- Chaque geste est un seul pas d'annulation.

**Mise en forme**

| Touche | Geste |
|---|---|
| ⌘B, ⌘I, ⌘U | Gras, italique, souligné |
| ⌘⇧S | Barré |
| ⌘E | Code en ligne |
| ⌘K | Lien |
| ⌘⇧H | Dernière couleur employée |
| ⌥⌘M | Commenter le passage |

**→ Notak** : Notion commente par ⌘⇧M. Notak garde ⌥⌘M, déjà appris dans la note et le document.

**Blocs**

| Touche | Geste |
|---|---|
| Échap | Sélectionner le bloc du curseur (§ 7). Échap de nouveau ferme le document. |
| ⌘⇧↑, ⌘⇧↓ | Monter ou descendre le bloc (ou la sélection) d'un rang, en passant les frères |
| ⌘D | Dupliquer le bloc ou la sélection, juste après |
| ⌘Z, ⌘⇧Z | Annuler, rétablir |

- **→ Notak** : les touches se lisent sur le caractère tapé (`event.key`), pour qu'elles tombent juste en
  AZERTY. Les chiffres de ⌘⌥ se lisent sur `event.code` (`Digit0`…`Digit8`), puisque ⌥ change le
  caractère.

## 6. Poignée et menu de bloc

- **Au survol.** Survoler un bloc fait paraître dans sa marge gauche deux boutons : **+** et **⋮⋮**
  (la poignée).
- **Le bouton +.** Un clic ajoute un bloc texte vide dessous et y ouvre le menu `/`. Avec ⌥, le bloc va
  dessus.
- **La poignée.** On la tire pour déplacer le bloc (§ 8). Un clic sélectionne le bloc et ouvre son menu.
- **Le menu de bloc** :
  - commence par un **champ de filtre** : on y tape pour chercher une action ;
  - propose **Supprimer**, **Dupliquer**, **Transformer en** (sous-menu des types), **Couleur** (sous-menu :
    texte, puis fond), **Copier le lien du bloc** et **Commenter** ;
  - sur une image : **Remplacer**, **Légende**, **Alignement** ;
  - sur une sélection de plusieurs blocs, s'applique à tous ; « Transformer en » ne montre alors que les
    types communs à tous.
- **→ Notak** : « Copier le lien du bloc » donne l'adresse `/t/<tableau>/e/<document>#<id du bloc>`. Ouvrir
  cette adresse amène au bloc et le fait clignoter.

## 7. Sélection de blocs

- **Deux sélections.** On est soit dans le texte, soit sur des blocs entiers. Les blocs sélectionnés ont un
  fond bleu pâle.
- **Entrer dans la sélection de blocs** :
  - Échap sélectionne le bloc du curseur ;
  - un clic sur la poignée aussi ;
  - **tirer un rectangle** depuis la marge du document, ou depuis un endroit vide, sélectionne les blocs
    qu'il touche ;
  - une sélection de texte qui déborde sur plusieurs blocs reste une sélection de texte.
- **Dans la sélection de blocs** :

  | Touche | Geste |
  |---|---|
  | ↑, ↓ | Sélectionner le bloc d'avant ou d'après |
  | Maj+↑, Maj+↓, Maj+clic | Étendre la sélection |
  | Entrée | Revenir au texte, à la fin du bloc |
  | Retour arrière, Suppr | Supprimer les blocs |
  | ⌘C, ⌘X, ⌘V | Copier, couper ; coller remplace les blocs |
  | ⌘D, ⌘⇧↑/↓, Tab, ⌘⌥chiffres, ⌘/ | Comme sur un bloc seul |
  | Taper une lettre | Rien ne se passe (aucun texte ne s'écrase par mégarde) |
  | Échap, ou un clic dans le texte | Désélectionner |

## 8. Glisser-déposer et colonnes

- **Repère de dépôt.** Pendant qu'on tire un bloc par sa poignée, un trait bleu montre où il tombera.
  - Au-dessus ou au-dessous d'un bloc, le trait est horizontal.
  - Près du bord gauche ou droit d'un bloc (jusqu'à 200 px dehors), le trait est vertical. La position horizontale de la souris choisit le retrait du dépôt (le niveau d'imbrication), un voile montre le parent qui reçoit.
- **Plusieurs blocs.** On peut tirer une sélection de blocs d'un seul geste.
- **Où l'on peut lâcher.** On peut lâcher dans un dépliant ouvert ou dans une colonne. Lâcher un bloc dans
  ses propres descendants est refusé.
- **Copier au lieu de déplacer.** ⌥ pendant le glisser copie au lieu de déplacer.
- **Créer des colonnes.**
  - Lâcher sur le côté d'un bloc de premier niveau crée une **rangée de colonnes** qui réunit les deux
    blocs.
  - Lâcher sur le côté d'une colonne existante en ajoute une, à 1/n de la largeur, les autres gardant leurs proportions.
  - Le menu `/` propose aussi « 2 colonnes » à « 5 colonnes ».
- **Largeurs des colonnes.**
  - Au départ, elles sont égales.
  - Une poignée verticale entre deux colonnes règle le partage de ces deux-là seulement.
  - La largeur s'aimante par pas de 1/(8 × nombre de colonnes), et une colonne garde au moins un pas.
- **Dissolution.**
  - Une colonne vidée disparaît.
  - Quand il n'en reste qu'une, la rangée se dissout et ses blocs reprennent leur place dans le flux.
- **Petits écrans.** Comme chez Notion, les colonnes ne s'empilent pas.

## 9. La page

- **La page.** Ouvert en grand, le document prend toute la fenêtre : la barre d'îlots du
  tableau et de la carte en haut (68 px : le retour, le fil jusqu'au document ; l'historique, le partage, les options,
  l'export et le compte), puis la page qui défile, une colonne de **720 px** entre des marges
  d'au moins 96 px, et 30 % de la fenêtre d'air sous le dernier bloc ; un appui sous lui y écrit. Le texte :
  16 px sur 24, police système ; 16 px entre deux paragraphes ; titres de 30, 24 et 20 px (graisse 600) avec 40,
  36 et 32 px au-dessus ; marqueurs de liste dans 24 px, texte à 38 px du bord ; un cran de retrait vaut 32 px.
  **→ Notak** : le bouton « fermer » remplace la barre latérale de Notion ; Échap referme aussi.
- **Le titre.** C'est celui de l'élément, écrit en grand (40 px, graisse 700) au-dessus des blocs, sous l'icône.
  Entrée dans le titre descend au premier bloc.
- **Icône et couverture.** Au survol du haut de la page paraissent « Ajouter une icône » et « Ajouter une
  couverture ».
  - **L'icône** est un émoji choisi dans une liste. Elle se pose au-dessus du titre et se voit sur la carte
    du document.
  - **La couverture** est une image du tableau ou une image importée. Elle prend toute la largeur du haut de
    la page et se recadre verticalement en la tirant.
- **Options de la page** (menu •••) :
  - **Police** : défaut, serif, mono.
  - **Petit texte**.
  - **Pleine largeur** : sinon, le texte tient dans une colonne lisible d'environ 720 px.
  - Ces choix sont enregistrés avec le document.
- **Écrire à plusieurs.** Le document s'écrit à plusieurs en direct, comme une note : les curseurs des
  autres portent leur prénom, et deux personnes qui écrivent en même temps ne s'écrasent plus.
- **→ Notak** : la couverture s'importe depuis l'appareil et rejoint les fichiers du tableau ; Notion propose aussi
  une galerie et des dégradés.
- **→ Notak** : sont écartés le verrouillage de la page, la table des matières flottante et l'historique de
  la page. L'annulation et l'historique restent ceux du tableau.

## 10. La bulle de mise en forme

- **Où elle paraît.** Sélectionner du texte fait paraître au-dessus du passage une bulle.
- **Ce qu'elle contient** : **Transformer en** (le type du bloc), **gras**, **italique**, **souligné**,
  **barré**, **code**, **lien**, **couleur** (texte et fond, avec la dernière employée en tête) et
  **commenter**.
- **Quand elle disparaît.** Elle s'efface pendant qu'on tire la sélection à la souris et reparaît au
  lâcher. Elle ne paraît pas dans un bloc de code.
- **→ Notak** : la colonne d'outils à la Milanote est retirée : comme chez Notion, tout passe par le menu `/`,
  la poignée et la bulle.
