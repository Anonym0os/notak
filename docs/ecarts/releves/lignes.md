# Écarts Notak / Milanote — famille « lignes » (ligne, flèche, ligne rapide, accrochage)

Sources lues : Milanote `client/element/line/*` (trait, marqueurs, étiquette, poignées, aperçus de glisser, sélecteurs,
utilitaires), `client/element/quickLine/*`, `client/element/connections/*`, `common/lines/*`, `common/maths/geometry/bezierUtil`,
outils de barre `selectionTools/lineTools|arrowTools|connectTool`, menus du clic droit, presse-papiers, glisser-déposer.
Notak : `packages/tableau/src/elements/ligne/*` (Ligne.tsx, LigneRapide.tsx, Outils.tsx, ligne.css, accroche.ts, rapide.ts,
creation.ts, raccourci.ts, couleur.ts, edition.ts), `coeur/lignes.ts`, `Toile.tsx`, `toile.css`, `langue.ts`.
Unités : 1 UG (unité de grille) = 10 px en grande grille (8 px petite, 9 px moyenne). 1 rem Milanote = 10 px.
Les valeurs de Milanote sont données à la grande grille (échelle 1). Ce qui n'a pas pu être confirmé à l'écran est marqué « (non vérifié à l'écran) ».

Déjà bon chez Notak (rappel, pour ne pas le refaire) : création 17×17 UG du bas-gauche au haut-droit, flèche à l'arrivée, rien au départ,
plein, épaisseur 2, choisie sans édition ; Cmd+K relie sans pointe (arbre couvrant minimal, sans doublon) ; ordre de la barre
Couleur, Début, Fin, Libellé, Pointillé, Épaisseur ; Maj = aimant à 45° ; longueur minimale des bouts libres selon les flèches ;
ancre de bord ; colonnes alignées ; zone de clic de 20 px ; lasso par le trait ; les lignes accrochées partent à la corbeille avec leur élément ;
les flèches du clavier ne déplacent pas une ligne ; ligne rapide au coin haut droit ; double-clic sur la poignée de courbe qui redresse.

---------------------------------------------------------------------------------------------------------------------------

## 1. LIGNE (trait)

### 1.1 Création
- [OK] Outil de barre : 17 × 17 UG, bas-gauche vers haut-droit, extrémité de départ « rien », d'arrivée « flèche », plein, épaisseur 2, choisie sans édition — Notak : `elements/ligne/creation.ts:5-20`, `index.tsx:22-43`.
- [OK] Par la barre en glissant : prise au centre du trait (8,5 UG, 8,5 UG), sélection seule — Notak : `index.tsx:36`.
- [OK] Clic droit sur le vide > « Ligne » crée une ligne libre sans édition — Notak : `Toile.tsx` entrées de création du menu.
- [OK] Cmd+K / entrée « Relier » (≥ 2 éléments libres) : lignes sans pointe, une par arête de l'arbre couvrant, pas de doublon, lignes non choisies — Notak : `raccourci.ts`, `coeur/lignes.ts:187`.
- [DIFFÉRENT] Position de départ d'une ligne libre posée par le menu du vide — Milanote : le trait est posé au point du clic (coin haut gauche du cadre englobant), 17 × 17 UG — Notak : arrondi à l'UG entière (`creation.ts:18`) ; pas de différence visible, noté pour mémoire.
- [DIFFÉRENT] Coller du texte avec UNE ligne choisie — Milanote : le texte (400 premiers caractères, tel quel, sans HTML) devient l'étiquette de la ligne, étiquette activée ; sans ligne choisie, le texte devient une note — Notak : le texte collé devient toujours une note (`elements/note/index.ts:81-90`, aucun récepteur ne regarde la sélection).
- [DIFFÉRENT] Copier / coller une ligne SEULE dont les bouts sont accrochés — Milanote : la ligne se copie seule, ses bouts gardent les éléments d'origine (correspondance d'identifiants seulement pour les éléments copiés avec elle) ; une ligne collée va toujours sur la toile (jamais dans les non triés) — Notak : une ligne n'est empaquetée que si TOUS ses bouts accrochés sont aussi copiés (`coeur/pressePapiers.ts:34-41`) ; copier une ligne accrochée seule ne copie rien (non vérifié à l'écran).
- [DIFFÉRENT] Coller le style (Cmd+Alt+V) entre deux lignes — Milanote : couleur, pointes de départ et d'arrivée, style de trait, épaisseur passent d'une ligne à l'autre ; d'une ligne vers un autre type, seules les couleurs passent — Notak : seule la couleur passe (`Toile.tsx:1108-1126`, `couleurDuContenu`).

### 1.2 Rendu au repos
- [DIFFÉRENT] Couleur par défaut — Milanote : #323b4a en thème clair, #cccccc en thème sombre (le gris « argent » #bbbec3 est un choix à part) — Notak : #4b5360 constant (`couleur.ts:4`), jamais inversé en sombre (la ligne par défaut reste foncée sur fond sombre).
- [OK] Les 11 teintes de la palette (gris #bbbec3, cyan #62dbc8, vert #7cd651, brun #d58558, jaune #ffd14d, orange #ff8d48, rouge #ff5757, rose #ff6ed4, violet #ad6fff, bleu #4ebafd, bleu profond #5882f8) — Notak : `elements/note/couleurs.ts`.
- [ABSENT] Couleur libre (« Couleur personnalisée… » : sélecteur natif, aperçu en direct, valeur hexadécimale ou autre espace) — Milanote : une ligne peut avoir n'importe quelle couleur — Notak : type `couleur?: CouleurNote`, 11 noms seulement (`coeur/tableau.ts:244`).
- [DIFFÉRENT] Épaisseur — Milanote : 1, 2 ou 4 px multipliés par (taille de grille / 10) : 0,8 / 1,6 / 3,2 px en petite grille — Notak : 1/2/4 px fixes, sans suivre la grille (`Ligne.tsx:282`).
- [OK] Tirets : motif 5 px plein / 5 px vide, non proportionnel à l'épaisseur — Notak : `Ligne.tsx:151-153`.
- [DIFFÉRENT] Bouts « rien » — Milanote : un petit rond posé au bout du trait (diamètre = épaisseur, ref 0,7), donc le bout est arrondi — Notak : bout plat (`strokeLinecap` « butt », `Ligne.tsx:284`).
- [DIFFÉRENT] Forme de la flèche — Milanote : triangle plein dont la base est aussi grande que la longueur : 8 × 8 px (épaisseur 1), 10 × 10 px (2), 13 × 13 px (4) ; la pointe dépasse de 1 × épaisseur au-delà du point d'arrivée ; le trait N'EST PAS raccourci, il passe sous la flèche — Notak : longueur 8/10/13 mais largeur 0,9 × longueur (`coeur/lignes.ts:166-171`), pointe exactement sur le bord, trait raccourci de 0,85 × taille (`Ligne.tsx:129-140`).
- [ABSENT] Pointe « rond » comme choix — Milanote : n'existe pas dans l'interface (la constante « point » est inutilisée) — Notak : EN TROP : pointes rondes de rayon taille/2 (`Ligne.tsx:170-183`) et deux entrées « Début rond / Fin rond » du menu « ••• » (`Outils.tsx:81-82`). À retirer ou masquer pour coller à Milanote.
- [ABSENT] Trait en points — Milanote : constante existante, aucun bouton ; l'outil « Pointillé » ne bascule que plein ↔ tirets — Notak : EN TROP : trait « points » (`Ligne.tsx:154-156`, `Outils.tsx:80`). Même remarque.
- [ABSENT] Trait fantôme — Milanote : quand la ligne est choisie (et pendant tout glisser), la partie du tracé cachée DANS les éléments reliés réapparaît en points très légers (points ronds espacés de 6 px, largeur 2, opacité 0,3, couleur de la ligne) à chaque bout accroché — Notak : rien ne se voit à l'intérieur des éléments (`Ligne.tsx`, `tracer`).
- [DIFFÉRENT] Marge au bord — Milanote : le trait s'arrête 1 px AVANT le bord de l'élément (rectangle élargi de 1 px) — Notak : exactement sur le bord (`coeur/lignes.ts:133`).
- [DIFFÉRENT] Boards — Milanote : une ligne reliée à un tableau (icône + titre) utilise DEUX rectangles (l'icône et le titre) et s'arrête au premier bord rencontré pour ne jamais traverser le titre — Notak : un seul rectangle par élément (`contexte.rect`) ; à vérifier sur un tableau (non vérifié à l'écran).
- [DIFFÉRENT] Colonnes alignées — Milanote : deux colonnes reliées dont les hauts diffèrent de moins de 3 UG se relient d'un trait horizontal à 3,2 UG sous le plus bas des deux hauts (seulement si aucun bout n'est ancré à un point précis) — Notak : seuil 4 UG et hauteur 2,3 UG (`coeur/lignes.ts:280-282`).
- [ABSENT] Longueur minimale affichée — Milanote : si le trait visible entre les deux éléments est plus court que 1,5 UG (deux flèches), 1 UG (une flèche) ou 1 px (aucune), la ligne entière est masquée ; une ligne dont la courbe est entièrement cachée dans un élément est masquée aussi — Notak : pas de seuil pour les lignes accrochées (seulement `tracer` nul si rien ne dépasse, `Ligne.tsx:143`).
- [DIFFÉRENT] Rendu pendant qu'on glisse une extrémité — Milanote : la ligne d'origine est masquée, un aperçu la remplace ; l'extrémité tenue suit le curseur exactement ; l'élément survolé reçoit un contour (voir 2.3) — Notak : la ligne se met à jour en direct et s'accroche déjà au centre de l'élément survolé (`Ligne.tsx:246-249`).
- [DIFFÉRENT] Empilement — Milanote : une ligne est un élément comme un autre dans l'ordre des plans (elle peut passer derrière une carte par « Mettre à l'arrière-plan », sauf si l'un de ses bouts est accroché) ; une ligne neuve est tout en haut — Notak : toutes les lignes sont dans un seul calque SVG au-dessus de toutes les cartes (`Toile.tsx:2251`) ; « Mettre à l'arrière-plan » ne change rien pour une ligne.

### 1.3 États
- [DIFFÉRENT] Choisie — Milanote : AUCUN halo, AUCUN contour ; seulement les trois poignées blanches (début, fin, courbe) et le trait fantôme — Notak : halo de 8 px, bleu accent, opacité 0,22, bouts ronds, tout le long (`ligne.css:11-17`, `Ligne.tsx:277`).
- [DIFFÉRENT] Poignées de bout — Milanote : disque de 8 px de diamètre, fond blanc (#ffffff), contour noir à 8 % de 0,5 px, ombre légère (0 1 px 2 px, rgba(27,37,54,0,1)) ; zone de prise invisible de 30 × 30 px (40 × 40 sur tablette), curseur « déplacer » — Notak : anneau de rayon 6,5 px (13 px de diamètre), contour bleu accent 2 px, fond de la carte, cœur plein de 2,5 px, prise de rayon 11 px, curseur « grab » (`Ligne.tsx:342-357`, `ligne.css:70-112`).
- [ABSENT] Taille constante au zoom — Milanote : les poignées (et la pastille de ligne rapide, et les guides d'accroche) gardent leur taille à l'écran quel que soit le zoom (échelle inverse) — Notak : tout est dans le plan zoomé, les poignées grossissent et rapetissent avec le zoom.
- [DIFFÉRENT] Poignée de bout accrochée — Milanote : disque rempli de la couleur de la ligne avec un contour blanc de 1,5 px (on voit tout de suite qu'un bout tient à un élément) — Notak : même aspect que libre.
- [DIFFÉRENT] Survol d'une poignée — Milanote : aucun effet de survol ; en revanche, pendant le glisser en « mode dedans » (voir 2.3) la poignée tenue est entourée d'une bague de 7 px de large (rgba(0,0,0,0,06)) qui apparaît en 100 ms (ease-out) — Notak : l'anneau s'agrandit de 6,5 à 8 px en 120 ms au simple survol (`ligne.css:79-99`).
- [ABSENT] Poignée de bout quand le point d'ancrage tombe sur un repère — Milanote : la poignée devient invisible (contour 0, pas de fond) quand elle est sur un repère d'accroche et que le disque-guide est affiché à sa place — Notak : n'existe pas.
- [ABSENT] Verrouillée — Milanote : une ligne verrouillée choisie montre ses trois poignées en gris (#bbbec3 en clair) qui ne se prennent pas ; ni courbure, ni déplacement de bout — Notak : aucune lecture de `verrou` dans `elements/ligne/` : une ligne verrouillée se remodèle quand même (`Ligne.tsx:205-262`).
- [ABSENT] Lecture seule — Milanote : poignées inertes (le geste ne part pas) — Notak : aucune lecture de `lectureSeule` dans la ligne ; les poignées répondent (`Ligne.tsx`) (non vérifié à l'écran : la barre masque peut-être l'outil, pas les poignées).
- [DIFFÉRENT] Survol du trait — Milanote : pas d'effet ; seul le trait de 20 px est actif et permet de glisser la ligne entière (voir 2.4) — Notak : curseur « pointer » sur le trait (`ligne.css:20-24`).
- [ABSENT] Sélection à distance (collaborateur) — Milanote : étiquette du collaborateur près du point de contrôle (à gauche de 14 px) et libellé coloré à sa couleur — Notak : pas de présence sur les lignes.
- [ABSENT] Masquage en présentation — Milanote : en présentation avec « masquer les commentaires », une ligne reliée à un commentaire disparaît — Notak : non géré.

### 1.4 Barre d'outils de la ligne choisie
- [OK] Ordre : Couleur, Début, Fin, Libellé, Pointillé, Épaisseur, (Aligner, Répartir si ≥ 2), « ••• » — Notak : `Outils.tsx:55-83`.
- [OK] Couleur : palette des 11 teintes + défaut — Notak : `Outils.tsx:57-64`. Voir 1.2 pour la couleur libre.
- [DIFFÉRENT] Début / Fin (« Start » / « End », « Début » / « Fin ») — Milanote : bascule flèche ↔ rien, état allumé si la PREMIÈRE ligne choisie a la flèche ; icônes `flèche gauche` (début) et `flèche droite` (fin) — Notak : bascule aussi, mais l'état « allumé » exige que TOUTES les lignes aient la flèche (`Outils.tsx:30,33`). Écart seulement en sélection mixte.
- [DIFFÉRENT] Libellé (« Label », « Libellé ») — Milanote : tuile allumée si la ligne est en édition OU si elle a un libellé activé non vide ; un clic quand elle est allumée MASQUE le libellé (le texte est gardé, l'étiquette est désactivée, l'édition s'arrête) ; un clic quand elle est éteinte ouvre l'édition avec le mot d'attente sélectionné — Notak : le clic ouvre toujours l'édition (`Outils.tsx:68`), on ne masque jamais un libellé ; vider le champ supprime le texte (`Ligne.tsx:302-304`).
- [OK] Libellé absent en sélection multiple — Notak : `elements.length === 1` (`Outils.tsx:67`).
- [OK] Pointillé (« Dashed », « Pointillé ») — bascule plein ↔ tirets (allumé = tirets).
- [DIFFÉRENT] Épaisseur (« Weight », « Épaisseur ») — Milanote : popup de trois icônes (1 px, 2 px, 4 px) en ligne, l'icône de l'épaisseur courante allumée ; le popup SE FERME au choix ; l'icône de la tuile ne change pas — Notak : menu de trois boutons avec un trait de l'épaisseur (`Outils.tsx:71-79`) ; fermeture au choix à vérifier (non vérifié à l'écran). Voir le relevé de la barre pour la forme du popup.
- [ABSENT] Aligner / Répartir une ligne — Milanote : une ligne LIBRE (aucun bout accroché) s'aligne et se répartit comme les autres éléments (mesure par la boîte du trait) ; une ligne accrochée est ignorée — Notak : toute ligne est ignorée (`elements/arrangement/disposables.ts:10`).
- [OK] « Relier » absent de la ligne seule, présent à partir de 2 éléments non-lignes — Notak : `entreeRelier.visible`.
- [OK] Mobile : épaisseur dans une feuille basse (hors périmètre de Notak pour l'instant).

### 1.5 Menu du clic droit (ligne)
- Milanote, dans l'ordre, séparateurs entre groupes : [Couper, Copier, « Coller les styles » (si compatible), Dupliquer, Supprimer] — [Verrouiller la position] — [Mettre au premier plan, Mettre à l'arrière-plan] — [pied : créée par / modifiée par]. « Mettre à l'arrière-plan » est absent quand un bout au moins est accroché ; « Relier avec des lignes » absent (pas de ligne dans le choix) ; pas de « Grouper en colonne » ; pas d'« Ajouter aux non triés ».
- [DIFFÉRENT] Entrées de Notak pour une ligne (`Toile.tsx:1188-1213`) : Couper, Copier, Coller, Dupliquer, (Relier si ≥ 2 autres), Verrouiller (case), Premier plan, Arrière-plan, Coller le style, « Mettre aux non triés » (⌥`, n'a aucun effet sur une ligne), Corbeille. EN TROP : « Mettre aux non triés » ; l'arrière-plan reste proposé même accrochée ; manque la ligne d'information (auteur, date).
- [OK] Verrouiller : bascule ; Dupliquer : Cmd+D.

### 1.6 Gestes sur le trait
- [ABSENT] Glisser le trait — Milanote : on prend la ligne par son trait (zone de 20 px) et on la déplace en bloc, avec l'animation des éléments (sans inclinaison 3D) ; les lignes dont un bout est accroché restent accrochées — Notak : le trait ne se glisse pas, `mobile()` exclut les lignes (`Toile.tsx:271,1587`) (non vérifié à l'écran pour une ligne accrochée).
- [DIFFÉRENT] Double-clic sur le trait ou sur le libellé — Milanote : redresse la ligne (courbe effacée), sans propagation — Notak : rien (`Toile.tsx:2124-2128`, ligne non éditable) ; seul le double-clic sur la poignée de courbe redresse (`Ligne.tsx:329`).
- [ABSENT] Frappe d'un caractère sur la ligne choisie — Milanote : toute touche qui est un caractère (chiffres, lettres, symboles ; pas Entrée, Espace, Tab, Retour arrière, flèches, Échap, ni avec Cmd) ouvre l'édition du libellé et la touche est insérée (le mot d'attente est remplacé) — Notak : rien.
- [OK] Entrée sur une ligne choisie : rien (Entrée ne démarre pas l'édition) — Notak : ligne non éditable.
- [OK] Flèches : ne déplacent pas une ligne — Notak : `libre()` filtre les lignes (`Toile.tsx:275,1280`).
- [OK] Suppr / Retour arrière : corbeille — Notak : `jeter`.
- [DIFFÉRENT] Suppression d'un élément relié — Milanote : les lignes reliées sont supprimées avec lui, et aussi quand l'élément est envoyé dans les non triés, ou dans un autre tableau (sauf si la ligne part avec) — Notak : emportées à la corbeille mais PAS dans les non triés (`Toile.tsx:656,665`) ; la ligne reste dans les données, invisible tant que l'élément est ailleurs, et réapparaît à son retour.
- [OK] Retour arrière / annuler : un geste d'extrémité est un seul pas d'historique — Notak : `Ligne.tsx:251-262`.

---------------------------------------------------------------------------------------------------------------------------

## 2. EXTRÉMITÉS, COURBE ET ACCROCHAGE

### 2.1 Extrémités libres
- [DIFFÉRENT] Position d'un bout libre — Milanote : posée exactement où est le curseur, en UG arrondies à 0,01 (aucun aimant de grille) — Notak : arrondie à l'UG entière (`aimanter`, `Ligne.tsx:242`) ; avec Maj, au demi-cran.
- [ABSENT] Aimant automatique à l'horizontale / verticale — Milanote : sans Maj, si l'autre bout est libre, qu'aucun élément n'est survolé et qu'il n'y a pas de courbe : quand l'écart vertical est inférieur à 10 px et que la pente est inférieure à 1/30 (environ 1,9°), le bout se cale à l'horizontale ; symétriquement pour la verticale — Notak : rien (l'arrondi à l'UG fait un effet voisin, mais sur la grille et pas par la pente).
- [OK] Maj pendant le tirage : le trait se cale au multiple de 45° le plus proche (horizontal, vertical, diagonales), depuis l'autre bout tel qu'on le voit — Notak : `aimanterAngle` (`coeur/lignes.ts:220-228`).
- [DIFFÉRENT] Longueur minimale à la pose — Milanote : à la fin du tirage d'un bout, si la distance entre les deux points stockés est inférieure à 4 UG, le bout est repoussé à 4 UG de l'autre (même direction) ; en plus, l'affichage masque la ligne trop courte (1.2) — Notak : 1,5 / 1 / 0,1 UG selon les flèches (`coeur/lignes.ts:231-234`), appliqué pendant le tirage.
- [OK] Bout dans le même élément que l'autre bout : refusé — Notak : `Ligne.tsx:232-234`.
- [OK] Retour au vide : un bout lâché hors élément devient libre — Notak : `Ligne.tsx:248`.
- [DIFFÉRENT] Prise du curseur — Milanote : le bout est recentré sous le curseur dès le début du glisser (la poignée se glisse sous le pointeur, quel que soit le point saisi dans la zone de 30 px) — Notak : le bout est posé au point du curseur (`pointeur(e)`) : même résultat ; noté OK.
- [OK] Défilement automatique au bord pendant le tirage — Notak : géré par le geste général (à vérifier : le geste de la ligne utilise la capture locale, `Ligne.tsx:205-209`, donc probablement non géré) (non vérifié à l'écran).

### 2.2 Courbe
- [DIFFÉRENT] Nature de la poignée de courbe — Milanote : la poignée est SUR le trait : la courbe est une quadratique qui passe par le point de contrôle (au milieu de la courbe, t = 0,5) ; le vrai point de contrôle de la quadratique est calculé à partir de lui — Notak : le point de contrôle est le vrai point de contrôle de la quadratique (`coeur/lignes.ts:28-36`, `Ligne.tsx:149`) : la poignée flotte à côté du trait, et la courbure visible vaut la moitié de l'écart. Visuellement, une ligne tirée de 40 px ne se courbe que de 20 px.
- [DIFFÉRENT] Position de la poignée au repos — Milanote : milieu du trait visible (entre les deux intersections), qui se déplace quand on change les éléments — Notak : milieu de `trace.milieu` (même idée) mais pour une courbe, c'est le point de contrôle de la quadratique.
- [DIFFÉRENT] Seuil de redressement — Milanote : dans les 20 px autour du milieu du trait visible (entre les points d'intersection avec les éléments), pendant le glisser, la courbe disparaît (ligne droite) ; au lâcher, si le point est à moins de 0,1 px du milieu, plus de courbe stockée — Notak : 2 UG autour du milieu de la corde entre les CENTRES, pas du trait visible (`coeur/lignes.ts:14,35,45`).
- [OK] Double-clic sur la poignée de courbe : redresse — Notak : `Ligne.tsx:263-267,329`.
- [DIFFÉRENT] Cadre de stockage — Milanote : décalage perpendiculaire en pixels de grande grille (mis à l'échelle de la grille courante) et position le long de la corde 0..1 (0,5 par défaut) ; la corde va d'un centre à l'autre — Notak : décalage en UG et position 0..1 (`Ligne` : `courbe {ecart, position}`) ; équivalent, sauf pour la grille variable.
- [ABSENT] Quand la ligne a un libellé — Milanote : la poignée de courbe est MASQUÉE, c'est le libellé lui-même qu'on tire (curseur « déplacer ») ; également masquée pendant l'édition du libellé — Notak : la poignée reste affichée par-dessus le libellé (`Ligne.tsx:321-333`).
- [ABSENT] Aperçu pendant le tirage de la courbe — Milanote : la ligne d'origine disparaît pendant le geste, un aperçu la remplace (poignée en mode « tirée », trait fantôme visible) — Notak : mise à jour en direct de la ligne réelle (même effet à l'œil, pas d'état « tiré » de la poignée).
- [DIFFÉRENT] Coupe de la courbe à l'accrochage — Milanote : quand un bout est lâché sur un élément (en mode dedans, pas au centre), la courbe est recalculée pour garder exactement la même forme visible (nouvelle poignée, nouvel arc) — Notak : la courbe stockée est relative à la corde, donc la forme change (`Ligne.tsx:246-249`) (non vérifié à l'écran).

### 2.3 Accrochage à un élément (tirage d'une extrémité)
- [DIFFÉRENT] Règle par défaut — Milanote : lâcher un bout n'importe où sur un élément (toile ou colonne) l'accroche au CENTRE (la ligne vise le centre et s'arrête à 1 px du bord) ; l'accroche à un point précis n'existe que dans le « mode dedans » ci-dessous — Notak : lâché sur le bord (à 1 UG), le bout s'accroche au point précis, ailleurs au centre (`coeur/lignes.ts:301-304`, `Ligne.tsx:243-249`).
- [ABSENT] Mode « connecter dedans » — Milanote : en tenant un bout immobile ~0,5 s (délai de 500 ms, relancé à chaque mouvement de plus de 0 px, échantillonné toutes les 20 ms) au-dessus d'un élément qui n'est ni verrouillé ni en vue icône (board, document, fichier en icône), le mode s'active : une marge de dépôt de 40 px (4 rem) est ajoutée autour de l'élément, son contour passe au gris (#bbbec3), son ombre disparaît, et le bout se pose au point exact (pas au centre) ; il se colle au rectangle de l'élément ; la ligne est alors « fixe » et le trait part vraiment de ce point — Notak : rien de tel.
- [ABSENT] Guides d'accroche — Milanote : en mode dedans, 8 repères (4 milieux de côté, 4 coins) ; chacun est un disque blanc de 8 px avec un anneau gris de 2 px (#bbbec3), invisible par défaut ; il s'allume (opacité 0 → 1, 100 ms, ease-out) quand le curseur entre dans une zone de 30 % de la largeur et de la hauteur autour du repère ; si le curseur est à moins de 1 UG d'un repère le bout est aimanté dessus (la poignée disparaît pour laisser le guide) — Notak : aucun guide ; seul un collage au bord à moins de 1 UG et aux repères à moins de 1,5 UG (`coeur/lignes.ts:251-275`).
- [ABSENT] Surbrillance de la cible — Milanote : tant qu'un bout est au-dessus d'un élément (hors l'élément déjà relié par l'autre bout), cet élément prend un contour foncé (#323b4a en clair) ; les boards prennent un contour de sélection sur leur icône ; un élément verrouillé ou dans lequel l'autre bout est un enfant (colonne) ne s'allume pas — Notak : aucun retour sur la cible.
- [DIFFÉRENT] Valeur stockée du point précis — Milanote : « 0 % », « 50 % », « 100 % » dans les 5 px (la moitié de l'UG) des bords et du centre ; sinon une distance en UG depuis le coin haut gauche (2 décimales) ; pour une image, un pourcentage — Notak : fraction 0..1 de l'élément, collée aux bords à 1 UG et aux repères à 1,5 UG (`ancreSous`) ; plus grossier (un point intérieur n'est jamais retenu : `ancreDeposee` ne garde que les bords).
- [OK] Le point précis suit l'élément quand il change de taille — Notak : fraction (`pointAncre`).
- [DIFFÉRENT] Verrouillé — Milanote : un élément verrouillé refuse l'accroche (le bout se pose dans le vide au lieu de l'élément, sauf si la ligne est déjà reliée à lui) — Notak : accepte l'accroche à un élément verrouillé (`accroche.ts` ne regarde pas `verrou`) (non vérifié à l'écran).
- [DIFFÉRENT] Colonnes — Milanote : le bout ne s'accroche pas à une colonne qui contient le début de la ligne ; lâcher une ligne sur une colonne la relie à la colonne (centre de son cadre, ou titre si alignement) — Notak : refus seulement du bout dont l'autre bout est dans le même élément.
- [ABSENT] Son — Milanote : un son « raccord » (LineConnect) quand un bout est lâché sur un élément, un son de dépose sinon, un son de prise au départ d'une ligne rapide (volume 0,07) — Notak : aucun son (aucun système de sons).

### 2.4 Ligne entière
- [ABSENT] Déplacer toute la ligne en glissant son trait (voir 1.6).
- [OK] Les bouts accrochés suivent l'élément qu'on glisse en direct — Notak : `suivreLesVols`.
- [OK] Redimensionnement en groupe : une ligne s'éloigne en proportion — Notak : `Toile.tsx:107-119`.

---------------------------------------------------------------------------------------------------------------------------

## 3. LIBELLÉ DE LA LIGNE

### 3.1 Rendu au repos
- [DIFFÉRENT] Position — Milanote : centré (translation -50 %, -50 %) sur le point de contrôle (qui est SUR la courbe) ; z-index 2 — Notak : centré sur le point de contrôle de la quadratique (`Ligne.tsx:150,273,290-295`), donc à côté du trait quand la ligne est courbée.
- [DIFFÉRENT] Boîte — Milanote : fond = couleur de la ligne (opaque), padding 2 px verticalement et 3 px horizontalement + 2 px de plus de chaque côté du texte (soit 5 px horizontalement, 2 px verticalement), rayon 4 px, largeur de contenu max 150 px (15 rem), le texte passe à la ligne — Notak : padding 2 px / 8 px, rayon 4 px, largeur max 280 px (`ligne.css:39-53`).
- [DIFFÉRENT] Police — Milanote : 12 px (1,2 rem), graisse 600, interligne 1,3, texte centré ; 11 px / 14 px de ligne en taille d'appli moyenne et 10 px / 13 px en petite — Notak : 12 px, 600, interligne 1,35, jamais réduit (`ligne.css:44-46`).
- [DIFFÉRENT] Couleur du texte — Milanote : ligne grise (#bbbec3) : texte de la couleur principale de l'interface ; sinon texte noir à 76 % ou blanc à 95 % selon le contraste avec la couleur (couleur par défaut de la ligne : blanc) — Notak : blanc #ffffff ou #323b4a pur selon le contraste (`couleurTexteSur`, `Ligne.tsx:313`).
- [OK] Étiquette montrée si activée ET non vide, ou en édition — Notak : `Ligne.tsx:289`.
- [DIFFÉRENT] Mot d'attente — Milanote : le libellé vide en édition montre « Label » (« Libellé ») sélectionné, remplacé à la frappe (texte exact du fichier de langues non relu : probable « Label ») — Notak : champ vide, sélectionné (`Ligne.tsx:373`) ; aucune valeur d'attente affichée.
- [ABSENT] Texte multi-ligne — Milanote : Maj+Entrée insère un saut de ligne dans le libellé — Notak : champ `input` mono-ligne, 400 caractères (`Ligne.tsx:385-401`).

### 3.2 Édition
- [DIFFÉRENT] Entrée dans l'édition — Milanote : clic sur le libellé d'une ligne DÉJÀ choisie ; ou tuile Libellé ; ou frappe d'un caractère (1.6) ; tout le texte est sélectionné ; les caractères tapés avant que le champ soit prêt sont repris — Notak : tuile Libellé seulement ; le clic sur le libellé ne fait que choisir.
- [DIFFÉRENT] Aspect pendant l'édition — Milanote : le libellé garde sa position et sa taille, fond blanc (couleur d'interface primaire), texte de l'interface, curseur texte, la bague de sélection disparaît — Notak : champ de 220 × 26 px, bordure bleue accent 2 px, fond = couleur de la ligne (`ligne.css:55-68`).
- [DIFFÉRENT] Fin de l'édition — Milanote : Entrée valide ET désélectionne la ligne ; Maj / Alt / Cmd + Entrée, ou Échap, valident et gardent la ligne choisie ; Retour arrière sur un champ vide : sort de l'édition ; le clic ailleurs valide ; le texte vide désactive l'étiquette (le texte précédent est gardé) — Notak : Entrée ou Échap valident, rendent la main à la toile, ligne restée choisie ; un texte vide supprime le libellé (`Ligne.tsx:296-306,395-400`).
- [OK] Les raccourcis de texte gras / italique sont inactifs dans le libellé — Notak : champ `input` sans mise en forme.
- [OK] Collage de texte : insère en texte brut — Notak : `input`.
- [ABSENT] Recherche — Milanote : le libellé s'illumine comme les autres textes (surbrillance « recherche ») — Notak : `coeur/recherche.ts` indexe le libellé, mais pas de surbrillance sur le libellé (non vérifié à l'écran).

### 3.3 Gestes sur le libellé
- [ABSENT] Tirer le libellé — Milanote : on le prend (sauf en édition, lecture seule ou ligne tenue par un collaborateur) et il déplace le point de contrôle, comme la poignée (curseur « déplacer ») — Notak : le libellé a `data-id` et sélectionne seulement.
- [DIFFÉRENT] Double-clic sur le libellé — Milanote : redresse la ligne — Notak : rien.

---------------------------------------------------------------------------------------------------------------------------

## 4. LIGNE RAPIDE (outil au coin d'un élément)

### 4.1 Où et quand
- [OK] Sur un élément seul choisi, sur la toile ou dans une colonne, modifiable — Milanote : `isSingleSelected` + toile ou colonne + éditable ; types concernés : note, lien, tâches, colonne, tableau (icône), image, fichier, document, croquis, nuancier, table, commentaire déplié — Notak : `LigneRapide.tsx:36`, tous les types non-ligne ; pas dans les colonnes (à vérifier : Notak limite-t-il à la toile ?).
- [ABSENT] Disparition — Milanote : masquée en présentation (focus) ; pas affichée sur les lignes, les commentaires repliés ni les annotations — Notak : même règle pour les lignes seulement.
- [DIFFÉRENT] Position — Milanote : zone de prise de 30 × 30 px centrée sur le coin haut droit de l'élément (décalée du demi-bord) ; pastille visible de 16 px ; échelle inverse du zoom — Notak : pastille de 22 px posée AU-DESSUS du coin (décalage -22 px vertical, +2 px horizontal), sans échelle inverse (`ligne.css:154-173`).

### 4.2 Rendu
- [DIFFÉRENT] Au repos — Milanote : petit point (le disque de 16 px est réduit à l'échelle 0,5 = 8 px), fond blanc, ombre légère, contour noir à 8 % ; flèche cachée — Notak : disque de 22 px visible en permanence, opacité 0,85, contour noir à 12 %, ombre 0 1 px 4 px, icône de ligne de 13 px (`ligne.css:154-173`, `LigneRapide.tsx:114`).
- [DIFFÉRENT] Au survol — Milanote : le point grossit à l'échelle 1 (16 px) en 100 ms (ease-out), le contour disparaît, une petite flèche (10 × 14 px) glisse en place en 100 ms (opacité 30 ms) à l'intérieur du disque ; le curseur reste « défaut » ; infobulle « Drag me » à droite, 1,2 s, apparaît au survol ou au clic, distance 12 px, décalage 2 px — Notak : le disque passe à l'échelle 1,12 et opacité 1 en 100 ms ; curseur « crosshair » ; infobulle native « Glisser pour tirer une ligne » (`title`).
- [ABSENT] Pendant le tirage — Milanote : la pastille s'efface (opacité 0), l'élément d'origine est désélectionné (sauf sur iOS) ; l'aperçu est une vraie ligne (couleur par défaut, épaisseur 2, flèche à la fin), avec trait fantôme, guides d'accroche et mode dedans ; départ accroché au centre de l'élément — Notak : le disque grossit et reste ; l'élément reste choisi ; aperçu = un trait gris foncé et une flèche (`LigneRapide.tsx:116-121`).
- [ABSENT] Mode dedans pendant la ligne rapide — Milanote : même mécanisme de 500 ms (2.3) pour un point précis ; l'accroche d'une ligne rapide est sinon au centre — Notak : bord = précis (comme 2.3).

### 4.3 Résultat
- [OK] Au lâcher, la ligne naît de l'élément (départ accroché) jusqu'au point lâché ; Échap abandonne ; un simple clic ne crée rien ; lâcher sur l'élément d'origine ne crée rien — Notak : `LigneRapide.tsx:67-97`, `rapide.ts`.
- [DIFFÉRENT] Sélection du résultat — Milanote : la ligne est choisie, sauf si départ et arrivée sont deux colonnes (rien n'est alors choisi) — Notak : toujours choisie (`LigneRapide.tsx:83-86`).
- [DIFFÉRENT] Bout libre lâché — Milanote : position exacte du curseur, Maj = 45° — Notak : arrondi à l'UG (au demi-cran avec Maj).
- [ABSENT] Sons et retour haptique — Milanote : prise (« CardPickup ») au départ, « LineConnect » à l'accroche, « CardDrop » dans le vide ; haptique moyen au début sur mobile — Notak : rien.
- [ABSENT] iPad — Milanote : sur tablette, la zone fait 40 px, la pastille est déjà à l'échelle 1 et la flèche déjà visible — Notak : pas de variante tablette.

---------------------------------------------------------------------------------------------------------------------------

## 5. ANIMATIONS ET DÉLAIS
- [OK] Aucune animation sur le trait lui-même (apparition, couleur) — Milanote et Notak.
- [DIFFÉRENT] Poignées — Milanote : bague de 100 ms (délai 200 ms hors mode dedans, 0 en mode dedans) ; Notak : anneau 120 ms au survol.
- [DIFFÉRENT] Pastille de ligne rapide — Milanote : translation et échelle 100 ms ease-out ; flèche 100 ms ; opacité de la flèche 30 ms linéaire ; Notak : opacité et échelle 100 ms (sans courbe), pas de flèche.
- [ABSENT] Guides d'accroche : opacité 100 ms ease-out ; mode dedans après 500 ms — Notak : aucun.
- [OK] Aucune inclinaison 3D d'une ligne glissée — Notak : `reglageVol` exclut les lignes.

---------------------------------------------------------------------------------------------------------------------------

## 6. COMMENTAIRES, RÉACTIONS, ÉTIQUETTES, COULEUR
- [OK] Une ligne ne porte ni commentaire, ni réaction, ni étiquette de couleur, ni légende ; pas de tuile « Commentaire » ni « Réaction » — Milanote : liste d'outils de la ligne sans ces tuiles — Notak : idem.
- [OK] Couleur : appliquée à toutes les lignes choisies, un seul pas d'historique — Notak : `Outils.tsx:21-29`.
- [DIFFÉRENT] Couleur du libellé / thème sombre — Milanote : pour la couleur « gris », le texte du libellé suit le thème ; le défaut de la ligne s'inverse (#cccccc) — Notak : constante.

---------------------------------------------------------------------------------------------------------------------------

## TOP 15 des écarts les plus visibles

1. **Poignées d'une ligne choisie** : Milanote = trois disques blancs de 8 px, de taille constante au zoom, sans halo ; Notak = anneaux bleus de 13 px + halo de 8 px sur tout le trait, qui grossissent avec le zoom (`ligne.css:11-112`, `Ligne.tsx:277,342`).
2. **Forme de la courbe** : Milanote tire une courbe qui passe PAR la poignée, Notak une courbe qui la longe (moitié de courbure) ; le libellé est posé sur la poignée dans les deux, donc flotte hors du trait chez Notak (`coeur/lignes.ts:28-36`).
3. **Libellé** : largeur max 150 px, padding 2 × 5 px, interligne 1,3, texte noir 76 % / blanc 95 %, édition en place fond blanc, multiligne ; Notak = 280 px, 2 × 8, champ bleu de 220 px mono-ligne (`ligne.css:39-68`).
4. **Libellé : gestes** — clic sur le libellé choisi, frappe d'un caractère, glisser le libellé (déplace la courbe), double-clic (redresse), tuile Libellé qui MASQUE un libellé existant, Entrée qui désélectionne, texte collé sur une ligne choisie : tout est absent chez Notak (`Outils.tsx:68`, `Toile.tsx:2124`).
5. **Accrochage** : Milanote = centre par défaut, point précis seulement après 500 ms de survol immobile (mode dedans) avec 8 guides de 8 px, marge de dépôt de 40 px et contour gris sur la cible ; Notak = point précis dès qu'on lâche au bord, rien sur la cible (`Ligne.tsx:243-249`, `coeur/lignes.ts:301`).
6. **Surbrillance de la cible** pendant le tirage (contour foncé #323b4a) et ligne qui ne s'accroche qu'au lâcher : absentes chez Notak, qui accroche en direct.
7. **Bouts libres posés sur la grille entière** chez Notak, à 0,01 UG chez Milanote ; aimant automatique horizontal / vertical (pente < 1/30 et < 10 px) absent (`Ligne.tsx:242`).
8. **Ligne rapide** : point de 8 px qui grossit à 16 px avec flèche, centré sur le coin, infobulle « Drag me », s'efface pendant le tirage ; Notak = disque permanent de 22 px posé au-dessus du coin, qui reste (`ligne.css:154-179`).
9. **Glisser le trait** pour déplacer toute la ligne : absent chez Notak (`Toile.tsx:271`).
10. **Couleur par défaut** #323b4a (clair) / #cccccc (sombre) contre #4b5360 fixe ; couleur libre absente (`couleur.ts:4`, `coeur/tableau.ts:244`).
11. **Trait fantôme** dans les éléments reliés (points légers, quand la ligne est choisie ou tirée) : absent.
12. **Ligne verrouillée ou en lecture seule** : Milanote grise les poignées et les rend inertes ; Notak laisse tout modifier (`Ligne.tsx:205`).
13. **Longueur minimale** : 4 UG à la pose, masquage sous 1,5 / 1 UG / 1 px ; Notak 0,1–1,5 UG sur les bouts libres seulement.
14. **Extras de Notak à retirer** : pointes rondes (rond de rayon taille/2, entrées « Début rond / Fin rond »), trait en points ; et bouts « rien » plats au lieu d'arrondis, flèche plus étroite (0,9) et trait raccourci sous la flèche (`Ligne.tsx:130-186`, `Outils.tsx:80-82`).
15. **Empilement et arrangement** : les lignes sont toujours au-dessus des cartes, ne se placent jamais derrière ; une ligne libre ne s'aligne ni ne se répartit ; menu avec « non triés » inutile (`Toile.tsx:2251`, `arrangement/disposables.ts:10`, `Toile.tsx:1211`).
