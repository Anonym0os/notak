// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Element, Nuancier } from '../../coeur/tableau'
import { definirLangue } from '../../langue'
import { definition } from '../registre'
import type { ContexteToile } from '../types'
import './index'
import { RenduNuancier } from './Nuancier'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  definirLangue('fr')
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

const element: Element<Nuancier> = { id: 'N', x: 0, y: 0, largeur: 17, contenu: { type: 'nuancier', couleur: '#4f8cff' } }

function monter(options: { seule: boolean; lectureSeule?: boolean }) {
  const editions: string[] = []
  const contexte = { services: { lectureSeule: !!options.lectureSeule }, commencerEdition: (id: string) => void editions.push(id) } as unknown as ContexteToile
  act(() =>
    racine.render(<RenduNuancier element={element} choisie seule={options.seule} enEdition={false} contexte={contexte} brouillon={() => {}} changer={() => {}} />),
  )
  return editions
}

describe('le nuancier', () => {
  it('un clic sur le code d’un nuancier choisi seul l’écrit sur place', () => {
    const editions = monter({ seule: true })
    act(() => hote.querySelector<HTMLElement>('.notak-nuancier-code')!.click())
    expect(editions).toEqual(['N'])
  })

  it('choisi avec d’autres, ou en lecture seule, le code ne s’écrit pas', () => {
    expect(monter({ seule: false }).length).toBe(0)
    act(() => hote.querySelector<HTMLElement>('.notak-nuancier-code')!.click())
    const lecture = monter({ seule: true, lectureSeule: true })
    act(() => hote.querySelector<HTMLElement>('.notak-nuancier-code')!.click())
    expect(lecture).toEqual([])
  })

  it('un double-clic ouvre le sélecteur de couleur, non l’écriture : un clic sur le nuancier choisi ne l’édite pas', () => {
    const def = definition('nuancier')!
    expect(def.ouvreAuDoubleClic).toBe(true)
    expect(typeof def.ouvrir).toBe('function')
  })
})
