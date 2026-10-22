# Écarts Milanote / Notak : l'habillage autour de la toile

Lecture seule des deux dépôts, le 23/10/2026. Milanote est décrit dans mes mots, d'après son code reconstruit
(chemins relatifs à `milanote-src/milanote/src/`). Notak est cité en `fichier:ligne`, relatif à
`~/Documents/CODE/notak/`. « UG » : unité de grille (8, 9 ou 10 px chez Milanote selon la largeur d'écran,
`client/utils/grid/gridConstants.ts`).

Verdicts : **identique**, **différent** (comment), **absent**.

---

## 1. La barre d'outils contextuelle (barre de sélection)

### 1.1 Où elle vit, comment elle apparaît

- **Milanote** : il n'y a pas de barre flottante au-dessus de la sélection. C'est la **barre verticale de gauche**
  qui change de contenu. Elle empile des « listes d'outils » : création (par défaut), puis sélection, puis édition,
  puis édition d'une plage de texte, puis étiquette choisie (`client/workspace/toolbar/toolbarTypes.ts`, énumération
  des types de barre). Le passage d'une liste à l'autre est un **glissement horizontal à ressort** (raideur 300,
  amortissement 30, précision 0,1). Un bouton « fermer » apparaît quand on quitte la barre de création, une fois
  la transition faite à **70 %** (`client/workspace/toolbar/hooks/useToolbarTransitionManager.ts`). Si une liste
  est vide pour le type choisi, la barre retombe sur la liste de rang inférieur
  (`client/workspace/toolbar/utils/toolbarAvailableToolsUtils.ts`).
- **Notak** : une barre **flottante**, centrée au-dessus du cadre englobant de la sélection, **52 px** plus haut,
  jamais à moins de 8 px du bord haut (`packages/tableau/src/Toile.tsx:82`, `:768-774`). Elle disparaît pendant
  un geste (glisser, lasso, redimension) et pendant l'édition (`Toile.tsx:666-669`). Aucune animation d'entrée
  ni de sortie (`packages/tableau/src/toile.css:157-169`). En lecture seule, pas de barre.
- **Écart : différent.** Modèle d'interface opposé : Milanote remplace la barre de gauche, Notak pose un ruban
  au-dessus des éléments. Notak n'a pas de niveau « édition » dans cette barre (la note a sa propre barre de
  texte, `elements/note/Barre.tsx`), ni de bouton de retour, ni de transition.

### 1.2 Quels outils, selon le type

- **Milanote** (déclaration par type, `client/element/<type>/index.js`) :
  - note : couleur, étiquettes, réaction, commentaire, puis l'arrangement (aligner, répartir, relier), puis « … » ;
  - tableau : couleur, icône, renommer, arrangement, « … » ;
  - colonne : couleur, renommer, arrangement, « … » ;
  - image : couleur, étiquettes, réaction, commentaire, transparent, modifier le dessin, arrangement, éditer,
    fond, légende, « … » ;
  - lien : couleur, étiquettes, réaction, commentaire, média, affichage de l'aperçu, renommer, légende,
    arrangement, « … » ;
  - ligne : couleur, pointe de départ, pointe d'arrivée, libellé, pointillé, épaisseur, aligner, répartir, « … » ;
  - liste de tâches : couleur, et pour une tâche seule : étiquettes, réaction, commentaire, puis titre, échéance,
    assignation, arrangement, « … ».
- **Notak** : chaque type présent fournit son bloc, puis les outils communs (`Barres.tsx:31-58`).
  - note : Couleur (palette + Aucune + Transparent) (`elements/note/Outils.tsx:7-41`) ;
  - tableau : Renommer, une carte seule (`elements/tableau/Outils.tsx:5-12`) ;
  - colonne : Couleur (`elements/colonne/Colonne.tsx:92-`) ;
  - image : Ajouter une légende, une image seule (`elements/image/Image.tsx:94-`) ;
  - lien : Ouvrir dans un nouvel onglet, Copier l'adresse (`elements/lien/Outils.tsx:4-`) ;
  - ligne : pointes de départ et d'arrivée, trait, épaisseur, couleur, libellé (`elements/ligne/Outils.tsx:15-`) ;
  - tâches : bascule du titre (`elements/taches/Taches.tsx:158-`) ;
  - communs : Aligner, Répartir (`elements/arrangement/Outil.tsx:37-85`), Colonne (`elements/colonne/OutilGrouper.tsx:7-26`).
- **Écart : différent, en partie absent.** Manquent côté Notak : étiquettes, réaction, commentaire, icône de
  tableau, renommer une colonne depuis la barre, outils d'image (éditer, fond, transparent), média et aperçu du
  lien, échéance et assignation, **le bouton « … »** qui ouvre le menu de l'élément, et **Relier** dans la barre
  (seul le raccourci Cmd+K existe). En plus côté Notak : « Copier l'adresse », « Ouvrir dans un nouvel onglet »
  du lien, et « Colonne » (Milanote le met dans le menu contextuel, pas dans la barre).

### 1.3 Sélection de plusieurs types

- **Milanote** : la barre montre l'**intersection** des outils de tous les types choisis ; dès deux éléments, seuls
  les outils marqués « multi » restent (couleur, étiquettes, réaction, légende, alignement…, pas commentaire,
  icône ni renommer) ; chaque outil a sa condition (aligner dès 2 éléments **tous sur la toile**, répartir dès 3,
  relier dès 2) ; puis les droits d'écriture filtrent (`toolbarAvailableToolsUtils.ts`,
  `config/toolDefinitions/toolbarSelectedToolConfig.ts`).
- **Notak** : l'**union** : un bloc par type présent, côte à côte (`Barres.tsx:40-46`). Aligner dès 2 et répartir
  dès 3 éléments libres (`elements/arrangement/disposables.ts:7-15`), Colonne dès 2.
- **Écart : différent.** Une note et une ligne choisies ensemble : Milanote ne garde que la couleur et
  l'arrangement communs ; Notak montre les deux palettes et tous les réglages de ligne.

---

## 2. Les menus contextuels

### 2.1 Clic droit sur la toile

- **Milanote** (`client/workspace/contextMenu/configs/canvasContextMenuConfig.ts`, `items/canvasContextMenuItems.ts`) :
  groupes dans l'ordre : Coller ; Annuler, Rétablir ; Tout sélectionner ; créer une note, un lien, une liste de
  tâches, une ligne, un tableau, une colonne, un commentaire, une table ; Fond du tableau ; Image ou fichier ;
  modèle public. Chaque entrée affiche son raccourci et n'apparaît que si elle sert (coller s'il y a quelque chose,
  annuler s'il y a un pas). La création et le collage se font **au point cliqué**, zoom compris
  (`contextMenu/canvasContextMenuLocationUtils.ts`).
- **Notak** : le menu du navigateur est supprimé et rien ne le remplace (`Toile.tsx:695`). Un clic droit sur le vide
  désélectionne (`Toile.tsx:455-457`).
- **Écart : absent.**

### 2.2 Clic droit sur un élément

- **Milanote** (`contextMenu/configs/elementContextMenuConfig.ts`, `items/element*ContextMenuItems.ts`,
  `items/elementContextMenuPredicates.ts`) : Coller (dans une colonne), Couper, Copier, Coller le style,
  Dupliquer (ou « dupliquer ce raccourci » / « dupliquer en tableau » pour un alias), Créer une copie synchronisée,
  Supprimer ; Renommer ; pour un tableau : ouvrir dans un nouvel onglet, retrouver l'original, créer un raccourci,
  copier le lien, convertir en modèle ; médias : télécharger l'original, ouvrir le fichier, remplacer, ajouter une
  image, copier le lien, proportions ; télécharger le SVG d'un dessin ; Grouper en colonne, Relier par des lignes ;
  convertir en croquis, en note, en document, une colonne en tableau ; **Verrouiller la position** (case cochée) ;
  **Premier plan, Arrière-plan**. Le menu « … » de la barre est le même menu, sans les sections presse-papiers
  et renommage déjà présentes ailleurs.
- **Notak** : rien (`Toile.tsx:695`).
- **Écart : absent.**

---

## 3. L'en-tête

### 3.1 Structure

- **Milanote** (`client/workspace/header/AppHeader.jsx`) : deux bandes. En haut : fil d'Ariane à gauche ; à droite
  notes rapides, aide, recherche, notifications, compte, et **annuler/rétablir seulement si la préférence est
  activée** (`workspaceToolsHeader/WorkspaceToolsHeader.jsx`, réglage dans
  `client/user/account/accountV2/modal/preferences/PreferencesScreen.tsx`). Sous elle, l'en-tête du tableau
  courant (absent sur l'accueil) : titre, état, modèle, Partager et avatars, Exporter, Affichage (zoom,
  présentation), menu du tableau, « enregistrer dans mon accueil » pour un tableau partagé
  (`currentBoardHeader/CurrentBoardHeader.jsx`).
- **Notak** : une bande : fil d'Ariane, pastilles de présence, puis ce que l'application ajoute : Partager et Compte
  (`packages/tableau/src/EspaceNotak.tsx:233-267`, `apps/web/src/main.tsx:105-114`).
- **Écart : différent.** Absents chez Notak : titre éditable, annuler/rétablir, recherche, notifications, aide,
  export, affichage, menu du tableau, état d'enregistrement.

### 3.2 Fil d'Ariane

- **Milanote** (`client/workspace/breadcrumbs/Components/BreadcrumbList.jsx`) : premier segment « Accueil » ; s'il
  manque de place, garde le premier, un « … », puis autant de derniers que la largeur **mesurée** le permet ; le
  « … » ouvre un menu des niveaux cachés et **accepte un dépôt** (survolé, il s'ouvre,
  `breadcrumbTruncateUtil/BreadcrumbTruncateUtil.jsx`). Pendant le chargement : « Accueil » puis « Chargement… »
  animé. Sur téléphone, seulement le parent. Le chemin suit l'alias par lequel on est venu
  (`calculation/breadcrumbPreferredAliasPathUtil.ts`).
- **Notak** : même règle premier + « … » + derniers (`coeur/espace.ts:166-182`), mais largeurs **estimées**
  (7,2 px par caractère, titre coupé à 160 px, +24 ; « … » compté 44 px ; `EspaceNotak.tsx:23-25`). Le « … »
  ouvre un menu, fermé par un clic dehors (`EspaceNotak.tsx:201-208`, `:238-258`). Le chemin est celui de la
  structure (`coeur/espaceDistant.ts`, `chemin`).
- **Écart : différent.** Pas de dépôt sur le fil ni sur le « … », pas d'état de chargement, pas de vue téléphone,
  troncature sur une estimation qui peut se tromper avec des titres en majuscules ou larges.

### 3.3 Titre du tableau

- **Milanote** : titre éditable en place dans l'en-tête, tout le texte sélectionné à l'entrée en édition
  (`currentBoardHeader/CurrentBoardHeaderTitle.jsx`). Pendant cette édition, la barre de gauche n'offre que
  « masquer la barre » (`client/element/board/index.js`).
- **Notak** : le titre n'est qu'un segment du fil, un bouton (`EspaceNotak.tsx:216-231`). On renomme depuis la
  carte du tableau, dans le tableau parent (`elements/tableau/Outils.tsx:5-12`). La racine s'affiche toujours
  « Accueil » (`EspaceNotak.tsx:21`, `:116-122`).
- **Écart : absent** dans l'en-tête. On ne peut pas renommer le tableau où l'on se trouve.

### 3.4 Annuler / rétablir dans l'en-tête

- **Milanote** : deux boutons grisés quand la pile est vide, **cachés par défaut**, montrés sur préférence
  (`workspaceToolsHeader/undoRedo/UndoRedoUtil.tsx`).
- **Notak** : absents.
- **Écart : absent**, mais sans gravité : chez Milanote ils sont désactivés par défaut.

### 3.5 Partage

- **Milanote** : bouton Partager et avatars des éditeurs dans l'en-tête du tableau
  (`currentBoardHeader/sharing/HeaderShareButtonUtil.tsx`, `BoardEditorAvatars.jsx`).
- **Notak** : bouton Partager ; panneau avec la liste des accès (Propriétaire, Édition, Lecture, « en attente »,
  « par le tableau parent »), Retirer pour le propriétaire, formulaire d'invitation par adresse et rôle ; se ferme
  par Échap ou clic dehors (`apps/web/src/Partage.tsx:7-121`).
- **Écart : différent** dans la forme ; le fond (rôles, invitation, héritage) est présent. Pas de lien public ni
  d'avatars intégrés au bouton.

### 3.6 Présence

- **Milanote** : au plus **5** avatars ; au-delà, 4 avatars et un compteur « +N » ; transition 300 ms ; info-bulle
  après 100 ms (`sharing/BoardEditorAvatars.jsx`). Curseurs en direct envoyés toutes les **120 ms**, cachés
  30 ms après la sortie, remontrés 160 ms après le retour, posés « au repos » après **3 s** sans mouvement ; type
  de curseur (pointeur, stylo, gomme) selon l'outil (`client/remoteActivity/liveCollaboration/cursorTracking/`).
  La sélection des autres est montrée (`remoteActivity/remoteSelectedElementsSelector.js`).
- **Notak** : une pastille par personne (initiale, couleur), dédoublonnée, **sans limite** (`EspaceNotak.tsx:274-285`) ;
  curseur des autres avec son nom, envoyé toutes les **100 ms** (`Toile.tsx:97`, `:130-133`, `:736-754`) ; contour
  coloré sur ce qu'un autre a choisi (`Toile.tsx:139-159`).
- **Écart : différent.** Pas de plafond ni de « +N », pas d'état « au repos » du curseur, pas de type de curseur.
  Rythme 100 ms contre 120 ms.

### 3.7 État d'enregistrement

- **Milanote** : retour « Enregistrement… » dans l'en-tête (`currentBoardHeader/savingFeedback/SavingFeedbackUtil.tsx`) ;
  Cmd+S, inutile, ne fait que l'afficher (`shortcuts/interfaceKeyboardShortcutActions.js`, `fakeSave`).
- **Notak** : rien ; Cmd+S laisse faire le navigateur.
- **Écart : absent.**

---

## 4. Accueil, non triés, corbeille, navigation

### 4.1 Accueil et liste des tableaux

- **Milanote** : l'accueil est un tableau comme les autres (la racine de l'utilisateur) ; il n'a pas d'en-tête de
  tableau (`AppHeader.jsx`). Un tableau partagé avec moi s'ajoute à l'accueil par « enregistrer dans mon accueil »
  (`currentBoardHeader/SaveToHomeButton.jsx`). La recherche (Cmd+F) liste aussi les tableaux récents.
- **Notak** : l'accueil est aussi la racine, une toile (`EspaceNotak.tsx:61-62`). Les tableaux partagés avec moi
  sont dans le menu du compte, rubrique « Partagés avec moi » (`apps/web/src/Compte.tsx:32-50`). Un bandeau
  propose une fois d'importer le tableau local si l'accueil est vide (`main.tsx:120-154`).
- **Écart : différent.** Pas de « enregistrer dans l'accueil », pas de récents ni de recherche.

### 4.2 Non triés (inbox)

- **Milanote** (`client/inbox/`) : un bac **à droite** de chaque tableau, large d'une carte plus 2 rem de marge de
  chaque côté (38 UG, `inboxConstants.ts`) ; ouvert ou fermé **par tableau** (état stocké sur le tableau) ; fermé,
  il reste une languette avec le nombre de nouveautés, qui accepte un dépôt (`InboxClosed.tsx`) ; délai de 200 ms
  avant de se refermer. Cmd+\ l'ouvre ou le ferme ; Alt+` y envoie la sélection, sauf éléments verrouillés, lignes
  et commentaires repliés (`shortcuts/elementMoveKeyboardShortcutActions.js`, `moveToUnsorted`).
- **Notak** : aucun bac ; décrit dans la spec seulement (`docs/SPEC.md:102`).
- **Écart : absent.**

### 4.3 Corbeille

- **Milanote** (`client/workspace/toolbar/trash/`) : un outil en bas de la barre de gauche, cible de dépôt ; son
  panneau (382 px, 344 ou 306 px sur petits écrans) a deux onglets, mes éléments et ceux des autres ; on restaure en
  **faisant glisser** un élément hors du panneau ; « vider la corbeille » demande confirmation
  (`popup/TrashEmptyFooter.jsx`). Supprimer met à la corbeille avec la date et le tableau d'origine
  (`client/element/actions/elementShortcutActions.js`, `moveElementsToTrash`) ; un vidage met en « supprimé ».
- **Notak** : Suppr efface pour de bon les éléments, leur contenu de colonne et les lignes accrochées
  (`Toile.tsx:431-438`) ; seul Cmd+Z les rend.
- **Écart : absent.** Une suppression n'est rattrapable que par l'historique, perdu en quittant le tableau (§ 7).

### 4.4 Ouvrir un tableau, revenir

- **Milanote** : double-clic sur la carte ouvre le tableau ; un simple clic sur une carte déjà choisie affiche une
  info-bulle « double-cliquez pour ouvrir » (délai 500 ms, durée 2 s) (`client/element/board/BoardContainer.jsx`,
  `useBoardNavigationTooltip.ts`). **Espace** ouvre l'élément seul choisi : tableau, document, croquis ou image ;
  rappuyée, elle referme la fenêtre d'un élément (`shortcuts/navigationKeyboardShortcutActions.js`). Cmd+clic
  ouvre dans un nouvel onglet. Chaque tableau a son URL : retour et avance du navigateur marchent ; hors Mac,
  Ctrl+[ et Ctrl+] sont liés en plus (`shortcuts/keyboardShortcuts.js`). Changer de tableau est **un pas
  d'annulation** (`client/utils/undoRedo/middleware/shouldAddUndo.js`).
- **Notak** : double-clic ou Cmd+Entrée sur la carte (`elements/tableau/index.ts:12-20`, `:27`) ; pile de parcours
  interne, Cmd+[ et Cmd+] partout (`EspaceNotak.tsx:127-141`, `coeur/espace.ts:226-237`) ; aucune URL par tableau,
  pas d'ouverture en nouvel onglet ; **Espace ne fait qu'attraper la toile** (`Toile.tsx:439-441`). La vue de
  chaque tableau est retenue (100 au plus, `coeur/espace.ts:192-202`) ; Milanote garde aussi sa position.
- **Écart : différent.** Espace n'ouvre pas ; Cmd+Entrée a un autre sens (§ 5.2) ; pas d'URL donc ni lien
  partageable vers un tableau, ni bouton retour du navigateur, ni nouvel onglet ; la navigation ne s'annule pas.

### 4.5 Cmd+U et Cmd+Maj+U

- **Milanote** : Cmd+U monte au tableau parent **selon le fil affiché** ; un tableau détaché ramène à l'accueil ;
  rien à l'accueil. Cmd+Maj+U redescend au tableau qu'on vient de quitter s'il est enfant du courant.
- **Notak** : Cmd+U monte au parent structurel, rien sans parent (`EspaceNotak.tsx:131-133`). Pas de Cmd+Maj+U.
- **Écart : différent** (orphelin : Milanote ramène à l'accueil, Notak ne bouge pas) ; Cmd+Maj+U **absent**.

---

## 5. Raccourcis clavier

Source Milanote : `client/workspace/shortcuts/keyboardShortcuts.js` et les fichiers d'actions voisins.
Source Notak : `Toile.tsx:360-444`, `EspaceNotak.tsx:127-141`, raccourcis des types.
Chez Milanote, tout raccourci qui modifie le tableau est d'abord refusé sans droit d'écriture.

| Touche | Milanote | Notak | Verdict |
|---|---|---|---|
| Suppr, Retour arrière (aussi Cmd+) | à la corbeille ; rien si fenêtre ouverte ou édition ; sans les verrouillés ; désélectionne | efface, avec le contenu des colonnes et les lignes accrochées | différent |
| Alt+` | vers les non triés | — | absent |
| Flèches / Maj+flèches | 1 UG / 5 UG ; rien si menu ou fenêtre ouverts, ni en présentation sur un élément ciblé | 1 / 5 UG, éléments libres seulement | identique sur la toile ; Notak ne bouge rien en colonne |
| Cmd+F | recherche | — | absent |
| Échap | ferme le dernier menu ouvert, puis efface le filtre, puis remonte d'un cran : puce en édition, puce choisie, étiquette, édition, sélection ; quitte aussi la présentation | sort de l'édition, puis désélectionne | différent : les menus de la barre Notak ne se ferment pas à Échap |
| Entrée | éditer : l'image ouvre sa fenêtre, une liste de tâches édite sa dernière tâche, un commentaire ouvre la réponse, une table ne fait rien | éditer si le type est éditable, un seul élément | différent dans les cas particuliers |
| Cmd+Z ; Cmd+Maj+Z, Cmd+Y | annuler ; rétablir | idem (`Toile.tsx:398-405`) | identique |
| Cmd+Alt+P | présentation | — | absent |
| Cmd+A | tout dans la section active ; avec une sélection, dans sa section (colonne, toile, non triés) ; refusé aux invités ; dans la corbeille, toute la corbeille | tout ce qui n'est pas rangé, lignes comprises (`Toile.tsx:406-409`) | différent |
| Cmd+D | dupliquer, décalé de 2 UG en x et en y, la copie choisie ; Alt+glisser duplique aussi | — | absent |
| Cmd+Maj+↑ / ↓ | un cran devant / derrière, parmi ce qui chevauche | — | absent |
| Alt+W/D/S/A/H/V | aligner haut, droite, bas, gauche, centre horizontal, centre vertical | mêmes touches (`elements/arrangement/raccourcis.ts:5-30`) | identique pour les touches, calcul différent (§ 6) |
| Cmd+Alt+Maj+V / H | répartir vertical / horizontal | idem | identique pour les touches |
| Cmd+Alt+V | coller le style | — | absent |
| Cmd+Entrée | créer à côté un élément du **même type** (note dessous, à hauteur + 1 UG, sa mise en forme recopiée ; tableau 17 UG à droite ; colonne 36 UG à droite ; tâches dessous ; rien pour image, ligne, table) | **ouvre** le tableau choisi (`elements/tableau/index.ts:12-20`) | différent : même touche, autre sens |
| Alt+Entrée | action secondaire de l'élément (carte dans une colonne, titre de liste) | — | absent |
| Cmd+Maj+, / . | interface plus petite / plus grande | — | absent |
| Cmd+Maj+D | thème sombre | — | absent |
| Cmd+[ / ] | navigateur sur Mac, liés hors Mac | parcours interne partout | identique dans l'effet |
| Cmd+U / Cmd+Maj+U | parent / revenir à l'enfant | parent seulement | différent (§ 4.5) |
| Espace | ouvrir l'élément choisi ; maintenue + glisser : attraper | attraper seulement | différent |
| Cmd+\ | non triés | — | absent |
| / | fenêtre des raccourcis | — | absent |
| Maj+D | dessiner | — | absent |
| Cmd+, | réglages du compte | — | absent |
| Cmd+K | relier les éléments choisis | relier par paires sans doublon, sans pointe (`elements/ligne/raccourci.ts:11-35`) | identique dans le principe |
| Cmd+S | affiche « Enregistrement » | — | absent (sans gravité) |
| Z, Cmd+=, Cmd+−, Cmd+0 | ajuster, zoom avant, arrière, 100 % | idem (`Toile.tsx:364-375`, `:443`) | identique pour les touches |
| I | pipette de couleur | — | absent |
| Cmd+C / X / V | presse-papiers des éléments (§ 6.1) | coller seulement, du contenu extérieur | différent |

Notak ignore ses raccourcis de toile tant que le focus n'est pas sur la toile elle-même (`Toile.tsx:384`) ; ceux
de navigation écoutent le document, sauf dans un champ de saisie (`EspaceNotak.tsx:42-43`, `:127-141`).
Milanote attache les siens au document par une bibliothèque de raccourcis, certains sur tout le corps de page.

---

## 6. Gestes d'édition

### 6.1 Copier, couper, coller

- **Milanote** (`client/workspace/shortcuts/clipboard/`) :
  - copier ou couper garde les éléments et leur cadre englobant ; **couper ne supprime rien sur le moment** : les
    éléments coupés disparaissent de l'affichage, puis le collage les **déplace** (mêmes identifiants, mêmes
    commentaires) et les choisit ; annuler les fait réapparaître (`clipboardActions.ts`, `clipboardReducer.js`,
    `client/element/ElementContainer.jsx`) ;
  - coller une copie : si la zone d'origine est encore visible, décalage de **2 UG × nombre de collages
    successifs** ; sinon au centre de la vue, sans dépasser le bord haut ou gauche
    (`clipboardPastePositionUtils.ts`) ; le compteur repart à zéro quand on passe de visible à non visible ;
  - les collés passent au-dessus de tout en gardant leur ordre ; vers une colonne choisie ou les non triés, ils s'y
    rangent ; depuis le menu contextuel, ils arrivent au point cliqué ; d'un autre onglet, les contenus des
    conteneurs sont rechargés d'abord ;
  - Cmd+Alt+V recopie le style du premier élément copié sur la sélection.
- **Notak** : pas de copier ni de couper d'éléments ; le collage, hors édition et toile en focus, passe le contenu
  extérieur aux récepteurs (fichier, image, lien…) et le pose **au centre de la vue** (`Toile.tsx:268-283`,
  `:313-322`). La spec prévoit le décalage de 2 UG (`docs/SPEC.md:213-222`).
- **Écart : absent** pour les éléments Notak ; coller du dehors **existe**, au centre de la vue.

### 6.2 Dupliquer

- **Milanote** : Cmd+D ou menu : copie à +2 UG / +2 UG (une colonne ou les non triés : juste après l'original),
  copie choisie ; un alias peut se dupliquer en vrai tableau ; « copie synchronisée » crée un clone lié
  (`client/element/actions/elementShortcutActions.js`).
- **Notak** : rien.
- **Écart : absent.**

### 6.3 Aligner

- **Milanote** (`toolbar/components/selectionTools/arrangementTools/alignmentTools/alignmentUtils.ts`) : sur
  chaque bord **et sur les deux centres**, la valeur de référence est **la plus fréquente** parmi la sélection ; sans
  répétition, l'extrême (bord gauche le plus petit, bord droit le plus grand, centre du cadre englobant) ; à
  égalité, la plus proche de cet extrême ; jamais sous la position minimale possible (0, ou la plus grande largeur
  pour un alignement à droite). Depuis la barre, les éléments verrouillés ne bougent pas (`AlignmentPopup.jsx`).
  Dès 2 éléments, tous sur la toile.
- **Notak** (`coeur/arrangement.ts:29-68`) : bords : la plus fréquente, à égalité ou sans répétition l'extrême ;
  **centres : toujours le centre du cadre englobant**. Pas de plancher. Pas de verrou. Dès 2 éléments libres.
- **Écart : différent.** Trois points : les centres ne cherchent pas la valeur commune ; l'égalité se tranche par
  l'extrême et non par la proximité ; pas de plancher.

### 6.4 Répartir

- **Milanote** (`distributeTools/distributionUtils.ts`) : tri par bord de départ ; le premier reste, **tous les
  autres bougent** (le dernier aussi) ; écart égal entre éléments, **arrondi au plus proche** puis porté au point
  de grille suivant ; s'il reste de la place, au moins 1 UG ; un léger chevauchement (moins d'une UG) devient 0 ;
  un chevauchement plus fort reste négatif. Sans les verrouillés depuis la barre. Dès 3.
- **Notak** (`coeur/arrangement.ts:70-101`) : même tri, le premier reste, les autres suivent ; écart **arrondi
  au-dessus** ; au moins 1 UG s'il y a de la place, 0 si rien, sinon négatif arrondi au-dessus. Dès 3.
- **Écart : différent à la marge** : l'arrondi (au plus proche contre au-dessus) peut donner une UG de plus par
  intervalle ; pas de verrou.

### 6.5 Verrouiller

- **Milanote** : menu de l'élément, « Verrouiller la position », coché s'il l'est ; une sélection mêlée se
  verrouille entièrement (`contextMenu/useElementContextMenuActions.ts`). Un élément verrouillé ne se glisse
  pas, ne se redimensionne pas, ne part ni à la corbeille ni dans les non triés, et l'arrangement de la barre
  l'ignore (`client/element/dnd/draggableElementsSelector.js`, `element/resizing/store/resizingSelector.js`).
  La spec Notak le place toujours dessous.
- **Notak** : absent (mentionné `docs/SPEC.md:58`, `:108`).
- **Écart : absent.**

### 6.6 Premier plan, arrière-plan

- **Milanote** :
  - clavier Cmd+Maj+↑/↓ : **un cran**, et seulement parmi ce qui chevauche : la sélection est découpée en groupes
    qui se touchent ; chaque groupe passe juste au-dessus du voisin le plus haut ou juste sous le plus bas ; rien si
    rien ne chevauche ou si le groupe est déjà au bout ; aucun effet dans les non triés
    (`client/element/actions/elementShortcutActions.js`, `changeElementOrder`) ;
  - menu : **tout devant** ou **tout derrière** les autres éléments du tableau, en gardant l'ordre interne ; une
    ligne accrochée ne passe pas derrière (`useElementContextMenuActions.ts`, `changeStackingOrder`).
- **Notak** : seulement implicite : l'élément créé passe dessus (`coeur/magasinYjs.ts:128-140`), et ce qu'on vient de
  lâcher aussi (`Toile.tsx:608`, `coeur/tableau.ts:285-291`). Ce dernier passe par `remplacer`, hors historique.
- **Écart : absent** comme commande.

---

## 7. Annuler / rétablir : la granularité

- **Milanote** (`client/utils/undoRedo/`) :
  - un pas = **une transaction** : toutes les actions qui portent le même numéro ; un glisser de groupe, un
    alignement, une suppression avec désélection, un « grouper en colonne » qui efface les lignes : un pas chacun ;
  - les gestes des autres ne s'inscrivent pas ; les actions sans numéro non plus (états internes) ;
  - **changer de tableau s'inscrit** : annuler peut ramener au tableau précédent ;
  - au-delà de **500 pas**, on n'en garde que les **400** derniers ; rétablir n'a pas de limite ;
  - un nouveau geste vide la pile de rétablissement ;
  - rejouer un pas saute les actions devenues sans objet (élément disparu, édition d'un élément qui n'est plus
    choisi) ; un rétablissement qui ne fait rien passe au suivant ;
  - pendant l'édition d'un texte, c'est l'éditeur qui annule ses frappes ; la pile générale est ramenée au début de
    l'édition à la sortie d'un éditeur plein écran (`POP_UNDO_STACK_TO`) ;
  - la pile est **unique pour toute la session**, tous tableaux confondus.
- **Notak** :
  - un pas = **un geste** : les opérations d'un même `faire` ; un glisser est réécrit en un seul pas du départ à
    l'arrivée, même s'il a quitté une colonne en route (`Toile.tsx:604-609`, `coeur/magasinYjs.ts:173-180`) ;
  - le temps ne découpe rien (`captureTimeout` infini), seulement les gestes (`coeur/magasinYjs.ts:70-76`) ;
  - seuls les gestes locaux s'annulent (origines suivies) ; les autres ne sont pas annulés ;
  - **le titre et la couleur du tableau ne s'annulent pas** : seul `elements` est suivi
    (`magasinYjs.ts:73`), le titre passe par `remplacer` ;
  - l'édition d'un texte s'inscrit en **un seul pas**, à sa sortie (`Toile.tsx:210-218`) ;
  - le passage au premier plan après un glisser n'est pas un pas (`Toile.tsx:608`) ;
  - **une pile par tableau**, sans limite côté Yjs ; elle disparaît **30 s** après avoir quitté le tableau, quand
    son document se ferme (`coeur/espaceDistant.ts:98`, `:252-271`) ; le magasin local, lui, garde 500 pas puis 400
    (`coeur/historique.ts:4-5`) ;
  - la navigation ne s'annule pas.
- **Écart : différent.** Le grain par geste est le même. Diffèrent : pile par tableau et non par session,
  oubliée au bout de 30 s ; navigation non annulable ; titre non annulable ; pas de plafond sur la pile Yjs.

---

## 8. Écarts classés par importance pour un utilisateur

1. **Pas de corbeille** : Suppr efface pour de bon, et l'annulation disparaît 30 s après avoir quitté le tableau.
   Une erreur de suppression devient une perte de données. (§ 4.3, § 7)
2. **Pas de copier, couper, coller ni dupliquer d'éléments** (Cmd+C/X/V/D, Alt+glisser). Geste de base de tout
   tableau visuel. (§ 6.1, § 6.2)
3. **Aucun menu contextuel**, ni sur la toile ni sur un élément : le clic droit ne fait rien, et toutes les actions
   qui n'existent que là manquent (convertir, grouper, verrouiller, ordre, ouvrir dans un onglet). (§ 2)
4. **Pas d'URL par tableau** : impossible d'envoyer le lien d'un tableau, d'ouvrir un tableau dans un onglet, de
   revenir avec le bouton du navigateur ; un rechargement ramène à l'accueil. (§ 4.4)
5. **Cmd+Entrée change de sens** (ouvre au lieu de créer l'élément suivant) et **Espace n'ouvre plus** : un habitué
   de Milanote est pris à contre-pied deux fois. (§ 5)
6. **Titre du tableau courant non éditable** depuis l'en-tête, et son renommage ne s'annule pas. (§ 3.3, § 7)
7. **Pas de non triés** (bac, Cmd+\, Alt+`). (§ 4.2)
8. **Premier plan / arrière-plan absents** (clavier et menu). (§ 6.6)
9. **Barre de sélection plus pauvre et en union** : pas de « … », pas d'étiquettes, réactions, commentaires,
   icône ; une sélection mêlée empile les outils de chaque type au lieu des seuls communs. (§ 1.2, § 1.3)
10. **Verrouillage absent.** (§ 6.5)
11. **Annulation par tableau, perdue au bout de 30 s, navigation non annulable.** (§ 7)
12. **Échap ne ferme pas les menus de la barre**, Cmd+A prend aussi les lignes et ignore la section active,
    les flèches ne font rien dans une colonne. (§ 5)
13. **Recherche (Cmd+F), notifications, présentation, thème sombre, taille d'interface, fenêtre des raccourcis
    (/)** : absents de l'en-tête et du clavier. (§ 3.1, § 5)
14. **Aligner les centres** prend le centre du cadre au lieu de la valeur commune ; arrondi de la répartition
    différent. Sensible seulement sur des mises en page soignées. (§ 6.3, § 6.4)
15. **Fil d'Ariane** : pas de dépôt sur le fil ni sur le « … », largeurs estimées, pas d'état de chargement ;
    **présence** sans plafond « +N » ni curseur au repos ; pas d'état d'enregistrement ; pas de Cmd+Maj+U.
    (§ 3.2, § 3.6, § 3.7, § 4.5)
16. **Forme de la barre** (flottante contre barre de gauche qui glisse) : choix de conception, pas un manque.
    (§ 1.1)
