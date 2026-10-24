# Notak · la carte mentale, d'après Xmind

Ce que la carte mentale de Notak doit faire, écrit d'après la lecture de Xmind 26.05 (octobre 2026) : son
client Electron, ses menus, ses fichiers de langue, ses modèles `.xmind` et son format de fichier. Comme
`docs/SPEC.md` pour Milanote, ce document décrit des **comportements**. Aucun code, aucune icône, aucun thème
ni aucun texte de Xmind n'est repris ; seuls les noms de champs du format `.xmind` le sont, pour qu'on puisse
ouvrir et rendre ces fichiers.

Les décisions propres à Notak, quand elles s'écartent de Xmind, sont marquées **→ Notak**.

---

## 1. L'objet

- Une carte mentale est un **arbre de sujets** qui part d'un **sujet central**. Les enfants directs du central
  sont les **sujets principaux**, tous les autres des **sous-sujets**.
- À côté de l'arbre vivent des **sujets flottants** (détachés, posés librement), des **relations** (flèches
  entre deux sujets quelconques), des **limites** (cadre autour d'une plage de frères), des **résumés**
  (accolade qui rassemble une plage de frères vers un sujet de résumé) et des **zones** (cadre libre).
- Xmind range plusieurs cartes (« feuilles ») dans un fichier. → Notak : une carte mentale est **un élément
  de la toile**. Chaque feuille d'un `.xmind` importé devient un élément ; on pose plusieurs éléments là où
  Xmind ouvrirait plusieurs feuilles.
- → Notak : sur la toile, l'élément montre la carte en réduction ; un double-clic l'ouvre en grand, où l'on
  édite. Le type s'appelle `arbre` (le mot « carte » désigne déjà la carte d'un élément).

## 2. Structures

Une structure dit comment les enfants d'un sujet se disposent. Elle se choisit pour la carte (sur le central)
et peut changer sur n'importe quel sujet ; sans choix, un sujet **suit la structure de son parent**.

| Famille | Variantes | Comportement |
|---|---|---|
| Carte | équilibrée, non équilibrée, horaire, antihoraire | Les principaux rayonnent des deux côtés du central. Équilibrée : moitié à droite, moitié à gauche. Non équilibrée : le nombre de branches à droite est un réglage (`right-number`). Horaire et antihoraire : les branches tournent autour du central dans l'ordre. |
| Logique | droite, gauche | Tous les enfants d'un côté, en colonne, centrés verticalement sur le parent. |
| Accolade | droite, gauche | Comme la logique, les enfants rassemblés par une accolade. |
| Organigramme | bas, haut | Les enfants en rang sous (ou au-dessus de) leur parent. |
| Arbre | droite, gauche | Les enfants en colonne décalée sous le parent, reliés par un tronc vertical. |
| Chronologie | horizontale, verticale | Les principaux s'alignent sur un axe, leurs enfants partent alternativement de part et d'autre. |
| Arête de poisson | tête à gauche, tête à droite | Une arête centrale, les principaux en arêtes obliques alternées haut/bas, leurs enfants en arêtes horizontales. |
| Matrice | en lignes, en colonnes | Les principaux sont les lignes (ou colonnes), leurs enfants les cases. |

Réglages de disposition : écart principal (entre parent et enfants) et écart secondaire (entre frères),
**carte compacte** (les branches s'emboîtent au lieu de garder chacune sa bande), **placement libre** (un
sujet glissé garde la position où on le lâche), **chevauchement permis**.

Identifiants du format : `org.xmind.ui.map` (équilibrée), `org.xmind.ui.map.unbalanced`,
`org.xmind.ui.map.clockwise`, `org.xmind.ui.map.anticlockwise`, `org.xmind.ui.logic.right`,
`org.xmind.ui.logic.left`, `org.xmind.ui.brace.right`, `org.xmind.ui.brace.left`,
`org.xmind.ui.org-chart.down`, `org.xmind.ui.org-chart.up`, `org.xmind.ui.tree.right`,
`org.xmind.ui.tree.left`, `org.xmind.ui.timeline.horizontal`, `org.xmind.ui.timeline.vertical`,
`org.xmind.ui.fishbone.leftHeaded`, `org.xmind.ui.fishbone.rightHeaded`, `org.xmind.ui.spreadsheet`,
`org.xmind.ui.spreadsheet.column`. Les variantes que Notak ne connaît pas se lisent comme la famille la plus
proche (`logic-chart.right` → logique droite, `tree.branch-aligned.right` → arbre droite, etc.).

→ Notak : la grille (`org.xmind.ui.grid`) et le tableau-arbre (`treetable`) sont écartés.

## 3. Ce qu'un sujet porte

- **Titre**, sur une ou plusieurs lignes ; une largeur imposée fait passer le texte à la ligne.
- **Note** : texte riche, montrée par une icône sur le sujet et ouverte dans une bulle.
- **Étiquettes** : une liste de mots, montrée sous le titre.
- **Lien** : vers une page web, ou vers un autre sujet de la carte.
- **Image** : posée au-dessus du titre, à une taille réglable.
- **Marqueurs** : de petites icônes devant le titre, une seule par groupe (le panneau d'icônes, § 9) :
  - priorité 1 à 9 ;
  - avancement : début, ⅛, ¼, ⅜, ½, ⅝, ¾, ⅞, fait, en pause ;
  - drapeaux, étoiles, personnes et pastilles, en couleurs ;
  - visages, flèches, symboles, mois, jours.
- **Tâche planifiée**, **pièce jointe**, **note audio**, **équation**, **autocollant**, **illustration** : posés par la barre
  d'outils et le menu « + » (§ 11).
- **Tâche** : case à cocher (à faire, fait).
- **Numérotation** des enfants : 1, 2, 3 ; I, II, III ; A, B, C ; a, b, c ; à plusieurs niveaux ou non.
- **Rang d'importance** : important, secondaire, ou barré (dépassé).
- **Repli** : un sujet replié cache ses descendants et montre leur nombre dans une pastille.

## 4. Gestes

**Créer**

| Touche | Geste |
|---|---|
| Tab, Insert | Sous-sujet (enfant), sélectionné et en édition |
| Entrée | Sujet frère après ; sur le central, un sous-sujet |
| Maj+Entrée | Sujet frère avant |
| Cmd+Entrée | Sujet parent : s'intercale entre le sujet et son parent |
| Double-clic dans le vide | Sujet flottant |
| Maj+Cmd+R | Relation depuis le sujet choisi ; on clique ensuite la cible |
| Maj+Cmd+B | Limite autour des sujets choisis |
| Résumé (menu) | Résumé des sujets choisis |

**Éditer**

| Touche | Geste |
|---|---|
| Espace, F2, ou taper une lettre | Éditer le titre (la lettre remplace le titre) |
| Entrée ou Échap dans le titre | Valider ; Maj+Entrée va à la ligne |
| Suppr, Retour arrière | Supprimer le sujet et ses descendants |
| Cmd+Retour arrière | Supprimer le sujet seul ; ses enfants remontent à sa place |
| Cmd+D | Dupliquer la branche après elle |
| Maj+Cmd+N, Maj+Cmd+L, Cmd+K | Note, étiquette, lien |
| Cmd+1 … Cmd+7 | Priorité 1 à 7 (la même touche l'ôte) |
| Maj+Alt+1, 2, 3, 0 | Important, secondaire, barré, ordinaire |
| Cmd+Z, Maj+Cmd+Z | Annuler, rétablir |

**Naviguer et ranger**

| Touche | Geste |
|---|---|
| Flèches | Aller au voisin dans la direction (dans l'espace de la carte, pas dans l'ordre de l'arbre) |
| Maj+flèches | Étendre la sélection |
| Alt+Haut/Bas | Échanger avec le frère d'avant / d'après |
| Cmd+/ | Replier ou déplier la branche |
| Cmd+Alt+/ | Tout replier ou tout déplier |
| Alt+Cmd+1 … 9 | Déplier jusqu'au niveau N, replier au-delà |
| Cmd+R | Revenir au sujet central (sélection et cadrage) |
| Cmd+; | Afficher seulement la branche choisie ; la même touche revient à la carte |
| Cmd+= / Cmd+- / Cmd+0 | Zoom, et taille réelle |
| Cmd+F | Chercher dans la carte |

- **Glisser un sujet** sur un autre le rattache comme enfant ; entre deux frères, il s'y insère. Glisser hors
  de tout sujet en fait un sujet flottant. Maintenir Maj pendant le glisser inverse ce comportement.
- → Notak : les touches se lisent sur le caractère tapé (`event.key`), pour qu'elles tombent juste en AZERTY.

## 5. Habillage

- **Formes de sujet** : rectangle, rectangle arrondi, ellipse, cercle, souligné, double souligné, losange,
  hexagone arrondi, nuage, parallélogramme, sans bordure.
- **Branches** : courbe, droite, coudée, coudée arrondie, pliée, sans trait ; épaisseur ; **effilée** (le
  trait s'amincit du parent vers l'enfant) ; motif plein, tirets, pointillés.
- **Couleurs de branche** : chaque branche principale prend une couleur d'une liste de six, que ses
  descendants héritent (« branches arc-en-ciel ») ; ou une seule couleur pour toutes.
- **Texte** : police, taille, gras, italique, souligné, barré, couleur, alignement.
- **Remplissage et bordure** de sujet : couleur, épaisseur, motif.
- **Thèmes** : un jeu cohérent de tous ces réglages par rang (central, principal, sous-sujet, flottant,
  résumé), plus le fond de la carte. → Notak : nos propres thèmes, dans nos couleurs.
- **Appliquer aux sujets du même rang**, **réinitialiser le style**, copier et coller un style.
- **Relations** : courbe, droite, coudée ; pointe au départ, à l'arrivée ou aux deux ; deux points de contrôle
  déplaçables ; un titre au milieu.
- **Limites** : rectangle, rectangle arrondi, polygone, vagues, festons ; un titre facultatif.
- **Résumés** : accolade ronde, carrée, crochet, droite.

## 5 bis. L'onglet Style

**Le cadre du panneau de côté** (`panneau-cote.css`, commun aux onglets Style, Présentation, Carte et au panneau
d'icônes) : 268 de large, posé à 8 du haut, de la droite et du bas, rayon 18. Le **rail d'onglets** : marge `8 12 0`,
padding 4, onglets de 25 de haut, soit 33 en tout, rayon 24, pastille de l'onglet choisi (graisse 600) sur un rail gris ;
un filet de 1 × 16 entre deux onglets, caché contre le choisi. Le corps du panneau **ne met aucune marge** : chaque onglet
pose les siennes, **20 de chaque côté** (228 utiles), des sections de `12 20`, des séparateurs de 1 avec une marge de 8
(onglet Style) ou 20 (onglet Présentation). Hauteur de tout contrôle : 24 ; rangée courte = libellé à gauche **sur une
seule ligne** (13/17, coupé par « … » avec son texte en infobulle s'il ne tenait pas) et contrôle de 72 à droite ; rangée
longue = légende de 11/15 puis contrôle sur les 228. Le panneau porte encore la classe de l'ancien panneau
(`notak-arbre-panneau`), dont les règles arrivent par descendance : les règles des onglets sont donc préfixées
`.notak-arbre-fond` pour les battre (sans quoi les sections se collent aux bords et les listes prennent la pleine
largeur).

Le panneau de côté a trois onglets (Style, Présentation, Carte). **Style** règle ce qui est choisi ; la sélection dit
la vue : un sujet (central, principal, sous-sujet, flottant), plusieurs sujets, une relation, une limite, le sujet
d'un résumé, ou rien (« Sélectionner un objet à formater. »). Un mélange (un sujet et une relation) donne l'état vide.
Chaque contrôle passe par un geste de la carte (donc l'historique), montre la valeur **effective** (celle du rendu,
thème compris), « Multiple » quand les objets diffèrent, et se grise quand il ne s'applique pas.

**Sujet**, de haut en bas :

- **Style rapide** (principal, sous-sujet, flottant, seuls ou du même type) : une vignette et quatre choix, Très
  important, Important, Barré, Par défaut (`importantTopic`, `minorTopic`, `expiredTopic`, ou rien).
- **Forme** : la forme (quatre groupes : 12 basiques, 13 avancées, 7 de ponctuation, 15 d'organigramme ; les 12
  premières d'abord, puis « Plus de formes »), le remplissage (six motifs : plein, plein à main levée, diagonales,
  diagonales fines, horizontales, horizontales fines, ou aucun) et sa couleur, la bordure (plein, tirets, main levée,
  tirets à main levée, ou aucune), sa couleur et son épaisseur (1, 2, 3, 5, 8 pt), puis la **longueur** (largeur imposée
  en px, « Adapter » la retire).
- **Texte** : police, taille (1 à 200), style de police (graisse de 100 à 900, avec italique), couleur, gras, italique,
  barré, souligné, casse (MAJUSCULES, minuscules, Mettre en majuscules), alignement.
- **Structure** : la famille (carte mentale, logique, accolade, organigramme, arbre, chronologie, arête de poisson,
  matrice), sa variante (grisée tant que le sujet suit son parent), « Suivre la structure du sujet parent ».
- **Branche** : la forme de la ligne (coude arrondi, coude, droite, courbe, anse, pli, pli arrondi), son motif (sept,
  ou aucun), la pointe de fin (onze), l'épaisseur (cinq, plus cinq effilées pour la courbe et la droite) et la couleur.
  Sur le central seul : **Branche colorée** (bascule) et la série de couleurs des branches principales.
- **Numérotation** (principal, sous-sujet) : 1.2.3., A.B.C., a.b.c., I.II.III. ; « Appliquer aux sujets frères » ;
  numéros échelonnés ; commencer depuis le début.
- **Mettre à jour** (appliquer le style de ce sujet à tous les sujets de son niveau, ou à tous ses sous-sujets) et
  **Réinitialiser le style**, visibles seulement quand ils servent.

Des règles lient des réglages : « aucune bordure » met l'épaisseur à 0, un motif choisi à 0 la remet à 2 ; une couleur de
remplissage choisie sans remplissage le rend plein ; « aucune » ligne de branche met l'épaisseur à 0.

**Relation** : forme (courbe, droite, anguleuse, zigzag, et leurs trois « souples »), pointe de début, motif de ligne
(sept), pointe de fin, épaisseur, couleur, texte. **Limite** : forme (rectangle, rectangle arrondi, polygone, festons,
vagues, tension, polygone arrondi, focus, croix), remplissage (opacité de la couleur plafonnée à 20 %), bordure (sept
motifs), épaisseur, texte. **Résumé** : ligne (angle, carré, ronde, accolade, droite ; motif, couleur, épaisseur), sujet
du résumé (comme un sujet), texte, branche.

**Sélecteur de couleur** : un bouton de 72 × 24 px (barré d'un pointillé s'il n'y a pas de couleur, trois points s'il y en a
plusieurs) ; son popover offre un nuancier de 9 × 5 (45 couleurs), un champ hexadécimal (les caractères non
hexadécimaux valent 0, trois chiffres se doublent, plus de six donnent blanc), l'opacité (stockée en canal alpha
`#rrggbbaa`), la couleur du système, « Par défaut », les couleurs du thème et les neuf dernières utilisées.

→ Notak : pas de badge PRO ni de bouton « Upgrade » : tout est libre. Pas de bulle (callout), de zone, de cellule de grille ni
de vue Image (Notak n'a pas ces objets). Les 45 couleurs du nuancier, les formes, les pointes et les vignettes sont à nous ;
la police de Xmind (NeverMind) n'est pas reprise, Notak garde la sienne et propose des polices que tous les systèmes ont.
La numérotation se règle sur le sujet dont elle numérote les enfants. Les relations « souples » se tracent comme leurs
sœurs. Le **style rapide** d'un sujet de rang « important » reste celui des rangs d'importance de Notak (pas les
couleurs du thème de Xmind). L'ordre de la liste de variantes de structure est celui de Notak.

Dans le `.xmind`, le style d'un sujet, d'une relation, d'une limite et d'un résumé est écrit dans `style.properties`
(`shape-class`, `fill-pattern`, `svg:fill`, `border-line-*`, `fo:*`, `line-class`, `line-pattern`, `line-width`,
`line-tapered`, `line-color`, `arrow-begin-class`, `arrow-end-class`, `multi-line-colors`) ; `customWidth` porte la
largeur imposée. Une propriété que Notak ne règle pas, ou qu'il ne sait pas lire, reste dans le fichier et en ressort
telle quelle. À valider contre un fichier sauvegardé par Xmind : la valeur de `line-tapered`, et la clé `startsHere` de
« commencer depuis le début ».

## 6. Modes

- **Plan** (Maj+Cmd+M) : la même carte en liste indentée. Entrée crée un frère, Tab indente, Maj+Tab
  désindente, Cmd+/ replie. On revient à la carte par la même touche.
- **Zen** (Cmd+Alt+F) : la carte seule, plein écran, sans barre.
- **Présentation** (Cmd+Alt+P) : le mode Pitch, une diapositive par sujet (§ 11). Espace et flèche droite
  avancent, flèche gauche recule, Échap sort.
- **Afficher la branche seule** (Cmd+;) : la branche choisie devient la seule visible, comme une carte à part.

→ Notak : le Gantt, l'IA, les commentaires et la collaboration propres à Xmind et la vidéo web sont écartés :
Notak a déjà ses propres moyens à plusieurs. La note audio, elle, est reprise (§ 11).

## 7. Le format `.xmind`

Un `.xmind` est un **zip**. Notak lit et écrit :

- `manifest.json` : `{"file-entries": {"content.json": {}, "metadata.json": {}, …}}`.
- `metadata.json` : `{creator: {name, version}, dataStructureVersion: "3", activeSheetId}`.
- `content.json` : un **tableau de feuilles**.
- `resources/<nom>` : les images, appelées depuis un sujet par `xap:resources/<nom>`.
- `Thumbnails/thumbnail.png` : facultatif, Notak l'écrit si l'aperçu est disponible.

Les anciens fichiers (Xmind 8) n'ont qu'un `content.xml` : → Notak ne les lit pas et le dit.

**Feuille** : `id`, `class: "sheet"`, `title`, `rootTopic`, `relationships[]`, `topicPositioning`
(`"free"` = placement libre), `topicOverlapping` (`"overlap"`), `compactLayoutModeLevel` (`"Second"` = compacte, `"Third"` =
normale), `floatingTopicFlexible`, `floatingTopicAutoColor`, `relationshipAutoColor`, `topicNotesDisplay`, `theme`,
`style`. Les clés que l'onglet Carte règle sont au § 9.

**Sujet** :

| Champ | Sens |
|---|---|
| `id`, `title` | identifiant, titre |
| `structureClass` | structure (§ 2), absente = suit le parent |
| `children.attached[]` | enfants dans l'arbre |
| `children.detached[]` | sujets flottants (sur le central seulement), avec `position: {x, y}` relative au central |
| `children.summary[]` | sujets de résumé |
| `boundaries[]` | `{id, range: "(i,j)" ou "master", title?}` : limite sur les enfants i à j, ou sur tout le sujet |
| `summaries[]` | `{id, range: "(i,j)", topicId}` : `topicId` désigne un sujet de `children.summary` |
| `notes` | `{plain: {content}, realHTML: {content}}` |
| `labels[]` | étiquettes |
| `href` | lien ; `xmind:#<id>` vise un sujet |
| `image` | `{src: "xap:resources/…", width, height}` |
| `markers[]` | `{markerId}` : `priority-1`…`priority-9`, `task-start`, `task-oct`, `task-quarter`, `task-3oct`, `task-half`, `task-5oct`, `task-3quar`, `task-7oct`, `task-done`, `task-pause`, `flag-<couleur>`, `star-<couleur>`, `people-<couleur>`, `tag-<couleur>`, `smiley-*`, `arrow-*`, `symbol-*`, `month-*`, `week-*` |
| `branch` | `"folded"` si replié |
| `class` | `importantTopic`, `minorTopic`, `expiredTopic` (barré) |
| `customWidth` | largeur imposée |
| `extensions[]` | `{provider, content}` : `org.xmind.ui.map.unbalanced` → `[{name: "right-number", content: "3"}]` ; `org.xmind.ui.numbering` → `{pattern, tiered}` ; `org.xmind.ui.task` → `{status: "todo"\|"done"}` |
| `style` | `{id, properties}` : `fo:font-*`, `svg:fill`, `shape-class`, `line-class`, `line-color`, `line-width`… |

**Relation** : `{id, end1Id, end2Id, title?, controlPoints?: {"0": {x, y}, "1": {x, y}}, style?}`.

- Un `markerId` inconnu de Notak est **gardé tel quel** et rendu à l'export.
- Un champ inconnu de Notak sur un sujet est gardé dans un sac (`xmind`) et rendu à l'export, pour qu'un aller-
  retour par Notak n'abîme pas un fichier.
- **Ce que Notak ajoute** est rangé dans une extension à nous, que Xmind laisse en l'état : sur un sujet,
  `org.notak.sujet` → `{planning, equation, vignette, tache: "annulee", piece: {nom, type, taille, audio?, src}}` ; sur
  une feuille, `org.notak.arbre` → `{zones, groupes, legende}`. Une pièce jointe s'écrit aussi comme Xmind : `href:
  "xap:attachments/<fichier>"`, le fichier sous `attachments/` ; un autocollant ou une illustration s'écrit en plus
  comme une image SVG (`xap:resources/…`), pour que Xmind la montre, et Notak la relit comme autocollant. Les images
  des marqueurs à soi sont sous `resources/marqueurs/`. Un fichier de Xmind qui porte un `href: xap:attachments/…`
  donne une pièce jointe.
- Les styles et thèmes de Xmind ne sont pas traduits finement : → Notak garde la structure, la forme, la
  couleur de branche et le rang ; le reste revient au thème de Notak.

## 8. La fenêtre de la carte ouverte

Relevé : `notak-chantiers/interface-xmind/1-fenetre-et-barre.md` (copie de Xmind 26.05, non versionnée) et les
captures du même dossier. Code : `elements/arbre/Fenetre.tsx`, `Outils.tsx`, `BarreSujet.tsx`, `repliBarre.ts`,
`geometrieMenus.ts`, `fenetre.css`, `menus.css`.

1. **Cadre.** La carte est une feuille blanche aux coins arrondis, posée dans un cadre gris de 8 px ; les panneaux de
   côté se posent dans ce cadre, à gauche (navigation) et à droite (format ou icônes), et la carte rétrécit d'autant.
2. **En-tête**, en haut à gauche : Accueil (→ Notak : ferme la carte et revient au tableau), le bouton du panneau de
   gauche, puis le titre (15 px, graisse 700). Xmind écrit dessous « Modifié » tant que le fichier n'est pas
   enregistré ; → Notak : tout s'enregistre seul, la ligne n'apparaît qu'en lecture seule.
3. **Barre d'outils**, au centre en haut, pilule de 36 px : Relation, Résumé, Limite, Zone, Étiquette, Tâche, puis
   « + » et son menu Insérer (§ 15). Boutons de 34 × 28, icônes de 24, survol et appui en voile, grisé à 0,3.
4. **À droite** : Partager (→ Notak : exporte la carte en `.xmind`, la collaboration de Notak étant celle du
   tableau), puis la pilule Marqueur (panneau d'icônes, § 13) et Format (panneau à onglets Style, Pitch, Carte) ;
   l'actif est plein, sombre. Pas de bouton « Upgrade » : rien n'est payant dans Notak.
5. **En bas** : la feuille à gauche, l'état de la vue à droite (§ 10).
6. **Repli de la barre** (`repliBarre.ts`, fonction pure testée ; `Outils.tsx` ne fait que mesurer). Quand la place
   manque, la barre replie, dans cet ordre et en s'arrêtant dès que ça tient : le titre, puis Tâche, Étiquette, Zone,
   Limite, Résumé, Relation. Ce qui est replié passe **en tête du menu « + »**, dans l'ordre de la barre, suivi d'un
   séparateur ; le « + » ne se replie jamais. Seuils (zone de la carte, panneau de côté déjà retiré ; titre de 100,
   maison et bouton du panneau de gauche à gauche, export et pilule des panneaux à droite) : tout tient à 646 ;
   titre replié sous 646 ; puis 534, 500, 466, 432, 398, 364, 330 pour 0 à 6 boutons repliés ; sous 330, même le « + »
   seul ne tient pas, la barre se retire. Un seul seuil par niveau, dans les deux sens (pas d'hystérésis), comme Xmind.
   La pilule est centrée sur la zone, poussée vers le côté libre si le titre ou les pastilles de droite la touchent,
   avec 16 de vide au moins : elle ne recouvre rien, panneau ouvert ou non. Le panneau de côté ouvert rétrécit la zone,
   donc fait replier. → Notak : Xmind replie aussi Partager, les panneaux et Accueil dans un bouton à double chevron ;
   ici ils restent à leur place (ils appartiennent à `Arbre.tsx`), seule la barre cède.
7. **Le bouton « + »** : 48 × 28, le plus (24) et son chevron (12) calés au milieu, fond gris en pilule tant que le menu
   est ouvert. Son menu s'ouvre au bord gauche du bouton, 6 px sous lui (au-dessus s'il n'a pas la place dessous),
   sans jamais le recouvrir (`poserMenu`, `geometrieMenus.ts`), dans la fenêtre de la carte et non dans la pilule : le
   flou du menu voit la carte. Un clic sur le bouton le ferme ; Échap, un clic dehors et le redimensionnement aussi.
8. **Barre du sujet** (`BarreSujet.tsx`, capture 20) : une pilule blanche ombrée qui flotte 8 px au-dessus du sujet
   choisi, centrée sur lui, boutons de 32 × 28 : relation, lien web, image, note, tâche (la case à faire), puis un
   filet et le pinceau de style. Pas « Grow Ideas » (IA payante). Elle reste dans la zone, passe sous le sujet si le
   haut est sous la barre d'outils, ne prend pas le focus et ne laisse rien traverser (un appui dessus ne désélectionne
   pas). → Notak, **pas encore montée** : `<BarreSujet x y bas? actions inactifs? />` attend que `Arbre.tsx` la pose
   dans la surface, avec `x, y` le milieu du bord haut du sujet choisi et `bas` son bord bas, et relie `actions`
   (`relation`, `lienWeb`, `image`, `note`, `tache`, `style`) à ses éditeurs (`insertions.actions`, `relier`,
   `copierStyle` / `collerStyle`).

## 9. L'onglet Carte du panneau de format

Le panneau de droite de Xmind a trois onglets (Style, Présentation, Carte). Celui de la carte règle la **feuille
entière** et ne dépend pas de la sélection. Ses blocs, de haut en bas, séparés par un filet :

1. **Squelette** : une carte large (la vignette de la structure courante, le **nom de son groupe**, un chevron).
2. **Thème de couleur** : un sélecteur (six segments, le nom du groupe), le bouton « + », puis les variantes du groupe.
3. **Arrière-plan** : une pastille (en Xmind « Couleur de l'arrière-plan » ; le libellé de Notak est raccourci pour tenir sur une ligne à côté des 72 px du contrôle).
4. **Police globale**, **Largeur de la ligne de branche**, **Branche colorée** et sa couleur.
5. **Style de carte** : Équilibrer la carte, Carte compacte.
6. **Affichage des sujets** : Largeur uniforme (« Uniform Topic Length » de Xmind), Afficher toutes les notes, Flottants colorés auto (libellés raccourcis comme ci-dessus).
7. **Relation** : Couleur ligne suit sujet.
8. **Avancé** : Branches libres, Sujet flottant flexible, Chevauchement des sujets.
9. **Police CJK**, et le bouton **Thèmes personnalisés**.

Ce qu'un réglage efface en passant, Xmind le fait sans confirmer, et Notak aussi : une police globale retire les
polices posées sujet par sujet ; une largeur de ligne retire les largeurs et les effilements posés ; un thème de
couleur retire les couleurs posées à la main, le fond choisi et le jeu de couleurs ; un squelette retire les
structures posées sur les sujets principaux ; éteindre les branches libres remet chaque sujet à sa place ; allumer
les flottants colorés retire leur remplissage choisi. Chaque réglage est un geste (`modele/reglages.ts`) : il
passe par l'historique, et un seul annuler le défait.

| Réglage | Dans Notak (`Arbre`) | Clé de la feuille `.xmind` |
|---|---|---|
| Squelette | structure du central (et plus de structure sur les principaux) | `rootTopic.structureClass` |
| Thème de couleur | `theme`, `themePerso`, et `couleurLigne` + `options.uneCouleur` pour une variante à une couleur | `theme.colorThemeId` (non écrit, voir plus bas) |
| Couleur de l'arrière-plan | `fond` (`#rrggbb`, ou `#rrggbbaa`) | `style.properties["svg:fill"]` |
| Police globale | `police` | `theme.global.properties["fo:font-family"]` |
| Largeur de la ligne de branche | `largeurBranche` (points : 1, 2, 3, 5, 8) | `theme.global.properties["line-width"]` (`"5pt"`) |
| Branches effilées | `effile` | `style.properties["line-tapered"]` (`"tapered"`) |
| Branche colorée, éteinte | `options.uneCouleur` | `style.properties["multi-line-colors"]` = `"none"` |
| Jeu de couleurs des branches | `jeuCouleurs` | `style.properties["multi-line-colors"]` = couleurs séparées par des espaces |
| Couleur de ligne (branche colorée éteinte) | `couleurLigne` | `rootTopic.style.properties["line-color"]` |
| Équilibrer la carte | structure du central : `carte-horaire` (allumée) ou `carte-libre` | `rootTopic.structureClass` (`clockwise`, `unbalanced`) |
| Carte compacte | `options.compacte` | `compactLayoutModeLevel` = `"Second"` |
| Justifier l'alignement du sujet | `options.uniforme` | `rootTopic.style.properties["alignment-by-level"]` = `"actived"` |
| Afficher toutes les notes | `options.toutesNotes` | `topicNotesDisplay` = `"block"`, et `notesDisplay` sur chaque sujet à note |
| Colorier sujet flottant auto | `options.flottantsColores` | `floatingTopicAutoColor` = `"follow-color-theme"` |
| Couleur ligne suit sujet | `options.relationsColorees` | `relationshipAutoColor` = `"follow-target-topic"` |
| Branches libres | `options.libre` | `topicPositioning` = `"free"` |
| Sujet flottant flexible | `options.flottantSouple` | `floatingTopicFlexible` = `true` |
| Chevauchement des sujets | `options.chevauchement` | `topicOverlapping` = `"overlap"` |
| Police CJK | `policeCjk` | `style.properties["cjk-font-family"]` |

Une option éteinte n'écrit pas sa clé, et une clé absente se lit comme éteinte. Les cartes d'avant n'ont aucun de ces
champs : elles gardent leur apparence. Ce que Notak ne lit pas de la feuille (le thème et le style de Xmind, ses
extensions) est gardé dans `Arbre.xmind` et rendu à l'export ; ce que l'onglet règle l'emporte sur ce sac.

**Squelette.** Xmind en compte 60, en dix groupes, chacun portant une structure *et* un style complet.
→ Notak : un squelette est une structure, celle du sujet central, rangée dans huit groupes (carte mentale, diagramme
logique, carte d'accolade, organigramme, arbre graphique, chronologie, arêtes de poisson, matrice) ; le tableau-arbre
et la grille sont écartés (§ 2). Les vignettes sont calculées par le moteur de mise en page de la carte, sur un
exemple de sept sujets, et la carte du squelette nomme le groupe, jamais la structure. La fenêtre (388 × 450) s'ouvre
à gauche du panneau, ses groupes se replient, et elle ne se ferme pas au choix.

**Thème de couleur.** Un groupe a ses variantes : celle à branches de couleur, puis une par couleur d'accent (six au
plus). Un clic sur un groupe prend sa première variante, ou la dernière qu'on y a prise dans la session ; sur le
groupe courant, la variante suivante (« Alterner »). La fenêtre (316 × 370) a des onglets Favori, Ma couleur, Coloré
et Classique, les deux premiers n'existant que s'ils ont de quoi montrer.
→ Notak : douze thèmes à nous (Xmind en a quarante-trois), aux couleurs de Notak, rangés en Coloré et Classique.
Les favoris, les thèmes de couleur à soi et les thèmes personnalisés sont des préférences de la personne, dans le
navigateur ; la carte garde ce qu'elle utilise (`themePerso`, ses réglages), pour voyager seule. Le thème de Notak
n'est pas écrit dans le `.xmind` : Xmind le relirait comme un thème inconnu.

**Boîte de thème de couleur** (« + », 540 × 480). Six cases qui se remplissent dans l'ordre (seules les cases remplies
et la première vide sont ouvertes), un nom (« Personnalisé », « Personnalisé 2 »…), l'aperçu des variantes que ces
couleurs donnent, Annuler et Enregistrer (inactif sans nom ou sans les six couleurs). Enregistrer n'applique pas le
thème : il rejoint l'onglet Ma couleur, dont un clic droit propose Modifier, Renommer, Dupliquer, Supprimer.

**Nuancier.** Une grille de 45 couleurs sur neuf colonnes (neuf neutres, puis quatre rangées de teintes), un champ
hexadécimal (« abc » devient « aabbcc », un hexa trop court est complété de zéros), l'opacité, le sélecteur natif,
puis les couleurs du thème et les récentes. Une case émet et ferme ; l'hexa et l'opacité émettent à Entrée ou en
quittant le champ. → Notak : le sélecteur natif émet quand on le lâche, pas à chaque mouvement (l'historique
se noierait) ; un lien « Couleur du thème » retire la couleur choisie du fond.

**Branche colorée.** Allumée : un sélecteur de jeu de couleurs (un anneau de six secteurs ; le jeu du thème d'abord,
puis neuf jeux à nous). Éteinte : une pastille, la couleur de toutes les branches (`couleurLigne`).

**Largeur de ligne.** Par défaut, cinq niveaux (très fin 1 pt, mince 2, moyen 3, gras 5, très gras 8), puis les mêmes
effilés. L'effilement vaut pour les branches du central.

**Carte compacte.** → Notak : les marges de chaque rang et l'écart du central à ses principaux se resserrent, avec
les écarts entre frères. L'emboîtement des branches de Xmind n'y est pas.

**Justifier l'alignement du sujet.** Les sujets d'un même niveau prennent la largeur du plus large ; le central,
les flottants et les résumés gardent la leur.

**Afficher toutes les notes.** Le texte de la note se montre sous le titre, huit lignes au plus (la suite se coupe en
« … ») ; un clic dessus rouvre la note.

**Avancé.** Branches libres : seulement pour les structures de la famille carte (la bascule est grisée ailleurs).
→ Notak : Sujet flottant flexible : un flottant glissé ne se rattache à rien ; Maj suspend le réglage le temps du
geste. Chevauchement des sujets : un sujet lâché *sur* un autre y reste (Xmind ne montre pas de comportement visible
pour ce réglage dans son panneau) ; l'insertion à côté d'un frère reste possible, et Maj redonne le rattachement.

**Thèmes personnalisés.** Une vue secondaire (une barre de titre avec une croix remplace la barre d'onglets) : une
tuile « Créer un thème » qui garde le style actuel de la carte (thème, fond, polices, largeur, couleurs, densité), puis
chaque thème gardé. Un clic l'applique à la carte, un clic sur le nom le renomme, un clic droit ouvre Mettre à jour,
Renommer, Dupliquer, Supprimer. → Notak : pas d'éditeur de thème à part, « Modifier » devient « Mettre à jour d'après
la carte » ; la vue ne se ferme pas toute seule quand on choisit un sujet. Un thème règle l'aspect, pas le
comportement : branches libres, chevauchement et flottant flexible restent à la carte.

→ Notak : ni bouton « Upgrade », ni badge PRO : tout est libre. Pas de voile « rendu en cours » : le calcul est
assez rapide pour s'en passer.
## 10. La barre du bas

Deux pastilles flottantes au bas de la carte ouverte (36 de haut, à 16 du bord). Quand la fenêtre se resserre, le
compteur, le zoom, le Gantt puis les modes s'effacent dans cet ordre, puis les deux pastilles.

- **Feuille** (pastille de gauche) : l'onglet de la feuille, son titre en 13/17 gras, un chevron au survol qui ouvre
  son menu (Renommer · Dupliquer · Supprimer · Nouvelle feuille · Enregistrer la feuille en tant que…), un « + ».
  Double-clic : renommer en place.
  → Notak : **une feuille est une carte posée sur la toile** (le `.xmind` importé en pose une par feuille), donc un
  élément « Carte mentale » n'a qu'une feuille. « + » et « Nouvelle feuille » posent une carte neuve à droite de celle-ci
  et l'ouvrent ; « Dupliquer » en pose une copie ; « Supprimer » reste grisé (la corbeille de la toile est le moyen) ;
  « Enregistrer la feuille en tant que… » exporte en `.xmind`. Pas de défilement des onglets, ni de glisser pour les
  ranger, ni de copier-coller de feuille : rien à ranger avec une seule feuille. Changer le modèle pour plusieurs
  feuilles par élément demanderait un second jeu de clés dans `arbres` (`coeur/arbresYjs.ts`) : écarté pour ne pas
  casser les cartes et les serveurs d'avant.
- **Compteur** : « Sujets: n », ou « Sujets: s / n » avec une sélection, dans une largeur réservée (la barre ne saute
  pas). Un clic ouvre un popover : sujets, mots, caractères (titres et notes). Absent dans le plan.
- **Zoom** : le pourcentage et un menu à cases (500, 400, 300, 200, 150, 120, 100, 80, 50, 20, 10 ; le zoom courant,
  coché, s'y ajoute s'il n'est pas un palier), puis « Ajuster la carte ». Dans le plan : 300 à 80, sans « Ajuster ».
  Le zoom va de 10 à 500 %.
- **Quatre boutons** : Diagramme de Gantt, plan (« Aperçu » chez Xmind), Zen, Pitch. Dans le plan, le bouton du plan
  devient « carte mentale », le Zen disparaît et le Gantt reste grisé. Il n'y a pas de bouton « notes » dans la barre
  du bas : les notes sont dans le panneau de gauche (§ 10).
  → Notak : **le Gantt est affiché, grisé** (c'est une vue entière, hors de cette passe). Zen : plein écran, la carte
  seule. Pitch : § 11. Les infobulles sont du texte simple ; les raccourcis sont ⇧⌘M (plan), ⌥⌘F (Zen), ⌥⌘P (Pitch).
- **Le plan** remplace la carte : une page de 832 de large au plus, centrée. Central en 32/38 gras, principaux en 24/31
  gras, les autres en 16/1,6 ; 24 d'indentation par niveau ; une puce de 6 px, ou un chevron dans un carré de 20 (tourné
  de −90° quand le sujet est replié, avec une pastille du nombre de sujets cachés) ; les étiquettes et la note sous le
  titre ; les sujets flottants après un trait.

## 11. Le panneau de gauche

Une carte flottante de 378 de large (à 8 du haut, du bas et du bord), trois onglets en capsule, une croix. La carte se
cale contre elle quand elle est ouverte.

- **Ouverture** : ⌘[ (symétrique de ⌘] pour le format), ou le bouton « panneau de gauche » à côté de l'accueil.
  → Notak : Xmind l'ouvre par le menu Affichage (« Afficher le menu de navigation »), qui n'existe pas ici ; le relevé
  ne donne pas son raccourci, ⌘[ est un choix de Notak.
- **Plan** (« Aperçu » chez Xmind) : un champ de recherche (engrenage : mots entiers, respecter la casse), le titre de la
  feuille en 21/27 gras, l'arbre de la carte (repli, étiquettes et lien sous le titre), puis les relations et les limites.
  Un clic choisit le sujet et centre la carte. Avec une recherche, on garde les sujets trouvés et leurs ancêtres.
- **Notes** : toutes les notes de la carte, sous le titre de la feuille entre deux filets ; pour chacune, le titre du
  sujet (15/19 gras) et deux lignes de texte. Un clic va au sujet. « Il n'existe aucune note. » quand il n'y en a pas.
  → Notak : pas de « Chercher et remplacer » ni de « Fichier courant » (une seule carte).
- **Étiquettes** (« Tags » chez Xmind) : les marqueurs, étiquettes et tâches de la carte, avec le nombre de sujets qui
  les portent. Cocher un repère met ses sujets en évidence dans la carte (le reste s'estompe à 20 %) ; fermer le
  panneau décoche tout.
- **La note d'un sujet** (⇧⌘N, ou son icône) s'ouvre en popover de 400 × 280 posé à droite du sujet : gras, italique,
  barré, souligné, listes, lien. Elle s'écrit dans la carte quand on la quitte (Échap, clic dehors).

## 12. Pitch

Le mode présentation : la carte devient une suite de diapositives.

**Les réglages**, onglet Pitch du panneau de droite.
- Une carte garde un **thème** (`slide-appearance`, défaut `default` = sombre) et un **rapport d'aspect**
  (`slide-aspect-ratio` : Auto, 16:9, 4:3, 9:16, 3:4 ; en Auto, celui des quatre qui se rapproche le plus de la fenêtre).
  Sept thèmes : Clair, Sombre, Innocence, Formes, Rose de minuit, Bulles, Carnet. → Notak : les dessins sont les nôtres ;
  les identifiants `light`, `default`, `innocence`, `shape-for-you`, `midnight-rose`, `hubble-bubble`, `hand-drawn` sont
  ceux qu'on écrit dans le fichier.
- Un sujet garde, chacun absent tant qu'on est en « Auto » : `topic-slide-visibility`, `summary-slide-visibility`,
  `list-slide-visibility` (`show` / `skip`), `list-slide-delivery` (`one-by-one-drill-in`, `one-by-one`, `all-at-once`),
  `list-slide-layout` (`brace-list`, `bullet-list`, `lyric-list`, `fishbone`, `timeline`) et
  `topic-slide-image-placement` (`left`, `right`, `aboveTitle`, `belowTitle`, `full`).
  Dans Notak : `Arbre.pitch` (`theme`, `ratio`) et `Sujet.diapo` (`sujet`, `resume`, `liste`, `livraison`, `miseEnPage`,
  `image`), posés par les gestes `pitch` et `diapo` (`null` rend la main à Auto). Dans le `.xmind`, ce sont des
  propriétés de `style.properties` : celles de la feuille sur le sujet central, celles d'un sujet sur lui. Le relevé ne
  dit pas où Xmind les range : → Notak le déduit de leur forme, sans l'avoir éprouvé contre Xmind lui-même. Une valeur
  inconnue reste dans le style, intacte.
- **Les mesures de l'onglet** (relevé 7 § 1.2 à 1.4), de haut en bas : marge haute 12 + 12, titre « Affichage en mode
  présentation » (13/17, 600, 12 dessous), aperçu **227 × 128 centré** (rayon 10), « Changer de thème » **228 × 24** (rayon 6,
  4 au-dessus, 16 au-dessous), rangées de **24**, séparateurs de 1 entre deux marges de **20**. Les listes des rangées
  courtes font **72 × 24** (rayon 8) et montrent « Auto » (le détail « Auto (Visible) » est dans la liste ouverte) ; celles
  des rangées longues (Position de l'image, Livraison) font 228 ; le groupe de mise en page est un groupe segmenté de 228
  (cellules de 24, rayon 6, filet de 12 caché contre la cellule choisie ou survolée). Les libellés de Notak sont plus courts
  que ceux de Xmind en français (« Diapositive du sujet », « Sous-sujets en liste », « Diapositive du résumé ») : à 13 px ils
  doivent tenir dans les 148 px que laisse la liste, là où Xmind réduit sa police à 10 px.
- L'onglet montre l'aperçu de la diapositive du sujet (rejouée au survol, une étape toutes les 2 s), « Changer de thème »
  (le sélecteur : une vignette par thème, deux par ligne), le rapport, puis « Diapositive du sujet » (Auto / Visible /
  Masqué, « Auto » dit ce qu'il décide), « Position de l'image » (si tous les sujets choisis portent une image),
  « Sous-sujets en liste » et, s'il est visible, « Livraison » et « Mise en page » (cinq boutons).
  Avec plusieurs sujets : « Multiple » quand ils diffèrent.

**Les diapositives.** Auto : le central, les principaux et les flottants sont des diapositives, les sous-sujets non ;
un résumé en est une ; un sujet qui est une diapositive et qui a des sous-sujets a aussi une **liste**. L'ordre : le
sujet, sa liste, puis la branche suivante. Une liste déroule ses sous-sujets (en profondeur d'abord, sans descendre
chez celui qui a sa propre diapositive), selon la livraison : tout d'un coup, un par un (le sous-sujet vient avec ses
enfants), ou en descendant dans chacun. La mise en page par défaut est la liste à puces. Au moins une diapositive : le
central.

**La présentation** (⌥⌘P, ou le bouton Pitch). Plein écran quand le navigateur le permet ; elle part du sujet choisi (une
pastille propose de « lire à partir de la première diapositive »). Une barre en haut à droite (quitter, paramètres,
navigation) s'estompe à 15 % après trois secondes. Touches : Espace, Entrée, →, ↓, Pg suiv. avancent ; ←, ↑, Pg préc.
reculent ; ⇧→ passe la branche, ⇧← revient au sujet parent ; Échap et Q quittent ; A bascule l'animation ; ? montre
les raccourcis. Un clic sur la scène avance. La dernière étape franchie, on revient à la carte. L'animation est une
préférence de ce navigateur.
→ Notak : pas de seconde fenêtre ni de **vue du présentateur**, pas de filigrane « Presented with xmind », pas de
limite de cinq diapositives (ces deux-là tiennent à la licence de Xmind), pas de « Présenter dans une fenêtre ».
## 13. Le panneau d'icônes

Le bouton **smiley** (« Marqueur ») ouvre, dans le panneau de côté, trois onglets en capsule : **Marqueur | Autocollant
| Illustration**. Un clic pose sur les sujets choisis (ou le sujet courant) **sans fermer le panneau** ni lui prendre le
focus. Chacun des trois s'ouvre aussi par le menu « + » et le menu d'un sujet.

**Marqueur.**
- **Mesures** : le rail d'onglets du panneau de côté (§ 5 bis) ; le bouton de légende et celui du pied font 24 de haut sur 244 (marge `12 12 0`) ; sous le filet, la zone qui défile a `12 20 48` de padding et ses groupes 12 d'écart ; en-tête de groupe 13/600 avec un chevron plein.
- En tête : **Afficher / Masquer la légende** (le réglage vit dans la carte : `legende.visible`).
- Sept groupes repliables (chevron, ouverts au départ), dans l'ordre : **Étiquette** (7 couleurs), **Priorité** (1 à 7),
  **Tâche** (début, ⅛, ⅜, ½, ⅝, ⅞, fait), **Drapeau**, **Étoile**, **Personnes** (7 couleurs chacun), **Symbole** (16 sur la
  quarantaine que Xmind définit). 58 marqueurs, en grille de 7 colonnes de 26 px (cellule 26 × 26, rayon 4, image 22).
  Pas d'infobulle, comme Xmind ; le nom accessible se lit au lecteur d'écran (« Priorité 3 », « Drapeau rouge »).
- **Un marqueur par groupe** : en poser un remplace celui du groupe ; le cliquer encore l'ôte. Les groupes ne
  s'excluent pas entre eux. Cmd+1 … Cmd+7 posent les priorités.
- **Groupes à soi**, après les groupes de la bibliothèque : « Nouveau groupe » (pied du panneau) en crée un
  (« Groupe sans titre », renommé sur place, Entrée valide, Échap annule) ; son « + » importe des images (PNG, JPEG, SVG,
  20 Mo au plus ; échec : « Échec de l'importation ») ; un groupe vide dit « Cliquez sur + pour ajouter un marqueur. ».
  Clic droit sur un groupe : **Renommer**, **Supprimer** (confirmation : tous les marqueurs partent, jusque sur les
  sujets). Clic droit sur un marqueur à soi : **Sélectionner** (coches rondes, Échap sort), **Déplacer vers ▸** (groupes,
  « Nouveau groupe »), **Supprimer**. Un marqueur à soi ne s'exclut avec aucun autre.
- **Légende** : quand elle est montrée, la carte la dessine à droite (un cadre : le marqueur, ce qu'il veut dire) et le
  panneau liste les marqueurs utilisés, chacun avec un champ pour écrire ce qu'il veut dire.
- → Notak : les dessins sont les nôtres (pastilles numérotées, camemberts, icônes Tabler en blanc sur un disque). Les 9
  groupes que Xmind garde masqués (humeur, flèche, académique, mois, semaine…) restent lisibles et dessinés
  (`MARQUEURS_CACHES`) mais ne sont pas au panneau. Les identifiants des symboles (`symbol-heart`, `symbol-like`,
  `symbol-pushpin`…) sont une reconstitution : un identifiant inconnu est de toute façon gardé tel quel.

**Autocollant.** Un filtre **Catégorie** (Tout, puis 13 catégories : Business, Éducation, Technologie, Humeur, Voyage,
Vacances, Produits quotidiens, Animal, Météo, Sport, Nourriture et boissons, Geste, Autres), des groupes repliables, une
grille de 4 colonnes de 40 px. Un clic pose l'autocollant à la place de l'image du sujet ; on peut aussi le **glisser** sur
un sujet. → Notak : 436 **emojis Unicode**, pas les 468 dessins de Xmind.

**Illustration.** Une recherche (200 ms après la frappe, sur les noms de groupe et de catégorie), puis les **12 groupes**
de Xmind avec leur nombre et trois aperçus ; un groupe s'ouvre (chevron de retour), avec ses sous-catégories (le titre
disparaît s'il n'y en a qu'une) en grille de 3 colonnes de 68 px ; pas de résultat : « Aucun résultat n'a été trouvé. ».
→ Notak : des **icônes Tabler** (MIT) en couleur sur une pastille, 219 au lieu de 349 dessins ; pas de
badge « pro », pas de téléchargement ni de cache disque, pas de bandeau « réseau déconnecté ».

Posé sur un sujet, un autocollant ou une illustration prend la place de l'image (l'un chasse l'autre) ; le champ est
`vignette` (`{genre, id, l, h}`).

## 14. Les menus contextuels

Un clic droit sur la carte ouvre un menu à l'endroit cliqué (`MenuContextuel.tsx`) ; ce qui n'était pas choisi le
devient d'abord, le fond désélectionne. Les entrées grisées restent affichées ; un séparateur en tête, en queue ou
doublé, et un sous-menu vide, sont retirés. Échap, un clic dehors ferment ; les flèches parcourent. Les raccourcis sont
écrits en glyphes du Mac, ou en Ctrl+ ailleurs. Le contenu se construit par `construireMenu` (`menus.ts`), ce que chaque
entrée fait est dans `actionsMenu.ts`.

**Icônes.** Xmind n'en met aucune dans ses menus contextuels (ce sont des menus du système) ; Notak en met une à
chaque entrée, la même pour la même action quelle que soit la cible (Tabler, propositions du relevé 7 § 4.4). `Entree.icone`
est obligatoire : `ICONES_MENU` (`menus.ts`) range un nom du registre (`icones.tsx`, famille `menu…`) par identifiant
d'entrée, et un identifiant sans icône ne compile pas ; un test parcourt tous les menus de toutes les cibles. Écarts
au relevé : Gauche / Centrer / Droite de l'alignement prennent les icônes d'alignement d'objets (comme Haut / Au milieu / Bas),
et « Créer une zone » celle du bouton Zone de la barre.

**Style** (le menu web de Xmind, relevé 7 § 4.2), commun aux menus contextuels, au « + » et aux menus déroulants des
barres : rembourrage 8, entrées de 28 avec 4 d'écart (icône 16 au trait 1,6, discrète, puis le libellé, puis le raccourci
discret aligné à droite ou le chevron d'un sous-menu), rayon 6 pour l'entrée et 14 pour le menu, fond à 70 % sur un flou
de 12, ombre douce, séparateur d'un trait fin en retrait, grisé à 0,3. Le menu reste dans la fenêtre : il glisse, ou se
retourne au-dessus de son bouton ; un sous-menu s'ouvre à droite, à gauche si la place manque, et remonte de ce qui
dépasse en bas (`geometrieMenus.ts`). Survoler une entrée simple ferme le sous-menu resté ouvert à côté.

- **Sujet** : Insérer ▸ (Note, Étiquette, Tâches à faire, Tâche, Lien ▸ Page web / Sujet, —, Pièce jointe, Note audio, —,
  Marqueur, Autocollant, Illustration, Image locale, Équation) · Couper, Copier, Coller, Dupliquer · Supprimer, Supprimer
  le sujet seul, Effacer le texte, Supprimer le marqueur / l'étiquette / le lien (une entrée par genre, ou un sous-menu
  « Supprimer ▸ » s'il y en a plusieurs) · Marquer comme terminé / non terminé / annulé, Supprimer la tâche à faire,
  Supprimer la tâche · Copier / Coller / Réinitialiser le style · Sélectionner ▸ (sous-sujets, frères, même niveau, tout ;
  « tous les résumés » pour un résumé, « tous les sujets flottants » pour un flottant) · Replier / Déplier les sous-sujets,
  Replier / Déplier toutes les sous-branches · Afficher uniquement la branche / Afficher tous les contenus ·
  Aligner le sujet flottant ▸ (gauche, centrer, droite, haut, au milieu, bas, distribuer ; deux flottants au moins,
  trois pour distribuer) · Réinitialiser l'emplacement (principal, placement libre). Sujet de résumé : le menu sans
  Couper, Coller, Dupliquer ni Supprimer le sujet seul. Le central ne se coupe, ne se duplique ni ne se supprime.
- **Fond** : Coller (au point cliqué), Créer une zone, Insérer le sujet flottant (au point cliqué), Insérer la relation,
  Replier / Déplier toutes les sous-branches, Se rendre sur le sujet central, Sélectionner ▸ (flottants, relations,
  résumés, limites, images, équations, zones, tout).
- **Relation** : Modifier, Supprimer, Copier / Coller / Réinitialiser le style (forme et pointes), Réinitialiser la
  position du point, Sélectionner toutes les relations. **Limite** : Modifier, Supprimer, Sélectionner toutes les limites.
- **Zone** : Insérer le sujet flottant, Supprimer (zone et contenu), Supprimer la zone, Effacer le contenu, Ajuster à la taille.
- **Pastilles d'un sujet** : image (Enregistrer sous, Supprimer), équation (Modifier, Supprimer), marqueur (Modifier,
  Supprimer, Mettre en surbrillance : choisit les sujets qui le portent), étiquette (Supprimer, surbrillance), icône de
  note (Modifier, Supprimer, Afficher toutes les notes), lien (Modifier, Supprimer), pièce jointe (Ouvrir, Supprimer,
  Enregistrer sous), tâche planifiée (Modifier, Supprimer), case à faire (Supprimer, Marquer comme annulé / terminé).
- Cmd+C, Cmd+X, Cmd+V, Cmd+A et Alt+Cmd+Z font ce que disent les menus. → Notak : copier et couper mettent la branche
  de côté dans la carte ouverte (pas dans le presse-papiers du système) ; coller la remet sous le sujet choisi, ou en
  flottants au point cliqué.

**Retiré** (une fonction de Xmind que Notak n'a pas) : Développer des idées et Décomposition du travail IA, Masquage des
données, Exporter la branche vers… et Imprimer branche, Organiser ▸ (premier plan, arrière-plan : pas d'ordre de
superposition), Nouvelle feuille à partir du sujet (une carte = un élément), Fichier local et Dossier local du lien,
le menu abrégé d'une bulle (pas de bulles), Prévisualiser, Tourner à gauche et Réinitialiser la taille d'une image,
Afficher / Masquer une note (icône ou bloc), Couper / Copier / Dupliquer d'une zone, Replier une zone, Copier le style
d'une zone ou d'une limite (elles n'ont pas de style), Exporter / Imprimer la zone. Aucun menu en lecture seule.

## 15. Ce que la barre d'outils et le menu « + » insèrent

Le menu « + » : Note, Tâches à faire, Lien ▸ (Page web, Sujet), —, Pièce jointe, Note audio, —, Autocollant,
Illustration, Image locale, Équation ; la barre porte Zone, Étiquette et Tâche. Chaque entrée est active selon la
sélection : Étiquette, À faire, Page web, Autocollant, Illustration dès un sujet ; Tâche, Note, Lien vers un sujet, Pièce
jointe, Note audio, Image locale, Équation pour un seul sujet ; Zone toujours.

- **Zone** : autour des sujets flottants choisis ; sinon le bouton arme un tracé (curseur en croix, Échap annule) et le
  rectangle tracé devient la zone. Elle contient les flottants dont le centre est dedans (sans liste : rien à garder à
  jour) et ils la suivent quand on la tire par son bandeau ou son contour ; titre « Zone », modifiable au double-clic.
  `Arbre.zones`. → Notak : pas de poignée de redimensionnement (« Ajuster à la taille » la refait autour de son contenu),
  pas de couleur au panneau, pas de repli.
- **Étiquette** (Maj+Cmd+L) : un éditeur en popover près du sujet : des pastilles à retirer, un champ (Entrée ou
  virgule ajoute) ; sur plusieurs sujets, il ajoute à tous.
- **Tâche** : un popover : début, fin, durée (jours), avancement (0 à 100). Changer le début ou la durée recalcule la
  fin ; changer la fin recalcule la durée. La ligne sous le titre montre un camembert et « 3 → 9 janv. · 7 j · 40 % ».
  `Sujet.planning`. **À faire** : la case existante, avec en plus l'état annulé (case barrée).
- **Lien** : Page web (Cmd+K) : un champ d'adresse ; Sujet : une liste filtrable des sujets de la carte.
- **Pièce jointe** : le sélecteur de fichiers, le fichier est rangé par `services.fichiers` ; l'icône trombone ouvre le
  fichier. `Sujet.piece`.
- **Note audio** : le micro du navigateur (`MediaRecorder`), un bouton qui commence et arrête, l'écoute avant de garder ;
  le son est rangé comme un fichier (`piece.audio`), l'icône micro rouvre le lecteur. Sans micro ou refusé, le popover le dit.
- **Autocollant, Illustration** : ouvrent l'onglet du panneau d'icônes (§ 9). **Image locale** (Maj+Cmd+I) : le sélecteur
  de fichiers, directement.
- **Équation** : du LaTeX, aperçu à mesure, Cmd+Entrée valide ; dessinée au-dessus du titre. → Notak : **Temml** (MIT,
  168 Ko minifiés, sans police à charger) écrit du MathML que le navigateur dessine ; un LaTeX invalide s'affiche en
  texte rouge dans la carte. `Sujet.equation`.

Chaque élément passe par un geste (`modele/gestes.ts`), se voit dans le rendu (`Dessin.tsx`) et fait l'aller-retour
`.xmind` (§ 7). `zones` et `groupes` sont des dictionnaires de la carte Yjs `arbres` (`CHAMPS_ARBRE`) : deux personnes
qui posent chacune une zone ne s'effacent pas.
