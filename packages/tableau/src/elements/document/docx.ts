import type { NoeudTexte } from '../../coeur/tableau'

/**
 * L'export Word (.docx), fabriqué sur place : un .docx est une archive ZIP de trois fichiers XML, que l'on écrit sans
 * compression (méthode « stocké »). Le texte garde les titres, le gras, l'italique, le barré, le souligné, le code,
 * les listes, les citations et les séparations ; rien de plus.
 */

const encodeur = new TextEncoder()

const TABLE_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(octets: Uint8Array): number {
  let c = 0xffffffff
  for (const o of octets) c = TABLE_CRC[(c ^ o) & 255]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Une archive ZIP sans compression : les fichiers l'un après l'autre, puis le répertoire central. */
export function zipStocke(fichiers: readonly { nom: string; contenu: Uint8Array }[]): Uint8Array {
  const morceaux: Uint8Array[] = []
  const centrale: Uint8Array[] = []
  let decalage = 0
  const u16 = (v: DataView, o: number, n: number) => v.setUint16(o, n, true)
  const u32 = (v: DataView, o: number, n: number) => v.setUint32(o, n, true)
  for (const f of fichiers) {
    const nom = encodeur.encode(f.nom)
    const crc = crc32(f.contenu)
    const local = new Uint8Array(30 + nom.length)
    const l = new DataView(local.buffer)
    u32(l, 0, 0x04034b50)
    u16(l, 4, 20)
    u16(l, 6, 0x0800)
    u32(l, 14, crc)
    u32(l, 18, f.contenu.length)
    u32(l, 22, f.contenu.length)
    u16(l, 26, nom.length)
    local.set(nom, 30)
    morceaux.push(local, f.contenu)
    const entree = new Uint8Array(46 + nom.length)
    const e = new DataView(entree.buffer)
    u32(e, 0, 0x02014b50)
    u16(e, 4, 20)
    u16(e, 6, 20)
    u16(e, 8, 0x0800)
    u32(e, 16, crc)
    u32(e, 20, f.contenu.length)
    u32(e, 24, f.contenu.length)
    u16(e, 28, nom.length)
    u32(e, 42, decalage)
    entree.set(nom, 46)
    centrale.push(entree)
    decalage += local.length + f.contenu.length
  }
  const tailleCentrale = centrale.reduce((n, c) => n + c.length, 0)
  const fin = new Uint8Array(22)
  const d = new DataView(fin.buffer)
  u32(d, 0, 0x06054b50)
  u16(d, 8, fichiers.length)
  u16(d, 10, fichiers.length)
  u32(d, 12, tailleCentrale)
  u32(d, 16, decalage)
  const tout = [...morceaux, ...centrale, fin]
  const sortie = new Uint8Array(tout.reduce((n, c) => n + c.length, 0))
  let o = 0
  for (const c of tout) {
    sortie.set(c, o)
    o += c.length
  }
  return sortie
}

const echapper = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

/** Un morceau de texte, avec les marques qu'il porte. `base` : propriétés du paragraphe (titre, code). */
function trace(n: NoeudTexte, base: string): string {
  const m = new Set((n.marks ?? []).map((x) => x.type))
  const props = base + (m.has('bold') ? '<w:b/>' : '') + (m.has('italic') ? '<w:i/>' : '') + (m.has('strike') ? '<w:strike/>' : '') + (m.has('underline') ? '<w:u w:val="single"/>' : '') + (m.has('code') ? '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>' : '')
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${echapper(n.text ?? '')}</w:t></w:r>`
}

function traces(n: NoeudTexte, base: string): string {
  if (n.type === 'hardBreak') return '<w:r><w:br/></w:r>'
  if (n.text !== undefined) return trace(n, base)
  if (n.type === 'mention' || n.type === 'lienTableau') return trace({ type: 'text', text: texteDe(n) }, base)
  return (n.content ?? []).map((c) => traces(c, base)).join('')
}

const texteDe = (n: NoeudTexte): string => n.text ?? (n.content ?? []).map(texteDe).join('') + (n.attrs?.label ? String(n.attrs.label) : '')

const paragraphe = (runs: string, props = '') => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${runs}</w:p>`
const retrait = (niveau: number) => (niveau > 0 ? `<w:ind w:left="${niveau * 540}"/>` : '')

function blocs(noeuds: readonly NoeudTexte[], niveau: number): string[] {
  return noeuds.flatMap((n) => bloc(n, niveau))
}

function bloc(n: NoeudTexte, niveau: number): string[] {
  switch (n.type) {
    case 'paragraph':
      return [paragraphe(traces(n, ''), retrait(niveau))]
    case 'heading': {
      const taille = Number(n.attrs?.level ?? 1) === 1 ? 36 : 30
      return [paragraphe(traces(n, `<w:b/><w:sz w:val="${taille}"/>`), `<w:spacing w:before="240" w:after="120"/>${retrait(niveau)}`)]
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return (n.content ?? []).flatMap((item, i) => {
        const marque = n.type === 'orderedList' ? `${Number(n.attrs?.start ?? 1) + i}. ` : n.type === 'taskList' ? (item.attrs?.checked === true ? '☑ ' : '☐ ') : '• '
        const [premier, ...reste] = item.content ?? []
        const tete = premier ? [paragraphe(trace({ type: 'text', text: marque }, '') + traces(premier, ''), `<w:ind w:left="${(niveau + 1) * 540}" w:hanging="360"/>`)] : []
        return [...tete, ...blocs(reste, niveau + 1)]
      })
    case 'blockquote':
      return blocs(n.content ?? [], niveau + 1)
    case 'codeBlock':
      return texteDe(n)
        .split('\n')
        .map((ligne) => paragraphe(trace({ type: 'text', text: ligne }, '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>'), retrait(niveau)))
    case 'horizontalRule':
      return [paragraphe('', '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr>')]
    default:
      return n.content ? blocs(n.content, niveau) : n.text ? [paragraphe(trace(n, ''))] : []
  }
}

/** Le document Word : le titre en gros, puis le texte. Rend les octets du fichier .docx. */
export function documentEnDocx(titre: string, texte: NoeudTexte): Uint8Array {
  const corps = [
    ...(titre.trim() ? [paragraphe(trace({ type: 'text', text: titre.trim() }, '<w:b/><w:sz w:val="44"/>'), '<w:spacing w:after="240"/>')] : []),
    ...blocs(texte.type === 'doc' ? (texte.content ?? []) : [texte], 0),
  ].join('')
  const xml = (contenu: string) => encodeur.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${contenu}`)
  return zipStocke([
    {
      nom: '[Content_Types].xml',
      contenu: xml(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
    },
    {
      nom: '_rels/.rels',
      contenu: xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    },
    {
      nom: 'word/document.xml',
      contenu: xml(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corps}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`),
    },
  ])
}
