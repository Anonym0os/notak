import 'fake-indexeddb/auto'
import { decoderNotak, nouvelleNote } from '@notak/tableau'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { fabriquerCopie, rouvrirCopie } from './copie'
import { espaceLocal } from './espace'

const attendre = (ms = 30) => new Promise((r) => setTimeout(r, ms))

describe('copies .notak', () => {
  it('une copie contient tout l’espace, et la rouvrir dans le même espace ne duplique rien', async () => {
    const el = await espaceLocal()
    const { espace, index } = el
    const racine = index.racine()
    const voyage = espace.creerTableau('Voyage', racine)
    espace.magasin(racine).faire([{ type: 'creer', element: nouvelleNote(1, 1) }])
    espace.magasin(voyage).faire([{ type: 'creer', element: nouvelleNote(2, 2) }])
    await attendre()

    const octets = await fabriquerCopie(el)
    const c = decoderNotak(octets)
    expect(c.racine).toBe(racine)
    expect(c.tableaux.map((t) => t.titre)).toContain('Voyage')

    const avant = index.lister().length
    const r = await rouvrirCopie(el, octets, racine)
    expect(r).toMatchObject({ fusion: true, accueil: false })
    await attendre()
    expect(index.lister().length).toBe(avant)
    const notes = await el.reseau.avec(racine, (d) => d.getMap('elements').size)
    expect(notes).toBe(1)
  })

  it('la copie de quelqu’un d’autre s’ajoute, rangée dans le tableau ouvert, une seule fois', async () => {
    const el = await espaceLocal()
    const { index, reseau } = el
    const racine = index.racine()
    // Une copie fabriquée ailleurs : un autre accueil, une note.
    const doc = new Y.Doc()
    doc.getMap('meta').set('titre', 'Chez Léa')
    doc.getMap('elements').set('n1', { ...nouvelleNote(0, 0), id: 'n1', plan: 'a0' })
    const { encoderNotak } = await import('@notak/tableau')
    const octets = encoderNotak({ racine: 'accueilDeLea', tableaux: [{ id: 'accueilDeLea', titre: 'Chez Léa', etat: Y.encodeStateAsUpdate(doc) }], fichiers: [] })

    const r = await rouvrirCopie(el, octets, racine)
    expect(r.fusion).toBe(false)
    expect(index.entree('accueilDeLea')).toMatchObject({ titre: 'Chez Léa', parent: racine })
    await attendre()
    const renvois = () => reseau.avec(racine, (d) => [...d.getMap<{ contenu: { type: string; cible?: string } }>('elements').values()].filter((e) => e.contenu.cible === 'accueilDeLea').length)
    expect(await renvois()).toBe(1)
    // Rouverte une seconde fois : rien de plus.
    expect((await rouvrirCopie(el, octets, racine)).fusion).toBe(true)
    await attendre()
    expect(await renvois()).toBe(1)
  })
})
