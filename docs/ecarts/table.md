# La table, comme un petit tableur

Relevé du 23/10/2026, d'après l'observation du comportement de Milanote, écrit dans nos mots. La table de Notak
était une grille de champs ; elle devient un tableur : sélection de cellules, clavier de tableur, types de cellule,
formules, mise en forme par cellule, repères A B C / 1 2 3, colonnes qu'on élargit et déplace, clic droit,
copier-coller avec les tableurs.

UG : l'unité de grille de la toile (10 px à 100 %).

## Modèle (`coeur/tableau.ts`, `Table`)

- `cellules: string[][]` reste le texte brut de chaque cellule (compatibilité, recherche, import Milanote).
  Une formule commence par `=`. Une case à cocher vaut `'true'` ou `'false'`.
- `formats?: (FormatCellule | null)[][]` : la mise en forme et le type de chaque cellule, de même forme que
  `cellules` (absent ou `null` : rien).
- `largeurs?: number[]` : largeur de chaque colonne en UG ; absent, la largeur de l'élément se partage également.
  La largeur de l'élément est la somme des colonnes.
- `titre?: string` et `avecTitre?: boolean` : un titre centré au-dessus de la grille.
- `sansEntete` (ancien) : tant que `formats` est absent, la ligne 0 est un en-tête (gras, fond gris) sauf si
  `sansEntete` est posé. Dès qu'on écrit `formats`, l'en-tête y est recopié et `sansEntete` n'est plus lu.

## Création et états

- 4 lignes × 3 colonnes, largeur 34 UG (11,3 / 11,3 / 11,4), ligne 0 en gras sur fond gris d'en-tête
  (#d1d3d6 clair, #414141 sombre ; corps #fff / #282828).
- Minimum 2 lignes, 1 colonne ; colonne neuve 12 UG ; colonne au moins 4 UG ; ligne au moins 3 UG (hauteur selon
  le contenu, pas de geste de hauteur) ; élément au moins 12 × 6 UG. Raccourci de création ⌃⌘N.
- Non choisie : la grille est dessinée, un clic choisit ou glisse l'élément, pas de repères.
- Choisie : bordure de sélection de 2 px, les repères A B C au-dessus et 1 2 3 à gauche apparaissent, hors de la
  table (bandes de 24 px, à 10 px de la grille, bouts arrondis 4 px, ombre douce ; repère choisi en couleur de
  sélection). Pas dans une colonne, pas en lecture seule.
- Cellules choisies : la bordure de l'élément s'efface, le contour de sélection des cellules prend le relais,
  les outils de cellule remplacent ceux de l'élément.

## Sélection

- 1er clic sur une table non choisie : choisit l'élément. Ensuite, un clic choisit la cellule. Un clic sur la
  cellule déjà seule choisie ouvre l'édition, curseur au point cliqué. Pas de double-clic à part.
- Glisser sur les cellules : un rectangle. Maj+clic : étend. Cmd+clic : ajoute une plage (insertion, retrait et
  déplacement de lignes ou colonnes désactivés sur plusieurs plages).
- Clic sur une lettre : toute la colonne ; sur un numéro : toute la ligne ; glisser sur plusieurs repères.
- Contour 2 px couleur de sélection, la plage teintée de la même couleur, translucide. Petite poignée carrée de
  recopie au coin bas droit.
- Échap (sans édition) : les cellules se déchoisissent, l'élément reste choisi. Échap en édition : abandonne.
- Les flèches et les lettres tapées ne remontent pas à la toile.
- Clic sur une case à cocher ou un lien : agit sans choisir la cellule.

## Clavier, grille

| Touche | Effet |
|---|---|
| Flèches / Maj+flèches | déplacer / étendre |
| Alt+↑ ↓ ← → | insérer une ligne au-dessus, dessous, une colonne à gauche, à droite |
| Cmd+Entrée | une ligne dessous (une colonne à droite si une colonne entière est choisie) |
| Cmd+Retour arrière | retirer les lignes choisies (les colonnes si colonne entière) |
| Retour arrière, Suppr | vider les cellules choisies (cases comprises) |
| Tab / Maj+Tab | cellule suivante, passe à la ligne ; en dernier, vers la légende ; en premier, vers le titre |
| Cmd+B / I / Maj+X | gras / italique / barré sur toute la cellule ; la 1re cellule décide (si elle l'a, on l'ôte partout) |
| Cmd+C / X / V | copier, couper, coller |
| Entrée, F2 | éditer la cellule |
| un caractère | édite et remplace le contenu par ce caractère |

Couleur de texte et surlignage s'excluent.

## Clavier, édition

- Entrée : valide et descend d'une cellule (bornée à la dernière ligne). Échap : abandonne.
- Maj+Entrée, Alt+Entrée : retour à la ligne dans la cellule. Tab : valide et passe à droite.
- L'éditeur recouvre la cellule, grandit avec le texte (la ligne avec lui), prend le fond de la cellule et
  l'alignement de son type (une formule s'aligne à gauche).
- Une formule aux parenthèses non fermées se ferme à la validation.

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

Options : nombre (décimales auto, séparateur des milliers oui) ; monnaie (2 décimales, milliers oui, style
comptable non : négatifs entre parenthèses, devise EUR chez nous, affichage symbole étroit / symbole / code / nom) ;
pourcentage (2 décimales, milliers oui) ; date (format : aucun, long « 1 février 2006 », court « 1 févr. 2006 »,
chiffres « 01/02/2006 », chiffres courts « 01/02/06 », tirets « 01-02-2006 », jour « mercredi 1 févr. 2006 » ;
heure : aucune, 12 h, 12 h s, 24 h, 24 h s ; heure entre parenthèses ; jamais date et heure toutes deux à
« aucun »). Décimales : 0 à 20, vide = auto. Rendu par `Intl` dans la langue de l'utilisateur.

Déduction à la saisie : nombre (séparateurs de la langue), puis pourcentage (« % » final), puis monnaie (symbole
devant ou derrière, 3 caractères au plus), puis date. Sinon retour à Auto. Texte et Case choisis à la main ne sont
jamais écrasés. Une déduction remplace un type existant seulement s'il était vide, ou si elle trouve
pourcentage, monnaie ou date, ou si une date retombe en nombre. Symboles : € EUR, $ USD, £ GBP, ¥ JPY, kr SEK…

Choisir un type à la main : Texte et Auto toujours ; Case seulement si la valeur est vide, `true` ou `false` ;
nombre, monnaie, pourcentage seulement si la valeur est numérique (le bouton se grise si aucune cellule ne peut).
Passer en Texte fige le texte affiché.

Date : à l'édition d'une cellule date, un petit calendrier sous l'éditeur, avec « avec l'heure ».

## Formules

- `=` en tête. Références A1, plages A1:B3, `$` absolu, opérateurs `+ - * / ^ &` et comparaisons, `TRUE`/`FALSE`.
- Fonctions au moins : SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, AND, OR, NOT, ROUND, ABS, CONCAT, LEN, UPPER,
  LOWER, TODAY, NOW, SUMIF, COUNTIF, AVERAGEIF, PRODUCT, MEDIAN, IFERROR. Noms anglais (comme les tableurs).
- Autocomplétion : s'ouvre sur `=` seul, ou après `= ( , + - * / ^ & < >` ou une espace suivie de lettres.
  Vide : SUM, IF, MIN, MAX, COUNT, AVERAGE. Sinon préfixe, tri par longueur puis alphabet ; la partie tapée en
  gras majuscule. ↑ ↓ en boucle, Entrée ou Tab insère `NOM(`.
- Outil fx : ouvre l'édition avec `=` (ou à la suite), une seule cellule.
- Clic pour citer : quand le curseur suit un opérateur, `(` ou `,`, un clic sur une cellule insère sa référence,
  glisser ou Maj+clic une plage, Cmd+clic ajoute `,` puis une autre. Les références sont colorées dans le texte et
  sur la grille, six couleurs tour à tour, fond teinté à 10 % : #16a0e5, #ff8d22, #4eb85a, #af72ff, #ff6dd4,
  #62dbc8.
- Erreur : la cellule ne montre qu'une pastille d'alerte ronde ; au survol (200 ms) une bulle dit l'erreur
  (syntaxe, division par zéro, référence circulaire, #REF!…).
- Le type d'une formule suit le résultat : SUM, MIN, MAX, AVERAGE… prennent le type de la première cellule citée.
- Insérer, retirer, déplacer lignes et colonnes réécrit les références (#REF! si la cible disparaît).

## Outils de cellule (barre de sélection)

1. Style de texte : couleur (défaut, bleu, vert, orange, rouge, gris) et surlignage (gris foncé, bleu, vert,
   orange, rose, gris), sur toute la cellule.
2. Type de cellule : les 7 types, coche sur l'actif, ses options dépliées dessous.
3. Couleur de cellule : aucune, gris #bbbec3, cyan #62dbc8, vert #7cd651, brun #d58558, jaune #ffd14d,
   orange #ff8d48, rouge #ff5757, rose #ff6ed4, violet #ad6fff, bleu #4ebafd, bleu profond #5882f8, gris
   d'en-tête, couleur libre ; aperçu au survol.
4. Formule (fx).
5. Alignement : horizontal gauche / centre / droite, vertical haut / milieu / bas.
6. Ajouter une colonne (à droite), 7. ajouter une ligne (dessous).
8. « ••• » : le menu du clic droit sans le presse-papiers.

Tout s'applique à toutes les cellules de toutes les plages.

## Clic droit (table seule choisie, cellules choisies, pas d'édition)

1. Couper, Copier, Coller, Coller les valeurs.
2. Ajouter une/des ligne(s) au-dessus (Alt+↑), dessous (Alt+↓) — caché si colonne entière.
3. Ajouter une/des colonne(s) à gauche (Alt+←), à droite (Alt+→) — caché si ligne entière.
4. Déplacer la/les ligne(s) vers le haut / bas (si des lignes entières), colonne(s) à gauche / droite (si des
   colonnes entières) ; grisé au bord.
5. Vider la/les cellule(s) ; retirer la/les ligne(s) ; retirer la/les colonne(s) (grisé s'il resterait moins de
   2 lignes ou 1 colonne).

Le nombre inséré suit la sélection (3 lignes choisies, 3 insérées). Les lignes et colonnes neuves reprennent la
mise en forme de leurs voisines quand elle est régulière.

## Gestes de structure

- Élargir une colonne : poignée de 12 px à cheval sur le bord droit de sa lettre (20 px pour la dernière), curseur
  `col-resize`, la colonne et l'élément s'élargissent ensemble. Si la colonne fait partie d'une sélection de
  colonnes, toutes changent. Au lâcher, la largeur totale se cale sur la grille. Double-clic : s'ajuste au
  contenu. Un seul pas d'historique.
- Déplacer : choisir une lettre ou un numéro, puis le reprendre et glisser ; une ombre suit le pointeur, une ligne
  de 2 px marque la place (cachée si la place est voisine de l'origine), curseur `grabbing`.
- Poignée de l'élément : elle n'étire pas, elle ajoute ou retire des colonnes entières (une neuve dès une demi
  colonne de 12 UG) et des lignes (dès une demi-ligne de 3 UG) ; jamais une colonne ou une ligne qui a du contenu,
  jamais sous 2 lignes.

## Presse-papiers et recopie

- Copier : texte séparé par des tabulations, et un HTML `<table>` portant nos données complètes (formats,
  formules) dans un attribut.
- Coller : nos données si présentes ; sinon HTML de tableur (colspan et rowspan dépliés) ou texte à tabulations ;
  le texte collé passe par la déduction de type. La grille s'agrandit si ça dépasse. Les références relatives
  d'une formule collée se décalent. Couper vide la source au collage.
- Coller une table sur la toile crée une table.
- Recopie : glisser la poignée du coin recopie les cellules (valeurs, types, styles) ; une suite de nombres se
  prolonge ; les références d'une formule se décalent.

## Rendu

- Carte blanche, bordures de cellule de 1 px, fonds de cellule, pas de bordure extérieure haute ou basse sans
  titre ni légende.
- Dans une colonne : si les colonnes sont plus étroites que la colonne + 10 UG, elles s'étirent en proportion ;
  sinon la table défile en largeur.
- Recherche : une cellule est trouvée sur son texte affiché (formaté selon son type).
- Annuler : chaque geste est un pas d'historique.

## Ce qu'on ne reprend pas tout de suite

- Le texte riche partiel dans une cellule (un mot en gras) : chez nous la mise en forme est par cellule.
