import type { FormatCellule, Table } from '../../coeur/tableau'
import { type Regional, hexSurlignage, hexTexte, saisir } from './formats'
import { morceaux, passagesDe } from './riche'
import {
  COLONNES_MAX,
  LIGNES_MAX,
  type Plage,
  type Reecrire,
  formatsDe,
  insererColonnes,
  insererLignes,
  nombreColonnes,
  normaliserPlage,
} from './grille'

/** Ce qui voyage d'un copier à un coller. */
export interface DonneesCollage {
  cellules: string[][]
  /** De même forme que `cellules`. Absent : pas de mise en forme (texte seul, ou « coller les valeurs »). */
  formats?: (FormatCellule | null)[][]
  /** Vrai si les données viennent d'une table de Notak : les cellules sont déjà typées, on ne les déduit pas. */
  notak?: boolean
}

export const ATTRIBUT_DONNEES = 'data-notak-table'

/** Les cellules et les formats de la plage, rognés à la table. */
function extraire(t: Table, plage: Plage): { cellules: string[][]; formats: (FormatCellule | null)[][] } {
  const p = normaliserPlage(plage)
  const formats = formatsDe(t)
  const l1 = Math.max(p.l1, 0)
  const c1 = Math.max(p.c1, 0)
  const l2 = Math.min(p.l2, t.cellules.length - 1)
  const c2 = Math.min(p.c2, nombreColonnes(t.cellules) - 1)
  const cellules: string[][] = []
  const fs: (FormatCellule | null)[][] = []
  for (let l = l1; l <= l2; l++) {
    cellules.push(t.cellules[l]!.slice(c1, c2 + 1))
    fs.push(formats[l]!.slice(c1, c2 + 1))
  }
  return { cellules, formats: fs }
}

/** Le texte copié : des tabulations entre les cellules, un retour à la ligne entre les lignes ; entre guillemets si la cellule en contient. */
export function versTexte(t: Table, plage: Plage): string {
  const champ = (v: string) => (/[\t\n\r"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return extraire(t, plage)
    .cellules.map((l) => l.map(champ).join('\t'))
    .join('\n')
}

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function styleCss(f: FormatCellule | null): string {
  if (!f) return ''
  const css: string[] = []
  if (f.fond) css.push(`background:${f.fond === 'entete' ? '#d1d3d6' : f.fond}`)
  if (f.couleur) css.push(`color:${hexTexte(f.couleur)}`)
  if (f.surligne) css.push(`background:${hexSurlignage(f.surligne)}`)
  if (f.alignement) css.push(`text-align:${f.alignement === 'gauche' ? 'left' : f.alignement === 'droite' ? 'right' : 'center'}`)
  if (f.gras) css.push('font-weight:bold')
  if (f.italique) css.push('font-style:italic')
  if (f.barre) css.push('text-decoration:line-through')
  return css.length ? ` style="${css.join(';')}"` : ''
}

/** Le corps d'une cellule en HTML : son texte, avec ses passages (gras, lien, couleur…) s'il en a. */
function corpsCellule(texte: string, f: FormatCellule | null): string {
  const saut = (s: string) => echapper(s).replace(/\n/g, '<br>')
  const passages = passagesDe(f, texte)
  if (passages.length === 0) return saut(texte)
  return morceaux(texte, passages)
    .map((m) => {
      let h = saut(m.texte)
      if (m.couleur) h = `<span style="color:${hexTexte(m.couleur)}">${h}</span>`
      else if (m.surligne) h = `<span style="background:${hexSurlignage(m.surligne)}">${h}</span>`
      if (m.barre) h = `<s>${h}</s>`
      if (m.italique) h = `<i>${h}</i>`
      if (m.gras) h = `<b>${h}</b>`
      if (m.lien) h = `<a href="${echapper(m.lien)}">${h}</a>`
      return h
    })
    .join('')
}

/** Le HTML copié : une `<table>` lisible par les autres applications, qui porte aussi nos données complètes. */
export function versHtml(t: Table, plage: Plage): string {
  const { cellules, formats } = extraire(t, plage)
  const donnees = echapper(JSON.stringify({ cellules, formats }))
  const lignes = cellules
    .map((l, i) => `<tr>${l.map((v, j) => `<td${styleCss(formats[i]![j]!)}>${corpsCellule(v, formats[i]![j]!)}</td>`).join('')}</tr>`)
    .join('')
  return `<table ${ATTRIBUT_DONNEES}="${donnees}"><tbody>${lignes}</tbody></table>`
}

/* ───────────── Lire ce qu'on colle ───────────── */

function rectangle(lignes: string[][]): string[][] {
  const colonnes = Math.max(1, ...lignes.map((l) => l.length))
  return lignes.map((l) => [...l, ...Array<string>(colonnes - l.length).fill('')])
}

/** Un texte à tabulations (guillemets compris) en grille rectangulaire. */
function lireTexte(texte: string): string[][] {
  const lignes: string[][] = []
  let ligne: string[] = []
  let champ = ''
  let entre = false
  let debut = true
  const s = texte.replace(/\r\n?/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (entre) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          champ += '"'
          i++
        } else entre = false
      } else champ += c
    } else if (c === '"' && debut) {
      entre = true
      debut = false
    } else if (c === '\t') {
      ligne.push(champ)
      champ = ''
      debut = true
    } else if (c === '\n') {
      ligne.push(champ)
      lignes.push(ligne)
      ligne = []
      champ = ''
      debut = true
    } else {
      champ += c
      debut = false
    }
  }
  if (champ !== '' || ligne.length || !lignes.length) {
    ligne.push(champ)
    lignes.push(ligne)
  }
  return rectangle(lignes)
}

/** Le texte d'une cellule HTML : espaces ramenés à un, `<br>` et blocs en retours à la ligne. */
function texteDe(noeud: Node): string {
  let sortie = ''
  const BLOCS = new Set(['P', 'DIV', 'LI'])
  const marche = (n: Node) => {
    if (n.nodeType === 3) sortie += (n.textContent ?? '').replace(/[ \t\r\n]+/g, ' ')
    else if (n.nodeType === 1) {
      const nom = (n as Element).tagName
      if (nom === 'BR') sortie += '\n'
      else {
        if (BLOCS.has(nom) && sortie !== '' && !sortie.endsWith('\n')) sortie += '\n'
        n.childNodes.forEach(marche)
      }
    }
  }
  marche(noeud)
  return sortie.replace(/ *\n */g, '\n').replace(/^[ \n]+|[ \n]+$/g, '')
}

function formatHtml(cellule: Element): FormatCellule | null {
  const gras = (e: Element) => e.matches('b,strong') || /font-weight\s*:\s*(bold|[6-9]00)/i.test(e.getAttribute('style') ?? '')
  const italique = (e: Element) => e.matches('i,em') || /font-style\s*:\s*italic/i.test(e.getAttribute('style') ?? '')
  const tous = [cellule, ...Array.from(cellule.querySelectorAll('*'))]
  const f: FormatCellule = {}
  if (tous.some(gras)) f.gras = true
  if (tous.some(italique)) f.italique = true
  return Object.keys(f).length ? f : null
}

/** Ce qu'un collage déplie au plus : une feuille de 10 000 lignes sur 20 colonnes. */
const CASES_MAX = 200_000

/** Une `<table>` de tableur en grille : `colspan` et `rowspan` dépliés en cases vides, `<th>` lu comme `<td>`. */
function lireTable(table: Element): { cellules: string[][]; formats: (FormatCellule | null)[][] } | null {
  const lignes = Array.from(table.querySelectorAll('tr')).filter((tr) => tr.closest('table') === table)
  if (!lignes.length) return null
  const cellules: string[][] = []
  const formats: (FormatCellule | null)[][] = []
  const occupee = new Set<string>()
  // Ce qu'on colle vient d'ailleurs : une seule case `rowspan=10000 colspan=1000` déplierait dix millions de cases.
  // Au-delà de la plus grande table que Notak sait tenir, le reste est ignoré.
  let cases = 0
  lignes.forEach((tr, i) => {
    if (cases >= CASES_MAX) return
    cellules[i] ??= []
    formats[i] ??= []
    let j = 0
    for (const cellule of Array.from(tr.children).filter((e) => e.tagName === 'TD' || e.tagName === 'TH')) {
      while (occupee.has(`${i},${j}`)) j++
      const largeur = Math.max(1, Math.min(Number(cellule.getAttribute('colspan')) || 1, COLONNES_MAX))
      const hauteur = Math.max(1, Math.min(Number(cellule.getAttribute('rowspan')) || 1, LIGNES_MAX))
      if ((cases += largeur * hauteur) > CASES_MAX) return
      for (let a = 0; a < hauteur; a++)
        for (let b = 0; b < largeur; b++) {
          const [l, c] = [i + a, j + b]
          occupee.add(`${l},${c}`)
          cellules[l] ??= []
          formats[l] ??= []
          cellules[l]![c] = a === 0 && b === 0 ? texteDe(cellule) : ''
          formats[l]![c] = a === 0 && b === 0 ? formatHtml(cellule) : null
        }
      j += largeur
    }
  })
  const colonnes = Math.max(1, ...cellules.map((l) => l.length))
  const rond = <T>(m: (T | undefined)[][], vide: T): T[][] =>
    Array.from({ length: m.length }, (_, i) => Array.from({ length: colonnes }, (_, j) => m[i]?.[j] ?? vide))
  return { cellules: rond(cellules, ''), formats: rond(formats, null) }
}

function lireDonneesNotak(table: Element): DonneesCollage | null {
  try {
    const brut = JSON.parse(table.getAttribute(ATTRIBUT_DONNEES) ?? '') as { cellules?: unknown; formats?: unknown }
    const { cellules, formats } = brut
    if (!Array.isArray(cellules) || !cellules.every((l) => Array.isArray(l) && l.every((v) => typeof v === 'string'))) return null
    const rect = rectangle(cellules as string[][])
    const fs = Array.isArray(formats)
      ? rect.map((l, i) => l.map((_, j) => ((formats as unknown[][])[i]?.[j] as FormatCellule | null | undefined) ?? null))
      : undefined
    return { cellules: rect, ...(fs ? { formats: fs } : {}), notak: true }
  } catch {
    return null
  }
}

/**
 * Ce qu'il y a dans le presse-papiers, du plus riche au plus pauvre : nos propres données, une table HTML de
 * tableur, un texte à tabulations (les cellules à retour à la ligne entre guillemets).
 */
export function lireCollage(html: string | null | undefined, texte: string): DonneesCollage {
  if (html && typeof DOMParser !== 'undefined') {
    const table = new DOMParser().parseFromString(html, 'text/html').querySelector('table')
    if (table) {
      const notres = table.hasAttribute(ATTRIBUT_DONNEES) ? lireDonneesNotak(table) : null
      if (notres) return notres
      const lue = lireTable(table)
      if (lue) return { cellules: lue.cellules, ...(lue.formats.some((l) => l.some(Boolean)) ? { formats: lue.formats } : {}) }
    }
  }
  return { cellules: lireTexte(texte) }
}

/**
 * Colle `donnees` à partir de la cellule `ancre` ; la grille s'agrandit si ça dépasse (dans ses bornes). Les données
 * de Notak se posent telles quelles. Les autres passent par `saisir` : le type se déduit du texte, sur le format
 * collé ou, sans format (coller les valeurs), sur celui que la cellule avait. `reecrire` décale les formules collées.
 */
export function coller(
  t: Table,
  ancre: { l: number; c: number },
  donnees: DonneesCollage,
  reecrire?: Reecrire,
  langue: Regional = 'fr',
): Table {
  const hauteur = donnees.cellules.length
  const largeur = Math.max(0, ...donnees.cellules.map((l) => l.length))
  if (!hauteur || !largeur || ancre.l < 0 || ancre.c < 0) return t
  let table = t
  const besoinL = Math.min(ancre.l + hauteur, LIGNES_MAX)
  const besoinC = Math.min(ancre.c + largeur, COLONNES_MAX)
  if (besoinL > table.cellules.length) table = insererLignes(table, table.cellules.length, besoinL - table.cellules.length)
  if (besoinC > nombreColonnes(table.cellules)) table = insererColonnes(table, nombreColonnes(table.cellules), besoinC - nombreColonnes(table.cellules))
  const cellules = table.cellules.map((l) => [...l])
  const formats = formatsDe(table)
  for (let i = 0; i < hauteur; i++)
    for (let j = 0; j < largeur; j++) {
      const [l, c] = [ancre.l + i, ancre.c + j]
      if (l >= cellules.length || c >= (cellules[0]?.length ?? 0)) continue
      let texte = donnees.cellules[i]?.[j] ?? ''
      if (texte.startsWith('=') && reecrire) texte = reecrire(texte)
      if (donnees.notak) {
        cellules[l]![c] = texte
        const f = donnees.formats?.[i]?.[j]
        formats[l]![c] = f ? { ...f } : null
      } else {
        // Venue d'ailleurs, la cellule repart de zéro : son ancien format s'en va, son type se déduit du texte.
        const base = donnees.formats ? (donnees.formats[i]?.[j] ?? null) : null
        const s = saisir(base, texte, langue)
        cellules[l]![c] = s.texte
        formats[l]![c] = s.format
      }
    }
  return { ...table, cellules, formats }
}

/* ───────────── Recopie ───────────── */

const modulo = (a: number, n: number) => ((a % n) + n) % n

/**
 * Recopie la plage `source` sur la plage `cible` (qui peut la recouvrir), comme Milanote : les valeurs et les formats
 * se répètent en motif (1, 2 donne 1, 2, 1, 2), une formule passe par `translater(texte, décalageLignes,
 * décalageColonnes)`. La grille ne grandit pas.
 */
export function recopier(
  t: Table,
  source: Plage,
  cible: Plage,
  translater?: (texte: string, dl: number, dc: number) => string,
): Table {
  const s = normaliserPlage(source)
  const c = normaliserPlage(cible)
  const lignesSource = s.l2 - s.l1 + 1
  const colonnesSource = s.c2 - s.c1 + 1
  const colonnes = nombreColonnes(t.cellules)
  if (s.l1 < 0 || s.c1 < 0 || s.l2 >= t.cellules.length || s.c2 >= colonnes) return t
  const cellules = t.cellules.map((l) => [...l])
  const formats = formatsDe(t)
  const origine = t.cellules
  const formatsOrigine = formatsDe(t)
  for (let l = Math.max(c.l1, 0); l <= Math.min(c.l2, t.cellules.length - 1); l++)
    for (let k = Math.max(c.c1, 0); k <= Math.min(c.c2, colonnes - 1); k++) {
      const relL = l - s.l1
      const relC = k - s.c1
      const sl = s.l1 + modulo(relL, lignesSource)
      const sc = s.c1 + modulo(relC, colonnesSource)
      if (sl === l && sc === k) continue
      const brut = origine[sl]![sc]!
      if (brut.startsWith('=') && translater) cellules[l]![k] = translater(brut, l - sl, k - sc)
      else cellules[l]![k] = brut
      const f = formatsOrigine[sl]![sc]
      formats[l]![k] = f ? { ...f } : null
    }
  return { ...t, cellules, formats }
}
