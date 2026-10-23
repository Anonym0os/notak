// @vitest-environment jsdom
import { type ReactNode, act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DansPanneau, borner, fermerPanneaux, usePanneau } from './panneaux'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Simple({ nom }: { nom: string }) {
  const { ouvert, basculer, ancre, bouton, panneau } = usePanneau()
  return (
    <div ref={ancre}>
      <button ref={bouton} onClick={basculer}>
        {nom}
      </button>
      {ouvert && (
        <div ref={panneau} role="dialog" aria-label={nom}>
          <input aria-label={`${nom}-champ`} />
        </div>
      )}
    </div>
  )
}

function Menu({ children }: { children: ReactNode }) {
  const { ouvert, basculer, ancre, bouton, panneau, id } = usePanneau()
  return (
    <div ref={ancre}>
      <button ref={bouton} onClick={basculer}>
        plus
      </button>
      <div ref={panneau} role="menu" hidden={!ouvert}>
        <DansPanneau value={id}>{children}</DansPanneau>
      </div>
    </div>
  )
}

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => fermerPanneaux())
  act(() => racine.unmount())
  hote.remove()
})

const monter = (el: ReactNode) => act(() => racine.render(el))
const bouton = (nom: string) => [...hote.querySelectorAll('button')].find((b) => b.textContent === nom)!
const ouvert = (nom: string) => hote.querySelector(`[role="dialog"][aria-label="${nom}"]`) !== null
const appui = (el: Element) => act(() => void el.dispatchEvent(new Event('pointerdown', { bubbles: true })))
/** Un vrai clic : l'appui, puis le clic. */
const cliquer = (el: Element) =>
  act(() => {
    el.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    ;(el as HTMLElement).click()
  })
const echap = () => act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))

describe('les panneaux de l’en-tête', () => {
  it('un clic sur le bouton ouvre le panneau, un second le ferme', () => {
    monter(<Simple nom="Partager" />)
    cliquer(bouton('Partager'))
    expect(ouvert('Partager')).toBe(true)
    cliquer(bouton('Partager'))
    expect(ouvert('Partager')).toBe(false)
  })

  it('un seul panneau est ouvert, et un seul clic suffit pour passer de l’un à l’autre', () => {
    monter(
      <>
        <Simple nom="Partager" />
        <Simple nom="Cloche" />
      </>,
    )
    cliquer(bouton('Partager'))
    expect(ouvert('Partager')).toBe(true)
    cliquer(bouton('Cloche'))
    expect(ouvert('Cloche')).toBe(true)
    expect(ouvert('Partager')).toBe(false)
  })

  it('un appui dans le panneau le laisse ouvert, un appui dehors le ferme', () => {
    monter(
      <>
        <Simple nom="Partager" />
        <p id="dehors">toile</p>
      </>,
    )
    cliquer(bouton('Partager'))
    appui(hote.querySelector('input')!)
    expect(ouvert('Partager')).toBe(true)
    appui(hote.querySelector('#dehors')!)
    expect(ouvert('Partager')).toBe(false)
  })

  it('Échap ferme le panneau et rend le focus à son bouton', () => {
    monter(<Simple nom="Partager" />)
    cliquer(bouton('Partager'))
    act(() => hote.querySelector('input')!.focus())
    echap()
    expect(ouvert('Partager')).toBe(false)
    expect(document.activeElement).toBe(bouton('Partager'))
  })

  it('un panneau dans un autre : l’ouvrir garde le menu ouvert, Échap les referme l’un après l’autre', () => {
    monter(
      <>
        <Menu>
          <Simple nom="Activité" />
        </Menu>
        <Simple nom="Cloche" />
      </>,
    )
    const menu = () => hote.querySelector('[role="menu"]') as HTMLElement
    cliquer(bouton('plus'))
    expect(menu().hidden).toBe(false)
    cliquer(bouton('Activité'))
    expect(ouvert('Activité')).toBe(true)
    expect(menu().hidden).toBe(false)
    echap()
    expect(ouvert('Activité')).toBe(false)
    expect(menu().hidden).toBe(false)
    expect(document.activeElement).toBe(bouton('Activité'))
    echap()
    expect(menu().hidden).toBe(true)
    expect(document.activeElement).toBe(bouton('plus'))
    // Ouvrir un panneau étranger au menu referme le menu et ce qu'il porte.
    cliquer(bouton('plus'))
    cliquer(bouton('Activité'))
    cliquer(bouton('Cloche'))
    expect(ouvert('Cloche')).toBe(true)
    expect(ouvert('Activité')).toBe(false)
    expect(menu().hidden).toBe(true)
  })
})

describe('borner', () => {
  const poser = (gauche: number, droite: number, largeurFenetre: number) => {
    const el = document.createElement('div')
    el.style.position = 'absolute'
    el.getBoundingClientRect = () => ({ left: gauche, right: droite, top: 0, bottom: 0, width: droite - gauche, height: 0, x: gauche, y: 0, toJSON() {} })
    Object.defineProperty(document.documentElement, 'clientWidth', { value: largeurFenetre, configurable: true })
    document.body.append(el)
    return el
  }

  it('ramène dans la fenêtre un panneau qui déborde à droite ou à gauche, et laisse les autres', () => {
    const droite = poser(150, 450, 390)
    borner(droite)
    expect(droite.style.translate).toBe('-68px 0')
    const gauche = poser(-40, 320, 390)
    borner(gauche)
    expect(gauche.style.translate).toBe('48px 0')
    const bon = poser(20, 300, 390)
    borner(bon)
    expect(bon.style.translate).toBe('')
    for (const el of [droite, gauche, bon]) el.remove()
  })
})
