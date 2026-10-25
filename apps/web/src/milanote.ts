import { ErreurTropGros, dezipper } from '@notak/tableau'
import type { Element, Id, NoeudTexte } from '@notak/tableau'
import { t } from './langue'

// Milanote n'a pas d'export structuré : on lit son export « Markdown + fichiers », une archive zip.
// Ce qu'on en suppose, et rien de plus : un ou plusieurs fichiers `.md` (le premier du dossier le moins profond est
// le tableau, les autres sont des sous-tableaux), des titres qui ouvrent des colonnes, des paragraphes, des listes,
// des citations, des blocs de code, des tableaux, des images `![](chemin)`, des liens, et des pièces jointes
// rangées à côté. Ce qui n'a pas de sens ici devient une note, jamais une perte.

export class ErreurImport extends Error {}

const LARGEUR = 34
const LARGEUR_COLONNE = 34
const LARGEUR_CELLULE = 12
const LARGEUR_RENVOI = 10
const ECART = 4
const DEPART = 5
/** Combien de lignes de texte tient une note de largeur normale, pour estimer sa hauteur (UG). */
const CARACTERES_PAR_LIGNE = 28
const UG_PAR_LIGNE = 3
const MARGES_NOTE = 6

export interface FichierARanger {
  chemin: string
  nom: string
  type: string
  octets: Uint8Array
}

export interface TableauPlan {
  /** Le chemin du fichier `.md` dans l'archive : c'est ce qui désigne ce tableau. */
  cle: string
  titre: string
  /** Les éléments, prêts à poser. Les renvois visent `plan:<cle>`, les fichiers `zip:<chemin>` : le web les remplace. */
  elements: Element[]
}

export interface PlanImport {
  /** Le tableau de tête : le premier de `tableaux`. */
  tableaux: TableauPlan[]
  fichiers: Map<string, FichierARanger>
  /** Ce qu'on n'a pas su lire, en clair. */
  avertissements: string[]
}

export const CIBLE_TABLEAU = 'plan:'
export const CIBLE_FICHIER = 'zip:'

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
}
const extensionDe = (nom: string) => /\.([A-Za-z0-9]+)$/.exec(nom)?.[1]?.toLowerCase() ?? ''
export const typeDe = (nom: string) => TYPES[extensionDe(nom)] ?? 'application/octet-stream'

// ---- Les chemins ----

const dossierDe = (chemin: string) => chemin.slice(0, chemin.lastIndexOf('/') + 1)
const nomDe = (chemin: string) => chemin.slice(chemin.lastIndexOf('/') + 1)

/** `lien` écrit dans le fichier `depuis`, ramené à un chemin de l'archive. */
export function resoudre(depuis: string, lien: string): string {
  let cible = lien.trim().replace(/^<|>$/g, '').split('#')[0]!.split('?')[0]!
  try {
    cible = decodeURIComponent(cible)
  } catch {
    // Un `%` isolé : on garde le texte tel quel.
  }
  const pile = (cible.startsWith('/') ? '' : dossierDe(depuis)).split('/').filter(Boolean)
  for (const morceau of cible.split('/')) {
    if (morceau === '..') pile.pop()
    else if (morceau !== '.' && morceau !== '') pile.push(morceau)
  }
  return pile.join('/')
}

const estExterne = (lien: string) => /^[a-z][a-z0-9+.-]*:/i.test(lien.trim()) && !/^[a-z]:[\\/]/i.test(lien)

// ---- Le texte en ligne ----

type Marque = { type: string; attrs?: Record<string, unknown> }

const MOTIFS: { re: RegExp; marque: (m: RegExpExecArray) => Marque; interieur: number }[] = [
  { re: /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/, marque: (m) => ({ type: 'link', attrs: { href: m[2]! } }), interieur: 1 },
  { re: /`([^`]+)`/, marque: () => ({ type: 'code' }), interieur: 1 },
  { re: /\*\*(?=\S)(.+?)(?<=\S)\*\*/, marque: () => ({ type: 'bold' }), interieur: 1 },
  { re: /__(?=\S)(.+?)(?<=\S)__/, marque: () => ({ type: 'bold' }), interieur: 1 },
  { re: /~~(?=\S)(.+?)(?<=\S)~~/, marque: () => ({ type: 'strike' }), interieur: 1 },
  { re: /\*(?=[^\s*])(.+?)(?<=[^\s*])\*/, marque: () => ({ type: 'italic' }), interieur: 1 },
  { re: /(?<![\p{L}\p{N}_])_(?=[^\s_])(.+?)(?<=[^\s_])_(?![\p{L}\p{N}_])/u, marque: () => ({ type: 'italic' }), interieur: 1 },
]

/** Du Markdown en ligne vers des nœuds de texte Tiptap, marques comprises. */
export function enLigne(texte: string, marques: Marque[] = []): NoeudTexte[] {
  const noeuds: NoeudTexte[] = []
  const brut = (t: string) => {
    if (t) noeuds.push({ type: 'text', text: t, ...(marques.length ? { marks: marques } : {}) })
  }
  let reste = texte
  while (reste) {
    let meilleur: { m: RegExpExecArray; motif: (typeof MOTIFS)[number] } | null = null
    for (const motif of MOTIFS) {
      const m = motif.re.exec(reste)
      if (m && (!meilleur || m.index < meilleur.m.index)) meilleur = { m, motif }
    }
    if (!meilleur) {
      brut(reste)
      break
    }
    const { m, motif } = meilleur
    brut(reste.slice(0, m.index))
    const marque = motif.marque(m)
    const dedans = m[motif.interieur]!
    if (marque.type === 'code') noeuds.push({ type: 'text', text: dedans, marks: [...marques, marque] })
    else noeuds.push(...enLigne(dedans, [...marques, marque]))
    reste = reste.slice(m.index + m[0].length)
  }
  return noeuds
}

const paragraphe = (lignes: string[]): NoeudTexte => {
  const contenu: NoeudTexte[] = []
  lignes.forEach((l, i) => {
    if (i > 0) contenu.push({ type: 'hardBreak' })
    contenu.push(...enLigne(l))
  })
  return contenu.length ? { type: 'paragraph', content: contenu } : { type: 'paragraph' }
}

// ---- Les blocs ----

type Bloc =
  | { genre: 'titre'; niveau: number; texte: string }
  | { genre: 'paragraphe'; lignes: string[] }
  | { genre: 'liste'; ordonnee: boolean; items: { niveau: number; texte: string; fait: boolean | null }[] }
  | { genre: 'citation'; lignes: string[] }
  | { genre: 'code'; langue: string; texte: string }
  | { genre: 'table'; lignes: string[][] }

const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const CASE = /^\[([ xX])\]\s+(.*)$/
const SEPARATEUR_TABLE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

const cellules = (ligne: string) =>
  ligne
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())

/** Le Markdown d'un fichier, en blocs. */
export function blocs(markdown: string): Bloc[] {
  const lignes = markdown.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split('\n')
  const sortie: Bloc[] = []
  let para: string[] = []
  const fermerPara = () => {
    if (para.length) sortie.push({ genre: 'paragraphe', lignes: para })
    para = []
  }
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i]!
    const fence = /^\s*(```|~~~)\s*([\w+-]*)/.exec(l)
    if (fence) {
      fermerPara()
      const corps: string[] = []
      for (i++; i < lignes.length && !lignes[i]!.trim().startsWith(fence[1]!); i++) corps.push(lignes[i]!)
      sortie.push({ genre: 'code', langue: fence[2] ?? '', texte: corps.join('\n') })
      continue
    }
    if (l.trim() === '') {
      fermerPara()
      continue
    }
    const titre = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l)
    if (titre) {
      fermerPara()
      sortie.push({ genre: 'titre', niveau: titre[1]!.length, texte: titre[2]! })
      continue
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) {
      fermerPara()
      continue
    }
    if (/^\s{0,3}>/.test(l)) {
      fermerPara()
      const corps: string[] = []
      for (; i < lignes.length && /^\s{0,3}>/.test(lignes[i]!); i++) corps.push(lignes[i]!.replace(/^\s{0,3}>\s?/, ''))
      i--
      sortie.push({ genre: 'citation', lignes: corps })
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(l) || (l.includes('|') && SEPARATEUR_TABLE.test(lignes[i + 1] ?? ''))) {
      fermerPara()
      const rangees: string[][] = []
      for (; i < lignes.length && lignes[i]!.includes('|') && lignes[i]!.trim() !== ''; i++) {
        if (!SEPARATEUR_TABLE.test(lignes[i]!)) rangees.push(cellules(lignes[i]!))
      }
      i--
      sortie.push({ genre: 'table', lignes: rangees })
      continue
    }
    const item = ITEM.exec(l)
    if (item) {
      fermerPara()
      const items: { niveau: number; texte: string; fait: boolean | null }[] = []
      const ordonnee = /\d/.test(item[2]!)
      for (; i < lignes.length; i++) {
        const m = ITEM.exec(lignes[i]!)
        if (m) {
          const tache = CASE.exec(m[3]!)
          items.push({ niveau: Math.floor(m[1]!.replace(/\t/g, '  ').length / 2), texte: tache ? tache[2]! : m[3]!, fait: tache ? tache[1] !== ' ' : null })
        } else if (lignes[i]!.trim() === '' && ITEM.test(lignes[i + 1] ?? '')) {
          continue
        } else if (/^\s{2,}\S/.test(lignes[i]!) && items.length) {
          items[items.length - 1]!.texte += ` ${lignes[i]!.trim()}`
        } else break
      }
      i--
      sortie.push({ genre: 'liste', ordonnee, items })
      continue
    }
    para.push(l.trim())
  }
  fermerPara()
  return sortie
}

// ---- Des blocs aux éléments ----

interface Rangement {
  fichiers: Map<string, FichierARanger>
  /** Le chemin de l'archive d'un nom de fichier écrit dans un lien, ou `null`. */
  trouver(depuis: string, lien: string): string | null
  avertir(texte: string): void
  /** Les `.md` vus dans des liens, à lire à leur tour. */
  sousTableau(chemin: string): string
  id(): Id
}

const IMAGE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const LIEN_SEUL = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/
const URL_SEULE = /^<?(https?:\/\/[^\s>]+)>?$/

function listeEnTiptap(items: { niveau: number; texte: string; fait: boolean | null }[], ordonnee: boolean, taches: boolean): NoeudTexte {
  type Brouillon = { niveau: number; item: NoeudTexte; sous: Brouillon[] }
  const racine: Brouillon = { niveau: -1, item: { type: 'doc' }, sous: [] }
  const pile: Brouillon[] = [racine]
  for (const it of items) {
    const noeud: NoeudTexte = taches
      ? { type: 'taskItem', attrs: { checked: it.fait === true }, content: [paragraphe([it.texte])] }
      : { type: 'listItem', content: [paragraphe([it.texte])] }
    const b: Brouillon = { niveau: it.niveau, item: noeud, sous: [] }
    while (pile.length > 1 && pile[pile.length - 1]!.niveau >= it.niveau) pile.pop()
    pile[pile.length - 1]!.sous.push(b)
    pile.push(b)
  }
  const liste = (enfants: Brouillon[]): NoeudTexte => ({
    type: taches ? 'taskList' : ordonnee ? 'orderedList' : 'bulletList',
    content: enfants.map((e) => ({ ...e.item, content: [...(e.item.content ?? []), ...(e.sous.length ? [liste(e.sous)] : [])] })),
  })
  return liste(racine.sous)
}

/** Les éléments d'un fichier Markdown, sans leur place. */
function elementsDe(chemin: string, md: string, r: Rangement): { titre: string; entrees: Entree[] } {
  interface Brut {
    contenu: Element['contenu']
    largeur: number
    hauteur: number
  }
  const entrees: Entree[] = []
  let titre = ''
  let titreVu = false
  let colonne: Id | null = null
  const poser = (b: Brut) => entrees.push({ id: r.id(), contenu: b.contenu, largeur: b.largeur, hauteur: b.hauteur, colonne })
  const note = (noeuds: NoeudTexte[], caracteres: number) =>
    poser({
      contenu: { type: 'note', texte: { type: 'doc', content: noeuds } },
      largeur: LARGEUR,
      hauteur: MARGES_NOTE + UG_PAR_LIGNE * Math.max(1, Math.ceil(caracteres / CARACTERES_PAR_LIGNE)),
    })

  /** Un lien posé seul : l'adresse d'une page, un fichier de l'archive, un autre tableau. */
  const lienSeul = (texte: string, adresse: string): boolean => {
    if (!estExterne(adresse)) {
      const cible = r.trouver(chemin, adresse)
      if (!cible) return false
      if (/\.md$/i.test(cible)) {
        poser({ contenu: { type: 'tableau', cible: CIBLE_TABLEAU + r.sousTableau(cible) }, largeur: LARGEUR_RENVOI, hauteur: 12 })
      } else {
        const f = r.fichiers.get(cible)!
        poser({
          contenu: { type: 'fichier', fichier: CIBLE_FICHIER + cible, nom: f.nom, typeMime: f.type, taille: f.octets.length, ...(texte && texte !== f.nom ? { titre: texte } : {}) },
          largeur: LARGEUR,
          hauteur: 10,
        })
      }
      return true
    }
    if (!/^https?:/i.test(adresse)) return false
    poser({ contenu: { type: 'lien', url: adresse, statut: 'attente', ...(texte && texte !== adresse ? { titre: texte } : {}) }, largeur: LARGEUR, hauteur: 20 })
    return true
  }

  const image = (legende: string, adresse: string): boolean => {
    const cible = estExterne(adresse) ? null : r.trouver(chemin, adresse)
    if (!cible) return false
    const f = r.fichiers.get(cible)!
    // Les dimensions se lisent à l'envoi (le web les remplace) ; en attendant, un format courant.
    poser({
      contenu: { type: 'image', fichier: CIBLE_FICHIER + cible, largeurOrigine: 0, hauteurOrigine: 0, typeMime: f.type, ...(legende ? { legende } : {}) },
      largeur: LARGEUR,
      hauteur: 24,
    })
    return true
  }

  for (const b of blocs(md)) {
    if (b.genre === 'titre') {
      const seul = LIEN_SEUL.exec(b.texte)
      if (seul && !estExterne(seul[2]!) && /\.md$/i.test(r.trouver(chemin, seul[2]!) ?? '') && lienSeul(seul[1]!, seul[2]!)) continue
      const brut = b.texte.replace(/\*\*|__|`/g, '').trim()
      if (!titreVu && b.niveau === 1) {
        titreVu = true
        titre = brut
        continue
      }
      if (!brut) continue
      colonne = r.id()
      entrees.push({ id: colonne, contenu: { type: 'colonne', titre: brut }, largeur: LARGEUR_COLONNE, hauteur: 12, colonne: null, estColonne: true })
    } else if (b.genre === 'paragraphe') {
      const texte = b.lignes.join('\n')
      const seul = b.lignes.length === 1 ? b.lignes[0]! : ''
      const l = LIEN_SEUL.exec(seul)
      const u = URL_SEULE.exec(seul)
      if (l && lienSeul(l[1]!, l[2]!)) continue
      if (u && lienSeul('', u[1]!)) continue
      // Des images dans le paragraphe : chacune devient une image, le texte qui reste une note.
      const images = [...texte.matchAll(IMAGE)]
      const reste = texte.replace(IMAGE, '').split('\n').map((x) => x.trim()).filter(Boolean)
      let toutes = true
      for (const m of images) if (!image(m[1]!, m[2]!)) toutes = false
      if (images.length > 0 && toutes) {
        if (reste.length) note([paragraphe(reste)], reste.join(' ').length)
        continue
      }
      if (images.length > 0) r.avertir(t('milanote.imageIntrouvable', { noms: images.map((m) => m[2]).join(', ') }))
      note([paragraphe(b.lignes)], texte.length)
    } else if (b.genre === 'liste') {
      const taches = b.items.every((i) => i.fait !== null)
      const total = b.items.reduce((n, i) => n + Math.max(1, Math.ceil(i.texte.length / CARACTERES_PAR_LIGNE)), 0)
      const doc = listeEnTiptap(b.items, b.ordonnee, taches)
      if (taches) poser({ contenu: { type: 'taches', texte: { type: 'doc', content: [doc] } }, largeur: LARGEUR, hauteur: MARGES_NOTE + UG_PAR_LIGNE * (total + 1) })
      else note([doc], total * CARACTERES_PAR_LIGNE)
    } else if (b.genre === 'citation') {
      note([{ type: 'blockquote', content: [paragraphe(b.lignes)] }], b.lignes.join(' ').length)
    } else if (b.genre === 'code') {
      note([{ type: 'codeBlock', ...(b.langue ? { attrs: { language: b.langue } } : {}), content: b.texte ? [{ type: 'text', text: b.texte }] : [] }], b.texte.length)
    } else if (b.genre === 'table') {
      const colonnes = Math.max(1, ...b.lignes.map((x) => x.length))
      poser({
        contenu: { type: 'table', cellules: b.lignes.map((x) => Array.from({ length: colonnes }, (_, i) => x[i] ?? '')) },
        largeur: colonnes * LARGEUR_CELLULE,
        hauteur: MARGES_NOTE + UG_PAR_LIGNE * b.lignes.length,
      })
    }
  }
  return { titre: titre || nomDe(chemin).replace(/\.md$/i, ''), entrees }
}

interface Entree {
  id: Id
  contenu: Element['contenu']
  largeur: number
  hauteur: number
  /** La colonne qui le reçoit ; `null` : posé sur la toile. */
  colonne: Id | null
  estColonne?: boolean
}

/** La clé de rang du n-ième enfant d'une colonne : croissante, jamais terminée par le plus petit chiffre. */
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
export const cleDeRang = (i: number) => 'z'.repeat(Math.floor(i / 60)) + ALPHABET[1 + (i % 60)]

/**
 * Pose les entrées : les colonnes côte à côte, leurs éléments rangés dedans par `parent` et `ordre`, le reste en pile
 * à gauche. Les hauteurs ne sont que des estimations : de quoi éviter l'empilement, pas de quoi mesurer.
 */
function disposer(entrees: Entree[]): Element[] {
  const libres = entrees.filter((e) => !e.estColonne && e.colonne === null)
  const colonnes = entrees.filter((e) => e.estColonne)
  const elements: Element[] = []
  let y = DEPART
  for (const e of libres) {
    elements.push({ id: e.id, x: DEPART, y, largeur: e.largeur, contenu: e.contenu })
    y += e.hauteur + ECART
  }
  let x = DEPART + (libres.length ? LARGEUR + ECART * 2 : 0)
  for (const c of colonnes) {
    elements.push({ id: c.id, x, y: DEPART, largeur: c.largeur, contenu: c.contenu })
    entrees
      .filter((e) => e.colonne === c.id)
      .forEach((e, i) => elements.push({ id: e.id, x: 0, y: 0, largeur: e.largeur, contenu: e.contenu, parent: c.id, ordre: cleDeRang(i) }))
    x += c.largeur + ECART
  }
  return elements
}

// ---- L'archive ----

const IGNORES = (chemin: string) => chemin.startsWith('__MACOSX/') || chemin.split('/').some((p) => p === '.DS_Store' || p.startsWith('._'))

/** Lit l'export Markdown d'un tableau Milanote (zip) et le range en un plan d'import. */
export function lireExportMilanote(zip: Uint8Array, nouvelId: () => Id = idAleatoire): PlanImport {
  let entrees: Record<string, Uint8Array>
  try {
    entrees = dezipper(zip)
  } catch (e) {
    throw new ErreurImport(t(e instanceof ErreurTropGros ? 'milanote.tropGros' : 'milanote.pasZip'))
  }
  const fichiers = new Map<string, FichierARanger>()
  const markdowns = new Map<string, string>()
  for (const [brut, octets] of Object.entries(entrees)) {
    const chemin = brut.replace(/\\/g, '/').replace(/^\/+/, '')
    if (chemin.endsWith('/') || IGNORES(chemin)) continue
    if (/\.(md|markdown)$/i.test(chemin)) markdowns.set(chemin, new TextDecoder().decode(octets))
    else fichiers.set(chemin, { chemin, nom: nomDe(chemin), type: typeDe(chemin), octets })
  }
  if (markdowns.size === 0) throw new ErreurImport(t('milanote.aucunMarkdown'))

  // Les liens, sans casse : les exports des systèmes de fichiers ne s'accordent pas toujours.
  const parMinuscules = new Map<string, string>()
  for (const c of [...fichiers.keys(), ...markdowns.keys()]) parMinuscules.set(c.toLowerCase(), c)

  // Le tableau de tête : le moins profond, puis celui que les autres ne citent pas, puis le premier par ordre alphabétique.
  const profondeur = (c: string) => c.split('/').length
  const cites = new Set<string>()
  const citations = new Map<string, number>()
  for (const [c, md] of markdowns) {
    for (const m of md.matchAll(/\]\(([^)\s]+\.md)(?:#[^)\s]*)?\)/gi)) {
      const cible = parMinuscules.get(resoudre(c, m[1]!).toLowerCase())
      if (!cible || cible === c) continue
      cites.add(cible)
      citations.set(c, (citations.get(c) ?? 0) + 1)
    }
  }
  const ordre = [...markdowns.keys()].sort(
    (a, b) =>
      profondeur(a) - profondeur(b) || Number(cites.has(a)) - Number(cites.has(b)) || (citations.get(b) ?? 0) - (citations.get(a) ?? 0) || (a < b ? -1 : 1),
  )
  const racine = ordre[0]!

  const avertissements: string[] = []
  const file: string[] = [racine]
  const vus = new Set([racine])
  const tableaux: TableauPlan[] = []
  const rangement: Rangement = {
    fichiers,
    trouver: (depuis, lien) => parMinuscules.get(resoudre(depuis, lien).toLowerCase()) ?? null,
    avertir: (t) => avertissements.push(t),
    sousTableau(chemin) {
      if (!vus.has(chemin)) {
        vus.add(chemin)
        file.push(chemin)
      }
      return chemin
    },
    id: nouvelId,
  }
  let suivant = 0
  const lireLaFile = () => {
    for (; suivant < file.length; suivant++) {
      const chemin = file[suivant]!
      const { titre, entrees: lues } = elementsDe(chemin, markdowns.get(chemin)!, rangement)
      tableaux.push({ cle: chemin, titre, elements: disposer(lues) })
    }
  }
  lireLaFile()
  // Un fichier que rien ne cite devient tout de même un sous-tableau de la tête.
  for (const chemin of ordre) {
    if (vus.has(chemin)) continue
    rangement.sousTableau(chemin)
    const tete = tableaux[0]!
    const droite = Math.max(DEPART - ECART, ...tete.elements.filter((e) => !e.parent).map((e) => e.x + e.largeur)) + ECART
    tete.elements.push({ id: nouvelId(), x: droite, y: DEPART, largeur: LARGEUR_RENVOI, contenu: { type: 'tableau', cible: CIBLE_TABLEAU + chemin } })
    lireLaFile()
  }
  return { tableaux, fichiers: pasPlusQueCeQuiServe(fichiers, tableaux), avertissements }
}

/** Les fichiers que les éléments citent, et eux seuls : le reste de l'archive n'est pas envoyé. */
function pasPlusQueCeQuiServe(fichiers: Map<string, FichierARanger>, tableaux: TableauPlan[]): Map<string, FichierARanger> {
  const utiles = new Map<string, FichierARanger>()
  for (const t of tableaux) {
    for (const e of t.elements) {
      const c = e.contenu
      if ((c.type === 'image' || c.type === 'fichier') && c.fichier.startsWith(CIBLE_FICHIER)) {
        const chemin = c.fichier.slice(CIBLE_FICHIER.length)
        const f = fichiers.get(chemin)
        if (f) utiles.set(chemin, f)
      }
    }
  }
  return utiles
}

function idAleatoire(): Id {
  const octets = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('')
}
