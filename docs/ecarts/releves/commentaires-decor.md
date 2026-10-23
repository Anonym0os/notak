# Écart Notak / Milanote : commentaires, réactions, étiquettes, mentions, émojis

Famille `commentaires-decor`. Conventions : 1 rem Milanote = 10 px ; 1 UG = 10 px ; couleurs du thème clair ; les
rgb sont donnés en hexadécimal. Chemins Notak relatifs à `packages/tableau/src/` (abrégé NK/).

Sources Milanote lues : `client/element/comment/` (fil, ligne, formulaire, outils, replié, éditeur, mobile),
`client/element/attachedComment/`, `client/element/reactions/`, `client/element/pillsPanel/`, `client/element/labels/`,
`client/element/chipsPanel/`, `client/element/mentions/`, `client/components/emoji/`, `common/comments/`,
`common/labels/`, `common/tiptap/extensions/inlineComment/` et `mention/`, `workspace/toolbar/.../labelsTool`,
`commentTools`, `reactionTool`, `attachedCommentTools`, et la brique de pastille du kit maison (`common/@roma/.../chip`).
Les textes anglais de l'interface (fichiers de traduction) ne sont pas dans les sources décompilées : là où le libellé
exact manque, c'est dit « à relever à l'écran ».

Famille en trois objets chez Milanote, un seul élément « fil de commentaires » (`COMMENT_THREAD`) qui prend trois
visages : fil posé sur la toile, fil attaché à un élément (épingle), fil attaché à un passage de texte (en ligne).
Notak a un élément `commentaire` (fil posé), un champ `commentaire` sur chaque élément (fil rangé dans l'élément,
badge dans la bande sous la carte) et une marque `commentaireTexte` dans les notes (fil en marge, en édition seulement).

## 0. Relevés antérieurs : ont-ils été appliqués ?

- [ABSENT] releve-barre-elements A5.2 (panneau Étiquettes : recherche en tête, case par ligne, suggérées, « créer », menu par ligne) — Milanote : voir §5 — Notak : `NK/elements/decor/Etiquettes.tsx` est une liste à plat avec une pastille ronde, un champ de nom, un oeil de filtre, une croix et un champ « Nouvelle étiquette… » ; ni recherche, ni cases d'état par défaut hors sélection, ni sections.
- [ABSENT] releve-barre-elements A5.3 (sélecteur d'émojis complet) — Notak : `SelecteurEmojis.tsx`, ~250 émojis natifs, 8 catégories en onglets-icônes, voir §6.
- [ABSENT] releve-barre-elements A7.8 / B7 (liste du fil : Couleur, Replier, Détacher, Retirer) — Notak : `OutilsCommentaire` n'a ni Couleur ni Détacher ; Répondre et Résoudre en trop, voir §1.4.
- [DIFFÉRENT] releve-cartes (commentaire : 34 UG, 12 px, fond propre, outils au survol) — Notak : 28 UG, 14 px, fond de carte blanc, voir §1.2.

---------------------------------------------------------------------------------------------------------------

## 1. Élément Commentaire (fil posé sur la toile)

### 1.1 Création
- [DIFFÉRENT] Largeur initiale — Milanote : 34 UG (`ELEMENT_DEFAULT_WIDTH`), identique à une note, minimum 34 UG au redimensionnement (on ne peut qu'élargir), hauteur mini 7 UG — Notak : `LARGEUR_COMMENTAIRE = 28` (`elements/commentaire/fil.ts:4`), `largeurMin: 20` (`commentaire/index.ts`), `hauteurParDefaut: 10`.
- [OK] Outil de création : Milanote place « Comment » en 7e position de la barre de création (après Colonne, avant Table) — Notak : rang 70, même ordre.
- [OK] Création par la barre : l'élément est choisi puis mis en édition (curseur dans le champ de réponse) — Notak : `aLaCreation` par défaut = `editer` ; `Fil` prend le focus (`Commentaire.tsx:97`).
- [OK] Sortir d'un fil resté vide le jette — Milanote : Retour arrière dans le champ vide d'un fil neuf dont on est le créateur envoie l'élément à la corbeille ; Notak : un fil vide est jeté à la sortie de l'édition (`Commentaire.tsx:100-112`). Écart mineur : Milanote ne jette qu'au Retour arrière, Notak jette aussi sur Échap/clic dehors.
- [DIFFÉRENT] Création par glisser depuis la barre : l'aperçu glissé est le fil entier (carte de 34 UG) quand il survole la toile, et se réduit en épingle (animation .1 s) quand il survole un élément (mode « attacher », halo de 40 px autour de l'élément) — Notak : `fantome` = fil vide de 28 UG, aucune bascule en épingle, aucun mode attacher.
- [ABSENT] Création par le clic droit de la toile — Milanote : entrée « New comment » dans la section « création » du menu de la toile, après Colonne et avant Table — Notak : absent (aucune entrée de création dans les menus de la toile ; creation.md le confirme).
- [ABSENT] Création sous un fil par ⌘Entrée — Milanote : crée un fil neuf juste en dessous (même mécanisme que pour une note) — Notak : `suivant: () => null`, rien ne naît.
- [ABSENT] Dépôt sur un élément : un fil glissé sur un élément (un seul fil, et seulement un fil) s'y attache en épingle à l'endroit du dépôt, aimanté à la grille, position bornée au cadre de l'élément — Notak : aucun dépôt attacheur (voir §2).
- [DIFFÉRENT] Création par collage / dépôt de fichier : sans objet pour Milanote (un fil collé est copié tel quel, dupliqué côté serveur avec ses commentaires). Notak copie l'élément mais le fil est local à l'élément ; non vérifié.

### 1.2 Rendu au repos
- [DIFFÉRENT] Fond — Milanote : `#F4F7FE` (bleu très pâle), toute la fiche, y compris les lignes ; champ d'édition `#FFFFFF` — Notak : carte blanche `#FFFFFF` comme une note (`toile.css:86`), aucun fond propre.
- [DIFFÉRENT] Coins et ombre — Milanote : coins carrés (rayon 0), ombre `0 1px 2px #1B25361A` ; dans une colonne : pas d'ombre, filet 1 px `#BACBFC` (couleur « bord du fil ») — Notak : coins carrés, ombre commune (`0 1px 2px` + anneau 1 px `#EBEDEE`), pas de filet bleu en colonne.
- [DIFFÉRENT] Marges internes — Milanote : 4 px haut et bas de la fiche (le détail est dans les lignes) ; ligne : avatar à 24 px du bord gauche, 17 px du haut pour le premier message (8 px ensuite), colonne de texte à gauche +16, texte décalé de 6 px, marge droite 14 px (24 px pour l'en-tête) — Notak : padding de carte 21/20/21/24 (`toile.css:84`), pastille 28 px à gauche, écart 10 px.
- [DIFFÉRENT] Avatar — Milanote : rond 24 px, image de profil ou initiales sur 8 couleurs de fond, initiales en 40 % de la taille (9,6 px) gras majuscules ; l'avatar d'un utilisateur actif (en train d'écrire) porte un anneau 2 px de sa couleur — Notak : rond 28 px, initiales 11 px gras, fond `#8A94A3` ou couleur de l'auteur, pas d'image, pas d'anneau (`commentaire.css:56-66`).
- [DIFFÉRENT] Nom — Milanote : prénom seul (`givenName`), « Someone » si inconnu, 12 px, graisse 600, `#323B4A` — Notak : nom entier, 14 px gras, « Anonyme » si inconnu (`AUTEUR_INCONNU`).
- [DIFFÉRENT] Horodatage — Milanote : juste après le nom, 6 px d'écart, 12 px, `#8D929A`, mis à jour chaque minute puis chaque heure, arrêt après un jour ; formats : « just now » (< 1 min), « N min ago », « N hour(s) ago », « N day(s) ago », « N week(s) ago » (unités an/mois/semaine/jour/heure/min/s, pluriel dès 2), au-delà de 4 semaines date locale courte « 12 Oct 2026 » — Notak : « à l'instant / il y a N min / il y a N h / hier / 12 oct. [année] » (`fil.ts:46-60`), 12 px `#6B7280`, jamais rafraîchi seul ; pas de « semaines » ; « hier » en plus ; l'infobulle de survol existe (date complète).
- [DIFFÉRENT] Police du texte — Milanote : 12 px / interligne 20 px (corps du fil `--font-size-comment`), nom et horodatage 12 px ; l'ensemble du fil a 14 px / 18 px par défaut mais seul l'éditeur compte — Notak : 14 px / 1,4 (`commentaire.css:6-7`), horodatage 12 px.
- [DIFFÉRENT] Couleur du texte — Milanote : `#323B4A` ; lien dans le texte `#F4511C` (orange de marque) ; placeholder `#00000066` — Notak : `var(--notak-texte)` `#323B4A` ; pas de liens cliquables dans le texte d'un message.
- [ABSENT] Bande de couleur — Milanote : barre de 5 px en haut de la fiche (couleur de l'élément, 12 couleurs d'éléments) quand le fil est déployé ; ne paraît pas dans l'épingle — Notak : aucune couleur pour un commentaire.
- [ABSENT] Dégradés de fondu — Milanote : 20 px en haut et en bas du conteneur, du fond du fil vers transparent (70 % à 60 %), coupés à 16 px du bord droit pour laisser la barre de défilement — Notak : aucun, le fil grandit sans limite.
- [ABSENT] Hauteurs mini — Milanote : conteneur 60 px ; 78 px dès qu'il y a un message ; 100 px s'il est modifiable avec messages ; sans droit d'écriture le contenu reçoit 10 px de marge basse — Notak : `min-height: 62px` de la carte, rien d'autre.
- [ABSENT] Barre de défilement du fil — Milanote : conteneur scrollable verticalement (bureau), barre de 12 px sans piste, poussière de 4 px de large (tiers central) `--ws-comment-scroll-thumb` ; reste calé en bas quand un message arrive (`useKeepScrolledToBottom`) — Notak : pas de défilement, la carte grandit.
- [ABSENT] Hauteur maximale réglable — Milanote : poignée du coin bas droit (triangle plein de 8 px couleur du fond du fil, opacité 0 → 1 en .1 s au survol/choix) règle largeur ET hauteur ; la hauteur est enregistrée (`maxHeight`, en UG) seulement si le contenu dépasse ; double-clic sur la poignée remet largeur 34 et hauteur libre ; dans une colonne la poignée n'existe que si le fil dépasse 4 messages ou a une hauteur fixée — Notak : `hauteurBornable` absent pour `commentaire` ; la poignée ordinaire ne règle que la largeur.
- [ABSENT] Texte d'attente du champ — Milanote : texte « Write a comment… » côté traduction `form.placeholder`, « Update comment… » pendant la modification (`form.updatePlaceholder`) (libellés exacts à relever à l'écran) — Notak : « Écrire un commentaire… » / « Répondre… » ; pas de variante « modifier ».
- [ABSENT] Lien « Reply » — Milanote : sous les messages, lien bleu `#2F63F7` 12 px, marge gauche 64 px ; disparaît si le fil est vide et que l'on est le créateur (le champ est déjà ouvert), masqué si on n'a pas le droit d'écrire, grisé pendant une duplication ; l'élément n'apparaît pas du tout pour un lecteur quand le fil est vide — Notak : bouton gris « Répondre… » en forme de champ (`commentaire.css:122-130`), visible seulement quand le fil est choisi.
- [DIFFÉRENT] Fil vide — Milanote : fil vide d'un autre auteur : la ligne « [Prénom] started a thread » (12 px, 21 px de marge verticale, nom en 600) tant que le créateur n'est pas actif ; fil vide de soi : le champ s'ouvre directement — Notak : texte gris « Commentaire vide ».
- [ABSENT] Indicateur de frappe — Milanote : « [Prénom] is typing… » avec trois points animés, avatar à anneau de couleur, pour chaque utilisateur actif ; signal envoyé au plus 1 fois par seconde (au maximum toutes les 3 s), arrêt après 5 s sans frappe — Notak : aucun.
- [ABSENT] Pastille d'activité non lue — Milanote : petit point orange de marque (7 px, 6 px en taille moyenne, 5 px en petite) à côté du nom d'un message récent, avec bulle « [qui] [quand] » — Notak : aucun suivi du non lu.

### 1.3 États
- [OK] Choisi : filet 2 px à l'extérieur (couleur de sélection `#323B4A`), sans ombre — Notak : idem (`toile.css:102-108`).
- [DIFFÉRENT] Survol : Milanote montre le lien « Edit » (si c'est mon message) ou le bouton d'ajout de réaction (message d'un autre sans réaction) à droite de l'en-tête de chaque ligne ; ils restent visibles pendant l'édition ou tant que le sélecteur d'émojis est ouvert — Notak : au survol de la carte, un rond « résoudre » (26 px) apparaît à −16/−12 px du coin haut droit (`commentaire.css:96-114`).
- [OK] Plusieurs choisis : comme les autres éléments.
- [DIFFÉRENT] En édition : Milanote ouvre le champ de réponse (bouton « Post » bleu semi-gras dans le coin bas droit du champ, 8 px du bord, 7 px du bas, désactivé tant que vide) ; seul le propriétaire modifie son message, « Save » remplace « Edit » ; Retour arrière dans un message vide supprime le message (et jette l'élément si c'est le seul d'un fil dont on est créateur) — Notak : champ à une ligne qui grandit (max 160 px) ; pas de bouton d'envoi dans le fil posé (Entrée seulement) ; pas d'édition d'un message posté ; suppression par une croix.
- [DIFFÉRENT] Brouillon — Milanote : ce qu'on tape est gardé dans un état local (`preCommit`) ; fermer l'élément sans envoyer jette le brouillon d'un fil existant, l'envoie pour un fil neuf non vide ; une fenêtre d'avertissement « Unsaved comments will be lost if you close this window » (« Unsaved comments » en titre, version Mac) s'ouvre si on ferme avec des brouillons — Notak : ce qu'on tape est envoyé tel quel comme message au fil à chaque frappe (`brouillonDe`), visible des autres ; aucun avertissement de fermeture.
- [ABSENT] Verrouillé — Milanote : tout élément se verrouille ; le fil verrouillé n'a ni poignée ni drag — Notak : verrou commun (OK), mais la poignée n'existe pas de toute façon.
- [DIFFÉRENT] Dans une colonne — Milanote : fiche pleine largeur, pas d'ombre, filet bleu clair 1 px ; fondus à 1 px du bord — Notak : carte rangée ordinaire.
- [DIFFÉRENT] Lecture seule / public avec retours activés — Milanote : droit « FEEDBACK » suffit pour commenter et réagir, sans droit d'écriture ; hors présentation, on peut masquer les fils (`hideComments`) ou les réponses (`hideReplies`) en mode présentation — Notak : `lectureSeule` bloque tout ; pas de droit intermédiaire « retour », pas de masquage en présentation.
- [ABSENT] Duplication en cours — Milanote : le fil affiche les messages de l'original en attendant la copie serveur, édition coupée — Notak : copie locale immédiate.
- [ABSENT] Corbeille — Milanote : fil dans la corbeille : ni outils, ni formulaire (marge basse seulement) ; en boîte de réception : jamais replié — Notak : corbeille générique.
- [DIFFÉRENT] Distant : fil sélectionné par un autre — Milanote : bord de la couleur de l'autre, sans ombre, mais on peut encore y écrire — Notak : présence générique.
- [ABSENT] Glisser : Milanote bloque la sélection de texte dans les messages d'autrui pour ne pas lancer un glisser (`allowTextSelection`) — Notak : pas de sélection de texte distinguée.

### 1.4 Barre d'outils (barre de gauche)
- [DIFFÉRENT] Fil choisi seul — Milanote : Couleur, Replier, [Aligner ≥2 / Répartir ≥3 / Relier], puis « ••• » ; fil attaché en ligne : Couleur, Détacher, Retirer ; en édition : la liste de texte « inline » (Style de texte couleurs seules, Gras, Italique, Barré, Lien, etc.) — Notak : Étiquettes, Réagir, Commenter (communs, inutiles), puis dans « ••• » : Répondre, Résoudre, Replier (`OutilsCommentaire`, `Commentaire.tsx:170-196`).
- [ABSENT] Couleur du fil — Milanote : outil Couleur avec 12 teintes + Aucune ; couleur de la bande du haut, du pin replié, des marques en ligne ; l'icône de l'outil montre le fond du fil `#F4F7FE` (ou le bleu `#2F63F7` replié) — Notak : absent.
- [DIFFÉRENT] Replier — Milanote : bascule `collapsed` sur le fil ; l'élément devient une épingle (voir §2.3) ; supprime les lignes reliées au fil ; caché pour un fil attaché ou dans la boîte de réception, droit FEEDBACK suffisant — Notak : replie en une ligne « pastille + auteur · N messages » (`Commentaire.tsx:34-44`), n'enlève pas les lignes reliées.
- [EN TROP] Répondre (tuile avec bulle) — Notak seulement ; chez Milanote on répond par le lien « Reply ».
- [EN TROP] Résoudre / Rouvrir — Milanote n'a aucune notion de fil résolu (aucun champ ni écran). Notak : `resolu`, ligne verte « Résolu · N messages » `#2F9A5A` à 70 % d'opacité, rond de résolution au survol.
- [EN TROP] Étiquettes, Réagir, Commenter sur un élément Commentaire — Milanote ne les propose pas (liste fixe ci-dessus). Les réactions du fil se posent par message (voir §4.5).
- [OK] Droit : FEEDBACK suffit pour Couleur, Détacher, Retirer — Notak : pas de droit intermédiaire.

### 1.5 Menu du clic droit
- [DIFFÉRENT] Aucune entrée propre au commentaire chez Milanote : le menu est celui de tout élément (Coller, Couper, Copier, Dupliquer, Cloner, Mettre à la corbeille, Grouper dans une colonne, Relier par des lignes, Verrouiller, Premier plan, Arrière-plan, métadonnées). Notak : entrées génériques + « Commenter » (tuile, un seul élément) et « En icône / En détail » (`decor/index.ts:18-41`) qui n'existent pas chez Milanote pour le fil.
- [ABSENT] Menu « ••• » — Milanote : Verrouiller, dupliquer, etc. ; Notak : tiroir de tuiles (voir relevé menus) + Répondre/Résoudre/Replier.

### 1.6 Gestes
- [DIFFÉRENT] Double-clic sur un message — Milanote : édite le message si c'est le sien ; sinon rien (la sélection de texte reste possible) — Notak : double-clic ouvre le champ de réponse en bas.
- [DIFFÉRENT] Entrée sur un fil choisi — Milanote : ouvre la réponse (ou, si aucune réponse n'est ouverte, la crée) ; ⌘Entrée : nouveau fil dessous — Notak : `commencerEdition` ; pas de ⌘Entrée.
- [DIFFÉRENT] Envoi — Milanote : Entrée envoie (sauf menu de mentions ouvert) ; Maj+Entrée = saut de ligne ; bouton « Post » ; fin de saisie (clic dehors, Échap) envoie un fil neuf non vide et abandonne un brouillon de réponse vide ; Échap n'efface jamais le texte — Notak : Entrée envoie, Maj+Entrée saute, pas de bouton ; sortie d'édition garde le brouillon comme message.
- [ABSENT] Retour arrière dans le champ vide — Milanote : supprime le message en cours de modification, ou jette le fil neuf — Notak : sans effet (le fil neuf vide est jeté à la sortie).
- [ABSENT] Tab / flèches — Milanote : champ Tiptap, flèches dans le texte ; popup de mentions navigable aux flèches Haut/Bas — Notak : champ texte brut.
- [ABSENT] Copier / couper / coller — Milanote : avec du texte sélectionné dans un fil, ⌘C/⌘X copient le texte (pas l'élément) ; sans sélection ils copient l'élément — Notak : copie l'élément seulement.
- [DIFFÉRENT] Redimensionner — Milanote : voir §1.2 (largeur ≥ 34 UG, pas de proportions, hauteur max par glisser) — Notak : largeur ≥ 20 UG.
- [OK] Glisser-déposer dans une colonne : un fil entre dans une colonne en gardant sa largeur de colonne — Notak : idem (règles de colonne).
- [ABSENT] Dépôt de lignes sur le bord — Milanote : un fil déployé accepte l'extrémité d'une ligne (connexion) ; replié ou attaché : non — Notak : à vérifier (les lignes se relient aux cartes ordinaires).

### 1.7 Contenu riche
- [ABSENT] Mise en forme — Milanote : éditeur Tiptap complet pour chaque message : gras, italique, barré, souligné, liens (détection d'adresses collées), code en ligne, couleur de texte, surlignage, mentions `@`, émojis `:` ; la liste d'outils d'édition du fil est celle du texte « inline » — Notak : texte brut (`textarea`), pas de gras, de lien ni de mise en forme, pas de saut de ligne enrichi.
- [ABSENT] Mentions `@` — voir §7.
- [ABSENT] Liens — Milanote : les adresses sont des liens cliquables hors édition (orange de marque) ; en édition, curseur texte — Notak : texte brut non cliquable.
- [ABSENT] Collage — Milanote : texte riche collé normalisé en schéma de commentaire (pas de blocs) — Notak : texte brut.
- [OK] Longueur max d'un message — Notak : 5 000 caractères (`maxLength`) ; Milanote n'en impose pas en client (à confirmer côté serveur).
- [ABSENT] Recherche — Milanote : les passages en surbrillance de recherche dans les messages (`SearchHighlightObserver`) — Notak : aucune.

### 1.8 Animations et délais
- [ABSENT] Ouverture de la fiche/épingle — Milanote : épingle ↔ fiche en .1 s `ease-in` (échelle 0,5, opacité) pendant un glisser, délai de .75 × .1 s pour celui qui apparaît, sons « contract » / « card pickup » à chaque bascule — Notak : aucune.
- [ABSENT] Poignée — voir §1.2 (.1 s linéaire).
- [OK] Filet de sélection : 2 px, transition .1 s ease-out des bords (`inset`) — Notak : idem.

### 1.9 Commentaires, réactions, étiquettes, couleur sur le fil
- [DIFFÉRENT] Réactions — Milanote : par message (pas par fil), pastilles sous le texte, marge gauche 16 px, haut 5 px, fond des pastilles `#E8E9EB` (actif `#EAEFFE`), un bouton « + » (icône `reaction-add`) après la dernière pastille ; avant la 1re réaction, le bouton « + » est dans l'en-tête de la ligne, au survol (message d'un autre uniquement) — Notak : un seul jeu de réactions pour tout l'élément, au même endroit que sur une note.
- [ABSENT] Étiquettes sur un fil — non proposées chez Milanote (le champ `labels` n'est pas lu pour un fil).
- [ABSENT] Couleur — voir §1.4.

---------------------------------------------------------------------------------------------------------------

## 2. Commentaire attaché à un élément (épingle / « pin »)

### 2.1 Création
- [DIFFÉRENT] Par l'outil « Comment » de la barre de sélection (un seul élément) — Milanote : s'il existe déjà un fil attaché non « en ligne », il s'ouvre en popup et le champ de réponse prend le focus ; sinon un fil est créé, attaché à l'élément, position x = `calc(100% − 20 px)`, y = 20 px, édité immédiatement et sa fenêtre ouverte — Notak : `OutilCommentaire` ouvre le panneau « Commentaires » sous la carte ; le fil n'a pas de position ni de contenu propre.
- [ABSENT] Par glisser — voir §1.1 (dépôt d'un fil sur un élément).
- [ABSENT] Collage / dépôt — sans objet.
- [OK] Droit : tout élément sauf un fil peut porter un fil attaché (un fil par élément « hors ligne ») — Notak : tout élément.

### 2.2 Rendu au repos (épingle)
- [ABSENT] Forme — Milanote : icône « épingle de commentaire » 24 × 29 px, pointe en bas, centrée sur le point d'ancrage ; la pointe tombe sur l'angle ; couleur = couleur du fil (défaut `#2F63F7`) ; compteur de messages centré, 11 px gras, blanc ou foncé selon la luminosité de la couleur du fil, plafonné à 99 — Notak : un badge « 💬 N » rond de 22 px dans la bande sous la carte (`decor.css:46-60`).
- [ABSENT] Échelle — Milanote : l'épingle ne grossit pas avec le zoom (contre-échelle) ; tailles d'interface moyenne 20 × 23 px (décalée de −11 px), petite 19 × 23 px (−10 px) ; iPad 30 × 36 px — Notak : sans objet.
- [ABSENT] Position — Milanote : l'épingle est placée par pourcentage ou px à l'intérieur de la carte (zone « HotSpot » 20 × 16 px, bornée entre 0 % et 100 %) ; elle bouge avec l'élément — Notak : pas de position.
- [ABSENT] Point d'activité distant — Milanote : un petit point de 8 px (bord 1 px couleur du fond de la toile, fond `#2F63F7`) au coin haut droit, avec pulsation 1,5 s (halo de 7 px qui s'éteint, opacité 40 %) quand un autre utilisateur a le fil sélectionné — Notak : aucun.
- [ABSENT] Compteur d'activité non lue (point orange) — voir §1.2.

### 2.3 États
- [ABSENT] Choisi — Milanote : contour de 2 px `#323B4A` autour de l'icône ; z-index au-dessus des autres épingles — Notak : sans objet.
- [ABSENT] Ouvert (popup) — Milanote : au clic sur l'épingle une bulle (FloatingPanel claire) s'ouvre à DROITE de l'épingle, flèche 13 × 8 px de la couleur du fond du fil, distance 15 px, alignement début, flèche décalée de 1 px, repli sur le bas en mode mobile ; largeur = 34 UG ; contenu = fil déployé sans bande de couleur ni étiquette d'élément ; hauteur max min(600 px, 80 % de l'écran) ; se ferme au clic dehors (sauf sur un passage en ligne, la barre, le panneau de document, la liste de mentions) ; forcée ouverte en mode filtre « Focus/Pass » — Notak : panneau sous la carte, 240 à 340 px de large, 320 px de haut max, ombre double (`decor.css:166-180`), bouton de fermeture « × » et titre « Commentaires ».
- [ABSENT] À la fermeture — Milanote : sauve tout ce qui est en cours : fil neuf non vide ajouté, brouillon de réponse vide abandonné, message modifié mis à jour, sinon rétabli — Notak : le message tapé est envoyé au clic (bouton « Envoyer » ou Entrée) seulement.
- [OK] Lecture seule — Notak : pas de champ, mais la lecture reste (« hors lecture seule ») ; Milanote affiche la fiche sans formulaire.
- [ABSENT] Fil vidé — Milanote : le dernier message supprimé par son auteur dans un fil que l'on a créé jette le fil — Notak : `poser` retire le champ `commentaire` quand le fil n'a plus de message (`Attache.tsx:12`) : OK dans l'esprit.
- [ABSENT] Mode présentation — Milanote : épingles masquées si « masquer les commentaires » est coché — Notak : aucun réglage.

### 2.4 Barre d'outils
- [DIFFÉRENT] Fil attaché (non en ligne) choisi — Milanote : Couleur, [Détacher n'existe que pour un fil en ligne], Retirer (corbeille) pour un fil en ligne ; pour une épingle : Couleur, [Replier absent], Aligner/Répartir/Relier, « ••• » — Notak : pas de sélection d'une épingle.
- [ABSENT] Retirer le fil attaché — Milanote : corbeille de l'élément fil (annulable) ; Notak : bouton « résoudre » ou suppression message par message.

### 2.5 Menu du clic droit
- [ABSENT] Clic droit sur l'épingle — menu d'élément générique ; Notak : aucun menu.

### 2.6 Gestes
- [ABSENT] Glisser l'épingle vers un autre point de l'élément ou vers un autre élément (halo d'aimantation, mode « attacher » avec poignée de ligne de 22 px qui s'agrandit en .1 s après .1 s de délai) — Notak : aucun.
- [ABSENT] Clic sur l'épingle : ouvre/ferme la bulle (un clic de plus la ferme, `disableToggleClose` côté déclencheur) — Notak : le badge bascule le panneau (OK dans l'esprit).
- [ABSENT] Échap — Milanote : ferme la bulle et sauve ; Notak : ferme le panneau (`Attache.tsx:46`).
- [ABSENT] Entrée : Milanote envoie ; Maj+Entrée saute une ligne ; Notak : idem (champ à 2 lignes).

### 2.7 à 2.9 Contenu riche, animations, étiquettes
- [ABSENT] Voir §1.7 : même éditeur riche, mentions, émojis ; Notak : texte brut.
- [ABSENT] Pas d'animation d'ouverture chez Notak ; Milanote : apparition immédiate de la bulle (positionnement sondé en continu, `pollPosition`).

---------------------------------------------------------------------------------------------------------------

## 3. Commentaire en ligne (sur un passage de texte)

### 3.1 Création
- [DIFFÉRENT] Outil « Comment » de la barre d'édition — Milanote : icône `toolbar-comment` (sans libellé), jamais replié (ordre d'effondrement 0), grisé sans passage choisi et si le passage est du code (marque ou bloc) ; si le passage touche déjà un fil il s'ouvre ; sinon la marque est posée, un élément fil attaché « en ligne » est créé dans la même transaction (annulable d'un coup), choisi, et sa bulle s'ouvre avec le champ en focus — Notak : bouton « Commenter le passage » (⌘⌥M), même règle de grisé (`OutilsTexte.tsx:107-117`), marque `commentaireTexte`, fil en marge (voir 3.2).
- [ABSENT] Raccourci — Milanote : aucun raccourci clavier déclaré pour l'outil ; Notak : ⌘⌥M (en plus).
- [ABSENT] Dans une liste de tâches / un document — Milanote : l'outil existe aussi pour l'éditeur d'une liste de tâches (un seul éditeur) et le document modal (colonne de commentaires à droite, 23 px) — Notak : notes seulement ; à vérifier pour les tâches.

### 3.2 Rendu au repos
- [DIFFÉRENT] Marque sur le texte — Milanote : fond `#F4F7FE` (thème clair) ou `#323B4A` (thème sombre), padding vertical 1,5 px, soulignement de 1 px `#2F63F7` (clair) / `#537EF8` (sombre) tracé en bordure-image, curseur « main » (texte en édition), s'adapte à la couleur de la carte (variantes claire/sombre calculées sur la teinte du fil, texte noir ou blanc selon la luminosité) ; fusionnée avec la surbrillance (`mix-blend-mode: multiply` ou `hard-light`) — Notak : fond jaune `#F3C534` à 28 % + trait de 2 px `#F3C534` (`note.css:556-559`), le même sur toute couleur de carte.
- [DIFFÉRENT] Sélection — Milanote : bord de 2 px de la couleur de sélection en pointillés (tirets de 2 px) quand le fil est choisi — Notak : aucune différence quand le fil est actif, sauf le contour 2 px de la fiche de marge.
- [DIFFÉRENT] Où se lit le fil — Milanote : bulle flottante ancrée au passage (`.InlineComment[data-comment-thread-id]`), décalée de −3 px, flèche décalée de −6 px, ouverte AUSSI hors édition (clic sur le passage) ; la bulle est la fiche entière — Notak : colonne « marge » de 260 px à droite de la note, à 16 px du bord, uniquement pendant l'édition de la note (`Marge.tsx`, `note.css:562`) ; hors édition on ne lit pas le fil.

### 3.3 États
- [ABSENT] Ouvrir hors édition : un clic sur le passage ouvre la bulle (sans suivre un lien posé dessus) ; si la note est éditable le fil est aussi choisi (barre : Couleur, Détacher, Retirer) — Notak : le clic ne fait rien hors édition.
- [ABSENT] Annuler/Rétablir — Milanote : l'annulation de la suppression d'un passage commenté restaure aussi l'élément fil (même transaction) ; Notak : le fil vit dans la note (`fils`), annuler les rend avec le texte (OK par construction).
- [DIFFÉRENT] Passage vidé — Milanote : si on supprime tout le passage, le fil va à la corbeille ; Notak : `filsVivants` retire le fil dont plus aucun passage ne subsiste.
- [DIFFÉRENT] Fil sans message — Milanote : la marque reste tant que l'élément fil existe (il se jette au retour arrière du champ vide) ; Notak : la marque perd son passage hors édition (`sansPassagesMuets`).

### 3.4 Barre d'outils
- [ABSENT] Détacher — Milanote : le fil en ligne devient un fil attaché ordinaire (épingle) à x = 100 %, y = milieu du passage + 5 px ; retire la marque — Notak : absent.
- [ABSENT] Retirer le fil en ligne — Milanote : outil « Remove » (corbeille) avec la marque ôtée — Notak : seulement « Résoudre » et « Fermer » dans la fiche de marge.
- [ABSENT] Couleur — voir §1.4.

### 3.5 à 3.9 Reste
- [DIFFÉRENT] Positionnement de la fiche en marge — Notak : alignée au passage, écart 8 px entre fiches (`placerEnMarge`) ; Milanote : une bulle à la fois.
- [DIFFÉRENT] Fiche de marge — Notak : opacité 85 % (60 % si résolu), contour accent 2 px quand actif, boutons « Résoudre » et « Fermer » ; Milanote : fiche de fil complète (§1).
- [ABSENT] Plusieurs fils sur un même passage / marques imbriquées : Milanote donne à la marque `InlineComment` une priorité 1001 pour envelopper une marque de lien ; ses ids multiples ouvrent le premier — Notak : une marque, une valeur `fil`.
- [ABSENT] Les liens dans un passage commenté ne s'ouvrent pas au clic (le fil s'ouvre via le bouton) — Notak : ⌘+clic ouvre le lien.

---------------------------------------------------------------------------------------------------------------

## 4. Réactions

### 4.1 Création
- [DIFFÉRENT] Par la barre de sélection (outil « Add reaction » / « Réagir »), un ou plusieurs éléments — Milanote : popup du sélecteur complet (§6) ; un clic pose/retire la réaction de l'utilisateur sur tous les éléments choisis ; le popup reste ouvert (pas de fermeture après le choix quand ouvert depuis la barre) ; pour une liste de tâches avec une tâche active, c'est la tâche qui reçoit — Notak : `OutilReactions` (`Outils.tsx:64`), grille de 8 émojis fixes puis sélecteur, ferme le menu après le choix (`fermer()`).
- [DIFFÉRENT] Règle de bascule sur plusieurs éléments — Milanote : si au moins un des éléments a déjà cette réaction de moi, on ne fait que la RETIRER de ceux qui l'ont ; sinon on la pose sur tous — Notak : si tous l'ont, on la retire de tous ; sinon on la pose sur ceux qui ne l'ont pas (`Outils.tsx:68-75`).
- [OK] Une réaction par personne et par émoji — Notak : `basculerReaction`.
- [OK] Droit : FEEDBACK suffit (pas de droit d'écriture) — Notak : `lectureSeule` coupe tout (écart de droits, voir §1.3).
- [ABSENT] Par un bouton « + » sur le fil — voir §1.9.

### 4.2 Rendu au repos
- [DIFFÉRENT] Emplacement — Milanote : DANS la carte, sous le contenu et avant la légende, flexible multiligne ; marge haute −10 px, 24 px à droite, 16 px en bas, 24 px à gauche ; pour une image sans légende (`media-only`) : superposé en bas à gauche de l'image avec marge de 7 px, hauteur 23 px, ombre `0 1px 2px #1B25361A` sur chaque pastille et fond `#E8E9EB`, masqué si l'image fait moins de 60 px de large, n'affiche que les rangées qui tiennent dans la hauteur — Notak : bande ABSOLUE sous la carte, hors du fond blanc (`decor.css:15-25`), 6 px d'écart.
- [DIFFÉRENT] Pastille — Milanote : hauteur 20 px, largeur mini 35 px, padding 2/3/3/3 px, rayon 2 px, marge droite 4 px et basse 4 px, police 11 px, fond `#E8E9EB`, texte `#5F6672` ; émoji en image de 16 px (= 1,6 × la grille) à gauche, compte à droite (mini 10 px de large, marge 2 px, graisse 600) ; actif (j'ai réagi) fond `#EAEFFE`, texte `#2F63F7` — Notak : hauteur 22 px, rayon 11 px (ovale), bordure 1 px `#0000001A`, fond blanc, émoji natif en texte, compte normal ; actif : bordure accent + fond accent à 14 %.
- [DIFFÉRENT] Ordre — Milanote : étiquettes d'abord puis réactions, dans la même ligne, ordre d'apparition des émojis (premier arrivé) — Notak : étiquettes sur une ligne, puis échéance/personne/commentaires/réactions sur une autre.
- [ABSENT] Bouton « + » — Milanote : après la dernière pastille, seulement sur un fil de commentaires ou pour un message ; 20 px de haut, padding 3/4/3/4, rayon 3 px, icône dans une zone de 14 px, l'icône passe à la couleur d'avant-plan principale (gris foncé) quand le popup est ouvert ; jamais sur les cartes ordinaires — Notak : aucun bouton « + » nulle part.
- [OK] Pas de pastille tant qu'aucune réaction.

### 4.3 États
- [ABSENT] Info-bulle de survol — Milanote : après 300 ms, « **Vous, Anna et Marc** reacted » (en gras : liste de prénoms « A, B and C » ; « You » en premier ; 6 prénoms au plus puis « N others/other ») ; 12 px, graisse normale ; les prénoms inconnus sont chargés à l'ouverture — Notak : `title` natif « Retirer ma réaction » / « Réagir aussi » (`decor.retirerReaction`, `decor.reagirAussi`) : ne dit pas qui.
- [DIFFÉRENT] Désactivé — Milanote : pastille grisée (même fond, opacité 1) si pas de droit ; Notak : `disabled` du bouton (curseur normal).
- [OK] Clic sur une pastille bascule ma réaction — Notak : `reagir(r.emoji)`.
- [ABSENT] Aperçu du tableau (carte de tableau en aperçu) — Milanote : le bouton « + » est masqué dans l'aperçu, pastilles ajustées d'un pixel — Notak : sans objet.

### 4.4 Barre d'outils
- [OK] Libellé et place : 3e outil visible après Couleur et Étiquettes (« Add reaction ») — Notak : 'Réagir' (rang 30).
- [ABSENT] Raccourci — Milanote : aucun ; Notak : aucun.
- [DIFFÉRENT] Popup — Milanote : bulle claire alignée au centre sous l'outil, flèche 13 × 8, largeur 572 px (voir §6) ; Notak : menu compact 320 px de large (`decor.css:278-281`).

### 4.5 Menu du clic droit
- [OK] Aucune entrée « réaction » dans le menu Milanote ; Notak non plus.

### 4.6 Gestes
- [DIFFÉRENT] Réaction sur une tâche précise d'une liste (outil de réaction de tâche, popup avec la liste des réactions de la tâche) — Milanote : oui ; Notak : à vérifier (`taches/`).
- [ABSENT] Réaction sur un message d'un fil — Milanote : oui, voir §1.9 ; Notak : non.
- [DIFFÉRENT] Fenêtre — Notak : le menu se ferme au choix ; Milanote ferme seulement depuis le bouton « + » d'un message (le sélecteur reçoit `closePopup`).

### 4.7 à 4.9
- [ABSENT] Mémoire des fréquents — voir §6.
- [ABSENT] Horodatage de la réaction — Milanote enregistre `timestamp` pour chaque réaction (notifications « X a réagi ») ; Notak ne garde que l'identifiant de la personne.
- [ABSENT] Notifications — Milanote notifie le propriétaire d'une réaction ; Notak : cloche existante (voir FONCTIONNALITES §329), contenu à comparer.

---------------------------------------------------------------------------------------------------------------

## 5. Étiquettes (labels / « pastilles » d'étiquette)

### 5.1 Création / pose
- [DIFFÉRENT] Outil « Add labels » (« Étiquettes ») de la barre de sélection — Milanote : visible pour tout élément ; pour plusieurs éléments avec une liste de tâches parmi eux, seulement si chaque liste n'a qu'une tâche ; s'applique à tous les éléments choisis — Notak : outil `OutilEtiquettes`, un panneau avec cases à cocher indéterminées (certains/tous) hors tâches.
- [DIFFÉRENT] Nom — Milanote : max 30 caractères (`LABEL_NAME_MAX_LENGTH`) ; deux étiquettes de même nom peuvent exister (la correspondance est insensible à la casse seulement pour « Entrée ») — Notak : max 30 (`NOM_ETIQUETTE_MAX`), refus des doublons (insensible à la casse).
- [DIFFÉRENT] Couleur initiale — Milanote : si le nom contient le nom anglais d'une couleur (GREY, CYAN, GREEN, BROWN, YELLOW, ORANGE, RED, PINK, PURPLE, BLUE, DEEP_BLUE) c'est cette couleur ; sinon une analyse de sentiment du nom (mots positifs → vert `#7CD651`, négatifs → rouge `#FF5757`, selon la langue) ; sinon une couleur hexadécimale ALÉATOIRE — Notak : la couleur de la palette la moins utilisée (`annotations.ts:9-17`).
- [DIFFÉRENT] Palette — Milanote : 12 teintes d'élément + BLANC (`#FFFFFF`) + couleur personnalisée par roue (aucun « Aucune ») ; les couleurs suggérées de la page apparaissent aussi — Notak : 11 teintes de note (sans blanc), pas de couleur libre.
- [ABSENT] Créer en tapant du texte puis Entrée — Milanote : Entrée dans la recherche pose l'étiquette de même nom si elle existe (sans doubler), sinon la crée et la pose ; le champ se vide ; analytique « utilisé la recherche » — Notak : champ « Nouvelle étiquette… » + bouton « Créer » (`Etiquettes.tsx:153-158`) ; Entrée dans le formulaire crée.
- [OK] La création sur une sélection pose aussitôt l'étiquette — Notak : idem.

### 5.2 Rendu au repos (pastille d'étiquette sur la carte)
- [DIFFÉRENT] Dimensions — Milanote : brique « Chip » taille `sm` : hauteur 20 px, padding horizontal 6 px, police 12 px / interligne 20 px, graisse 500, rayon 4 px ; taille `xs` (18 px de haut, marge haute 4 px) pour les éléments compacts ; marges 4 px à droite et en bas ; pas de transition ; largeur au contenu avec points de suspension au-delà — Notak : `padding: 2px 8px`, rayon 10 px (ovale), 12 px, graisse 500, hauteur ≈ 18-19 px (`decor.css:28-37`).
- [DIFFÉRENT] Couleur du texte — Milanote : noir si le fond est clair, blanc s'il est sombre (calcul de luminosité) — Notak : toujours `#1F2430`.
- [DIFFÉRENT] Contour d'une pastille proche du fond — Milanote : si la couleur de la pastille ressemble à celle de l'élément (ou du menu), un contour de 1 px noir à 30 % (pastille claire) ou blanc à 30 % (pastille sombre) — Notak : aucun contour (une étiquette grise sur une note grise disparaît).
- [DIFFÉRENT] Emplacement — Milanote : dans la carte, avant les pastilles de réaction, sur la même ligne multiligne ; pour un média sans légende : en superposition (§4.2) — Notak : sous la carte, hors du fond.
- [OK] Ordre = ordre de pose chez Milanote (liste d'identifiants) — Notak : ordre de la LISTE DU TABLEAU, pas de la pose (`etiquettesDe` filtre `tableau.etiquettes`) : DIFFÉRENT.
- [DIFFÉRENT] Surbrillance de recherche — Milanote : anneau 2 px jaune `#FFED00` sur l'étiquette qui correspond à la recherche ; se déplace avec la liste des résultats — Notak : pas d'anneau ; le filtre estompe les cartes (`opacity 0.25`) au lieu de surligner.

### 5.3 États
- [ABSENT] Choisie (clic sur la pastille quand l'élément est seul choisi et modifiable) — Milanote : anneau 2 px `#323B4A` autour de la pastille, focusable, barre de gauche en mode « label-selected » (Couleur, Renommer, Retirer) ; clic hors de la zone de pastilles (dans la toile) la désélectionne ; un autre élément choisi la désélectionne ; Échap la désélectionne — Notak : aucune sélection de pastille.
- [ABSENT] En édition (renommer sur place) — Milanote : double-clic, Entrée ou F2 sur la pastille choisie : champ texte simple ligne dans la pastille, anneau 2 px, texte sélectionné en entier, max 30 caractères, collage en texte brut mono-ligne ; Entrée valide (puis désélectionne tous les éléments), Échap annule et rend le focus à la pastille, flou valide ; nom vide = on garde l'ancien ; Retour arrière/Suppr dans un champ vide retire l'étiquette de l'élément — Notak : le nom se modifie seulement dans le panneau Étiquettes (champ + Entrée/flou).
- [ABSENT] Retirer — Milanote : touche Suppr ou Retour arrière sur la pastille choisie (hors édition) la retire de l'élément et désélectionne tout ; ou outil « Remove » de la barre ; la corbeille n'est pas utilisée (annulable) — Notak : décocher dans le panneau seulement.
- [DIFFÉRENT] Désactivée (pas de droit d'écriture) — Milanote : curseur normal, pas de focus, pas de sélection ; Notak : lecture seule, pastille inerte.
- [ABSENT] Dans une liste de tâches — Milanote : étiquettes PAR TÂCHE (chip d'item, taille `xs`), sélectionnables et supprimables une à une, `gap` 4 px — Notak : étiquettes sur la liste entière.

### 5.4 Barre d'outils (« Add labels »)
- [ABSENT] Popup — Milanote : bulle ancrée sous l'outil avec en-tête de recherche (focus auto sauf iPad), puis liste scrollable de 380 px de hauteur max, bas 6 px ; contenu : ligne « créer [texte] » (icône +), puis résultats ou sections (voir 5.5) — Notak : menu 230 px de large (`decor.css:178-188`), liste à plat, pas de défilement borné.
- [ABSENT] Recherche — placeholder issu de la traduction `labels.search.placeholder` (libellé à relever à l'écran), 30 caractères max ; filtre insensible à la casse « contient » ; Entrée = pose/crée — Notak : aucune recherche.
- [ABSENT] Case par ligne — Milanote : case à cocher (taille `sm`, bleu) cochée si l'étiquette est sur AU MOINS UN des éléments choisis (jeu d'ids utilisés), clic = bascule (si elle est déjà sur tous, on la retire de tous, sinon on la pose partout) ; son de « case cochée / décochée » — Notak : case à trois états (cochée si tous, indéterminée si certains) : plus fin ; OK sur le fond, DIFFÉRENT sur le son (absent).
- [ABSENT] Navigation clavier — Milanote : flèches haut/bas dans la liste (GridList), Tab en édition ; la frappe de caractères ne saute pas à une ligne ; Échap non géré par la liste (laisse le popup se fermer) — Notak : tabulation native.
- [EN TROP] Filtre par étiquette (icône oeil) — Notak : filtre le tableau, estompe 25 % des cartes qui ne correspondent pas ; Milanote n'a PAS de filtre ici : on clique le lien « Used N times » du menu de l'étiquette qui ouvre la recherche du tableau préremplie avec le nom de l'étiquette.

### 5.5 Sections de la liste
- [ABSENT] Hors recherche — Milanote : sections « suggérées » : les étiquettes déjà posées dans les tableaux du chemin courant (une section par tableau du fil d'Ariane, avec le titre du tableau ; le tableau racine s'appelle « Home »), avec fusion progressive pendant le chargement ; à défaut, la section « Recently created » (les 5 dernières étiquettes que J'AI créées, classées par date de création décroissante) ; séparateurs entre sections (pleine largeur) et en-tête de section à 16 px de marge — Notak : une seule liste dans l'ordre de création.
- [ABSENT] En recherche — liste plate de résultats avec séparateur en tête ; « No results » (grisé, 14 px, gris tertiaire) sinon.
- [ABSENT] États — Milanote : chargement (spinner, 16 px de marge), vide (illustration `labels-placeholder` de 180 px de large + texte 14 px graisse 500 centré, clé `labels.menu.emptyListPlaceholder`), aucun résultat — Notak : texte « Aucune étiquette ».

### 5.6 Menu d'une étiquette (bouton « ••• »)
- [ABSENT] Bouton — Milanote : bouton tertiaire à droite de chaque ligne (icône trois points horizontaux, 16 px, gris quaternaire, fonce quand ouvert) ; ouvre un popover à droite/haut (décalage 4 px, −6 px en travers, largeur mini 208 px) — Notak : oeil et croix directement sur la ligne.
- [ABSENT] Entrées — Milanote, dans l'ordre : « Rename », « Change color » (sous-menu avec la palette : 12 teintes + blanc + « couleur personnalisée » par roue native), « Delete » (rouge ; sous-menu de confirmation : texte centré de description `labels.edit.deleteDescription`, boutons « Cancel » (secondaire) / « Delete » (destructif), 50 % chacun) ; pied : « Used N times » avec le décompte chargé (spinner « fetching », variante d'erreur) et le lien qui ouvre la recherche — Notak : croix de suppression sans confirmation (`etiquettes.supprimer`) ; couleur par une palette de pastilles en ligne.
- [DIFFÉRENT] Aperçu de couleur — Milanote : la couleur survolée s'applique en direct à la pastille (styles temporaires) et se rétablit à la fermeture sans choix — Notak : clic = application.
- [DIFFÉRENT] Suppression — Milanote : retire l'étiquette de tous les éléments qui la portent (annulable) ; Notak : idem en un pas (OK).

### 5.7 Gestes
- [ABSENT] Clic / double-clic / Entrée / F2 / Suppr / Échap sur une pastille de la carte — voir 5.3.
- [ABSENT] Glisser-déposer : une pastille ne se glisse pas, mais la carte entière peut être saisie par la pastille (`dragstart` non bloqué pour les pastilles non focusables) — Notak : pastilles non saisissables (le décor arrête le pointeur).
- [ABSENT] Dans une colonne — Milanote : dans le flux, comme sur la toile ; Notak : même chose (mode liste).

### 5.8 à 5.9 Contenu, animations, couleur
- [ABSENT] Aucune transition (`transition-none`) chez Milanote ; Notak : aucune non plus (OK).
- [OK] Label stocké comme liste d'identifiants sur l'élément + table des étiquettes de l'espace (nom, couleur, créateur, dates) — Notak : liste par tableau (`Tableau.etiquettes`), pas partagée entre tableaux : DIFFÉRENT (Milanote : étiquettes du compte, communes à tous les tableaux).
- [ABSENT] Analytique/recherche — la recherche globale de Milanote trouve un élément par le nom de ses étiquettes ; Notak : à vérifier (recherche non livrée, voir RESTE.md).

---------------------------------------------------------------------------------------------------------------

## 6. Sélecteur d'émojis (réactions, fil, légende de tâche, encadré)

- [DIFFÉRENT] Jeu d'émojis — Milanote : jeu Unicode complet (≈ 1 900 éléments avec variantes de teinte), images de style Apple sur les plateformes Apple, Twitter ailleurs, fournies par un CDN en 1× et 2× avec repli sur le caractère Unicode en cas d'erreur — Notak : ≈ 250 caractères natifs (`catalogueEmojis.ts`), rendu du système.
- [DIFFÉRENT] Fenêtre — Milanote : bulle claire de 572 px de large, padding 24 px (10 px à droite), flèche 13 × 8 px de la couleur du fond, distance 15 px, 2 px de décalage, ancrée à droite du déclencheur, bornée à l'écran (évite l'en-tête et le clavier virtuel) ; sur iPad : sans padding, rayon 8 px ; sur mobile : feuille avec colonne de 8 px ; contenu en deux colonnes : menu à gauche (220 px, marge droite 20 px), liste à droite (304 px de large, 505 px de haut) — Notak : 320 px de large dans le tiroir de la barre (`decor.css:279`), grille de 224 px de haut.
- [DIFFÉRENT] Menu de gauche — Milanote : liste verticale de catégories (texte) : « Frequently used », « Smileys & Emotions », « People & Body », « Animals & Nature », « Food & Drink », « Travel & Places », « Activities », « Objects », « Symbols », « Flags » ; la catégorie courante suit le défilement (offset + 150 px) ; une catégorie sans résultat est grisée ; en bas : le sélecteur de teinte de peau, puis le champ de recherche « Search… » (le texte `emoji.menu.searchPlaceholder` suivi de trois points) — Notak : une rangée d'onglets-icônes (🕘 puis visages, gestes, symboles, nature, nourriture, activités, objets), recherche EN HAUT, pas de teinte de peau.
- [ABSENT] Catégories manquantes — Notak n'a pas « Voyages et lieux » séparé (fusion « Activités et voyages »), « Drapeaux » ni les personnes et corps en entier.
- [DIFFÉRENT] Grille — Milanote : 8 colonnes de boutons 36 × 36 px (image de 24 px), survol : fond `#F3F3F4` en coin arrondi 3 px avec marge de 2 px, sélectionné (déjà posé par moi) : fond `#EAEFFE` ; lignes de 34 px, la dernière de chaque section 46 px ; titres de section : `<h2>` 15 px (16 px selon la taille) graisse 600, remonté de 3 px ; liste virtualisée (react-window, 10 lignes de marge) ; barre de défilement 8 px, piste = fond, pouce gris neutre foncé arrondi — Notak : 8 colonnes de 34 px, glyphe de 20 px, pas de survol propre (bouton générique), pas de titres de section, pas de mise en valeur des émojis déjà posés.
- [ABSENT] Fréquents — Milanote : les 24 émojis (3 rangées de 8) les plus utilisés, compteur stocké dans les réglages du compte, valeurs par défaut 👍 (4), 👎 (3), 😊 (2), 😀 (2), 🙂 (1), 🤔 (1), 😍 (1), 😞 (1) ; chaque choix incrémente son compteur — Notak : 8 derniers choisis + 8 d'origine (👍 ❤️ 😂 🎉 👀 ✅ 🙏 🔥), mémorisés dans `localStorage` (clé `notak:emojis-recents`), pas par compte.
- [ABSENT] Teinte de peau — Milanote : sélecteur animé (la main 👍 en 6 teintes, glissement de 36 px par cran, .25 s ease-in-out, ouverture/fermeture ; bouton souligné « change skin tone » en gris tertiaire) ; la teinte choisie s'applique à tous les émojis compatibles et se retient sur le compte — Notak : absent.
- [ABSENT] Recherche — Milanote : par nom et surnoms (`short_names`) anglais, motif sans casse échappé ; sans résultat : « No results » + émoji 😔 de 24 px (4 px de marge) centré — Notak : par mots-clés français sans accents ; « Aucun émoji trouvé ».
- [ABSENT] Chargement — spinner de 60 px centré en gris neutre 800 — Notak : instantané.
- [ABSENT] Clavier — Milanote : navigation par Tab entre les boutons ; la recherche prend le focus au clic ; Entrée n'est pas gérée — Notak : même chose.
- [ABSENT] Utilisation hors réactions — Milanote : le même sélecteur sert à l'icône d'un encadré (callout) et à l'insertion d'un émoji dans le texte (`:`) — Notak : insertion par une grille de 8 émojis (`Barre.tsx:174`) et l'encadré.

---------------------------------------------------------------------------------------------------------------

## 7. Mentions (@)

### 7.1 Déclenchement et liste
- [OK] Déclencheur `@` au début ou après une espace, suivi de caractères sans espace ni @ — Notak : `MENTION = /(?:^|\s)@([^\s@]{0,30})$/` (limite 30) ; Milanote : regex équivalente, sans plafond.
- [DIFFÉRENT] Liste — Milanote : fenêtre fixe de 320 px de large, padding vertical 15 px, rayon par défaut de l'interface, ombre `shadow-2xl`, fond de l'élément ; max 5 suggestions ; chaque entrée : avatar rond 30 px, nom (12 px, graisse 600, couleur `#2F63F7`, surlignage gras du motif), adresse courriel dessous (12 px gris tertiaire), hauteur mini 48 px, marge latérale 24 px ; entrée choisie fond `#EAEFFE` ; ouverte au-dessus du curseur si le bas est occupé (ancrage haut/bas) ; suit le défilement de la toile ; hauteur max 175 px avec défilement sur mobile — Notak : `.notak-propositions` min 160 / max 280 px, 6 propositions, padding 4 px, rayon 8 px, ligne 13 px avec pastille de teinte 10 px, fond noir à 7 % pour l'entrée choisie, texte seul (pas d'avatar ni de courriel).
- [DIFFÉRENT] Classement — Milanote : sans motif : d'abord les personnes qui partagent CE tableau, puis par nombre de partages (`shareCount`) décroissant, puis par nom (personnes non partageantes en dernier) ; avec motif : score pondéré (prénom ×5, nom ×5, nom affiché ×2, courriel ×1 ; ×3 si début de mot) +20 si la personne a accès ; exclut les scores nuls — Notak : « commence par » d'abord puis « contient », sans accent ni casse (`suggestion.ts`).
- [ABSENT] Section « Not sharing » — Milanote : sous la liste principale, séparateur de 1 px (`#00000014`) et en-tête de 12 px gris tertiaire : les personnes du carnet d'adresses qui n'ont pas accès au tableau, grisées (nom `#5F6672`, courriel `#8D929A`) avec un bouton « Invite » (secondaire, petit) pour les ajouter comme éditeurs sans quitter la saisie (spinner de 20 px pendant l'ajout, « failed » en rouge 1 s sinon) — Notak : seules les personnes présentes ou membres connues sont proposées.
- [ABSENT] Mention sans partage — si le tableau est public en édition (ou publié avec retours), toutes les personnes non bloquées sont proposées — Notak : n/a.
- [ABSENT] Nom court unique — Milanote : la mention affiche le plus court des noms (Prénom, Prénom + initiale, Prénom Nom) qui reste unique parmi les contacts, sinon le courriel — Notak : `p.libelle` (nom entier de la présence).

### 7.2 Rendu et édition
- [DIFFÉRENT] Pastille dans le texte — Milanote : `@Prénom` en graisse 600, couleur `#2F63F7`, fond `#EAEFFE`, padding horizontal 3 px, rayon 3 px, sans retour à la ligne ; dans un fil de commentaire : sans fond ni padding ; dans les titres H1/H2 : décalage vertical d'1 px selon la taille de l'interface — Notak : `.notak-mention` padding 0 5 px, rayon 9 px, fond `#00000012`, graisse 500, couleur accent `#2F6FEB`.
- [DIFFÉRENT] Marque — Milanote : marque Tiptap `textMention` (non inclusive, exclut les autres marques) avec `mentionKey`, `userId`, `originalText` ; si le texte est modifié la marque se brise (retirée) ; supprimer un caractère au bord supprime toute la mention ; les flèches et Alt+flèches sautent d'un bloc ; un espace est ajouté après insertion — Notak : nœud en ligne atomique (`noeuds.ts:191-205`) : supprimé d'un coup, flèches sautent (atome), espace ajouté (OK dans l'esprit).
- [DIFFÉRENT] Touches de la liste — Milanote : flèches Haut/Bas, Entrée ou Tab choisit, Échap ferme, la souris survol = focus, clic (mousedown) choisit ; Entrée n'envoie pas le commentaire quand la liste est ouverte — Notak : Haut/Bas/Entrée/Tab/Échap (`Propositions.tsx:50-54`), identique.
- [ABSENT] Mention dans un commentaire — Milanote : oui (éditeur de commentaire complet) ; Notak : non (texte brut).
- [ABSENT] Notification d'une mention — Milanote : la personne mentionnée est notifiée (cloche, courriel, push) ; Notak : cloche (voir FONCTIONNALITES §329) : contenu à vérifier.

### 7.3 Autres
- [OK] `[[` pour lier un tableau (Notak) — Milanote : « Link to board » du menu Insérer ; deux déclencheurs différents. [DIFFÉRENT] déclencheur : Notak `[[`, Milanote menu d'insertion seul.

---------------------------------------------------------------------------------------------------------------

## 8. Pastilles de tâches (renvoi)

Les pastilles d'une tâche (échéance, personne, étiquettes, réactions) appartiennent à la famille « tâches » ; on note
seulement les valeurs communes.
- [DIFFÉRENT] Pastille de tâche — Milanote : hauteur 19 px (17 en taille moyenne, 15 en petite), padding 1/3/2 px, bord 1 px, rayon 2 px (cadre 3 px), police 11 px, couleur gris neutre 700, « remplie » : fond neutre 400 ; marge haute 4 px — Notak : pastilles génériques du décor (échéance 22 px, personne 22 px).
- [EN TROP] Échéance et personne assignée sur n'importe quel élément (note, image, lien) — Notak (`decor/Outils.tsx` : `OutilEcheance`, `Decor.tsx:60-79`) ; Milanote ne les propose que pour une tâche.
- [DIFFÉRENT] Étiquettes d'une tâche en taille `xs` et sélectionnables une à une (voir 5.3).

---------------------------------------------------------------------------------------------------------------

## Top 15 des écarts les plus visibles

1. **Étiquettes et réactions posées SOUS la carte, hors du fond blanc** (Notak) au lieu d'être DANS la carte, dans son flux, avec marges 24/16/24 px (Milanote) ; pour les images sans légende, pastilles superposées en bas à gauche avec ombre (§4.2, §5.2). Visible sur chaque carte étiquetée.
2. **Pastilles d'étiquette** : ovales (rayon 10 px), texte toujours foncé, sans contour de contraste, ordre de la liste du tableau ; Milanote : rayon 4 px, 20 px de haut, texte noir ou blanc selon la luminosité, contour 30 % si la couleur ressemble au fond (§5.2).
3. **Pastilles de réaction** : ovales à bordure, fond blanc, 22 px ; Milanote : rectangles à coins de 2 px, 20 px, fond `#E8E9EB`, actif `#EAEFFE`/`#2F63F7`, émojis en images de 16 px, info-bulle « qui a réagi » après 300 ms (§4.2, §4.3).
4. **Le commentaire posé sur la toile** : carte blanche de 28 UG, texte brut 14 px, avec « Résoudre » et lignes repliées ; Milanote : fiche bleu très pâle `#F4F7FE` de 34 UG, avatars de 24 px, nom + « il y a N min » à droite, texte 12 px/20 px, liens, mentions, bouton « Post », fondus en haut/bas, défilement interne et hauteur réglable (§1.2).
5. **Le commentaire attaché à un élément** : un badge « 💬 N » dans la bande + panneau sous la carte ; Milanote : épingle de 24 × 29 px aux couleurs du fil, placée au coin haut droit (−20 px, 20 px), déplaçable, qui s'ouvre en bulle à droite avec flèche, compteur plafonné à 99, halo et point de présence (§2).
6. **Pas d'édition de message, pas de mise en forme, pas de mentions, pas de liens** dans les commentaires (texte brut) ; Milanote : éditeur riche complet, « Edit/Save » au survol, mentions `@`, émojis, (§1.6, §1.7).
7. **Le sélecteur d'émojis** : ≈ 250 glyphes natifs, onglets-icônes, 320 px, sans teinte de peau, sans mise en valeur de ses propres réactions, sans titres de section ni survol ; Milanote : ≈ 1 900 émojis en images Apple/Twitter, menu de catégories à gauche (572 px de large), 505 px de haut, teinte de peau animée, fréquents comptés par compte (§6).
8. **Commentaire en ligne** : marque jaune `#F3C534` et fiche dans une marge 260 px, uniquement en édition ; Milanote : fond `#F4F7FE` + soulignement bleu `#2F63F7` à la couleur du fil, bulle ancrée au passage ouverte AUSSI au clic hors édition, outils Détacher/Retirer/Couleur (§3).
9. **Panneau Étiquettes** : liste brute avec filtre « oeil » et suppression immédiate ; Milanote : recherche, sections « Recently created » / par tableau du chemin, cases, créer au clavier, menu par ligne (Rename, Change color + roue, Delete avec confirmation, « Used N times » vers la recherche), états chargement/vide (§5.4 à 5.6).
10. **Sélection et renommage d'une pastille d'étiquette sur la carte** (anneau 2 px, double-clic/Entrée/F2, Suppr, barre « Couleur, Renommer, Retirer ») : absent (§5.3).
11. **Couleur des étiquettes** : 11 teintes de note, choisies par rotation ; Milanote : 12 teintes + blanc + roue libre, choisies d'après le nom (mot-couleur, sentiment positif/négatif, sinon couleur aléatoire) (§5.1).
12. **Couleur, bande de 5 px et « Replier en épingle » d'un fil** : absents ; Notak met à la place Répondre/Résoudre/Replier en une ligne, des notions que Milanote n'a pas (§1.4).
13. **Indicateurs de collaboration d'un fil** (« est en train d'écrire… » avec points animés, « a commencé un fil », point orange non lu, point pulsé de présence, anneau d'avatar actif) : absents (§1.2, §2.2).
14. **Horodatage** : « il y a N h », « hier », « 12 oct. » ; Milanote : « N min/hours/days/weeks ago » puis date courte au-delà de 4 semaines, mis à jour chaque minute, nom limité au prénom, avatar 24 px (§1.2).
15. **Création et attache** : le fil se crée à 28 UG sans mode attacher ni épingle, sans « Nouveau commentaire » au clic droit de la toile, sans ⌘Entrée ; Milanote : 34 UG, glisser sur un élément = épingle avec halo de 40 px, entrée « New comment » dans le menu de la toile (§1.1, §2.1).
