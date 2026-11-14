// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FilDAriane, type Niveau } from './FilDAriane'
import { definirLangue } from './langue'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  definirLangue('fr')
  // Sans canvas, les noms se mesurent à 7,5 px la lettre : les essais savent ce qui tient.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.restoreAllMocks()
})

const CHEMIN: Niveau[] = [
  { id: 'R', titre: 'Accueil', genre: 'accueil' },
  { id: 'S', titre: 'Silak', genre: 'dossier' },
  { id: 'C', titre: 'Clients', genre: 'dossier' },
  { id: 'P', titre: 'Projet', genre: 'toile' },
]
const ICI = { genre: 'page' as const, titre: 'Maquette' }

const rendre = (props: Partial<Parameters<typeof FilDAriane>[0]> = {}) => {
  const aller = vi.fn()
  act(() => racine.render(<FilDAriane niveaux={CHEMIN} ici={ICI} aller={aller} {...props} />))
  return aller
}
const segments = () => [...hote.querySelectorAll<HTMLButtonElement>('.notak-fil-segment')]
const noms = () => segments().map((b) => b.textContent)

describe('le fil d’Ariane', () => {
  it('chaque niveau porte l’icône de ce qu’il est devant son nom, et y mène d’un clic', () => {
    const aller = rendre()
    expect(noms()).toEqual(['Accueil', 'Silak', 'Clients', 'Projet'])
    expect(segments().map((b) => b.dataset.genre)).toEqual(['accueil', 'dossier', 'dossier', 'toile'])
    // L'accueil, la tuile à la maison de la bibliothèque ; les autres, leur icône.
    expect(segments()[0]!.querySelector('.notak-fil-accueil svg')).not.toBeNull()
    expect(segments().slice(1).every((b) => b.querySelector('svg.notak-fil-icone'))).toBe(true)
    act(() => segments()[2]!.click())
    expect(aller).toHaveBeenCalledWith('C')
  })

  it('là où l’on est, au bout : son icône et son nom, pas un bouton, et rien d’autre ne s’y dit « page courante »', () => {
    rendre()
    const ici = hote.querySelector<HTMLElement>('[aria-current="page"]')!
    expect(ici.className).toBe('notak-fil-titre')
    expect(ici.tagName).not.toBe('BUTTON')
    expect(ici.textContent).toBe('Maquette')
    expect(ici.dataset.genre).toBe('page')
    expect(ici.querySelector('svg')).not.toBeNull()
    expect(hote.querySelectorAll('[aria-current]')).toHaveLength(1)
  })

  it('ce qui montre l’endroit où l’on est peut être autre chose que son nom (un titre qu’on renomme, un h1)', () => {
    rendre({ ici: { ...ICI, contenu: <h1>Maquette</h1>, infobulle: 'Chargement…' } })
    const ici = hote.querySelector('.notak-fil-titre')!
    expect(ici.querySelector('h1')!.textContent).toBe('Maquette')
    expect(ici.getAttribute('title')).toBe('Chargement…')
  })

  it('tant qu’il tient, le chemin est entier ; sinon les niveaux du milieu passent dans « … », l’accueil et les derniers restent', () => {
    // Accueil 104, Silak 89, Clients 104, Projet 96, Maquette 111 : 504 px en tout.
    rendre({ place: 520 })
    expect(noms()).toEqual(['Accueil', 'Silak', 'Clients', 'Projet'])
    expect(hote.querySelector('.notak-fil-suspension')).toBeNull()

    rendre({ place: 400 })
    expect(noms()).toEqual(['Accueil', '', 'Projet'])
    expect(segments()[1]!.classList.contains('notak-fil-suspension')).toBe(true)

    rendre({ place: 300 })
    expect(noms()).toEqual(['Accueil', ''])
    expect(hote.querySelector('.notak-fil-titre')!.textContent).toBe('Maquette')
  })

  it('« … » ouvre le menu des niveaux cachés, chacun avec son icône ; en choisir un y mène et ferme le menu', () => {
    const aller = rendre({ place: 400 })
    const points = hote.querySelector<HTMLButtonElement>('.notak-fil-suspension')!
    expect(points.getAttribute('aria-label')).toBe('Niveaux cachés')
    act(() => points.click())
    expect(points.getAttribute('aria-expanded')).toBe('true')
    const lignes = [...hote.querySelectorAll<HTMLButtonElement>('.notak-fil-menu .notak-e')]
    expect(lignes.map((l) => l.querySelector('.notak-e-libelle')!.textContent)).toEqual(['Silak', 'Clients'])
    expect(lignes.every((l) => l.querySelector('.notak-e-icone svg'))).toBe(true)
    // Le menu prend le clavier.
    expect(document.activeElement).toBe(lignes[0])
    act(() => lignes[1]!.click())
    expect(aller).toHaveBeenCalledWith('C')
    expect(hote.querySelector('.notak-fil-menu')).toBeNull()
  })

  it('le menu de « … » se ferme à Échap et à un appui dehors', () => {
    rendre({ place: 400 })
    const points = hote.querySelector<HTMLButtonElement>('.notak-fil-suspension')!
    act(() => points.click())
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(hote.querySelector('.notak-fil-menu')).toBeNull()
    act(() => points.click())
    act(() => void document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })))
    expect(hote.querySelector('.notak-fil-menu')).toBeNull()
  })

  it('au téléphone, rien que l’endroit où l’on est', () => {
    rendre({ seulIci: true })
    expect(segments()).toHaveLength(0)
    expect(hote.querySelector('.notak-fil-titre')!.textContent).toBe('Maquette')
  })

  it('chaque niveau reçoit les attributs de qui s’en sert : la cible d’un dépôt', () => {
    rendre({ attributs: (n) => ({ 'data-depot-tableau': n.id }) })
    expect(segments().map((b) => b.dataset.depotTableau)).toEqual(['R', 'S', 'C', 'P'])
  })

  it('le titre dessous (un dossier de la bibliothèque) : le même chemin, qui a toute la place pour lui', () => {
    // Le chemin seul : 104 + 89 + 104 + 96 = 393 px ; avec l'endroit où l'on est, il ne tiendrait pas.
    rendre({ titreDessous: true, place: 400 })
    expect(hote.querySelector('nav')!.classList.contains('notak-fil-dessous')).toBe(true)
    expect(noms()).toEqual(['Accueil', 'Silak', 'Clients', 'Projet'])
    expect(hote.querySelector('.notak-fil-titre')!.textContent).toBe('Maquette')
    rendre({ titreDessous: true, place: 300 })
    expect(noms()).toEqual(['Accueil', '', 'Projet'])
  })

  it('une toile privée garde son cadenas dans le fil, après son nom, et le lecteur d’écran l’entend', () => {
    rendre({ niveaux: CHEMIN.map((n) => (n.id === 'C' ? { ...n, prive: true } : n)), ici: { ...ICI, prive: true } })
    const cadenas = [...hote.querySelectorAll('.notak-fil-prive')]
    expect(cadenas).toHaveLength(2)
    expect(cadenas[0]!.closest('.notak-fil-segment')!.textContent).toBe('Clients')
    expect(cadenas[0]!.previousElementSibling!.className).toBe('notak-fil-nom')
    expect(cadenas[0]!.getAttribute('aria-label')).toBe('Privée : seules les personnes invitées l’ouvrent')
    expect(cadenas[1]!.closest('.notak-fil-titre')).not.toBeNull()
    // Les autres niveaux n'en ont pas.
    expect(segments()[1]!.querySelector('.notak-fil-prive')).toBeNull()
  })

  it('un niveau sans titre se dit « Sans titre »', () => {
    rendre({ niveaux: [{ id: 'R', titre: '', genre: 'toile' }], ici: { genre: 'toile', titre: '' } })
    expect(noms()).toEqual(['Sans titre'])
    expect(hote.querySelector('.notak-fil-titre')!.textContent).toBe('Sans titre')
  })
})
