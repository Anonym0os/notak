import 'fake-indexeddb/auto'
import { decoderNotak, encoderNotak, nouvelleNote, ouvrirIndexLocal } from '@notak/tableau'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { fabriquerCopie, rouvrirCopie } from './copie'
import { type EspaceLocal, espaceLocal } from './espace'

const attendre = (ms = 30) => new Promise((r) => setTimeout(r, ms))

/** Un client Yjs propre à chaque tableau : la même copie, fabriquée deux fois, est la même (les mêmes horloges, rien de neuf). */
const clientDe = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/** Une copie fabriquée chez quelqu'un d'autre : un tableau de tête, un sous-tableau, et une note dans chacun. */
function copieDe(tete: string, sous: string): Uint8Array {
  const tableau = (id: string) => {
    const doc = new Y.Doc()
    doc.clientID = clientDe(id)
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

  it('la marque est dans l’index de l’appareil, jamais dans le tableau reçu', async () => {
    const el = await espaceLocal()
    const { index, reseau } = el
    // Rien dans le tableau lui-même ne dit qu'il a été reçu : l'expéditeur n'y peut rien écrire de « fiable ».
    const meta = await reseau.avec('voyageDeLea', (doc) => [...doc.getMap('meta').keys()])
    expect(meta.some((k) => k.includes('recu'))).toBe(false)
    expect(index.doc.getMap('meta').get('recu:voyageDeLea')).toBe(true)
  })

  it('la marque survit au rechargement : l’index rouvert depuis IndexedDB la retrouve, et retrouve aussi celle qu’on a retirée', async () => {
    // Un préfixe à part : un autre « navigateur », rouvert pour de bon (l'espace d'ici est gardé en mémoire).
    const prefixe = 'essai-recu:'
    const avant = await ouvrirIndexLocal(prefixe)
    avant.index.noterRecus(['gardee', 'retiree'])
    avant.index.retirerRecu('retiree')
    await attendre()
    avant.fermer()
    await attendre()

    const apres = await ouvrirIndexLocal(prefixe)
    expect([apres.index.recu('gardee'), apres.index.recu('retiree')]).toEqual([true, false])
    apres.fermer()
  })
})

describe('une copie qui revient de chez quelqu’un, sous une racine qu’on connaît', () => {
  const seul = { sousTableaux: false, fichiers: false }

  /** Un tableau d'ici, avec une note : de quoi en tirer une copie et la voir changer chez l'autre. */
  async function unTableau({ espace, index }: EspaceLocal) {
    const id = espace.creerTableau('Chez moi', index.racine())
    espace.magasin(id).faire([{ type: 'creer', element: nouvelleNote(1, 1) }])
    await attendre()
    return id
  }
  /** Ce que l'autre renvoie : sa copie du tableau, qu'il a changée de son côté (son propre client Yjs : de nouvelles horloges). */
  function retourDe(copie: Uint8Array, id: string, changer: (doc: Y.Doc) => void, enPlus: { id: string; titre: string }[] = []): Uint8Array {
    const { tableaux } = decoderNotak(copie)
    const doc = new Y.Doc()
    Y.applyUpdate(doc, tableaux[0]!.etat)
    changer(doc)
    const neuf = enPlus.map((t) => {
      const d = new Y.Doc()
      d.getMap('meta').set('titre', t.titre)
      return { id: t.id, titre: t.titre, parent: id, etat: Y.encodeStateAsUpdate(d) }
    })
    return encoderNotak({ racine: id, tableaux: [{ id, titre: 'Chez moi', etat: Y.encodeStateAsUpdate(doc) }, ...neuf], fichiers: [] })
  }
  const ajouter = (doc: Y.Doc) => void doc.getMap('elements').set('deBob', { ...nouvelleNote(5, 5), id: 'deBob', plan: 'a9' })
  const retirer = (doc: Y.Doc) => void doc.getMap('elements').delete([...doc.getMap('elements').keys()][0]!)

  it('ce que l’autre y ajoute, et un tableau qu’on ne connaît pas, attendent l’accord ; son propre tableau d’avant non', async () => {
    const el = await espaceLocal()
    const { index } = el
    const mien = await unTableau(el)
    const depart = await fabriquerCopie(el, mien, seul)
    const autre = await unTableau(el)
    const retour = retourDe(depart, mien, ajouter, [{ id: 'tableauDeBob', titre: 'Chez Bob' }])
    expect([index.recu(mien), index.recu(autre)]).toEqual([false, false])

    const r = await rouvrirCopie(el, retour, mien)
    expect(r.fusion).toBe(true)
    expect([index.recu(mien), index.recu('tableauDeBob')]).toEqual([true, true])
    // Un autre tableau d'ici, que la copie ne touche pas, reste à nous.
    expect(index.recu(autre)).toBe(false)
  })

  it('sa propre copie, et une copie plus ancienne que l’état d’ici, ne marquent rien', async () => {
    const el = await espaceLocal()
    const { index, espace } = el
    const mien = await unTableau(el)
    const copie = await fabriquerCopie(el, mien, seul)
    expect((await rouvrirCopie(el, copie, index.racine())).fusion).toBe(true)
    expect(index.recu(mien)).toBe(false)

    // On a avancé depuis : la copie est en retard, elle n'apporte rien.
    espace.magasin(mien).faire([{ type: 'creer', element: nouvelleNote(3, 3) }])
    await attendre()
    await rouvrirCopie(el, copie, index.racine())
    expect(index.recu(mien)).toBe(false)
  })

  it('une copie qui ne fait que retirer quelque chose ne marque rien', async () => {
    const el = await espaceLocal()
    const { index } = el
    const mien = await unTableau(el)
    const retour = retourDe(await fabriquerCopie(el, mien, seul), mien, retirer)

    await rouvrirCopie(el, retour, index.racine())
    expect(index.recu(mien)).toBe(false)
  })

  it('« Tout afficher » ne vaut pas pour ce que l’autre ajoutera : une copie qui apporte du neuf remet la marque', async () => {
    const el = await espaceLocal()
    const { index } = el
    const mien = await unTableau(el)
    const depart = await fabriquerCopie(el, mien, seul)
    index.noterRecus([mien])
    index.retirerRecu(mien)

    // La même copie, rouverte : rien de neuf, rien ne revient.
    await rouvrirCopie(el, depart, index.racine())
    expect(index.recu(mien)).toBe(false)
    // La copie que l'autre a poussée plus loin : la marque revient.
    await rouvrirCopie(el, retourDe(depart, mien, ajouter), index.racine())
    expect(index.recu(mien)).toBe(true)
  })
})
