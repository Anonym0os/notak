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

/** Ce que la bibliothèque sait d'une toile, d'une carte mentale ou d'un document, de quoi dessiner sa vignette. */
export type ResumeContenu =
  | {
      genre: 'toile'
      element: ''
      titre: string
      couleur?: string
      /**
       * Le plan : chaque élément posé, en UG, avec sa couleur (une clé de la palette des notes, ou rien), son type, et
       * le nombre de lignes à y dessiner (le texte d'une note ou d'une liste, les cartes d'une colonne).
       */
      boites: BoitePlan[]
    }
  | { genre: 'arbre'; element: string; titre: string; branches: string[] }
  | { genre: 'document'; element: string; titre: string; lignes: string[] }

/** Une boîte du plan d'une toile (voir `ResumeContenu`). */
export type BoitePlan = [x: number, y: number, largeur: number, hauteur: number, couleur: string, type: string, lignes: number]

/** Au plus tant de boîtes dans le plan d'une toile, de branches d'une carte, de lignes d'un document. */
const BOITES_MAX = 120
const BRANCHES_MAX = 8
const LIGNES_MAX = 5

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
  if (c.type === 'image' && typeof c.largeurOrigine === 'number' && typeof c.hauteurOrigine === 'number' && c.largeurOrigine > 0)
    return (e.largeur * c.hauteurOrigine) / c.largeurOrigine
  if (typeof h?.max === 'number') return h.max
  if (typeof h?.min === 'number') return h.min
  if (c.type === 'note' || c.type === 'taches') return Math.min(40, Math.max(HAUTEURS[c.type]!, 2 + lignes * 2.6))
  if (c.type === 'colonne') return Math.min(80, 6 + lignes * 9)
  return HAUTEURS[c.type] ?? 6
}

/** Les lignes de texte d'une note ou d'une liste, à la largeur de sa carte (environ 1,4 caractère par UG). */
function lignesDeTexte(e: ElementLu): number {
  const d = doc(e.contenu.texte)
  const parLigne = Math.max(8, e.largeur * 1.4)
  return (d ? texteBrut(d) : '').split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / parLigne)), 0)
}

const court = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/**
 * La toile elle-même, puis chaque carte mentale et chaque document qu'elle porte, hors corbeille : ce que la
 * bibliothèque montre d'elle. Les lignes, et ce qui est rangé dans une colonne, n'entrent pas dans le plan.
 */
export function resumesDuTableau(t: TableauLu): ResumeContenu[] {
  const vivants = t.elements.filter((e) => e.corbeille === undefined)
  const enfants = new Map<string, number>()
  for (const e of vivants) if (e.parent) enfants.set(e.parent, (enfants.get(e.parent) ?? 0) + 1)
  const boites: BoitePlan[] = vivants
    .filter((e) => !e.parent && e.nonTrie === undefined && e.contenu.type !== 'ligne')
    .slice(0, BOITES_MAX)
    .map((e) => {
      const c = e.contenu
      const lignes = c.type === 'note' || c.type === 'taches' ? lignesDeTexte(e) : c.type === 'colonne' ? (enfants.get(e.id) ?? 0) : 0
      return [Math.round(e.x), Math.round(e.y), Math.max(1, Math.round(e.largeur)), Math.max(1, Math.round(hauteurProbable(e, lignes))), chaine(c.couleur), c.type, lignes]
    })
  const resumes: ResumeContenu[] = [{ genre: 'toile', element: '', titre: t.titre, ...(t.couleur ? { couleur: t.couleur } : {}), boites }]
  for (const e of vivants) {
    const c = e.contenu
    if (c.type === 'arbre') {
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
      resumes.push({ genre: 'arbre', element: e.id, titre: central ? chaine(central[1].titre).trim() : '', branches })
    } else if (c.type === 'document') {
      const d = imbrique(c.texte)
      const lignes = (d ? texteBrut(d) : '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, LIGNES_MAX)
        .map((l) => court(l, 120))
      resumes.push({ genre: 'document', element: e.id, titre: chaine(c.titre).trim(), lignes })
    }
  }
  return resumes
}
