import type { Id } from '../../../coeur/tableau'
import { type Lecture, structureDe } from '../modele/sujets'
import { type Disposition, type Ecarts, type Taille, ECART_CENTRAL, ECARTS, poserEnColonne, visibles } from './commun'

export type { Boite, Cote, Disposition, Lien, Taille } from './commun'
export { emprise } from './commun'

/**
 * Où va chaque sujet d'une carte. Le central est centré en (0, 0) ; ses enfants se disposent selon sa structure
 * (docs/XMIND.md § 2) ; les flottants restent là où on les a posés, et disposent leurs enfants à leur tour.
 */
export function disposer(l: Lecture, taille: (id: Id) => Taille, e: Ecarts = ECARTS): Disposition {
  const sortie: Disposition = { boites: new Map(), liens: [] }
  if (!l.central) return sortie
  const memo = new Map<Id, number>()
  const tc = taille(l.central)
  sortie.boites.set(l.central, { x: -tc.l / 2, y: -tc.h / 2, ...tc })
  const principaux = visibles(l, l.central)
  const structure = structureDe(l, l.central)
  if (structure === 'logique-gauche') poserEnColonne(l, l.central, principaux, 'gauche', taille, e, ECART_CENTRAL, memo, sortie)
  else if (structure === 'logique-droite') poserEnColonne(l, l.central, principaux, 'droite', taille, e, ECART_CENTRAL, memo, sortie)
  else {
    const [droite, gauche] = partager(l, principaux)
    poserEnColonne(l, l.central, droite, 'droite', taille, e, ECART_CENTRAL, memo, sortie)
    poserEnColonne(l, l.central, gauche, 'gauche', taille, e, ECART_CENTRAL, memo, sortie)
  }
  for (const f of l.flottants) {
    const s = l.sujets.get(f)!
    const t = taille(f)
    const p = s.position ?? { x: 0, y: 0 }
    sortie.boites.set(f, { x: p.x - t.l / 2, y: p.y - t.h / 2, ...t })
    const cote = p.x < 0 ? 'gauche' : 'droite'
    poserEnColonne(l, f, visibles(l, f), cote, taille, e, e.principal, memo, sortie)
  }
  return sortie
}

/**
 * Les principaux d'une carte, partagés entre la droite et la gauche. Équilibrée : la moitié (arrondie au-dessus) à
 * droite, dans l'ordre de haut en bas, puis le reste à gauche, de haut en bas. Horaire : la gauche se lit de bas en
 * haut (on fait le tour). Antihoraire : la gauche d'abord, de haut en bas, puis la droite de bas en haut. Non
 * équilibrée : `aDroite` principaux à droite, le reste à gauche.
 */
function partager(l: Lecture, principaux: readonly Id[]): [Id[], Id[]] {
  const central = l.sujets.get(l.central)!
  const structure = central.structure ?? 'carte'
  const n = principaux.length
  if (structure === 'carte-libre') {
    const k = Math.max(0, Math.min(n, central.aDroite ?? n))
    return [principaux.slice(0, k), principaux.slice(k)]
  }
  const k = Math.ceil(n / 2)
  const [a, b] = [principaux.slice(0, k), principaux.slice(k)]
  if (structure === 'carte-horaire') return [a, b.toReversed()]
  if (structure === 'carte-antihoraire') return [b.toReversed(), a]
  return [a, b]
}
