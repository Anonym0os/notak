// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { PointActivite } from './PointActivite'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('point d’activité', () => {
  it('l’infobulle paraît dès que la souris est dessus, sans délai, et part avec elle', () => {
    const hote = document.createElement('div')
    const racine = createRoot(hote)
    act(() => racine.render(<PointActivite gauche={4} haut={6} texte="Mis à jour par Léa, il y a quelques secondes" />))
    const point = hote.querySelector('.notak-activite')!
    expect(hote.querySelector('[role=tooltip]')).toBeNull()
    act(() => void point.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })))
    expect(hote.querySelector('[role=tooltip]')?.textContent).toBe('Mis à jour par Léa, il y a quelques secondes')
    act(() => void point.dispatchEvent(new PointerEvent('pointerout', { bubbles: true })))
    expect(hote.querySelector('[role=tooltip]')).toBeNull()
    act(() => racine.unmount())
  })

  it('un appui sur le point ne remonte pas à la toile', () => {
    const hote = document.createElement('div')
    const racine = createRoot(hote)
    let remonte = false
    act(() => racine.render(<div onPointerDown={() => (remonte = true)}><PointActivite gauche={0} haut={0} texte="x" /></div>))
    act(() => void hote.querySelector('.notak-activite')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(remonte).toBe(false)
    act(() => racine.unmount())
  })
})
