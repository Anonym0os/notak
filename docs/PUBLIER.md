# Publier Notak : gratuit, sans compte, sans serveur, dans le nuage de chacun

> Décidé le 23/10/2026. Le plan d'exécution est dans `docs/PLAN-EDITION-PUBLIQUE.md` ; le format des fichiers dans
> `docs/STOCKAGE.md`. Le serveur actuel (`apps/serveur`, comptes, partage en direct) reste l'édition auto-hébergée,
> pour qui veut tout chez soi.

## 1. Les règles

- **Rien ne dépend de nous.** L'édition publique n'appelle aucun serveur à nous : pas de compte, pas d'API, pas de
  relais. Le site notak.app ne sert que des fichiers statiques, qu'on peut copier n'importe où ; les applications
  installées ne s'en servent plus du tout.
- **Les données restent chez les gens** : sur leur appareil, et dans un dossier de **leur** nuage (iCloud Drive,
  OneDrive, Dropbox, Google Drive, Nextcloud, Syncthing, une clé USB). Notak n'appelle l'API d'aucun nuage : il
  écrit des fichiers dans un dossier, et c'est le logiciel déjà installé qui les transporte.
- **Les gens se relient à leur façon.** Travailler à plusieurs, c'est partager un dossier avec l'outil qu'on a déjà
  (le partage de dossier d'iCloud, de OneDrive, de Nextcloud…). Notak n'envoie rien lui-même.
- **Tout est open source** (AGPL-3.0).

## 2. Les étages

| Étage | Où | Rôle |
|---|---|---|
| L'appareil | IndexedDB et OPFS (navigateur), fichiers de l'application (bureau, mobile) | la copie de travail, hors ligne compris |
| Le dossier privé | un dossier `Notak/` dans le nuage de la personne | l'enregistrement durable, la synchro entre **ses** appareils, l'historique |
| Les dossiers partagés | un dossier `Notak partagé – <nom>/` par arbre de tableaux partagé | le travail à plusieurs, avec les droits que donne le nuage |

## 3. L'expérience

### 3.1 Arriver
- notak.app → un tableau vide tout de suite, sans inscription.
- **Le navigateur est l'essai, les applications sont le produit.** Seuls Chrome et Edge sur ordinateur peuvent
  écrire dans un dossier. Ailleurs (Safari, Firefox, mobiles), le navigateur n'a que son propre stockage, et Safari
  l'efface au bout de 7 jours sans visite, sauf si le site est ajouté à l'écran d'accueil. La pastille d'état le dit
  (« Sur ce navigateur seulement ») et propose d'installer l'application ou de télécharger une copie `.notak`.

### 3.2 Ranger
- Premier lancement de l'application : « Où ranger vos tableaux ? ». Notak propose ce qu'il trouve, par son nom
  (*iCloud Drive*, *OneDrive*, *Dropbox*, *Nextcloud*…), puis *Un autre dossier* et *Seulement sur cet appareil*.
- **iCloud** : partout, un dossier choisi dans iCloud Drive. Sur iPhone et iPad, il est choisi avec le sélecteur de
  Fichiers et l'accès est retenu ; sur Windows, avec « iCloud pour Windows ».
- Deuxième appareil : même question ; Notak reconnaît le dossier existant (« 12 tableaux, modifiés hier sur le Mac
  de Samy ») et le rejoint. Les tableaux des deux appareils s'additionnent.
- **Pastille d'état**, lue dans le dossier lui-même :
  - « Enregistré dans iCloud Drive · il y a 4 s »
  - « En attente du dossier » : débranché, ou fichiers pas encore descendus du nuage ; tout est sur l'appareil
  - « iPhone de Samy : rien depuis 12 jours »
- Réglages → Appareils (liste, *Oublier*), Réglages → Dossier (changer, ouvrir dans le Finder).
- Export et import `.notak` partout, sans réseau.

### 3.3 Travailler à plusieurs
- **Partager** un tableau = « Partager un dossier » : Notak crée `Notak partagé – <nom>/` dans le nuage choisi, y
  range le tableau **et tout son arbre de sous-tableaux**, puis ouvre la fenêtre de partage du système. Les droits
  (lecture, modification, retrait) sont ceux du nuage.
- **Rejoindre** = « Ouvrir un dossier partagé » dans Notak. Le tableau apparaît sous « Partagés avec moi ».
- Un dossier partagé en lecture seule rend le tableau en lecture seule.
- Deux personnes qui écrivent dans la même note ne s'écrasent pas : le texte se fusionne caractère par caractère.
- **Pas de temps réel** : les changements arrivent au rythme du nuage (de quelques secondes à quelques minutes), et
  il n'y a pas de curseurs en direct. À la place, « Léa a modifié il y a 3 min » sur ce qui a changé.
- **Les participants partagent le même service** (tous sur iCloud, ou tous sur Nextcloud…).

### 3.4 Liens, cartes, images
- **Aperçus de liens** : calculés sur l'appareil par l'application de bureau ou mobile. Dans le navigateur, on
  affiche l'adresse seule.
- **Cartes et adresses** : l'appareil interroge OpenStreetMap directement, et seulement au clic sur la carte.
- **Images** : réduites sur l'appareil, rangées sous leur empreinte dans le dossier, avec une miniature floue en
  attendant que le nuage les livre.

## 4. Les questions qu'on nous posera

| Question | Réponse |
|---|---|
| Qui garde la version officielle ? | Personne : toutes les copies convergent. Le tableau existe tant qu'une copie existe, et il y en a autant que d'appareils et de participants. Chaque appareil garde son historique dans **son** dossier privé. |
| Un iPad et un PC Windows ? | Oui, avec iCloud (« iCloud pour Windows » sur le PC). OneDrive, Google Drive et Dropbox n'offrent pas de vrai dossier synchronisé sur iPad. |
| J'ai perdu mon appareil. | Installer Notak ailleurs, choisir le même nuage : tout revient. L'appareil perdu reste connecté au nuage tant qu'on ne l'a pas retiré **du compte iCloud ou OneDrive** ; c'est là qu'on le coupe. Il garde ce qu'il contenait, protégé par son verrouillage. |
| Quelqu'un a tout effacé dans un tableau partagé. | Chacun a l'historique dans son dossier privé : « Revenir à cette version » écrit l'ancien état comme un changement nouveau, que tout le monde reçoit. |
| Mon nuage est plein. | Notak continue sur l'appareil et le signale. Réglages → Dossier montre ce que pèse chaque tableau. |
| Et si notak.app ferme ? | Rien ne change pour les applications installées. Le code est libre. |
| Notak lit-il mes tableaux ? | Non : il n'y a rien chez nous. |

## 5. Ce que ça coûte
- Le nom de domaine, et un hébergement de fichiers statiques.
- Apple Developer Program (99 $/an), indispensable pour distribuer sur iPhone et iPad. Google Play 25 $ une fois,
  ou F-Droid et le `.apk` sur le site, gratuitement.

## 6. Plus tard, facultatif
- Un relais temps réel **open source et auto-hébergeable** (curseurs, présence en direct), choisi par l'utilisateur
  dans les réglages, chiffré de bout en bout. Il n'est jamais nécessaire.
- Le chiffrement du dossier par une phrase de passe.
