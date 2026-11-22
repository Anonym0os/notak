import type { NoeudTexte } from '../coeur/tableau.ts'
import { blocsDepuisMarkdown } from '../blocs/collageMarkdown.ts'
import { aplatir, deplier } from '../blocs/migration.ts'

// Le texte d'une note, entre le Markdown simple qu'écrit et lit un agent et le JSON Tiptap que garde la note (les nœuds
// de `EXTENSIONS_NOTE` : StarterKit sans code en ligne, titres de niveau 1 et 2, la citation `blockquote`). Rien que des
// nœuds que l'éditeur des notes connaît : une note posée par un agent s'ouvre et s'écrit comme les autres.
//
// Le texte d'une page (l'élément `document`), plus bas, est celui du moteur de blocs : des blocs à plat, chacun avec son
// id, faits par le collage du Markdown de l'app (`blocs/collageMarkdown.ts`), et relus par l'écriture imbriquée des
// exports (`blocs/migration.ts`). Tout se charge sous Node, sans bundler : la porte des agents tourne là.

type Marque = { type: string; attrs?: Record<string, unknown> }

const texte = (t: string, marques: Marque[]): NoeudTexte => ({ type: 'text', text: t, ...(marques.length ? { marks: marques } : {}) })

/** Les formes du Markdown en ligne, avec la marque qu'elles posent ; la première trouvée dans le texte gagne. */
const FORMES: [RegExp, (m: RegExpExecArray) => { marque: Marque | null; dedans: string; brut?: true }][] = [
  // Le code en ligne n'est pas une marque des notes : son texte reste tel quel.
  [/`([^`\n]+)`/, (m) => ({ marque: null, dedans: m[1]!, brut: true })],
  [/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/, (m) => ({ marque: { type: 'link', attrs: { href: m[2]! } }, dedans: m[1]! })],
  [/\*\*(?=\S)(.+?)(?<=\S)\*\*/, (m) => ({ marque: { type: 'bold' }, dedans: m[1]! })],
  [/__(?=\S)(.+?)(?<=\S)__/, (m) => ({ marque: { type: 'bold' }, dedans: m[1]! })],
  [/~~(?=\S)(.+?)(?<=\S)~~/, (m) => ({ marque: { type: 'strike' }, dedans: m[1]! })],
  [/(?<![*\w])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![*\w])/, (m) => ({ marque: { type: 'italic' }, dedans: m[1]! })],
  [/(?<![_\w])_(?=[^\s_])(.+?)(?<=[^\s_])_(?![_\w])/, (m) => ({ marque: { type: 'italic' }, dedans: m[1]! })],
]

/** Le Markdown en ligne d'une ligne de texte, en nœuds de texte avec leurs marques. */
export function enLigne(source: string, marques: Marque[] = []): NoeudTexte[] {
  let premier: { index: number; longueur: number; marque: Marque | null; dedans: string; brut?: true } | null = null
  for (const [re, lire] of FORMES) {
    const m = re.exec(source)
    if (m && (!premier || m.index < premier.index)) premier = { index: m.index, longueur: m[0].length, ...lire(m) }
  }
  if (!premier) return source ? [texte(source, marques)] : []
  const { index, longueur, marque, dedans, brut } = premier
  const avec = marque ? [...marques, marque] : marques
  return fusionner([
    ...(index > 0 ? [texte(source.slice(0, index), marques)] : []),
    ...(brut ? [texte(dedans, avec)] : enLigne(dedans, avec)),
    ...enLigne(source.slice(index + longueur), marques),
  ])
}

/** Deux morceaux voisins aux mêmes marques n'en font qu'un, comme dans l'éditeur. */
function fusionner(n: NoeudTexte[]): NoeudTexte[] {
  const sortie: NoeudTexte[] = []
  for (const x of n) {
    const d = sortie[sortie.length - 1]
    if (d && d.type === 'text' && x.type === 'text' && JSON.stringify(d.marks ?? []) === JSON.stringify(x.marks ?? [])) d.text = `${d.text}${x.text}`
    else sortie.push({ ...x })
  }
  return sortie
}

const paragraphe = (t: string): NoeudTexte => {
  const contenu = enLigne(t)
  return contenu.length ? { type: 'paragraph', content: contenu } : { type: 'paragraph' }
}

const TITRE = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/
const CITATION = /^ {0,3}>[ \t]?(.*)$/
const ELEMENT = /^([ \t]*)([-*+•]|\d+[.)])[ \t]+(.*)$/u
const BARRE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const CLOTURE = /^ {0,3}(```|~~~)/

/** Une liste à puces ou numérotée, et ses sous-listes, par l'indentation de leurs lignes. */
interface ListeLue {
  numerotee: boolean
  items: { texte: string; sous: ListeLue[] }[]
}

function lireListe(lignes: readonly string[], debut: number): [NoeudTexte, number] {
  const largeur = (s: string) => s.replace(/\t/g, '    ').length
  const racine: ListeLue = { numerotee: /^\d/.test(ELEMENT.exec(lignes[debut]!)![2]!), items: [] }
  // La pile des listes ouvertes, avec l'indentation de leurs éléments.
  const pile: { liste: ListeLue; retrait: number }[] = [{ liste: racine, retrait: largeur(ELEMENT.exec(lignes[debut]!)![1]!) }]
  let i = debut
  for (; i < lignes.length; i++) {
    const m = ELEMENT.exec(lignes[i]!)
    if (!m) break
    const retrait = largeur(m[1]!)
    while (pile.length > 1 && retrait < pile[pile.length - 1]!.retrait) pile.pop()
    // Au premier rang, une liste d'une autre sorte (des numéros après des puces) en commence une autre.
    if (pile.length === 1 && retrait <= pile[0]!.retrait && /^\d/.test(m[2]!) !== racine.numerotee) break
    let haut = pile[pile.length - 1]!
    const dernier = haut.liste.items[haut.liste.items.length - 1]
    if (retrait > haut.retrait && dernier) {
      const sous: ListeLue = { numerotee: /^\d/.test(m[2]!), items: [] }
      dernier.sous.push(sous)
      pile.push({ liste: sous, retrait })
      haut = pile[pile.length - 1]!
    }
    haut.liste.items.push({ texte: m[3]!, sous: [] })
  }
  const enNoeud = (l: ListeLue): NoeudTexte => ({
    type: l.numerotee ? 'orderedList' : 'bulletList',
    ...(l.numerotee ? { attrs: { start: 1 } } : {}),
    content: l.items.map((it) => ({ type: 'listItem', content: [paragraphe(it.texte), ...it.sous.map(enNoeud)] })),
  })
  return [enNoeud(racine), i]
}

/**
 * Le Markdown simple d'un agent, en document de note : titres (`#` et `##`, au-delà ramenés au second niveau), listes à
 * puces et numérotées (imbriquées par l'indentation), citations, séparateurs, blocs de code, paragraphes. Une ligne
 * vide sépare deux blocs sans en faire un vide.
 */
export function docDepuisMarkdown(source: string): NoeudTexte {
  const lignes = source.replace(/\r\n?/g, '\n').split('\n')
  const contenu: NoeudTexte[] = []
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i]!
    if (!ligne.trim()) continue
    if (CLOTURE.test(ligne)) {
      const corps: string[] = []
      for (i++; i < lignes.length && !CLOTURE.test(lignes[i]!); i++) corps.push(lignes[i]!)
      contenu.push({ type: 'codeBlock', attrs: { language: null }, ...(corps.length ? { content: [{ type: 'text', text: corps.join('\n') }] } : {}) })
      continue
    }
    if (BARRE.test(ligne)) {
      contenu.push({ type: 'horizontalRule' })
      continue
    }
    const titre = TITRE.exec(ligne)
    if (titre) {
      const corps = enLigne(titre[2]!)
      contenu.push({ type: 'heading', attrs: { level: Math.min(2, titre[1]!.length) }, ...(corps.length ? { content: corps } : {}) })
      continue
    }
    if (CITATION.test(ligne)) {
      const dedans: string[] = []
      for (; i < lignes.length && CITATION.test(lignes[i]!); i++) dedans.push(CITATION.exec(lignes[i]!)![1]!)
      i--
      contenu.push({ type: 'blockquote', content: dedans.filter((l) => l.trim()).map(paragraphe) })
      continue
    }
    if (ELEMENT.test(ligne)) {
      const [liste, suite] = lireListe(lignes, i)
      contenu.push(liste)
      i = suite - 1
      continue
    }
    contenu.push(paragraphe(ligne.trim()))
  }
  return { type: 'doc', content: contenu.length ? contenu : [{ type: 'paragraph' }] }
}

/** Le document d'un titre posé sur la toile : un titre de premier niveau, centré, comme l'outil « Titre » de l'app. */
export function docDeTitre(source: string): NoeudTexte {
  const corps = enLigne(source.replace(/\s*\n\s*/g, ' ').replace(/^#+\s*/, '').trim())
  return { type: 'doc', content: [{ type: 'heading', attrs: { level: 1, textAlign: 'center' }, ...(corps.length ? { content: corps } : {}) }] }
}

// ---- Dans l'autre sens : ce qu'un agent lit d'une note ----

function marquer(n: NoeudTexte): string {
  if (n.type === 'hardBreak') return '\n'
  if (n.type === 'mention' || n.type === 'lienTableau') return typeof n.attrs?.label === 'string' ? (n.type === 'mention' ? `@${n.attrs.label}` : n.attrs.label) : ''
  if (n.text === undefined) return (n.content ?? []).map(marquer).join('')
  let t = n.text
  for (const m of n.marks ?? []) {
    if (m.type === 'bold') t = `**${t}**`
    else if (m.type === 'italic') t = `_${t}_`
    else if (m.type === 'strike') t = `~~${t}~~`
    else if (m.type === 'code') t = `\`${t}\``
    else if (m.type === 'link' && typeof m.attrs?.href === 'string') t = `[${t}](${m.attrs.href})`
  }
  return t
}

function blocEnMarkdown(n: NoeudTexte, retrait = ''): string[] {
  switch (n.type) {
    case 'heading':
      return [`${'#'.repeat(Math.min(3, Number(n.attrs?.level) || 1))} ${marquer(n)}`]
    case 'paragraph':
      return [marquer(n)]
    case 'blockquote':
    case 'encadre':
      // Une citation de page passe à la ligne dans son bloc : chaque ligne garde son chevron.
      return (n.content ?? []).flatMap((b) => blocEnMarkdown(b)).flatMap((l) => l.split('\n')).map((l) => `> ${l}`)
    case 'codeBlock':
      return [`\`\`\`${typeof n.attrs?.language === 'string' ? n.attrs.language : ''}`, ...(n.content ?? []).map((c) => c.text ?? ''), '```']
    case 'horizontalRule':
      return ['---']
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return (n.content ?? []).flatMap((item, i) => {
        const [tete, ...reste] = item.content ?? []
        const depart = Number(n.attrs?.start) || 1
        const puce = n.type === 'orderedList' ? `${depart + i}.` : n.type === 'taskList' ? `- [${item.attrs?.checked === true ? 'x' : ' '}]` : '-'
        return [`${retrait}${puce} ${tete ? marquer(tete) : ''}`, ...reste.flatMap((b) => blocEnMarkdown(b, `${retrait}  `))]
      })
    case 'table':
      return (n.content ?? []).map((ligne) => `| ${(ligne.content ?? []).map((c) => marquer(c).replace(/\n/g, ' ')).join(' | ')} |`)
    default:
      return n.content ? n.content.flatMap((b) => blocEnMarkdown(b, retrait)) : n.text ? [n.text] : []
  }
}

/** Le texte d'une note, en Markdown simple : de quoi la lire et la récrire. */
export function markdownDepuisDoc(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return ''
  const blocs = ((doc as NoeudTexte).content ?? []).map((b) => blocEnMarkdown(b).join('\n'))
  return blocs.filter((b, i) => b !== '' || i < blocs.length - 1).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Le texte brut d'un document, sans marques : un bloc par ligne. */
export function texteSimple(n: NoeudTexte | undefined): string {
  if (!n) return ''
  if (n.text !== undefined) return n.text
  return (n.content ?? []).map(texteSimple).filter((t) => t !== '').join('\n')
}

/** Un texte simple en document de paragraphes (la note d'un sujet de carte mentale), comme `docDepuisTexte`. */
export const docDeParagraphes = (t: string): NoeudTexte => ({
  type: 'doc',
  content: t.split('\n').map((ligne) => (ligne ? { type: 'paragraph', content: [{ type: 'text', text: ligne }] } : { type: 'paragraph' })),
})

// ---- Le texte d'une page ----

const ALPHABET_IDS = '0123456789abcdefghijklmnopqrstuvwxyz'

/**
 * Un id de bloc, du format de `nouvelIdBloc` (`blocs/ids.ts`, qui charge l'éditeur et ne se lit pas sous Node) : dix
 * caractères tirés au hasard. Un bloc posé par la porte se désigne ensuite par lui (`retirer_blocs`).
 */
export function idDeBloc(): string {
  const octets = crypto.getRandomValues(new Uint8Array(10))
  return Array.from(octets, (o) => ALPHABET_IDS[o % 36]).join('')
}

/** Les liens qu'une page garde : vers le web ou une adresse de courriel. Un autre (`javascript:`, `data:`…) laisse son texte. */
const LIEN_SUR = /^(https?:\/\/|mailto:)/i

function sansLiensDouteux(n: NoeudTexte): NoeudTexte {
  const { marks, content, ...reste } = n
  const gardees = marks?.filter((m) => m.type !== 'link' || (typeof m.attrs?.href === 'string' && LIEN_SUR.test(m.attrs.href)))
  return { ...reste, ...(gardees?.length ? { marks: gardees } : {}), ...(content ? { content: content.map(sansLiensDouteux) } : {}) }
}

/**
 * Le Markdown d'un agent en blocs de page, comme le colle l'app (titres jusqu'au troisième niveau, puces, numéros,
 * tâches `- [ ]`, citations, code, séparateurs, paragraphes en retrait sous une liste), chacun avec un id neuf, distinct
 * de `deja`. Une ligne vide sépare deux blocs sans en faire un vide.
 */
export function blocsDePage(source: string, deja: ReadonlySet<string> = new Set()): NoeudTexte[] {
  const vus = new Set(deja)
  return blocsDepuisMarkdown(source).map((b) => {
    let id = idDeBloc()
    while (vus.has(id)) id = idDeBloc()
    vus.add(id)
    const propre = sansLiensDouteux(b)
    return { ...propre, attrs: { ...(propre.attrs ?? {}), id } }
  })
}

/** Le texte d'une page faite de ce Markdown ; vide, celui d'une page neuve de l'app (`docVideDocument`). */
export function docDePage(source: string): NoeudTexte {
  const blocs = blocsDePage(source)
  return { type: 'doc', content: blocs.length ? blocs : [{ type: 'paragraph' }] }
}

/** Le texte d'une page en Markdown simple, celui que `docDePage` relit : de quoi la lire et la récrire. */
export function markdownDePage(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return ''
  return markdownDepuisDoc(deplier(aplatir(doc as NoeudTexte)))
}

const BLOCS_MARKDOWN = new Set(['paragraph', 'heading', 'puce', 'numero', 'tache', 'citation', 'codeBlock', 'horizontalRule'])
const EN_LIGNE_MARKDOWN = new Set(['text', 'hardBreak'])
const MARQUES_MARKDOWN = new Set(['bold', 'italic', 'strike', 'code', 'link'])
/** Les attributs que le Markdown redit, ou qui ne changent rien à ce qu'on lit (l'id, l'alignement à gauche). */
const ATTRIBUTS_MARKDOWN = new Set(['id', 'retrait', 'level', 'coche', 'language', 'depart', 'ouvert'])

/**
 * Une page dont le texte porte ce que son Markdown ne dit pas : une image, des colonnes, un tableau, un aperçu de lien,
 * un dépliant, un encadré, un passage commenté, une couleur, un lien vers un tableau ou une personne. Récrire son
 * texte d'un bloc les perdrait : on y ajoute à la fin, sans le remplacer.
 */
export function pageRiche(c: { texte?: unknown; fils?: unknown }): boolean {
  if (c.fils && typeof c.fils === 'object' && Object.keys(c.fils).length > 0) return true
  if (!c.texte || typeof c.texte !== 'object') return false
  const riche = (n: NoeudTexte, auRangDesBlocs: boolean): boolean => {
    if (n.type !== 'doc' && !(auRangDesBlocs ? BLOCS_MARKDOWN : EN_LIGNE_MARKDOWN).has(n.type)) return true
    for (const [k, v] of Object.entries(n.attrs ?? {})) {
      if (v === null || v === undefined || v === false || ATTRIBUTS_MARKDOWN.has(k) || (k === 'textAlign' && v === 'left')) continue
      return true
    }
    if (n.marks?.some((m) => !MARQUES_MARKDOWN.has(m.type))) return true
    return (n.content ?? []).some((x) => riche(x, n.type === 'doc'))
  }
  return riche(aplatir(c.texte as NoeudTexte), true)
}

/** Les ids des blocs d'une page (au premier rang, et dans ses colonnes). */
export function idsDesBlocs(doc: unknown): Set<string> {
  const ids = new Set<string>()
  const voir = (n: NoeudTexte | undefined) => {
    for (const b of n?.content ?? []) {
      if (typeof b.attrs?.id === 'string') ids.add(b.attrs.id)
      if (b.type === 'colonnes' || b.type === 'colonne') voir(b)
    }
  }
  voir(doc as NoeudTexte)
  return ids
}

/** Une page vide : un seul paragraphe, sans rien dedans (celle d'une page neuve). */
const pageVide = (doc: NoeudTexte) => {
  const blocs = doc.content ?? []
  return blocs.length === 0 || (blocs.length === 1 && blocs[0]!.type === 'paragraph' && !blocs[0]!.content?.length)
}

/** Ces blocs ajoutés à la fin de la page (à sa place, si elle était vide), dans l'écriture à plat. */
export function ajouterAPage(doc: unknown, blocs: readonly NoeudTexte[]): NoeudTexte {
  const plat = aplatir((doc && typeof doc === 'object' ? doc : { type: 'doc', content: [] }) as NoeudTexte)
  return { ...plat, type: 'doc', content: [...(pageVide(plat) ? [] : (plat.content ?? [])), ...blocs] }
}

/** La page sans ces blocs (au premier rang) ; vidée, il lui reste un paragraphe vide, comme une page neuve. */
export function retirerDePage(doc: unknown, ids: ReadonlySet<string>): { doc: NoeudTexte; retires: string[] } {
  const plat = aplatir((doc && typeof doc === 'object' ? doc : { type: 'doc', content: [] }) as NoeudTexte)
  const retires: string[] = []
  const reste = (plat.content ?? []).filter((b) => {
    const id = b.attrs?.id
    if (typeof id === 'string' && ids.has(id)) {
      retires.push(id)
      return false
    }
    return true
  })
  return { doc: { ...plat, type: 'doc', content: reste.length ? reste : [{ type: 'paragraph' }] }, retires }
}
