import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Compte, type Monde, monde, poser, texte } from './essai.ts'

let m: Monde
let ana: Compte
let bob: Compte
let cleo: Compte
let idImage: string
let idCache: string
const octets = new Uint8Array([137, 80, 78, 71, 5, 5])

beforeAll(async () => {
  m = monde()
  ana = await m.compte('Ana')
  bob = await m.compte('Bob')
  cleo = await m.compte('Cléo')
  const depot = async () => ((await (await m.appeler('/api/fichiers', { compte: ana, corps: octets, type: 'image/png' })).json()) as { id: string }).id
  idImage = await depot()
  idCache = await depot()
  m.tableau(ana, 'tableau-budget', 'Budget')
  m.tableau(ana, 'tableau-public', 'Carnet', (doc) => {
    poser(doc, { type: 'note', texte: texte('Visible') }, { id: 'note-1' })
    poser(doc, { type: 'note', texte: texte('Jetée') }, { id: 'note-2', corbeille: 5 })
    poser(doc, { type: 'note', texte: texte('À trier') }, { id: 'note-3', nonTrie: 5 })
    poser(doc, { type: 'commentaire', messages: [{ id: 'm', auteur: { id: 'x', nom: 'Ana' }, date: 1, texte: 'privé' }] }, { id: 'comm-1' })
    poser(doc, { type: 'image', fichier: idImage, largeurOrigine: 1, hauteurOrigine: 1 }, { id: 'img-1' })
    poser(doc, { type: 'image', fichier: idCache, largeurOrigine: 1, hauteurOrigine: 1 }, { id: 'img-2', corbeille: 5 })
    poser(doc, { type: 'tableau', cible: 'tableau-budget' }, { id: 'sous-1' })
    poser(doc, { type: 'ligne', depart: { element: 'note-1' }, arrivee: { element: 'sous-1' } }, { id: 'lien-ok' })
    poser(doc, { type: 'ligne', depart: { element: 'note-1' }, arrivee: { element: 'comm-1' } }, { id: 'lien-coupe' })
  })
  m.base.definirAcces({ tableau: 'tableau-public', utilisateur: bob.utilisateur.id, role: 'edition' })
})
afterAll(() => m.fermer())

const jeton = async (c: Compte, methode: string) => m.appeler('/api/tableaux/tableau-public/lien', { compte: c, methode })

describe('le lien public d’un tableau', () => {
  it('sans lien, rien ne se lit', async () => {
    expect(await (await jeton(ana, 'GET')).json()).toEqual({ jeton: null })
    expect((await m.appeler('/api/public/abcdefghijklmnopqrstuv')).status).toBe(404)
    expect((await jeton(ana, 'DELETE')).status).toBe(404)
  })

  it('seul le propriétaire le crée, le lit et le retire', async () => {
    for (const methode of ['GET', 'POST', 'DELETE']) {
      expect((await jeton(bob, methode)).status).toBe(403)
      expect((await jeton(cleo, methode)).status).toBe(404)
      expect((await m.appeler('/api/tableaux/tableau-public/lien', { methode })).status).toBe(401)
    }
  })

  it('créé, il sert le tableau en lecture, sans compte, sans corbeille ni commentaires', async () => {
    const cree = await jeton(ana, 'POST')
    expect(cree.status).toBe(201)
    const { jeton: j } = (await cree.json()) as { jeton: string }
    expect(j).toMatch(/^[A-Za-z0-9_-]{22}$/)
    // Le même tant qu'on ne le retire pas.
    expect(((await (await jeton(ana, 'POST')).json()) as { jeton: string }).jeton).toBe(j)
    expect(await (await jeton(ana, 'GET')).json()).toEqual({ jeton: j })

    const r = await m.appeler(`/api/public/${j}`)
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(r.headers.get('x-robots-tag')).toBe('noindex')
    const t = (await r.json()) as { titre: string; elements: { id: string }[]; titres: Record<string, string> }
    expect(t.titre).toBe('Carnet')
    expect(t.elements.map((e) => e.id)).toEqual(['note-1', 'img-1', 'sous-1', 'lien-ok'])
    expect(t.titres).toEqual({ 'tableau-budget': 'Budget' })
    expect(JSON.stringify(t)).not.toContain('plan')
  })

  it('les fichiers du tableau se lisent par le lien, pas les autres', async () => {
    const j = ((await (await jeton(ana, 'GET')).json()) as { jeton: string }).jeton
    const ok = await m.appeler(`/api/public/${j}/fichiers/${idImage}`)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(octets)
    expect((await m.appeler(`/api/public/${j}/fichiers/${idCache}`)).status).toBe(404)
    expect((await m.appeler(`/api/public/${j}/fichiers/../../etc/passwd`)).status).toBe(404)
    expect((await m.appeler(`/api/fichiers/${idImage}`)).status).toBe(401)
  })

  it('un jeton mal formé ou d’un autre tableau ne donne rien', async () => {
    expect((await m.appeler('/api/public/court')).status).toBe(404)
    expect((await m.appeler('/api/public/tableau-public')).status).toBe(404)
  })

  it('le retirer ferme le lien ; en créer un autre en change le jeton', async () => {
    const avant = ((await (await jeton(ana, 'GET')).json()) as { jeton: string }).jeton
    expect((await jeton(ana, 'DELETE')).status).toBe(204)
    expect((await m.appeler(`/api/public/${avant}`)).status).toBe(404)
    expect((await m.appeler(`/api/public/${avant}/fichiers/${idImage}`)).status).toBe(404)
    const apres = ((await (await jeton(ana, 'POST')).json()) as { jeton: string }).jeton
    expect(apres).not.toBe(avant)
    expect((await m.appeler(`/api/public/${apres}`)).status).toBe(200)
  })
})
