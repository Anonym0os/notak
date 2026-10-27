// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BibliothequeLocale, type EntreeToile, lireVus, noterVu, ordonner } from './BibliothequeLocale'
import { espaceLocal } from './espace'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const entree = (id: string, autre: Partial<EntreeToile> = {}): EntreeToile => ({ id, titre: id, cree: 0, accueil: false, ...autre })

describe('l’ordre de la bibliothèque locale', () => {
  it('l’accueil en tête, puis la plus récemment ouverte, puis la plus récemment créée', () => {
    const liste = [entree('vieille', { cree: 1 }), entree('neuve', { cree: 5 }), entree('vue', { vu: 10 }), entree('Accueil', { accueil: true })]
    expect(ordonner(liste).map((e) => e.id)).toEqual(['Accueil', 'vue', 'neuve', 'vieille'])
  })

  it('la recherche filtre sur le titre, sans casse, mot à mot', () => {
    const liste = [entree('Voyage au Japon'), entree('Courses'), entree('Japon, budget')]
    expect(ordonner(liste, 'japon voy').map((e) => e.id)).toEqual(['Voyage au Japon'])
  })

  it('retient la dernière ouverture de chaque toile', () => {
    localStorage.clear()
    noterVu('a', 100)
    noterVu('b', 200)
    noterVu('a', 300)
    expect(lireVus()).toEqual({ a: 300, b: 200 })
  })
})

describe('l’écran de la bibliothèque', () => {
  let racine: Root
  let hote: HTMLElement
  beforeEach(() => {
    hote = document.createElement('div')
    document.body.append(hote)
    racine = createRoot(hote)
  })
  afterEach(() => {
    act(() => racine.unmount())
    hote.remove()
  })

  it('montre les toiles de l’appareil et ouvre celle qu’on touche', async () => {
    const el = await espaceLocal()
    const voyage = el.espace.creerTableau('Voyage', el.index.racine())
    await act(async () => void (await new Promise((fin) => setTimeout(fin, 50))))
    const ouvrir = vi.fn()
    await act(async () => racine.render(<BibliothequeLocale el={el} ouvrir={ouvrir} />))
    const titres = [...hote.querySelectorAll('.biblio-locale-titre')].map((n) => n.textContent)
    expect(titres).toContain('Voyage')
    const tuile = [...hote.querySelectorAll<HTMLButtonElement>('.biblio-locale-tuile')].find((b) => b.textContent?.includes('Voyage'))!
    act(() => tuile.click())
    expect(ouvrir).toHaveBeenCalledWith(voyage)
  })

  it('« Toile » en crée une sur l’accueil et l’ouvre', async () => {
    const el = await espaceLocal()
    const avant = el.index.lister().length
    const ouvrir = vi.fn()
    await act(async () => racine.render(<BibliothequeLocale el={el} ouvrir={ouvrir} />))
    act(() => hote.querySelector<HTMLButtonElement>('.biblio-locale-neuf button')!.click())
    await act(async () => void (await new Promise((fin) => setTimeout(fin, 50))))
    const neuve = ouvrir.mock.calls[0]![0] as string
    expect(neuve).not.toBe(el.index.racine())
    expect(el.espace.existe(neuve)).toBe(true)
    expect(el.index.lister().length).toBeGreaterThan(avant)
  })
})
