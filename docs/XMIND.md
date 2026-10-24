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

## 6. Modes

- **Plan** (Maj+Cmd+M) : la même carte en liste indentée. Entrée crée un frère, Tab indente, Maj+Tab
  désindente, Cmd+/ replie. On revient à la carte par la même touche.
- **Zen** (Cmd+Alt+F) : la carte seule, plein écran, sans barre.
- **Présentation** (Cmd+Alt+P) : la carte se découvre branche par branche ; Espace et flèche droite
  avancent, flèche gauche recule, Échap sort. Le cadrage suit le sujet présenté.
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
(`"free"` = placement libre), `topicOverlapping` (`"overlap"`), `compactLayoutModeLevel`, `theme`, `style`.

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

## 9. Le panneau d'icônes

Le bouton **smiley** (« Marqueur ») ouvre, dans le panneau de côté, trois onglets en capsule : **Marqueur | Autocollant
| Illustration**. Un clic pose sur les sujets choisis (ou le sujet courant) **sans fermer le panneau** ni lui prendre le
focus. Chacun des trois s'ouvre aussi par le menu « + » et le menu d'un sujet.

**Marqueur.**
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

## 10. Les menus contextuels

Un clic droit sur la carte ouvre un menu à l'endroit cliqué (`MenuContextuel.tsx`) ; ce qui n'était pas choisi le
devient d'abord, le fond désélectionne. Les entrées grisées restent affichées ; un séparateur en tête, en queue ou
doublé, et un sous-menu vide, sont retirés. Échap, un clic dehors ferment ; les flèches parcourent. Les raccourcis sont
écrits en glyphes du Mac, ou en Ctrl+ ailleurs. Le contenu se construit par `construireMenu` (`menus.ts`), ce que chaque
entrée fait est dans `actionsMenu.ts`.

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

## 11. Ce que la barre d'outils et le menu « + » insèrent

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
