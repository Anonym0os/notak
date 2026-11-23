// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { jouerFin, jouerSortieFin } from './jouer'

/** Un écran de fin comme celui que monte `EcranDeFin` : son fond, la carte, la vignette de « Merci ». */
function ecranDeFin() {
  const fin = document.createElement('div')
  fin.className = 'notak-arbre-diapo-fin'
  fin.style.backgroundColor = 'var(--notak-arbre-fond)'
  fin.innerHTML = '<svg class="notak-arbre-diapo-fin-carte"></svg><div class="notak-arbre-diapo-fin-vignette"></div>'
  document.body.append(fin)
  return { fin, carte: fin.querySelector<SVGSVGElement>('.notak-arbre-diapo-fin-carte')!, vignette: fin.querySelector<HTMLElement>('.notak-arbre-diapo-fin-vignette')! }
}

afterEach(() => document.body.replaceChildren())

describe('l’écran de fin', () => {
  it('paraît depuis le transparent, puis garde son fond une fois l’apparition finie', async () => {
    const { fin } = ecranDeFin()
    const jeu = jouerFin(null, fin)
    expect(fin.style.getPropertyValue('background-color')).toBe('rgba(0, 0, 0, 0)')
    jeu.achever()
    expect(await jeu.fini).toBe(true)
    expect(fin.style.getPropertyValue('background-color')).toBe('var(--notak-arbre-fond)')
  })

  it('en sortant, efface la carte et la vignette, pas son fond : on ne repasse pas par le noir de la scène', async () => {
    const { fin, carte, vignette } = ecranDeFin()
    const jeu = jouerSortieFin(fin)
    expect([carte.style.opacity, vignette.style.opacity, fin.style.opacity]).toEqual(['1', '1', ''])
    jeu.achever()
    expect(await jeu.fini).toBe(true)
    // Cachées jusqu'à ce que la présentation se referme, pour ne pas reparaître le temps d'une image.
    expect([carte.style.visibility, vignette.style.visibility]).toEqual(['hidden', 'hidden'])
    expect([fin.style.visibility, fin.style.opacity, fin.style.getPropertyValue('background-color')]).toEqual(['', '', 'var(--notak-arbre-fond)'])
  })
})
