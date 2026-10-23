# Notak

Des tableaux visuels libres, à plusieurs : notes, images, liens, colonnes, flèches, tâches, croquis.
Une alternative open source à Milanote, en TypeScript et React, qu'on pose aussi dans d'autres applications.

> État : passe 1, la toile. On pose des notes, on zoome, on défile, on sélectionne et on déplace.
> Le tableau est un fichier local ; rien n'est encore partagé.

```bash
bun install
bun run dev
```

| Geste | Effet |
|---|---|
| Double-clic sur le vide | nouvelle note |
| Double-clic sur une note, ou Entrée | écrire dedans ; Échap pour sortir |
| Glisser une note | la déplacer (Maj : sur un seul axe) |
| Glisser sur le vide | lasso (Maj ou Cmd : inverse) |
| Molette, espace + glisser, bouton du milieu | défiler |
| Cmd + molette, pincement | zoomer |
| Z | tout voir ; encore Z : 100 % |
| Cmd+= / Cmd+− / Cmd+0 | zoom avant, arrière, 100 % |
| Flèches (Maj : ×5) | déplacer la sélection |
| Suppr | supprimer |
| Cmd+Z / Cmd+Maj+Z | annuler, rétablir |
| Cmd+A, Échap | tout sélectionner, désélectionner |

## Héberger

Un seul conteneur sert l'application, les comptes et le travail à plusieurs, sur le port 3005.
Les données (base SQLite et fichiers envoyés) vivent dans le volume `/donnees`.

```bash
git clone https://github.com/Anonym0os/notak
cd notak
docker build -t notak .
docker run -d -p 3005:3005 -v notak-donnees:/donnees notak
```

L'image suppose un relais HTTPS devant elle (cookie `Secure`, adresse du client lue dans `X-Forwarded-For`).
Pour l'essayer en HTTP sur sa machine : `-e NOTAK_COOKIE_SECURISE=0 -e NOTAK_RELAIS=0`.

## Pile

- Interface : React 19, toile en DOM (une transformation CSS pour le zoom)
- Texte riche : Tiptap 3 (ProseMirror), enregistré dans son format JSON
- Collaboration : Yjs (à venir)
- Coques : web, bureau par Tauri, iPhone (à venir)

## Dépôt

| Dossier | Rôle |
|---|---|
| `docs/SPEC.md` | ce que Notak doit faire, geste par geste |
| `docs/PUBLIER.md` | publier Notak gratuitement : local, coffre de l’utilisateur, relais chiffré |
| `packages/tableau` | `@notak/tableau` : le cœur (caméra, sélection, historique) et la toile React |
| `apps/web` | l'application web |
| `apps/site` | la page d’attente de notak.app |

Tests : `bun run test`. Types : `bun run typecheck`.

## Licence

AGPL-3.0. Qui héberge une version modifiée doit en publier le code.
