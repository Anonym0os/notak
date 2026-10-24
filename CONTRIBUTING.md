# Contributing to Notak

Thanks for looking! Notak is a small, readable codebase: a canvas, a set of element types that plug into it, and
two thin shells (a local one that needs no server, a server one with accounts and live collaboration).
*Un résumé en français est en bas de page.*

## Get going

```bash
bun install
bun run dev:locale          # the local edition: no server needed
bun run typecheck
bun run test
```

For the server edition, run `bun run serveur` in one terminal and `bun run dev` in another.

Before opening a pull request: `bun run typecheck` and `bun run test` pass, and the behaviour you changed is covered
by a test next to its source (`thing.ts` → `thing.test.ts`). The CI runs the same commands and builds both editions.

## Read first

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): how the code is laid out, in one page.
- [`docs/SPEC.md`](docs/SPEC.md): what Notak must do, gesture by gesture.
- [`docs/FONCTIONNALITES.md`](docs/FONCTIONNALITES.md): every Milanote feature and its status here. A pull request
  that moves a feature forward updates its row.

## Where to start

- **A new element type.** The best way in: types are self-contained (see below).
- **The local edition** (`apps/web/src/local/`): `.notak` copies, the "where are my boards?" panel, folder sync.
- **The folder sync engine** (`packages/tableau/src/dossier/`): tested against a fake sync client; see
  [`docs/STOCKAGE.md`](docs/STOCKAGE.md).
- **Translations**: every string lives in `langue.ts` (`packages/tableau/src/langue.ts`, `apps/web/src/langue.ts`),
  French as the source, English beside it; a test checks both have the same keys. Another language is a third
  object of the same shape.
- Rows marked 🟡 in `docs/FONCTIONNALITES.md`, and anything in [issues](https://github.com/Anonym0os/notak/issues).

## Adding an element type

Element types plug into the canvas through a registry; the canvas knows none of them by name. Take
`packages/tableau/src/elements/nuancier/` (a colour swatch) as a model:

1. **The content type**, in `packages/tableau/src/coeur/tableau.ts`: an interface with a `type` field, added to the
   `Contenu` union.
2. **Its required fields**, in `packages/tableau/src/coeur/valider.ts` (`REQUIS`): what a stored element must have
   to be drawn. Data comes from other devices and other versions; anything malformed is hidden, never crashes.
3. **The folder** `packages/tableau/src/elements/<type>/`:
   - a model file (`couleur.ts`): pure functions, a `nouveau…` constructor, tested;
   - the React rendering (`Nuancier.tsx`): `Rendu` receives the element, whether it is selected or being edited,
     and `brouillon` / `changer` callbacks to write;
   - `index.ts`: `registre.type({ type, nom, Rendu, outils, … })` (see `TypeElement` in `elements/types.ts` for
     every option: editing, resizing, proportions, toolbar, paste receivers…);
   - its CSS, imported by `index.ts`.
4. **Register it**: one import line in `packages/tableau/src/elements/index.ts`.
5. **Texts** in `packages/tableau/src/langue.ts` (French and English), and the server's search and export if the
   type carries text (`packages/tableau/src/export/`).

## Conventions

- **French identifiers and comments.** It is the project's language, kept consistent so the code reads as one
  voice. Glossary: *toile* canvas · *tableau* board · *élément* element · *magasin* store · *espace* space (all
  boards) · *réseau* network · *coffre* the folder sync engine · *dossier* folder · *fichier* file · *carte* card ·
  *note* note · *colonne* column · *lien* link · *ligne* line/arrow · *tâches* task list · *corbeille* trash ·
  *annuler / rétablir* undo / redo · *glisser* drag · *choisir* select · *enregistrer* save.
- Comments say **why**, in sentences; code says what.
- Commit messages: `Part: what changed` in French, e.g. `Toile : le lasso prend une ligne par son trait`. English is
  fine in pull requests; maintainers will help with wording.
- Pure functions in `coeur/` and model files; React components stay thin.
- Anything read from a document (Yjs) may come from another device or version: validate at the boundary.

## Licence

By contributing you agree your work is published under the AGPL-3.0, like the rest of Notak.

---

## En français

Le code et les commentaires sont en français ; les issues et pull requests sont bienvenues en français ou en
anglais. Pour commencer : `bun install`, `bun run dev:locale`, puis `bun run typecheck` et `bun run test` avant
toute pull request. La carte du code est dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Un bon premier pas :
un nouveau type d'élément (la marche à suivre est ci-dessus, en prenant `elements/nuancier/` pour modèle), une
traduction, ou une ligne 🟡 de `docs/FONCTIONNALITES.md`. Messages de commit : « Partie : ce qui change ».
