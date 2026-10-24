import { memo } from 'react'
import type { Id, StructureArbre } from '../../../coeur/tableau'
import { type Boite, disposer, emprise } from '../disposition'
import { ajouterEnfant, lire, nouvelArbre } from '../modele/sujets'
import { cheminBranche } from '../trace/branches'

/**
 * Les vignettes de l'onglet Carte : une petite carte dessinée avec la structure (ou les couleurs) en jeu. Rien n'est
 * mis en image à l'avance : la même mise en page que la carte, sur un exemple de sept sujets, aux tailles d'une
 * miniature. C'est ce que fait Xmind (« des rendus d'une mini-carte »), avec notre moteur.
 */

/** Un exemple : un central, trois principaux, dont deux ont des enfants. Les mêmes sujets pour toutes les structures. */
function exemple(structure: StructureArbre) {
  let a = nouvelArbre('')
  const central = lire(a).central
  a = { ...a, sujets: { ...a.sujets, [central]: { ...a.sujets[central]!, structure } } }
  const principaux: Id[] = []
  const rang = new Map<Id, number>()
  const niveau = new Map<Id, 'central' | 'principal' | 'sous'>([[central, 'central']])
  for (let i = 0; i < 4; i++) {
    let p: Id
    ;[a, p] = ajouterEnfant(a, central, '')
    principaux.push(p)
    rang.set(p, i)
    niveau.set(p, 'principal')
  }
  for (const [i, p] of principaux.entries()) {
    if (i === 3) continue
    for (let k = 0; k < (i === 0 ? 2 : 1); k++) {
      let e: Id
      ;[a, e] = ajouterEnfant(a, p, '')
      rang.set(e, i)
      niveau.set(e, 'sous')
    }
  }
  return { lecture: lire(a), rang, niveau, central }
}

const TAILLES = { central: { l: 26, h: 12 }, principal: { l: 20, h: 8 }, sous: { l: 14, h: 5 } } as const
const ECARTS = { principal: 14, secondaire: 4, central: 20 }
const cache = new Map<StructureArbre, ReturnType<typeof geometrie>>()

/** La mise en page de l'exemple pour une structure, et à quel principal appartient chaque sujet. */
function geometrie(structure: StructureArbre) {
  const { lecture, rang, niveau, central } = exemple(structure)
  const disposition = disposer(lecture, (id) => TAILLES[niveau.get(id) ?? 'sous'], ECARTS)
  return { lecture, rang, niveau, central, disposition, cadre: emprise(disposition.boites.values()) }
}

/** La géométrie d'une vignette, gardée (une structure ne change pas). */
export function apercuDe(structure: StructureArbre) {
  let g = cache.get(structure)
  if (!g) {
    g = geometrie(structure)
    cache.set(structure, g)
  }
  return g
}

const MARGE = 6

interface Props {
  structure: StructureArbre
  /** Les couleurs des principaux, tour à tour ; une seule : toutes les branches de cette couleur. Absentes : des gris. */
  couleurs?: readonly string[] | undefined
  /** Le fond de la vignette. */
  fond?: string | undefined
  /** L'encre du central et des traits sans couleur. */
  encre?: string | undefined
  className?: string | undefined
}

/** Une vignette : le dessin seul, à poser dans une carte. */
export const ApercuStructure = memo(function ApercuStructure({ structure, couleurs, fond, encre = 'var(--notak-arbre-encre)', className }: Props) {
  const { rang, niveau, disposition: d, cadre } = apercuDe(structure)
  const [x, y, w, h] = [cadre.x - MARGE, cadre.y - MARGE, cadre.l + 2 * MARGE, cadre.h + 2 * MARGE]
  const couleur = (id: Id): string => {
    const i = rang.get(id)
    return i === undefined || !couleurs?.length ? 'color-mix(in srgb, var(--notak-arbre-texte) 38%, transparent)' : couleurs[i % couleurs.length]!
  }
  return (
    <svg className={className} viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" aria-hidden style={fond ? { background: fond } : undefined}>
      <g fill="none" strokeLinecap="round" strokeWidth={1.1}>
        {d.liens.map((lien) => {
          const [p, e] = [d.boites.get(lien.de), d.boites.get(lien.vers)]
          if (!p || !e) return null
          return <path key={lien.vers} d={cheminBranche(p, e, lien.cote, lien.forme)} stroke={couleur(lien.vers)} />
        })}
        {d.traits.map((t, i) => (
          <path key={`t${i}`} d={t.d} stroke={encre} strokeOpacity={0.55} />
        ))}
      </g>
      {[...d.boites].map(([id, b]) => (
        <Sujet key={id} b={b} niveau={niveau.get(id) ?? 'sous'} couleur={couleur(id)} encre={encre} />
      ))}
    </svg>
  )
})

function Sujet({ b, niveau, couleur, encre }: { b: Boite; niveau: 'central' | 'principal' | 'sous'; couleur: string; encre: string }) {
  if (niveau === 'sous') return <line x1={b.x} x2={b.x + b.l} y1={b.y + b.h} y2={b.y + b.h} stroke={couleur} strokeWidth={1.1} strokeLinecap="round" />
  return <rect x={b.x} y={b.y} width={b.l} height={b.h} rx={niveau === 'central' ? 3 : 2.4} fill={niveau === 'central' ? encre : couleur} />
}

