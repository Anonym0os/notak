import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { cleEntre } from '../../coeur/ordre'
import { type Arbre, type GroupeMarqueurs, type Id, type Limite, type NoeudTexte, type Relation, type Resume, type StructureArbre, type Sujet, type Zone, docDepuisTexte, nouvelId, texteBrut } from '../../coeur/tableau'
import { type Lecture, enfantsDe, lire } from './modele/sujets'
import { ajouterDiapo, extraireDiapo } from './xmindPitch'
import { ecrireStyleLimite, ecrireStyleRelation, ecrireStyleResume, ecrireStyleSujet, lireStyleLimite, lireStyleRelation, lireStyleResume, lireStyleSujet, proprietesDe } from './xmind-style'

/**
 * Le format `.xmind` (docs/XMIND.md § 7) : un zip, avec `content.json` (un tableau de feuilles), `metadata.json`,
 * `manifest.json` et les images sous `resources/`. Chaque feuille devient une carte de Notak, et l'inverse. Les
 * identifiants de sujet sont gardés tels quels ; ce que Notak ne lit pas d'un sujet va dans son sac `xmind` et ressort
 * à l'export, pour qu'un aller-retour n'abîme pas le fichier.
 */

type Json = Record<string, unknown>

const STRUCTURES: [string, StructureArbre][] = [
  ['org.xmind.ui.map.unbalanced', 'carte-libre'],
  ['org.xmind.ui.map.clockwise', 'carte-horaire'],
  ['org.xmind.ui.map.anticlockwise', 'carte-antihoraire'],
  ['org.xmind.ui.map', 'carte'],
  ['org.xmind.ui.logic.right', 'logique-droite'],
  ['org.xmind.ui.logic.left', 'logique-gauche'],
  ['org.xmind.ui.brace.right', 'accolade-droite'],
  ['org.xmind.ui.brace.left', 'accolade-gauche'],
  ['org.xmind.ui.org-chart.down', 'organigramme-bas'],
  ['org.xmind.ui.org-chart.up', 'organigramme-haut'],
  ['org.xmind.ui.tree.right', 'arbre-droite'],
  ['org.xmind.ui.tree.left', 'arbre-gauche'],
  ['org.xmind.ui.timeline.horizontal', 'chronologie-horizontale'],
  ['org.xmind.ui.timeline.vertical', 'chronologie-verticale'],
  ['org.xmind.ui.fishbone.leftHeaded', 'arete-gauche'],
  ['org.xmind.ui.fishbone.rightHeaded', 'arete-droite'],
  ['org.xmind.ui.spreadsheet.column', 'matrice-colonnes'],
  ['org.xmind.ui.spreadsheet', 'matrice-lignes'],
]

/** La structure Notak d'une `structureClass` : exacte, sinon la famille la plus proche (`logic-chart.right` → logique). */
export function structureDepuis(classe: unknown): StructureArbre | undefined {
  if (typeof classe !== 'string') return undefined
  const exacte = STRUCTURES.find(([x]) => x === classe)
  if (exacte) return exacte[1]
  const c = classe.toLowerCase()
  const gauche = c.includes('left')
  if (c.includes('treetable') || c.includes('grid')) return undefined
  if (c.includes('logic')) return gauche ? 'logique-gauche' : 'logique-droite'
  if (c.includes('brace')) return gauche ? 'accolade-gauche' : 'accolade-droite'
  if (c.includes('org-chart')) return c.includes('up') ? 'organigramme-haut' : 'organigramme-bas'
  if (c.includes('tree')) return gauche ? 'arbre-gauche' : 'arbre-droite'
  if (c.includes('timeline')) return c.includes('vertical') ? 'chronologie-verticale' : 'chronologie-horizontale'
  if (c.includes('fishbone')) return c.includes('right') ? 'arete-droite' : 'arete-gauche'
  if (c.includes('spreadsheet')) return c.includes('column') ? 'matrice-colonnes' : 'matrice-lignes'
  if (c.includes('map')) return 'carte'
  return undefined
}

const classeDepuis = (s: StructureArbre) => STRUCTURES.find(([, x]) => x === s)![0]

const MOTIFS: Record<string, NonNullable<Sujet['numerotation']>['motif']> = {
  'numeral-arabic': 'arabe',
  'numeral-roman': 'romain',
  'alphabet-uppercase': 'majuscule',
  'alphabet-lowercase': 'minuscule',
}
const CLASSES: Record<string, Sujet['classe']> = { importantTopic: 'important', minorTopic: 'secondaire', expiredTopic: 'barre' }

/** Les champs d'un sujet que Notak lit lui-même ; le reste part au sac. */
const LUS = new Set(['id', 'class', 'title', 'style', 'customWidth', 'structureClass', 'children', 'boundaries', 'summaries', 'notes', 'labels', 'href', 'markers', 'branch', 'position', 'image', 'extensions'])

/** Une image à poser sur un sujet après l'import : son octets, son nom dans le zip, sa taille. */
export interface ImageAImporter {
  sujet: Id
  octets: Uint8Array
  nom: string
  l: number
  h: number
}

/** Une pièce jointe (ou une note audio) à ranger dans les fichiers après l'import, puis à poser sur son sujet. */
export interface PieceAImporter {
  sujet: Id
  octets: Uint8Array
  nom: string
  type: string
  audio: boolean
}

/** L'image d'un marqueur à soi, à ranger dans les fichiers : le groupe et le marqueur qui la portent. */
export interface MarqueurAImporter {
  groupe: Id
  marqueur: Id
  octets: Uint8Array
  nom: string
}

export interface FeuilleLue {
  titre: string
  arbre: Arbre
  images: ImageAImporter[]
  pieces: PieceAImporter[]
  marqueurs: MarqueurAImporter[]
}

/** Les clés d'une feuille que Notak lit lui-même ; les autres vont dans le sac `xmind` de la carte. */
const FEUILLE_LUE = new Set([
  'id',
  'class',
  'title',
  'rootTopic',
  'relationships',
  'topicPositioning',
  'compactLayoutModeLevel',
  'topicOverlapping',
  'floatingTopicFlexible',
  'relationshipAutoColor',
  'floatingTopicAutoColor',
  'topicNotesDisplay',
])

/** Une couleur `#rrggbb`, avec ou sans l'opacité (`#rrggbbaa`). */
const couleurValide = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)
/** Ce que Notak ajoute à un sujet que Xmind ne connaît pas : rangé dans une extension à nous, que Xmind laisse en l'état. */
const FOURNISSEUR_SUJET = 'org.notak.sujet'
/** Ce que Notak ajoute à une feuille : les zones, les groupes de marqueurs à soi, la légende. */
const FOURNISSEUR_FEUILLE = 'org.notak.arbre'

const TYPES_PIECES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  mp4: 'video/mp4',
}
/** Un identifiant devenu nom de fichier : ce qui n'est pas lettre ou chiffre s'écrit par son code (un emoji reste unique). */
const nomSur = (id: string) => [...id].map((c) => (/[\w-]/.test(c) ? c : `_${c.codePointAt(0)!.toString(16)}`)).join('')
const extensionDe = (nom: string) => (nom.includes('.') ? nom.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : '') || 'bin'

const estObjet = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const liste = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(estObjet) : [])

/** Une plage `(i,j)` de Xmind, en indices. */
function plageDe(v: unknown): [number, number] | null {
  const m = typeof v === 'string' ? v.match(/^\((\d+),(\d+)\)$/) : null
  return m ? [Number(m[1]), Number(m[2])] : null
}

/** Lit un fichier `.xmind`. Refuse un ancien fichier (Xmind 8) qui n'a que `content.xml`. */
export function lireXmind(octets: Uint8Array): FeuilleLue[] {
  const fichiers = unzipSync(octets)
  const contenu = fichiers['content.json']
  if (!contenu) throw new Error(fichiers['content.xml'] ? 'xmind-ancien' : 'xmind-illisible')
  const feuilles = JSON.parse(strFromU8(contenu)) as unknown
  if (!Array.isArray(feuilles)) throw new Error('xmind-illisible')
  return feuilles.filter(estObjet).map((f) => lireFeuille(f, fichiers))
}

function lireFeuille(f: Json, fichiers: Record<string, Uint8Array>): FeuilleLue {
  const sujets: Record<Id, Sujet> = {}
  const limites: Record<Id, Limite> = {}
  const resumes: Record<Id, Resume> = {}
  const images: ImageAImporter[] = []
  const pieces: PieceAImporter[] = []
  const vus = new Set<Id>()
  let pitch: Arbre['pitch']
  /** Le central demandait `multi-line-colors: none` : toutes les branches d'une seule couleur. */
  let uneCouleur = false
  const idDe = (t: Json) => {
    let id = typeof t.id === 'string' && t.id && !vus.has(t.id) ? t.id : nouvelId()
    while (vus.has(id)) id = nouvelId()
    vus.add(id)
    return id
  }

  const lireSujet = (t: Json, parent: Id | undefined, ordre: string, genre?: 'detache' | 'resume'): Id => {
    const id = idDe(t)
    const s: Sujet = { ordre, titre: typeof t.title === 'string' ? t.title : '' }
    if (parent !== undefined) s.parent = parent
    if (genre) s.genre = genre
    const structure = structureDepuis(t.structureClass)
    if (structure) s.structure = structure
    if (t.branch === 'folded') s.replie = true
    if (genre === 'detache' && estObjet(t.position)) s.position = { x: Number(t.position.x) || 0, y: Number(t.position.y) || 0 }
    const notes = estObjet(t.notes) && estObjet(t.notes.plain) ? t.notes.plain.content : undefined
    if (typeof notes === 'string' && notes.trim()) s.note = docDepuisTexte(notes)
    if (Array.isArray(t.labels) && t.labels.length) s.etiquettes = t.labels.filter((x): x is string => typeof x === 'string')
    if (typeof t.href === 'string' && t.href) s.lien = t.href.startsWith('xmind:#') ? `sujet:${t.href.slice(7)}` : t.href
    const marqueurs = liste(t.markers).flatMap((m) => (typeof m.markerId === 'string' ? [m.markerId] : []))
    if (marqueurs.length) s.marqueurs = marqueurs
    if (typeof t.class === 'string' && CLASSES[t.class]) s.classe = CLASSES[t.class]
    const sac: Json = {}
    for (const [k, v] of Object.entries(t)) if (!LUS.has(k)) sac[k] = v
    // Son style : ce que Notak règle devient son `style` ; le reste des propriétés retourne au fichier tel quel.
    const brut = estObjet(t.style) ? t.style : undefined
    const props = proprietesDe(brut)
    const { style, restes } = lireStyleSujet(props)
    if (props['multi-line-colors'] === 'none') {
      uneCouleur = true
      delete restes['multi-line-colors']
    }
    if (Object.keys(style).length) s.style = style
    if (brut && Object.keys(restes).length) sac.style = { ...brut, properties: restes }
    if (Number(t.customWidth) >= 1) s.largeur = Math.round(Number(t.customWidth))
    else if (t.customWidth !== undefined) sac.customWidth = t.customWidth
    // Les réglages du mode Pitch sortent du style du sujet (le thème et le rapport, du sujet central).
    if (sac.style !== undefined) {
      const lu = extraireDiapo(sac.style, parent === undefined)
      if (lu.diapo) s.diapo = lu.diapo
      if (lu.pitch) pitch = lu.pitch
      if (lu.style === undefined) delete sac.style
      else sac.style = lu.style
    }
    const autres: Json[] = []
    let notak: Json = {}
    for (const e of liste(t.extensions)) {
      if (e.provider === 'org.xmind.ui.numbering' && estObjet(e.content)) {
        const motif = MOTIFS[String(e.content.pattern)]
        if (motif) s.numerotation = { motif, ...(e.content.tiered ? { paliers: true } : {}), ...(e.content.startsHere ? { debut: true } : {}) }
        else autres.push(e)
      } else if (e.provider === 'org.xmind.ui.task' && estObjet(e.content) && (e.content.status === 'todo' || e.content.status === 'done')) {
        s.tache = e.content.status === 'done' ? 'faite' : 'a-faire'
      } else if (e.provider === FOURNISSEUR_SUJET && estObjet(e.content)) {
        notak = e.content
      } else if (e.provider === 'org.xmind.ui.map.unbalanced' && Array.isArray(e.content)) {
        const n = (e.content as Json[]).find((x) => x?.name === 'right-number')?.content
        if (n !== undefined) s.aDroite = Number(n) || 0
        if (structure === 'carte') s.structure = 'carte-libre'
      } else autres.push(e)
    }
    if (autres.length) sac.extensions = autres
    // Ce que Notak ajoute : la tâche planifiée, l'équation, l'autocollant, la case annulée, la pièce jointe.
    if (estObjet(notak.planning)) s.planning = notak.planning as NonNullable<Sujet['planning']>
    if (typeof notak.equation === 'string' && notak.equation) s.equation = notak.equation
    if (notak.tache === 'annulee') s.tache = 'annulee'
    const v = notak.vignette
    if (estObjet(v) && typeof v.id === 'string' && (v.genre === 'autocollant' || v.genre === 'illustration')) s.vignette = { genre: v.genre, id: v.id, l: Number(v.l) || 64, h: Number(v.h) || 64 }
    const jointe = estObjet(notak.piece) ? notak.piece : null
    const cheminPiece = typeof jointe?.src === 'string' ? jointe.src : typeof t.href === 'string' && t.href.startsWith('xap:attachments/') ? t.href.slice(4) : null
    if (cheminPiece && fichiers[cheminPiece]) {
      const nom = typeof jointe?.nom === 'string' && jointe.nom ? jointe.nom : cheminPiece.split('/').pop()!
      pieces.push({ sujet: id, octets: fichiers[cheminPiece]!, nom, type: typeof jointe?.type === 'string' && jointe.type ? jointe.type : (TYPES_PIECES[extensionDe(nom)] ?? 'application/octet-stream'), audio: jointe?.audio === true })
      // Le lien d'une pièce jointe n'est pas un lien web.
      if (s.lien === t.href) delete s.lien
    }
    // L'image d'un sujet : son fichier est dans le zip, Notak le range dans ses fichiers à l'import. Un autocollant la remplace.
    if (s.vignette) {
      // L'image que Notak a écrite pour que Xmind voie l'autocollant : on garde l'autocollant.
    } else if (estObjet(t.image) && typeof t.image.src === 'string' && t.image.src.startsWith('xap:')) {
      const nom = t.image.src.slice(4)
      const octets = fichiers[nom]
      if (octets) images.push({ sujet: id, octets, nom, l: Number(t.image.width) || 120, h: Number(t.image.height) || 90 })
      else sac.image = t.image
    } else if (t.image !== undefined) sac.image = t.image
    if (Object.keys(sac).length) s.xmind = sac
    sujets[id] = s

    const enfants = estObjet(t.children) ? t.children : {}
    const attaches: Id[] = []
    let cle: string | undefined
    for (const e of liste(enfants.attached)) attaches.push(lireSujet(e, id, (cle = cleEntre(cle, undefined))))
    cle = undefined
    for (const e of liste(enfants.detached)) lireSujet(e, id, (cle = cleEntre(cle, undefined)), 'detache')
    // Les sujets de résumé, gardés par leur identifiant Xmind : `summaries` les désigne.
    const deResume = new Map<string, Id>()
    for (const e of liste(enfants.summary)) {
      const x = lireSujet(e, id, 'V', 'resume')
      if (typeof e.id === 'string') deResume.set(e.id, x)
    }
    for (const b of liste(t.boundaries)) {
      const p = b.range === 'master' ? null : plageDe(b.range)
      const limite: Limite | null =
        b.range === 'master' ? { de: id } : p && attaches[p[0]] && attaches[p[1]] ? { de: attaches[p[0]]!, ...(p[1] !== p[0] ? { a: attaches[p[1]]! } : {}) } : null
      if (!limite) continue
      if (typeof b.title === 'string' && b.title) limite.titre = b.title
      const styleLimite = lireStyleLimite(proprietesDe(b.style))
      if (Object.keys(styleLimite).length) limite.style = styleLimite
      limites[typeof b.id === 'string' ? b.id : nouvelId()] = limite
    }
    for (const r of liste(t.summaries)) {
      const p = plageDe(r.range)
      const sujet = typeof r.topicId === 'string' ? deResume.get(r.topicId) : undefined
      if (!p || !sujet || !attaches[p[0]] || !attaches[p[1]]) continue
      const styleResume = lireStyleResume(proprietesDe(r.style))
      resumes[typeof r.id === 'string' ? r.id : nouvelId()] = { de: attaches[p[0]]!, ...(p[1] !== p[0] ? { a: attaches[p[1]]! } : {}), sujet, ...(Object.keys(styleResume).length ? { style: styleResume } : {}) }
    }
    return id
  }

  const racine = estObjet(f.rootTopic) ? f.rootTopic : { title: '' }
  const central = lireSujet(racine, undefined, 'V')
  if (!sujets[central]!.structure) sujets[central]!.structure = 'carte'
  // Un lien interne visait un identifiant Xmind : il vise le même sujet ici, puisque les identifiants sont gardés.
  const relations: Record<Id, Relation> = {}
  for (const r of liste(f.relationships)) {
    if (typeof r.end1Id !== 'string' || typeof r.end2Id !== 'string' || !sujets[r.end1Id] || !sujets[r.end2Id]) continue
    const style = lireStyleRelation(proprietesDe(r.style))
    relations[typeof r.id === 'string' ? r.id : nouvelId()] = { de: r.end1Id, vers: r.end2Id, ...(typeof r.title === 'string' && r.title ? { titre: r.title } : {}), ...(Object.keys(style).length ? { style } : {}) }
  }
  const options: NonNullable<Arbre['options']> = {}
  if (f.topicPositioning === 'free') options.libre = true
  if (uneCouleur) options.uneCouleur = true
  // Xmind écrit « Second » pour compact et « Third » pour normal ; les premiers fichiers de Notak écrivaient 1.
  if (f.compactLayoutModeLevel === 'Second' || Number(f.compactLayoutModeLevel) > 0) options.compacte = true
  if (f.topicOverlapping === 'overlap') options.chevauchement = true
  if (f.floatingTopicFlexible === true) options.flottantSouple = true
  if (f.relationshipAutoColor === 'follow-target-topic') options.relationsColorees = true
  if (f.floatingTopicAutoColor === 'follow-color-theme') options.flottantsColores = true
  if (f.topicNotesDisplay === 'block') options.toutesNotes = true
  const proprietes = (v: unknown): Json => (estObjet(v) && estObjet(v.properties) ? v.properties : {})
  const feuilleStyle = proprietes(f.style)
  const global = estObjet(f.theme) ? proprietes(f.theme.global) : {}
  const centreStyle = proprietes(racine.style)
  if (centreStyle['alignment-by-level'] === 'actived') options.uniforme = true
  // Les réglages de la feuille : fond, police, largeur, branches colorées. Xmind les écrit tous dans `style` et `theme.global`.
  const reglages: Partial<Arbre> = {}
  if (couleurValide(feuilleStyle['svg:fill'])) reglages.fond = feuilleStyle['svg:fill']
  if (typeof global['fo:font-family'] === 'string' && global['fo:font-family']) reglages.police = global['fo:font-family']
  if (typeof feuilleStyle['cjk-font-family'] === 'string' && feuilleStyle['cjk-font-family']) reglages.policeCjk = feuilleStyle['cjk-font-family']
  const largeur = Number.parseFloat(String(global['line-width']))
  if (Number.isFinite(largeur) && largeur > 0) reglages.largeurBranche = Math.round(largeur * 10) / 10
  if (feuilleStyle['line-tapered'] === 'tapered') reglages.effile = true
  const multi = feuilleStyle['multi-line-colors']
  if (multi === 'none') {
    options.uneCouleur = true
    if (couleurValide(centreStyle['line-color'])) reglages.couleurLigne = centreStyle['line-color']
  } else if (typeof multi === 'string') {
    const jeu = multi.split(/\s+/).filter(couleurValide)
    if (jeu.length > 0) reglages.jeuCouleurs = jeu
  }
  // Ce que Notak ne lit pas de la feuille (le thème et le style de Xmind, ses extensions…) est gardé pour l'export.
  const sacFeuille: Json = {}
  for (const [k, v] of Object.entries(f)) if (!FEUILLE_LUE.has(k)) sacFeuille[k] = v
  // Ce que Notak ajoute à la feuille : zones, groupes de marqueurs à soi (leurs images vont avec), légende.
  const notakFeuille = liste(f.extensions).find((e) => e.provider === FOURNISSEUR_FEUILLE)?.content
  const zones: Record<Id, Zone> = {}
  const groupes: Record<Id, GroupeMarqueurs> = {}
  const marqueurs: MarqueurAImporter[] = []
  let legende: Arbre['legende']
  if (estObjet(notakFeuille)) {
    for (const [zid, z] of Object.entries(estObjet(notakFeuille.zones) ? notakFeuille.zones : {})) {
      if (estObjet(z) && [z.x, z.y, z.l, z.h].every((n) => typeof n === 'number')) zones[zid] = z as unknown as Zone
    }
    for (const [gid, g] of Object.entries(estObjet(notakFeuille.groupes) ? notakFeuille.groupes : {})) {
      if (!estObjet(g) || typeof g.nom !== 'string') continue
      const dedans = liste(g.marqueurs).flatMap((m) => {
        const src = typeof m.src === 'string' ? m.src : ''
        if (typeof m.id !== 'string' || !fichiers[src]) return []
        marqueurs.push({ groupe: gid, marqueur: m.id, octets: fichiers[src]!, nom: src.split('/').pop()! })
        return [{ id: m.id, nom: typeof m.nom === 'string' ? m.nom : '', fichier: '' }]
      })
      groupes[gid] = { ordre: typeof g.ordre === 'string' ? g.ordre : 'V', nom: g.nom, marqueurs: dedans }
    }
    if (estObjet(notakFeuille.legende)) legende = notakFeuille.legende as NonNullable<Arbre['legende']>
  }
  const arbre: Arbre = {
    type: 'arbre',
    sujets,
    ...(Object.keys(relations).length ? { relations } : {}),
    ...(Object.keys(limites).length ? { limites } : {}),
    ...(Object.keys(resumes).length ? { resumes } : {}),
    ...(Object.keys(zones).length ? { zones } : {}),
    ...(Object.keys(groupes).length ? { groupes } : {}),
    ...(legende ? { legende } : {}),
    ...(Object.keys(options).length ? { options } : {}),
    ...reglages,
    ...(Object.keys(sacFeuille).length ? { xmind: sacFeuille } : {}),
    ...(pitch ? { pitch } : {}),
  }
  return { titre: typeof f.title === 'string' ? f.title : sujets[central]!.titre, arbre, images, pieces, marqueurs }
}

/** Une image à écrire dans le zip : le sujet qui la porte et ses octets. */
export interface ImageAExporter {
  fichier: Id
  octets: Uint8Array
  extension: string
}

/** Écrit un `.xmind` : une feuille par carte. `images` : les fichiers des images que portent les sujets. */
export function ecrireXmind(cartes: { titre: string; arbre: Arbre }[], images: ReadonlyMap<Id, ImageAExporter> = new Map()): Uint8Array {
  const ressources: Record<string, Uint8Array> = {}
  const feuilles = cartes.map((c) => ecrireFeuille(c.titre, c.arbre, images, ressources))
  const entrees: Record<string, object> = { 'content.json': {}, 'metadata.json': {} }
  for (const nom of Object.keys(ressources)) entrees[nom] = {}
  return zipSync({
    'content.json': strToU8(JSON.stringify(feuilles)),
    'metadata.json': strToU8(JSON.stringify({ creator: { name: 'Notak', version: '1' }, dataStructureVersion: '3', activeSheetId: feuilles[0]?.id })),
    'manifest.json': strToU8(JSON.stringify({ 'file-entries': entrees })),
    ...ressources,
  })
}

function ecrireFeuille(titre: string, a: Arbre, images: ReadonlyMap<Id, ImageAExporter>, ressources: Record<string, Uint8Array>): Json {
  const l = lire(a)
  const ecrire = (id: Id): Json => {
    const s = l.sujets.get(id)!
    const t: Json = { ...(s.xmind ?? {}), id, title: s.titre }
    // Son style : les propriétés que Notak ne lit pas (gardées dans le sac), puis celles de son style.
    const brut = estObjet(t.style) ? t.style : {}
    const proprietes = { ...proprietesDe(brut), ...ecrireStyleSujet(s.style ?? {}), ...(id === l.central && a.options?.uneCouleur ? { 'multi-line-colors': 'none' } : {}) }
    if (Object.keys(proprietes).length) t.style = { ...brut, id: typeof brut.id === 'string' ? brut.id : nouvelId(), properties: proprietes }
    else delete t.style
    if (s.largeur) t.customWidth = s.largeur
    if (id === l.central) t.class = 'topic'
    else if (s.classe) t.class = Object.entries(CLASSES).find(([, v]) => v === s.classe)![0]
    if (s.structure) t.structureClass = classeDepuis(s.structure)
    if (s.replie) t.branch = 'folded'
    if (s.genre === 'detache' && s.position) t.position = { x: Math.round(s.position.x), y: Math.round(s.position.y) }
    if (s.note) {
      const texte = texteBrut(s.note)
      t.notes = { plain: { content: texte }, realHTML: { content: enHtml(s.note) } }
    }
    if (s.etiquettes?.length) t.labels = s.etiquettes
    if (s.lien) t.href = s.lien.startsWith('sujet:') ? `xmind:#${s.lien.slice(6)}` : s.lien
    if (s.marqueurs?.length) t.markers = s.marqueurs.map((markerId) => ({ markerId }))
    const extensions: Json[] = Array.isArray(t.extensions) ? [...(t.extensions as Json[])] : []
    if (s.numerotation) {
      const pattern = Object.entries(MOTIFS).find(([, v]) => v === s.numerotation!.motif)![0]
      extensions.push({ provider: 'org.xmind.ui.numbering', content: { pattern, tiered: !!s.numerotation.paliers, ...(s.numerotation.debut ? { startsHere: true } : {}) } })
    }
    if (s.tache) extensions.push({ provider: 'org.xmind.ui.task', content: { status: s.tache === 'faite' ? 'done' : 'todo' } })
    // Ce que Xmind n'a pas : rangé dans une extension à nous. La pièce jointe passe aussi par le `href` d'une pièce de Xmind.
    const notak: Json = {}
    if (s.planning) notak.planning = s.planning
    if (s.equation) notak.equation = s.equation
    if (s.tache === 'annulee') notak.tache = 'annulee'
    if (s.vignette) notak.vignette = s.vignette
    if (s.piece) {
      const fichier = images.get(s.piece.fichier)
      const src = fichier ? `attachments/${s.piece.fichier}.${fichier.extension}` : undefined
      if (fichier && src) {
        ressources[src] = fichier.octets
        if (!s.lien) t.href = `xap:${src}`
      }
      notak.piece = { nom: s.piece.nom, type: s.piece.type, taille: s.piece.taille, ...(s.piece.audio ? { audio: true } : {}), ...(src ? { src } : {}) }
    }
    if (Object.keys(notak).length > 0) extensions.push({ provider: FOURNISSEUR_SUJET, content: notak })
    if (s.structure === 'carte-libre') {
      t.structureClass = 'org.xmind.ui.map.unbalanced'
      extensions.push({ provider: 'org.xmind.ui.map.unbalanced', content: [{ name: 'right-number', content: String(s.aDroite ?? enfantsDe(l, id).length) }] })
    }
    if (extensions.length) t.extensions = extensions
    else delete t.extensions
    if (s.note && a.options?.toutesNotes) t.notesDisplay = 'block'
    if (id === l.central) {
      const o = a.options ?? {}
      fusionnerStyle(t, 'style', { 'alignment-by-level': o.uniforme ? 'actived' : undefined, ...(o.uneCouleur ? { 'line-color': a.couleurLigne } : {}) })
    }
    const style = ajouterDiapo(t.style, s.diapo, id === l.central ? a.pitch : undefined)
    if (style !== undefined) t.style = style
    // Un autocollant s'écrit aussi comme une image (un SVG), pour que Xmind le montre.
    const imageVue = s.image ?? (s.vignette ? { fichier: `vignette:${s.vignette.genre}:${s.vignette.id}`, l: s.vignette.l, h: s.vignette.h } : undefined)
    if (imageVue) {
      const img = images.get(imageVue.fichier)
      if (img) {
        const nom = `resources/${nomSur(imageVue.fichier)}.${img.extension}`
        ressources[nom] = img.octets
        t.image = { src: `xap:${nom}`, width: imageVue.l, height: imageVue.h }
      }
    }
    const enfants: Json = {}
    const attaches = enfantsDe(l, id)
    if (attaches.length) enfants.attached = attaches.map(ecrire)
    if (id === l.central && l.flottants.length) enfants.detached = l.flottants.map(ecrire)
    // Les résumés et les limites dont la plage est sous ce sujet.
    const rang = (x: Id) => attaches.indexOf(x)
    const resumes = Object.entries(a.resumes ?? {}).filter(([, r]) => l.sujets.get(r.de)?.parent === id && l.sujets.has(r.sujet))
    if (resumes.length) {
      enfants.summary = resumes.map(([, r]) => ecrire(r.sujet))
      t.summaries = resumes.map(([rid, r]) => ({ id: rid, range: `(${rang(r.de)},${rang(r.a ?? r.de)})`, topicId: r.sujet, ...styleDe(ecrireStyleResume(r.style ?? {})) }))
    }
    const bornes = Object.entries(a.limites ?? {}).flatMap(([lid, x]) => {
      if (!x.a && x.de === id) return [{ id: lid, range: 'master', ...(x.titre ? { title: x.titre } : {}), ...styleDe(ecrireStyleLimite(x.style ?? {})) }]
      if (x.a && l.sujets.get(x.de)?.parent === id) return [{ id: lid, range: `(${rang(x.de)},${rang(x.a)})`, ...(x.titre ? { title: x.titre } : {}), ...styleDe(ecrireStyleLimite(x.style ?? {})) }]
      // Une limite sur une seule branche (sans `a`) se pose comme « master » sur ce sujet.
      return []
    })
    if (bornes.length) t.boundaries = bornes
    if (Object.keys(enfants).length) t.children = enfants
    return t
  }
  const feuille: Json = { ...(a.xmind ?? {}), id: nouvelId(), class: 'sheet', title: titre, rootTopic: ecrire(l.central) }
  const relations = Object.entries(a.relations ?? {}).filter(([, r]) => l.sujets.has(r.de) && l.sujets.has(r.vers))
  if (relations.length) feuille.relationships = relations.map(([id, r]) => ({ id, end1Id: r.de, end2Id: r.vers, ...(r.titre ? { title: r.titre } : {}), ...styleDe(ecrireStyleRelation(r.style ?? {})) }))
  // Les réglages de l'onglet Carte : une clé n'est écrite que si l'option est allumée (docs/XMIND.md § 9).
  const o = a.options ?? {}
  if (o.libre) feuille.topicPositioning = 'free'
  if (o.compacte) feuille.compactLayoutModeLevel = 'Second'
  if (o.chevauchement) feuille.topicOverlapping = 'overlap'
  if (o.flottantSouple) feuille.floatingTopicFlexible = true
  if (o.relationsColorees) feuille.relationshipAutoColor = 'follow-target-topic'
  if (o.flottantsColores) feuille.floatingTopicAutoColor = 'follow-color-theme'
  if (o.toutesNotes) feuille.topicNotesDisplay = 'block'
  fusionnerStyle(feuille, 'style', {
    'svg:fill': a.fond,
    'cjk-font-family': a.policeCjk,
    'line-tapered': a.effile ? 'tapered' : undefined,
    'multi-line-colors': o.uneCouleur ? 'none' : a.jeuCouleurs?.length ? a.jeuCouleurs.join(' ') : undefined,
  })
  const theme: Json = estObjet(feuille.theme) ? { ...feuille.theme } : {}
  fusionnerStyle(theme, 'global', { 'fo:font-family': a.police, 'line-width': a.largeurBranche ? `${a.largeurBranche}pt` : undefined })
  if (Object.keys(theme).length > 0) feuille.theme = theme
  else delete feuille.theme
  // Les zones, les groupes de marqueurs à soi (leurs images vont dans le zip) et la légende.
  const notakFeuille: Json = {}
  if (a.zones && Object.keys(a.zones).length) notakFeuille.zones = a.zones
  if (a.groupes && Object.keys(a.groupes).length) {
    notakFeuille.groupes = Object.fromEntries(
      Object.entries(a.groupes).map(([gid, g]) => [
        gid,
        {
          nom: g.nom,
          ordre: g.ordre,
          marqueurs: g.marqueurs.flatMap((m) => {
            const img = images.get(m.fichier)
            if (!img) return []
            const src = `resources/marqueurs/${m.fichier}.${img.extension}`
            ressources[src] = img.octets
            return [{ id: m.id, nom: m.nom, src }]
          }),
        },
      ]),
    )
  }
  if (a.legende && (a.legende.visible || a.legende.textes)) notakFeuille.legende = a.legende
  // Les extensions que la feuille portait déjà (celles de Xmind) restent ; la nôtre se réécrit.
  const extensions = liste(feuille.extensions).filter((e) => e.provider !== FOURNISSEUR_FEUILLE)
  if (Object.keys(notakFeuille).length) extensions.push({ provider: FOURNISSEUR_FEUILLE, content: notakFeuille })
  if (extensions.length) feuille.extensions = extensions
  else delete feuille.extensions
  return feuille
}

/**
 * Pose (ou retire, si la valeur manque) des propriétés dans `parent[cle].properties`, sans toucher à l'objet du sac
 * de la carte : on en travaille une copie. Sans propriété, le style s'efface avec elles, s'il ne portait rien d'autre.
 */
function fusionnerStyle(parent: Json, cle: string, valeurs: Record<string, string | undefined>) {
  const objet: Json = estObjet(parent[cle]) ? { ...parent[cle] } : {}
  const proprietes: Json = estObjet(objet.properties) ? { ...objet.properties } : {}
  for (const [k, v] of Object.entries(valeurs)) {
    if (v === undefined || v === '') delete proprietes[k]
    else proprietes[k] = v
  }
  if (Object.keys(proprietes).length > 0) {
    objet.properties = proprietes
    objet.id ??= nouvelId()
    parent[cle] = objet
    return
  }
  delete objet.properties
  if (Object.keys(objet).length > 0) parent[cle] = objet
  else delete parent[cle]
}

/** Le champ `style` d'un objet du fichier (relation, limite, résumé) : absent s'il n'a pas de propriété. */
const styleDe = (proprietes: Record<string, string>): { style?: Json } => (Object.keys(proprietes).length ? { style: { id: nouvelId(), properties: proprietes } } : {})

/** La note en HTML simple, pour le champ `realHTML` que Xmind affiche : un paragraphe par ligne. */
function enHtml(n: NoeudTexte): string {
  const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return texteBrut(n)
    .split('\n')
    .map((ligne) => `<div>${echapper(ligne) || '<br>'}</div>`)
    .join('')
}

/** Vérifie qu'une lecture garde l'essentiel : utile aux tests d'aller-retour. */
export function resumeDeCarte(a: Arbre): { titres: string[]; relations: number; limites: number; resumes: number } {
  const l: Lecture = lire(a)
  const titres: string[] = []
  const parcourir = (id: Id, n: number) => {
    titres.push(`${'  '.repeat(n)}${l.sujets.get(id)!.titre}`)
    for (const e of enfantsDe(l, id)) parcourir(e, n + 1)
  }
  parcourir(l.central, 0)
  for (const f of l.flottants) parcourir(f, 1)
  return { titres, relations: Object.keys(a.relations ?? {}).length, limites: Object.keys(a.limites ?? {}).length, resumes: Object.keys(a.resumes ?? {}).length }
}
