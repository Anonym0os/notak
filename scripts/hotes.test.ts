import { describe, expect, it } from 'vitest'
import { HOTES_CONNUS, hotesDe } from './hotes'

describe('les hôtes de l’application construite', () => {
  it('se lisent dans le code, sans doublon ni chemin', () => {
    expect([...hotesDe('fetch("https://Nominatim.OpenStreetMap.org/search?q=1"); a="http://www.w3.org/2000/svg"; b="https://www.w3.org/1999/xhtml"')]).toEqual([
      'nominatim.openstreetmap.org',
      'www.w3.org',
    ])
  })
  it('ceux que la CSP laisse joindre sont connus, un service de mesure non', () => {
    expect(HOTES_CONNUS.has('nominatim.openstreetmap.org')).toBe(true)
    expect(HOTES_CONNUS.has('www.youtube-nocookie.com')).toBe(true)
    expect(HOTES_CONNUS.has('www.google-analytics.com')).toBe(false)
    expect(HOTES_CONNUS.has('o0.ingest.sentry.io')).toBe(false)
  })
})
