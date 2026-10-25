// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { allerA, surLien } from './chemin'

describe('le chemin', () => {
  beforeEach(() => history.replaceState(null, '', '/'))

  it('allerA écrit l’adresse et le dit à l’application', () => {
    const vus: string[] = []
    const noter = () => vus.push(location.pathname)
    window.addEventListener('notak:chemin', noter)
    allerA('/t/voyage')
    allerA('/', { remplacer: true })
    window.removeEventListener('notak:chemin', noter)
    expect(vus).toEqual(['/t/voyage', '/'])
    expect(history.length).toBeGreaterThan(1)
  })

  it('un clic simple reste dans l’application ; ⌘, Maj ou le bouton du milieu laissent faire le navigateur', () => {
    const clic = (m: Partial<{ button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => {
      let empeche = false
      surLien({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...m, preventDefault: () => void (empeche = true) }, '/t/a')
      return empeche
    }
    expect(clic({ metaKey: true })).toBe(false)
    expect(clic({ button: 1 })).toBe(false)
    expect(clic({ shiftKey: true })).toBe(false)
    expect(location.pathname).toBe('/')
    expect(clic()).toBe(true)
    expect(location.pathname).toBe('/t/a')
  })
})
