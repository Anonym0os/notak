import { describe, expect, it } from 'vitest'
import type { Image } from '../../coeur/tableau'
import { type Pixels, avecDetourage, couleurDuBord, detourer, sansDetourage } from './detourage'

/** Une petite image en mémoire : `ImageData` n'existe pas ici, sa forme suffit. */
function image(largeur: number, hauteur: number, couleur: (x: number, y: number) => [number, number, number]): Pixels {
  const data = new Uint8ClampedArray(largeur * hauteur * 4)
  for (let y = 0; y < hauteur; y++)
    for (let x = 0; x < largeur; x++) data.set([...couleur(x, y), 255], (y * largeur + x) * 4)
  return { data, width: largeur, height: hauteur }
}
const alpha = (r: { data: Uint8ClampedArray }, largeur: number, x: number, y: number) => r.data[(y * largeur + x) * 4 + 3]!

const BLANC: [number, number, number] = [255, 255, 255]
const ROUGE: [number, number, number] = [200, 30, 30]
// 10 x 10, blanc, un carré rouge de 4 x 4 au milieu (de 3 à 6).
const carre = (x: number, y: number) => (x >= 3 && x <= 6 && y >= 3 && y <= 6 ? ROUGE : BLANC)

describe('couleurDuBord', () => {
  it('prend le milieu des pixels du pourtour', () => {
    expect(couleurDuBord(image(10, 10, carre))).toEqual(BLANC)
  })
  it('ne se laisse pas tromper par quelques pixels du bord', () => {
    expect(couleurDuBord(image(10, 10, (x, y) => (x === 0 && y < 2 ? ROUGE : BLANC)))).toEqual(BLANC)
  })
})

describe('detourer', () => {
  it('retire le fond uni et garde l’objet', () => {
    const r = detourer(image(10, 10, carre), 20)
    expect(alpha(r, 10, 0, 0)).toBe(0)
    expect(alpha(r, 10, 9, 5)).toBe(0)
    expect(alpha(r, 10, 4, 4)).toBe(255)
    expect(r.retires).toBe(100 - 16)
  })

  it('laisse la source intacte et garde les couleurs', () => {
    const source = image(10, 10, carre)
    const avant = Array.from(source.data as Uint8ClampedArray)
    const r = detourer(source, 20)
    expect(Array.from(source.data as Uint8ClampedArray)).toEqual(avant)
    expect([...r.data.slice((4 * 10 + 4) * 4, (4 * 10 + 4) * 4 + 3)]).toEqual(ROUGE)
  })

  it('garde ce qui est enfermé dans l’objet, même de la couleur du fond', () => {
    // Un anneau rouge autour d’un trou blanc : le trou ne touche pas le bord.
    const anneau = (x: number, y: number): [number, number, number] =>
      x >= 2 && x <= 7 && y >= 2 && y <= 7 && !(x >= 4 && x <= 5 && y >= 4 && y <= 5) ? ROUGE : BLANC
    const r = detourer(image(10, 10, anneau), 20)
    expect(alpha(r, 10, 0, 0)).toBe(0)
    expect(alpha(r, 10, 4, 4)).toBe(255)
  })

  it('suit la tolérance : un fond légèrement dégradé part seulement si elle est assez large', () => {
    const degrade = image(10, 10, (x, y) => (carre(x, y) === ROUGE ? ROUGE : [255 - x * 4, 255 - x * 4, 255 - x * 4]))
    const etroit = detourer(degrade, 0)
    expect(alpha(etroit, 10, 0, 0) === 0 && alpha(etroit, 10, 9, 0) === 0).toBe(false)
    const large = detourer(degrade, 30)
    expect(alpha(large, 10, 0, 0)).toBe(0)
    expect(alpha(large, 10, 9, 0)).toBe(0)
  })

  it('adoucit le contour : un pixel entre le fond et l’objet reste en partie transparent', () => {
    const rose: [number, number, number] = [255, 235, 235]
    const r = detourer(image(10, 10, (x, y) => (x === 3 && y >= 3 && y <= 6 ? rose : carre(x, y))), 10)
    const a = alpha(r, 10, 3, 4)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(255)
  })

  it('ne retire rien quand le bord n’a rien d’uni', () => {
    const bruit = image(8, 8, (x, y) => ((x + y) % 2 === 0 ? [0, 0, 0] : [255, 255, 255]))
    // Le milieu du pourtour tombe sur l’un des deux ; avec une tolérance nulle, seule la moitié des pixels part, jamais l’autre.
    const r = detourer(bruit, 0)
    expect(r.retires).toBeLessThan(64)
  })

  it('ne casse pas sur une image vide ou d’un pixel', () => {
    expect(detourer({ data: new Uint8ClampedArray(0), width: 0, height: 0 }, 20).retires).toBe(0)
    expect(detourer(image(1, 1, () => BLANC), 20).retires).toBe(1)
  })
})

const base: Image = { type: 'image', fichier: 'f1', largeurOrigine: 400, hauteurOrigine: 300, typeMime: 'image/jpeg', legende: 'Théière', rotation: 90 }

describe('avecDetourage / sansDetourage', () => {
  it('prend le nouveau fichier en gardant l’ancien, la légende et la rotation', () => {
    const d = avecDetourage({ ...base, tailles: [{ largeur: 400, fichier: 't1' }] }, 'f2', { largeur: 400, hauteur: 300 })
    expect(d).toMatchObject({ fichier: 'f2', typeMime: 'image/png', transparente: true, legende: 'Théière', rotation: 90 })
    expect(d.tailles).toBeUndefined()
    expect(d.original).toEqual({ fichier: 'f1', largeurOrigine: 400, hauteurOrigine: 300, typeMime: 'image/jpeg', tailles: [{ largeur: 400, fichier: 't1' }] })
  })

  it('détourer de nouveau garde le tout premier fichier', () => {
    const une = avecDetourage(base, 'f2', { largeur: 400, hauteur: 300 })
    const deux = avecDetourage(une, 'f3', { largeur: 400, hauteur: 300 })
    expect(deux.fichier).toBe('f3')
    expect(deux.original?.fichier).toBe('f1')
  })

  it('rétablir rend l’image telle qu’elle était', () => {
    expect(sansDetourage(avecDetourage(base, 'f2', { largeur: 400, hauteur: 300 }))).toEqual(base)
  })

  it('rétablir une image jamais détourée ne change rien', () => {
    expect(sansDetourage(base)).toBe(base)
  })
})
