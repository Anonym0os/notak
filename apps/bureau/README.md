# Notak de bureau

L'app de bureau de Notak, faite avec [Tauri 2](https://tauri.app) : l'édition locale de Notak (celle de notak.app),
embarquée dans l'application. Par défaut, ni compte ni serveur : les tableaux vivent sur l'ordinateur, l'app s'ouvre
sans réseau, et elle se met à jour d'elle-même, de versions signées (`docs/MISES-A-JOUR.md`). Pour travailler à
plusieurs, la même app peut aussi joindre un serveur Notak, choisi dans l'app (voir plus bas).

```
apps/bureau/
  src-tauri/
    tauri.conf.json          la fenêtre, la CSP, l'identité et les icônes ; l'application embarquée (apps/web/dist-bureau)
    tauri.publication.json   ce que seule une version publiée ajoute : l'adresse des mises à jour et la clé publique
    capabilities/            ce que la page embarquée a le droit de demander à la coque
    Info.plist               ajouté à celui de macOS : la phrase qui accompagne la demande du micro
    Cargo.toml               la coque Rust
    src/lib.rs               le lancement, la fenêtre, l'enregistrement des fichiers
    src/navigation.rs        la fenêtre ne va que sur l'application et le serveur choisi ; qui appelle la coque
    src/appel.rs             ce qu'apporte un appel de la page (octets, nom de fichier), et ce que la coque répond
    src/acces.rs             joindre un serveur Notak, ses droits, en revenir
    src/reglages.rs          bureau.json : où s'ouvre Notak, le serveur mémorisé, les mises à jour automatiques
    src/fichiers.rs          ouvrir une pièce jointe dans son application ; les copies .notak ouvertes depuis le système
    src/menu.rs              macOS : « Changer de serveur… » et « Toiles de cet ordinateur » dans le menu Notak
    src/mise_a_jour.rs       chercher, vérifier, poser une mise à jour
    icons/                   fabriquées par `node scripts/icones.ts` (à la racine du dépôt) à partir du logo
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

## Un serveur Notak, choisi dans l'app

Pour le travail à plusieurs en temps réel, la personne tape l'adresse de son serveur Notak (l'édition serveur) dans
l'app ; il n'y a plus de coque construite pour un serveur (`--serveur` n'existe plus). La coque (`src/acces.rs`) :

- **relit l'adresse** : `https` seulement (du HTTP simple pour `localhost` et `127.0.0.1`, les webviews refusant le
  reste ; c'est aussi ce que vaut `localhost:3005` tapé sans schéma), sans identifiants, paramètres ni chemin, pas
  d'IPv6, un nom international en punycode ; elle n'en garde que l'origine ;
- **vérifie que c'est Notak** avant d'y aller : `GET /api/sante` (sans suivre de redirection, 10 s, 64 Kio au plus)
  doit dire `produit: "notak"` et sa propre origine. Un serveur qui se dit ailleurs, ou qui redirige, n'emmène pas la
  fenêtre : l'app propose l'adresse, la personne décide. Un serveur trop ancien (`/api/instance` sans `/api/sante`), un
  certificat refusé, un délai dépassé se disent comme tels ;
- **donne ses droits aux pages de ce serveur, et à elles seules** : une capacité par origine, ajoutée à la volée ;
- **envoie la fenêtre sur le serveur**, et l'en ramène si sa page ne se signale pas dans les 20 s (`?acces&erreur=muette`).
  La page se signale une fois son premier écran là (`signalerVie`, dans `apps/web/src/bureau.ts`), pas à son premier
  script : une page qui charge sans que l'app vienne ramène la fenêtre.

Le serveur se mémorise dans `bureau.json` (le dossier de configuration de l'app), avec où s'ouvre Notak au démarrage et
la recherche automatique des mises à jour : à l'ouverture suivante, la page embarquée relit ces réglages et rejoint le
serveur si c'est là que Notak s'ouvre. Où s'ouvre Notak se choisit dans les réglages de l'app (`regler_ouverture`),
depuis les toiles d'ici. Revenir aux toiles de cet ordinateur depuis un serveur (la page, ou le menu Notak sur macOS)
n'est qu'un coup d'œil : la coque ramène la fenêtre sur `?ici`, ne retient rien, et arrête la jonction en cours. La page
embarquée ne joint jamais un serveur d'après les paramètres de son adresse : `?acces` et `?ici` ne font qu'empêcher une
connexion, jamais en causer une. « Pour cette fois seulement », pendant qu'un serveur tarde, arrête la jonction, même
quand la fenêtre est déjà partie chercher sa page : la coque la ramène alors (une nouvelle navigation remplace la sienne,
ce que `window.stop` ne garantit pas partout). « Oublier ce serveur » efface aussi ses cookies, et Notak s'ouvre de
nouveau ici. L'app d'un serveur se met à jour comme les autres : c'est la même.

« Copier mes toiles sur… » confie à la coque une copie `.notak` des toiles d'ici pour le serveur mémorisé
(`confier_copie`) : seule la page de ce serveur la trouve dans la file. La copie s'en va si la jonction échoue, si l'on
joint un autre serveur, si la fenêtre revient chez elle ou si l'on oublie le serveur ; une file déjà pleine de copies
ouvertes depuis le système se dit comme telle (`file_pleine`).

## Ce qui est réglé exprès

- **L'application est embarquée, et ne parle qu'à ce que permet sa CSP** (`app.security.csp`, tirée de
  `packages/tableau/src/securite.ts` ; un essai vérifie qu'elle n'a pas dérivé). Tauri n'ajoute pas ses empreintes à
  `style-src` (`dangerousDisableAssetCspModification`) : un navigateur ignorerait sinon `'unsafe-inline'`, et l'éditeur
  perdrait ses styles. **Ne jamais changer l'identifiant (`app.notak.bureau`) ni le schéma des adresses** : les tableaux
  vivent dans le stockage de cette origine ; en changer, c'est les perdre de vue.
- **La fenêtre reste chez elle** (`src/navigation.rs`) : elle est créée par la coque (`create: false` dans la
  configuration) pour y brancher deux gardes. Toute navigation vers autre chose que l'application, le serveur choisi
  (le temps qu'on y est) et leurs lecteurs intégrés est refusée ; une nouvelle fenêtre (`target="_blank"`,
  `window.open`) part dans le navigateur de la personne, et seulement pour le web, un courriel ou un numéro. La page
  fait passer chaque lien cliqué par là (`apps/web/src/bureau.ts`) ; un lien de l'application se suit sur place.
- **Ce que chaque page peut demander**, et rien d'autre ; chaque commande vérifie en plus qui l'appelle
  (`src/appel.rs`), car un serveur quitté garde sa capacité jusqu'au redémarrage (Tauri n'en retire pas).
  - La page embarquée (`capabilities/principale.json`) : déplacer la fenêtre, l'agrandir d'un double clic,
    enregistrer un fichier là où la personne le choisit, demander puis poser une mise à jour, lire et changer les
    réglages de la coque (joindre un serveur, en revenir, l'oublier, où s'ouvre Notak, les mises à jour automatiques),
    arrêter une jonction en cours, ouvrir une pièce
    jointe, lire les copies `.notak` ouvertes depuis le système, en confier une au serveur qu'on va joindre, et écouter
    leur arrivée.
  - Les pages du serveur choisi (`DROITS_SERVEUR`, dans `src/acces.rs`) : la même chose, moins ce qui choisit un
    serveur ou règle la coque, plus la photo de la fenêtre pour un signalement et l'ouverture d'une de ses pages dans
    le navigateur (la connexion par code). Leur CSP laisse passer le canal de la coque (`ipc:`, `http://ipc.localhost`).
  - Des essais vérifient que chaque permission nommée existe (une inconnue arrêterait l'app au moment de joindre le
    serveur), la liste entière des commandes de chaque page, que chaque commande de `build.rs` sert l'une d'elles, et
    que chaque commande demandée par `apps/web/src/bureau.ts` existe.

  La coque écrit au seul chemin choisi dans la fenêtre « Enregistrer sous », par un fichier voisin posé d'un coup ;
  celui de la copie `.notak` reste, pour que ⌘S la réécrive. Changer de page (vers un serveur, ou en revenir) oublie
  ces chemins : une page ne réécrit jamais un fichier choisi par l'autre. Ce qu'enregistre la page d'un serveur est
  marqué comme venu d'Internet (`Zone.Identifier` sous Windows, `com.apple.quarantine` sur macOS), comme un
  téléchargement : un programme ne s'y lance pas sans l'avertissement du système. La page ne choisit ni l'adresse des
  mises à jour, ni la clé, ni la version.
- **Une pièce jointe s'ouvre dans son application** (`src/fichiers.rs`) : images, PDF, sons, vidéos, textes,
  documents de bureautique sans macros, posés dans le cache de l'app (vidé à chaque lancement) puis ouverts par le
  système. Jamais un SVG, une page HTML, un script, un programme ni une archive : la page propose alors de
  l'enregistrer. Cinq au plus en dix secondes, 64 Mio chacune ; sous Windows et macOS, marquées comme venues
  d'Internet (Office les ouvre en mode protégé). Pour la page d'un serveur, la coque demande d'abord, dans une boîte à
  elle qui nomme le fichier et le serveur (« L'ouvrir avec l'application de votre ordinateur ? ») ; une seule boîte à
  la fois. Un lien `download` de la page passe aussi par « Enregistrer sous ».
- **Les copies `.notak` s'ouvrent avec Notak** (`bundle.fileAssociations`, type `app.notak.copie`) : un double clic
  dans le Finder (macOS), ou le fichier passé en argument (Windows, Linux). Une seule Notak tourne à la fois
  (`tauri-plugin-single-instance`, sur D-Bus sous Linux) : une seconde lancée passe ses fichiers à la première et
  s'arrête. La coque garde chaque copie ouverte en file, prévient la page (`notak://fichier-ouvert`) et lui en donne
  les octets par morceaux de 16 Mio (1 Gio au plus).
- **Les liens `target="_blank"` passent par la garde de la coque** : le script du plugin d'ouverture qui les
  intercepterait est coupé (`open_js_links_on_click(false)`), sa commande n'étant permise à aucune page. La webview
  n'ayant pas de bloqueur de fenêtres, trois adresses au plus partent vers le navigateur ou la messagerie en dix
  secondes.
- **La page embarquée n'a que son adresse exacte** : `tauri://localhost`, ou `http://tauri.localhost` sous Windows,
  sans port ; `http://tauri.localhost:9999` serait un programme de la machine qui écoute ce port.
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
