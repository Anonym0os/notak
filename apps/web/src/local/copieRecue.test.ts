import 'fake-indexeddb/auto'
import { encoderNotak, nouvelleNote } from '@notak/tableau'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { fabriquerCopie, rouvrirCopie } from './copie'
import { espaceLocal } from './espace'

const attendre = (ms = 30) => new Promise((r) => setTimeout(r, ms))

/** Une copie fabriquée chez quelqu'un d'autre : un tableau de tête, un sous-tableau, et une note dans chacun. */
function copieDe(tete: string, sous: string): Uint8Array {
  const tableau = (id: string) => {
    const doc = new Y.Doc()
    doc.getMap('meta').set('titre', id)
    doc.getMap('elements').set('n1', { ...nouvelleNote(0, 0), id: 'n1', plan: 'a0' })
    return { id, titre: id, ...(id === sous ? { parent: tete } : {}), etat: Y.encodeStateAsUpdate(doc) }
  }
  return encoderNotak({ racine: tete, tableaux: [tableau(tete), tableau(sous)], fichiers: [] })
}

// Un seul espace pour tout ce fichier : le premier essai rouvre une copie dans un espace encore intact.
describe('les copies reçues sont marquées, la leur jamais', () => {
  it('la copie de quelqu’un d’autre qui devient l’accueil marque tous ses tableaux, pas l’accueil d’avant', async () => {
    const el = await espaceLocal()
    const { index } = el
    const ancien = index.racine()
    expect(index.lister()).toHaveLength(1)

    const r = await rouvrirCopie(el, copieDe('teteDeLea', 'voyageDeLea'), ancien)
    expect(r).toMatchObject({ fusion: false, accueil: true })
    expect(index.racine()).toBe('teteDeLea')
    expect(index.recu('teteDeLea')).toBe(true)
    expect(index.recu('voyageDeLea')).toBe(true)
    expect(index.recu(ancien)).toBe(false)
  })

  it('la copie de quelqu’un d’autre rangée sous le tableau ouvert marque ses tableaux, et eux seuls', async () => {
    const el = await espaceLocal()
    const { index, espace } = el
    const mien = espace.creerTableau('Voyage', index.racine())
    await attendre()
    const marquesAvant = index.lister().filter((e) => index.recu(e.id)).map((e) => e.id)

    const r = await rouvrirCopie(el, copieDe('teteDeMax', 'voyageDeMax'), mien)
    expect(r).toMatchObject({ fusion: false, accueil: false })
    expect(index.entree('teteDeMax')).toMatchObject({ parent: mien })
    expect([index.recu('teteDeMax'), index.recu('voyageDeMax')]).toEqual([true, true])
    // Le tableau où on l'a rangée est à nous : il ne devient pas « reçu » pour autant.
    expect(index.recu(mien)).toBe(false)
    expect(index.lister().filter((e) => index.recu(e.id)).map((e) => e.id).sort()).toEqual([...marquesAvant, 'teteDeMax', 'voyageDeMax'].sort())
  })

  it('sa propre copie, rouverte, ne marque rien et ne retire aucune marque', async () => {
    const el = await espaceLocal()
    const { index } = el
    const racine = index.racine()
    const avant = index.lister().map((e) => e.id)
    const marques = avant.filter((id) => index.recu(id))
    expect(marques).toEqual(expect.arrayContaining(['teteDeLea', 'voyageDeLea', 'teteDeMax', 'voyageDeMax']))

    const r = await rouvrirCopie(el, await fabriquerCopie(el), racine)
    expect(r.fusion).toBe(true)
    expect(index.lister().map((e) => e.id).filter((id) => index.recu(id))).toEqual(marques)
  })

  it('une copie déjà rouverte ne remet pas la marque qu’on a retirée', async () => {
    const el = await espaceLocal()
    const { index } = el
    const octets = copieDe('teteDeMax', 'voyageDeMax')
    index.retirerRecu('teteDeMax')
    expect(index.recu('teteDeMax')).toBe(false)

    const r = await rouvrirCopie(el, octets, index.racine())
    expect(r.fusion).toBe(true)
    expect(index.recu('teteDeMax')).toBe(false)
    // Les autres tableaux de la copie gardent leur marque : on n'a permis que celui-là.
    expect(index.recu('voyageDeMax')).toBe(true)
  })

  it('la marque survit au rechargement : elle est dans l’index de l’appareil, pas dans le tableau reçu', async () => {
    const el = await espaceLocal()
    const { index, reseau } = el
    // Rien dans le tableau lui-même ne dit qu'il a été reçu : l'expéditeur n'y peut rien écrire de « fiable ».
    const meta = await reseau.avec('voyageDeLea', (doc) => [...doc.getMap('meta').keys()])
    expect(meta.some((k) => k.includes('recu'))).toBe(false)
    expect(index.doc.getMap('meta').get('recu:voyageDeLea')).toBe(true)
  })
})
