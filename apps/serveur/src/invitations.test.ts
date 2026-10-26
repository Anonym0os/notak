import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DUREE_INVITATION_MS } from './base.ts'
import type { Courriel } from './courriel.ts'
import { type Compte, type Monde, monde } from './essai.ts'

// Inviter quelqu'un de l'extérieur : une adresse, un rôle, une échéance s'il le faut. Un compte n'entre qu'avec une
// adresse prouvée, ou par le lien de l'invitation ; un accès temporaire tombe tout seul.

let m: Monde
let ana: Compte
let bob: Compte
const courriels: Courriel[] = []

beforeAll(async () => {
  m = monde({ courriels })
  ana = await m.compte('Ana')
  bob = await m.compte('Bob')
})
afterAll(() => m.fermer())

const partager = (tableau: string, corps: Record<string, unknown>, compte = ana) => m.appeler(`/api/tableaux/${tableau}/partage`, { compte, json: corps })
const acces = async (tableau: string, compte = ana) => (await (await m.appeler(`/api/tableaux/${tableau}/acces`, { compte })).json()) as Record<string, unknown>[]
const ouvrir = (tableau: string, compte: Compte) => m.appeler(`/api/tableaux/${tableau}/export`, { compte })
/** Le jeton d'une adresse d'invitation, tel qu'il arrive dans un courriel. */
const jetonDe = (c: Courriel) => /\/invitation#([A-Za-z0-9_-]+)/.exec(c.texte)![1]!

describe('inviter quelqu’un de l’extérieur', () => {
  it('une adresse sans compte reçoit une invitation, par courriel, et son lien', async () => {
    m.tableau(ana, 'tableau-invit-1', 'Plan de lancement')
    const r = await partager('tableau-invit-1', { email: 'Zoe@Dehors.fr', role: 'commentaire' })
    expect(r.status).toBe(200)
    const corps = (await r.json()) as { enAttente: boolean; jeton: string; envoye: boolean }
    expect(corps).toMatchObject({ email: 'zoe@dehors.fr', role: 'commentaire', enAttente: true, envoye: true })
    const c = courriels.at(-1)!
    expect(c.a).toBe('zoe@dehors.fr')
    expect(c.sujet).toContain('Plan de lancement')
    // Le jeton voyage après `#` : il ne passe ni dans les journaux du serveur, ni dans un référent.
    expect(c.texte).toContain(`http://notak.essai/invitation#${corps.jeton}`)
    expect(jetonDe(c)).toBe(corps.jeton)
    // La base n'en garde que l'empreinte.
    expect(JSON.stringify(m.base.db.prepare('SELECT * FROM invitations').all())).not.toContain(corps.jeton)

    const info = await m.appeler(`/api/invitations/${corps.jeton}`)
    expect(info.status).toBe(200)
    expect(await info.json()).toMatchObject({ titre: 'Plan de lancement', par: 'Ana', role: 'commentaire', email: 'zoe@dehors.fr', expire: null })
    expect((await m.appeler('/api/invitations/inconnu-inconnu-inconnu-inconnu-inconnu-00')).status).toBe(404)
  })

  it('l’accepter demande un compte, qui reçoit l’accès ; le lien ne sert qu’une fois', async () => {
    m.tableau(ana, 'tableau-invit-2', 'Revue')
    const { jeton } = (await (await partager('tableau-invit-2', { email: 'zoe@dehors.fr', role: 'lecture' })).json()) as { jeton: string }
    expect((await m.appeler(`/api/invitations/${jeton}/accepter`, { methode: 'POST' })).status).toBe(401)
    // Zoé crée son compte sous une autre adresse : c'est le lien reçu qui l'ouvre, pas l'adresse.
    const zoe = await m.compte('Zoé', { verifie: false })
    expect((await ouvrir('tableau-invit-2', zoe)).status).toBe(404)
    const ok = await m.appeler(`/api/invitations/${jeton}/accepter`, { methode: 'POST', compte: zoe })
    expect(await ok.json()).toEqual({ tableau: 'tableau-invit-2' })
    expect((await ouvrir('tableau-invit-2', zoe)).status).toBe(200)
    expect((await m.appeler(`/api/invitations/${jeton}/accepter`, { methode: 'POST', compte: bob })).status).toBe(404)
    expect((await ouvrir('tableau-invit-2', bob)).status).toBe(404)
  })

  it('un compte à l’adresse jamais prouvée ne prend pas ce qu’on destine à cette adresse', async () => {
    // Quelqu'un s'est inscrit sous l'adresse de Léa avant elle.
    const usurpateur = await m.compte('Léa', { verifie: false })
    m.tableau(ana, 'tableau-invit-3', 'Budget')
    const r = (await (await partager('tableau-invit-3', { email: usurpateur.utilisateur.email, role: 'edition' })).json()) as { enAttente: boolean }
    expect(r.enAttente).toBe(true)
    expect((await ouvrir('tableau-invit-3', usurpateur)).status).toBe(404)
    // Ni en se reconnectant : seule une adresse vérifiée ouvre l'invitation d'elle-même.
    expect((await m.appeler('/api/moi', { compte: usurpateur })).status).toBe(200)
    expect((await ouvrir('tableau-invit-3', usurpateur)).status).toBe(404)
    m.base.verifierEmail(usurpateur.utilisateur.id)
    await m.appeler('/api/moi', { compte: usurpateur })
    expect((await ouvrir('tableau-invit-3', usurpateur)).status).toBe(200)
  })

  it('une invitation vaut trente jours ; un nouveau lien remplace l’ancien', async () => {
    m.tableau(ana, 'tableau-invit-4', 'Archives')
    const { jeton } = (await (await partager('tableau-invit-4', { email: 'tom@dehors.fr', role: 'lecture' })).json()) as { jeton: string }
    const neuf = (await (await m.appeler('/api/tableaux/tableau-invit-4/invitations/lien', { compte: ana, json: { email: 'tom@dehors.fr' } })).json()) as { jeton: string; envoye: boolean }
    expect(neuf.envoye).toBe(true)
    expect(neuf.jeton).not.toBe(jeton)
    expect((await m.appeler(`/api/invitations/${jeton}`)).status).toBe(404)
    expect((await m.appeler(`/api/invitations/${neuf.jeton}`)).status).toBe(200)
    m.avancer(DUREE_INVITATION_MS + 1)
    const tard = await m.appeler(`/api/invitations/${neuf.jeton}`)
    expect(tard.status).toBe(410)
    expect(await tard.json()).toMatchObject({ code: 'invitation_expiree' })
    expect((await (await acces('tableau-invit-4')).find((a) => a.email === 'tom@dehors.fr'))!.invitation).toMatchObject({ valable: false })
  })

  it('le rôle et l’échéance d’une invitation changent sans la renvoyer', async () => {
    m.tableau(ana, 'tableau-invit-5', 'Notes')
    const avant = courriels.length
    const { jeton } = (await (await partager('tableau-invit-5', { email: 'ida@dehors.fr', role: 'lecture' })).json()) as { jeton: string }
    const fin = m.maintenant() + 7 * 24 * 3600_000
    expect((await m.appeler('/api/tableaux/tableau-invit-5/partage', { compte: ana, methode: 'PATCH', json: { email: 'ida@dehors.fr', role: 'commentaire', expire: fin } })).status).toBe(204)
    expect(courriels.length).toBe(avant + 1)
    expect(await (await m.appeler(`/api/invitations/${jeton}`)).json()).toMatchObject({ role: 'commentaire', expire: fin })
  })
})

describe('un accès temporaire', () => {
  it('se pose avec une échéance, se lit dans la liste, et tombe à son heure', async () => {
    m.tableau(ana, 'tableau-temp-1', 'Atelier')
    const fin = m.maintenant() + 3600_000
    const r = await partager('tableau-temp-1', { email: bob.utilisateur.email, role: 'edition', expire: fin })
    expect(await r.json()).toMatchObject({ enAttente: false, expire: fin })
    expect((await ouvrir('tableau-temp-1', bob)).status).toBe(200)
    expect((await acces('tableau-temp-1')).find((a) => a.utilisateur === bob.utilisateur.id)).toMatchObject({ role: 'edition', expire: fin })
    m.avancer(3600_001)
    expect((await ouvrir('tableau-temp-1', bob)).status).toBe(404)
    expect((await acces('tableau-temp-1')).some((a) => a.utilisateur === bob.utilisateur.id)).toBe(false)
    expect(m.base.echeance('tableau-temp-1', `user:${bob.utilisateur.id}`)).toBeNull()
  })

  it('se prolonge ou devient permanent ; repartager sans échéance l’ôte', async () => {
    m.tableau(ana, 'tableau-temp-2', 'Atelier 2')
    await partager('tableau-temp-2', { email: bob.utilisateur.email, role: 'lecture', expire: m.maintenant() + 1000 })
    expect((await m.appeler('/api/tableaux/tableau-temp-2/partage', { compte: ana, methode: 'PATCH', json: { email: bob.utilisateur.email, expire: null } })).status).toBe(204)
    m.avancer(2000)
    expect((await ouvrir('tableau-temp-2', bob)).status).toBe(200)
    await partager('tableau-temp-2', { email: bob.utilisateur.email, role: 'commentaire', expire: m.maintenant() + 1000 })
    await partager('tableau-temp-2', { email: bob.utilisateur.email, role: 'commentaire' })
    m.avancer(2000)
    expect((await ouvrir('tableau-temp-2', bob)).status).toBe(200)
  })

  it('une échéance passée, trop lointaine ou mal formée est refusée', async () => {
    m.tableau(ana, 'tableau-temp-3', 'Atelier 3')
    for (const expire of [m.maintenant() - 1, m.maintenant() + 4 * 365 * 24 * 3600_000, 'demain', 1.5]) {
      expect((await partager('tableau-temp-3', { email: bob.utilisateur.email, role: 'lecture', expire })).status).toBe(400)
    }
  })
})

describe('ce que voit un invité de la liste des accès', () => {
  it('les noms et les rôles, pas les adresses des autres ni les invitations', async () => {
    m.tableau(ana, 'tableau-liste', 'Liste')
    await partager('tableau-liste', { email: bob.utilisateur.email, role: 'lecture', expire: m.maintenant() + 3600_000 })
    await partager('tableau-liste', { email: 'secret@dehors.fr', role: 'lecture' })
    const vu = await acces('tableau-liste', bob)
    expect(vu.map((a) => a.nom).sort()).toEqual(['Ana', 'Bob'])
    expect(vu.find((a) => a.nom === 'Ana')).toMatchObject({ email: '', expire: null })
    // Le sien, il le voit en entier, échéance comprise.
    expect(vu.find((a) => a.nom === 'Bob')).toMatchObject({ email: bob.utilisateur.email, expire: expect.any(Number) })
    expect(JSON.stringify(vu)).not.toContain('secret@dehors.fr')
    expect(JSON.stringify(vu)).not.toContain(ana.utilisateur.email)
  })
})
