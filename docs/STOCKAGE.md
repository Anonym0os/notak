# Le dossier Notak

> Dans l'édition locale (notak.app), c'est l'option **« Synchroniser avec un dossier »**, expérimentale, sur Chrome
> et Edge pour ordinateur (`apps/web/src/local/synchro.ts`) ; l'essentiel, pour la plupart des gens, reste la copie
> `.notak` (`docs/PUBLIER.md`).

> Ce que fait le code de `packages/tableau/src/dossier/`, et pourquoi. L'édition publique enregistre les tableaux
> dans un dossier que la personne choisit dans son nuage (iCloud Drive, OneDrive, Dropbox, Google Drive, Nextcloud,
> Syncthing, une clé USB) ; plusieurs appareils, et plusieurs personnes pour un dossier partagé, y écrivent et y
> lisent. Notak n'appelle l'API d'aucun nuage : c'est le logiciel de synchro déjà installé qui transporte les
> fichiers. Voir `docs/PUBLIER.md` pour le produit.

## 1. Exigences

| # | Exigence | Vérifiée par |
|---|---|---|
| E1 | Une modification faite sur un appareil qui peut écrire n'est jamais perdue. | propriétés, cas C5, C6 |
| E2 | Les appareils qui ont reçu les mêmes fichiers ont le même contenu, quel que soit l'ordre. | propriétés |
| E3 | Aucun fichier de données n'est écrit par deux appareils. | propriétés, cas C4 |
| E4 | Un fichier incomplet, abîmé, en double ou inconnu est ignoré ou absorbé, jamais bloquant. | `fichierNotak.test.ts`, propriétés |
| E5 | Sans le dossier (hors ligne, débranché), Notak continue et rattrape au retour. | propriétés (déconnexions) |
| E6 | Le dossier de chaque appareil reste petit : de l'ordre d'un fichier par tableau. | propriétés |
| E7 | Aucun service tiers n'est appelé. | — |
| E8 | Une copie qui diverge (quelqu'un écrit sous l'identité d'un autre) se voit. | cas « divergence » |

## 2. Ce que les logiciels de synchro font vraiment

Le format suppose le pire de chacun, et le faux nuage des essais (`essais/fauxNuage.ts`) le fait :

| Comportement | Réponse |
|---|---|
| Livraisons en retard, dans le désordre, regroupées | fusion Yjs : commutative et idempotente |
| Fichier visible avant d'être complet | écriture en `.tmp` puis renommage ; longueur et SHA-256 vérifiés à la lecture |
| Copie de conflit (`x 2.nmj`, `x (copie en conflit…).nmj`, `x-PC.nmj`, `x.sync-conflict-….nmj`) | un fichier de données n'est jamais réécrit, donc pas de conflit ; une copie est lue par son contenu et absorbée |
| Fantôme (iCloud « Optimiser le stockage », OneDrive « à la demande ») | on demande le téléchargement, on relira |
| Suppression propagée avant la création qui la précède | on n'efface que ce qu'un autre fichier, déjà vu ailleurs, remplace |
| Fichier effacé qui revient de la corbeille | ses données sont déjà ailleurs ; il est ré-effacé |
| Appareil restauré d'une sauvegarde sur une autre machine (clone) | une session par lancement dans les noms ; le clone se voit et change d'identité |

## 3. Le format

```
<dossier>/
  appareils/
    <appareil>/                         un dossier par appareil ; SEUL cet appareil y écrit
      appareil.json                     nom, personne, plateforme, dernier passage
      vu.json                           les bases des autres que j'ai lues ; l'empreinte de mes tableaux
      oublies.json                      mes pierres tombales (appareils oubliés)
      maj-<session>-<n>.nmj             des mises à jour de plusieurs tableaux
      base-<session>-<n>.nmb            l'état complet d'un tableau
      versions/<tableau>/<aaaa-mm-jj>-complet.nmv | -delta.nmv
```

- **`<appareil>`** : 16 caractères tirés au hasard à la première ouverture, gardés hors du dossier (dépôt local).
- **`<session>`** : tirée à chaque lancement. Deux copies d'un même appareil n'écrivent jamais le même nom.
- **Un fichier `.nmj`, `.nmb` ou `.nmv`** (`fichierNotak.ts`) : `NOTAK`, la version, le genre, la charge compressée
  (`fflate`), la longueur de ce qui précède, et le SHA-256 du tout. Chaque enregistrement est `(tableau, mise à jour
  Yjs)`. Un fichier dont la longueur ou l'empreinte ne correspond pas est « pas encore arrivé ».
- Les fichiers `.json` sont réécrits par leur seul propriétaire ; une copie de conflit d'un `.json` est ignorée.

## 4. Les opérations (`coffre.ts`)

Le coffre fait une chose à la fois. Ce qu'il garde pour lui (dépôt local : IndexedDB, ou un fichier de
l'application) : son identifiant, le registre des fichiers qu'il a écrits, les fichiers déjà lus (chemin et
taille), et par tableau l'**état écrit** (vecteur d'état, suppressions) et l'**attente** (ce qui n'est pas encore
parti).

### 4.1 Enregistrer
1. Pour chaque tableau, on compare son état (vecteur d'état **et** suppressions, car une suppression ne change pas
   le vecteur) à l'état écrit. S'il a changé, le diff depuis l'état écrit rejoint l'attente, gardée **avant** de
   déplacer l'état écrit. Un plantage entre les deux ne fait que réécrire un peu plus.
2. L'attente part dans un `maj-…nmj`. Le nom est noté au registre **avant** que le fichier existe : un fichier de
   mon dossier qui n'est pas au registre et vient d'une session inconnue est d'une autre copie de moi.

### 4.2 Relire
1. Si un autre appareil a une pierre tombale à mon nom, je change d'identité (§ 4.5).
2. Pour chaque appareil, chaque fichier de données pas encore lu (ou dont la taille a changé) :
   - fantôme → téléchargement demandé, on relira ;
   - illisible (incomplet, abîmé) → on relira ;
   - dans mon dossier, d'une session que je n'ai jamais eue → je suis un clone : je change d'identité.
3. Par tableau, d'un seul bloc : ce que j'ai changé passe d'abord dans l'attente, puis on applique ce qui est
   arrivé (une mise à jour que Yjs refuse est sautée), et l'état écrit devient l'état atteint. Ce qui vient du
   dossier n'y retourne donc pas.
4. **C6** : un fichier n'est tenu pour lu que si Yjs n'attend plus rien pour ses tableaux. Sinon ce que Yjs garde en
   attente vit seulement en mémoire, et serait perdu à la fermeture ; le fichier sera relu.
5. `vu.json` dit quelles bases des autres j'ai lues.

### 4.3 Compacter
1. On enregistre d'abord.
2. Chaque tableau qui a plus d'un fichier vivant à moi reçoit une base : son état complet, ce que j'ai fait **et ce
   que j'ai lu des autres**.
3. Un fichier dont tous les tableaux ont une base plus récente est **couvert**.
4. **C5** : un fichier couvert n'est effacé que lorsque ses bases ont été lues par un autre appareil (elles ont donc
   quitté le mien), ou, seul dans le dossier, après 7 jours, ou, quoi qu'il arrive, après 30 jours. Effacer plus tôt
   perdrait tout si l'appareil disparaissait avant que le nuage ait emporté la base.
5. Les fichiers déjà effacés qui reviennent de la corbeille repartent.

### 4.4 Oublier un appareil
`oublier(id)` écrit une pierre tombale dans **mon** `oublies.json` ; je n'efface pas le dossier d'un autre tout de
suite. Plus tard, quand cet appareil se tait depuis 30 jours et que j'ai lu tous ses fichiers :
1. j'écris une base de **tous** mes tableaux. Lu ne suffit pas : son contenu serait alors seulement sur mes
   appareils, plus dans aucun fichier ;
2. quand ces bases peuvent partir (§ 4.3, point 4), j'efface son dossier et son historique.

Si l'appareil oublié revient, il voit la pierre tombale, change d'identité et réécrit tout.

### 4.5 Changer d'identité
Nouvel identifiant, registre vidé, état écrit remis à zéro : tout ce que l'appareil a sera réécrit dans son nouveau
dossier. L'ancien identifiant reçoit une pierre tombale, réécrite tant qu'elle n'a pas pu partir. L'autre copie, si
c'est un clone, change aussi d'identité, et l'ancien dossier part par § 4.4. Les pierres tombales s'ajoutent, elles
ne se remplacent pas.

### 4.6 Historique (`versions.ts`)
- Une version par jour et par tableau **modifié** : complète au plus une fois par semaine, sinon un delta depuis la
  précédente.
- On revient au jour J en appliquant la dernière complète avant J et les deltas jusqu'à J.
- On garde chaque jour 30 jours, puis les complètes 6 mois.
- Pour un dossier partagé, l'historique va dans le dossier **privé** de la personne (`OptionsCoffre.versions`) : un
  participant ne peut pas l'effacer.

### 4.7 Divergence (`divergence.ts`, C8)
Yjs suppose que personne n'écrit sous l'identité d'un autre. Un participant malveillant peut fabriquer une mise à
jour qui reprend l'identifiant et l'horloge d'un autre : chaque copie garde celle qu'elle a reçue en premier, et
elles divergent sans que rien ne le montre. Chaque appareil publie dans `vu.json`, par tableau, ce qu'il a reçu
(vecteur d'état et suppressions) et une empreinte de son contenu (chaque unité vivante avec son identifiant, son
parent, sa clé ; le découpage interne de Yjs n'y entre pas). Deux copies qui ont reçu la même chose mais n'ont pas
la même empreinte ont divergé : `divergences()` les signale, revenir à une version les répare.

## 5. Les essais

- **`coffre.test.ts`** : un cas par faille de la relecture critique (C4 clone, C5 compactage, C6 ordre de lecture),
  lecture seule, plantage pendant l'écriture, mise à jour refusée par Yjs, appareil oublié qui revient, historique,
  divergence.
- **`proprietes.test.ts`** : des scénarios tirés au hasard d'une graine (120 par défaut) ; 2 à 6 appareils, parfois
  une personne en lecture seule ; modifications, écritures, lectures, compactages, versions, plantages, clonages,
  déconnexions ; le faux nuage retarde, réordonne, tronque, crée des fantômes et des copies de conflit, fait
  revenir des fichiers effacés. Puis E1, E2, E3, E6, l'absence de fausse divergence, et un appareil neuf qui doit
  tout retrouver après le ménage. 3 000 scénarios passent. Un échec se rejoue seul :
  `NOTAK_GRAINE=<graine> bun run test proprietes` ; plus de scénarios : `NOTAK_SCENARIOS=3000`.
- **`essais/contrat.ts`** : ce que toute réalisation de `Dossier` doit tenir : la vue du faux nuage, et l'accès aux
  fichiers du navigateur (`apps/web/src/local/dossierNavigateur.test.ts`).

## 6. Ce que le format ne fait pas

- **Temps réel** : les changements vont au rythme du nuage.
- **Chiffrement** : le dossier est en clair dans le nuage de la personne (prévu plus tard, par phrase de passe).
- **Empêcher un participant malveillant** qui peut écrire dans un dossier partagé : il peut abîmer le tableau. On
  le voit (§ 4.7) et on répare (§ 4.6).
- **Couper un appareil perdu** : il reste connecté au nuage tant qu'on ne l'a pas retiré du compte iCloud ou
  OneDrive. Notak le dit.
