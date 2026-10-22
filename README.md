# Notak

Des tableaux visuels libres, à plusieurs : notes, images, liens, colonnes, flèches, tâches, croquis.
Une alternative open source à Milanote, écrite en Rust natif.

> État : spécification. Rien à installer pour l'instant.

## Pile

- Interface : `eframe` / `egui`, toile dessinée par `vello` sur `wgpu`
- Texte : `parley`
- Collaboration : CRDT `yrs` (compatible Yjs)
- Serveur : `axum`, Postgres

## Dépôt

| Dossier | Rôle |
|---|---|
| `docs/SPEC.md` | ce que Notak doit faire, geste par geste |
| `crates/notak-core` | modèle, opérations, annuler/rétablir |
| `crates/notak-sync` | documents CRDT |
| `crates/notak-app` | application de bureau |
| `crates/notak-serveur` | comptes, partage, relais temps réel |
| `crates/notak-commandes` | bus de commandes, serveur MCP |

## Licence

AGPL-3.0. Qui héberge une version modifiée doit en publier le code.
