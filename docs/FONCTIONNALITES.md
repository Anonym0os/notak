# Fonctionnalités de Milanote, et où en est Notak

La liste de travail de Notak : chaque fonctionnalité de Milanote, relevée dans son code (types d'éléments,
outils, raccourcis, en-tête, partage), avec son état chez nous. On la met à jour à chaque passe : une ligne
change d'état dans le même commit que le code qui la fait avancer. Le détail des écarts est dans `docs/ecarts/`.

**États.** ✅ fait, comme chez Milanote · 🟡 en partie (la colonne « Reste » dit quoi) · ⬜ absent ·
➖ écarté volontairement (choix de Notak, écrit dans `docs/SPEC.md`).

Le décompte en tête de chaque partie compte ✅ pour 1 et 🟡 pour ½, sans les lignes ➖.

## Avancement

| Partie | Fait | En partie | Absent | Avancement |
|---|---|---|---|---|
| 1. Toile | 29 | 0 | 0 | 100 % |
| 2. Création | 16 | 1 | 0 | 97 % |
| 3. Note et texte | 36 | 1 | 1 | 96 % |
| 4. Colonne | 13 | 0 | 0 | 100 % |
| 5. Tableau imbriqué | 13 | 1 | 0 | 96 % |
| 6. Lien | 15 | 1 | 0 | 97 % |
| 7. Image | 19 | 0 | 0 | 100 % |
| 8. Liste de tâches | 21 | 0 | 0 | 100 % |
| 9. Ligne | 19 | 1 | 0 | 98 % |
| 10. Autres éléments | 16 | 2 | 1 | 89 % |
| 11. Commun aux éléments | 12 | 0 | 0 | 100 % |
| 12. Organiser | 16 | 0 | 0 | 100 % |
| 13. Naviguer | 13 | 0 | 0 | 100 % |
| 14. À plusieurs | 19 | 0 | 0 | 100 % |
| 15. Habillage | 15 | 0 | 0 | 100 % |
| 16. Exporter, importer | 3 | 1 | 0 | 88 % |
| 17. Plateformes | 7 | 2 | 0 | 89 % |
| 18. Carte mentale | 36 | 3 | 2 | 91 % |
| 19. Document à blocs | 1 | 0 | 24 | 4 % |
| **Total** | **319** | **13** | **28** | **90 %** |

Le compte se refait par `bun scripts/avancement.ts`, qui réécrit ce tableau.

---

## 1. Toile

| Fonctionnalité | État | Reste |
|---|---|---|
| Toile infinie, défilement à la molette et au trackpad | ✅ | |
| Attraper la toile (Espace + glisser, bouton du milieu) | ✅ | |
| Zoom molette et pincement, lissé, effleurement corrigé, inertie filtrée | ✅ | |
| Cmd+plus, Cmd+moins, Cmd+0 | ✅ | |
| Crans de zoom et Ajuster | ✅ | |
| Plein écran d'un élément (image, fichier, document, croquis) par adresse `/t/<tableau>/e/<élément>` | ✅ | Le retour du navigateur le referme ; l'adresse l'ouvre et le choisit ; Espace referme l'image ou le fichier. |
| Document borné (bord haut-gauche, marges de 50 × 40 UG), recentrage en dézoomant | ✅ | |
| Grille de points | ✅ | |
| Tailles de grille 8, 9, 10 px (Cmd+Maj+, et .) | ✅ | Réglage « Grille » (Cmd+,) ; le texte garde sa taille. |
| Clic, Maj+clic, Cmd+clic, clic droit qui choisit | ✅ | |
| Clic dans une sélection multiple qui la réduit au relâchement | ✅ | |
| Lasso, posé au relâchement | ✅ | Trait gris #8d929a, fond noir à 5 %. |
| Lasso qui prend une ligne par son trait | ✅ | |
| Cmd+A (dans la colonne active aussi) | ✅ | |
| Échap désélectionne | ✅ | |
| Glisser au pixel, soulèvement, inclinaison, dépose animée | ✅ | |
| Échap annule un glisser | ✅ | |
| Maj verrouille l'axe | ✅ | |
| Flèches : déplacer d'une UG (Maj : plus loin) | ✅ | |
| Redimensionner un élément (largeur, double-clic sur la poignée) | ✅ | La largeur suit le pointeur sans arrondi et rejoint la grille en douceur au relâchement. Planchers de Milanote : 4 pour image, fichier, nuancier, croquis, dessin ; 17 pour note, lien sans aperçu, lieu sans carte. |
| Hauteur bornée par la poignée (note, lien) | ✅ | |
| Redimensionner un groupe | ✅ | Une échelle par axe ; une poignée sur chaque élément choisi ; en fin de geste les éléments rejoignent la grille l'un après l'autre (30 % par image, 500 ms en tout), un zoom pendant le geste l'annule. |
| Pas de poignée de taille sur une liste de tâches, un tableau, un document, un clone | ✅ | `redimensionnable: false` dans le registre. |
| Proportions gardées pour les médias, Cmd pour les libérer, Échap pendant le geste | ✅ | |
| Collisions : ce qui grandit pousse ses voisins du dessous | ✅ | Édition, Cmd+Entrée, colonne qui reçoit ou perd un élément, note bornée qui se replie, lignes horizontales libres. |
| Entrer dans un tableau en le survolant pendant un glisser (700 ms puis 300 ms de clignement, 400 ms ensuite) | ✅ | |
| Curseurs adaptés (main, redimensionner, texte) | ✅ |  |
| Poignée de taille constante quel que soit le zoom, visible au survol | ✅ | |
| Défilement automatique au bord pendant un glisser ou un lasso | ✅ | |

## 2. Création

| Fonctionnalité | État | Reste |
|---|---|---|
| Barre de gauche dans l'ordre de Milanote, tiroir « Plus » | ✅ | D'une liste à l'autre (création, sélection, écriture) la barre glisse à ressort (raideur 300, amortissement 30). Reste : le délai de 100 ms avant de recomposer. |
| Glisser un outil sur la toile, fantôme et prise | ✅ | |
| Glisser un outil dans une colonne ou sur un tableau | ✅ | |
| Clic sur un outil : rebond et bulle d'aide | ✅ | |
| Double-clic sur le vide | ✅ | Un réglage (Cmd+,) ; il crée une note par défaut. |
| Cmd+Entrée : l'élément suivant (dessous, à droite, dans la colonne) | ✅ | |
| Note vide qui invite à écrire | ✅ | |
| Conversions en tapant : adresse → lien, `[] ` → tâches | ✅ | |
| Conversion d'un code couleur en nuancier | ✅ | Un « #rrggbb » collé devient un nuancier. |
| Coller des éléments copiés, décalés de 2 UG | ✅ | |
| Coller du texte, une adresse, une image hors édition | ✅ | La note collée s'ouvre en édition. |
| Déposer des images depuis le Finder | ✅ | |
| Déposer un fichier quelconque, plusieurs adresses, dans une colonne | ✅ |  |
| Non triés : bac latéral, Cmd+\, Alt+` | ✅ | |
| Tailles et couleurs de départ de chaque type | ✅ | |
| Modèles de tableaux | ✅ | Dix modèles, choisis avec un aperçu. |
| Sons et vibration à la création | ➖ | Pas de sons repris (salle blanche). |
| Création depuis le téléphone (notes rapides, partage vers Notak) | 🟡 | Notes rapides ; partage sur Android et Chrome ; sur iPhone, un Raccourci et un jeton personnel (page /envoyer), à essayer sur un vrai iPhone. |

## 3. Note et texte

| Fonctionnalité | État | Reste |
|---|---|---|
| Proportions : 34 UG, 58 px d'une ligne, marges 24 / 20 / 14 | ✅ | |
| Couleurs de fond, texte clair ou sombre selon le fond | ✅ | |
| Variante transparente, liseré au survol ; outil Titre | ✅ | |
| Clic sur une note choisie : édition au point cliqué | ✅ | |
| Entrée, Échap, clic ailleurs | ✅ | |
| Retour arrière dans une note vide : corbeille | ✅ | |
| Texte envoyé pendant l'écriture, un seul pas d'annulation | ✅ | |
| Texte écrit à plusieurs en même temps (curseurs dans la note) | ✅ | Notes et listes de tâches, titre de la liste compris. |
| Hauteur bornée, voile, étendue en édition | ✅ | |
| Styles : grand titre, titre, texte, petit texte, citation, code | ✅ | |
| Encadré à icône | ✅ |  |
| Gras, italique, barré, souligné, code en ligne, lien | ✅ | |
| Puces, liste numérotée | ✅ | |
| Retraits du texte (Tab, retrait + et −) | ✅ |  |
| Centrer | ✅ | |
| Couleurs du texte et surlignages, exclusifs | ✅ | |
| Menu d'insertion (émoji, séparateur, lien vers un tableau, mention) | ✅ | Émoji, séparateur ; « @ » et « [[ » en tapant. |
| Commentaire dans le texte | ✅ | Bouton « Commenter » ou ⌘⌥M sur un passage ; le fil s'affiche en marge. |
| Raccourcis de mise en forme de Milanote | ✅ |  |
| Markdown tapé : `*gras*`, `_italique_`, `~barré~`, `==surligné==`, `[t](url)`, `# `, `> `, `---` | ✅ | |
| Collage : tableau HTML en table, lignes à cases en tâches | ✅ |  |
| Adresse collée laissée en texte repéré | ✅ |  |
| Barre de couleur en haut de la note | ✅ |  |
| Couleur libre (hexadécimal), couleurs suggérées du tableau | ✅ |  |
| Couleur de texte propre à la note | ✅ |  |
| Légende sous la note | ✅ | Bouton « Légende » de « ••• » : ajoute ou retire la légende. |
| Paires fond + texte déjà employées, couleur du texte sous la grille du fond | ✅ | Remplace l'outil « Texte » de « ••• ». |
| Lien cliquable hors édition | ✅ | |
| Lecture seule : rien ne s'édite | ✅ | |
| Barre de mise en forme | ✅ | Posée sur la note, pas dans la barre de gauche (choix). |
| Mention d'une personne (@) | ✅ |  |
| Lien vers un tableau dans le texte | ✅ |  |
| Légende riche dans la carte (gras, lien, centrer) | ✅ | Texte riche avec sa barre dans la barre de gauche ; le texte brut d'avant se lit comme un texte riche. Les autres éléments à légende (image, lien) gardent un texte brut. |
| Extraction d'un passage en note (icône à tirer, Alt copie) | ✅ | Sur le tableau ou dans une colonne. |
| Aperçu de couleur dans le texte, note qui n'est qu'une couleur → nuancier | 🟡 | Nuancier : fait (Entrée et sortie de l'édition). Aperçu : pendant l'écriture seulement, la pastille ne se tire pas sur la toile. |
| Suggestion « Convertir en document » sur une note longue | ✅ | |
| Sélecteur d'émojis complet pour l'encadré et le menu d'insertion | ⬜ | L'icône de l'encadré défile parmi 8 ; le menu d'insertion n'a que 32 émojis. |
| Commentaire sur un passage : fil ouvert au clic hors édition | ✅ | |

## 4. Colonne

| Fonctionnalité | État | Reste |
|---|---|---|
| Largeur 34 UG au minimum, hauteur de 15 UG vide | ✅ | |
| Titre centré, 100 caractères, vide refusé, clic sur le titre d'une colonne choisie | ✅ | Titre initial vide avec une invite pâle ; Maj+Entrée passe à la ligne ; collage en texte brut. |
| Compteur sous le titre (« Vide » si rien), double-clic ou Alt+Entrée pour ajouter une note | ✅ | |
| Replier, déposer sur une colonne repliée | ✅ | |
| Ranger, sortir, réordonner par glisser, empreinte jusqu'au dépôt | ✅ | |
| Flèches et Cmd+A dans la colonne | ✅ | |
| Couleurs : dix teintes, fond libre (couleur personnalisée), couleurs déjà employées sur le tableau | ✅ | Le texte passe en blanc sur un fond sombre. |
| Raccourci de création ⌃⌘G (Ctrl+Alt+G), affiché dans l'infobulle de l'outil | ✅ | |
| Grouper la sélection en colonne (deux éléments au moins, colonne centrée, lignes attachées à la corbeille) | ✅ | |
| Convertir en tableau | ✅ | Les cartes entrent dans les non triés du tableau neuf, dans l'ordre de la colonne ; les lignes qui les relient ne suivent pas. |
| Supprimer emporte le contenu | ✅ | |
| Hauteur réglable, hauteur bornée d'un élément rangé | ✅ |  |
| Ligne horizontale entre deux colonnes alignées | ✅ |  |

## 5. Tableau imbriqué

| Fonctionnalité | État | Reste |
|---|---|---|
| Icône de 72 px, titre dessous, composition par type | ✅ | |
| Double-clic ouvre, Cmd+double-clic dans un onglet, Espace ouvre | ✅ | |
| Bulle « double-cliquer pour ouvrir » | ✅ | |
| Renommer par un clic sur le titre d'un tableau choisi | ✅ | |
| Couleur modifiable | ✅ | |
| Déposer sur un tableau pour l'y envoyer | ✅ | |
| Survol pendant un glisser : l'icône grossit, s'assombrit, clignote avant d'entrer | ✅ | |
| Icône (recherche par mot dans un catalogue de plus de 200 icônes, en français et en anglais) ou image à la place de l'initiale | ✅ | Le catalogue est tiré du jeu Tabler (MIT), pas de Milanote. |
| Couleur personnalisée, couleur du glyphe, paires de couleurs et couleurs déjà employées | ✅ | Le fond libre est celui de la carte, pas du tableau. |
| Pastille d'activité : « Nouveau » ou le nombre de changements depuis la dernière visite | 🟡 | Calculée sur cet appareil (empreinte de chaque élément, 400 au plus, 30 tableaux), pas par personne ni par le serveur ; « Nouveau » pour un tableau posé par un autre depuis moins de 14 jours et jamais ouvert ici. |
| Raccourci de création ⌃⌘B (Ctrl+Alt+B), affiché dans l'infobulle de l'outil | ✅ | |
| Disposition en ligne dans une colonne | ✅ |  |
| Raccourci vers un tableau (le même tableau à deux endroits) | ✅ |  |
| Un tableau supprimé part à la corbeille, restaurable | ✅ | |

## 6. Lien

| Fonctionnalité | État | Reste |
|---|---|---|
| Champ d'adresse, adresse invalide signalée | ✅ | Une ligne à icône d'état ; l'adresse se lit en quittant le champ ; échec : message gris 2 s puis adresse modifiable. |
| Aperçu : image, favicon, domaine, titre, description | ✅ | |
| Image d'aperçu à ses proportions | ✅ | Taille lue à la page ou au chargement, hauteur calée sur la grille, largeur plafonnée à la taille d'origine ; double-clic sur la poignée y revient. |
| Titre modifiable, légende | ✅ | |
| Ouvrir (en-tête, titre), copier l'adresse | ✅ | Double-clic sur l'aperçu en média seul : ouvre l'adresse. |
| Ajouter / Remplacer l'image d'aperçu (menu, dépôt d'une image sur l'aperçu) | 🟡 | Voile « Remplacer l'image » au survol d'un dépôt absent ; image déposée seulement (pas un élément image). |
| Taper un caractère sur un lien choisi : ouvre la légende | ✅ | |
| Fichier `.url` / `.webloc` déposé, adresse d'un tableau Notak collée | ✅ | Lien ; raccourci vers le tableau. |
| Retour à l'aperçu en fin de lecture (YouTube, Vimeo) ; bloqueur pendant le glisser ; aperçu seul en présentation | ✅ | |
| Hauteur bornée | ✅ | |
| Lecteurs intégrés (vidéo, audio, carte, contenus riches) | ✅ |  |
| Réglages d'affichage : aperçu, infos du lien (média seul), légende | ✅ | Légende en texte brut (pas de texte riche). |
| Lecture auto et en boucle d'une vidéo | ✅ |  |
| Adresse d'image changée en image | ✅ | Tout de suite, par rapatriement du fichier (route `/api/fichiers/rapatrier`) ; l'aperçu, s'il arrive avant, gagne. |
| Outils Vidéo, Audio et Carte dans le tiroir | ✅ |  |
| Message d'échec selon la cause | ✅ |  |

## 7. Image

| Fonctionnalité | État | Reste |
|---|---|---|
| Largeur de départ tirée de l'image, 4 UG au minimum | ✅ | |
| Visionneuse plein écran (double-clic, Espace, Entrée) | ✅ | Voile à 70 %, barre sombre (Dessiner, Modifier, Fond, précédente, suivante, ouvrir, télécharger), zoom de 1 à 4, flèches ; tant que l'image part, barre de 4 px et « Envoi de l'image… » dans la fenêtre. |
| Carte blanche, légende dedans (12 px, retrait de 24 px), masquée sous 8 UG | ✅ | Légende en texte brut, sans mise en forme. |
| Image rognée sur la grille (jamais étirée), carte 2 px plus petite que la grille | ✅ | « Rogner l'image sur la grille de points » décoche pour garder les proportions exactes. |
| Frappe directe sur une image choisie = début de sa légende ; Entrée l'ouvre | ✅ | |
| Outil Transparent, Dessiner dessus, Légende après l'arrangement | ✅ | Pivoter, Recadrer, Détourer restent dans « ••• ». |
| Télécharger l'image d'origine, Remplacer l'image | ✅ | |
| Pivoter vers la gauche, miroirs horizontal et vertical (à l'écran, après le quart de tour) | ✅ | |
| Redimensionner avec Cmd : cadrage libre (4 × 4 UG au moins, l'image recouvre le cadre), double-clic sur la poignée qui le retire | ✅ | |
| Palette de l'image (dix couleurs dominantes) dans les couleurs suggérées | ✅ | Lue à l'arrivée d'une image ; les images déjà posées n'en ont pas. |
| Ombre selon la transparence | ✅ |  |
| Miniature et roue pendant l'envoi | ✅ | |
| Tailles adaptées à l'affichage (400, 800, 1600 px) | ✅ |  |
| Hauteur calée sur la grille | ✅ |  |
| Recadrer, pivoter, détourer | ✅ | Détourer retire un fond uni, avec une tolérance ; l'original se rétablit. |
| Dessiner sur l'image (annotation, Maj+D) | ✅ |  |
| Remplacer en déposant une autre image dessus : filet puis voile « Remplacer l'image » après 500 ms | ✅ | Lâchée avant 500 ms, c'est une image de plus. |
| Image cassée signalée | ✅ | |
| Outil Image : le clic ouvre le panneau d'images, le glisser rebondit et la bulle invite à cliquer ; outil Envoyer : panneau d'envoi | ✅ | |

## 8. Liste de tâches

| Fonctionnalité | État | Reste |
|---|---|---|
| Cocher hors édition, Maj+clic coche les sous-tâches | ✅ | |
| Tâche faite grisée | ✅ | |
| Entrée, Tab, Maj+Tab, six niveaux | ✅ | |
| Retour arrière : fusion avec la tâche d'avant | ✅ | |
| Liste vidée à la corbeille au retour arrière | ✅ | |
| Titre facultatif ; première tâche vide changée en titre, `[] ` du titre en tâche | ✅ | |
| Corbeille de ligne (tâche cochée seulement, glisse après 0,5 s) | ✅ | |
| Lignes collées changées en tâches | ✅ | |
| Indication dans chaque tâche vide | ✅ | |
| Compteur, « Effacer les faites » | ✅ | En plus de Milanote. |
| Conversion d'une note `[] ` en liste | ✅ | |
| Case carrée | ➖ | Notak garde la case ronde. |
| Poignée à droite (trois traits) pour faire glisser une tâche (vers une autre liste, une colonne, la toile) | ✅ | Aperçu en carte de liste, niveau choisi par la case, trait au milieu du vide, Alt copie. Reste : glisser une liste entière sur une autre, sons. |
| Collage d'une liste HTML (Google Docs) | ✅ |  |
| Échéance d'une tâche : calendrier mensuel, heure, rappel (cloche), puces sous le texte, Cmd+Maj+1 | ✅ | Le rappel est enregistré ; aucune notification n'est envoyée. Reste : puce sélectionnée (anneau, F2). |
| Personne assignée (puce « @Nom »), recherche parmi les collaborateurs, Cmd+Maj+2 | ✅ | Reste : section « sans accès », notification. Étiquettes, réactions et commentaires par tâche : absents (passe commentaires). |
| Couleur de la liste : bande de 5 px, fond blanc | ✅ | |
| Entrée sur tâche vide ou en début de tâche ; Retour arrière devant une tâche vide | ✅ | |
| Cmd ou Alt + retour arrière : réduire une tâche vide | ✅ |  |
| Barre de gauche en édition (Couleur, Titre, Échéance, Assigner, Retrait, Commentaire ; Gras, Italique, Barré, Lien) | ✅ | Réaction et Étiquette par tâche à venir. |
| Bulles « Ajouter un titre ? » et « Supprimer les tâches terminées ? » | ✅ | |
| Titre dans le document ; Suppr, flèches de bord, Alt+Retour, copier-coller d'une tâche avec ses puces | ✅ | |

## 9. Ligne

| Fonctionnalité | État | Reste |
|---|---|---|
| Création par l'outil, Cmd+K relie la sélection | ✅ | |
| Zone de clic de 20 px ; glisser la ligne par son trait | ✅ | Les bouts libres suivent, ceux qui tiennent à un élément restent. |
| Accroche au centre d'un élément, arrêt à 1 px du bord | ✅ | |
| Mode dedans : point précis après 500 ms immobile, 8 repères, contour de la cible, élément verrouillé refusé | ✅ | |
| Courbe qui passe par la poignée, redressée près du milieu ou d'un double-clic | ✅ | |
| Bouts libres exacts, Maj pour 45°, aimant horizontal / vertical | ✅ | |
| Longueur minimale (4 UG à la pose), ligne masquée si trop courte | ✅ | |
| Pointes flèche (aussi large que longue) ou rien (bout arrondi) | ✅ | Plus de pointe ronde ni de trait en points. |
| Traits plein, tirets | ✅ | |
| Épaisseurs 1, 2, 4 suivant la grille ; palette, couleur libre, gris par défaut selon le thème | ✅ | |
| Libellé : étiquette, édition en place, masquer, frappe, glisser, texte collé | ✅ | |
| Poignées blanches de 8 px, taille constante au zoom, grises quand la ligne est verrouillée | ✅ | |
| Trait fantôme dans les éléments reliés | ✅ | |
| Outil de ligne rapide au coin d'un élément choisi | ✅ | Le point de 8 px grossit au survol ; l'élément paraît désélectionné pendant le tirage (visuellement : la poignée reste montée, la sélection ne change pas). |
| Aligner et répartir les lignes libres, coller le style entre lignes, copier une ligne seule | ✅ | |
| Ligne horizontale entre deux colonnes alignées | ✅ | Voir § 4. |
| Empilement : une ligne s'intercale avec les cartes selon l'ordre du plan | ✅ | Chaque ligne a son calque SVG, rangé entre les cartes ; les poignées vont dans un calque au-dessus de tout. |
| Défilement au bord pendant le tirage d'un bout ou de la courbe, courbe gardée à l'accroche | ✅ | Même vitesse que le glisser des cartes. |
| Surbrillance de recherche sur l'étiquette, masquage en présentation, variante tablette | ✅ | En présentation, une ligne reliée à un commentaire disparaît. Pointeur grossier : prises de 40 px. |
| Sons, présence des collaborateurs | 🟡 | Rien de tout cela sur les lignes. |

## 10. Autres éléments

| Fonctionnalité | État | Reste |
|---|---|---|
| Fichier joint : mode icône (feuille de 56 × 72 px, 10 UG), naît en icône sauf son et vidéo | ✅ | Dix-huit pictogrammes à nous (3D, polices, courriels, pages web, vecteur, photo brute, montage, maquette en plus des dix premiers), le contour de sélection suit la feuille. |
| Fichier joint : carte détaillée, aperçu de bord à bord, « Télécharger - Ouvrir - 1,2 MB » | ✅ | Aperçu : première page d'un PDF, image, vidéo ; « Aucun aperçu disponible » pour Word, Excel, PowerPoint, texte, code. |
| Fenêtre du fichier (PDF et texte dans le lecteur du navigateur, le reste en carte agrandie) | ✅ | |
| Barre du fichier : Mode, Aperçu, Renommer, Légende, Infos, Boucle, Lecture auto | ✅ | |
| Lecteurs audio et vidéo à nous (volume au survol, durée, cercle de lecture, plein écran, relances) | ✅ | |
| Fichiers refusés avec un message (extension, nom, taille de 25 Mio) | ✅ | Les 43 extensions de Milanote ; plafond unique, sans offre. |
| Fichier joint : aperçu d'un PDF dessiné dans le navigateur (pdf.js), état « Traitement » | ✅ | |
| Fichier joint : aperçus fabriqués par un service (Word, Excel, PowerPoint, polices, Photoshop…) | ⬜ | Pas de service d'aperçu : « Aucun aperçu disponible ». |
| Commentaire (fil de discussion posé sur la toile) | ✅ | Fiche bleu pâle de 34 unités, éditeur riche (gras, liens, mentions « @ », émojis), réaction par message, « est en train d'écrire », point non lu, défilement interne et hauteur réglable à la poignée, outils Couleur et Épingle (le fil se réduit en épingle). Pas de « Résoudre » (Milanote n'en a pas ; la donnée reste, l'interface la cache). Reste : « Nouveau commentaire » au clic droit de la toile, aperçu glissé réduit en épingle, brouillon non envoyé. |
| Croquis à main levée | ✅ |  |
| Table : un petit tableur (sélection de plages, clavier, types, formules, repères, clic droit, presse-papiers, titre, légende) | ✅ | Relevé dans `docs/ecarts/table.md`, repris d'après le code de Milanote le 23/10. Gras, italique, barré, lien, couleur et surlignage sur quelques mots d'une cellule de texte, filets mêlés au fond des cellules colorées, plus de plafond à 200 × 30. Pas de mention « @ » dans une cellule ; Milanote n'a pas de raccourci de création de table dans ce qu'on a lu. |
| Dessin libre sur la toile | ✅ | Outil « Dessin libre » du tiroir : on trace à même la toile, Entrée pose le dessin. |
| Nuancier (couleur, code, légende) | ✅ | Code en haut à gauche (HEX, RGB, HSL), édité sur place, redimensionnement libre, légende au nom de la couleur. Le double-clic ouvre le sélecteur de couleur du système, avec les couleurs du tableau en suggestions. |
| Document (texte long, ouvert en grand) | ✅ | Icône ou vue carte (34 unités, aperçu du texte), Renommer, légende, export PDF, Word, Markdown et texte brut. Outil Commentaire dans le texte (fils en marge, ⌘⌥M), colonne d'outils réduite en lecture seule. |
| Lien vidéo | ✅ | Outil « Vidéo » du tiroir. |
| Lien audio | ✅ | Outil « Audio » du tiroir. |
| Carte (lieu) | ✅ |  |
| Clone (le même élément à plusieurs endroits) | 🟡 | Suit l'original et le suit à la corbeille ; s'écrit sur place (le texte va à l'original) ; repère en bas à gauche, aussi sur l'original, dont un clic liste les copies (un clic sur une rangée la montre). Reste : un clone n'existe que sur le tableau de son original, donc pas de liste sur plusieurs tableaux. |
| Raccourci vers un tableau | 🟡 | Titre et couleur propres, créé à +6 / +5 UG ; « Retrouver le tableau d'origine » (le tableau qui le contient, la carte choisie et centrée) et « Dupliquer le tableau lié ». L'icône est copiée à la création, elle ne suit pas celle du tableau ; l'original n'est cherché que dans le tableau parent et le tableau ouvert. |

## 11. Commun aux éléments

| Fonctionnalité | État | Reste |
|---|---|---|
| Ombre légère, coins carrés | ✅ | |
| Contour choisi sans ombre, contour écarté en édition | ✅ | |
| Verrouiller | ✅ | |
| État « verrouillé » visible (autre couleur de contour) | ✅ |  |
| Étiquettes (créer, colorer, renommer, filtrer) | ✅ | Dans la carte ; panneau avec recherche qui crée, menu par ligne, étiquettes des autres tableaux (le chemin d'abord) à reprendre d'un clic ; pastille choisie : barre Couleur, Renommer, Retirer. Un renommage ou une couleur se répercute dans les autres tableaux chargés. Reste : suppression commune, étiquettes par tâche. |
| Réactions (émojis) | ✅ | Pastilles de Milanote avec info-bulle « qui a réagi » ; sélecteur Unicode complet (teinte de peau, fréquents), chargé à l'ouverture ; réaction par message d'un fil, avec son « + ». |
| Commentaire attaché à un élément | ✅ | Épingle aux couleurs du fil, à taille d'écran constante au zoom, qu'on déplace (sur la carte ou vers un autre élément) ; un fil glissé sur un élément s'y attache ; même éditeur que le fil posé. Commentaire en ligne : Détacher et Retirer. Reste : commentaire en ligne ouvert hors édition (passe note). |
| Échéance, personne assignée sur un élément | ✅ |  |
| Barre de couleur, couleur libre | ✅ | Notes (voir § 3). |
| Copier le style d'un élément (Cmd+Alt+V) | ✅ |  |
| Protéger par mot de passe | ✅ |  |
| Mode d'affichage (icône, détail) | ✅ | Cartes et colonnes ; un tableau est déjà une icône, une ligne n'a pas de corps à replier. |

## 12. Organiser

| Fonctionnalité | État | Reste |
|---|---|---|
| Corbeille du tableau : envoyer, remettre, vider | ✅ | |
| Lâcher sur la corbeille | ✅ | |
| Copier, couper, coller, dupliquer (Cmd+C, X, V, D) | ✅ | Couper masque sans corbeille et le collage déplace les mêmes éléments (ailleurs : copie puis retrait de l'original) ; un nouveau copier ou Cmd+Z les fait reparaître. Du texte collé sur une image en devient la légende. |
| Alt+glisser duplique | ✅ | Alt est lue au dépôt, comme chez Milanote. |
| Aligner (Alt+A, D, W, S, H, V) | ✅ | |
| Répartir (Cmd+Alt+Maj+H, V) | ✅ | |
| Aligner les centres sur la valeur commune | ✅ | |
| Premier plan, arrière-plan (Cmd+Maj+↑, ↓), d'un cran | ✅ | |
| Menu du clic droit, sur la toile et sur un élément | ✅ | Ordre de Milanote, coche à droite, création limitée à huit types, rien en lecture seule. Sous-menu « Changer l'arrière-plan » (cinq couleurs du canevas, couleur libre en direct, grille de points, retour au défaut, par tableau) ; métadonnées « Créé par… / Modifié par… » avec avatar (trace gardée dans le document partagé). |
| Grouper en colonne | ✅ | |
| Relier par une ligne (Cmd+K) | ✅ | |
| Envoyer dans un tableau, sur le fil d'Ariane | ✅ | |
| Annuler, rétablir (Cmd+Z, Cmd+Maj+Z, Cmd+Y) | ✅ | |
| Barre de sélection : outils communs seulement, menu « … » | ✅ | |
| Déplacer vers les non triés (Alt+`) | ✅ | |
| Sélectionner tout le tableau, désélectionner | ✅ | |

## 13. Naviguer

| Fonctionnalité | État | Reste |
|---|---|---|
| Accueil, tableaux imbriqués | ✅ | |
| Fil d'Ariane, dépôt dessus | ✅ | |
| Adresse par tableau, retour du navigateur, rechargement | ✅ | |
| Ouvrir dans un nouvel onglet | ✅ | |
| Titre du tableau modifiable dans l'en-tête | ✅ | |
| Vue gardée par tableau (position, zoom) | ✅ | |
| Fil d'Ariane : « … », largeurs, état de chargement | ✅ |  |
| Retour et avance au clavier (Ctrl+[, Ctrl+]) | ✅ | |
| Monter d'un niveau, redescendre (Cmd+U, Cmd+Maj+U) | ✅ | |
| Recherche (Cmd+F) : ce qui ne correspond pas s'efface, Entrée va au résultat suivant | ✅ | Dans le tableau ouvert, et dans tous les tableaux du compte par le serveur. |
| Tableaux récents, favoris | ✅ |  |
| Aperçu d'un tableau au survol | ✅ | Le plan du tableau, ses éléments à leur place et dans leur couleur. |
| Annuler la navigation (à l'échelle de la session) | ✅ | Quand le tableau n'a plus rien à annuler, Cmd+Z revient au tableau d'avant. |

## 14. À plusieurs

| Fonctionnalité | État | Reste |
|---|---|---|
| Comptes, connexion | ✅ | |
| Partager un tableau par adresse, invitation en attente | ✅ | |
| Rôles lecture, édition, propriétaire ; changés en direct | ✅ | |
| Partage hérité par les sous-tableaux | ✅ | |
| Présence : pastilles, curseurs, sélections des autres | ✅ | Pastille avec avatar et prénom qui pulse, et croix qui fait lâcher l'élément à l'autre (sauf croquis et document) ; un élément tenu par un autre ne se choisit ni ne s'édite. |
| Point d'activité non vue sur un élément modifié par un autre | ✅ | Zone de 19 px, infobulle immédiate (qui, depuis quand). Pointeurs de bord de vue vers les autres personnes et l'activité hors écran (clic : la vue s'y centre, effacés pendant un zoom). |
| Suggestion sous l'élément (« Convertir en document ? ») | ✅ | Mécanisme `suggestionSous` ; reste : copie synchronisée, titre et tâches terminées d'une liste. |
| Fusion des modifications sans conflit (Yjs) | ✅ | |
| Lecture seule | ✅ | |
| Pastilles plafonnées à 5 et « +N » | ✅ |  |
| Curseur des autres au repos | ✅ |  |
| Cache local, reprise après coupure | ✅ | Copie locale (IndexedDB), « Hors ligne » dans l'en-tête. |
| Texte écrit à plusieurs dans une même note | ✅ | Voir § 3. |
| Lien public, publication en lecture | ✅ |  |
| Mot de passe sur un tableau partagé | ✅ |  |
| Notifications (commentaires, mentions, modifications) | ✅ | Cloche dans l'en-tête ; pas de courriel ni de push. |
| Activité récente du tableau | ✅ |  |
| Commentaires, mentions, réactions | ✅ | Voir § 10 et § 11. |
| Mise en valeur de ce qu'un autre vient de modifier | ✅ |  |

## 15. Habillage

| Fonctionnalité | État | Reste |
|---|---|---|
| En-tête : fil d'Ariane, titre, partage, présence | ✅ | |
| Barre d'outils contextuelle | ✅ | Au-dessus de la sélection, ou dans la barre de gauche comme Milanote (réglage). |
| Annuler et rétablir dans l'en-tête | ✅ | |
| État d'enregistrement (« enregistré », « hors ligne ») | ✅ | |
| Thème sombre (Cmd+Maj+D) | ✅ | |
| Tailles d'interface (petite, moyenne, grande) | ✅ |  |
| Fenêtre des raccourcis (/) | ✅ | |
| Présentation (Cmd+Alt+P), mode focus sur un élément | ✅ |  |
| Aide, bulles de découverte, accueil d'un nouveau compte | ✅ |  |
| Réglages du compte (Cmd+,), photo, couleur | ✅ |  |
| Langues de l'interface | ✅ | Français et anglais, au choix dans les réglages ou d'après le navigateur ; un test vérifie que les deux dictionnaires ont les mêmes clés. Modèles, accueil d'un compte neuf, pages du téléphone, erreurs de l'API et export compris. |
| Avis en bas d'écran (toasts) avec annulation | ✅ | Corbeille et non triés (« Annuler »), envoi raté, déplacement dans un tableau (« Ouvrir »), Cmd+S, style collé. |
| Envoi de fichier : progression dans l'en-tête | ✅ |  |
| Cmd+S rassure (« déjà enregistré ») | ✅ | |
| Raccourci Échap sur les menus de la barre | ✅ |  |

## 16. Exporter, importer

| Fonctionnalité | État | Reste |
|---|---|---|
| Exporter un tableau (PDF, image) | ✅ | PNG et PDF, de ce qui est à l'écran ou du tableau entier. |
| Exporter le texte (Markdown, texte brut) | ✅ |  |
| Télécharger les médias d'un tableau (zip) | ✅ |  |
| Importer depuis Milanote | 🟡 | Depuis l'export Markdown (zip) de Milanote ; jamais essayé sur un vrai export. |

## 17. Plateformes

| Fonctionnalité | État | Reste |
|---|---|---|
| Web | ✅ | |
| Hors ligne complet (écrire sans réseau, rattraper au retour) | ✅ | IndexedDB pour les tableaux, service worker pour l'application. |
| Bureau (Tauri) | ✅ | Coque Tauri 2 (apps/bureau), compilée sur macOS ; à signer pour la diffuser. |
| iPhone | ✅ | Application web installable (manifeste, icône, hors ligne) et gestes tactiles. |
| Notes rapides sur le téléphone | ✅ | Page /rapide, vers les non triés de l'accueil. |
| Partager vers Notak depuis le téléphone | 🟡 | Android et Chrome ; iPhone par un Raccourci et un jeton personnel (`POST /api/arrivee`, éprouvé en local), le Raccourci reste à essayer sur un iPhone. Favori du bureau pour les autres navigateurs. |
| Gestes tactiles (pincer, toucher long) | ✅ | Pincer, un doigt sur le vide pour tirer la toile, appui long pour le menu. |
| Édition locale, sans compte ni serveur (notak.app) | ✅ | Propre à Notak : tableaux dans le navigateur, copies `.notak` (Cmd+S, Cmd+O), panneau « Où sont mes tableaux ? ». Sans aperçu de lien ni travail à plusieurs en direct (l'édition serveur les a). |
| Synchroniser avec un dossier (iCloud Drive, OneDrive, Dropbox) | 🟡 | Propre à Notak, expérimental : Chrome et Edge sur ordinateur ; le moteur est éprouvé contre un faux logiciel de synchro, reste à l'essayer sur de vrais nuages (docs/STOCKAGE.md). |

## 18. Carte mentale

Propre à Notak, d'après Xmind 26.05 : le comportement de référence est dans `docs/XMIND.md`.

| Fonctionnalité | État | Reste |
|---|---|---|
| Élément « Carte mentale » sur la toile, aperçu réduit, ouverture en grand | ✅ | Dans le tiroir « Plus » ; double-clic ou Entrée l'ouvre, l'adresse `/t/…/e/…` aussi. |
| Sujets enregistrés un par un (saisies simultanées sans perte), annuler et rétablir | 🟡 | Chaque geste ne réécrit que les sujets qu'il touche (`coeur/fusion.ts`) ; deux écritures vraiment simultanées sur la même carte restent au dernier arrivé (une clé Yjs). |
| Créer au clavier : enfant (Tab), frère (Entrée, Maj+Entrée), parent (Cmd+Entrée) | ✅ | Insert aussi ; titres « Sujet principal n », « Sous-sujet n » comme Xmind. |
| Éditer un titre (Espace, F2, frappe directe), sur plusieurs lignes | ✅ | Maj+Entrée va à la ligne ; un titre long passe à la ligne de lui-même. |
| Supprimer une branche, ou le sujet seul (Cmd+Retour arrière) ; dupliquer (Cmd+D) | ✅ |  |
| Naviguer aux flèches dans l'espace de la carte, étendre la sélection | ✅ | Maj+flèches et Maj+clic étendent la sélection. |
| Échanger avec un frère (Alt+Haut/Bas) | ✅ |  |
| Replier et déplier, tout replier, déplier jusqu'au niveau N | ✅ | Cmd+/, Cmd+Alt+/, Alt+Cmd+1…9 ; la pastille compte les sujets cachés et se clique. |
| Revenir au central (Cmd+R), afficher la branche seule (Cmd+;) | ✅ | Échap ou Cmd+; ramènent la carte entière. |
| Glisser un sujet pour le rattacher, l'insérer ou le détacher (Maj inverse) | ✅ | La cible se signale pendant le glisser (cadre du futur parent, trait d'insertion). |
| Sujet flottant | ✅ | Double-clic dans le vide ; il se glisse où l'on veut, ou se rattache. |
| Structure carte : équilibrée, non équilibrée, horaire, antihoraire | ✅ | Menu « Structure » de la carte ouverte ; non équilibrée : « À droite » règle le nombre de principaux à droite. |
| Structure logique et accolade | ✅ | À droite et à gauche. |
| Structure organigramme et arbre | ✅ | Organigramme vers le bas ou le haut, arbre à droite ou à gauche. |
| Structure chronologie | ✅ | Horizontale (branches alternées dessous, dessus) et verticale (alternées à droite, à gauche). |
| Structure arête de poisson | ✅ | Tête à gauche ou à droite. |
| Structure matrice | ✅ | En lignes ou en colonnes. |
| Structure par sujet, héritée par défaut | ✅ | « Suivre le sujet parent » la retire. |
| Carte compacte, placement libre, chevauchement | 🟡 | Compacte : des écarts plus serrés, sans l'emboîtement des branches de Xmind. Placement libre : une branche glissée reste où on la lâche, « Réaligner » la remet ; le chevauchement est alors permis. |
| Relation entre deux sujets : courbe réglable, pointes, titre | ✅ | Maj+Cmd+R puis clic sur la cible ; deux points de contrôle à tirer, un titre (double-clic) ; courbe, droite ou coudée, pointe au départ, à l'arrivée ou aux deux. |
| Limite autour d'une plage de frères | ✅ | Maj+Cmd+B ; un titre au double-clic. |
| Résumé d'une plage de frères | ✅ | Bouton « Résumé » : une accolade et un sujet de résumé, qui peut avoir ses enfants. |
| Note en texte riche sur un sujet | ✅ | Maj+Cmd+N ; l'icône sur le sujet rouvre la note. |
| Étiquettes | ✅ | Maj+Cmd+L. |
| Lien web ou vers un autre sujet | ✅ | Cmd+K ; l'icône ouvre l'adresse ou va au sujet. |
| Image sur un sujet | 🟡 | Maj+Cmd+I, depuis un fichier ; pas encore éprouvée à l'écran, ni de poignée pour la taille. |
| Marqueurs : priorité, avancement, drapeaux, étoiles, personnes… | ✅ | Un par groupe ; Cmd+1…7 pour les priorités. Dessins et icônes à nous. |
| Tâche à cocher, numérotation des enfants | ✅ | Cmd+Alt+T ; la case se coche d'un clic. Numérotation 1, I, A, a, avec ou sans le numéro du parent. |
| Rang : important, secondaire, barré | ✅ | Maj+Alt+1, 2, 3, 0. |
| Formes de sujet | ✅ | Rectangle, arrondi, gélule, ellipse, souligné, double souligné, losange, hexagone, parallélogramme, sans cadre. |
| Styles de branche, épaisseur, effilé, couleurs arc-en-ciel | ✅ | Courbe, droite, coudée, coudée arrondie, sans trait ; motif plein, tirets, pointillés ; « Branches de couleur » ou une seule encre. |
| Texte, remplissage et bordure d'un sujet | ✅ | Police, taille, gras, italique, couleur ; l'encre du texte se choisit seule sur un remplissage foncé. |
| Thèmes de carte | ✅ | Six thèmes à nous : Classique (suit le clair et le sombre de Notak), Pastel, Nuit, Sobre, Papier, Vif. |
| Appliquer au même rang, réinitialiser, copier et coller un style | ✅ | Alt+Cmd+U, Cmd+Alt+0, Cmd+Alt+C, Cmd+Alt+V. |
| Mode plan | ✅ | Maj+Cmd+M ou « Plan » : Entrée, Tab, Maj+Tab, Alt+flèches, Cmd+/ ; Échap revient à la carte. |
| Mode Zen | ✅ | Cmd+Alt+F : la carte seule, en plein écran quand le navigateur le permet ; Échap en sort. |
| Présentation branche par branche | ✅ | Cmd+Alt+P : le central, puis chaque principal avec sa branche ; le cadrage glisse de l'une à l'autre. |
| Chercher dans la carte | ✅ | Cmd+F : titres, étiquettes et notes, sans accents ; Entrée va au suivant. |
| Importer un fichier .xmind | ⬜ |  |
| Exporter en .xmind | ⬜ |  |
| Texte de la carte dans la recherche et l'export texte du tableau | ✅ | L'export la rend en liste indentée. |
| Grille, tableau-arbre | ➖ | Écartés (docs/XMIND.md § 2). |
| Gantt, IA, commentaires et collaboration propres à Xmind, note audio, vidéo web | ➖ | Écartés (docs/XMIND.md § 6). |

## 19. Document à blocs

Propre à Notak, d'après Notion 7.24 : le comportement de référence est dans `docs/NOTION.md`. Le moteur vit
dans `packages/tableau/src/blocs/`, pour resservir à d'autres éléments.

| Fonctionnalité | État | Reste |
|---|---|---|
| Un id stable sur chaque bloc, le document relu comme des enregistrements de blocs | ⬜ |  |
| Un vieux client ouvre un bloc inconnu en lecture seule, sans rien perdre | ✅ | Le texte se dessine réduit à ce qu’il connaît, un avis dit pourquoi (`blocs/lisible.ts`). |
| Titres 1 à 3, titres dépliants | ⬜ |  |
| Listes à puces, numérotées (1, a, i selon la profondeur), tâches | ⬜ |  |
| Dépliant | ⬜ |  |
| Citation, encadré avec icône, séparateur | ⬜ |  |
| Code avec langage, bouton Copier, retour à la ligne | ⬜ |  |
| Image avec largeur, alignement et légende | ⬜ |  |
| Aperçu de lien | ⬜ |  |
| Menu « / » : filtre par mots-clés, catégories, couleurs et actions | ⬜ |  |
| Raccourcis markdown en début de bloc et en ligne | ⬜ |  |
| Remplacements typographiques (→, —, …, ≥, guillemets) | ⬜ |  |
| Transformer en (⌘/, ⌘⌥0…8) | ⬜ |  |
| Couleur de texte et de fond, sur un bloc ou un passage | ⬜ |  |
| Bulle de mise en forme sur une sélection | ⬜ |  |
| Poignée ⋮⋮ et bouton + au survol, menu de bloc filtrable | ⬜ |  |
| Sélection de blocs : Échap, Maj+flèches, Maj+clic, rectangle | ⬜ |  |
| Supprimer, dupliquer (⌘D), monter et descendre (⌘⇧↑/↓), imbriquer (Tab) | ⬜ |  |
| Glisser un bloc ou une sélection, ⌥ copie | ⬜ |  |
| Colonnes : dépôt sur le côté, 2 à 5, largeurs aimantées, dissolution | ⬜ |  |
| Copier le lien d'un bloc, l'adresse amène au bloc | ⬜ |  |
| Icône et couverture de la page | ⬜ |  |
| Police, petit texte, pleine largeur | ⬜ |  |
| Document écrit à plusieurs en direct, curseurs des autres | ⬜ |  |
| Document dans la recherche du serveur et l'export texte du tableau | ⬜ |  |
| Bases de données, sous-pages, blocs synchronisés, bouton, équation, onglets | ➖ | Écartés pour l'instant (docs/NOTION.md § 2). |
| Verrouillage, table des matières flottante, historique de page | ➖ | Écartés (docs/NOTION.md § 9). |
