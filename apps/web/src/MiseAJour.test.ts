// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  localStorage.clear()
  vi.useRealTimers()
  vi.resetModules()
})

/** Le module neuf, dans une app de bureau dont la coque répond par `reponse`. */
async function avecCoque(reponse: (commande: string) => Promise<unknown>) {
  const invoke = vi.fn(reponse)
  ;(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = { invoke }
  return { m: await import('./MiseAJour'), invoke }
}

describe('les mises à jour de l’app de bureau', () => {
  it('une version prête se dit avec son numéro ; Redémarrer la fait poser par la coque', async () => {
    vi.useFakeTimers()
    const { m, invoke } = await avecCoque(async (c) =>
      c === 'preparer_mise_a_jour' ? { etat: 'prete', version: '0.1.0', nouvelle: '0.2.0', notes: 'Des choses', date: null } : null,
    )
    await m.chercherMiseAJour()
    expect(m.lireMiseAJour()).toMatchObject({ version: '0.1.0', phase: 'prete', nouvelle: '0.2.0', notes: 'Des choses' })
    const fin = m.redemarrer()
    expect(m.lireMiseAJour().phase).toBe('pose')
    await vi.runAllTimersAsync()
    await fin
    expect(invoke).toHaveBeenLastCalledWith('installer_mise_a_jour', undefined, undefined)
  })

  it('une coque construite à la main le dit, et la page ne cherche plus', async () => {
    const { m, invoke } = await avecCoque(async () => ({ etat: 'indisponible', version: '0.1.0' }))
    await m.chercherMiseAJour()
    await m.chercherMiseAJour(true)
    expect(m.lireMiseAJour().phase).toBe('indisponible')
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('une coque d’avant les mises à jour ne connaît pas la commande : indisponible, sans erreur', async () => {
    const { m } = await avecCoque(async () => {
      throw 'Command preparer_mise_a_jour not found'
    })
    await m.chercherMiseAJour(true)
    expect(m.lireMiseAJour().phase).toBe('indisponible')
  })

  it('hors ligne : la recherche automatique se tait, celle qu’on a demandée le dit', async () => {
    const { m } = await avecCoque(async () => {
      throw 'error sending request'
    })
    await m.chercherMiseAJour()
    expect(m.lireMiseAJour().phase).toBe('inconnue')
    await m.chercherMiseAJour(true)
    expect(m.lireMiseAJour()).toMatchObject({ phase: 'erreur', erreur: 'error sending request' })
  })

  it('cherche au lancement puis toutes les six heures, sauf si on l’a coupé', async () => {
    vi.useFakeTimers()
    const { m, invoke } = await avecCoque(async () => ({ etat: 'a-jour', version: '0.1.0' }))
    m.lancerMisesAJour()
    await vi.advanceTimersByTimeAsync(m.PREMIERE_RECHERCHE_MS)
    expect(invoke).toHaveBeenCalledTimes(1)
    m.reglerRechercheAuto(false)
    await vi.advanceTimersByTimeAsync(m.INTERVALLE_MS)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(m.rechercheAuto()).toBe(false)
  })

  it('dans un navigateur, rien ne se cherche', async () => {
    const m = await import('./MiseAJour')
    await m.chercherMiseAJour(true)
    m.lancerMisesAJour()
    expect(m.lireMiseAJour().phase).toBe('inconnue')
  })
})
