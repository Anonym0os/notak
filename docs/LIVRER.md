# Livrer Notak : le web, l'iPhone, l'iPad et le Mac

> Décidé le 04/11/2026. Chaque fusion sur `main` arrive seule partout : notak.app se redéploie, et l'iPhone, l'iPad et
> le Mac reçoivent un build TestFlight. C'est la page de référence. Le détail iOS est dans [`IOS.md`](IOS.md), et
> l'ancienne voie de bureau (Developer ID, mises à jour par GitHub) dans [`MISES-A-JOUR.md`](MISES-A-JOUR.md).

## Où chaque plateforme se met à jour

| Plateforme | D'où vient Notak | Comment il se met à jour | Ce qui le fait partir |
|---|---|---|---|
| Web (notak.app) | `apps/site` (nginx statique), déployé par Coolify (`notak-site`) | à la page suivante ; une page ouverte propose *Recharger* | chaque push sur `main` qui touche `apps/site`, `apps/web`, `packages`, `package.json` ou `bun.lock` |
| iPhone et iPad | TestFlight, la même fiche App Store Connect | TestFlight l'installe, si « Mises à jour automatiques » est coché | `.github/workflows/livrer.yml`, après une CI verte sur `main` |
| Mac (puce Apple) | TestFlight, la même fiche (achat universel, `app.notak.bureau`) | idem | idem |
| Un serveur Notak | l'image `ghcr.io/anonym0os/notak` | son admin la tire ; le serveur lui dit quand en sortir une nouvelle | une étiquette `vX.Y.Z` ([`MISES-A-JOUR.md`](MISES-A-JOUR.md)) |

La page publique qui le dit aux gens : `notak.app/telecharger` (`apps/site/public/telecharger/`).

## Ce qui se passe à chaque fusion sur main

1. La CI (`ci.yml`) vérifie le commit, sur une machine de GitHub.
2. Si elle passe, `livrer.yml` démarre **sur le Mac de Samy**, par un runner GitHub auto-hébergé (étiquette `notak`).
   Il exécute `node scripts/livrer.ts verifier`, puis `node scripts/livrer.ts tout`, avec un numéro de build pris à
   l'heure UTC (`AAAAMMJJHHMM`, le même pour iOS et le Mac).
3. iOS : `tauri ios build --export-method app-store-connect`, signé par Xcode avec la clé App Store Connect, puis
   `altool --upload-package`.
4. Mac : `tauri build` avec `tauri.boutique.json` (cloisonné, profil « Mac App Store », signé « Apple Distribution »),
   puis un `.pkg` signé « Mac Installer Distribution », puis `altool --upload-package`.
5. Apple traite chaque build (5 à 20 minutes), puis TestFlight le propose au groupe interne. Pour ce groupe, il n'y a
   aucune revue.

Plusieurs fusions d'affilée : seule la dernière se livre (`concurrency` avec `cancel-in-progress`). Une CI rouge ne
livre rien. Le bouton *Actions → Livrer sur TestFlight → Run workflow* relance une livraison, toutes plateformes ou une
seule.

## À la main, depuis le Mac

```bash
bun run livrer verifier      # ce qui manque, ici et chez Apple ; ne change rien
bun run livrer               # iOS et Mac, envoyés
bun run livrer ios           # ou mac ; --sans-envoi pour construire seulement ; --numero pour l'imposer
bun run livrer profil        # le profil « Mac App Store », une fois par an (ou après un changement de droits)
```

## Une fois pour toutes : ce qu'il faut chez Apple

Le compte est celui de l'équipe Silak (`2MLG399MFA`).

1. **La fiche** : App Store Connect → *Apps* → **+** → *Nouvelle app*, plateformes iOS et macOS, nom « Notak »,
   identifiant `app.notak.bureau`, une référence (SKU) au choix.
2. **La clé de l'API** : *Utilisateurs et accès* → *Intégrations* → *App Store Connect API* → une clé d'équipe, accès
   *Admin* (la signature automatique d'Xcode en a besoin). Le `.p8` ne se télécharge qu'une fois : il va dans
   `~/.appstoreconnect/private_keys/AuthKey_<ID>.p8`. Les deux identifiants vont dans `~/.appstoreconnect/notak.json` :
   `{ "cle": "<ID de la clé>", "emetteur": "<Issuer ID>" }`. Rien de tout cela n'entre dans le dépôt.
3. **Le certificat du `.pkg`** : Xcode → *Réglages* → *Comptes* → l'équipe Silak → *Gérer les certificats* → **+** →
   *Mac Installer Distribution*.
4. **Le profil du Mac** : `bun run livrer profil` (il se range dans `~/.appstoreconnect/`, hors du dépôt).
5. **Les testeurs** : TestFlight → *Tests internes* → **+** → un groupe « Silak », avec chaque membre de l'équipe ; on
   coche « Distribution automatique ». Sur chaque appareil : l'app TestFlight, l'invitation acceptée, et « Mises à
   jour automatiques » coché.
6. **Le runner** : sur le Mac, dans `~/actions-runner-notak`, l'archive du runner de GitHub (*Settings → Actions →
   Runners → New self-hosted runner*, macOS ARM64). Puis
   `./config.sh --url https://github.com/Anonym0os/notak --labels notak --name mac-samy --token <jeton>`, et
   `./svc.sh install && ./svc.sh start`. Il tourne dans la session de Samy, avec son trousseau. La première
   signature demande d'accéder à la clé : *Toujours autoriser*. Deux réglages, sans lesquels la signature échoue (`errSecInternalComponent`) :
   - retirer `SessionCreate` du `.plist` du service, dans `~/Library/LaunchAgents/actions.runner.*.plist`. Sans cela,
     le service ouvre une session de sécurité à lui, où le trousseau reste verrouillé ;
   - `security set-key-partition-list -S apple-tool:,apple:,codesign:,productbuild: -s ~/Library/Keychains/login.keychain-db`
     (une fois, avec le mot de passe de la session), pour que les outils d'Apple prennent les clés sans demander.

## Le Mac cloisonné : ce qui change

Le Mac App Store, et donc TestFlight, exige l'App Sandbox et interdit qu'une app se remplace elle-même. La coque le sait
d'elle-même : le système pose `APP_SANDBOX_CONTAINER_ID` dans son environnement (`en_boutique`, `src/lib.rs`). Elle :

- ne cherche jamais de mise à jour, et la page dit « installée par TestFlight » (`Etat::Boutique`, `MiseAJour.tsx`) ;
- ouvre le dossier iCloud par `NSFileManager.URLForUbiquityContainerIdentifier` (`src/nuage.rs`), le même conteneur
  `iCloud.app.notak.bureau` que l'iPhone et l'iPad. Hors sandbox, elle passe par le reflet `~/Library/Mobile Documents` ;
- écrit un fichier choisi dans « Enregistrer sous » en place, et non par un voisin renommé : elle n'a droit qu'au fichier,
  pas au dossier.

Ses droits sont dans `Notak.boutique.entitlements` : réseau sortant, fichiers choisis, micro et iCloud. Les données de
la webview se rangent dans `~/Library/Containers/app.notak.bureau` : une app de bureau construite avant (hors
sandbox) et celle de TestFlight ne partagent pas leurs toiles locales. Les toiles du dossier iCloud, elles, se
retrouvent. Avant de passer de l'une à l'autre, on enregistre une copie `.notak`.

## Quand ça casse

- **`verifier` dit ce qui manque** : on le règle d'abord, rien d'autre ne passera.
- **Le build iOS échoue à la signature** : la clé n'a pas l'accès *Admin*, ou Xcode n'a pas encore la session de
  l'équipe. Ouvrir Xcode une fois, puis *Réglages → Comptes*.
- **Le build Mac est refusé à l'envoi** (« provisioning profile », « entitlements ») : le profil ne porte pas un droit
  des `.entitlements`. Refaire `bun run livrer profil` après avoir coché la capacité sur l'identifiant.
- **« bundle version must be higher »** : un numéro déjà envoyé. La livraison suivante, une minute après, prend le suivant.
- **Un build mauvais est parti** : dans TestFlight, *Expirer le build*. Les appareils gardent le précédent, et la
  correction suivante part à la prochaine fusion.
- **`can't find crate for phf_macros`, « mis-aligned LINKEDIT »** : le `strip` d'Xcode 27 abîme les proc-macros. `Cargo.toml` ne dépouille donc que le binaire de Notak. Il ne faut pas remettre `strip = true` sur tout le profil.
- **Sur le Mac, Notak sans barre de titre, fenêtre qu'on ne déplace pas** : c'est l'app iPad que TestFlight propose aux Mac à puce Apple (son `.app` n'est qu'un `Wrapper`), le plus souvent parce que le build Mac est bloqué. On la jette, on installe la version « macOS » dans TestFlight, et on décoche *Apps iPhone et iPad sur les Mac avec puce Apple* (*Tarifs et disponibilité*).
- **Le Mac de Samy est éteint** : la livraison attend le runner, jusqu'à 24 heures, puis échoue. On la relance par le bouton.

## Plus tard : la sortie publique

- Des testeurs externes, par un lien public TestFlight (une revue d'Apple légère au premier build de chaque version),
  posé sur `notak.app/telecharger`.
- L'App Store : la fiche (`apps/bureau/app-store/`), les captures, la revue ; puis une version passe du numéro `0.1.0`
  au suivant par `bun run nouvelle-version`. TestFlight continue de recevoir chaque fusion.
- Le dépôt passera peut-être en privé : rien ici n'en dépend, sauf le lien « Code » des pages du site.
