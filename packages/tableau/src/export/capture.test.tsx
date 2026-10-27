// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { ContenuAttendu } from '../elements/ContenuAttendu'
import { HORS_TOILE } from './capture'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ce que la capture de la toile laisse de côté', () => {
  it('le bouton « Afficher » d’un contenu d’un autre site qui attend l’accord n’est pas dessiné dans l’export', () => {
    const hote = document.createElement('div')
    document.body.append(hote)
    const racine = createRoot(hote)
    act(() => racine.render(<ContenuAttendu hotes={['exemple.org']} afficher={() => {}} />))
    const bouton = hote.querySelector('button')!
    expect(HORS_TOILE.some((c) => bouton.classList.contains(c))).toBe(true)
    act(() => racine.unmount())
    hote.remove()
  })
})
