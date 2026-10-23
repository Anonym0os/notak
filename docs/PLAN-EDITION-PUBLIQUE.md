# Plan : l’édition publique de Notak (sans compte, sans serveur, dans le dossier de chacun)

## Contexte

Le propriétaire veut publier Notak gratuitement, sans payer de stockage, sans service tiers. Il a précisé en
répondant aux questions : **rien ne doit dépendre de son serveur**, tout est open source, et si des gens travaillent
ensemble, **ils se relient à leur façon**. Les cartes et adresses doivent rester chez l'utilisateur.

Le design de départ est dans `docs/PUBLIER.md` et `docs/STOCKAGE.md`. Ce plan les corrige et dit dans quel ordre
le construire.

### Le changement de cap, et pourquoi il rend l'ensemble plus solide
Le travail à plusieurs ne passe plus par un relais à nous. Il passe par **un dossier partagé** avec l'outil de
partage que les gens ont déjà : un dossier partagé iCloud Drive, OneDrive, Dropbox, Google Drive, Nextcloud, ou
Syncthing. Le format du dossier est déjà fait pour que plusieurs appareils y écrivent sans conflit, chacun dans son
sous-dossier. Plusieurs personnes, ce n'est que plusieurs appareils de plus.

- Disparaissent : notre serveur, coturn, le transit, et presque tout le protocole cryptographique de partage. Les
  failles graves C1, C2 et C8 de la relecture tenaient à ce protocole ; elles ne s'appliquent plus.
- Les droits sont ceux du nuage. Un dossier partagé en lecture seule rend le tableau en lecture seule dans Notak.
  Retirer quelqu'un se fait dans iCloud ou OneDrive, comme pour n'importe quel dossier.
- Le prix, dit franchement :
  - **pas de temps réel** : les changements arrivent au rythme du nuage, de quelques secondes à quelques minutes,
    sans curseurs en direct ;
  - **les participants doivent partager le même service** : deux personnes sur iCloud, ou deux sur Nextcloud, etc.
  - Le temps réel reste possible plus tard, par un relais open source que n'importe qui héberge et choisit dans les
    réglages. Il n'est jamais nécessaire et n'est pas activé par défaut.

### Verdict honnête : sûr et solide ?
Oui sur le principe : Joplin, par exemple, synchronise par fichiers dans Dropbox, OneDrive et WebDAV. Mais il faut
corriger les documents. Une relecture critique a trouvé ces failles, toutes réparables ; leur correction fait partie
du plan :

| | Faille | Correction |
|---|---|---|
| C3 | « l'appareil perdu ne reçoit plus rien » est faux : il reste connecté au nuage | le dire, et renvoyer vers le retrait de l'appareil dans le compte iCloud/OneDrive |
| C4 | un appareil cloné (restauration, deux onglets) écrit sous le même nom, ce qui écrase en silence | un seul onglet écrit (Web Locks), suffixe aléatoire par processus, registre des fichiers écrits, nouvel id en cas d'anomalie |
| C5 | le compactage efface l'ancien journal avant que la nouvelle base ait quitté l'appareil | suppression en deux temps : effacer seulement quand un autre appareil a vu la nouvelle base |
| C6 | un fichier lu dans le désordre reste « en attente » dans Yjs et se perd à la fermeture | ne marquer un fichier comme lu que si Yjs n'a plus rien en attente |
| C7 | une valeur mal formée dans un tableau fait planter toutes les copies | validation à la lecture, une barrière d'erreur par élément, adresses filtrées à l'affichage |
| C8 | un participant malveillant peut usurper un identifiant Yjs et faire diverger les copies | détection de divergence par empreinte, et réparation depuis les versions ; le reste est accepté, comme pour tout dossier partagé |

Autres points :
- **iCloud** : le conteneur iCloud propre à l'app n'est pas le dossier qu'on choisit à la main sur Mac ou Windows, et
  il ne se partage pas. On abandonne le conteneur : **partout, un dossier choisi dans iCloud Drive**. Sur iPhone et
  iPad, il est choisi avec le sélecteur de Fichiers et l'accès est retenu. Cela marche aussi pour les dossiers
  partagés. À valider par un essai sur appareil.
- Chrome sur Mac peut refuser les dossiers sous `~/Library`, où vivent iCloud, OneDrive et Dropbox : essai avant de
  le promettre.
- Safari efface tout après 7 jours sans visite, sauf si le site est ajouté à l'écran d'accueil.
- **Versions** : deltas quotidiens et copie hebdomadaire, seulement pour les tableaux modifiés. Sinon on remplit un
  iCloud gratuit.
- **Une base par tableau**, pas une pour tout l'espace.
- **Deux premiers lancements en même temps** (un dossier « Notak 2 ») : rien dans `notak.json` ne doit être unique,
  et Notak propose de fusionner les dossiers frères.
- **« Oublier » un appareil** : on écrit une pierre tombale au lieu d'effacer le dossier d'un autre appareil.

Accepté, et à dire : un appareil perdu garde ce qu'il avait. Un participant malveillant qui peut écrire dans le
dossier partagé peut abîmer le tableau ; chacun a ses versions dans son dossier privé pour le restaurer.

## Ce qui change dans l'expérience
- **Partager** = « Partager un dossier » : Notak crée `Notak partagé – <nom>/` dans le nuage choisi, y range le
  tableau et **tout son arbre de sous-tableaux** (décision du propriétaire), puis ouvre la fenêtre de partage du
  système (iCloud, OneDrive…). Notak n'envoie rien lui-même.
- **Rejoindre** = ouvrir le dossier partagé reçu (« Ouvrir un dossier partagé » dans Notak). Le tableau apparaît sous
  « Partagés avec moi ».
- Au lieu de curseurs en direct : « Léa a modifié il y a 3 min » sur les éléments (on réutilise `recents` et la
  mise en évidence existante), tiré de `appareil.json` et du journal.
- **Aperçus de liens** : calculés sur l'appareil. L'application de bureau ou mobile lit la page depuis la machine,
  sans les limites de CORS du navigateur. Dans le navigateur, on n'affiche que l'adresse. Plus aucun `/api/apercu`.
- **Cartes et adresses** : l'appareil de l'utilisateur interroge directement OpenStreetMap, jamais par nous. La carte
  ne se charge qu'au clic, et le fournisseur se règle (on peut en mettre un hébergé chez soi).
- Le site notak.app ne sert que des fichiers statiques, qu'on peut copier n'importe où. Les applications installées
  ne s'en servent plus du tout.

## Phases (chacune livrable et testable seule)

### Phase 0 : durcir ce qui existe (profite aussi à l'édition serveur)
- `packages/tableau/src/coeur/magasinYjs.ts` : garde dans `construire()`. Nouveau `coeur/valider.ts`
  (`normaliserElement` par type, branché sur `elements/registre.ts`).
- Barrière d'erreur par élément ; adresses sûres à l'affichage dans `elements/lien/Lien.tsx`,
  `elements/taches/Taches.tsx`, `elements/lieu/Lieu.tsx` (réutiliser `elements/lien/adresse.ts`).
- `elements/lieu` et `apps/web/src/geocodage.ts` : carte chargée au clic, fournisseur réglable.
- Réécrire `docs/PUBLIER.md` et `docs/STOCKAGE.md` selon ce plan : dossiers partagés, plus de relais requis,
  corrections C3 à C8, iCloud par dossier choisi.
- Tests : documents empoisonnés dans `coeur/magasinYjs.test.ts`.

### Phase 1 : le format du dossier et le faux logiciel de synchro (TypeScript pur)
Nouveau `packages/tableau/src/dossier/` :
- `dossier.ts` : interface `Dossier` (`lister` avec taille et drapeau « fantôme », `lire` → octets | `'absent'` |
  `'fantome'`, `ecrireAtomique`, `supprimer`, `surveiller?`, `telecharger?`, `lectureSeule?`) ; `contrat.ts` : suite
  de tests commune à toutes les réalisations ; `dossierMemoire.ts`.
- `fichierNotak.ts` : en-tête `NOTAK`, enregistrements `(tableau, mise à jour)`, `fflate`, longueur, SHA-256.
- `journal.ts` : écrit le diff depuis le dernier vecteur d'état écrit, par tableau ; `.tmp` puis renommage ; suffixe
  aléatoire ; registre des fichiers écrits. Tout changement qui ne vient pas de ce dossier y est écrit.
- `lecteur.ts` : absorption, avec la règle « plus rien en attente » (C6).
- `compacteur.ts` : une base par tableau, suppression en deux temps (C5).
- `appareils.ts` : `appareil.json` (nom, couleur, personne), `vu`, pierres tombales, nouvel id après clonage (C4).
- `versions.ts` : deltas quotidiens et copie hebdomadaire, dans le dossier **privé** de chaque appareil, y compris
  pour les tableaux partagés.
- `divergence.ts` : empreinte de l'état par tableau publiée dans `vu`, pour comparer les copies (C8).
- `essais/fauxSynchro.ts` : faux nuage à graine fixée. Il retarde, réordonne, tronque, crée des copies de conflit
  (formats iCloud, Dropbox, OneDrive, Syncthing), des fantômes `.icloud`, supprime avant de créer, restaure un vieil
  état, plante entre `.tmp` et renommage, ferme et rouvre les documents, clone un appareil, ouvre deux onglets, fait
  deux premiers lancements, et met **plusieurs personnes** sur un même dossier partagé, dont une en lecture seule.
- `proprietes.test.ts` : E1 (rien de perdu), E2 (convergence), E3 (écrivain unique, ou anomalie détectée et
  réparée), E6 (taille bornée). Graine rejouable par `NOTAK_GRAINE`. Banc de croissance des documents.
- Dépendance de développement : `fast-check`.

### Phase 2 : l'édition locale de l'application web
- `apps/web/vite.config.ts` : `VITE_EDITION=locale|serveur`. `apps/web/src/main.tsx` se scinde en
  `edition/serveur.tsx` (le code actuel, déplacé tel quel) et `edition/locale.tsx`, sans Compte, Partage (serveur),
  Cloche, Activite, Favori, Verrou, PagePublique, Arrivees ni Envoyer.
- `packages/tableau/src/reseauLocal.ts` : `Reseau` sur y-indexeddb (`notak:local:<espace>:<tableau>`), connexion
  toujours « synchronisée », `declarer` qui écrit dans le document de l'espace.
- `packages/tableau/src/coeur/indexEspace.ts` : le document de l'espace (tableaux, parent, corbeille, titre en
  cache, racine choisie sans conflit, favoris, réglages, tableaux partagés et leur dossier). Il alimente
  `listerTableaux` et la hiérarchie. BroadcastChannel entre onglets.
- `apps/web/src/local/` :
  - images par empreinte en OPFS (1600 px, WebP, miniature floue, adresses `blob:`) ;
  - export et import `.notak` (même codec que `fichierNotak`) ;
  - recherche dans tous les tableaux (`coeur/recherche.ts`) ;
  - export Markdown, texte et médias dans le navigateur ;
  - pastille d'état, `navigator.storage.persist()`, avertissement Safari ;
  - reprise de l'ancien espace local (`ancien.ts`, `importLocal.ts`).
- Construction purement statique, servie par n'importe quel nginx (comme `apps/site`). Aucun appel à `/api`.
  L'édition serveur ne change pas.

### Phase 3 : le dossier sur ordinateur
- `packages/tableau/src/dossier/moteur.ts` : branche journal et lecteur sur `reseauLocal` ; un seul écrivain par
  appareil (Web Locks).
- Navigateur : `apps/web/src/local/dossierNavigateur.ts` (`showDirectoryPicker`, poignée en IndexedDB, permission
  redemandée sur un geste, `.crswap` ignorés). Commencer par l'essai sur un vrai Mac.
- Bureau : `apps/bureau/src-tauri/tauri.conf.json` embarque `apps/web/dist`, avec une vraie CSP.
  `src-tauri/src/dossier.rs` : lister, écrire de façon atomique (fsync puis renommage), surveiller (`notify`),
  télécharger les fantômes. `src-tauri/src/apercu.rs` : aperçus de liens sur la machine (règles reprises de
  `apps/serveur/src/apercu.ts`). Plugins `dialog`, `single-instance`, fichier de capacités. Côté application :
  `apps/web/src/local/dossierTauri.ts`.
- Écrans : « Où ranger vos tableaux ? », Réglages → Dossier, Réglages → Appareils.
- Tests : `contrat.ts` sur une réalisation Node (fs), `cargo test`. Matrice d'essais manuels écrite (iCloud Drive,
  OneDrive, Dropbox, Google Drive, Nextcloud, Syncthing).

### Phase 4 : travailler à plusieurs par dossier partagé
- `packages/tableau/src/dossier/partage.ts` : un espace peut monter **plusieurs dossiers**, son dossier privé et un
  dossier par arbre partagé. Chaque tableau sait dans quel dossier il vit (`indexEspace`). Déplacer un tableau dans
  un arbre partagé le recopie dans ce dossier.
- « Partager un dossier » : création du dossier, écriture de l'arbre, puis la fenêtre de partage du système (menu
  « Partager » sur Mac et Windows). Sinon, on ouvre le dossier dans le Finder ou l'Explorateur avec la marche à
  suivre pour chaque nuage.
- « Ouvrir un dossier partagé » : monter le dossier et l'absorber.
- Lecture seule détectée (écriture refusée par le système) : le tableau passe en lecture seule
  (`Connexion.lectureSeule`, déjà géré par la toile).
- Présence différée : « modifié par Léa il y a 3 min », branché sur `recents` et la mise en évidence existante.
- Tests : scénarios à plusieurs personnes du faux nuage, lecture seule, participant qui efface tout puis
  restauration.

### Phase 5 : iPhone, iPad, Android
- `tauri ios init` / `android init` dans `apps/bureau`.
- Module Swift :
  - dossier choisi dans Fichiers, accès retenu (security-scoped bookmark), y compris pour un dossier partagé ;
  - accès coordonné (`NSFileCoordinator`), listing (`NSMetadataQuery`), `startDownloadingUbiquitousItem` ;
  - tâche de fond pour finir les écritures ; id d'appareil dans le trousseau (`ThisDeviceOnly`) ;
  - aperçus de liens sur l'appareil.
- Module Kotlin : dossier par le sélecteur Android, permission conservée, écriture puis vérification.
- Autotest dans l'application qui fait passer `contrat.ts` sur un vrai appareil.

### Plus tard, facultatif
Un relais temps réel **open source et auto-hébergeable** (curseurs, présence en direct), choisi par l'utilisateur
dans les réglages, chiffré de bout en bout (protocole à écrire et à faire relire, libsodium). Chiffrement du dossier
par phrase de passe (décision : plus tard).

## Décisions prises
- Partage : tout l'arbre de sous-tableaux.
- Transport : aucun serveur à nous ; dossiers partagés par les outils des gens ; temps réel seulement plus tard, par
  un relais que chacun peut héberger.
- Chiffrement du dossier : plus tard.
- Cartes et adresses : l'appareil de l'utilisateur interroge OpenStreetMap directement, au clic, fournisseur
  réglable.
- iCloud : un dossier choisi dans iCloud Drive partout (pas le conteneur de l'application).

## Vérification
- `bun run test` et `bun run typecheck` verts à chaque phase.
- Phase 1 : des milliers de scénarios du faux nuage passent ; un échec se rejoue avec `NOTAK_GRAINE`.
- Phase 2 : construction `VITE_EDITION=locale` ; Playwright (Chromium installé) crée un tableau, recharge hors
  ligne, exporte puis réimporte un `.notak`, et vérifie qu'aucune requête ne part vers `/api`. L'édition serveur se
  construit et ses tests passent toujours.
- Phase 3 : `contrat.ts` sur la réalisation Node ; essais manuels sur deux machines par nuage, avec coupures et
  mises en veille.
- Phase 4 : scénarios à plusieurs dans le faux nuage ; essai réel avec un dossier partagé iCloud entre deux comptes
  Apple, puis OneDrive.
- Phase 5 : autotest sur appareils réels.
