import type { CasseTexte, FormeBranche, FormeLimite, FormeRelation, FormeResume, MotifRemplissage, MotifTrait, StyleLimite, StyleRelation, StyleResume, StyleSujet } from '../../coeur/tableau'
import { FORMES_LIMITE, FORMES_RESUME, formeDepuisXmind, xmindDeForme } from './formes'
import { pointeDepuisXmind, xmindDePointe } from './trace/pointes'

/**
 * Le style d'un `.xmind` (docs/XMIND.md § 5 bis et § 7) : `style.properties`, un dictionnaire de chaînes, d'un sujet,
 * d'une relation, d'une limite ou d'un résumé. Chaque propriété que Notak règle se lit dans un champ du style et s'écrit
 * depuis lui ; les autres restent dans leur dictionnaire, pour revenir telles quelles à l'export.
 */

type Props = Record<string, string>
type Valeurs = Record<string, unknown>

/** Une propriété du format et le ou les champs de Notak qu'elle porte. */
interface Propriete {
  cle: string
  lire(v: string): Valeurs | undefined
  ecrire(x: Valeurs): string | undefined
}

const nombre = (v: string): number | undefined => {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : undefined
}

/** Une couleur `#rgb`, `#rrggbb` ou `#rrggbbaa`, rendue en minuscules sur six ou huit chiffres. */
export function couleurDepuis(v: string): string | undefined {
  const m = v.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)
  if (!m) return undefined
  const h = m[1]!.toLowerCase()
  return `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`
}

/** Une couleur écrite comme Xmind : en majuscules. */
const couleurVers = (c: string) => c.toUpperCase()

/** Un champ simple : une propriété, un champ, deux conversions. */
function simple<T>(cle: string, champ: string, lire: (v: string) => T | undefined, ecrire: (x: T) => string | undefined): Propriete {
  return {
    cle,
    lire: (v) => {
      const x = lire(v)
      return x === undefined ? undefined : { [champ]: x }
    },
    ecrire: (vals) => (vals[champ] === undefined ? undefined : ecrire(vals[champ] as T)),
  }
}

/** Un champ dont les valeurs sont celles d'une table (`solid` ↔ `plein`). */
function table<T extends string>(cle: string, champ: string, paires: readonly (readonly [string, T])[]): Propriete {
  return simple<T>(
    cle,
    champ,
    (v) => paires.find(([x]) => x === v)?.[1],
    (x) => paires.find(([, y]) => y === x)?.[0],
  )
}

const couleur = (cle: string, champ: string) => simple<string>(cle, champ, couleurDepuis, couleurVers)
const points = (cle: string, champ: string) =>
  simple<number>(
    cle,
    champ,
    (v) => {
      const n = nombre(v)
      return n === undefined || n < 0 ? undefined : n
    },
    (x) => `${x}pt`,
  )

const MOTIFS_TRAIT: readonly (readonly [string, MotifTrait])[] = [
  ['solid', 'plein'],
  ['dash', 'tirets'],
  ['dot', 'points'],
  ['dash-dot', 'tiret-point'],
  ['dash-dot-dot', 'tiret-point-point'],
  ['handdrawn-solid', 'main'],
  ['handdrawn-dash', 'tirets-main'],
  ['none', 'aucun'],
]
const MOTIFS_REMPLISSAGE: readonly (readonly [string, MotifRemplissage])[] = [
  ['solid', 'plein'],
  ['solid-hand-drawn', 'plein-main'],
  ['hachure', 'diagonales'],
  ['hachure-thin', 'diagonales-fines'],
  ['crossing', 'horizontales'],
  ['crossing-thin', 'horizontales-fines'],
  ['none', 'aucun'],
]
const BRANCHES: readonly (readonly [string, FormeBranche])[] = [
  ['org.xmind.branchConnection.roundedElbow', 'coudee-arrondie'],
  ['org.xmind.branchConnection.elbow', 'coudee'],
  ['org.xmind.branchConnection.straight', 'droite'],
  ['org.xmind.branchConnection.curve', 'courbe'],
  ['org.xmind.branchConnection.bight', 'anse'],
  ['org.xmind.branchConnection.fold', 'pli'],
  ['org.xmind.branchConnection.roundedfold', 'pli-arrondi'],
]
const RELATIONS: readonly (readonly [string, FormeRelation])[] = [
  ['org.xmind.relationshipShape.curved', 'courbe'],
  ['org.xmind.relationshipShape.straight', 'droite'],
  ['org.xmind.relationshipShape.angled', 'coudee'],
  ['org.xmind.relationshipShape.zigzag', 'zigzag'],
  ['org.xmind.relationshipShape.flexible.curved', 'courbe-souple'],
  ['org.xmind.relationshipShape.flexible.angled', 'coudee-souple'],
  ['org.xmind.relationshipShape.flexible.zigzag', 'zigzag-souple'],
]
const CASSES: readonly (readonly [string, CasseTexte])[] = [
  ['uppercase', 'majuscules'],
  ['lowercase', 'minuscules'],
  ['capitalize', 'capitales'],
]
const ALIGNEMENTS: readonly (readonly [string, 'gauche' | 'centre' | 'droite'])[] = [
  ['left', 'gauche'],
  ['center', 'centre'],
  ['right', 'droite'],
]

/** Les propriétés du texte, communes à tout objet : `fo:*`. */
const TEXTE: readonly Propriete[] = [
  simple<string>(
    'fo:font-family',
    'police',
    // « NeverMind » est la police de Xmind : Notak garde la sienne.
    (v) => (/^nevermind/i.test(v.trim()) || !v.trim() ? undefined : v.includes(',') ? v : `"${v.trim()}", ui-sans-serif, system-ui, sans-serif`),
    (x) => x.split(',')[0]!.trim().replace(/^["']|["']$/g, ''),
  ),
  points('fo:font-size', 'taille'),
  simple<number>(
    'fo:font-weight',
    'graisse',
    (v) => (v === 'bold' ? 700 : v === 'normal' ? 400 : (nombre(v) ?? undefined)),
    (x) => String(x),
  ),
  simple<boolean>(
    'fo:font-style',
    'italique',
    (v) => (v === 'italic' ? true : v === 'normal' ? false : undefined),
    (x) => (x ? 'italic' : 'normal'),
  ),
  {
    cle: 'fo:text-decoration',
    lire: (v) => ({ ...(v.includes('line-through') ? { barre: true } : {}), ...(v.includes('underline') ? { souligne: true } : {}) }),
    ecrire: (x) => (x.barre || x.souligne ? [x.barre ? 'line-through' : '', x.souligne ? 'underline' : ''].filter(Boolean).join(' ') : undefined),
  },
  table('fo:text-transform', 'casse', CASSES),
  table('fo:text-align', 'alignement', ALIGNEMENTS),
  simple<string>('fo:color', 'couleurTexte', couleurDepuis, couleurVers),
]

const SUJET: readonly Propriete[] = [
  simple('shape-class', 'forme', formeDepuisXmind, xmindDeForme),
  table('fill-pattern', 'motifRemplissage', MOTIFS_REMPLISSAGE),
  couleur('svg:fill', 'remplissage'),
  table('border-line-pattern', 'motifBordure', MOTIFS_TRAIT),
  points('border-line-width', 'epaisseurBordure'),
  couleur('border-line-color', 'bordure'),
  table('line-class', 'branche', BRANCHES),
  table('line-pattern', 'motif', MOTIFS_TRAIT),
  points('line-width', 'epaisseurBranche'),
  simple<boolean>(
    'line-tapered',
    'effilee',
    (v) => (v === 'tapered' || v === 'true' ? true : v === 'none' || v === 'false' ? false : undefined),
    (x) => (x ? 'tapered' : 'none'),
  ),
  couleur('line-color', 'couleurBranche'),
  simple('arrow-end-class', 'pointeBranche', pointeDepuisXmind, xmindDePointe),
  {
    // `none` : toutes les branches de la même couleur (c'est `options.uneCouleur` de la carte, voir `lireSujet`).
    cle: 'multi-line-colors',
    lire: (v) => {
      const liste = v.split(/\s+/).flatMap((c) => couleurDepuis(c) ?? [])
      return liste.length ? { serieCouleurs: liste } : undefined
    },
    ecrire: (x) => (Array.isArray(x.serieCouleurs) && x.serieCouleurs.length ? (x.serieCouleurs as string[]).map(couleurVers).join(' ') : undefined),
  },
  ...TEXTE,
]

const RELATION: readonly Propriete[] = [
  table('shape-class', 'forme', RELATIONS),
  table('line-pattern', 'motif', MOTIFS_TRAIT),
  points('line-width', 'epaisseur'),
  couleur('line-color', 'couleur'),
  simple('arrow-begin-class', 'pointeDepart', pointeDepuisXmind, xmindDePointe),
  simple('arrow-end-class', 'pointeArrivee', pointeDepuisXmind, xmindDePointe),
  ...TEXTE,
]

const LIMITE: readonly Propriete[] = [
  simple<FormeLimite>(
    'shape-class',
    'forme',
    (v) => FORMES_LIMITE.find((f) => v === `org.xmind.boundaryShape.${f.xmind}`)?.id,
    (x) => `org.xmind.boundaryShape.${FORMES_LIMITE.find((f) => f.id === x)!.xmind}`,
  ),
  table('fill-pattern', 'motifRemplissage', MOTIFS_REMPLISSAGE),
  couleur('svg:fill', 'remplissage'),
  table('line-pattern', 'motif', MOTIFS_TRAIT),
  points('line-width', 'epaisseur'),
  couleur('line-color', 'couleur'),
  ...TEXTE,
]

const RESUME: readonly Propriete[] = [
  simple<FormeResume>(
    'shape-class',
    'forme',
    (v) => FORMES_RESUME.find((f) => v === `org.xmind.summaryShape.${f.xmind}`)?.id,
    (x) => `org.xmind.summaryShape.${FORMES_RESUME.find((f) => f.id === x)!.xmind}`,
  ),
  table('line-pattern', 'motif', MOTIFS_TRAIT),
  points('line-width', 'epaisseur'),
  couleur('line-color', 'couleur'),
]

/** Ce qui se lit des propriétés : les champs reconnus, et ce qui reste (propriétés inconnues, ou valeurs illisibles). */
function lire(table: readonly Propriete[], props: Props): { valeurs: Valeurs; restes: Props } {
  const valeurs: Valeurs = {}
  const restes: Props = { ...props }
  for (const p of table) {
    if (!(p.cle in props)) continue
    const v = p.lire(String(props[p.cle]))
    if (v === undefined) continue
    Object.assign(valeurs, v)
    delete restes[p.cle]
  }
  return { valeurs, restes }
}

function ecrire(table: readonly Propriete[], valeurs: Valeurs): Props {
  const sortie: Props = {}
  for (const p of table) {
    const v = p.ecrire(valeurs)
    if (v !== undefined) sortie[p.cle] = v
  }
  return sortie
}

/** Un dictionnaire sans les clés `undefined`. */
const net = <T extends object>(v: Valeurs): T => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) as T

const propsDe = (v: unknown): Props => (typeof v === 'object' && v !== null ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === 'string') as [string, string][]) : {})

/** Les propriétés de style d'un objet du fichier (`{ id, properties }`). */
export const proprietesDe = (style: unknown): Props => propsDe(typeof style === 'object' && style !== null ? (style as { properties?: unknown }).properties : undefined)

export const lireStyleSujet = (props: Props) => {
  const { valeurs, restes } = lire(SUJET, props)
  return { style: net<StyleSujet>(valeurs), restes }
}
export const ecrireStyleSujet = (s: StyleSujet): Props => ecrire(SUJET, s as Valeurs)

export const lireStyleRelation = (props: Props): StyleRelation => net(lire(RELATION, props).valeurs)
export const ecrireStyleRelation = (s: StyleRelation): Props => ecrire(RELATION, s as Valeurs)

export const lireStyleLimite = (props: Props): StyleLimite => net(lire(LIMITE, props).valeurs)
export const ecrireStyleLimite = (s: StyleLimite): Props => ecrire(LIMITE, s as Valeurs)

export const lireStyleResume = (props: Props): StyleResume => net(lire(RESUME, props).valeurs)
export const ecrireStyleResume = (s: StyleResume): Props => ecrire(RESUME, s as Valeurs)
