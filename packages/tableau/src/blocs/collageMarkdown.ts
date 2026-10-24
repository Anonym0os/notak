import type { NoeudTexte } from '../coeur/tableau'
import { decouperAdresses } from '../elements/note/conversion'

/**
 * Le Markdown qu'on colle (docs/NOTION.md § 4, relevé 1 § 10) : du texte brut sur plusieurs lignes devient des blocs à
 * plat (`plats.ts`) — titres, puces, listes numérotées, tâches, citations, code, séparateurs — et une ligne seule se lit
 * en Markdown en ligne (gras, italique, barré, code, liens, adresses). Pur : il rend des nœuds de texte, que
 * `collage.ts` pose dans la page. Les tableaux Markdown ne sont pas lus : leurs lignes restent du texte.
 */

type Marque = { type: string; attrs?: Record<string, unknown> }

/** Un morceau de texte, avec ses marques. */
const texte = (t: string, marques: Marque[]): NoeudTexte => ({ type: 'text', text: t, ...(marques.length ? { marks: marques } : {}) })

/** Les formes du Markdown en ligne, avec la marque qu'elles posent ; la première trouvée dans le texte gagne. */
const FORMES: [RegExp, (m: RegExpExecArray) => { marque: Marque | null; dedans: string }][] = [
  [/`([^`\n]+)`/, (m) => ({ marque: { type: 'code' }, dedans: m[1]! })],
  [/\[([^\]\n]+)\]\(([^\s)]+)\)/, (m) => ({ marque: { type: 'link', attrs: { href: m[2]! } }, dedans: m[1]! })],
  [/\*\*(?=\S)(.+?)(?<=\S)\*\*/, (m) => ({ marque: { type: 'bold' }, dedans: m[1]! })],
  [/__(?=\S)(.+?)(?<=\S)__/, (m) => ({ marque: { type: 'bold' }, dedans: m[1]! })],
  [/~~(?=\S)(.+?)(?<=\S)~~/, (m) => ({ marque: { type: 'strike' }, dedans: m[1]! })],
  [/(?<![*\w])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![*\w])/, (m) => ({ marque: { type: 'italic' }, dedans: m[1]! })],
  [/(?<![_\w])_(?=[^\s_])(.+?)(?<=[^\s_])_(?![_\w])/, (m) => ({ marque: { type: 'italic' }, dedans: m[1]! })],
]

/** Du texte sans forme, dont les adresses deviennent des liens. */
function simple(t: string, marques: Marque[]): NoeudTexte[] {
  if (marques.some((m) => m.type === 'code' || m.type === 'link')) return t ? [texte(t, marques)] : []
  return decouperAdresses(t).flatMap((m) => (m.texte ? [texte(m.texte, m.url ? [...marques, { type: 'link', attrs: { href: m.url } }] : marques)] : []))
}

/** Le Markdown en ligne d'une ligne de texte, en nœuds de texte avec leurs marques. */
export function enLigne(source: string, marques: Marque[] = []): NoeudTexte[] {
  let premier: { index: number; longueur: number; marque: Marque | null; dedans: string } | null = null
  for (const [re, lire] of FORMES) {
    const m = re.exec(source)
    if (m && (!premier || m.index < premier.index)) premier = { index: m.index, longueur: m[0].length, ...lire(m) }
  }
  if (!premier) return simple(source, marques)
  const { index, longueur, marque, dedans } = premier
  const avec = marque ? [...marques, marque] : marques
  return [
    ...simple(source.slice(0, index), marques),
    ...(marque?.type === 'code' ? [texte(dedans, avec)] : enLigne(dedans, avec)),
    ...enLigne(source.slice(index + longueur), marques),
  ]
}

/** Le texte contient-il du Markdown en ligne ou une adresse (de quoi le coller autrement que tel quel) ? */
export const aDuMarkdownEnLigne = (source: string): boolean => enLigne(source).some((n) => n.marks?.length)

/** Un bloc à plat, avec son retrait quand il n'est pas au premier rang. */
function bloc(type: string, attrs: Record<string, unknown>, contenu: NoeudTexte[], retrait: number): NoeudTexte {
  const a = { ...attrs, ...(retrait > 0 ? { retrait } : {}) }
  return { type, ...(Object.keys(a).length ? { attrs: a } : {}), ...(contenu.length ? { content: contenu } : {}) }
}

const LARGEUR_TAB = 4
const largeur = (blancs: string) => blancs.replace(/\t/g, ' '.repeat(LARGEUR_TAB)).length

const BARRE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const TITRE = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/
const CITATION = /^ {0,3}>[ \t]?(.*)$/
const ELEMENT = /^([ \t]*)([-*+•]|\d+[.)])[ \t]+(.*)$/u
const CASE = /^\[([ xX])\][ \t]+(.*)$/
const CLOTURE = /^ {0,3}(```|~~~)[ \t]*([\w+#.-]*)[ \t]*$/

/**
 * Les lignes de Markdown en blocs à plat. Une ligne vide sépare sans rien produire ; une ligne de texte est un
 * paragraphe ; les éléments de liste se rangent par leur indentation (`retrait`).
 */
export function blocsDepuisMarkdown(source: string): NoeudTexte[] {
  const lignes = source.replace(/\r\n?/g, '\n').split('\n')
  const sortie: NoeudTexte[] = []
  // Les indentations des listes ouvertes : le rang d'un élément est celui de la plus proche qui ne le dépasse pas.
  let pile: number[] = []
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i]!
    if (!ligne.trim()) continue
    const cloture = CLOTURE.exec(ligne)
    if (cloture) {
      const corps: string[] = []
      for (i++; i < lignes.length && !CLOTURE.test(lignes[i]!); i++) corps.push(lignes[i]!)
      sortie.push(bloc('codeBlock', { language: cloture[2] || null }, corps.length ? [{ type: 'text', text: corps.join('\n') }] : [], 0))
      pile = []
      continue
    }
    if (BARRE.test(ligne)) {
      sortie.push({ type: 'horizontalRule' })
      pile = []
      continue
    }
    const titre = TITRE.exec(ligne)
    if (titre) {
      sortie.push(bloc('heading', { level: Math.min(3, titre[1]!.length) }, enLigne(titre[2]!), 0))
      pile = []
      continue
    }
    if (CITATION.test(ligne)) {
      const dedans: NoeudTexte[] = []
      for (; i < lignes.length && CITATION.test(lignes[i]!); i++) {
        if (dedans.length) dedans.push({ type: 'hardBreak' })
        dedans.push(...enLigne(CITATION.exec(lignes[i]!)![1]!))
      }
      i--
      sortie.push(bloc('citation', {}, dedans, 0))
      pile = []
      continue
    }
    const element = ELEMENT.exec(ligne)
    if (element) {
      const l = largeur(element[1]!)
      while (pile.length && l < pile[pile.length - 1]!) pile.pop()
      if (!pile.length || l > pile[pile.length - 1]!) pile.push(l)
      const retrait = pile.length - 1
      const numerote = /^\d/.test(element[2]!)
      const caseCochee = !numerote ? CASE.exec(element[3]!) : null
      if (caseCochee) sortie.push(bloc('tache', { coche: caseCochee[1] !== ' ' }, enLigne(caseCochee[2]!), retrait))
      else sortie.push(bloc(numerote ? 'numero' : 'puce', {}, enLigne(element[3]!), retrait))
      continue
    }
    // Un texte en retrait sous un élément de liste le suit, un cran plus bas ; sinon c'est un paragraphe de premier rang.
    const blancs = /^[ \t]*/.exec(ligne)![0]
    const retrait = pile.length && largeur(blancs) > 0 ? pile.length : 0
    if (!retrait) pile = []
    sortie.push(bloc('paragraph', {}, enLigne(ligne.trim()), retrait))
  }
  return sortie
}
