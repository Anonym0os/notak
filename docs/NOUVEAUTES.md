# Nouveautés de Notak

Ce que chaque version apporte, dit pour celles et ceux qui s'en servent. Les notes d'une version sont celles que
montrent la page de publication sur GitHub et le bandeau « Nouveautés » de l'app : on écrit ici, sous « À venir », au
fil des changements ; `bun run nouvelle-version x.y.z` en fait la section de la version (`docs/MISES-A-JOUR.md`).

## À venir

- **L'app de bureau embarque Notak** : plus besoin d'un serveur. Vos toiles vivent sur votre ordinateur, comme sur
  notak.app, et l'app s'ouvre sans réseau.
- **Elle se met à jour toute seule**, de versions signées : la nouvelle se télécharge en arrière-plan et s'installe
  quand vous quittez Notak, ou tout de suite si vous choisissez « Redémarrer ». On peut couper la recherche dans
  « Où sont mes toiles ? ».
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
- **Connexion (serveur Notak)** : on peut afficher le mot de passe, les majuscules verrouillées se signalent, la règle
  du mot de passe se lit avant le refus, et après trop d'essais l'écran dit combien attendre. Le serveur limite aussi
  les essais par compte, d'où qu'ils viennent.
