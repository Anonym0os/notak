import { auDoigt } from '@notak/tableau'
import type { ModeleTableau } from '@notak/tableau/modeles/construire'
import { ACCUEIL } from '@notak/tableau/modeles/accueil'
import { ACCUEIL_EN } from '@notak/tableau/modeles/accueil.en'

/**
 * Le tableau d'accueil de l'édition locale : celui des comptes neufs, sans ce qui n'existe pas ici (le partage par
 * adresse, la photo, le menu du compte), avec ce qui compte ici (garder une copie, où sont les tableaux).
 */
const REMPLACEMENTS: Record<'fr' | 'en', [RegExp, string][]> = {
  fr: [
    [/^# Les raccourcis\n.*/s, '# Les raccourcis\nTapez / pour les voir tous.'],
    [/^# Partager\n.*/s, '# Garder une copie\nCmd+S enregistre une copie .notak, à ranger où vous voulez. La pastille en haut à droite dit où sont vos toiles.'],
    [/^# Réglages\n.*/s, '# Réglages\nCmd+, règle le thème et la taille.'],
  ],
  en: [
    [/^# Shortcuts\n.*/s, '# Shortcuts\nType / to see them all.'],
    [/^# Share\n.*/s, '# Keep a copy\nCmd+S saves a .notak copy, to keep wherever you like. The pill at the top right tells where your boards are.'],
    [/^# Settings\n.*/s, '# Settings\nCmd+, sets the theme and the size.'],
  ],
}

/**
 * Au doigt (`auDoigt`), par-dessus : les gestes d'un écran qu'on touche, à la place des raccourcis du clavier et de la
 * souris. Rien qui ne marche pas au doigt : la recherche, qui n'a que ⌘F, cède sa place aux flèches d'annulation.
 */
const AU_DOIGT: Record<'fr' | 'en', [RegExp, string][]> = {
  fr: [
    [/^# Une note\n.*/s, '# Une note\nTouchez deux fois le vide, puis écrivez.'],
    [/^# Un outil\n.*/s, '# Un outil\nGlissez du doigt un outil de la barre de gauche sur le fond : colonne, tâches, lien, image, toile.'],
    [/^# Un dépôt\n.*/s, '# Une image\nL’outil Ajouter une image prend une photo, ou en choisit une sur l’appareil.'],
    [/^# Les non triés\n.*/s, '# Les non triés\nLe bouton Non triés, en haut à droite, ouvre le bac des éléments qui attendent une place.'],
    [/^# Zoom et vue\n.*/s, '# Zoom et vue\nPincez pour zoomer ; un doigt glissé sur le vide déplace le fond.'],
    [/^# Des toiles dans des toiles\n.*/s, '# Des toiles dans des toiles\nL’outil Toile pose une carte : touchez-la deux fois pour entrer, le nom en haut à gauche pour remonter.'],
    [/^# Chercher\n.*/s, '# Annuler\nLes flèches, en haut, défont et refont.'],
    [/^# Les raccourcis\n.*/s, '# Le menu\nUn appui long sur le fond ou sur une carte ouvre son menu.'],
    [/^# Garder une copie\n.*/s, '# Garder une copie\nLe dossier, en haut à droite, enregistre une copie .notak à ranger où vous voulez, et dit où sont vos toiles.'],
    [/^# Réglages\n.*/s, '# Réglages\nLa roue, en haut à droite, règle le thème et la taille.'],
  ],
  en: [
    [/^# A note\n.*/s, '# A note\nTap twice on empty space, then write.'],
    [/^# A tool\n.*/s, '# A tool\nDrag a tool from the left bar onto the canvas with your finger: column, tasks, link, image, board.'],
    [/^# A drop\n.*/s, '# An image\nThe Add image tool takes a photo, or picks one from the device.'],
    [/^# Unsorted\n.*/s, '# Unsorted\nThe Unsorted button, at the top right, opens the tray of items waiting for a place.'],
    [/^# Zoom and view\n.*/s, '# Zoom and view\nPinch to zoom; drag one finger on empty space to move the canvas.'],
    [/^# Boards within boards\n.*/s, '# Boards within boards\nThe Board tool places a card: tap it twice to go in, the name at the top left to go back up.'],
    [/^# Search\n.*/s, '# Undo\nThe arrows at the top undo and redo.'],
    [/^# Shortcuts\n.*/s, '# The menu\nA long press on the canvas or on a card opens its menu.'],
    [/^# Keep a copy\n.*/s, '# Keep a copy\nThe folder, at the top right, saves a .notak copy to keep wherever you like, and tells where your boards are.'],
    [/^# Settings\n.*/s, '# Settings\nThe gear, at the top right, sets the theme and the size.'],
  ],
}

function adapter(m: ModeleTableau, langue: 'fr' | 'en', doigt: boolean): ModeleTableau {
  const regles = doigt ? [...REMPLACEMENTS[langue], ...AU_DOIGT[langue]] : REMPLACEMENTS[langue]
  const texte = (t: string) => regles.reduce((x, [motif, par]) => (motif.test(x) ? par : x), t)
  const parcourir = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(parcourir)
    if (typeof v !== 'object' || v === null) return v
    const o = { ...(v as Record<string, unknown>) }
    if (typeof o.texte === 'string') o.texte = texte(o.texte)
    if (Array.isArray(o.contenu)) o.contenu = o.contenu.map(parcourir)
    return o
  }
  return { ...m, elements: parcourir(m.elements) as ModeleTableau['elements'] }
}

export const accueilLocal = (langue: string, doigt = auDoigt()): ModeleTableau =>
  langue === 'en' ? adapter(ACCUEIL_EN, 'en', doigt) : adapter(ACCUEIL, 'fr', doigt)
