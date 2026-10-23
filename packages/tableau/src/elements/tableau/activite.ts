import type { Id, Tableau } from '../../coeur/tableau'

/**
 * La pastille d'activité d'un tableau : un point sur sa carte quand son contenu a changé depuis la dernière fois
 * qu'on l'a regardé. On garde, par tableau, l'empreinte de son contenu au moment où on l'a quitté ; elle se pose
 * à chaque changement tant qu'on est dessus, donc ce qu'on écrit soi-même n'allume rien.
 */
const CLE = 'notak:tableaux-vus'
/** Pour compter les changements : par tableau, une empreinte de chaque élément quand on l'a quitté (les plus récents seulement). */
const CLE_DETAIL = 'notak:tableaux-vus-detail'
const DETAIL_TABLEAUX_MAX = 30
const DETAIL_ELEMENTS_MAX = 400

const memo = new WeakMap<object, string>()

const parElement = new WeakMap<object, Record<Id, string>>()

/** FNV-1a d'un texte, en base 36. */
function hacher(texte: string, depart = 0x811c9dc5): number {
  let h = depart
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Une empreinte courte du contenu (FNV-1a sur ce qui se voit), la même tant que rien ne change. */
export function empreinteDe(t: Pick<Tableau, 'titre' | 'elements'>): string {
  // Chaque changement fait un tableau d'éléments neuf : on ne recompte que s'il a changé.
  const connue = memo.get(t.elements)
  if (connue !== undefined) return `${connue}:${t.titre}`
  let h = 0x811c9dc5
  const details: Record<Id, string> = {}
  for (const e of t.elements) {
    const texte = JSON.stringify(e)
    h = hacher(texte, h)
    details[e.id] = hacher(texte).toString(36)
  }
  const contenu = (h >>> 0).toString(36)
  memo.set(t.elements, contenu)
  parElement.set(t.elements, details)
  return `${contenu}:${t.titre}`
}

/** La dernière empreinte vue de chaque tableau, gardée sur cet appareil. */
function lireVus(): Record<Id, string> {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? '{}') as unknown
    return brut && typeof brut === 'object' ? (brut as Record<Id, string>) : {}
  } catch {
    return {}
  }
}

let vus: Record<Id, string> | null = null
let details: Record<Id, Record<Id, string>> | null = null
function lireDetails(): Record<Id, Record<Id, string>> {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_DETAIL) ?? '{}') as unknown
    return brut && typeof brut === 'object' ? (brut as Record<Id, Record<Id, string>>) : {}
  } catch {
    return {}
  }
}
const ecouteurs = new Set<() => void>()

/** Ce tableau vient d'être regardé tel qu'il est : plus rien à signaler dessus. */
export function marquerVu(id: Id, t: Pick<Tableau, 'titre' | 'elements'>) {
  vus ??= lireVus()
  const empreinte = empreinteDe(t)
  if (vus[id] === empreinte) return
  vus = { ...vus, [id]: empreinte }
  // Chaque élément a son empreinte, de quoi compter ce qui a changé ; un tableau trop gros n'en garde pas.
  details ??= lireDetails()
  const { [id]: _ancien, ...autres } = details
  const gardes = Object.entries(autres).slice(-(DETAIL_TABLEAUX_MAX - 1))
  details = Object.fromEntries(t.elements.length <= DETAIL_ELEMENTS_MAX ? [...gardes, [id, parElement.get(t.elements) ?? {}]] : gardes)
  try {
    localStorage.setItem(CLE, JSON.stringify(vus))
    localStorage.setItem(CLE_DETAIL, JSON.stringify(details))
  } catch {
    // Stockage plein ou interdit : la pastille reste exacte tant que la page est ouverte.
  }
  for (const f of ecouteurs) f()
}

/** Y a-t-il du nouveau sur ce tableau ? Jamais pour un tableau qu'on n'a jamais regardé. */
export function aDuNouveau(id: Id, t: Pick<Tableau, 'titre' | 'elements'> | undefined): boolean {
  // Pas encore chargé (ou vide) : on ne sait rien, on ne dit rien.
  if (!t || t.elements.length === 0) return false
  vus ??= lireVus()
  const avant = vus[id]
  return avant !== undefined && avant !== empreinteDe(t)
}

/**
 * Combien d'éléments ont changé depuis la dernière vue (ajoutés, modifiés ou retirés) ; 0 s'il n'y a rien de nouveau.
 * Faute du détail (un gros tableau, un appareil qui l'a perdu), on ne sait que « quelque chose » : 1.
 */
export function nombreDeChangements(id: Id, t: Pick<Tableau, 'titre' | 'elements'> | undefined): number {
  if (!aDuNouveau(id, t)) return 0
  empreinteDe(t!)
  details ??= lireDetails()
  const avant = details[id]
  const maintenant = parElement.get(t!.elements)
  if (!avant || !maintenant) return 1
  let n = 0
  for (const [e, h] of Object.entries(maintenant)) if (avant[e] !== h) n++
  for (const e of Object.keys(avant)) if (!(e in maintenant)) n++
  return Math.max(1, n)
}

/** A-t-on déjà regardé ce tableau sur cet appareil ? */
export function dejaVu(id: Id): boolean {
  vus ??= lireVus()
  return vus[id] !== undefined
}

export function ecouterVus(f: () => void) {
  ecouteurs.add(f)
  return () => ecouteurs.delete(f)
}

/** Pour les essais : repartir d'un appareil neuf. */
export function oublierLesVus() {
  vus = {}
  details = {}
  ecouteurs.clear()
  try {
    localStorage.removeItem(CLE)
    localStorage.removeItem(CLE_DETAIL)
  } catch {
    // Rien à retirer.
  }
}
