// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { GardeToile } from './garde'

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
