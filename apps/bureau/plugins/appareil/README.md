# Le plugin « appareil »

Le natif de la coque Notak sur iPhone et iPad, en Swift (`ios/Sources/AppareilPlugin.swift`), et le Rust qui le
branche (`src/lib.rs`). Partout, le plugin dit à la page sur quoi elle tourne (`window.__NOTAK_PLATEFORME__`) ; sur
iOS, il porte ce qu'une page ne sait pas faire. La page l'appelle par `invoke('plugin:appareil|<commande>')`
(`apps/web/src/appareil.ts`, `apps/web/src/ios/`), avec les seuls droits de `capabilities/mobile.json`.

| Commande (`build.rs`) | Méthode Swift | Rôle |
|---|---|---|
| `infos` | `infos` | plateforme, idiome (téléphone, tablette), système, modèle, version et build de l'app, zones sûres |
| `regler_theme` | `reglerTheme` | fond de la vue native et style de la barre d'état, au thème de la page |
| `capturer_fenetre` | `capturerFenetre` | la page peinte, en PNG (base64), pour un signalement |
| `haptique` | `haptique` | un retour au doigt : `leger`, `moyen`, `fort`, `selection`, `succes`, `avertissement`, `erreur` |
| `register_listener`, `remove_listener` | (Tauri) | écouter les événements du plugin |

Événements : `clavier` `{ hauteur, duree }` (px CSS, secondes), avant que le clavier n'arrive ou ne parte.

Les phases suivantes (`docs/IOS.md`) ajoutent ici l'export de fichiers, le dossier choisi dans Fichiers (le `Dossier`
natif), l'ouverture d'un `.notak` reçu, l'extension de partage et le double-tap de l'Apple Pencil.

Le paquet Swift ne se compile que sur un Mac (`bun run ios:dev`) : cette partie du dépôt n'a pas d'essai dans la CI
Linux ; `cargo test --manifest-path apps/bureau/plugins/appareil/Cargo.toml` vérifie la partie Rust partout.
