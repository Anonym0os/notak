# Publier Notak : gratuit, local, honnête

> Décidé le 23/10/2026. Ce que fait le code ; l'historique de la décision est dans `docs/PLAN-EDITION-PUBLIQUE.md`.

## Le principe

- **notak.app sert l'application, gratuitement, sans compte ni serveur.** Ce sont des fichiers statiques
  (`apps/site`). L'application ne parle à aucune API : les tableaux vivent dans le navigateur (IndexedDB).
- **On dit comment ça marche.** Une pastille dans l'en-tête et un panneau, « Où sont mes tableaux ? », disent ce
  qui est vrai :
  - rien ne quitte l'appareil ;
  - le navigateur peut tout effacer ;
  - voici comment en garder une copie.
- **Les copies sont des fichiers `.notak`**, rangés où l'on veut : son disque, iCloud Drive, Google Drive, une clé
  USB. Cmd+S en enregistre une, Cmd+O en rouvre une.
- **Le travail à plusieurs en temps réel** (comptes, partage, curseurs, commentaires en direct) passe par l'édition
  serveur, libre, qu'on installe chez soi en un conteneur. Ou bien on nous écrit (l'adresse `VITE_CONTACT`), et on
  s'en occupe.
- **Le but est d'ouvrir le projet**, pas de vendre quoi que ce soit : des gens s'en servent, des développeurs le
  reprennent, le modifient, le forkent. AGPL-3.0.

## Ce que voit la personne

1. **Arrivée.** Un tableau d'accueil qui montre les gestes (le modèle des comptes neufs, sans ce qui n'existe pas
   ici). En bas, une phrase, une seule fois : « Vos tableaux restent dans ce navigateur. Gardez-en une copie
   (.notak) de temps en temps : Cmd+S. »
2. **La pastille** en haut à droite :
   - « Dans ce navigateur », puis « Copie il y a 3 jours » ;
   - orange après une semaine sans copie, ou sur Safari non installé (Safari efface ce que garde un site au bout de
     7 jours sans visite).
3. **Le panneau** :
   - ce qui est vrai ;
   - *Enregistrer une copie*, *Ouvrir une copie* ;
   - *Installer l'application* (quand le navigateur le propose) ;
   - *Demander au navigateur de les garder* (`navigator.storage.persist()`) ;
   - la synchro par dossier (Chrome et Edge sur ordinateur) ;
   - travailler à plusieurs : *Installer mon Notak* (le dépôt), *Nous écrire* (si `VITE_CONTACT` est réglé) ;
   - liens vers « À propos » et le code.
4. **Enregistrer une copie** :
   - Chrome et Edge sur ordinateur : « Enregistrer sous », puis le même fichier réécrit à chaque Cmd+S ;
   - téléphone : la feuille de partage (iCloud Drive, Google Drive, Fichiers…) ;
   - ailleurs : un téléchargement.
5. **Rouvrir une copie** : Cmd+O, ou déposer le fichier sur la fenêtre, ou l'ouvrir avec l'application installée.
   - Rouvrir sa propre copie fusionne, sans doublon.
   - Rouvrir la copie de quelqu'un l'ajoute, rangée dans le tableau ouvert.
   - Dans un navigateur encore vierge, la copie devient l'accueil.

## Ce qui manque à l'édition locale, et pourquoi

| Absent | Pourquoi | Où le trouver |
|---|---|---|
| Aperçus de liens (titre, image) | un navigateur ne peut pas lire une autre page ; il faudrait un serveur | l'édition serveur |
| Comptes, partage, présence, commentaires en direct | il faut un serveur qui relie les gens | l'édition serveur |
| Notifications, activité | idem | l'édition serveur |

Les lecteurs YouTube, Vimeo et autres marchent, la carte d'un lieu aussi (au clic, depuis l'appareil, chez
OpenStreetMap).

## Synchroniser avec un dossier (expérimental)

Sur Chrome et Edge pour ordinateur, on peut choisir un dossier de son iCloud Drive, OneDrive ou Dropbox. L'espace y
est recopié en continu, et un autre ordinateur qui choisit le même dossier retrouve les mêmes tableaux. Un dossier
partagé avec quelqu'un (par le partage du nuage lui-même) permet de travailler à deux, au rythme du nuage. Le format,
ses garanties et ce qui les prouve sont dans `docs/STOCKAGE.md`.

Ce qui reste à vérifier : un essai sur de vrais nuages, sur un vrai Mac. Chrome pourrait refuser les dossiers placés
sous `~/Library`, là où iCloud et OneDrive se rangent.

## Héberger notak.app

```bash
docker build -f apps/site/Dockerfile --build-arg VITE_CONTACT=contact@exemple.fr -t notak-site .
```

nginx sert l'application (une page unique, toute adresse inconnue renvoie à `index.html`) et la page « À propos »
(`/a-propos`) ; aucune API. Le coût : un nom de domaine et un hébergement de fichiers statiques.
