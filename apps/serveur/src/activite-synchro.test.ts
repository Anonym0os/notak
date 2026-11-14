import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { suivreActivite } from './activite.ts'
import { type Base, ouvrirBase } from './base.ts'
import { authEssai, autorisationEssai, poser, poserUtilisateur } from './essai.ts'
import { creerHocuspocus, nomDuDocument } from './synchro.ts'

// Deux personnes sur un tableau partagé : ce que l'une écrit par la synchro laisse son activité et prévient l'autre.

function monde() {
  const base = ouvrirBase(':memory:')
  let instant = 1_000_000
  for (const [id, nom] of [['ana', 'Ana Martin'], ['bob', 'Bob Éclair']] as const) {
    poserUtilisateur(base, { id, email: `${id}@exemple.fr`, nom, couleur: '#336699', racine: `racine-${id}` })
  }
  base.creerTableau({ id: 'tableau-act-1', titre: 'Voyage', proprietaire: 'ana', parent: null })
  base.definirAcces({ tableau: 'tableau-act-1', utilisateur: 'ana', role: 'proprietaire' })
  base.definirAcces({ tableau: 'tableau-act-1', utilisateur: 'bob', role: 'edition' })
  const serveur = creerHocuspocus(base, authEssai(base), autorisationEssai(base), () => (instant += 1000))
  const ouvrir = (id: string) =>
    serveur.openDirectConnection(nomDuDocument('tableau-act-1'), { utilisateur: { id, nom: id, couleur: '#336699' } })
  return { base, serveur, ouvrir }
}

describe('l’activité déduite de la synchro', () => {
  it('chaque geste est noté au nom de celui qui l’a envoyé', async () => {
    const { base, ouvrir } = monde()
    const ana = await ouvrir('ana')
    await ana.transact((doc) => void poser(doc, { type: 'colonne', titre: 'Jour 1' }, { id: 'col' }))
    const bob = await ouvrir('bob')
    await bob.transact((doc) => {
      const e = doc.getMap<Record<string, unknown>>('elements')
      e.set('col', { ...e.get('col')!, corbeille: 5 })
    })
    const gestes = base.activite('tableau-act-1', 10)
    expect(gestes.map((g) => [g.auteur.id, g.genre, g.element, g.libelle])).toEqual([
      ['bob', 'supprime', 'col', 'Jour 1'],
      ['ana', 'cree', 'col', 'Jour 1'],
    ])
    await ana.disconnect()
    await bob.disconnect()
    base.fermer()
  })

  it('une rafale du même auteur sur le même élément ne laisse qu’une ligne', async () => {
    const { base, ouvrir } = monde()
    const ana = await ouvrir('ana')
    await ana.transact((doc) => void poser(doc, { type: 'colonne', titre: 'A' }, { id: 'col' }))
    for (const titre of ['B', 'Bi', 'Bim']) {
      await ana.transact((doc) => {
        const e = doc.getMap<Record<string, unknown>>('elements')
        e.set('col', { ...e.get('col')!, contenu: { type: 'colonne', titre } })
      })
    }
    expect(base.activite('tableau-act-1', 10).map((g) => [g.genre, g.libelle])).toEqual([['modifie', 'Bim'], ['cree', 'A']])
    await ana.disconnect()
    base.fermer()
  })

  it('un changement du serveur seul, sans personne derrière, ne laisse rien', async () => {
    const { base, serveur } = monde()
    const direct = await serveur.openDirectConnection(nomDuDocument('tableau-act-1'))
    await direct.transact((doc) => void poser(doc, { type: 'colonne', titre: 'Muet' }, { id: 'col' }))
    expect(base.activite('tableau-act-1', 10)).toEqual([])
    await direct.disconnect()
    base.fermer()
  })

  it('un commentaire prévient le propriétaire, une mention prévient le cité, un tiers qui écrit ne prévient pas l’auteur', async () => {
    const { base, ouvrir } = monde()
    const bob = await ouvrir('bob')
    await bob.transact((doc) => {
      poser(doc, { type: 'commentaire', messages: [{ id: 'm1', auteur: { id: 'bob', nom: 'Bob' }, date: 1, texte: 'Une question' }] }, { id: 'fil' })
    })
    expect(base.notifications('ana', 10).map((n) => [n.genre, n.auteur.id, n.extrait])).toEqual([['commentaire', 'bob', 'Une question']])
    expect(base.notifications('bob', 10)).toEqual([])

    const ana = await ouvrir('ana')
    await ana.transact((doc) => {
      const e = doc.getMap<Record<string, unknown>>('elements')
      const fil = e.get('fil') as { contenu: { messages: unknown[] } }
      e.set('fil', { ...fil, contenu: { type: 'commentaire', messages: [...fil.contenu.messages, { id: 'm2', auteur: { id: 'ana', nom: 'Ana' }, date: 2, texte: 'Réponse à @Bob' }] } })
    })
    expect(base.notifications('bob', 10).map((n) => [n.genre, n.extrait])).toEqual([['mention', 'Réponse à @Bob']])
    expect(base.notifications('ana', 10)).toHaveLength(1)
    await ana.disconnect()
    await bob.disconnect()
    base.fermer()
  })

  it('les modifications d’un même auteur se fondent en une notification non lue, puis une nouvelle après lecture', async () => {
    const { base, ouvrir } = monde()
    const ana = await ouvrir('ana')
    for (const id of ['a', 'b', 'c']) await ana.transact((doc) => void poser(doc, { type: 'colonne', titre: `Col ${id}` }, { id }))
    let liste = base.notifications('bob', 10)
    expect(liste.map((n) => [n.genre, n.extrait])).toEqual([['modification', 'Col c']])
    base.marquerLues('bob', null)
    await ana.transact((doc) => void poser(doc, { type: 'colonne', titre: 'Col d' }, { id: 'd' }))
    liste = base.notifications('bob', 10)
    expect(liste.map((n) => [n.lu, n.extrait])).toEqual([[false, 'Col d'], [true, 'Col c']])
    await ana.disconnect()
    base.fermer()
  })

  it('un tableau seul ne prévient personne', async () => {
    const { base, ouvrir } = monde()
    base.retirerAcces('tableau-act-1', 'bob')
    const ana = await ouvrir('ana')
    await ana.transact((doc) => void poser(doc, { type: 'colonne', titre: 'Seule' }, { id: 'col' }))
    expect(base.notifications('ana', 10)).toEqual([])
    expect(base.activite('tableau-act-1', 10)).toHaveLength(1)
    await ana.disconnect()
    base.fermer()
  })
})

describe('un message supprimé ou récrit ne se lit plus ailleurs dans ce qu’il disait', () => {
  /** Le tableau d'Ana, où Bob écrit et que Cléo commente. */
  function avecCleo() {
    const m = monde()
    poserUtilisateur(m.base, { id: 'cleo', email: 'cleo@exemple.fr', nom: 'Cléo Durand', couleur: '#336699', racine: 'racine-cleo' })
    m.base.definirAcces({ tableau: 'tableau-act-1', utilisateur: 'cleo', role: 'commentaire' })
    return m
  }
  const message = (id: string, auteur: string, texte: string) => ({ id, auteur: { id: auteur, nom: auteur }, date: 1, texte })
  type Fil = Record<string, unknown> & { contenu: { messages: unknown[] } }
  /** Le fil `fil` changé d'un seul geste, comme le fait la toile ; `null` le retire. */
  const changerFil = (doc: Y.Doc, f: (fil: Fil) => Fil | null) => {
    const elements = doc.getMap<Record<string, unknown>>('elements')
    const apres = f(elements.get('fil') as Fil)
    if (apres) elements.set('fil', apres)
    else elements.delete('fil')
  }
  const messages = (doc: Y.Doc, f: (avant: unknown[]) => unknown[]) => changerFil(doc, (fil) => ({ ...fil, contenu: { ...fil.contenu, messages: f(fil.contenu.messages) } }))
  /** Ce que citent les notifications des messages, et l'activité de leurs commentaires. */
  const notes = (base: Base, qui: string) => base.notifications(qui, 50).filter((n) => n.genre !== 'modification').map((n) => [n.genre, n.extrait, n.lu])
  const commentes = (base: Base) => base.activite('tableau-act-1', 50).filter((a) => a.genre === 'commente').map((a) => [a.auteur.id, a.libelle])
  const seLit = (base: Base, texte: string) =>
    JSON.stringify([base.activite('tableau-act-1', 50), ...['ana', 'bob', 'cleo'].map((id) => base.notifications(id, 50))]).includes(texte)

  it('supprimé, ses notifications partent, lues ou non, et l’activité garde le geste sans le texte ; son fil jeté emporte les autres', async () => {
    const { base, ouvrir } = avecCleo()
    const bob = await ouvrir('bob')
    await bob.transact((doc) => void poser(doc, { type: 'commentaire', messages: [message('m1', 'bob', 'Première remarque')] }, { id: 'fil' }))
    await bob.transact((doc) => messages(doc, (avant) => [...avant, message('m2', 'bob', 'Je regrette, @Cléo')]))
    expect(notes(base, 'cleo')).toEqual([['mention', 'Je regrette, @Cléo', false]])
    base.marquerLues('ana', null)
    expect(notes(base, 'ana')).toEqual([['commentaire', 'Je regrette, @Cléo', true], ['commentaire', 'Première remarque', true]])

    await bob.transact((doc) => messages(doc, (avant) => avant.slice(0, 1)))
    expect(seLit(base, 'regrette')).toBe(false)
    expect(notes(base, 'cleo')).toEqual([])
    // La première remarque est toujours là, et dite ; Bob a bien commenté, même si ce qu'il a dit n'y est plus.
    expect(notes(base, 'ana')).toEqual([['commentaire', 'Première remarque', true]])
    expect(commentes(base)).toEqual([['bob', '']])

    // Supprimer le dernier message jette le fil (`effacerFil`), qui le garde pour qu'Annuler le rende entier.
    await bob.transact((doc) => changerFil(doc, (fil) => ({ ...fil, corbeille: 5 })))
    expect(seLit(base, 'Première remarque')).toBe(false)
    await bob.disconnect()
    base.fermer()
  })

  it('un commentateur qui retire son fil n’y laisse rien de cité', async () => {
    const { base, ouvrir } = avecCleo()
    const cleo = await ouvrir('cleo')
    await cleo.transact((doc) => void poser(doc, { type: 'commentaire', messages: [message('m1', 'cleo', 'Une idée à moi')] }, { id: 'fil' }))
    expect(notes(base, 'ana')).toEqual([['commentaire', 'Une idée à moi', false]])
    await cleo.transact((doc) => changerFil(doc, () => null))
    expect(seLit(base, 'Une idée')).toBe(false)
    await cleo.disconnect()
    base.fermer()
  })

  it('récrit, il est cité dans sa nouvelle version', async () => {
    const { base, ouvrir } = avecCleo()
    const bob = await ouvrir('bob')
    await bob.transact((doc) => void poser(doc, { type: 'commentaire', messages: [message('m1', 'bob', 'Rendez-vous lundi, @Cléo')] }, { id: 'fil' }))
    await bob.transact((doc) => messages(doc, ([m1]) => [{ ...(m1 as object), texte: 'Rendez-vous mardi, @Cléo' }]))
    expect(seLit(base, 'lundi')).toBe(false)
    expect(notes(base, 'cleo')).toEqual([['mention', 'Rendez-vous mardi, @Cléo', false]])
    expect(notes(base, 'ana')).toEqual([['commentaire', 'Rendez-vous mardi, @Cléo', false]])
    expect(commentes(base)).toEqual([['bob', 'Rendez-vous mardi, @Cléo']])
    await bob.disconnect()
    base.fermer()
  })

  it('un texte que son auteur dit encore dans le fil reste cité, jusqu’à ce qu’il ne le dise plus', async () => {
    const { base, ouvrir } = avecCleo()
    const bob = await ouvrir('bob')
    await bob.transact((doc) => void poser(doc, { type: 'commentaire', messages: [message('m1', 'bob', 'Merci !')] }, { id: 'fil' }))
    await bob.transact((doc) => messages(doc, (avant) => [...avant, message('m2', 'bob', 'Merci !')]))
    await bob.transact((doc) => messages(doc, (avant) => avant.slice(0, 1)))
    expect(notes(base, 'ana')).toHaveLength(2)
    await bob.transact((doc) => messages(doc, () => []))
    expect(notes(base, 'ana')).toEqual([])
    await bob.disconnect()
    base.fermer()
  })

  it('un geste refusé puis défait ne retire rien ; celui d’un visiteur ou du serveur retire ce qu’il efface', () => {
    const { base } = monde()
    let instant = 1_000_000
    const suivi = suivreActivite(base, () => (instant += 1000))
    const doc = new Y.Doc()
    suivi.suivre(doc)
    const bob = { id: 'bob', nom: 'Bob', couleur: '#336699' }
    poser(doc, { type: 'commentaire', messages: [message('m1', 'bob', 'Une question')] }, { id: 'fil' })
    suivi.noter('tableau-act-1', doc, bob)
    expect(notes(base, 'ana')).toHaveLength(1)

    // Ce que fait la synchro d'un geste interdit : appliqué, défait, oublié.
    messages(doc, () => [])
    messages(doc, () => [message('m1', 'bob', 'Une question')])
    suivi.oublier(doc)
    suivi.noter('tableau-act-1', doc, bob)
    expect(notes(base, 'ana')).toHaveLength(1)

    messages(doc, () => [])
    suivi.noter('tableau-act-1', doc, undefined)
    expect(notes(base, 'ana')).toEqual([])
    base.fermer()
  })
})
