// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { BarreBas, type PropsBarreBas } from './BarreBas'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function monter(surcharge: Partial<PropsBarreBas> = {}) {
  const hote = document.createElement('div')
  document.body.append(hote)
  const racine = createRoot(hote)
  const p: PropsBarreBas = {
    titre: 'Projet',
    lectureSeule: false,
    sujets: 12,
    choisis: 0,
    mots: 30,
    caracteres: 150,
    zoom: 1,
    enPlan: false,
    zenActif: false,
    pitchActif: false,
    zoomer: vi.fn(),
    ajuster: vi.fn(),
    basculerPlan: vi.fn(),
    zen: vi.fn(),
    presenter: vi.fn(),
    renommer: vi.fn(),
    dupliquer: vi.fn(),
    nouvelle: vi.fn(),
    enregistrer: vi.fn(),
    ...surcharge,
  }
  act(() => racine.render(<BarreBas {...p} />))
  const clic = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  const bouton = (sous: string) => [...hote.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').includes(sous))!
  return { hote, p, clic, bouton, fin: () => (act(() => racine.unmount()), hote.remove()) }
}

describe('la barre du bas', () => {
  it('le compteur dit les sujets, et « s / n » avec une sélection', () => {
    const a = monter()
    expect(a.hote.querySelector('.notak-bas-compteur .notak-bas-valeur')?.textContent).toBe('Sujets: 12')
    a.fin()
    const b = monter({ choisis: 3 })
    expect(b.hote.querySelector('.notak-bas-compteur .notak-bas-valeur')?.textContent).toBe('Sujets: 3 / 12')
    b.fin()
  })

  it('un clic sur le compteur ouvre les comptes : sujets, mots, caractères', () => {
    const a = monter()
    a.clic(a.hote.querySelector('.notak-bas-compteur button')!)
    expect([...a.hote.querySelectorAll('.notak-bas-popover p')].map((p) => p.textContent)).toEqual(['Sujets: 12', 'Mots: 30', 'Caractères: 150'])
    a.fin()
  })

  it('le zoom : le courant et le menu des paliers, cochés, avec « Ajuster la carte » en dernier', () => {
    const a = monter({ zoom: 1.37 })
    expect(a.hote.querySelector('.notak-bas-zoom .notak-bas-valeur')?.textContent).toBe('137 %')
    a.clic(a.hote.querySelector('.notak-bas-zoom button')!)
    const items = [...a.hote.querySelectorAll('.notak-bas-zoom [role^=menuitem]')]
    expect(items.map((i) => i.textContent?.replace(/\s/g, ' '))).toEqual(['500 %', '400 %', '300 %', '200 %', '150 %', '137 %', '120 %', '100 %', '80 %', '50 %', '20 %', '10 %', 'Ajuster la carte'])
    expect(items.filter((i) => i.getAttribute('aria-checked') === 'true').map((i) => i.textContent?.replace(/\s/g, ' '))).toEqual(['137 %'])
    a.clic(items[3]!)
    expect(a.p.zoomer).toHaveBeenCalledWith(2)
    a.clic(a.hote.querySelector('.notak-bas-zoom button')!)
    a.clic([...a.hote.querySelectorAll('.notak-bas-zoom [role^=menuitem]')].at(-1)!)
    expect(a.p.ajuster).toHaveBeenCalled()
    a.fin()
  })

  it('dans le plan, le menu se réduit à 300…80 sans « Ajuster la carte », et le compteur disparaît', () => {
    const a = monter({ enPlan: true })
    expect(a.hote.querySelector('.notak-bas-compteur')).toBeNull()
    a.clic(a.hote.querySelector('.notak-bas-zoom button')!)
    expect([...a.hote.querySelectorAll('.notak-bas-zoom [role^=menuitem]')].map((i) => i.textContent?.replace(/\s/g, ' '))).toEqual(['300 %', '200 %', '150 %', '120 %', '100 %', '80 %'])
    // Le bouton de la carte remplace ceux du plan et du Zen.
    expect(a.bouton('Passer à la carte mentale')).toBeTruthy()
    expect(a.hote.querySelector('[aria-label*="Zen"]')).toBeNull()
    a.fin()
  })

  it('les quatre boutons : Gantt grisé, plan, Zen et Pitch agissent', () => {
    const a = monter()
    expect((a.bouton('Gantt') as HTMLButtonElement).disabled).toBe(true)
    a.clic(a.bouton('Passer au plan'))
    a.clic(a.bouton('mode Zen'))
    a.clic(a.bouton('mode présentation'))
    expect([a.p.basculerPlan, a.p.zen, a.p.presenter].map((f) => (f as ReturnType<typeof vi.fn>).mock.calls.length)).toEqual([1, 1, 1])
    a.fin()
  })

  it('la feuille : son titre, un menu complet, « Supprimer » grisé, et le renommage en place', () => {
    const a = monter()
    expect(a.hote.querySelector('.notak-bas-onglet')?.textContent).toBe('Projet')
    a.clic(a.bouton('Menu de la feuille'))
    const menu = [...a.hote.querySelectorAll('.notak-bas-menu-feuille [role=menuitem]')] as HTMLButtonElement[]
    expect(menu.map((m) => m.textContent)).toEqual(['Renommer', 'Dupliquer', 'Supprimer', 'Nouvelle feuille', 'Enregistrer la feuille en tant que…'])
    expect(menu[2]!.disabled).toBe(true)
    a.clic(menu[0]!)
    const champ = a.hote.querySelector<HTMLInputElement>('.notak-bas-renommer')!
    expect(champ.value).toBe('Projet')
    act(() => {
      const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      poser.call(champ, 'Plan B')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => void champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(a.p.renommer).toHaveBeenCalledWith('Plan B')
    a.fin()
  })

  it('en lecture seule, ni « + » ni menu de feuille', () => {
    const a = monter({ lectureSeule: true })
    expect(a.hote.querySelector('.notak-bas-plus')).toBeNull()
    expect(a.hote.querySelector('.notak-bas-chevron')).toBeNull()
    a.fin()
  })
})
