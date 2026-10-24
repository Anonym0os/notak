import { memo, useId } from 'react'
import type { FormeSujet, Id, StructureArbre } from '../../../coeur/tableau'
import { type Boite, disposer, emprise } from '../disposition'
import { contourForme } from '../formes'
import { souligne } from '../apparence'
import { ajouterEnfant, lire, nouvelArbre } from '../modele/sujets'
import { cheminBranche, cheminEffile } from '../trace/branches'
import { type RangSquelette, type SqueletteDef } from './squelettes'

/**
 * Les vignettes de l'onglet Carte : une petite carte dessinée avec la structure (ou les couleurs) en jeu. Rien n'est
 * mis en image à l'avance : la même mise en page que la carte, sur un exemple de sept sujets, aux tailles d'une
 * miniature. C'est ce que fait Xmind (« des rendus d'une mini-carte »), avec notre moteur. Avec un squelette, la
 * miniature en porte aussi le style : la forme et l'épaisseur des branches, leur effilé, la forme des sujets, un
 * fond ou non, le trait tremblé d'un squelette dessiné à la main.
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
const cache = new Map<string, ReturnType<typeof geometrie>>()

/** La mise en page de l'exemple pour une structure (et la structure que son squelette donne aux principaux), et à quel principal appartient chaque sujet. */
function geometrie(structure: StructureArbre, principaux?: StructureArbre) {
  const { lecture, rang, niveau, central } = exemple(structure)
  const disposition = disposer(lecture, (id) => TAILLES[niveau.get(id) ?? 'sous'], ECARTS, false, [], principaux)
  return { lecture, rang, niveau, central, disposition, cadre: emprise(disposition.boites.values()) }
}

/** La géométrie d'une vignette, gardée (une structure ne change pas). */
export function apercuDe(structure: StructureArbre, principaux?: StructureArbre) {
  const cle = `${structure}|${principaux ?? ''}`
  let g = cache.get(cle)
  if (!g) {
    g = geometrie(structure, principaux)
    cache.set(cle, g)
  }
  return g
}

const MARGE = 6
/** Une épaisseur de trait de la carte (px) rendue à l'échelle de la vignette. */
const ECHELLE_TRAIT = 0.55

interface Props {
  structure: StructureArbre
  /** Le squelette dont la vignette porte le style ; absent : des branches et des sujets sobres. */
  squelette?: SqueletteDef | undefined
  /** Les couleurs des principaux, tour à tour ; une seule : toutes les branches de cette couleur. Absentes : des gris. */
  couleurs?: readonly string[] | undefined
  /** Le fond de la vignette. */
  fond?: string | undefined
  /** L'encre du central et des traits sans couleur. */
  encre?: string | undefined
  className?: string | undefined
}

/** Une vignette : le dessin seul, à poser dans une carte. */
export const ApercuStructure = memo(function ApercuStructure({ structure, squelette, couleurs, fond, encre = 'var(--notak-arbre-encre)', className }: Props) {
  const { rang, niveau, disposition: d, cadre, central } = apercuDe(squelette?.structure ?? structure, squelette?.principaux)
  const idFiltre = `notak-sq-main-${useId().replace(/:/g, '')}`
  const [x, y, w, h] = [cadre.x - MARGE, cadre.y - MARGE, cadre.l + 2 * MARGE, cadre.h + 2 * MARGE]
  const couleur = (id: Id): string => {
    const i = rang.get(id)
    return i === undefined || !couleurs?.length ? 'color-mix(in srgb, var(--notak-arbre-texte) 38%, transparent)' : couleurs[i % couleurs.length]!
  }
  const rangDe = (id: Id): RangSquelette => niveau.get(id) ?? 'sous'
  return (
    <svg className={className} viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" aria-hidden style={fond ? { background: fond } : undefined}>
      {squelette?.main && (
        <defs>
          <filter id={idFiltre} filterUnits="userSpaceOnUse" x={x} y={y} width={w} height={h}>
            <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="7" result="bruit" />
            <feDisplacementMap in="SourceGraphic" in2="bruit" scale="1.3" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      )}
      <g fill="none" strokeLinecap="round" strokeWidth={1.1} filter={squelette?.main ? `url(#${idFiltre})` : undefined}>
        {d.liens.map((lien) => {
          const [p, e] = [d.boites.get(lien.de), d.boites.get(lien.vers)]
          if (!p || !e) return null
          if (!squelette) return <path key={lien.vers} d={cheminBranche(p, e, lien.cote, lien.forme)} stroke={couleur(lien.vers)} />
          const classe = squelette[rangDe(lien.de)]
          const epaisseur = (classe.epaisseur ?? 1.75) * ECHELLE_TRAIT
          if (epaisseur <= 0 || classe.motif === 'aucun') return null
          // La structure garde ses formes propres (arbre, droite des chronologies) ; carte, logique et coude suivent le squelette.
          const forme = lien.forme === 'courbe' || lien.forme === 'coudee' ? classe.branche : lien.forme
          const [parent, enfant] = [souligne(classe.forme) ? 0.8 : 0, souligne(squelette[rangDe(lien.vers)].forme) ? 0.8 : 0]
          const s = { parent, enfant, centre: lien.de === central, radial: true }
          const effile = squelette.effile && s.centre ? cheminEffile(p, e, lien.cote, forme, s, epaisseur) : null
          return effile ? (
            <path key={lien.vers} d={effile} fill={couleur(lien.vers)} stroke="none" />
          ) : (
            <path key={lien.vers} d={cheminBranche(p, e, lien.cote, forme, s)} stroke={couleur(lien.vers)} strokeWidth={epaisseur} strokeDasharray={classe.motif === 'tirets' || classe.motif === 'tirets-main' ? '2 1.4' : undefined} />
          )
        })}
        {d.traits.map((t, i) => (
          <path key={`t${i}`} d={t.d} stroke={encre} strokeOpacity={0.55} />
        ))}
      </g>
      <g filter={squelette?.main ? `url(#${idFiltre})` : undefined}>
        {[...d.boites].map(([id, b]) => (squelette ? <SujetStyle key={id} b={b} rang={rangDe(id)} squelette={squelette} couleur={couleur(id)} encre={encre} /> : <Sujet key={id} b={b} niveau={niveau.get(id) ?? 'sous'} couleur={couleur(id)} encre={encre} />))}
      </g>
    </svg>
  )
})

function Sujet({ b, niveau, couleur, encre }: { b: Boite; niveau: 'central' | 'principal' | 'sous'; couleur: string; encre: string }) {
  if (niveau === 'sous') return <line x1={b.x} x2={b.x + b.l} y1={b.y + b.h} y2={b.y + b.h} stroke={couleur} strokeWidth={1.1} strokeLinecap="round" />
  return <rect x={b.x} y={b.y} width={b.l} height={b.h} rx={niveau === 'central' ? 3 : 2.4} fill={niveau === 'central' ? encre : couleur} />
}

/** Le contour d'une forme dans la boîte d'un sujet de la vignette (une forme sans contour : un rectangle). */
function contour(forme: FormeSujet, b: Boite): string {
  const { d } = contourForme(forme, b.l, b.h)
  return d ?? ''
}

/**
 * Un sujet au style de son squelette : sa forme, remplie de la couleur de sa branche (du noir de l'encre pour le
 * central) ou seulement bordée, ou un souligné ; un sujet sans fond ni bordure n'est qu'une ligne de texte.
 */
function SujetStyle({ b, rang, squelette, couleur, encre }: { b: Boite; rang: RangSquelette; squelette: SqueletteDef; couleur: string; encre: string }) {
  const c = squelette[rang]
  const trait = (c.bordure ?? (rang === 'sous' ? 1 : 2)) * ECHELLE_TRAIT
  const teinte = rang === 'central' ? encre : couleur
  const plein = c.remplissage !== 'aucun'
  const t = { x: b.x + b.l * 0.2, y: b.y + b.h / 2 - 0.5, l: b.l * 0.6 }
  // Le texte : un trait court, clair sur un fond plein, de l'encre sinon.
  const texte = <rect x={t.x} y={t.y} width={t.l} height={1} rx={0.5} fill={plein && c.remplissage === 'plein' ? 'var(--notak-arbre-fond)' : encre} fillOpacity={plein && c.remplissage === 'plein' ? 0.85 : 0.55} />
  if (souligne(c.forme)) {
    const y = b.y + b.h
    return (
      <g>
        {texte}
        <line x1={b.x} x2={b.x + b.l} y1={y} y2={y} stroke={couleur} strokeWidth={Math.max(trait, 0.8)} strokeLinecap="butt" />
        {c.forme === 'double-souligne' && <line x1={b.x} x2={b.x + b.l} y1={y - 1.6} y2={y - 1.6} stroke={couleur} strokeWidth={0.5} />}
      </g>
    )
  }
  const aBordure = (c.bordure ?? 0) > 0 && c.motifBordure !== 'aucun'
  return (
    <g>
      <path transform={`translate(${b.x} ${b.y})`} d={contour(c.forme, b)} fill={plein ? teinte : 'none'} fillOpacity={rang === 'sous' ? 0.3 : plein && c.remplissage !== 'plein' ? 0.7 : 1} stroke={aBordure ? teinte : 'none'} strokeWidth={Math.max(trait, 0.6)} />
      {texte}
    </g>
  )
}
