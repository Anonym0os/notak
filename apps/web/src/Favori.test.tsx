// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Favori } from './Favori'

vi.mock('./api', async (origine) => ({
  ...(await origine<typeof import('./api')>()),
  listerFavoris: async () => [{ id: 't' }],
  definirFavori: async () => {},
  noterVu: async () => {},
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLDivElement
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

// Le chemin passe par une variable : écrit en dur dans `new URL`, Vite le changerait en adresse d'asset.
const lire = (fichier: string) => readFileSync(new URL(fichier, import.meta.url), 'utf8')
const regle = (css: string, selecteur: string) => {
  const debut = css.indexOf(`${selecteur} {`)
  expect(debut).toBeGreaterThan(-1)
  return css.slice(debut, css.indexOf('}', debut))
}

describe('l’étoile du tableau ouvert', () => {
  it('en favori, est pleine et jaune, sans le rond sombre d’un bouton enfoncé de l’îlot', async () => {
    await act(async () => racine.render(<Favori tableau="t" accueil="r" />))
    const etoile = hote.querySelector<HTMLButtonElement>('.bouton-etoile')!
    expect(etoile.getAttribute('aria-pressed')).toBe('true')
    // Le jaune est celui de l'icône (`notak-ico-favori`, toile.css), qu'aucune couleur du bouton ne recouvre.
    expect(etoile.querySelector('svg')!.classList.contains('notak-ico-favori')).toBe(true)
    // Plus précise que le bouton enfoncé des îlots (`.notak-ilot :is(…)[aria-pressed='true']`, ilots.css), la règle de
    // l'étoile l'emporte quel que soit l'ordre des feuilles.
    const enfoncee = regle(lire('./app.css'), ".notak-ilot .bouton.bouton-etoile[aria-pressed='true']")
    expect(enfoncee).toMatch(/background: transparent;/)
    expect(enfoncee).toMatch(/color: inherit;/)
  })

  it('n’est pas sur l’accueil', async () => {
    await act(async () => racine.render(<Favori tableau="r" accueil="r" />))
    expect(hote.querySelector('.bouton-etoile')).toBeNull()
  })
})
