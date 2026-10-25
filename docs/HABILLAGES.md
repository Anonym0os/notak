# Les habillages : un thème dans un fichier

Un habillage est un thème Notak écrit dans un fichier JSON : ses couleurs, ses arrondis, ses polices, ses
présentations et ses cartes mentales. On l'importe dans les réglages (« Thème », puis « Importer un thème… »), ou un
serveur le fournit à tous ses comptes. Il se pose par-dessus le mode clair ou sombre, qui reste un réglage à part.

L'exemple de référence est [`exemples/habillages/silak.json`](../exemples/habillages/silak.json). Un essai le relit à
chaque passage des tests.

## Le format

```json
{
  "notak": "habillage",
  "version": 1,
  "id": "silak",
  "nom": "Silak",
  "auteur": "…",
  "couleurs": { "clair": { … }, "sombre": { … } },
  "rayons": { "carte": 10, "controle": 10, "panneau": 20 },
  "polices": { "texte": [ … ], "titre": [ … ], "code": [ … ] },
  "fontes": [{ "famille": "…", "source": "https://…woff2", "graisse": "400 700" }],
  "pitch": { "fond": "…", "texte": "…", "surbrillance": "…", "police": [ … ], "policeTitre": [ … ], "graisse": 400, "graisseTitre": 600 },
  "carte": { "palette": [ … ], "fond": "…" }
}
```

Seuls `notak`, `version`, `id` et `nom` sont obligatoires. `id` tient en minuscules, chiffres et tirets (40 au plus),
et `notak` lui est réservé. Réimporter un thème du même `id` le remplace : c'est ainsi qu'on le met à jour.

| Section | Ce qu'elle règle |
|---|---|
| `couleurs.clair`, `couleurs.sombre` | les rôles `fond` (toile, en-tête, écran de connexion), `point` (la grille), `carte` (cartes, tables, menus), `texte`, `accent` (liens, focus), `selection` (le filet d'une carte choisie). Un mode absent garde les couleurs de Notak. |
| `rayons` | en pixels, de 0 à 48 : `carte` (les cartes de la toile), `controle` (boutons, champs), `panneau` (menus, fenêtres, panneaux). |
| `polices` | des piles de familles : `texte` (toute l'interface), `titre` (les titres des notes et des documents), `code`. Les mots-clés génériques (`sans-serif`, `monospace`, `system-ui`…) s'écrivent tels quels. |
| `fontes` | les fontes à charger pour ces piles : une adresse `https:` ou une fonte embarquée `data:font/woff2;base64,…`. Hors ligne, la pile de repli prend le relais. |
| `pitch` | un thème de présentation de plus dans le sélecteur du Pitch. Choisi, il **s'écrit dans la carte** : un collaborateur qui n'a pas le fichier voit la même présentation. Il prend les formes par défaut, sans décor. |
| `carte` | un thème de couleur de plus pour les cartes mentales : une palette de 2 à 12 couleurs (répétée jusqu'à six), et au besoin le fond de la carte. Il s'écrit lui aussi dans la carte. |

Les couleurs s'écrivent en `#hex`, `rgb()`, `hsl()` ou `oklch()`. Tout ce qu'un habillage porte finit dans une feuille
de style. Chaque valeur passe donc par une liste blanche (`packages/tableau/src/habillage/format.ts`) : une seule
valeur mal formée fait refuser le fichier, et le message dit laquelle. Une clé inconnue est ignorée. Un fichier de plus
de 1,5 Mo est refusé.

## Comment il se pose

- `useHabillages` (`habillage/appliquer.ts`) calcule l'habillage actif : celui qu'impose le serveur, sinon celui
  choisi sur l'appareil, sinon celui que le serveur propose.
- Il pose `data-habillage` et `data-mode` sur `<html>`, et la feuille tirée du fichier (`habillage/variables.ts`)
  dans un seul `<style data-notak-habillage>`.
- La feuille repeint les jetons `--notak-*` de la toile et les jetons de l'application (`--fond`, `--texte`… de
  `app.css`). Les rayons et la police passent par `--notak-rayon-*` et `--notak-police`. Sans habillage, ces jetons
  ne sont pas déclarés, et chaque règle garde sa valeur d'origine en repli : rien ne change.
- Les habillages importés sont gardés dans le navigateur (`notak:habillages`), et le choix dans les réglages
  (`notak:reglages`).

## Ce qu'un habillage ne touche pas encore

- les couleurs des notes, des colonnes et des surlignages, qui restent les teintes de Notak ;
- la police des titres de colonne (Tiempos) et des cartes mentales (réglée carte par carte, dans l'onglet Carte) ;
- les rayons des éléments de détail : pastilles, puces, petites étiquettes ;
- les décors et les formes propres aux thèmes du Pitch.
