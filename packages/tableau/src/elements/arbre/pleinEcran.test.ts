// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { demanderPleinEcran } from './pleinEcran'

type Doc = Document & { webkitFullscreenElement?: Element | null }

afterEach(() => {
  delete (document as Doc).webkitFullscreenElement
  vi.useRealTimers()
})

describe('le plein écran', () => {
  it('sans plein écran d’élément (l’iPhone) : non, tout de suite', async () => {
    const el = document.createElement('div')
    expect(await demanderPleinEcran(el)).toBe(false)
  })

  it('WebKit : sa promesse échoue, mais son événement préfixé dit vrai', async () => {
    const el = document.createElement('div') as HTMLDivElement & { requestFullscreen: () => Promise<void> }
    el.requestFullscreen = () => Promise.reject(new Error('refusé'))
    const issue = demanderPleinEcran(el)
    // La même demande, reprise par la présentation qui s'ouvre.
    expect(demanderPleinEcran(el)).toBe(issue)
    ;(document as Doc).webkitFullscreenElement = el
    document.dispatchEvent(new Event('webkitfullscreenchange'))
    expect(await issue).toBe(true)
  })

  it('trop lent : on n’attend pas au-delà du délai', async () => {
    vi.useFakeTimers()
    const el = document.createElement('div') as HTMLDivElement & { requestFullscreen: () => Promise<void> }
    el.requestFullscreen = () => new Promise(() => {})
    const issue = demanderPleinEcran(el, 500)
    vi.advanceTimersByTime(500)
    expect(await issue).toBe(false)
  })
})
