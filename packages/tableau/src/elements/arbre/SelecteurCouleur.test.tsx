// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MULTIPLE } from './modele/style'
import { assemblerCouleur, decouperCouleur, normaliserHex } from '../../communs'
import { BoutonCouleur, NUANCIER, lireRecentes, memoriserRecente } from './SelecteurCouleur'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('le nuancier', () => {
  it('compte 45 couleurs, sur neuf colonnes, sans doublon, de la première à la dernière ligne', () => {
    expect(NUANCIER).toHaveLength(45)
    expect(new Set(NUANCIER).size).toBe(45)
    expect(NUANCIER.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true)
    expect(NUANCIER[0]).toBe('#ffffff')
    expect(NUANCIER[8]).toBe('#000000')
  })

  it('n’emprunte aucune des couleurs du nuancier de Xmind', () => {
    const xmind = ['#EEEEEE', '#D0D0D0', '#FDD834', '#FF9595', '#8EDE99', '#FFC009', '#FF5252', '#2CD551', '#05A8F4', '#E32C2D', '#4A148C']
    for (const c of xmind) expect(NUANCIER).not.toContain(c.toLowerCase())
  })
})

describe('le champ hexadécimal et l’opacité', () => {
  it('les caractères qui ne sont pas hexadécimaux s’ignorent, trois chiffres se doublent, un hexa court se complète de zéros', () => {
    expect(normaliserHex('ff00zz')).toBe('#ff0000')
    expect(normaliserHex('#abc')).toBe('#aabbcc')
    expect(normaliserHex('1234567')).toBe('#123456')
    expect(normaliserHex('12')).toBe('#120000')
  })

  it('l’opacité s’écrit en canal alpha, à la fin', () => {
    expect(assemblerCouleur('#ff0000', 100)).toBe('#ff0000')
    expect(assemblerCouleur('#FF0000', 50)).toBe('#ff000080')
    expect(assemblerCouleur('#ff0000', 20)).toBe('#ff000033')
    expect(assemblerCouleur('#ff0000', 0)).toBe('#ff000000')
    expect(decouperCouleur('#ff000080')).toEqual({ hex: '#ff0000', opacite: 50 })
    expect(decouperCouleur('var(--x)')).toEqual({ hex: '#000000', opacite: 100 })
  })

  it('les couleurs récentes : en tête, sans doublon, neuf au plus', () => {
    localStorage.clear()
    for (let i = 0; i < 12; i++) memoriserRecente(`#00000${i.toString(16)}`)
    memoriserRecente('#00000A')
    const r = lireRecentes()
    expect(r).toHaveLength(9)
    expect(r[0]).toBe('#00000A')
    expect(r.filter((x) => x.toLowerCase() === '#00000a')).toHaveLength(1)
  })
})

describe('le bouton de couleur', () => {
  let racine: Root
  let hote: HTMLElement
  const choisir = vi.fn<(c: string | undefined) => void>()
  beforeEach(() => {
    localStorage.clear()
    choisir.mockClear()
    hote = document.createElement('div')
    hote.className = 'notak-arbre-fond'
    document.body.append(hote)
    racine = createRoot(hote)
  })
  afterEach(() => {
    act(() => racine.unmount())
    hote.remove()
    document.body.querySelectorAll('.notak-arbre-style-pop').forEach((x) => x.remove())
  })
  const monter = (valeur: string | null | undefined | typeof MULTIPLE, extra: { opaciteMax?: number; theme?: string[] } = {}) =>
    act(() => racine.render(<BoutonCouleur valeur={valeur} choisir={choisir} titre="Couleur" {...extra} />))
  const ouvrir = () => act(() => void hote.querySelector<HTMLElement>('button')!.click())
  const pop = () => document.body.querySelector('.notak-arbre-style-pop')!

  it('montre la couleur à plat, un trait quand il n’y en a pas, trois points quand elles diffèrent', () => {
    monter('#ff0000')
    const b = hote.querySelector<HTMLElement>('button')!
    expect(b.style.background).toBe('rgb(255, 0, 0)')
    expect(b.hasAttribute('data-aucune')).toBe(false)
    monter(null)
    expect(hote.querySelector('button')!.hasAttribute('data-aucune')).toBe(true)
    monter(MULTIPLE)
    expect(hote.querySelector('.notak-arbre-style-points')).not.toBeNull()
  })

  it('le popover : 45 pastilles ; un clic pose la couleur, la retient et se ferme', () => {
    monter('#ff0000')
    ouvrir()
    expect(pop().querySelectorAll('.notak-couleurs-grille')[0]!.children).toHaveLength(45)
    act(() => void pop().querySelector<HTMLElement>('[aria-label="#176FD3"]')!.click())
    expect(choisir).toHaveBeenLastCalledWith('#176fd3')
    expect(document.body.querySelector('.notak-arbre-style-pop')).toBeNull()
    expect(lireRecentes()).toEqual(['#176fd3'])
  })

  it('« Par défaut » rend la main au thème', () => {
    monter('#ff0000')
    ouvrir()
    act(() => void [...pop().querySelectorAll<HTMLElement>('button')].find((b) => b.textContent === 'Par défaut')!.click())
    expect(choisir).toHaveBeenLastCalledWith(undefined)
  })

  it('le champ hexadécimal, validé à Entrée', () => {
    monter('#ff0000')
    ouvrir()
    const champ = pop().querySelector<HTMLInputElement>('input[aria-label="Définir la valeur de couleur (hex)."]')!
    expect(champ.value).toBe('ff0000')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'abc')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
      champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(choisir).toHaveBeenLastCalledWith('#aabbcc')
  })

  it('l’opacité, plafonnée par `opaciteMax` (une limite : 20 %)', () => {
    monter('#ff0000', { opaciteMax: 20 })
    ouvrir()
    const champ = pop().querySelector<HTMLInputElement>('input[aria-label="Définir l’opacité."]')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, '80')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
      champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(choisir).toHaveBeenLastCalledWith('#ff000033')
  })

  it('les couleurs du thème, quand on en donne', () => {
    monter('#ff0000', { theme: ['#111111', '#222222'] })
    ouvrir()
    expect(pop().textContent).toContain('Thème actuel')
    expect(pop().querySelector('[aria-label="#111111"]')).not.toBeNull()
  })

  it('Échap ferme le popover', () => {
    monter('#ff0000')
    ouvrir()
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.body.querySelector('.notak-arbre-style-pop')).toBeNull()
  })
})
