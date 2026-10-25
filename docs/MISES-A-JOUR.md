# Les mises à jour de Notak

> Décidé le 25/10/2026 : l'app de bureau embarque l'édition locale (rien ne passe par un serveur à nous) et se met à
> jour d'elle-même, de versions signées. La version web suit la même règle : la nouvelle version arrive seule.

## Ce que voit la personne

- **L'app de bureau** cherche une nouvelle version au lancement, puis toutes les six heures. Si elle en trouve une, elle
  la télécharge en arrière-plan et vérifie sa signature ; seulement alors, un bandeau dit « Notak 0.3.0 est prête :
  elle s'installera quand vous quitterez Notak », avec *Redémarrer maintenant*, *Nouveautés* et *Plus tard*. Rien
  n'interrompt le travail ; en quittant, la mise à jour se pose, et la prochaine ouverture est à jour.
- **« Où sont mes toiles ? »** montre la version qui tourne, *Rechercher maintenant*, et la case pour couper la
  recherche automatique, avec ce qu'elle envoie (voir plus bas).
- **La version web** (notak.app, un serveur Notak) prend la nouvelle version à la prochaine page ouverte. Une page déjà
  ouverte le sait et propose *Recharger*, au lieu de laisser des morceaux de l'ancienne version échouer.

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

## Publier une version

Au fil du travail, on écrit sous « À venir » de [`docs/NOUVEAUTES.md`](NOUVEAUTES.md) ce que la personne verra.

```bash
bun run nouvelle-version 0.2.0      # le numéro partout, les notes de la version, un commit et l'étiquette v0.2.0
git push origin HEAD v0.2.0         # lance la publication
```

1. **GitHub vérifie** (`.github/workflows/publier-bureau.yml`) : l'étiquette suit `tauri.conf.json`, les notes
   existent, la clé publique est là, les essais passent.
2. **Il demande votre accord** (l'environnement `publication`), puis construit Notak pour macOS (Apple et Intel),
   Windows et Linux, signe chaque paquet, et dépose le tout dans un **brouillon** de version, avec `latest.json` (ce
   que lisent les apps) et `SHA256SUMS.txt`. `latest.json` ne s'écrit que si les quatre plateformes sont là et signées.
3. **Vous relisez le brouillon.** Tant qu'il est brouillon, aucune app ne le voit :
   - téléchargez le paquet de votre plateforme, installez-le, et faites le tour de ce qui a changé ;
   - relisez les notes : ce sont elles que montre *Nouveautés* ;
   - vérifiez que `latest.json` annonce le bon numéro (la CI a déjà vérifié qu'il couvre les quatre plateformes et que
     chaque paquet est signé).
4. **Publish release.** Les apps installées la trouvent à leur prochaine recherche (au plus six heures, ou au prochain
   lancement). Sur une machine restée à la version d'avant, *Rechercher maintenant* doit la trouver : c'est la
   vérification de bout en bout. Si quelque chose cloche, voir plus bas.

Renoncer avant d'avoir poussé : `git tag -d v0.2.0 && git reset --hard HEAD~1`. Après avoir poussé : supprimez le
brouillon et l'étiquette sur GitHub, corrigez, et repartez d'un nouveau numéro.

## Si ça tourne mal

- **Une version publiée est mauvaise** : repassez-la en *pre-release* (ou supprimez-la) ; `latest` redevient la
  précédente, et plus personne ne la reçoit. Ceux qui l'ont déjà ne reviennent pas en arrière (une app n'installe
  qu'une version plus récente) : publiez vite une version corrigée, avec un numéro plus grand.
- **La clé est perdue** : les apps installées ne pourront plus se mettre à jour. Faites une nouvelle clé
  (`bun run bureau:cle -- --remplacer`), publiez, et dites à chacun de réinstaller Notak depuis la page des versions.
- **La clé est volée** : même chose, sans attendre, et révoquez les secrets GitHub. Tant qu'il n'a pas aussi la main sur
  la page des versions du dépôt, le voleur ne peut rien proposer aux apps ; d'où l'accord demandé et les droits serrés.

## Ce qui rend une mise à jour sûre

| Ce qu'on craint | Ce qui l'empêche |
|---|---|
| un paquet trafiqué (en route, ou sur GitHub) | la signature Ed25519 de chaque paquet, vérifiée avant toute installation avec la clé publique embarquée |
| une réponse trafiquée qui fait passer une vieille version (à faille) pour une neuve | une app n'installe qu'une version plus récente, et la signature porte le numéro signé (`requireSignedVersion`) |
| quelqu'un qui pousse une étiquette pour signer son code | l'environnement `publication` : accord d'une personne, étiquettes `v*` seulement |
| une action GitHub tierce compromise | les actions épinglées à un commit ; aucune action tierce ne touche la clé (le build est `tauri build`) |
| un cache empoisonné par une autre branche | aucun cache dans la publication |
| la page qui demanderait une autre adresse, une autre clé ou une vieille version | la page ne fait que demander « y a-t-il du neuf ? » et « installe » : l'adresse, la clé et la règle sont dans la coque (`src/mise_a_jour.rs`) |
| une app d'essai, construite à la main, qui se remplacerait par la version publiée | seule la publication ajoute la configuration des mises à jour (`tauri.publication.json`) ; sans elle, l'app le dit et ne cherche rien |

## Ce qu'envoie la recherche

Une requête `GET https://github.com/Anonym0os/notak/releases/latest/download/latest.json`, et, s'il y a du neuf, le
téléchargement du paquet chez GitHub. GitHub voit l'adresse IP et la version de Notak ; rien de vos toiles, aucun
identifiant. C'est la seule chose que l'app de bureau fait d'elle-même sur le réseau ; on la coupe dans « Où sont mes
toiles ? ».

## Les dépendances

Dependabot (`.github/dependabot.yml`) propose chaque semaine les mises à jour des dépendances (JavaScript, Rust, actions
GitHub, images Docker), groupées pour se relire d'un coup, et tout de suite celles qui corrigent une faille. Une pull
request de Dependabot passe par la même CI qu'une autre ; une fois fusionnée, elle part à la version suivante.

## Construire à la main

- `bun run bureau:construire` : l'app de bureau, sans configuration de mise à jour (une app d'essai ne se met pas à jour).
- `bun run bureau:construire -- --serveur https://notak.exemple.fr` : une fenêtre sur un serveur Notak (comptes, temps
  réel), dont seules les pages reçoivent les droits de la coque. Elle ne se met pas à jour seule ; son contenu, servi
  par le serveur, l'est à chaque ouverture.
