import { describe, expect, it } from 'vitest'
import type { TraitPage } from '../../../coeur/tableau'
import { OPACITE_SURLIGNEUR } from '../../croquis/trace'
import { type MoteurExport, OPACITE_CRAYON, ajouterTraits, annotationEncre, cheminEncre, nomAnnote, rvb } from './exportPdf'

const trait = (points: [number, number][], plus: Partial<TraitPage> = {}): TraitPage => ({ id: 't', couleur: '#ff5757', epaisseur: 0.01, points, ...plus })
/** Une page A4 droite : le haut de l'écran est le haut de la page, l'axe y du PDF monte. */
const A4 = { largeur: 595, hauteur: 842, versPdf: (x: number, y: number): [number, number] => [x, 842 - y] }

describe('le tracé d’une annotation Ink', () => {
  it('un point seul fait un rond : un départ, sans courbe', () => {
    expect(cheminEncre([[10, 20]])).toEqual({ lines: [NaN, NaN, NaN, NaN, 10, 20], points: [10, 20] })
  })

  it('deux points : un segment droit', () => {
    expect(cheminEncre([[0, 0], [30, 60]]).lines).toEqual([NaN, NaN, NaN, NaN, 0, 0, NaN, NaN, NaN, NaN, 30, 60])
  })

  it('au-delà, les milieux lissés de la visionneuse, en courbes de Bézier cubiques', () => {
    const { lines, points } = cheminEncre([[0, 0], [30, 0], [30, 30]])
    // Départ, une cubique de (0,0) vers le milieu (30,15) contrôlée par (30,0), puis le dernier segment droit.
    expect(lines.slice(0, 6)).toEqual([NaN, NaN, NaN, NaN, 0, 0])
    expect(lines.slice(6, 12)).toEqual([20, 0, 30, 5, 30, 15])
    expect(lines.slice(12)).toEqual([NaN, NaN, NaN, NaN, 30, 30])
    expect(points).toEqual([0, 0, 30, 0, 30, 30])
  })
})

describe('l’annotation d’un trait', () => {
  it('en coordonnées PDF, de son épaisseur, de sa couleur, presque opaque', () => {
    const a = annotationEncre(trait([[0.1, 0.1], [0.5, 0.1]]), 2, A4, 15)
    expect(a).toMatchObject({ annotationType: 15, pageIndex: 2, color: [255, 87, 87], thickness: 5.95, opacity: OPACITE_CRAYON, rotation: 0 })
    expect(a.paths.points).toEqual([[59.5, 757.8, 297.5, 757.8]])
    // Le cadre tient le trait et la moitié de son épaisseur.
    expect(a.rect).toEqual([55.53, 753.83, 301.48, 761.78])
  })

  it('le surligneur garde sa transparence ; une couleur venue d’ailleurs qui n’en est pas une retombe sur l’encre', () => {
    expect(annotationEncre(trait([[0.5, 0.5]], { surligneur: true }), 0, A4, 15).opacity).toBe(OPACITE_SURLIGNEUR)
    expect(rvb('javascript:alert(1)')).toEqual(rvb('#323b4a'))
    expect(rvb('#00ff80')).toEqual([0, 255, 128])
  })

  it('le nom du fichier annoté', () => {
    expect(nomAnnote('devis.pdf', 'annoté')).toBe('devis (annoté).pdf')
    expect(nomAnnote('sans extension', 'annoté')).toBe('sans extension (annoté).pdf')
  })
})

// ---- Avec pdf.js lui-même (sa construction pour Node) : le PDF produit porte bien les traits, que tout lecteur lit. ----

/** Un PDF de trois pages, la deuxième tournée d'un quart de tour, la troisième au MediaBox décalé. */
function pdf(): Uint8Array {
  const pages = [
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Rotate 90 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [100 200 400 600] >>',
  ]
  const objets = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>', ...pages]
  let s = '%PDF-1.4\n'
  const pos: number[] = []
  objets.forEach((o, i) => {
    pos.push(s.length)
    s += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = s.length
  s += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`
  s += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(s)
}

interface Ink {
  subtype: string
  inkLists: Float32Array[]
  color: Uint8ClampedArray
  opacity: number
  rect: number[]
}
/** pdf.js pour Node, tel que ces essais le lisent : ouvrir un document, en lire les annotations d'une page. */
interface PdfjsLecture {
  getDocument(o: object): { promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getAnnotations(): Promise<Ink[]> }>; destroy(): Promise<void> }> }
}
const pdfjsNode = () => import('pdfjs-dist/legacy/build/pdf.mjs')
const pdfjs = async () => (await pdfjsNode()) as unknown as MoteurExport
const lecteur = async () => (await pdfjsNode()) as unknown as PdfjsLecture

async function annotationsDe(octets: Uint8Array, page: number): Promise<Ink[]> {
  const p = await lecteur()
  const doc = await p.getDocument({ data: octets, verbosity: 0 }).promise
  try {
    return await (await doc.getPage(page)).getAnnotations()
  } finally {
    await doc.destroy()
  }
}

describe('le PDF annoté, relu par pdf.js', () => {
  it('chaque trait devient une annotation Ink de sa page, là où on l’a dessiné, rotation et décalage compris', async () => {
    const annotations = {
      '1': [trait([[0.1, 0.1], [0.5, 0.1]]), trait([[0.2, 0.9]], { id: 's', couleur: '#ffd14d', surligneur: true, epaisseur: 0.03 })],
      '2': [trait([[0.25, 0.5]], { id: 'r' })],
      '3': [trait([[0.5, 0.5]], { id: 'd' })],
      '9': [trait([[0.5, 0.5]], { id: 'hors du document' })],
    }
    const sortie = await ajouterTraits(await pdfjs(), pdf(), annotations, { verbosity: 0 })
    expect(new TextDecoder().decode(sortie.slice(0, 5))).toBe('%PDF-')

    const p1 = await annotationsDe(sortie.slice(), 1)
    expect(p1.map((a) => a.subtype)).toEqual(['Ink', 'Ink'])
    expect([...p1[0]!.inkLists[0]!]).toEqual([59.5, 757.7999877929688, 297.5, 757.7999877929688])
    expect([...p1[0]!.color]).toEqual([255, 87, 87])
    expect(p1[1]!.opacity).toBeCloseTo(OPACITE_SURLIGNEUR)
    // La page tournée : montrée en paysage (842 × 595), le point au quart de sa largeur, à mi-hauteur, tombe dans le
    // PDF à mi-largeur de la page droite, au quart de sa hauteur depuis le bas.
    const [x2, y2] = (await annotationsDe(sortie.slice(), 2))[0]!.inkLists[0]!
    expect([x2, y2].map((v) => Math.round(v!))).toEqual([298, 211])
    // Le MediaBox décalé : le milieu de la page est au milieu de sa boîte.
    const [x3, y3] = (await annotationsDe(sortie.slice(), 3))[0]!.inkLists[0]!
    expect([x3, y3]).toEqual([250, 400])
  })

  it('le document d’origine reste dessous : ses pages, rien de plus ni de moins', async () => {
    const sortie = await ajouterTraits(await pdfjs(), pdf(), { '1': [trait([[0.5, 0.5]])] }, { verbosity: 0 })
    const p = await lecteur()
    const doc = await p.getDocument({ data: sortie, verbosity: 0 }).promise
    expect(doc.numPages).toBe(3)
    await doc.destroy()
  })
})
