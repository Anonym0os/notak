# Notak de bureau

L'app de bureau de Notak, faite avec [Tauri 2](https://tauri.app) : l'édition locale de Notak (celle de notak.app),
embarquée dans l'application. Pas de compte, pas de serveur : les tableaux vivent sur l'ordinateur, l'app s'ouvre sans
réseau, et elle se met à jour d'elle-même, de versions signées (`docs/MISES-A-JOUR.md`).

```
apps/bureau/
  src-tauri/
    tauri.conf.json          la fenêtre, la CSP, l'identité et les icônes ; l'application embarquée (apps/web/dist-bureau)
    tauri.publication.json   ce que seule une version publiée ajoute : l'adresse des mises à jour et la clé publique
    capabilities/            ce que la page a le droit de demander à la coque
    Info.plist               ajouté à celui de macOS : la phrase qui accompagne la demande du micro
    Cargo.toml               la coque Rust
    src/lib.rs               le lancement, la fenêtre, l'enregistrement des fichiers
    src/navigation.rs        la fenêtre ne va que sur l'application ; un lien vers un autre site part dans le navigateur
    src/mise_a_jour.rs       chercher, vérifier, poser une mise à jour
    icons/                   fabriquées par `node scripts/icones.ts` (à la racine du dépôt) à partir du logo
```

## Sur iPhone et iPad

La même coque compile pour iOS (`tauri ios`), avec le natif en Swift dans `plugins/appareil/`. Tout est dans
[`docs/IOS.md`](../../docs/IOS.md) : la première fois sur le Mac (`bun run ios:init`, `bun run ios:dev`), ce qui est
vérifié, ce qu'il reste à cocher, la fiche App Store et la grille d'essais.

```
apps/bureau/
  plugins/appareil/        le plugin « appareil » : Rust (le nom de la plateforme donné à la page) et Swift (iOS)
  src-tauri/
    tauri.ios.conf.json    ce qui change sur iOS (fenêtre sans barre de titre, version minimale, équipe Apple)
    Info.ios.plist         ce que l'app déclare au système (types de fichiers, orientations, autorisations)
    capabilities/mobile.json   les droits de la page sur mobile
    icons/ios/             l'icône 1024 px, claire, sombre et teintée (node scripts/icones.ts)
    gen/apple/             le projet Xcode, généré par `bun run ios:init`, commité
```

## Ce qu'il faut

- [Rust](https://rustup.rs) (stable) ;
- les outils de compilation de la plateforme : Xcode Command Line Tools sur macOS, WebView2 et les « Build Tools »
  de Visual Studio sur Windows, `webkit2gtk-4.1` et ses en-têtes sur Linux
  (voir [les prérequis de Tauri](https://tauri.app/start/prerequisites/)) ;
- Bun, déjà là pour le reste du dépôt : il lance la ligne de commande de Tauri sans l'installer au dépôt.

## Travailler dessus

```sh
bun run bureau:dev          # à la racine : Vite (l'édition locale) puis la fenêtre, rechargée à chaque changement
```

La première compilation de Rust prend plusieurs minutes (Tauri et ses dépendances) ; les suivantes sont courtes. Les
essais de la coque : `cargo test --manifest-path apps/bureau/src-tauri/Cargo.toml` (après `bun run build:bureau`).

## Construire l'application

```sh
bun run bureau:construire   # à la racine : construit l'édition locale, puis l'app
```

Les paquets sortent dans `src-tauri/target/release/bundle/` : `.app` et `.dmg` sur macOS, `.msi` et `.exe` sur Windows,
`.deb`, `.rpm` et `.AppImage` sur Linux. On ne construit que pour la plateforme sur laquelle on est. Une app construite
ainsi ne se met pas à jour seule ; les versions publiées, si : c'est la CI qui les construit et les signe, à partir
d'une étiquette (`bun run nouvelle-version x.y.z`, voir `docs/MISES-A-JOUR.md`).

### Une fenêtre sur un serveur Notak

Pour le travail à plusieurs en temps réel, la coque peut aussi s'ouvrir sur un serveur Notak (l'édition serveur) :

```sh
bun run bureau:construire -- --serveur https://notak.exemple.fr
```

Seules les pages de ce serveur reçoivent alors les droits de la coque (enregistrer un fichier, photographier la
fenêtre pour un signalement). Une telle coque ne se met pas à jour seule : son contenu, servi par le serveur, l'est à
chaque ouverture. Les webviews (macOS surtout) refusent le HTTP simple hors `localhost` : l'adresse est en `https`.

## Ce qui est réglé exprès

- **L'application est embarquée, et ne parle qu'à ce que permet sa CSP** (`app.security.csp`, tirée de
  `packages/tableau/src/securite.ts` ; un essai vérifie qu'elle n'a pas dérivé). Tauri n'ajoute pas ses empreintes à
  `style-src` (`dangerousDisableAssetCspModification`) : un navigateur ignorerait sinon `'unsafe-inline'`, et l'éditeur
  perdrait ses styles. **Ne jamais changer l'identifiant (`app.notak.bureau`) ni le schéma des adresses** : les tableaux
  vivent dans le stockage de cette origine ; en changer, c'est les perdre de vue.
- **La fenêtre reste chez elle** (`src/navigation.rs`) : elle est créée par la coque (`create: false` dans la
  configuration) pour y brancher deux gardes. Toute navigation vers autre chose que l'application et ses lecteurs
  intégrés est refusée ; une nouvelle fenêtre (`target="_blank"`, `window.open`) part dans le navigateur de la
  personne, et seulement pour le web, un courriel ou un numéro. La page fait passer chaque lien cliqué par là
  (`apps/web/src/bureau.ts`).
- **Ce que la page peut demander** (`capabilities/principale.json`), et rien d'autre : déplacer la fenêtre, l'agrandir
  d'un double clic, enregistrer un fichier là où la personne le choisit, et demander puis poser une mise à jour. La
  coque écrit au seul chemin choisi dans la fenêtre « Enregistrer sous », par un fichier voisin posé d'un coup ; celui
  de la copie `.notak` reste, pour que ⌘S la réécrive. La page ne choisit ni l'adresse des mises à jour, ni la clé, ni
  la version.
- **Le glisser-déposer de fichiers est laissé à la page** (`dragDropEnabled: false`). Sans cela, Tauri intercepte les
  fichiers lâchés sur la fenêtre et Notak ne reçoit plus les images déposées sur la toile.
- **La barre de titre se fond dans la barre d'îlots** (`titleBarStyle: "Overlay"`) : les trois boutons de la fenêtre
  se posent à gauche de la barre du haut du tableau, de la carte et du document, qui leur laisse 96 px ; comme chez
  Xmind (`trafficLightPosition` x 20, y 36 : à 20 px du bord, centrés à 34 px du haut), les îlots de 36 px, posés à
  16 px du haut, se centrent dessus. Pas de cadre autour de la page : la fenêtre a déjà son bord. Le panneau de gauche
  de la carte laisse aux boutons leur rangée. La bande du tableau sert de poignée pour déplacer la fenêtre
  (`data-tauri-drag-region`). L'application web le sait par `data-bureau` sur la racine du document.
- **Pas de service worker** : l'app embarque ses fichiers et se met à jour par la coque ; un service worker y servirait
  une vieille version par-dessus la nouvelle (`apps/web/src/pwa.ts` le retire s'il en reste un).
