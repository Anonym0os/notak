# Écarts Notak / Milanote : document, table, croquis, dessin, nuancier

Famille `document-table-croquis`. Sources lues : `client/element/{document,table,drawing,colorSwatch}`, `common/{documents,table,drawings,colorSwatches,colors}`,
`client/components/{displayMode,paperIcon,editableTitle,caption}`, `client/workspace/toolbar/{config,components/selectionTools}`, `workspace/contextMenu`,
et le CSS des modules (feuilles `.scss` décompilées). Notak lu à la date du dernier commit (`131bd90`, 23/10/2026), dossier `packages/tableau/src/`.
Rien de Milanote n'est recopié : valeurs, ordres et libellés seulement. Les libellés anglais viennent des clés de traduction (les fichiers de langue ne sont pas dans la source).

Limites : (1) la barre d'outils du croquis existe en deux versions chez Milanote, l'ancienne (CSS lisible, utilisée par défaut) et une « Roma » derrière un drapeau
d'essai (CSS en classes utilitaires, non lisible) : les valeurs données sont celles de l'ancienne, la nouvelle est à comparer à l'écran. (2) Rien n'a été lancé : tout ce qui
est dit de Notak vient du code. (3) Le tactile, le mobile et la collaboration (curseurs des autres) ne sont pas comparés.

## 0. Ce qui reste des relevés précédents

- Croquis (`releve-croquis.md`) : appliqués = épaisseurs 2/4/8/32 px écran, tous les points gardés, feuille 1,63, palette de 13, gomme par trait cernée de rouge, Abandonner/Enregistrer,
  raccourcis D M B V S E C X I 1-4 Cmd+S Cmd+Z, réglages mémorisés, outil Sélection et pipette. Non appliqués : voir §3 (fenêtre de couleur, forme et place de la barre, voile, curseurs,
  rayon de la gomme, bouton « Dessiner », légende, fond 13 choix).
- Document (`releve-document-image.md`) : appliqués = modale (en-tête de 56 px, titre modifiable, Export, colonne d'outils de 104 px, texte 16/24, H1 24/29, H2 21/29, marges 36/80),
  icône papier de 72 px, titre sur la carte à la création, Insérer avec « Lier un tableau ». Non appliqués : voir §1 (ordre des outils, Word, mode carte, Renommer, légende, outil Commentaire).
- Erreur d'interprétation à corriger dans ces relevés : « toujours visible, ne se replie jamais » pour Croquis, Nuancier et Document. Chez Milanote le rang de repli `ALWAYS` (10000) est le
  plus élevé, et « plus le nombre est haut, plus tôt l'outil se replie » : ces trois outils sont donc rangés d'office derrière « More ». Notak (`tiroir: true`) est donc juste. Seul le Tableau reste dans la barre (rang 100).
- Table (`docs/ecarts/table.md`) : presque tout est appliqué (vérifié dans `Table.tsx`, `Outils.tsx`, `menu.ts`, `grille.ts`, `table.css`). Les écarts restants sont en §2.
- Dessin (`releve-dessin-toile.md`) : appliqué = couche, gomme, sélection, historique de 100 pas, regroupement par proximité, barre en bas, Abandonner. Restent : Maj+D, ordre d'empilement, couleur du thème sombre (§4).

---------------------------------------------------------------------------------------------------------------------

# 1. DOCUMENT

## 1.1 Création

- [OK] Outil rangé derrière « More », se glisse sur la toile, un clic seul rebondit — `document/index.ts:38`.
- [OK] Au lâcher : choisi, titre en édition sur la carte, « New Document » tout sélectionné après 100 ms — `Document.tsx:70-80`, `texte.ts` (`documentCree`).
- [DIFFÉRENT] Largeur de naissance — Milanote : 10 UG en mode icône (34 UG en mode carte). Notak : 10 UG (`texte.ts:5`), seul mode.
- [ABSENT] Conversion note vers document : le titre prend la première ligne de la note (60 caractères au plus, coupé à 59 + « … », « New Document » si vide), le mode d'affichage est gardé et le titre passe en édition — Notak : `menu.convertirDocument` existe (`Toile.tsx` entrées de menu) mais ne règle ni la coupe à 60 ni l'édition du titre (à vérifier dans `note/conversion.ts`).

## 1.2 Rendu au repos, mode icône (le seul que Notak a)

- [OK] Papier de 72 px, ombre douce, titre sous la feuille sur 180 px, nombre de mots dessous — `Document.tsx:22-34`, `document.css:1-47`.
- [DIFFÉRENT] Police du titre — Milanote : 15 px, graisse 600, interligne 20 px, interlettrage -0,2 px, couleur du texte d'élément (#323b4a clair), marge basse 3 px, marge haute 6 px, remplissage 3/3/2 px. Notak : 14 px / 600 / 18 px, marge haute 6 px — `document.css:19-27`.
- [DIFFÉRENT] Titre vide — Milanote : affiche « New Document » en texte normal (le titre vide retombe sur ce texte, jamais enregistré vide : un titre vidé n'est pas sauvé). Notak : « Sans titre » en gris, graisse 500 — `Document.tsx:96-98`, `document.css:29-32`.
- [DIFFÉRENT] Longueur du titre — Milanote : 100 caractères au plus, espace insécable avant le dernier mot (pas de mot orphelin). Notak : 300 caractères, sans insécable — `Document.tsx:52,231`.
- [DIFFÉRENT] Couleur du nombre de mots — Milanote : gris tertiaire rgb(141 146 154) soit #8d929a, 12 px, hauteur de ligne 15 px. Notak : #6b7280, 12 px, 16 px — `document.css:44-50`.
- [OK] Nombre de mots avec singulier et pluriel (« 1 word / N words » chez Milanote, « 1 mot / N mots » chez Notak) — `texte.ts:30`, `Document.tsx:101`.
- [DIFFÉRENT] Contour de sélection — Milanote : 2 px qui épouse la silhouette de la feuille pliée (le trait de sélection fait partie du pictogramme), le titre et les mots restent hors du contour. Notak : rectangle de 2 px autour de toute la carte, titre compris — `toile.css:178-180`.
- [DIFFÉRENT] Pictogramme — Milanote : feuille de papier teintée (la couleur choisie teinte la feuille et le pli, le glyphe « document » en bas passe clair ou foncé selon la couleur), ombre portée de niveau 1. Notak : papier dessiné à la main avec trois traits (`Document.tsx:22-34`) ; teinte déjà en place (`toile.css:2502`), à comparer à l'œil pour le glyphe.
- [ABSENT] Dans une colonne — Milanote : icône de 60 px à gauche, titre et mots à droite sur une ligne, fond gris léger (fond secondaire), remplissage 16 px ; en mode « document » de liste, icône de 50 px. Notak : même mise en page centrée partout (`document.css`), aucune règle pour la colonne.
- [ABSENT] Pas de redimensionnement — Milanote : ni poignée en mode icône ni en mode carte (largeur fixe 10 / 34 UG). Notak : `largeurMin: 8`, la poignée commune s'affiche (`Toile.tsx:2243`).

## 1.3 Rendu au repos, mode carte (« Card view »)

- [ABSENT] Mode carte — Milanote : 34 UG de large, fond blanc, ombre de niveau 1, pas d'arrondi ; fenêtre d'aperçu de 390 px de haut (fond secondaire, tout ce qui dépasse est caché) qui rend le vrai texte en lecture seule à l'échelle 0,6 (titres de niveau 1 : 12 px sur interligne 20 px, niveau 2 : 9 px sur 10 px, texte courant 9 px, paragraphes espacés de 5 px, citations marges 3 px, code 6/10 de la taille, listes décalées de 10 px, liens non cliquables et de la couleur du texte, marge intérieure 24 px). Dessous : pictogramme 32×40, titre (marge -4 px, remplissage 0), nombre de mots (12 px, tertiaire, 18 px de haut). Document vide : pictogramme de 48 px centré, texte tertiaire 14 px. Notak : seul le mode icône existe.
- [ABSENT] En mode carte : légende sous la carte (marge -3 px), pastilles d'étiquettes et de réactions, commentaires attachés, barre de couleur du haut — Notak : le document n'a ni légende ni étiquettes propres (`DocumentTexte` n'a pas de `legende`, `coeur/tableau.ts`).

## 1.4 États

- [OK] Choisi seul : contour 2 px couleur ardoise ; plusieurs choisis : idem.
- [DIFFÉRENT] En édition du titre sur la carte — Milanote : fond de la toile derrière le titre, le titre se sélectionne en entier (`selectAllOnEdit`), Entrée ou clic ailleurs valide puis **désélectionne tout**, Échap annule. Notak : contour d'accent 2 px, fond de carte, Entrée ou Échap blur — pas de désélection après validation — `Document.tsx:40-69`.
- [ABSENT] Modale en lecture seule — Milanote : colonne d'outils réduite à 35 px, texte avec marge haute 27 px (au lieu de 36). Notak : `Lecture` ouvre la même modale sans outils (`Document.tsx:188-195`), colonne toujours à 104 px.

## 1.5 Barre de sélection (barre de gauche)

Ordre Milanote : Couleur, Étiquette (carte seulement), Réaction (carte seulement), Commentaire (carte seulement), Affichage « Card view », Renommer « Rename », Légende « Caption » (carte seulement), outils d'arrangement, puis fin (corbeille…).

- [OK] Couleur en tête — `index.ts:14` (`OutilCouleurCarte`).
- [DIFFÉRENT] Bouton « Ouvrir le document en grand » — Milanote n'en a pas (ouverture au double-clic ou à la frappe). Notak : `OutilsDocument` (`Document.tsx:255-260`).
- [ABSENT] « Card view » : bascule entre icône et carte détaillée, icône « vue carte », actif en carte.
- [ABSENT] « Rename » : édite le titre sur la carte, un seul élément choisi.
- [ABSENT] « Caption » (légende) : disponible en carte.
- [ABSENT] Étiquette, Réaction, Commentaire : limités au mode carte chez Milanote ; Notak les propose via les outils communs de la barre, mais sans mode carte ils n'ont pas où s'accrocher visiblement.

## 1.6 Menu du clic droit et « ••• »

Ordre Milanote : presse-papiers (Coller, Couper, Copier, Coller le style, Dupliquer…, Cloner, Corbeille), nom (Renommer), tableau, média, téléchargement, regroupement, conversion (note, document), verrou, plans.

- [ABSENT] « Rename » pour un seul document (liste : lien, tableau, raccourci, colonne, document, fichier) — Notak : seulement « Modifier ↩ » qui ouvre la modale (`Toile.tsx:1200`).
- [DIFFÉRENT] « Modifier » n'existe pas chez Milanote pour un document (la frappe d'un caractère ou Entrée remplit ce rôle, voir §1.7).
- [OK] « Convertir en note » et « Convertir en document » présents — `index.ts:47-53`, `Toile.tsx:1204`.

## 1.7 Gestes

- [DIFFÉRENT] Clic sur un document déjà choisi seul — Milanote : rien (il faut un double-clic). Notak : `commencerEdition` est appelé pour tout type `editable` (`Toile.tsx:2073`), donc un second clic ouvre la modale. Même défaut pour Croquis et Nuancier. À confirmer à l'écran.
- [OK] Double-clic ouvre (sans Cmd) ; avec Cmd+double-clic Milanote n'ouvre pas — `Toile.tsx:2105-2125` à vérifier pour le Cmd.
- [DIFFÉRENT] Entrée sur un document choisi seul — Milanote : édite le titre sur la carte (sans saut de ligne). Notak : ouvre la modale (`editable: true`).
- [ABSENT] Taper un caractère sur un document choisi seul (hors modificateurs, Maj seul ignoré) : ouvre la modale et le caractère tapé arrive dans le texte (tampon de saisie). Flèches : sans effet ; Suppr ou Retour arrière : corbeille.
- [ABSENT] Clic sur le titre d'un document choisi : édition du titre en place (délai 100 ms souris, 0 tactile).

## 1.8 La modale

- [OK] Voile, flou, boîte blanche sans arrondi collée en haut, 696+104+23 px, hauteur `100vh - 42 px`, en-tête 56 px avec filet 10 %, titre centré 450 px au plus, Export à droite à 20 px, pas de croix, fermeture par Échap ou clic sur le fond — `document.css:60-130`, `Document.tsx:132-180`.
- [DIFFÉRENT] Voile — Milanote : noir à 48 % (56 % en sombre) plus flou d'arrière-plan. Notak : noir à 48 % + flou 4 px (OK) ; le croquis a un voile différent (§3).
- [DIFFÉRENT] Titre de l'en-tête — Milanote : 15 px (16 px selon l'échelle), interlettrage -0,2 px, hauteur de ligne 30 px, bloc de 30 px de haut calé en haut du bloc de 56 px (centré par flex). Notak : 16 px, -0,01 em — `document.css:100-110`.
- [DIFFÉRENT] Barre de défilement du texte — Milanote : 8 px de large, curseur gris neutre foncé arrondi (rayon 13 px), piste couleur de fond. Notak : `scrollbar-width: thin` (valeur du système) — `document.css:180`.
- [DIFFÉRENT] Premier titre du texte — Milanote : marge haute -6 px pour le niveau 1 et 2 en première position. Notak : 0 — `document.css:209`.
- [DIFFÉRENT] Marge droite du texte — Milanote : 3 px et colonne de commentaires de 23 px à droite ; Notak : remplissage 20 px — `document.css:176`.
- [ABSENT] Colonne de droite de 23 px réservée aux fils de commentaires du texte (commentaire en ligne) — Notak : l'outil Commentaire n'existe pas dans la colonne (§ plus bas) ; la marque `commentaireTexte` existe pour la note (`coeur/tableau.ts:72`).
- [OK] Le focus passe au texte à la fin de l'édition du titre (Entrée) — `Document.tsx:239-243`.

### Export ▾

- [DIFFÉRENT] Panneau — Milanote : 20 rem de large, flèche vers le haut à 12 px du bord droit, ancré à 26 px sous le bouton et à -11 px du bord droit ; titre « Export… » (semi-gras) puis quatre lignes avec pictogramme de type de fichier : PDF, Word (.docx), Markdown, Plain text ; état « génération » par ligne puis téléchargement ; réinitialisé après 2 s ; message d'erreur dans la ligne. Notak : menu sans flèche ni titre ni pictogrammes, 160 px, trois lignes (PDF par l'impression du navigateur, Markdown, Texte brut) — `Document.tsx:106-135`, `document.css:150-160`.
- [ABSENT] Word (.docx) — fabrication côté serveur chez Milanote. Notak : `export.ts` n'a que `md` et `txt`.
- [DIFFÉRENT] PDF — Milanote : fichier généré par le serveur, qualité haute, mise en page linéaire. Notak : fenêtre d'impression du navigateur (`export.ts:imprimer`).
- [ABSENT] Ouvrir le panneau désélectionne tout (inoffensif).

### Colonne d'outils

Ordre Milanote : Style de texte (libellé dessous), Insérer (libellé), Gras, Italique, Barré, Souligné, Puces, Numérotée, Retrait +, Retrait −, Centrer, Code en ligne, Lien, Commentaire, « ••• ».

- [DIFFÉRENT] Ordre Notak : Gras, Italique, Puces, Numérotée, Retrait +, Retrait −, Centrer, Lien, Barré, Souligné, Code — `ColonneOutils.tsx:60-72`. À réordonner sur celui de Milanote : Gras, Italique, Barré, Souligné, Puces, Numérotée, Retrait +, Retrait −, Centrer, Code, Lien.
- [ABSENT] Outil « Commentaire » (pose un fil de commentaire sur le passage choisi, grisé sans sélection) : dernier outil, avant « ••• ».
- [DIFFÉRENT] État actif — Milanote : cadre de 2 px autour de l'icône. Notak : tuile pleine, glyphe inversé — `document.css:301-306`.
- [DIFFÉRENT] « Style de texte » et « Insérer » — Milanote : tuile contour (bordure 1 px noir 8 %, fond transparent), icône de 32 px, libellé de 10 px à 5 px dessous, marges 9 haut et 8 bas. Notak : tuile 40×32, même bordure 8 %, libellé 10 px — `document.css:260-285` (largeur à vérifier : 32 px chez Milanote).
- [ABSENT] Colonne inerte tant que le texte n'est pas en édition ; un clic dessus relance l'édition du texte — peu visible.
- [DIFFÉRENT] Petite fenêtre : l'échelle des icônes baisse (28/24/22 px) en plus du repli — Notak : repli seul, taille fixe.
- [OK] Repli derrière « ••• » selon la hauteur, grisés à 20 % — `ColonneOutils.tsx:30-35,117-145`.
- [DIFFÉRENT] Un fil de commentaire choisi dans le texte : la colonne ne montre que Couleur et Corbeille — absent (pas de fil).

### Menus des outils

- [OK] Style de texte : 24,2 rem de large, 7 styles (Grand titre ⌘⇧1, Titre ⌘⇧2, Texte normal ⌘⇧0, Petit texte ⌘⇧9, Bloc de code ⌘>, Encadré ⌘⇧6, Citation ⌘"), lignes de 40 px, couleur du texte et surlignage dessous — `note/Barre.tsx` (non relu ici). Raccourcis de code et de citation chez Notak : ⌘. et ⌘' (le relevé d'origine les gardait).
- [DIFFÉRENT] Insérer : 19 rem, quatre lignes (Emoji, Ligne de séparation, Lier un tableau, Mention @), « Séparation » et « Mention » masquées dans les tâches — Notak a maintenant « Lier un tableau » (commit `83bb77e`) ; ordre à vérifier.

## 1.9 Contenu riche

- [OK] Marques gras, italique, barré, souligné, code, lien, listes, titres, citation, bloc de code, encadré, centrage, retrait par Tab — extensions de la note (`EXTENSIONS_NOTE`).
- [OK] `[[` propose les tableaux, `@` les personnes — `Document.tsx:151-160`.
- [DIFFÉRENT] Enregistrement — Milanote : différé de 5 s (1 s avec d'autres personnes sur la page), immédiat au changement du nombre de lignes ou après 80 frappes, vidé à la fermeture ; envoi par différences. Notak : brouillon à chaque frappe, écrit à la sortie — équivalent pour l'utilisateur.
- [ABSENT] Lien : champ d'adresse en panneau — présent (`ChampLien`), mise en forme du panneau à comparer.

## 1.10 Animations et délais

- [OK] Aucune transition à l'ouverture de la modale chez Milanote, ni chez Notak.
- [ABSENT] Le contour de sélection de la carte glisse en 100 ms (haut, droite, bas, gauche, ease-out) quand le décalage change au passage en édition — non vérifié chez Notak.

---------------------------------------------------------------------------------------------------------------------

# 2. TABLE

## 2.1 Création

- [OK] 4×3, 34 UG (11,3 / 11,3 / 11,4), première ligne en gras sur fond d'en-tête, choisie à la naissance sans édition — `grille.ts:19-36`, `table/index.ts:17`.
- [ABSENT] Raccourci de création Ctrl+Cmd+N (Ctrl+Alt+N hors Apple) affiché dans l'infobulle de l'outil — Notak : aucun raccourci de création d'élément.
- [OK] Coller une table (HTML, texte à tabulations) crée une table — `table/index.ts` + récepteur.
- [OK] Hauteur de ligne minimale 30 px, colonne neuve 12 UG, colonne minimale 4 UG, élément minimal 12×6 UG — `grille.ts`.
- [DIFFÉRENT] Maximum — Milanote : aucune limite de lignes ni de colonnes. Notak : 200 lignes et 30 colonnes — `grille.ts:8-9`.

## 2.2 Rendu au repos

- [DIFFÉRENT] **Filets de cellule** — Milanote : 1 px, noir à 10 % d'opacité en clair (environ #e6e6e6 sur blanc), blanc à 10 % en sombre. Notak : 1 px de la couleur des points de la toile, #c4c8ce en clair, #3a3f47 en sombre, nettement plus appuyé — `table.css:66`.
- [DIFFÉRENT] Filets entre cellules colorées — Milanote : le filet d'une cellule de fond coloré est un mélange du fond et de l'ardoise (#323b4a sur clair, #fff sur sombre), la cellule la plus foncée recouvre le filet de sa voisine, les coins sont réparés (haut-droite, bas-droite). Notak : un seul filet de même couleur partout — `table.css:66`.
- [OK] Pas de filet extérieur à gauche ni à droite, ni en haut sans titre, ni en bas sans légende — `table.css:73-92`.
- [OK] Texte 14 px, interligne 20 px, remplissage 4,5 / 6 px, chiffres tabulaires — `table.css:60-72`.
- [OK] En-tête : #d1d3d6 clair, #414141 sombre ; corps #fff / #282828.
- [DIFFÉRENT] Titre — Milanote : côtés 24 px, marge basse -1,5 px, graisse 600, interligne 25 px, centré ; remplissage haut 16 px et bas 19 px pour un nombre impair de lignes, 18,5 px et 21,5 px pour un nombre pair (le calage garde la hauteur sur la grille). Notak : 17 px haut / 18 px bas dans tous les cas — `table.css:98`.
- [DIFFÉRENT] Légende — Milanote : 12 px, interligne 20 px, couleur du texte d'élément (pas pâle), remplissage 20 px haut, 20 px bas, 24 px de côté, marge haute -1,75 px dans une table. Notak : 13 px, couleur pâle, remplissage 8/12/9 px — `table.css:120-140`.
- [DIFFÉRENT] Ombre des repères — Milanote : ombre « sm » (0 1px 2px -1px à 8 % et 0 1px 4px à 10 %, teinte 27 37 54) sur le ruban, rayon 8 px sur la rangée de repères et 4 px aux bouts. Notak : `0 1px 2px` noir à 10 %, rayon 4 px aux bouts — `table.css:250`.
- [OK] Repères : 24 px, 10 px d'écart, fond #fdfdfd, texte 11 px #8d929a, touché #d1d3d6 / #48505e, filet 8 % — `table.css:240-295`.
- [OK] Barre de défilement horizontale de 6 px dans une colonne — `table.css:42-55`.
- [OK] Puce d'erreur ronde 16 px, bulle à 200 ms — `Table.tsx:883-890`, `table.css:178-200`.
- [DIFFÉRENT] Bulle d'erreur — Milanote : au plus 27 rem, remplissage 10/12/9/12 px, texte 12 px centré. Notak : 270 px, remplissage 4/8 px, fond sombre #23262c, 12 px — `table.css:185-200`.

## 2.3 États

- [DIFFÉRENT] **Couleur de sélection des cellules** — Milanote : la même ardoise que la sélection d'élément (#323b4a ; #f2f2f2 en sombre), contour de 2 px, sans voile. Notak : bleu d'accent (#2f6feb clair, #5b8ff9 sombre) — `Table.tsx:977`, `table.css` (variable d'accent). Le document `table.md` l'avait noté « choix Notak » ; Samy veut l'identique.
- [DIFFÉRENT] Contour de l'éditeur de cellule — Milanote : ardoise 2 px en dedans. Notak : accent — `Table.tsx:980`.
- [DIFFÉRENT] Poignée de recopie — Milanote : petit carré de la couleur de sélection (ardoise) avec un liseré de 1 px de la couleur du fond. Notak : même forme (7 px, liseré 1 px) mais pleine de l'accent bleu — `table.css:210-225`.
- [DIFFÉRENT] Références colorées d'une formule — Milanote : six couleurs, cadre de 2 px, fond à 10 % (#16a0e5, #ff8d22, #4eb85a, #af72ff, #ff6dd4, #62dbc8). Notak : mêmes six — `formats.ts` (`COULEURS_REFERENCES`) — OK.
- [OK] Table choisie sans cellule : bordure 2 px ; cellules choisies : la bordure de l'élément s'efface — `table.css:6-9`.
- [OK] Hors lecture seule seulement : repères, poignées, menu de table.
- [ABSENT] Cmd+clic sur une table sans cellule choisie : désélectionne l'élément (au lieu de choisir une cellule) — Notak : non vérifié.
- [DIFFÉRENT] Prise de la table choisie — Milanote : table recouverte d'un voile transparent tant qu'elle n'est pas choisie (le glisser prend l'élément) ; une fois choisie, la prise se fait par le bord. Notak : bande de 10 px au-dessus de la table — `table.css:30-40` (choix Notak).

## 2.4 Barre d'outils, menu, clavier

- [OK] Barre des cellules : style de texte, type, couleur, formule, alignement, + colonne (⌥→), + ligne (⌥↓), ••• — `Outils.tsx:75-108`.
- [OK] Barre de la table seule : Étiquette, Réaction, Commentaire, Titre, Légende, arrangement — `Outils.tsx:44-55` + communs.
- [DIFFÉRENT] Fenêtre d'alignement — Milanote : 150 px de large, remplissage 20 px, deux rangées de trois icônes de 30 px (10 px d'écart), filet entre horizontal et vertical, actif = fond « actif » du texte riche ; elle reste ouverte. Notak : boutons collés (2 px) et actif en aplat sombre — `table.css:660-675`.
- [OK] Fenêtre du type : 24 rem, lignes de 40 px, coche ou chevron ; options dans un second panneau de 29 rem — `table.css:545-600`.
- [OK] Menu du clic droit : cinq groupes, raccourcis sur les insertions seulement — `menu.ts`.
- [OK] « Vider » au singulier si une seule cellule, au pluriel sinon — `menu.ts:75`.
- [OK] Clavier de grille complet (flèches, ⌘flèche, Début/Fin, Ctrl+Espace, Maj+Espace, ⌥flèche, ⌘Entrée, ⌘Retour arrière, Tab, Entrée, F2, ⌘B/I/Maj+X, ⌘A) — `Table.tsx:719-795`.
- [ABSENT] Maj+Retour arrière vide aussi les cellules — Notak : Retour arrière et Suppr seulement.
- [OK] Échap : désélectionne les cellules, l'élément reste choisi.

## 2.5 Cellules : édition, types, formules

- [ABSENT] **Texte riche partiel dans une cellule** — Milanote : chaque cellule est un éditeur de texte riche : gras, italique, barré, lien, couleur de texte et surlignage s'appliquent à une sélection de mots (outils « Text style », gras, italique, barré, lien proposés pendant l'édition d'une sélection), liens détectés à la frappe, mention `@` dans une cellule, liens vers un tableau. Notak : mise en forme par cellule entière seulement (`FormatCellule`), un lien n'est reconnu que si toute la cellule est une adresse — `Table.tsx:930-942`.
- [OK] Types : Auto, Nombre, Monnaie, Pourcentage, Texte, Date et heure, Case à cocher, avec alignements (gauche, droite, droite, droite, gauche, droite, centre).
- [DIFFÉRENT] Devise par défaut — Milanote : USD (symbole étroit). Notak : EUR — `Outils.tsx` (choix voulu).
- [OK] Options de date et heure avec exemple du 29 février 2016 à 13:24:56, jamais ni date ni heure.
- [OK] Autocomplétion de formule : SUM, IF, MIN, MAX, COUNT, AVERAGE à vide ; tri par longueur puis alphabet — `formules.ts:1726`.
- [DIFFÉRENT] **Liste des fonctions** — Milanote : tout HyperFormula moins une liste noire (tableaux, MMULT, TRANSPOSE, ARRAYFORMULA, INTERVAL, HF.*) soit environ 380 noms. Notak : 146 noms (`FONCTIONS`). Absents notamment : financières (PMT, PV, FV, NPV, IRR, RATE, NPER…), conversions de base (BIN2DEC, DEC2HEX…), opérations de bits, trigonométrie hyperbolique, COMBIN, CORREL, GEOMEAN, SUBTOTAL, COUNTUNIQUE, HYPERLINK, OFFSET, ADDRESS, ROMAN, STDEVA, VARA… (liste établie de mémoire, non confrontée à la bibliothèque).
- [DIFFÉRENT] Liste de suggestions — Milanote : largeur au plus 24 rem, hauteur 190 px avant défilement, chaque ligne 12 px avec remplissage 6/10 px et interligne 20 px (32 px de haut), fond du panneau, ombre « 2xl », flèche vers l'éditeur, **pied « lien vers l'aide »** (filet à 10 %, texte tertiaire, chevron) qui ouvre la page d'aide des formules. Notak : lignes de 26 px, rayon 5 px, pas de flèche, pas de pied — `table.css:415-440`.
- [DIFFÉRENT] Erreur #NUM! (HyperFormula) : les erreurs de domaine donnent #VALUE! chez Notak (`table.md`, non repris).
- [OK] Bouton fx : ouvre l'édition avec « = » (une seule cellule), grisé sinon — `Outils.tsx:55-60,87`.
- [OK] Couleur de cellule : 24×20 px, grille de cinq, couleur personnalisée — `table.css:440-480`.

## 2.6 Presse-papiers, recopie, poignée

- [OK] Copier/couper/coller avec HTML et texte à tabulations, coller les valeurs, références décalées — `pressePapiers.ts`.
- [OK] Poignée de l'élément ajoute/retire des colonnes entières (12 UG) et des lignes (3 UG), jamais sous 2 lignes, jamais une ligne ou colonne utilisée — `index.ts:30-42`.
- [OK] Déplacer des lignes ou colonnes par les repères (ombre translucide, trait de 2 px, curseur saisi) — `Table.tsx:520-546`.

## 2.7 Autres

- [OK] Recherche : une cellule est trouvée sur son texte affiché (`table.md`).
- [ABSENT] Mobile et tablette : édition de la table, feuilles de type, d'alignement, de couleur et de formule — hors périmètre de ce relevé.

---------------------------------------------------------------------------------------------------------------------

# 3. CROQUIS (Sketch)

## 3.1 Création

- [OK] Outil derrière « More », se glisse, posé vide, ni choisi ni édité à la naissance — `croquis/index.ts:23`.
- [OK] 34 UG de large, hauteur de la feuille 393 (rapport 1,63 : 3400×2090 unités de dessin) — `trace.ts:6-12`. Milanote : hauteur de carte 20,9 UG.
- [DIFFÉRENT] Redimensionnement — Milanote : tant que le croquis est vide, la poignée règle largeur et hauteur (la hauteur du canevas suit) ; avec un dessin, le rapport est figé mais peut être libéré au clavier (mode « facultatif »). Notak : la hauteur suit toujours la largeur, `hauteur` de la feuille fixée à la naissance (`trace.ts:12-20`) — à vérifier à l'écran.
- [OK] Double-clic sur la poignée : retour à 34 UG — `Toile.tsx:2116-2123` (`largeurDoubleClic`), valeur par défaut à confirmer.

## 3.2 Rendu au repos

- [DIFFÉRENT] État vide — Milanote : icône « dessin » de 48 px (marge haute -10 px, marge basse 8 px) en gris tertiaire, puis texte 12 px tertiaire centré sur toute la largeur (souris : double-clic pour dessiner ; tactile : autre phrase) ; masqués si la carte fait la largeur minimale. Hauteur vide : 21 rem moins 2 px. Notak : texte seul de 13 px #6b7280, sans icône — `croquis.css:13-23`.
- [DIFFÉRENT] Fond — Milanote : couleur de l'élément, 13 choix = blanc (défaut), anthracite #5f6672, gris #bbbec3, cyan, vert, brun, jaune, orange, rouge, rose, violet, bleu, bleu profond ; ou transparent (alors contour fin de 1 px au survol). Notak : palette de la note (`OutilCouleurCarte`), blanc par défaut codé en dur (`croquis.css:9`) ; pas d'anthracite ; transparent non vérifié.
- [DIFFÉRENT] Trait par défaut — Milanote : sans couleur choisie le trait suit la couleur de ligne du thème (#323b4a clair, s'inverse en sombre) ; le trait enregistré porte #323b4a. Notak : la couleur est écrite en dur dans chaque trait (`#323b4a`), elle ne s'inverse pas en thème sombre.
- [ABSENT] Découpe à la grille — Milanote : hors redimensionnement, le dessin est rogné à la grille (hauteur arrondie). Notak : non vérifié.
- [OK] Bord de sélection 2 px, ombre légère, aucun arrondi.
- [ABSENT] Légende sous le dessin (fond blanc de l'élément, le dessin devient la partie haute) — Notak : `Croquis` n'a pas de `legende`.
- [ABSENT] La carte disparaît du tableau pendant l'édition (le croquis édité est remplacé par l'éditeur) — Notak : la carte reste affichée derrière le voile, `Croquis.tsx:78-84`.

## 3.3 Barre de sélection

Ordre Milanote : Couleur, Étiquette, Réaction, Commentaire, Légende, arrangement.

- [DIFFÉRENT] Bouton « Dessiner » supplémentaire — Milanote n'en a pas : l'édition s'ouvre par double-clic, Espace ou navigation. Notak : `OutilsCroquis` (`Croquis.tsx:400-405`).
- [ABSENT] Outil Légende.
- [OK] Couleur en tête.

## 3.4 Menu du clic droit

- [ABSENT] « Download SVG » (télécharger le dessin) quand un seul croquis (ou dessin) rempli est choisi — Notak : aucune entrée (`Toile.tsx:1186-1214`).
- [DIFFÉRENT] « Modifier ↩ » : entrée Notak sans équivalent chez Milanote.
- [ABSENT] « Convert to sketch card » depuis un dessin (annotation) isolé : le dessin devient un croquis (fond blanc, 34 UG) — Notak : non.

## 3.5 L'éditeur (modale)

- [DIFFÉRENT] **Voile** — Milanote : voile commun des modales d'élément, noir à 48 % avec flou d'arrière-plan, sans transition ; un appui court (moins de 0,5 s) sur le voile enregistre et ferme. Notak : `rgb(15 20 28 / 0.55)` sans flou — `croquis.css:32` (la fermeture sur le voile garde bien le dessin).
- [DIFFÉRENT] Feuille — Milanote : centrée dans l'espace laissé par la barre (marge basse de 83 px), ombre « xl » à trois couches, sans arrondi ; marge de 10 % de la plus petite dimension de la fenêtre de chaque côté. Notak : 10 % (OK), ombre `0 25px 50px -12px` à 35 % — `croquis.css:44-48`.
- [DIFFÉRENT] Barre (version ancienne) — Milanote : fixe, 83 px sous la feuille, centrée, largeur ajustée au contenu avec 511 px au moins, remplissage 12 px (11 puis 10 px sur petite fenêtre), **coins de 8 px**, fond du panneau modal, ombre « md » (« xl » dans la modale), transition d'apparition de 150 ms (opacité linéaire, glissement de 15 px). Notak : pilule (coins 999 px), remplissage 6/10 px, 560 px au moins, à 20 px sous la feuille — `croquis.css:61-76`. À trancher selon la version que Samy voit : la version « Roma » est une pilule.
- [DIFFÉRENT] Contenu et groupes — Milanote : trois outils de mode à gauche avec filet vertical dessous (marge 16 px), puis couleur et épaisseur (marge 8 px), puis annuler/rétablir (32×28 px, coins 4 px, 30 % d'opacité si vides), puis Annuler (devient « Discard » seulement dans la version Roma, « Cancel » en édition d'un dessin existant dans l'ancienne), puis Enregistrer. Notak : trois outils, séparateur, couleur, **pipette (bouton propre)**, épaisseur, séparateur, annuler, rétablir, Abandonner, Enregistrer — la pipette n'a pas de bouton chez Milanote (touche I seulement) — `Croquis.tsx:350-396`.
- [DIFFÉRENT] **Fenêtre de couleur** — Milanote : fenêtre de 20 rem, remplissage 24 px, posée au-dessus du bouton, grille de **cinq colonnes** de pastilles de 24×20 px (rayon 2 px, écart 8 px, contour de sélection de 5 px de rayon), puis (si le tableau en propose) un filet et jusqu'à dix couleurs suggérées du tableau, puis un bouton « Couleur personnalisée… » (32 px de haut, bordure 1 px, rayon 4 px, roue de 24 px). La couleur « aucune » est la première pastille. Notak : grille de 7 colonnes de pastilles rondes de 28 px, bouton libre de 28 px sans texte, aucune couleur suggérée — `croquis.css:140-195`, `partage.tsx`.
- [DIFFÉRENT] Fenêtre d'épaisseur — Milanote : remplissage 20 px, 4 colonnes, 8 px d'écart, icônes de graisse, actif entouré de 2 px (ardoise) à 4 px. Notak : rangée de quatre boutons dans un panneau — `partage.tsx:34-42`. Se ferme au choix en mode crayon (reste ouverte en sélection) ; Notak ne la ferme jamais.
- [DIFFÉRENT] En sélection, l'épaisseur est grisée même avec des traits choisis (les chemins enregistrés ne sont pas recalculés) ; la couleur n'est active qu'avec une sélection ; en gomme les deux sont grisées. Notak : ne grise rien, change l'épaisseur des traits choisis (`choisirEpaisseur`) et laisse la couleur active sans sélection — `Croquis.tsx`. Le dessin libre a la bonne règle (`Dessin.tsx:400`).
- [ABSENT] Choisir un trait fait monter sa couleur et sa taille dans la barre (la barre reflète le premier trait choisi).
- [DIFFÉRENT] Curseur crayon — Milanote : petit crayon de 19 px dessiné à la couleur du trait (contour noir ou blanc selon le contraste de la couleur, point chaud 1,17) ; Safari reçoit une image fixe claire ou foncée. Notak : crayon blanc de 24 px fixe, point chaud 3,21 — `croquis.css:51` ; `curseurCrayon(couleur)` existe dans `partage.tsx:48` mais n'est pas utilisé par le croquis (le dessin libre l'emploie).
- [ABSENT] Curseur gomme dédié (image 1x/2x, point chaud 8,21) — Notak : flèche par défaut.
- [DIFFÉRENT] **Rayon de la gomme** — Milanote : zone de prise de 14 px de large (rayon 7 px), sur le tracé rendu. Notak : 3 px de rayon (`Croquis.tsx:31`) ; le dessin libre utilise bien 7 (`Dessin.tsx:42`).
- [DIFFÉRENT] Cernage rouge au survol de la gomme — Milanote : 1 px de chaque côté (largeur du trait plus 2 px), rouge pur, sur un trait « stroke-only » ; 3 px divisés par l'échelle pour un contour rempli. Notak : 4 px écran en tout (`CONTOUR_GOMME_PX = 4`) — `Croquis.tsx:33`.
- [OK] Cernage de sélection de trait en 3 px, couleur d'accent royal (#2f63f7 chez Milanote, #2f6feb chez Notak ; presque identique).
- [ABSENT] Sélection : Cmd+Maj+↑ / ↓ amène devant / derrière — `selection.ts` n'a pas d'ordre d'empilement.
- [OK] Marquise : bordure 1 px gris foncé, fond de sélection ; Maj/Cmd pour ajouter — `croquis.css:197-205`.
- [OK] Raccourcis : D M B crayon, V S sélection, E gomme, C couleur (en mode crayon seulement chez Milanote : Notak l'ouvre dans tous les modes), X précédente, 1-4 tailles (et retour au crayon), I pipette, Cmd+S, Cmd+Z, Cmd+Maj+Z, Échap — `Croquis.tsx:293-322`.
- [DIFFÉRENT] « C » ouvre la couleur seulement en mode crayon (Milanote) — Notak : partout.
- [OK] Échap en sélection avec traits choisis : désélectionne ; sans : abandonne — `Croquis.tsx:305-308`.
- [ABSENT] Les raccourcis de zoom (Cmd +, -, 0) sont bloqués pour le navigateur mais laissés aux gestionnaires globaux ; Cmd+C/X/V/flèches sont avalés — Notak : non traité.
- [DIFFÉRENT] Un simple clic sans déplacement — Milanote : trait de largeur nulle, écarté à l'enregistrement. Notak : un point est dessiné (`cheminLisse`, cas d'un seul point : `trace.ts:63`).
- [ABSENT] Annulation d'un trait quand trois pointeurs ou plus touchent — le dessin libre le fait (`Dessin.tsx:292-294`), pas le croquis.
- [ABSENT] Barre qui descend de 15 px et s'efface quand le pointeur passe à moins de 120 px du bas de la fenêtre pendant un tracé — le dessin libre le fait, pas le croquis.

## 3.6 Animations

- [ABSENT] Barre : apparition 150 ms (opacité linéaire) et glissement de 15 px vers le haut (ease-out), sortie 150 ms ease-in — Notak : aucune.
- [ABSENT] Son d'ouverture de la barre (« popup ») — hors périmètre.

---------------------------------------------------------------------------------------------------------------------

# 4. DESSIN (outil « Draw », annotation sur la toile)

- [OK] Couche plein tableau, voile à 50 %, barre de gauche éteinte, bouton ouvert, regroupement par proximité (2 cellules de marge), un élément par groupe, réouverture au double-clic, historique de 100 pas, Cmd+S, Échap abandonne — `Dessin.tsx`, `dessin.css`.
- [ABSENT] Raccourci d'entrée Maj+D — Milanote : démarre le mode (ne fait rien si une modale est ouverte ; ferme les popups). Notak : Maj+D est pris par « Dessiner sur l'image » (`raccourciAnnotation.ts`) et Cmd+Maj+D bascule le thème.
- [ABSENT] Cmd+Maj+↑ / ↓ en sélection : amener devant / derrière (`selection.ts`).
- [ABSENT] La barre reflète le trait choisi (couleur et taille).
- [DIFFÉRENT] Couleur par défaut du trait — #323b4a écrit en dur ; Milanote suit la couleur de ligne du thème (blanc en sombre), et « blanc sur fond foncé » pour une annotation transparente.
- [DIFFÉRENT] Fenêtre de couleur et d'épaisseur : mêmes écarts que le croquis (§3.5).
- [DIFFÉRENT] Gomme — Milanote : 14 px de prise, cernage de 1 px. Notak : 7 px de rayon (OK), cernage 3 px par côté (`Dessin.tsx:45`).
- [ABSENT] Traits des autres personnes en direct (envoi du trait courant toutes les 120 ms, curseur stylo/gomme/pointeur).
- [ABSENT] Annotation d'image : traitée dans la famille image.
- [OK] Barre fixe à 4 rem du bas, centrée, 150 ms, s'efface près du bord — `dessin.css:51-70`.
- [DIFFÉRENT] Largeur de barre : 511 px mini chez Milanote, 560 px chez Notak.
- [OK] Le bouton « Modifier le dessin » de la barre de sélection (icône « draw ») — `OutilsDessin`.

---------------------------------------------------------------------------------------------------------------------

# 5. NUANCIER (Color swatch)

## 5.1 Création

- [OK] Outil derrière « More », se glisse, posé sans sélection ni édition — `nuancier/index.ts:19,34`.
- [DIFFÉRENT] **Couleur de naissance** — Milanote : une couleur suggérée du tableau (images, tableaux fils, nuanciers déjà posés, sinon une palette par défaut choisie par un indice propre au tableau), la suivante à chaque pose (indice incrémenté au dépôt), format du code = dernier format choisi par l'utilisateur (HEX par défaut). Notak : toujours #4f8cff (`couleur.ts:5`).
- [ABSENT] **Légende automatique à la création** — Milanote : la légende est visible dès la naissance et porte le **nom de la couleur** en anglais (liste de noms de couleurs, quelques noms raccourcis à la main : « Double Colonial », « Macaroni & Cheese », « School Bus Yellow »…). Notak : pas de légende (le type n'a pas de `legende`, `coeur/tableau.ts:343`).
- [OK] Taille de naissance 17×12 UG (hauteur de 120 px enregistrée) — `couleur.ts:3-5`, `nuancier/index.ts:20`.
- [DIFFÉRENT] Collage d'un code couleur sur la toile — Milanote : un texte valide en HEX (#abc, #aabbcc), `rgb(…)` ou `hsl(…)` crée un nuancier avec ce format ; la saisie de ces textes dans une nouvelle carte (touche) aussi. Notak : seulement un texte qui commence par « # » et fait 7 caractères au plus (`index.ts:46-52`) ; `rgb()` et `hsl()` ne sont pas reconnus.

## 5.2 Rendu au repos

- [DIFFÉRENT] **Place du code** — Milanote : en haut à gauche de l'aplat, marge 20 px (haut) et 24 px (gauche), 14 px, graisse 600, hexadécimal en majuscules. Notak : en bas à gauche, remplissage 8/10 px, 13 px, interlettrage +0,02 em — `nuancier.css:1-20`.
- [DIFFÉRENT] **Format du code** — Milanote : HEX « #4F8CFF », RGB « 79,140,255 » (sans « rgb() », sans espaces), HSL « 219,100%,65% » (sans « hsl() », sans espaces après les virgules). Notak : « rgb(79, 140, 255) » et « hsl(219, 100%, 65%) » — `couleur.ts:57-62`.
- [ABSENT] Le code se masque sur un nuancier étroit : moins de 15 UG de large (la classe « petite largeur » vaut 15 UG ou moins). Notak : toujours affiché.
- [DIFFÉRENT] Légende en dessous — absent (§5.1) ; avec légende, la carte devient un cadre blanc (fond d'élément) dont l'aplat est la partie haute.
- [OK] Couleur du texte : blanc ou ardoise selon le contraste (seuil #3d4554) — `note/couleurs.ts`.
- [DIFFÉRENT] Couleur absente : Milanote rend blanc (#FFFFFF). Notak : toujours une couleur.
- [OK] Aucun arrondi, ombre de niveau 1 — `nuancier.css:9-10`.

## 5.3 États et gestes

- [DIFFÉRENT] **Redimensionnement** — Milanote : libre en largeur et en hauteur (aucun rapport imposé), minimum 4×4 UG, double-clic sur la poignée = 17×12 UG. Notak : rapport 17:12 imposé (`proportion`), minimum de largeur 4 — `index.ts:23-24`.
- [DIFFÉRENT] **Double-clic** — Milanote : ouvre le sélecteur de couleur du système (fenêtre native du navigateur ancrée près de l'élément, avec les couleurs suggérées du tableau et la pipette). Notak : ouvre un panneau sous la carte avec un sélecteur natif, un champ de code et un bouton Pipette — `Nuancier.tsx:33-75`.
- [ABSENT] Édition du code en place — Milanote : un clic sur le code d'un nuancier choisi l'édite sur la carte (texte tout sélectionné, accepte HEX avec ou sans dièse, 3 ou 6 chiffres, `rgb(...)`, `hsl(...)`, ou « R,G,B ») ; validation et fin = désélection. Notak : champ dans le panneau sous la carte.
- [DIFFÉRENT] Clic sur un nuancier déjà choisi — Milanote : rien de spécial hors du code ; Notak : ouvre l'édition (`Toile.tsx:2073`).
- [OK] Valeur choisie par la pipette de l'écran — présente (bouton Pipette, `Nuancier.tsx:60-66`).

## 5.4 Barre de sélection

Ordre Milanote : Couleur (sélecteur libre), Étiquette, Réaction, Commentaire, Affichage, Légende, arrangement.

- [OK] Couleur en tête (tuile qui ouvre le sélecteur natif) — `Nuancier.tsx:80-110`.
- [DIFFÉRENT] **Affichage** — Milanote : bouton dont l'icône dit le format courant (« HEX », « RGB », « HSL » ou « Off » en texte de 11 px) ; la fenêtre montre **une rangée horizontale** de quatre boutons carrés (HEX, RGB, HSL, Off), le choisi entouré de 2 px, « Off » en texte normal ; le choix est mémorisé comme préférence de l'utilisateur et sert aux nuanciers suivants. Notak : menu vertical HEX / RGB / HSL / « Aucun », coche — `Nuancier.tsx:113-135`.
- [ABSENT] Mémoire du format préféré pour les prochains nuanciers.
- [ABSENT] Légende.
- [DIFFÉRENT] Pipette dans « ••• » (Notak) — Milanote : dans le sélecteur de couleur (touche I dans le croquis).

## 5.5 Menu du clic droit et divers

- [ABSENT] Suggestions de couleur du tableau dans le sélecteur — Milanote propose entre 3 et 10 couleurs (images posées, tableaux fils, nuanciers, palette par défaut), triées par ressemblance. Notak a une notion de couleurs suggérées pour la note (`note/couleurs.ts`, `SUGGEREES_MAX = 8`) à brancher ici.
- [ABSENT] Les couleurs des nuanciers posés sont proposées dans les autres fenêtres de couleur du tableau (couleurs suggérées) — non vérifié chez Notak.
- [ABSENT] La recherche traite croquis et nuanciers à part (même cas dans le module de recherche) — non vérifié chez Notak.

---------------------------------------------------------------------------------------------------------------------

# Top 15 des écarts les plus visibles

1. Table : filets de cellule trop appuyés (#c4c8ce opaque contre noir à 10 %), et non mélangés au fond sur les cellules colorées (§2.2).
2. Table : contour des cellules en bleu d'accent au lieu de l'ardoise #323b4a, y compris poignée et éditeur (§2.3).
3. Table : texte riche partiel dans une cellule (gras d'un mot, lien, couleur de passage, mention) absent (§2.5).
4. Croquis : fenêtre de couleur différente (7 colonnes rondes de 28 px contre 5 colonnes de 24×20, bouton « Couleur personnalisée… », couleurs suggérées), fenêtre d'épaisseur qui ne se ferme pas (§3.5).
5. Croquis : barre en pilule de 560 px à 20 px sous la feuille contre 511 px, coins de 8 px, 83 px sous la feuille ; voile `rgb(15 20 28 / 0.55)` sans flou contre noir à 48 % avec flou (§3.5).
6. Nuancier : le code est en bas à gauche, 13 px, avec « rgb(…) » ; Milanote le met en haut à gauche, 14 px 600, sans enveloppe (« 79,140,255 ») (§5.2).
7. Nuancier : naissance en bleu fixe sans légende ; Milanote prend une couleur suggérée du tableau et écrit son nom en légende (§5.1).
8. Nuancier : rapport 17:12 imposé au redimensionnement, double-clic qui ouvre un panneau maison, pas d'édition du code en place, code non masqué sous 15 UG (§5.3, §5.2).
9. Document : un seul mode (icône) ; mode « Card view » (34 UG, aperçu de 390 px à l'échelle 0,6), outil Renommer, Légende, Étiquettes et Commentaires de carte absents (§1.3, §1.5).
10. Document : le titre de la carte (14 px/600) et le nombre de mots (#6b7280) diffèrent (15 px/600, #8d929a) ; le titre vide affiche « New Document » ; le contour de sélection suit la feuille, pas la carte entière (§1.2).
11. Document, Croquis, Nuancier : un clic sur l'élément déjà choisi l'ouvre ; chez Milanote seul le double-clic ouvre ; Entrée édite le titre du document ; une frappe ouvre la modale (§1.7, §5.3).
12. Croquis : gomme à 3 px de rayon (Milanote 7 px), cernage de 4 px au lieu de 1 px, curseurs crayon coloré (19 px) et gomme absents (§3.5).
13. Croquis et Document : boutons de barre en trop (« Dessiner », « Ouvrir ») et manquants (Légende, Renommer, Card view) ; menu : « Download SVG » et « Rename » absents (§3.3, §3.4, §1.5, §1.6).
14. Document (modale) : ordre des outils (Barré, Souligné avant Puces ; Code avant Lien), outil Commentaire absent, état actif en tuile pleine au lieu d'un cadre de 2 px, export sans Word et sans flèche ni pictogrammes (§1.8).
15. Table : liste de formules (146 contre environ 380), liste d'autocomplétion à lignes de 26 px sans lien d'aide, légende de table en 13 px pâle contre 12 px normal, bulle d'erreur à remplissage 4/8 px (§2.2, §2.5).
