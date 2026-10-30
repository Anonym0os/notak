// Le tableau d'accueil, au doigt : l'édition locale et le serveur le réécrivent avec les mêmes règles. Ce fichier est
// lu par le serveur sans la toile (Node, sans bundler) : il ne tire rien d'autre que des types.
import type { ModeleTableau } from './construire'

/** Une note dont le texte répond au motif est réécrite (`String.replace` : `$1` reprend ce que le motif a pris). */
export type Reecritures = readonly (readonly [RegExp, string])[]

/**
 * Les gestes d'un écran qu'on touche, à la place des raccourcis du clavier et de la souris. Rien qui ne marche pas au
 * doigt : la recherche, qui n'a que ⌘F, cède sa place aux flèches d'annulation. Les réglages gardent ce qu'ils règlent.
 */
export const AU_DOIGT: Record<'fr' | 'en', Reecritures> = {
  fr: [
    [/^# Une note\n.*/s, '# Une note\nTouchez deux fois le vide, puis écrivez.'],
    [/^# Un outil\n.*/s, '# Un outil\nTouchez le + en bas (sur une tablette, la barre de gauche), puis un outil : colonne, tâches, lien, image, toile. Tiré, il se pose où vous le lâchez.'],
    [/^# Un dépôt\n.*/s, '# Une image\nL’outil Ajouter une image prend une photo, ou en choisit une sur l’appareil.'],
    [/^# Les non triés\n.*/s, '# Les non triés\nLe bouton Non triés, en haut à droite, ouvre le bac des éléments qui attendent une place.'],
    [/^# Zoom et vue\n.*/s, '# Zoom et vue\nPincez pour zoomer ; un doigt glissé sur le vide déplace le fond.'],
    [/^# Des toiles dans des toiles\n.*/s, '# Des toiles dans des toiles\nL’outil Toile pose une carte : touchez-la deux fois pour entrer, le nom en haut à gauche pour remonter.'],
    [/^# Chercher\n.*/s, '# Annuler\nLes flèches, en haut, défont et refont.'],
    [/^# Les raccourcis\n.*/s, '# Le menu\nUn appui long sur le fond ou sur une carte ouvre son menu.'],
    [/^# Réglages\nCmd\+, règle (.*)/s, '# Réglages\nLa roue, en haut à droite, règle $1'],
  ],
  en: [
    [/^# A note\n.*/s, '# A note\nTap twice on empty space, then write.'],
    [/^# A tool\n.*/s, '# A tool\nTap the + at the bottom (the left bar on a tablet), then a tool: column, tasks, link, image, board. Dragged, it lands where you let go.'],
    [/^# A drop\n.*/s, '# An image\nThe Add image tool takes a photo, or picks one from the device.'],
    [/^# Unsorted\n.*/s, '# Unsorted\nThe Unsorted button, at the top right, opens the tray of items waiting for a place.'],
    [/^# Zoom and view\n.*/s, '# Zoom and view\nPinch to zoom; drag one finger on empty space to move the canvas.'],
    [/^# Boards within boards\n.*/s, '# Boards within boards\nThe Board tool places a card: tap it twice to go in, the name at the top left to go back up.'],
    [/^# Search\n.*/s, '# Undo\nThe arrows at the top undo and redo.'],
    [/^# Shortcuts\n.*/s, '# The menu\nA long press on the canvas or on a card opens its menu.'],
    [/^# Settings\nCmd\+, sets (.*)/s, '# Settings\nThe gear, at the top right, sets $1'],
  ],
}

/** Le modèle, chaque texte de note réécrit par la première règle qui le prend, puis la suivante, dans l'ordre. */
export function reecrire(m: ModeleTableau, regles: Reecritures): ModeleTableau {
  const texte = (t: string) => regles.reduce((x, [motif, par]) => (motif.test(x) ? x.replace(motif, par) : x), t)
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

/** L'accueil tel qu'on le lit sur un écran qu'on touche. */
export const accueilAuDoigt = (m: ModeleTableau, langue: 'fr' | 'en'): ModeleTableau => reecrire(m, AU_DOIGT[langue])
