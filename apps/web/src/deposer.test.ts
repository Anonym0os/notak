import type { EspaceDistant, Tableau } from '@notak/tableau'
import { creerMagasin, nonTriesDe } from '@notak/tableau'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attendre, deposerDansAccueil, messageDuDepot } from './deposer'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('attendre', () => {
  it('rend vrai dès que la condition l’est', async () => {
    let n = 0
    const p = attendre(() => ++n >= 3, 1000)
    await vi.advanceTimersByTimeAsync(300)
    expect(await p).toBe(true)
  })
  it('rend faux quand le délai passe', async () => {
    const p = attendre(() => false, 500)
    await vi.advanceTimersByTimeAsync(700)
    expect(await p).toBe(false)
  })
  it('abandonne quand on le lui dit', async () => {
    const p = attendre(() => false, 10_000, 100, (ecoule) => ecoule >= 200)
    await vi.advanceTimersByTimeAsync(400)
    expect(await p).toBe(false)
  })
})

/** Un espace réduit à ce que `deposerDansAccueil` touche. */
function faux(options: { synchronise?: () => boolean; envoi?: () => 'enregistre' | 'envoi' | 'hors-ligne' }) {
  const magasin = creerMagasin({ titre: 'Accueil', elements: [] } satisfies Tableau)
  const retenu = { n: 0, rendu: 0 }
  const espace = {
    racine: 'accueil',
    magasin: () => magasin,
    synchronise: options.synchronise ?? (() => true),
    envoi: options.envoi ?? (() => 'enregistre' as const),
    retenir: () => {
      retenu.n++
      return () => void retenu.rendu++
    },
  } as unknown as EspaceDistant
  return { espace, magasin, retenu }
}

describe('deposerDansAccueil', () => {
  it('pose la note dans les non triés, retient l’accueil le temps du geste, et dit que le serveur l’a reçue', async () => {
    const { espace, magasin, retenu } = faux({})
    const p = deposerDansAccueil(espace, { texte: 'Une idée' }, 1000)
    await vi.advanceTimersByTimeAsync(500)
    expect(await p).toEqual({ etat: 'enregistre', ajoutes: 1, ignores: 0 })
    const [note] = nonTriesDe(magasin.lire())
    expect(note).toMatchObject({ nonTrie: 1000, contenu: { type: 'note' } })
    expect(retenu).toEqual({ n: 1, rendu: 1 })
  })

  it('sans réseau : la pose se fait quand même, et le dépôt est dit local', async () => {
    const { espace, magasin } = faux({ synchronise: () => false, envoi: () => 'hors-ligne' })
    const p = deposerDansAccueil(espace, { texte: 'Dans le train' }, 5)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await p).toMatchObject({ etat: 'local', ajoutes: 1 })
    expect(nonTriesDe(magasin.lire())).toHaveLength(1)
  })

  it('attend que le serveur ait rattrapé l’accueil avant de poser', async () => {
    let synchro = false
    const { espace, magasin } = faux({ synchronise: () => synchro })
    const p = deposerDansAccueil(espace, { texte: 'x' }, 1)
    await vi.advanceTimersByTimeAsync(400)
    expect(magasin.lire().elements).toHaveLength(0)
    synchro = true
    await vi.advanceTimersByTimeAsync(800)
    await p
    expect(magasin.lire().elements).toHaveLength(1)
  })

  it('ne pose rien d’une arrivée vide', async () => {
    const { espace, magasin } = faux({})
    const p = deposerDansAccueil(espace, {}, 1)
    await vi.advanceTimersByTimeAsync(500)
    expect(await p).toMatchObject({ ajoutes: 0 })
    expect(magasin.lire().elements).toHaveLength(0)
  })
})

describe('messageDuDepot', () => {
  it('dit ce qui a été ajouté et où', () => {
    expect(messageDuDepot({ etat: 'enregistre', ajoutes: 1, ignores: 0 })).toBe('Ajouté aux non triés.')
    expect(messageDuDepot({ etat: 'enregistre', ajoutes: 3, ignores: 0 })).toBe('3 éléments ajoutés aux non triés.')
  })
  it('dit quand c’est resté sur l’appareil, et ce qui n’a pas pu être pris', () => {
    expect(messageDuDepot({ etat: 'local', ajoutes: 1, ignores: 0 })).toContain('au retour du réseau')
    expect(messageDuDepot({ etat: 'enregistre', ajoutes: 1, ignores: 2 })).toContain('2 images n’ont pas pu être prises')
    expect(messageDuDepot({ etat: 'enregistre', ajoutes: 1, ignores: 1 })).toContain('Une image n’a pas pu être prise')
  })
})

describe('messageDuDepot en anglais', () => {
  it('dit l’ajout, l’endroit et les images laissées de côté', async () => {
    const { definirLangue } = await import('@notak/tableau')
    definirLangue('en')
    try {
      expect(messageDuDepot({ etat: 'enregistre', ajoutes: 1, ignores: 0 })).toBe('Added to Unsorted.')
      expect(messageDuDepot({ etat: 'local', ajoutes: 3, ignores: 1 })).toBe(
        '3 items added to Unsorted, on this device: it will be sent when the network is back. One image couldn’t be taken.',
      )
    } finally {
      definirLangue('fr')
    }
  })
})
