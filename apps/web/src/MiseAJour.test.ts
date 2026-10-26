// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  localStorage.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.resetModules()
})

/**
 * Le module neuf, dans une app de bureau dont la coque répond par `reponse`, et dont `acces` (les réglages) lit et écrit
 * `reglage`. Par défaut, la page des toiles d'ici (l'édition locale) ; `serveur` : celle d'un serveur Notak.
 */
async function avecCoque(reponse: (commande: string) => Promise<unknown>, { majAuto = true, serveur = false } = {}) {
  if (!serveur) vi.stubEnv('VITE_EDITION', 'locale')
  const reglage = { majAuto }
  const invoke = vi.fn(async (commande: string, args?: unknown) => {
    if (commande === 'acces') return { ouvrir: 'local', serveur: null, majAuto: reglage.majAuto, version: '0.1.0' }
    if (commande === 'regler_maj_auto') {
      reglage.majAuto = (args as { actif: boolean }).actif
      return null
    }
    return reponse(commande)
  })
  ;(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = { invoke }
  return { m: await import('./MiseAJour'), invoke, reglage }
}
const recherches = (invoke: ReturnType<typeof vi.fn>) => invoke.mock.calls.filter((c) => c[0] === 'preparer_mise_a_jour').length

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

  it('une installation qui échoue se retient : la mise à jour est perdue côté coque, il faut la chercher de nouveau', async () => {
    vi.useFakeTimers()
    let installe = false
    const { m } = await avecCoque(async (c) => {
      if (c === 'preparer_mise_a_jour') return { etat: 'prete', version: '0.1.0', nouvelle: '0.2.0', notes: null, date: null }
      if (c === 'installer_mise_a_jour' && !installe) throw 'permission denied'
      return null
    })
    await m.chercherMiseAJour()
    const fin = m.redemarrer()
    await vi.runAllTimersAsync()
    await fin
    // Une phrase (une coque d'avant les codes) ne s'affiche pas : elle se range sous « autre ».
    expect(m.lireMiseAJour()).toMatchObject({ phase: 'erreur', nouvelle: '0.2.0', erreur: 'autre', echecInstallation: true })

    // « Réessayer » cherche de nouveau : la mise à jour reprise, l'échec s'efface.
    installe = true
    await m.chercherMiseAJour(true)
    expect(m.lireMiseAJour()).toMatchObject({ phase: 'prete', nouvelle: '0.2.0' })
    expect(m.lireMiseAJour().echecInstallation).toBeUndefined()
  })

  it('une recherche qui échoue après un échec d’installation garde l’échec : on peut réessayer', async () => {
    vi.useFakeTimers()
    let reponse: unknown = { etat: 'prete', version: '0.1.0', nouvelle: '0.2.0', notes: null, date: null }
    const { m } = await avecCoque(async (c) => {
      if (c === 'preparer_mise_a_jour') {
        if (reponse instanceof Error) throw reponse
        return reponse
      }
      if (c === 'installer_mise_a_jour') throw 'disque plein'
      return null
    })
    await m.chercherMiseAJour()
    const fin = m.redemarrer()
    await vi.runAllTimersAsync()
    await fin
    reponse = new Error('error sending request')
    await m.chercherMiseAJour(true)
    expect(m.lireMiseAJour()).toMatchObject({ phase: 'erreur', nouvelle: '0.2.0', echecInstallation: true })
  })

  it('une coque construite à la main le dit, et la page ne cherche plus', async () => {
    const { m, invoke } = await avecCoque(async () => ({ etat: 'indisponible', version: '0.1.0' }))
    await m.chercherMiseAJour()
    await m.chercherMiseAJour(true)
    expect(m.lireMiseAJour().phase).toBe('indisponible')
    expect(recherches(invoke)).toBe(1)
  })

  it('une installation refusée par l’emplacement de l’app le dit par son code', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { m } = await avecCoque(async (c) => {
      if (c === 'preparer_mise_a_jour') return { etat: 'prete', version: '0.1.0', nouvelle: '0.2.0', notes: null, date: null }
      throw { code: 'emplacement' }
    })
    await m.chercherMiseAJour()
    const fin = m.redemarrer()
    await vi.runAllTimersAsync()
    await fin
    expect(m.lireMiseAJour()).toMatchObject({ phase: 'erreur', erreur: 'emplacement', echecInstallation: true })
  })

  it('une coque d’avant les mises à jour ne connaît pas la commande : indisponible, sans erreur', async () => {
    for (const refus of ['Command preparer_mise_a_jour not found', 'preparer_mise_a_jour not allowed. Command not found', 'Command preparer_mise_a_jour not allowed by ACL']) {
      vi.resetModules()
      const { m } = await avecCoque(async () => {
        throw refus
      })
      await m.chercherMiseAJour(true)
      expect(m.lireMiseAJour().phase, refus).toBe('indisponible')
    }
  })

  it('un « Not Found » venu du téléchargement n’est pas une coque sans mises à jour : un échec, qu’on peut réessayer', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { m } = await avecCoque(async () => {
      throw 'Download request failed with status: 404 Not Found'
    })
    await m.chercherMiseAJour(true)
    expect(m.lireMiseAJour()).toMatchObject({ phase: 'erreur', erreur: 'autre' })
  })

  it('hors ligne : la recherche automatique se tait, celle qu’on a demandée le dit par son code, le détail en console', async () => {
    const console_ = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { m } = await avecCoque(async () => {
      throw { code: 'reseau' }
    })
    await m.chercherMiseAJour()
    expect(m.lireMiseAJour().phase).toBe('inconnue')
    await m.chercherMiseAJour(true)
    expect(m.lireMiseAJour()).toMatchObject({ phase: 'erreur', erreur: 'reseau' })
    expect(console_).toHaveBeenCalledWith('Notak : la recherche d’une mise à jour a échoué', { code: 'reseau' })
  })

  it('une signature refusée se dit, même quand la recherche allait d’elle-même : réessayer n’y changera rien', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { m } = await avecCoque(async () => {
      throw { code: 'signature' }
    })
    await m.chercherMiseAJour()
    expect(m.lireMiseAJour()).toMatchObject({ phase: 'erreur', erreur: 'signature' })
  })

  it('« Rechercher maintenant » demande à la coque d’aller voir GitHub ; la recherche automatique se contente de sa dernière réponse', async () => {
    const { m, invoke } = await avecCoque(async () => ({ etat: 'a-jour', version: '0.1.0', verifie: 1_800_000_000_000 }))
    await m.chercherMiseAJour()
    await m.chercherMiseAJour(true)
    expect(invoke.mock.calls.filter((c) => c[0] === 'preparer_mise_a_jour').map((c) => c[1])).toEqual([{ parLaPersonne: false }, { parLaPersonne: true }])
    // « Vérifié il y a… » dit quand GitHub a répondu, pas quand la page a demandé.
    expect(m.lireMiseAJour()).toMatchObject({ phase: 'a-jour', verifie: 1_800_000_000_000 })
  })

  it('« Plus tard » se retient : la page suivante (un rechargement, un retour) ne le redemande pas pour cette version', async () => {
    const prete = { etat: 'prete', version: '0.1.0', nouvelle: '0.2.0', notes: null, date: null }
    const { m } = await avecCoque(async () => prete)
    await m.chercherMiseAJour()
    m.ecarter()
    vi.resetModules()
    const { m: suivante } = await avecCoque(async () => prete)
    await suivante.chercherMiseAJour()
    expect(suivante.lireMiseAJour()).toMatchObject({ nouvelle: '0.2.0', ecartee: '0.2.0' })
  })

  it('la version qui tourne se dit, même quand la recherche automatique est coupée', async () => {
    const { m, invoke } = await avecCoque(async () => null, { majAuto: false })
    expect(m.lireMiseAJour().version).toBeNull()
    await m.actualiserRechercheAuto()
    expect(m.lireMiseAJour().version).toBe('0.1.0')
    expect(recherches(invoke)).toBe(0)
  })

  it('dans un navigateur, rien ne se cherche', async () => {
    const m = await import('./MiseAJour')
    await m.chercherMiseAJour(true)
    m.lancerMisesAJour()
    expect(m.lireMiseAJour().phase).toBe('inconnue')
  })
})

describe('la recherche automatique, réglage de la coque', () => {
  it('cherche au lancement puis toutes les six heures, sauf si on l’a coupée', async () => {
    vi.useFakeTimers()
    const { m, invoke } = await avecCoque(async () => ({ etat: 'a-jour', version: '0.1.0' }))
    m.lancerMisesAJour()
    await vi.advanceTimersByTimeAsync(m.PREMIERE_RECHERCHE_MS)
    expect(recherches(invoke)).toBe(1)
    await m.reglerRechercheAuto(false)
    await vi.advanceTimersByTimeAsync(m.INTERVALLE_RECHERCHE_MS)
    expect(recherches(invoke)).toBe(1)
    expect(m.rechercheAuto()).toBe(false)
  })

  it('le réglage se relit à chaque recherche : coupée depuis l’autre page, elle se tait', async () => {
    vi.useFakeTimers()
    const { m, invoke, reglage } = await avecCoque(async () => ({ etat: 'a-jour', version: '0.1.0' }))
    m.lancerMisesAJour()
    await vi.advanceTimersByTimeAsync(m.PREMIERE_RECHERCHE_MS)
    expect(recherches(invoke)).toBe(1)
    // Une autre page de Notak (les toiles d'ici, quand on est sur un serveur) a coupé la recherche.
    reglage.majAuto = false
    await vi.advanceTimersByTimeAsync(m.INTERVALLE_RECHERCHE_MS)
    expect(recherches(invoke)).toBe(1)
    expect(m.rechercheAuto()).toBe(false)
    reglage.majAuto = true
    await vi.advanceTimersByTimeAsync(m.INTERVALLE_RECHERCHE_MS)
    expect(recherches(invoke)).toBe(2)
  })

  it('coupée au démarrage, la première recherche ne part pas non plus', async () => {
    vi.useFakeTimers()
    const { m, invoke } = await avecCoque(async () => ({ etat: 'a-jour', version: '0.1.0' }), { majAuto: false })
    m.lancerMisesAJour()
    await vi.advanceTimersByTimeAsync(m.PREMIERE_RECHERCHE_MS)
    expect(recherches(invoke)).toBe(0)
    expect(m.rechercheAuto()).toBe(false)
  })

  it('vraie tant qu’on ne l’a pas lue ; la coque la dit ensuite', async () => {
    const { m } = await avecCoque(async () => null, { majAuto: false })
    expect(m.rechercheAuto()).toBe(true)
    expect(await m.actualiserRechercheAuto()).toBe(false)
    expect(m.rechercheAuto()).toBe(false)
  })

  it('une coque d’avant les serveurs ne dit rien : la recherche reste permise', async () => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_EDITION', 'locale')
    const invoke = vi.fn(async (commande: string) => {
      if (commande === 'preparer_mise_a_jour') return { etat: 'a-jour', version: '0.1.0' }
      throw `Command ${commande} not found`
    })
    ;(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = { invoke }
    const m = await import('./MiseAJour')
    m.lancerMisesAJour()
    await vi.advanceTimersByTimeAsync(m.PREMIERE_RECHERCHE_MS)
    expect(recherches(invoke)).toBe(1)
    // Et la coque qui ne retient pas le choix le laisse tel qu'il était.
    await m.reglerRechercheAuto(false)
    expect(m.rechercheAuto()).toBe(true)
  })

  it('sur la page des toiles d’ici, on la règle : la coque le retient, et rallumée elle cherche aussitôt', async () => {
    const { m, invoke, reglage } = await avecCoque(async () => ({ etat: 'a-jour', version: '0.1.0' }))
    await m.reglerRechercheAuto(false)
    expect(invoke).toHaveBeenCalledWith('regler_maj_auto', { actif: false }, undefined)
    expect(reglage.majAuto).toBe(false)
    expect(m.rechercheAuto()).toBe(false)
    expect(recherches(invoke)).toBe(0)
    await m.reglerRechercheAuto(true)
    expect(reglage.majAuto).toBe(true)
    await vi.waitFor(() => expect(recherches(invoke)).toBe(1))
  })

  it('sur la page d’un serveur, la coque refuserait : la page ne le demande pas', async () => {
    const { m, invoke } = await avecCoque(async () => null, { serveur: true })
    await m.reglerRechercheAuto(false)
    expect(invoke.mock.calls.some((c) => c[0] === 'regler_maj_auto')).toBe(false)
    expect(m.rechercheAuto()).toBe(true)
  })

  it('le réglage d’une version d’avant (la mémoire de la page) ne compte plus', async () => {
    localStorage.setItem('notak:bureau:maj-auto', '0')
    const { m } = await avecCoque(async () => null)
    expect(m.rechercheAuto()).toBe(true)
    await m.actualiserRechercheAuto()
    expect(m.rechercheAuto()).toBe(true)
    await m.reglerRechercheAuto(false)
    expect(localStorage.getItem('notak:bureau:maj-auto')).toBe('0')
  })
})
