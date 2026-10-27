// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  vi.resetModules()
})

/** Le module neuf, dans une app de bureau dont la coque répond par `invoke`. */
async function dansLeBureau(invoke: (commande: string, a?: unknown, o?: unknown) => Promise<unknown>) {
  ;(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = { invoke: vi.fn(invoke) }
  const m = await import('./enregistrement')
  return { ...m, invoke: (window as unknown as { __TAURI_INTERNALS__: { invoke: ReturnType<typeof vi.fn> } }).__TAURI_INTERNALS__.invoke }
}
const octets = new Uint8Array([80, 75, 3, 4])

describe('une copie .notak dans l’app de bureau', () => {
  it('la première fois, on choisit où ; ensuite Cmd+S réécrit le même fichier sans rien demander', async () => {
    const { rangerCopie, fichierDeCopie, invoke } = await dansLeBureau(async (c) => (c === 'choisir_emplacement' ? 'Mes toiles.notak' : null))
    expect(await rangerCopie(octets, 'Accueil 2026-10-25.notak')).toEqual({ ou: 'fichier', nom: 'Mes toiles.notak' })
    expect(invoke).toHaveBeenNthCalledWith(1, 'choisir_emplacement', { nom: 'Accueil 2026-10-25.notak', extension: 'notak', description: 'Notak', garder: true }, undefined)
    expect(invoke).toHaveBeenNthCalledWith(2, 'ecrire_fichier', octets, { headers: { 'x-notak-usage': 'copie' } })
    expect(await rangerCopie(octets, 'Accueil 2026-10-26.notak')).toEqual({ ou: 'fichier', nom: 'Mes toiles.notak' })
    expect(invoke).toHaveBeenCalledTimes(3)
    expect(fichierDeCopie()).toBe('Mes toiles.notak')
  })

  it('« Enregistrer ailleurs » redemande, Annuler ne touche à rien', async () => {
    const { rangerCopie, invoke } = await dansLeBureau(async (c) => (c === 'choisir_emplacement' ? null : null))
    expect(await rangerCopie(octets, 'a.notak', true)).toEqual({ ou: 'annule' })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('une écriture refusée (dossier disparu) fait redemander la fois suivante', async () => {
    let echoue = true
    const { rangerCopie, invoke } = await dansLeBureau(async (c) => {
      if (c === 'choisir_emplacement') return 'x.notak'
      if (echoue) throw new Error('No such file or directory')
      return null
    })
    await expect(rangerCopie(octets, 'a.notak')).rejects.toThrow()
    echoue = false
    await rangerCopie(octets, 'a.notak')
    expect(invoke.mock.calls.filter(([c]) => c === 'choisir_emplacement')).toHaveLength(2)
  })
})
