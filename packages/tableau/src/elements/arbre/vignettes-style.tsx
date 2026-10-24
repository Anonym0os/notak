import { useId } from 'react'
import type { FormeBranche, FormeLimite, FormeRelation, FormeResume, FormeSujet, MotifRemplissage, MotifTrait, PointeTrait } from '../../coeur/tableau'
import type { FamilleStructure } from './modele/style'
import { tiretsDe } from './apparence'
import { contourForme, contourLimite, cheminResume } from './formes'
import { cheminBranche } from './trace/branches'
import { cheminPointe } from './trace/pointes'

/**
 * Les vignettes du panneau Style : de petits dessins qui montrent ce que chaque choix fait, tirés des mêmes traceurs
 * que la carte (un seul dessin par forme, partout). Ils prennent la couleur du texte (`currentColor`).
 */

const NON = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Une forme de sujet dans un cadre de 40 × 24. */
export function VignetteForme({ forme, plein = false }: { forme: FormeSujet; plein?: boolean }) {
  const [l, h] = forme === 'cercle' || forme === 'double-cercle' || forme === 'renvoi-page' ? [16, 16] : [30, 16]
  const { d, trait } = contourForme(forme, l, h)
  const position = `translate(${(40 - l) / 2} ${(24 - h) / 2})`
  return (
    <svg width={40} height={24} viewBox="0 0 40 24" aria-hidden="true">
      <g transform={position}>
        {forme === 'souligne' && <path d={`M0 ${h}H${l}`} {...NON} />}
        {forme === 'double-souligne' && <path d={`M0 ${h}H${l}M0 ${h - 4}H${l}`} {...NON} />}
        {forme === 'aucune' && <path d={`M0 0H${l}V${h}H0Z`} {...NON} strokeDasharray="2 3" opacity={0.5} />}
        {d && <path d={d} {...NON} stroke={trait ? 'none' : 'currentColor'} fill={plein ? 'currentColor' : 'none'} fillOpacity={plein ? 0.12 : undefined} />}
        {trait && <path d={trait} {...NON} />}
      </g>
    </svg>
  )
}

/** Un motif de remplissage : un rectangle plein, hachuré ou à main levée. */
export function VignetteRemplissage({ motif }: { motif: MotifRemplissage }) {
  const id = useId()
  const hachure = { diagonales: [45, 6], 'diagonales-fines': [45, 3.5], horizontales: [90, 6], 'horizontales-fines': [90, 3.5] }[motif as string] as [number, number] | undefined
  return (
    <svg width={66} height={40} viewBox="0 0 66 40" aria-hidden="true">
      {hachure && (
        <defs>
          <pattern id={id} patternUnits="userSpaceOnUse" width={hachure[1]} height={hachure[1]} patternTransform={`rotate(${hachure[0]})`}>
            <line x1={0} y1={0} x2={0} y2={hachure[1]} stroke="currentColor" strokeWidth={1.2} />
          </pattern>
        </defs>
      )}
      <path
        d={motif === 'plein-main' ? 'M13 9.5Q33 7.5 53 9.7Q55 20 53.4 30.4Q33 32.4 12.8 30.2Q11.4 20 13 9.5Z' : 'M13 9H53V31H13Z'}
        fill={hachure ? `url(#${id})` : 'currentColor'}
        stroke="currentColor"
        strokeWidth={hachure ? 1.2 : 0}
        strokeLinejoin="round"
        fillOpacity={hachure ? 1 : 0.85}
      />
    </svg>
  )
}

/** Le contour d'un sujet, dans un motif de trait (plein, tirets, main levée…). */
export function VignetteBordure({ motif }: { motif: MotifTrait }) {
  const main = motif === 'main' || motif === 'tirets-main'
  return (
    <svg width={40} height={24} viewBox="0 0 40 24" aria-hidden="true">
      <path d={main ? 'M9 6.4Q20 5 31 6.3Q33.4 12 31.4 17.6Q20 19 8.8 17.4Q7 12 9 6.4Z' : 'M13 6H27Q31 6 31 10V14Q31 18 27 18H13Q9 18 9 14V10Q9 6 13 6Z'} {...NON} strokeDasharray={tiretsDe(motif)} />
    </svg>
  )
}

/** Un trait de 56 × 36 dans un motif (la liste de lignes). */
export function VignetteTrait({ motif, long = 56 }: { motif: MotifTrait; long?: number }) {
  const main = motif === 'main' || motif === 'tirets-main'
  return (
    <svg width={long} height={20} viewBox={`0 0 ${long} 20`} aria-hidden="true">
      <path d={main ? `M2 10.5Q${long * 0.25} 8 ${long / 2} 10.6T${long - 2} 9.6` : `M2 10H${long - 2}`} {...NON} strokeDasharray={tiretsDe(motif)} />
    </svg>
  )
}

/** Un bout de trait : une ligne qui finit (ou commence) par la pointe choisie. */
export function VignettePointe({ pointe, debut = false }: { pointe: PointeTrait; debut?: boolean }) {
  const p = cheminPointe(pointe, debut ? 4 : 36, 12, debut ? Math.PI : 0, 9)
  return (
    <svg width={40} height={24} viewBox="0 0 40 24" aria-hidden="true">
      <path d={`M4 12H36`} {...NON} />
      {p && <path d={p.d} {...NON} fill={p.plein ? 'currentColor' : 'none'} strokeWidth={p.plein ? 1 : 1.5} />}
    </svg>
  )
}

/** La forme d'une branche : un parent à gauche, un enfant en haut à droite, la branche entre eux. */
export function VignetteBranche({ forme }: { forme: FormeBranche }) {
  const parent = { x: 3, y: 12, l: 5, h: 8 }
  const enfant = { x: 32, y: 3, l: 5, h: 8 }
  return (
    <svg width={40} height={24} viewBox="0 0 40 24" aria-hidden="true">
      <rect x={parent.x} y={parent.y} width={parent.l} height={parent.h} rx={1.5} fill="currentColor" fillOpacity={0.5} />
      <rect x={enfant.x} y={enfant.y} width={enfant.l} height={enfant.h} rx={1.5} fill="currentColor" fillOpacity={0.5} />
      <path d={cheminBranche(parent, enfant, 'droite', forme === 'aucune' ? 'droite' : forme)} {...NON} />
    </svg>
  )
}

/** La forme d'une relation, de gauche à droite avec sa pointe. */
export function VignetteRelation({ forme }: { forme: FormeRelation }) {
  const base = forme.replace('-souple', '')
  const d = base === 'droite' ? 'M5 18L33 7' : base === 'coudee' ? 'M6 19V13H33V8' : base === 'zigzag' ? 'M5 18H19V8H33' : 'M5 19C10 6 24 4 33 9'
  const bout = base === 'droite' ? 0.4 : base === 'coudee' ? -Math.PI / 2 : base === 'zigzag' ? 0 : 0.6
  const fin = base === 'droite' ? [33, 7] : base === 'coudee' ? [33, 8] : base === 'zigzag' ? [33, 8] : [33, 9]
  const p = cheminPointe('triangle', fin[0]!, fin[1]!, bout, 7)
  return (
    <svg width={40} height={24} viewBox="0 0 40 24" aria-hidden="true">
      <path d={d} {...NON} strokeDasharray={forme.endsWith('souple') ? '3 2.5' : undefined} />
      {p && <path d={p.d} fill="currentColor" stroke="currentColor" strokeWidth={1} strokeLinejoin="round" />}
      {forme.endsWith('souple') && <circle cx={20} cy={13} r={2} fill="currentColor" />}
    </svg>
  )
}

export function VignetteLimite({ forme }: { forme: FormeLimite }) {
  const { d, equerres } = contourLimite(forme, 6, 3, 28, 18)
  return (
    <svg width={40} height={24} viewBox="0 0 40 24" aria-hidden="true">
      <path d={d} {...NON} fill="currentColor" fillOpacity={0.08} strokeDasharray={forme === 'focus' ? '1 3' : undefined} />
      {equerres && <path d={equerres} {...NON} strokeWidth={2.2} />}
    </svg>
  )
}

export function VignetteResume({ forme }: { forme: FormeResume }) {
  return (
    <svg width={40} height={24} viewBox="0 0 40 24" aria-hidden="true">
      <path d={cheminResume(forme, 22, 3, 21, -1)} {...NON} />
      <rect x={4} y={6} width={10} height={3.5} rx={1.5} fill="currentColor" fillOpacity={0.5} />
      <rect x={4} y={14.5} width={10} height={3.5} rx={1.5} fill="currentColor" fillOpacity={0.5} />
      <rect x={31} y={10} width={6} height={4} rx={1.5} fill="currentColor" fillOpacity={0.5} />
    </svg>
  )
}

/** Le schéma d'une famille de structure : un central et ses branches rangées comme elle les range. */
export function VignetteStructure({ famille }: { famille: FamilleStructure['id'] }) {
  const boite = (x: number, y: number, l = 6, h = 4) => <rect key={`${x}${y}${l}`} x={x} y={y} width={l} height={h} rx={1.2} fill="currentColor" fillOpacity={0.55} />
  const centre = <rect x={16} y={9} width={8} height={6} rx={1.5} fill="currentColor" />
  let dessin: React.ReactNode
  switch (famille) {
    case 'carte':
      dessin = (
        <>
          <path d="M16 12H12M24 12H28M18 9L13 5M22 9L27 5M18 15L13 19M22 15L27 19" {...NON} strokeWidth={1.2} />
          {[boite(6, 3), boite(28, 3), boite(6, 17), boite(28, 17), boite(5, 10, 7), boite(28, 10, 7)]}
        </>
      )
      break
    case 'logique':
      dessin = (
        <>
          <path d="M24 12H27M27 5V19M27 5H29M27 12H29M27 19H29" {...NON} strokeWidth={1.2} />
          {[boite(30, 3), boite(30, 10), boite(30, 17)]}
        </>
      )
      break
    case 'accolade':
      dessin = (
        <>
          <path d="M25 12H27M27 8Q31 8 31 12Q31 16 27 16" {...NON} strokeWidth={1.2} />
          {[boite(33, 3, 5), boite(33, 10, 5), boite(33, 17, 5)]}
        </>
      )
      break
    case 'organigramme':
      dessin = (
        <>
          <path d="M20 15V17M10 17H30M10 17V19M20 17V19M30 17V19" {...NON} strokeWidth={1.2} />
          {[boite(7, 19.5, 6, 3), boite(17, 19.5, 6, 3), boite(27, 19.5, 6, 3)]}
        </>
      )
      break
    case 'arbre':
      dessin = (
        <>
          <path d="M19 15V21M19 18H22M19 21H22" {...NON} strokeWidth={1.2} />
          {[boite(23, 16, 8, 3), boite(23, 19.5, 8, 3)]}
        </>
      )
      break
    case 'chronologie':
      dessin = (
        <>
          <path d="M3 12H37M10 12V6M20 12V18M30 12V6" {...NON} strokeWidth={1.2} />
          {[boite(7, 2, 6, 4), boite(17, 18, 6, 4), boite(27, 2, 6, 4)]}
        </>
      )
      break
    case 'arete':
      dessin = (
        <>
          <path d="M3 12H30M10 4L15 12M20 4L25 12M10 20L15 12M20 20L25 12" {...NON} strokeWidth={1.2} />
          {[boite(7, 1, 6, 3), boite(17, 1, 6, 3), boite(7, 20, 6, 3), boite(17, 20, 6, 3), boite(30, 9, 8, 6)]}
        </>
      )
      break
    case 'matrice':
      dessin = (
        <>
          <path d="M8 6H32M8 12H32M8 18H32M8 6V18M20 6V18M32 6V18" {...NON} strokeWidth={1.1} />
          {[boite(10, 8, 8, 2.5), boite(22, 8, 8, 2.5), boite(10, 14, 8, 2.5)]}
        </>
      )
      break
  }
  return (
    <svg width={40} height={24} viewBox="0 0 40 24" aria-hidden="true">
      {famille !== 'chronologie' && famille !== 'arete' && famille !== 'matrice' && famille !== 'organigramme' && famille !== 'arbre' && centre}
      {famille === 'organigramme' && <rect x={15} y={4} width={10} height={6} rx={1.5} fill="currentColor" />}
      {famille === 'arbre' && <rect x={12} y={6} width={10} height={6} rx={1.5} fill="currentColor" />}
      {dessin}
    </svg>
  )
}

/** Un anneau divisé en parts égales : une série de couleurs de branches. */
export function Anneau({ couleurs, taille = 40 }: { couleurs: readonly string[]; taille?: number }) {
  const n = couleurs.length
  const fond = couleurs.map((c, i) => `${c} ${(i / n) * 360}deg ${((i + 1) / n) * 360}deg`).join(', ')
  return <span className="notak-arbre-style-anneau" style={{ width: taille, height: taille, background: `conic-gradient(${fond})` }} aria-hidden="true" />
}
