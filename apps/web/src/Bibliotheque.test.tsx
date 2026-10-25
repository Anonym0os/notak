// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { EntreeBibliotheque } from './api'
import { PageBibliotheque, adresseDe, entreesDe } from './Bibliotheque'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const entree = (e: Partial<EntreeBibliotheque> & Pick<EntreeBibliotheque, 'tableau' | 'titre'>): EntreeBibliotheque => {
  const genre = e.genre ?? 'toile'
  return {
    element: null,
    genre,
    ou: null,
    vu: null,
    favori: false,
    partage: false,
    resume:
      genre === 'toile'
        ? { genre, element: '', titre: e.titre, boites: [[0, 0, 34, 6, 'jaune']] }
        : genre === 'arbre'
          ? { genre, element: e.element ?? 'a', titre: e.titre, branches: ['Une', 'Deux', 'Trois'] }
          : { genre, element: e.element ?? 'd', titre: e.titre, lignes: ['Première ligne'] },
    ...e,
  }
}

const TOUTES: EntreeBibliotheque[] = [
  entree({ tableau: 'voyage', titre: 'Voyage', vu: 10, favori: true }),
  entree({ tableau: 'atelier', titre: 'atelier' }),
  entree({ tableau: 'budget', titre: 'Budget', partage: true, vu: 30 }),
  entree({ tableau: 'voyage', element: 'plan', genre: 'arbre', titre: 'Plan', ou: 'Voyage', vu: 20 }),
  entree({ tableau: 'voyage', element: 'notes', genre: 'document', titre: '', ou: 'Voyage' }),
]

describe('entreesDe', () => {
  it('trie par dernière ouverture, puis par titre, sans tenir à la casse', () => {
    expect(entreesDe('toiles', TOUTES).map((e) => e.titre)).toEqual(['Budget', 'Voyage', 'atelier'])
    expect(entreesDe('recents', TOUTES).map((e) => e.titre)).toEqual(['Budget', 'Plan', 'Voyage'])
  })

  it('range chaque genre dans son onglet, favoris et partages compris', () => {
    expect(entreesDe('cartes', TOUTES).map((e) => e.titre)).toEqual(['Plan'])
    expect(entreesDe('documents', TOUTES).map((e) => e.element)).toEqual(['notes'])
    expect(entreesDe('favoris', TOUTES).map((e) => e.tableau)).toEqual(['voyage'])
    expect(entreesDe('partages', TOUTES).map((e) => e.tableau)).toEqual(['budget'])
  })

  it('ouvre une toile à son adresse, un élément en grand sur la sienne', () => {
    expect(adresseDe(TOUTES[0]!)).toBe('/t/voyage')
    expect(adresseDe(TOUTES[3]!)).toBe('/t/voyage/e/plan')
  })
})

describe('la page', () => {
  let hote: HTMLDivElement
  let racine: Root
  beforeEach(() => {
    definirLangue('fr')
    history.replaceState(null, '', '/bibliotheque')
    hote = document.createElement('div')
    document.body.append(hote)
    racine = createRoot(hote)
  })
  afterEach(() => {
    act(() => racine.unmount())
    hote.remove()
  })

  const ouvrir = async (charger: () => Promise<EntreeBibliotheque[]>) => {
    await act(async () => racine.render(<PageBibliotheque charger={charger} />))
  }
  const onglet = (nom: string) => [...hote.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent?.startsWith(nom))!
  const cartes = () => [...hote.querySelectorAll<HTMLAnchorElement>('.biblio-carte')].map((a) => [a.querySelector('.biblio-carte-titre')!.textContent, a.getAttribute('href')])

  it('s’ouvre sur les récents ; chaque onglet dit combien il en a', async () => {
    await ouvrir(async () => TOUTES)
    expect(onglet('Récents').getAttribute('aria-selected')).toBe('true')
    expect(onglet('Toiles').textContent).toBe('Toiles3')
    expect(onglet('Favoris').textContent).toBe('Favoris1')
    expect(cartes()).toEqual([
      ['Budget', '/t/budget'],
      ['Plan', '/t/voyage/e/plan'],
      ['Voyage', '/t/voyage'],
    ])
    expect(hote.querySelector('.biblio-carte-ou')!.textContent).toBe('Toile')
    expect(hote.querySelectorAll('.biblio-carte-ou')[1]!.textContent).toBe('dans Voyage')
  })

  it('un onglet se choisit au clic ou aux flèches, et l’adresse le garde', async () => {
    await ouvrir(async () => TOUTES)
    act(() => onglet('Documents').click())
    expect(location.search).toBe('?vue=documents')
    expect(cartes()).toEqual([['Sans titre', '/t/voyage/e/notes']])
    expect(hote.querySelector('.biblio-feuille')!.textContent).toBe('Première ligne')
    act(() => onglet('Documents').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(onglet('Favoris').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(onglet('Favoris'))
  })

  it('sans rien d’ouvert, commence par les toiles ; un onglet vide dit quoi faire', async () => {
    await ouvrir(async () => [])
    expect(onglet('Toiles').getAttribute('aria-selected')).toBe('true')
    expect(hote.querySelector('.biblio-vide')!.textContent).toContain('Une toile se crée avec l’outil Toile')
    act(() => onglet('Récents').click())
    expect(hote.querySelector('.biblio-vide')!.textContent).toContain('Rien d’ouvert pour l’instant.')
    act(() => onglet('Cartes mentales').click())
    expect(hote.querySelector('.biblio-vide')!.textContent).toContain('Une carte se pose sur une toile')
  })

  it('un échec se dit, et se réessaie', async () => {
    let fois = 0
    await ouvrir(async () => {
      if (fois++ === 0) throw new Error('Serveur injoignable')
      return TOUTES
    })
    expect(hote.querySelector('[role="alert"]')!.textContent).toContain('Serveur injoignable')
    await act(async () => hote.querySelector<HTMLButtonElement>('[role="alert"] button')!.click())
    expect(cartes()).toHaveLength(3)
  })
})
