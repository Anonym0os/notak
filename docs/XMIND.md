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
- **Marqueurs** : de petites icônes devant le titre, une seule par groupe :
  - priorité 1 à 9 ;
  - avancement : début, ⅛, ¼, ⅜, ½, ⅝, ¾, ⅞, fait, en pause ;
  - drapeaux, étoiles, personnes et pastilles, en couleurs ;
  - visages, flèches, symboles, mois, jours.
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

## 6. Modes

- **Plan** (Maj+Cmd+M) : la même carte en liste indentée. Entrée crée un frère, Tab indente, Maj+Tab
  désindente, Cmd+/ replie. On revient à la carte par la même touche.
- **Zen** (Cmd+Alt+F) : la carte seule, plein écran, sans barre.
- **Présentation** (Cmd+Alt+P) : le mode Pitch, une diapositive par sujet (§ 11). Espace et flèche droite
  avancent, flèche gauche recule, Échap sort.
- **Afficher la branche seule** (Cmd+;) : la branche choisie devient la seule visible, comme une carte à part.

→ Notak : le Gantt, l'IA, les commentaires et la collaboration propres à Xmind, la note audio et la vidéo web
sont écartés : Notak a déjà ses propres moyens à plusieurs.

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
- Les styles et thèmes de Xmind ne sont pas traduits finement : → Notak garde la structure, la forme, la
  couleur de branche et le rang ; le reste revient au thème de Notak.

## 9. L'onglet Carte du panneau de format

Le panneau de droite de Xmind a trois onglets (Style, Présentation, Carte). Celui de la carte règle la **feuille
entière** et ne dépend pas de la sélection. Ses blocs, de haut en bas, séparés par un filet :

1. **Squelette** : une carte large (la vignette de la structure courante, le **nom de son groupe**, un chevron).
2. **Thème de couleur** : un sélecteur (six segments, le nom du groupe), le bouton « + », puis les variantes du groupe.
3. **Couleur de l'arrière-plan** : une pastille.
4. **Police globale**, **Largeur de la ligne de branche**, **Branche colorée** et sa couleur.
5. **Style de carte** : Équilibrer la carte, Carte compacte.
6. **Affichage des sujets** : Justifier l'alignement du sujet, Afficher toutes les notes, Colorier sujet flottant auto.
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
- L'onglet montre l'aperçu de la diapositive du sujet (rejouée au survol, une étape toutes les 2 s), « Changer de thème »
  (le sélecteur : une vignette par thème, deux par ligne), le rapport, puis « Sujet comme diapositive » (Auto / Visible /
  Masqué, « Auto » dit ce qu'il décide), « Position de l'image » (si tous les sujets choisis portent une image),
  « Sous-sujets comme diapositive » et, s'il est visible, « Livraison » et « Mise en page » (cinq boutons).
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
