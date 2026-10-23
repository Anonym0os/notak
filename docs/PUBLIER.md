# Publier Notak gratuitement, souverain, sans stocker les données des autres

> Proposition du 23/10/2026, revue deux fois le même jour. Contraintes :
> - **Souverain** : notre infrastructure ne dépend d'aucun service tiers (ni Cloudflare, ni CDN, ni S3), et
>   l'application n'appelle l'API d'aucun nuage.
> - **Un seul serveur, le nôtre**, qui sert l'application et quelques services légers.
> - **Aucun stockage à payer pour les utilisateurs** : le serveur ne garde ni leurs tableaux ni leurs fichiers.
> - **Gratuit pour les gens**, et pourtant leurs tableaux sont enregistrés proprement, les suivent d'un appareil à
>   l'autre (y compris par leur iCloud) et se partagent.
>
> Le serveur actuel (`apps/serveur`, comptes et stockage) reste l'édition auto-hébergée, pour qui veut tout chez
> soi (association, entreprise, famille). Cette page décrit l'édition publique de notak.app.

## 1. Trois étages, chacun à sa place

| Étage | Où | Rôle | Qui paie |
|---|---|---|---|
| **L'appareil** | IndexedDB, OPFS | la copie de travail : la toile lit et écrit là, hors ligne compris | personne |
| **Le dossier Notak** | un dossier dans le nuage **de l'utilisateur** : iCloud Drive, OneDrive, Dropbox, Google Drive, Nextcloud, Syncthing, clé USB | l'enregistrement durable, et la synchro entre **ses** appareils | l'utilisateur, avec le quota qu'il a déjà |
| **Notre serveur** | notak.app | servir l'application ; relier en direct, chiffré, les personnes qui partagent un tableau | nous, sans disque qui grandisse |

Le dossier Notak est l'enregistrement propre : un format de fichiers pensé pour survivre à n'importe quel logiciel de
synchro (copies de conflit, fichiers à moitié livrés, fantômes iCloud, désordre). Il est décrit et justifié, règle par
règle, dans **`docs/STOCKAGE.md`**. Notak n'appelle l'API d'aucun nuage : il écrit dans un dossier, et c'est le
logiciel déjà installé qui synchronise. Aucune clé d'API, aucune dépendance à des conditions d'utilisation.

Notre serveur n'est **pas** dans le chemin de l'enregistrement. S'il s'arrête, chacun garde ses tableaux et sa synchro
entre ses appareils ; seul le travail à plusieurs en direct s'interrompt.

## 2. Notre serveur

| Service | Ce qu'il fait | Ce qu'il coûte |
|---|---|---|
| Fichiers de l'application | sert le site et les installateurs des applications | rien de plus qu'aujourd'hui |
| Salles (WebSocket) | met en relation les participants d'un tableau partagé (signalisation WebRTC), relaie les mises à jour **chiffrées** quand le direct échoue | de la bande passante |
| STUN / TURN (`coturn`) | aide les appareils à se joindre en direct | de la bande passante |
| Boîte de transit | garde les mises à jour **texte chiffrées** d'un tableau partagé jusqu'à ce que chaque participant les ait reçues | **un plafond fixe** (§ 4.3) |
| Aperçus de liens | lit une page et rend titre et image (`apercu.ts` existe) | du calcul ; rien n'est gardé |

Il ne voit jamais un tableau en clair : la clé reste dans le lien, après le `#`, que le navigateur n'envoie pas. Il n'a
pas de base d'utilisateurs, pas de mots de passe, pas de fichiers envoyés. Il n'est pas l'hébergeur des contenus.

## 3. L'expérience

### 3.1 Arriver
- notak.app → **un tableau vide tout de suite**, sans inscription. C'est la différence la plus visible avec Milanote.
- Les bulles de découverte existantes (`BullesDecouverte`) font le reste.
- On ne demande rien. Le prénom ne sert qu'à la présence ; on le demande au premier partage, une fois.

### 3.2 Le web est l'essai, les applications sont le produit
Un navigateur ne peut écrire dans un dossier que dans Chrome et Edge sur ordinateur. Partout ailleurs (Safari,
Firefox, mobiles), il n'a que son stockage interne, qu'il peut effacer. On le dit au lieu de le cacher :

- Dans un navigateur sans dossier, la pastille d'état affiche « Sur ce navigateur seulement » et propose, dans cet
  ordre : *Installer Notak* (l'application de la plateforme), *Télécharger une copie* (`.notak`).
- Dans Chrome et Edge sur ordinateur : *Choisir un dossier* (iCloud Drive, OneDrive… s'ils sont installés).
- `navigator.storage.persist()` dès le premier contenu, et un rappel mensuel de copie tant qu'aucun dossier n'est
  branché.

Le tableau des plateformes, avec ce qui marche réellement sur chacune, est au § 6 de `STOCKAGE.md`.

### 3.3 Enregistrer et retrouver ses tableaux
- Premier lancement de l'application : **« Où ranger vos tableaux ? »**. Notak propose ce qu'il trouve, par son nom :
  *iCloud Drive*, *OneDrive*, *Dropbox*, *Nextcloud*… ; puis *Un autre dossier* et *Seulement sur cet appareil*.
  Sur iPhone et iPad, *iCloud Drive* est le choix par défaut (Fichiers → iCloud Drive → Notak).
- Deuxième appareil : même question. Notak reconnaît le dossier existant (« 12 tableaux, modifiés hier sur le Mac de
  Samy ») et le rejoint. Les tableaux des deux appareils **s'additionnent**.
- **Pastille d'état**, tirée du dossier lui-même :
  - « Enregistré dans iCloud Drive · il y a 4 s » (vert)
  - « En attente du dossier » (orange : débranché, ou fichiers pas encore descendus du nuage ; rien n'est perdu,
    tout est sur l'appareil)
  - « iPhone de Samy : rien depuis 12 jours » (lu dans le dossier, sans serveur)
- **Réglages → Appareils** : la liste des appareils du dossier, avec *Oublier* (sûr : voir `STOCKAGE.md` § 5.4).
- **Réglages → Dossier** : changer de dossier, chiffrer par une phrase de passe, ouvrir dans le Finder.
- **Exporter / Importer** un `.notak` reste possible partout, sans réseau.

### 3.4 Les images
- À l'ajout, l'image est réduite (1600 px, WebP), rangée sous son empreinte sur l'appareil et dans
  `Notak/fichiers/`. Elle suit donc ses appareils par son nuage, comme le reste.
- Le tableau garde une **miniature floue** (quelques centaines d'octets) et ses proportions. Un appareil qui n'a pas
  encore l'image l'affiche floue, à la bonne taille, jusqu'à ce que le nuage la livre.
- Sur un **tableau partagé**, les autres participants n'ont pas accès à mon nuage. Les images passent alors d'appareil
  à appareil (WebRTC, par TURN au besoin), jamais par le disque du serveur. Si personne qui l'a n'est en ligne, la
  carte le dit : « L'image arrivera quand Léa sera en ligne ».

### 3.5 Partager et travailler à plusieurs
- **Partager** → *Peut modifier* / *Peut voir* → le lien est copié : `notak.app/p/<salle>#<clé>`.
- La personne invitée ouvre le lien, tape son prénom, travaille. Le tableau rejoint son espace (« Partagés avec
  moi ») et donc **son** dossier Notak : chacun garde sa copie dans son propre nuage.
- *Peut voir* : le serveur refuse toute écriture qui ne présente pas le secret d'écriture, que seul le lien
  *modifier* contient.
- **Retirer l'accès** = changer de clé. Le tableau passe dans une nouvelle salle, les anciens liens meurent.
- **Mot de passe** sur un tableau : la clé est tirée du mot de passe (Argon2id).
- **Asynchrone** : Léa modifie le soir, Samy ouvre le lendemain. Le texte attend Samy dans la boîte de transit ; les
  images, qu'un appareil qui les a soit en ligne.

## 4. Comment ça marche dessous

### 4.1 Les coutures existent déjà
`packages/tableau/src/coeur/espaceDistant.ts` définit `Reseau` (`persister`, `connecter`, `declarer`) ; `DepotFichiers`
sert les images. Le serveur actuel n'est qu'une implémentation (`creerReseauNavigateur`). L'édition publique en ajoute,
qu'on compose :

| Implémentation | Rôle |
|---|---|
| `creerReseauLocal` | IndexedDB ; `declarer` range le tableau dans le document de l'espace (`index`) |
| `creerDossierNotak(dossier)` | le format de `STOCKAGE.md`, sur une interface `Dossier` à trois réalisations : Tauri (fichiers du système, iCloud natif sur iOS), navigateur (`showDirectoryPicker`), mémoire (tests) |
| `creerReseauPair(salle, cle)` | tableaux partagés : WebRTC, repli sur le relais WebSocket puis sur le transit ; AES-GCM sur chaque mise à jour |
| `creerReseauNavigateur` | l'actuel, pour l'édition auto-hébergée |

L'application choisit à la construction (`VITE_EDITION=publique|serveur`).

### 4.2 Les applications
- **Bureau** (`apps/bureau`, Tauri, existe) : aujourd'hui une fenêtre sur le serveur. Elle embarque désormais
  l'application et gagne l'accès aux fichiers (`tauri-plugin-fs`, limité au dossier choisi) et la surveillance du
  dossier. Sur Mac, iCloud Drive est un dossier ordinaire ; sous Windows, avec « iCloud pour Windows » aussi.
- **iPhone, iPad** (Tauri 2 mobile) : un petit greffon Swift pour le conteneur iCloud de l'application (visible dans
  Fichiers), et la demande de téléchargement des fichiers que l'iPhone a « optimisés ».
- **Android** (Tauri 2 mobile) : un dossier choisi par le sélecteur du système, accès conservé. Pas d'iCloud ; les
  nuages qui offrent un vrai dossier synchronisé sur Android (Syncthing, Nextcloud, FolderSync) marchent.

### 4.3 La boîte de transit, bornée
Elle ne sert qu'aux tableaux partagés entre personnes différentes (ses propres appareils se synchronisent par le
dossier). C'est le seul disque utilisé sur le serveur, **plafonné quel que soit le nombre d'utilisateurs** :

- des **mises à jour texte chiffrées**, jamais d'images ;
- chaque mise à jour est effacée dès que tous les participants l'ont accusée reçue ;
- plafonds : 1 Mo par salle, 30 jours par mise à jour, un plafond global fixé une fois (2 Go par exemple). Au-delà,
  les plus anciennes partent d'abord ;
- elle n'est **jamais la seule copie** : ce qu'elle perd reste sur l'appareil et dans le dossier de son auteur, et
  repart en direct au prochain croisement.

Réglée à zéro, tout marche encore ; le partage asynchrone attend alors que les participants se croisent en ligne.

### 4.4 Ce que fait le serveur actuel, et où ça va

| Aujourd'hui (`/api/…`) | Édition publique |
|---|---|
| inscription, connexion, sessions | supprimé : le dossier est l'espace, le prénom suffit au partage |
| `fichiers`, `fichiers/:id` | sur l'appareil et dans `Notak/fichiers/` ; entre participants d'un partage, de pair à pair |
| `apercu`, `fichiers/rapatrier` | `/apercu` du serveur, sans compte, limité en débit (`debit.ts`) ; l'image rapatriée est rangée sur l'appareil |
| `recherche` | sur l'appareil (`coeur/recherche.ts` existe) |
| `tableaux/:id/export`, `medias` | sur l'appareil (`fflate` est déjà une dépendance du web) |
| `partage`, `acces`, `lien`, `mot-de-passe`, `public` | clés de salle (§ 3.5) |
| `activite`, `notifications`, `recents` | tirés des documents Yjs, sans notification poussée |
| `favoris`, `vu`, réglages | le document de l'espace, donc dans le dossier, donc sur tous ses appareils |
| `jetons`, `arrivee` (envoi par jeton) | la cible de partage de l'application suffit ; l'envoi par jeton reste à l'édition serveur |
| page publique | un lien *voir*, ou un export HTML statique que l'auteur héberge où il veut |

## 5. Ce qu'on a écarté

| Piste | Pourquoi non |
|---|---|
| Les API des nuages (CloudKit JS, Google Drive, Dropbox, Microsoft Graph) | une intégration et un compte développeur par nuage, des conditions qui changent, des vérifications d'application ; le dossier fait la même chose pour tous, sans rien demander à personne |
| Cloudflare, S3, CDN | services tiers pour notre propre infrastructure |
| Le serveur actuel ouvert à tous | on stockerait les tableaux et les fichiers de chacun : disque qui grossit, sauvegardes, statut d'hébergeur |
| Synchro entre ses appareils par notre serveur | inutile dès qu'il y a un dossier, et ce serait du stockage chez nous |
| WebDAV depuis le navigateur | CORS rarement ouvert sur les serveurs Nextcloud ; l'application de bureau, elle, passe par le dossier synchronisé |
| Faire payer | contraire au but |

## 6. Les risques, dits franchement

- **Navigateur seul, sans dossier** : c'est un essai, il peut être effacé. L'interface le dit et pousse vers
  l'application.
- **Le compte Apple Developer (99 $/an)** est inévitable pour iPhone et iCloud. C'est le seul coût récurrent, et il
  est lié à la distribution sur iOS, pas au nombre d'utilisateurs.
- **Le dossier peut être mal synchronisé** par le logiciel du nuage (quota plein, logiciel arrêté). Notak ne peut pas
  le réparer, mais il le voit : un appareil qui n'a rien écrit depuis longtemps est signalé dans la pastille.
- **Phrase de passe du dossier perdue = tableaux perdus**, si l'on a choisi de chiffrer. Par défaut, on ne chiffre
  pas.
- **Lien = clé** : qui a le lien a le tableau partagé. Il faut le dire au moment de copier le lien.

## 7. Dans quel ordre

| Passe | Contenu | Livre |
|---|---|---|
| A | `creerReseauLocal`, images sur l'appareil, `/apercu` sans compte, application servie par notre serveur | notak.app utilisable, sans compte |
| B | le format de `STOCKAGE.md`, l'interface `Dossier`, **le faux logiciel de synchro et ses tests de propriétés** | un enregistrement prouvé avant d'être branché |
| C | `Dossier` dans Chrome et Edge ; application de bureau autonome (Tauri + `fs`) ; pastille, Réglages → Dossier et Appareils | iCloud Drive, OneDrive, Dropbox, Nextcloud sur Mac, Windows, Linux |
| D | applications iPhone, iPad (conteneur iCloud) et Android | les tableaux dans la poche |
| E | `apps/relais` + `coturn` + transit : tableaux partagés, clés par appareil, présence, curseurs, mot de passe, retrait sans renvoi de lien, appareils reliés par une salle | le travail à plusieurs, et un iPad avec un PC sans nuage commun |
| F | `VITE_EDITION` : la même interface ; l'édition serveur garde comptes, notifications et envoi par jeton | deux éditions, un seul code |

La passe B passe avant tout branchement réel : on ne confie pas les tableaux des gens à un format qui n'a pas
survécu au faux logiciel de synchro.

## 8. Les questions concrètes

### Un tableau rangé dans le nuage d'une personne, d'autres peuvent-ils y travailler ?
Oui, parce qu'un tableau partagé **n'est hébergé par personne**. Chaque participant en a une copie complète :
sur son appareil et dans **son propre** dossier Notak. Les changements passent d'une copie à l'autre par notre
serveur (chiffrés, en direct quand les deux sont en ligne, par la boîte de transit sinon). Personne n'a besoin
d'accéder au nuage d'un autre. Léa sur iCloud et Samy sur OneDrive travaillent sur le même tableau, chacun garde le
sien dans son nuage.

Deux personnes qui écrivent en même temps dans la même note ne s'écrasent pas : le texte est fusionné caractère par
caractère (`Y.XmlFragment`, déjà en place), avec les curseurs de chacun.

### Un iPad et un PC Windows, ça marche ?
- **À plusieurs** (mon iPad, le PC de Léa) : oui, toujours. Le partage ne dépend pas du nuage de chacun.
- **Mes propres appareils** (mon iPad et mon PC) : le dossier doit être dans un nuage présent sur les deux.
  - **iCloud** : sur l'iPad, c'est natif ; sur le PC, avec « iCloud pour Windows » (gratuit). C'est la réponse
    à donner par défaut.
  - **OneDrive, Google Drive, Dropbox** : leur application pour iPad n'offre pas de vrai dossier synchronisé, seulement
    l'accès fichier par fichier. On ne le promet pas.
  - Sinon, **relier les appareils** comme on partage un tableau : l'espace entier passe alors par une salle
    chiffrée, comme un tableau partagé. Chaque appareil garde le dossier qu'il peut (iCloud sur l'iPad, OneDrive sur
    le PC), et le serveur ne garde que le transit borné.

L'écran « Où ranger vos tableaux ? » le dit au moment du choix : « Vous avez aussi un PC ? iCloud pour Windows
retrouvera ce dossier. »

### Qui garde la version officielle ?
**Il n'y en a pas, et c'est voulu.** Toutes les copies convergent vers le même état ; aucune n'est plus vraie qu'une
autre. Concrètement :

- Le tableau existe tant qu'**une** copie existe : il y en a autant que de participants, et autant que de nuages.
  C'est plus solide qu'un serveur unique, pas moins.
- Le **créateur** n'a pas de copie privilégiée. Il a un rôle : il peut changer les droits et retirer un participant.
  Ce rôle peut être transmis à un autre participant.
- **Historique** : chaque appareil garde dans son dossier des versions datées (une par jour sur 30 jours, une par
  semaine sur 6 mois ; voir `STOCKAGE.md` § 5.7). « Revenir à cette version » écrit l'ancien état comme un nouveau
  changement : tout le monde le reçoit, et l'on peut encore revenir en arrière.
- **Quelqu'un vide le tableau**, par erreur ou exprès : la suppression se propage à tous, comme sur n'importe quel
  outil collaboratif. Mais chacun a l'historique dans son propre dossier, et un seul participant suffit pour
  restaurer.

### Et si je perds mon appareil ?
| Situation | Ce qui se passe |
|---|---|
| J'avais un dossier dans mon nuage | J'installe Notak sur le nouvel appareil, je choisis le même nuage : tout revient, historique compris. Puis *Réglages → Appareils → Oublier* l'ancien. |
| Mes tableaux partagés | Ils sont dans mon dossier, et les autres participants en ont des copies. Même sans dossier, un participant peut me renvoyer une invitation. |
| Quelqu'un trouve l'appareil perdu | Il a ce que l'appareil contient (protégé par le verrouillage de l'appareil). *Oublier* cet appareil change les clés de mes tableaux partagés et de mon espace relié ; les autres participants reçoivent les nouvelles automatiquement (ci-dessous). L'appareil perdu ne reçoit plus rien. |
| Navigateur seul, sans dossier, sans partage | Perdu. C'est la raison pour laquelle l'interface traite ce mode comme un essai et le dit (§ 3.2). |
| Dossier chiffré et phrase de passe oubliée | Perdu, et on l'a dit au moment de choisir le chiffrement. |

### Retirer quelqu'un, ou un appareil, sans renvoyer de liens à tout le monde
Un lien de partage sert à **entrer**. Une fois dedans, chaque appareil a sa propre paire de clés (X25519), et la clé du
tableau lui est remise chiffrée pour lui seul. Retirer un participant ou un appareil, c'est :

1. tirer une nouvelle clé de tableau ;
2. la chiffrer pour chaque appareil restant, et la déposer dans la salle ;
3. passer dans une nouvelle salle.

Les restants suivent sans rien faire ; le retiré ne peut plus lire ce qui s'écrit ensuite. Comme partout (un fichier
téléchargé, une capture d'écran), il garde ce qu'il avait déjà : on le dit au moment de retirer.

### Les autres questions qu'on nous posera
- **« Mon nuage est plein. »** Notak continue sur l'appareil, et la pastille l'affiche en orange : « iCloud ne prend
  plus de fichiers ». Les images pèsent l'essentiel ; on montre dans *Réglages → Dossier* ce que pèse chaque tableau.
- **« Je veux quitter Notak. »** Le dossier est à moi. L'export `.notak`, et un export lisible (HTML, Markdown et
  images), ne demandent ni compte ni serveur.
- **« Et si notak.app ferme ? »** Les applications installées continuent : tableaux, dossier, synchro entre mes
  appareils. Seul le partage s'arrête, et le relais est libre (AGPL) : n'importe qui peut en remettre un en route, et
  l'application permet d'en choisir un autre dans ses réglages.
- **« Deux personnes déplacent la même carte en même temps. »** Le dernier déplacement l'emporte, sans casse ni
  doublon ; le texte, lui, se fusionne.
- **« Le serveur peut-il lire nos tableaux ? »** Non : il ne voit que des octets chiffrés, et la clé ne lui est
  jamais envoyée.
