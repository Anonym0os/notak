import * as Y from 'yjs'
import { NOM_ARBRES, toutLire } from '../coeur/arbresYjs.ts'
import { aplatir, deplier } from '../blocs/migration.ts'

// Ce que le serveur sait lire d'un tableau, sans la toile : le document Yjs, ses éléments et leur texte.
// Les types restent à la mesure de ce dont le serveur a besoin ; la toile (React) ne se charge jamais ici.

/** Un nœud de texte riche, au format JSON de Tiptap. */
export interface NoeudTexte {
  type: string
  attrs?: Record<string, unknown>
  content?: NoeudTexte[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

export interface ContenuLu {
  type: string
  [champ: string]: unknown
}

export interface ElementLu {
  id: string
  x: number
  y: number
  largeur: number
  contenu: ContenuLu
  parent?: string
  ordre?: string
  corbeille?: number
  nonTrie?: number
  /** Ce que tout élément peut porter ; la publication ne montre pas les trois derniers. */
  etiquettes?: string[]
  echeance?: string
  commentaire?: unknown
  reactions?: unknown
  assigne?: unknown
}

export interface TableauLu {
  titre: string
  couleur?: string
  /** Les étiquettes du tableau et son arrière-plan, tels que `meta` les garde : seul le format `.notak` les reprend. */
  etiquettes?: unknown[]
  fond?: unknown
  /** Elle se montre en dossier dans la bibliothèque (`Tableau.dossier`). */
  dossier?: boolean
  /** Du plus bas au plus haut dans l'empilement. */
  elements: ElementLu[]
}

/** Le tableau d'un document Yjs, sans le plan d'empilement : ce que lit l'export, la recherche, la publication. */
export function lireTableau(doc: Y.Doc): TableauLu {
  const meta = doc.getMap<unknown>('meta')
  const brutes: { plan: string; id: string; element: ElementLu }[] = []
  // Les sujets des cartes mentales vivent à part, dans `arbres` (coeur/arbresYjs.ts) : on les rend à leur carte.
  const arbres = toutLire(doc.getMap<unknown>(NOM_ARBRES))
  doc.getMap<Record<string, unknown>>('elements').forEach((brut, id) => {
    // Un client a pu écrire n'importe quoi : seul un objet est un élément.
    if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) return
    const { plan, ...element } = brut
    if (!element.contenu || typeof (element.contenu as ContenuLu).type !== 'string') return
    const dicos = (element.contenu as ContenuLu).type === 'arbre' ? arbres.get(id) : undefined
    if (dicos) element.contenu = { ...(element.contenu as ContenuLu), ...dicos }
    brutes.push({ plan: typeof plan === 'string' ? plan : '', id, element: { ...(element as unknown as ElementLu), id } })
  })
  brutes.sort((a, b) => (a.plan < b.plan ? -1 : a.plan > b.plan ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const titre = meta.get('titre')
  const couleur = meta.get('couleur')
  const etiquettes = meta.get('etiquettes')
  const fond = meta.get('fond')
  return {
    titre: typeof titre === 'string' ? titre : '',
    ...(typeof couleur === 'string' ? { couleur } : {}),
    ...(Array.isArray(etiquettes) && etiquettes.length > 0 ? { etiquettes } : {}),
    ...(fond !== undefined && fond !== null ? { fond } : {}),
    ...(meta.get('dossier') === true ? { dossier: true } : {}),
    elements: brutes.map((b) => b.element),
  }
}

/** Le tableau d'un état Yjs enregistré. */
export function lireEtat(etat: Uint8Array): TableauLu {
  const doc = new Y.Doc()
  try {
    Y.applyUpdate(doc, etat)
    return lireTableau(doc)
  } finally {
    doc.destroy()
  }
}

/** Le texte d'un document, sans mise en forme : un bloc par ligne. */
export function texteBrut(n: NoeudTexte): string {
  if (n.text !== undefined) return n.text
  return (n.content ?? []).map(texteBrut).filter((t) => t !== '').join('\n')
}

const chaine = (v: unknown): string => (typeof v === 'string' ? v : '')
const doc = (v: unknown): NoeudTexte | null => (v && typeof v === 'object' ? (v as NoeudTexte) : null)

/** Le texte d'un document, dans l'écriture imbriquée que lisent les exports (docs/NOTION.md § 1). */
const imbrique = (v: unknown): NoeudTexte | null => {
  const d = doc(v)
  return d ? deplier(aplatir(d)) : null
}

/** Tout le texte qu'on peut chercher dans un élément (comme la recherche de la toile). */
export function texteCherchable(e: ElementLu, titreDe: (id: string) => string | undefined): string {
  const c = e.contenu
  const apercu = (c.apercu ?? {}) as Record<string, unknown>
  switch (c.type) {
    case 'note': {
      const d = doc(c.texte)
      return d ? texteBrut(d) : ''
    }
    case 'taches': {
      const d = doc(c.texte)
      return [chaine(c.titre), d ? texteBrut(d) : ''].join('\n')
    }
    case 'lien':
      return [c.titre, c.legende, apercu.titre, apercu.description, c.url].map(chaine).filter(Boolean).join('\n')
    case 'colonne':
      return chaine(c.titre)
    case 'tableau':
      return titreDe(chaine(c.cible)) ?? chaine(c.titre)
    case 'image':
      return chaine(c.legende)
    case 'fichier':
      return [c.titre, c.nom].map(chaine).filter(Boolean).join('\n')
    case 'ligne':
      return chaine(c.libelle)
    case 'document': {
      const d = imbrique(c.texte)
      return [chaine(c.titre), d ? texteBrut(d) : ''].join('\n')
    }
    case 'arbre':
      return Object.values((c.sujets ?? {}) as Record<string, { titre?: unknown; etiquettes?: unknown; note?: unknown }>)
        .flatMap((x) => [chaine(x?.titre), ...(Array.isArray(x?.etiquettes) ? x.etiquettes.map(chaine) : []), doc(x?.note) ? texteBrut(doc(x?.note)!) : ''])
        .filter(Boolean)
        .join('\n')
    case 'commentaire':
      return ((c.messages as { auteur?: { nom?: string }; texte?: string }[] | undefined) ?? [])
        .map((m) => `${chaine(m.auteur?.nom)}\n${chaine(m.texte)}`)
        .join('\n')
    default:
      return ''
  }
}

/** Les fichiers (images, pièces jointes) que portent ces éléments, avec le nom qu'on leur donnerait. */
export function fichiersDe(elements: readonly ElementLu[]): { id: string; nom: string; type: string }[] {
  const sortie: { id: string; nom: string; type: string }[] = []
  for (const e of elements) {
    if (e.corbeille !== undefined) continue
    const c = e.contenu
    if (c.type === 'image' && chaine(c.fichier)) {
      sortie.push({ id: chaine(c.fichier), nom: chaine(c.legende), type: chaine(c.typeMime) })
    } else if (c.type === 'fichier' && chaine(c.fichier)) {
      sortie.push({ id: chaine(c.fichier), nom: chaine(c.titre) || chaine(c.nom), type: chaine(c.typeMime) })
    }
  }
  return sortie
}

/** Tous les identifiants de fichier qu'un tableau montre, y compris les copies réduites d'une image et son original d'avant détourage. */
export function idsDeFichiers(elements: readonly ElementLu[]): Set<string> {
  const ids = new Set<string>()
  for (const e of elements) {
    if (e.corbeille !== undefined) continue
    const c = e.contenu
    if ((c.type === 'image' || c.type === 'fichier') && chaine(c.fichier)) ids.add(chaine(c.fichier))
    // L'image qu'on a donnée à un lien comme aperçu.
    const apercu = c.type === 'lien' ? (c.image as { fichier?: unknown } | undefined) : undefined
    if (apercu && chaine(apercu.fichier)) ids.add(chaine(apercu.fichier))
    // La couverture d'une carte de toile.
    if (c.type === 'tableau' && chaine(c.image)) ids.add(chaine(c.image))
    if (c.type === 'image' && Array.isArray(c.tailles)) {
      for (const t of c.tailles as { fichier?: unknown }[]) if (chaine(t?.fichier)) ids.add(chaine(t.fichier))
    }
    // « Rétablir l'original » le remontre : il doit rester servi.
    const o = c.type === 'image' ? (c.original as { fichier?: unknown; tailles?: unknown } | undefined) : undefined
    if (o && chaine(o.fichier)) ids.add(chaine(o.fichier))
    if (o && Array.isArray(o.tailles)) {
      for (const t of o.tailles as { fichier?: unknown }[]) if (chaine(t?.fichier)) ids.add(chaine(t.fichier))
    }
  }
  return ids
}

/**
 * Ce que la bibliothèque sait d'une toile, et de chaque carte mentale, page, photo, lien et fichier qu'elle porte : de
 * quoi dessiner sa vignette. `cree` : l'instant où l'élément est né, quand son identifiant le dit (`dateDeLId`).
 */
export type ResumeContenu =
  | {
      genre: 'toile'
      element: ''
      titre: string
      couleur?: string
      /** Elle se montre en dossier : la bibliothèque l'ouvre en liste de ce qu'elle porte. */
      dossier?: true
      /**
       * Le plan : chaque élément posé, en UG, avec sa couleur (une clé de la palette des notes, ou rien), son type, et
       * le nombre de lignes à y dessiner (le texte d'une note ou d'une liste, les cartes d'une colonne).
       */
      boites: BoitePlan[]
      /** Ce qui attend dans ses non triés : une toile sans rien de posé n'est pas vide pour autant. */
      nonTries?: number
      /**
       * Les toiles dont elle porte la carte (pas un raccourci), et celles dont elle a jeté la carte à sa corbeille :
       * ce qui dit dans quel dossier est une toile, et qu'elle est à la corbeille.
       */
      cartes?: string[]
      jetees?: string[]
    }
  | { genre: 'arbre'; element: string; titre: string; branches: string[]; cree?: number }
  | { genre: 'document'; element: string; titre: string; lignes: string[]; cree?: number }
  | ({
      genre: 'image'
      element: string
      /** Sa légende : vide, la bibliothèque dit « Photo ». */
      titre: string
      fichier: string
      /** Sa plus petite copie (environ 400 px de large) : la vignette ne charge pas l'image entière. */
      petite?: string
      /** Largeur sur hauteur du cadre libre qu'elle recouvre sur la toile (un redimensionnement avec Cmd). */
      rapportCadre?: number
      cree?: number
    } & PhotoMontree)
  | {
      genre: 'lien'
      element: string
      /** Le titre qu'on lui a donné, sinon celui de la page. */
      titre: string
      url: string
      site?: string
      description?: string
      /** L'image d'aperçu choisie à la main (un fichier du tableau), sinon celle de la page (une adresse). */
      fichierImage?: string
      image?: string
      favicon?: string
      cree?: number
    }
  | { genre: 'fichier'; element: string; titre: string; fichier: string; nom: string; typeMime: string; taille: number; cree?: number }

/** L'alphabet de `nouvelId` (coeur/tableau.ts), que le serveur ne charge pas. */
const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * L'instant de création qu'un identifiant de `nouvelId` porte dans ses dix premiers signes, en ms. Rien pour un
 * autre identifiant (celui d'un modèle, `crypto.randomUUID`), ni pour une date improbable.
 */
export function dateDeLId(id: string): number | undefined {
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) return undefined
  let t = 0
  for (const c of id.slice(0, 10)) t = t * 32 + BASE32.indexOf(c)
  return t > Date.UTC(2020, 0, 1) && t < Date.UTC(2100, 0, 1) ? t : undefined
}

/**
 * Ce que la toile fait d'une photo (`miseEnPage`, elements/image/geometrie.ts) : la partie gardée, en fractions de
 * l'image d'origine (`largeur` × `hauteur` pixels), puis son quart de tour et les miroirs de l'écran. Sans eux,
 * l'image entière, droite.
 */
export interface PhotoMontree {
  largeur: number
  hauteur: number
  recadrage?: { x: number; y: number; largeur: number; hauteur: number }
  rotation?: 90 | 180 | 270
  miroirH?: true
  miroirV?: true
}

/**
 * Une boîte du plan d'une toile (voir `ResumeContenu`) ; celle d'une photo porte aussi son fichier (sa plus petite
 * copie, s'il en a une), et, recadrée, tournée ou retournée, ce que la toile en fait : la vignette montre la photo
 * elle-même, comme la toile.
 */
export type BoitePlan = [x: number, y: number, largeur: number, hauteur: number, couleur: string, type: string, lignes: number, fichier?: string, photo?: PhotoMontree]

/** Au plus tant de boîtes dans le plan d'une toile, de branches d'une carte, de lignes d'un document. */
const BOITES_MAX = 120
const BRANCHES_MAX = 8
const LIGNES_MAX = 5
/** Au plus tant de photos, de liens et de fichiers par toile, chaque genre à part. */
const PIECES_MAX = 400

/** La hauteur par défaut de chaque type, en UG (celle de sa définition, que le serveur ne charge pas). */
const HAUTEURS: Record<string, number> = {
  note: 7,
  taches: 6,
  tableau: 14,
  arbre: 20,
  document: 12,
  table: 25,
  croquis: 21,
  nuancier: 12,
  lien: 7,
  fichier: 8,
  clone: 8,
  lieu: 9,
  commentaire: 7,
}

/**
 * La hauteur probable d'un élément, en UG, sans la toile pour le mesurer : celle qu'il garde, celle de son image, ou
 * pour une note, de quoi tenir son texte (une ligne d'environ 1,4 caractère par UG, 2,6 UG de haut).
 */
function hauteurProbable(e: ElementLu, lignes: number): number {
  const c = e.contenu
  const h = (e as { hauteur?: { max?: number; min?: number } }).hauteur
  const rapport = rapportAffiche(c)
  if (rapport !== null) return e.largeur / rapport
  if (typeof h?.max === 'number') return h.max
  if (typeof h?.min === 'number') return h.min
  if (c.type === 'note' || c.type === 'taches') return Math.min(40, Math.max(HAUTEURS[c.type]!, 2 + lignes * 2.6))
  if (c.type === 'colonne') return Math.min(80, 6 + lignes * 9)
  return HAUTEURS[c.type] ?? 6
}

const positif = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

/**
 * Largeur sur hauteur d'une photo ou d'un dessin tels que la toile les montre : le cadre libre d'une photo, sinon sa
 * partie gardée, couchée d'un quart de tour ; `null` pour un autre élément, ou sans proportions connues.
 */
function rapportAffiche(c: ContenuLu): number | null {
  if (c.type !== 'image' && c.type !== 'dessin') return null
  const [lo, ho] = [positif(c.largeurOrigine), positif(c.hauteurOrigine)]
  if (lo === null || ho === null) return null
  if (c.type === 'dessin') return lo / ho
  const cadre = positif(c.rapportCadre)
  if (cadre !== null) return cadre
  const r = (c.recadrage ?? {}) as { largeur?: unknown; hauteur?: unknown }
  const p = (lo * (positif(r.largeur) ?? 1)) / (ho * (positif(r.hauteur) ?? 1))
  return c.rotation === 90 || c.rotation === 270 ? 1 / p : p
}

/** Une part de l'image (un côté du recadrage : plus que rien), ou une position dans l'image : entre 0 et 1. */
const fraction = (v: unknown, cote: boolean): v is number => typeof v === 'number' && (cote ? v > 0 : v >= 0) && v <= 1

/**
 * Ce que la toile fait d'une photo (voir `PhotoMontree`), lu dans son contenu ; un recadrage qu'un autre client aurait
 * écrit de travers est laissé de côté : la photo se montre alors entière.
 */
function photoMontree(c: ContenuLu, largeur: number, hauteur: number): PhotoMontree {
  const r = (c.recadrage ?? {}) as Record<string, unknown>
  const garde = fraction(r.x, false) && fraction(r.y, false) && fraction(r.largeur, true) && fraction(r.hauteur, true)
  const rotation = c.rotation === 90 || c.rotation === 180 || c.rotation === 270 ? c.rotation : undefined
  return {
    largeur,
    hauteur,
    ...(garde ? { recadrage: { x: r.x as number, y: r.y as number, largeur: r.largeur as number, hauteur: r.hauteur as number } } : {}),
    ...(rotation ? { rotation } : {}),
    ...(c.miroirH === true ? { miroirH: true as const } : {}),
    ...(c.miroirV === true ? { miroirV: true as const } : {}),
  }
}

/** La plus petite copie d'une photo, ou rien : la bibliothèque ne charge pas l'image entière quand elle peut l'éviter. */
function petiteCopie(c: ContenuLu): string | undefined {
  const tailles = (Array.isArray(c.tailles) ? (c.tailles as { largeur?: unknown; fichier?: unknown }[]) : []).filter(
    (x) => typeof x?.largeur === 'number' && chaine(x.fichier),
  ) as { largeur: number; fichier: string }[]
  return tailles.sort((a, b) => a.largeur - b.largeur)[0]?.fichier
}

/** Les lignes de texte d'une note ou d'une liste, à la largeur de sa carte (environ 1,4 caractère par UG). */
function lignesDeTexte(e: ElementLu): number {
  const d = doc(e.contenu.texte)
  const parLigne = Math.max(8, e.largeur * 1.4)
  return (d ? texteBrut(d) : '').split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / parLigne)), 0)
}

const court = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Ce que la bibliothèque montre d'une photo, d'un lien ou d'un fichier ; rien pour un autre élément. */
function resumePiece(e: ElementLu, cree: { cree?: number }): ResumeContenu | null {
  const c = e.contenu
  if (c.type === 'image' && chaine(c.fichier)) {
    const petite = petiteCopie(c)
    const [largeur, hauteur] = [c.largeurOrigine, c.hauteurOrigine].map((v) => (typeof v === 'number' && v > 0 ? v : 1)) as [number, number]
    const cadre = positif(c.rapportCadre)
    return {
      genre: 'image',
      element: e.id,
      titre: court(chaine(c.legende).trim(), 200),
      fichier: chaine(c.fichier),
      ...(petite ? { petite } : {}),
      ...photoMontree(c, largeur, hauteur),
      ...(cadre !== null ? { rapportCadre: cadre } : {}),
      ...cree,
    }
  }
  if (c.type === 'lien' && chaine(c.url)) {
    const apercu = (c.apercu ?? {}) as Record<string, unknown>
    const choisie = chaine((c.image as { fichier?: unknown } | undefined)?.fichier)
    // Une adresse qui mène à une image est son propre aperçu.
    const image = apercu.estImage === true ? chaine(c.url) : chaine(apercu.image)
    const description = court((chaine(c.legende) || chaine(apercu.description)).trim(), 200)
    return {
      genre: 'lien',
      element: e.id,
      titre: court((chaine(c.titre) || chaine(apercu.titre)).trim(), 200),
      url: chaine(c.url),
      ...(chaine(apercu.site) ? { site: chaine(apercu.site) } : {}),
      ...(description ? { description } : {}),
      ...(choisie ? { fichierImage: choisie } : image ? { image } : {}),
      ...(chaine(apercu.favicon) ? { favicon: chaine(apercu.favicon) } : {}),
      ...cree,
    }
  }
  if (c.type === 'fichier' && chaine(c.fichier)) {
    const nom = chaine(c.nom)
    return {
      genre: 'fichier',
      element: e.id,
      titre: court((chaine(c.titre) || nom).trim(), 200),
      fichier: chaine(c.fichier),
      nom,
      typeMime: chaine(c.typeMime),
      taille: typeof c.taille === 'number' ? c.taille : 0,
      ...cree,
    }
  }
  return null
}

/**
 * La toile elle-même, puis chaque carte mentale, page, photo, lien et fichier qu'elle porte, hors corbeille (rangés
 * dans une colonne ou dans les non triés compris) : ce que la bibliothèque montre d'elle. Les lignes, et ce qui est
 * rangé dans une colonne, n'entrent pas dans le plan.
 */
export function resumesDuTableau(t: TableauLu): ResumeContenu[] {
  const vivants = t.elements.filter((e) => e.corbeille === undefined)
  const enfants = new Map<string, number>()
  for (const e of vivants) if (e.parent) enfants.set(e.parent, (enfants.get(e.parent) ?? 0) + 1)
  const boites: BoitePlan[] = vivants
    .filter((e) => !e.parent && e.nonTrie === undefined && e.contenu.type !== 'ligne')
    .slice(0, BOITES_MAX)
    .map((e): BoitePlan => {
      const c = e.contenu
      const lignes = c.type === 'note' || c.type === 'taches' ? lignesDeTexte(e) : c.type === 'colonne' ? (enfants.get(e.id) ?? 0) : 0
      const [x, y, l, h] = [Math.round(e.x), Math.round(e.y), Math.max(1, Math.round(e.largeur)), Math.max(1, Math.round(hauteurProbable(e, lignes)))]
      // Une toile de photos se reconnaît à ses photos, pas à des cadres gris.
      const fichier = c.type === 'image' ? (petiteCopie(c) ?? chaine(c.fichier)) : ''
      if (!fichier) return [x, y, l, h, chaine(c.couleur), c.type, lignes]
      // Droite et entière, elle recouvre sa boîte comme sur la toile ; sinon, la vignette doit savoir ce qu'elle en garde.
      const photo = photoMontree(c, positif(c.largeurOrigine) ?? 1, positif(c.hauteurOrigine) ?? 1)
      const faite = photo.recadrage || photo.rotation || photo.miroirH || photo.miroirV
      return faite ? [x, y, l, h, chaine(c.couleur), c.type, lignes, fichier, photo] : [x, y, l, h, chaine(c.couleur), c.type, lignes, fichier]
    })
  const nonTries = vivants.filter((e) => !e.parent && e.nonTrie !== undefined).length
  const cartesDe = (jetee: boolean) => [
    ...new Set(
      t.elements.flatMap((e) =>
        e.contenu.type === 'tableau' && !e.contenu.raccourci && typeof e.contenu.cible === 'string' && (e.corbeille !== undefined) === jetee ? [e.contenu.cible] : [],
      ),
    ),
  ]
  const [cartes, jetees] = [cartesDe(false), cartesDe(true)]
  const resumes: ResumeContenu[] = [
    {
      genre: 'toile',
      element: '',
      titre: t.titre,
      ...(t.couleur ? { couleur: t.couleur } : {}),
      ...(t.dossier ? { dossier: true as const } : {}),
      boites,
      ...(nonTries ? { nonTries } : {}),
      ...(cartes.length ? { cartes } : {}),
      ...(jetees.length ? { jetees } : {}),
    },
  ]
  const pieces = new Map<string, number>()
  for (const e of vivants) {
    const c = e.contenu
    const ne = dateDeLId(e.id)
    const cree = ne === undefined ? {} : { cree: ne }
    if (c.type === 'image' || c.type === 'lien' || c.type === 'fichier') {
      const n = pieces.get(c.type) ?? 0
      const r = n < PIECES_MAX ? resumePiece(e, cree) : null
      if (r) {
        pieces.set(c.type, n + 1)
        resumes.push(r)
      }
    } else if (c.type === 'arbre') {
      const sujets = Object.entries((c.sujets ?? {}) as Record<string, { parent?: unknown; ordre?: unknown; titre?: unknown; genre?: unknown }>)
      const parOrdre = (a: [string, { ordre?: unknown }], b: [string, { ordre?: unknown }]) => {
        const [x, y] = [chaine(a[1].ordre), chaine(b[1].ordre)]
        return x < y ? -1 : x > y ? 1 : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
      }
      const central = sujets.filter(([, s]) => s.parent === undefined && s.genre === undefined).sort(parOrdre)[0]
      const branches = central
        ? sujets
            .filter(([, s]) => s.parent === central[0] && s.genre === undefined)
            .sort(parOrdre)
            .slice(0, BRANCHES_MAX)
            .map(([, s]) => court(chaine(s.titre).trim(), 40))
        : []
      resumes.push({ genre: 'arbre', element: e.id, titre: central ? chaine(central[1].titre).trim() : '', branches, ...cree })
    } else if (c.type === 'document') {
      const d = imbrique(c.texte)
      const lignes = (d ? texteBrut(d) : '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, LIGNES_MAX)
        .map((l) => court(l, 120))
      resumes.push({ genre: 'document', element: e.id, titre: chaine(c.titre).trim(), lignes, ...cree })
    }
  }
  return resumes
}
