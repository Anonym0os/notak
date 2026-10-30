// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Ce que `main.tsx` charge : chaque module d'édition et de bureau, remplacé par un espion qui dit qu'il a tourné. */
const locale = vi.fn()
const serveur = vi.fn()
const reglages = vi.fn()
const passerLaPorte = vi.fn()
const compte = vi.fn()

beforeEach(() => {
  vi.resetModules()
  for (const f of [locale, serveur, reglages, passerLaPorte, compte]) f.mockReset()
  vi.doMock('../edition/locale', () => (locale(), {}))
  vi.doMock('../edition/serveur', () => (serveur(), {}))
  vi.doMock('./ReglagesBureau', () => ({ brancherReglagesBureau: reglages }))
  vi.doMock('./Porte', () => ({ passerLaPorte }))
  vi.doMock('./CompteEtServeur', () => ({ brancherReglagesCompte: compte }))
})
afterEach(() => {
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  vi.unstubAllEnvs()
  vi.doUnmock('../edition/locale')
  vi.doUnmock('../edition/serveur')
  vi.doUnmock('./ReglagesBureau')
  vi.doUnmock('./Porte')
  vi.doUnmock('./CompteEtServeur')
})

const dansLeBureau = () => {
  ;(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = { invoke: vi.fn(async () => ({})) }
}
const demarrer = async () => {
  await import('../main')
  // Les éditions et la porte se chargent à la demande.
  await new Promise((fin) => setTimeout(fin, 20))
}

describe('le démarrage de l’app web', () => {
  it('dans un navigateur, l’édition locale se monte sans porte ni rubrique de bureau', async () => {
    vi.stubEnv('VITE_EDITION', 'locale')
    await demarrer()
    expect(locale).toHaveBeenCalledOnce()
    expect(serveur).not.toHaveBeenCalled()
    expect(passerLaPorte).not.toHaveBeenCalled()
    expect(reglages).not.toHaveBeenCalled()
  })

  it('dans un navigateur, l’édition serveur se monte seule', async () => {
    await demarrer()
    expect(serveur).toHaveBeenCalledOnce()
    expect(locale).not.toHaveBeenCalled()
    expect(passerLaPorte).not.toHaveBeenCalled()
    expect(reglages).not.toHaveBeenCalled()
  })

  it('sur la page embarquée de l’app de bureau, la porte décide : l’édition locale attend qu’elle la monte', async () => {
    vi.stubEnv('VITE_EDITION', 'locale')
    dansLeBureau()
    await demarrer()
    expect(passerLaPorte).toHaveBeenCalledOnce()
    expect(locale).not.toHaveBeenCalled()
    // La porte, une fois les toiles de cet ordinateur choisies (ou sans rien à décider), monte l'édition locale.
    const monterLocal = passerLaPorte.mock.calls[0]![0] as () => void
    monterLocal()
    await new Promise((fin) => setTimeout(fin, 20))
    expect(locale).toHaveBeenCalledOnce()
  })

  it('la rubrique « App de bureau » des réglages se branche dans l’app de bureau, quelle que soit l’édition', async () => {
    vi.stubEnv('VITE_EDITION', 'locale')
    dansLeBureau()
    await demarrer()
    expect(reglages).toHaveBeenCalledOnce()
  })

  it('sur la page d’un serveur, l’édition serveur se monte tout de suite, sans porte, avec la rubrique des réglages', async () => {
    dansLeBureau()
    await demarrer()
    expect(serveur).toHaveBeenCalledOnce()
    expect(passerLaPorte).not.toHaveBeenCalled()
    expect(reglages).toHaveBeenCalledOnce()
  })

  it('la carte « Compte » des réglages se branche dans l’édition serveur, et dans l’app qui peut joindre un serveur ; pas sur notak.app', async () => {
    await demarrer()
    expect(compte).toHaveBeenCalledOnce()
    vi.resetModules()
    compte.mockReset()
    vi.stubEnv('VITE_EDITION', 'locale')
    await demarrer()
    expect(compte).not.toHaveBeenCalled()
    vi.resetModules()
    dansLeBureau()
    await demarrer()
    expect(compte).toHaveBeenCalledOnce()
  })

  it('une porte qui ne se charge pas ne laisse pas la page blanche : l’édition locale se monte', async () => {
    vi.stubEnv('VITE_EDITION', 'locale')
    dansLeBureau()
    passerLaPorte.mockRejectedValue(new Error('chunk perdu'))
    await demarrer()
    expect(locale).toHaveBeenCalledOnce()
  })
})
