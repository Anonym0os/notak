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
| 1. Toile | 16 | 5 | 6 | 69 % |
| 2. Création | 10 | 3 | 4 | 68 % |
| 3. Note et texte | 17 | 2 | 12 | 58 % |
| 4. Colonne | 9 | 0 | 2 | 82 % |
| 5. Tableau imbriqué | 8 | 0 | 3 | 73 % |
| 6. Lien | 7 | 2 | 4 | 62 % |
| 7. Image | 4 | 2 | 6 | 42 % |
| 8. Liste de tâches | 11 | 0 | 6 | 65 % |
| 9. Ligne | 9 | 2 | 3 | 71 % |
| 10. Autres éléments | 0 | 1 | 11 | 4 % |
| 11. Commun aux éléments | 3 | 1 | 8 | 29 % |
| 12. Organiser | 13 | 1 | 2 | 84 % |
| 13. Naviguer | 6 | 3 | 4 | 58 % |
| 14. À plusieurs | 7 | 3 | 7 | 50 % |
| 15. Habillage | 1 | 3 | 11 | 17 % |
| 16. Exporter, importer | 0 | 0 | 4 | 0 % |
| 17. Plateformes | 1 | 1 | 5 | 21 % |
| **Total** | **122** | **29** | **98** | **55 %** |

Le compte se refait par `bun scripts/avancement.ts`, qui réécrit ce tableau.

---

## 1. Toile

| Fonctionnalité | État | Reste |
|---|---|---|
| Toile infinie, défilement à la molette et au trackpad | ✅ | |
| Attraper la toile (Espace + glisser, bouton du milieu) | 🟡 | Main fermée au bouton du milieu. |
| Zoom molette et pincement, lissé, effleurement corrigé, inertie filtrée | ✅ | |
| Cmd+plus, Cmd+moins, Cmd+0 | ✅ | |
| Crans de zoom et Ajuster | 🟡 | Crans du bas 73, 57, 47 % ; marges d'Ajuster ; retour à 100 %. |
| Document borné (bord haut-gauche, marges de 50 × 40 UG), recentrage en dézoomant | ⬜ | |
| Grille de points | 🟡 | Fondu de 0,6 s à l'apparition. |
| Tailles de grille 8, 9, 10 px (Cmd+Maj+, et .) | ⬜ | Notak fixe 10 px. |
| Clic, Maj+clic, Cmd+clic, clic droit qui choisit | ✅ | |
| Clic dans une sélection multiple qui la réduit au relâchement | ✅ | |
| Lasso, posé au relâchement | ✅ | |
| Lasso qui prend une ligne par son trait | ⬜ | Une ligne est prise par sa boîte. |
| Cmd+A (dans la colonne active aussi) | ✅ | |
| Échap désélectionne | ✅ | |
| Glisser au pixel, soulèvement, inclinaison, dépose animée | ✅ | |
| Échap annule un glisser | ✅ | |
| Maj verrouille l'axe | 🟡 | Bascule à 50 px, pas au double. |
| Flèches : déplacer d'une UG (Maj : plus loin) | ✅ | |
| Redimensionner un élément (largeur, double-clic sur la poignée) | ✅ | |
| Hauteur bornée par la poignée (note, lien) | ✅ | |
| Redimensionner un groupe | ⬜ | |
| Proportions gardées pour les médias, Cmd pour les libérer, Échap pendant le geste | ⬜ | |
| Collisions : ce qui grandit pousse ses voisins du dessous | ⬜ | |
| Entrer dans un tableau en le survolant pendant un glisser (700 ms puis 300 ms de clignement, 400 ms ensuite) | ✅ | |
| Curseurs adaptés (main, redimensionner, texte) | 🟡 | Curseur au repos des autres. |
| Poignée de taille constante quel que soit le zoom, visible au survol | ✅ | |
| Défilement automatique au bord pendant un glisser ou un lasso | ✅ | |

## 2. Création

| Fonctionnalité | État | Reste |
|---|---|---|
| Barre de gauche dans l'ordre de Milanote, tiroir « Plus » | ✅ | |
| Glisser un outil sur la toile, fantôme et prise | ✅ | |
| Glisser un outil dans une colonne ou sur un tableau | ✅ | |
| Clic sur un outil : rebond et bulle d'aide | ✅ | |
| Double-clic sur le vide | 🟡 | Notak crée toujours une note ; Milanote en fait un réglage éteint. |
| Cmd+Entrée : l'élément suivant (dessous, à droite, dans la colonne) | ✅ | |
| Note vide qui invite à écrire | ✅ | |
| Conversions en tapant : adresse → lien, `[] ` → tâches | ✅ | |
| Conversion d'un code couleur en nuancier | ⬜ | Attend le nuancier (§ 10). |
| Coller des éléments copiés, décalés de 2 UG | ✅ | |
| Coller du texte, une adresse, une image hors édition | 🟡 | N'arrive pas dans les non triés ; la note collée n'est pas éditée. |
| Déposer des images depuis le Finder | ✅ | |
| Déposer un fichier quelconque, plusieurs adresses, dans une colonne | 🟡 | Les fichiers se posent sur la toile, pas encore dans la colonne visée ; une seule adresse est gardée. |
| Non triés : bac latéral, Cmd+\, Alt+` | ⬜ | |
| Tailles et couleurs de départ de chaque type | ✅ | |
| Modèles de tableaux | ⬜ | |
| Sons et vibration à la création | ➖ | Pas de sons repris (salle blanche). |
| Création depuis le téléphone (notes rapides, partage vers Notak) | ⬜ | Attend l'iPhone (§ 17). |

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
| Texte écrit à plusieurs en même temps (curseurs dans la note) | ⬜ | `Y.XmlFragment`, Tiptap Collaboration. |
| Hauteur bornée, voile, étendue en édition | ✅ | |
| Styles : grand titre, titre, texte, petit texte, citation, code | ✅ | |
| Encadré à icône | ⬜ | |
| Gras, italique, barré, souligné, code en ligne, lien | ✅ | |
| Puces, liste numérotée | ✅ | |
| Retraits du texte (Tab, retrait + et −) | ⬜ | Seules les listes descendent. |
| Centrer | ✅ | |
| Couleurs du texte et surlignages, exclusifs | ✅ | |
| Menu d'insertion (émoji, séparateur, lien vers un tableau, mention) | ⬜ | Le séparateur se tape `---`. |
| Commentaire dans le texte | ⬜ | |
| Raccourcis de mise en forme de Milanote | 🟡 | Manquent Maj+F3 (casse), Cmd+Maj+6 (encadré), Tab. |
| Markdown tapé : `*gras*`, `_italique_`, `~barré~`, `==surligné==`, `[t](url)`, `# `, `> `, `---` | ✅ | |
| Collage : tableau HTML en table, lignes à cases en tâches | ⬜ | |
| Adresse collée laissée en texte repéré | 🟡 | Tiptap la change en lien. |
| Barre de couleur en haut de la note | ⬜ | |
| Couleur libre (hexadécimal), couleurs suggérées du tableau | ⬜ | |
| Couleur de texte propre à la note | ⬜ | |
| Légende sous la note | ⬜ | |
| Lien cliquable hors édition | ✅ | |
| Lecture seule : rien ne s'édite | ✅ | |
| Barre de mise en forme | ✅ | Posée sur la note, pas dans la barre de gauche (choix). |
| Mention d'une personne (@) | ⬜ | |
| Lien vers un tableau dans le texte | ⬜ | |

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
| Hauteur réglable, hauteur bornée d'un élément rangé | ⬜ | |
| Ligne horizontale entre deux colonnes alignées | ⬜ | |

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
| Icône de la bibliothèque ou image à la place de l'initiale | ⬜ | |
| Disposition en ligne dans une colonne | ⬜ | |
| Raccourci vers un tableau (le même tableau à deux endroits) | ⬜ | Élément « alias » de Milanote. |
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
| Lecteurs intégrés (vidéo, audio, carte, contenus riches) | 🟡 | YouTube et Vimeo seulement. |
| Réglages d'affichage : aperçu, infos, légende | ⬜ | |
| Lecture auto et en boucle d'une vidéo | ⬜ | |
| Adresse d'image changée en image | ⬜ | Il faut d'abord rapatrier le fichier. |
| Outils Vidéo, Audio et Carte dans le tiroir | ⬜ | |
| Message d'échec selon la cause | 🟡 | L'adresse sert de titre. |

## 7. Image

| Fonctionnalité | État | Reste |
|---|---|---|
| Largeur de départ tirée de l'image, 4 UG au minimum | ✅ | |
| Visionneuse plein écran (double-clic, Espace) | ✅ | |
| Légende | 🟡 | Texte brut, hors de la carte ; pas de saisie directe. |
| Ombre selon la transparence | 🟡 | Devinée au type de fichier, pas lue dans l'image. |
| Miniature et roue pendant l'envoi | ⬜ | L'image n'apparaît qu'une fois envoyée. |
| Tailles adaptées à l'affichage (400, 800, 1600 px) | ⬜ | |
| Hauteur calée sur la grille | ⬜ | |
| Recadrer, pivoter, détourer | ⬜ | |
| Dessiner sur l'image (annotation, Maj+D) | ⬜ | |
| Remplacer en déposant une autre image dessus | ⬜ | |
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
| Poignée pour faire glisser une tâche (vers une autre liste, la toile) | ⬜ | |
| Collage d'une liste HTML (Google Docs) | ⬜ | |
| Échéance d'une tâche | ⬜ | |
| Personne assignée | ⬜ | |
| Couleur de la liste | ⬜ | |
| Cmd ou Alt + retour arrière : réduire une tâche vide | ⬜ | |

## 9. Ligne

| Fonctionnalité | État | Reste |
|---|---|---|
| Création par l'outil, Cmd+K relie la sélection | ✅ | |
| Zone de clic de 20 px | ✅ | |
| Accroche au centre d'un élément, arrêt au bord | ✅ | |
| Accroche à un point précis de l'élément | ⬜ | |
| Courbe par le point de contrôle, redressée près du milieu | ✅ | |
| Maj pour 45° | ✅ | |
| Longueur minimale selon les flèches | ✅ | |
| Pointes flèche, rond, rien | ✅ | |
| Traits plein, tirets, points | 🟡 | Les points ne se choisissent pas. |
| Épaisseurs 1, 2, 4 ; couleurs | ✅ | |
| Libellé | ✅ | |
| Poignées rondes à anneau | 🟡 | Carrés. |
| Outil de ligne rapide au coin d'un élément choisi | ⬜ | |
| Ligne horizontale entre deux colonnes alignées | ⬜ | Voir § 4. |

## 10. Autres éléments

| Fonctionnalité | État | Reste |
|---|---|---|
| Fichier joint : extension, nom, taille, Télécharger, Ouvrir, lecteur du son et de la vidéo, renommer | 🟡 | Pas d'aperçu des pages d'un PDF, de légende ni de mode icône ; rien à l'écran pendant l'envoi. |
| Commentaire (fil de discussion posé sur la toile) | ⬜ | |
| Table (lignes, colonnes, cellules) | ⬜ | |
| Croquis à main levée | ⬜ | |
| Dessin libre sur la toile | ⬜ | |
| Nuancier (couleur, code, pipette) | ⬜ | |
| Document (texte long, ouvert en grand) | ⬜ | |
| Lien vidéo | ⬜ | Le lien YouTube existe (§ 6), pas l'outil. |
| Lien audio | ⬜ | |
| Carte (lieu) | ⬜ | |
| Clone (le même élément à plusieurs endroits) | ⬜ | |
| Raccourci vers un tableau | ⬜ | Compté aussi au § 5. |

## 11. Commun aux éléments

| Fonctionnalité | État | Reste |
|---|---|---|
| Ombre légère, coins carrés | ✅ | |
| Contour choisi sans ombre, contour écarté en édition | ✅ | |
| Verrouiller | ✅ | |
| État « verrouillé » visible (autre couleur de contour) | 🟡 | Le verrou existe ; son contour propre, non. |
| Étiquettes (créer, colorer, renommer, filtrer) | ⬜ | |
| Réactions (émojis) | ⬜ | |
| Commentaire attaché à un élément | ⬜ | |
| Échéance, personne assignée sur un élément | ⬜ | |
| Barre de couleur, couleur libre | ⬜ | Voir § 3. |
| Copier le style d'un élément (Cmd+Alt+V) | ⬜ | |
| Protéger par mot de passe | ⬜ | |
| Mode d'affichage (icône, détail) | ⬜ | |

## 12. Organiser

| Fonctionnalité | État | Reste |
|---|---|---|
| Corbeille du tableau : envoyer, remettre, vider | ✅ | |
| Lâcher sur la corbeille | ✅ | |
| Copier, couper, coller, dupliquer (Cmd+C, X, V, D) | ✅ | |
| Alt+glisser duplique | ✅ | |
| Aligner (Alt+A, D, W, S, H, V) | ✅ | |
| Répartir (Cmd+Alt+Maj+H, V) | ✅ | |
| Aligner les centres sur la valeur commune | 🟡 | Notak prend le centre du cadre. |
| Premier plan, arrière-plan (Cmd+Maj+↑, ↓), d'un cran | ✅ | |
| Menu du clic droit, sur la toile et sur un élément | ✅ | |
| Grouper en colonne | ✅ | |
| Relier par une ligne (Cmd+K) | ✅ | |
| Envoyer dans un tableau, sur le fil d'Ariane | ✅ | |
| Annuler, rétablir (Cmd+Z, Cmd+Maj+Z, Cmd+Y) | ✅ | |
| Barre de sélection : outils communs seulement, menu « … » | ⬜ | Une sélection mêlée empile les outils de chaque type. |
| Déplacer vers les non triés (Alt+`) | ⬜ | Attend les non triés (§ 2). |
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
| Fil d'Ariane : « … », largeurs, état de chargement | 🟡 | Largeurs estimées, pas d'état de chargement. |
| Retour et avance au clavier (Ctrl+[, Ctrl+]) | 🟡 | Les boutons du navigateur marchent, pas les touches. |
| Monter d'un niveau, redescendre (Cmd+U, Cmd+Maj+U) | ⬜ | |
| Recherche (Cmd+F) : ce qui ne correspond pas s'efface, Entrée va au résultat suivant | 🟡 | Dans le tableau ouvert seulement : pas encore dans tous les tableaux (il faut un index au serveur), ni de tri ou de tableaux récents. |
| Tableaux récents, favoris | ⬜ | |
| Aperçu d'un tableau au survol | ⬜ | |
| Annuler la navigation (à l'échelle de la session) | ⬜ | |

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
| Pastilles plafonnées à 5 et « +N » | 🟡 | |
| Curseur des autres au repos | 🟡 | |
| Cache local, reprise après coupure | 🟡 | Copie locale (IndexedDB) ; l'état « hors ligne » ne se voit pas. |
| Texte écrit à plusieurs dans une même note | ⬜ | Voir § 3. |
| Lien public, publication en lecture | ⬜ | |
| Mot de passe sur un tableau partagé | ⬜ | |
| Notifications (commentaires, mentions, modifications) | ⬜ | |
| Activité récente du tableau | ⬜ | |
| Commentaires, mentions, réactions | ⬜ | Voir § 10 et § 11. |
| Mise en valeur de ce qu'un autre vient de modifier | ⬜ | |

## 15. Habillage

| Fonctionnalité | État | Reste |
|---|---|---|
| En-tête : fil d'Ariane, titre, partage, présence | ✅ | |
| Barre d'outils contextuelle | 🟡 | Flottante au-dessus de la sélection (choix) ; voir § 12 pour son contenu. |
| Annuler et rétablir dans l'en-tête | 🟡 | Au clavier seulement. |
| État d'enregistrement (« enregistré », « hors ligne ») | 🟡 | Rien ne le dit. |
| Thème sombre (Cmd+Maj+D) | ⬜ | |
| Tailles d'interface (petite, moyenne, grande) | ⬜ | |
| Fenêtre des raccourcis (/) | ⬜ | |
| Présentation (Cmd+Alt+P), mode focus sur un élément | ⬜ | |
| Aide, bulles de découverte, accueil d'un nouveau compte | ⬜ | |
| Réglages du compte (Cmd+,), photo, couleur | ⬜ | |
| Langues de l'interface | ⬜ | Français seulement. |
| Avis en bas d'écran (toasts) avec annulation | ⬜ | |
| Envoi de fichier : progression dans l'en-tête | ⬜ | |
| Cmd+S rassure (« déjà enregistré ») | ⬜ | |
| Raccourci Échap sur les menus de la barre | ⬜ | |

## 16. Exporter, importer

| Fonctionnalité | État | Reste |
|---|---|---|
| Exporter un tableau (PDF, image) | ⬜ | |
| Exporter le texte (Markdown, texte brut) | ⬜ | Le copier-coller donne déjà le texte brut. |
| Télécharger les médias d'un tableau (zip) | ⬜ | |
| Importer depuis Milanote | ⬜ | Par son API : Milanote n'a pas d'export structuré. |

## 17. Plateformes

| Fonctionnalité | État | Reste |
|---|---|---|
| Web | ✅ | |
| Hors ligne complet (écrire sans réseau, rattraper au retour) | 🟡 | Voir § 14. |
| Bureau (Tauri) | ⬜ | |
| iPhone | ⬜ | |
| Notes rapides sur le téléphone | ⬜ | |
| Partager vers Notak depuis le téléphone | ⬜ | |
| Gestes tactiles (pincer, toucher long) | ⬜ | |
