# Publier Notak gratuitement, sans que ça coûte quoi que ce soit

> Proposition du 23/10/2026. But : n'importe qui ouvre notak.app et s'en sert gratuitement, retrouve ses tableaux
> sur tous ses appareils, partage un tableau, et l'hébergeur (nous) ne paie rien d'autre que le nom de domaine.
> Le serveur actuel (`apps/serveur`, un conteneur Docker) reste l'édition auto-hébergée ; cette page décrit
> l'édition publique.

## 1. Pourquoi le modèle actuel coûte

Le conteneur fait tout : comptes, mots de passe, fichiers envoyés, aperçus de liens, synchro, recherche, activité.
Le publier tel quel, c'est payer et porter :

| Poste | Ce que ça implique |
|---|---|
| Machine toujours allumée | un VPS (5 à 20 €/mois), qui grandit avec le nombre de gens |
| Fichiers envoyés | du disque qui ne fait que grossir, des sauvegardes |
| Comptes | mots de passe à protéger, courriels de réinitialisation (un service d'envoi), RGPD complet |
| Contenu hébergé | statut d'hébergeur (LCEN) : signalements, retraits, abus |
| Exploitation | mises à jour, pannes, attaques |

Rien de cela n'est gratuit, même avec une offre « toujours gratuite » (Oracle Cloud, par exemple) : la machine
est offerte, pas le temps, ni la responsabilité des données des autres.

## 2. Le principe : chacun apporte sa place

Notak est déjà *local d'abord* (SPEC : « Le serveur relaie et conserve, il n'arbitre pas »). Les tableaux sont des
documents Yjs gardés dans IndexedDB ; deux copies d'un même document se fusionnent toujours sans conflit, dans
n'importe quel ordre. Il n'y a donc pas besoin d'un serveur qui tranche : il suffit d'un endroit où **déposer** les
changements et de les **relire** ailleurs.

D'où trois étages, chacun gratuit pour nous :

```
 ┌──────────────── notak.app : des fichiers statiques (Cloudflare Pages) ────────────────┐
 │                                                                                        │
 │  1. Cet appareil       IndexedDB (tableaux) + OPFS (images)          toujours, sans compte
 │  2. Mes appareils      le Drive / Dropbox / OneDrive / dossier de l'utilisateur        │
 │                        → sa place, son quota, son compte ; nous n'y voyons rien        │
 │  3. À plusieurs        un relais chiffré de bout en bout (Cloudflare Workers gratuit) │
 │                        → il transporte des octets illisibles, plafonné, jamais facturé│
 └────────────────────────────────────────────────────────────────────────────────────────┘
```

Ce qu'il en coûte : le domaine (≈ 15 €/an pour un `.app`). Aucune carte bancaire enregistrée chez Cloudflare :
l'offre gratuite **refuse** au-delà de ses quotas au lieu de facturer, donc aucune facture possible.

Le précédent existe : Excalidraw fonctionne ainsi depuis des années (local, liens de partage chiffrés dont la clé
est dans le `#` de l'adresse, relais pour le direct).

## 3. L'expérience, du premier clic au travail à plusieurs

### 3.1 Arriver
- notak.app → **un tableau vide tout de suite**, sans inscription, sans écran de bienvenue. C'est la différence la
  plus visible avec Milanote, qui demande un compte avant tout.
- Les bulles de découverte existantes (`BullesDecouverte`) font le reste : double-clic pour une note, glisser un
  outil depuis la barre de gauche.
- On ne demande **rien** : ni nom, ni courriel. Le prénom ne sert qu'à la présence ; on le demande au premier
  partage, une fois.

### 3.2 Ne rien perdre (le vrai risque du local)
Un navigateur peut effacer ce qu'un site a rangé chez lui. Safari le fait au bout de 7 jours sans visite pour un
site non installé. C'est le premier ennemi de l'édition gratuite, il faut le traiter dans l'interface :

- Au premier contenu, on appelle `navigator.storage.persist()` (silencieux sur Chrome pour un site visité souvent).
- Une **pastille d'état** dans l'en-tête, toujours au même endroit, dit où vivent les tableaux :
  - « Sur cet appareil » (gris) → au clic : *Installer Notak*, *Synchroniser mes appareils*, *Télécharger une copie*
  - « Synchronisé · il y a 2 min » (vert)
  - « Hors ligne · 3 changements en attente » (orange, rien n'est perdu)
  - « Drive déconnecté · Reconnecter » (rouge, un seul bouton)
- Après 5 minutes de travail ou à la deuxième visite, une seule invitation discrète : *Installer Notak* (la PWA
  existe déjà, `apps/web/pwa`). Installée, l'application n'est plus soumise à l'effacement de Safari.
- Sans synchro branchée, un rappel par mois : « Dernière copie il y a 30 jours — Télécharger (.notak) ».
- **Exporter / Importer** un `.notak` (zip : documents Yjs + images) marche toujours, sans réseau.

### 3.3 Retrouver ses tableaux sur un autre appareil
- Réglages → **Mes appareils** → *Google Drive*, *Dropbox*, *OneDrive*, ou *Un dossier* (bureau Tauri, WebDAV/Nextcloud).
- Une phrase, pas plus : « Notak range vos tableaux dans un dossier de votre Drive. Personne d'autre que vous ne
  les voit, Notak n'a pas de serveur. »
- Une fenêtre d'autorisation, puis c'est fini. Sur l'autre appareil : premier écran → **Retrouver mes tableaux** →
  même compte → tout arrive.
- Si les deux appareils avaient déjà des tableaux, **ils s'additionnent** (fusion Yjs) : on n'a jamais à choisir
  « garder celui-ci ou celui-là ».
- iCloud : pas d'accès web gratuit (CloudKit demande un compte développeur Apple payant). Mais l'application de
  bureau (et plus tard iPhone) peut viser *un dossier*, donc le dossier iCloud Drive, Dropbox ou Syncthing : même
  format de fichiers, aucune ligne de code de plus.

### 3.4 Partager et travailler à plusieurs
- **Partager** → *Peut modifier* / *Peut voir* → le lien est copié. Le lien porte la clé (`notak.app/p/<salle>#<clé>`) :
  la partie après `#` ne quitte jamais le navigateur, le relais ne voit que des octets chiffrés.
- La personne invitée ouvre le lien, tape son prénom une fois, et travaille. Pas de compte. Le tableau apparaît
  ensuite dans son espace, sous « Partagés avec moi » (et dans son Drive si elle en a branché un).
- *Peut voir* : le relais refuse toute écriture qui ne présente pas le secret d'écriture, que seul le lien
  « modifier » contient.
- **Retirer l'accès** = changer de clé : le tableau part dans une nouvelle salle, les anciens liens meurent.
  L'interface le dit ainsi : « Les personnes qui avaient le lien n'y ont plus accès. Renvoyez le nouveau lien à
  celles qui doivent le garder. »
- **Mot de passe** sur un tableau : la clé est tirée du mot de passe. Pas de mot de passe dans le lien, et le
  relais ne peut pas le deviner à notre place.
- **Page publique** : un lien *voir* sans présence ni curseurs.

### 3.5 Quand un quota gratuit est atteint
Le local ne dépend de personne, donc rien ne casse : la pastille passe à « Direct en pause jusqu'à demain, vos
changements partent dès que possible » et, si un Drive est branché, ils y partent quand même. Personne ne perd une
ligne ; seul le temps réel attend.

## 4. Comment ça marche dessous

### 4.1 Les coutures existent déjà
`packages/tableau/src/coeur/espaceDistant.ts` définit `Reseau` (`persister`, `connecter`, `declarer`) et l'interface
`DepotFichiers` sert les images. Le serveur n'est qu'une implémentation (`creerReseauNavigateur`). L'édition
publique en ajoute d'autres, qu'on compose :

| Implémentation | Rôle |
|---|---|
| `creerReseauLocal` | IndexedDB seul ; `declarer` range le tableau dans un index local |
| `creerReseauCoffre(coffre)` | dépose et relit le journal dans un *coffre* (Drive, Dropbox, OneDrive, dossier, WebDAV) |
| `creerReseauRelais(salle, cle)` | le direct et la présence, chiffrés, pour les tableaux partagés |
| `creerReseauNavigateur` | l'actuel, pour l'édition auto-hébergée |

L'application choisit à la construction (`VITE_EDITION=publique|serveur`).

### 4.2 Le format dans le coffre
Le coffre n'est qu'un endroit où l'on dépose des fichiers ; il ne sait pas fusionner. On évite donc que deux
appareils écrivent le **même** fichier :

```
Notak/                                   (appDataFolder sur Drive, « App folder » sur Dropbox)
  index.yjs                              la liste des tableaux, elle-même un document Yjs
  tableaux/<id>/base.yjs                 un instantané
  tableaux/<id>/journal/<appareil>-<n>.maj   les mises à jour d'un appareil, numérotées
  fichiers/<sha256>                      les images, nommées par leur contenu (jamais deux fois)
```

- Chaque appareil n'écrit que **ses** fichiers de journal : pas de conflit d'écriture possible.
- Lire = télécharger `base.yjs` et les journaux qu'on n'a pas encore vus, `Y.applyUpdate` sur chacun, dans
  n'importe quel ordre.
- Écrire = regrouper ce qui a changé (même rythme qu'aujourd'hui, une seconde) et déposer un fichier toutes les
  10 à 30 s au plus, pour ménager les quotas des API.
- Compacter = un appareil réécrit `base.yjs` avec l'état fusionné, puis efface les journaux dont le vecteur d'état
  est contenu dans la nouvelle base. Si deux appareils compactent en même temps, il reste deux bases correctes :
  la fusion est idempotente.
- Savoir qu'il y a du nouveau : l'API de changements du coffre (`changes.list` sur Drive, `list_folder/longpoll`
  sur Dropbox), au retour sur l'onglet et toutes les 30 s tant qu'il est visible.

Portées demandées : `drive.appdata` sur Google (non sensible : vérification de base seulement, gratuite),
« App folder » sur Dropbox, `Files.ReadWrite.AppFolder` sur OneDrive. Notak ne voit jamais le reste du Drive, et
c'est ce qu'on peut écrire honnêtement dans la fenêtre d'autorisation.

### 4.3 Le relais chiffré
Un Worker Cloudflare et un Durable Object par salle (stockage SQLite, seul permis sur l'offre gratuite) :

- Il reçoit des mises à jour Yjs **chiffrées** (AES-GCM, clé du lien), les rediffuse aux présents et les garde
  pour les absents. Il ne peut ni les lire ni les fusionner.
- Le compactage se fait donc côté client : de temps en temps, un participant envoie un instantané chiffré qui
  remplace le journal.
- Images d'un tableau partagé : réduites dans le navigateur (1600 px, WebP), chiffrées, rangées dans la salle par
  morceaux, avec un plafond par salle (50 Mo par exemple).
- Une salle que personne n'a ouverte depuis 6 mois s'efface (l'alarme du Durable Object). Les copies locales et
  les coffres des participants, eux, restent.
- Il est protocolaire et petit (de l'ordre de 200 lignes) : le protocole Yjs est déjà là, on ajoute le chiffrement.

Ordre de grandeur de l'offre gratuite (à revérifier au moment de brancher) : 100 000 requêtes par jour (messages
WebSocket compris), 5 Go de stockage SQLite en tout, 100 000 lignes écrites par jour ; au-delà, refus jusqu'à minuit
UTC, jamais de facture. D'où le regroupement des envois et la priorité au coffre pour la synchro entre ses propres
appareils : le relais ne sert qu'aux tableaux réellement partagés.

### 4.4 Ce que fait aujourd'hui le serveur, et où ça va

| Aujourd'hui (`/api/…`) | Édition publique |
|---|---|
| inscription, connexion, sessions | supprimé : pas de compte. L'identité d'un coffre est le compte Drive ; celle d'une salle, un prénom et une couleur |
| `fichiers`, `fichiers/:id` | OPFS sur l'appareil, `fichiers/<sha256>` dans le coffre, morceaux chiffrés dans la salle |
| `apercu`, `fichiers/rapatrier` | un second Worker gratuit qui lit la page et rend titre/image (l'origine du navigateur ne le peut pas, CORS), avec cache |
| `recherche` | dans le navigateur, sur les documents locaux (`coeur/recherche.ts` existe) |
| `tableaux/:id/export`, `medias` | dans le navigateur (`fflate` est déjà une dépendance du web) |
| `partage`, `acces`, `lien`, `mot-de-passe`, `public` | clés de salle (§ 4.3) |
| `activite`, `notifications`, `recents` | tirés du document Yjs (qui a changé quoi depuis ma dernière visite), sans notification poussée |
| `favoris`, `vu`, réglages du compte | `index.yjs` dans le coffre, donc suivis d'un appareil à l'autre |
| `jetons`, `arrivee` (Raccourci iOS, envoi par jeton) | la cible de partage de la PWA suffit sur l'appareil ; l'envoi par jeton reste une fonction de l'édition serveur |

## 5. Ce qu'on a écarté

| Piste | Pourquoi non |
|---|---|
| Le conteneur sur une machine gratuite (Oracle) | gratuit en argent, pas en responsabilité : on héberge les données et les fichiers des autres, on surveille, on sauvegarde, et le compte peut fermer du jour au lendemain |
| Firebase, Supabase gratuits | comptes à gérer, données chez nous, quotas facturés ou projets mis en pause ; on garde le rôle d'hébergeur |
| Pair à pair pur (WebRTC) | les deux appareils doivent être allumés en même temps, et il faut quand même un serveur pour se trouver |
| Faire payer, ou un abonnement « Pro » | contraire au but ; si Notak a du succès, des dons (Liberapay, Open Collective) couvrent l'offre payante Cloudflare (≈ 5 $/mois) |
| R2 pour les images partagées | demande une carte bancaire, et facture au-delà du gratuit : la seule brique qui pourrait coûter sans prévenir |

## 6. Les risques, dits franchement

- **Données perdues sans coffre** : c'est le prix de « sans compte ». La pastille d'état, l'installation et le
  rappel mensuel sont là pour ça ; ils font partie du minimum, pas des finitions.
- **Vérification Google** : sans elle, 100 utilisateurs au plus et un écran « application non vérifiée ». Avec la
  portée `drive.appdata`, elle demande un domaine vérifié, une politique de confidentialité et un logo — rien de
  payant. Dropbox demande de même un passage « production » gratuit.
- **Les conditions gratuites peuvent changer** : le relais n'est qu'un étage. S'il disparaît, le local et le coffre
  continuent ; seuls le partage et le direct s'arrêtent, et un autre relais (le serveur auto-hébergé, par exemple)
  peut le remplacer, le protocole étant le même.
- **Lien = clé** : qui a le lien a le tableau. C'est le comportement attendu de ce genre d'outil, mais il faut le
  dire au moment de copier le lien.

## 7. Dans quel ordre

| Passe | Contenu | Livre |
|---|---|---|
| A | `creerReseauLocal`, images en OPFS, aperçus par un Worker, construction statique, mise en ligne sur Cloudflare Pages | notak.app utilisable, sans compte, gratuit |
| B | pastille d'état, `persist()`, invitation à installer, export/import `.notak`, rappel de copie | on ne perd plus rien par surprise |
| C | coffre Google Drive (journal par appareil, compactage), puis Dropbox, OneDrive, dossier (Tauri), WebDAV | ses tableaux sur tous ses appareils |
| D | relais chiffré : partage *voir*/*modifier*, présence, curseurs, mot de passe, page publique | le travail à plusieurs |
| E | `VITE_EDITION` : la même interface, l'édition serveur garde comptes, notifications et envoi par jeton | deux éditions, un seul code |

La passe A suffit déjà à publier. Chaque passe suivante ajoute un étage sans rien retirer au précédent.
