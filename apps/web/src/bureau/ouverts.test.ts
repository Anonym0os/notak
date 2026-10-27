import { describe, expect, it, vi } from 'vitest'
import { FICHIER_OUVERT, type FichierOuvert } from '../bureau'
import { type MoyensFichiers, type Reouverture, suivreFichiersOuverts, traiterFichiersOuverts } from './ouverts'

const fichier = (id: string, o: Partial<FichierOuvert> = {}): FichierOuvert => ({ id, nom: `${id}.notak`, taille: 3, confiee: false, ...o })
const OCTETS = (id: string) => new TextEncoder().encode(id)

/** Une coque dont la file se vide à la lecture, comme la vraie (`lireFichierOuvert` consomme). */
function fausseCoque(file: FichierOuvert[]) {
  const evenements: (() => void)[] = []
  const desabonne = vi.fn()
  const lues: string[] = []
  const moyens: MoyensFichiers = {
    lister: async () => [...file],
    lire: async (id) => {
      const i = file.findIndex((f) => f.id === id)
      if (i < 0) throw { code: 'introuvable' }
      file.splice(i, 1)
      lues.push(id)
      return OCTETS(id)
    },
    ecouter: async (evenement, rappel) => {
      expect(evenement).toBe(FICHIER_OUVERT)
      evenements.push(rappel)
      return desabonne
    },
  }
  return { file, moyens, lues, desabonne, annoncer: () => evenements.forEach((f) => f()) }
}

const reouverture = (o: Partial<Reouverture> = {}) => {
  const rouvertes: string[] = []
  const r: Reouverture = {
    rouvrir: vi.fn(async (octets: Uint8Array) => {
      rouvertes.push(new TextDecoder().decode(octets))
      return 'fait' as const
    }),
    echec: vi.fn(),
    ...o,
  }
  return { r, rouvertes }
}

/** Laisse passer les promesses et les passes en file. */
const attendre = () => new Promise((fin) => setTimeout(fin, 20))

describe('une passe sur les copies ouvertes depuis le système', () => {
  it('rouvre chaque copie du disque, dans l’ordre, et les lit une fois', async () => {
    const { moyens, file, lues } = fausseCoque([fichier('a'), fichier('b')])
    const { r, rouvertes } = reouverture()
    expect(await traiterFichiersOuverts(r, moyens)).toBe(2)
    expect(rouvertes).toEqual(['a', 'b'])
    expect(lues).toEqual(['a', 'b'])
    expect(file).toEqual([])
    expect(r.rouvrir).toHaveBeenCalledWith(expect.any(Uint8Array), 'a.notak')
  })

  it('laisse en file les toiles confiées au serveur : elles ne sont pas pour cette page', async () => {
    const { moyens, file, lues } = fausseCoque([fichier('confiee', { confiee: true }), fichier('disque'), fichier('autre', { confiee: true })])
    const { r, rouvertes } = reouverture()
    expect(await traiterFichiersOuverts(r, moyens)).toBe(1)
    expect(rouvertes).toEqual(['disque'])
    expect(lues).toEqual(['disque'])
    expect(file.map((f) => f.id)).toEqual(['confiee', 'autre'])
  })

  it('une copie illisible se dit, les suivantes se rouvrent quand même', async () => {
    const { moyens } = fausseCoque([fichier('a'), fichier('b'), fichier('c')])
    const lire = moyens.lire
    moyens.lire = async (id) => {
      if (id === 'b') throw { code: 'illisible' }
      return lire(id)
    }
    const { r, rouvertes } = reouverture()
    expect(await traiterFichiersOuverts(r, moyens)).toBe(2)
    expect(rouvertes).toEqual(['a', 'c'])
    expect(r.echec).toHaveBeenCalledOnce()
    expect(r.echec).toHaveBeenCalledWith({ code: 'illisible' }, 'b.notak')
  })

  it('une copie déjà prise par une autre passe n’est pas une erreur', async () => {
    const { moyens } = fausseCoque([fichier('fantome')])
    moyens.lister = async () => [fichier('deja')]
    const { r } = reouverture()
    expect(await traiterFichiersOuverts(r, moyens)).toBe(0)
    expect(r.echec).not.toHaveBeenCalled()
  })

  it('une réouverture qui échoue se dit, et la passe continue', async () => {
    const { moyens } = fausseCoque([fichier('a'), fichier('b')])
    const rouvertes: string[] = []
    const { r } = reouverture({
      rouvrir: vi.fn(async (octets: Uint8Array) => {
        const id = new TextDecoder().decode(octets)
        if (id === 'a') throw new Error('pas une copie')
        rouvertes.push(id)
        return 'fait' as const
      }),
    })
    expect(await traiterFichiersOuverts(r, moyens)).toBe(2)
    expect(rouvertes).toEqual(['b'])
    expect(r.echec).toHaveBeenCalledWith(expect.any(Error), 'a.notak')
  })

  it('quand la page repart de l’accueil, le reste attend la page suivante', async () => {
    const { moyens, file } = fausseCoque([fichier('a'), fichier('b')])
    const { r } = reouverture({ rouvrir: vi.fn(async () => 'recharge' as const) })
    expect(await traiterFichiersOuverts(r, moyens)).toBe(1)
    expect(r.rouvrir).toHaveBeenCalledOnce()
    expect(file.map((f) => f.id)).toEqual(['b'])
  })

  it('une passe qu’on a arrêtée ne lit plus rien', async () => {
    const { moyens, file } = fausseCoque([fichier('a')])
    const { r } = reouverture()
    expect(await traiterFichiersOuverts(r, moyens, () => false)).toBe(0)
    expect(file).toHaveLength(1)
  })
})

describe('suivre les copies ouvertes', () => {
  it('prend celles qui attendent tout de suite, puis chaque nouvelle que la coque annonce', async () => {
    const coque = fausseCoque([fichier('a')])
    const { r, rouvertes } = reouverture()
    const arreter = suivreFichiersOuverts(r, coque.moyens)
    await attendre()
    expect(rouvertes).toEqual(['a'])
    coque.file.push(fichier('b'))
    coque.annoncer()
    await attendre()
    expect(rouvertes).toEqual(['a', 'b'])
    arreter()
    expect(coque.desabonne).toHaveBeenCalledOnce()
  })

  it('plusieurs annonces d’un coup ne lisent pas deux fois la même copie', async () => {
    const coque = fausseCoque([fichier('a'), fichier('b')])
    const { r, rouvertes } = reouverture()
    suivreFichiersOuverts(r, coque.moyens)
    coque.annoncer()
    coque.annoncer()
    await attendre()
    expect(rouvertes).toEqual(['a', 'b'])
    expect(r.echec).not.toHaveBeenCalled()
  })

  it('arrêté avant même que l’écoute soit prête (le double montage de React), il se désabonne dès qu’il le peut et ne lit rien', async () => {
    const coque = fausseCoque([fichier('a')])
    const { r, rouvertes } = reouverture()
    suivreFichiersOuverts(r, coque.moyens)()
    // Le deuxième montage prend le relais, sans que le premier n'ait rien pris.
    const second = suivreFichiersOuverts(r, coque.moyens)
    await attendre()
    expect(coque.desabonne).toHaveBeenCalledOnce()
    expect(rouvertes).toEqual(['a'])
    expect(r.echec).not.toHaveBeenCalled()
    second()
  })

  it('une coque d’avant les fichiers ouverts : rien à prendre, rien à dire', async () => {
    const coque = fausseCoque([])
    coque.moyens.lister = async () => {
      throw 'Command fichiers_ouverts not found'
    }
    coque.moyens.ecouter = async () => {
      throw new Error('hors de l’application de bureau')
    }
    const avertir = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { r } = reouverture()
    const arreter = suivreFichiersOuverts(r, coque.moyens)
    await attendre()
    expect(r.rouvrir).not.toHaveBeenCalled()
    expect(r.echec).not.toHaveBeenCalled()
    expect(() => arreter()).not.toThrow()
    avertir.mockRestore()
  })
})
