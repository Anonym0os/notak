# Notak de bureau

La coque de bureau de Notak, faite avec [Tauri 2](https://tauri.app) : une fenêtre sur l'application web que sert
le serveur de Notak. Elle ne contient ni l'application ni ses données : tout vit sur le serveur, comme dans un
navigateur, mais dans une fenêtre à part, avec sa propre icône et son entrée dans le Dock ou la barre des tâches.

```
apps/bureau/
  src-tauri/
    tauri.conf.json   la fenêtre, l'adresse du serveur, l'identité et les icônes de l'application
    Cargo.toml        la coque Rust (une seule dépendance : tauri)
    src/              main.rs et lib.rs : le lancement, rien de plus
    icons/            fabriquées par `node scripts/icones.ts` (à la racine du dépôt) à partir du logo
```

## Ce qu'il faut

- [Rust](https://rustup.rs) (stable) ;
- les outils de compilation de la plateforme : Xcode Command Line Tools sur macOS, WebView2 et les « Build Tools »
  de Visual Studio sur Windows, `webkit2gtk-4.1` et ses en-têtes sur Linux
  (voir [les prérequis de Tauri](https://tauri.app/start/prerequisites/)) ;
- Bun, déjà là pour le reste du dépôt : il lance la ligne de commande de Tauri sans l'installer au dépôt.

## À quelle adresse la fenêtre s'ouvre

`build.frontendDist`, dans `src-tauri/tauri.conf.json`, est l'adresse du serveur Notak, `http://localhost:3005` par
défaut (celle de `bun run serveur`). Pour une application destinée à un serveur en ligne, on la remplace au moment de
construire, sans toucher au fichier :

```sh
bunx @tauri-apps/cli@2.12.4 build --config '{"build":{"frontendDist":"https://notak.exemple.fr"}}'
```

`build.devUrl` (`http://localhost:5173`, le Vite de `bun run dev`) ne sert que pour `tauri dev`.

## Travailler dessus

Dans un terminal, le serveur de développement du dépôt ; dans l'autre, la coque :

```sh
bun run dev                                   # à la racine : Vite, sur le port 5173
cd apps/bureau/src-tauri
bunx @tauri-apps/cli@2.12.4 dev               # ouvre la fenêtre sur http://localhost:5173
```

La première compilation de Rust prend plusieurs minutes (Tauri et ses dépendances) ; les suivantes sont courtes.

## Construire l'application

Il faut d'abord un serveur à l'adresse choisie (voir plus haut). Puis :

```sh
cd apps/bureau/src-tauri
bunx @tauri-apps/cli@2.12.4 build
```

Les paquets sortent dans `src-tauri/target/release/bundle/` : `.app` et `.dmg` sur macOS, `.msi` et `.exe` sur Windows,
`.deb`, `.rpm` et `.AppImage` sur Linux. On ne construit que pour la plateforme sur laquelle on est.

## Ce qui est réglé exprès

- **Le glisser-déposer de fichiers est laissé à la page** (`dragDropEnabled: false`). Sans cela, Tauri intercepte les
  fichiers lâchés sur la fenêtre et Notak ne reçoit plus les images déposées sur la toile.
- **La barre de titre se fond dans la barre d'îlots** (`titleBarStyle: "Overlay"`) : les trois boutons de la fenêtre
  se posent à gauche de la barre du haut du tableau, de la carte et du document, qui leur laisse 96 px ; comme chez
  Xmind, ils sont descendus dans la feuille (`trafficLightPosition` x 20, y 44 : centrés à 42 px du haut), et les îlots
  de 36 px se centrent dessus. La bande du
  tableau sert de poignée pour déplacer la fenêtre (`data-tauri-drag-region`). L'application web le sait par
  `data-bureau` sur la racine du document.
- **Pas de plugin, pas de commande Rust, un seul droit** (`capabilities/principale.json`) : déplacer la fenêtre et
  l'agrandir d'un double clic. Pour le reste, la page est une page web ordinaire, sans accès à la machine.
- **Pour un serveur distant, une adresse en `https`** : les webviews (macOS surtout) refusent le HTTP simple hors
  `localhost`. La connexion à Notak vit dans la fenêtre, comme dans un navigateur.

## Hors ligne

La coque ne garde rien : sans réseau, la fenêtre montre ce que le service worker de l'application web a gardé (voir
`apps/web/pwa/`), et les modifications faites sans réseau partent au retour de la connexion, comme dans un navigateur.
Les webviews de Tauri sur Linux (WebKitGTK) ne gèrent pas toujours les service workers : le hors ligne y dépend de la
version installée.
