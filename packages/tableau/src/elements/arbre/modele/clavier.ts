import type { Id } from '../../../coeur/tableau'
import type { Disposition } from '../disposition'
import type { Geste } from './gestes'
import type { Lecture } from './sujets'

/** Les touches que le clavier passe à un sujet, comme on les lit : `event.key`, pour tomber juste en AZERTY. */
type Touche = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>

const DIRECTIONS: Record<string, [number, number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
}

/**
 * Le geste d'une touche (docs/XMIND.md § 4), sur les sujets choisis (le dernier est le courant). `null` : la touche
 * n'est pas pour la carte.
 */
export function gesteDe(e: Touche, choisis: readonly Id[], l: Lecture, d: Disposition): Geste | null {
  const cmd = e.metaKey || e.ctrlKey
  const courant = choisis.at(-1) ?? l.central
  const k = e.key
  if (cmd) {
    const ids = choisis.length > 0 ? [...choisis] : [courant]
    if (e.shiftKey && !e.altKey) {
      // Maj+Cmd+lettre : la lettre arrive en capitale.
      switch (k.toLowerCase()) {
        case 'r':
          return { type: 'relier', id: courant }
        case 'b':
          return { type: 'limite', ids }
        case 'n':
          return { type: 'panneau', section: 'note' }
        case 'l':
          return { type: 'panneau', section: 'etiquettes' }
        case 'i':
          return { type: 'panneau', section: 'image' }
      }
    }
    if (k.toLowerCase() === 'k' && !e.shiftKey) return { type: 'panneau', section: 'lien' }
    if (k === ']') return { type: 'panneau' }
    if (e.altKey && k.toLowerCase() === 't') return { type: 'tache', ids }
    if (e.altKey && (e as Partial<KeyboardEvent>).code === 'KeyT') return { type: 'tache', ids }
    // Cmd+1…7 : une priorité (la même touche l'ôte). Lue sur la touche physique : en AZERTY, Cmd+& est Cmd+1.
    const priorite = !e.altKey && !e.shiftKey ? chiffreDe(e) : null
    if (priorite && priorite <= 7) return { type: 'marqueur', ids, marqueur: `priority-${priorite}` }
    if (k === 'Enter') return { type: 'parent', id: courant }
    if (k === 'Backspace' || k === 'Delete') return { type: 'supprimerSeul', id: courant }
    if (k === '/') return e.altKey ? { type: 'toutReplier' } : { type: 'replier', id: courant }
    if (k.toLowerCase() === 'd' && !e.altKey) return { type: 'dupliquer', id: courant }
    if (k.toLowerCase() === 'r' && !e.altKey && !e.shiftKey) return { type: 'recadrer' }
    if (k === ';') return { type: 'brancheSeule', id: courant }
    if (k === '=' || k === '+') return { type: 'zoom', facteur: 1.25 }
    if (k === '-') return { type: 'zoom', facteur: 0.8 }
    if (k === '0' && !e.altKey) return { type: 'zoom', facteur: 0 }
    // Alt+Cmd+1…9 : déplier jusqu'au niveau N. Avec Alt, le Mac change le caractère : on lit le chiffre de la touche.
    const chiffre = e.altKey ? chiffreDe(e) : null
    if (chiffre) return { type: 'deplierNiveau', n: chiffre }
    return null
  }
  if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) return { type: 'echanger', id: courant, sens: k === 'ArrowUp' ? -1 : 1 }
  // Maj+Alt+1, 2, 3, 0 : important, secondaire, barré, ordinaire.
  if (e.altKey && e.shiftKey) {
    const c = (e as Partial<KeyboardEvent>).code
    const classe = { Digit1: 'important', Digit2: 'secondaire', Digit3: 'barre', Digit0: null }[c ?? '']
    if (classe !== undefined) return { type: 'porter', ids: [...choisis], champ: 'classe', valeur: classe ?? undefined }
  }
  if (e.altKey) return null
  switch (k) {
    case 'Tab':
      return e.shiftKey ? null : { type: 'enfant', id: courant }
    case 'Insert':
      return { type: 'enfant', id: courant }
    case 'Enter':
      return { type: 'frere', id: courant, avant: e.shiftKey }
    case 'Delete':
    case 'Backspace':
      return { type: 'supprimer', ids: [...choisis] }
    case ' ':
    case 'F2':
      return { type: 'editer', id: courant }
  }
  const dir = DIRECTIONS[k]
  if (dir) {
    const voisin = voisinDans(d, courant, dir)
    if (!voisin) return { type: 'choisir', ids: [...choisis] }
    return { type: 'choisir', ids: e.shiftKey ? [...choisis.filter((x) => x !== voisin), voisin] : [voisin] }
  }
  // Une lettre tapée sur un sujet choisi l'édite, et remplace son titre.
  if ([...k].length === 1 && /\S/u.test(k)) return { type: 'editer', id: courant, frappe: k }
  return null
}

/** Le chiffre d'une touche, même quand Alt l'a changé en symbole (« ¡ » pour 1 sur un clavier américain). */
function chiffreDe(e: Touche): number | null {
  const code = (e as Partial<KeyboardEvent>).code
  const m = code?.match(/^(?:Digit|Numpad)([1-9])$/) ?? e.key.match(/^([1-9])$/)
  return m ? Number(m[1]) : null
}

/**
 * Le sujet le plus proche dans une direction, à l'écran : son centre doit être devant (dans un cône de 45° de chaque
 * côté), et l'on préfère ce qui est aligné. Comme Xmind, la navigation suit la carte dessinée, pas l'ordre de l'arbre.
 */
export function voisinDans(d: Disposition, depuis: Id, [dx, dy]: [number, number]): Id | null {
  const b = d.boites.get(depuis)
  if (!b) return null
  const [cx, cy] = [b.x + b.l / 2, b.y + b.h / 2]
  let meilleur: Id | null = null
  let score = Infinity
  for (const [id, o] of d.boites) {
    if (id === depuis) continue
    const [vx, vy] = [o.x + o.l / 2 - cx, o.y + o.h / 2 - cy]
    const avance = vx * dx + vy * dy
    const travers = Math.abs(vx * dy - vy * dx)
    if (avance <= 0 || travers > avance) continue
    const s = avance + 2 * travers
    if (s < score) {
      score = s
      meilleur = id
    }
  }
  return meilleur
}
