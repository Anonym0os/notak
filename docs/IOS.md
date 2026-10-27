# Notak sur iPhone et iPad

> Le plan complet, décidé le 26/10/2026 avec le propriétaire : Tauri 2 iOS (la même coque que le bureau), une app
> universelle iPhone + iPad, l'Apple Pencil au centre, trois façons de ranger ses toiles (sur l'appareil, un dossier
> iCloud Drive ou Fichiers, un serveur Notak), des mises à jour par l'App Store, une fiche complète. Ce document est la
> référence de ce chantier : ce qui est vérifié, ce qu'il reste à cocher sur un vrai Mac, les rendez-vous avec le
> chantier de l'app de bureau, la fiche App Store et la grille d'essais. L'app de bureau : `apps/bureau/README.md`
> et `docs/MISES-A-JOUR.md`.

## Où en est le code (phase 1, posée depuis un Linux sans Xcode)

| Ce qui est là | Où |
|---|---|
| La page sait sur quoi elle tourne (`data-plateforme`, `data-idiome`, `data-mobile` sur `<html>`) | `apps/web/src/appareil.ts` |
| Le pont vers la coque ouvre les liens par le plugin `opener` sur iOS (pas de `window.open` dans WKWebView) | `apps/web/src/bureau.ts` |
| Zones sûres, clavier, gestes du système coupés | `apps/web/src/styles/ios.css`, `apps/web/src/ios/clavier.ts`, `index.html` (`viewport-fit=cover`) |
| Au premier lancement, le thème suit le système ; la vue native prend le fond du thème | `apps/web/src/ios/demarrage.ts` |
| Pas de recherche de mises à jour sur mobile (c'est l'App Store) | `edition/locale.tsx`, `local/Rangement.tsx` |
| Le nom de l'appareil dans un dossier partagé : « Notak · iPad » | `apps/web/src/local/synchro.ts` |
| Le plugin `appareil` : Rust (le nom de la plateforme donné à la page) et Swift (infos, thème, photo, haptique, clavier) | `apps/bureau/plugins/appareil/` |
| La coque compile pour mobile : mises à jour et « Enregistrer sous » sous `#[cfg(desktop)]` | `apps/bureau/src-tauri/src/lib.rs`, `Cargo.toml` |
| La configuration iOS et ce que l'app déclare au système | `src-tauri/tauri.ios.conf.json`, `src-tauri/Info.ios.plist` |
| Les droits de la page sur mobile, et ceux du bureau limités au bureau | `src-tauri/capabilities/mobile.json`, `principale.json` |
| Les scripts du Mac et l'icône | `scripts/ios.ts` (`bun run ios:init`, `ios:dev`, `ios:construire`), `scripts/icones.ts` (`icons/ios`) |
| La CI du simulateur, à la main pour l'instant | `.github/workflows/ios.yml` |
| La page `/diagnostic` : ce que sait faire la webview, ce qu'envoie le stylet, le clavier, un relevé à copier | `apps/web/src/ios/PageDiagnostic.tsx`, `diagnostic.ts` |
| La fiche App Store, fr et en, dans la disposition de `fastlane deliver`, avec un essai des limites | `apps/bureau/app-store/`, `scripts/app-store.test.ts` |
| Les pages Confidentialité et Aide de notak.app (fr puis en), citées par la fiche | `apps/site/public/confidentialite/`, `aide/`, `nginx.conf` |

**Ce qui n'a pas encore tourné** : tout ce qui demande Xcode. Le Swift n'est pas compilé, le projet `gen/apple` n'est
pas généré, l'app n'a pas été vue sur un simulateur. La phase 0 ci-dessous est faite pour ça.

## Sur le Mac : la première fois

```sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
xcode-select --install                          # si Xcode n'est pas déjà là
export APPLE_DEVELOPMENT_TEAM=XXXXXXXXXX        # l'équipe, dans developer.apple.com → Membership (ou tauri.ios.conf.json)
bun install
bun run ios:init                                # tauri ios init : apps/bureau/src-tauri/gen/apple, à commiter
bun run ios:dev                                 # Vite + l'app sur le simulateur ; bun run ios:dev -- --host pour un appareil
```

Après `ios:init`, à régler une fois dans `gen/apple` (puis commiter) :
1. `project.yml` : vérifier `deploymentTarget` (17.0, celui de `tauri.ios.conf.json`), les orientations, et que
   `Info.ios.plist` a bien été fondu dans le `Info.plist` généré (`CFBundleDocumentTypes`, `UIFileSharingEnabled`…).
2. L'icône : copier `apps/bureau/src-tauri/icons/ios/*` dans `gen/apple/Assets.xcassets/AppIcon.appiconset/` (le
   `Contents.json` fourni décrit un jeu universel 1024 px, clair, sombre et teinté). `node scripts/icones.ts` les refait.
3. `Sources/InfoPlist.strings` (fr et en) : les phrases des demandes d'autorisation (`NSCameraUsageDescription`…) et
   `CFBundleDisplayName`, pour que la demande du système parle la langue de la personne.
4. `LaunchScreen.storyboard` : fond `#EBEDEE` (le `--notak-fond` clair), le logo centré ; rien d'autre.

## Ce qu'on a vérifié dans les sources (Tauri 2.12, wry 0.57, tao, WebKit, Apple)

- `tauri ios init` génère `gen/apple/` (XcodeGen `project.yml`, `LaunchScreen.storyboard`, `Assets.xcassets`,
  `ExportOptions.plist`) ; son `.gitignore` n'exclut que `build/`, `xcuserdata/`, `Externals/` : **on commite**.
  Tauri lit un `Info.ios.plist` posé à côté de `tauri.conf.json` et le fond dans le plist généré.
- `tauri.ios.conf.json` se fond sur `tauri.conf.json` (JSON Merge Patch ; un tableau remplace l'autre en entier).
  `bundle.iOS` : `developmentTeam` (que `APPLE_DEVELOPMENT_TEAM` écrase), `minimumSystemVersion` (défaut 15.0 ;
  nous : 17.0), `frameworks`, `template`, `infoPlist`.
- `tauri ios build` : `--build-number`, `--export-method app-store-connect | release-testing | debugging`, `--ci`,
  `--no-sign`, `--open`. `tauri ios dev --host` pour un appareil ; le simulateur joint Vite sur `localhost`, et la
  page garde l'origine `tauri://localhost` (Tauri la proxifie), donc un contexte sécurisé.
- L'origine est `tauri://localhost` ; WebKit tient pour sûr `localhost` et tout schéma à gestionnaire :
  `crypto.subtle`, `navigator.locks`, `BroadcastChannel` sont là. Une adresse inconnue retombe sur `index.html` :
  `/t/<id>` et `/rapide` marchent.
- `RunEvent::Opened { urls }` existe sur iOS (tao : `application:openURL:` et liens universels) : un `.notak` ouvert
  depuis Fichiers ou Mail arrive sans plugin.
- Plugins officiels avec iOS : `dialog` (ouvrir et enregistrer, par le sélecteur de documents en export), `opener`,
  `fs` (accès sécurisé automatique aux `file://`), `haptics`, `clipboard-manager`, `deep-link`, `notification`,
  `biometric`, `barcode-scanner`. Pas `updater`. Pas de feuille de partage officielle : la nôtre (`appareil`).
- wry sur iOS **n'a pas** `window.open` / `on_new_window` (« Android / iOS : not supported ») ni les panneaux
  `alert` / `confirm` / `prompt` (WebKit répond « OK » / `false` en silence). Il a la permission micro et caméra
  (`requestMediaCapturePermission`, accordée par défaut), `<input type=file>` par le sélecteur natif, `with_webview`
  (→ `WKWebView` et `UIViewController`), et **recharge la page** quand le processus WebContent tombe.
- Plugin Swift : classe héritée de `Plugin`, `@objc func x(_ invoke: Invoke)`, `invoke.parseArgs`, `invoke.resolve`,
  `invoke.reject`, `trigger(event, data)`, `load(webview:)`, `manager.viewController` ; Rust `register_ios_plugin`,
  `run_mobile_plugin`. La page appelle `plugin:appareil|<commande>` ; la commande snake_case devient la méthode
  camelCase.
- Signature en CI : par certificat et profil (`IOS_CERTIFICATE`, `IOS_CERTIFICATE_PASSWORD`, `IOS_MOBILE_PROVISION`)
  **ou** automatique par clé App Store Connect (`APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH`). Tauri
  n'envoie pas l'IPA : `xcrun altool --upload-app --type ios --file … --apiKey … --apiIssuer …`.
- Pencil dans WebKit : Pointer Events avec `pointerType: 'pen'`, `pressure`, `tiltX/Y` depuis Safari 13 ;
  `altitudeAngle` / `azimuthAngle` depuis iOS 18.2 seulement. Le survol du Pencil dans une page web n'est documenté
  nulle part : à mesurer (phase 0, point 7). Scribble écrit dans un `contenteditable` de WKWebView.
- App Store Connect : jusqu'à 10 captures par taille ; iPhone 6,9" 1320×2868 (ou 1290×2796) et iPad 13" 2064×2752
  (ou 2048×2732), les deux requis ; nom 30, sous-titre 30, texte promotionnel 170, description 4 000, mots-clés
  100 octets ; URL de confidentialité obligatoire ; « Données non collectées » admis quand tout est traité sur
  l'appareil ; `ITSAppUsesNonExemptEncryption = NO` quand on ne fait que du HTTPS du système.
- Règle 4.8 : une connexion par un service tiers (Google…) oblige à offrir une connexion équivalente qui limite les
  données (Sign in with Apple), sauf si l'app n'utilise que son propre système de comptes, ou est un client d'un
  service tiers précis. Un serveur Notak que la personne configure est un tel service ; le serveur de démonstration
  pour la revue n'aura que e-mail et mot de passe.

## Phase 0 : à cocher sur le simulateur, puis sur un iPhone et un iPad

Une ligne par point, avec le résultat (✅, ❌ et ce qu'on a vu). Ce qui échoue devient un correctif ou une entrée de
la table des risques ; une bascule vers Capacitor ne se décide qu'après cette liste.

| # | Point | Comment | Résultat |
|---|---|---|---|
| 1 | L'app s'ouvre, la toile d'accueil se dessine, `data-plateforme="ios"` et `data-idiome` sont sur `<html>` | inspecteur Web de Safari (Développement → simulateur) | |
| 2 | `/t/<id>`, `/rapide`, `location.assign('/')` retombent sur la page | ouvrir une toile, recharger ; rouvrir une copie qui devient l'accueil | |
| 3 | IndexedDB persiste : créer une toile avec 3 images, tuer l'app, relancer ; installer un nouveau build par-dessus ; redémarrer l'appareil | `navigator.storage.estimate()` avant et après | |
| 4 | `isSecureContext`, `crypto.subtle`, `BroadcastChannel`, `navigator.locks` existent ; `showSaveFilePicker` et `serviceWorker` non | `/diagnostic`, « Ce que sait faire cette webview » : rien de marqué « pas ce qu'on attend » | |
| 5 | Un lien `https` dans une note s'ouvre dans Safari, un `mailto:` dans Mail (plugin `opener`) ; la fenêtre ne part jamais sur un autre site | cliquer | |
| 6 | `confirm()` répond `false` sans rien montrer (attendu ; d'où le remplacement des 5 appels, phase 1 suite) | supprimer un espace, changer une couleur de thème | |
| 7 | **Apple Pencil** : `pointerType === 'pen'`, `pressure` varie, `tiltX/Y` varient, `getCoalescedEvents` rend plusieurs points, `getPredictedEvents` existe ; **survol** à 1 cm sur iPad M2 : des `pointermove` arrivent-ils ? Scribble écrit dans une note ; latence ressentie dans Croquis | la page `/diagnostic` de l'app affiche les valeurs et compte les survols | |
| 8 | Clavier : `visualViewport.height` baisse quand il monte ; l'événement `clavier` de la coque arrive avec la bonne hauteur ; `--clavier` est posée | le champ de `/diagnostic`, ou éditer une note et lire la variable dans l'inspecteur | |
| 9 | Gestes : pincer zoome, un doigt tire la toile, appui long ouvre le menu ; pas de rebond de page ; pas de zoom de page au double appui ; pas de menu système sur une image | la toile | |
| 10 | `<input type=file>` propose Photos et Appareil photo (la phrase de `NSCameraUsageDescription` paraît) ; `getUserMedia` demande le micro | ajouter une image, enregistrer un son | |
| 11 | `navigator.share` avec un fichier ouvre la feuille de partage ; « Enregistrer une copie » passe par là en attendant la phase 2 | ⌘S / le panneau | |
| 12 | Mémoire : une toile de 300 images 2560 px ; le processus WebContent tombe-t-il ; la page se recharge-t-elle seule | importer un gros `.notak` | |
| 13 | La CSP (`securite.ts`, cible `bureau`) ne bloque rien : console vide d'erreurs CSP ; un lecteur YouTube collé se charge | coller un lien | |
| 14 | Thème : au premier lancement l'app suit le système ; la barre d'état est claire sur sombre ; les bords (encoche, barre d'accueil) sont du fond du thème, pas blancs | basculer le mode sombre d'iOS | |
| 15 | Rotation, Split View (iPad), Stage Manager : la mise en page suit, rien ne reste sous l'encoche | tourner, partager l'écran | |
| 16 | Mode serveur : Bibliothèque › « Sur un serveur » › adresse d'un serveur de test ; sa page de connexion, sa bibliothèque ; cookies gardés au relancement (l'app rouvre sur le serveur) ; WebSocket `/sync` ; « Toiles de cet appareil » et « Se déconnecter » dans la feuille du compte ; Google par Safari (connexion par code) | depuis l'iPhone | |
| 17 | `cargo test --manifest-path apps/bureau/plugins/appareil/Cargo.toml` et la compilation Swift passent ; `bun run ios:construire -- --build-number 1` sort une archive | terminal | |

## Rendez-vous avec le chantier de l'app de bureau

Ce chantier (`claude/youthful-hamilton-ji14zq` et la suite : accès à un serveur choisi, device flow, fichiers
ouverts, image Docker) et celui-ci partagent la coque. Pour qu'ils s'emboîtent :

- `acces()` et la porte ne doivent rien supposer du bureau : pas de menu natif obligatoire, pas d'updater (il n'est
  compilé que sous `#[cfg(desktop)]` désormais ; `MisesAJour` et `Emplacements` aussi).
- `fichiers_ouverts()` / `lire_fichier_ouvert` doivent accepter une source autre qu'`argv` : sur iOS, c'est
  `RunEvent::Opened { urls }`, avec un accès sécurisé (`startAccessingSecurityScopedResource`) que le Swift de
  `appareil` gérera. Une file commune, remplie de deux côtés.
- Fait le 27/10/2026 : `acces.rs` et `reglages.rs` tournent sur iOS (`joindre_serveur`, `revenir_ici`,
  `oublier_serveur`, `regler_ouverture`, `annuler_jonction`, `ouvrir_dans_le_navigateur`). La page d'un serveur y
  reçoit `DROITS_SERVEUR` version mobile : se signaler, revenir, Safari pour la connexion par code, `appareil:default`
  et `opener:default`, rien qui choisisse un serveur. La session est le cookie de Better Auth, gardé par WebKit dans le
  magasin de la vue ; pas de Keychain tant que la page est servie par le serveur lui-même. Côté page :
  `estPageServeurMobile`, `peutJoindreUnServeur` (`bureau.ts`), `local/ServeurTelephone.tsx`. En développement,
  `?coque=ios` imite la coque dans le navigateur (`ios/coqueSimulee.ts`) pour essayer tout le parcours.
- `ouvrirAilleurs(adresse, nom)` (le sien, pour les pièces jointes) et `ouvrirDehors` (le nôtre, `bureau.ts`) : un
  seul chemin, le sien quand il sera là ; le nôtre s'y repliera. Les 11 `window.open(…, '_blank')` à y faire passer :
  `edition/locale.tsx:74`, `edition/serveur.tsx:72`, `elements/lien/index.ts:69`, `elements/fichier/Fichier.tsx:279,290`,
  `elements/lieu/Lieu.tsx:146`, `elements/note/noeuds.ts:203`, `blocs/noeuds.ts:554`, `elements/arbre/Arbre.tsx:892,1477`,
  `elements/image/visionneuse.tsx:226`. Les 5 `alert/confirm/prompt` : `Espaces.tsx:226`, `edition/serveur.tsx:152`,
  `arbre/carte/ThemeCouleur.tsx:167`, `ThemesPersonnalises.tsx:98`, `arbre/PopoverNote.tsx:97`.
- `capabilities/principale.json` porte maintenant `"platforms": ["macOS", "windows", "linux"]` ; une capacité qu'il
  ajoute pour le serveur fait de même, et `mobile.json` prend la version mobile.
- Les textes et styles iOS vivent dans leurs fichiers (`apps/web/src/ios/`, `styles/ios.css`) ; les clés de texte iOS
  iront dans `apps/web/src/textes/ios.ts` quand son découpage par piste sera là.

## Les phases suivantes (le plan, en bref)

| Phase | Contenu | Où ça vit |
|---|---|---|
| 1 (suite) | les 5 `confirm` remplacés, `[data-bureau]` vérifié absent sur iOS, `InfoPlist.strings`, launch screen | `apps/web/src`, `gen/apple` |
| 2 | export par le sélecteur de documents et la feuille de partage, `.notak` ouvert en place, extension de partage « Partager vers Notak », note rapide depuis l'écran d'accueil | `plugins/appareil` (`exporter`, `partages_recus`), `project.yml` (cible `NotakPartage`), `enregistrement.ts` |
| 3 | le `Dossier` natif (signet sécurisé, `NSFileCoordinator`, fantômes iCloud, `beginBackgroundTask`), le miroir dans `Application Support`, l'écran des trois modes, Diagnostic (le contrat `contrat.ts` joué dans l'app) | `plugins/appareil/ios/Sources/Dossier.swift`, `local/dossierAppareil.ts`, `local/miroir.ts`, `Rangement.tsx` |
| 4 | Pencil : pression et inclinaison réelles (`trace.ts`, triplets), prédiction et canvas vivant, paume ignorée, « Pencil d'abord », double-tap (`UIPencilInteraction`), survol s'il marche ; iPad : `UIKeyCommand`, Split View ; iPhone : barre en bas, lasso à l'appui long, feuilles | `elements/croquis`, `elements/dessin`, `Toile.tsx`, `plugins/appareil` |
| 5 | version et build, « Nouveautés » après mise à jour, sauvegarde avant migration, variantes d'images 800 px, écritures finies en arrière-plan, « Signaler un problème » par courriel | `MiseAJour.tsx`, `local/fichiers.ts`, `plugins/appareil` |
| 6 | fiche fr/en, confidentialité et assistance sur notak.app, captures par simulateur, App Privacy, notes de revue, tâche `ios` de `publier-bureau.yml`, TestFlight, permission AGPL §7 | `apps/bureau/app-store/`, `apps/site/public/confidentialite`, `scripts/captures-ios.ts` |
| 7 | la grille d'essais ci-dessous, cochée sur quatre appareils, puis la sortie progressive | |

## Ce que l'app déclare au système, et pourquoi (`Info.ios.plist`)

| Clé | Pourquoi |
|---|---|
| `ITSAppUsesNonExemptEncryption = NO` | rien d'autre que le HTTPS du système ; évite le questionnaire d'export à chaque build |
| `UIRequiresFullScreen = NO`, toutes les orientations | Split View, Slide Over et Stage Manager sur iPad |
| `UIApplicationSupportsIndirectInputEvents` | trackpad et souris sur iPad : survol et clic droit arrivent en Pointer Events |
| `UIFileSharingEnabled`, `LSSupportsOpeningDocumentsInPlace` | le dossier Documents de l'app paraît dans Fichiers ; un `.notak` s'ouvre en place |
| `CFBundleDocumentTypes` + `UTExportedTypeDeclarations` (`app.notak.copie`, `.notak`, `application/x-notak`) | iOS propose Notak pour un `.notak` reçu par Mail ou dans Fichiers |
| `UIApplicationShortcutItems` « Quick note » | un appui long sur l'icône ouvre `/rapide` (phase 2 branche l'ouverture) |
| `NSCameraUsageDescription`, `NSPhotoLibraryAddUsageDescription`, `NSMicrophoneUsageDescription` | sans la phrase, iOS ferme l'app à la première demande ; traduites dans `InfoPlist.strings` |

## La fiche App Store (brouillon, à finir en phase 6 dans `apps/bureau/app-store/metadata/`)

- **Nom** : Notak (vérifier la disponibilité dans App Store Connect dès le premier jour ; repli « Notak – Tableaux
  d'idées »). **Sous-titre** fr : « Vos idées sur une toile libre » ; en : “Your ideas on a free canvas”.
- **Mots-clés** fr : `tableau,notes,idées,moodboard,toile,mind map,croquis,pencil,hors ligne,milanote` ; en :
  `board,notes,ideas,moodboard,canvas,mind map,sketch,pencil,offline,milanote`.
- **Description** (structure, fr et en) : ce que c'est en une phrase (notes, images, liens, colonnes, flèches,
  tâches, croquis sur une toile sans bords) ; « Rien ne quitte votre iPhone ou iPad » ; l'Apple Pencil ; Fichiers et
  iCloud Drive ; à plusieurs par un dossier partagé ou votre propre serveur Notak ; libre et gratuit pour de bon
  (AGPL, le dépôt) ; ce qu'il n'y a pas (compte, abonnement, publicité, suivi).
- **Catégories** : Productivité, puis Graphisme et design. **Classification** : 4+. **Prix** : gratuit, sans achat.
- **Captures** (6 à 8 par appareil, fr et en, clair et sombre) : 1 toile riche sur iPad avec le Pencil, 2 croquis au
  Pencil, 3 la toile sur iPhone en portrait, 4 la note rapide, 5 « Où sont mes toiles ? », 6 le mode sombre,
  7 l'export, 8 la carte mentale. Faites par `scripts/captures-ios.ts` (simulateurs iPhone 16 Pro Max et iPad Pro
  13", scènes nommées d'une toile de vitrine, `xcrun simctl io screenshot`).
- **Adresses** : assistance `https://notak.app/aide`, marketing `https://notak.app`, confidentialité
  `https://notak.app/confidentialite` (pages statiques d'`apps/site/public`, écrites, fr puis en ; à relire).
- **App Privacy** : « Nous ne collectons pas de données depuis cette app ». Justification : Notak n'exploite aucun
  serveur ; les toiles restent sur l'appareil ; un serveur Notak est celui de la personne (comme un client mail) ;
  ce qui sort est dit dans `docs/PUBLIER.md` (OpenStreetMap quand on cherche une adresse, les lecteurs intégrés
  quand on colle un lien, le site de l'image quand on en pose une par son adresse).
- **Notes au relecteur** : l'app marche sans compte ni réseau ; le mode serveur prend l'adresse d'un serveur que la
  personne héberge ; un serveur de démonstration et un compte (e-mail et mot de passe, aucun fournisseur tiers) sont
  donnés ; le code est libre (AGPL-3.0, dépôt).
- **Avant la soumission, une décision** : la licence est AGPL-3.0 sans CLA ; la FSF tient les conditions de l'App
  Store pour incompatibles avec la GPL. Le détenteur des droits distribue comme il veut ; le code des contributeurs
  externes, non. La parade usuelle est une permission additionnelle (AGPL §7) dans `LICENSE` qui autorise la
  distribution par l'App Store, et `CONTRIBUTING.md` qui la fait accepter.

## La grille d'essais sur appareils (phase 7)

Appareils : iPhone SE (le petit écran), iPhone 16 Pro Max, iPad mini, iPad Pro 13" avec Pencil Pro et Magic
Keyboard. Pour chacun :

- **Arrivée** : premier lancement, accueil, bandeau « Vos toiles restent sur cet appareil », thème du système.
- **Créer** : chaque type d'élément depuis la barre ; écrire au clavier, à la dictée, à Scribble ; coller un lien
  (lecteur), une image (Photos, appareil photo), du texte ; importer un `.notak`, un `.xmind`.
- **Pencil** : pression, inclinaison, paume posée, deux doigts pendant un trait, double-tap, serrage, survol,
  gomme, latence au ralenti 240 i/s, règle.
- **Fichiers** : exporter PDF, Markdown, `.notak` vers iCloud Drive et « Sur mon iPhone » ; rouvrir depuis Fichiers
  (en place) ; recevoir un `.notak` par Mail ; partager une page de Safari vers Notak.
- **Dossier** : iPad ↔ Mac (Chrome) par le même dossier iCloud Drive ; coupure réseau pendant l'écriture ; dossier
  partagé entre deux comptes Apple ; dossier en lecture seule ; iCloud plein ; Diagnostic → « Éprouver le dossier ».
- **Serveur** : connexion, Google par Safari, hors ligne puis retour, session expirée, « Changer de serveur ».
- **Système** : rotation, Split View, Slide Over, Stage Manager, mode sombre, Réduire les animations, VoiceOver sur
  la bibliothèque et les réglages, stockage plein, économie d'énergie, mise à jour N → N+1 avec des toiles,
  désinstallation puis restauration iCloud, 1 000 éléments et 300 images.

Chaque écart devient un commit ou une ligne « connu » des notes de version (`docs/NOUVEAUTES.md`).

## Risques et parades

| Risque | Parade |
|---|---|
| IndexedDB perdu par WebKit | le miroir en fichiers (phase 3) ; s'il faut, il devient la source et IndexedDB un cache |
| Apple refuse un « simple site web » (4.2) | Fichiers, extension de partage, Pencil, hors ligne, dossier iCloud ; le mode local par défaut n'affiche rien de distant |
| Règle 4.8 | serveur de démonstration sans fournisseur tiers ; `AUTO-HEBERGER.md` : qui active Google devrait activer Apple |
| AGPL et App Store | permission §7 à décider avant la soumission |
| Mémoire sur iPhone | variantes d'images, révocation des `blob:`, mesure en phase 5 |
| Latence du trait au Pencil | canvas vivant et prédiction ; sinon un calque natif `PencilKit` pour le trait en cours, isolé dans le plugin |
| Deux chantiers sur la même coque | fichiers séparés ; les points de contact ci-dessus, posés après sa fusion |
| « Notak » pris sur l'App Store | vérifier le premier jour |
