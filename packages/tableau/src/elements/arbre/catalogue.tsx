import type { ReactNode } from 'react'
import { Icone, type NomIcone } from '../../icones'

/**
 * Les autocollants et les illustrations du panneau d'icônes (docs/XMIND.md § 13). Xmind livre 468 autocollants et 349
 * illustrations dessinés ; Notak n'en reprend aucun dessin. → Notak : les mêmes catégories, remplies d'emojis Unicode pour
 * les autocollants et d'icônes Tabler (MIT) en couleur, sur une pastille, pour les illustrations.
 */

// — Autocollants —

export interface CategorieAutocollants {
  /** Sert de clé de traduction : `arbre.icones.cat.<cle>`. */
  cle: string
  emojis: string[]
}

const emojis = (s: string) => [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(s.replace(/\s+/g, ''))].map((x) => x.segment)

/** Les treize catégories de Xmind, dans leur ordre. */
export const AUTOCOLLANTS: CategorieAutocollants[] = [
  { cle: 'business', emojis: emojis('💼📊📈📉💰💵💳🏦🧾📇📁📂🗂️📅🗓️📌📎🖇️✂️📝✏️🖊️📣📢🤝🏢🏭🛒🏷️🔖📦💡🔑🎯🏆🥇⏰⌛📞📧') },
  { cle: 'education', emojis: emojis('🎓📚📖📕📗📘📙✏️🖍️🖌️📐📏🔬🔭🧪🧬🧮🌍🗺️🏫🧑‍🏫👩‍🎓👨‍🎓📓🔤🔢➕➖✖️➗🏅🧠💭❓❗📝🖋️') },
  { cle: 'technology', emojis: emojis('💻🖥️⌨️🖱️📱📲☎️📡🔋🔌💾💿📀🎧🎤📷📹🎥📺🕹️🎮🤖🛰️🚀🛸🔧🔨⚙️🛠️🧲🔦💡🌐🔒🔓🔍📶🧑‍💻🖨️⌚📟🪫') },
  { cle: 'mood', emojis: emojis('😀😃😄😁😆😅😂🙂😉😊😍🥰😘😎🤓🤔😐😴😢😭😡😱😳🥳🤩😇🙃😬😌🤗🥺') },
  { cle: 'travel', emojis: emojis('✈️🚀🚗🚕🚌🚎🚆🚄🚢⛵🛥️🚲🛵🏍️🚁🗺️🧭🏝️🏖️🏔️⛰️🗻🏕️🌋🗽🗼🏰🏯🎡🎢🛂🛄🧳🎫🏨🏩⛽🚦🚧⚓🛶🚠🛤️') },
  { cle: 'holiday', emojis: emojis('🎄🎅🤶🎁🎆🎇🧨🎈🎉🎊🪅🎃👻🕯️🦃🐣🐰🌷💐🥂🍾🎂🕎🪔🧧🎑🎋🎍') },
  { cle: 'daily', emojis: emojis('🛏️🛋️🚪🪑🚿🛁🧴🧼🧽🧹🧺🪣🍽️🥄🍴🔪☕🫖🍶🥛🧊👕👖👗👟👜🧢👓⌚💍🧸🪥🧻🗑️') },
  { cle: 'animal', emojis: emojis('🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🐦🦆🦉🐴🐢🐍🐙') },
  { cle: 'weather', emojis: emojis('☀️🌤️⛅🌥️☁️🌦️🌧️⛈️🌩️🌨️❄️☃️🌬️💨🌪️🌫️🌈☔⚡🌡️🌙🌞🌝') },
  { cle: 'sport', emojis: emojis('⚽🏀🏈⚾🎾🏐🏉🎱🏓🏸🥊🥋⛳🏹🎿🏂🏊🚴🏋️🧘🏃⛷️') },
  { cle: 'food', emojis: emojis('🍎🍐🍊🍋🍌🍉🍇🍓🫐🍒🍑🥭🍍🥥🥝🍅🥑🥦🥕🌽🌶️🥔🍞🥐🥖🧀🥚🍳🥓🍔🍟🍕🌭🥪🌮🍣🍜🍝🍰🍩🍪🍫🍿🍦☕🍵🍺🍷🥤') },
  { cle: 'gesture', emojis: emojis('👍👎👌✌️🤞🤟🤘🤙👋🖐️✋👏🙌🙏💪👈👉👆👇☝️🤝✍️🫶🫰') },
  { cle: 'others', emojis: emojis('⭐🌟✨💫🔥💥💯✅❌❓❗💤💢💬💭♻️⚠️🚫🔔🎵🎶🔴🟠🟡🟢🔵🟣⚫⚪🔶🔷❤️🧡💛💚💙💜🖤🤍') },
]

/** Un autocollant sur un sujet : l'emoji lui-même, centré dans son cadre. */
export function Autocollant({ emoji, l, h }: { emoji: string; l: number; h: number }): ReactNode {
  return (
    <text x={l / 2} y={h / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(l, h) * 0.82} fontFamily="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif">
      {emoji}
    </text>
  )
}

// — Illustrations —

export interface Illustration {
  /** `groupe.sous.rang`, stable. */
  id: string
  icone: NomIcone
  fond: string
  teinte: string
  trait: number
  /** Le cadre : un carré arrondi, ou un carré à angles vifs (le pixel). */
  rayon: number
  /** Un contour sur la pastille. */
  bordure?: string
}

export interface SousGroupe {
  cle: string
  illustrations: Illustration[]
}

export interface GroupeIllustrations {
  cle: string
  sous: SousGroupe[]
}

const ill = (n: string) => `ill${n}` as NomIcone

/** Les teintes d'un groupe : une pastille de fond, et le trait de l'icône dessus. */
type Habillage = (i: number) => Pick<Illustration, 'fond' | 'teinte' | 'trait' | 'rayon'> & { bordure?: string }

const pastel = (couples: [string, string][], trait = 1.6, rayon = 0.28): Habillage => (i) => {
  const [fond, teinte] = couples[i % couples.length]!
  return { fond, teinte, trait, rayon }
}

const HABILLAGES: Record<string, Habillage> = {
  minimaliste: pastel([['#f3f4f6', '#2d3540']], 1.4),
  reveur: pastel([['#e9e4ff', '#6a4fd6'], ['#ffe4ef', '#d6457c'], ['#ddf1ff', '#2f84c9'], ['#fff0d2', '#c98a1c']]),
  botanique: pastel([['#e5f3e7', '#2f7d4f'], ['#fbe6ee', '#c4457a'], ['#fff3d4', '#b88a1a']]),
  ville: pastel([['#dfe9ff', '#2e5aa8'], ['#e3f6f1', '#1d8c70'], ['#ffe9dc', '#c4531c']]),
  papeterie: pastel([['#fde8d4', '#c46a1c'], ['#e9edf2', '#44546a'], ['#fff2cc', '#a98400']], 1.8),
  pixel: (i) => ({ fond: '#ffffff', teinte: '#000000', trait: 2.4, rayon: 0, bordure: i % 2 ? '#000000' : '#000000' }),
  aquarelle: pastel([['#d9ecf7', '#3e7fa8'], ['#f8dde0', '#b4505c'], ['#e4f0d6', '#6b8f2f'], ['#f5e7d0', '#a8793a']], 1.3, 0.4),
  animaux3d: pastel([['#ffe0c2', '#b4560f'], ['#d8eafe', '#2565b0'], ['#e6f6d8', '#4a8a14']], 2),
  nourriture3d: pastel([['#ffd9cf', '#c23a1a'], ['#fff1b8', '#a77c00'], ['#d9f2cb', '#3c8a1a']], 2),
  bureau: pastel([['#efe6ff', '#6e4bc4'], ['#ffe6f3', '#c43c86'], ['#e3f3ff', '#2d79b8']], 1.5),
  enfantin: pastel([['#ffd4d4', '#e03a3a'], ['#d4e6ff', '#2a6fe0'], ['#fff2b0', '#d49a00'], ['#d6f5d4', '#2da048']], 2.2, 0.5),
}

/** Les gemmes : une couleur par pierre. */
const GEMMES: Record<string, [string, string]> = {
  obsidienne: ['#2a2d33', '#cfd3da'],
  perle: ['#f4f1ee', '#8b8480'],
  rubis: ['#fbd5d9', '#c01f36'],
  jade: ['#d2efe0', '#1f8a5a'],
  agate: ['#f2dfd0', '#a8672f'],
  topaze: ['#ffe9bd', '#c27a00'],
  emeraude: ['#cdeedd', '#0d8a4a'],
  saphir: ['#d3defb', '#1f4fc4'],
  peridot: ['#e3f1c2', '#6f9a0c'],
  amethyste: ['#e6d8f7', '#7a35c2'],
  pierrelune: ['#e8edf5', '#6b7a99'],
}

function sous(groupe: string, cle: string, icones: string[], decalage = 0): SousGroupe {
  const habiller = HABILLAGES[groupe]!
  return { cle, illustrations: icones.map((n, i) => ({ id: `${groupe}.${cle}.${i}`, icone: ill(n), ...habiller(i + decalage) })) }
}

const PRODUCTIVITE = ['Calendar', 'Checklist', 'Clock', 'Briefcase', 'Book', 'Notebook', 'Bulb', 'Target']
const VOYAGE = ['Plane', 'Map', 'Compass', 'Car', 'Train', 'Backpack', 'Tent', 'Ship', 'Camera', 'Mountain']
const VACANCES = ['Sun', 'Umbrella', 'Gift', 'Balloon', 'Confetti', 'Snowflake', 'Cake', 'Rainbow', 'Trees']
const NOURRITURE = ['Coffee', 'Pizza', 'Apple', 'Carrot', 'IceCream', 'Cookie', 'Bread', 'Egg']
const AUTRES = ['Rocket', 'Key', 'Bell', 'Heart', 'Star']
const ANIMAUX = ['Cat', 'Dog', 'Fish', 'Bug', 'Butterfly', 'Horse', 'Pig', 'Paw', 'Spider']
const BUREAU = ['DeviceLaptop', 'Pencil', 'Ruler', 'Paperclip', 'Calculator', 'Scissors', 'Eraser', 'Notebook']

/** Les douze groupes de Xmind, dans leur ordre ; les sous-catégories sont les siennes. */
export const ILLUSTRATIONS: GroupeIllustrations[] = [
  {
    cle: 'minimaliste',
    sous: [sous('minimaliste', 'productivite', PRODUCTIVITE), sous('minimaliste', 'voyage', VOYAGE), sous('minimaliste', 'vacances', VACANCES), sous('minimaliste', 'nourriture', NOURRITURE), sous('minimaliste', 'autres', AUTRES)],
  },
  {
    cle: 'reveur',
    sous: [sous('reveur', 'productivite', PRODUCTIVITE), sous('reveur', 'voyage', [...VOYAGE, 'Bus']), sous('reveur', 'vacances', VACANCES), sous('reveur', 'nourriture', [...NOURRITURE, 'Lemon', 'Beer']), sous('reveur', 'autres', [...AUTRES, 'Moon'])],
  },
  { cle: 'botanique', sous: [sous('botanique', 'plante', ['Plant', 'Leaf', 'Cactus', 'Trees', 'Seeding', 'Tree']), sous('botanique', 'fleur', ['Flower', 'Rosette', 'Butterfly', 'Sun', 'Droplet'])] },
  {
    cle: 'ville',
    sous: [
      sous('ville', 'electronique', ['DeviceLaptop', 'Wifi', 'Atom', 'Bulb']),
      sous('ville', 'cuisine', ['Coffee', 'Bottle', 'Egg', 'Flame']),
      sous('ville', 'transport', ['Car', 'Bus', 'Train', 'Bike']),
      sous('ville', 'menage', ['Home', 'Building', 'Key']),
      sous('ville', 'creativite', ['Palette', 'Brush', 'Pencil', 'Camera']),
    ],
  },
  { cle: 'papeterieDegradee', sous: [sous('papeterie', 'papeterie', ['Pencil', 'Notebook', 'Eraser', 'Ruler', 'Paperclip', 'Scissors']), sous('papeterie', 'bureau', ['Calculator', 'Calendar', 'Clock', 'Briefcase']), sous('papeterie', 'autres', ['Book', 'Key', 'Bell'])] },
  { cle: 'pixel', sous: [sous('pixel', 'productivite', PRODUCTIVITE.slice(0, 6)), sous('pixel', 'voyage', VOYAGE.slice(0, 6)), sous('pixel', 'vacances', VACANCES.slice(0, 6)), sous('pixel', 'autres', AUTRES)] },
  { cle: 'aquarelle', sous: [sous('aquarelle', 'a-plat', ANIMAUX)] },
  { cle: 'animaux3d', sous: [sous('animaux3d', 'a-plat', [...ANIMAUX].reverse())] },
  { cle: 'nourriture3d', sous: [sous('nourriture3d', 'a-plat', [...NOURRITURE, 'Lemon', 'Beer', 'Bottle'])] },
  { cle: 'bureauReve', sous: [sous('bureau', 'a-plat', BUREAU)] },
  { cle: 'enfantin', sous: [sous('enfantin', 'a-plat', ['Balloon', 'Ghost', 'Rocket', 'Paw', 'Cake', 'Rainbow', 'Stars', 'Butterfly', 'IceCream', 'Cat'])] },
  {
    cle: 'pierres',
    sous: Object.entries(GEMMES).map(([cle, [fond, teinte]]) => ({
      cle,
      illustrations: ['Diamond', 'Rosette'].map((n, i) => ({ id: `pierres.${cle}.${i}`, icone: ill(n), fond, teinte, trait: 1.8, rayon: 0.3 })),
    })),
  },
]

const PAR_ID = new Map(ILLUSTRATIONS.flatMap((g) => g.sous.flatMap((s) => s.illustrations)).map((x) => [x.id, x]))

export const illustrationDe = (id: string): Illustration | undefined => PAR_ID.get(id)

/** Une illustration sur un sujet : sa pastille, et l'icône dessus. */
export function DessinIllustration({ id, l, h }: { id: string; l: number; h: number }): ReactNode {
  const x = illustrationDe(id)
  if (!x) return <rect width={l} height={h} rx={6} fill="#e5e7eb" />
  const c = Math.min(l, h)
  const g = c * 0.6
  return (
    <g>
      <rect x={(l - c) / 2} y={(h - c) / 2} width={c} height={c} rx={c * x.rayon} fill={x.fond} {...(x.bordure ? { stroke: x.bordure, strokeWidth: 2 } : {})} />
      <g transform={`translate(${(l - g) / 2} ${(h - g) / 2})`} style={{ color: x.teinte }}>
        <Icone nom={x.icone} taille={g} trait={x.trait} />
      </g>
    </g>
  )
}

/** La taille d'un autocollant ou d'une illustration posés sur un sujet, en px. */
export const TAILLE_VIGNETTE = 64

/** Un autocollant ou une illustration en SVG autonome : ce que l'export `.xmind` écrit pour que Xmind la montre. */
export async function svgVignette(v: { genre: 'autocollant' | 'illustration'; id: string; l: number; h: number }): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const corps = renderToStaticMarkup(v.genre === 'autocollant' ? <Autocollant emoji={v.id} l={v.l} h={v.h} /> : <DessinIllustration id={v.id} l={v.l} h={v.h} />)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${v.l}" height="${v.h}" viewBox="0 0 ${v.l} ${v.h}">${corps}</svg>`
}
