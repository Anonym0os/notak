// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ATTENTE_ECRITURES_MS, DEPART_MS, NOM_COPIE, emporterSurServeur, emporterToiles, lireEtatServeur, oublierEchecServeur, revenirSurServeur } from './emporter'
import { SERVEUR, coque, invoke, poserCoque, retirerCoque } from './essai'

const COPIE = new Uint8Array([1, 2, 3])

describe('copier les toiles de cet ordinateur sur son serveur', () => {
  it('le nom de la copie ne dépend pas de la langue, et reste un .notak que la coque accepte', async () => {
    const noms: string[] = []
    for (const langue of ['fr', 'en'] as const) {
      definirLangue(langue)
      await emporterToiles(SERVEUR, async () => COPIE, { attendre: async () => {}, confier: async (_, nom) => void noms.push(nom), joindre: async (o) => ({ origine: o, nom: null, version: '1' }) })
    }
    definirLangue('fr')
    expect(noms).toEqual([NOM_COPIE, NOM_COPIE])
    expect(NOM_COPIE).toMatch(/\.notak$/)
  })

  it('copie tout, attend qu’IndexedDB ait écrit, confie la copie à la coque, puis seulement alors joint le serveur', async () => {
    const ordre: string[] = []
    await emporterToiles(
      SERVEUR,
      async () => {
        ordre.push('copie')
        return COPIE
      },
      {
        attendre: async (ms) => void ordre.push(`attendre ${ms}`),
        confier: async (octets, nom) => void ordre.push(`confier ${[...octets]} ${nom}`),
        joindre: async (adresse, garder) => {
          ordre.push(`joindre ${adresse} ${garder}`)
          return { origine: adresse, nom: null, version: '1' }
        },
      },
    )
    expect(ordre).toEqual(['copie', `attendre ${ATTENTE_ECRITURES_MS}`, 'confier 1,2,3 Toiles de cet ordinateur.notak', `joindre ${SERVEUR} true`])
  })

  it('une copie qui échoue ne confie rien et ne part nulle part', async () => {
    const confier = vi.fn()
    const joindre = vi.fn()
    await expect(emporterToiles(SERVEUR, async () => Promise.reject(new Error('disque')), { attendre: async () => {}, confier, joindre })).rejects.toThrow('disque')
    expect(confier).not.toHaveBeenCalled()
    expect(joindre).not.toHaveBeenCalled()
  })

  it('une copie que la coque refuse ne mène pas au serveur', async () => {
    const joindre = vi.fn()
    await expect(
      emporterToiles(SERVEUR, async () => COPIE, { attendre: async () => {}, confier: () => Promise.reject({ code: 'trop_gros' }), joindre }),
    ).rejects.toEqual({ code: 'trop_gros' })
    expect(joindre).not.toHaveBeenCalled()
  })
})

describe('l’état de ces gestes, tenu hors du panneau qui les lance', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    poserCoque()
  })
  afterEach(async () => {
    // Un geste réussi laisse la page « en cours » jusqu'à son départ : on laisse passer ce temps.
    await vi.advanceTimersByTimeAsync(DEPART_MS)
    vi.useRealTimers()
    oublierEchecServeur()
    retirerCoque()
    vi.restoreAllMocks()
  })

  it('« Revenir sur » joint le serveur en le retenant ; la page reste « en cours » jusqu’à son départ', async () => {
    coque.joindre_serveur = () => ({ origine: SERVEUR, nom: null, version: '1' })
    await revenirSurServeur(SERVEUR)
    expect(invoke).toHaveBeenCalledWith('joindre_serveur', { adresse: SERVEUR, garder: true }, undefined)
    expect(lireEtatServeur()).toEqual({ type: 'cours', quoi: 'revenir' })
    // Si la fenêtre ne part pas, les boutons se rendent.
    await vi.advanceTimersByTimeAsync(DEPART_MS)
    expect(lireEtatServeur()).toEqual({ type: 'repos' })
  })

  it('un refus se garde, jusqu’à ce qu’on rouvre le panneau', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    coque.joindre_serveur = () => {
      throw { code: 'injoignable' }
    }
    await revenirSurServeur(SERVEUR)
    expect(lireEtatServeur()).toEqual({ type: 'echec', echec: { code: 'injoignable' } })
    oublierEchecServeur()
    expect(lireEtatServeur()).toEqual({ type: 'repos' })
  })

  it('« Copier » : une copie confiée à la coque avec son nom, puis le serveur', async () => {
    coque.confier_copie = () => undefined
    coque.joindre_serveur = () => ({ origine: SERVEUR, nom: null, version: '1' })
    const lancee = emporterSurServeur(SERVEUR, async () => COPIE)
    expect(lireEtatServeur()).toEqual({ type: 'cours', quoi: 'emporter' })
    await vi.advanceTimersByTimeAsync(ATTENTE_ECRITURES_MS)
    await lancee
    const commandes = invoke.mock.calls.map((c) => c[0])
    expect(commandes).toEqual(['confier_copie', 'joindre_serveur'])
    expect(invoke.mock.calls[0]![1]).toBe(COPIE)
    expect(invoke.mock.calls[0]![2]).toEqual({ headers: { 'x-notak-nom': encodeURIComponent(NOM_COPIE) } })
  })

  it('une copie trop lourde pour la coque arrête là, sans aller au serveur, et le dit', async () => {
    coque.confier_copie = () => {
      throw { code: 'trop_gros' }
    }
    const lancee = emporterSurServeur(SERVEUR, async () => COPIE)
    await vi.advanceTimersByTimeAsync(ATTENTE_ECRITURES_MS)
    await lancee
    expect(invoke.mock.calls.map((c) => c[0])).toEqual(['confier_copie'])
    expect(lireEtatServeur()).toEqual({ type: 'echec', echec: { code: 'trop_gros' } })
  })

  it('un geste à la fois : pendant qu’il tourne, un autre ne part pas', async () => {
    let partir: (v: unknown) => void = () => {}
    coque.joindre_serveur = () => new Promise((fin) => (partir = fin))
    const premier = revenirSurServeur(SERVEUR)
    await revenirSurServeur(SERVEUR)
    await emporterSurServeur(SERVEUR, async () => COPIE)
    expect(invoke.mock.calls.filter((c) => c[0] === 'joindre_serveur')).toHaveLength(1)
    expect(invoke.mock.calls.filter((c) => c[0] === 'confier_copie')).toHaveLength(0)
    partir(null)
    await premier
  })
})
