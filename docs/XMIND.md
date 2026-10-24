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
| Tab, Insert | Sous-sujet (enfant), sélectionné ; le champ ne s'ouvre pas |
| Entrée | Sujet frère après, sélectionné ; sur le central, un sous-sujet |
| Maj+Entrée | Sujet frère avant |
| Cmd+Entrée | Sujet parent : s'intercale entre le sujet et son parent |
| Double-clic dans le vide | Sujet flottant |
| Maj+Cmd+R | Relation depuis le sujet choisi ; on clique ensuite la cible |
| Maj+Cmd+B | Limite autour des sujets choisis |
| Résumé (menu) | Résumé des sujets choisis |

**Éditer**

| Touche | Geste |
|---|---|
| Espace, F2, double-clic, ou taper une lettre | Éditer le titre (la lettre remplace le titre) |
| Entrée ou Tab dans le titre | Valider ; Maj+Entrée et Cmd+Entrée vont à la ligne ; Échap abandonne |
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
  de tout sujet en fait un sujet flottant. Maj détache, Alt copie (voir § 4 bis).
- → Notak : les touches se lisent sur le caractère tapé (`event.key`), pour qu'elles tombent juste en AZERTY.

## 4 bis. La toile : cadre, défilement, glisser, contour, édition en place

Relevé : `notak-chantiers/interface-xmind/5-toile-gestes.md`, `6-rangs-et-edition.md` § 3 et `8-observe-a-l-ecran.md`
(valeurs tirées de Xmind 26.05, jamais son code). Code : `elements/arbre/Arbre.tsx` (les événements),
`modele/cadre.ts`, `modele/camera.ts`, `modele/depot.ts`, `modele/contour.ts`, `modele/champ.ts`, `modele/lacher.ts`
(les décisions, en fonctions pures testées).

**Un glisser commence au-delà de 2 px** (sur l'un des deux axes) ; en deçà c'est un clic. Le pointeur est alors capturé.

**Cadre de sélection** (glisser sur le fond vide)
- Remplissage `rgba(46,189,255,.10)`, trait `rgba(46,189,255,.5)` de 1 px d'écran, angles droits.
- Un sujet est pris dès que le cadre le touche d'une aire non nulle (intersection stricte, un contact de bord ne compte
  pas), sujets seulement (ni relations, ni limites, ni zones). La sélection suit le cadre à chaque mouvement : le
  rétrécir lâche des sujets.
- Maj ou Cmd (pressés avant ou pendant le glisser) ajoutent : la sélection ne fait que grandir. Un appui simple sur le
  fond vide la sélection (Maj et Cmd la gardent). Échap arrête le cadre ; la sélection garde ce qu'il avait pris.

**Défilement et zoom**
- Molette et pavé : 1 pour 1. Cmd + molette ou pincement : zoom autour du pointeur, facteur
  `1 + clamp(−deltaY × 0,01 ; ± 0,5)`, de 0,1 à 5.
- **Clic droit glissé** : défile la carte (curseur de la main fermée) ; sans glisser, le menu s'ouvre au relâchement.
  **Glisser le sujet central** : défile aussi, il ne bouge pas.
- La carte se pousse jusqu'à ne toucher la fenêtre que par un bord (le contenu plus une fenêtre de marge de chaque côté).
- **Auto-défilement** pendant un cadre ou un glisser : au-delà de la zone morte `max(20 px de carte ; 5 % de la
  fenêtre)`, la caméra avance de 12 % de l'excès à chaque image, sans plafond.
- **Révélation** : après avoir créé un sujet ou choisi un voisin au clavier (et pendant que la frappe agrandit un sujet),
  la caméra ne bouge que si le sujet sort de la vue (marge `max(20 ; 5 %)`), du minimum, en 200 ms linéaire ; un sujet
  trop grand est centré ; un décalage qui sortirait de l'étendue défilable est ignoré.

**Glisser un sujet**
- Les sujets de tête de la sélection se glissent ensemble (leurs descendants suivent). Un sujet d'une sélection multiple
  la garde à l'appui ; relâché sans glisser, il la réduit à lui. Le central ne se glisse pas.
- Une copie à 70 % suit le pointeur ; l'original, avec sa branche et son trait de parent, reste à 30 %. Curseur de la
  main fermée, ou « copie » avec Alt.
- **Repère de dépôt** : un faux nœud plein de 50 × 18 px (rayon 4, `#2EBDFF`), à l'endroit où le sujet s'insérera, relié
  à son futur parent par une branche de même forme et même épaisseur, en bleu. Rien autour du parent. Hors de toute
  cible, aucun repère : le sujet devient flottant.
- **Maj** détache : le sujet flotte là où on le lâche, cible ou non (un flottant, lui, peut alors se rattacher).
  **Alt** copie la branche au lieu de la déplacer. **Échap** annule. Une branche repliée qui reçoit un sujet se déplie.

**Contour de sélection** : `#2EBDFF`, 2 px, à 1 px du sujet, coins de 4 px, gris `#9F9F9F` quand la fenêtre n'a pas le
focus, le tout multiplié par `max(1, 1/zoom)` (taille constante à l'écran sous 100 %). Un contour par sujet choisi. Le
**survol** dessine le même contour à 50 %. Sélection à l'appui ; Cmd bascule un sujet ; Maj ajoute aussi les frères d'entre
deux.
- **Pastilles « + »** d'un sujet choisi seul (fenêtre active, zoom > 0,3, ni édition ni geste en cours) : disques bleus de
  18 px, à droite (ou à gauche pour une branche de ce côté) pour un enfant, dessous pour un frère après lui. Le central
  n'a que la première.

**Édition du titre en place**
- Un champ transparent, sans bordure ni contour, posé exactement sur le texte du sujet, à sa police, sa taille, sa
  graisse, sa couleur, son alignement et son interligne ; il vit dans le repère de la carte, donc il est juste à tout zoom.
- Pendant la frappe, le texte en cours remplace le titre dans ce que la carte mesure et dispose : le sujet grandit, passe
  à la ligne à la largeur maximale de son rang, et la carte se range autour. Le contour de sélection reste autour du sujet.
- Entrée et Tab valident ; Maj+Entrée et Cmd+Entrée vont à la ligne ; **Échap annule** (le titre reste). Un sujet
  jamais titré (son titre est celui qu'il a reçu en naissant : « Sujet principal 3 »…) s'ouvre tout sélectionné, un sujet
  titré avec le curseur à la fin.
- Entrée, Tab et Maj+Entrée **créent et choisissent** le sujet sans ouvrir le champ ; Espace, F2, un double-clic ou un
  caractère imprimable l'ouvrent (le caractère remplace le titre). Un double-clic dans le vide crée un flottant et ouvre
  son champ.

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

## 5 ter. Les rangs d'un sujet

Xmind n'a pas de réduction par profondeur : ni taille de police, ni épaisseur de branche qui décroît. Chaque sujet
prend les valeurs de sa **classe** (central, principal, sous-sujet, flottant, résumé), plus une classe de niveau
(« level 3 » : les sous-sujets enfants d'un principal) que seul un thème qui la déclare distingue du sous-sujet
ordinaire. Les marges, les espacements, le rayon des coins et la largeur du texte sont des constantes du moteur, pas du
thème. Un nombre du thème en points se lit en pixels (1 pt = 1 px avant le zoom).

| | Central | Principal | Sous-sujet (niveau 2 et suivants) | Flottant |
|---|---|---|---|---|
| Police, graisse | 28, demi-gras (600) | 18, moyenne (500) | 14, normale (400) | 14, moyenne (500) |
| Marges intérieures, vertical / horizontal | 15 / 29 | 10 / 18 | 6 / 6 | 11 / 11 |
| Idem, carte compacte | 12 / 22 | 6 / 12 | 4 / 4 | 9 / 9 |
| Largeur du texte avant retour à la ligne | 300 | 300 | 300 | 300 |
| Écart majeur (parent → enfants) | 50 | 26 | 26 | 26 |
| Écart mineur (entre frères) | 35 | 6 | 8 | 8 |
| Idem, carte compacte (majeur / mineur) | 28 / 10 | 22 / 5 | 22 / 5 | 24 / 5 |

- **Souligné.** L'épaisseur du trait s'ajoute au bas du sujet (marge du bas, plus le trait) ; les marges du haut, de
  gauche et de droite ne changent pas. Le trait est tout entier dans la boîte du sujet et la branche part de son
  **axe** : le souligné du parent se prolonge ainsi jusqu'à l'enfant, et le souligné d'un enfant continue la
  branche (une enfilade horizontale ne fait qu'un seul trait).
- **Écart majeur.** Il dépend de la classe du parent. Pour un coude ou un coude arrondi, il vaut le nombre du
  tableau ; pour la courbe, la droite, l'anse et le pli, hors du central, **le double** (52 sous un principal).
- **Départ du central.** Les coudes qui partent du central sortent de **dessous son corps**, à un tiers de sa
  largeur du centre du côté de l'enfant, par le haut ou le bas, puis tournent vers l'enfant. Un enfant à la hauteur
  du central part du bord. Les coins arrondis des coudes ont 10 px de rayon, ceux d'un rectangle arrondi 8 px.
- **Couleurs.** Chaque principal prend la couleur de sa place dans la liste de six, que tous ses descendants
  héritent. Le texte d'un principal est noir (le blanc n'atteint pas un contraste de 3 sur les couleurs claires). Le
  texte d'un sous-sujet d'une carte aux branches de couleur est **la couleur de sa branche à 20 % de luminosité**
  (teinte et saturation conservées : `#FF6B6B` donne `#660000`). Le remplissage d'un sous-sujet cadré de niveau 2
  est la couleur de sa branche à 20 % d'opacité ; les niveaux suivants n'ont pas de fond.
- **Squelette à soulignés** (celui des captures 0 à 4 et 12 à 13) : central plein noir à coins arrondis ;
  principal souligné d'un trait de 5, texte noir ; sous-sujet souligné d'un trait de 1 qui se confond avec la
  branche ; branches à angles droits d'épaisseur 1, quel que soit le niveau.

→ Notak : les valeurs ci-dessus sont celles de chaque rang (`TAILLES`, `MARGES_COMPACTES` dans `apparence.ts` ;
`ECARTS`, `ECARTS_COMPACTS`, `ecartsDe` dans `disposition/commun.ts`). Les marges ne suivent plus la taille du texte
du sujet. Nos thèmes gardent leurs couleurs et leurs formes ; ils précisent en plus, par rang, l'épaisseur du
souligné (`principal.trait`, `sous.trait`), celle des branches (`branches`), le texte teinté de la branche
(`sous.texteBranche`) et le remplissage de niveau 2 (`sous.fondNiveau2`). **Le thème par défaut (« classique »)**
rend le squelette à soulignés : central noir, principal souligné de 5, sous-sujets soulignés de 1 au texte de la
couleur de branche assombrie (`teinteSombre`), branches coudées de 1 à 1,5 d'épaisseur. Sur un fond qui suit le thème
clair ou sombre de Notak, le texte du sous-sujet se mélange à 32 % de la couleur de la branche et à l'encre du thème ;
sur un fond connu, clair, la teinte sombre exacte (sombre : la teinte claire à 85 %).

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
   filet et le pinceau « Style ». Pas « Grow Ideas » (IA payante). Elle reste dans la zone, passe sous le sujet si le
   haut est sous la barre d'outils, ne prend pas le focus et ne laisse rien traverser (un appui dessus ne désélectionne
   pas). Le pinceau ne copie pas un style, comme on pourrait le croire : chez Xmind (« Apply a style to the topic »), il
   ouvre une fenêtre sous lui (`ChoixStyle.tsx`) avec le style rapide, puis la couleur de remplissage et celle de la
   bordure, prises dans la palette de la carte (la bordure à 30 %). Un choix s'applique en un seul geste et ferme la
   fenêtre ; Échap la ferme sans fermer la carte. Copier et coller un style restent au menu contextuel.

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
structures posées sur les sujets principaux, la police et la largeur de ligne de toute la carte, et les largeurs de sujets ; éteindre les branches libres remet chaque sujet à sa place ; allumer
les flottants colorés retire leur remplissage choisi. Chaque réglage est un geste (`modele/reglages.ts`) : il
passe par l'historique, et un seul annuler le défait.

| Réglage | Dans Notak (`Arbre`) | Clé de la feuille `.xmind` |
|---|---|---|
| Squelette | `squelette` (un de nos 51 identifiants : `carte-1`…), la structure du central (et plus de structure sur les principaux) ; `effile` suit celui du squelette | `theme.skeletonThemeId`, l'extension de feuille `org.xmind.ui.skeleton.structure.style`, le style de chaque classe dans `theme.centralTopic` etc., et `rootTopic.structureClass` |
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

**Squelette.** Xmind en compte 60, en dix groupes, chacun portant une structure *et* un style complet : par classe de
sujet (central, principal, sous-sujet, flottant, résumé), la forme, la classe de ligne, l'épaisseur et le motif de la
ligne, la flèche, la police, la taille, la graisse, le remplissage, la bordure ; et, pour la carte, `lineTapered` (les
branches du central s'amincissent). Le relevé complet, squelette par squelette, est dans
`notak-chantiers/interface-xmind/9-squelettes.md`. Les couleurs n'en font pas partie : elles viennent du thème de couleur.
La ligne d'un rang est celle des branches qui **en partent** : le central décide de la forme des branches qui vont à ses
principaux, un principal de celles de ses enfants. Un `inherited` veut dire « celle du sujet dont il part ».

→ Notak : cinquante et un squelettes, dans huit groupes (12 carte mentale, 9 diagramme logique, 6 accolade, 6
organigramme, 6 arbre, 6 chronologie, 3 arête de poisson, 3 matrice) ; le tableau-arbre et la grille sont écartés (§ 2).
Table : `elements/arbre/carte/squelettes-table.ts` ; chaque squelette porte son identifiant de Xmind pour le fichier.
`Arbre.squelette` le désigne ; absent, la carte garde le style de son thème (les cartes d'avant ne changent pas).
Ordre de résolution, du plus fort au plus faible : le style posé sur le sujet, la police et la largeur de toute la
carte, le squelette, le thème. Le thème garde les couleurs ; le squelette donne les formes, les lignes, les
épaisseurs, les polices, les remplissages et bordures, l'effilé, le trait à main levée. Un squelette qui prescrit une
structure aux principaux (`principaux`) la leur donne s'ils n'en ont pas une à eux. Choisir un squelette est un geste
de la carte (`appliquerSquelette`) : il efface les structures des principaux, la police et la largeur de ligne
globales, les largeurs de sujets, et pose l'effilé du squelette. **Une carte neuve a le premier squelette de la carte
mentale** (`carte-1`, celui de Xmind : courbe organique depuis le central, coudes arrondis ensuite, central de 30 en 800
sans fond, principaux pleins). Le trait d'un sujet souligné qui n'a pas de bordure à lui est celui de la branche qui
arrive. Une bordure de squelette (sur une forme à cadre) prend la couleur de la branche.
La fenêtre (388 × 450) s'ouvre à gauche du panneau, ses groupes se replient, trois vignettes par ligne, et elle ne se
ferme pas au choix. Chaque vignette est une petite carte dessinée par le moteur de mise en page sur un exemple de sept
sujets, **avec la structure et le style du squelette** (forme et épaisseur des branches, effilé, formes de sujet, fond ou
non, tremblé des squelettes à la main, petit crayon en haut à droite) et les couleurs de la carte ; la carte du
squelette montre la vignette du courant et nomme son groupe, jamais la structure. À l'export, la feuille reçoit
l'identifiant, l'extension de structures et le style de chaque classe (sauf si elle portait déjà ce squelette : les
styles de classe qu'elle avait sont gardés) ; à l'import, un identifiant connu redonne le squelette.

**Les lignes de Xmind et leur tracé** (`trace/branches.ts`). Dans le repère de la croissance (*g* du parent à
l'enfant, *t* en travers) : la courbe (`curve`, forme `organique`) est un arc quadratique dont le point de contrôle est à
*g* = 0,2 et *t* = 1, et dont le départ du central est caché sous lui, à un tiers de sa largeur de son centre ; l'anse
(`bight`) une cubique aux contrôles (0,75 ; 0) et (0,5 ; 1) ; le pli (`fold`) un biais jusqu'à *g* = 2/3 puis l'axe ; le
pli arrondi un coin à *g* = 0,5. La forme `courbe` de Notak (un S) reste, pour les thèmes de couleur. **L'effilé** est
une surface dont la largeur décroît le long du trajet, de 3,6 épaisseurs au départ (courbe), 3 (droite, anse, pli
arrondi) ou 2,4 (coudes, pli) à 1 à l'arrivée ; un coude ou un pli garde sa largeur jusqu'à son dernier segment, le pli
arrondi passe par 2 à son coin ; il ne concerne que les branches du central, et toutes les formes le permettent.

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

**Les diapositives.** Chaque étape d'une liste est une diapositive à part entière ; il y en a quatre sortes : le
**sujet** (son titre, son image), la **liste** (le sujet en tête et ses **enfants directs** seulement, dont une partie est
révélée), le **résumé** (le sujet de résumé et la plage de frères qu'il couvre, reliée par une accolade, ou par un trait
s'il n'y a qu'un frère) et **« Merci »**, la diapositive de fin, traitée comme un central. Une diapositive peut exister et
être **sautée** : elle reste dans la suite, la navigation la franchit.
- **L'ordre** : le central, puis les flottants dans leur ordre, puis « Merci », puis l'**écran de fin**. En profondeur
  d'abord : la diapositive du sujet, puis les étapes de sa liste, entre lesquelles s'intercale la séquence complète de
  chaque enfant. Tout sujet qui a des enfants a ses listes, à tout niveau, même quand sa diapositive est sautée. Un
  résumé s'insère juste après le dernier enfant qu'il couvre (le plus court d'abord s'ils finissent au même), entre deux
  diapositives de résumé : celle d'entrée, puis la diapositive de sujet du résumé si elle apporte quelque chose et ses
  listes, puis celle de sortie, qui s'enchaîne sur le retour à la liste. Les bulles, relations et cadres n'ont pas de
  diapositive.
- **Les trois livraisons**, « un par un, en profondeur » par défaut. *En profondeur* : la liste paraît avec le premier
  enfant, on perce dans sa branche, on remonte dans la liste et l'enfant suivant paraît aussitôt ; un enfant qui n'a rien
  à lui n'a ni diapositive ni retour, la touche suivante fait paraître le suivant. *Un par un* : les enfants paraissent
  un à un, puis on visite ceux qui ont du contenu, en repassant brièvement par la liste entière centrée sur eux. *Tout à
  la fois* : une étape, toute la liste, puis les mêmes visites. Sur une étape, chaque enfant est caché, déjà vu, courant
  ou montré.
- **Auto** décide de chaque diapositive de sujet dans cet ordre : une **chaîne d'enfants uniques** de trois maillons ou
  plus (ancêtres puis descendants qui n'ont qu'un enfant) montre la diapositive ; le central et les flottants sont
  montrés ; un principal aussi, sauf sous un central en arête ou en chronologie ; sinon (sous-sujet, résumé, principal
  sous une arête) la diapositive n'est montrée que si le sujet **porte ce que la liste ne montre pas** : une note, des
  étiquettes, une image, plus de trois marqueurs, un titre que la liste tronque, ou si la liste de son parent est sautée.
  « Visible » et « Masqué » sont respectés sur un sujet et un résumé. Sur une liste, seul « Masqué » l'est : « Visible »
  rend la main aux règles Auto, et une chaîne d'enfants uniques saute toujours ses listes (elle devient une suite de
  diapositives de sujet). Une étape d'entrée ou de sortie d'enfant est sautée quand l'enfant n'a rien de montré.
  « Merci » est toujours montrée. « Auto (…) » dans l'onglet dit ce que la règle déciderait sans le réglage du sujet.
- **La mise en page** par défaut d'une liste : l'arête ou la chronologie si la structure du sujet sur la carte en est
  une ; sinon l'**accolade** pour le central et pour un principal qui a plus d'un enfant et dont le titre et ceux de tous
  ses enfants font au plus **24 caractères** ; sinon les **puces** en tout à la fois ; sinon les **paroles**. Les paroles
  ne se jouent pas en tout à la fois. Sous un parent en arête (ou en chronologie), la liste de chaque enfant devient une
  **tête d'arête** (ou de chronologie), quel que soit son réglage. Puis une variante d'après le contenu : un seul enfant,
  un parent ou des enfants « illustrés » (une image sans titre), et le **portrait** (9:16, 3:4), où l'accolade, l'arête,
  la chronologie et leurs têtes deviennent un **arbre** et le résumé une colonne qui défile.
- **La place de l'image** en Auto : au-dessus du titre en portrait, pour une image vectorielle et pour une image au moins
  deux fois plus large que haute ; à gauche sinon.
- **Les mesures** se comptent dans le repère de la diapositive (1600 × 900 en 16:9, 1200 × 900, 900 × 1600, 900 × 1200),
  les textes en centièmes du petit côté : chaque titre prend la plus grande taille qui tient entre deux bornes, au plus
  tant de lignes, puis « ... » ; une dernière ligne trop courte fait réessayer plus petit.
- **Les transitions** : un fondu de 600 ms vers la diapositive du central ou d'un flottant, de 400 ms au démarrage et
  vers l'écran de fin ; 600 ms entre deux étapes d'une même liste ; un morphing de 1 000 ms partout ailleurs (percer,
  remonter, passer au frère). Reculer n'anime jamais.
  - Le **fondu** efface l'ancienne diapositive pendant que la nouvelle paraît. Les décors du thème jouent leur entrée :
    les traits du Carnet se dessinent, les formes de Midnight Rose grandissent, les autres arrivent du coin le plus proche
    (les bulles de Hubble Bubble sur un ressort, puis elles gonflent et reviennent à chaque affichage).
  - **Entre deux étapes** d'une liste, chaque élément glisse de sa place à la nouvelle et prend son opacité : l'enfant
    qui arrive paraît, la liste défile.
  - Le **morphing** fait voyager ce qui est commun aux deux diapositives : un titre passe de la liste du parent à sa
    propre diapositive mot à mot, chaque mot glissant et grandissant jusqu'à sa nouvelle place (un mot qui change de
    taille se relaie en fondu à mi-chemin) ; les mots qui n'existent que d'un côté s'effacent ou paraissent. Les formes
    communes se déforment de l'une à l'autre, une image visible à plus de 90 % des deux côtés glisse (ou se croise avec
    la nouvelle), les décors glissent, les bandes de couleur suivent. Le reste s'efface sur la première moitié et paraît
    sur la seconde.
  - Chaque gabarit a son **entrée** : sur le central, les blocs montent d'un cinquième de leur hauteur l'un après l'autre ;
    ailleurs, tout sauf le titre paraît après l'effet ; à la première étape d'une liste, les enfants paraissent puis
    l'accolade, la flèche ou le séparateur se dessinent ; une arête, une tige, une branche se dessinent sous l'enfant qui
    arrive, et son titre suit. ⇧← garde l'effet sans ces entrées.
  - Après « Merci », l'écran de fin paraît en une seconde pendant que « Merci » rétrécit jusqu'à sa vignette ; l'appui
    suivant l'efface avant de rendre la carte. Ces deux-là ignorent le réglage d'animation.
  - Une touche pressée pendant une transition attend qu'elle finisse ; une seule attend, les autres sont ignorées.
    L'animation coupée (A), et la préférence « réduire les animations » du système, font tout passer d'un coup.
  - **Agrandir une image** : au survol, un bouton rond à son coin bas droit ; la scène se floute sous un voile (noir sur
    fond sombre, blanc sinon) et l'image grandit en 300 ms jusqu'à tenir à 72 px des bords. Un clic ou Échap la
    rendent à sa place ; pendant ce temps, les touches ne font rien d'autre.
→ Notak : le titre « Merci » est traduit (Xmind écrit « Thank you » dans toutes les langues). La suite est calculée
d'avance plutôt que chaînée à la demande, pour la même séquence. Une image collée est réputée bitmap et sa taille affichée
tient lieu de taille naturelle ; une équation et une illustration comptent comme vectorielles. Le dessin fidèle de chaque
gabarit et les thèmes sont encore à venir : en attendant, chaque gabarit retombe sur le rendu le plus
proche, et l'écran de fin ne montre que « Merci » en vignette, sans l'image de la carte.
Entre deux étapes d'une liste, Notak superpose les deux diapositives au lieu de réutiliser la même vue : le mouvement est
le même. Les couleurs des décors ne s'interpolent pas, et les formes de fond qui changent de dessin se croisent au lieu
de se déformer.

**La présentation** (⌥⌘P, ou le bouton Pitch). Plein écran quand le navigateur le permet ; elle part du sujet choisi (une
pastille propose de « lire à partir de la première diapositive »). Une barre en haut à droite (quitter, paramètres,
navigation) s'estompe à 15 % après trois secondes. Touches : Espace, Entrée, →, ↓, Pg suiv. avancent ; ←, ↑, Pg préc.
reculent ; ⇧→ passe la branche, ⇧← revient au sujet parent ; Échap et Q quittent ; A bascule l'animation ; ? montre
les raccourcis. Un clic sur la scène avance. Chaque commande franchit les diapositives sautées et suit les enchaînements automatiques (la première étape d'une liste percée, un retour de liste vers l'enfant suivant). ⇧→ va au retour du sujet dans la liste de son parent, et depuis le central droit à « Merci » (ou au premier flottant) ; ⇧← va à l'étape de la liste du parent où le sujet a paru, et depuis le central à sa diapositive. Partir d'un sujet ouvre sa diapositive, même sautée. Après « Merci », l'écran de fin ; l'appui suivant rend la carte. L'animation est une
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
