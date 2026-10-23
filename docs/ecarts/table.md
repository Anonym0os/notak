# La table, comme un petit tableur

Relevé du 23/10/2026, repris le même jour par trois relevés plus serrés (barre d'outils, menus, gestes et rendu),
d'après le comportement de Milanote, écrit dans nos mots. La table de Notak était une grille de champs ; elle devient
un tableur : sélection de cellules, clavier de tableur, types de cellule, formules, mise en forme par cellule,
repères A B C / 1 2 3, colonnes qu'on élargit et déplace, clic droit, copier-coller avec les tableurs.

UG : l'unité de grille de la toile (10 px à 100 %). « Choix Notak » marque un écart voulu.

## Modèle (`coeur/tableau.ts`, `Table`)

- `cellules: string[][]` reste le texte brut de chaque cellule (compatibilité, recherche, import Milanote).
  Une formule commence par `=`. Une case à cocher vaut `'true'` ou `'false'`.
- `formats?: (FormatCellule | null)[][]` : la mise en forme et le type de chaque cellule, de même forme que
  `cellules` (absent ou `null` : rien). Couleur du texte et surlignage sont rangés par nom (`bleu`, `grisFonce`…)
  et suivent le thème ; un hex d'une table plus ancienne s'affiche tel quel. Décimales : un nombre de 0 à 20, ou
  `auto` ; absentes, auto pour un nombre, 2 pour une monnaie ou un pourcentage.
- `largeurs?: number[]` : largeur de chaque colonne en UG ; absent, la largeur de l'élément se partage également.
  La largeur de l'élément est la somme des colonnes.
- `titre?` et `avecTitre?` : un titre centré au-dessus de la grille. `legende?` et `avecLegende?` : une légende
  dessous.
- `sansEntete` (ancien) : tant que `formats` est absent, la ligne 0 est un en-tête (gras, fond gris) sauf si
  `sansEntete` est posé. Dès qu'on écrit `formats`, l'en-tête y est recopié et `sansEntete` n'est plus lu.

## Création et états

- 4 lignes × 3 colonnes, largeur 34 UG (11,3 / 11,3 / 11,4), ligne 0 en gras sur fond gris d'en-tête
  (#d1d3d6 clair, #414141 sombre ; corps #fff / #282828). L'en-tête n'est qu'une mise en forme : il se change, se
  déplace et se retire comme une autre ligne.
- Minimum 2 lignes, 1 colonne ; colonne neuve 12 UG ; colonne au moins 4 UG ; ligne au moins 3 UG (hauteur selon
  le contenu, pas de geste de hauteur) ; élément au moins 12 × 6 UG. Milanote ne borne pas la table : Notak
  ne garde qu'une garde contre un collage démesuré (10 000 lignes, 1 000 colonnes). Pas de raccourci de création
  de table dans le code de Milanote.
- Non choisie : la grille est dessinée, un clic choisit ou glisse l'élément, pas de repères. Une case à cocher se
  coche et un lien s'ouvre d'un clic quand même.
- Choisie seule : bordure de sélection de 2 px, repères A B C au-dessus et 1 2 3 à gauche, hors de la table. Pas
  dans une colonne, pas en lecture seule. Barre : Titre et Légende (Milanote y met aussi étiquettes, réaction,
  commentaire, qui sont chez nous des outils communs). Ni + ligne ni + colonne.
- Cellules choisies : la bordure de l'élément s'efface, le contour de sélection des cellules prend le relais,
  les outils de cellule remplacent ceux de l'élément.
- Choix Notak : une table choisie se saisit par une bande de 10 px au-dessus d'elle (glisser sur les cellules les
  choisit). Milanote ne le dit pas dans son code : à observer.

## Repères A B C / 1 2 3

- Un ruban continu : bandes de 24 px à 10 px de la grille (au-dessus du titre s'il y en a un), fond #fdfdfd
  (#282828 en sombre), texte 11 px #8d929a (#a3a3a3), filet à 8 % entre deux repères, bouts arrondis à 4 px,
  ombre douce. Pas de coin « tout choisir ».
- Un repère que la sélection touche prend le gris d'en-tête (#d1d3d6 / #414141), texte #48505e (#cccccc). Jamais
  la couleur de sélection.
- Clic : toute la colonne ou la ligne ; Maj+clic étend ; glisser sur plusieurs repères. Clic droit sur un repère
  hors de la sélection : la colonne ou la ligne entière se choisit, puis le menu.
- Largeur : poignée invisible de 12 px à cheval sur le bord droit de la lettre (20 px, de −12 à +8, pour la
  dernière), curseur `col-resize`. Si la colonne fait partie d'une sélection de colonnes, toutes changent, l'écart
  partagé à parts égales. Au lâcher, la largeur totale se cale sur la grille. Double-clic : s'ajuste au contenu,
  arrondi à la grille supérieure. Un seul pas d'historique.
- Déplacer : reprendre une lettre ou un numéro déjà choisi et glisser ; une bande grise translucide suit le
  pointeur, un trait de 2 px marque la place (caché si elle est voisine de l'origine), curseur `grabbing`.

## Sélection

- 1er clic sur une table non choisie : choisit l'élément. Ensuite, un clic choisit la cellule. Un clic sur la
  cellule déjà seule choisie ouvre l'édition, curseur au point cliqué.
- Glisser sur les cellules : un rectangle. Maj+clic : étend. Cmd+clic : ajoute une plage. Insérer et retirer des
  lignes ou des colonnes se grisent sur plusieurs plages ; les déplacements, non : ils valent pour la première.
- Contour de 2 px : une cellule seule a son contour, une plage son seul contour extérieur. Pas de voile sur les
  cellules. Choix Notak : la couleur d'accent, là où Milanote prend une ardoise (#323b4a, #f2f2f2 en sombre).
- Petite poignée carrée de recopie au coin bas droit (7 px, liseré de 1 px).
- Échap (sans édition) : les cellules se déchoisissent, l'élément reste choisi. Échap en édition : abandonne.
- Les flèches et les lettres tapées ne remontent pas à la toile.

## Clavier, grille

| Touche | Effet |
|---|---|
| Flèches / Maj+flèches | déplacer / étendre |
| ⌘ + flèche (avec Maj) | jusqu'au bord de la grille (en étendant) |
| Début / Fin, ⌘Début / ⌘Fin | le bout de la ligne ; la première ou la dernière cellule |
| Ctrl+Espace / Maj+Espace | la colonne entière / la ligne entière |
| Alt+↑ ↓ ← → | insérer des lignes au-dessus, dessous, des colonnes à gauche, à droite (autant que la sélection ; une colonne entière n'ajoute qu'une ligne, au bord, et une ligne entière qu'une colonne) |
| Cmd+Entrée | une ligne dessous (une colonne à droite si une colonne entière est choisie) |
| Cmd+Retour arrière | retirer les lignes choisies (les colonnes si colonne entière) |
| Retour arrière, Suppr | vider les cellules choisies |
| Tab / Maj+Tab | cellule suivante, passe à la ligne ; en dernier, vers la légende (s'il y en a une) ; en premier, vers le titre. Tab ne crée jamais de ligne |
| Cmd+B / I / Maj+X | gras / italique / barré sur toute la cellule ; la 1re cellule décide (si elle l'a, on l'ôte partout) |
| Cmd+A | toutes les cellules |
| Cmd+C / X / V | copier, couper, coller |
| Entrée, F2 | éditer la cellule |
| un caractère | édite et remplace le contenu par ce caractère (accents à touche morte et dictée compris) |

## Clavier, édition

- Entrée : valide et descend d'une cellule (bornée à la dernière ligne). Échap : abandonne.
- Maj+Entrée, Alt+Entrée : retour à la ligne dans la cellule. Tab : valide et passe à droite.
- L'éditeur recouvre la cellule, grandit avec le texte (la ligne avec lui), prend le fond de la cellule et
  l'alignement de son type ; une formule en cours d'écriture s'aligne à gauche.
- Une formule aux parenthèses non fermées se ferme à la validation.

## Titre et légende

- Titre : bandeau centré, 16 px, graisse 600, interligne 25 px, sur autant de lignes qu'il faut ; sa hauteur se
  cale sur la grille (6 UG pour une ligne). Il pousse la grille et les repères.
  - Tab, → en fin de texte, ↓ sur la dernière ligne : vers A1.
  - Entrée : le titre est écrit, la table se déchoisit.
  - Retour arrière sur un titre vide : le titre disparaît, on va à A1.
  - ⌘Entrée : l'élément suivant.
- Légende : sous la grille, texte de 13 px ; avec elle, la dernière ligne garde son filet du bas.

## Types de cellule

| Type | Alignement | Éditable |
|---|---|---|
| Auto (aucun) | gauche | oui |
| Nombre | droite | oui |
| Monnaie | droite | oui |
| Pourcentage | droite | oui |
| Texte | gauche | oui |
| Date et heure | droite | oui |
| Case à cocher | centre | non (un clic la coche, tout de suite) |

Le résultat d'une formule s'aligne comme sa valeur : un nombre à droite.

Options :
- **Nombre** : décimales auto, séparateur des milliers oui.
- **Monnaie** : 2 décimales, milliers oui, style comptable non (négatifs entre parenthèses).
  - Devise : toutes celles du navigateur, « Nom (CODE) ». Choix Notak : EUR par défaut.
  - Affichage : le rendu de 12 345 en symbole étroit, symbole, code et nom, sans doublon.
- **Pourcentage** : 2 décimales, milliers oui.
- **Décimales** (pour les trois) : champ à flèches de 0 à 20 ; vide veut dire « auto », autant que la valeur en porte.
- **Date** : aucune, mots longs (`dateStyle: long`), mots courts (`medium`), chiffres (le rendu de la langue, 01/02/2006 en français, 2/1/2006 aux États-Unis), chiffres à année courte, tirets, avec le jour (`full`).
- **Heure** : aucune, 12 h avec secondes, 12 h, 24 h avec secondes, 24 h.
  - Chaque choix montre son rendu du 29 février 2016 à 13:24:56.
  - « Aucune » se grise pour la date quand l'heure est aucune, et inversement.
  - Heure entre parenthèses, cochée pour une date posée à la main, qui se montre en mots courts.

Les nombres et les dates suivent les réglages régionaux du système.

Déduction à la saisie :
- On essaie dans l'ordre : nombre (séparateurs de la langue), pourcentage (« % » final), monnaie (symbole devant ou derrière, 3 caractères au plus), puis date. Sinon retour à Auto.
- Texte et Case choisis à la main ne sont jamais écrasés.
- Une déduction remplace un type existant seulement s'il était vide, si elle trouve pourcentage, monnaie ou date, ou si une date retombe en nombre.
- Symboles : € EUR, $ USD, £ GBP, ¥ JPY, kr SEK…

Choisir un type à la main :
- Texte et Auto toujours.
- Case seulement si la valeur est vide, `true` ou `false`.
- Nombre, monnaie, pourcentage seulement si la valeur est numérique ; la ligne se grise si aucune cellule ne peut.
- Passer en Texte fige le texte affiché.

Date : à l'édition d'une cellule date, un petit calendrier sous l'éditeur, avec « avec l'heure ».

## Formules

- `=` en tête. Références A1, plages A1:B3, `$` absolu, opérateurs `+ - * / ^ &` et comparaisons, `TRUE`/`FALSE`.
- Environ 150 fonctions aux noms anglais : maths, conditionnelles (SUMIFS, COUNTIFS…), statistiques, recherche
  (INDEX, MATCH, VLOOKUP, XLOOKUP simple), texte, dates, informations. Milanote en a environ 380 (celles de
  HyperFormula) : restent surtout les financières et les tableaux.
- Autocomplétion :
  - Elle s'ouvre sur `=` seul, ou après `= ( , + - * / ^ & < >` ou une espace suivie de lettres (avec `_` et `.`).
  - Vide : SUM, IF, MIN, MAX, COUNT, AVERAGE. Sinon par préfixe, triées par longueur puis alphabet, la partie tapée en gras.
  - La liste défile au-delà de 190 px, la ligne active est grise.
  - ↑ ↓ en boucle, Entrée ou Tab insère `NOM(`.
- Outil fx : ouvre l'édition avec `=` (ou à la suite), une seule cellule.
- Clic pour citer :
  - Quand le curseur suit un opérateur, `(` ou `,`, ou touche une référence déjà écrite, un clic sur une cellule insère sa référence (ou remplace celle qu'il touche).
  - Glisser ou Maj+clic : une plage. Cmd+clic : ajoute `,` puis une autre.
  - Les références sont colorées dans le texte et sur la grille, six couleurs tour à tour, cadre de 2 px, fond teinté à 10 % : #16a0e5, #ff8d22, #4eb85a, #af72ff, #ff6dd4, #62dbc8.
- Erreur : la cellule ne montre qu'une pastille d'alerte ronde. Au survol (200 ms), une bulle dit l'erreur : 270 px au plus, centrée, elle revient à la ligne.
- Le type d'une formule suit le résultat : SUM, MIN, MAX, AVERAGE… prennent le type de la première cellule citée.
- Insérer, retirer, déplacer lignes et colonnes réécrit les références (#REF! si la cible disparaît).

## Outils de cellule (barre de sélection)

Dans l'ordre :
1. Style de texte.
2. Type de cellule.
3. Couleur de cellule.
4. Formule (fx), grisée hors d'une cellule seule.
5. Alignement.
6. + colonne (bulle « ⌥→ »).
7. + ligne (« ⌥↓ »).
8. « ••• ».

Règles communes :
- Tout s'applique à toutes les cellules de toutes les plages.
- Un outil montre ce que les cellules ont en commun, rien quand elles diffèrent.
- Les menus restent ouverts après un choix.

1. **Style de texte**, pastilles « A » de 24 × 20 px :
   - Couleur : défaut, bleu #4ebafd, vert #4eb85a, orange #ff8d22, rouge #f52929, gris #5f6672. En sombre : orange #ffa047, rouge #f75555, gris #bcbcbc.
   - Surlignage : gris foncé #000 (lettre blanche), bleu #8ae0ff, vert #c9f201, orange #ffce26, rose #ffa4de, gris #e8e9eb. Pas de pastille « aucun ».
   - Couleur et surlignage s'excluent. Re-choisir celle qui est posée l'ôte. « Défaut » ôte les deux.
   - La note a les mêmes couleurs.
2. **Type de cellule** :
   - Les 7 types, chacun avec son signe, une coche sur l'actif, un chevron sur ceux qui ont des options.
   - Les options du type actif dans un second panneau de 290 px, à droite.
   - Types mêlés : rien d'actif, pas d'options.
3. **Couleur de cellule**, une grille de cinq :
   - Aucune, puis le gris d'en-tête, cyan #62dbc8, vert #7cd651, brun #d58558, jaune #ffd14d, orange #ff8d48, rouge #ff5757, rose #ff6ed4, violet #ad6fff, bleu #4ebafd, bleu profond #5882f8.
   - Puis « Couleur personnalisée », qui ouvre le sélecteur du système et montre la couleur en direct. Pas d'aperçu au survol des pastilles.
   - Sur un fond de couleur, le texte se lit en sombre ou en blanc selon la clarté du fond.
4. **Alignement** : horizontal gauche / centre / droite, vertical haut / milieu / bas ; l'icône « justifié » quand les cellules diffèrent.
5. **« ••• »** : le menu du clic droit sans le presse-papiers ni « en dessous » et « à droite » (la barre a déjà ces deux boutons).

## Clic droit

Le menu de table s'ouvre seulement s'il y a des cellules choisies, sans écriture en cours, hors lecture seule.
Sinon, c'est le menu de l'élément, ou celui du navigateur dans une cellule ouverte. Un clic droit hors de la
sélection choisit la cellule visée, ou la ligne ou la colonne entière sur un repère.

Cinq groupes, séparés par un trait :
1. **Presse-papiers** : Couper, Copier, Coller, Coller les valeurs.
2. **Lignes** : ajouter une ligne ou des lignes au-dessus (⌥↑), en dessous (⌥↓). Caché si ce sont des colonnes entières.
3. **Colonnes** : ajouter à gauche (⌥←), à droite (⌥→). Caché si ce sont des lignes entières.
4. **Déplacements** : déplacer les lignes vers le haut ou le bas, si ce sont des lignes entières ; les colonnes à gauche ou à droite, si ce sont des colonnes entières. Grisé au bord.
5. **Retraits** : vider ; retirer les lignes ; retirer les colonnes. Grisé s'il resterait moins de 2 lignes ou 1 colonne. Les retraits sont cachés comme les insertions.

Seules les insertions montrent leur raccourci. Les libellés ne comptent pas, ils passent seulement au pluriel.
Toute la table choisie : presse-papiers et Vider.

Le menu :
- Rangées de 28 px, texte de 14 px, graisse 500, gris #5f6672, survol gris #f3f3f4 (#333 en sombre).
- 240 à 296 px de large, coins de 12 px.
- Raccourcis en pastilles, une par touche.
- Il se mène au clavier : flèches (les entrées grisées sautées), Début, Fin, une lettre, Entrée.
- Le bouton droit relâché sur une entrée la choisit.
- Un clic dehors, Échap ou un redimensionnement de la fenêtre le ferment. La molette ne fait pas défiler la toile dessous.

Les lignes et colonnes insérées reprennent, cellule par cellule, ce que leurs voisines partagent (`continuation`) :
- Le fond, les styles du texte et l'alignement de la voisine d'avant, si l'avant-avant ou la voisine d'après les partagent. Sinon ceux de la voisine d'après, si l'après-après les partage.
- Jamais le type.
- Insérer sous l'en-tête ne le recopie pas, et insérer dans un bandeau régulier le prolonge.

## Poignée de l'élément

Elle n'étire pas : elle ajoute ou retire des colonnes entières (une neuve dès une demi-colonne de 12 UG) et des
lignes (dès une demi-ligne de 3 UG). Elle ne retire jamais une colonne ou une ligne qui a du contenu, et jamais sous 2 lignes.

## Presse-papiers et recopie

- **Copier** : texte séparé par des tabulations, et un HTML `<table>` portant nos données complètes (formats, formules) dans un attribut.
- **Couper** vide les cellules tout de suite.
- **Coller** :
  - Nos données, si elles y sont : la cellule entière est remplacée.
  - Sinon le HTML d'un tableur (colspan et rowspan dépliés) ou le texte à tabulations. La cellule repart de zéro : son ancien format s'en va, son type se déduit du texte.
  - La grille s'agrandit si ça dépasse.
  - Une copie décale les références relatives d'une formule collée. Une coupe collée dans sa propre table les garde telles quelles.
- **Coller les valeurs** : le texte affiché seul (une formule donne son résultat), comme venu d'un autre tableur.
- Coller une table sur la toile crée une table.
- **Recopie** : glisser la poignée du coin répète le motif des cellules (valeurs, types, styles) : 1, 2 donne 1, 2, 1, 2, sans prolonger de série. Les références d'une formule se décalent.
- **Vider** : le texte part, la mise en forme reste, sauf la case à cocher, qui redevient une cellule ordinaire.

## Rendu

- Carte blanche, filets de cellule de 1 px. Pas de filet extérieur à gauche ni à droite, ni en haut sans titre, ni en bas sans légende.
- Texte de 14 px, interligne 20 px, marges de cellule 4,5 px et 6 px, chiffres alignés en colonne.
- Dans une colonne :
  - Si les colonnes sont plus étroites que la colonne plus 10 UG, elles s'étirent en proportion. Sinon la table défile en largeur, sous un geste horizontal de la molette, avec une barre de 6 px.
  - Ni repères ni poignées.
- Recherche : une cellule est trouvée sur son texte affiché (formaté selon son type).
- Annuler : chaque geste est un pas d'historique.

## Ce qu'on ne reprend pas tout de suite

- La mention « @ » et le lien vers un tableau dans une cellule. Le gras, l'italique, le barré, le lien, la couleur et
  le surlignage d'un passage sont repris (`riche` dans le format de la cellule, voir `riche.ts`).
- Le raccourci de création ⌃⌘N : le code de Milanote n'en donne pas pour la table (seul ⌘Entrée crée l'élément suivant).
- Les couleurs suggérées de la planche sous la palette de fond.
- Le repli de la barre selon la hauteur de la fenêtre.
- L'erreur #NUM! (les erreurs de domaine donnent #VALUE!).
