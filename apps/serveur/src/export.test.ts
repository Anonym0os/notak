import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Compte, type Monde, monde, poser, texte } from './essai.ts'

let m: Monde
let ana: Compte
let bob: Compte
let cleo: Compte

beforeAll(async () => {
  m = monde()
  ana = await m.compte('Ana')
  bob = await m.compte('Bob')
  cleo = await m.compte('Cléo')
  m.tableau(ana, 'tableau-voyage', 'Voyage à Lisbonne', (doc) => {
    poser(doc, { type: 'note', texte: texte('Partir tôt') }, { y: 0 })
    poser(doc, { type: 'lien', url: 'https://hotel.fr', statut: 'pret', titre: 'Hôtel' }, { y: 10 })
    poser(doc, { type: 'note', texte: texte('jetée') }, { y: 20, corbeille: 1 })
  })
  m.base.definirAcces({ tableau: 'tableau-voyage', utilisateur: bob.utilisateur.id, role: 'lecture' })
})
afterAll(() => m.fermer())

describe('GET /api/tableaux/:id/export', () => {
  it('rend le texte en Markdown par défaut, à télécharger', async () => {
    const r = await m.appeler('/api/tableaux/tableau-voyage/export', { compte: ana })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(r.headers.get('content-disposition')).toContain(`filename*=UTF-8''Voyage%20%C3%A0%20Lisbonne.md`)
    expect(r.headers.get('content-disposition')).toContain('filename="Voyage a Lisbonne.md"')
    expect(await r.text()).toBe('# Voyage à Lisbonne\n\nPartir tôt\n\n[Hôtel](https://hotel.fr)\n')
  })

  it('en texte brut', async () => {
    const r = await m.appeler('/api/tableaux/tableau-voyage/export?format=txt', { compte: ana })
    expect(r.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(await r.text()).toBe('Voyage à Lisbonne\n\nPartir tôt\n\nHôtel (https://hotel.fr)\n')
  })

  it('un lecteur exporte ; un format inconnu est refusé', async () => {
    expect((await m.appeler('/api/tableaux/tableau-voyage/export', { compte: bob })).status).toBe(200)
    expect((await m.appeler('/api/tableaux/tableau-voyage/export?format=pdf', { compte: ana })).status).toBe(400)
  })

  it('sans session 401, sans droit 404 : un tableau qu’on ne voit pas n’existe pas', async () => {
    expect((await m.appeler('/api/tableaux/tableau-voyage/export')).status).toBe(401)
    expect((await m.appeler('/api/tableaux/tableau-voyage/export', { compte: cleo })).status).toBe(404)
    expect((await m.appeler('/api/tableaux/inconnu-0001/export', { compte: ana })).status).toBe(404)
  })

  it('le titre d’un tableau imbriqué vient de la base', async () => {
    m.tableau(ana, 'tableau-budget', 'Budget')
    m.tableau(ana, 'tableau-mere-1', 'Mère', (doc) => poser(doc, { type: 'tableau', cible: 'tableau-budget' }))
    const r = await m.appeler('/api/tableaux/tableau-mere-1/export?format=txt', { compte: ana })
    expect(await r.text()).toBe('Mère\n\nTableau : Budget\n')
  })
})
