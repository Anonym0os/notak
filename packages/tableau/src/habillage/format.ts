/**
 * Un habillage : le thème d'une instance ou d'une personne (couleurs, arrondis, polices, présentations, cartes), écrit
 * dans un fichier JSON qu'on importe ou qu'un serveur fournit (docs/HABILLAGES.md). Il se pose par-dessus le mode
 * clair ou sombre, qui reste un réglage à part.
 *
 * ```json
 * { "notak": "habillage", "version": 1, "id": "silak", "nom": "Silak",
 *   "couleurs": { "clair": { "fond": "#f5f2ee", … }, "sombre": { … } },
 *   "rayons": { "carte": 10, "controle": 10, "panneau": 20 },
 *   "polices": { "texte": ["Inter", "system-ui"], "titre": [ … ], "code": [ … ] },
 *   "fontes": [{ "famille": "Familjen Grotesk", "source": "https://…", "graisse": "400 700" }],
 *   "pitch": { "fond": "…", "texte": "…" },
 *   "carte": { "palette": [ … ] } }
 * ```
 *
 * Tout ce qu'il porte finit dans une feuille de style : chaque valeur passe par une liste blanche, et une seule valeur
 * mal formée fait refuser le fichier entier, en disant laquelle. Une clé inconnue (venue d'une version plus récente)
 * est ignorée.
 */

export const FORMAT_HABILLAGE = 1
/** L'habillage d'origine : il ne s'écrit nulle part, c'est l'absence d'habillage. */
export const HABILLAGE_NOTAK = 'notak'
/** Un fichier plus lourd est refusé avant d'être lu : les fontes embarquées comprises, un thème tient en bien moins. */
export const POIDS_HABILLAGE_MAX = 1.5 * 1024 * 1024

/** Les rôles de couleur qu'un habillage peut repeindre, dans chaque mode. */
export const ROLES_COULEUR = ['fond', 'point', 'carte', 'texte', 'accent', 'selection'] as const
export type RoleCouleur = (typeof ROLES_COULEUR)[number]
export type CouleursHabillage = Partial<Record<RoleCouleur, string>>

export const ROLES_RAYON = ['carte', 'controle', 'panneau'] as const
export type RoleRayon = (typeof ROLES_RAYON)[number]
/** Un rayon au-delà ne dessine plus un coin mais une pastille : ce n'est plus un thème, c'est une autre interface. */
export const RAYON_MAX = 48

export const ROLES_POLICE = ['texte', 'titre', 'code'] as const
export type RolePolice = (typeof ROLES_POLICE)[number]

export interface FonteHabillage {
  famille: string
  /** Une adresse `https:` ou une fonte embarquée `data:font/…;base64,…`. */
  source: string
  /** `400`, ou une plage `400 700` pour une fonte variable. */
  graisse?: string
  style?: 'normal' | 'italic'
}

/** Ce qu'un habillage dit des diapositives du Pitch ; le reste vient du thème clair ou sombre le plus proche. */
export interface PitchHabillage {
  fond: string
  texte: string
  surbrillance?: string
  police?: string[]
  policeTitre?: string[]
  graisse?: number
  graisseTitre?: number
}

/** Ce qu'un habillage dit des cartes mentales : une palette de branches, et au besoin le fond et l'encre. */
export interface CarteHabillage {
  palette: string[]
  fond?: string
  encre?: string
}

export interface Habillage {
  id: string
  nom: string
  auteur?: string
  couleurs?: { clair?: CouleursHabillage; sombre?: CouleursHabillage }
  rayons?: Partial<Record<RoleRayon, number>>
  polices?: Partial<Record<RolePolice, string[]>>
  fontes?: FonteHabillage[]
  pitch?: PitchHabillage
  carte?: CarteHabillage
}

export type RaisonRefus = 'json' | 'poids' | 'format' | 'version' | 'valeur'

/** Un fichier refusé : `raison` dit pourquoi, `champ` dit où quand c'est une valeur (`couleurs.clair.fond`). */
export class ErreurHabillage extends Error {
  constructor(
    readonly raison: RaisonRefus,
    readonly champ?: string,
  ) {
    super(champ ? `${raison} : ${champ}` : raison)
  }
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
// Ni guillemet, ni parenthèse, ni point-virgule, ni accolade entre les parenthèses : rien qui sorte de la valeur.
const FONCTION = /^(?:rgb|rgba|hsl|hsla|oklch|oklab)\([0-9a-z.%\s,/+-]{1,80}\)$/i
const FAMILLE = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,62}$/
const HTTPS = /^https:\/\/[^\s"'()\\<>]{1,2000}$/
const DATA = /^data:font\/(?:woff2|woff|ttf|otf);base64,[A-Za-z0-9+/]+=*$/
const GRAISSE = /^[1-9]00(?: [1-9]00)?$/

export const estCouleur = (v: unknown): v is string => typeof v === 'string' && (HEX.test(v) || FONCTION.test(v))

/** Lit un habillage déjà décodé du JSON ; lève une `ErreurHabillage` si ce n'en est pas un, ou s'il est mal formé. */
export function lireHabillage(brut: unknown): Habillage {
  if (!estObjet(brut) || brut.notak !== 'habillage') throw new ErreurHabillage('format')
  if (typeof brut.version !== 'number' || brut.version > FORMAT_HABILLAGE) throw new ErreurHabillage('version')
  const refus = (champ: string): never => {
    throw new ErreurHabillage('valeur', champ)
  }
  if (typeof brut.id !== 'string' || !ID.test(brut.id) || brut.id === HABILLAGE_NOTAK) refus('id')
  const nom = typeof brut.nom === 'string' ? brut.nom.trim() : ''
  if (!nom || nom.length > 60) refus('nom')
  const h: Habillage = { id: brut.id as string, nom }
  if (brut.auteur !== undefined) {
    if (typeof brut.auteur !== 'string' || brut.auteur.length > 120) refus('auteur')
    h.auteur = brut.auteur as string
  }

  const couleur = (v: unknown, champ: string) => (estCouleur(v) ? v : refus(champ))
  const polices = (v: unknown, champ: string): string[] => {
    if (!Array.isArray(v) || v.length === 0 || v.length > 8) return refus(champ)
    return v.map((f, i) => (typeof f === 'string' && FAMILLE.test(f) ? f : refus(`${champ}.${i}`)))
  }
  const section = (v: unknown, champ: string) => (estObjet(v) ? v : refus(champ))

  if (brut.couleurs !== undefined) {
    const c = section(brut.couleurs, 'couleurs')
    h.couleurs = {}
    for (const mode of ['clair', 'sombre'] as const) {
      if (c[mode] === undefined) continue
      const m = section(c[mode], `couleurs.${mode}`)
      const lues: CouleursHabillage = {}
      for (const role of ROLES_COULEUR) if (m[role] !== undefined) lues[role] = couleur(m[role], `couleurs.${mode}.${role}`)
      h.couleurs[mode] = lues
    }
  }

  if (brut.rayons !== undefined) {
    const r = section(brut.rayons, 'rayons')
    h.rayons = {}
    for (const role of ROLES_RAYON) {
      const v = r[role]
      if (v === undefined) continue
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > RAYON_MAX) refus(`rayons.${role}`)
      h.rayons[role] = Math.round((v as number) * 10) / 10
    }
  }

  if (brut.polices !== undefined) {
    const p = section(brut.polices, 'polices')
    h.polices = {}
    for (const role of ROLES_POLICE) if (p[role] !== undefined) h.polices[role] = polices(p[role], `polices.${role}`)
  }

  if (brut.fontes !== undefined) {
    if (!Array.isArray(brut.fontes) || brut.fontes.length > 16) refus('fontes')
    h.fontes = (brut.fontes as unknown[]).map((f, i) => {
      const champ = `fontes.${i}`
      const o = section(f, champ)
      if (typeof o.famille !== 'string' || !FAMILLE.test(o.famille)) refus(`${champ}.famille`)
      if (typeof o.source !== 'string' || !(HTTPS.test(o.source) || DATA.test(o.source))) refus(`${champ}.source`)
      if (o.graisse !== undefined && (typeof o.graisse !== 'string' || !GRAISSE.test(o.graisse))) refus(`${champ}.graisse`)
      if (o.style !== undefined && o.style !== 'normal' && o.style !== 'italic') refus(`${champ}.style`)
      return {
        famille: o.famille as string,
        source: o.source as string,
        ...(o.graisse ? { graisse: o.graisse as string } : {}),
        ...(o.style ? { style: o.style as 'normal' | 'italic' } : {}),
      }
    })
  }

  if (brut.pitch !== undefined) {
    const p = section(brut.pitch, 'pitch')
    const pitch: PitchHabillage = { fond: couleur(p.fond, 'pitch.fond'), texte: couleur(p.texte, 'pitch.texte') }
    if (p.surbrillance !== undefined) pitch.surbrillance = couleur(p.surbrillance, 'pitch.surbrillance')
    if (p.police !== undefined) pitch.police = polices(p.police, 'pitch.police')
    if (p.policeTitre !== undefined) pitch.policeTitre = polices(p.policeTitre, 'pitch.policeTitre')
    for (const cle of ['graisse', 'graisseTitre'] as const) {
      const v = p[cle]
      if (v === undefined) continue
      if (typeof v !== 'number' || !GRAISSE.test(String(v))) refus(`pitch.${cle}`)
      pitch[cle] = v as number
    }
    h.pitch = pitch
  }

  if (brut.carte !== undefined) {
    const c = section(brut.carte, 'carte')
    if (!Array.isArray(c.palette) || c.palette.length < 2 || c.palette.length > 12) refus('carte.palette')
    const carte: CarteHabillage = { palette: (c.palette as unknown[]).map((v, i) => couleur(v, `carte.palette.${i}`)) }
    if (c.fond !== undefined) carte.fond = couleur(c.fond, 'carte.fond')
    if (c.encre !== undefined) carte.encre = couleur(c.encre, 'carte.encre')
    h.carte = carte
  }
  return h
}

/** Lit le texte d'un fichier d'habillage : le poids, puis le JSON, puis le contenu. */
export function lireHabillageTexte(texte: string): Habillage {
  if (texte.length > POIDS_HABILLAGE_MAX) throw new ErreurHabillage('poids')
  let brut: unknown
  try {
    brut = JSON.parse(texte)
  } catch {
    throw new ErreurHabillage('json')
  }
  return lireHabillage(brut)
}

/** Les mots-clés génériques d'une pile de polices : ils s'écrivent sans guillemets, sinon ils désigneraient une famille. */
const GENERIQUES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji'])

/** Une pile de polices telle qu'elle s'écrit dans `font-family`. */
export const pileCss = (familles: readonly string[]) => familles.map((f) => (GENERIQUES.has(f) ? f : `"${f}"`)).join(', ')
