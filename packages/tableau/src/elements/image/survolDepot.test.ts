import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { DELAI_VOILE_MS, figerDepot, glisseUneImage, imageARemplacer, libererDepot, survolerImage } from './survolDepot'

const glisse = (types: string[], items: { kind: string; type: string }[]) => ({ types, items }) as unknown as DataTransfer

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  survolerImage(null)
  libererDepot()
  vi.useRealTimers()
})

describe('ce qu’on glisse', () => {
  test('une seule image du bureau, ou un type encore caché', () => {
    expect(glisseUneImage(glisse(['Files'], [{ kind: 'file', type: 'image/png' }]))).toBe(true)
    expect(glisseUneImage(glisse(['Files'], [{ kind: 'file', type: '' }]))).toBe(true)
    expect(glisseUneImage(glisse(['Files'], []))).toBe(true)
  })
  test('ni du texte, ni un fichier d’un autre genre, ni plusieurs', () => {
    expect(glisseUneImage(glisse(['text/plain'], [{ kind: 'string', type: 'text/plain' }]))).toBe(false)
    expect(glisseUneImage(glisse(['Files'], [{ kind: 'file', type: 'application/pdf' }]))).toBe(false)
    expect(glisseUneImage(glisse(['Files'], [{ kind: 'file', type: 'image/png' }, { kind: 'file', type: 'image/png' }]))).toBe(false)
  })
})

describe('le voile', () => {
  test('lâchée avant 500 ms, l’image ne remplace rien', () => {
    survolerImage('a')
    vi.advanceTimersByTime(DELAI_VOILE_MS - 1)
    figerDepot()
    expect(imageARemplacer()).toBeNull()
  })
  test('lâchée sous le voile, elle remplace l’image survolée jusqu’à ce qu’on libère', () => {
    survolerImage('a')
    vi.advanceTimersByTime(DELAI_VOILE_MS)
    figerDepot()
    expect(imageARemplacer()).toBe('a')
    libererDepot()
    expect(imageARemplacer()).toBeNull()
  })
  test('passer sur une autre image repart de zéro', () => {
    survolerImage('a')
    vi.advanceTimersByTime(400)
    survolerImage('b')
    vi.advanceTimersByTime(400)
    figerDepot()
    expect(imageARemplacer()).toBeNull()
  })
  test('survoler plusieurs fois la même ne relance pas le délai', () => {
    survolerImage('a')
    vi.advanceTimersByTime(300)
    survolerImage('a')
    vi.advanceTimersByTime(200)
    figerDepot()
    expect(imageARemplacer()).toBe('a')
  })
})
