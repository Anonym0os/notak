# Écarts Milanote / Notak · les éléments une fois posés

Lu le 23/10/2026, en lecture seule sur les deux dépôts. Les comportements de Milanote sont décrits dans nos mots : aucun
code ni texte d'interface n'est repris.

**Conventions.**
- Chemins Milanote relatifs à `milanote-src/milanote/src/`. Chemins Notak relatifs à `~/Documents/CODE/notak/packages/tableau/src/`.
- UG : unité de grille. Milanote la fait valoir 8, 9 ou 10 px selon la taille d'écran (`client/utils/grid/gridConstants.ts`),
  et 1 rem = 1 UG (`html.app-size-small` 8 px, `medium` 9 px, sinon 10 px). Notak la fixe à 10 px (`coeur/camera.ts:8`).
  Les valeurs en px ci-dessous sont celles de la taille « large » (10 px).
- **Identique** / **Différent** / **Absent** (absent de Notak, sauf mention contraire).

---

## 0. Ce qui est commun à tous les éléments (le cadre)

| Comportement | Milanote | Notak | Écart |
|---|---|---|---|
| Ombre au repos | Très légère : 0 1px 2px, noir à 5 % (`--element-shadow-elevation-1` → `--shadow-xs`, `client/element/card/Card.scss`). | 0 1px 3px à 10 % + 0 1px 1px à 4 % (`toile.css:7`, appliquée `toile.css:44`). | **Différent** : l'ombre de Notak est environ deux fois plus marquée. |
| Coins | 0 (carré) pour note, colonne, lien, image, tâches (`--element-border-radius: 0`). | 2 px (`toile.css:42`) ; colonne 10 px (`elements/colonne/colonne.css:17`). | **Différent**, surtout la colonne. |
| État sélectionné | Bordure de 2 px couleur de sélection, posée par-dessus, et **l'ombre disparaît** (`Card.scss`, règle `.selected`). Verrouillé : autre couleur. | Anneau de 2 px accent **en plus** de l'ombre (`toile.css:48-49`). | **Différent** (léger) : Milanote retire l'ombre. Pas d'état « verrouillé » dans Notak. |
| État en édition | La bordure de sélection s'écarte de 2 px vers l'extérieur, en 100 ms (`--element-border-offset: 2px` sur `.focus-editing`, transition 0.1 s ease-out). | Rien de visible, à part le curseur texte (`toile.css:52-55`). | **Différent** : rien ne distingue « choisi » de « en édition » dans Notak. |
| Survol | Aucun changement sur un élément opaque. Un élément transparent montre un liseré de 1 px au survol (`.Card.transparent:hover`). Poignée de taille et bouton de repli apparaissent au survol. | Aucun état de survol (hors bouton de repli de colonne). La poignée n'existe que sur un élément seul choisi. | **Différent** : voir chaque type. |
| Poignée de redimensionnement | Coin bas-droit, zone de 10 px, invisible au repos, apparaît en 100 ms au survol **ou** à la sélection (`client/element/resizing/ElementResizeHandle.scss`). Dans une colonne, elle redimensionne la hauteur seulement. | Carré de 10 px bordé d'accent, visible seulement si l'élément est seul choisi, libre, hors édition (`toile.css:189-200`, `Cadre.tsx:52`). | **Différent** : pas de poignée au survol, pas de redimensionnement en hauteur. |
| Aimant de largeur | À moins de 2 UG de 34, la largeur se colle à 34 (`client/element/resizing/resizeUtils.ts:15,119`). | Idem (`coeur/largeur.ts:4-13`). | **Identique**. |
| Double-clic sur la poignée | Bascule largeur par défaut / largeur naturelle (`client/element/resizing/elementDoubleClickResizeDecorator.tsx`). Colonne : remet la largeur par défaut (`client/element/column/columnSaveSizeResizeDecorator.jsx`). | Bascule 34 ↔ largeur naturelle (`coeur/largeur.ts:19-22`, `Toile.tsx:620-627`). | **Identique** pour le principe. |
| Barre de couleur | Toute note, colonne, lien, image peut porter une **barre de couleur** de 5 px en haut au lieu d'un fond (`client/components/colors/ColorBar.scss`) ; le choix se fait dans la palette, onglet fond ou barre (`…/colorTools/popup/colorPopupConstants.ts`). Couleur libre (hex) possible, et couleurs suggérées du tableau. | Fond seulement, 11 teintes + transparent (`elements/note/Outils.tsx`). Pas de barre, pas de couleur libre. | **Absent** : barre de couleur et couleur libre. |
| Outil « ligne rapide » | Sur un élément seul choisi (toile ou colonne), une pastille au coin haut-droit (zone 30 px, rond 16 px qui grossit au survol) qu'on tire pour créer une ligne accrochée (`client/element/quickLine/quickLineUtil.js`, `QuickLineCreationTool.scss`). | Rien. On crée une ligne par l'outil de gauche ou Cmd+K. | **Absent**. |
| Où vivent les outils d'un élément | Dans la **barre verticale de gauche**, qui change de contenu : création → sélection → édition, avec un délai de 100 ms (300 ms pour un tableau seul, pour ne pas clignoter au double-clic) (`client/workspace/toolbar/components/Toolbar.tsx`). | Une barre flottante au-dessus de la sélection (`Toile.tsx:669`), et une barre de mise en forme collée au-dessus de la note en édition (`elements/note/note.css:128`). | **Différent** : choix d'interface à assumer (→ Notak), mais à écrire dans la spec. |

---

## 1. La note

### Apparence

| Comportement | Milanote | Notak | Écart |
|---|---|---|---|
| Largeur | 34 UG par défaut, 17 au minimum (`common/elements/elementConstants.ts:135`, `client/element/resizing/resizableEditor/ResizableEditorSaveHeightDecorator.tsx:9`). | 34 et 17 (`coeur/tableau.ts:6`, `coeur/largeur.ts:2`). | **Identique**. |
| Hauteur minimale | 58 px pour une ligne (5,8 UG) ; 86 px dès qu'il y a plusieurs lignes et une hauteur bornée (`common/cards/cardConstants.ts`, `client/element/card/CardContainer.jsx:99-111`). | 80 px (`toile.css:40`). | **Différent** : une note d'une ligne est plus haute dans Notak (80 contre 58). |
| Marges intérieures | Haut 24, gauche 24, droite ≈ 20, bas 14 px (`client/element/card/tiptap/CardTiptapEditor.scss`, `--element-padding-default: 2.4rem`). Moins en tailles moyenne et petite. | 20 px partout (`toile.css:41`). | **Différent** : Milanote laisse moins d'air en bas qu'en haut. |
| Texte | 14 px ; grand titre 20 px, titre 15 à 16 px, petit texte 12 px environ (`--font-size-element-*`, `common/tiptap/styles/MilanoteTiptapEditorStyles.scss`). | 14 px ; titres 22 et 18 px (`elements/note/note.css:60-61`). | **Différent** : titres de Notak plus gros. Pas de « petit texte ». |
| Couleur du texte sur fond coloré | Clair ou sombre selon le meilleur contraste avec le fond ; les tons secondaires (lien, case faite, indication) suivent (`client/element/card/Card.jsx:55-71`, `Card.scss` `.colored-background-*`). | Même calcul de contraste (`elements/note/couleurs.ts:42-50`) ; seule la couleur du texte suit. | **Identique** pour le principe ; Notak ne décline pas les tons secondaires. |
| Seconde couleur | Une note peut avoir une couleur de texte propre, distincte du fond (`getSecondaryColor`, `Card.jsx:108`). | Non. | **Absent**. |
| Note vide | Une indication grise s'affiche, **même hors édition** et en lecture seule (`showOnlyWhenEditable: false`, `common/tiptap/hooks/useCommonTiptapEditorExtensions.ts`). La note vide n'est jamais supprimée d'office. | Aucune indication (`elements/note/Note.tsx:29-32`). La note vide reste. | **Absent** : l'indication. |
| Hauteur bornée | On peut tirer la poignée vers le haut pour borner la hauteur : le texte qui dépasse est caché sous un voile dégradé de 60 px ; en édition, la note s'étend le temps d'écrire (`client/element/resizing/resizableEditor/*`, `ResizableEditorOverflowOverlay.scss`). | Largeur seulement ; la hauteur suit le texte. | **Absent**. |
| Variante transparente / titre | Transparente : ni fond ni ombre, liseré de 1 px au survol. | Transparente : ni fond, ni ombre, ni marge (`toile.css:93-97`, `elements/note/note.css:44`) ; pas de liseré au survol. Outil « Titre » : note transparente, titre centré (`elements/note/index.ts:28-37`). | **Différent** (léger) : pas de liseré au survol, une note transparente vide devient introuvable. |
| Légende | Toute note peut recevoir une légende (`Caption`, `Card.jsx:172`). | Non. | **Absent**. |

### Entrer et sortir de l'édition

| Comportement | Milanote | Notak | Écart |
|---|---|---|---|
| Premier clic | Choisit la note. | Choisit la note (`Toile.tsx:465`). | **Identique**. |
| Clic sur une note **déjà seule choisie** | Entre en édition, curseur **à l'endroit du clic** (`common/tiptap/hooks/useElementTiptapEditorClickHandler.ts`). | Rien : il faut double-cliquer ou Entrée. | **Différent**, important : le geste le plus courant de Milanote ne marche pas. |
| Double-clic | Entre en édition (le premier clic choisit, le second édite). | Entre en édition (`Toile.tsx:629-634`), curseur **en fin de texte** (`elements/note/Note.tsx:42`). | **Différent** : le curseur ne va pas où l'on a cliqué. |
| Entrée sur la note choisie | Édite. | Édite (`Toile.tsx:425-429`). | **Identique**. |
| Échap | Sort de l'édition, la note reste choisie. | Idem (`Toile.tsx:378-381`, `finirEdition` ne touche pas la sélection). | **Identique**. |
| Clic ailleurs | Sort, et choisit ce qu'on a cliqué. | Idem (`Toile.tsx:448`). | **Identique**. |
| Retour arrière dans une note vide | Envoie la note à la corbeille (aussi Maj, Alt + retour arrière, et Suppr) (`common/tiptap/extensions/EmptyDelete.ts`). | Supprime la note (`elements/note/extensions.ts:73-77`). | **Identique** (Notak n'a pas de corbeille, et Suppr n'est pas pris). |
| Cmd+Entrée | Note neuve 1 UG sous la note, **même largeur, sans la couleur** ; dans une colonne, juste après elle dans la colonne (`client/element/newElementDecorator.jsx`). | Note neuve 1 UG dessous, même largeur, **avec la couleur** (`elements/note/Note.tsx:60-73`). **Dans une colonne, elle tombe sur la toile** à l'ancienne position x/y de la note, qui n'a plus de sens (`Note.tsx:63-64`). | **Différent** + **défaut** dans une colonne. |
| Enregistrement pendant la frappe | Le texte part au magasin toutes les 5 s ou toutes les 80 modifications ; cinq fois plus souvent quand d'autres personnes sont là (`common/tiptap/extensions/externalStoreSync/ExternalStoreSynchroniser.ts:6-7`, `client/components/tiptapEditor/useClientCommonTiptapEditorExtensions.ts`). | Rien n'est écrit avant la **sortie** de l'édition (`elements/types.ts:86-90`, `Toile.tsx:210-218`). | **Différent**, important à plusieurs : les autres ne voient rien tant qu'on écrit, et une fermeture d'onglet perd tout. La spec (§5) promet un `Y.XmlFragment` partagé, le code garde du JSON. |
| Lecture seule | Pas d'édition ; les liens restent cliquables ; l'indication de note vide s'affiche. | Pas d'édition (`Toile.tsx:221`) ; liens cliquables (`Note.tsx:22`). | **Identique** (hors indication). |

### Mise en forme

| Comportement | Milanote | Notak | Écart |
|---|---|---|---|
| Quand la barre apparaît | Dès qu'on entre en édition, dans la barre de gauche (`client/element/card/index.js`, `tools.editing`). | Dès qu'on entre en édition, posée 8 px au-dessus de la note (`elements/note/Barre.tsx`, `note.css:128-146`). | **Différent** de place (voir §0). |
| Contenu de la barre | Style de bloc, menu d'insertion (émoji, séparateur, lien vers un tableau, mention), gras, italique, barré, souligné, puces, numérotée, **retrait +**, **retrait −**, centrer, code, lien, **commentaire en ligne** (`client/workspace/toolbar/config/toolbarToolConfig.ts`, `TEXT_EDITING_INLINE_AND_BLOCK`). | Style, gras, italique, barré, souligné, puces, numérotée, centrer, code, lien (`Barre.tsx:71-89`). | **Absent** : insertion, retraits, commentaire. |
| Styles de bloc | Grand titre, titre, texte, **petit texte**, bloc de code, citation, **encadré à icône** ; plus 5 couleurs de texte et 6 surlignages (`…/editorTools/textStylePopup/TiptapTextStylePopupContent.tsx`). | Grand titre, titre, texte, citation, code ; 5 couleurs, 6 surlignages (`Barre.tsx:7-13`, `couleurs.ts:68-83`). | **Absent** : petit texte, encadré, séparateur à l'insertion. |
| Couleur et surlignage | S'excluent l'un l'autre (`common/tiptap/extensions/TextHighlight.ts`). | S'excluent (`elements/note/commandes.ts:9-19`). | **Identique**. |
| Raccourcis | Cmd+Maj+1 / 2 / 0 / 9 (titres, texte, petit texte), Cmd+Maj+7 ou O, Cmd+Maj+8 ou U (listes), Cmd+Maj+B ou Cmd+' (citation), Cmd+. (code), Cmd+Maj+6 (encadré), Cmd+Maj+X (barré), Cmd+J ou Cmd+Maj+H (surlignage vert), Cmd+\ (centrer), Cmd+K (lien), Maj+F3 (casse), Tab / Maj+Tab (retrait du texte). | Cmd+Maj+1 / 2 / 0 / 8 / 7, Cmd+Maj+X, Cmd+E (code en ligne), Cmd+\, Cmd+Maj+H, Cmd+K (`elements/note/extensions.ts:22-39`, `65-68`). | **Différent** : manquent Cmd+Maj+9, Cmd+., Cmd+Maj+B, Cmd+J, Cmd+Maj+O / U, Maj+F3, Tab. |
| Raccourcis Markdown | `*x*` et `**x**` et `__x__` → **gras** ; `_x_` → italique ; `~x~` → barré ; `==x==` → surlignage ; `[texte](adresse)` → lien ; `---` → séparateur ; `> ` citation ; `# ` et `## ` titres ; listes et bloc de code ; encadré par un émoji en tête (`common/tiptap/extensions/Bold.ts:8-18`, `Italic.ts`, `Strike.ts`, `hyperlink/Link.ts:19`, `HorizontalRule.ts:36`, `Callout.ts`). | Ceux de Tiptap par défaut : `*x*` → **italique**, `**x**` → gras, `~~x~~` → barré, `==x==`, `` `x` ``, `# `, `## `, `> `, listes, bloc de code, `---` (`elements/note/extensions.ts:43`). | **Différent** : `*x*` donne de l'italique au lieu du gras, `~x~` simple ne barre pas, `[t](url)` ne fait pas de lien. |
| Conversion de la note | Au moment d'Entrée ou de la sortie : une note qui ne contient **qu'une adresse** devient un lien, **qu'un code couleur** devient un nuancier ; `[] ` ou `[x] ` seul (à l'espace) devient une liste de tâches (`common/tiptap/extensions/universalCard/UniversalCard.ts`, `task.ts`). | Aucune conversion. | **Absent**, alors que la spec §3 la décrit. |
| Collage dans la note | Une adresse collée reste du texte, souligné par un repérage automatique ; un tableau HTML, des lignes à cases deviennent table ou tâches (`TablePaste`, `CardTaskListPaste`, `hyperlink/Link.ts:45-49`). | Comportement de Tiptap : l'adresse collée devient un lien. | **Différent** (mineur). |
| Champ de lien | Fenêtre de lien (Cmd+K) gérée par la barre. | Champ dans la barre ; sans protocole, `https://` est ajouté ; Échap ferme le champ sans quitter la note (`Barre.tsx:122-155`, `conversion.ts:44-48`). | **Identique** pour l'usage. |

---

## 2. La colonne

| Comportement | Milanote | Notak | Écart |
|---|---|---|---|
| Largeur | 34 UG par défaut **et au minimum** (`client/element/column/ColumnContainer.jsx:18`). | 34 par défaut (`coeur/tableau.ts:226`), **17 au minimum** (aucun `largeurMin`, `elements/colonne/index.ts`). | **Différent** : une colonne de Notak peut devenir étroite. |
| Hauteur | 15 UG au minimum, même vide (`common/columns/columnConstants.ts`, `ColumnContainer.jsx:15`) ; réglable. | Pas de minimum : en-tête 36 px + zone de dépôt 60 px (`colonne.css:47-53`, `133-143`). | **Différent**. |
| Fond et bord | Fond de la teinte « colonne » (plus claire que les notes), coins carrés, ombre légère ; enfants sans ombre, cerclés d'un liseré de 1 px, marges latérales de 8 px (`Column.scss`, `--element-in-list-horizontal-padding: .8rem`). | Fond gris clair, coins de 10 px, liseré intérieur de 1 px à 5 % (`colonne.css:21-27`) ; enfants avec leur ombre, espacés de 8 px (`colonne.css` `.notak-colonne-corps`). | **Différent** visuellement. |
| Titre | Centré, 17 à 18 px, police des titres, peut aller à la ligne, 100 caractères au plus ; défaut « nouvelle colonne » (`Column.scss` `.title-container`, `common/columns/columnConstants.ts`, `client/components/editableTitle/EditableTitle.tsx:35`). | À gauche, 14 px gras, sur une ligne coupée par des points de suspension, sans limite ; défaut « Colonne » (`colonne.css:56-64`, `coeur/tableau.ts:228`). | **Différent**. |
| Éditer le titre | Un clic sur le titre d'une colonne **déjà choisie** l'édite, tout le texte sélectionné (`ElementSimpleContentEditable.jsx:173-176`). Entrée valide et **désélectionne** ; Échap valide et garde la sélection (`ElementSimpleContentEditable.jsx:86-101`). Un titre vidé est refusé : l'ancien revient (`EditableTitle.tsx` `onUpdate`). | Double-clic ou Entrée sur la colonne, tout le texte choisi ; Entrée valide et garde la sélection (`Colonne.tsx:8-29`). Un titre vide est gardé (indication pâle « Colonne », `Colonne.tsx:57-59`). | **Différent** : pas de clic sur le titre ; titre vide accepté. |
| Compteur | Sous la liste, en gris 12 px : la composition par type (« 3 notes, 1 image »…) (`client/element/containerElement/ContainerElementChildCount.jsx`, `client/utils/i18n/translationHelpers.ts:64`). | Un nombre seul, à droite du titre (`Colonne.tsx:61`). | **Différent**. |
| Replier | Bouton de 16 px dans le coin haut-droit, visible au survol, à la sélection ou quand la colonne est repliée (`ColumnCollapseButton.scss`). Repliée : titre et compteur seuls, plus un témoin d'activité. **On peut encore déposer sur une colonne repliée** : toute sa surface devient zone de dépôt (`ColumnBottomDropArea.scss`, `.column-collapsed`). | Chevron de 24 px à droite du titre, mêmes règles d'apparition (`colonne.css:94-120`). Repliée : **refuse les dépôts** (`elements/colonne/index.ts:14`). Ce qui était choisi dedans est désélectionné (`Colonne.tsx:35-44`). | **Différent** : dépôt refusé sur une colonne repliée. |
| Ce qu'elle accepte | Tout sauf colonne, ligne et annotation (`common/columns/columnUtils.ts:5`). | Tout sauf colonne et ligne (`elements/colonne/regles.ts`). | **Identique** (l'annotation n'existe pas encore). |
| Colonne vide | Zone de 15 UG sans texte. | Cadre en tirets « Déposer ici », 60 px (`Colonne.tsx:82-85`). | **Différent** (→ Notak, acceptable). |
| Couleur | Teintes propres aux colonnes ; titre et compteur passent en clair ou sombre selon le fond (`Column.scss` `.colored-background-*`). | 11 teintes claires (`colonne.css:2-14`) ; pas de calcul de contraste. | **Identique** pour l'usage (teintes claires). |
| Supprimer | — | La colonne emporte son contenu (`elements/colonne/index.ts:15`). | Non vérifié côté Milanote. |
| Lignes vers deux colonnes alignées | Si deux colonnes reliées ont leurs hauts à moins de 3 UG, la ligne se pose horizontale, à hauteur du titre (3,2 UG sous le haut) (`client/element/line/utils/lineUtil.js:30-74`, `lineUiConstants.js`). | Ligne de centre à centre. | **Absent**. |

---

## 3. Le tableau imbriqué

| Comportement | Milanote | Notak | Écart |
|---|---|---|---|
| Taille | 10 UG de large ; icône carrée de 72 px (60 px dans une colonne, 50 en mode document) ; détails sur 180 px de large (`common/elements/elementDisplayModeConstants.js:6`, `client/element/board/Board.jsx` `getBoardIconSize`, `client/components/displayMode/IconView.scss`). | 12 UG ; carré de 80 px (`elements/tableau/index.ts:9`, `tableau.css:9-20`). | **Différent** (léger). |
| Icône | Coins très arrondis (1,6 em), fond de couleur, et au choix une **icône** de la bibliothèque ou une **image** ; clair ou sombre selon le fond (`client/element/board/boardIcon/BoardIcon.scss`, outil `ICON` dans `client/element/board/index.js`). | Coins de 6 px, ombre, **initiale du titre** en blanc 40 px (`Renvoi.tsx:49-54`, `libelles.ts`). | **Absent** : icône et image. |
| Couleur | Se choisit (outil couleur de la sélection). | Tirée à la création, en tournant dans la palette (`coeur/espace.ts:52-53`) ; **aucun moyen de la changer**. | **Absent**. |
| Titre | Sous l'icône, centré, 15 px, peut aller à la ligne, 100 caractères au plus ; défaut « nouveau tableau ». | Sous le carré, 14 px, deux lignes au plus (`tableau.css:22-33`). | **Identique** pour l'usage. |
| Renommer | Clic sur le titre d'un tableau **déjà choisi**, après 100 ms, tout le texte sélectionné ; outil « Renommer » aussi (`Board.jsx`, `editDelay={100}`). | Outil « Renommer » seulement, et à la création (`Outils.tsx`, `index.ts:44`) ; Entrée, Échap ou clic ailleurs valident ; vide refusé (`Renvoi.tsx:29-39`, `66-96`). | **Différent** : pas de clic sur le titre. |
| Compteur | Composition par type (« 2 notes, 1 lien »), « vide », ou un état d'accès (protégé, refusé) (`Board.jsx` `BoardContainerTypeTag`, `BoardEmptyContentsTag.jsx`). | « vide », « 1 élément », « N éléments », lignes non comptées (`libelles.ts:10-14`). | **Différent** (moins parlant). |
| Ouvrir | Double-clic (Cmd+double-clic : nouvel onglet) (`client/element/board/BoardContainer.jsx:123-137`). Un clic sur un tableau déjà choisi affiche, après 500 ms et pendant 2 s, une bulle qui rappelle qu'il faut double-cliquer (`useBoardNavigationTooltip.ts`). | Double-clic, ou Cmd+Entrée (`Renvoi.tsx:44-47`, `index.ts:12-20`). Pas de bulle. | **Différent** (bulle absente ; Cmd+Entrée en plus). |
| Survol pendant un glisser | L'icône grossit à 110 %, prend une ombre et s'assombrit (luminosité 80 %) ; avant d'y entrer, elle clignote 300 ms (`BoardIcon.scss` `.can-drop`, `board-hover-blink`). | Rien. | **Absent** (le dépôt dans un tableau relève de la passe glisser-déposer). |
| Dans une colonne | Disposition en ligne : icône de 60 px à gauche, titre et compteur à droite (`IconView.scss` `.element-in-list`). | Même disposition qu'en toile. | **Différent**. |
| Sélection | Bordure de 2 px autour de l'icône seule, aux mêmes coins arrondis (`BoardIcon.scss`). | Anneau du cadre entier, carré compris le titre (`toile.css:99-101`). | **Différent** (léger). |

---

## 4. Le lien

| Comportement | Milanote | Notak | Écart |
|---|---|---|---|
| Création vide | Un champ d'adresse avec indication propre au type (lien, vidéo, audio, carte). Échap sort ; champ vide + retour arrière ou Suppr supprime l'élément (`client/element/link/LinkInput.tsx`). | Champ d'adresse « Adresse » ; Entrée valide ; une adresse invalide affiche un message 2 s ; un lien resté vide à la sortie est supprimé (`elements/lien/Lien.tsx:44-95`). | **Identique** pour l'usage (Notak supprime à la sortie, Milanote au retour arrière). |
| Chargement | Pendant la recherche : roue à la place de l'icône ; échec : icône d'échec et message traduit (connexion perdue…) (`LinkStateDisplay.tsx`, `linkActions.ts:189-228`). | Roue de 14 px ; échec au bout de 15 s ou sans service : l'adresse sert de titre (`Lien.tsx:7`, `17-42`, `103`). | **Identique** pour l'usage. |
| Adresse d'image | Une adresse d'image devient **tout de suite un élément image** ; le serveur peut aussi changer le type (fichier…) (`linkActions.ts:178-181`, `elementType`). | Reste un lien. | **Absent**. |
| Disposition | Image d'aperçu en haut, **à ses proportions** ; en-tête favicon 16 px + adresse ; **titre modifiable** (500 caractères, souligné, cliquable quand le lien n'est pas choisi) ; **légende** en texte riche, préremplie avec la description (`LinkHeader.tsx`, `LinkMetadata.jsx`, `linkActions.ts:83-104`). | Image en 16:9 rognée ; domaine + favicon 16 px ; titre en gras, 3 lignes ; description grise, 3 lignes ; rien de modifiable (`lien.css:12-23`, `80-100`, `Lien.tsx:112-157`). | **Différent** : titre et description figés, image rognée. |
| Afficher ou cacher | Outils « média » (montrer ou cacher l'aperçu), « infos » (mode image seule : double-clic sur l'aperçu ouvre le lien) et « légende » (`client/element/link/index.js`, `richMedia/LinkMedia.jsx`). Légende montrée d'office si une description existe et que ce n'est ni une vidéo ni un contenu riche (`linkActions.ts:94-98`). | Outils « Ouvrir » et « Copier » (`elements/lien/Outils.tsx`). | **Absent** : les trois réglages d'affichage. |
| Lecteurs intégrés | Vidéo, audio, carte, contenus riches de plus de 30 fournisseurs (YouTube, Vimeo, Spotify, SoundCloud, Figma, Google Maps, Loom…) (`common/links/linkConstants.ts`, `LinkMedia.jsx`). | YouTube et Vimeo, lancés par un bouton de lecture (`elements/lien/video.ts`, `Lien.tsx:114-136`). | **Différent** (partiel, conforme à la spec qui renvoie l'audio et la carte à plus tard). |
| Hauteur | Bornable comme une note, avec voile dégradé (`LinkMetaSection.tsx`) ; minimum 12 UG de large pour un affichage complet (`LinkConstants.ts:8`). | Largeur seule, 17 au minimum. | **Absent** (hauteur). |
| Rééditer | L'édition d'un lien chargé porte sur son **titre** ou sa **légende** (`index.js`, `editing_TITLE`, `editing_CAPTION`). | Le double-clic rouvre le **champ d'adresse** (`Lien.tsx:13`). | **Différent**. |
| Survol / clic | Le titre et l'adresse ouvrent le lien dans un nouvel onglet. | Domaine et titre aussi, sans choisir l'élément (`Lien.tsx:106-110`). | **Identique**. |

---

## 5. L'image

| Comportement | Milanote | Notak | Écart |
|---|---|---|---|
| Largeur de départ | La largeur réelle convertie en UG, plafonnée à 34 (`client/element/image/Image.jsx`, `imageWidth`). | Largeur en px ÷ 10, entre 4 et 34 (`elements/image/geometrie.ts:21-22`). | **Identique** à 10 px/UG ; Notak ignore la taille d'interface. |
| Largeur minimale | 4 UG ; en dessous de 8 UG l'affichage se simplifie, en dessous de 15 certains détails disparaissent (`common/images/imageConstants.ts`, `Image.jsx` `small-width`, `minimum-width`). | 4 UG (`elements/image/index.ts:14`). | **Identique** (sans paliers). |
| Hauteur | **Rognée à la grille** : la hauteur tombe sur une UG entière, sauf image transparente ou « proportions complètes » demandées (`ImageRenderer.tsx`, `cropToGrid`). | Proportions exactes (`Image.tsx:31-42`). | **Différent** : les images de Notak ne tombent pas sur la grille. |
| Chargement | Une miniature floue d'abord, puis la taille la plus proche de l'affichage (400, 800, 1600 px, original) ; roue de 150 px pendant l'envoi ; icône d'image cassée en cas d'erreur (`common/images/imageConstants.ts:32-60`, `ImageRenderer.tsx`, `Image.scss`). | L'adresse du fichier entier ; un pavé gris aux bonnes proportions en attendant ; « Image introuvable » si absent (`Image.tsx:7-46`). Les images n'apparaissent qu'**une fois toutes enregistrées** (`recepteur.ts:39-63`). | **Différent** : pas de variantes, rien à l'écran pendant l'envoi. |
| Transparence | Le serveur dit si l'image a un canal alpha ; une image transparente n'a ni fond, ni ombre, ni rognage ; on peut lui donner un fond (`Image.jsx`, outils `SHOW_BACKGROUND`, `IMAGE_BACKGROUND`). | Devinée au type : PNG, GIF, SVG sans ombre (`geometrie.ts:32-33`). | **Différent** : un PNG opaque (capture d'écran) perd son ombre. |
| Légende | Texte riche, dans un bandeau sous l'image, **partie de la carte** ; barre de légende (gras, italique, barré, souligné, lien, centrer) ; outil « légende » pour la montrer ou la cacher (`Image.jsx`, `toolbarToolConfig.ts` `TEXT_EDITING_CAPTION`). Taper une touche sur une image choisie commence la légende (`Image.jsx`, focus + `handleKey`). | Texte brut gris 11 px **sous** l'image, hors carte ; Entrée valide ; outil « Légende » (`Image.tsx:48-107`, `image.css:26-31`). | **Différent** : légende pauvre, pas de saisie directe. |
| Double-clic | Ouvre l'image en grand (visionneuse, diaporama du tableau) (`ImageRenderer.tsx`, `ImageRendererUtils.ts`). | Édite la légende (`elements/image/index.ts:12`). | **Différent**, important : le réflexe « voir en grand » n'existe pas. |
| Proportions au redimensionnement | Gardées, sauf avec Cmd (spec §11). | Largeur seule, la hauteur suit. | **Identique** (Cmd absent). |
| Autres outils | Couleur (barre), recadrer / pivoter / détourer, dessiner dessus, remplacer en déposant une autre image dessus (`client/element/image/index.js`, `ImageReplacementOverlay.jsx`, `ImageDrawing.jsx`). | — | **Absent** (renvoyé à plus tard par la spec). |

---

## 6. La liste de tâches

| Comportement | Milanote | Notak | Écart |
|---|---|---|---|
| Marges | Haut et bas 19 px, gauche 24, droite 24 (`client/element/taskList/editor/TaskListEditor.scss`). | Celles de la carte : 20 px partout (`toile.css:41`). | **Identique** à 1 px près. |
| Case | Carrée, 16 px ; cocher dessine la coche en 100 ms et remplit la case 50 ms après (`client/components/Checkbox.scss`). | Ronde, 16 px dans une zone de clic de 24 px, remplie d'accent, coche blanche, 150 ms (`taches.css:42-79`). | **Différent** de forme (→ Notak possible). |
| Tâche faite | Texte grisé (couleur « faite »), pas barré, transition 150 ms (`TaskListEditor.scss`). | Texte gris, 150 ms (`taches.css:37`). | **Identique**. |
| Cocher hors édition | Possible d'un clic tant qu'on a le droit d'écrire. | Possible (`Taches.tsx:29-74`) ; Maj+clic coche aussi les sous-tâches. | **Identique** (Maj+clic en plus). |
| Titre | Facultatif, en tête du même document, 15 à 16 px gras (`TaskListEditor.scss` `h2[data-type=task-list-title]`). Retour arrière dans la première tâche vide (s'il y en a d'autres) la change en titre ; `[] ` en tête du titre le change en tâche (`common/tiptap/extensions/taskList/taskListItemKeyboardHandlers.ts:379`, `taskListTitleInputRules.ts`). | Champ simple de 16 px gras, hors du document ; s'ajoute par l'outil « Titre » ; Entrée passe aux tâches ; retour arrière dans le titre vide le retire (`Taches.tsx:124-150`, `178-186`). | **Différent** : pas de passage tâche ↔ titre au clavier. |
| Entrée | Coupe la tâche ; au tout début d'une tâche non vide, crée une tâche vide **au-dessus** ; une sous-tâche vide en fin de liste remonte d'un niveau ; la tâche neuve ne reprend ni échéance ni personnes (`TaskListItem.tsx:345-355`, `taskListItemKeyboardHandlers.ts:100-160`). | Coupe la tâche (Tiptap) ; sur une tâche vide du premier niveau, ne fait rien (`elements/taches/extensions.ts:137-141`). | **Différent** (léger). |
| Tab, Maj+Tab | Descendre, remonter ; le focus ne quitte jamais la liste (`TaskListItem.tsx:375-386`). | Idem, avec 6 niveaux au plus (`extensions.ts:120-135`, `liste.ts:9`). | **Identique**. |
| Retour arrière | Annule d'abord un raccourci Markdown qu'on vient de taper ; fusionne avec la tâche d'avant ; supprime une tâche vide ; **liste vide → à la corbeille** (`TaskListItem.tsx:325-335`, `TaskListEditor.tsx` `onEmptyBackspace`). | Fusionne avec la tâche d'avant (sous-tâches comprises) (`extensions.ts:87-117`). Une liste vidée reste. | **Différent** : la liste vide ne part pas au retour arrière. |
| Cmd ou Alt + retour arrière / Suppr | Réduit une tâche vide. | Comportement de Tiptap. | **Absent** (mineur). |
| Survol d'une tâche | Une poignée pour la faire glisser (même vers une autre liste ou la toile) et un bouton de suppression, à droite, au survol seulement (`TaskListEditor.scss` `.task-item-end-actions`, `TaskListDragHandle.scss`, `common/tiptap/extensions/taskList/taskListItemDragSourcePlugin.ts`). | Rien. | **Absent**. |
| Coller | Des lignes et des puces collées deviennent des tâches, imbrication gardée (`taskListItemPastedLinesPlugin.ts`). | Comportement de Tiptap. | **Absent**. |
| Indication de liste vide | Indication grise dans la première tâche vide (`TaskListEditor.scss` `.is-empty::before`). | Aucune. | **Absent**. |
| Outils | Couleur, étiquette, réaction, commentaire, titre, échéance, personne (`client/element/taskList/index.js`). | Compteur faites/total, Titre, « Effacer les faites » dès 2 tâches faites (`Taches.tsx:158-208`). | **Différent** : couleur absente ; compteur et effacement en plus (→ Notak). |

---

## 7. La ligne

| Comportement | Milanote | Notak | Écart |
|---|---|---|---|
| Création par l'outil | Une ligne libre de 17 × 17 UG, rien au départ, flèche à l'arrivée (`common/lines/lineConstants.ts`, `common/lines/index.js:28-29`). | Idem, du bas-gauche au haut-droit, choisie aussitôt (`elements/ligne/creation.ts`, `index.tsx:21-28`). | **Identique**. |
| Cmd+K | Relie les éléments choisis, **sans pointe** (`…/connectTool/connectionActions.js:196-197`). | Idem, sans doublon (`elements/ligne/raccourci.ts`). | **Identique**. |
| Zone de clic | Trait invisible de 20 px de large (`client/element/line/lineUiConstants.js`, `Line.scss`). | Un tracé de clic transparent de 20 px (`Ligne.tsx:265`, `elements/ligne/ligne.css:20-23`). | **Identique**. |
| Ancrage | Lâchée sur un élément, une extrémité se fixe **soit au centre** (la ligne vise le centre et s'arrête au bord, à 1 px), **soit au point exact où on l'a lâchée** (en UG, en pourcentage sur une image) ; des repères ronds montrent les points d'accroche ; la courbe est recoupée pour ne pas changer de forme (`elementLineEdgeDropTarget.jsx:63-150`, `lineUtil.js:100-140`, `LineEdgeSnapPointGuide.jsx`). | Au centre seulement ; la ligne s'arrête au bord (`Ligne.tsx:116-121`, `coeur/lignes.ts:133`). | **Absent** : le point d'accroche fixe. |
| Poignées | Rondes, avec un anneau qui apparaît en 100 ms après 200 ms de survol ; plein quand l'extrémité est accrochée (`EdgeDragHandle.scss`, `DragHandle.scss`) ; taille constante quel que soit le zoom. | Carrés de 10 px aux bouts, rond de 5 px au point de contrôle (`Ligne.tsx:298-330`). | **Différent** (visuel). |
| Angle | Maj pendant le glisser d'une extrémité : aimant à 45° (horizontal, vertical, diagonales) (`utils/lineSnapAngleUtil.js`). | Rien. | **Absent**. |
| Courbe | Point de contrôle ; à moins de **20 px** du milieu, le trait redevient droit (`utils/lineControlPointUtil.js:13-14`). | À moins de **2 UG** (20 px à l'échelle 1) ; double-clic sur le point le redresse (`coeur/lignes.ts:14`, `Ligne.tsx:240-244`). | **Identique** (le double-clic en plus). |
| Longueur minimale | Selon les pointes : 1,5 UG avec deux flèches, 1 UG avec une, sinon 1 px (`utils/lineUtil.js:81-90`) ; la spec dit 4 UG (`MIN_LINE_LENGTH`). | Aucune. | **Absent**. |
| Pointes, trait, épaisseur | Flèche, rond, rien ; plein, tirets, points ; 1, 2, 4 (`common/lines/lineConstants.ts`). | Idem (`coeur/tableau.ts` `Ligne`, `Outils.tsx`). L'outil de pointe bascule flèche ↔ rien ; **le rond ne se choisit pas** (`Outils.tsx:42-47`). | **Différent** (léger) : rond inaccessible. |
| Libellé | Au point de contrôle, texte brut, s'affiche s'il est activé et non vide (`label/LineLabel.jsx`). | Au point de contrôle, 400 caractères, pastille de la couleur de la ligne ; Entrée, Échap, clic ailleurs valident (`Ligne.tsx:266-297`, `336-381`). | **Identique**. |
| Couleur | Palette des lignes, gris par défaut. | Gris foncé par défaut + 11 teintes (`Outils.tsx:62-70`). | **Identique**. |
| Suppression d'un élément accroché | Non vérifié dans le code lu. | Les lignes accrochées partent avec lui (`coeur/lignes.ts:212-217`). | À vérifier dans Milanote. |

---

## 8. Les écarts, classés par importance pour quelqu'un qui s'en sert

**Ce qui se sent dès la première minute**

1. **Clic sur une note déjà choisie : n'entre pas en édition**, et le double-clic met le curseur en fin de texte au lieu du point cliqué (`Toile.tsx:465`, `Note.tsx:42`). Même chose pour les titres de colonne et de tableau.
2. **Double-clic sur une image : ne l'ouvre pas en grand**, il édite la légende (`elements/image/index.ts:12`).
3. **Le texte n'est enregistré qu'à la sortie de l'édition** (`Toile.tsx:210-218`) : à plusieurs, les autres ne voient rien pendant qu'on écrit ; un onglet fermé en pleine frappe perd le texte. Milanote enregistre toutes les 5 s ou 80 frappes, 5 fois plus vite à plusieurs.
4. **`*mot*` donne de l'italique** au lieu du gras ; `~mot~` ne barre pas ; `[texte](adresse)` ne fait pas de lien (`elements/note/extensions.ts:43`).
5. **Cmd+Entrée dans une note rangée en colonne** pose la note neuve sur la toile, à une position sans rapport (`Note.tsx:60-73`). C'est un défaut.
6. **Pas de conversion de la note** : une adresse seule ne devient pas un lien, `[] ` ne devient pas une liste de tâches. La spec §3 la promet pourtant.
7. **Le lien n'a ni titre modifiable ni légende** ; son aperçu est rogné en 16:9 ; une adresse d'image reste un lien.
8. **Pas d'indication dans une note ou une liste vide** : une note transparente vide devient invisible.

**Ce qui manque à l'usage courant**

9. **Hauteur bornée** des notes et des liens (avec le voile qui cache la suite) absente.
10. **Barre de couleur** et couleur libre absentes ; **couleur du tableau imbriqué non modifiable**, pas d'icône ni d'image pour lui.
11. **Ancrage à un point précis** d'un élément absent pour les lignes, ainsi que **Maj pour l'angle à 45°** et l'**outil de ligne rapide** au coin de l'élément.
12. **Tâches** : ni poignée ni bouton de suppression au survol, pas de collage de lignes en tâches, liste vide non supprimée au retour arrière, pas de passage tâche ↔ titre au clavier.
13. **Image** : rien à l'écran pendant l'envoi, pas de miniature floue ni de tailles adaptées, la transparence devinée au type de fichier (un PNG opaque perd son ombre), hauteur non calée sur la grille, légende en texte brut hors de la carte.
14. **Mise en forme** : petit texte, encadré, séparateur, retraits, menu d'insertion manquent, ainsi que plusieurs raccourcis (Cmd+Maj+9, Cmd+., Cmd+Maj+B, Cmd+J).
15. **Colonne repliée** : elle refuse les dépôts, alors que Milanote les accepte.

**Ce qui se voit sans gêner**

16. Colonne : minimum de largeur 17 au lieu de 34, titre à gauche en 14 px au lieu de centré en 17 à 18 px, compteur réduit à un nombre, coins arrondis de 10 px, pas de hauteur minimale.
17. Tableau imbriqué : compteur « N éléments » au lieu de la composition par type, même disposition dans une colonne qu'en toile, pas de bulle « double-cliquez pour ouvrir ».
18. Cadre : ombre plus forte, coins de 2 px, l'ombre reste à la sélection, aucun signe de l'édition, poignée visible seulement à la sélection.
19. Note : 80 px de hauteur minimale au lieu de 58, marges de 20 px partout au lieu de 24 / 24 / 20 / 14, titres en 22 et 18 px au lieu de 20 et 15 à 16 px.
20. Ligne : poignées carrées, la pointe ronde ne se choisit pas, pas de longueur minimale.
21. Tâches : case ronde au lieu de carrée (choix possible pour Notak, à écrire dans la spec).

**Où Notak fait déjà plus** (à garder) : Maj+clic coche une tâche et ses sous-tâches ; « Effacer les faites » ; double-clic sur le point de contrôle pour redresser une ligne ; Cmd+Entrée ouvre un tableau imbriqué ; un lien vide est supprimé à la sortie.
