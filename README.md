# Notak

Des tableaux visuels libres, à plusieurs : notes, images, liens, colonnes, flèches, tâches, croquis.
Une alternative open source à Milanote, écrite en Rust natif.

> État : passe 1, la toile. On pose des notes, on zoome, on défile, on sélectionne et on déplace.
> Le tableau est un fichier local ; rien n'est encore partagé.

```bash
cargo run -p notak-app
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

## Pile

- Interface : `eframe` / `egui` sur `wgpu` (dessin vectoriel `vello` quand il deviendra utile)
- Texte : `parley`
- Collaboration : CRDT `yrs` (compatible Yjs)
- Serveur : `axum`, Postgres

## Dépôt

| Dossier | Rôle |
|---|---|
| `docs/SPEC.md` | ce que Notak doit faire, geste par geste |
| `crates/notak-core` | modèle, opérations, annuler/rétablir |
| `crates/notak-sync` | documents CRDT (à venir) |
| `crates/notak-app` | application de bureau |
| `crates/notak-serveur` | comptes, partage, relais temps réel (à venir) |
| `crates/notak-commandes` | bus de commandes, serveur MCP (à venir) |

## Licence

AGPL-3.0. Qui héberge une version modifiée doit en publier le code.
