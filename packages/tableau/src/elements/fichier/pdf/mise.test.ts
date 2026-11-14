import { describe, expect, it } from 'vitest'
import {
  ECART_PAGES,
  MARGE_PAGES,
  PX_PAR_POINT,
  ZOOM_MAX,
  ZOOM_MIN,
  bornerZoom,
  defilementApresZoom,
  densiteDeDessin,
  disposer,
  largeurUsuelle,
  lireNumeroPage,
  pageCourante,
  pagesADessiner,
  pointDuDocument,
  pourcent,
  yDuPoint,
  zoomAjuste,
  zoomInitial,
  zoomSuivant,
} from './mise'

const A4 = { largeur: 595, hauteur: 842 }
const pages = (n: number) => Array.from({ length: n }, () => A4)

describe('la colonne des pages', () => {
  it('pose les pages l’une sous l’autre, avec leurs écarts et les marges', () => {
    const d = disposer([A4, { largeur: 842, hauteur: 595 }, A4], 1)
    expect(d.hauts).toEqual([MARGE_PAGES, MARGE_PAGES + 842 + ECART_PAGES, MARGE_PAGES + 842 + 595 + 2 * ECART_PAGES])
    expect(d.total).toBe(2 * MARGE_PAGES + 842 * 2 + 595 + 2 * ECART_PAGES)
    // La plus large des pages donne sa largeur à la colonne.
    expect(d.largeur).toBe(842 + 2 * MARGE_PAGES)
  })

  it('l’échelle grandit les pages, pas les écarts', () => {
    const d = disposer(pages(2), 2)
    expect(d.hauteurs).toEqual([1684, 1684])
    expect(d.hauts[1]! - d.hauts[0]!).toBe(1684 + ECART_PAGES)
  })

  it('sans page, rien à dessiner', () => {
    expect(pagesADessiner(disposer([], 1), 0, 800)).toBeNull()
  })
})

describe('les pages à dessiner', () => {
  const d = disposer(pages(200), 1)
  const pas = 842 + ECART_PAGES

  it('au début : la première et la suivante, plus une d’avance', () => {
    expect(pagesADessiner(d, 0, 900)).toEqual({ premiere: 0, derniere: 2 })
  })

  it('au milieu d’un long document, seulement les pages proches de la vue', () => {
    const haut = MARGE_PAGES + 100 * pas + 10
    const t = pagesADessiner(d, haut, 900)!
    expect(t).toEqual({ premiere: 99, derniere: 102 })
    expect(t.derniere - t.premiere).toBeLessThan(5)
  })

  it('une vue qui commence dans l’écart sous une page ne la compte plus', () => {
    const haut = MARGE_PAGES + 842 + 4
    expect(pagesADessiner(d, haut, 100, 0)).toEqual({ premiere: 1, derniere: 1 })
  })

  it('à la fin, rien au-delà de la dernière page', () => {
    expect(pagesADessiner(d, d.total - 500, 500, 2)).toEqual({ premiere: 197, derniere: 199 })
  })
})

describe('la page courante', () => {
  const d = disposer(pages(10), 1)
  it('est celle qui occupe le plus de la vue', () => {
    expect(pageCourante(d, 0, 800)).toBe(0)
    // La vue montre le bas de la page 1 (200 px) et le haut de la page 2 (584 px).
    expect(pageCourante(d, MARGE_PAGES + 642, 800)).toBe(1)
  })
  it('sans page, la première', () => {
    expect(pageCourante(disposer([], 1), 0, 800)).toBe(0)
  })
})

describe('le zoom', () => {
  it('ses crans, sans s’arrêter sur celui qu’on touche presque', () => {
    expect(zoomSuivant(1, 1)).toBe(1.1)
    expect(zoomSuivant(1, -1)).toBe(0.9)
    expect(zoomSuivant(1.098, 1)).toBe(1.25)
    expect(zoomSuivant(0.87, 1)).toBe(0.9)
    expect(zoomSuivant(ZOOM_MAX, 1)).toBe(ZOOM_MAX)
    expect(zoomSuivant(ZOOM_MIN, -1)).toBe(ZOOM_MIN)
  })

  it('reste entre ses bornes, même quand on lui donne n’importe quoi', () => {
    expect(bornerZoom(40)).toBe(ZOOM_MAX)
    expect(bornerZoom(0)).toBe(ZOOM_MIN)
    expect(bornerZoom(Number.NaN)).toBe(1)
  })

  it('ajusté à la largeur : la page prend la vue, marges comprises', () => {
    const z = zoomAjuste(595, 1000)
    expect(595 * PX_PAR_POINT * z + 2 * MARGE_PAGES).toBeCloseTo(1000)
  })

  it('s’ajuste sur la largeur que portent le plus de pages, pas sur une page à l’italienne isolée', () => {
    expect(largeurUsuelle([A4, { largeur: 842, hauteur: 595 }, A4])).toBe(595)
    expect(largeurUsuelle([A4, { largeur: 842, hauteur: 595 }])).toBe(842)
    expect(largeurUsuelle([])).toBe(0)
  })

  it('à l’ouverture : ajusté sur un téléphone, jamais plus grand que la taille réelle sur un grand écran', () => {
    expect(zoomInitial(595, 375)).toBeCloseTo(zoomAjuste(595, 375))
    expect(zoomInitial(595, 2400)).toBe(1)
  })

  it('se dit en pourcentage', () => {
    expect(pourcent(1.25)).toBe('125 %')
    expect(pourcent(0.666)).toBe('67 %')
  })
})

describe('le défilement autour du zoom', () => {
  it('un point du document survit au changement d’échelle', () => {
    const avant = disposer(pages(5), 1)
    const apres = disposer(pages(5), 2)
    const y = avant.hauts[3]! + 200
    const p = pointDuDocument(avant, y)
    expect(p.page).toBe(3)
    expect(yDuPoint(apres, p)).toBeCloseTo(apres.hauts[3]! + 400)
  })

  it('le point sous le pointeur reste sous le pointeur', () => {
    const avant = disposer(pages(5), 1)
    const apres = disposer(pages(5), 1.5)
    const defile = { x: 0, y: avant.hauts[2]! + 100 }
    const ancre = { x: 400, y: 300 }
    const suite = defilementApresZoom(defile, ancre, avant, apres, 1000)
    const vise = pointDuDocument(avant, defile.y + ancre.y)
    expect(pointDuDocument(apres, suite.y + ancre.y).page).toBe(vise.page)
    expect(pointDuDocument(apres, suite.y + ancre.y).fraction).toBeCloseTo(vise.fraction)
  })

  it('pendant un pincement, le point suit les doigts', () => {
    const avant = disposer(pages(3), 1)
    const apres = disposer(pages(3), 1)
    const suite = defilementApresZoom({ x: 0, y: 500 }, { x: 200, y: 300 }, avant, apres, 1000, { x: 200, y: 250 })
    expect(suite.y).toBe(550)
  })

  it('une colonne plus étroite que la vue ne défile pas en largeur', () => {
    const d = disposer(pages(2), 1)
    expect(defilementApresZoom({ x: 0, y: 0 }, { x: 500, y: 0 }, d, d, 2000).x).toBe(0)
  })
})

describe('la saisie d’un numéro de page', () => {
  it('ramène le numéro entre 1 et le nombre de pages', () => {
    expect(lireNumeroPage('12', 200)).toBe(12)
    expect(lireNumeroPage(' 0 ', 200)).toBe(1)
    expect(lireNumeroPage('999', 200)).toBe(200)
  })
  it('ne prend pas ce qui n’est pas un nombre', () => {
    expect(lireNumeroPage('abc', 200)).toBeNull()
    expect(lireNumeroPage('', 200)).toBeNull()
    expect(lireNumeroPage('3', 0)).toBeNull()
  })
})

describe('la densité du dessin', () => {
  it('celle de l’écran, tant que la toile reste raisonnable', () => {
    expect(densiteDeDessin(800, 1100, 2)).toBe(2)
  })
  it('moins, quand la page zoomée ferait une toile trop grande', () => {
    const k = densiteDeDessin(4000, 5600, 3)
    expect(k).toBeLessThan(1)
    expect(4000 * k * 5600 * k).toBeCloseTo(8_000_000, -2)
  })
})
