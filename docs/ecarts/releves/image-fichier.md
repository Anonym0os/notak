# Écarts Notak / Milanote, famille « image et fichier joint »

Relevé du 23/10/2026. Sources Milanote : `client/element/image/` (176 fichiers : rendu, modale V1 et V2, recadrage,
dessin, fond), `client/element/file/` (carte, icône, aperçu, lecteur, modale, envoi), `client/element/attachments/`,
`common/files/`, `common/images/`, `client/components/{images,caption,fileIcon,paperIcon,displayMode}/`,
`workspace/toolbar/…` (outils de sélection) et `workspace/contextMenu/…`. Notak : `packages/tableau/src/elements/image/`,
`elements/fichier/`, `elements/envois.ts`, `Toile.tsx`, `Barres.tsx`, `toile.css`, `langue.ts` (chemins relatifs à `packages/tableau/src/`).

Lecture : `rem` = 10 px. UG = unité de grille, 10 px au zoom 100 %. Les libellés anglais qui ne sont pas dans la source
(fichiers de langue absents) sont marqués « (clé) » : le texte est déduit du nom de la clé, à vérifier sur une capture.
Deux modales d'image coexistent chez Milanote : la V1 (par défaut) et la V2 (derrière le drapeau `imageModalV2`, avec le
fond `imageBackgroundRemoval`). Les deux sont décrites, car on ne sait pas laquelle Samy voit.

État de `docs/ecarts/RESTE.md` et de `releve-document-image.md` : ils sont en retard sur le code. Déjà fait chez Notak et
relevé ici comme OK : panneau d'images à 568 × 540 (`image/Banque.tsx`), transparence lue dans les pixels
(`image/lecture.ts`), miniature pendant l'envoi (copie locale + roue, `elements/envois.ts`), tailles 400/800/1600
(`image/tailles.ts`), remplacement par dépôt (`image/geometrie.ts:remplacerContenu`), recadrage, pivot, détourage,
annotation. Ce qui suit ne reprend que ce qui diffère encore.

---------------------------------------------------------------------------------------------------------------------

# A. IMAGE (élément sur la toile)

## A1. Création

- [DIFFÉRENT] Outil « Image » dans la barre — Milanote : un clic ouvre le panneau d'images ; glisser l'outil ne crée rien (l'outil rebondit et une bulle invite à cliquer) — Notak : le clic ouvre le panneau, mais glisser l'outil sur la toile ouvre aussi le sélecteur de fichiers à l'endroit lâché (`fichier/index.ts:35-44`). Choix assumé dans un relevé précédent ; à trancher avec Samy, car la consigne est « identique ».
- [OK] Dépôt, collage et sélecteur de fichiers : image si le type est png, jpeg, webp, gif ou svg (motif `webp|png|gif|jpe?g|svg+xml`), sinon fichier joint — Notak : mêmes types (`image/geometrie.ts:5`, récepteur de priorité 40, `image/recepteur.ts`).
- [OK] Largeur de départ = largeur de l'image en pixels ÷ 10, au plus 34 UG — Notak : `image/geometrie.ts:22`.
- [DIFFÉRENT] Plancher à la création — Milanote : aucun (le minimum de 4 UG ne joue qu'au redimensionnement) — Notak : `largeurInitiale` remonte à 4 UG (`geometrie.ts:22-23`). Visible seulement pour une image de moins de 40 px.
- [ABSENT] Image venue d'une page web en data URI (ou dont la taille finit par changer) — Milanote : largeur fixée à 34 UG, légende affichée d'office, le crédit de la source en légende — Notak : ignorée (déjà noté dans `creation.md`).
- [OK] Aucune sélection ni édition à la création, l'image naît non éditée — Notak : seule une note collée entre en édition (`Toile.tsx:773`).
- [OK] Placement d'une ou plusieurs images (colonnes de 36 UG, la moins haute d'abord) — voir `creation.md` ; image seule 1 UG plus haut et à gauche (écart connu, `geometrie.ts:49`).
- [ABSENT] Image « vide » (emplacement sans image) — Milanote : un cadre gris (`#f3f3f4`) de la largeur de l'élément, au rapport 34 : 20, avec une icône de dépôt (54 × 44 px) ; un clic ouvre le sélecteur (accepte tout), un fichier lâché dessus le remplit, cadre de 2 px `#323b4a` au survol d'un dépôt ; en erreur : icône d'alerte, message, explication, lien « Try another image » — Notak : n'existe pas (l'élément n'est créé qu'avec son fichier).
- [ABSENT] Raccourci d'ouverture du panneau d'images (la bulle de l'outil affiche ⌃⌘I sur Mac, Ctrl+Alt+I ailleurs) — Notak : aucun raccourci ni indication dans l'infobulle.

## A2. Rendu au repos

- [DIFFÉRENT] Largeur du cadre — Milanote : GU × 10 − 2 px (la bordure de sélection est un pseudo-élément à l'extérieur, `getElementStyle`) — Notak : GU × 10 exactement (`Cadre.tsx:46`). 2 px de plus.
- [DIFFÉRENT] Hauteur sur la grille — Milanote : l'image est rognée (couvre le cadre) : hauteur = arrondi de (largeur ÷ proportions ÷ 10) × 10 − 2 px sur la toile, × 10 sans retrait dans une colonne ; la partie qui dépasse est coupée — Notak : hauteur arrondie à l'UG entière, sans le − 2, et l'image est ÉTIRÉE pour remplir (échelle indépendante en X et en Y, `image/image.css:34-38` `object-fit: fill`, `geometrie.ts:miseEnPage`). Déformation jusqu'à ± 5 px sur la hauteur.
- [DIFFÉRENT] Dans une colonne — Milanote : même rognage sur la grille, retrait de 0 px, largeur = largeur de la colonne moins sa marge — Notak : proportions exactes sans arrondi (`Image.tsx:39-41`).
- [ABSENT] Option « Crop image to fit dot grid » (clé `element.cropImageToFitDotGrid`, case cochée par défaut) — Milanote : décochée, l'image garde ses proportions exactes (propriété `showFullAspectRatio`) ; aussi levée pendant un redimensionnement et pour une image transparente — Notak : l'arrondi à la grille est permanent.
- [DIFFÉRENT] Carte blanche — Milanote : la carte est blanche (`--ws-element-background-primary`), l'image en occupe le haut, la légende et les pastilles se rangent DANS la carte, sous l'image ; le tout porte l'ombre — Notak : l'élément est « sans fond » (`image/index.ts:sansFond`), seule la zone de l'image a une ombre (`image.css:14`) ; la légende flotte sur la toile, sans fond ni ombre.
- [OK] Coins carrés (rayon 0), pas de bordure au repos — Notak : `image.css:10` rayon 0.
- [DIFFÉRENT] Ombre au repos — Milanote : `0 1px 2px rgb(27 37 54 / 0.1)` (élévation 1) ; la variante à anneau de 1 px couleur du fond (`contrast-shadow`) ne sert qu'à la carte de fichier sans aperçu et à certains fonds de tableau — Notak : l'ombre commune porte toujours l'anneau de 1 px (`toile.css:18`). Presque invisible sur la toile.
- [DIFFÉRENT] Image transparente (canal alpha) — Milanote : ni fond, ni ombre ; au survol, filet de 1 px `rgb(0 0 0 / 0.1)` autour de la carte ; l'outil « Transparent » (V1) lui rend un fond blanc — Notak : ni fond ni ombre (`geometrie.ts:aUneOmbre`), mais pas de filet au survol et pas de fond rendu possible.
- [OK] Détection de la transparence — Milanote : le serveur la met dans les données de l'image ; Notak : lue dans une copie de 64 px, seuil de 1 % de pixels sous 95 % d'opacité (`lecture.ts:9-25`).
- [DIFFÉRENT] Légende (rendu) — Milanote : texte riche dans la carte, 12 px (`--font-size-ui-small`) sur 20 px d'interligne, couleur `#323b4a`, marges 3 px 24 px 20 px 24 px (en haut 20 px quand l'image la précède, `padTop`), aux tailles d'interface moyenne et petite : 3/21/18/21 px et 2/18/16/18 px, interlettrage normal ; invite grise `#d1d3d6` — Notak : texte brut, 11 px sur 1,4, `#5b6169`, marge haute 4 px, aucun retrait horizontal (`image.css:55-66`), invite `#9aa0a8`.
- [ABSENT] Légende riche — Milanote : plusieurs paragraphes, gras, italique, barré, souligné, lien, centré, styles de texte (outils en édition : Style de texte, Gras, Italique, Barré, Souligné, Lien, Centrer), mentions, liens cliquables — Notak : une seule ligne de texte brut, Entrée valide, espaces réduits (`geometrie.ts:avecLegende`).
- [ABSENT] Drapeau « légende affichée » séparé du texte (`showCaption`) — Milanote : l'outil Légende affiche une légende vide avec son invite, qui reste visible hors sélection tant qu'on ne l'a pas retirée (Retour arrière sur légende vide la masque) — Notak : la légende n'existe que si elle a du texte ; l'invite n'apparaît que sur une image choisie (`Image.tsx:99-110`).
- [ABSENT] Légende masquée sous 8 UG de large (affichage « média seul », l'outil Légende grisé à 40 %) — Notak : aucun seuil.
- [DIFFÉRENT] Étiquettes et réactions — Milanote : les pastilles flottent SUR l'image, en bas à gauche (à 24 px du bord gauche, 20 px au-dessus du bord bas de l'image, lignes de 24 px de haut, autant de lignes que la hauteur permet ; ombre élévation 1 sur chaque pastille ; bouton d'ajout de réaction sur fond `#e8e9eb`) ; en affichage « média seul » (sous 8 UG) elles se réduisent à une ligne et disparaissent sous 60 px de large — Notak : bande sous la carte (`decor/Decor.tsx`, `data-mode`).
- [DIFFÉRENT] Chargement — Milanote : miniature de 1 px agrandie en fond (couleur de l'image) puis la taille adaptée en fondu (300 ms avant les rappels) — Notak : pavé gris `#e6e8eb` à la bonne taille, puis l'image (`image.css:46-52`).
- [DIFFÉRENT] Image en erreur — Milanote : fond `#f3f3f4` avec l'icône « image cassée » (20 px si le côté est sous 60 px) — Notak : fond `#e6e8eb` et le texte « Image introuvable » 11 px `#7a7f87` (`Image.tsx:86`, `langue.ts`).
- [OK] Tailles servies 400, 800, 1600 px puis l'original, choisies selon la largeur à l'écran × densité — Notak : `image/tailles.ts` (Milanote : qualité 75/70/65, original ; SVG jamais réduit).
- [OK] Pendant l'envoi : l'élément naît avec la copie locale, une roue au centre (Milanote : roue de 150 px minimum de haut, copie locale en data URI) — Notak : `image.css:123-140`. Les autres utilisateurs ne voient l'élément qu'une fois ses données prêtes (Notak : roue, `useFichier`).
- [ABSENT] Palette de couleurs extraite de l'image (`ImageColorPaletteObserver`, qui alimente les « couleurs suggérées » du sélecteur de couleur) — Notak : aucune extraction.
- [DIFFÉRENT] Barre de couleur — Milanote : une image peut porter une barre de 5 px en haut de la carte (`ColorBar`) — Notak : « Couleur » teinte la carte (`couleur/OutilCouleurCarte`) ; barre absente (déjà noté, `elements.md`).
- [DIFFÉRENT] Mode « icône » — Milanote : une image n'a pas de mode d'affichage — Notak : « Icône » au « ••• » replie l'image en pastille (`decor/Outils.tsx:112-130`, `peutEtreIcone`). À retirer pour l'image.
- [OK] Dessin affiché par-dessus (vecteur, trait noir par défaut, pointeur ignoré) — Notak : `Annotateur.tsx:Traits` (traits en pixels de l'image d'origine).

## A3. États

- [OK] Survol : la poignée de redimensionnement apparaît (Milanote : opacité 0 → 1 en 0,1 s, aussi à la sélection) — Notak : poignée au survol (RESTE.md).
- [OK] Choisi : filet de 2 px `#323b4a` à l'extérieur, coins carrés — Notak : `toile.css:178`.
- [DIFFÉRENT] Choisi et en édition de la légende — Milanote : le filet s'écarte de 2 px et glisse en 0,1 s — Notak : pour un élément « sans fond » il ne bouge pas (`toile.css:128-133` exclut `data-sans-fond`).
- [OK] Verrouillé choisi : filet `#bbbec3` — Notak : `toile.css:17`.
- [OK] Plusieurs choisis : même filet sur chacun, poignée seulement pour un seul.
- [DIFFÉRENT] Dans une colonne — Milanote : fond blanc, filet de 1 px `rgb(0 0 0 / 0.1)` autour, pas d'ombre — Notak : l'ombre de l'image reste (`data-ombre`), et `colonne.css:37-43` exclut les éléments « sans fond » du filet : l'image n'a pas de liseré.
- [ABSENT] Cible de dépôt d'un fichier pendant le survol — Milanote : cadre de 2 px `#323b4a` (`can-drop`) ; après 500 ms de survol prolongé d'un fichier ou d'une image, voile `rgb(0 0 0 / 0.48)` avec l'icône de remplacement (49 × 49 px) et le texte « Replace image » (12 px, `#f3f3f4`) — Notak : le dépôt remplace tout de suite, sans délai ni voile (`recepteur.ts:imageSous`).
- [ABSENT] Remplacement par glisser d'un élément image de la toile sur une autre image — Milanote : l'image déposée prend la place de la cible (position, largeur, légende gardées, lignes et commentaires rattachés repris, la cible va à la corbeille) — Notak : seuls les fichiers du bureau remplacent.
- [DIFFÉRENT] Verrouillé / lecture seule — Milanote : poignée cachée ; l'ouverture en grand reste, et en lecture seule la fenêtre n'offre ni dessin ni recadrage mais garde Télécharger et Nouvel onglet — Notak : même ouverture, mais voir B (aucune barre d'outils).

## A4. Barre d'outils de la sélection (barre de gauche)

Ordre Milanote pour une image seule : Couleur · Étiquette · Réaction · Commentaire · Transparent (si canal alpha, V1 seulement) · Dessiner dessus (ou « Edit drawing » s'il y a déjà un dessin) · Aligner · Répartir · Relier par des lignes (les trois si plusieurs choisis) · Modifier « Edit » (V2) · Fond « Background » (V2, si l'image n'est pas déjà transparente) · Légende · « ••• ».

- [DIFFÉRENT] Ordre — Notak : Couleur · Étiquettes · Réactions · Commentaire · [Dessiner · Légende] · arrangement · … (`Barres.tsx:236-285`, `image/Image.tsx:146-182`). La Légende vient avant l'arrangement chez Notak, après chez Milanote.
- [ABSENT] Outil « Transparent » (V1) — Milanote : bascule `showBackground`, icône « transparent », visible seulement si l'image a un canal alpha ; son libellé n'est pas tronqué ; actif quand le fond est caché — Notak : pas de fond blanc sous une image transparente.
- [DIFFÉRENT] « Dessiner dessus » — Milanote : le bouton s'appelle « Draw on top » (clé `tools.selected.drawOnTop`), icône `toolbar-draw`, désélectionne tout et ouvre la modale de l'image en mode dessin (route `editing-drawing`) ; devient « Edit drawing » quand un dessin existe ; touches P et D dans la modale — Notak : le dessin se fait en place sur la toile (Maj+D, bouton « Dessiner », `image/Image.tsx:154`, `raccourciAnnotation.ts`), libellé « Dessiner ».
- [ABSENT] Outil « Edit » (V2, icône `toolbar-image-edit`) qui ouvre la modale en mode recadrage — Notak : « Recadrer » est un mode sur place (voir C).
- [ABSENT] Outil « Background » (V2, icône `toolbar-image-background`) — suppression du fond par IA (voir C).
- [DIFFÉRENT] Légende — Milanote : icône `toolbar-caption`, bascule `showCaption`, entre en édition si la légende est vide ; grisée (40 %) sous 8 UG ; plusieurs images choisies : s'applique à toutes — Notak : bouton « Légende » qui entre en édition ; un seul élément (`Image.tsx:158`).
- [DIFFÉRENT] Outils propres Notak sans équivalent dans la barre Milanote — Notak : « Pivoter », « Recadrer », « Détourer », « Rétablir l'original » au « ••• » (`Image.tsx:162-180`). Milanote les range dans la modale (« Crop & rotate » en V1, « Edit » en V2 avec rotation à gauche et miroirs).
- [OK] « ••• » en dernier — Notak : tiroir « ••• » (`Barres.tsx:259`).

## A5. Menu du clic droit et menu « ••• »

Milanote (ordre des sections, séparateurs entre elles) : [Coller · Couper · Copier · Coller les styles · Dupliquer… · Corbeille] · [Renommer] · [menus de tableau] · [**Télécharger l'original** (« Download original image » pour une image, « …images » pour plusieurs, « Download » pour un fichier) · Ouvrir/Copier le lien du fichier · **Remplacer l'image** · Ajouter une image · Copier l'adresse · **Recadrer l'image sur la grille de points**] · [grouper en colonne · relier] · [convertir] · [Verrouiller la position] · [Premier plan · Arrière-plan] · [infos]. La barre « ••• » enlève les sections « presse-papiers » et « renommer ».

- [DIFFÉRENT] « Télécharger l'original » — Milanote : libellé « Download original image » ; télécharge la plus grande copie de l'image courante (donc l'image recadrée si elle l'a été) — Notak : « Télécharger l'original » (`langue.ts:243`), télécharge toujours le fichier d'origine non recadré (`fichier/telechargement.ts`).
- [ABSENT] « Remplacer l'image » (clé `element.replaceImage`, ouvre le sélecteur `image/*`, ne vaut que pour une image remplie ou un aperçu) — Notak : seul le dépôt remplace.
- [ABSENT] « Crop image to fit dot grid » avec case — Notak : rien.
- [OK] Verrouiller, Premier plan, Arrière-plan, date de création — Notak : `actionsSelection.ts`.
- [DIFFÉRENT] Copier l'image elle-même dans le presse-papiers (drapeau `copyImageData`) — Milanote : copie les pixels de l'image en plus de l'élément — Notak : copie l'élément seulement (à vérifier, non lu).

## A6. Gestes

- [DIFFÉRENT] Double-clic sur l'image — Milanote : ouvre la modale (sauf en présentation) ; double-clic sur la légende : sélection d'un mot (édition) — Notak : ouvre la visionneuse, y compris en double-cliquant la légende (`Toile.tsx:2128`, `ouvrir`).
- [OK] Clic sur une image choisie, sur sa légende : édite la légende au point cliqué — Notak : `Image.tsx:99-110`.
- [ABSENT] Taper un caractère sur l'image choisie commence la légende (la légende apparaît et reçoit le premier caractère, Échap annule, Retour arrière ignoré, sans effet avec Cmd) — Notak : aucune frappe n'entre dans la légende.
- [DIFFÉRENT] Entrée sur l'image choisie — Milanote : ouvre la modale — Notak : édite la légende (`Toile.tsx:1414-1419`).
- [OK] Espace ouvre l'image seule choisie (Notak : relâchement bref, `Toile.tsx:1506`).
- [OK] Glisser, déplacer, aimanter, copier-glisser — voir toile.md.
- [DIFFÉRENT] Redimensionner — Milanote : le coin garde les proportions ; Cmd (Ctrl) maintenu libère les proportions et ENREGISTRE un cadrage (propriété `media` : largeur et hauteur en pixels, l'image recouvre le cadre en `cover`), minimum 4 × 4 UG — Notak : le coin règle la largeur ; Cmd libère mais seule la largeur change (`Toile.tsx:1719-1723`), jamais de cadrage.
- [DIFFÉRENT] Double-clic sur la poignée — Milanote : si un cadrage existe, il est retiré (retour aux proportions) ; sinon bascule entre 34 UG et la largeur naturelle (≤ 1600 px ÷ 10, non arrondie) — Notak : 34 ↔ largeur naturelle arrondie (`coeur/largeur.ts:19`), sans retrait de cadrage (il n'existe pas).
- [OK] Minimum 4 UG — Notak : `index.ts:largeurMin`.
- [ABSENT] Glisser une vignette de la banque sur une image existante la remplace (garde position, largeur, légende) — Notak : la vignette ne crée qu'une image neuve.
- [OK] Retour arrière / Suppr : corbeille — commun.
- [ABSENT] Navigation clavier d'une image à l'autre hors modale — non utilisée par Milanote non plus.

## A7. Contenu riche, liens, mentions

- [ABSENT] Légende riche (voir A2) : liens (couleur `#f4511c`, `--ws-element-anchor`), mentions @, émojis, commentaires en ligne n'existent pas dans la légende de Notak.
- [OK] Légende prise en compte par la recherche du tableau (Milanote : surlignage des occurrences dans la légende) — non vérifié côté Notak.

## A8. Animations et délais

- [ABSENT] Filet de sélection qui glisse en 0,1 s (`ease-out`) — Notak : sur les cartes à fond seulement.
- [DIFFÉRENT] Arrivée de l'image après chargement — Milanote : l'image nette reste à opacité 0 sur la miniature jusqu'à son chargement complet, puis s'affiche ; les rappels de fin de chargement attendent 300 ms (durée du fondu) — Notak : pavé gris puis image, sans étape intermédiaire.
- [ABSENT] Voile de remplacement après 500 ms de survol d'un dépôt (voir A3).
- [OK] Redimensionnement animé jusqu'à l'état de repos (Milanote : interpolation de 30 % par image sur le rapport) — Notak : non vérifié.

## A9. Commentaires, réactions, étiquettes, couleur

- [DIFFÉRENT] Position des pastilles : sur l'image chez Milanote (voir A2), sous la carte chez Notak.
- [OK] Commentaire rattaché (fil), réactions, étiquettes, échéance — Notak : `decor/` pour tous les types.
- [DIFFÉRENT] Couleur : barre de 5 px (Milanote) contre teinte de la carte (Notak) ; la couleur d'une image teinte la carte et la légende, pas l'image.

---------------------------------------------------------------------------------------------------------------------

# B. L'IMAGE EN GRAND (fenêtre)

Milanote : route propre à l'élément (retour du navigateur ferme), fond `rgb(0 0 0 / 0.7)` (`--ui-image-modal-overlay`), pas d'animation d'ouverture, fermeture par Échap ou par un clic (appui et relâchement) sur le fond, jamais par une croix.

## B1. Fenêtre V1

- [DIFFÉRENT] Fond — Milanote : `rgb(0 0 0 / 0.7)`, plus la carte de l'image avec ombre extra-large, coins de 5 px, fond blanc ; marge basse de 83 px réservée à la barre — Notak : voile `rgb(15 17 20 / 0.86)`, image nue ombrée de `0 20px 60px rgb(0 0 0 / 0.4)`, 40 px de marge (`image.css:86-110`).
- [DIFFÉRENT] Taille — Milanote : largeur = min(largeur rognée de l'image, hauteur disponible ÷ proportions, largeur fenêtre − 200 px) ; jamais agrandie au-delà de l'image ; hauteur fenêtre − 50 px − 80 px de barre − hauteur projetée de la légende (70 caractères par ligne × 2 UG) ; arrondie ; la hauteur « idéale » mémorisée sert à passer d'une image à l'autre sans sauter — Notak : `max-width: 100%`, `max-height: calc(100% - 40px)`, `object-fit: contain`, l'image peut être agrandie au maximum (pas de plafond à sa taille réelle).
- [ABSENT] Légende affichée sous l'image dans la fenêtre (marges 16 px 24 px 0, couleur secondaire, fond de carte) — Notak : le texte blanc 14 px sous l'image sur le voile.
- [ABSENT] Barre d'outils en bas, détachée de la fenêtre — Milanote : pilule de 52 px de haut (48 px / 43 px aux tailles moyenne/petite), centrée sous l'image, fond `#262626` en thème clair (clair en mode recadrage et dessin), texte blanc 12 px demi-gras, ombre moyenne ; boutons séparés par un filet de 1 px `rgb(255 255 255 / 0.1)` ; chaque bouton : icône de 32 px + texte, marges 0 24 px 0 16 px ; ordre : **Download** (largeur fixe 135 px, avec progression d'un téléchargement), [Share sur Android], **New tab**, **Draw** (si modifiable), **Crop & rotate** (si modifiable, hors présentation) — Notak : aucune barre.
- [ABSENT] Téléchargement et ouverture dans un nouvel onglet depuis la fenêtre (la plus grande copie : original, sinon large, sinon regular) — Notak : seulement « Télécharger l'original » du « ••• ».
- [ABSENT] Flèches précédent/suivant — Milanote : deux zones de 100 × 100 px collées aux bords de l'écran, glissant de 100 px hors champ en 0,3 s `ease-in-out`, visibles s'il y a au moins 2 images ; libellés cachés « Previous » / « Next » ; clavier ← ↑ précédent, → ↓ suivant, bouclage ; l'ordre est spatial (lignes puis colonnes de la toile, calculé par un worker, puis les non triés, puis le contenu des colonnes), pas l'ordre de création — Notak : aucune navigation.
- [ABSENT] Mode UPLOAD de la fenêtre : barre de progression de 4 px au bas de l'image, texte de la barre d'outils « Uploading image… » ou « Saving changes… » (clés `imageModal.upload.*`) — Notak : roue sur la carte seulement.
- [ABSENT] Double-clic sur l'image de la fenêtre : passe en dessin (si modifiable).
- [ABSENT] Précharge des tailles des images voisines (`ImageModalFilesizePreloader`) — non utile chez Notak.
- [DIFFÉRENT] Fermer — Milanote : Échap ou clic sur le fond (le dessin en cours est enregistré à la fermeture) — Notak : Échap, Espace, ou un appui n'importe où (`visionneuse.tsx:20-41`).

## B2. Fenêtre V2 (drapeau)

- [ABSENT] Disposition — Milanote : plein écran, zone d'image avec 48 px de marge haute et basse, 60 px de marge de chaque côté ; l'image est ajustée sans jamais dépasser sa taille réelle, légende comprise (légende défilante au-delà de 50 vh − 48 px) ; arrière-plan en damier de 32 px quand l'image est transparente — Notak : voir B1.
- [ABSENT] Zoom de 1 à 4 — Milanote : molette (courbe multiplicative du zoom de la toile, pincement sur trackpad), touches = et + (avant), − (arrière), 0 (retour à 1), glisser pour déplacer quand zoomé (curseur « main » puis « main fermée »), lissage animé, barre d'outils estompée en 0,1 s pendant le zoom — Notak : aucun zoom.
- [ABSENT] Barre V2 — Milanote : barre sombre de 40 px (surface sombre), boutons « Draw on », « Edit », « Background » (texte blanc, anneau de 2 px quand actif) · séparateur · flèches précédent/suivant (icônes, info-bulle « Back » / « Next ») · ouvrir (hors applications natives, si le téléchargement est permis) · télécharger (icône) ; barres secondaires qui glissent de 8 px en 0,1 s ; bulles d'état de l'opération — Notak : aucune barre.
- [ABSENT] Clic sur le fond ferme sauf s'il se produit sur l'image, la barre ou une fenêtre ouverte (un panneau de couleur/épaisseur ouvert absorbe le premier clic) — Notak : tout appui ferme.

---------------------------------------------------------------------------------------------------------------------

# C. ÉDITION DE L'IMAGE (recadrer, pivoter, fond, dessin)

## C1. Recadrage et rotation

- [DIFFÉRENT] Où — Milanote : dans la fenêtre (mode `CROP`, route `editing`), avec Cropper.js : cadre libre (pas de rapport imposé), déplacement de l'image interdit, poignées de Cropper (huit), fond de damier si transparente — Notak : sur la carte elle-même (`image/Recadreur.tsx`), quatre poignées rondes d'angle, voile `rgb(15 17 20 / 0.55)` autour du cadre, `image.css:152-190`.
- [DIFFÉRENT] Outils — Milanote V1 : « Rotate left » (un quart de tour vers la gauche), « Cancel », « Save » (« Rotate left » et « Save » sont inactifs tant que l'éditeur charge « Loading editor… » ou qu'un avertissement est ouvert) ; V2 : icônes Rogner (active par défaut), Pivoter à gauche, Miroir horizontal, Miroir vertical, puis Annuler/Abandonner et Enregistrer — Notak : « Valider », « Annuler », « Toute l'image » (`Recadreur.tsx`), rotation séparée (« Pivoter », vers la droite, une touche du « ••• »).
- [ABSENT] Miroirs horizontal et vertical — Notak : aucun.
- [DIFFÉRENT] Sens de la rotation — Milanote : vers la gauche (anti-horaire) — Notak : vers la droite (`geometrie.ts:pivoter`).
- [DIFFÉRENT] Résultat — Milanote : l'image recadrée est ENVOYÉE comme nouveau fichier (la source reste, `imageOriginal` + `imageEditorData` : rotation en multiples de −90°, miroirs ±1, cadre x/y/largeur/hauteur) ; le téléchargement donne l'image recadrée ; ré-éditer repart de l'original — Notak : recadrage et rotation non destructifs, en fractions de l'image d'origine, rien n'est réécrit (`recadrage.ts:versSource`) ; le téléchargement redonne l'original entier.
- [ABSENT] Avertissement avant de pivoter une image qui porte un dessin (étiquette « warningLabel », message, boutons « Cancel » et « Continue anyway ») — Notak : le dessin suit la rotation (`annotation.ts:versImage`).
- [DIFFÉRENT] Boutons de l'éditeur V2 — Milanote : « Cancel » devient « Discard » dès qu'il y a un changement ; « Save » inactif tant que rien n'a changé — Notak : « Valider » toujours actif, « Annuler » fixe.
- [OK] Échap annule, Entrée valide dans le recadrage — Notak : `Recadreur.tsx:36-48` (touches de l'éditeur Milanote non relevées).

## C2. Suppression du fond (V2 + `imageBackgroundRemoval`)

- [DIFFÉRENT] Principe — Milanote : une bascule « Remove background » (clé `imageModal.removeBackground`) appelle un service d'IA avec quota (`UserFeatureUsageSummary`), calque une animation d'essuyage, produit un PNG transparent mis en cache ; « Save » enregistre, « Cancel/Discard » abandonne ; l'original reste la source — Notak : « Détourer » retire le fond uni par propagation depuis les bords selon un curseur « Tolérance » (`detourage.ts`), aperçu sur damier de 14 px, « Rétablir l'original ».
- [ABSENT] Limite d'usage et messages d'erreur dans une bulle (`ImageModalV2ErrorToast`, lien dans le message) — Notak : message « Détourage impossible. » / « Le bord n'est pas assez uni » dans l'éditeur.
- [OK] Un détourage donne une image transparente sans ombre — Notak : `aUneOmbre`.

## C3. Dessin sur l'image

- [DIFFÉRENT] Mode — Milanote : éditeur de croquis partagé (stylo, gomme, couleur, épaisseur, annuler/rétablir ; toutes les règles viennent de l'éditeur du croquis, voir `ecart-croquis`), dans la fenêtre, barre secondaire qui remplace la barre principale (glissement de 0,2 s `cubic-bezier(0.3, 1, 0.7, 1)`), « Save » et « Cancel/Discard » ; le dessin est enregistré comme vecteur (`drawing`, `hasDrawing`) et se ré-ouvre — Notak : pilule flottante en bas de la fenêtre (`image.css:270-278`), même barre que le croquis, Enregistrer (⌘S) / Abandonner (Échap), traits stockés en fractions de l'image (`TraitImage`).
- [DIFFÉRENT] Gomme — Notak : retire un trait entier avec contour rouge de 4 px avant (`annotation.ts:gommer`) ; pour Milanote voir `ecart-croquis` (non relevé ici).
- [OK] Couleur et épaisseur mémorisées d'une session à l'autre (Notak : `modeAnnotation.ts`) ; touches D (stylo), E (gomme), C, X, 1-4 — Notak ; Milanote : D/P pour entrer, ses touches dans l'éditeur du croquis.
- [DIFFÉRENT] Effet d'encre (réglage utilisateur `drawingInkEffect`) — Milanote : trait à largeur variable (perfect-freehand) si activé — Notak : largeur constante, bouts ronds.

---------------------------------------------------------------------------------------------------------------------

# D. PANNEAU « AJOUTER UNE IMAGE » ET PANNEAU D'ENVOI

Référence détaillée : `releve-document-image.md` A7 et A8. Ici seulement l'état Notak aujourd'hui.

- [OK] Panneau à droite de l'outil, à 15 px, avec flèche, 568 × 540 px, deux colonnes 37 % / 63 % — Notak : `image/banque.css:1-25`.
- [DIFFÉRENT] Marge intérieure — Milanote : 24 px — Notak : 16 px 12 px 16 px 16 px (`banque.css:15`).
- [OK] Liste des modes : Recommandées · mots du titre · historique (10 entrées, sans doublon) · Envoyer les vôtres (« Upload your own ») ; attribution Pexels ; champ de recherche en bas avec bouton d'effacement ; Entrée ajoute le terme en minuscules à la liste et vide le champ — Notak : `Banque.tsx`, `banqueImages.ts` (`MOTS_MAX = 10`, mots vides).
- [OK] Liste de vignettes en UNE colonne, « Load more » en pied (« Plus d'images »), spinner de 20 px, vide, erreur et « Try again » (« Réessayer ») — Notak : `Banque.tsx`.
- [DIFFÉRENT] Vignette — Milanote : largeur d'une carte image (34 UG demandées au serveur en miniature), marge 4 px à droite et en bas, ombre élévation 1, coins carrés — Notak : `gap: 8px`, coins 4 px, ombre `0 1px 3px rgb(0 0 0 / 0.25)` (`banque.css:155-167`).
- [DIFFÉRENT] Glisser une vignette — Milanote : une image-carte naît à l'endroit lâché, sans sélection forcée (le vol animé de la toile s'y applique, à vérifier) — Notak : fantôme de 140 px incliné de −2° (`banque.css:179-187`), l'image naît centrée sur le point lâché, sans vol animé.
- [OK] Légende d'office avec le crédit (Notak : « Photo : Nom, Pexels » ; Milanote : crédit du serveur), simple clic = bulle « Glissez-moi » 3 s — Notak : `Banque.tsx:Vignette`.
- [DIFFÉRENT] Choix d'un fichier dans « Envoyer les vôtres » — Milanote : chaque fichier devient un élément à l'emplacement par défaut du tableau, le panneau se ferme — Notak : au centre de la vue, panneau fermé.
- [OK] Panneau de l'outil « Envoyer » (350 px, illustration 150 × 144, bouton, astuce, cadre de 2 px au survol d'un dépôt, accepte tout, se ferme au choix) — Notak : `fichier/PanneauEnvoi.tsx`.

---------------------------------------------------------------------------------------------------------------------

# E. FICHIER JOINT (élément « File »)

Milanote : un fichier a deux modes (`displayMode`) : icône (par défaut) et carte détaillée.

## E1. Création

- [DIFFÉRENT] Mode au départ — Milanote : icône, sauf pour l'audio, la vidéo (type MIME lisible) et les types à aperçu forcé (Sketch, Photoshop, Illustrator, InDesign, XD, Dreamweaver) qui naissent en carte détaillée ; un PDF naît en icône, puis passe en carte détaillée tout seul si l'aperçu généré a plusieurs couleurs vives — Notak : toujours une carte détaillée avec badge (`fichier/Fichier.tsx`), aperçu de PDF dès l'envoi.
- [OK] Dépôt, collage, sélecteur, outil « Upload » : un élément par fichier — Notak : `fichier/recepteur.ts` (priorité 35).
- [DIFFÉRENT] Largeur de départ — Milanote : 10 UG en mode icône, 34 UG en carte — Notak : 34 UG toujours (`recepteur.ts:LARGEUR_FICHIER`).
- [DIFFÉRENT] Placement de plusieurs fichiers — Milanote : en colonnes comme les images (voir `creation.md`) — Notak : l'un sous l'autre à pas de 10 UG, décalés à droite des images (`recepteur.ts:20-29`).
- [OK] Aucune édition à la création.
- [ABSENT] Liste noire d'extensions et de noms (43 extensions dont `.exe`, `.bat`, `.html`, `.htm`, `.dmg`, `.msi`, `.scr`, `.lnk`, `.dll`, `.iso`, `.ps1` ; `.htaccess`, `web.config`, `robots.txt`, `crossdomain.xml`, `clientaccesspolicy.xml` ; fichiers dont le nom commence par un point) avec message « .{ext} files are not supported » — Notak : tout est accepté (le serveur sert chaque fichier en bac à sable, `apps/serveur/src/app.ts:738-751`, donc sans risque d'exécution).
- [DIFFÉRENT] Taille maximale — Milanote : 50 Mo (offre gratuite) ou 5 Go (offre Pro) pour un fichier, 10 Mo / 100 Mo pour une image ; le « Mo » de ces plafonds vaut 1 024 000 octets ; constante de 10 fichiers pour l'offre gratuite — Notak : 25 Mio pour tout (`geometrie.ts:6`), refus muet (`recepteur.ts:23` filtre sans message).

## E2. Rendu au repos, mode carte détaillée

Structure Milanote : aperçu pleine largeur tout en haut (s'il y en a un) ; dessous une ligne « métadonnées » de 24 px de marge (25 px haut et bas quand un aperçu existe ou en colonne) : icône de type à gauche (32 × 40 px, style « contour »), à droite le titre puis la ligne de détails, séparés de 12 px.

- [DIFFÉRENT] Icône de type — Milanote : un pictogramme de feuille propre à chaque famille (31 pictogrammes : 3D, Acrobat, After Effects, audio, Axure, code, document, Dreamweaver, e-mail, Excel, XD, générique, police, HTML, Illustrator, image, InDesign, Keynote, Lightroom, film, Muse, Numbers (aussi pour CSV), texte brut, PowerPoint, Premiere, image raw, RTF, Sketch, SVG, Word, zip ; Pages et Photoshop n'ont pas de pictogramme dans la source), en trois styles (large, contour, mini), clair ou sombre selon le thème — Notak : pastille colorée de 40 × 48 px (3 px d'arrondi) avec un symbole de trait de 22 px et l'extension en majuscules (4 lettres) en 10 px gras (`fichier.css:14-37`), neuf couleurs de famille (`#d6453d` pdf, `#3f74d1` texte, `#2f9a5a` tableur, `#e07a2e` présentation…).
- [DIFFÉRENT] Reconnaissance du type — Milanote : par extension d'abord (table de ~35 familles dont les formats Adobe, 3D, polices, e-mail) — Notak : par type MIME puis ~50 extensions en 10 genres (`genre.ts:21-37`) ; ni 3D, ni Adobe, ni polices, ni e-mail.
- [DIFFÉRENT] Titre — Milanote : nom du fichier (ou titre renommé), Inter 15 px (`--font-size-link-file-heading`), couleur `#323b4a`, interligne 1,5, marge `-4px 0 4px 0`, 500 caractères au plus — Notak : 14 px, 600 de graisse, interligne 20 px, une ligne coupée par « … » (`fichier.css:1-6, 47-52`).
- [DIFFÉRENT] Ligne de détails — Milanote : hauteur 18 px, 12 px, couleur `#8d929a` (tertiaire), liens soulignés ; contenu dans cet ordre : « Download » (bouton à progression), « - », « Open » (seulement PDF et texte, ouvre la modale), « - », taille — ex. « Download - Open - 1.2 MB » ; aucun « Download » si le tableau n'autorise pas le téléchargement — Notak : taille d'abord, puis « · Télécharger · Ouvrir » (`Fichier.tsx:44-62`), « Ouvrir » pour tous les types, ouvre un nouvel onglet.
- [DIFFÉRENT] Format de la taille — Milanote : unités SI en base 1000 (« B, KB, MB, GB »), décimales : 0 pour B/KB, 1 pour MB/GB, 0 si la valeur dépasse 100, nombre formaté selon la langue (« 1,2 MB » en français), clés de traduction `fileSizeUnits.*` — Notak : 1 décimale sous 10 sinon 0, « ko / Mo / Go » en français (`genre.ts:58-72`) : « 14 ko » contre « 14 KB », « 12 Mo » contre « 12,3 MB ».
- [DIFFÉRENT] Aperçu — Milanote : image fabriquée par le serveur pour 18 familles (image, raw, SVG, HTML, PDF, vidéo, texte, CSV, Word, PowerPoint, Excel, Sketch, Photoshop, Illustrator, InDesign, XD, Dreamweaver, polices), tailles 300 / 600 / original, rognée à la grille et redimensionnable, fond blanc (première page pour un PDF) ; remplaçable en y déposant une image — Notak : un cadre `iframe` sur la première page du PDF (fixe, 220 px de haut, coins de 4 px, dans la marge de la carte, `fichier.css:96-107`) ; rien pour les autres formats ; pas de remplacement.
- [DIFFÉRENT] Aperçu plein cadre — Milanote : l'aperçu touche les bords de la carte (haut, gauche, droite) — Notak : le PDF est dans la marge de 20/24 px ; la vidéo seule déborde (`fichier.css:90-96`, marges négatives).
- [ABSENT] Aperçu indisponible — Milanote : bloc de 160 px au moins, fond `#f3f3f4`, grande icône de type grise (140 × 140), texte « No preview available » — Notak : rien.
- [ABSENT] État « Processing » — Milanote : barre pleine de 200 × 8 px (coins de 4 px) et « Processing » à côté (11 px), tant que le serveur fabrique l'aperçu (pendant 5 minutes au plus) ; en mode icône : « Saving » avec barre — Notak : rien (l'aperçu est immédiat).
- [ABSENT] Échec de l'aperçu — Milanote : si rien n'arrive en 1 minute, l'aperçu est marqué en erreur et la carte passe sans aperçu — Notak : n'existe pas.
- [DIFFÉRENT] Carte sans aperçu — Milanote : largeur forcée à 34 UG, pas de poignée, ombre « contraste » (anneau de 1 px) — Notak : largeur libre, poignée présente (`largeurMin: 12`).
- [ABSENT] Barre de couleur de 5 px (ou teinte de la feuille en mode icône) — Notak : teinte de la carte.
- [OK] Légende sous la carte, dans la carte, dans un champ à part — Notak : `fichier.css:109-126` (12 px, opacité 75 %) ; Milanote : texte riche comme l'image, marge haute − 3 px (voir A2) — DIFFÉRENT pour le détail (texte brut chez Notak).

## E3. Rendu au repos, mode icône

- [ABSENT] Mode icône (« feuille ») — Milanote : largeur 10 UG ; feuille de papier de 56 × 72 px (48 × 60 en colonne, 40 × 50 en mode document), coin plié de 16 px (pli `#fdfdfd`, feuille blanche ; thème sombre : `#323b4a` à `#1b2536` selon `--color-bg-element-primary_hover`), ombre douce (`drop-shadow` élévation 1), couleur choisie teinte la feuille et le pli, pictogramme de type « large » collé en bas de la feuille (clair ou sombre selon la couleur) ; sous la feuille : le nom (Inter 15 px, centré, zone de 180 px), puis la taille 12 px `#8d929a` ; dans une colonne : mise en ligne (icône de 60 px à gauche, texte à droite, marges 16 px 24 px) sur fond noir à 4 % — Notak : « Icône » retire seulement l'aperçu et le lecteur (`Fichier.tsx:19-20`), la carte garde sa disposition horizontale (largeur 34 UG, badge, nom, détails). Le repli générique du cadre (`Cadre.tsx:icone`) peut en plus donner une pastille générique par le menu : deux mécanismes concurrents.
- [ABSENT] Titre éditable en place (sélectionner tout), délai de 100 ms (0 sur tactile) au clic — Notak : champ « nom » uniquement en édition de la carte.
- [ABSENT] Passage automatique de l'icône en carte détaillée quand l'aperçu reçu a plus d'une couleur vive — Notak : n'existe pas.

## E4. États

- [OK] Survol, choisi (filet 2 px `#323b4a`), verrouillé (`#bbbec3`), plusieurs choisis — Notak : commun.
- [DIFFÉRENT] Choisi en mode icône — Milanote : le contour suit la forme de la feuille (trait de 2 px sur le chemin du papier, pli compris) — Notak : n'existe pas (pas de feuille).
- [ABSENT] Cible de dépôt de remplacement sur l'aperçu (500 ms, voile « Replace image » ou « Replace preview » pour une vidéo) — Notak : aucune.
- [DIFFÉRENT] Envoi en cours — Milanote : la carte n'apparaît chez les autres qu'une fois les données de fichier reçues ; en local : toast d'envoi — Notak : roue dans la ligne de détails (`Fichier.tsx:45-50`).
- [ABSENT] Erreur d'envoi — Milanote : dans le cadre de la carte, icône d'alerte, message (clé localisée) + explication (« Sorry, something went wrong »), lien « Try another file » — Notak : l'élément est retiré et un avis le dit (`envois.ts:51-59`).

## E5. Barre d'outils

Ordre Milanote pour un fichier seul : Couleur · Étiquette* · Réaction* · Commentaire* · **Mode d'affichage** (« Card view », ou « Preview » pour les aperçus d'image) · **Renommer*** · **Légende*** · **Infos du fichier** (« File info ») · **Boucle** (« Loop ») · **Lecture auto** (« Autoplay ») · Aligner · Répartir · Relier · « ••• ». (* masqué en mode icône ; Renommer et Légende aussi masqués si l'affichage « média seul » est actif.)

- [DIFFÉRENT] Ordre et contenu — Notak : Couleur · Étiquettes · Réactions · Commentaire · [Icône, Renommer, Légende] · arrangement (`fichier/Fichier.tsx:140-162`).
- [ABSENT] « Preview » / affichage de l'aperçu (bascule `showMedia`, icône `toolbar-image-preview` ou `toolbar-media-preview` pour l'audio/vidéo) — Notak : seulement « Icône ».
- [ABSENT] « File info » (bascule `mediaOnlyDisplay` : masque le titre et la ligne de détails pour ne montrer que l'aperçu ; déclenché aussi automatiquement sous 20 UG de large) — Notak : aucun.
- [ABSENT] « Loop » et « Autoplay » pour l'audio et la vidéo (icônes `toolbar-loop`, `toolbar-autoplay`) — Notak : aucune.
- [DIFFÉRENT] « Renommer » — Milanote : icône `toolbar-rename`, entre en édition du titre — Notak : même effet mais ouvre aussi le champ de légende (`Fichier.tsx:154-155` : les deux boutons appellent la même édition).

## E6. Menu du clic droit et « ••• »

- [DIFFÉRENT] « Télécharger » — Milanote : « Download » — Notak : « Télécharger l'original » (`langue.ts:243`).
- [DIFFÉRENT] « Open file » — Milanote : si le presse-papiers est disponible : « Copy link to file » (copie l'adresse du fichier) ; sinon « Open file » (déclenche le téléchargement) — Notak : « Ouvrir le fichier » ouvre un nouvel onglet (`fichier/index.ts:79-85`).
- [ABSENT] « Replace image » / « Replace preview » (pour un fichier qui montre une image d'aperçu ou une vidéo) — Notak : rien.
- [ABSENT] Bascule « Preview » dans le menu — Notak : rien.

## E7. Gestes

- [DIFFÉRENT] Double-clic — Milanote : ouvre la modale du fichier (applications mobiles : visionneuse PDF ou lecteur vidéo natifs ; web mobile : nouvel onglet pour un PDF) ; en présentation, rien pour une carte détaillée — Notak : nouvel onglet pour tout fichier (`Fichier.tsx:ouvrirFichier`).
- [ABSENT] Modale d'un fichier — Milanote : PDF et texte : `iframe` du lecteur natif, 80 vw × 90 vh, `#toolbar=0` si le téléchargement est interdit ; autres types : carte détaillée agrandie (largeur = largeur de l'aperçu ou 1280 px, 450 px au moins, audio : fenêtre − 200 px, vidéo : taille ×4), avec aperçu complet, titre éditable, détails sans « Open », légende — Notak : aucune modale.
- [ABSENT] Taper un caractère sur un fichier choisi (cible = la carte) ouvre sa légende — Notak : aucun.
- [DIFFÉRENT] Redimensionner — Milanote : poignée seulement si un aperçu ou un lecteur est visible ; proportions de l'aperçu gardées (Cmd libère et enregistre un cadrage) ; minimum 4 UG ; en mode icône ou sans aperçu : déplacement seul — Notak : poignée toujours, largeur seule, minimum 12 UG.
- [OK] Le lien « Télécharger » ne lance pas de glisser (`garder`) — Notak.
- [ABSENT] Remplacer l'aperçu en glissant une image dessus — Notak : rien.

## E8. Lecteur audio et vidéo dans la carte

- [DIFFÉRENT] Audio — Milanote : bande de 50 px de haut sur fond noir à 4 % ; grille 37 px · 30 px · 1fr · auto : bouton lecture rond de 32 px (fond `#5f6672`, glyphe blanc de 16 px, 2 px de décalage à droite pour la flèche de lecture), bouton volume (survol : curseur vertical de 32 × 100 px, coins 16 px), barre de progression (4 px de haut, fond `#e8e9eb`, remplissage `#5f6672`, rond de 12 px à bord blanc de 2 px qui apparaît au survol en 0,15 s), durée « m:ss / m:ss » en police mono 11 px, alignée à droite — Notak : élément `<audio controls>` natif de 32 px (`fichier.css:62-67`).
- [DIFFÉRENT] Vidéo — Milanote : aperçu d'abord (image du serveur), cercle de lecture centré (diamètre = 40 % du plus petit côté, 20 à 56 px, fond `rgb(0 0 0 / 0.5)` flou 8 px), puis lecteur à proportions de la vidéo ; barre de contrôle sur l'image (fond noir à 50 %, flou 8 px, 30 px de haut) visible au survol ou si choisie : lecture, volume, progression, durée, plein écran (grille 30 · 30 · 1fr · auto · 30) ; plein écran uniquement depuis la modale sur Safari ; pause au début d'un glisser avec instantané de l'image — Notak : `<video controls>` natif, sans aperçu ni cercle, déborde de la marge (`fichier.css:56-61`).
- [ABSENT] Erreurs de lecture : « type non pris en charge » ou « erreur de lecture » (clés `errors.playback`, `errors.unsupportedType`), 2 relances à 1 s et 2 s avant d'afficher l'erreur — Notak : rien.
- [ABSENT] Vidéo sans image : bascule automatique vers les contrôles audio (`audioOnly`) — Notak : rien.
- [ABSENT] Lecture arrêtée et remise à zéro quand on redimensionne ou masque l'aperçu — Notak : rien.
- [DIFFÉRENT] Formats lisibles — Milanote : audio mp3/m4a/aac/mpeg/ogg/wav, vidéo mp4/quicktime/mov/mpeg/ogg — Notak : tout ce que le navigateur sait lire (`genre.ts:lisible`).

## E9. Commentaires, réactions, étiquettes, couleur

- [OK] Réactions, étiquettes, commentaire, échéance — Notak : `decor/`.
- [DIFFÉRENT] Position des pastilles : dans la carte (sous les détails, marge basse 16 px) chez Milanote, bande sous la carte chez Notak.
- [ABSENT] Barre de couleur et couleur de la feuille en icône — voir E2 et E3.

---------------------------------------------------------------------------------------------------------------------

# F. PIÈCES JOINTES, ENVOI, VALIDATION (attachments)

- [DIFFÉRENT] Indicateur d'envoi — Milanote : une bulle (toast) groupée qui annonce « Uploading N file(s) » (ou « Downloading ») avec barre de 48 × 6 px, puis taille chargée sur taille totale (« 3.1 / 12.4 MB », chiffres tabulaires) ; reste 1 s après la fin ; dans la fenêtre d'image V2, entrée/sortie de 0,1 s — Notak : compteur « Envoi de N fichiers… » dans l'en-tête (`langue.ts:145`), pas de taille.
- [ABSENT] Téléchargement avec progression (bouton « Download » devenant barre + pourcentage dans la carte ; au-delà d'1 Go, téléchargement direct du navigateur) — Notak : lien `download` natif.
- [ABSENT] Annulation d'un envoi (déduit d'un intergiciel d'annulation : défaire l'ajout pendant l'envoi interrompt le transfert) — Notak : l'envoi va à son terme.
- [ABSENT] Messages d'erreur de validation — Milanote : image : « Sorry, this file type is not supported » + « You can upload PNGs, WEBPs, JPEGs and GIFs » ; taille : « File exceeds the maximum size » + « The maximum .{ext} size is {max} » ; nom : « A filename must be provided », « The filename "{nom}" is not allowed », « Dot files are not allowed », « .{ext} files are not supported », « A file must be provided » ; présentés dans une fenêtre d'erreur ou dans le cadre de l'élément — Notak : filtre muet (`image/recepteur.ts:11`, `fichier/recepteur.ts:23`).
- [OK] Avis à l'échec d'un envoi réseau (Notak : `envois.ts`, « Impossible d'envoyer « nom » : … »).
- [ABSENT] Type MIME deviné par les premiers octets (PNG, JPEG, WebP, TIFF, GIF) quand le navigateur n'en donne pas — Notak : un fichier sans type devient `application/octet-stream`.
- [ABSENT] Aperçu des fichiers par un service (Word, PowerPoint, Excel, CSV, polices, Photoshop, etc.) — Notak : aucun service d'aperçu.

---------------------------------------------------------------------------------------------------------------------

# TOP 15 DES ÉCARTS LES PLUS VISIBLES

1. **Le mode icône du fichier** (feuille de papier 56 × 72 px, coin plié, pictogramme de famille, nom centré dessous, 10 UG) n'existe pas : « Icône » retire seulement l'aperçu (E3). Un fichier naît en icône chez Milanote, en carte large chez Notak (E1).
2. **L'image n'est pas dans une carte blanche** : sa légende, ses étiquettes et ses réactions flottent hors de la carte, sous l'image, sans fond ni ombre (A2, A9).
3. **La visionneuse est une simple image sur voile sombre** : ni barre (Télécharger, Nouvel onglet, Dessiner, Rogner), ni flèches précédent/suivant, ni zoom 1-4, ni légende dans la fenêtre, ni clic sur le fond précis (B1, B2).
4. **Le double-clic sur un fichier ouvre un nouvel onglet** au lieu de la fenêtre du fichier (PDF dans un lecteur de 80 vw × 90 vh, ou carte agrandie) ; « Ouvrir » apparaît sur tout fichier (E7, E2).
5. **L'icône de type du fichier** : badge coloré avec extension contre 30 pictogrammes de feuille propres à chaque famille (E2).
6. **L'aperçu d'un fichier** : un `iframe` fixe pour les PDF contre une image fabriquée par le serveur, pleine largeur, redimensionnable, pour 18 familles de formats ; pas d'état « No preview available » ni « Processing » (E2).
7. **La légende** : brute, 11 px, hors carte, sans mise en forme, sans indicateur d'affichage ; Milanote : texte riche 12 px dans la carte avec 24 px de marge (A2).
8. **Rognage de l'image sur la grille** : l'image est étirée au lieu d'être recouverte (déformation jusqu'à 5 px), pas de −2 px, pas d'option « Crop image to fit dot grid », pas de cadrage libre en Cmd+redimensionner (A2, A6).
9. **Barre d'outils de la sélection** : « Transparent », « Edit » et « Background » absents ; Légende mal placée ; pour le fichier, « Preview », « File info », « Loop », « Autoplay » absents (A4, E5).
10. **Menu « ••• » et clic droit** : « Remplacer l'image », « Crop image to fit dot grid », « Copy link to file » absents ; libellés « Download original image » / « Download » (A5, E6).
11. **Lecteur audio/vidéo natif du navigateur** au lieu du lecteur Milanote (bouton rond, volume au survol, durée « m:ss / m:ss », cercle de lecture sur l'aperçu, barre sur l'image, plein écran) (E8).
12. **Remplacement d'une image par dépôt** : sans délai ni voile « Replace image » ; pas de remplacement par glisser d'un autre élément image (A3).
13. **Frappe directe** : taper sur une image ou un fichier choisi ne démarre pas la légende ; Entrée édite au lieu d'ouvrir (A6, E7).
14. **Recadrage** dans une modale avec rotation à gauche et miroirs et fichier réécrit (Milanote) contre un cadre sur la carte, pivot à droite, non destructif (C1) ; **suppression du fond** par IA contre un détourage par tolérance (C2).
15. **Ligne de détails du fichier** : « Download - Open - 1.2 MB » (12 px, `#8d929a`, soulignés) contre « 1,2 Mo · Télécharger · Ouvrir » ; unités et décimales différentes (E2).
