// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BarreOutils } from './Barres'
import './elements'
import { fermerMenus } from './menuUnique'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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
  fermerMenus()
})

const monter = (grisee = false) =>
  act(() =>
    racine.render(
      <BarreOutils
        grisee={grisee}
        surAppui={() => {}}
        rebond={null}
        corbeille={{ nombre: 0, ouverte: false, basculer: () => {} }}
        nonTries={{ nombre: 0, ouverte: false, basculer: () => {} }}
      />,
    ),
  )

describe('la barre de création', () => {
  it('les outils n’ont plus de title natif : un aria-label, et l’infobulle maison', () => {
    monter()
    const boutons = [...hote.querySelectorAll('nav .notak-outil, nav .notak-outil-plus, .notak-non-tries-bouton')]
    expect(boutons.length).toBeGreaterThan(8)
    expect(boutons.filter((b) => b.hasAttribute('title'))).toEqual([])
    expect(hote.querySelectorAll('nav .notak-infobulle-hote').length).toBeGreaterThan(8)
  })

  it('après un glisser de l’outil Image, la bulle invite à cliquer ; après un clic sur un autre outil, elle invite à glisser', () => {
    const avec = (rebond: { libelle: string; n: number; texte?: 'barre.cliquer' }) =>
      act(() =>
        racine.render(
          <BarreOutils grisee={false} surAppui={() => {}} rebond={rebond} corbeille={{ nombre: 0, ouverte: false, basculer: () => {} }} nonTries={{ nombre: 0, ouverte: false, basculer: () => {} }} />,
        ),
      )
    avec({ libelle: 'Ajouter une image', n: 1, texte: 'barre.cliquer' })
    expect(hote.querySelector('.notak-bulle-outil')?.textContent).toBe('Cliquez sur l’outil pour ajouter une image')
    avec({ libelle: 'À faire', n: 2 })
    expect(hote.querySelector('.notak-bulle-outil')?.textContent).toBe('Glissez l’outil sur le fond')
  })

  it('les gestes s’appellent À faire, Ajouter une image, Envoyer, Dessiner ; les Étiquettes sont dans le « ••• »', () => {
    monter()
    const noms = [...hote.querySelectorAll('nav > .notak-outil-place .notak-outil-libelle')].map((l) => l.textContent)
    expect(noms).toEqual(expect.arrayContaining(['À faire', 'Ajouter une image', 'Envoyer', 'Dessiner']))
    expect(noms).not.toContain('Étiquettes')
    expect(hote.querySelector('nav > .notak-barre-sep')).not.toBeNull()
    act(() => hote.querySelector<HTMLButtonElement>('.notak-outil-plus')!.click())
    expect(hote.querySelector('.notak-tiroir')).not.toBeNull()
  })

  it('l’aperçu d’un modèle la montre grisée', () => {
    monter(true)
    expect(hote.querySelector('nav')?.hasAttribute('data-grisee')).toBe(true)
  })
})
