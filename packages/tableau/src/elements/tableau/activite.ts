import type { Id, Tableau } from '../../coeur/tableau'

/**
 * La pastille d'activité d'un tableau : un point sur sa carte quand son contenu a changé depuis la dernière fois
 * qu'on l'a regardé. On garde, par tableau, l'empreinte de son contenu au moment où on l'a quitté ; elle se pose
 * à chaque changement tant qu'on est dessus, donc ce qu'on écrit soi-même n'allume rien.
 */
const CLE = 'notak:tableaux-vus'

const memo = new WeakMap<object, string>()

/** Une empreinte courte du contenu (FNV-1a sur ce qui se voit), la même tant que rien ne change. */
export function empreinteDe(t: Pick<Tableau, 'titre' | 'elements'>): string {
  // Chaque changement fait un tableau d'éléments neuf : on ne recompte que s'il a changé.
  const connue = memo.get(t.elements)
  if (connue !== undefined) return `${connue}:${t.titre}`
  let h = 0x811c9dc5
  const lire = (texte: string) => {
    for (let i = 0; i < texte.length; i++) {
      h ^= texte.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
  }
  for (const e of t.elements) lire(JSON.stringify(e))
  const contenu = (h >>> 0).toString(36)
  memo.set(t.elements, contenu)
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
const ecouteurs = new Set<() => void>()

/** Ce tableau vient d'être regardé tel qu'il est : plus rien à signaler dessus. */
export function marquerVu(id: Id, t: Pick<Tableau, 'titre' | 'elements'>) {
  vus ??= lireVus()
  const empreinte = empreinteDe(t)
  if (vus[id] === empreinte) return
  vus = { ...vus, [id]: empreinte }
  try {
    localStorage.setItem(CLE, JSON.stringify(vus))
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

export function ecouterVus(f: () => void) {
  ecouteurs.add(f)
  return () => ecouteurs.delete(f)
}

/** Pour les essais : repartir d'un appareil neuf. */
export function oublierLesVus() {
  vus = {}
  ecouteurs.clear()
  try {
    localStorage.removeItem(CLE)
  } catch {
    // Rien à retirer.
  }
}
