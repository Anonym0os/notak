# Les mises à jour de Notak

> Décidé le 25/10/2026 : l'app de bureau embarque l'édition locale (rien ne passe par un serveur à nous) et se met à
> jour d'elle-même, de versions signées. La version web suit la même règle : la nouvelle version arrive seule.

## Ce que voit la personne

- **L'app de bureau** cherche une nouvelle version au lancement, puis toutes les six heures. Si elle en trouve une, elle
  la télécharge en arrière-plan et vérifie sa signature ; seulement alors, un bandeau dit « Notak 0.3.0 est prête :
  elle s'installera quand vous quitterez Notak », avec *Redémarrer maintenant*, *Nouveautés* et *Plus tard*. Rien
  n'interrompt le travail ; en quittant, la mise à jour se pose, et la prochaine ouverture est à jour.
- **« Où sont mes toiles ? »**, et la rubrique « App de bureau » des réglages, montrent la version qui tourne,
  *Rechercher maintenant*, et la case pour couper la recherche automatique, avec ce qu'elle envoie (voir plus bas).
- **La version web** (notak.app, un serveur Notak) prend la nouvelle version à la prochaine page ouverte. Une page déjà
  ouverte le sait et propose *Recharger*, au lieu de laisser des morceaux de l'ancienne version échouer.
- **Un serveur Notak** ne se met pas à jour seul : c'est à son admin de tirer la nouvelle image. Il le lui dit : une
  minute après son démarrage puis toutes les douze heures, il lit la même annonce que les apps (`latest.json`) ; s'il
  trouve plus récent que lui, il l'écrit une fois dans son journal, avec la commande à lancer, et les admins du serveur
  (`NOTAK_ADMINS`) le voient dans l'app, avec la commande à copier et les notes de la version.
  `NOTAK_VERIFIER_MAJ=0` coupe la vérification.

## Un seul numéro

L'app de bureau, l'image du serveur et la toile portent le même numéro, posé par `bun run nouvelle-version` dans
`tauri.conf.json`, `Cargo.toml`, `Cargo.lock`, `packages/tableau/package.json` (et son entrée dans `bun.lock`) et
`VERSION_NOTAK`
(`packages/tableau/src/version.ts`, celui que montrent les réglages et que dit le serveur sur `/api/sante`). La
publication refuse une étiquette qui ne s'accorde pas avec eux tous.

## Une fois pour toutes : la clé de signature

Une app installée n'accepte qu'une version signée par la clé qu'elle connaît. La clé privée signe chaque version ; la
clé publique est dans chaque app (`apps/bureau/src-tauri/tauri.publication.json`).

1. `bun run bureau:cle` : crée la clé dans `~/.tauri/notak.key` (protégée par un mot de passe) et pose la clé publique
   dans `tauri.publication.json`. **Commitez ce fichier.**
2. **Gardez une copie de la clé et de son mot de passe hors de l'ordinateur** (un gestionnaire de mots de passe). Sans
   elles, plus aucune mise à jour ne passe : il faudrait que chacun réinstalle Notak à la main.
3. Sur GitHub, *Settings → Environments → New environment* `publication` :
   - *Required reviewers* : vous. Rien ne se signe sans votre accord, même si quelqu'un pousse une étiquette.
   - *Deployment branches and tags* : seulement les étiquettes `v*`.
   - *Environment secrets* : `TAURI_SIGNING_PRIVATE_KEY` (le contenu de `~/.tauri/notak.key`) et
     `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
4. Facultatif, pour que macOS ouvre Notak sans avertissement : un certificat *Developer ID Application* d'Apple, dans
   les secrets du même environnement : `APPLE_CERTIFICATE` (le .p12 en base64), `APPLE_CERTIFICATE_PASSWORD`,
   `APPLE_SIGNING_IDENTITY`, et pour la notarisation `APPLE_ID`, `APPLE_PASSWORD` (un mot de passe d'app),
   `APPLE_TEAM_ID`. Sans eux, l'app est signée « ad hoc » : macOS demande une fois, à la première ouverture, de
   confirmer dans *Réglages → Confidentialité et sécurité*. Les mises à jour, elles, passent sans rien demander.
5. Après la première publication de l'image du serveur : sur GitHub, *Packages → notak → Package settings → Change
   visibility → Public*. Un paquet du registre naît privé ; sans cela, `docker compose pull` demande un compte.

## Publier une version

Au fil du travail, on écrit sous « À venir » de [`docs/NOUVEAUTES.md`](NOUVEAUTES.md) ce que la personne verra.

```bash
bun run nouvelle-version 0.2.0      # le numéro partout, les notes de la version, un commit et l'étiquette v0.2.0
git push origin HEAD v0.2.0         # lance la publication
```

1. **GitHub vérifie** (`.github/workflows/publier-bureau.yml`) : l'étiquette est un numéro `vX.Y.Z` qui suit
   `tauri.conf.json`, cette version n'est pas déjà publiée, les notes existent, la clé publique est là, les essais
   passent.
2. **Il compile** Notak pour macOS (Apple et Intel), Windows et Linux, sans aucun secret, puis **demande votre
   accord** (l'environnement `publication`) pour signer chaque paquet et le déposer dans un **brouillon** de version,
   avec `latest.json` (ce que lisent les apps) et `SHA256SUMS.txt`. `latest.json` ne s'écrit que si les quatre
   plateformes sont là et signées. Dans le même temps, il construit l'image du serveur sur une machine amd64 et une
   machine arm64, la publie sous `ghcr.io/anonym0os/notak:0.2.0` seulement, et l'atteste (provenance signée par
   GitHub). L'accord se demande à chaque étape qui en a besoin : l'image dès la vérification faite, la signature une
   fois la compilation finie, puis la réunion des deux architectures de l'image sous ce numéro.
3. **Vous relisez le brouillon.** Tant qu'il est brouillon, aucune app ne le voit :
   - téléchargez le paquet de votre plateforme, installez-le, et faites le tour de ce qui a changé ;
   - relisez les notes : ce sont elles que montre *Nouveautés* ;
   - vérifiez que `latest.json` annonce le bon numéro (la CI a déjà vérifié qu'il couvre les quatre plateformes et que
     chaque paquet est signé).
   - pour le serveur : sur un serveur d'essai, `NOTAK_VERSION=0.2.0` dans son `.env`, puis `docker compose pull &&
     docker compose up -d`, et `gh attestation verify oci://ghcr.io/anonym0os/notak:0.2.0 -R Anonym0os/notak`.
4. **Publish release.** Les apps installées la trouvent à leur prochaine recherche (au plus six heures, ou au prochain
   lancement). Sur une machine restée à la version d'avant, *Rechercher maintenant* doit la trouver : c'est la
   vérification de bout en bout. Dans le même temps, `.github/workflows/annoncer-serveur.yml` vérifie que l'image de
   cette version existe, pour les deux architectures, à son numéro, et avec l'attestation de la publication de cette
   étiquette, puis lui donne les étiquettes `0.2` et `latest`, sans jamais les faire reculer (une correction 0.1.5
   publiée après la 0.2.0 prend `0.1`, pas `latest`). Les serveurs la voient à leur prochaine vérification. Si quelque
   chose cloche, voir plus bas.

Renoncer avant d'avoir poussé : `git tag -d v0.2.0 && git reset --hard HEAD~1`. Après avoir poussé : supprimez le
brouillon, l'étiquette et, s'il a été poussé, la version d'image `0.2.0` (*Packages → notak*), corrigez, et repartez
d'un nouveau numéro. Une version publiée, elle, ne se refait jamais sous le même numéro : la publication le refuse.

## Si ça tourne mal

- **Une version publiée est mauvaise** : repassez-la en *pre-release* (ou supprimez-la) ; le `latest.json` de la page
  des versions redevient celui de la précédente, et ni les apps ni le contrôle des serveurs ne la proposent plus. Ceux
  qui l'ont déjà ne reviennent pas en arrière (une app n'installe qu'une version plus récente) : publiez vite une
  version corrigée, avec un numéro plus grand.
- **Son image, elle, reste en place** : `latest` et `0.2` la désignent encore, et un serveur qui tire `latest` chaque
  nuit la recevrait. Pour l'en retirer : *Actions → Annoncer le serveur → Run workflow*, avec dans « Use workflow
  from » une étiquette de version (celle de la mauvaise convient : l'environnement `publication` n'accepte que les
  étiquettes `v*`), et pour version celle d'avant (`0.1.5`). Après votre accord, et la vérification de son attestation,
  `latest` et `0.1` reviennent sur elle. L'étiquette de la mauvaise (`0.2`, quand il n'y a pas de 0.2.x d'avant) n'a
  rien vers quoi revenir : supprimez cette version d'image dans *Packages*, ou publiez vite la correction, qui reprend
  `latest` d'elle-même. Sans le workflow, avec un jeton `write:packages` : `docker buildx imagetools create -t
  ghcr.io/anonym0os/notak:latest ghcr.io/anonym0os/notak@sha256:<empreinte de la version d'avant>`. Un serveur qui a
  déjà migré vers la mauvaise revient en arrière comme le dit [`AUTO-HEBERGER.md`](AUTO-HEBERGER.md) (« Mettre à jour »).
- **La clé est perdue** : les apps installées ne pourront plus se mettre à jour. Faites une nouvelle clé
  (`bun run bureau:cle -- --remplacer`), publiez, et dites à chacun de réinstaller Notak depuis la page des versions.
- **La clé est volée** : même chose, sans attendre, et révoquez les secrets GitHub. Avec la clé seule, le voleur ne fait
  rien accepter : il lui faut aussi écrire `latest.json` sur la page des versions du dépôt. Les deux ne se trouvent
  ensemble que dans la tâche « signer », après votre accord, où ne tournent ni installation ni compilation.

## Ce qui rend une mise à jour sûre

| Ce qu'on craint | Ce qui l'empêche |
|---|---|
| un paquet trafiqué (en route, ou sur GitHub) | la signature Ed25519 de chaque paquet, vérifiée avant toute installation avec la clé publique embarquée |
| une réponse trafiquée qui fait passer une vieille version (à faille) pour une neuve | une app n'installe qu'une version plus récente, et la signature porte le numéro signé (`requireSignedVersion`) |
| quelqu'un qui pousse une étiquette pour signer son code | l'environnement `publication` : accord d'une personne, étiquettes `v*` seulement |
| une action GitHub tierce compromise | les actions épinglées à un commit ; à côté de la clé, seulement des actions de GitHub (`actions/*`) : l'empaquetage et la signature sont la CLI de Tauri |
| une dépendance piégée (un script npm, un plugin de Vite, un script de construction ou une macro de Cargo) qui lirait la clé | GitHub ne remet un secret qu'à la tâche qui le nomme : celles qui font tourner le code des dépendances (« compiler », les essais, les images) n'en nomment aucun, et « compiler » n'a pas même d'environnement. La clé ne va qu'à « signer », qui n'installe ni ne compile rien (la CLI de Tauri, prise d'npm à son numéro exact, les outils d'Apple, nos scripts) et n'ouvre qu'une archive dont chaque entrée est vérifiée, pour `tauri bundle` (macOS, avec le certificat Apple) ou `tauri signer sign` (Linux, Windows) |
| une dépendance piégée qui changerait le binaire | ce n'est pas la séparation qui l'empêche : elle protège la clé, pas ce qui se compile. Ce sont `bun.lock` et `Cargo.lock`, tenus à la compilation (`--frozen-lockfile`, `--locked`), et la relecture de chaque mise à jour de dépendance |
| une version publiée réécrite (une étiquette repoussée, un essai relancé) | la publication refuse une version qui n'est plus un brouillon : ni ses paquets, ni son `latest.json`, ni son image `x.y.z` ne se remplacent |
| une image du serveur trafiquée sur le registre | l'attestation de provenance (`gh attestation verify`), que la CI vérifie aussi avant de poser `latest` et `0.2` : ils désignent l'image attestée par la publication de son étiquette, jamais une reconstruite |
| un cache empoisonné par une autre branche | aucun cache dans la publication |
| la page qui demanderait une autre adresse, une autre clé ou une vieille version | la page ne fait que demander « y a-t-il du neuf ? » et « installe » : l'adresse, la clé et la règle sont dans la coque (`src/mise_a_jour.rs`) |
| une app d'essai, construite à la main, qui se remplacerait par la version publiée | seule la publication ajoute la configuration des mises à jour (`tauri.publication.json`) ; sans elle, l'app le dit et ne cherche rien |

## Ce qu'envoie la recherche

Une requête `GET https://github.com/Anonym0os/notak/releases/latest/download/latest.json`, et, s'il y a du neuf, le
téléchargement du paquet chez GitHub. GitHub voit l'adresse IP et la version de Notak ; rien de vos toiles, aucun
identifiant. C'est la seule chose que l'app de bureau fait d'elle-même sur le réseau ; on la coupe dans « Où sont mes
toiles ? ».

Un serveur fait la même requête, toutes les douze heures, et ne télécharge rien : il ne fait que comparer les numéros.
`NOTAK_VERIFIER_MAJ=0` la coupe ; un serveur de développement (sans `NOTAK_ORIGINE`) ne la fait jamais.

## Les dépendances

Dependabot (`.github/dependabot.yml`) propose chaque semaine les mises à jour des dépendances (JavaScript, Rust, actions
GitHub, images Docker), groupées pour se relire d'un coup, et tout de suite celles qui corrigent une faille. Une pull
request de Dependabot passe par la même CI qu'une autre, y compris l'image du serveur construite et lancée
(`.github/workflows/image.yml`) ; une fois fusionnée, elle part à la version suivante. OpenFGA se monte à deux endroits,
`compose.yaml` et les essais (`vitest.openfga.ts`) : un essai refuse qu'ils diffèrent.

## Construire à la main

- `bun run bureau:construire` : l'app de bureau, sans configuration de mise à jour (une app d'essai ne se met pas à jour).
- `docker compose -f compose.yaml -f compose.source.yaml up -d --build` : le serveur, depuis le dépôt (voir
  [`AUTO-HEBERGER.md`](AUTO-HEBERGER.md)).

## Se connecter à un serveur Notak

Plus besoin d'une app construite pour un serveur : l'app de bureau publiée s'y connecte. On entre l'adresse du serveur
dans l'app (« Se connecter à un serveur Notak… » ; `https://notak.exemple.fr`, un vrai certificat : seul
`http://localhost` s'en passe) ; elle vérifie que c'est un serveur Notak assez récent (`GET /api/sante`), puis ouvre ses
pages dans sa fenêtre. Au démarrage, Notak s'ouvre sur cet ordinateur ou sur ce serveur, comme vous l'avez réglé
(réglages, « App de bureau ») ; « Toiles de cet ordinateur » les montre le temps d'une session, sans changer ce
réglage. Le contenu, servi par le serveur, est à jour à chaque ouverture ; la coque, elle, se met à jour comme
toujours. La connexion par mot de passe se fait dans l'app ; celle par un fournisseur (Google, Microsoft, GitHub, le
SSO d'un espace) passe par le navigateur et un code à confirmer (`/bureau/autoriser` sur le serveur). Le détail, côté
serveur : [`AUTO-HEBERGER.md`](AUTO-HEBERGER.md), « Depuis l'app de bureau ».
