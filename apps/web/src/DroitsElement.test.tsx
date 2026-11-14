// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DroitsElement } from './DroitsElement'

vi.mock('./api', async (origine) => ({
  ...(await origine<typeof import('./api')>()),
  listerDroitsElement: async () => [],
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLDivElement
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

describe('DroitsElement', () => {
  it('dit franchement qu’un élément ne se cache pas, et mène à la toile privée', async () => {
    await act(async () => racine.render(<DroitsElement tableau="t" element="e" fermer={() => {}} />))
    const note = hote.querySelector('.droits-element-prive')!
    expect(note.textContent).toContain('Un élément ne se cache pas à qui lit cette toile')
    expect(note.textContent).toContain('« Seulement les personnes invitées »')
    expect(note.querySelector('svg')).not.toBeNull()
  })
})
