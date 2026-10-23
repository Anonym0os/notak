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
| 1. Toile | 27 | 0 | 0 | 100 % |
| 2. Création | 16 | 1 | 0 | 97 % |
| 3. Note et texte | 31 | 0 | 0 | 100 % |
| 4. Colonne | 11 | 0 | 0 | 100 % |
| 5. Tableau imbriqué | 11 | 0 | 0 | 100 % |
| 6. Lien | 13 | 0 | 0 | 100 % |
| 7. Image | 12 | 0 | 0 | 100 % |
| 8. Liste de tâches | 17 | 0 | 0 | 100 % |
| 9. Ligne | 14 | 0 | 0 | 100 % |
| 10. Autres éléments | 12 | 0 | 0 | 100 % |
| 11. Commun aux éléments | 12 | 0 | 0 | 100 % |
| 12. Organiser | 16 | 0 | 0 | 100 % |
| 13. Naviguer | 13 | 0 | 0 | 100 % |
| 14. À plusieurs | 17 | 0 | 0 | 100 % |
| 15. Habillage | 15 | 0 | 0 | 100 % |
| 16. Exporter, importer | 3 | 1 | 0 | 88 % |
| 17. Plateformes | 6 | 1 | 0 | 93 % |
| **Total** | **246** | **3** | **0** | **99 %** |

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
| Document borné (bord haut-gauche, marges de 50 × 40 UG), recentrage en dézoomant | ✅ | |
| Grille de points | ✅ | |
| Tailles de grille 8, 9, 10 px (Cmd+Maj+, et .) | ✅ | Réglage « Grille » (Cmd+,) ; le texte garde sa taille. |
| Clic, Maj+clic, Cmd+clic, clic droit qui choisit | ✅ | |
| Clic dans une sélection multiple qui la réduit au relâchement | ✅ | |
| Lasso, posé au relâchement | ✅ | |
| Lasso qui prend une ligne par son trait | ✅ | |
| Cmd+A (dans la colonne active aussi) | ✅ | |
| Échap désélectionne | ✅ | |
| Glisser au pixel, soulèvement, inclinaison, dépose animée | ✅ | |
| Échap annule un glisser | ✅ | |
| Maj verrouille l'axe | ✅ | |
| Flèches : déplacer d'une UG (Maj : plus loin) | ✅ | |
| Redimensionner un élément (largeur, double-clic sur la poignée) | ✅ | |
| Hauteur bornée par la poignée (note, lien) | ✅ | |
| Redimensionner un groupe | ✅ | |
| Proportions gardées pour les médias, Cmd pour les libérer, Échap pendant le geste | ✅ | |
| Collisions : ce qui grandit pousse ses voisins du dessous | ✅ | Édition, Cmd+Entrée, colonne qui reçoit ou perd un élément, note bornée qui se replie, lignes horizontales libres. |
| Entrer dans un tableau en le survolant pendant un glisser (700 ms puis 300 ms de clignement, 400 ms ensuite) | ✅ | |
| Curseurs adaptés (main, redimensionner, texte) | ✅ |  |
| Poignée de taille constante quel que soit le zoom, visible au survol | ✅ | |
| Défilement automatique au bord pendant un glisser ou un lasso | ✅ | |

## 2. Création

| Fonctionnalité | État | Reste |
|---|---|---|
| Barre de gauche dans l'ordre de Milanote, tiroir « Plus » | ✅ | |
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
| Création depuis le téléphone (notes rapides, partage vers Notak) | 🟡 | Notes rapides ; le partage marche sur Android et Chrome, pas sur iOS Safari. |

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
| Texte écrit à plusieurs en même temps (curseurs dans la note) | ✅ | Notes et listes de tâches ; le titre d'une liste reste un champ simple. |
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
| Légende sous la note | ✅ |  |
| Lien cliquable hors édition | ✅ | |
| Lecture seule : rien ne s'édite | ✅ | |
| Barre de mise en forme | ✅ | Posée sur la note, pas dans la barre de gauche (choix). |
| Mention d'une personne (@) | ✅ |  |
| Lien vers un tableau dans le texte | ✅ |  |

## 4. Colonne

| Fonctionnalité | État | Reste |
|---|---|---|
| Largeur 34 UG au minimum, hauteur de 15 UG vide | ✅ | |
| Titre centré, 100 caractères, vide refusé, clic sur une colonne choisie | ✅ | |
| Composition par type sous la liste | ✅ | |
| Replier, déposer sur une colonne repliée | ✅ | |
| Ranger, sortir, réordonner par glisser, empreinte jusqu'au dépôt | ✅ | |
| Flèches et Cmd+A dans la colonne | ✅ | |
| Couleurs | ✅ | |
| Grouper la sélection en colonne | ✅ | |
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
| Icône de la bibliothèque ou image à la place de l'initiale | ✅ |  |
| Disposition en ligne dans une colonne | ✅ |  |
| Raccourci vers un tableau (le même tableau à deux endroits) | ✅ |  |
| Un tableau supprimé part à la corbeille, restaurable | ✅ | |

## 6. Lien

| Fonctionnalité | État | Reste |
|---|---|---|
| Champ d'adresse, adresse invalide signalée | ✅ | |
| Aperçu : image, favicon, domaine, titre, description | ✅ | |
| Image d'aperçu à ses proportions | ✅ | |
| Titre modifiable, légende | ✅ | |
| Outil « Adresse » | ✅ | |
| Ouvrir, copier l'adresse | ✅ | |
| Hauteur bornée | ✅ | |
| Lecteurs intégrés (vidéo, audio, carte, contenus riches) | ✅ |  |
| Réglages d'affichage : aperçu, infos, légende | ✅ |  |
| Lecture auto et en boucle d'une vidéo | ✅ |  |
| Adresse d'image changée en image | ✅ |  |
| Outils Vidéo, Audio et Carte dans le tiroir | ✅ |  |
| Message d'échec selon la cause | ✅ |  |

## 7. Image

| Fonctionnalité | État | Reste |
|---|---|---|
| Largeur de départ tirée de l'image, 4 UG au minimum | ✅ | |
| Visionneuse plein écran (double-clic, Espace) | ✅ | |
| Légende | ✅ |  |
| Ombre selon la transparence | ✅ |  |
| Miniature et roue pendant l'envoi | ✅ | |
| Tailles adaptées à l'affichage (400, 800, 1600 px) | ✅ |  |
| Hauteur calée sur la grille | ✅ |  |
| Recadrer, pivoter, détourer | ✅ | Détourer retire un fond uni, avec une tolérance ; l'original se rétablit. |
| Dessiner sur l'image (annotation, Maj+D) | ✅ |  |
| Remplacer en déposant une autre image dessus | ✅ |  |
| Image cassée signalée | ✅ | |
| Outils Image et Fichier : choisir dans le Finder, au clic ou en glissant l'outil | ✅ | |

## 8. Liste de tâches

| Fonctionnalité | État | Reste |
|---|---|---|
| Cocher hors édition, Maj+clic coche les sous-tâches | ✅ | |
| Tâche faite grisée | ✅ | |
| Entrée, Tab, Maj+Tab, six niveaux | ✅ | |
| Retour arrière : fusion avec la tâche d'avant | ✅ | |
| Liste vidée à la corbeille au retour arrière | ✅ | |
| Titre facultatif ; première tâche vide changée en titre, `[] ` du titre en tâche | ✅ | |
| Croix de suppression au survol | ✅ | |
| Lignes collées changées en tâches | ✅ | |
| Indication de liste vide | ✅ | |
| Compteur, « Effacer les faites » | ✅ | En plus de Milanote. |
| Conversion d'une note `[] ` en liste | ✅ | |
| Case carrée | ➖ | Notak garde la case ronde. |
| Poignée pour faire glisser une tâche (vers une autre liste, la toile) | ✅ | Hors édition. |
| Collage d'une liste HTML (Google Docs) | ✅ |  |
| Échéance d'une tâche | ✅ |  |
| Personne assignée | ✅ |  |
| Couleur de la liste | ✅ |  |
| Cmd ou Alt + retour arrière : réduire une tâche vide | ✅ |  |

## 9. Ligne

| Fonctionnalité | État | Reste |
|---|---|---|
| Création par l'outil, Cmd+K relie la sélection | ✅ | |
| Zone de clic de 20 px | ✅ | |
| Accroche au centre d'un élément, arrêt au bord | ✅ | |
| Accroche à un point précis de l'élément | ✅ |  |
| Courbe par le point de contrôle, redressée près du milieu | ✅ | |
| Maj pour 45° | ✅ | |
| Longueur minimale selon les flèches | ✅ | |
| Pointes flèche, rond, rien | ✅ | |
| Traits plein, tirets, points | ✅ |  |
| Épaisseurs 1, 2, 4 ; couleurs | ✅ | |
| Libellé | ✅ | |
| Poignées rondes à anneau | ✅ |  |
| Outil de ligne rapide au coin d'un élément choisi | ✅ |  |
| Ligne horizontale entre deux colonnes alignées | ✅ | Voir § 9. |

## 10. Autres éléments

| Fonctionnalité | État | Reste |
|---|---|---|
| Fichier joint : extension, nom, taille, Télécharger, Ouvrir, lecteur du son et de la vidéo, renommer | ✅ | Aperçu de la première page d'un PDF, légende, mode icône. |
| Commentaire (fil de discussion posé sur la toile) | ✅ |  |
| Table (lignes, colonnes, cellules) | ✅ |  |
| Croquis à main levée | ✅ |  |
| Dessin libre sur la toile | ✅ | Outil « Dessin libre » du tiroir : on trace à même la toile, Entrée pose le dessin. |
| Nuancier (couleur, code, pipette) | ✅ |  |
| Document (texte long, ouvert en grand) | ✅ |  |
| Lien vidéo | ✅ | Outil « Vidéo » du tiroir. |
| Lien audio | ✅ | Outil « Audio » du tiroir. |
| Carte (lieu) | ✅ |  |
| Clone (le même élément à plusieurs endroits) | ✅ | Suit l'original et le suit à la corbeille, comme le laissent voir les indices de Milanote ; se détache. |
| Raccourci vers un tableau | ✅ |  |

## 11. Commun aux éléments

| Fonctionnalité | État | Reste |
|---|---|---|
| Ombre légère, coins carrés | ✅ | |
| Contour choisi sans ombre, contour écarté en édition | ✅ | |
| Verrouiller | ✅ | |
| État « verrouillé » visible (autre couleur de contour) | ✅ |  |
| Étiquettes (créer, colorer, renommer, filtrer) | ✅ |  |
| Réactions (émojis) | ✅ |  |
| Commentaire attaché à un élément | ✅ |  |
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
| Copier, couper, coller, dupliquer (Cmd+C, X, V, D) | ✅ | |
| Alt+glisser duplique | ✅ | |
| Aligner (Alt+A, D, W, S, H, V) | ✅ | |
| Répartir (Cmd+Alt+Maj+H, V) | ✅ | |
| Aligner les centres sur la valeur commune | ✅ | |
| Premier plan, arrière-plan (Cmd+Maj+↑, ↓), d'un cran | ✅ | |
| Menu du clic droit, sur la toile et sur un élément | ✅ | |
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
| Présence : pastilles, curseurs, sélections des autres | ✅ | |
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
| Langues de l'interface | ✅ | Français et anglais, au choix dans les réglages ou d'après le navigateur ; un test vérifie que les deux dictionnaires ont les mêmes clés. Les modèles de tableau et les bulles de découverte restent en français. |
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
| Partager vers Notak depuis le téléphone | 🟡 | Android et Chrome ; iOS Safari ne reçoit pas les partages des sites. |
| Gestes tactiles (pincer, toucher long) | ✅ | Pincer, un doigt sur le vide pour tirer la toile, appui long pour le menu. |
