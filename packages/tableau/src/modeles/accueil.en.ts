// La version anglaise du tableau d'accueil : même forme que `accueil.ts`, textes traduits.
import type { ModeleTableau } from './construire'

export const ACCUEIL_EN: ModeleTableau = {
  id: 'accueil',
  titre: 'Home',
  resume: 'Notak’s gestures, explained right on the canvas.',
  couleur: 'bleu',
  elements: [
    { genre: 'titre', texte: 'Welcome to Notak', x: 44, y: 0 },
    {
      genre: 'note',
      texte:
        '# A canvas with no edges\nPut your ideas wherever you like, in whatever order you like. This board shows the gestures: edit it, move it, delete it, it’s yours.',
      couleur: 'jaune',
      x: 0,
      y: 8,
      largeur: 72,
    },
    {
      genre: 'colonne',
      titre: 'Place',
      couleur: 'bleu',
      x: 0,
      y: 24,
      contenu: [
        { genre: 'note', texte: '# A note\nDouble-click on empty space, then write.' },
        { genre: 'note', texte: '# A tool\nDrag a tool from the left bar onto the canvas: column, tasks, link, image, board.' },
        { genre: 'note', texte: '# A drop\nDrop images or files from your desktop, or paste an address: it becomes a card.' },
      ],
    },
    {
      genre: 'colonne',
      titre: 'Organise',
      couleur: 'vert',
      x: 38,
      y: 24,
      contenu: [
        { genre: 'note', texte: '# In a column\nDrag a note into a column: they stack up and move together.' },
        { genre: 'taches', titre: 'To try', taches: ['Tick this task', 'Type [] at the start of a note to make it a list', 'Drag this list into a column'] },
        { genre: 'note', texte: '# Unsorted\nCmd+\\ opens the tray of items waiting for a place.' },
      ],
    },
    {
      genre: 'colonne',
      titre: 'Move around',
      couleur: 'orange',
      x: 76,
      y: 24,
      contenu: [
        { genre: 'note', texte: '# Zoom and view\nCmd and + or − to zoom, Z to see everything, Space and drag to grab the canvas.' },
        { genre: 'note', texte: '# Boards within boards\nThe Board tool places a card: double-click it to go in, Cmd+U to go back up.' },
        { genre: 'note', texte: '# Search\nCmd+F searches this board, then all of yours.' },
      ],
    },
    {
      genre: 'colonne',
      titre: 'Go further',
      couleur: 'violet',
      x: 114,
      y: 24,
      contenu: [
        { genre: 'note', texte: '# Shortcuts\nType / to see them all. The Help entry in your account menu opens them too.' },
        { genre: 'note', texte: '# Templates\nThe Board template tool creates an already-organised board: meeting, trip, storyboard…' },
        { genre: 'note', texte: '# Share\nThe Share button invites by address or publishes a read-only link.' },
        { genre: 'note', texte: '# Settings\nCmd+, sets the theme, the size, your photo and your colour.' },
      ],
    },
  ],
}
