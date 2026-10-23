import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Compte, type Monde, monde, poser, texte } from './essai.ts'
import { NOM_COOKIE_PUBLIC } from './app.ts'

let m: Monde
let ana: Compte
let bob: Compte
let idImage: string
let lien: string
const octets = new Uint8Array([137, 80, 78, 71, 5, 5])

beforeAll(async () => {
  m = monde()
  ana = await m.compte('Ana')
  bob = await m.compte('Bob')
  idImage = ((await (await m.appeler('/api/fichiers', { compte: ana, corps: octets, type: 'image/png' })).json()) as { id: string }).id
  m.tableau(ana, 'tableau-carnet', 'Carnet', (doc) => {
    poser(doc, { type: 'note', texte: texte('Visible') }, { id: 'note-1' })
    poser(doc, { type: 'image', fichier: idImage, largeurOrigine: 1, hauteurOrigine: 1 }, { id: 'img-1' })
  })
  m.base.definirAcces({ tableau: 'tableau-carnet', utilisateur: bob.utilisateur.id, role: 'edition' })
  lien = ((await (await m.appeler('/api/tableaux/tableau-carnet/lien', { compte: ana, methode: 'POST' })).json()) as { jeton: string }).jeton
})
afterAll(() => m.fermer())

const mdp = (c: Compte | undefined, methode: string, motDePasse?: string) =>
  m.appeler('/api/tableaux/tableau-carnet/lien/mot-de-passe', {
    methode,
    ...(c ? { compte: c } : {}),
    ...(motDePasse !== undefined && methode === 'PUT' ? { json: { motDePasse } } : {}),
  })
const ouvrir = (motDePasse: string, jeton = lien) => m.appeler(`/api/public/${jeton}/deverrouiller`, { methode: 'POST', json: { motDePasse } })
/** Le cookie d'accès que la réponse remet, tel que le navigateur le renverrait. */
const acces = (r: Response) => r.headers.get('set-cookie')!.split(';')[0]!
const lire = (chemin: string, cookie?: string) => m.appeler(chemin, cookie ? { cookie } : {})

describe('le mot de passe du lien public', () => {
  it('sans mot de passe, le lien se lit comme avant', async () => {
    expect(await (await mdp(ana, 'GET')).json()).toEqual({ protege: false })
    expect((await m.appeler(`/api/public/${lien}`)).status).toBe(200)
    expect((await ouvrir('peu importe')).status).toBe(204)
  })

  it('seul le propriétaire le pose, le lit et le retire', async () => {
    for (const methode of ['GET', 'PUT', 'DELETE']) {
      expect((await mdp(bob, methode, 'motdepasse')).status).toBe(403)
      expect((await mdp(undefined, methode, 'motdepasse')).status).toBe(401)
    }
    expect((await mdp(ana, 'PUT', 'court')).status).toBe(400)
    expect((await mdp(ana, 'DELETE')).status).toBe(404)
  })

  it('posé, il est haché en argon2 et ferme le lien', async () => {
    expect((await mdp(ana, 'PUT', 'lecture seule')).status).toBe(204)
    expect(m.base.motDePasse('tableau-carnet', 'public')!.startsWith('$argon2id$')).toBe(true)
    // Il n'est pas celui qui ferme le tableau aux comptes.
    expect(m.base.motDePasse('tableau-carnet', 'tableau')).toBeNull()
    expect(await (await mdp(ana, 'GET')).json()).toEqual({ protege: true })
    const ferme = await m.appeler(`/api/public/${lien}`)
    expect(ferme.status).toBe(401)
    expect(await ferme.json()).toEqual({ erreur: 'mot de passe requis', protege: true })
    expect(ferme.headers.get('cache-control')).toBe('no-store')
    expect((await m.appeler(`/api/public/${lien}/fichiers/${idImage}`)).status).toBe(401)
    // Les comptes du tableau, eux, y accèdent toujours.
    expect((await m.appeler('/api/tableaux/tableau-carnet/export', { compte: bob })).status).toBe(200)
  })

  it('le bon mot de passe remet un cookie limité au lien, qui ouvre le tableau et ses fichiers', async () => {
    expect((await ouvrir('mauvais mot de passe')).status).toBe(401)
    const bon = await ouvrir('lecture seule')
    expect(bon.status).toBe(204)
    const cookie = bon.headers.get('set-cookie')!
    expect(cookie).toContain(`${NOM_COOKIE_PUBLIC}=`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain(`Path=/api/public/${lien}`)
    const lu = await lire(`/api/public/${lien}`, acces(bon))
    expect(lu.status).toBe(200)
    expect(((await lu.json()) as { titre: string }).titre).toBe('Carnet')
    expect((await lire(`/api/public/${lien}/fichiers/${idImage}`, acces(bon))).status).toBe(200)
  })

  it('un accès inventé ne vaut rien', async () => {
    expect((await lire(`/api/public/${lien}`, `${NOM_COOKIE_PUBLIC}=n-importe-quoi`)).status).toBe(401)
  })

  it('changer le mot de passe révoque les accès donnés', async () => {
    const ancien = acces(await ouvrir('lecture seule'))
    expect((await lire(`/api/public/${lien}`, ancien)).status).toBe(200)
    await mdp(ana, 'PUT', 'un autre mot de passe')
    expect((await lire(`/api/public/${lien}`, ancien)).status).toBe(401)
    expect((await ouvrir('lecture seule')).status).toBe(401)
    expect((await ouvrir('un autre mot de passe')).status).toBe(204)
  })

  it('un lien inconnu reste introuvable', async () => {
    expect((await ouvrir('x', 'abcdefghijklmnopqrstuv')).status).toBe(404)
  })

  it('le retirer rouvre le lien', async () => {
    const cookie = acces(await ouvrir('un autre mot de passe'))
    expect((await mdp(ana, 'DELETE')).status).toBe(204)
    expect((await m.appeler(`/api/public/${lien}`)).status).toBe(200)
    // Un ancien accès ne ressuscite pas si un mot de passe revient.
    await mdp(ana, 'PUT', 'et de nouveau un')
    expect((await lire(`/api/public/${lien}`, cookie)).status).toBe(401)
  })

  it('retirer le lien emporte son mot de passe', async () => {
    expect((await m.appeler('/api/tableaux/tableau-carnet/lien', { compte: ana, methode: 'DELETE' })).status).toBe(204)
    expect(m.base.motDePasse('tableau-carnet', 'public')).toBeNull()
    const neuf = ((await (await m.appeler('/api/tableaux/tableau-carnet/lien', { compte: ana, methode: 'POST' })).json()) as { jeton: string }).jeton
    expect((await m.appeler(`/api/public/${neuf}`)).status).toBe(200)
  })
})
