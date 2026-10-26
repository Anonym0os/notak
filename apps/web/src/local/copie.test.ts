import 'fake-indexeddb/auto'
import { decoderNotak, encoderNotak, nouvelleNote } from '@notak/tableau'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { fabriquerCopie, rouvrirCopie } from './copie'
import { espaceLocal } from './espace'
import { lireFichier } from './fichiers'

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
    const elements = () => el.reseau.avec(racine, (d) => d.getMap('elements').size)
    const notesAvant = await elements()
    const r = await rouvrirCopie(el, octets, racine)
    expect(r).toMatchObject({ fusion: true, accueil: false })
    await attendre()
    expect(index.lister().length).toBe(avant)
    expect(await elements()).toBe(notesAvant)
    // Sa propre copie n'a rien d'une copie reçue.
    expect(index.lister().some((e) => index.recu(e.id))).toBe(false)
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
    // Venue de quelqu'un d'autre, elle attend l'accord de la personne pour ses lecteurs et ses images ; la nôtre, non.
    expect([index.recu('accueilDeLea'), index.recu(racine)]).toEqual([true, false])
    await attendre()
    const renvois = () => reseau.avec(racine, (d) => [...d.getMap<{ contenu: { type: string; cible?: string } }>('elements').values()].filter((e) => e.contenu.cible === 'accueilDeLea').length)
    expect(await renvois()).toBe(1)
    // Rouverte une seconde fois : rien de plus.
    expect((await rouvrirCopie(el, octets, racine)).fusion).toBe(true)
    await attendre()
    expect(await renvois()).toBe(1)
  })

  it('un fichier se range sous l’empreinte de son contenu, pas sous celle qu’annonce la copie', async () => {
    const el = await espaceLocal()
    const vraie = 'a'.repeat(64)
    // Une copie trafiquée : un contenu quelconque sous le nom d'une autre image, qu'on poserait plus tard.
    const copie = encoderNotak({ racine: el.index.racine(), tableaux: [], fichiers: [{ id: vraie, type: 'image/png', octets: new Uint8Array([1, 2, 3]) }] })
    await rouvrirCopie(el, copie, el.index.racine())
    expect(await lireFichier(vraie)).toBeUndefined()
    // Un fichier d'une copie du serveur (un uuid, pas une empreinte) garde son nom : rien ne peut s'y confondre.
    const uuid = '6f1c2b0e-8d4a-4c51-9a3e-2b7d9e0f1a2b'
    await rouvrirCopie(el, encoderNotak({ racine: el.index.racine(), tableaux: [], fichiers: [{ id: uuid, type: 'image/png', octets: new Uint8Array([4]) }] }), el.index.racine())
    expect(await lireFichier(uuid)).toBeDefined()
  })
})

