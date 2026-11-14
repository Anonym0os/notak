import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { optionsDocument } from '../../../packages/tableau/src/elements/fichier/pdf/ressources'
import { DOSSIERS_PDF, fichierDeLAdresse, fichiersPdf, racinePdfjs, ressourcesPdf } from './plugin'

const racine = racinePdfjs()

describe('les ressources de pdf.js que l’application sert', () => {
  it('sont les CMaps, les polices standard et le décodeur JPEG 2000 du paquet, sous /pdfjs/', () => {
    const fichiers = fichiersPdf()
    expect(fichiers.some((f) => f.chemin === 'pdfjs/cmaps/UniJIS-UCS2-H.bcmap')).toBe(true)
    expect(fichiers.some((f) => f.chemin === 'pdfjs/standard_fonts/FoxitDingbats.pfb')).toBe(true)
    expect(fichiers.some((f) => f.chemin === 'pdfjs/wasm/openjpeg.wasm')).toBe(true)
    expect(fichiers.some((f) => f.chemin === 'pdfjs/wasm/openjpeg_nowasm_fallback.js')).toBe(true)
    expect(new Set(fichiers.map((f) => f.chemin.split('/')[1]))).toEqual(new Set(DOSSIERS_PDF))
  })

  it('le repli JavaScript se sert comme un module, le wasm comme du wasm', () => {
    const plugin = ressourcesPdf()
    let milieu: (req: { url?: string }, res: { setHeader(n: string, v: string): void; end(d: Buffer): void }, suite: () => void) => void = () => {}
    ;(plugin.configureServer as (s: unknown) => void)({ middlewares: { use: (f: typeof milieu) => (milieu = f) } })
    const type = (url: string) => {
      let t = ''
      milieu({ url }, { setHeader: (n, v) => n === 'content-type' && (t = v), end: () => {} }, () => {})
      return t
    }
    expect(type('/pdfjs/wasm/openjpeg_nowasm_fallback.js')).toBe('text/javascript')
    expect(type('/pdfjs/wasm/openjpeg.wasm')).toBe('application/wasm')
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

// ---- Une image JPEG 2000 : par le wasm là où il est permis, par son repli JavaScript sous la CSP de Notak. ----

/** Un PDF d'une page qui ne porte qu'une image JPX de 60 × 40 px : trois bandes, rouge, verte et bleue. */
function pdfJpx(): Uint8Array {
  const image = readFileSync(new URL('./essai-bandes.jp2', import.meta.url))
  const entete = new TextEncoder()
  const morceaux: Uint8Array[] = []
  const positions: number[] = []
  let longueur = 0
  const ecrire = (o: string | Uint8Array) => {
    const b = typeof o === 'string' ? entete.encode(o) : o
    morceaux.push(b)
    longueur += b.length
  }
  const flux = 'q 300 0 0 200 0 0 cm /Im1 Do Q'
  const objets: (string | [string, Uint8Array])[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>',
    [`<< /Type /XObject /Subtype /Image /Width 60 /Height 40 /BitsPerComponent 8 /Filter /JPXDecode /Length ${image.length} >>\nstream\n`, image],
    `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`,
  ]
  ecrire('%PDF-1.5\n')
  objets.forEach((o, i) => {
    positions.push(longueur)
    ecrire(`${i + 1} 0 obj\n`)
    if (typeof o === 'string') ecrire(o)
    else {
      ecrire(o[0])
      ecrire(o[1])
      ecrire('\nendstream')
    }
    ecrire('\nendobj\n')
  })
  const xref = longueur
  ecrire(`xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${positions.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`)
  ecrire(`trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const sortie = new Uint8Array(longueur)
  let i = 0
  for (const m of morceaux) {
    sortie.set(m, i)
    i += m.length
  }
  return sortie
}

interface PageImage {
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>
  objs: { get(id: unknown, rappel: (o: unknown) => void): void }
}
interface PdfjsImage {
  OPS: { paintImageXObject: number }
  getDocument(o: object): { promise: Promise<{ getPage(n: number): Promise<PageImage>; destroy(): Promise<void> }> }
}
/** Les pixels de l'image de la page, décodée par pdf.js, ou `null` s'il n'a pas su la lire. */
async function imageDecodee(options: object): Promise<{ largeur: number; pixel(x: number): number[] } | null> {
  const p = (await pdfjs()) as unknown as PdfjsImage
  const doc = await p.getDocument({ data: pdfJpx(), verbosity: 0, ...options }).promise
  try {
    const page = await doc.getPage(1)
    const ops = await page.getOperatorList()
    const i = ops.fnArray.indexOf(p.OPS.paintImageXObject)
    if (i < 0) return null
    const image = (await new Promise<unknown>((ok) => page.objs.get(ops.argsArray[i]![0], ok))) as { width: number; data?: Uint8ClampedArray; kind?: number } | null
    if (!image?.data) return null
    // Trois octets par pixel (RVB), ou quatre (RVBA) selon ce que pdf.js a produit.
    const parPixel = image.data.length / (image.width * 40)
    return { largeur: image.width, pixel: (x) => [...image.data!.slice(x * parPixel, x * parPixel + 3)] }
  } finally {
    await doc.destroy()
  }
}

describe('une image JPEG 2000 dans un PDF', () => {
  // Le dossier que l'application sert sous /pdfjs/wasm/ ; pdf.js pour Node le lit comme une adresse `file:`.
  const dossierWasm = `${pathToFileURL(join(fichierDeLAdresse('/pdfjs/wasm/openjpeg_nowasm_fallback.js')!, '..')).href}/`
  const proche = (a: number[], b: number[]) => a.every((v, k) => Math.abs(v - b[k]!) < 24)

  it('par le repli JavaScript, celui que la CSP de Notak laisse tourner, elle se décode en ses vraies couleurs', async () => {
    const image = await imageDecodee({ wasmUrl: dossierWasm, useWasm: false })
    expect(image?.largeur).toBe(60)
    expect(proche(image!.pixel(5), [230, 40, 40])).toBe(true)
    expect(proche(image!.pixel(30), [40, 170, 60])).toBe(true)
    expect(proche(image!.pixel(55), [40, 80, 220])).toBe(true)
  })

  it('par le wasm, là où il est permis, elle se décode de même', async () => {
    const image = await imageDecodee({ wasmUrl: dossierWasm, useWasm: true })
    expect(proche(image!.pixel(30), [40, 170, 60])).toBe(true)
  })

  it('sans le décodeur, pdf.js ne la lit pas : la page resterait blanche à sa place', async () => {
    expect(await imageDecodee({})).toBeNull()
  })
})
