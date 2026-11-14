/**
 * Chercher dans le texte d'un PDF (⌘F), sans pdf.js : le texte d'une page arrive en morceaux (ceux de son calque de
 * texte, un par bout de ligne), et un mot trouvé peut chevaucher deux morceaux. On cherche sans tenir compte des
 * accents, de la casse ni des espaces en trop, puis on rend, pour chaque résultat, les bouts de morceaux à surligner.
 */

/** Un morceau du texte d'une page, comme pdf.js le donne (`TextItem`). */
export interface MorceauTexte {
  str: string
  /** Le morceau finit sa ligne : une espace le sépare du suivant. */
  hasEOL?: boolean
}

/** Un bout de morceau à surligner : le morceau (son rang), et les caractères de `debut` à `fin` (exclue). */
export interface Bout {
  morceau: number
  debut: number
  fin: number
}

/** Un résultat : ses bouts, dans l'ordre du texte. */
export type Trouve = Bout[]

const BLANC = /\s/u

/** Un caractère tel qu'on le compare : sans accent, en minuscule. Peut en donner zéro (un accent seul) ou plusieurs. */
const plier = (c: string) => c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Le texte tel qu'on le compare (`texte`), et pour chacun de ses caractères, celui du texte d'origine dont il vient. */
export function normaliser(texte: string): { texte: string; origine: number[] } {
  let sortie = ''
  const origine: number[] = []
  let blanc = false
  let i = 0
  for (const c of texte) {
    if (BLANC.test(c)) {
      // Une suite d'espaces n'en fait qu'une.
      if (!blanc && sortie.length > 0) {
        sortie += ' '
        origine.push(i)
      }
      blanc = true
    } else {
      blanc = false
      // Une unité de sortie par unité de la chaîne (un émoji en compte deux) : `origine` s'aligne sur `texte`.
      for (const p of plier(c)) {
        sortie += p
        for (let u = 0; u < p.length; u++) origine.push(i)
      }
    }
    i += c.length
  }
  return { texte: sortie, origine }
}

/** La requête telle qu'on la cherche : normalisée, sans espace au bout. */
export const requeteNormale = (requete: string) => normaliser(requete).texte.trim()

/**
 * Les résultats de `requete` dans les morceaux d'une page, dans l'ordre, sans chevauchement. Une requête vide ne
 * trouve rien.
 */
export function chercherDansPage(morceaux: readonly MorceauTexte[], requete: string): Trouve[] {
  const q = requeteNormale(requete)
  if (!q) return []
  // Le texte de la page, morceau après morceau, et d'où vient chaque caractère (-1 : l'espace d'une fin de ligne).
  let texte = ''
  const morceauDe: number[] = []
  const rangDe: number[] = []
  for (const [m, { str, hasEOL }] of morceaux.entries()) {
    for (let k = 0; k < str.length; k++) {
      morceauDe.push(m)
      rangDe.push(k)
    }
    texte += str
    if (hasEOL) {
      texte += ' '
      morceauDe.push(-1)
      rangDe.push(-1)
    }
  }
  const { texte: n, origine } = normaliser(texte)
  const trouves: Trouve[] = []
  for (let a = n.indexOf(q); a >= 0; a = n.indexOf(q, a + q.length)) {
    const bouts = new Map<number, Bout>()
    for (let j = a; j < a + q.length; j++) {
      const o = origine[j]!
      const m = morceauDe[o]!
      if (m < 0) continue
      const k = rangDe[o]!
      // Un caractère d'origine sur deux unités (une paire de substitution) compte pour les deux.
      const finCar = k + (texte.codePointAt(o)! > 0xffff ? 2 : 1)
      const b = bouts.get(m)
      if (b) {
        b.debut = Math.min(b.debut, k)
        b.fin = Math.max(b.fin, finCar)
      } else bouts.set(m, { morceau: m, debut: k, fin: finCar })
    }
    if (bouts.size > 0) trouves.push([...bouts.values()].sort((x, y) => x.morceau - y.morceau))
  }
  return trouves
}

/**
 * Les bouts d'un morceau, à surligner, ramenés à des tranches qui ne se chevauchent pas et couvrent tout le morceau :
 * `marque` dit si la tranche est surlignée, `courant` si elle est du résultat montré.
 */
export function tranches(longueur: number, bouts: readonly (Bout & { courant?: boolean })[]): { debut: number; fin: number; marque: boolean; courant: boolean }[] {
  const tries = [...bouts].filter((b) => b.fin > b.debut).sort((a, b) => a.debut - b.debut)
  const sortie: { debut: number; fin: number; marque: boolean; courant: boolean }[] = []
  let i = 0
  for (const b of tries) {
    const debut = Math.max(i, Math.min(longueur, b.debut))
    const fin = Math.max(debut, Math.min(longueur, b.fin))
    if (debut > i) sortie.push({ debut: i, fin: debut, marque: false, courant: false })
    if (fin > debut) sortie.push({ debut, fin, marque: true, courant: !!b.courant })
    i = Math.max(i, fin)
  }
  if (i < longueur) sortie.push({ debut: i, fin: longueur, marque: false, courant: false })
  return sortie
}
