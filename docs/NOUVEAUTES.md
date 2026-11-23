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
- **Ce qui vient d'ailleurs est tenu à distance** : un fichier reçu (une copie .notak, une carte mentale Xmind, un fichier
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
- **Signaler un bug depuis un iPhone se fait au doigt** : la fenêtre devient une feuille à l'écran, Annuler et Envoyer
  en haut, les outils sous l'image (avec de quoi défaire le dernier trait), un bouton pour ajouter une capture ou une
  photo, et plus aucun raccourci clavier affiché. Dans l'app, la capture est la vraie image de l'écran.
- **Sur un téléphone, le « + » de la toile passe en bas à gauche** : il ne cache plus le bouton du zoom.
- **Dans l'app d'iPhone et d'iPad, secouer l'appareil ou faire une capture d'écran ouvre le signalement d'un bug**,
  sur un serveur qui les reçoit. La fenêtre reste ouverte jusqu'à Annuler ou Envoyer.
- **La toile ne bute plus sur son bord** : on va bien au-delà de son contenu, dans les quatre sens et à tout zoom ; plus
  loin, elle résiste de plus en plus et revient en douceur quand on la lâche, comme une liste sur iPhone. Si plus rien
  n'est en vue, « Recentrer » paraît en bas et ramène sur tout le contenu.
- **Un fichier rouvert, une notification ou un lien mènent bien où ils disent**, même depuis une toile déjà ouverte :
  l'adresse changeait sans que la toile suive. Un lien vers un dossier l'ouvre dans la bibliothèque, un lien vers une
  note la montre sur sa toile, et les liens de Notak qu'écrit l'agent s'ouvrent dans Notak, sur le web comme dans l'app.
- **On parle à l'agent d'un outil relié (Fram, pour Silak) dans une bulle**, en bas à droite de la bibliothèque, d'un
  dossier, d'une toile, d'une page ou d'une carte ouverte en grand. Sa conversation vous suit d'un écran à l'autre, et
  son panneau reste ouvert pendant que vous choisissez sur la toile ce dont vous parlez. Un anneau tourne pendant qu'il
  travaille, une pastille dit qu'il a répondu. Au téléphone, la conversation monte en feuille du bas. Le bouton de la
  barre du haut et la ligne du menu ••• laissent leur place à la bulle.
- **Ce que l'agent crée s'ouvre d'un clic** : sous sa réponse, une puce « Ouvrir « … » » par page, carte mentale ou
  toile qu'il vient de faire. Quand vous lui demandez de l'ouvrir, il vous y mène, une fois, dans la fenêtre d'où vous
  lui avez écrit ; refermer la page vous ramène où vous étiez.
- **La bibliothèque s'ouvre sur « Mon espace »**, et on sait toujours où est une toile : n'y paraît que ce qui y est
  rangé, les dossiers d'abord, puis le plus récemment créé. Ce qui est créé sans dossier, d'où que ce soit (la
  bibliothèque, les récents, l'agent), y arrive en tête, et ce qui est créé dans un dossier y reste. Créé depuis la
  bibliothèque, le retour vous y ramène, la tuile signalée. Ouvrir quelque chose ne le déplace plus. « Trier » propose
  aussi « Nom », et « Manuel » : glissez une tuile entre deux autres (ou « Avancer d'une place » au menu), l'ordre est
  retenu par le dossier pour tous ceux qui le parcourent. Le tableau de bord qui mêlait le contenu de tous les dossiers
  disparaît.
- **Ce qui reste vide et sans nom part à la corbeille** : une « Nouvelle toile » quittée sans rien y poser, un dossier
  jamais rempli, une page sans titre ni texte, une carte réduite à son « Sujet central ». Dix minutes après, au plus
  tôt, la bibliothèque la met à la corbeille en vous le disant, et « Annuler » la reprend. Ce qui a déjà porté quelque
  chose reste, même vidé.
- **Les récents deviennent une liste**, jour par jour, sans vignettes : chaque ligne dit où la chose est rangée (un
  clic y mène, la tuile choisie) et quand vous l'avez ouverte. Au téléphone, « Récents », « Favoris » et « Partagés »
  ont chacun leur carte sous le titre.
- **La fin d'une présentation reste sur le fond de la carte** : après « Merci », l'écran de fin ne bascule plus sur un
  fond noir après un éclair blanc, et le quitter rend la carte sans repasser par le noir.
