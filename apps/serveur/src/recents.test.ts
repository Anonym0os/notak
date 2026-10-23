import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RECENTS_GARDES } from './base.ts'
import { type Compte, type Monde, monde } from './essai.ts'

let m: Monde
let ana: Compte
let bob: Compte
let cleo: Compte

beforeAll(async () => {
  m = monde()
  ana = await m.compte('Ana')
  bob = await m.compte('Bob')
  cleo = await m.compte('Cléo')
  m.tableau(ana, 'tableau-un', 'Un')
  m.tableau(ana, 'tableau-deux', 'Deux')
  m.tableau(ana, 'tableau-trois', 'Trois')
  m.base.definirAcces({ tableau: 'tableau-un', utilisateur: bob.utilisateur.id, role: 'lecture' })
})
afterAll(() => m.fermer())

const liste = async (chemin: string, c: Compte) => (await m.appeler(chemin, { compte: c })).json() as Promise<{ id: string; titre: string; role: string }[]>
const vu = (id: string, c?: Compte) => m.appeler(`/api/tableaux/${id}/vu`, { methode: 'POST', compte: c })

describe('tableaux récents', () => {
  it('le dernier ouvert vient en premier, chaque tableau une seule fois, par compte', async () => {
    for (const id of ['tableau-un', 'tableau-deux', 'tableau-trois', 'tableau-un']) expect((await vu(id, ana)).status).toBe(204)
    expect((await liste('/api/recents', ana)).map((t) => t.id)).toEqual(['tableau-un', 'tableau-trois', 'tableau-deux'])
    expect(await liste('/api/recents', cleo)).toEqual([])
  })

  it('porte le titre et le rôle de celui qui regarde', async () => {
    await vu('tableau-un', bob)
    expect(await liste('/api/recents', bob)).toEqual([{ id: 'tableau-un', titre: 'Un', role: 'lecture' }])
  })

  it('refuse sans session, sans droit ; l’accueil n’entre pas dans la liste', async () => {
    expect((await vu('tableau-un')).status).toBe(401)
    expect((await vu('tableau-deux', bob)).status).toBe(404)
    expect((await m.appeler('/api/recents')).status).toBe(401)
    expect((await vu(ana.utilisateur.racine, ana)).status).toBe(204)
    expect((await liste('/api/recents', ana)).map((t) => t.id)).not.toContain(ana.utilisateur.racine)
  })

  it('un tableau dont l’accès est retiré disparaît de la liste', async () => {
    m.base.retirerAcces('tableau-un', bob.utilisateur.id)
    expect(await liste('/api/recents', bob)).toEqual([])
  })

  it('ne garde que les plus récents', () => {
    for (let i = 0; i < RECENTS_GARDES + 5; i++) {
      m.base.creerTableau({ id: `tableau-extra-${i}`, titre: `E${i}`, proprietaire: cleo.utilisateur.id, parent: null })
      m.base.noterVu(cleo.utilisateur.id, `tableau-extra-${i}`, 1000 + i)
    }
    const gardes = m.base.recents(cleo.utilisateur.id, 1000)
    expect(gardes).toHaveLength(RECENTS_GARDES)
    expect(gardes[0]).toBe(`tableau-extra-${RECENTS_GARDES + 4}`)
  })
})

describe('favoris', () => {
  it('on ajoute, on retire, le dernier ajouté vient en premier', async () => {
    expect(await liste('/api/favoris', ana)).toEqual([])
    expect((await m.appeler('/api/tableaux/tableau-deux/favori', { methode: 'PUT', compte: ana })).status).toBe(204)
    m.base.definirFavori(ana.utilisateur.id, 'tableau-trois', Date.now() + 10)
    // Répéter ne change rien.
    expect((await m.appeler('/api/tableaux/tableau-deux/favori', { methode: 'PUT', compte: ana })).status).toBe(204)
    expect((await liste('/api/favoris', ana)).map((t) => t.id)).toEqual(['tableau-trois', 'tableau-deux'])
    expect((await m.appeler('/api/tableaux/tableau-trois/favori', { methode: 'DELETE', compte: ana })).status).toBe(204)
    expect((await liste('/api/favoris', ana)).map((t) => t.id)).toEqual(['tableau-deux'])
  })

  it('les favoris sont à chacun, et il faut voir le tableau', async () => {
    expect(await liste('/api/favoris', bob)).toEqual([])
    expect((await m.appeler('/api/tableaux/tableau-deux/favori', { methode: 'PUT', compte: bob })).status).toBe(404)
    expect((await m.appeler('/api/tableaux/tableau-deux/favori', { methode: 'PUT' })).status).toBe(401)
    expect((await m.appeler('/api/favoris')).status).toBe(401)
  })

  it('l’accueil ne se met pas en favori', async () => {
    expect((await m.appeler(`/api/tableaux/${ana.utilisateur.racine}/favori`, { methode: 'PUT', compte: ana })).status).toBe(400)
  })

  it('un accès retiré fait disparaître le favori', async () => {
    m.base.definirAcces({ tableau: 'tableau-trois', utilisateur: bob.utilisateur.id, role: 'lecture' })
    expect((await m.appeler('/api/tableaux/tableau-trois/favori', { methode: 'PUT', compte: bob })).status).toBe(204)
    expect(await liste('/api/favoris', bob)).toHaveLength(1)
    m.base.retirerAcces('tableau-trois', bob.utilisateur.id)
    expect(await liste('/api/favoris', bob)).toEqual([])
  })
})
