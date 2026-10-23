# Écarts Notak / Milanote : la liste de tâches et la tâche

Relevé en salle blanche du 23/10/2026, lecture seule. Aucun code de Milanote n'est recopié : valeurs, noms de données et libellés courts seulement.

Sources Milanote : `client/element/taskList/`, `client/element/task/`, `client/element/chipsPanel/`, `common/taskLists/`, `common/tasks/`, `common/reminders/`, `common/tiptap/extensions/taskList/`, `client/workspace/toolbar/config/singleEditorTaskListToolbarToolConfig.ts`, composants Roma (`checkbox`, `chip`), `common/colors/colorConstants.ts`, `scratchpad/main.css`.
Sources Notak : `packages/tableau/src/elements/taches/` (`Taches.tsx`, `extensions.ts`, `MenuPuce.tsx`, `puces.ts`, `liste.ts`, `glisse.ts`, `html.ts`, `taches.css`), `toile.css`, `langue.ts`.
Déjà relevé ailleurs (non refait) : cadre de la carte, filet de sélection, ombre, redimensionnement, barre de gauche en général (`releve-barre-elements.md` A7.5, `docs/ecarts/elements.md` §6, `releve-cartes.md`).

Deux versions existent chez Milanote. La **V2 « éditeur unique »** (une seule zone Tiptap, titre dans le document, puces par tâche) est celle des listes créées sous l'expérience `singleTaskListEditor` ; la **V1 « ancienne »** (chaque tâche est un élément enfant) reste lue pour les anciennes listes. Les sections 1 à 11 décrivent la V2 (cible de Notak) ; la section 12 liste ce que la V1 a de propre. Les textes anglais d'interface viennent du code quand il les porte ; les fichiers de langue JSON ne sont pas dans la copie, donc les libellés marqués « probable » sont à confirmer à l'écran.

Notation d'unités : UG = unité de grille (10 px au zoom normal). `rem` = 10 px. Les chiffres « 4 px par pas » viennent de la mise à l'échelle Roma (pas de 4 px : 0,75 = 3 px, 1,5 = 6 px, etc.).

---

## 1. Création

- [OK] Outil « À faire » de la barre de création, glisser sur la toile, dépôt dans une colonne — Milanote : outil « To-do » (nom d'élément « To-do list ») — Notak : `elements/taches/index.ts` (outil rang 30, `fantome`, `creer`).
- [OK] Contenu initial — Milanote : une seule tâche vide non cochée, pas de titre (le titre masqué n'existe pas dans le document), la liste passe aussitôt en édition (`createAndEditElement`), curseur dans la tâche — Notak : `docVide()` (`liste.ts:19`), pas de titre, édition au dépôt.
- [OK] Largeur par défaut 34 UG — Notak : `LARGEUR_TACHES = 34` (`liste.ts:10`).
- [DIFFÉRENT] Hauteur initiale — Milanote : fixée par le contenu, soit 19 px de marge haute + une ligne de 30 px (5 + 20 + 5) + 19 px de marge basse = 68 px, aucune hauteur minimale propre — Notak : `HAUTEUR_TACHES_MIN = 6` UG et `min-height: 62px` de la carte (`toile.css:82`), carte de 66 px environ.
- [OK] Cmd+Entrée sur une liste choisie crée une liste dessous qui garde la largeur (et la couleur avec « format ») — Notak : `suivant` (`index.ts:20-24`).
- [ABSENT] Alt+Entrée sur une liste choisie : affiche le titre (le crée vide s'il n'y en a pas) et y met le curseur (même geste que l'outil Titre) — Notak : pas d'Alt+Entrée (voir `docs/ecarts/habillage.md`).
- [OK] Entrée sur une liste choisie ouvre l'édition à la dernière tâche — Notak : `autofocus: 'end'` (`Taches.tsx:280`).
- [ABSENT] Création par collage d'une liste copiée sur une zone vide du tableau : le HTML porteur de tâches (marqueur « taskList ») devient une liste, tâches recopiées avec de nouveaux identifiants, puces de chaque tâche gardées, titre gardé ; sans l'expérience, seul un collage venant d'une liste V2 est converti, le reste reste une note — Notak : le collage sur le tableau passe par la note ; pas de liste créée depuis le presse-papiers (`docs/ecarts/creation.md` §collage). Seul le collage dans une liste en édition est géré.
- [ABSENT] Création par collage de lignes dans une note vide : la note devient liste de tâches (`CardTaskListPaste`) — Notak : `[] ` tapé dans une note la convertit (`Note.tsx:160`), pas le collage.
- [ABSENT] Dépôt d'une liste entière sur une autre liste : fusion — voir §8.
- [OK] `[] ` ou `[x] ` tapé dans une note vide la change en liste de tâches — Notak : `enTaches` (`note/extensions.ts:168-186`).

## 2. Rendu au repos

### 2.1 Carte
- [OK] Fond blanc (`--ws-element-background-primary`), coins carrés (rayon 0), ombre `shadow-xs` + liseré 1 px couleur du fond de toile (« contrast-shadow ») — Notak : `.notak-carte` (`toile.css:79-90`) ; liseré non vérifié, voir `releve-cartes.md`.
- [DIFFÉRENT] Marges internes — Milanote : 19 px en haut, 24 à droite, 19 en bas, 24 à gauche (en taille d'interface moyenne : 18 / 22 / 16 / 22 px ; en petite : 15 / 18 / 15 / 19 px) — Notak : 21 px haut, 20 droite, 21 bas, 24 gauche pour toutes les cartes (`toile.css:84`). Droite à 24 px, haut et bas à 19 px.
- [DIFFÉRENT] Pas entre deux tâches — Milanote : chaque ligne a 5 px de remplissage haut et bas autour d'une ligne de 20 px, soit 30 px de pas ; une sous-liste ajoute 5 px au-dessus d'elle — Notak : la ligne mesure max(case 24, 2 + 20,3) = 24 px, aucun remplissage de ligne (`taches.css:20-36`). Les listes Notak sont 6 px plus serrées par tâche ; une liste de 5 tâches mesure 30 px de moins que chez Milanote.
- [DIFFÉRENT] Distance case-texte — Milanote : case de 16 px, espace de 10 px (`gap` de 1 rem), texte à 26 px du bord de la zone de contenu, donc à 50 px du bord de la carte — Notak : zone de clic 24 px, marge −4 px à gauche et +2 px à droite, texte à 46 px du bord de la carte (`taches.css:43-56`). La case dessinée tombe au même endroit (x 24 à 40) ; le texte est 4 px trop près.
- [OK] Retrait d'une sous-tâche — Milanote : la sous-liste s'ouvre dans la colonne de texte de la tâche (26 px) plus 1 px de remplissage gauche, soit 27 px par niveau — Notak : 26 px par niveau environ (`taches.css:16`, sous-liste dans `li > div`). 1 px d'écart, négligeable.
- [OK] Six niveaux au plus (`MAX_TASK_DEPTH = 6`) — Notak : `PROFONDEUR_MAX = 6` (`liste.ts:7`).
- [DIFFÉRENT] Position verticale du texte dans la ligne — Milanote : texte à 24 px du haut de la carte (19 + 5) ; case décalée de 2 px sous le haut de la ligne — Notak : texte à 23 px, case centrée sur la ligne de 24 px. 1 px d'écart.
- [OK] Police du texte — Milanote : 14 px (`--font-size-element-default` 1,4 rem), interligne 20 px, approche −0,1 px (`-0.01rem`), couleur `--ws-element-primary` (#323B4A) — Notak : 14/20/−0,1 px, `--notak-texte` (`taches.css:1-7`).
- [DIFFÉRENT] Couleur d'une tâche faite — Milanote : `--ws-task-completed` = texte quaternaire = gris clair `#8D929A` (rgb 141 146 154), pas barré, transition de couleur 150 ms linéaire — Notak : `#9aa0a8` (`taches.css:38`), 150 ms. Reprendre #8D929A. Sur une liste colorée Notak met l'opacité à 0,6 (`taches.css:214`) ; Milanote ne change rien, la couleur de la liste n'est qu'une bande.
- [OK] Pas de texte barré pour une tâche faite.
- [DIFFÉRENT] Indication de liste vide — Milanote : tout paragraphe de tâche vide affiche l'indication en gris `--ws-element-placeholder` (#D1D3D6), même quand la liste n'est pas en édition et même s'il y a d'autres tâches ; le titre vide a la sienne (touche `title.placeholder`) ; une liste dont la seule tâche est vide et sans autre contenu garde l'indication de tâche — Notak : seulement quand la liste n'a qu'une tâche vide (`taches.css:166-173`), texte « Ajoutez une tâche… » (`--notak-ph-tache`). Texte anglais de Milanote : clé `emptyPlaceholder` du type « taskList », libellé à confirmer à l'écran.
- [DIFFÉRENT] Couleur de la liste — Milanote : une **bande de 5 px en haut de la carte**, sur toute la largeur, de la couleur choisie (onze teintes de la palette des éléments plus « aucune » : gris `#BBBEC3`, cyan `#62DBC8`, vert `#7CD651`, brun `#D58558`, jaune `#FFD14D`, orange `#FF8D48`, rouge `#FF5757`, rose `#FF6ED4`, violet `#AD6FFF`, bleu `#4EBAFD`, bleu profond `#5882F8`) ; le fond reste blanc. Seuls les notes, croquis et colonnes ont un fond coloré — Notak : la carte entière prend le fond de la couleur, texte, cases et suppression recolorés (`taches.css:175-222`). À refaire : bande de 5 px, fond blanc conservé, texte et case inchangés.
- [OK] Aucune couleur par défaut (« aucune »).

### 2.2 Titre
- [DIFFÉRENT] Nature — Milanote : un nœud `h2` en tête du **même document** que les tâches (titre facultatif d'une seule ligne, retours à la ligne autorisés, aucune mise en forme) ; il s'ajoute, se retire et se récupère avec ses mots (le texte du titre retiré est gardé caché et revient quand on rajoute le titre) — Notak : un champ `input` à part, hors du document (`Taches.tsx:350-362`), le texte disparaît à la suppression du titre. Un retrait/ajout perd le texte.
- [DIFFÉRENT] Style — Milanote : 16 px (15 px en petite taille d'interface), graisse 600, interligne 25 px, couleur primaire, famille « heading » sans-serif, marge 1 px en haut et 4 px en bas (0 en haut en tailles moyenne et petite) — Notak : 16 px, 600, interligne 1,4 (22,4 px), marge basse 8 px (`taches.css:92-106`). Reprendre 25 px d'interligne et 4 px de marge basse.
- [OK] Indication de titre vide en gris — Notak : « Titre » (`taches.titre`) ; Milanote : clé `title.placeholder`, libellé probable « Title ».

---

## 3. États

- [OK] Survol : aucune modification du cadre ; les actions de ligne n'apparaissent qu'au survol d'une ligne (voir §5) — Notak : idem.
- [OK] Choisie : filet de 2 px couleur de sélection, coins carrés ; verrouillée : filet gris ; en édition : le filet s'écarte de 2 px, transition 0,1 s ease-out (`transition: top/right/bottom/left .1s`) — Notak : `toile.css:92-140`.
- [DIFFÉRENT] Plusieurs listes choisies — Milanote : les actions de ligne (poignée, corbeille) disparaissent (opacité 0, aucun clic) dès que la sélection n'est pas une seule liste ; les puces de tâches ne sont pas activables ni modifiables ; Cmd+clic sur une liste choisie en multi garde ce comportement — Notak : non vérifié ; les actions de survol restent actives (`taches.css:156`).
- [DIFFÉRENT] Cocher une case sans choisir la liste — Milanote : cliquer une case coche sans sélectionner la liste (le clic ne remonte pas) tant qu'on a le droit d'écrire ; en lecture seule la case est inerte et le clic sélectionne l'élément — Notak : le clic ne remonte pas (`pointerdown` stoppé, `Taches.tsx:120`) ; en lecture seule non vérifié.
- [OK] Hors édition la liste se dessine à partir du JSON, cases cliquables (Notak : `Figee`).
- [DIFFÉRENT] Texte sélectionné dans la liste — Milanote : la corbeille de ligne ne réagit plus tant qu'une plage de texte est choisie (la classe `task-list-has-text-selection` coupe le pointeur et fait glisser l'icône hors champ) — Notak : rien.
- [ABSENT] Indicateur d'activité par tâche : pastille d'activité non vue (nouvelle assignation, réaction, étiquette) à 26 px à droite de la ligne, haut 3 px, 20 × 20 px — Notak : aucun suivi d'activité.
- [ABSENT] États en glisser — Milanote : pendant le glisser d'une tâche, la ligne source passe à 40 % d'opacité en niveaux de gris (`grayscale(1)`), l'aperçu qui suit le pointeur est une carte de liste complète contenant la tâche (voir §8) — Notak : opacité 0,4 sans niveaux de gris, pastille de texte derrière le pointeur (`taches.css:405-448`).
- [ABSENT] Liste « mise au premier plan » (`being-focused`), mode de mise au point, élément transparent : hors famille, voir `releve-cartes.md`.
- [DIFFÉRENT] Une liste vide (seule tâche vide) dans une colonne : Milanote la ceint d'un liseré extérieur gris et d'un fond blanc comme les autres cartes de colonne ; Notak idem (carte commune).

---

## 4. Barre d'outils de l'élément

### 4.1 Liste choisie seule (non en édition)
- [DIFFÉRENT] Contenu et ordre — Milanote (V2) : **Couleur, Titre**, puis **Réaction, Échéance, Assigner, Étiquette seulement quand la liste n'a qu'une tâche de premier niveau** (outils de cette tâche), **Commentaire**, outils d'arrangement multi-sélection, puis fin de barre (Arr., « ••• ») — Notak : compteur faites/total, Couleur, Titre, puis les outils communs étiquettes, réactions, commentaire, échéance (secondaire) appliqués **à toute la liste**, puis « Effacer les faites » si au moins deux faites (`Taches.tsx:384-440`). Ordre à refaire : Couleur, Titre, [outils de la tâche unique], Commentaire.
- [ABSENT] Outils par tâche unique — Milanote : quand la liste n'a qu'une tâche de premier niveau, Réaction, Échéance, Assigner, Étiquette agissent sur cette tâche (puces de la tâche) — Notak : étiquettes, réactions, échéance et personne se posent sur l'élément lui-même (`elements/decor`), jamais sur une tâche.
- [DIFFÉRENT] Compteur « n/m » dans la barre — Milanote : aucun compteur (pas de progression affichée nulle part pour une liste) — Notak : compteur `faites/total` dans la barre, infobulle « Faites ». Écart voulu à garder (ajout Notak), à signaler dans la spec.
- [DIFFÉRENT] « Effacer les faites » dans la barre — Milanote : pas d'outil ; une bulle sous la liste propose « supprimer les tâches terminées ? » (voir §10) — Notak : bouton gomme secondaire dès deux faites.
- [OK] Couleur : outil à fenêtre de couleurs, onze teintes plus aucune, pas d'onglet « fond » pour une liste (bande seulement) — Notak : `MenuCouleur` partagé avec la note (même palette de fond que la note, pas de mode bande).
- [DIFFÉRENT] Titre : outil à bascule, actif quand la liste a un titre ; icône « toolbar-title » ; clic = retire le titre (garde son texte caché) ou l'ajoute vide et y met le curseur (sélection de la liste mise à jour, édition lancée). Plusieurs listes choisies : l'outil agit sur toutes, curseur seulement si une seule — Notak : bascule `titre` / `sansTitre` qui perd le texte, focus si une seule liste (`Taches.tsx:404-415`).

### 4.2 Curseur dans une tâche (édition, curseur seul)
- [ABSENT] Barre d'édition — Milanote, dans l'ordre : Couleur, Titre, Réaction, Échéance, Assigner, Étiquette, Insérer (derrière l'expérience `insertMenu`, absent en production d'après la liste de Samy), Retrait (icône « toolbar-indent », raccourci Tab), Retrait inverse (« toolbar-unindent », Maj+Tab), Commentaire (icône « toolbar-comment », infobulle « Comment ») — Notak : aucun contenu dans l'emplacement d'édition de la barre de gauche pour les tâches (`ContexteBarreEdition` n'est utilisé que par la note) ; la barre de sélection reste telle quelle.
- [ABSENT] Outils actifs : Titre (actif si titre), Échéance (actif si l'attribut d'affichage est posé ou une date existe), Assigner (actif si l'attribut d'affichage est posé) — ils ne volent jamais le focus de l'éditeur.
- [ABSENT] Échéance (outil) : bascule la puce « Set due date » de la tâche courante ; en l'allumant, sélectionne la puce, dont le sélecteur s'ouvre sous elle — Notak : puce vide visible au survol de toute tâche.
- [ABSENT] Assigner (outil) : bascule la puce « Assign to » ; à l'allumage la liste d'assignés est vidée (au contraire du raccourci) et la puce est sélectionnée ; à l'extinction aussi vidée — Notak : rien.

### 4.3 Texte sélectionné dans une tâche
- [ABSENT] Barre de plage — Milanote : Style de texte (couleurs seulement : pas de blocs), Gras, Italique, Barré, Lien, plus **Commentaire sur le passage** — Notak : pas de barre de mise en forme dans une liste (les raccourcis Cmd+B, Cmd+I, Cmd+Maj+S de Tiptap fonctionnent seulement).
- [ABSENT] Sélection dans le titre : Milanote garde la barre « liste choisie » ; Notak n'a pas de sélection de titre séparée.

### 4.4 Raccourcis propres aux tâches
- [ABSENT] Cmd+Maj+1 : échéance de la tâche courante (allume la puce vide si besoin, ouvre le sélecteur) — Notak : aucun.
- [ABSENT] Cmd+Maj+2 : assigner la tâche courante (allume la puce « Assign to » sans vider les assignés, ouvre le sélecteur, ouvre la puce de l'assigné s'il y en a un) — Notak : aucun.
- [ABSENT] Alt+Retour, listé dans la fenêtre des raccourcis comme « Add a title » (V2) — Notak : aucun.
- [DIFFÉRENT] Cmd+Maj+9 est neutralisé dans une tâche (sinon Tiptap sortirait les tâches de la liste unique) — Notak : Cmd+Maj+9 est « petit texte » ailleurs, non évalué ici.
- [ABSENT] Mod+. (cocher) existe seulement en V1 ; en V2 la case se coche à la souris seulement — Notak : idem (aucun raccourci).
- [ABSENT] Entrée de section « To-do lists » dans la fenêtre d'aide des raccourcis, avec trois lignes : « Add a title », « Add a due date » (Cmd+Maj+1), « Assign a task to someone » (Cmd+Maj+2), visibles seulement avec l'expérience — Notak : pas de fenêtre d'aide.

---

## 5. Menus (clic droit et « ••• »)

- [OK] Menu du clic droit sur la liste : entrées communes de tous les éléments (couper, copier, coller, dupliquer, supprimer, verrouiller, premier plan…) ; l'entrée « Rename » est volontairement exclue pour une liste (le renommage passe par le titre en ligne) — Notak : pas d'entrée Renommer sauf pour un tableau.
- [DIFFÉRENT] Clic droit sur du texte de tâche en édition — Milanote : menu de texte (copier, couper, coller, orthographe, selon le navigateur) ; la liste n'a pas d'entrée propre aux tâches en V2 — Notak : menu de la liste (non vérifié).
- [ABSENT] « ••• » de la liste choisie : fin de barre commune (Verrouiller, Plan, métadonnées…) — Notak : même fin de barre commune ; l'entrée « Effacer les faites » y est en plus.

---

## 6. Gestes et clavier dans la liste

### 6.1 Souris
- [OK] Clic sur une liste non choisie : la choisit ; clic sur une liste seule choisie : édition au point cliqué ; double-clic : édition — Notak : voir `docs/ecarts/toile.md` §4.
- [DIFFÉRENT] Zone de clic de la case — Milanote : case de 16 px + débords de 8 px en haut, 6 px à droite, 8 px en bas et 16 px à gauche (zone de 38 × 32 px) — Notak : 24 × 24 px (`taches.css:43-56`).
- [OK] Maj+clic sur une case : applique l'état à toutes les sous-tâches (la tâche cliquée est le maître) — Notak : `cocherDansEditeur(..., e.shiftKey)`.
- [ABSENT] Cocher joue un son « tick » (décoche : « untick »), Entrée qui crée une tâche joue « new task appear », la corbeille « delete », le dépôt d'une tâche « card drop » — Notak : aucun son.
- [OK] Clic ailleurs sur une ligne : place le curseur ; la ligne ne sélectionne rien.

### 6.2 Clavier (V2)
- [OK] Entrée au milieu d'une tâche : scinde ; la nouvelle tâche n'hérite ni du cochage, ni de l'échéance, ni de la personne — Notak : `keepOnSplit: false` sur `echeance` et `assigne` (`extensions.ts:33-38`), `checked` suit Tiptap.
- [DIFFÉRENT] Entrée au début d'une tâche non vide — Milanote : insère une tâche vierge **au-dessus** ; la tâche courante garde texte, sous-tâches, état et puces — Notak : Tiptap scinde au début : la tâche d'origine reste en haut, vidée, avec ses puces, et le texte descend dans une tâche neuve sans puces (`docs/ecarts/elements.md`, ligne Entrée).
- [DIFFÉRENT] Entrée dans une tâche vide de premier niveau — Milanote : crée une nouvelle tâche vide dessous (on peut empiler des tâches vides) — Notak : ne fait rien (`clavier.test.ts:87`, `extensions.ts:357`).
- [OK] Entrée dans une sous-tâche vide, dernière de sa liste : la remonte d'un niveau — Notak : idem (Tiptap).
- [DIFFÉRENT] Entrée sur une sélection qui couvre plusieurs tâches — Milanote : supprime la sélection puis refait Entrée sur le curseur ; si la sélection ne contient que la frontière entre deux tâches, place seulement le curseur au début de la seconde — Notak : comportement Tiptap par défaut (non vérifié).
- [DIFFÉRENT] Entrée dans le titre — Milanote : crée une nouvelle tâche vide **en tête** de la liste et y place le curseur (ne réutilise pas la première tâche) — Notak : amène le curseur au début de la première tâche existante (`Taches.tsx:343-345`).
- [OK] Retour arrière dans le titre vide : retire le titre, curseur au début de la première tâche — Notak : `changerTitre(undefined)` + `focus('start')`.
- [OK] Retour arrière au début d'une tâche : fusionne avec la ligne d'au-dessus (texte rejoint la dernière sous-tâche de la précédente, sous-tâches suivent) — Notak : `fusionnerAvecPrecedente` (`extensions.ts:260-294`).
- [DIFFÉRENT] Retour arrière au début d'une tâche non vide dont la tâche précédente est **vide** — Milanote : supprime la tâche vide précédente, la tâche courante garde texte, sous-tâches, puces — Notak : fusionne dans la tâche vide, sous-tâches suivent, les puces de la tâche courante sont perdues (le texte rejoint le nœud sans puces de la précédente).
- [OK] Retour arrière au début de la première sous-tâche : la remonte d'un niveau avec ses sous-tâches — Notak : Tiptap (`clavier.test.ts:131`) ; la sortie de ses suivantes est faite à la main chez Milanote (les tâches qui suivent deviennent ses sous-tâches avant la remontée). Notak : non vérifié.
- [OK] Retour arrière dans la première tâche vide d'une liste sans titre et avec d'autres tâches : la tâche devient le titre (supprimée, titre vide inséré, curseur dedans) — Notak : `clavierListe` (`extensions.ts:206-231`).
- [OK] Retour arrière dans la première tâche vide quand un titre existe : la tâche vide est supprimée s'il y a d'autres tâches et qu'elle n'a pas de sous-tâche, le curseur monte au bout du titre ; avec du texte ou une seule tâche, seul le curseur monte — Notak : idem pour le cas vide ; cas « texte au début de la première tâche » non traité (Tiptap).
- [OK] Retour arrière dans l'unique tâche vide, sans titre : la liste va à la corbeille — Notak : `gestes.jeter()` (`extensions.ts:206-231`).
- [ABSENT] Règle de saisie « # » + espace dans la première tâche vide (sans titre existant) : le titre est créé, la tâche vide est supprimée s'il y en a d'autres (sinon vidée du « # »), curseur dans le titre — Notak : aucune règle de saisie (seul le retour arrière sur la première tâche vide fait un titre).
- [OK] Règle de saisie « [] » ou « [ ] » + espace au début du titre : le titre devient une tâche en tête, le reste du texte devient son texte, curseur au début — Notak : `titreTape` (`Taches.tsx:325-340`), accepte `[x]` en plus (garder).
- [DIFFÉRENT] Suppr — Milanote : au bout du texte, fusionne avec la ligne suivante (la première sous-tâche, sinon la tâche suivante) ; sur une tâche vide avec une suivante, supprime la vide et place le curseur au début de la suivante (les puces de la suivante sont préservées) — Notak : comportement Tiptap par défaut (non vérifié) ; puces de la suivante probablement perdues.
- [OK] Cmd/Alt + Retour arrière sur une tâche vide : fusionne dans la précédente ou remonte la première sous-tâche ; sur une tâche avec texte : efface un mot — Notak : `reduireVide` (`extensions.ts:296-303`). (L'écart noté dans `docs/ecarts/elements.md` est résorbé.)
- [ABSENT] Cmd/Alt + Suppr sur une tâche vide : même réduction — Notak : non géré.
- [OK] Tab : descend la tâche en sous-tâche de la précédente (6 niveaux au plus) ; la touche ne quitte jamais l'éditeur — Notak : `extensions.ts:342-350`.
- [OK] Maj+Tab : remonte d'un niveau ; les tâches qui suivent au même niveau deviennent sous-tâches de la remontée si elle en a déjà (évite deux listes dans une tâche) — Notak : Tiptap `liftListItem` ; le déplacement des suivantes n'est pas fait (à vérifier : liste de sous-tâches double).
- [DIFFÉRENT] Flèches — Milanote : correctifs pour les bords : ArrowDown sur la dernière ligne de la dernière tâche va à la fin du texte, Maj+ArrowDown étend à la fin, ArrowRight en fin de tâche passe au début de la tâche suivante (fin de liste : reste), Maj+ArrowRight étend jusqu'au début du bloc suivant — Notak : comportement natif de Tiptap, avec le risque (documenté chez Milanote) de sauter à la fin de la tâche précédente.
- [OK] Échap : quitte l'édition (Notak idem).
- [DIFFÉRENT] Maj+Entrée dans une tâche — Milanote : un seul paragraphe par tâche (`paragraph taskList?`), un saut de ligne dur est possible (`HardBreak`) — Notak : un seul paragraphe par tâche (`content: 'paragraph taskList?'`), saut de ligne de StarterKit (non vérifié).

### 6.3 Sélection de plusieurs tâches
- [ABSENT] Cmd+X sur le texte entier d'une tâche : la tâche part avec ses puces (le presse-papiers porte tâche, puces et sous-tâches non), et la ligne vidée est remise à zéro (échéance, assignés, étiquettes, réactions effacés) — Notak : non géré.
- [ABSENT] Cmd+C sur tout le texte d'une tâche : copie la tâche entière dans une liste fermée (avec ses puces mais sans ses sous-tâches) — Notak : copie du texte seul.

---

## 7. Contenu riche d'une tâche

- [DIFFÉRENT] Marques de texte — Milanote : gras, italique, barré, souligné, code, couleur de texte, surlignage, casse du texte, lien (`Link`), mention ancienne (`OldMention`, sans menu de suggestions), lien vers un tableau en ligne (`InlineBoardLink`), commentaire en ligne (`InlineComment`) — Notak : gras, italique, barré, souligné, code, lien (StarterKit, `inline()` de `Taches.tsx:222-242`) ; pas de couleur, surlignage, casse, lien de tableau, commentaire en ligne ni mention.
- [ABSENT] Lien vers un tableau collé (adresse de tableau Milanote) devient un lien en ligne résolu (titre du tableau, icône) — Notak : un lien ordinaire.
- [DIFFÉRENT] Saut de ligne dans une tâche — voir §6.2.
- [DIFFÉRENT] Collage dans une liste en édition — Milanote : plusieurs lignes de texte brut → une tâche par ligne, à plat ; un HTML avec blocs ou listes → tâches à plat, les listes imbriquées de la source donnent des sous-tâches ; les titres de la source deviennent des tâches ; un HTML venu d'une liste Milanote est collé tel quel (puces comprises, nouveaux identifiants) ; une seule ligne reste du texte ; dans le titre, tout reste du texte en une ligne — Notak : `CollageEnTaches` (`extensions.ts:317-330`) : HTML d'abord, texte brut ensuite, imbrication gardée, six niveaux au plus, un copier de Notak est collé tel quel. Le cas « Notak colle à l'identique avec ses puces » est géré par le HTML interne de Tiptap (data-pm-slice). Écart : puces non portées par les attributs de copie (`data-echeance` oui, `data-assigne` oui) — OK pour ces deux seulement.
- [ABSENT] Copier la liste entière (élément) : le presse-papiers porte le HTML de la liste (titre en `h2`, tâches avec puces cachées) et un texte brut avec une ligne par tâche, sous-tâches indentées de 4 espaces, titre en première ligne — Notak : copie de l'élément en JSON interne ; le texte brut collé dans une autre application n'est pas vérifié.
- [ABSENT] Coller une liste copiée sur une liste choisie : les tâches s'ajoutent à la fin de cette liste (nouveaux identifiants, titre source ignoré) ; un couper déplace et met la source à la corbeille, un seul pas d'annulation — Notak : crée une seconde liste sur le tableau.
- [DIFFÉRENT] Dupliquer une tâche (copie via glisser avec Alt) : identifiants frais, marques de commentaire en ligne retirées — Notak : sans objet (pas d'identifiant ni de commentaire).
- [ABSENT] Recherche dans le tableau (Cmd+F) surligne le texte des tâches et les puces — Notak : pas de recherche.

---

## 8. Glisser une tâche, glisser une liste

- [DIFFÉRENT] Poignée — Milanote : une icône « task-drag » de 16 px (trois traits horizontaux ≡, couleur #A3A7AE) dans la **marge de droite de la carte** (zone de 30 px, icône alignée à droite avec 16 px de retrait), visible au survol de la ligne ; absente en lecture seule ou en export — Notak : six points en grille (`radial-gradient`), à **gauche** de la case, à −20 px, opacité 0,35 au survol, 0,8 sur la poignée (`taches.css:379-402`). À déplacer à droite avec l'icône ≡.
- [DIFFÉRENT] Départ du glisser — Milanote : glisser HTML5 (react-dnd) ; s'il est impossible de sortir la tâche (liste d'une seule tâche sans titre, etc.), le glisser est celui de **toute la liste** — Notak : événements pointeur sur la poignée, seuil de 4 px (`glisse.ts:12`) ; une liste à tâche unique laisse la tâche se déplacer.
- [DIFFÉRENT] Aperçu qui suit le pointeur — Milanote : une carte de liste complète (blanche, titre absent) contenant la tâche et ses sous-tâches, placée à 28 UG × 1 UG du pointeur, qui devient transparente au-dessus d'une autre liste ; la ligne source reste en place à 40 % + niveaux de gris — Notak : étiquette de 220 px au plus avec le texte de la tâche (`taches.css:422-448`), bordure pointillée au-dessus du vide.
- [DIFFÉRENT] Indicateur d'insertion — Milanote : un trait de 2 px de haut (`--ws-element-primary`, #323B4A), placé au **milieu du vide** entre le bas du contenu de la tâche précédente (puces comprises) et le haut de la suivante, aligné à gauche sur la colonne de cases du niveau visé, jusqu'au bord droit du contenu — Notak : trait de 2 px couleur d'accent (`--notak-accent`), posé sur le bord de la tâche la plus proche (`taches.css:409-420`), sans écart de gouttière.
- [DIFFÉRENT] Choix du niveau (sous-tâche ou non) — Milanote : à chaque vide, tous les niveaux valables sont proposés, et c'est la **position horizontale de la case de l'aperçu** (non du pointeur) qui choisit le niveau le plus proche, avec bascule à mi-chemin des colonnes ; déposer après une tâche qui précède une sous-tâche peut faire adopter les tâches qui suivent comme enfants — Notak : le pointeur à gauche penche pour le niveau du dessus (`glisse.ts:23-35`), pas de choix par colonne ni d'adoption.
- [ABSENT] Déplacement nul — Milanote : déposer là où la tâche est déjà ne dessine aucun trait et ne produit aucun résultat — Notak : refuse sur soi et ses sous-tâches (`glisse.test.ts`), trait quand même affiché sur les voisins.
- [ABSENT] Alt (Option) pendant le glisser : copie la tâche au lieu de la déplacer (copie hors de sa propre sous-liste, identifiants frais) — Notak : aucun.
- [OK] Déposer sur une autre liste du tableau : la tâche est déplacée dans cette liste — Notak : `transferer` (`liste.ts`).
- [OK] Déposer dans le vide de la toile : une nouvelle liste contenant la tâche naît à cet endroit, un seul pas d'annulation — Notak : `detacher`.
- [ABSENT] Déposer dans une colonne : la nouvelle liste se range dans la colonne à l'endroit visé — Notak : la viser colonne retourne « rien » (`glisse.ts:56`).
- [ABSENT] Glisser une **liste entière** sur une autre liste : fusion de ses tâches à l'endroit visé (indicateur de niveau identique), la source est mise à la corbeille dans le même pas ; avec Alt, copie sans toucher à la source — Notak : une liste déposée sur une autre se pose dessus.
- [ABSENT] Échap pendant le glisser annule (restaure l'aspect de la source) — Notak : idem (`glisse.ts` : touche Échap).
- [OK] Son de dépôt et de ramassage — voir §6.1 (ABSENT côté Notak).

---

## 9. Puces d'une tâche : échéance, personne, étiquettes, réactions

Données Milanote par tâche : `dueDate` {instant en millisecondes, indicateur d'heure, rappel}, `assignments` [{identifiant et nom de l'assigné, identifiant de l'assigneur, instant}], `labels` [{identifiant d'étiquette}], `reactions`, drapeaux `showDueDate` et `showAssignments`, et un `taskId` unique par tâche. Notak : `echeance` (texte `AAAA-MM-JJ`) et `assigne` (nom libre) seulement (`puces.ts`).

### 9.1 Placement
- [DIFFÉRENT] Position — Milanote : les puces sont **sous le texte** de la tâche (colonne de la tâche), dans l'ordre échéance, assignation, étiquettes, réactions ; marge haute 9 px, marge basse 3 px, espace de 6 px entre puces, retour à la ligne si trop larges ; bloc masqué s'il est vide — Notak : à **droite du texte sur la même ligne**, échéance puis personne (`taches.css:226-232`, marge 3 px gauche 6 px).
- [DIFFÉRENT] Cas vide — Milanote : une puce vide n'existe que si on a allumé son outil (drapeau posé) : « Set due date » ou « Assign to » ; sinon rien du tout, même au survol — Notak : puce vide en pointillés visible au survol de **toute** tâche, avec ses libellés « Échéance » et « Assigner » (`taches.css:262-277`).
- [DIFFÉRENT] Puce d'une date avec le drapeau éteint — Milanote : une tâche portant une date mais drapeau éteint n'affiche rien ; la date d'une tâche allumée disparaît quand on éteint — Notak : la date reste affichée.

### 9.2 Puce d'échéance
- [DIFFÉRENT] Géométrie — Milanote (puce « xs ») : hauteur 18 px, remplissage horizontal 6 px, rayon 4 px, police 11 px / interligne 16 px, graisse 500 (medium), pas de retour à la ligne ; icône de cloche de 14 px en tête (remplissage gauche réduit à 3 px) quand un rappel est posé — Notak : hauteur 18 px, rayon 9 px (pilule), 11 px, graisse du parent, sans icône (`taches.css:234-248`).
- [DIFFÉRENT] Couleurs — Milanote, quatre états : date future = fond vert pâle `#EDF8EE` + texte vert `#4EB85A` ; échéance **aujourd'hui** = fond orange pâle `#FFF3E9` + texte `#FF8D22` ; **en retard** = fond rouge pâle `#FDEFEF` + texte `#E60B0B` ; tâche **faite** ou sans date = fond gris `#F3F3F4` + texte `#5F6672` — Notak : fond 10 % de la couleur du texte pour les dates ; rouge `#d43b3b` sur 12 % seulement pour un retard ; pas de vert, pas d'orange (`taches.css:249-258`).
- [DIFFÉRENT] Texte — Milanote : préfixe « Due » (clé `assignment.dueDatePrefix`) + date compacte : « Due today », « Due tomorrow », « Due 31 Dec » (jour mois abrégé, avec l'année si autre année, ordre selon la langue), puis ` (5:00 PM)` si une heure est fixée (12 h ou 24 h selon la préférence) ; aujourd'hui avec heure déjà passée : « Due » + heure relative convertie (ex. « 2 hours ago ») ; sans date : « Set due date » — Notak : « Aujourd'hui », « Demain », « Hier », sinon « 12 oct. » (`puces.ts:60-69`), sans préfixe ni heure ; vide : « Échéance ».
- [OK] Retard : une tâche faite n'est jamais en retard — Notak : `retard` exclut les faites.
- [DIFFÉRENT] Règle de retard — Milanote : sans heure, en retard seulement si la date est avant aujourd'hui ; avec heure, dès que l'instant est dépassé — Notak : jour seul, sans heure.
- [DIFFÉRENT] Sélection — Milanote : un clic sélectionne la puce (anneau de 2 px couleur primaire autour), un second clic ferme/rouvre la fenêtre ; Suppr ou Retour arrière sur la puce choisie la supprime (éteint le drapeau et efface la date) ; Entrée ou F2 : bascule l'édition ; Échap : désélectionne ; cliquer ailleurs sur la toile désélectionne ; seulement si la liste est **seule choisie** — Notak : un clic ouvre le menu directement, sans état « puce choisie » (`MenuPuce.tsx`), Échap ferme.
- [DIFFÉRENT] Fenêtre de choix — Milanote : fenêtre ancrée sous la puce, alignée à gauche, centrée sur la puce (décalage d'axe calculé sur 29 UG de large), largeur 292 px (267 en taille moyenne, 235 en petite), remplissage 20 px, hauteur minimale 350 px ; contient (1) un **calendrier mensuel** : navigation mois précédent/suivant uniquement (flèches de 36 × 30 px, les sauts d'année masqués), nom du mois en gras (600), initiale du jour de la semaine sur 20 px de haut, six semaines fixes, jours des mois voisins masqués, cases de jour de 36 px (33 et 29 en tailles réduites) à rayon 4 px, **aujourd'hui cerclé de 2 px** (couleur secondaire du calendrier), **jour choisi en gras cerclé de 2 px** (couleur primaire), jours passés grisés et désactivés (`futureOnly`), premier jour de la semaine = dimanche en en-US sinon lundi ; cliquer le jour déjà choisi **efface la date** ; (2) une zone d'heure (marge haute 15 px) ; (3) une zone de rappel (marge haute 10 px) — Notak : fenêtre de 232 px, `input type="date"` natif, trois raccourcis (Aujourd'hui, Demain, Dans une semaine), « Retirer l'échéance » (`MenuPuce.tsx`, `taches.css:279-330`). Dates passées permises.
- [ABSENT] Heure — Milanote : bouton pleine largeur de 37 px bordé « Add due time… » avec icône d'horloge de 24 px ; une fois posée, une ligne bordée (rayon 3 px) avec l'horloge, un champ d'heure, et un bouton lien « Clear time » ; l'heure par défaut proposée est 17:00 — Notak : aucune heure.
- [ABSENT] Rappel — Milanote : liste déroulante de 35 px de haut avec cloche de 24 px à gauche (remplissage gauche 40 px), flèche à droite, texte semi-gras, survol gris `#F3F3F4` ; options **sans heure** : aucun rappel, 9 h le jour même, 9 h la veille ; **avec heure** : aucun, à l'échéance, 10 minutes avant, 1 heure avant, 9 h le jour même (proposé seulement si l'échéance est à 9 h ou après), 9 h la veille ; seules les options encore dans le futur sont proposées ; valeur par défaut : 9 h le jour même (sinon la dernière option valable) ; si l'utilisateur a choisi « aucun », ce choix est gardé ; le rappel déclenche une notification — Notak : aucun rappel, aucune notification. Libellés EN probables : « No reminder », « When due », « 10 minutes before », « 1 hour before », « 9:00 AM on the day », « 9:00 AM the day before ».
- [ABSENT] Écrit dans la tâche à chaque choix : l'instant, l'indicateur d'heure, le rappel, et le drapeau d'affichage ; l'effacement garde le drapeau (la puce « Set due date » reste) — Notak : `echeance` seule.

### 9.3 Puce de personne
- [DIFFÉRENT] Affichage — Milanote : chip de 18 px, rayon 4 px, fond bleu pâle `#EAEFFE`, texte bleu `#2F63F7`, libellé `@` + **nom** de la personne (« @Prénom Nom ») ; non assignée : fond gris, texte « Assign to » — Notak : pastille ronde de 18 px aux initiales, fond teinte tirée du nom (`hsl(h 45% 40%)`), texte blanc 9 px (`taches.css:333-346`, `puces.ts:100-109`).
- [DIFFÉRENT] Choix — Milanote : fenêtre de 292 px sans remplissage ; en haut un champ de recherche (remplissage 4 px, séparé par un trait gris, police « secondaire »), focus automatique ; liste défilante (hauteur max 240 px, remplissage vertical 7 px, barre de défilement de 6 px) des **collaborateurs du tableau** avec avatar et nom, surlignage de la recherche, coche (icône « notification-viewed ») sur l'assigné actuel ; une section « Not sharing » (titre libellé probable) en bas pour les personnes mentionnables mais sans accès ; flèches haut/bas, Entrée choisit, Échap ferme, Retour arrière sur recherche vide retire l'assigné et ferme ; un seul assigné par tâche — Notak : champ « Un nom… » libre + liste des personnes présentes (soi d'abord) + « Retirer la personne » (`MenuPuce.tsx:98-124`) ; nom libre sans compte.
- [ABSENT] Assigner crée une notification à l'assigné et inscrit l'assigneur et l'instant — Notak : aucune.
- [ABSENT] Mentions `@` dans le texte d'une tâche ouvrant la liste des personnes (V1 seulement ; en V2, le raccourci est Cmd+Maj+2) — Notak : aucune.

### 9.4 Étiquettes
- [ABSENT] Étiquettes par tâche — Milanote : puce de la couleur de l'étiquette (texte noir sur couleur claire, blanc sur sombre, hauteur 18 px), nom modifiable en place (longueur maximale `LABEL_NAME_MAX_LENGTH`), clic = sélection (anneau 2 px), Entrée/F2 = renommer, Suppr = retirer de la tâche ; l'étiquette est partagée avec le reste du tableau ; la liste garde l'ensemble des identifiants d'étiquettes de ses tâches — Notak : étiquettes posées sur l'élément entier (`decor/Etiquettes.tsx`), jamais sur une tâche.
- [ABSENT] Outil Étiquette par tâche (fenêtre de la barre dédiée aux tâches) — Notak : fenêtre d'étiquettes de l'élément.

### 9.5 Réactions
- [ABSENT] Réactions par tâche — Milanote : puce à émoji (taille 12 px en 'xs'), compte à droite, bleue quand l'utilisateur a réagi ; un clic bascule la réaction ; infobulle avec les noms ; l'outil Réaction (permission « feedback » suffit) ouvre un sélecteur d'émojis — Notak : réactions sur l'élément (`decor`).

### 9.6 Commentaires
- [ABSENT] Commentaire en ligne sur un passage de tâche (marque de texte, fil attaché à la liste), outil Commentaire en plage et en curseur — Notak : aucun commentaire en ligne dans une liste.
- [OK] Commentaire attaché à toute la liste (sous la carte) — Notak : `menu.commenter` et `decor.commentairesSur`.

---

## 10. Suggestions sous la liste

- [ABSENT] Bulle « Add a title? » (libellé probable) — Milanote : proposée 1 s après une pause de frappe quand la liste gagne une deuxième tâche de premier niveau sans avoir de titre ni avoir déjà été acquittée ; réponses « Yes » (ajoute le titre et y place le curseur) et « No thanks » (acquitte) ; retirée d'office si un titre apparaît ; après trois refus de la même suggestion, elle est désactivée dans les préférences de l'utilisateur — Notak : aucune suggestion.
- [ABSENT] Bulle « Delete completed tasks? » — Milanote : proposée dès deux tâches faites (à toute profondeur), retirée à zéro ; « Yes » supprime toutes les faites en un pas (une tâche faite emporte ses sous-tâches ; si tout est fait, il reste une tâche vide) avec le son de suppression ; « No thanks » ne la reproposera plus pour cette liste — Notak : bouton « Effacer les faites » dans la barre dès deux faites (`Taches.tsx:422-427`), fonctionnellement équivalent mais sans bulle ni mémoire de refus.
- [ABSENT] Habillage de la bulle — Milanote : hauteur 40 px, police `--font-size-element-messaging`, couleur secondaire, boutons soulignés, remplissage latéral 24 px (aligné sur la carte, pleine largeur), question + « Yes » + « No thanks » espacés de 10 px, 3 px sous ; animation d'entrée 200 ms ease-out (hauteur et opacité depuis 0, déplacement de 40 px vers le bas), sortie 100 ms (opacité) et 200 à 300 ms (hauteur, déplacement) ; masquée si la carte est plus étroite que 34 UG — Notak : sans objet.

---

## 11. Suppression, sauvegarde et annulation

- [DIFFÉRENT] Corbeille de ligne — Milanote : une icône « task-trash » (corbeille en contour, 16 px, #A3A7AE) apparaît au survol **uniquement sur une tâche cochée** (liste modifiable) ; elle glisse depuis la droite de 31 px en 160 ms ease-out, après **500 ms de délai**, sur un dégradé de fond (blanc à 40 % vers blanc à 30 %) qui masque le texte dessous ; départ en 160 ms ease-in ; clic (relâchement du bouton gauche) supprime la tâche et ses sous-tâches avec le son de suppression ; elle se place juste à gauche de la poignée — Notak : croix « × » grise de 10 px au bout de la ligne, visible au survol de **toute** tâche (fait ou non), apparition en 100 ms d'opacité, sans glissement ni dégradé, supprime la tâche (`taches.css:120-165`). À refaire : réserver à la tâche cochée, icône corbeille, glissement différé.
- [DIFFÉRENT] Dernière tâche supprimée — Milanote : liste sans titre texte → la liste part à la corbeille ; liste avec titre non vide → une tâche vide remplace, curseur au bout du titre ; la liste est conservée si le titre est caché — Notak : une tâche vide reste (`retirerDansEditeur`, `extensions.ts:179-186`), la liste ne part jamais.
- [OK] Sauvegarde différée à la frappe, un seul pas d'annulation par geste — Notak : `onUpdate` + texte partagé.
- [DIFFÉRENT] Annuler/rétablir d'une tâche — Milanote : annulation d'application (même pile que les éléments) pour les gestes qui touchent plusieurs objets (glisser dehors, fusion de listes, suppression des faites) en un seul pas — Notak : un pas pour la liste entière via le magasin ; la sortie vers une autre liste est un seul pas (`Taches.tsx:70-80` (`operationsDeSortie`)).

---

## 12. Version V1 (anciennes listes) : ce qu'elle a de propre

À n'implémenter que si Notak doit lire des listes Milanote anciennes.

- [ABSENT] Structure : liste (titre, drapeau `showTitle`) + éléments `TASK` enfants, imbriqués jusqu'à six niveaux, chacun avec son éditeur, ses commentaires et ses pastilles — Notak : un seul document.
- [ABSENT] Marges de ligne — Milanote V1 : ligne `TaskStyler` : remplissage gauche 12 px, case de 16 px avec 6 px autour (zone 30 px de haut), texte avec 4 / 4 / 6 / 4 px, droite 24 px ; retrait de 27 px par niveau ; première ligne d'une liste sans titre : 24 px de haut (« large-top »).
- [ABSENT] Boutons de ligne V1 : poignée de 30 × 25 px à droite (icône 16 px), corbeille de ligne à 6 px du bord (26 px quand la poignée existe), visibles au survol, sur appareil tactile toujours visibles quand la liste est choisie ; pas de corbeille sur une tâche non cochée.
- [ABSENT] Puces V1 — pilule de 19 px de haut, rayon 2 px, 11 px, bord 1 px (couleur neutre 700), état « actif » bordé de la couleur primaire ; échéance colorée par classes (futur, aujourd'hui, retard, terminé) avec cloche de 12 px décalée de 2 px ; assignation : fond et texte `--ws-assignment-*` (mêmes valeurs que la V2) ; fenêtres de 292 / 267 / 235 px.
- [ABSENT] Raccourcis V1 — Mod+. coche/décoche ; `@` en fin de texte (précédé d'une espace ou vide) ouvre l'assignation ; Mod+@ ouvre l'échéance ; flèches en bout de texte passent à la tâche voisine ; Entrée en milieu de texte crée la tâche suivante avec le texte restant.
- [ABSENT] Outils V1 : Couleur, Étiquettes, Réaction, Commentaire, Titre, Échéance, Assigner, Retrait, Retrait inverse, Insérer (par tâche en édition) ; liste choisie seule : Couleur, Étiquettes/Réactions/Commentaire/Échéance/Assigner si une seule tâche est choisie, Titre.
- [ABSENT] Suggestions V1 : bulle « titre » et bulle « supprimer les faites » sur la liste ancienne, aux mêmes seuils.

---

## Top 15 des écarts les plus visibles

1. **Pas entre les tâches** : 30 px chez Milanote (5 + 20 + 5) contre 24 px chez Notak. Toutes les listes paraissent trop serrées ; la hauteur d'une liste de cinq tâches diffère de 30 px. (§2.1)
2. **Couleur de la liste** : Milanote pose une bande de 5 px en haut de la carte et laisse le fond blanc ; Notak colore toute la carte comme une note. (§2.1)
3. **Corbeille de ligne** : Milanote ne la montre que sur une tâche cochée, en icône de corbeille qui glisse après 0,5 s ; Notak montre une croix sur toute tâche au survol. (§11)
4. **Poignée de glisser** : Milanote la met à droite (trois traits ≡, visible au survol) ; Notak à gauche (six points) ; l'aperçu du glisser et le trait d'insertion diffèrent aussi (carte de liste complète, trait de 2 px au milieu du vide, niveau choisi par la case). (§8)
5. **Puces d'échéance** : Milanote affiche « Due today / Due 31 Dec (5:00 PM) » en vert, orange ou rouge pâle sous le texte ; Notak affiche « Aujourd'hui / 12 oct. » à droite, en gris sauf le retard. (§9.2)
6. **Sélecteur d'échéance** : calendrier mensuel avec jour courant et jour choisi cerclés, heure facultative, rappel à six options ; Notak : champ de date natif et trois raccourcis, aucun rappel. (§9.2)
7. **Puces vides au survol** : Notak montre « Échéance » et « Assigner » en pointillés sur toute tâche survolée ; Milanote n'en montre aucune tant qu'on n'a pas allumé l'outil. (§9.1)
8. **Barre d'édition absente** : en écrivant dans une liste Notak ne montre ni Couleur, Titre, Échéance, Assigner, Étiquette, Retrait, Retrait inverse, Commentaire, ni la barre Gras, Italique, Barré, Lien. (§4.2, §4.3)
9. **Assignation** : chip bleu « @Nom » avec liste des collaborateurs du tableau et recherche, contre une pastille ronde aux initiales et un nom libre. (§9.3)
10. **Étiquettes, réactions et commentaires par tâche** : Milanote les porte par tâche (puces sous le texte) ; Notak ne les pose que sur la liste entière. (§9.4 à §9.6)
11. **Titre** : un champ à part chez Notak (texte perdu à la suppression, Entrée ne crée pas de tâche, interligne et marge différents) contre un nœud du document chez Milanote. (§2.2, §6.2)
12. **Indication de tâche vide** : Milanote l'affiche dans chaque tâche vide ; Notak seulement dans la tâche unique d'une liste vide. (§2.1)
13. **Entrée sur une tâche vide de premier niveau** crée une tâche chez Milanote, ne fait rien chez Notak ; Entrée au début d'une tâche non vide crée une tâche vierge au-dessus chez Milanote, vide la tâche courante chez Notak. (§6.2)
14. **Bulles de suggestion** (« Add a title? », « Delete completed tasks? ») : absentes chez Notak. (§10)
15. **Couleur et animation de la case cochée** : Milanote remplit en gris `#D1D3D6` avec une coche blanche tracée en 150 ms après un flash vert et un rebond de 0,8 à 150 ms ; Notak remplit en couleur de texte foncée, sans flash ni tracé, et ne rebondit qu'à l'appui ; zone de clic de 24 px contre 38 × 32 px. (§13)

---

## 13. La case à cocher (détail à part)

- [DIFFÉRENT] Taille et forme — Milanote : carré de 16 px, rayon 2 px, bord de 1 px **à l'intérieur** couleur du texte primaire `#323B4A`, fond blanc — Notak : carré de 16 px dans une zone de 24 px, bord de 1,5 px, rayon 2 px (`taches.css:57-65`). Passer le bord à 1 px.
- [DIFFÉRENT] Case cochée — Milanote : fond gris `#D1D3D6` (`fg-disabled_subtle`), bord rendu transparent, coche blanche (trait de 2 sur 14, arrondie, 12 px de côté dans la case) — Notak : fond et bord de la couleur du texte, coche blanche dessinée par bordures (`taches.css:71-86`).
- [ABSENT] Animation au cochage — Milanote : rebond d'échelle jusqu'à 0,8 à mi-course sur 150 ms ease-out ; flash de fond vert `#6AC374` de 0 à 50 % de 150 ms puis retour au gris ; coche tracée en 150 ms linéaire après 150 ms de délai ; liseré en 100 ms linéaire ; au décochage le fond revient en 100 ms après 50 ms de délai et la coche se retire en 100 ms ; aucune animation à l'affichage initial ni après un collage — Notak : `transform: scale(.8)` à l'appui seulement, fonds en 100 ms.
- [ABSENT] Aucun état de survol propre à la case chez Milanote (curseur main) — Notak : idem hors liste colorée.
- [DIFFÉRENT] Couleur de la case sur liste colorée — Milanote : inchangée (la liste n'a qu'une bande) — Notak : bord à 60 % de la couleur du texte (`taches.css:197-212`).
