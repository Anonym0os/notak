import type { ReactNode } from 'react'
import { Icone, type NomIcone } from '../../icones'

/**
 * Les marqueurs de docs/XMIND.md § 3, par leur identifiant Xmind (c'est lui qu'on stocke, pour rendre un `.xmind`
 * intact). Les dessins sont les nôtres : pastilles numérotées, camemberts d'avancement, icônes Tabler.
 */

export const COULEURS_MARQUEUR: Record<string, string> = {
  red: '#e5534b',
  orange: '#e69138',
  yellow: '#d4a72c',
  green: '#3fa66b',
  blue: '#3a86d4',
  purple: '#8b5cd6',
  gray: '#8c939d',
}

/** Les couleurs des priorités 1 à 9, de la plus urgente à la moins. */
const PRIORITES = ['#e5534b', '#e69138', '#d4a72c', '#3fa66b', '#3a86d4', '#8b5cd6', '#5f6b7a', '#8c939d', '#aab0b8']

/** L'avancement d'une tâche, en huitièmes, par identifiant. */
const AVANCEMENT: Record<string, number> = {
  'task-start': 0,
  'task-oct': 1,
  'task-quarter': 2,
  'task-3oct': 3,
  'task-half': 4,
  'task-5oct': 5,
  'task-3quar': 6,
  'task-7oct': 7,
  'task-done': 8,
}

const ICONES: Record<string, NomIcone> = {
  'smiley-smile': 'humeurSourire',
  'smiley-laugh': 'humeurRire',
  'smiley-angry': 'humeurColere',
  'smiley-cry': 'humeurPleurs',
  'smiley-surprise': 'humeurSurprise',
  'smiley-boring': 'humeurNeutre',
  'arrow-up': 'haut',
  'arrow-down': 'bas',
  'arrow-left': 'gauche',
  'arrow-right': 'droite',
  'symbol-plus': 'ajouter',
  'symbol-minus': 'retirer',
  'symbol-question': 'question',
  'symbol-exclam': 'exclamation',
  'symbol-info': 'infos',
  'symbol-wrong': 'fermer',
  'symbol-right': 'coche',
}

const FORMES: Record<string, NomIcone> = { flag: 'marqueurDrapeau', star: 'marqueurEtoile', people: 'marqueurPersonne' }

/** Les groupes du panneau, dans l'ordre : chacun est une rangée de marqueurs. */
export const GROUPES_MARQUEURS: { cle: string; marqueurs: string[] }[] = [
  { cle: 'priority', marqueurs: Array.from({ length: 9 }, (_, i) => `priority-${i + 1}`) },
  { cle: 'task', marqueurs: [...Object.keys(AVANCEMENT), 'task-pause'] },
  { cle: 'flag', marqueurs: Object.keys(COULEURS_MARQUEUR).map((c) => `flag-${c}`) },
  { cle: 'star', marqueurs: Object.keys(COULEURS_MARQUEUR).map((c) => `star-${c}`) },
  { cle: 'people', marqueurs: Object.keys(COULEURS_MARQUEUR).map((c) => `people-${c}`) },
  { cle: 'smiley', marqueurs: Object.keys(ICONES).filter((m) => m.startsWith('smiley-')) },
  { cle: 'arrow', marqueurs: Object.keys(ICONES).filter((m) => m.startsWith('arrow-')) },
  { cle: 'symbol', marqueurs: Object.keys(ICONES).filter((m) => m.startsWith('symbol-')) },
]

/** La taille d'un marqueur dessiné devant un titre, en px. */
export const TAILLE_MARQUEUR = 16

/** Un marqueur, dessiné dans un carré de `taille` px dont le coin haut gauche est en (0, 0). */
export function Marqueur({ id, taille = TAILLE_MARQUEUR }: { id: string; taille?: number }): ReactNode {
  const r = taille / 2
  const priorite = id.match(/^priority-([1-9])$/)
  if (priorite) {
    return (
      <g>
        {/* Un liseré clair : la pastille reste lisible sur un sujet de la même couleur. */}
        <circle cx={r} cy={r} r={r - 0.5} fill={PRIORITES[Number(priorite[1]) - 1]} stroke="#fff" strokeWidth={1.25} />
        <text x={r} y={r + taille * 0.24} textAnchor="middle" fontSize={taille * 0.66} fontWeight={700} fill="#fff" fontFamily="Inter, system-ui, sans-serif">
          {priorite[1]}
        </text>
      </g>
    )
  }
  if (id === 'task-pause') {
    return (
      <g>
        <circle cx={r} cy={r} r={r - 0.75} fill="#fff" stroke="#3a86d4" strokeWidth={1.5} />
        <rect x={r - 3.5} y={r - 3.5} width={2.5} height={7} fill="#3a86d4" />
        <rect x={r + 1} y={r - 3.5} width={2.5} height={7} fill="#3a86d4" />
      </g>
    )
  }
  const huitiemes = AVANCEMENT[id]
  if (huitiemes !== undefined) {
    if (huitiemes === 8) {
      return (
        <g>
          <circle cx={r} cy={r} r={r} fill="#3fa66b" />
          <path d={`M${r * 0.55} ${r}l${r * 0.32} ${r * 0.32}l${r * 0.6} ${-r * 0.62}`} stroke="#fff" strokeWidth={1.75} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )
    }
    return (
      <g>
        <circle cx={r} cy={r} r={r - 0.75} fill="#fff" stroke="#3a86d4" strokeWidth={1.5} />
        {huitiemes > 0 && <path d={secteur(r, r - 2.5, huitiemes / 8)} fill="#3a86d4" />}
      </g>
    )
  }
  const [groupe, couleur] = [id.split('-')[0]!, id.slice(id.indexOf('-') + 1)]
  const forme = FORMES[groupe]
  const icone = forme ?? ICONES[id]
  if (icone) {
    return (
      <g style={{ color: forme ? (COULEURS_MARQUEUR[couleur] ?? COULEURS_MARQUEUR.gray) : 'var(--notak-arbre-encre)' }}>
        <Icone nom={icone} taille={taille} trait={2} />
      </g>
    )
  }
  // Un marqueur venu de Xmind que Notak ne dessine pas : une pastille neutre, gardée pour l'export.
  return (
    <g>
      <title>{id}</title>
      <circle cx={r} cy={r} r={r - 2} fill="#aab0b8" />
    </g>
  )
}

/** Un secteur de disque, depuis midi dans le sens des aiguilles, d'une part `f` du tour. */
function secteur(c: number, r: number, f: number): string {
  const angle = f * 2 * Math.PI
  const [x, y] = [c + r * Math.sin(angle), c - r * Math.cos(angle)]
  return `M${c} ${c}V${c - r}A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`
}
