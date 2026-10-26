import * as Y from 'yjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Compte, type Monde, monde, poser, texte } from './essai.ts'
import { nomDuDocument } from './synchro.ts'

// Un visiteur sans compte commente par un lien qui le permet. Ce qu'il envoie est relu et jugé par la règle du
// commentateur : il ajoute ses messages, modifie et retire les siens, réagit pour lui. Rien d'autre ne passe.

let m: Monde
let ana: Compte
let lien: { id: string; jeton: string }
let lecture: { id: string; jeton: string }
const CLE = 'cle-du-navigateur-de-marie-0123456789abcdef'
const AUTRE = 'cle-du-navigateur-de-paul-0123456789abcdefgh'
const fil = (messages: unknown[]) => ({ type: 'commentaire', messages })
const msg = (id: string, auteur: { id: string; nom: string; couleur?: string }, t: string, extra: Record<string, unknown> = {}) => ({ id, auteur, date: 1, texte: t, ...extra })
const ANA = { id: 'ana-id', nom: 'Ana' }

beforeAll(async () => {
  m = monde()
  ana = await m.compte('Ana')
  m.tableau(ana, 'tableau-revue', 'Revue', (doc) => {
    poser(doc, { type: 'note', texte: texte('La maquette') }, { id: 'note-1', assigne: { id: 'x', nom: 'Ana' } })
    poser(doc, fil([msg('m1', ANA, 'Qu’en pensez-vous ?')]), { id: 'pin-ana' })
    poser(doc, { type: 'note', texte: texte('Jetée') }, { id: 'note-jetee', corbeille: 5 })
    poser(doc, { type: 'note', texte: texte('À trier') }, { id: 'note-a-trier', nonTrie: 5 })
    poser(doc, { type: 'note', texte: texte('Figée') }, { id: 'note-figee' })
  })
  lien = (await (await m.appeler('/api/tableaux/tableau-revue/liens', { compte: ana, json: { niveau: 'commentaire', nom: 'Client' } })).json()) as typeof lien
  lecture = (await (await m.appeler('/api/tableaux/tableau-revue/liens', { compte: ana, json: { niveau: 'lecture' } })).json()) as typeof lecture
  // Un élément dont le propriétaire a réglé les droits à part : un visiteur ne le commente pas.
  await m.appeler('/api/tableaux/tableau-revue/elements/note-figee/droits', { compte: ana, json: { tous: true, droit: 'bloque' } })
})
afterAll(() => m.fermer())

const envoyer = (corps: unknown, o: { cle?: string; jeton?: string } = {}) =>
  m.appeler(`/api/public/${o.jeton ?? lien.jeton}/commentaires`, { json: corps, entetes: o.cle === '' ? {} : { 'x-notak-visiteur': o.cle ?? CLE } })
const elements = () => {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, m.base.document(nomDuDocument('tableau-revue'))!)
  const tout = doc.getMap<Record<string, unknown>>('elements').toJSON() as Record<string, Record<string, unknown>>
  doc.destroy()
  return tout
}
const moi = async (cle = CLE) =>
  ((await (await m.appeler(`/api/public/${lien.jeton}`, { entetes: { 'x-notak-visiteur': cle } })).json()) as { moi: { id: string } }).moi.id

describe('les commentaires d’un visiteur', () => {
  it('un lien qui ne fait que montrer n’écrit rien ; il faut une clé et un nom', async () => {
    const corps = { nom: 'Marie', changements: [{ id: 'pin-neuf', apres: { x: 0, y: 0, largeur: 34, contenu: fil([msg('v1', { id: 'x', nom: 'x' }, 'Bonjour')]) } }] }
    expect((await envoyer(corps, { jeton: lecture.jeton })).status).toBe(403)
    expect((await envoyer(corps, { cle: '' })).status).toBe(400)
    expect((await envoyer(corps, { cle: 'courte' })).status).toBe(400)
    expect((await envoyer({ ...corps, nom: '   ' })).status).toBe(400)
    expect((await envoyer('pas un objet')).status).toBe(400)
    expect(elements()['pin-neuf']).toBeUndefined()
  })

  it('une épingle neuve s’écrit à son nom, marqué visiteur, à l’heure du serveur, sans mise en forme', async () => {
    const id = await moi()
    expect(id).toMatch(/^visiteur:/)
    const r = await envoyer({
      nom: '  Marie\u0000 Durand ',
      changements: [
        {
          id: 'pin-marie',
          apres: {
            x: 12,
            y: 8,
            largeur: 34,
            corbeille: 1,
            etiquettes: ['espion'],
            contenu: fil([msg('v1', { id, nom: 'Samy Agher', couleur: '#000000' }, '  Le logo est trop petit  ', { date: 5, riche: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] } })]),
          },
        },
      ],
    })
    expect(r.status).toBe(200)
    const pin = elements()['pin-marie']!
    expect(pin).toMatchObject({ x: 12, y: 8, largeur: 34 })
    // Rien de ce qu'il ajoute à côté du fil ne passe : ni corbeille, ni étiquettes.
    expect(pin).not.toHaveProperty('corbeille')
    expect(pin).not.toHaveProperty('etiquettes')
    expect(typeof pin.plan).toBe('string')
    const m1 = (pin.contenu as { messages: Record<string, unknown>[] }).messages[0]!
    // Le nom qu'il a donné, propre ; jamais celui qu'il glisse dans le message.
    expect(m1.auteur).toEqual({ id, nom: 'Marie Durand', couleur: expect.stringMatching(/^#[0-9a-f]{6}$/) })
    expect(m1.texte).toBe('Le logo est trop petit')
    expect(m1.date).toBeGreaterThan(5)
    expect(m1).not.toHaveProperty('riche')
    // La réponse est sa vue à jour, qui montre son fil.
    const vue = (await r.json()) as { elements: { id: string }[] }
    expect(vue.elements.map((e) => e.id)).toContain('pin-marie')
  })

  it('il répond dans le fil d’un membre, sans toucher à ses messages ni les déplacer', async () => {
    const id = await moi()
    const ok = await envoyer({ nom: 'Marie', changements: [{ id: 'pin-ana', apres: { x: 0, y: 0, largeur: 34, contenu: fil([msg('m1', ANA, 'Qu’en pensez-vous ?'), msg('v2', { id, nom: 'Marie' }, 'Plutôt bien')]) } }] })
    expect(ok.status).toBe(200)
    const messages = (elements()['pin-ana']!.contenu as { messages: { id: string; texte: string }[] }).messages
    expect(messages.map((x) => [x.id, x.texte])).toEqual([
      ['m1', 'Qu’en pensez-vous ?'],
      ['v2', 'Plutôt bien'],
    ])
    // Le message d'Ana reste celui que garde le serveur, quoi qu'il en envoie.
    await envoyer({ nom: 'Marie', changements: [{ id: 'pin-ana', apres: { x: 0, y: 0, largeur: 34, contenu: fil([msg('m1', ANA, 'Réécrit'), msg('v2', { id, nom: 'Marie' }, 'Plutôt bien')]) } }] })
    expect((elements()['pin-ana']!.contenu as { messages: { texte: string }[] }).messages[0]!.texte).toBe('Qu’en pensez-vous ?')
    // Le retirer, ou en écrire un à son nom : refusé, et rien ne s'écrit.
    for (const contenu of [
      fil([msg('v2', { id, nom: 'Marie' }, 'Plutôt bien')]),
      fil([msg('m1', ANA, 'Qu’en pensez-vous ?'), msg('v2', { id, nom: 'Marie' }, 'Plutôt bien'), msg('faux', ANA, 'Je valide')]),
    ]) {
      expect([400, 403]).toContain((await envoyer({ nom: 'Marie', changements: [{ id: 'pin-ana', apres: { x: 0, y: 0, largeur: 34, contenu } }] })).status)
    }
    expect((elements()['pin-ana']!.contenu as { messages: unknown[] }).messages).toHaveLength(2)
    // Supprimer l'épingle d'un autre : refusé.
    expect((await envoyer({ nom: 'Marie', changements: [{ id: 'pin-ana', apres: null }] })).status).toBe(403)
  })

  it('il modifie et retire ses propres messages, ceux de sa clé seulement', async () => {
    const id = await moi()
    const fils = (texteV2: string | null) =>
      fil([msg('m1', ANA, 'Qu’en pensez-vous ?'), ...(texteV2 === null ? [] : [msg('v2', { id, nom: 'Marie' }, texteV2)])])
    expect((await envoyer({ nom: 'Marie', changements: [{ id: 'pin-ana', apres: { x: 0, y: 0, largeur: 34, contenu: fils('Très bien, en fait') } }] })).status).toBe(200)
    expect((elements()['pin-ana']!.contenu as { messages: { texte: string }[] }).messages[1]!.texte).toBe('Très bien, en fait')
    // Un autre navigateur, autre clé : ce n'est plus lui, son message reste tel quel.
    await envoyer({ nom: 'Paul', changements: [{ id: 'pin-ana', apres: { x: 0, y: 0, largeur: 34, contenu: fils('Volé') } }] }, { cle: AUTRE })
    expect((elements()['pin-ana']!.contenu as { messages: { texte: string }[] }).messages[1]!.texte).toBe('Très bien, en fait')
    expect((await envoyer({ nom: 'Paul', changements: [{ id: 'pin-ana', apres: { x: 0, y: 0, largeur: 34, contenu: fils(null) } }] }, { cle: AUTRE })).status).toBe(400)
    expect((await envoyer({ nom: 'Marie', changements: [{ id: 'pin-ana', apres: { x: 0, y: 0, largeur: 34, contenu: fils(null) } }] })).status).toBe(200)
    expect((elements()['pin-ana']!.contenu as { messages: unknown[] }).messages).toHaveLength(1)
    // Son épingle à lui, qui n'a que ses messages, il peut la retirer.
    expect((await envoyer({ nom: 'Marie', changements: [{ id: 'pin-marie', apres: null }] }, { cle: AUTRE })).status).toBe(403)
    expect((await envoyer({ nom: 'Marie', changements: [{ id: 'pin-marie', apres: null }] })).status).toBe(200)
    expect(elements()['pin-marie']).toBeUndefined()
  })

  it('il commente un élément, sans rien changer d’autre de lui', async () => {
    const id = await moi()
    const r = await envoyer({
      nom: 'Marie',
      changements: [{ id: 'note-1', apres: { x: 999, contenu: { type: 'note', texte: texte('Piraté') }, assigne: { id: 'y', nom: 'Eve' }, commentaire: fil([msg('v3', { id, nom: 'Marie' }, 'À revoir')]), reactions: { '👍': [id] } } }],
    })
    expect(r.status).toBe(200)
    const note = elements()['note-1']!
    expect(JSON.stringify(note.contenu)).toContain('La maquette')
    expect(note.x).toBe(0)
    expect(note.assigne).toEqual({ id: 'x', nom: 'Ana' })
    expect((note.commentaire as { messages: { texte: string }[] }).messages[0]!.texte).toBe('À revoir')
    expect(note.reactions).toEqual({ '👍': [id] })
    // Réagir à la place d'un autre : refusé.
    expect((await envoyer({ nom: 'Marie', changements: [{ id: 'note-1', apres: { commentaire: note.commentaire, reactions: { '👍': [id, 'ana-id'] } } }] })).status).toBe(403)
  })

  it('ce qu’il ne voit pas, ou qui a ses propres droits, il ne le commente pas', async () => {
    const id = await moi()
    for (const cible of ['note-jetee', 'note-a-trier', 'note-figee']) {
      const r = await envoyer({ nom: 'Marie', changements: [{ id: cible, apres: { commentaire: fil([msg('v9', { id, nom: 'Marie' }, 'coucou')]) } }] })
      expect([cible, r.status]).toEqual([cible, 403])
      expect(elements()[cible]).not.toHaveProperty('commentaire')
    }
    // Un élément qui n'existe pas n'est pas une note qu'on crée : seule une épingle naît d'un visiteur.
    expect((await envoyer({ nom: 'Marie', changements: [{ id: 'note-neuve', apres: { x: 0, y: 0, largeur: 34, contenu: { type: 'note', texte: texte('x') } } }] })).status).toBe(403)
    expect(elements()['note-neuve']).toBeUndefined()
  })

  it('un envoi trop grand, trop nombreux ou mal formé est refusé en entier', async () => {
    const id = await moi()
    const epingle = (n: number, t = 'ok') => ({ id: `pin-${n}`, apres: { x: 0, y: 0, largeur: 34, contenu: fil([msg(`v-${n}`, { id, nom: 'Marie' }, t)]) } })
    expect((await envoyer({ nom: 'Marie', changements: [1, 2, 3, 4, 5, 6].map((n) => epingle(n)) })).status).toBe(400)
    expect((await envoyer({ nom: 'Marie', changements: [epingle(7, 'x'.repeat(5001))] })).status).toBe(400)
    expect((await envoyer({ nom: 'Marie', changements: [epingle(8, '   ')] })).status).toBe(400)
    expect((await envoyer({ nom: 'Marie', changements: [{ id: 'pin-9', apres: { x: 0, y: 0, largeur: 34, contenu: fil([]) } }] })).status).toBe(400)
    expect((await envoyer({ nom: 'Marie', changements: [epingle(10), { id: '../x', apres: null }] })).status).toBe(400)
    const grand = await m.appeler(`/api/public/${lien.jeton}/commentaires`, { corps: new Uint8Array(200 * 1024).fill(32), type: 'application/json', entetes: { 'x-notak-visiteur': CLE } })
    expect(grand.status).toBe(413)
    for (const n of [1, 7, 8, 9, 10]) expect(elements()[`pin-${n}`]).toBeUndefined()
  })

  it('un lien échu, fermé ou bloqué n’écrit plus', async () => {
    const id = await moi()
    const corps = { nom: 'Marie', changements: [{ id: 'pin-tard', apres: { x: 0, y: 0, largeur: 34, contenu: fil([msg('vt', { id, nom: 'Marie' }, 'trop tard')]) } }] }
    await m.appeler(`/api/tableaux/tableau-revue/liens/${lien.id}`, { compte: ana, methode: 'PATCH', json: { expire: m.maintenant() + 1000 } })
    m.avancer(1001)
    expect((await envoyer(corps)).status).toBe(410)
    await m.appeler(`/api/tableaux/tableau-revue/liens/${lien.id}`, { compte: ana, methode: 'PATCH', json: { niveau: 'lecture', expire: null } })
    expect((await envoyer(corps)).status).toBe(403)
    expect(elements()['pin-tard']).toBeUndefined()
  })
})
