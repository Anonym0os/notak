import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { optionsDocument } from '../../../packages/tableau/src/elements/fichier/pdf/ressources'
import { DOSSIERS_PDF, fichierDeLAdresse, fichiersPdf, racinePdfjs, ressourcesPdf } from './plugin'

const racine = racinePdfjs()

describe('les ressources de pdf.js que l’application sert', () => {
  it('sont les CMaps et les polices standard du paquet, sous /pdfjs/', () => {
    const fichiers = fichiersPdf()
    expect(fichiers.some((f) => f.chemin === 'pdfjs/cmaps/UniJIS-UCS2-H.bcmap')).toBe(true)
    expect(fichiers.some((f) => f.chemin === 'pdfjs/standard_fonts/FoxitDingbats.pfb')).toBe(true)
    expect(new Set(fichiers.map((f) => f.chemin.split('/')[1]))).toEqual(new Set(DOSSIERS_PDF))
  })

  it('une adresse de /pdfjs/ mène au fichier du paquet, et rien d’autre', () => {
    expect(fichierDeLAdresse('/pdfjs/cmaps/UniGB-UCS2-H.bcmap?v=3')).toBe(join(racine, 'cmaps', 'UniGB-UCS2-H.bcmap'))
    expect(fichierDeLAdresse('/pdfjs/cmaps/../package.json')).toBeNull()
    expect(fichierDeLAdresse('/pdfjs/cmaps/%2E%2E%2Fpackage.json')).toBeNull()
    expect(fichierDeLAdresse('/pdfjs/build/pdf.mjs')).toBeNull()
    expect(fichierDeLAdresse('/pdfjs/cmaps/absente.bcmap')).toBeNull()
    expect(fichierDeLAdresse('/assets/index.js')).toBeNull()
  })

  it('en développement, Vite les sert ; le reste passe au suivant', () => {
    const plugin = ressourcesPdf()
    let milieu: (req: { url?: string }, res: { setHeader(n: string, v: string): void; end(d: Buffer): void }, suite: () => void) => void = () => {}
    ;(plugin.configureServer as (s: unknown) => void)({ middlewares: { use: (f: typeof milieu) => (milieu = f) } })
    const entetes: Record<string, string> = {}
    let corps: Buffer | undefined
    const suite = vi.fn()
    milieu({ url: '/pdfjs/standard_fonts/LiberationSans-Regular.ttf' }, { setHeader: (n, v) => (entetes[n] = v), end: (d) => (corps = d) }, suite)
    expect(entetes['content-type']).toBe('font/ttf')
    expect(corps?.equals(readFileSync(join(racine, 'standard_fonts', 'LiberationSans-Regular.ttf')))).toBe(true)
    milieu({ url: '/t/abc' }, { setHeader: () => {}, end: () => {} }, suite)
    expect(suite).toHaveBeenCalledTimes(1)
  })

  it('au build, chacun est copié tel quel dans le dossier construit', () => {
    const emis: { fileName: string; source: Uint8Array }[] = []
    ;(ressourcesPdf().generateBundle as (this: unknown) => void).call({ emitFile: (f: { fileName: string; source: Uint8Array }) => emis.push(f) })
    expect(emis).toHaveLength(fichiersPdf().length)
    const cmap = emis.find((f) => f.fileName === 'pdfjs/cmaps/UniJIS-UCS2-H.bcmap')!
    expect(Buffer.from(cmap.source).equals(readFileSync(join(racine, 'cmaps', 'UniJIS-UCS2-H.bcmap')))).toBe(true)
  })
})

// ---- pdf.js lui-même, avec ce que l'application sert : le texte japonais et chinois, les polices standard. ----

/** Un PDF d'une page, sans police embarquée : `polices` en objets 4, 5…, le flux de la page en dernier. */
function pdf(flux: string, polices: string[], extra: string[] = []): Uint8Array {
  const noms = polices.map((_, i) => `/F${i + 1} ${i + 4} 0 R`).join(' ')
  const objets = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << ${noms} >> >> /Contents ${polices.length + 4} 0 R >>`,
    ...polices,
    `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`,
    ...extra,
  ]
  let s = '%PDF-1.4\n'
  const positions: number[] = []
  objets.forEach((o, i) => {
    positions.push(s.length)
    s += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = s.length
  s += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${positions.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`
  s += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(s)
}

/** Une police CJK non embarquée, à la CMap prédéfinie : ce que pdf.js ne lit qu'avec les CMaps. */
const cjk = (police: string, cmap: string, ordre: string) => [
  [`<< /Type /Font /Subtype /Type0 /BaseFont /${police} /Encoding /${cmap} /DescendantFonts [6 0 R] >>`],
  [
    `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /${police} /CIDSystemInfo << /Registry (Adobe) /Ordering (${ordre}) /Supplement 4 >> /FontDescriptor 7 0 R >>`,
    `<< /Type /FontDescriptor /FontName /${police} /Flags 6 /FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>`,
  ],
]

const BASE = 'https://notak.test/t/abc'
const adresseVersFichier = (url: string) => fichierDeLAdresse(new URL(url).pathname)

/** Ce que le navigateur ferait : lire les CMaps et les polices aux adresses que la toile donne, servies par le plugin. */
class CMapsDuSite {
  constructor(private o: { baseUrl: string; isCompressed: boolean }) {}
  async fetch({ name }: { name: string }) {
    const f = adresseVersFichier(`${this.o.baseUrl}${name}.bcmap`)
    if (!f) throw new Error(`CMap absente : ${name}`)
    return { cMapData: new Uint8Array(readFileSync(f)), isCompressed: this.o.isCompressed }
  }
}
class PolicesDuSite {
  constructor(private o: { baseUrl: string }) {}
  async fetch({ filename }: { filename: string }) {
    const f = adresseVersFichier(`${this.o.baseUrl}${filename}`)
    if (!f) throw new Error(`police absente : ${filename}`)
    return new Uint8Array(readFileSync(f))
  }
}

/** Ce que ces essais touchent de pdf.js (sa construction pour Node, prise dans le paquet de la toile). */
interface PagePdf {
  getTextContent(): Promise<{ items: { str?: string }[] }>
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>
  commonObjs: { get(id: unknown): unknown }
}
interface Pdfjs {
  OPS: { setFont: number }
  getDocument(o: object): { promise: Promise<{ getPage(n: number): Promise<PagePdf>; destroy(): Promise<void> }> }
}
const pdfjs = (): Promise<Pdfjs> => import(/* @vite-ignore */ pathToFileURL(join(racine, 'legacy', 'build', 'pdf.mjs')).href)

async function ouvrir(octets: Uint8Array, avecRessources: boolean) {
  const p = await pdfjs()
  const options = avecRessources ? { ...optionsDocument(BASE), CMapReaderFactory: CMapsDuSite, StandardFontDataFactory: PolicesDuSite } : { isEvalSupported: false }
  return { p, doc: await p.getDocument({ data: octets, verbosity: 0, fontExtraProperties: true, ...(options as object) }).promise }
}

async function texte(octets: Uint8Array, avecRessources: boolean): Promise<string> {
  const { doc } = await ouvrir(octets, avecRessources)
  try {
    const page = await doc.getPage(1)
    return (await page.getTextContent()).items.map((i) => i.str ?? '').join('')
  } finally {
    await doc.destroy()
  }
}

describe('pdf.js et les ressources servies', () => {
  const [japonais, japonaisExtra] = cjk('KozMinPr6N-Regular', 'UniJIS-UCS2-H', 'Japan1')
  const [chinois, chinoisExtra] = cjk('STSong-Light', 'UniGB-UCS2-H', 'GB1')

  it('le japonais d’une police non embarquée se lit avec les CMaps, et disparaît sans', async () => {
    const octets = pdf('BT /F1 24 Tf 20 100 Td <65E5672C8A9E> Tj ET', japonais!, japonaisExtra)
    expect(await texte(octets.slice(), true)).toBe('日本語')
    expect(await texte(octets.slice(), false)).toBe('')
  })

  it('le chinois aussi', async () => {
    expect(await texte(pdf('BT /F1 24 Tf 20 100 Td <4E2D6587> Tj ET', chinois!, chinoisExtra), true)).toBe('中文')
  })

  it('les polices standard non embarquées (Helvetica, Times, Symbol, ZapfDingbats) viennent de l’application', async () => {
    const polices = ['Helvetica', 'Times-Roman', 'Symbol', 'ZapfDingbats'].map((p) => `<< /Type /Font /Subtype /Type1 /BaseFont /${p} >>`)
    const flux = 'BT /F1 18 Tf 20 170 Td (Helvetica) Tj ET BT /F2 18 Tf 20 130 Td (Times) Tj ET BT /F3 18 Tf 20 90 Td (abg) Tj ET BT /F4 18 Tf 20 50 Td (4) Tj ET'
    const etat = async (avec: boolean) => {
      const { p, doc } = await ouvrir(pdf(flux, polices), avec)
      try {
        const page = await doc.getPage(1)
        const ops = await page.getOperatorList()
        const vues: string[] = []
        ops.fnArray.forEach((fn, i) => {
          if (fn !== p.OPS.setFont) return
          const f = page.commonObjs.get(ops.argsArray[i]![0]) as { name: string; missingFile: boolean }
          vues.push(`${f.name}:${f.missingFile ? 'manque' : 'là'}`)
        })
        return vues
      } finally {
        await doc.destroy()
      }
    }
    expect(await etat(true)).toEqual(['Helvetica:là', 'Times-Roman:là', 'Symbol:là', 'ZapfDingbats:là'])
    expect(await etat(false)).toEqual(['Helvetica:manque', 'Times-Roman:manque', 'Symbol:manque', 'ZapfDingbats:manque'])
  })
})
