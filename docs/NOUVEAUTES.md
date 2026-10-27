# Nouveautés de Notak

Ce que chaque version apporte, dit pour celles et ceux qui s'en servent. Les notes d'une version sont celles que
montrent la page de publication sur GitHub et le bandeau « Nouveautés » de l'app : on écrit ici, sous « À venir », au
fil des changements ; `bun run nouvelle-version x.y.z` en fait la section de la version (`docs/MISES-A-JOUR.md`).

## À venir

- **L'app de bureau embarque Notak** : plus besoin d'un serveur. Vos toiles vivent sur votre ordinateur, comme sur
  notak.app, et l'app s'ouvre sans réseau.
- **Elle se met à jour toute seule**, de versions signées : la nouvelle se télécharge en arrière-plan et s'installe
  quand vous quittez Notak, ou tout de suite si vous choisissez « Redémarrer ». On peut couper la recherche dans
  « Où sont mes toiles ? » ou dans les réglages (« App de bureau »).
- **Elle se connecte aussi à votre serveur Notak, si vous en avez un** (le vôtre, ou celui de votre équipe) : « Se
  connecter à un serveur Notak… », puis son adresse. Vous y retrouvez votre compte, le partage et le travail à
  plusieurs en direct, dans la fenêtre de l'app. Les toiles de cet ordinateur restent ici, celles du serveur restent
  sur le serveur, et vous choisissez où Notak s'ouvre au démarrage (dans les réglages, « App de bureau »).
- **Vos toiles peuvent rejoindre votre serveur** : « Copier mes toiles sur… » en prépare une copie, que le serveur vous
  propose d'importer ; elle ne s'ajoute qu'avec votre accord, et rien n'est supprimé sur l'ordinateur. L'import ne se
  dit fini qu'une fois les toiles bien arrivées.
- **Depuis l'app de bureau, la connexion par Google, Microsoft, GitHub ou le SSO d'un espace passe par votre
  navigateur** : l'app montre un code, vous le confirmez sur votre serveur, qui vous dit d'où et quand il a été demandé.
- **Un double clic sur un fichier .notak l'ouvre dans Notak**, dans la fenêtre déjà ouverte. Sur un serveur, la copie
  attend votre accord avant d'être importée.
- **Une pièce jointe s'ouvre dans l'application de votre ordinateur** (un PDF, une image, un document), depuis l'app de
  bureau.
- **Un lien de partage demande avant d'ajouter** : vous voyez ce qui arrive, et « Ajouter à mes toiles » le range.
- **Une session terminée ramène à l'écran de connexion** sans rien effacer de ce qui attendait sur l'appareil.
- **Cmd+S enregistre la copie .notak dans l'app de bureau**, et réécrit ensuite le même fichier.
- **Un lien vers un autre site s'ouvre dans votre navigateur**, jamais dans la fenêtre de Notak.
- **La version web propose de recharger** quand une nouvelle version est arrivée pendant qu'elle était ouverte, au
  lieu de laisser des morceaux de l'ancienne échouer en silence.
- **Sécurité** : Notak ne peut joindre que les hôtes qu'il annonce (une politique de sécurité du contenu, sur notak.app,
  dans l'app et sur les serveurs Notak) ; aucune autre page ne peut l'afficher dans un cadre.
- **Ce qui vient d'ailleurs est tenu à distance** : un fichier reçu (une copie .notak, une carte Xmind, un fichier
  déposé) ne s'ouvre jamais comme une page de Notak ; une archive piégée qui se déplierait en gigaoctets est refusée ;
  une copie ou un dossier partagé ne peut plus abîmer l'index de l'espace ni ses fichiers ; une « couleur » qui
  chargerait une image espion est ignorée ; un collage démesuré ne fige plus la page.
- **Une copie reçue ne charge rien d'un autre site sans votre accord** : dans ses toiles, les lecteurs intégrés et les
  images venues d'ailleurs attendent derrière « Afficher » ; « Tout afficher pour cette toile » lève l'attente, et une
  copie renvoyée plus tard qui y apporte du neuf la redemande.
- **Connexion (serveur Notak)** : on peut afficher le mot de passe, les majuscules verrouillées se signalent, la règle
  du mot de passe se lit avant le refus, et après trop d'essais l'écran dit combien attendre. Le serveur limite aussi
  les essais par compte, d'où qu'ils viennent.
- **Un serveur Notak s'installe d'un fichier et se met à jour d'une commande**, sur un serveur ordinaire comme sur un
  Raspberry Pi ; ses réglages restent d'une mise à jour à l'autre, et sa base est copiée avant chaque changement. On
  peut vérifier que l'image vient bien de ce dépôt.
- **Les admins d'un serveur voient qu'une nouvelle version existe**, dans l'app, avec ses notes et la commande à
  lancer. Le serveur ne fait que le dire : rien ne s'installe sans eux.
- **Une seule version pour tout Notak** : l'app de bureau, le serveur et les réglages portent le même numéro.
