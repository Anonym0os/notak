# Le dossier Notak : enregistrer dans l'iCloud, le OneDrive ou le Nextcloud de chacun

> Spécification du 23/10/2026. Complète `docs/PUBLIER.md` : c'est **là** que vivent les tableaux de l'édition
> publique, et rien ne vit chez nous.

## 1. L'idée

Notak n'appelle l'API d'aucun nuage. Il écrit des fichiers dans **un dossier**, et c'est le logiciel de synchro que
la personne a déjà (iCloud Drive, OneDrive, Dropbox, Google Drive pour ordinateur, Nextcloud, Syncthing, ou une clé
USB) qui les porte sur ses autres appareils. On n'a donc ni clé d'API, ni compte développeur chez ces services, ni
dépendance à leurs conditions. Et l'utilisateur garde ses tableaux dans son nuage, avec son quota.

En contrepartie, **on ne contrôle pas le transport**. Ces logiciels livrent les fichiers en retard, dans le désordre,
parfois à moitié, en double sous un autre nom, ou remplacés par un fantôme à télécharger. Le format est fait pour
que rien de tout cela ne fasse perdre ou corrompre un tableau : c'est l'objet de cette page.

## 2. Exigences

| # | Exigence |
|---|---|
| E1 | Un changement enregistré sur un appareil n'est jamais perdu tant qu'un fichier qui le contient existe quelque part. |
| E2 | Tous les appareils qui ont reçu les mêmes fichiers affichent le même état, quel que soit l'ordre d'arrivée. |
| E3 | Aucun fichier n'est écrit par deux appareils : aucun conflit de synchro ne peut naître de Notak. |
| E4 | Un fichier incomplet, abîmé, en double ou inconnu est ignoré ou absorbé, jamais une erreur bloquante. |
| E5 | Notak fonctionne sans le dossier (hors ligne, dossier débranché) et rattrape au retour. |
| E6 | La taille du dossier reste proportionnelle au contenu, pas à l'historique. |
| E7 | Aucun service tiers n'est appelé par Notak ; l'utilisateur choisit seul où vit le dossier. |
| E8 | On peut tout récupérer sans Notak en ligne : l'application lit le dossier seule, et l'export reste possible. |

## 3. Ce que font réellement les logiciels de synchro (hypothèses adverses)

Le format suppose le pire de chacun, pas son comportement documenté :

| Comportement | Exemples | Réponse du format |
|---|---|---|
| Ordre d'arrivée quelconque, retards de plusieurs heures | tous | fusion Yjs : commutative et idempotente (E2) |
| Fichier visible avant d'être complet | Dropbox, Nextcloud, clés USB | écriture en `.tmp` puis renommage ; en-tête + longueur + empreinte vérifiés à la lecture (E4) |
| Copie de conflit sous un autre nom | `x (conflicted copy).nmj`, `x 2.nmj`, `x-PC-DE-LEA.nmj` | aucun fichier n'est réécrit, donc pas de conflit ; s'il en apparaît une quand même, elle est lue par son contenu et absorbée (idempotence) |
| Fichier remplacé par un fantôme | iCloud « Optimiser le stockage », OneDrive « Fichiers à la demande » | l'application de bureau demande le téléchargement avant de lire ; un fichier pas encore là est retenté plus tard |
| Suppression propagée avant la création | tous | on ne supprime un fichier qu'après qu'un autre fichier du **même appareil** contienne déjà tout son contenu (§ 5.3) |
| Système de fichiers insensible à la casse, caractères interdits (`:` sous Windows), chemins limités | macOS, Windows | noms en minuscules, `[a-z0-9-.]` seulement, chemins de moins de 120 caractères |
| Dossier restauré depuis une sauvegarde ancienne | Time Machine, corbeille du nuage | des fichiers plus vieux ne retirent rien : Yjs ne fait qu'ajouter, les suppressions sont elles-mêmes des ajouts |

## 4. Le format

```
Notak/                                    le dossier choisi
  notak.json                              { "format": 1, "espace": "<id>" }, écrit une fois, identique partout
  appareils/
    <appareil>/                           un dossier par appareil ; SEUL cet appareil y écrit
      appareil.json                       nom (« iPhone de Samy »), plateforme, dernière écriture
      vu.nmv                              le vecteur d'état de chaque tableau déjà absorbé (sert au ménage, § 5.4)
      base-<gen>.nmb                      instantané de tous les tableaux tels que cet appareil les connaît
      maj-<gen>-<seq>.nmj                 les changements faits sur cet appareil depuis la base <gen>
  fichiers/
    <sha256>.<ext>                        images et fichiers, nommés par leur contenu
```

- **`<appareil>`** : un identifiant tiré au hasard à l'installation (128 bits, en base32), jamais réutilisé.
- **`<gen>`**, **`<seq>`** : des entiers croissants, écrits sur 10 chiffres pour que l'ordre alphabétique soit l'ordre
  réel.
- **Un fichier `.nmb` ou `.nmj`** : l'en-tête `NOTAK` + version, puis une suite d'enregistrements
  `(id du tableau, mise à jour Yjs)`, compressée (`fflate`, déjà dans le dépôt), puis la longueur totale et un SHA-256
  du tout. Un fichier dont l'empreinte ne correspond pas est « pas encore arrivé » : on le relira plus tard.
- **`fichiers/`** est le seul dossier partagé en écriture. Mais un nom y est l'empreinte du contenu, donc deux
  appareils qui écrivent le même nom écrivent les mêmes octets : il n'y a pas de conflit possible (E3).
- La liste des tableaux, leurs titres, les favoris et les réglages vivent dans un document Yjs de l'espace (l'id du
  tableau `index`), enregistré comme les autres.

## 5. Les opérations

### 5.1 Écrire
1. Les mises à jour Yjs de l'appareil s'accumulent en mémoire et dans IndexedDB (rien ne change pour la toile).
2. Toutes les 5 s d'activité, et à la fermeture ou au passage en arrière-plan, elles sont écrites dans
   `maj-<gen>-<seq+1>.nmj.tmp`, puis renommées en `.nmj`. Un fichier écrit n'est **jamais** modifié.
3. Le numéro `<seq>` n'avance qu'après le renommage : un plantage entre les deux laisse un `.tmp`, effacé au
   prochain lancement, et les mises à jour sont réécrites depuis IndexedDB.

### 5.2 Lire
1. Au lancement, au retour sur l'application, et toutes les 30 s tant qu'elle est au premier plan (sur ordinateur,
   aussi à chaque événement du système de fichiers), on liste `appareils/*/`.
2. Pour chaque fichier `.nmb` / `.nmj` qu'on n'a pas encore absorbé (on garde en IndexedDB `chemin → taille,
   empreinte`), on vérifie l'empreinte, puis on applique chaque enregistrement au tableau visé.
3. Un fichier aux noms inattendus (copie de conflit, renommage par le nuage) est lu s'il commence par `NOTAK` :
   l'appliquer deux fois ne change rien.
4. Une image référencée par un tableau et absente de `fichiers/` affiche sa miniature floue (gardée dans le tableau)
   jusqu'à son arrivée.

### 5.3 Compacter (E6)
Le journal d'un appareil grossit ; de temps en temps (tous les 200 fichiers ou 5 Mo), l'appareil :

1. écrit `base-<gen+1>.nmb` : l'état complet de chaque tableau tel qu'il le connaît (ses changements **et** ceux des
   autres déjà absorbés), après le ramasse-miettes de Yjs ;
2. une fois ce fichier renommé, supprime **ses propres** `base-<gen>` et `maj-<gen>-*`.

Il ne touche jamais aux fichiers d'un autre appareil. Invariant : à tout instant, le dossier de l'appareil contient
au moins un fichier qui porte chacun de ses changements. Si un autre appareil voit la suppression avant la nouvelle
base, il a soit déjà absorbé les anciens fichiers, soit recevra la nouvelle base, qui existe déjà à la source (E1).

### 5.4 Oublier un appareil
Un téléphone perdu laisse son dossier, qui ne sera plus jamais compacté. Depuis un autre appareil :
**Réglages → Appareils → Oublier**. L'appareil restant :

1. absorbe tous les fichiers de l'appareil oublié ;
2. écrit une base neuve ;
3. vérifie, tableau par tableau, que son vecteur d'état contient celui de chaque fichier de l'appareil oublié
   (`Y.encodeStateVector` sur un document témoin) ;
4. seulement alors, supprime le dossier de l'appareil oublié.

Si la vérification échoue (un fichier pas encore descendu du nuage), il ne supprime rien et le dit.

### 5.5 Brancher un deuxième appareil
Il n'y a pas d'appariement à faire : choisir le même dossier suffit. Le nouvel appareil lit `notak.json`, crée son
sous-dossier, absorbe tout. S'il avait déjà des tableaux, ils s'ajoutent (fusion Yjs), et il les écrit dans sa
première base.

### 5.6 Chiffrement
Le dossier est dans le nuage de l'utilisateur. Au branchement, on lui laisse le choix :

- **Non chiffré** (par défaut) : rien à retenir. Le nuage voit le contenu, comme celui de n'importe quel document.
- **Chiffré** : une phrase de passe (Argon2id, puis AES-GCM sur chaque fichier, noms compris pour `fichiers/`). La
  phrase est demandée une fois par appareil. On dit clairement : *phrase perdue, tableaux perdus*.

### 5.7 Versions
Chaque appareil garde, **dans son propre sous-dossier**, des instantanés datés :

```
appareils/<appareil>/versions/<aaaa-mm-jj>.nmb
```

- Un par jour d'activité, gardé 30 jours ; puis un par semaine, gardé 6 mois. Chaque appareil fait le ménage de ses
  propres versions, jamais de celles des autres (E3).
- Comme chaque appareil garde les siennes, un même tableau a autant d'historiques que d'appareils et de
  participants. C'est ce qui permet de revenir en arrière même si quelqu'un a tout effacé.
- **Restaurer** ne réécrit pas le passé : on calcule l'ancien contenu et on l'écrit comme un changement nouveau.
  Tout le monde le reçoit, et cette restauration peut elle-même être annulée.
- Les images citées par une version ne sont pas effacées de `fichiers/` tant qu'une version les cite.

## 6. Ce qui marche, plateforme par plateforme

Le web ne peut pas écrire dans un dossier partout : c'est la limite la plus dure du projet. D'où des applications.

| Où | Comment Notak atteint le dossier | iCloud | OneDrive, Dropbox, Google Drive, Nextcloud, Syncthing |
|---|---|---|---|
| **Mac, application Notak** (Tauri) | n'importe quel dossier | oui : iCloud Drive est un dossier (`~/Library/Mobile Documents/com~apple~CloudDocs`) | oui, par leur logiciel pour ordinateur |
| **Windows, Linux, application Notak** | n'importe quel dossier | oui sous Windows avec « iCloud pour Windows » | oui |
| **iPhone, iPad, application Notak** (Tauri iOS + petit greffon Swift) | le conteneur iCloud de Notak, visible dans Fichiers → iCloud Drive → Notak | **oui, natif** | via le sélecteur de Fichiers (moins fiable en écriture continue) |
| **Android, application Notak** | un dossier choisi par le sélecteur du système (accès conservé) | non | Syncthing, Nextcloud (dossier synchronisé), FolderSync |
| **Chrome, Edge, sur ordinateur** | `showDirectoryPicker()` ; l'accès est retenu (« Autoriser à chaque visite », Chrome 122+) | oui, si iCloud Drive est installé | oui |
| **Safari, Firefox, navigateurs mobiles** | **impossible** : stockage du navigateur seulement | non | non |

Pour la dernière ligne, l'interface ne ment pas. La pastille dit « Sur ce navigateur seulement », et propose :
*Installer Notak* (vers l'application de la plateforme), *Relier à un appareil qui a votre dossier* (par le relais,
voir `PUBLIER.md`), *Télécharger une copie*. L'édition web est l'essai ; les applications sont le produit.

## 7. Le parcours

1. **Premier lancement de l'application** : « Où ranger vos tableaux ? ». Notak propose ce qu'il trouve sur la
   machine, par son nom : *iCloud Drive*, *OneDrive*, *Dropbox*, *Nextcloud*… ; puis *Un autre dossier* et
   *Seulement sur cet appareil*. Le choix crée `Notak/` dedans.
2. **Deuxième appareil** : même question ; Notak reconnaît le `Notak/` existant (« 12 tableaux, modifiés hier sur
   le Mac de Samy ») et le rejoint.
3. **Pastille d'état**, tirée du dossier lui-même, sans serveur :
   - « Enregistré dans iCloud Drive · il y a 4 s »
   - « En attente du dossier » (débranché, fantômes à télécharger) : les changements restent sur l'appareil
   - « iPhone de Samy : rien depuis 12 jours » (lu dans `appareils/*/appareil.json`)
4. **Réglages → Appareils** : la liste, toujours depuis le dossier, avec *Oublier*.
5. **Réglages → Dossier** : changer de dossier (Notak recopie tout, puis bascule), chiffrer, ouvrir dans le Finder ou
   l'Explorateur.

## 8. Ce qu'il en coûte

- **Côté serveur : rien.** Le dossier ne passe jamais par notre serveur.
- **Côté boutiques** (seuls coûts inévitables, propres à la distribution) :
  - Apple Developer Program, **99 $/an** : obligatoire pour l'App Store, pour le conteneur iCloud et pour la
    notarisation sur Mac. Sans lui, pas d'iCloud sur iPhone.
  - Google Play, 25 $ une fois. Ou bien gratuit : F-Droid, ou le `.apk` sur notak.app.
  - Windows : sans certificat de signature, l'installateur affiche un avertissement SmartScreen la première fois.
    C'est gênant, mais pas bloquant.

## 9. Comment on prouve que ça tient

C'est la partie qui donne la rigueur. Tout le format passe par une interface `Dossier`
(`lister`, `lire`, `ecrireAtomique`, `supprimer`, `surveiller`), et on la teste contre un **faux logiciel de synchro**
qui relie plusieurs faux appareils et, au hasard (graine fixée, rejouable) :

- retarde, réordonne et regroupe les livraisons ;
- livre des fichiers tronqués, puis complets ;
- duplique un fichier en copie de conflit ;
- remplace un fichier par un fantôme pendant un temps ;
- propage une suppression avant une création ;
- restaure un vieil état du dossier ;
- fait planter un appareil entre l'écriture du `.tmp` et le renommage.

Les propriétés vérifiées après chaque scénario, sur des milliers de scénarios tirés au hasard :

1. une fois tout livré, tous les appareils ont le même état (E2) ;
2. aucun changement fait sur un appareil n'est absent de cet état (E1) ;
3. aucun fichier n'a été écrit par deux appareils (E3) ;
4. la taille du dossier après compactage reste sous un multiple fixé de la taille des tableaux (E6).

Puis un essai réel, à la main, avant chaque version : deux machines sur iCloud Drive, OneDrive, Dropbox, Syncthing,
avec coupures réseau et mise en veille.
