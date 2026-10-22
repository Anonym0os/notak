# Écarts Milanote / Notak : la toile et les gestes sur les éléments existants

Lecture seule des deux dépôts, 23/10/2026. Chemins Milanote relatifs à `milanote-src/milanote/src/client/`.
Chemins Notak relatifs à `~/Documents/CODE/notak/packages/tableau/src/`. Les comportements de Milanote sont
décrits avec nos mots, sans code ni texte d'interface recopié.

Légende : **=** identique · **≠** différent · **∅** absent de Notak.

---

## 1. Zoom

| Comportement | Milanote (fichier) | Notak (fichier:ligne) | Écart |
|---|---|---|---|
| Bornes | 300 % en haut. En bas : l'échelle où le contenu, agrandi de 20 % **de sa propre taille** de chaque côté (facteur 1,4), tient dans la vue, plafonnée à 40 %, sans plancher (0). Le rectangle de contenu reçoit en plus une marge égale à son décalage haut-gauche (300 px au plus) et n'est jamais plus petit que la vue (`zoom/zoomConstants.js`, `zoom/zoomScaleUtils.ts`). | 300 %, plafond bas 40 % ; la marge est 20 % **de la vue** (part utile 0,6) (`coeur/camera.ts:9-13`, `:72-80`). | ≠ : à contenu égal, le zoom arrière de Notak descend plus bas (0,6 × vue/contenu contre 0,71 chez Milanote), et sans la marge haut-gauche ni le plancher « au moins la vue ». |
| Molette + Cmd | Facteur **linéaire** 1 − Δy × 0,0025 par événement (`zoomScaleUtils.ts`). | Facteur exponentiel e^(−Δy × 0,0025) (`Toile.tsx:302`). | ≈ : même pente aux petits pas ; Notak diverge sur les gros crans de molette. |
| Pincement du trackpad | Δy multiplié par 3, mais **seulement** sur Mac de bureau quand Ctrl est vrai sans Cmd (`zoom/wheelZoomInteractionUtils.ts`). | Tout Ctrl+molette est traité comme un pincement : × 3 (0,0075) (`Toile.tsx:302`). | ≠ : sous Windows, Ctrl+molette d'une souris zoome 3 fois plus vite que chez Milanote. |
| Lissage du rendu | L'échelle visée est rejointe par interpolation, 25 % de l'écart par image ; à moins de 0,2 % on se pose sur la cible. Les crans successifs s'accumulent sur la cible, pas sur l'échelle affichée (`zoom/ZoomCanvas.jsx`, `animateScale`). | Application immédiate à chaque événement (`Toile.tsx:303-304`). | ∅ : pas de rattrapage en douceur, alors que la SPEC § 10 le demande. Zoom plus saccadé à la molette d'une souris. |
| Arrêt à 100 % | Une « opération manuelle » commence sur un événement qui n'est pas de l'inertie (détecteur d'inertie sur les 6 derniers événements, `zoom/inertiaScrollDetector.ts`). Partant de ≥ 1 on va jusqu'à 3, partant de ≤ 1 jusqu'au minimum ; l'inertie ne franchit jamais 100 %. Pendant un pincement en cours, 100 % est un butoir dur (`zoomScaleUtils.ts`, `apply100PercentStop`). | Le côté est fixé au premier pas d'un geste ; le geste finit après **250 ms** sans événement (`coeur/camera.ts:17`, `:86-100`). | ≠ (même intention) : Notak découpe au temps, Milanote à l'inertie. Une inertie longue de trackpad (> 250 ms sans trou) reste dans le geste chez Notak : bon ; une reprise rapide après pause courte (< 250 ms) ne peut pas franchir 100 % chez Notak alors qu'elle le peut chez Milanote. |
| Zoom accidentel | Si, partant de 100 %, le cumul des Δy d'un geste reste sous 50, l'échelle revient à 100 % 100 ms après le dernier événement (`ZoomCanvas.jsx`, `correctAccidentalZoom`). | — | ∅ : un effleurement Ctrl/Cmd laisse Notak à 98 % ou 103 %. |
| Inertie croisée défilement / zoom | Une traîne d'inertie de défilement n'est jamais lue comme un zoom (et l'inverse) ; le mode se remet à zéro 150 ms après le dernier événement (`wheelZoomInteractionUtils.ts`). | — (`Toile.tsx:295-307`) | ∅ : lâcher Cmd pendant l'inertie d'un défilement fait zoomer, ou l'inverse. |
| Point fixe | Au-dessus de 100 % : le curseur. En zoom arrière sous 100 % : un point calculé pour que le **document** finisse centré dans la vue au minimum. En zoom avant sous 100 % : le point mémorisé, borné pour qu'aucun vide hors document ne reste visible en revenant à 100 % ; on reprend le curseur s'il a bougé de plus de ~32 px ou si le défilement a bougé de plus de ~14 px (`zoom/zoomPointModeUtils.ts`, `zoom/zoomTransformationPointUtils.ts`). | Au-dessus de 100 % le curseur, sinon le centre de la vue (`coeur/camera.ts:106`). | ≠ : Notak ne recentre pas le contenu en dézoomant et peut revenir à 100 % sur du vide. |
| Crans clavier et boutons | Courbe « focale » à 4 crans de chaque côté de 100 %. Au-dessus : 120, 150, 200, 300 %. Au-dessous, avec un minimum m : f = 4m/(1−m), cran i = f/(f+i) ; pour m = 40 % : 73, 57, 47, 40 % (`zoom/utils/zoomFocalLengthStepUtils.ts`, `zoomStepUtils.ts`). Le passage est lissé comme la molette. | Au-dessus : 120, 150, 200, 300 % (`camera.ts:15`). Au-dessous : m^(k/4) ; pour m = 40 % : 80, 63, 50, 40 % (`camera.ts:108-117`). Saut immédiat, centré sur la vue (`Toile.tsx:346-349`). | ≠ : crans du bas différents (80/63/50 contre 73/57/47), et pas d'animation. |
| Ajuster (Z) | Échelle = vue/contenu. Si le contenu tient (> 1) : au plus 130 %, **sans marge**. Sinon : même règle de marge que le minimum (facteur 1,4), au plus 80 %. Animation 600 ms, courbe de Bézier (0,645 ; 0,045 ; 0,355 ; 1). Bascule vers 100 % si l'on est à moins de 1 % (ou 10 % de l'échelle visée) de l'ajusté, **ou** si l'on est déjà plus près de 100 % que l'ajusté du même côté. Refusé sur un tableau vide et pendant un zoom (`zoom/utils/zoomToFitUtils.ts`, `zoom/ZoomToFitHandler.tsx`). | 130 % / 80 % au plus, mais marge fixe de **80 px** de chaque côté dans les deux cas ; 600 ms, même courbe ; retour à 100 % seulement à moins de 1 % de l'ajusté, centré sur le centre courant (`camera.ts:19-23`, `:120-134`, `:137-156` ; `Toile.tsx:340-344`). | ≠ : marges différentes ; la seconde règle de retour à 100 % manque (à 60 % avec un ajusté de 80 %, Z zoome à 80 % chez Notak, revient à 100 % chez Milanote). |
| Affichage de l'échelle | Pastille de zoom et toast (`zoom/toast/ZoomToast.tsx`). | Pourcentage figé en bas à droite (`Toile.tsx:777`). | ≠ (hors champ du geste). |

## 2. Défilement, attraper la toile, taille de la toile

| Comportement | Milanote | Notak | Écart |
|---|---|---|---|
| Modèle | Un vrai document qui défile (débordement natif, barres de défilement visibles sous Windows), avec un zoom par transformation par-dessus (`Canvas.scss`, `CanvasScrollArea.tsx`). | Une caméra infinie, sans barre de défilement (`coeur/camera.ts:25-52`, `toile.css:9-19`). | ≠ structurel. |
| Bornes du défilement | On ne défile pas avant le coin haut-gauche ni au-delà du document (`grabScrollDecorator.jsx` borne à 0 ; taille du document §2 ci-dessous). | Aucune borne : on peut partir à l'infini dans le vide (`camera.ts:49-52`, `Toile.tsx:306`). Seules les positions d'éléments sont bornées à ±15 000 UG (`coeur/tableau.ts:10`, `:201`). | ∅ : on se perd dans Notak. |
| Taille de la toile | Le document s'étend jusqu'au bord bas-droit des éléments plus **50 × 40 UG** (5 × 5 UG si dézoomé ou en iframe, 50 × 50 sur tablette), jamais plus petit que la vue, et ne rétrécit pas tant qu'on est dézoomé. En haut à gauche, l'origine garde **5 UG** de marge : elle recule si un élément passe au-delà, et se resserre si le premier élément s'en éloigne de plus de 10 UG (`utils/canvasSizeUtils.ts`, `size/canvasSizeMiddlewareHandleElementMoveUtils.ts`, `size/canvasSizeMiddlewareConstants.ts`). | — | ∅ (conséquence du modèle caméra). |
| Attraper | Espace maintenue (si le focus est sur la page, hors saisie) ou bouton du milieu ; un calque couvre alors toute la toile, les éléments ne réagissent plus ; défilement à chaque image (`grabScrollDecorator.jsx`, `Canvas.jsx`). | Espace maintenue (toile focalisée) ou bouton du milieu (`Toile.tsx:439-441`, `:452-454`, `:497-502`). | = sur le principe. |
| Espace seule | Appui bref : ouvre l'élément choisi ; maintenue : attrape (`workspace/shortcuts/keyboardShortcuts.js`). | Attrape seulement (`Toile.tsx:439`). | ≠ (l'ouverture relève d'un autre domaine). |

## 3. Grille de points

| Comportement | Milanote | Notak | Écart |
|---|---|---|---|
| Visibilité | Visible seulement à 100 % sans translation de zoom ; cachée sous 100 %, en mode ajusté, pendant un zoom, en présentation. Apparition et disparition en **fondu de 0,6 s** (0,2 s en présentation) (`Canvas.jsx` l. 223-228, `Canvas.scss`). | Visible si l'échelle vaut 1 à 0,001 près et hors animation ; bascule sèche (`Toile.tsx:654-661`). | ≠ : pas de fondu. |
| Motif | Image de points sur une maille de 10 px, décalée de −2 px ; 8 ou 9 px pour les tailles d'interface petite et moyenne ; variantes claire et sombre (`Canvas.scss`, `grid/*.png`). | Dégradé radial, point de ~1 px sur maille de 10 px, suit la caméra (`toile.css:14`, `Toile.tsx:656-660`). | ≈ ; ∅ pour les tailles d'interface 8/9 px. |

## 4. Sélection

| Comportement | Milanote | Notak | Écart |
|---|---|---|---|
| Moment de la sélection | Au **clic** (relâchement), pas à l'appui. Un clic simple sur un élément d'une sélection multiple la réduit à lui seul. Un clic qui suit un redimensionnement est ignoré (`element/ElementContainer.jsx`, `onClick`, `preventClick`). | À l'**appui** ; un appui sur un élément déjà choisi garde tout le groupe, et rien ne le réduit au relâchement (`Toile.tsx:464-467`, `coeur/selection.ts:24-31`). | ≠ : dans Notak, cliquer un élément d'un groupe sans bouger ne l'isole pas. |
| Cmd+clic | Bascule l'élément (`element/selection/selectionUtils.js`, `element/actions/elementSelectionActions.ts`). | Bascule (`selection.ts:26-29`). | = |
| Maj+clic | Plage dans une liste (non triés) ; ailleurs, bascule comme Cmd (`elementSelectionActions.ts`). | Remplace la sélection (`Toile.tsx:465`). | ≠ : Maj+clic ne fait rien d'utile dans Notak. |
| Clic droit sur un élément | Le choisit s'il ne l'est pas (sauf si son parent l'est) (`ElementContainer.jsx`, `onContextMenu`). | Ne touche pas à la sélection (`Toile.tsx:455-457`). | ≠ |
| Clic droit sur le vide | Désélectionne (`selection/selectionMarqueeMouseEventHandlerDecorator.jsx`). | Désélectionne (`Toile.tsx:456`). | = |
| Lasso : départ | Seulement sur le vide ; sans Maj/Cmd, la sélection est vidée à l'appui ; un troisième clic rapide est ignoré (`selectionMarqueeMouseEventHandlerDecorator.jsx`, `selectionMarqueeSelectedElementFinderDecorator.jsx`). | Sur le vide ; vidée sauf Maj/Cmd (`Toile.tsx:478-482`). | = (le triple clic mis à part). |
| Lasso : règle d'intersection | Un élément rectangulaire est pris s'il chevauche le rectangle. Une ligne est prise si le rectangle la contient entièrement, ou si sa **courbe de Bézier** traverse le rectangle (`selectionMarqueeSelectedElementFinderDecorator.jsx`). | Chevauchement de boîtes, bords compris, pour tout, lignes comprises (boîte englobante du tracé) (`coeur/selection.ts:11-18`, `coeur/geometrie.ts:37-38`, `Toile.tsx:507-511`). | ≠ : une ligne courbe est prise dans Notak dès que le lasso touche sa boîte, même loin du trait. |
| Lasso : Maj/Cmd | Inverse par rapport à la sélection d'avant (`…SelectedElementFinderDecorator.jsx`). | Inverse (`selection.ts:14-17`). | = |
| Lasso : retour visuel | Pendant le geste, les éléments touchés reçoivent un **aperçu** de sélection (et ceux qui vont sortir, un aperçu de retrait) ; la sélection n'est posée qu'au relâchement. Le rectangle est borné au bord haut-gauche du document. Calcul une fois par image (`…SelectedElementFinderDecorator.jsx`, `selectionMarqueeUtils.js`). | La vraie sélection change à chaque mouvement (`Toile.tsx:511`). | ≠ : coûteux sur un gros tableau (barres, présence diffusée aux autres à chaque pas : `Toile.tsx:134-136`). |
| Lasso : style | Bord neutre de 1 px, fond translucide (`selection/SelectionMarquee.scss`). | Bord 1 px couleur d'accent, fond accent à 8 % (`toile.css:77-82`). | ≈ |
| Échap | Remonte d'un cran : menu ouvert, filtre, pastille en édition, pastille choisie, étiquette, édition, puis sélection (`workspace/shortcuts/interfaceKeyboardShortcutActions.js`). | Édition, puis sélection (`Toile.tsx:377-383`, `:423-424`). | ≈ (les crans manquants sont d'autres domaines). |
| Cmd+A | Avec une sélection : tous les **frères** de la sélection (par exemple toute la colonne) ; sans : toute la toile ; dans la corbeille, toute la corbeille (`element/selection/selectionActions.js`, `selectAllElements`). | Toujours tous les éléments de premier niveau (`Toile.tsx:406-409`). | ≠ : pas de « tout dans cette colonne ». |
| Élément verrouillé | Ne se choisit pas au clic s'il ne l'est pas déjà, ne se déplace pas, reste sous les autres (`ElementContainer.jsx`, `common/elements/utils/elementSortUtils.js`). | — | ∅ |

## 5. Déplacement

| Comportement | Milanote | Notak | Écart |
|---|---|---|---|
| Moteur | Glisser-déposer natif du navigateur via react-dnd ; seuil de départ = celui du navigateur ; 300 ms d'appui sur écran tactile (sauf une tâche) ; refusé pendant l'édition ou sur un élément verrouillé (`element/dnd/DraggableElement.jsx`). | Événements pointeur capturés ; seuil 3 px écran (`Toile.tsx:51`, `:517-518`). | ≈ |
| Ce qui part | L'élément saisi s'il n'est pas choisi (la sélection est vidée), sinon toute la sélection (`DraggableElement.jsx`, `startDragging`). | Idem ; un élément rangé dont la colonne est aussi choisie la suit (`Toile.tsx:468-477`). | = |
| Rendu pendant le glisser | Un **aperçu** suit le pointeur dans un calque à part ; à l'origine reste une **empreinte** creuse (contenu masqué, fond translucide) (`workspace/dnd/elementDragLayer/*`, `element/card/Card.scss`). | L'élément lui-même bouge, passe au-dessus (z-index 10) ; rien ne reste à l'origine (`Toile.tsx:535-537`, `toile.css:308-310`). | ≠ |
| Fluidité | L'aperçu suit **sans aimantation**, au pixel, avec un léger retard : 60 % de l'écart par image (50 % s'il s'incline), normalisé au temps d'image (`element/dnd/utils/elementDragAnimationUtils.js`). L'aimantation à l'UG n'a lieu qu'au dépôt. | Chaque mouvement est arrondi à l'UG : l'élément avance **par sauts de 10 px** (30 px à 300 %) (`Toile.tsx:536`, `coeur/tableau.ts:204`). | ≠ : sensation la plus visible. |
| Soulèvement (ombre) | L'ombre de repos se fond dans une ombre de glisser : intensité qui monte de 0,05 par image (0,1 au doigt), sans dépasser déplacement/50 px ; au dépôt elle redescend de 0,1 par image (`elementDragAnimationUtils.js`, `utils/createElementDragPreviewShadows.js`, `ElementDragPreviewRotator.scss`). | — (`toile.css:308-310`) | ∅ |
| Inclinaison | Rotation 3D (perspective 2000 px) : autour de X selon −Δy, autour de Y selon Δx, gain maxRot/10, amortie à 20 % par image ; maximum = min(25°, asin(110/plus grande dimension)), soit ~20° pour une carte standard, 0° au-delà de 1 000 px ; jamais pour plusieurs éléments, un tableau, une ligne, une annotation ; désactivable dans les réglages (`workspace/dnd/elementDragLayer/elementDragLayerStateManagerInterpolationUtils.ts`, `elementDragAnimationUtils.js`, `canvas/CanvasElement.scss`). | — | ∅ |
| Animation de dépose | L'élément repart de là où était l'aperçu, rejoint sa place aimantée avec le même lissage, se redresse, et son ombre s'éteint ; l'animation s'arrête quand rotation < 0,5°, décalage < 1 px et ombre < 0,1 (`canvasElementDropAnimationStateManager.jsx`). | Saut direct (`Toile.tsx:587-610`). | ∅ |
| Maj : verrou d'axe | Axe choisi selon le plus grand déplacement, collant : on ne change que si l'autre le dépasse de **50 px** ; jamais dans une liste (`workspace/dnd/elementDragLayer/elementDragLayerStateManagerUtils.ts`). | Collant aussi, mais on change quand l'autre dépasse **le double** du premier (`Toile.tsx:42-48`, `:532-534`). | ≠ (réglage) : Notak bascule plus tard sur les grands déplacements, plus tôt sur les petits. |
| Alt : copie | Glisser avec Alt duplique au lieu de déplacer ; l'original reste visible (`DraggableElement.jsx`, `ElementContainer.jsx`). | — | ∅ |
| Échap pendant le glisser | Annule (glisser natif) : rien ne bouge. | Aucun effet sur le geste ; une annulation du pointeur dépose comme un relâchement (`Toile.tsx:692`). | ∅ |
| Défilement au bord | Pas de code dédié trouvé ; le navigateur fait défiler le conteneur natif près du bord pendant un glisser natif (à vérifier à l'écran). | — | ∅ probable. |
| Molette pendant le glisser | Le zoom annule un redimensionnement en cours (`element/resizing/useResizeHandlePointerHandlers.tsx`). | Possible, le glisser suit la caméra (`Toile.tsx:503`). | ≈ |
| Groupe | Chaque élément garde son décalage par rapport à l'élément saisi (`element/dnd/utils/buildMovedElementOffsetsMap.js`). | Chacun garde son décalage d'origine (`Toile.tsx:535-537`). | = |
| Premier plan au dépôt | Les déposés passent au-dessus de tout, dans l'ordre du glisser (`element/dnd/utils/translateDropResultIntoElementLocation.js`). | Idem (`Toile.tsx:608`, `coeur/tableau.ts:285-291`). | = |
| Flèches | 1 UG, Maj 5 UG, éléments de toile non verrouillés ; si seuls des éléments de liste sont choisis, ils **se réordonnent** dans leur liste (`workspace/shortcuts/elementMoveKeyboardShortcutActions.js`, `element/actions/elementMoveActions.js`). | 1 / 5 UG, éléments libres seulement ; rien dans une colonne (`Toile.tsx:411-421`, `:353-358`). | ≠ : pas de réordonnancement au clavier dans une colonne. |

## 6. Glisser-déposer entre zones

| Comportement | Milanote | Notak | Écart |
|---|---|---|---|
| Sortir d'une colonne | L'élément reste dans sa colonne (empreinte) jusqu'au dépôt ; la colonne ne bouge pas pendant le geste (`DraggableElement.jsx`, `Card.scss`). | L'élément quitte la colonne dès le seuil, à sa position écran, et la colonne se resserre aussitôt (`Toile.tsx:519-529`). | ≠ : les voisins bougent sous le pointeur dans Notak. |
| Place d'insertion dans une colonne | Premier élément dont le centre vertical est sous le pointeur, ignorant les glissés ; positions **figées au début du glisser** (`list/listDropHoverFn.js`, `list/getRangeIndex.ts`). | Même règle, sur les positions vivantes (`coeur/ordre.ts:54-57`, `Toile.tsx:565-572`). | = sur la règle. |
| Indicateur | Trait de 2 px, couleur « dépôt possible », toute la largeur, au milieu de l'interstice ; zone de dépôt de 1,6 rem au pied de la colonne ; **pas d'indicateur** si le dépôt ne changerait rien (même place ou place suivante) (`list/ListDropPreview.scss`, `element/column/ColumnBottomDropArea.scss`, `listDropHoverFn.js`). | Trait de 2 px couleur d'accent, retrait de 8 px écran de chaque côté, 4 px au-dessus du suivant ou sous le dernier, au milieu de la zone vide d'une colonne vide ; **toujours affiché** (`Toile.tsx:572-580`, `toile.css:313-319`). | ≠ : Notak montre un trait même pour un dépôt sans effet. |
| Règle d'acceptation | Une colonne refuse **tout** le dépôt si un seul élément glissé est une colonne ; elle refuse si aucun ne peut y entrer (`element/column/Column.jsx`). | Accepte la partie admissible, le reste se pose sur la toile (`Toile.tsx:563`, `elements/colonne/regles.ts:5-6`). | ≠ |
| Déposer sur un tableau imbriqué | Les éléments entrent dans le tableau (hors lignes et annotations ; un tableau ne peut entrer en lui-même) (`element/board/BoardDropTarget.tsx`). | — (seuls les conteneurs à `accepte`, c'est-à-dire la colonne) | ∅ |
| Entrer dans un tableau au survol | Survol d'une icône de tableau ou d'un segment du fil d'Ariane : **700 ms**, puis 300 ms de signal visuel, puis navigation (1 s en tout) ; dans un glisser déjà passé par une navigation, 400 + 300 ms (`element/dnd/dragHoverDelayedInteractionDecorator.jsx`, `element/dnd/navigateOnHoverDecorator.js`). | — | ∅ (la SPEC § 12 dit « 700 ms », c'est 1 000 ms au premier survol). |
| Déposer sur le fil d'Ariane | Déplace vers ce tableau (`workspace/breadcrumbs/Components/Breadcrumb.jsx`). | — (`EspaceNotak.tsx`) | ∅ |
| Déposer sur la corbeille | La corbeille de la barre accepte les dépôts (`workspace/toolbar/trash/*`). | Pas de corbeille ; suppression définitive annulable (`Toile.tsx:431-438`). | ∅ |
| Non triés | Zone de liste latérale, dépôt et lasso propres (`list/*`, inbox). | — | ∅ |

## 7. Redimensionnement

| Comportement | Milanote | Notak | Écart |
|---|---|---|---|
| Poignée | Coin bas-droit, zone de saisie élargie de 10 px, **taille constante à l'écran** quel que soit le zoom ; apparaît au survol **ou** à la sélection, en fondu de 0,1 s ; cachée pendant un lasso (`element/resizing/ElementResizeHandle.tsx`, `ElementResizeHandle.scss`). | Carré de 10 px, seulement si un seul élément libre est choisi hors édition ; grossit et rétrécit avec le zoom ; pas au survol (`Cadre.tsx:52`, `Toile.tsx:676`, `toile.css:189-200`). | ≠ : à 40 % la poignée de Notak fait 4 px. |
| Ce qui change | Mise à l'échelle depuis le coin haut-gauche, largeur et hauteur ; position arrondie à l'UG à la fin (`useResizeHandlePointerHandlers.tsx`, `useElementResizeHandlers.ts`). | Largeur seule, arrondie à l'UG à chaque mouvement (`Toile.tsx:513-516`, `coeur/largeur.ts:9-13`). | ≠ (la hauteur des images, croquis, tables relève de leurs types). |
| Aimantation | À la largeur par défaut si l'écart est < 2 UG ; jamais en redimensionnement de groupe (`element/resizing/resizeUtils.ts`). | À 34 UG si l'écart est < 2 UG (`largeur.ts:3-12`). | = pour un élément seul. |
| Proportions | Médias verrouillés par défaut ; Cmd maintenue pendant le geste libère les proportions ; un groupe garde les proportions de chaque élément (`resizeUtils.ts`, `useResizeHandlePointerHandlers.tsx`). | — dans le cadre commun (`Toile.tsx:513-516`). | ∅ au niveau de la toile. |
| Groupe | Tirer la poignée d'un élément d'une sélection met **tout le groupe** à l'échelle ; au relâchement, les éléments se posent l'un après l'autre de haut-gauche à bas-droite, 500 ms en tout, au plus 50 ms d'écart, sans cascade au-delà de 50 éléments (`resizeUtils.ts`, `useGroupResizeBehaviour.ts`). | — | ∅ |
| Minimum | Par type, en largeur et en hauteur (`useElementResizeHandlers.ts`). | Par type, défaut 17 UG (`largeur.ts:2`, `Toile.tsx:462`). | ≈ |
| Double-clic sur la poignée | Si l'élément est à la largeur par défaut, il prend sa largeur naturelle (média) ; sinon il revient à la largeur par défaut (`element/resizing/elementDoubleClickResizeDecorator.tsx`). | Idem (`largeur.ts:19-22`, `Toile.tsx:621-627`). | = |
| Garde-fous | Un zoom qui commence annule le redimensionnement et rend les mesures d'avant ; le clic qui suit le relâchement est avalé (`useResizeHandlePointerHandlers.tsx`). | — | ∅ (mineur). |
| Colonne | La poignée d'un élément rangé dans une colonne redimensionne en hauteur (curseur vertical) (`ElementResizeHandle.scss`). | Pas de poignée sur un élément rangé (`Cadre.tsx:78-96`). | ∅ |

## 8. Empilement, chevauchements, collisions

| Comportement | Milanote | Notak | Écart |
|---|---|---|---|
| Ordre d'empilement | Par score ; à score égal, date de modification (à plus de 2 ms), puis ordre, puis position ; les verrouillés toujours dessous (`common/elements/utils/elementSortUtils.js`). | Ordre du tableau d'éléments (`Toile.tsx:675`, `:706-718`). | ≠ (simplifié). |
| Premier plan / arrière-plan | Menu contextuel et Cmd+Maj+↑ / ↓ : la sélection passe au-dessus du plus haut, ou sous le plus bas, des autres (`workspace/contextMenu/useElementContextMenuActions.ts`, `keyboardShortcuts.js`). | Seulement implicite après un glisser (`Toile.tsx:608`). | ∅ |
| Chevauchements | Libres (`canvasElementSorter`). | Libres. | = |
| Collisions | Quand un élément change de hauteur dans certains cas (colonne qui reçoit ou perd un élément, tâche ajoutée par Entrée, carte créée par Cmd+Entrée), les voisins du dessous sont **poussés** (ou remontés si la hauteur baisse) : écart d'origine gardé s'il fait au plus 3 UG, sinon ramené à 2 UG ; 4 px comptés pour l'ombre ; au plus 15 poussées en cascade, une passe par seconde ; coupé les 5 s après le chargement et au-delà de 150 éléments (`components/collision/*`). | — | ∅ : une colonne qui s'allonge recouvre ce qui est dessous. |

## 9. Curseurs

| Contexte | Milanote | Notak | Écart |
|---|---|---|---|
| Espace maintenue | Main ouverte, main fermée en attrapant, sur un calque qui couvre les éléments (`Canvas.scss`, `.element-grab-blocker`). | Main ouverte, main fermée pendant l'appui (`toile.css:22-28`). | = |
| Bouton du milieu | Main fermée pendant le geste (`grabScrollDecorator.jsx`). | Inchangé. | ∅ (mineur). |
| Modèle de tableau | Interdit (`not-allowed`) tant que le modèle n'est pas adopté (`Canvas.scss`). | — | ∅ (hors champ). |
| Poignée | Diagonale ; verticale dans une colonne (`ElementResizeHandle.scss`). | Diagonale (`toile.css:199`). | ≈ |
| Édition | Texte. | Texte (`toile.css:52-55`). | = |
| Glisser | Celui du glisser natif (copie avec Alt selon le système). | Défaut. | ≈ |

---

## Écarts classés par importance pour un utilisateur

1. **Le glisser saute de grille en grille** au lieu de suivre le pointeur au pixel, sans soulèvement, sans inclinaison, sans dépose animée (`Toile.tsx:535-537`). C'est la signature de Milanote, la plus visible.
2. **Toile sans bornes** : défilement et zoom arrière peuvent emmener dans le vide sans fin, rien ne recentre le contenu en dézoomant, et le retour à 100 % peut tomber sur du vide (`camera.ts:49-52`, `:106`).
3. **Pas de dépôt sur un tableau imbriqué, sur le fil d'Ariane ni à la corbeille, et pas d'entrée au survol** (1 s, puis 700 ms en chaîne). On ne range rien d'un tableau à l'autre par le geste.
4. **Sortir d'une colonne la resserre immédiatement** : les voisins bougent sous le pointeur pendant le geste (`Toile.tsx:519-529`). Chez Milanote, une empreinte reste jusqu'au dépôt.
5. **Pas de collisions** : une colonne ou une carte qui grandit recouvre ce qu'il y a dessous.
6. **Zoom molette sans lissage**, sans correction du zoom accidentel, sans filtre d'inertie entre défilement et zoom ; Ctrl+molette 3 fois trop vif sous Windows.
7. **Clic dans une sélection multiple** : il ne la réduit pas à l'élément cliqué. Maj+clic remplace au lieu d'ajouter, et le clic droit ne choisit pas l'élément.
8. **Pas de premier plan ni d'arrière-plan** (Cmd+Maj+↑/↓) ; un élément ne remonte qu'après avoir été glissé.
9. **Alt+glisser ne duplique pas, et Échap n'annule pas un glisser.**
10. **Redimensionnement** : pas de groupe, pas de proportions verrouillées pour les médias avec Cmd pour libérer, une poignée qui rapetisse avec le zoom et n'apparaît pas au survol.
11. **Lasso** : la sélection change en direct (coût et diffusion à chaque pas), et une ligne courbe est prise par sa boîte plutôt que par son trait.
12. **Flèches et Cmd+A dans une colonne** : pas de réordonnancement au clavier, pas de « tout sélectionner dans cette colonne ».
13. **Indicateur d'insertion** affiché même quand le dépôt ne changerait rien ; une colonne accepte une partie d'un groupe qui contient une colonne, alors que Milanote refuse le tout.
14. **Réglages de zoom** : crans du bas (80/63/50 % contre 73/57/47 %), marge du minimum (part de la vue contre part du contenu), marges d'Ajuster (80 px contre 0 ou 20 % du contenu), règle de retour à 100 % incomplète.
15. **Détails** : la grille apparaît sans fondu de 0,6 s ; le verrou d'axe de Maj bascule au double plutôt qu'à 50 px ; pas de main fermée au bouton du milieu ; pas de tailles d'interface 8/9 px.
