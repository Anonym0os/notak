# Notak · le document à blocs, d'après Notion

Ce document dit ce que doit faire le document de Notak quand on l'ouvre en grand. Il est écrit d'après la
lecture de Notion Desktop 7.24.0 (octobre 2026) : son client web mis en cache, sa base locale et ses fichiers
de langue. Comme `docs/SPEC.md` pour Milanote et `docs/XMIND.md` pour la carte mentale, il décrit des
**comportements**. Ni code, ni icône, ni texte de Notion n'est repris.

Le moteur de blocs vit dans `packages/tableau/src/blocs/`. Il ne dépend pas de l'élément document, pour
qu'un autre élément puisse le monter tel quel.

Les décisions propres à Notak, quand elles s'écartent de Notion, sont marquées **→ Notak**.

---

## 1. L'objet

- **Tout est bloc.** Un document est une suite de blocs, et certains blocs en contiennent d'autres :
  dépliant, colonne, élément de liste.
- **Chez Notion**, un bloc est un enregistrement `{id, type, properties, content, format, parent}`.
  `properties.title` porte le texte riche du bloc, `content` la liste ordonnée des ids de ses enfants, et
  `format` son habillage (couleur, largeur, icône…).
- **→ Notak** : le document reste un arbre ProseMirror, dont chaque nœud de bloc porte un **`id` stable**.
  Cet id est donné à la création du bloc, à la coupure, à la duplication et au collage (dédoublonné). La
  couche `blocs/modele.ts` relit l'arbre comme des enregistrements à la Notion, et c'est par elle que
  passent les gestes sur les blocs. On garde ainsi la sélection entre blocs, le collage, l'annulation et le
  texte écrit à plusieurs, que ProseMirror et Yjs savent déjà faire.
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

  **→ Notak** : les teintes viennent de la palette de Notak.
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
| Colonnes | Deux à cinq colonnes côte à côte, chacune contenant des blocs (§ 8). |

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

Les guillemets droits deviennent typographiques selon la langue : « » en français, “ ” en anglais.

- **Annuler un raccourci.** ⌘Z juste après un raccourci markdown ou un remplacement l'annule et rend le texte
  tapé.

## 5. Clavier

**Écrire**

| Touche | Geste |
|---|---|
| Entrée | Nouveau bloc. Dans une liste, un élément de même type. Sur un élément de liste vide, on sort de la liste. |
| Maj+Entrée | Saut de ligne dans le bloc |
| Retour arrière en tête de bloc | Un bloc typé redevient texte. Un texte se fond dans le bloc précédent. |
| Tab, Maj+Tab | Imbriquer sous le bloc précédent, ou désimbriquer |
| ⌘Entrée | Cocher ou décocher une tâche, ouvrir ou fermer un dépliant |
| ⌘⌥0 | Transformer en texte |
| ⌘⌥1, 2, 3 | Transformer en titre 1, 2, 3 |
| ⌘⌥4 | Transformer en tâche |
| ⌘⌥5 | Transformer en liste à puces |
| ⌘⌥6 | Transformer en liste numérotée |
| ⌘⌥7 | Transformer en dépliant |
| ⌘⌥8 | Transformer en code |
| ⌘/ | Ouvrir « Transformer en » sur le bloc courant |

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
  - Dans la bande gauche ou droite d'un bloc (un cinquième de sa largeur), le trait est vertical.
- **Plusieurs blocs.** On peut tirer une sélection de blocs d'un seul geste.
- **Où l'on peut lâcher.** On peut lâcher dans un dépliant ouvert ou dans une colonne. Lâcher un bloc dans
  ses propres descendants est refusé.
- **Copier au lieu de déplacer.** ⌥ pendant le glisser copie au lieu de déplacer.
- **Créer des colonnes.**
  - Lâcher sur le côté d'un bloc de premier niveau crée une **rangée de colonnes** qui réunit les deux
    blocs.
  - Lâcher sur le côté d'une colonne existante en ajoute une, jusqu'à cinq.
  - Le menu `/` propose aussi « 2 colonnes » à « 5 colonnes ».
- **Largeurs des colonnes.**
  - Au départ, elles sont égales.
  - Une poignée verticale entre deux colonnes règle le partage de ces deux-là seulement.
  - La largeur s'aimante par pas de 1/(8 × nombre de colonnes), et une colonne garde au moins un pas.
- **Dissolution.**
  - Une colonne vidée disparaît.
  - Quand il n'en reste qu'une, la rangée se dissout et ses blocs reprennent leur place dans le flux.
- **Petits écrans.** Sous 480 px de large, les colonnes s'empilent.

## 9. La page

- **Le titre.** C'est celui de l'élément. Entrée dans le titre descend au premier bloc. → Notak : il reste dans
  l'en-tête de la fenêtre, comme dans Milanote ; Notion l'écrit en grand au-dessus des blocs.
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
- **→ Notak** : la colonne d'outils du document reste à gauche. La bulle en reprend seulement les gestes du
  passage choisi.
