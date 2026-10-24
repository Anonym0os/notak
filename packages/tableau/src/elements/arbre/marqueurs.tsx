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

/**
 * Les symboles du panneau : l'identifiant du format, le dessin (une icône blanche, ou un mot) et la teinte du disque.
 * Seize sur la quarantaine que Xmind définit ; les autres identifiants se lisent et se rendent à l'export tels quels.
 */
const SYMBOLES: Record<string, { icone?: NomIcone; texte?: string; couleur: string }> = {
  'symbol-heart': { icone: 'coeur', couleur: '#e5534b' },
  'symbol-like': { icone: 'pouceHaut', couleur: '#e69138' },
  'symbol-dislike': { icone: 'pouceBas', couleur: '#3a86d4' },
  'symbol-pushpin': { icone: 'punaise', couleur: '#e5534b' },
  'symbol-idea': { icone: 'idee', couleur: '#d4a72c' },
  'symbol-flash': { icone: 'eclair', couleur: '#3a86d4' },
  'symbol-hourglass': { icone: 'sablier', couleur: '#e69138' },
  'symbol-phone': { icone: 'telephone', couleur: '#3fa66b' },
  'symbol-pen': { icone: 'croquis', couleur: '#e69138' },
  'symbol-music': { icone: 'musique', couleur: '#8b5cd6' },
  'symbol-entertainment': { icone: 'jeu', couleur: '#d4a72c' },
  'symbol-100': { texte: '100', couleur: '#e5534b' },
  'symbol-plane': { icone: 'voyage', couleur: '#3a86d4' },
  'symbol-run': { icone: 'sport', couleur: '#3fa66b' },
  'symbol-exclam': { icone: 'exclamation', couleur: '#e5534b' },
  'symbol-question': { icone: 'question', couleur: '#3a86d4' },
}

const couleurs = (prefixe: string) => Object.keys(COULEURS_MARQUEUR).map((c) => `${prefixe}-${c}`)

/**
 * Les groupes du panneau d'icônes, dans l'ordre de Xmind : 58 marqueurs. Chacun est une rangée ; un sujet n'en porte
 * qu'un par groupe.
 */
export const GROUPES_MARQUEURS: { cle: string; marqueurs: string[] }[] = [
  { cle: 'tag', marqueurs: couleurs('tag') },
  { cle: 'priority', marqueurs: Array.from({ length: 7 }, (_, i) => `priority-${i + 1}`) },
  { cle: 'task', marqueurs: ['task-start', 'task-oct', 'task-3oct', 'task-half', 'task-5oct', 'task-7oct', 'task-done'] },
  { cle: 'flag', marqueurs: couleurs('flag') },
  { cle: 'star', marqueurs: couleurs('star') },
  { cle: 'people', marqueurs: couleurs('people') },
  { cle: 'symbol', marqueurs: Object.keys(SYMBOLES) },
]

/** Ce que Notak sait dessiner sans l'afficher au panneau : de quoi relire un fichier de Xmind sans le défigurer. */
export const MARQUEURS_CACHES: string[] = [
  'priority-8',
  'priority-9',
  'task-quarter',
  'task-3quar',
  'task-pause',
  ...Object.keys(ICONES),
]

/** Un marqueur qui n'est pas de la bibliothèque : une image à soi, rangée dans un groupe de la carte (`perso-<id>`). */
export const estPerso = (m: string) => m.startsWith('perso-')

/** La taille d'un marqueur dessiné devant un titre, en px. */
export const TAILLE_MARQUEUR = 16

/** Un marqueur, dessiné dans un carré de `taille` px dont le coin haut gauche est en (0, 0). */
export function Marqueur({ id, taille = TAILLE_MARQUEUR, perso }: { id: string; taille?: number; perso?: (marqueur: string) => string | undefined }): ReactNode {
  const r = taille / 2
  if (estPerso(id)) {
    const adresse = perso?.(id)
    return adresse ? (
      <g>
        <clipPath id={`mq-${id}`}>
          <circle cx={r} cy={r} r={r} />
        </clipPath>
        <image href={adresse} x={0} y={0} width={taille} height={taille} preserveAspectRatio="xMidYMid slice" clipPath={`url(#mq-${id})`} />
      </g>
    ) : (
      <circle cx={r} cy={r} r={r - 2} fill="#aab0b8" />
    )
  }
  const tag = id.match(/^tag-(\w+)$/)
  if (tag) return <circle cx={r} cy={r} r={r - 0.75} fill={COULEURS_MARQUEUR[tag[1]!] ?? COULEURS_MARQUEUR.gray} />
  const symbole = SYMBOLES[id]
  if (symbole) {
    const g = taille * 0.62
    return (
      <g>
        <circle cx={r} cy={r} r={r - 0.5} fill={symbole.couleur} />
        {symbole.icone ? (
          <g transform={`translate(${r - g / 2} ${r - g / 2})`} style={{ color: '#fff' }}>
            <Icone nom={symbole.icone} taille={g} trait={2.4} />
          </g>
        ) : (
          <text x={r} y={r + taille * 0.17} textAnchor="middle" fontSize={taille * 0.46} fontWeight={800} fill="#fff" fontFamily="Inter, system-ui, sans-serif">
            {symbole.texte}
          </text>
        )}
      </g>
    )
  }
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
