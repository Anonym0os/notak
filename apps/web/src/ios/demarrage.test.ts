// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { ecouterPlugin, fondCourant, suivreTheme, themeSystemeAuPremierLancement } from './demarrage'

const depot = (initial: Record<string, string> = {}) => {
  const m = new Map(Object.entries(initial))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}

describe('le thème au premier lancement', () => {
  it('passe au système quand rien n’est réglé, et ne touche à rien ensuite', () => {
    const d = depot()
    expect(themeSystemeAuPremierLancement(d)).toBe(true)
    expect(JSON.parse(d.m.get('notak:reglages')!)).toEqual({ theme: 'systeme' })
    expect(themeSystemeAuPremierLancement(d)).toBe(false)
    const regle = depot({ 'notak:reglages': JSON.stringify({ theme: 'clair' }) })
    expect(themeSystemeAuPremierLancement(regle)).toBe(false)
    expect(JSON.parse(regle.m.get('notak:reglages')!)).toEqual({ theme: 'clair' })
  })

  it('un stockage qui refuse ne casse rien : on dit seulement que rien n’a été fait', () => {
    const plein = () => {
      throw new Error('plein')
    }
    expect(themeSystemeAuPremierLancement({ getItem: () => null, setItem: plein })).toBe(false)
    expect(themeSystemeAuPremierLancement({ getItem: plein, setItem: () => {} })).toBe(false)
  })
})

describe('le thème dit à la coque', () => {
  const page = (fond: string) => {
    const d = window.document.implementation.createHTMLDocument('')
    const styles = { getPropertyValue: (p: string) => (p === '--notak-fond' ? fond : '') }
    return { d, fenetre: { getComputedStyle: () => styles as unknown as CSSStyleDeclaration } }
  }

  it('lit le fond de la page, en #rrggbb seulement', () => {
    expect(fondCourant(page(' #EBEDEE ').d, page('#EBEDEE').fenetre)).toBe('#ebedee')
    expect(fondCourant(page('rgb(1,2,3)').d, page('rgb(1,2,3)').fenetre)).toBeNull()
  })

  it('envoie thème et fond une fois, puis à chaque changement de data-theme', async () => {
    const { d, fenetre } = page('#1b1e23')
    d.documentElement.dataset.theme = 'sombre'
    const invoke = vi.fn(() => Promise.resolve())
    const cesser = suivreTheme(d, fenetre, { invoke })
    expect(invoke).toHaveBeenCalledWith('plugin:appareil|regler_theme', { theme: 'sombre', fond: '#1b1e23' })
    d.documentElement.dataset.theme = 'clair'
    await new Promise((r) => setTimeout(r, 0))
    expect(invoke).toHaveBeenLastCalledWith('plugin:appareil|regler_theme', { theme: 'clair', fond: '#1b1e23' })
    expect(invoke).toHaveBeenCalledTimes(2)
    cesser()
  })

  it('sans fond lisible, les couleurs des thèmes de Notak', () => {
    const { d, fenetre } = page('')
    const invoke = vi.fn(() => Promise.resolve())
    suivreTheme(d, fenetre, { invoke })()
    expect(invoke).toHaveBeenCalledWith('plugin:appareil|regler_theme', { theme: 'clair', fond: '#ebedee' })
  })
})

describe('les événements du plugin', () => {
  it('passe par un canal, et déballe le message quel que soit son emballage', () => {
    const rappels: ((r: unknown) => void)[] = []
    const invoke = vi.fn(() => Promise.resolve())
    const recus: unknown[] = []
    ecouterPlugin({ invoke, transformCallback: (f) => (rappels.push(f), 7) }, 'clavier', (d) => recus.push(d))
    expect(invoke).toHaveBeenCalledWith('plugin:appareil|register_listener', { event: 'clavier', handler: '__CHANNEL__:7' })
    rappels[0]!({ hauteur: 300 })
    rappels[0]!({ message: { hauteur: 0 }, id: 1 })
    expect(recus).toEqual([{ hauteur: 300 }, { hauteur: 0 }])
  })

  it('une coque sans canaux : rien', () => {
    const invoke = vi.fn(() => Promise.resolve())
    ecouterPlugin({ invoke }, 'clavier', () => {})
    expect(invoke).not.toHaveBeenCalled()
  })
})
