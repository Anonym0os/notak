# Écart Notak / Milanote : ce qui est commun à tous les éléments

Relevé du 23/10/2026, en lecture seule, d'après le code décompilé de Milanote (`client/element/` : Element, ElementContainer,
resizing, selection, dnd, duplicate, actions, modal, elementPlaceholder, elementVisibility, suggestion, activity ;
`client/workspace/` : contextMenu, shortcuts, toolbar ; `common/colors`, `common/elements`) et du code de Notak au commit
`131bd90` (`packages/tableau/src/`). Rien n'est recopié : valeurs, noms de données et libellés courts seulement.

**Avertissement sur l'existant.** `docs/ecarts/{toile,elements,habillage,creation}.md` et `docs/ecarts/RESTE.md` sont en
grande partie périmés : le glisser au pixel, l'inclinaison, la dépose animée, Échap qui annule, Alt+glisser, la colonne
au clavier, les collisions, le redimensionnement de groupe, les proportions des médias, l'entrée dans un tableau au
survol, le lasso par le trait, Cmd+A dans la colonne, l'aligner/répartir par valeur commune, la barre de couleur, la
couleur libre, le verrou visible, le zoom lissé, les bornes du document sont aujourd'hui dans Notak (vérifié dans
`Toile.tsx`, `coeur/*`). Ces points ne sont donc pas répétés ici, sauf quand un détail reste faux. Les chemins Notak sont
relatifs à `packages/tableau/src/`. UG = unité de grille (10 px à la taille « large », 9 ou 8 sinon).

Légende : `OK` identique · `DIFFÉRENT` existe mais autrement · `ABSENT` n'existe pas dans Notak. Un point « à confirmer à
l'écran » signale une déduction faite sur les valeurs de code, non vue à l'écran.

---

## A. Cadre commun d'un élément (rendu au repos et états)

### A1. Repos
- [OK] Fond blanc (carte), coins carrés (rayon 0) pour note, colonne, lien, image — Milanote : rayon 0 partout — Notak : `toile.css:85`, `elements/colonne/colonne.css:19`, `elements/lien/lien.css:4`.
- [OK] Ombre de repos : un trait de 2 px à 10 % bleu-gris (27,37,54) plus un anneau de 1 px de la couleur du canevas — Milanote : variante « contraste » posée sur note, colonne, croquis, document, tâches, tableau, lien (sans média) — Notak : `toile.css:18`.
- [DIFFÉRENT] Élément à fond de couleur : Milanote retire l'anneau de 1 px autour d'un élément coloré (il ne garde que le trait d'ombre) ; Notak garde l'anneau sur tous (`toile.css:18`, `:87`). Effet visible seulement quand deux éléments se recouvrent.
- [OK] Couleur du texte sur un fond coloré : blanc ou gris-bleu foncé #323b4a selon le contraste, seuil sur #3d4554 — Notak : `elements/note/couleurs.ts:42-50`.
- [DIFFÉRENT] Tons secondaires sur fond coloré : Milanote décline tout (texte secondaire noir 50 % ou blanc 60 %, tertiaire 40 % ou 50 %, lien noir ou blanc, case faite 30 % ou 40 %, indication 20 % ou 30 %, texte « gris » 40 % ou 50 %) ; Notak ne change que la couleur du texte principal, l'indication d'attente reste #d1d3d6 (`toile.css:29`, `elements/note/note.css:293`).
- [OK] Palette de fonds et de barres : gris #bbbec3, cyan #62dbc8, vert #7cd651, brun #d58558, jaune #ffd14d, orange #ff8d48, rouge #ff5757, rose #ff6ed4, violet #ad6fff, bleu #4ebafd, bleu profond #5882f8 — Notak : `elements/note/couleurs.ts:11-24`, `note.css:3-13`.
- [DIFFÉRENT] Palette de colonne : Milanote en a une à part, plus claire (variantes « 900 ») : gris #dcdcdc, cyan #7be6d5, vert #92e36b, jaune #ffd96a, orange #ffa954, rouge #ff7171, rose #ff8add, violet #bf8eff, bleu #6cc7ff, bleu profond #799bf9, et pas de brun ; Notak a des pastels inventés (#e6e8eb, #d3eef2, #d9ecdf, #ebe0d6, #f9efc6…, brun compris) — `elements/colonne/colonne.css:3-14`. La formule de fond de la colonne coloriée est à lire dans `Column.scss` avec la famille colonne ; les valeurs de palette ci-dessus sont celles à reprendre.
- [ABSENT] Palette de croquis : blanc, anthracite #5f6672 et gris, plus les 10 teintes (+ « blanc » et « anthracite » en tête) ; couleurs de trait de dessin et de ligne : les 11 teintes plus blanc ; couleurs d'étiquette : blanc plus les 11 — famille croquis/ligne/étiquette, à reprendre de `common/colors/colorConstants.ts`.
- [ABSENT] Couleurs du canevas du tableau, en clair : gris #ebedee (Notak l'a), bleu #dceaf6, vert #d9ebe6, jaune #f0eedf, gris chaud #e5e3e8 ; en sombre : gris #1d1d1d, bleu #1c2624, vert #27241f, jaune #1c2329, gris chaud #26232a. Notak n'a que le gris, sans choix (voir I2).

### A2. États
- [OK] Choisi : filet de 2 px couleur #323b4a, posé à l'extérieur, ombre retirée — `toile.css:102-112`.
- [OK] Choisi et verrouillé : filet #bbbec3 — `toile.css:115-125`.
- [DIFFÉRENT] En édition, à confirmer à l'écran : Milanote déplace le filet en changeant sa position de 2 px en 0,1 s ease-out ; d'après ses variables, le filet passe de « 2 px hors du bord » à « 2 px dans le bord » (il se resserre de 2 px vers l'intérieur) et l'ombre est retirée. Notak l'écarte de 2 px vers l'extérieur (filet entre 2 et 4 px hors du bord, transition 0,1 s) — `toile.css:127-135`.
- [OK] Survol d'un élément opaque : rien ; la poignée de taille apparaît (voir D1).
- [DIFFÉRENT] Survol d'un élément transparent : Milanote met un liseré de 1 px à 10 % noir (couleur « filet de colonne ») en dehors du bord, pour toute carte transparente (note, colonne, table, croquis…) ; Notak : 14 % et seulement pour la note — `toile.css:183-185`.
- [DIFFÉRENT] Choisi par une autre personne : Milanote met un filet de 2 px à la couleur de cette personne, collé au bord, sans ombre, plus une pastille au coin haut droit (décalée de 14 px vers l'extérieur, 30 px de haut, rayon 15, fond à sa couleur, avatar, prénom, croix de désélection forcée), qui apparaît par un « pop » de 0,4 s (courbe 0,665 / 0,1 / 0 / 2,5) et pulse sans fin (anneau de 15 px qui s'éteint en 1,5 s à 60 %) ; le nom s'ouvre de 8 px à 125 px. Notak : contour de 2 px à 2 px du bord, sans pastille, sans croix — `toile.css:667-671`.
- [ABSENT] Exclusivité : un élément choisi ou en édition par un autre ne peut être ni choisi ni édité par vous (le clic ne le prend pas, le lasso l'ignore, Cmd+A ne le prend pas) ; la croix de la pastille force sa désélection chez l'autre (sauf croquis et document). Notak laisse tout le monde choisir et écrire (`Toile.tsx:1564`, `:1573`).
- [DIFFÉRENT] Source pendant un glisser : Milanote la cache (visibilité nulle) pendant que l'aperçu vole dans une couche à part ; avec Alt tenue, l'original reste à 40 % d'opacité et ne reçoit plus la souris ; dans une colonne, l'original reste en place comme empreinte pleine, fond noir à 4 % (12 % en sombre), contenu masqué, sans trait. Notak fait voler l'élément lui-même ; dans une colonne, il en sort dès le seuil et laisse une empreinte à trait pointillé 1,5 px à 14 %, rayon 3 px, fond noir 3 % (`Toile.tsx:1748-1763`, `toile.css:1014-1019`).
- [OK] Ombre de vol : trois couches 8/22/−6, 14/32/−4 et 2/20/4 aux opacités 12, 14 et 6 % — `toile.css:20`.
- [ABSENT] Aimantation d'un commentaire attaché à un élément (l'élément prend un filet #bbbec3 et un rembourrage de 40 px autour pour capter le dépôt) : famille commentaire.
- [ABSENT] Élément ouvert en mode focus (présentation) : l'original devient de la couleur du canevas à 97 % de luminosité, contenu caché ; dans une colonne, fond « empreinte ». Notak : la copie grandit au centre (`Toile.tsx:173-209`), l'original ne change pas.
- [ABSENT] Marque de couleur quand l'élément est la cible d'un dépôt : filet de 2 px #323b4a (« peut recevoir ») sur la carte survolée ; une colonne repliée survolée : filet de 2 px, rembourrage de 2 px ; une colonne vide survolée : filet de 2 px autour de la zone « Drop here » (7,2 UG de haut, fond noir 4 %). Notak ne marque que le trait d'insertion.

### A3. Superpositions
- [OK] Les éléments verrouillés restent sous les autres — `Toile.tsx:2201`.
- [OK] Pile des étages de Milanote : bordure du filet 10, élément 300, poignée 2, point d'activité 40, pastille de personne 45, couche du glisser 40 000 — sans effet à reproduire (Notak : ordre du DOM, vol à 10).

---

## B. Création commune

- [OK] Double-clic sur le vide : crée une note, réglable dans les préférences — `Toile.tsx:2130-2134`. Détail : Milanote crée à 1 px au-dessus du clic, puis aimante ; Notak aimante directement (sans effet visible).
- [ABSENT] Double-clic dans la zone du pied d'une colonne (« Drop here ») : crée une note à la fin de la colonne, sauf colonne repliée. Notak : le double-clic sur une colonne ouvre l'édition du titre (`Toile.tsx:2124-2128`).
- [OK] Collage d'un code couleur (#hex, rgb, hsl…) hors édition : crée un nuancier au lieu d'une note — `elements/nuancier/index.ts:42`.
- [DIFFÉRENT] Collage de texte quand une seule ligne est choisie : Milanote met le texte comme libellé de la ligne ; Notak crée une note au centre (`Toile.tsx:743-774`). Quand un média est choisi, le texte devient sa légende (Milanote) ; Notak : note neuve.
- [DIFFÉRENT] Cmd+Entrée, par type de l'élément choisi seul. Milanote : note → note dessous (même couleur et mêmes réglages sans le texte ni les réactions, 1 UG sous la hauteur mesurée, ou 8 UG sous le haut à défaut), sauf si l'on écrit déjà dedans (l'éditeur gère) ; tableau → tableau 17 UG à droite, même ordonnée ; colonne → colonne 36 UG à droite (largeur 34 + 2) ; document → document 17 UG à droite ; fil de commentaires → fil dessous ; liste de tâches → liste dessous ; table, ligne, image → rien ; tout le reste (lien, fichier, nuancier, croquis, clone, annotation…) → note dessous. Rangé dans une colonne : juste après lui dans la colonne. Notak : `suivant` propre à chaque type (`Toile.tsx:544-568`) — document : dessous (Milanote : à droite) ; table : table dessous (Milanote : rien) ; nuancier : nuancier dessous (Milanote : note) ; lieu : lieu dessous (Milanote : note) ; commentaire, fichier, croquis, clone, dessin : rien (Milanote : fil dessous pour le commentaire, note dessous pour les autres).
- [ABSENT] Alt+Entrée sur la colonne choisie : crée une note en tête de colonne, choisie et en édition ; sur une liste de tâches : ajoute le titre et l'édite. Notak : aucun (`Toile.tsx:1388` ne prend que Cmd+Entrée).
- [OK] Outils de création, glisser depuis la barre, rebond : voir le relevé de la barre ; non repris ici.

---

## C. Sélection

- [OK] Clic simple choisit ; Cmd/Ctrl+clic bascule ; Maj+clic bascule sur la toile (la plage n'existe que dans les non triés) — `coeur/selection.ts:24-31`, `Toile.tsx:1566`.
- [DIFFÉRENT] Moment du choix : Milanote choisit au clic (relâchement) ; Notak à l'appui, mais la réduction d'un groupe à un seul élément se fait au relâchement (`Toile.tsx:1570`). Équivalent à l'œil ; à noter si l'on glisse un élément non choisi (Milanote vide d'abord la sélection au départ du glisser).
- [OK] Clic droit : choisit l'élément s'il ne l'était pas ; sur le vide désélectionne — `Toile.tsx:1543-1547`. (Milanote ne le choisit pas si son parent l'est.)
- [OK] Lasso posé au relâchement, aperçu pendant le geste, inversion avec Maj/Cmd, ligne prise par son trait — `Toile.tsx:1694-1703`.
- [DIFFÉRENT] Style du lasso : Milanote : trait de 1 px gris neutre (#8d929a), fond noir à 5 % ; Notak : trait de 1 px bleu d'accent #2f6feb, fond bleu à 8 % — `toile.css:164-169`. Très visible.
- [OK] Cmd+A : tout, ou tous les frères de la sélection (la colonne), jamais ce que choisit un autre — `Toile.tsx:1373-1379`.
- [OK] Échap : sort de l'édition, puis désélectionne. (Milanote remonte aussi une pastille d'étiquette choisie, un menu, un filtre : autres familles.)
- [DIFFÉRENT] Choisir un parent retire de la sélection ses enfants (une colonne choisie n'a jamais ses notes choisies avec elle) : Notak garde les deux et fait suivre l'enfant (`Toile.tsx:1573-1580`) ; sans effet visible, mais la barre de sélection voit alors des éléments de plus.
- [OK] Élément verrouillé : se choisit, ne se déplace pas, ne se redimensionne pas — `Toile.tsx:1551`, `:1575`. (Le relevé précédent disait l'inverse pour le choix ; le code de Milanote n'empêche pas le choix.)
- [OK] Défilement du choisi dans la vue au montage (Milanote fait défiler jusqu'à lui s'il est hors vue à son apparition) : Notak le fait pour la recherche seulement ; sans effet courant.

---

## D. Redimensionnement

### D1. Poignée
- [OK] Poignée en coin bas droit, zone de 26 px, six hachures sombres et claires, taille constante à l'écran, fondu de 0,1 s, au survol ou à la sélection, curseur diagonale — `toile.css:381-394`, `:1033-1036`.
- [DIFFÉRENT] Qui en a une. Milanote : note, lien (hors colonne), image (hors colonne), fichier montrant son aperçu (hors colonne), colonne (hors colonne), table, nuancier, croquis (hors colonne), annotation, fil de commentaires déplié ; une note en colonne seulement si sa hauteur est bornée. **Pas de poignée** pour une liste de tâches, un tableau imbriqué, un document, un clone, une ligne. Notak en pose une sur tout ce qui est libre et non verrouillé, tâches, tableau, document, clone, lieu, commentaire compris — `Toile.tsx:2243`. (Un tableau, une liste de tâches et un document ont donc une largeur modifiable chez Notak et pas chez Milanote.)
- [DIFFÉRENT] Dans une sélection de plusieurs : Milanote montre une poignée à **chaque** élément choisi (chacune lance le redimensionnement du groupe) ; Notak ne montre qu'une poignée de groupe au coin du cadre englobant (`Toile.tsx:2281-2300`, `toile.css:1444-1455`).
- [OK] Poignée cachée pendant un lasso — Notak : `poignee` faux dès qu'un geste est en cours.
- [OK] Double-clic sur la poignée : largeur par défaut 34 ↔ largeur naturelle ; colonne : retour à sa largeur par défaut — `coeur/largeur.ts:19-22`, `Toile.tsx:2116-2123`.
- [DIFFÉRENT] Hauteur dans une colonne : la poignée n'existe que pour une note dont la hauteur est bornée (curseur vertical) ; Notak offre à toute note, lien et clone rangé une poignée de bas de carte et des boutons de cran dans « ••• » (`Cadre.tsx:55-57`, `elements/rangee/OutilHauteur.tsx`).

### D2. Géométrie
- [OK] Aimantation à 34 si à moins de 2 UG ; jamais en groupe — `coeur/largeur.ts:3-13`.
- [DIFFÉRENT] Largeurs minimales, en UG. Milanote : note 17 ; lien 17 sans aperçu, 4 avec ; image 4 ; fichier 4 (affichage complet dès 20) ; nuancier 4 (17 × 12 au départ) ; croquis 4 (34 × 20,9 au départ) ; annotation 4 ; table 12 ; colonne 34 ; lien en affichage complet dès 12. Notak : note 17, lien 17 (lieu 16), image 4, fichier 12, nuancier 4, croquis 12, dessin 2, table 12, colonne 34 (`coeur/tableau.ts:599`), commentaire 20, clone 8, document 8, tableau 10. Écarts : fichier (12 contre 4), croquis (12 contre 4), dessin/annotation (2 contre 4), lieu (16 contre 17/4).
- [DIFFÉRENT] Hauteurs minimales, en UG. Milanote : note 5,8 (une ligne) ou 8,6 (plusieurs lignes, hauteur bornée) ; lien sans aperçu 5,8 ; colonne 15 ; table 6 ; image, fichier, nuancier, croquis, annotation 4 ; fil de commentaires 7. Notak : note 6,2 (`toile.css:83`, 62 px), colonne 15 (OK), reste suivant le contenu.
- [DIFFÉRENT] Redimensionnement de groupe : Milanote met à l'échelle depuis le coin haut gauche du groupe, **chaque axe à sa propre échelle** (position et taille en x suivent l'échelle x, en y l'échelle y), sauf si un élément du groupe garde ses proportions : alors les deux axes prennent l'échelle x ; plancher = le plus grand des planchers de chacun ; Cmd tenue libère les proportions. Notak : une seule échelle, celle de la plus grande traction, jamais sous la largeur minimale de chacun (`Toile.tsx:110-122`). Les positions en y ne suivent donc pas un tirage purement vertical chez Notak.
- [ABSENT] Fin de redimensionnement animée : positions et tailles arrondies à la grille en interpolant à 30 % par image ; pour un groupe, les éléments se posent l'un après l'autre de haut-gauche à bas-droite, 500 ms en tout, au plus 50 ms d'écart, sans cascade au-delà de 50 éléments. Notak arrondit à chaque mouvement.
- [ABSENT] Garde-fous : un zoom qui démarre pendant le geste l'annule et rend les mesures d'avant ; le clic qui suit le relâchement est avalé (aucune sélection) ; Cmd pendant le geste se lit en direct. Notak : seul Échap annule (`Toile.tsx:1952-1963`).

---

## E. Glisser-déposer

- [OK] Suivi au pixel (60 % de l'écart par image, 50 % si incliné), soulèvement 0,05 par image, inclinaison perspective 2000 px, maximum min(25°, asin(110/plus grand côté)), 20 % d'amortissement, dépose animée (< 0,5°, < 1 px, ombre < 0,1) — `coeur/vol.ts`.
- [OK] Maj verrouille l'axe ; Échap annule ; Alt+glisser copie ; défilement au bord (40 px) ; entrée dans un tableau au survol (700 ms puis 300 ms de clignement, 400 ms ensuite) — `Toile.tsx:141-147`, `:1940-1984`, `:1765-1772`, `:137-139`.
- [DIFFÉRENT] Verrou d'axe : Milanote ne bascule que si l'autre axe dépasse le premier de 50 px, jamais dans une liste ; Notak bascule au double (`Toile.tsx:142-147`).
- [DIFFÉRENT] Alt : Milanote lit Alt **au dépôt** (on peut la presser ou la lâcher en route, l'aperçu des fils de commentaires disparaît en copie) ; Notak la lit au départ du glisser (`Toile.tsx:1765`).
- [ABSENT] Rétrécissement du paquet glissé au-dessus d'une cible : sur un tableau, l'icône d'un tableau, le fil d'Ariane, la corbeille, la zone des non triés fermée, l'espace : mis à l'échelle 0,8 et à 75 % d'opacité ; sur une colonne : 75 % d'opacité seulement ; sur un modèle de colonne : 0,76 et 75 % ; le tout en 0,3 s avec une courbe à rebond (0,595 / 0,235 / 0,085 / 1,245), origine de l'échelle au point de prise ; l'échelle suit aussi le zoom de la cible (lâcher un élément d'un tableau à 50 % dans une colonne à 100 % le grossit). Notak : aucun changement (`toile.css` n'a que la mise en avant du tableau visé).
- [OK] Tableau visé : l'icône grossit à 1,1, s'assombrit à 80 %, clignote (0,9 / 0,8 / 0,9 / 0,8 en 0,3 s) avant l'entrée — `elements/tableau/tableau.css:119-125`, `:169-175`. À confirmer : réduction de l'icône et du texte intérieurs à 0,82 et 50 % chez Milanote.
- [DIFFÉRENT] Trait d'insertion dans une colonne : Milanote : trait de 2 px **#323b4a** (couleur « peut recevoir »), extrémités carrées, toute la largeur de la rangée, posé à 0,5 fois le rembourrage vertical + 1 px au-dessus de l'élément suivant (5 à 7 px) ; pas de trait si le dépôt ne changerait rien (même place ou place suivante, pour un seul élément glissé) ; en pied de colonne, zone de 1,6 UG de haut avec un trait de 2 px. Notak : trait **bleu #2f6feb**, 2 px, extrémités arrondies, retrait de 8 px de chaque côté, 4 px autour (`toile.css:631-637`, `Toile.tsx:1845-1847`) ; toujours affiché, même pour un dépôt sans effet.
- [DIFFÉRENT] Règle d'acceptation d'une colonne : refuse tout le paquet s'il contient une colonne ; sinon accepte s'il y a au moins un élément admissible, et les autres suivent. Notak accepte la partie admissible et pose le reste sur la toile (`Toile.tsx:1830`, `elements/colonne/regles.ts`).
- [DIFFÉRENT] Dépôt sur un tableau : Milanote range dans la **boîte de réception** du tableau (non triés), sauf si le canevas du tableau est vide et que l'on glisse plusieurs éléments (la mise en page est gardée, départ à 5, 5) ; Notak : à la suite du contenu, mise en page gardée si vide (`services.deposerDans`). À confirmer pour l'écran d'arrivée.
- [OK] Les fils reliés aux éléments glissés suivent le geste (`envol.ts:98-103`). L'aimantation d'une punaise de commentaire attachée (survol d'un élément, rembourrage de 40 px) : famille commentaire.
- [DIFFÉRENT] Toucher : Milanote attend 300 ms d'appui avant de glisser (0 pour une tâche) et vibre au départ ; Notak : seuil de 3 px, un doigt dans le vide tire la toile, l'appui long de 500 ms ouvre le menu (`Toile.tsx:149-153`, `:1538`).
- [ABSENT] Sons de glisser/dépôt (voir M1).

---

## F. Presse-papiers, doublon, corbeille, plan

- [OK] Copier ouvre un paquet interne ; Cmd+V colle décalé de 2 UG par collage tant que l'original est en vue sinon au centre ; Cmd+D copie à +2 +2, ou juste après dans la colonne ; Cmd+Alt+V colle le style — `Toile.tsx:966-997`, `coeur/pressePapiers.ts`.
- [DIFFÉRENT] Centre de collage : Milanote garde un décalage d'au moins 2 UG par collage (jamais collé en dehors de la vue en haut ou à gauche) ; Notak recentre sans plancher (`coeur/pressePapiers.ts:84-88`).
- [DIFFÉRENT] Couper : Milanote **ne supprime rien** : l'élément disparaît de l'écran (local), la sélection est vidée, et le collage **déplace** le même élément (même identifiant, mêmes liens) ; un nouveau copier ou un annuler le fait réapparaître ; pas de corbeille. Notak : copie puis corbeille, le collage crée un nouvel élément (`Toile.tsx:951`).
- [ABSENT] Coller avec une colonne choisie seule : met le collage **dans la colonne**, en tête, sans changer la sélection (si tout peut y entrer) ; l'entrée « Coller » du menu d'un élément n'existe que dans ce cas. Notak : colle sur la toile (`Toile.tsx:930-941`).
- [OK] Supprimer : Retour arrière, Suppr (et Cmd+Retour arrière, Cmd+Suppr chez Milanote) mettent à la corbeille, sauf les verrouillés — `Toile.tsx:1420-1423`.
- [DIFFÉRENT] Cmd+Retour arrière / Cmd+Suppr : mettent à la corbeille chez Milanote ; chez Notak `if (cmd) return` les avale (`Toile.tsx:1393`).
- [OK] Alt+` : vers les non triés, sauf lignes et fils réduits — `Toile.tsx:1360-1363`.
- [OK] Premier plan / arrière-plan : le menu va jusqu'au bout, Cmd+Maj+↑/↓ d'un cran parmi ce qui chevauche — `Toile.tsx:1146-1157`. Milanote refuse l'arrière-plan à une ligne accrochée aux deux bouts et les deux dans la boîte de réception.
- [OK] Aligner (Alt+A/D/W/S/H/V) et répartir (Cmd+Alt+Maj+H/V) par valeur la plus fréquente, écart arrondi vers le haut, au moins 1 UG — `coeur/arrangement.ts`.
- [DIFFÉRENT] Éléments pris en compte : Milanote retire les verrouillés (par le menu seulement ; le raccourci les déplace), ne retire que les lignes accrochées, et exige que tous soient sur la toile ; Notak écarte les lignes et ce qui est rangé en colonne, et déplace les verrouillés (`elements/arrangement/disposables.ts`).
- [ABSENT] Dupliquer propose « Créer une copie synchronisée ? » sur la copie (voir K2).

---

## G. Clavier commun (hors édition)

- [OK] Flèches : 1 UG, Maj 5 UG ; dans une colonne, ↑/↓ changent le rang — `Toile.tsx:1394-1407`. Milanote ignore les flèches si un modal ou un panneau est ouvert, ou en présentation sur un élément mis en avant.
- [DIFFÉRENT] Entrée sur un élément choisi seul : Milanote : image → ouvre son plein écran ; liste de tâches → édite la **dernière** tâche ; fil de commentaires → édite la réponse ; tableau et colonne → édite le titre ; lien → édite le titre ; note → édite le texte ; table → rien (la table s'en sert). Rien si un panneau ou un modal est ouvert. Notak : « modifier » si le type est `editable` (`Toile.tsx:1415-1418`) — un tableau imbriqué n'est pas modifiable (Entrée ne fait rien), l'image s'édite (légende ?) au lieu de s'ouvrir.
- [DIFFÉRENT] Espace relâchée sans avoir attrapé : Milanote ouvre un tableau, un document, un croquis ou une image (et ferme le plein écran d'un élément s'il est ouvert) ; Notak ouvre ce qui a `ouvrir` : tableau, image, fichier, clone, dessin ; pas le document ni le croquis ; ne ferme rien (`Toile.tsx:1507-1516`).
- [OK] Cmd+K relie ; Cmd+\ non triés ; / raccourcis ; Cmd+U / Cmd+Maj+U ; Ctrl+[ et ] ; Cmd+Maj+, et . taille de grille ; Cmd+Maj+D thème ; Cmd+Alt+P présentation ; Cmd+, réglages ; Cmd+F recherche ; Z ; Cmd+plus, moins, 0 — `EspaceNotak.tsx:277-312`, `Toile.tsx:1300-1430`.
- [DIFFÉRENT] Maj+Échap a le même effet qu'Échap chez Milanote ; Notak ne le traite pas à part (`Toile.tsx:1412`).

---

## H. Barre d'outils commune et sélection multiple

Rappel de la mécanique : Notak a pris la barre de gauche par défaut (`reglages.tsx:55`), flèche retour, tiroir « ••• », repli sur fenêtre basse, menus qui s'ouvrent à droite — OK. Il reste des écarts de contenu et de style.

- [OK] Ordre des outils communs : Couleur, Étiquettes, Réactions, Commentaire, outils du type, Aligner (≥ 2), Répartir (≥ 3), Relier (≥ 2), « ••• » en dernier — `elements/registre.ts`, `elements/decor/index.ts:9-13`, `arrangement/index.ts:6`.
- [OK] Sélection mêlée : seuls les outils communs ; ceux de chaque type derrière un rangement — `Barres.tsx:240-282`. (Milanote prend l'intersection par identifiant d'outil, sans rangement par type : DIFFÉRENT d'ordre ; sur Notak la sélection mêlée montre en plus « Outils par type ».)
- [DIFFÉRENT] Outils en trop dans Notak, qui n'existent pas chez Milanote pour une note : Hauteur (moins, plus, auto), Texte (couleur du texte), Légende, Échéance et Assigner, Mode d'affichage (icône) — tous rangés dans « ••• » (`elements/rangee/OutilHauteur.tsx`, `elements/note/Outils.tsx:97-102`, `elements/decor/Outils.tsx:75-136`). Milanote n'offre Échéance et Assigner que sur les tâches, et le mode d'affichage que sur le document et le fichier (voir K3).
- [DIFFÉRENT] Libellés de tuile en anglais chez Milanote : « Color », « Add labels », « Add reaction », « Comment », « Alignment », « Distribute », « Connect », « Title », « Caption », « Rename », « More » ; bulles d'aide de l'alignement : « Align left », « Align horizontal centers », « Align right », « Align top », « Align vertical centers », « Align bottom », « Distribute horizontally », « Distribute vertically » (délai 700 ms, à droite). Notak : « Left », « Center », « Right », « Top », « Middle », « Bottom », « Horizontal », « Vertical », « Align », « Distribute », « Connect » (`langue.ts:1025-1060`). En français : « Aligner », « Répartir », « Relier » (Notak OK), bulles à reformuler en « Aligner à gauche », « Centrer horizontalement »…
- [DIFFÉRENT] Tuile : icône carrée de 32 px (28 px avec la petite barre), coins de 4 px, fond = canevas mêlé à 60 % de blanc (donc plus **clair** que la barre), glyphe = canevas mêlé à 90 % de noir ; libellé 10 px (9 px avec les barres moyenne et petite), couleur secondaire du canevas, 5 px sous l'icône, largeur max 74 px ; rembourrage de la tuile 9 px au-dessus et 8 px dessous (6 et 6 en petite barre) ; barre de 72 px de large (63 en moyenne et petite), 3 px de marge haute, liste à 10 px sous la flèche (8 en petite). Notak : tuile de 44 × 40 px, rayon 8, fond noir à 6 % (plus **sombre**), glyphe de 24 px, libellé 11 px #5f656d — `toile.css:217-258`, `:342-347`.
- [DIFFÉRENT] Tuile active (bascule allumée) : Milanote trace un **contour de 2 px** dans la couleur du glyphe, coins de 4 px, autour de l'icône, sans fond plein ; tuile « ouverte » (menu affiché) : fond plus clair (canevas 80 % blanc) et glyphe plus foncé. Notak : fond noir à 14 % — `toile.css:1604-1606`.
- [DIFFÉRENT] Tuile grisée : Milanote avale le clic et ne ramène que les tracés du glyphe à 20 % (le fond reste plein) ; si active en plus, l'icône entière à 40 %. Notak : toute la tuile à 40 % (`toile.css:1597-1600`).
- [DIFFÉRENT] Survol : Milanote : aucun changement sur les tuiles d'élément choisi (les tuiles de **création** se décalent de 5 px à droite avec une ombre portée de 3 px). Notak : l'icône monte de 1 px, le fond fonce (`toile.css:232-238`, `:250-252`).
- [DIFFÉRENT] Flèche retour : bande pleine largeur de 25 px, icône « retour », filet de 1 px dessous (rembourrage 2 px haut, 3,5 px bas), fondu de 0,1 s, visible dès que la liste active n'est pas celle de création ; clic : tout désélectionner (liste « choisi »), finir l'édition en gardant le choix (liste « édition »), ou rendre le curseur à la note (sélection de texte). Notak : bouton de 44 × 36 px, sans filet ni fondu (`toile.css:1553-1568`) ; le clic désélectionne seulement (`Barres.tsx:249`).
- [ABSENT] Glissement horizontal à ressort (raideur 300, amortissement 30, précision 0,1) entre listes d'outils, bouton « fermer » qui apparaît à 70 % de la transition, délai de 100 ms (300 ms pour un tableau seul, pour laisser passer un double-clic) avant de recomposer. Notak : bascule sèche (`toile.css:2021-2027` : une animation courte d'entrée seulement).
- [DIFFÉRENT] Aligner / Répartir : Milanote ouvre une fenêtre à flèche à droite de la tuile, boutons d'icône de 24 px côte à côte (largeur 154 px pour l'alignement, 6 boutons sur 3 colonnes ; fenêtre automatique pour la répartition), avec bulle ; Notak : même idée, deux menus d'icônes (`elements/arrangement/Outil.tsx`, OK sur le principe) ; largeurs à comparer à l'écran.
- [DIFFÉRENT] Couleur d'une note : 13 pastilles de fond (Aucune, 11 teintes, Transparent à damier) en 5 colonnes de 24 × 20 px, 8 px d'espace ; onglets Fond / Bande du haut (200 px de large, rembourrage 24 px) ; paires fond + texte déjà employées (cartes) ; couleurs du tableau (jusqu'à 10) ; bouton plein largeur « Couleur personnalisée… » avec roue, aperçu **en direct** sur l'élément pendant le choix ; pastille active : anneau de 2 px décalé de 4 px ; la fenêtre reste ouverte après un choix. Notak : onglets, grille 5 × 24 × 20 px, teintes du tableau (8 au plus), couleur personnalisée posée **à la fermeture** du sélecteur natif, pas d'aperçu en direct, pas de paires fond + texte (`elements/note/PanneauCouleur.tsx`).
- [DIFFÉRENT] Réactions : sélecteur d'émojis **complet**, fenêtre de 570 px, menu de catégories de 220 px à gauche (recherche, teinte de peau), liste à 8 colonnes de cases de 32 px (+ 4), 500 px de haut, « fréquents » en tête. Notak : un sélecteur plus court (`elements/decor/SelecteurEmojis.tsx`, 69 lignes, catalogue partiel) — à comparer à l'écran.
- [OK] Commentaire : tuile à action sans fenêtre ; Milanote crée un fil rattaché au coin haut droit de l'élément (20 px du bord) ; Notak ouvre un fil sous l'élément (`elements/decor/Outils.tsx:138-163`) — famille commentaire.
- [DIFFÉRENT] « ••• » : un **menu d'actions** (popover à droite de la tuile, largeur 240 à 296 px) qui porte les sections du menu du clic droit sans le presse-papiers ni le nommage ; il **disparaît d'abord** quand la barre est trop courte (ordre de repli 1000) ; il n'a pas de libellé. Notak : un tiroir qui mêle tuiles secondaires et menu d'actions, et dont l'ordre de repli est « toujours » (`Barres.tsx:259-283`).
- [ABSENT] Le pied de barre : Corbeille (« Trash ») : icône de 32 px, rembourrage haut 17 px, survol de zone de dépôt à 60 % d'assombrissement ; visible aussi en édition ; Notak l'a, au même endroit — OK sur le principe, valeurs à comparer à l'écran.

---

## I. Menus

### I1. Menu du clic droit sur un élément
Mécanique : Milanote **retire** les entrées qui ne s'appliquent pas (rien de grisé), sépare les sections non vides par un filet, n'a **pas d'icône** dans le menu (`showIcons` éteint), largeur 240 à 296 px, rayon 12 px, ombre 2xl, rangée de 28 px (4 px de rembourrage, 10 px de côté, texte 14/20 px gris #5f6672, graisse 500, survol #f3f3f4), raccourcis en touches symboliques à droite, une coche **à droite** pour une entrée à bascule (le menu **reste ouvert** pour la rebasculer), ouverture à l'événement du bouton droit, relâchement du bouton droit sur une entrée la choisit, ne s'ouvre pas pendant une édition ni un glisser, jamais en lecture seule. Notak : tout cela est repris (`Menus.tsx:49-140`, `toile.css:841-922`), sauf les points ci-dessous.
- [DIFFÉRENT] Ordre et contenu des sections de Milanote, dans l'ordre : (1) Coller (seulement si tous les éléments choisis sont des colonnes et que le presse-papiers n'est pas vide), Couper ⌘X, Copier ⌘C, Coller le style ⌥⌘V (seulement si le style change quelque chose), Dupliquer ⌘D (« Dupliquer celui-ci » sur un raccourci de tableau), Dupliquer le tableau lié (raccourci), Créer une copie synchronisée (un seul élément clonable), Supprimer (⌫ sur Mac, Retour arrière ailleurs) ; (2) Renommer ↩ (un conteneur hors liste de tâches, un document, un fichier, seul) ; (3) tableau : Ouvrir dans un nouvel onglet, Retrouver le tableau d'origine, Créer un raccourci, Copier le lien du tableau, Convertir en modèle / Rétablir en tableau ; (4) média : Télécharger l'original, Ouvrir le fichier, Remplacer l'image, Ajouter une image (lien seul sans image), Copier l'adresse du lien, Recadrer l'image sur la grille de points (coche) ; (5) dessin : Télécharger en SVG ; (6) Mettre dans une colonne (≥ 2 éléments de ce tableau), Relier par des lignes (≥ 2 sur la toile) ; (7) Convertir en carte de croquis (annotation seule) ; (8) Convertir en note / en document / la colonne en tableau ; (9) Verrouiller la position (coche) ; (10) Premier plan, Arrière-plan ; (11) outil développeur ; (12) lignes de métadonnées avec avatar. Notak : Couper, Copier, Coller (toujours si copie), Dupliquer | Ouvrir, Modifier | entrées des modules | Verrouiller, Premier plan, Arrière-plan | Coller le style, Mettre dans les non triés, Mettre à la corbeille (`Toile.tsx:1188-1213`). Écarts : « Supprimer » est dans le premier bloc chez Milanote, en dernier chez Notak ; « Coller le style » est avant « Dupliquer » ; « Ouvrir », « Modifier » et « Mettre dans les non triés » n'existent pas chez Milanote ; « Renommer » (↩) manque ; pas de métadonnées.
- [DIFFÉRENT] Métadonnées : Milanote : une ou deux phrases avec l'avatar de la personne (« vous » ou son nom, créé il y a…, modifié il y a… ; fusionnées si le même auteur a modifié dans les 5 minutes, ou si les deux dates s'écrivent pareil), non cliquables, cachées si l'auteur est inconnu, une seule sélection seulement. Notak : « Créé le {date} » lu dans l'identifiant, sans auteur ni modification (`actionsSelection.ts:468-471`).
- [DIFFÉRENT] Verrouiller la position : coche à droite et menu qui reste ouvert chez Milanote ; Notak met la coche à gauche (`Menus.tsx:126`) et ferme le menu au clic (`Menus.tsx:77-80`, `MenuActions.tsx:8`).
- [DIFFÉRENT] Lecture seule : Milanote n'ouvre aucun des deux menus (menu désactivé) ; Notak ouvre un menu « Copier » sur un élément et, sur le vide, « Tout sélectionner » et « Raccourcis clavier » (`Toile.tsx:1189`).

### I2. Menu du clic droit sur la toile vide
- [DIFFÉRENT] Contenu de Milanote, dans l'ordre : Coller ⌘V (si le presse-papiers d'éléments n'est pas vide) | Annuler ⌘Z, Rétablir ⇧⌘Z (**absents** quand la pile est vide, pas grisés) | Tout sélectionner ⌘A (absent si la toile est vide) | Note, Lien, À faire, Ligne (seulement toile), Tableau, Colonne, Commentaire, Table | « Changer l'arrière-plan » (sous-menu : « Couleur personnalisée… », « Grille de points » à coche, « Rétablir par défaut » absent si déjà par défaut) | « Image ou fichier » (réserve vide à remplir) | modèle public (réservé à un essai). Clés de libellé : paste, undo, redo, selectAll, newNote, newLink, newTodo, newLine, newBoard, newColumn, newComment, newTable, background.changeBackground, background.chooseCustomColor, background.showDotGrid, background.revertToDefault, newImageOrFilePlaceholder. Les textes anglais ne sont pas dans les sources lues. Notak : Coller | Annuler, Rétablir (toujours présents) | Tout sélectionner | **tous** les outils de la barre, tiroir compris (Titre, Vidéo, Audio, Carte, Modèle de tableau, Nuancier, Lieu, Croquis, Dessin, Document, Clone…) | « Raccourcis clavier » / (`Toile.tsx:1166-1186`). Écarts : liste de création bien plus longue ; pas d'entrée « Image ou fichier » ; pas de sous-menu d'arrière-plan ; Annuler/Rétablir jamais retirés ; une entrée « Raccourcis clavier » que Milanote n'a pas dans ce menu.
- [ABSENT] Arrière-plan du tableau : couleur personnalisée par le sélecteur natif (aperçu en direct, le thème clair ou sombre du texte suit la luminosité), grille de points activable par tableau, retour au défaut ; stockés sur le tableau. Notak : un seul fond, la grille n'est réglable que par la taille (8, 9, 10 px).
- [OK] Position de création : l'élément naît au point cliqué, aimanté — `Toile.tsx:1166-1176`.
- [DIFFÉRENT] Création depuis le menu : « À faire » ne choisit pas la liste (elle naît sans sélection) ; « Ligne » n'entre pas en édition ; « Tableau » et « Colonne » entrent en édition du titre ; Milanote joue le son de dépôt. Notak : `apresCreation` selon le type (`aLaCreation`), OK sur le principe.

### I3. Conversions
- [OK] « Convertir en document » (tous des cartes, donc la note) et « Convertir en note » (tous des documents) : `elements/note/index.ts:105`, `elements/document/index.ts:45`.

---

## J. Plein écran d'un élément (modal)

Types concernés chez Milanote : image, fichier, document, croquis (la note et les autres n'ont pas de plein écran).
- [ABSENT] Adresse propre à l'élément : une route par élément, le retour du navigateur ferme ; Notak : surcouche locale sans adresse (`elements/surcouche.tsx`), sauf l'image (`elements/image/visionneuse`).
- [ABSENT] L'élément est choisi dès l'ouverture (une seule fois, quand la page est prête) ; Espace ferme le plein écran ; un clic sur le fond ferme (appui et clic tous deux sur le fond, pas sur la boîte) ; pas de bouton de fermeture ; pas de transition. Notak : Échap et clic sur le fond (`elements/surcouche.tsx:563-577`), pas d'Espace, pas de choix à l'ouverture.
- [DIFFÉRENT] Fond : noir à 48 % (56 % en sombre), la boîte est centrée par marge automatique, alignée en haut pour la carte et le document, largeur automatique avec 450 px au moins. Notak : document noir 48 % + flou 4 px, boîte de 820 px collée en haut, hauteur fenêtre − 42 px (`elements/document/document.css:53-77`) ; croquis : fond bleu nuit à 55 % (`croquis.css:25-34`) — DIFFÉRENT pour le croquis, et le flou n'a pas été retrouvé chez Milanote (à confirmer).
- [DIFFÉRENT] Taille (image, fichier) : fenêtre − 200 px de marge de chaque côté (20 UG), moins 80 px de pied de barre et la légende projetée (70 caractères par ligne × 20 px, plus 39, 35 ou 31 px de rembourrage selon la grille) ; plancher 350 × 500 ; si la hauteur trouvée est à moins de 50 px de la « hauteur idéale » mémorisée, on prend l'idéale et on recalcule la largeur. Document et croquis ont leur propre mise en page : à relever avec leurs familles.
- [ABSENT] Erreurs : « introuvable », « accès refusé » (avec invitation à se connecter), « pas de plein écran pour ce type » : trois fenêtres d'erreur centrées. Sans objet tant que Notak n'a pas d'adresse par élément.

---

## K. Éléments d'arrière-plan : marque-places, visibilité, suggestions, activité

### K1. Marque-places et visibilité (performance)
- [ABSENT] Hors écran (marge de 400 px sur la toile ; 800 px dans une liste), un élément rangé en liste ou boîte de réception est remplacé par un bloc de même taille (à la couleur de l'élément, ou à la miniature de l'image), sauf lignes et colonnes (sauf glissées) ; `content-visibility` en repli. Pas de différence visible hors défilement rapide ; Notak rend tout (`Cadre.tsx`). Sans objet pour l'utilisateur.

### K2. Suggestions (bande sous l'élément)
Mécanique de Milanote : une rangée de 40 px sous l'élément, qui glisse vers le bas en 0,2 s (sortie 0,1 s en fondu, 0,3 s en glissement) ; icône éventuelle de 16 px, question, boutons soulignés « Oui » et « Non merci » ; couleur secondaire de l'élément ; **cachée si l'élément fait moins de 34 UG de large** ; après **3 refus** d'une même suggestion, elle est désactivée pour la personne (réglage, compteur gardé dans le navigateur) ; le refus et l'acceptation sont retenus sur l'élément.
- [ABSENT] « Convertir en document ? » sur une note : déclenchée quand le texte dépasse **48 UG** de haut (une page A4 à 34 UG de large) : tout de suite si un collage ajoute plusieurs lignes d'un coup, sinon 1 s après la dernière frappe tant que le texte grandit ; disparaît si le texte repasse sous le seuil ; « Oui » convertit, « Non merci » rend le focus à l'éditeur.
- [ABSENT] Question de copie synchronisée sur ce que l'on vient de dupliquer (Cmd+D, menu) : « Oui » transforme la copie en clone de l'original ; la suggestion s'efface quand la copie n'est plus la dernière dupliquée.
- [ABSENT] Liste de tâches : suggestion d'un titre quand une tâche en plus porte le nombre de tâches de premier niveau à 2 ou plus et qu'il n'y a pas de titre (après 1 s de pause dans la frappe ; jamais pour une liste déjà longue qu'on ouvre) ; suggestion de supprimer les tâches terminées dès 2 tâches faites, elle reste jusqu'à ce qu'il n'y en ait plus aucune de faite.
- Textes : seules les clés sont dans les sources (`document.question`, `clone.question`, `featureSuggestions.yes`, `featureSuggestions.noThanks`) ; les boutons sont « Yes » et « No thanks » en anglais (à confirmer à l'écran), à traduire « Oui » et « Non merci ». Les phrases de question sont à écrire.
- [ABSENT] Préférence « suggestions » par fonction dans le compte.

### K3. Mode d'affichage (icône)
- [DIFFÉRENT] Milanote : « Affichage » en icône n'existe que pour le **document** (et le fichier : « Vue carte / Aperçu ») ; la vue en icône est verticale : papier de 72 px, titre sous l'icône (zone de 180 px), détails secondaires, rembourrage 9/10/10/10 px ; en liste : ligne horizontale, icône de 60 px, rembourrage 16 px ; le tableau est toujours une icône. Notak étend le mode à toute carte et à la colonne, sous forme d'une pastille d'une ligne (glyphe de 16 px + texte, rembourrage 8/12 px) (`elements/decor/affichage.ts:12-37`, `decor.css:130-155`).
- [DIFFÉRENT] « Replier » (colonne, fil de commentaires) : outil à part chez Milanote (droit « retour » suffit) ; Notak le confond avec le mode d'affichage.

### K4. Activité distante (indicateurs)
- [ABSENT] Point d'activité non vue sur l'élément : disque de 7 px (6 px, 5 px sous les grilles moyenne et petite), couleur de marque #f4511c, à 6 px du haut et de la droite, taille constante au zoom ; il disparaît pour de bon dès qu'on a choisi puis lâché l'élément ; infobulle immédiate : « Ajouté par … », « Partagé par … », « Cité par … », « … a commenté », « … a modifié », « … a réagi », « Mis à jour par … », suivie de l'âge (« il y a quelques secondes ») ; au plus 6 noms puis « N autres ».
- [ABSENT] Pointeurs de bord de vue : pour une activité, un résultat de recherche ou un élément visé qui sort de la vue, un disque de 18 px (22 px en grand, 16 et 20 px en petite grille), fond #f4511c, texte blanc 12 px gras (le nombre regroupé), ombre douce, grossit à 1,1 au survol, collé au bord de la fenêtre avec une flèche tournée vers la cible, marge de 18 UG ; entrée par un glissement de 20 px en 0,2 s (courbe 0,24 / 0,58 / 0,57 / 1,45) ; un clic fait défiler jusqu'à la cible avec 200 px de marge (340 à gauche) ; la couche s'efface pendant un zoom. Notak : aucun (la recherche estompe ce qui ne correspond pas, `Toile.tsx:1221-1231`).
- [ABSENT] Pastille de tableau : texte « New » ou compteur de changements, pastille de 22 px de haut, rayon 11, fond de marque, ombre petite, à 21 px au-dessus et 16 px à droite du bord (18 px en liste, 16 px sous la petite grille) ; pastille de commentaire : intégrée à la ligne du fil.
- [DIFFÉRENT] Ce que Notak met à la place : contour de la couleur de la personne et son prénom dans le coin pendant quelques secondes (`toile.css:1475-1496`), la cloche de notifications et l'activité du tableau (en-tête) ; rien ne reste sur l'élément jusqu'à ce qu'on l'ait vu.

---

## L. Couleurs : barre, fond, texte, libre

- [OK] Couleur libre en hexadécimal ; barre du haut de 5 px sur la note — `elements/note/PanneauCouleur.tsx`, famille note.
- [ABSENT] Noms stockés : Milanote enregistre un nom (« RED », « DEEP_BLUE »…) ou un hexadécimal ou un objet de couleur (HEX/RGB/HSL) ; « GREY » se lit #bbbec3 (fond et trait), #5f6672 pour un tableau ou un trait (« anthracite »), #dcdcdc en colonne, et #4e4e4e / #808080 en sombre. Notak range des noms français (`gris`, `bleu_nuit`) : sans effet visible, à retenir pour l'import et l'export.
- [OK] Couleurs de texte (bleu, vert, orange, rouge, gris) et surlignages (6) : famille note.

---

## M. Animations et délais (ce qui reste)

- M1 [ABSENT] Sons (volume général 0,07, interrupteur dans les réglages) : prise (4 variantes), dépôt (3), dépôt dans un tableau, suppression, erreur (clic sur un outil qu'il faut glisser), ouverture de fenêtre, case cochée et décochée, bascule, nouvelle tâche, réaction, ligne reliée, commentaire d'un autre qui arrive, sélection et désélection d'un autre. Notak : écarté volontairement (`docs/FONCTIONNALITES.md`, « salle blanche »).
- M2 [OK] Rebond 0,4 s, bulle « glisse-moi » 700 ms de délai et 5 s de durée.
- M3 [DIFFÉRENT] Étiquette de personne : pop 0,3 s ouverture (0,4 s avec dépassement), fermeture 0,2 s ; nom qui s'ouvre en 0,4 s avec 0,35 s de délai. Notak : sans objet (pas de pastille).
- M4 [DIFFÉRENT] Fenêtres modales : fondu de fond 0,2 s, échelle de la boîte de 0,97 à 1 en 0,2 s (sauf le plein écran d'un élément, sans transition). Notak : à relever dans les familles concernées.

---

## Top 15 des écarts les plus visibles

1. **Menu du clic droit** (I1, I2) : ordre et contenu des deux menus (Supprimer en tête de bloc, Renommer, entrées en trop « Ouvrir », « Modifier », « Mettre dans les non triés », « Raccourcis clavier », liste de création trop longue, Annuler/Rétablir jamais retirés, pas de sous-menu d'arrière-plan, pas de métadonnées avec avatar).
2. **Lasso** (C) : trait et fond gris neutres (#8d929a, noir 5 %) chez Milanote, bleu d'accent chez Notak.
3. **Trait d'insertion et zones de dépôt** (E) : #323b4a, extrémités carrées, pleine largeur, absent si le dépôt ne change rien ; Notak : bleu arrondi, retrait de 8 px, toujours là.
4. **Paquet glissé qui rétrécit** (E) : 0,8 d'échelle et 75 % d'opacité sur un tableau, la corbeille, le fil d'Ariane, 75 % sur une colonne, avec rebond de 0,3 s.
5. **Élément choisi par un autre** (A2) : pastille avec prénom, pulsation, croix de désélection forcée, filet collé au bord, et exclusivité de choix et d'édition.
6. **Poignées de taille** (D1, D2) : pas de poignée sur les tâches, tableaux, documents, clones ; une poignée par élément choisi en groupe ; échelles x et y indépendantes ; fin animée et en cascade.
7. **Suggestions sous l'élément** (K2) : « Convertir en document ? » à 48 UG, « copie synchronisée ? » après une duplication, « titre ? » et « supprimer les tâches terminées ? » sur les listes.
8. **Pastilles d'activité non vue** (K4) : point orange de 7 px, pastille « New » ou compteur sur un tableau, infobulle avec l'auteur et l'âge.
9. **Style des tuiles de la barre de sélection** (H) : 32 px clair sur la barre contre 44 × 40 px sombre ; contour de 2 px au lieu d'un fond pour « actif » ; tuile grisée ; flèche retour en bande de 25 px ; glissement à ressort entre listes.
10. **Couper / coller** (F) : couper masque sans corbeille et le collage déplace le même élément ; coller dans une colonne choisie, en tête ; Cmd+Retour arrière.
11. **Cmd+Entrée par type** (B) : document à droite, table et ligne et image sans effet, commentaire sous lui, tout le reste en note ; Alt+Entrée (note en tête de colonne, titre de liste).
12. **Entrée et Espace** (G) : Entrée ouvre l'image, édite la dernière tâche, édite le titre d'un tableau ; Espace ouvre document et croquis et ferme le plein écran.
13. **Arrière-plan du tableau** (I2) : couleur personnalisée, couleurs nommées du canevas (#dceaf6, #d9ebe6, #f0eedf, #e5e3e8), grille de points activable, retour au défaut.
14. **Empreinte et source pendant un glisser** (A2) : empreinte pleine noir 4 % sans trait, élément qui reste dans la colonne jusqu'au dépôt, original à 40 % avec Alt ; marque de cible (filet #323b4a) sur colonne repliée et zone vide.
15. **Détails de palette et d'état** : palette claire propre aux colonnes (#dcdcdc, #7be6d5, #92e36b…), tons secondaires sur fond coloré, filet d'édition qui se resserre de 2 px (à confirmer), liseré de survol des transparents à 10 % partout, anneau de contraste retiré sur les fonds colorés.
