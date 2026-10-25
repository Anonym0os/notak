import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Compte, type Monde, monde } from './essai.ts'
import { creerHocuspocus } from './synchro.ts'
import { verrouPar } from './verrou.ts'

let m: Monde
let ana: Compte
let bob: Compte
let cleo: Compte

beforeAll(async () => {
  m = monde()
  ana = await m.compte('Ana')
  bob = await m.compte('Bob')
  cleo = await m.compte('Cléo')
  m.tableau(ana, 'tableau-coffre', 'Coffre')
  m.tableau(ana, 'tableau-fils', 'Dans le coffre', undefined, 'tableau-coffre')
  m.tableau(ana, 'tableau-libre', 'Libre')
  m.base.definirAcces({ tableau: 'tableau-coffre', utilisateur: bob.utilisateur.id, role: 'edition' })
  m.base.definirAcces({ tableau: 'tableau-libre', utilisateur: bob.utilisateur.id, role: 'lecture' })
})
afterAll(() => m.fermer())

const mdp = (c: Compte, methode: string, motDePasse?: string, id = 'tableau-coffre') =>
  m.appeler(`/api/tableaux/${id}/mot-de-passe`, { compte: c, methode, ...(motDePasse !== undefined ? { json: { motDePasse } } : {}) })
const verrou = async (c: Compte, id = 'tableau-coffre') =>
  (await (await m.appeler(`/api/tableaux/${id}/verrou`, { compte: c })).json()) as { protege: boolean; verrouille: boolean; par: string | null }
const deverrouiller = (c: Compte, motDePasse: string, id = 'tableau-coffre') =>
  m.appeler(`/api/tableaux/${id}/deverrouiller`, { compte: c, methode: 'POST', json: { motDePasse } })

describe('le mot de passe d’un tableau', () => {
  it('sans mot de passe, tout s’ouvre', async () => {
    expect(await verrou(bob)).toEqual({ protege: false, verrouille: false, par: null })
    expect((await m.appeler('/api/tableaux/tableau-coffre/export', { compte: bob })).status).toBe(200)
  })

  it('seul le propriétaire le pose, et il doit valoir quelque chose', async () => {
    expect((await mdp(bob, 'PUT', 'un bon mot de passe')).status).toBe(403)
    expect((await mdp(cleo, 'PUT', 'un bon mot de passe')).status).toBe(404)
    expect((await m.appeler('/api/tableaux/tableau-coffre/mot-de-passe', { methode: 'PUT', json: { motDePasse: 'abcdefgh' } })).status).toBe(401)
    expect((await mdp(ana, 'PUT', 'court')).status).toBe(400)
    expect((await mdp(ana, 'PUT', 'x'.repeat(201))).status).toBe(400)
    expect((await mdp(ana, 'DELETE')).status).toBe(404)
    expect(m.base.motDePasse('tableau-coffre', 'tableau')).toBeNull()
  })

  it('posé, il est haché en argon2 et jamais rendu', async () => {
    const r = await mdp(ana, 'PUT', 'sésame ouvre-toi')
    expect(r.status).toBe(204)
    const empreinte = m.base.motDePasse('tableau-coffre', 'tableau')!
    expect(empreinte.startsWith('$argon2id$')).toBe(true)
    expect(empreinte).not.toContain('sésame')
    const lu = await m.appeler('/api/tableaux/tableau-coffre/verrou', { compte: ana })
    expect(JSON.stringify(await lu.json())).not.toContain('argon2')
  })

  it('celui qui l’a posé n’a pas à le redonner ; les autres, si', async () => {
    expect(await verrou(ana)).toEqual({ protege: true, verrouille: false, par: null })
    expect(await verrou(bob)).toEqual({ protege: true, verrouille: true, par: 'tableau-coffre' })
    const ferme = await m.appeler('/api/tableaux/tableau-coffre/export', { compte: bob })
    expect(ferme.status).toBe(423)
    expect(await ferme.json()).toEqual({ erreur: 'verrouillé', code: 'verrouille', par: 'tableau-coffre' })
    expect((await m.appeler('/api/tableaux/tableau-coffre/export', { compte: ana })).status).toBe(200)
  })

  it('un compte sans droit ne sait même pas qu’il existe', async () => {
    expect((await m.appeler('/api/tableaux/tableau-coffre/verrou', { compte: cleo })).status).toBe(404)
    expect((await deverrouiller(cleo, 'sésame ouvre-toi')).status).toBe(404)
  })

  it('le bon mot de passe ouvre, le mauvais non', async () => {
    const non = await deverrouiller(bob, 'pas le bon')
    expect(non.status).toBe(401)
    expect((await verrou(bob)).verrouille).toBe(true)
    const oui = await deverrouiller(bob, 'sésame ouvre-toi')
    expect(oui.status).toBe(200)
    expect(await oui.json()).toEqual({ verrouille: false, par: null })
    expect((await m.appeler('/api/tableaux/tableau-coffre/export', { compte: bob })).status).toBe(200)
  })

  it('il vaut pour les sous-tableaux : on y est barré par le tableau du dessus', async () => {
    m.base.definirAcces({ tableau: 'tableau-fils', utilisateur: cleo.utilisateur.id, role: 'lecture' })
    expect(await verrou(cleo, 'tableau-fils')).toEqual({ protege: false, verrouille: true, par: 'tableau-coffre' })
    expect((await m.appeler('/api/tableaux/tableau-fils/export', { compte: cleo })).status).toBe(423)
    // Le mot de passe se donne pour le sous-tableau, mais c'est celui du tableau du dessus qu'il faut.
    expect((await deverrouiller(cleo, 'sésame ouvre-toi', 'tableau-fils')).status).toBe(200)
    expect((await m.appeler('/api/tableaux/tableau-fils/export', { compte: cleo })).status).toBe(200)
  })

  it('la recherche ne montre rien d’un tableau qu’on n’a pas ouvert', async () => {
    m.base.indexer('tableau-coffre', [{ element: 'e1', texte: 'secretdefamille' }])
    const trouve = async (c: Compte) => ((await (await m.appeler('/api/recherche?q=secretdefamille', { compte: c })).json()) as unknown[]).length
    expect(await trouve(ana)).toBe(1)
    expect(await trouve(bob)).toBe(1)
    m.base.definirMotDePasse('tableau-coffre', 'tableau', m.base.motDePasse('tableau-coffre', 'tableau')!)
    expect(await trouve(bob)).toBe(0)
    await deverrouiller(bob, 'sésame ouvre-toi')
    expect(await trouve(bob)).toBe(1)
  })

  it('changer le mot de passe referme le tableau pour les autres', async () => {
    expect((await mdp(ana, 'PUT', 'un tout autre mot')).status).toBe(204)
    expect((await verrou(bob)).verrouille).toBe(true)
    expect((await verrou(ana)).verrouille).toBe(false)
    expect((await deverrouiller(bob, 'sésame ouvre-toi')).status).toBe(401)
    expect((await deverrouiller(bob, 'un tout autre mot')).status).toBe(200)
  })

  it('un lecteur peut ouvrir, mais pas poser ni retirer', async () => {
    expect((await mdp(bob, 'DELETE')).status).toBe(403)
    expect((await mdp(bob, 'PUT', 'un mot de passe')).status).toBe(403)
  })

  it('la connexion de synchro est refusée tant que le tableau est fermé', async () => {
    const hp = creerHocuspocus(m.base, m.auth, m.autorisation)
    const demander = (c: Compte) =>
      hp.configuration.onAuthenticate!({ documentName: 'tableau:tableau-coffre', requestHeaders: new Headers({ cookie: c.cookie }), connectionConfig: {} } as never)
    await expect(demander(ana)).resolves.toBeTruthy()
    await mdp(ana, 'PUT', 'encore un autre')
    await expect(demander(bob)).rejects.toThrow('verrouillé')
    await deverrouiller(bob, 'encore un autre')
    await expect(demander(bob)).resolves.toBeTruthy()
  })

  it('le propriétaire le retire, et plus rien ne barre', async () => {
    expect((await mdp(ana, 'DELETE')).status).toBe(204)
    expect(m.base.motDePasse('tableau-coffre', 'tableau')).toBeNull()
    expect(await verrou(bob)).toEqual({ protege: false, verrouille: false, par: null })
    expect((await deverrouiller(bob, 'peu importe')).status).toBe(200)
  })

  it('un propriétaire dont la session n’a rien levé peut quand même retirer un mot de passe oublié', async () => {
    await mdp(ana, 'PUT', 'à oublier')
    // Une autre session de la même personne : le mot de passe a été reposé depuis, plus rien n'est levé.
    m.base.definirMotDePasse('tableau-coffre', 'tableau', m.base.motDePasse('tableau-coffre', 'tableau')!)
    expect((await verrou(ana)).verrouille).toBe(true)
    expect((await mdp(ana, 'DELETE')).status).toBe(204)
    expect((await verrou(ana)).verrouille).toBe(false)
  })

  it('verrouPar s’arrête sur une boucle de parents', () => {
    const base = {
      tableau: (id: string) => ({ id, titre: '', proprietaire: '', parent: id === 'a' ? 'b' : 'a' }),
      motDePasse: () => null,
      aOuvert: () => false,
    }
    expect(verrouPar(base, 'u', 'a')).toBeNull()
  })
})
