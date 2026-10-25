# Notak · spécification

Ce que Notak doit faire, écrit d'après l'observation de Milanote 3.18 (octobre 2026) : son interface, et son client
lu pour en comprendre le fonctionnement. Ce document décrit des **comportements**. Aucun code, aucune icône, aucun
son ni aucun texte de Milanote n'est repris ; Notak a son propre habillage.

Les décisions propres à Notak, quand elles s'écartent de Milanote, sont marquées **→ Notak**.

## Périmètre de la première version

Décidé le 22/10/2026 : on livre d'abord le **socle**, le reste attend.

**Socle**, dans l'ordre des passes :

| Passe | Contenu |
|---|---|
| 1 ✅ | Toile : zoom, défilement, sélection, déplacement, annuler |
| 2 | Notes en texte riche, titres, couleurs, coller du texte |
| 3 | Images (Finder, collage), liens avec aperçu |
| 4 | Colonnes, tableaux imbriqués et fil d'Ariane, flèches, listes de tâches, aligner et répartir |
| 5 | À plusieurs : serveur, comptes, partage, en direct, curseurs et présence |
| 6 | Import des tableaux Milanote |

**Plus tard** : échéances, rappels et assignation des tâches ; fichiers joints ; croquis et annotations ; table
de données ; nuancier ; document long ; audio, vidéo et carte intégrés ; clones et raccourcis ; non triés ;
corbeille restaurable ; recherche ; présentation ; thème sombre ; étiquettes et réactions ; commentaires et
mentions ; liens publics ; notifications ; exports ; MCP.

Les sections suivantes décrivent tout, socle et suite, pour que le modèle de données ne ferme aucune porte.

---

## 1. Principes

- **Un seul objet : l'élément.** Tout ce qui est posé sur un tableau est un élément : une note, une image, une colonne,
  un tableau imbriqué. Un tableau est lui-même un élément qui en contient d'autres.
- **Les mots de l'interface.** → Notak, décidé le 25/10/2026 : à l'écran, le tableau s'appelle une **toile**
  (« Nouvelle toile », « toile imbriquée »), et la surface où l'on pose les éléments s'appelle le **fond**
  (« Glissez l'outil sur le fond »). « Tableau » reste au bloc Table du document. Le code et ce document gardent
  leurs noms (`tableau`, `Toile.tsx`) : le renommage ne touche que les textes affichés en français.
- **Une grille comme unité.** Positions et tailles se comptent en unités de grille (UG), entières. Une UG vaut 8, 9 ou
  10 px selon la taille d'interface choisie.
- **Local d'abord.** → Notak : l'état vit dans un document CRDT sur la machine. Le serveur relaie et conserve, il
  n'arbitre pas. On écrit hors ligne comme en ligne.
- **Une bibliothèque, plusieurs coques.** → Notak : la toile est un composant React (`@notak/tableau`) qui
  vit dans l'application web, dans la coque de bureau (Tauri), sur iPhone, et dans Silak. Elle ne sait rien
  de l'endroit où elle est posée : on lui donne un magasin, elle l'affiche.
- **Tout geste est une commande.** → Notak : chaque action (créer, déplacer, colorer…) est une commande nommée,
  sérialisable, que l'interface, le serveur et un serveur MCP appellent de la même façon.

## 2. L'élément

Champs communs :

| Champ | Contenu |
|---|---|
| `id` | identifiant créé par le client, triable par date (style ULID) |
| `type` | voir §3 |
| `place` | parent, section, position (§4) |
| `contenu` | propre au type |
| `meta` | créé par, modifié par, dates de création, de modification, de « modification significative » |
| transverses | étiquettes, réactions (emoji par personne), verrouillé, légende |

## 3. Les types

| Type | Ce que c'est | Contenu |
|---|---|---|
| **Note** | carte de texte riche | texte, couleur de fond ou barre de couleur, transparente ou non, largeur, hauteur auto ou bornée (voile en bas si ça déborde) |
| **Titre** | variante de la note : transparente, un titre centré | idem note |
| **Tableau** | tableau imbriqué, affiché comme une icône | titre, icône et couleurs, fond (couleur, image, grille visible), réglages de publication |
| **Raccourci** | renvoi vers un tableau existant | cible, et un cache du titre, de la couleur et de l'icône |
| **Clone** | copie synchronisée d'un élément | élément source |
| **Colonne** | liste verticale d'éléments | titre, couleur, repliée ou non ; ne contient ni colonne ni ligne |
| **Lien** | URL avec aperçu | URL, titre, favicon, image d'aperçu, fournisseur, intégration (lecteur), variante audio / vidéo / carte géographique, lecture auto, en boucle |
| **Image** | image envoyée | fichier en plusieurs tailles (≈ 400, 800, 1600 px et original), couleur dominante, légende, recadrage, rotation, détourage |
| **Fichier** | pièce jointe | nom, type, taille, URL, affichage en icône ou en détail, aperçu (PDF, vidéo, audio) |
| **Document** | page longue de texte riche | titre (60 caractères), texte, affiché en icône |
| **Liste de tâches** | cases à cocher | titre facultatif, tâches (§7) |
| **Ligne** | trait ou flèche entre deux points ou éléments | §6 |
| **Commentaire** | fil de discussion posé sur la toile ou attaché à un élément | fil, replié ou non |
| **Croquis** | dessin dans un cadre | tracés (points avec pression, épaisseur, couleur), fond |
| **Annotation** | dessin à main levée posé directement sur la toile | tracés, fond transparent |
| **Nuancier** | une couleur | couleur (HEX, RGB ou HSL), valeur affichée ou non |
| **Table** | tableau de données | cellules, largeurs de colonnes, titre (§8) |

Conversions automatiques en tapant dans une note vide : une URL devient un lien, un code couleur devient un
nuancier, `[] ` devient une liste de tâches.

Tailles par défaut et minimales :

| Type | Largeur par défaut | Largeur minimale |
|---|---|---|
| Note, lien | 34 UG | 17 UG |
| Colonne | 34 UG | 34 UG, hauteur réglable |
| Image, fichier, croquis, annotation, nuancier | selon contenu | 4 UG |
| Table | 3 colonnes de 12 UG | 12 UG |

Pas de largeur maximale. Double-clic sur la poignée : bascule entre la largeur par défaut et la largeur naturelle du
média.

## 4. Où vit un élément

- **Parent** : un tableau, une colonne, une liste de tâches.
- **Section** du tableau parent :
  - *toile* : posé librement ;
  - *non triés* : le bac latéral des éléments pas encore rangés (Cmd+\ l'ouvre) ;
  - *corbeille* : avec la date d'entrée et l'endroit où le restaurer ;
  - *attaché* : un commentaire rattaché à un élément ou à un passage de texte.
- **Position sur la toile** : `x`, `y` en UG entières, bornées (±15 000).
- **Ordre dans une liste** (colonne, non triés, tâches) : → Notak, un indice fractionnaire (chaîne triable), plutôt
  que les scores numériques à renuméroter de Milanote : deux personnes qui insèrent au même endroit ne se gênent pas.
- **Empilement sur la toile** : les éléments verrouillés toujours dessous ; sinon l'ordre d'empilement, puis la date
  de modification. Ce qu'on vient de déposer passe au-dessus. « Premier plan / arrière-plan » ne réordonne que parmi
  les éléments qui se chevauchent.

## 5. Texte riche

Un document arborescent de blocs et de marques, du type ProseMirror.

- **Blocs** : paragraphe, titre (2 niveaux), petit texte, citation, bloc de code, encadré avec icône, séparateur,
  liste à puces, liste numérotée, liste de tâches, saut de ligne, lien vers un tableau dans le texte.
- **Marques** : gras, italique, souligné, barré, code, lien, couleur du texte (5), surlignage (6), mention d'une
  personne, ancre de commentaire.
- **Alignement** : gauche ou centré, par bloc.
- Chaque type n'accepte qu'un sous-ensemble : la note a tout ; une légende ou une cellule n'a ni titre, ni liste,
  ni bloc de code.
- → Notak : le document a davantage, d'après Notion (titre 3, dépliants, colonnes, image, aperçu de lien, couleurs
  de bloc) ; voir `docs/NOTION.md`.

→ Notak : le texte d'un élément est un `Y.XmlFragment` (Yjs, via y-prosemirror), donc deux personnes écrivent dans la même note, la
même liste ou le même document sans conflit. Milanote envoie des diffs et rejette en cas de version concurrente ; c'est son point faible.

## 6. Lignes

- Deux extrémités : un point libre, ou un ancrage à un élément (de la toile ou dans une colonne). Un ancrage suit
  l'élément quand on le déplace.
- **Courbe** : courbe de Bézier quadratique, définie par un point de contrôle (écart perpendiculaire et position le
  long du segment). Ramené près du milieu (moins de 20 px), le trait redevient droit.
- **Pointes** : flèche, rond ou rien, à chaque bout. Par défaut : rien au départ, flèche à l'arrivée.
- **Trait** : plein, tirets, pointillés ; épaisseur 1, 2 ou 4 (2 par défaut) ; couleur.
- **Libellé** : texte brut (400 caractères), affichable ou non.
- Longueur minimale : 4 UG. Cmd+K relie les éléments sélectionnés.

## 7. Tâches

- Une liste de tâches est **un seul document de texte** : un titre facultatif, puis des tâches, chacune pouvant
  contenir des sous-tâches (6 niveaux).
- Une tâche : cochée ou non, identifiant stable, échéance (date, heure facultative), rappel (à l'échéance, 10 min
  avant, 1 h avant, 9 h le jour même, 9 h la veille), personnes assignées, étiquettes, réactions.
- Entrée crée une tâche sœur sans recopier échéance ni assignation.

## 8. Table

- Une grille de cellules. Largeur des colonnes en UG (12 par défaut, 4 au minimum). Départ : 3 colonnes × 4 lignes,
  ligne d'en-tête teintée.
- **Cellule** : valeur ou formule, texte riche réduit, dernier résultat calculé (pour la recherche), type, alignement
  horizontal et vertical, fond, lecture seule.
- **Types** : auto, nombre, monnaie, pourcentage, texte, date et heure, case à cocher, avec leurs formats
  (décimales, milliers, devise, format de date).
- **Formules** de tableur. → Notak : un moteur de formules libre (HyperFormula est sous GPL, à vérifier ; à choisir quand la table viendra).

## 9. Couleurs

- Une palette de 11 teintes nommées, plus « aucune ». On stocke le **nom** quand la couleur vient de la palette, un
  code hexadécimal quand elle est libre : changer de thème recolore tout.
- Variantes : les colonnes ont des teintes plus claires ; les fonds de note ajoutent « transparent » ; les croquis
  ajoutent blanc et anthracite.
- Fonds de toile : 5 teintes.
- Chaque tableau reçoit une palette suggérée de 7 couleurs, tirée au hasard.
- Thème clair et thème sombre.
- → Notak : palette, valeurs et noms à nous.

## 10. La toile

- **Zoom** :
  - de « tout tient à l'écran » (au plus 40 %) jusqu'à 300 % ;
  - Cmd + molette, ou pincement au trackpad (sensibilité triplée) ; le rendu rattrape l'échelle en douceur ;
  - au-dessus de 100 %, on zoome vers le curseur ; en dessous, depuis le centre ;
  - un même geste s'arrête à 100 % : il en faut un second pour passer de l'autre côté (l'inertie du trackpad ne
    franchit pas 100 % par accident) ;
  - crans clavier : 120, 150, 200, 300 % vers le haut, quatre crans vers le bas ;
  - **Ajuster (Z)** : cadre tout le contenu en 600 ms (jusqu'à 130 % si c'est petit, 80 % si c'est grand) ;
    appuyé une seconde fois, revient à 100 %.
- **Défilement** : molette ou trackpad ; espace maintenue + glisser, ou bouton du milieu, pour attraper la toile.
- **Taille** : la toile s'étend jusqu'aux éléments les plus lointains plus une marge (50 × 40 UG), jamais plus petite
  que la fenêtre ; elle ne rétrécit pas pendant qu'on est dézoomé.
- **Grille de points** visible à 100 %, masquée à toute autre échelle et en présentation.
- **Aimantation** : à l'UG seulement, pas de guides d'alignement. Maj pendant un glisser verrouille l'axe. À la
  redimension, la largeur s'aimante à 34 UG à moins de 2 UG près. → Notak : des guides d'alignement viendront
  plus tard, désactivables.

## 11. Sélection et déplacement

- Clic : remplace la sélection. Cmd+clic : ajoute ou retire. Maj+clic : plage, dans une liste.
- **Lasso** depuis le vide : prend tout élément qui touche le rectangle ; une ligne doit être contenue ou traversée.
  Avec Maj ou Cmd, il inverse. Clic droit sur le vide : désélectionne.
- Cmd+A : tout, dans la zone active (toile, non triés, corbeille).
- **Échap** remonte d'un cran à chaque appui : menu, puis édition, puis sélection.
- Flèches : 1 UG ; Maj+flèches : 5 UG ; dans une liste, elles réordonnent.
- **Redimensionnement** : une poignée par élément ; image et fichier gardent leurs proportions sauf avec Cmd.
  Redimensionner un groupe met les éléments à l'échelle en cascade (500 ms).

## 12. Glisser-déposer

- **Dans une colonne** : la place d'insertion est le premier élément dont le centre vertical est dépassé par le
  curseur. Lâcher à sa place ne fait rien.
- **Hors d'une colonne** : vers la toile, position arrondie à l'UG ; un groupe garde ses écarts.
- **Sur un tableau imbriqué** : le contenu part dans ses non triés ; si son contenu est vide et qu'on dépose plusieurs
  éléments, ils gardent leur disposition. Survoler un tableau ou le fil d'Ariane 700 ms y entre.
- **Depuis le Finder** : fichiers, images, URL, texte. Plusieurs fichiers sur une toile vide se rangent en mur de
  briques (maçonnerie), 2 UG d'écart.
- **Outils** : on fait glisser un outil de la barre de gauche sur la toile ; le fantôme est l'élément lui-même,
  tenu à 3 UG de son coin (un tableau par son centre, une ligne par son milieu). Lâché sur une colonne, il y entre
  à la place visée ; sur la barre, rien n'est créé. Un simple clic ne crée rien : l'outil rebondit et une bulle
  rappelle qu'on le glisse (5 s).
- **Rendu du glisser** : l'élément suit le pointeur au pixel avec un léger retard (60 % de l'écart par image,
  50 % s'il s'incline) et ne s'aimante à la grille qu'au dépôt. Il se soulève (l'ombre monte de 5 % par image,
  pleine à 50 px parcourus), s'incline dans le sens du mouvement (au plus 25°, moins s'il est grand ; jamais un
  tableau, une ligne ni un groupe), puis se repose en douceur. Échap pendant le geste ramène tout à sa place.
- Le détail des écarts relevés avec Milanote, et ce qui reste à faire, est dans `docs/ecarts/`.

## 13. Coller

Par priorité :
1. des éléments Notak (même tableau : décalés de 2 UG à chaque collage) ;
2. un tableau HTML d'au moins 2×2 → une table ;
3. un fichier ou une image ;
4. une URL seule → un lien avec aperçu ;
5. une liste à cases → une liste de tâches ;
6. un code couleur → un nuancier ;
7. du HTML ou du texte → une note.

Ce qui est créé par collage arrive dans les non triés, ou au centre de la vue.

→ Notak : couper met à la corbeille d'un seul pas (Milanote cache les éléments et les déplace au collage) ; le
collage en fait des copies. Le menu « Coller » colle au point cliqué.

## 14. Barres et menus

- **Barre de gauche** : note, lien, tâches, ligne, tableau, colonne, commentaire, table, puis un tiroir « plus »
  (croquis, couleur, document, audio, carte, vidéo, titre), puis image, fichier, dessin ; la corbeille en bas,
  qui accepte les dépôts.
- **Barre de sélection** : outils propres au type sélectionné (couleur, étiquette, réaction, commentaire, aligner
  dès 2 éléments, répartir dès 3, relier, menu « … »).
- **Menu contextuel de la toile** : coller, annuler, rétablir, tout sélectionner, créer, fond du tableau.
- **Menu contextuel d'un élément** : couper, copier, coller le style, dupliquer, cloner, corbeille, renommer, ouvrir
  dans une fenêtre, grouper en colonne, convertir, verrouiller, premier plan, arrière-plan.
- **En-tête** : fil d'Ariane, titre du tableau, annuler, rétablir, recherche, notifications, réglages ; partager,
  exporter, affichage (zoom, présentation).

## 15. Raccourcis

Cmd = Ctrl hors Mac.

| Touche | Effet |
|---|---|
| Suppr, Retour arrière | à la corbeille |
| Entrée | éditer la sélection |
| Échap | remonter d'un cran |
| Cmd+Z, Cmd+Maj+Z | annuler, rétablir |
| Cmd+A, Cmd+D | tout sélectionner, dupliquer |
| Cmd+C, Cmd+X, Cmd+V | copier, couper, coller |
| Cmd+Alt+V | coller le style |
| Cmd+Maj+↑ / ↓ | premier plan, arrière-plan |
| Alt+W / A / S / D | aligner en haut / à gauche / en bas / à droite |
| Alt+H, Alt+V | centrer horizontalement, verticalement |
| Cmd+Alt+Maj+H / V | répartir horizontalement, verticalement |
| Cmd+K | relier par une ligne |
| Cmd+Entrée | créer l'élément suivant du même type, dessous |
| Cmd+\ | ouvrir ou fermer les non triés |
| Cmd+F | rechercher |
| Cmd+U | tableau parent |
| Espace | ouvrir l'élément sélectionné ; maintenue : attraper la toile |
| Z, Cmd+=, Cmd+−, Cmd+0 | ajuster, zoom avant, zoom arrière, 100 % |
| Cmd+Alt+P | présentation |
| Cmd+Maj+D | thème sombre |
| Cmd+Maj+, / . | interface plus petite, plus grande |
| / | aide des raccourcis |
| Maj+D | dessiner sur la toile |
| Double-clic sur le vide | nouvelle note |

## 16. Annuler, rétablir

- Un pas = une transaction : un déplacement de groupe, un alignement, un collage s'annulent d'un coup.
- 500 pas gardés.
- Seuls ses propres gestes s'annulent, jamais ceux des autres. → Notak : le `UndoManager` de Yjs, limité à l'origine
  locale, le fait nativement.
- Milanote annule aussi la navigation entre tableaux. → Notak : non, la navigation a son Précédent / Suivant.

## 17. Navigation

- Fil d'Ariane, tronqué au milieu par « … », qui accepte les dépôts.
- Accueil : le tableau racine de chacun.
- Corbeille par tableau, restaurable.
- Recherche dans tous les tableaux accessibles.
- **Présentation** : plein écran, sans barres ni grille ; options masquer les commentaires, bloquer l'édition, mode
  focus (l'élément cliqué s'agrandit).

## 18. À plusieurs

### Droits
- Masque de bits par élément : lire, écrire, partager, commenter, posséder, et un bit de blocage.
- Les droits s'héritent par l'arbre : le droit effectif est l'union des droits de tous les ancêtres ; un blocage en
  haut peut être levé plus bas.
- Rôles usuels : lecture ; lecture + commentaire ; édition ; propriétaire.
- **Lien public** : un identifiant de lien, échangé contre un jeton de portée limitée ; mot de passe facultatif ;
  commentaires, édition publique, téléchargement des fichiers et message d'accueil réglables ; révocable.
- Invitation par courriel.

### Temps réel
- **Présence** : qui regarde le tableau (avatars), ce que chacun a sélectionné, « untel écrit ».
- **Curseurs** des autres, sur un canal éphémère séparé, ouvert seulement quand quelqu'un d'autre est là, au plus
  8 positions par seconde, en UG.
- Milanote éjecte de l'édition celui qui édite quand un autre sélectionne le même élément. → Notak : non, le CRDT
  permet d'écrire à deux ; on affiche seulement qui est là.

### Synchronisation → Notak
- **Un document Yjs par tableau.** Éléments dans une `Y.Map` par identifiant ; texte dans un `Y.XmlFragment` ;
  ordre des listes par indices fractionnaires.
- **Protocole** : le protocole de synchronisation Yjs (vecteur d'état, puis mises à jour) sur WebSocket ; la
  présence sur le protocole *awareness* de Yjs. Un client web futur (Silak) pourra se brancher tel quel.
- **Serveur** : un canal de diffusion par tableau ; les mises à jour sont ajoutées à Postgres puis compactées
  régulièrement en un instantané. Plusieurs nœuds : `LISTEN/NOTIFY`.
- **Hors ligne** : le document est persisté localement (IndexedDB dans le navigateur, `y-indexeddb`) ; à la reconnexion, les vecteurs d'état
  font l'échange minimal.
- **Le serveur vérifie les droits** à chaque mise à jour reçue ; le client ne décide de rien.

### Fichiers
- Téléversement direct vers le stockage (S3 ou disque) par URL signée.
- Variantes d'image produites côté serveur (400, 800, 1600 px) ; une miniature floue minuscule en attendant.
- **Aperçus de liens côté serveur** : titre, description, image, fournisseur reconnu (YouTube, Vimeo, Spotify,
  cartes…), avec un cache partagé.

### Commentaires et notifications
- Fil de commentaires en texte riche, mentions des collaborateurs, réactions, « en train d'écrire ».
- Notifications fabriquées par le serveur : assignation, mention, partage, commentaire, réaction, échéance. Seuls
  les changements significatifs comptent.

## 19. Export et import

- **Milanote n'a pas d'export structuré.** Il exporte en PDF, PNG, Word, Markdown et texte, plus un zip des
  fichiers. Le Markdown perd toute la disposition.
- → Notak, import : par l'API de Milanote, avec la session de l'utilisateur, tableau par tableau (lecture des
  éléments, téléchargement des fichiers), puis conversion vers le modèle Notak. Correspondances à tenir (noms de
  champs de Milanote, pour l'interopérabilité seulement) : `CARD`, `BOARD`, `ALIAS`, `CLONE`, `COLUMN`, `LINK`,
  `IMAGE`, `FILE`, `DOCUMENT`, `TASK_LIST`, `TASK`, `LINE`, `COMMENT_THREAD`, `SKETCH`, `ANNOTATION`,
  `COLOR_SWATCH`, `TABLE` ; sections `CANVAS`, `INBOX`, `TRASH`, `ATTACHED` ; texte au format Tiptap ou Draft.js
  (ancien) ; tâches en deux formats (un élément par tâche, ou un seul document).
- → Notak, export : un format ouvert documenté (`.notak`, zip d'un JSON et des fichiers), plus PDF, PNG et Markdown.

## 20. Hors champ pour l'instant

Abonnements et paiements, administration, modèles publics, application mobile, intégrations tierces, IA.
