# Écarts Milanote / Notak : la création d'éléments

Lecture seule des deux dépôts, le 23/10/2026. Chemins Milanote relatifs à `milanote-src/milanote/src/`,
chemins Notak relatifs à `~/Documents/CODE/notak/packages/tableau/src/` sauf mention. Unité : l'UG (unité de
grille), 10 px à l'échelle 1 dans les deux applications (Milanote a aussi des grilles de 9 et 8 px selon
l'écran, `client/utils/grid/gridUtils.ts`).

---

## 1. La barre d'outils de gauche

### 1.1 Les outils et leur ordre

**Milanote** (`client/workspace/toolbar/config/toolbarMainToolListConfig.ts`,
`.../toolDefinitions/toolbarElementToolConfig.ts`, `.../toolbarToolConfigConstants.ts`) :
note, lien, liste de tâches, ligne, tableau, colonne, commentaire, table, puis croquis, nuancier, document,
audio, carte, vidéo, titre, puis le bouton « plus », un séparateur, et enfin image, envoi de fichier, dessin.
Les sept outils croquis → titre ont l'ordre de repli « toujours » (10 000) : ils vivent en permanence dans le
tiroir « plus » (`client/workspace/toolbar/utils/toolbarToolListCollapseUtils.ts` : tout outil à 10 000 ou plus
part dans le tiroir). Les autres se replient dans le tiroir quand la fenêtre est trop basse, dans l'ordre de
leur valeur : 100 pour la plupart, 10 pour le tableau (il part en dernier), 2 pour image, envoi et dessin (qui,
eux, disparaissent au lieu de se replier ; l'envoi ne disparaît jamais sur iPad). L'utilisateur peut choisir
ses outils principaux : un outil décoché passe à 10 000 (même fichier, l. 198). Hauteurs : 38 px pour note,
lien, tâches et titre, 48 px pour les autres (43 et 35 px sur petite grille). Le tiroir se ferme dès qu'un de
ses outils a créé un élément sélectionné (`client/element/dnd/DraggableElementCreationTool.tsx`).

**Notak** (`elements/index.ts:2-9`, `Barres.tsx:6-27`) : l'ordre est celui d'inscription des types : Note,
Titre, Lien, Tâches, Tableau, Ligne, Colonne. Pas de tiroir, pas de séparateur, pas de corbeille, pas de
repli à la hauteur, pas de choix des outils.

**Écart** : ordre différent (Titre en 2e position chez Notak, dans le tiroir chez Milanote ; Ligne après
Tableau chez Notak, avant chez Milanote ; Colonne en dernier). Absents : commentaire, table, croquis,
nuancier, document, audio, carte, vidéo, image, envoi de fichier, dessin, tiroir « plus », corbeille.

### 1.2 Le clic sur un outil

**Milanote** (`client/workspace/toolbar/components/elementTools/ElementTool.tsx`) : un clic ne crée rien.
L'outil rebondit (classe d'animation retirée après 0,4 s), joue le son d'erreur, et une bulle à droite de
l'outil (12 px) invite à le faire glisser : elle apparaît après 0,4 s, reste 5 s, disparaît au prochain appui.
Survoler un outil joue un son de survol (double pour le nuancier).

**Notak** (`Barres.tsx:16-20`, `Toile.tsx:260`, `Toile.tsx:775`) : le clic crée l'élément avec son coin haut
gauche au centre de la vue (`centreVue`), arrondi à l'UG, puis passe en édition si le type est éditable.
Des clics répétés empilent les éléments exactement au même point. Pas de son.

**Écart** : comportement délibérément différent (choix noté dans `docs/SPEC.md` §12). Deux effets à
signaler : l'élément n'est pas centré (son coin est au centre, il déborde à droite et en bas), et les clics
successifs se superposent sans décalage.

### 1.3 Le glisser d'un outil sur la toile

**Milanote** (`client/element/dnd/DraggableElementCreationTool.tsx`, `client/utils/dnd/dragPositionUtils.ts`,
`client/utils/dnd/dndConstants.ts`, `client/element/dnd/ElementDragPreview.jsx`,
`client/element/dnd/utils/elementDragAnimationUtils.js`) :
1. Au début du glisser : vibration moyenne (tactile), un élément complet est fabriqué avec le contenu par
   défaut de l'outil ; l'image native du navigateur est remplacée par une image vide.
2. Le fantôme est le vrai élément rendu (note vide, tableau, ligne…), pas une silhouette. Il porte une ombre
   d'élévation qui remplace en fondu l'ombre de repos, suit le curseur avec un léger retard (interpolation 0,5
   par image si l'élément s'incline, 0,6 sinon) et s'incline en 3D selon la vitesse (25° au plus, amorti à
   0,2). Pas d'inclinaison pour un tableau, une ligne, un dessin, ou plusieurs éléments.
3. Point de prise : l'élément est tenu à 3 UG du bord gauche et 3 UG du haut ; un tableau (vue en icône,
   10 UG) est tenu au centre de son icône (5 UG, 5 UG) ; une ligne en son milieu (8,5 UG, 8,5 UG).
4. Au lâcher : position = point du coin haut gauche du fantôme, ramenée à l'échelle de la cible, arrondie à
   l'UG la plus proche (`client/element/dnd/utils/translateDropResultIntoElementLocation.js`,
   `client/canvas/utils/canvasPositionUtils.ts`). L'élément prend le score le plus haut + 1 : il passe
   au-dessus de tout (`client/element/actions/elementActions.js`, `getCanvasUpdatedLocation`).
5. Lâché hors d'une cible ou sur la corbeille : rien n'est créé.
6. Ensuite, sélection et édition selon l'outil : note, lien (le champ d'adresse prend le focus), tâches,
   tableau (titre), colonne (titre), commentaire, document, titre, audio, carte, vidéo : sélection +
   édition ; ligne et table : sélection seule ; croquis et nuancier : ni l'un ni l'autre. Une image ne
   passe jamais en édition à la création.

**Notak** : absent. Les boutons de `Barres.tsx` n'ont qu'un `onClick`.

**Écart** : absent en entier (fantôme, point de prise, inclinaison, dépôt à l'endroit choisi).

### 1.4 Lâcher un outil sur une colonne ou un tableau imbriqué

**Milanote** (`DraggableElementCreationTool.tsx`, fonction de décision sélection/édition ;
`client/list/listDropTargetDecorator.js` ; `client/element/column/Column.jsx`) :
- sur une colonne ouverte : l'élément entre à la place d'insertion visée, il est sélectionné et édité ;
- sur une colonne repliée : il y entre, sans être sélectionné ni édité ;
- sur un tableau imbriqué (ou un raccourci) : il part dans ce tableau, sans sélection ni édition ;
- une colonne refuse une ligne, une colonne, un commentaire replié.

**Notak** : absent (pas de glisser d'outil). Les règles d'accueil d'une colonne existent pour le
déplacement (`elements/colonne/regles.ts:5-6` : ni colonne ni ligne), identiques à Milanote hors commentaire.

**Écart** : absent.

---

## 2. Double-clic sur le vide

**Milanote** (`client/canvas/canvasDoubleClickShortcutDecorator.js`,
`client/components/events/allowDoubleClickCreateShortcutDecorator.jsx`,
`client/workspace/shortcuts/clipboard/elementShortcutsDecorator.js`, `createShortcutCard`) :
- c'est un **réglage de l'utilisateur**, lu sans valeur par défaut côté client : jamais réglé, il est
  inactif (`common/users/utils/userPropertyUtils.js:73`, `client/user/currentUserSelector.ts:99`) ;
- refusé si le tableau n'est pas modifiable, en mode modèle, ou en mode dessin ;
- la note naît avec son coin haut gauche sous le curseur (1 px plus haut), arrondi à l'UG ; elle est
  sélectionnée et éditée ;
- sur iPad, un double appui n'est compté que si l'appui dure moins de 120 ms ou n'a pas bougé, et si deux
  relâchés sont à moins de 300 ms.

**Notak** (`Toile.tsx:612-639`) : toujours actif hors lecture seule. Sur le vide : note créée au point du
curseur arrondi à l'UG (`aimanter`), puis édition. Sur un élément : l'ouvre (tableau) ou l'édite. Sur la
poignée : bascule de largeur.

**Écart** : Notak l'active pour tous, Milanote seulement sur réglage. Position identique (à 1 px près).

---

## 3. Cmd+Entrée : l'élément suivant

### 3.1 Pendant l'édition d'une note

**Milanote** (`client/element/card/tiptap/useCardTiptapEditorExtensions.ts`, `onModEnter` ;
`client/element/newElementDecorator.jsx`) : le texte est enregistré d'abord (pour l'annulation), puis une
note neuve naît :
- sur la toile : même x, y = bas de la note (hauteur mesurée, arrondie à l'UG) + 1 UG, **même largeur** ;
- dans une colonne : juste après la note, à l'indice suivant.
Elle est sélectionnée et éditée.

**Notak** (`elements/note/extensions.ts:69-72`, `elements/note/Note.tsx:60-73`) : même x, y = bas mesuré + 1,
même largeur, **et même couleur** ; édition de la neuve.

**Écart** : Notak recopie aussi la couleur (Milanote, ici, ne recopie que la largeur). Dans une colonne,
Notak ne gère pas le cas : la note neuve est créée sans parent, donc posée sur la toile aux coordonnées x
stockées de la note rangée, loin de la colonne (`Note.tsx:62-64`).

### 3.2 Un élément sélectionné, hors édition

**Milanote** (`client/workspace/shortcuts/keyboardShortcuts.js:152`,
`client/workspace/shortcuts/elementUpdateKeyboardShortcutActions.js`, `handleCreateElementOfType`) :
un seul élément sélectionné requis.
- note : une note dessous (bas mesuré + 1 UG, 8 UG si la hauteur est inconnue), avec **toute la mise en
  forme** de la source (couleur, largeur…, tout sauf le texte et les réactions) ;
- tableau : un tableau 17 UG à droite ; document : 17 UG à droite ; colonne : une colonne 36 UG à droite
  (34 + 2) ;
- liste de tâches : une liste dessous ; commentaire : un commentaire dessous ;
- table, ligne, image : rien ;
- tout autre type : une note dessous ;
- dans une colonne : l'élément neuf se place juste après.
Alt+Entrée : sur une colonne, crée une note en tête de la colonne ; sur une liste de tâches, affiche et
édite son titre (`client/workspace/shortcuts/editingElementKeyboardShortcutActions.js`).

**Notak** (`elements/tableau/index.ts:12-20`) : Cmd+Entrée sur un tableau seul sélectionné l'**ouvre**. Rien
pour les autres types. Pas d'Alt+Entrée.

**Écart** : absent, et contradictoire pour le tableau (Notak ouvre, Milanote crée un voisin à 17 UG).
`docs/SPEC.md` §15 promet pourtant « créer l'élément suivant du même type, dessous ».

---

## 4. La note vide

### 4.1 Retour arrière dans une note vide

**Milanote** (`common/tiptap/hooks/useCommonTiptapEditorExtensions.ts`, `onEmptyDelete` ;
`client/element/card/CardContainer.jsx:142-145`) : le contenu vide est enregistré, puis la note part à la
**corbeille** du tableau (récupérable).

**Notak** (`elements/note/extensions.ts:73-76`, `Note.tsx:53-59`) : la note est supprimée (annulable par
Cmd+Z), l'édition se ferme. Vide = un seul paragraphe ou titre sans contenu (`elements/note/conversion.ts:10-14`).

**Écart** : même geste ; la note de Notak ne va pas dans une corbeille (Notak n'en a pas).

### 4.2 Quitter une note vide (clic ailleurs, Échap)

**Milanote** : aucune suppression automatique trouvée ; la note vide reste, et affiche son texte d'invite même
hors édition (option du gestionnaire d'invite : visible aussi quand on ne peut pas écrire,
`useCommonTiptapEditorExtensions.ts`).

**Notak** (`Toile.tsx:210-218`) : la note vide reste aussi, mais **sans texte d'invite** (aucun placeholder
dans `elements/note/`) : un rectangle blanc de 8 UG de haut.

**Écart** : comportement identique (rien n'est supprimé) ; l'invite visible manque chez Notak.

---

## 5. Conversions en tapant

**Milanote** (`common/tiptap/extensions/universalCard/UniversalCard.ts`, `link.ts`, `swatch.ts`, `task.ts`) :
une seule conversion par note.
- à Entrée ou à la sortie de la note : si tout le texte est une seule adresse web (un seul paragraphe, un
  seul nœud texte, sans code en ligne, et pas une adresse courriel) → la note devient un **lien** ;
- à Entrée ou à la sortie : si tout le texte est un code couleur → **nuancier** (17 × 12 UG, valeur et
  légende affichées, légende = nom de la couleur) ;
- à Espace ou Entrée : si le texte est `[]`, `[ ]` ou `[x]` → une **tâche** (cochée avec `x`) ;
- coller des tâches copiées dans une note vide la change en liste de tâches
  (`client/element/card/tiptap/CardTaskListPaste.ts`).

**Notak** : absent. Aucune extension ne convertit la note (`elements/note/extensions.ts`). `docs/SPEC.md` §3
le promet.

**Écart** : absent (lien, nuancier, tâche).

---

## 6. Coller (hors édition)

### 6.1 L'ordre de lecture du presse-papiers

**Milanote** (`client/workspace/shortcuts/clipboard/WorkspaceClipboardHandler.jsx`, `onPaste`) : ignoré si le
tableau n'est pas modifiable, si une table est en édition, si la cible est un champ éditable. Puis, dans
l'ordre, le premier qui réussit :
1. une liste de tâches copiée, collée sur une liste sélectionnée : ajout à cette liste ;
2. des éléments Milanote (charge structurée dans le HTML) ;
3. une table HTML d'au moins 2 lignes et 2 colonnes → élément table (largeurs reprises en UG ; si une table
   est sélectionnée, son contenu est remplacé) ;
4. des fichiers → image si compatible, sinon fichier (icône ou détail selon le type), un fichier `.url`
   devient un lien ; le texte d'accompagnement, s'il est une adresse de moins de 300 caractères, sert de
   légende ;
5. du texte collé sur des éléments sélectionnés sans légende (hors notes) → devient leur légende ;
6. des cases à cocher → liste de tâches ;
7. une adresse seule (moins de 300 caractères, pas une adresse courriel) → lien, aperçu demandé tout de
   suite, puis tout est désélectionné ;
8. du HTML (paragraphes vides de fin retirés) → note ;
9. du texte brut → note. Exception : une ligne seule sélectionnée reçoit le texte (400 premiers caractères)
   comme étiquette (`clipboardActions.ts`, `pasteText`).
Un code couleur collé seul passe par la création de note, qui en fait un nuancier
(`elementShortcutsDecorator.js`, `createShortcutCard`).

**Notak** (`Toile.tsx:268-283`, `Toile.tsx:313-322`, récepteurs par priorité) : actif seulement si la toile a
le focus et hors édition. Image (priorité 40 : png, jpeg, webp, gif, svg, 25 Mo au plus,
`elements/image/recepteur.ts:31-37`, `elements/image/geometrie.ts:4-5`), puis adresse (30 :
`elements/lien/index.ts:36-43`, `elements/lien/adresse.ts`, 300 caractères au plus, `https://` ajouté si
absent, courriel refusé), puis note depuis HTML ou texte (10 : `elements/note/index.ts:43-52`,
couleurs du texte collé retirées, `conversion.ts:16-41`).

**Écart** : absents chez Notak : éléments Notak (aucun copier/couper d'éléments n'existe), table, fichier
quelconque, légende, liste de tâches, nuancier, étiquette de ligne, ajout à une liste sélectionnée.
Ressemblance : seuil de 300 caractères et refus des courriels pour les adresses.

### 6.2 Où arrive ce qui est collé, et dans quel état

**Milanote** :
- texte, HTML, adresse, fichier, table, tâches : dans les **non triés** du tableau, en tête (indice 0)
  (`elementShortcutsDecorator.js`, `getListChildNewLocation` dans
  `common/elements/utils/elementLocationUtils.ts:56-62`) ; le panneau des non triés s'ouvre de lui-même
  (`client/inbox/inboxActions.js:208-216`) ;
- la note collée est **sélectionnée et éditée** ; le lien est créé puis tout est désélectionné ; un fichier
  n'est ni sélectionné ni édité ;
- des éléments copiés (`clipboardPastePositionUtils.ts`, `clipboardConstants.ts`) : si l'original est visible,
  décalés de 2 UG en x et en y à chaque collage successif ; sinon centrés dans la vue, au moins à 1 UG et à
  2 UG × nombre de collages du coin haut gauche ; dans le même ordre de profondeur, tous au premier plan.
  Collés sur une colonne sélectionnée, ils y entrent (sauf lignes et colonnes, qui restent sur la toile).
  Par le menu contextuel : au point cliqué.

**Notak** (`Toile.tsx:318`, `Toile.tsx:279`) : tout arrive au centre de la vue (coin haut gauche au centre),
puis les éléments créés sont **sélectionnés**, sans édition.

**Écart** : Notak n'a pas de non triés ; la note collée n'est pas éditée ; pas de décalage de 2 UG entre
collages (deux collages se superposent).

---

## 7. Déposer depuis le Finder (ou un autre site)

**Milanote** (`client/canvas/dnd/canvasDropTargetDecorator.js`, `client/canvas/dnd/canvasFileDropUtil.ts`,
`client/utils/dnd/dragAndDropUtils.js`) :
- **fichiers** : créés un par un, en attendant que le précédent soit dessiné pour mesurer sa hauteur. Départ :
  le point du curseur ; mais plusieurs fichiers sur une toile **vide** partent du coin du tableau (0, 0),
  décalés de 2 UG. Rangement en mur de briques : colonnes de 34 UG + 2 UG d'écart, au moins 3 colonnes,
  autant que la vue en contient à l'échelle 1 ; chaque fichier va dans la colonne la moins haute, 2 UG
  sous le précédent (1 UG pour le premier sous le curseur). Un seul fichier : coin haut gauche au curseur.
  Images → image, autres → fichier, `.url` → lien. Ni sélection ni édition ;
- **texte** : une note au point de dépôt (1 UG en haut à gauche du curseur), sélectionnée et éditée ; un code
  couleur devient un nuancier ;
- **adresses** : un lien chacune, décalés de 30 px l'un de l'autre, aperçu demandé, puis désélection ;
- **image glissée d'une page web** : une image avec sa source (même en data URI), légende affichée, puis
  l'adresse d'origine attachée ;
- déposé **sur une colonne** : fichiers, texte et adresses y entrent à la place visée
  (`client/list/listDropTargetDecorator.js`).
Largeur d'une image neuve : sa largeur en pixels sur la taille de grille, au plus 34 UG
(`client/element/image/Image.jsx:138-150`).

**Notak** (`Toile.tsx:641-644`, `Toile.tsx:268-283`, `elements/image/recepteur.ts`,
`elements/image/geometrie.ts`) : mêmes récepteurs que le collage, au point de dépôt.
- une image seule : coin haut gauche à 1 UG en haut à gauche du curseur (`geometrie.ts:42`) ;
- plusieurs images : depuis le curseur, colonnes de 36 UG (34 + 2), chacune dans la moins haute, 2 UG
  d'écart ; nombre de colonnes = max(3, largeur de la vue en px / 360) (`geometrie.ts:35-50`) ;
- largeur d'une image : px / 10, entre 4 et 34 UG (`geometrie.ts:21-22`) ;
- texte → note, adresse → lien ;
- les éléments créés sont sélectionnés.

**Écart** :
- image seule : 1 UG plus haut et à gauche que Milanote ;
- plusieurs images sur toile vide : Notak part du curseur, Milanote du coin du tableau ;
- fichiers non image, `.url`, images glissées d'un site : ignorés chez Notak ;
- dépôt sur une colonne : Notak pose sur la toile, jamais dans la colonne (`recevoir` ne regarde que le point) ;
- Notak sélectionne ce qui est déposé, Milanote non (sauf la note de texte, éditée chez Milanote, simplement
  choisie chez Notak) ;
- plusieurs adresses : Notak n'en lit qu'une (texte brut entier), Milanote une par adresse, décalées de 30 px.

---

## 8. Tailles, contenu et couleur à la création

| Type | Milanote | Notak | Écart |
|---|---|---|---|
| Note | largeur 34 UG, texte vide, pas de couleur (`common/cards/index.js`, `common/elements/elementConstants.ts:135`) | 34 UG, un paragraphe vide, pas de couleur, hauteur mini 8 UG (`coeur/tableau.ts:6-8`, `215-224`) | identique ; invite absente chez Notak (§4.2) |
| Titre | une note, un titre de niveau 1 centré, fond transparent (`.../elementTools/HeaderTool.tsx`) | note, titre niveau 1 centré, couleur `transparent`, variante `titre` (`elements/note/index.ts:28-37`) | identique |
| Lien | adresse vide, édition sur le champ d'adresse (`common/links/index.js`) | 34 UG, adresse vide, statut « attente », édition (`elements/lien/index.ts:10-31`) | identique |
| Tâches | une liste avec une tâche vide, titre masqué, édition (`client/element/taskList/taskListActions.js:104`, `common/taskLists/index.js`) | 34 UG, une tâche vide non cochée, pas de titre (`elements/taches/liste.ts:10-41`) | identique |
| Tableau | vue en icône 10 UG de large, titre vide montrant l'invite, tout sélectionné à l'édition, palette de couleurs **tirée au hasard** (`common/boards/index.js`, `client/element/board/Board.jsx:186-205`) | largeur 12 UG, titre réel « Nouveau tableau » enregistré, renommage ouvert texte sélectionné, couleur **suivante dans la rotation** (`elements/tableau/index.ts:9`, `30-46`, `coeur/espace.ts:128-133`) | 12 UG au lieu de 10 ; titre stocké au lieu d'une invite (un tableau non renommé garde ce nom partout) ; couleur tournante au lieu d'aléatoire ; le renvoi n'est pas sélectionné chez Notak |
| Colonne | titre vide montrant l'invite, tout sélectionné à l'édition (`common/columns/index.js`, `client/element/column/Column.jsx:136-145`) | 34 UG, titre réel « Colonne » stocké, édition texte sélectionné (`coeur/tableau.ts:226-230`, `elements/colonne/Colonne.tsx:8-28`) | titre stocké au lieu d'une invite |
| Ligne | 17 × 17 UG, du bas gauche au haut droit, flèche à l'arrivée, rien au départ, trait plein, épaisseur 2 ; sélectionnée, pas éditée (`common/lines/index.js`, `common/lines/lineConstants.ts:23-31`) | identique (`elements/ligne/creation.ts:5-20`, `elements/ligne/index.tsx:22-27`) | identique |
| Table | 4 lignes × 3 colonnes, 1re ligne en en-tête, colonnes 11,3 / 11,3 / 11,4 UG (34 en tout) (`common/table/index.js`, `common/table/tableConstants.ts:11-17`) | absent | absent |
| Nuancier | 17 × 12 UG, valeur et légende affichées (`common/colorSwatches/index.js`, `universalCard/swatch.ts`) | absent | absent |
| Document | vue en icône, texte vide, sans média (`common/documents/index.js`) | absent | absent |
| Commentaire | fil neuf, ouvert à la création s'il est attaché (`common/comments/index.js`, `elementActions.js`) | absent | absent |
| Image | largeur min(px / grille, 34) UG, jamais en édition à la création | min(max(px / 10, 4), 34) UG | identique au plancher de 4 UG près |

---

## 9. Écarts classés par importance pour un utilisateur

Ce qui saute aux yeux d'abord :

1. **Pas de glisser depuis la barre de gauche** (§1.3). Le geste de base de Milanote manque : pas de fantôme,
   pas de choix de l'endroit, pas d'inclinaison. Le clic pose tout au centre de la vue, coin en haut à gauche
   au centre, et deux clics empilent deux éléments au même point (§1.2).
2. **La barre est courte et dans un autre ordre** (§1.1) : pas de commentaire, de table, d'image, d'envoi de
   fichier, de dessin, de tiroir « plus » ni de corbeille ; Titre remonte en 2e place.
3. **Coller du texte ou une image ne passe pas par les non triés** et la note collée n'est pas éditée
   (§6.2) ; coller des éléments copiés est impossible (§6.1), donc pas de décalage de 2 UG entre collages.
4. **Cmd+Entrée sur un élément sélectionné ne crée rien** (il ouvre un tableau chez Notak) (§3.2). En
   édition d'une note rangée dans une colonne, la note suivante tombe sur la toile au lieu de suivre dans la
   colonne (§3.1) : un défaut visible.
5. **Pas de conversion en tapant** : une adresse tapée reste du texte, `[] ` ne fait pas de tâche, un code
   couleur ne fait pas de nuancier (§5).
6. **Déposer depuis le Finder** : un PDF ou tout fichier non image est ignoré sans un mot ; déposer sur une
   colonne ne range pas dedans ; plusieurs adresses n'en donnent qu'une (§7).
7. **Le double-clic crée toujours une note** chez Notak, alors que Milanote en fait un réglage, inactif
   tant qu'on ne l'a pas allumé (§2). À trancher : garder le choix de Notak, ou ajouter le réglage.
8. **Une note vide n'affiche pas d'invite** (§4.2), et un tableau ou une colonne neufs portent un vrai titre
   par défaut au lieu d'une invite (§8) : un tableau jamais renommé s'appelle « Nouveau tableau » partout.
9. Détails : la note suivante recopie la couleur chez Notak (§3.1) ; image déposée seule 1 UG plus haut et à
   gauche (§7) ; renvoi de tableau à 12 UG au lieu de 10 (§8) ; couleur de tableau tournante au lieu
   d'aléatoire (§8) ; la note vide supprimée au retour arrière ne va pas dans une corbeille (§4.1) ; pas de
   sons ni de vibration (§1.2, §1.3).
