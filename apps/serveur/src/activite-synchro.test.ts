import { describe, expect, it } from 'vitest'
import { ouvrirBase } from './base.ts'
import { authEssai, poser, poserUtilisateur } from './essai.ts'
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
  const serveur = creerHocuspocus(base, authEssai(base), () => (instant += 1000))
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
