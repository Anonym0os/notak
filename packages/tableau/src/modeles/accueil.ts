// Le tableau d'accueil d'un compte neuf. Données pures : le serveur le pose à l'inscription.
import type { ModeleTableau } from './construire'

export const ACCUEIL: ModeleTableau = {
  id: 'accueil',
  titre: 'Accueil',
  resume: 'Les gestes de Notak, expliqués sur la toile même.',
  couleur: 'bleu',
  elements: [
    { genre: 'titre', texte: 'Bienvenue sur Notak', x: 44, y: 0 },
    {
      genre: 'note',
      texte:
        '# Une toile sans bords\nPosez vos idées où vous voulez, dans l’ordre que vous voulez. Cette toile montre les gestes : modifiez-la, déplacez-la, supprimez-la, elle est à vous.',
      couleur: 'jaune',
      x: 0,
      y: 8,
      largeur: 72,
    },
    {
      genre: 'colonne',
      titre: 'Poser',
      couleur: 'bleu',
      x: 0,
      y: 24,
      contenu: [
        { genre: 'note', texte: '# Une note\nDouble-cliquez sur le vide, puis écrivez.' },
        { genre: 'note', texte: '# Un outil\nGlissez un outil de la barre de gauche sur le fond : colonne, tâches, lien, image, toile.' },
        { genre: 'note', texte: '# Un dépôt\nLâchez des images ou des fichiers depuis votre bureau, ou collez une adresse : elle devient une carte.' },
      ],
    },
    {
      genre: 'colonne',
      titre: 'Ranger',
      couleur: 'vert',
      x: 38,
      y: 24,
      contenu: [
        { genre: 'note', texte: '# Dans une colonne\nGlissez une note dans une colonne : elles s’empilent et se déplacent ensemble.' },
        { genre: 'taches', titre: 'À essayer', taches: ['Cochez cette tâche', 'Tapez [] au début d’une note pour en faire une liste', 'Glissez cette liste dans une colonne'] },
        { genre: 'note', texte: '# Les non triés\nCmd+\\ ouvre le bac des éléments qui attendent une place.' },
      ],
    },
    {
      genre: 'colonne',
      titre: 'Se déplacer',
      couleur: 'orange',
      x: 76,
      y: 24,
      contenu: [
        { genre: 'note', texte: '# Zoom et vue\nCmd et + ou − pour zoomer, Z pour tout voir, Espace et glisser pour attraper le fond.' },
        { genre: 'note', texte: '# Des toiles dans des toiles\nL’outil Toile pose une carte : double-cliquez dessus pour entrer, Cmd+U pour remonter.' },
        { genre: 'note', texte: '# Chercher\nCmd+F cherche dans cette toile, puis dans toutes les vôtres.' },
      ],
    },
    {
      genre: 'colonne',
      titre: 'Aller plus loin',
      couleur: 'violet',
      x: 114,
      y: 24,
      contenu: [
        { genre: 'note', texte: '# Les raccourcis\nTapez / pour les voir tous. L’entrée Aide du menu de votre compte les ouvre aussi.' },
        { genre: 'note', texte: '# Des modèles\nL’outil Toile modèle crée une toile déjà organisée : réunion, voyage, storyboard…' },
        { genre: 'note', texte: '# Partager\nLe bouton Partager invite par adresse ou publie un lien de lecture.' },
        { genre: 'note', texte: '# Réglages\nCmd+, règle le thème, la taille, votre photo et votre couleur.' },
      ],
    },
  ],
}
