# Écarts Notak / Milanote : famille lien et médias enrichis

Périmètre : le lien (carte avec aperçu), ses genres Vidéo, Audio et Carte (chez Milanote ce sont le même élément « lien », avec un type de lien), le lecteur intégré, les modes d'affichage (aperçu, infos, légende, média seul), la récupération des métadonnées, et le lieu (propre à Notak).

Sources lues : Milanote `client/element/link/*`, `client/element/richMedia/*`, `client/element/media/mediaElementDisplayUtils`, `common/links/*`, la barre (`toolbarSelectedToolConfig`, `toolbarElementToolConfig`, `DisplayInfoTool`, `MediaTool`, `mediaToolSelector`), le menu du clic droit (`elementContextMenuConfig`, `elementMediaContextMenuItems`, `elementContextMenuPredicates`), `previewImageDropTargetDecorator`, `ColorBar`, `Caption`, `useCaptionContainer`, `EditableTitle`, et les feuilles de style compilées correspondantes. Notak : `packages/tableau/src/elements/lien/*`, `elements/lieu/*`, `langue.ts`, `toile.css`, `Cadre.tsx`, `Toile.tsx`.
Limite : les textes anglais des libellés (invites de saisie, légende vide, messages d'erreur) vivent dans des fichiers de traduction JSON absents des sources décompilées. Je cite donc leurs clés ; le texte exact est à relever à l'écran. Le serveur qui lit les pages (types de média, intégrations) n'est pas non plus dans les sources : ce qui en est dit vient de ce que le client en attend.
Unités : 1 UG = 10 px, 1 rem = 10 px. Valeurs claires ; la marque (orange) vaut #F4511C en clair et #FB7051 en sombre.
Recoupe `releve-barre-elements.md` (A7.2, B7) et `docs/ecarts/*.md` ; ce qui y est déjà dit n'est repris que si l'état de Notak a changé.

---

## 1. LIEN : création

- [OK] Outil « Lien » de la barre de gauche, 2e position, tuile courte ; glisser pour poser ; naît sélectionné et en édition, le champ d'adresse prend le focus — Notak : `elements/lien/index.ts` outils, `aLaCreation` par défaut « éditer ».
- [OK] Largeur initiale 34 UG — Notak : `LARGEUR_LIEN = 34`, `elements/lien/index.ts:12`.
- [OK] Tiroir « ••• » : Audio, Carte, Vidéo dans cet ordre, chacun crée un lien vide avec un genre — Notak : rangs 230/240/250.
- [DIFFÉRENT] Hauteur initiale : Milanote ne fixe rien, la carte en saisie mesure 68 px (champ de 20 px de ligne, 24 px de marge en haut et en bas) ; sa hauteur minimale sans aperçu est 5,8 UG (58 px) — Notak : `hauteurParDefaut: 20`, saisie dans un cadre de 12 px de marge avec un champ à bordure (voir §2 saisie).
- [DIFFÉRENT] Valider l'adresse : Milanote charge l'aperçu dès que la carte perd la sélection ou l'édition (clic ailleurs, Échap, Entrée) tant que le champ n'est pas vide ; Entrée valide, charge puis désélectionne tout. Notak : seule Entrée valide (`Lien.tsx` `Saisie.valider`). Cliquer ailleurs après avoir tapé une adresse perd le texte et supprime la carte (`useSuppressionSiVide`, `Lien.tsx:92`).
- [ABSENT] Retour arrière ou Suppr dans un champ d'adresse vide : la carte part à la corbeille tout de suite (un seul geste). Notak : la carte vide n'est supprimée qu'à la sortie de l'édition.
- [DIFFÉRENT] Échap dans le champ : Milanote arrête l'édition (l'aperçu se charge si le champ n'est pas vide). Notak : Échap générique de la toile, texte perdu.
- [DIFFÉRENT] Erreur de validation ou d'aperçu : Milanote cache le champ (il reste monté, opacité 0) et affiche à sa place le message, 14 px, couleur grise tertiaire (pas rouge), 24 px de marge, pendant 2 secondes, puis le champ revient avec l'adresse tapée ; en cas d'échec du serveur l'icône d'état devient une icône d'échec. Le message vient du serveur (clé de traduction), sinon une clé « introuvable ». Notak : un texte rouge #C0392B de 12 px SOUS le champ pendant 2 s (`lien.invalide`, `lien.css:.notak-lien-erreur`), et un aperçu raté laisse une carte avec le message orange #B45309 (voir §3).
- [ABSENT] Une adresse d'image (webp, gif, png, jpg, jpeg dans l'adresse) : Milanote transforme la carte en image tout de suite, sans attendre l'aperçu, en lisant seulement les dimensions de l'image distante (l'image reste hébergée sur son site) ; si l'aperçu arrive avant, il gagne. Notak : attend la réponse du chercheur, puis rapatrie le fichier (`convertirEnImage`) ; sans service de rapatriement la carte reste un lien (`versImage.ts`).
- [ABSENT] Une adresse de tableau Milanote devient un raccourci vers ce tableau (le serveur renvoie le type « alias » et le client charge le tableau). Notak : aucun équivalent pour une adresse de tableau Notak.
- [OK] Coller ou déposer une ou plusieurs adresses : un lien chacune, 300 caractères au plus, courriel refusé — Notak : `registre.recepteur` priorité 30, `lien/index.ts:70-78`. (Écart de pas : Milanote décale les adresses déposées de 30 px, Notak de 12 UG = 120 px, `PAS_ADRESSES`.)
- [ABSENT] Fichier `.url` déposé ou collé : devient un lien. Notak : ignoré (déjà noté dans creation.md).

## 2. LIEN : rendu au repos

Dimensions
- [DIFFÉRENT] Largeur minimale : Milanote 17 UG (moitié de 34) quand la carte n'a pas d'aperçu visible, mais 4 UG (comme une image) quand un aperçu image/vidéo/riche est visible ; hauteur minimale 4 UG avec aperçu, 5,8 UG sans. Notak : 17 UG dans tous les cas (`LARGEUR_MIN_DEFAUT`, aucun `largeurMin` sur le lien).
- [ABSENT] Largeur maximale : Milanote borne la largeur d'un lien à aperçu à la largeur d'origine du média (sinon la largeur enregistrée du média). Notak : aucun plafond.
- [OK] Bords vifs : rayon 0 — Notak `border-radius: 0`.
- [DIFFÉRENT] Ombre : Milanote ombre « xs » (0 1 px 2 px, rgb(27 37 54 / 0,1) en clair, noir 24 % en sombre) ; si la carte n'a pas d'aperçu visible ou n'est pas chargée, l'ombre gagne un trait extérieur de 1 px à la couleur de la toile. Dans une colonne : ni ombre ni rayon, un filet de 1 px (couleur de bordure de colonne). Notak : `--notak-ombre` unique.
- [OK] Fond : blanc d'élément (gris foncé en sombre) — Notak `--notak-carte`. Pas de réglage « Transparent » pour un lien chez Milanote non plus.

En-tête (icône du site + adresse)
- [DIFFÉRENT] Contenu : Milanote affiche l'ADRESSE COMPLÈTE nettoyée (schéma interdit retiré), sur une ligne, 12 px, gris #8D929A, coupée par des points de suspension. Notak : le domaine seul sans « www. » (`domaineDe`, `Lien.tsx:166`).
- [DIFFÉRENT] Icône : 16 × 16 px, marge de 12 px avant le texte ; sans icône du site, une icône générique de lien. Notak : marge 6 px (`gap`), rien du tout si pas d'icône du site ni si l'aperçu n'est pas prêt.
- [DIFFÉRENT] Marges de l'en-tête : haut 25 px, côtés 24 px, bas 12 px (haut 26 px dans une colonne). Notak : bloc de texte à `padding: 25px 24px 12px` avec `gap: 12px` ; le haut et les côtés concordent.
- [OK] Toute la ligne ouvre l'adresse dans un nouvel onglet (cible vierge, sans référent, sans suivi) — Notak : lien avec `rel` identique.

Titre
- [DIFFÉRENT] Police et taille : Inter 15 px, interligne 20 px (1,5 en relevé précédent), espacement -0,2 px. Notak 15 px / 1,5 / -0,2 px : OK.
- [DIFFÉRENT] Couleur : marque #F4511C (clair) / #FB7051 (sombre), souligné en permanence ; en édition la couleur passe au texte principal, sans soulignement. Notak : `--notak-accent` BLEU (#2F6FEB clair, #5B8FF9 sombre), `lien.css:.notak-lien-titre`.
- [À VÉRIFIER] Graisse : la feuille du titre éditable donne 600 (héritée d'« EditableTitle ») ; un relevé précédent disait 400. Notak : 400 au repos, 700 en édition (`lien.css:.notak-lien-titre.notak-lien-edition`), ce qui ne colle à aucune des deux lectures. À trancher à l'écran.
- [DIFFÉRENT] Marges : côtés 24 px ; bas 12 px s'il y a une légende, 25 px sinon (26 px dans une colonne). Notak : bas du bloc 12 px dans tous les cas, donc 13 px de trop-peu sous le titre quand il n'y a pas de légende.
- [DIFFÉRENT] Coupure : retour à la ligne des mots longs, sans limite de lignes relevée dans les feuilles lues. Notak : 3 lignes maximum (`-webkit-line-clamp: 3`). À vérifier à l'écran.
- [ABSENT] Mots orphelins : le titre enregistré reçoit une espace insécable entre les deux derniers mots (`preventOrphanedWords`). Notak : non.
- [DIFFÉRENT] Cliquable : le titre est un lien tant que la carte n'est pas choisie seule et modifiable (il s'ouvre aussi quand plusieurs cartes sont choisies). Notak : lien tant que la carte n'est pas choisie du tout (`Lien.tsx:171`).

Légende
- [DIFFÉRENT] Police : 12 px, interligne 20 px, couleur du texte principal (#323B4A en clair), marges 3 px / 24 px / 20 px. Notak : 13 px, gris #6B7280, marge basse 12 px (`lien.css:.notak-lien-description`).
- [DIFFÉRENT] Nature : texte riche (gras, italique, barré, souligné, liens, centrage). Notak : texte brut (`<textarea>`).
- [DIFFÉRENT] Source : à la première lecture, la description de la page est copiée dans la légende et affichée si elle existe, sauf pour une vidéo ou un média riche où elle est cachée. Notak : description de l'aperçu AFFICHÉE tant qu'on n'a rien écrit, sauf s'il y a un lecteur (même règle pour les vidéos, mais aussi pour les cartes et morceaux) ; elle n'est pas copiée dans le contenu.
- [ABSENT] Texte d'attente de la légende vide (clé « caption.placeholder », gris clair, masqué à l'export). Notak : rien.
- [ABSENT] Mise en page selon la taille d'interface (moyenne : en-tête 22/21/11/21 px, petite : 20/18/9/18 px, titre et légende réduits en proportion). Notak n'a pas de tailles d'interface.

Aperçu image
- [DIFFÉRENT] Image du haut : largeur pleine, recadrée sur la grille de points (hauteur arrondie) hors redimensionnement, sans lien cliquable. Notak : hauteur libre (`height: auto`), la carte ne retombe pas sur la grille (`lien.css:.notak-lien-media img`).
- [DIFFÉRENT] Fond derrière l'aperçu : noir (#000) en clair tant que l'image charge. Notak : `--notak-fond`.
- [ABSENT] Image cassée : icône d'image cassée dans l'aperçu. Notak : image invisible.
- [ABSENT] Médias PDF : première page affichée comme image redimensionnable. Notak : aucun type PDF.

Saisie de l'adresse (carte sans adresse)
- [DIFFÉRENT] Forme : Milanote : une ligne dans la carte, icône d'état de 16 × 16 px à gauche (marge gauche 24 px), puis un champ SANS bordure ni fond propre, 14 px / 20 px, marges 24 px (12 px à gauche), curseur « normal » tant que la carte n'est pas choisie. Notak : cadre de 12 px avec champ à bordure 1 px arrondie 4 px, liseré bleu au focus, sans icône (`lien.css:.notak-lien-saisie`, `.notak-lien-champ`).
- [ABSENT] Icône d'état selon le genre : lien (chaîne), vidéo, audio, carte (épingle de carte) ; icône d'échec après une erreur ; roue (traits épais) pendant la lecture, champ désactivé avec l'adresse tapée. Notak : aucune icône ; pendant le chargement, la carte change de forme (en-tête + roue de 14 px, `.notak-lien-chargement`).
- [ABSENT] Invite du champ selon le genre : clés « placeholder.default / video / audio / map », couleur d'attente grise, masquée à l'export. Notak a quatre invites (`lien.invite.*`) : « Adresse », « Adresse de la vidéo », « Adresse du morceau ou du podcast », « Adresse de la carte » ; leur texte exact chez Milanote est à relever à l'écran.
- [OK] Champ de type adresse, correction et majuscules désactivées, vérification orthographique coupée — Notak : `type="url"`, `spellCheck={false}` (autocorrection non coupée sur mobile, minime).

## 3. LIEN : états

- [OK] Choisi : liseré de 2 px de la couleur de sélection, posé hors de la carte, qui se déplace en 0,1 s ; ombre retirée — Notak : général à la toile (autre famille).
- [DIFFÉRENT] Chargement de l'aperçu : Milanote garde la carte en saisie, icône → roue, champ grisé, adresse visible. Notak : la carte devient une carte normale avec le domaine et une roue de 14 px (bordure 2 px) qui tourne 0,8 s linéaire.
- [DIFFÉRENT] Échec de l'aperçu : Milanote REVIENT à la saisie avec l'icône d'échec, le message 2 s, puis l'adresse tapée de nouveau modifiable ; rien n'est enregistré (l'adresse n'est posée sur l'élément qu'au succès). Notak : l'adresse est gardée sur une carte (titre = adresse, message orange #B45309 12 px sous le domaine, six causes distinctes : introuvable, refus, injoignable, délai, interdit, illisible), le titre devient l'adresse.
- [DIFFÉRENT] Délai : Notak abandonne l'aperçu à 15 s (`DELAI_APERCU`). Milanote : pas de délai client relevé (le serveur tranche).
- [DIFFÉRENT] Verrouillé : poignée cachée, pas d'édition — Notak : général.
- [DIFFÉRENT] Dans une colonne : largeur de la colonne, pas d'ombre, filet 1 px, pas de poignée de largeur. Notak : général aux colonnes.
- [ABSENT] Survol d'une carte à déposer (image glissée sur l'aperçu) : voile noir 48 % avec icône « remplacer » (49 px) et texte 12 px « Remplacer l'image » (« Remplacer l'aperçu » pour une vidéo). Notak : aucun.
- [ABSENT] Filtre par étiquettes, présentation : en présentation, l'aperçu d'une vidéo est montré à la place du lecteur et le double-clic n'ouvre plus l'adresse. Notak : non traité pour le lien.
- [OK] Lecture seule : champs non modifiables — Notak : `lectureSeule`.

## 4. LIEN : barre d'outils

Barre « choisi seul » chez Milanote, dans l'ordre : Couleur, Étiquettes, Réactions, Commentaire, Aperçu, Infos du lien, Renommer, Légende, [Aligner, Répartir, Relier], •••.
Notak, dans l'ordre : Couleur, Étiquettes, Réactions, Commentaire, Aperçu, Infos, Adresse, Légende, [Lecture auto, Boucle], arrangement, ••• (`Outils.tsx`, `index.ts`).

- [OK] Ordre global Couleur, Étiquettes, Réactions, Commentaire.
- [DIFFÉRENT] Couleur : chez Milanote la couleur d'un lien est une BARRE de 5 px (0,5 rem) en haut de la carte, posée par-dessus l'aperçu, le fond restant blanc. Notak : elle teinte tout le fond de la carte, titre et description (`toile.css:2474-2481`, `elements/couleur/teinte.ts`).
- [ABSENT] Renommer : met le titre en édition (jamais « actif »), un seul lien, visible seulement si l'en-tête est visible. Notak : pas d'outil ; le titre se renomme par clic sur la carte choisie.
- [DIFFÉRENT] Adresse (outil de Notak) : change l'adresse d'un lien déjà chargé. Milanote n'a aucun outil de ce genre ; l'adresse est fixée au chargement. À garder ou à retirer selon l'objectif de fidélité.
- [DIFFÉRENT] Aperçu : Milanote ne le propose que si le lien peut montrer un média (aperçu image, lecteur vidéo ou riche, même masqué) ; bascule actif/inactif avec contour de 2 px ; icône « aperçu d'image ». Remettre l'aperçu remet aussi l'affichage en « tout montrer ». Notak : toujours proposé, même sans image (`Outils.tsx:partie('apercu')`), icône `image`.
- [DIFFÉRENT] Infos : Milanote : un seul type de carte choisi, plusieurs cartes autorisées ; indisponible si le lien n'a pas d'aperçu visible (rien à basculer), si la carte est plus étroite que 12 UG, ou en vue icône ; libellé « Infos du lien » (« Link info »), icône de lien-hypertexte. Bascule le mode « média seul » : cache à la fois l'en-tête, le titre ET la légende. Notak : toujours proposé ; ne cache que domaine+titre (`sansInfos`) ; la légende a son propre bouton.
- [DIFFÉRENT] Légende : Milanote : bascule, grisée par le mode média seul ; l'allumer met le curseur dans la légende. Notak : bascule `sansLegende`, sans curseur dans le champ.
- [ABSENT] Cacher des outils en média seul : Aperçu, Renommer et Légende disparaissent de la barre ; il ne reste que Infos pour revenir. Notak : jamais cachés.
- [DIFFÉRENT] « Ne pas cacher la dernière partie » (`avecPartie`) est une règle propre à Notak ; chez Milanote on ne peut pas cacher le média seul (média visible requis pour le mode média seul), mais on peut cacher la légende et garder l'en-tête.
- [DIFFÉRENT] Lecture auto et Boucle : Milanote les réserve aux fichiers audio/vidéo téléversés ; un lien n'en a pas. Notak les ajoute aux liens vidéo (`Outils.tsx:35-37`). En trop, mais utile ; à ne retirer que si la fidélité l'exige.
- [ABSENT] Pendant l'édition du titre (liste `editing_TITLE`) : la barre garde Couleur, Étiquettes, Réactions, Commentaire, Aperçu, Infos, Légende, arrangement (sans Renommer ni •••). Notak : la barre ne change pas.
- [ABSENT] Pendant l'édition de la légende (liste `editing_CAPTION`) : outils de texte de légende (Style de texte réduit, Gras, Italique, Barré, Souligné, Lien, Centrer). Notak : aucun, la légende est un champ brut.
- [DIFFÉRENT] Libellés : Milanote « Aperçu » (Preview), « Infos du lien » (Link info), « Renommer » (Rename), « Légende » (Caption). Notak « Aperçu », « Infos », « Adresse », « Légende » (`langue.ts:415-422`).

## 5. LIEN : menus du clic droit et de « ••• »

Milanote, pour un lien seul, dans l'ordre des sections : presse-papiers (Coller [colonne], Couper, Copier, Coller le style, Dupliquer, Mettre à la corbeille) ; [nommage : rien pour un lien] ; média : Remplacer l'image (si une image est montrée) OU Ajouter une image (lien seul sans image), Copier l'adresse du lien (seulement si le presse-papiers est disponible) ; regroupement (Mettre dans une colonne, Relier par des lignes) ; verrou ; plan (premier plan, arrière-plan) ; métadonnées. Le menu « ••• » de la barre reprend cela sans presse-papiers ni nommage.

- [ABSENT] « Ajouter une image » : téléverse une image comme aperçu d'un lien qui n'en a pas. Notak : rien.
- [ABSENT] « Remplacer l'image » (pour une vidéo : « Remplacer l'aperçu ») : remplace l'aperçu par un fichier choisi. Notak : rien.
- [OK] « Copier l'adresse du lien » — Notak : `lien.copierAdresse` (accepte plusieurs liens, une adresse par ligne ; Milanote : un seul).
- [DIFFÉRENT] « Ouvrir le lien » : entrée de Notak qui n'existe pas chez Milanote (on ouvre en cliquant sur l'en-tête ou le titre, ou en double-cliquant l'aperçu en média seul). En trop.
- [OK] Reste du menu : général à la toile.

## 6. LIEN : gestes

- [ABSENT] Taper un caractère sur un lien chargé et choisi : montre la légende et y commence la saisie avec ce caractère (sauf si la carte est plus étroite que 12 UG). Échap termine, retour arrière sur la carte est ignoré, retour arrière dans une légende vide la cache. Notak : rien.
- [ABSENT] Double-clic sur l'aperçu en mode média seul : ouvre l'adresse dans un nouvel onglet (sauf en présentation). Notak : rien (l'aperçu n'est pas un lien).
- [DIFFÉRENT] Cliquer le titre d'une carte choisie seule : renomme (texte entièrement sélectionné, 500 caractères au plus, un titre vide est refusé et l'ancien reste). Notak : renomme aussi, 500 caractères (OK), mais un titre vidé efface le titre et retombe sur celui de l'aperçu.
- [OK] Cliquer le titre ou l'en-tête d'une carte non choisie ouvre la page ; un glisser de plus de 4 px ne l'ouvre pas — Notak : `Lien.tsx:165-175`.
- [DIFFÉRENT] Redimensionner avec aperçu : image et vidéo gardent leurs proportions, Cmd/Ctrl les libère (mode « optionnel ») ; riche, carte, audio et PDF sont libres. Sans aperçu : largeur et hauteur libres, la hauteur plafonne le texte sous un voile. Notak : `hauteurBornable` partout, aucune proportion (`proportion` absent du lien), donc une vidéo se déforme et une hauteur bornée coupe l'aperçu.
- [ABSENT] Redimensionner sous 12 UG : le texte et la légende disparaissent d'eux-mêmes (média seul « trop petit »), l'aperçu seul reste ; en traînant, l'aperçu seul s'affiche en direct. Notak : plancher à 17 UG, ce mode n'existe pas.
- [ABSENT] Hauteur forcée pendant le glissement d'une carte sans aperçu : la légende est forcée visible le temps du geste (elle occupe l'espace), puis revient. Notak : non.
- [DIFFÉRENT] Double-clic sur la poignée de largeur : Milanote revient à la largeur d'origine du média (ou à la largeur maximale), Notak : bascule entre 34 UG et rien (`largeurNaturelle` absent du lien).
- [ABSENT] Déposer une image (fichier ou élément image) sur l'aperçu d'un lien : remplace son aperçu ; un élément image déposé est supprimé et ses lignes/commentaires passent au lien. Notak : `imageSous` ne vise que les images.
- [DIFFÉRENT] Entrée ou double-clic sur une carte chargée : Notak ouvre l'édition du titre ou de la légende selon le point cliqué (`Lien.tsx:128-133`). Milanote : le double-clic sur le titre édite le titre, la frappe d'un caractère édite la légende.

## 7. LIEN : contenu riche

- [ABSENT] Légende riche (voir §2 légende) : gras, italique, barré, souligné, liens, centrage, ainsi que mentions et émojis selon l'éditeur de légende. Notak : texte brut.
- [OK] Titre : texte seul chez les deux ; Notak interdit les retours à la ligne dans le titre (`ligne`), Milanote le laisse multiligne (`pre-wrap`) : écart mineur.
- [DIFFÉRENT] Recherche : Milanote surligne les occurrences dans le titre (couleur de recherche). Notak : général.

## 8. LIEN : animations et délais

- [OK] Liseré de sélection : 0,1 s ease-out (haut/droite/bas/gauche) — général.
- [DIFFÉRENT] Roue de chargement : Milanote, roue de l'application (trait épais ×2) dans l'icône de 16 px. Notak : bordure de 2 px, rotation 0,8 s linéaire dans la carte.
- [ABSENT] Passage vidéo : aperçu → roue blanche (3 px) sur l'aperçu → lecteur. Voir §9.

## 9. LIEN : commentaires, réactions, étiquettes, couleur

- [OK] Étiquettes, réactions, commentaire attachés : outils communs — général.
- [DIFFÉRENT] Couleur : barre de 5 px (voir §4). Notak : fond entier teinté.
- [OK] Barre d'activité et pastille d'auteur, outil de ligne rapide au coin : général.

---

## 10. MÉDIAS ENRICHIS (vidéo, audio, carte, riche)

Modèle Milanote : le serveur lit la page et dit son type de média (image, vidéo, audio, riche, carte, document, PDF, aucun) et fournit le code d'intégration d'un service d'intégration tiers (Embedly/Iframely, hors sources). Le client sait faire trois choses : (1) une VIDÉO s'affiche en aperçu avec un bouton de lecture et ne charge le lecteur qu'au clic ; (2) un média RICHE ou une CARTE (Google Maps etc.) s'incruste directement dans la carte, sans clic ; (3) tout le reste est une simple image d'aperçu. Les fournisseurs YouTube, Vimeo, SoundCloud, Loom et Wistia sont classés « lecteur au clic » même quand le serveur les dit riches.

Détection du fournisseur
- [DIFFÉRENT] Étendue : Milanote accepte tout ce que le service d'intégration sait incruster (des centaines de sites). Notak : 16 fabriques à la main (`lecteurs.ts` : YouTube [nocookie, shorts, live, temps de départ], Vimeo, Loom, Dailymotion, Wistia, TikTok, Spotify, SoundCloud, Apple Music, Deezer, Google Maps, OpenStreetMap, Figma, Miro, CodePen, Google Docs). Absents chez Notak : X/Twitter, Instagram, Facebook, Threads, LinkedIn, Pinterest, Reddit, Tumblr, Twitch, GitHub, Airtable, Typeform, Behance, Product Hunt, Kickstarter, IndieGoGo, Gumroad, ConvertKit, MarvelApp, SmugMug, Overflow, Google Agenda, et tout autre service du fournisseur d'intégration. Notak en a en plus : Dailymotion, TikTok, Apple Music, Deezer, OpenStreetMap, Miro.
- [DIFFÉRENT] Forme des proportions : Milanote prend largeur et hauteur du code d'intégration fourni (padding en pourcentage arrondi). Notak : proportions câblées par fournisseur (16/9, 9/16 pour les Shorts et TikTok, 4/3 pour les cartes, 16/10 pour Figma et Miro, 3/4 pour un document Google, hauteurs de 152/352 px pour Spotify, 166/450 px pour SoundCloud, 175/450 px pour Apple Music, 152/300 px pour Deezer).

Lecteur vidéo (clic pour lire)
- [DIFFÉRENT] Aperçu : image de la vidéo remplissant la boîte aux proportions du média, fond noir (clair) derrière. Bouton de lecture : cercle centré de diamètre max(min(40 % hauteur, 40 % largeur, 56 px), 20 px) — il s'adapte à la taille de la carte — fond noir 50 %, flou d'arrière-plan 8 px, triangle de lecture de 36 % du cercle décalé de 7 % vers la droite, toute la surface de l'aperçu cliquable avec curseur main. Notak : bouton fixe de 48 px, fond noir 65 % (80 % au survol), icône 20 px, seul le bouton clique (`lien.css:.notak-lien-lecture`).
- [ABSENT] Chargement après clic : l'aperçu reste, la roue blanche (trait 3 px) tourne par-dessus ; le lecteur est monté dessous ; il remplace l'aperçu dès que le lecteur annonce « prêt »/« lecture », au plus tard 2 s après (deux minuteurs de 2 s en secours). Notak : l'iframe remplace l'aperçu aussitôt, sans roue.
- [ABSENT] Fin de lecture : l'aperçu revient (événement « ended » du lecteur). Notak : le lecteur reste.
- [ABSENT] Erreur de lecture (le lecteur signale une erreur, ou pas de données) : voile noir (48 % ou 56 % selon le thème) avec icône d'alerte (pied de 16 px, cercle blanc) et le texte « Désolé, ce média ne peut pas être lu » (anglais : « Sorry, this media cannot be played »). Notak : rien.
- [OK] Vie privée : Vimeo reçoit « ne pas suivre » (`dnt=1`) et YouTube passe par le domaine sans cookie chez Notak.
- [DIFFÉRENT] Cadre du lecteur : l'iframe déborde de 2 px de chaque côté (largeur et hauteur + 4 px, décalage -2 px) pour cacher le filet du lecteur, niveau 10 ; fond #FDFDFD derrière le lecteur. Notak : iframe exactement à la taille, sans débordement.
- [DIFFÉRENT] Tailles d'interface moyenne et petite : l'iframe est réduite (échelle 0,9 et 0,8) pour garder la lisibilité. Notak : absent (pas de tailles d'interface).
- [ABSENT] Voile transparent sur le lecteur tant que la carte n'est pas CHOISIE SEULE : un premier clic choisit la carte (et permet de la glisser), il faut un second clic pour agir dans le lecteur ; un bloqueur de souris plein cadre couvre le lecteur pendant un glisser, et l'iframe est cachée (`display: none`) pendant qu'on déplace la carte. Notak : l'iframe avale tous les clics et glissers dès qu'elle est montée ; on ne peut plus ni choisir ni glisser la carte en cliquant sur la vidéo.
- [ABSENT] Mobile iPhone : pas d'iframe ; le clic sur l'aperçu ouvre l'adresse dans un nouvel onglet. Notak : non traité.
- [ABSENT] Presentation : l'aperçu est toujours montré au lieu du lecteur. Notak : non traité.
- [DIFFÉRENT] Média seul (carte étroite ou « Infos » éteint) : le bouton de lecture disparaît, un clic ne lance plus la vidéo (c'est le double-clic qui ouvre l'adresse). Notak : sans objet.
- [DIFFÉRENT] Lecture automatique et boucle : voir §4 (Notak en ajoute, avec lecture muette `mute=1`, boucle propre à chaque fournisseur). Milanote : pas pour les liens.

Média riche / carte (incrusté d'emblée)
- [DIFFÉRENT] Chez Milanote : tout média riche ou carte non classé « au clic » (Google Maps, Spotify, Figma, CodePen, Typeform, X…) est monté tout de suite dans la carte ; pendant un glisser et en présentation, un cadre gris (#FDFDFD clair) avec voile remplace l'iframe. Notak : la CARTE démarre seule (OK) ; en revanche Spotify, Apple Music, Deezer (audio) et Figma, Miro, CodePen, Google Docs (riche) attendent un clic (`demarreSeul` : genre carte ou vidéo à lecture auto seulement).
- [DIFFÉRENT] SoundCloud est « au clic » chez Milanote (liste d'exceptions) ; Notak aussi : OK.
- [ABSENT] Fournisseurs de carte : Notak a Google Maps et OpenStreetMap. Pas d'équivalent pour les autres cartes incrustées (Apple Plans, Mapbox, etc.), qui passent par le service d'intégration chez Milanote.
- [DIFFÉRENT] Genre audio : Milanote n'a pas de lecteur audio propre (un type « audio » retombe sur une image d'aperçu ; les lecteurs de morceaux sont des médias riches). Notak a un genre audio de hauteur fixe sur fond #1F2328 (`lien.css:[data-genre='audio']`) : plus abouti que Milanote.

Médias d'aperçu seul
- [DIFFÉRENT] Document (DOC) et « aucun média » : Milanote ne montre aucun aperçu (la carte est un en-tête + titre). Notak montre l'image de l'aperçu s'il y en a une.

Métadonnées et récupération de la page
- [DIFFÉRENT] Qui lit la page : un serveur Milanote (type de média, titre, description, image, icône du site, code d'intégration, langue de l'utilisateur transmise). Notak : service `apercu` de l'hôte + `lireApercu.ts` (balises `og:*` puis `twitter:*`, `<title>`, `description`, icône `<link rel=icon>` ou `/favicon.ico`, adresses relatives rendues absolues).
- [ABSENT] Dimensions et rapport de l'image d'aperçu : Milanote enregistre la taille de l'image et du média (pour réserver la place avant le chargement : pas de saut de mise en page). Notak : l'image charge, la carte grandit après coup.
- [ABSENT] Taille de capture d'aperçu : 676 × 380 px (constante) pour les aperçus de page capturés par le serveur. Notak : l'image d'origine du site.
- [ABSENT] Elle est copiée dans le stockage de Milanote (image hébergée « regular »). Notak : image distante ajoutée telle quelle (`referrerPolicy="no-referrer"`) ; elle disparaît si le site la retire.
- [OK] Titre et icône du site enregistrés avec le lien ; titre modifiable sans perdre celui de la page (Notak : `titre` surcharge `apercu.titre`).
- [DIFFÉRENT] Mise à jour d'un aperçu : Milanote re-fetche seulement si l'adresse est réécrite ; Notak change d'adresse via l'outil « Adresse » en effaçant aperçu, titre et légende (`avecAdresse`).

Modes d'affichage du lien (récapitulatif)
- [DIFFÉRENT] Milanote : 3 interrupteurs indépendants. Aperçu (montrer/cacher le média) ; Infos (« média seul » vs « tout montrer », valeurs enregistrées : tout, préférence, trop petit) ; Légende (montrer/cacher). Le mode média seul cache en bloc en-tête + titre + légende, désactive les trois autres outils, et se déclenche seul sous 12 UG. Notak : trois interrupteurs `sansApercu`, `sansInfos`, `sansLegende` indépendants (Infos ne cache que domaine + titre), jamais automatiques.
- [OK] Pas de vue icône pour un lien chez Milanote non plus ; le seul mode compact est le média seul.

---

## 11. LIEU (Notak seulement)

Milanote n'a PAS d'élément « lieu » : une carte géographique y est un lien de type Carte (Google Maps incrusté). Le lieu de Notak (`elements/lieu/*`) est donc une extension.

- [DIFFÉRENT] Existence : outil « Lieu » dans le tiroir de création (rang 280, icône épingle) qui n'existe pas chez Milanote. À conserver comme extension ou à retirer, au choix de fidélité.
- [DIFFÉRENT] Rendu : carte OpenStreetMap incrustée de 190 px (centrée sur la position, épingle) + nom en gras + adresse + lien « Voir sur la carte » ; sans position : vignette de plan 48 × 48 px avec épingle. Largeur 24 UG (minimum 16), hauteur de départ 9 UG, fond de carte commun.
- [OK] Le genre « carte » du lien (Google Maps, OSM) couvre déjà le besoin Milanote et démarre seul ; le lieu n'est pas nécessaire à la fidélité.

---

## TOP 15 des écarts les plus visibles

1. Le lien ne s'enregistre que sur Entrée : cliquer ailleurs perd l'adresse tapée et supprime la carte, alors que Milanote charge l'aperçu en quittant le champ (§1).
2. La couleur d'un lien teint toute la carte chez Notak ; chez Milanote c'est une barre de 5 px en haut, fond blanc conservé (§4).
3. Le titre est bleu chez Notak (#2F6FEB), orange de marque chez Milanote (#F4511C clair, #FB7051 sombre) (§2).
4. L'en-tête montre le domaine chez Notak, l'adresse complète chez Milanote, avec une icône générique quand il n'y a pas d'icône de site (§2).
5. Un lecteur vidéo monté capte tous les clics : impossible de choisir ou de glisser la carte en cliquant sur la vidéo ; pas de voile avant sélection, pas de bloqueur pendant le glisser (§10).
6. Le bouton de lecture est fixe (48 px, noir 65 %) chez Notak ; chez Milanote il suit la taille de la carte (20 à 56 px, noir 50 %, flou 8 px) et toute l'image est cliquable (§10).
7. Pas de roue après le clic de lecture, pas de retour à l'aperçu en fin de lecture, pas de message d'erreur « média illisible » (§10).
8. Redimensionnement des liens à aperçu : Notak plancher 17 UG sans proportions gardées ; Milanote 4 UG, proportions gardées pour image et vidéo, Cmd les libère, et média seul automatique sous 12 UG (§6).
9. Spotify, Apple Music, Deezer, Figma, Miro, CodePen et Google Docs attendent un clic chez Notak ; chez Milanote les médias riches et les cartes sont incrustés d'emblée (§10).
10. Une adresse en échec reste une carte orange chez Notak ; chez Milanote la carte revient à la saisie, icône d'échec, message gris 2 s (§1, §3).
11. La saisie d'adresse : cadre à champ bordé sans icône chez Notak ; une ligne blanche à icône d'état (lien, vidéo, audio, carte, échec, roue) et champ sans bordure chez Milanote (§2).
12. Espacement sous le titre sans légende : 12 px chez Notak, 25 px chez Milanote ; la légende fait 13 px gris chez Notak, 12 px texte principal chez Milanote (§2).
13. Outils : pas de « Renommer », « Aperçu » et « Infos » proposés même sans média ; « Infos » ne cache pas la légende, alors que chez Milanote il cache en bloc en-tête, titre et légende et fait disparaître Aperçu, Renommer et Légende (§4).
14. Menu : pas d'« Ajouter une image » ni de « Remplacer l'image/l'aperçu » ; glisser une image sur l'aperçu pour le remplacer est impossible (§5, §6).
15. Adresse d'image : Milanote transforme tout de suite la carte en image ; Notak attend l'aperçu puis dépend d'un service de rapatriement (§1).
