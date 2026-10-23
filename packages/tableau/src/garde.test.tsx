// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { GardeElement, GardeToile } from './garde'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('garde de la toile', () => {
  it('une toile qui plante laisse une phrase et un bouton, et réessayer la remonte', () => {
    let plante = true
    const Toile = () => {
      if (plante) throw new Error('boum')
      return <p>toile</p>
    }
    const hote = document.createElement('div')
    const racine = createRoot(hote)
    const console_ = vi.spyOn(console, 'error').mockImplementation(() => {})
    act(() => racine.render(<GardeToile><Toile /></GardeToile>))
    expect(hote.querySelector('[role=alert]')).not.toBeNull()
    plante = false
    act(() => hote.querySelector('button')!.click())
    expect(hote.textContent).toBe('toile')
    console_.mockRestore()
    act(() => racine.unmount())
  })
})

describe('garde d’un élément', () => {
  it('un élément qui plante dit qu’il ne peut pas s’afficher, ses voisins restent, et un élément changé réessaie', () => {
    const Carte = ({ e }: { e: { casse: boolean; nom: string } }) => {
      if (e.casse) throw new Error('boum')
      return <span>{e.nom}</span>
    }
    const hote = document.createElement('div')
    const racine = createRoot(hote)
    const console_ = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rendre = (a: { casse: boolean; nom: string }) =>
      act(() =>
        racine.render(
          <>
            <GardeElement element={a}><Carte e={a} /></GardeElement>
            <GardeElement element={{}}><span>voisin</span></GardeElement>
          </>,
        ),
      )
    rendre({ casse: true, nom: 'a' })
    expect(hote.querySelector('.notak-element-casse')).not.toBeNull()
    expect(hote.textContent).toContain('voisin')
    rendre({ casse: false, nom: 'réparé' })
    expect(hote.querySelector('.notak-element-casse')).toBeNull()
    expect(hote.textContent).toContain('réparé')
    console_.mockRestore()
    act(() => racine.unmount())
  })
})
