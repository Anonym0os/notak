import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { lireTableau } from '../export/contenu'
import { enLectureSeule } from './magasin'
import { type ElementStocke, creerMagasinYjs, plansPour } from './magasinYjs'
import { type Auteur, type Contenu, type Element, type Tableau, annoter, auPremierPlan, nouvelleColonne, nouvelleNote, placeDe } from './tableau'

/** Deux documents qui s'échangent leurs mises à jour, comme le ferait un serveur ; `auteur` : qui fait les gestes de A. */
function relies(auteur?: Auteur) {
  const [a, b] = [new Y.Doc(), new Y.Doc()]
  a.on('update', (u: Uint8Array, origine: unknown) => origine !== 'distant' && Y.applyUpdate(b, u, 'distant'))
  b.on('update', (u: Uint8Array, origine: unknown) => origine !== 'distant' && Y.applyUpdate(a, u, 'distant'))
  return { a, b, ma: creerMagasinYjs(a, undefined, { auteur: () => auteur }), mb: creerMagasinYjs(b) }
}

const note = (x: number, y = 0): Element => ({ ...nouvelleNote(x, y) })
const ids = (t: Tableau) => t.elements.map((e) => e.id)

describe('magasin Yjs', () => {
  it('une toile montrée en dossier le reste chez l’autre, et le redevient toile ; l’export le lit aussi', () => {
    const { a, ma, mb } = relies()
    ma.faire([{ type: 'creer', element: note(1) }])
    ma.remplacer({ ...ma.lire(), dossier: true })
    expect(mb.lire().dossier).toBe(true)
    expect(lireTableau(a).dossier).toBe(true)
    // Le contenu n'a pas bougé.
    expect(ids(mb.lire())).toEqual(ids(ma.lire()))
    const { dossier: _d, ...sans } = mb.lire()
    mb.remplacer(sans)
    expect(ma.lire()).not.toHaveProperty('dossier')
    expect(lireTableau(a)).not.toHaveProperty('dossier')
  })

  it('les gestes de chacun arrivent chez l’autre', () => {
    const { ma, mb } = relies()
    const [n1, n2] = [note(1), note(2)]
    ma.faire([{ type: 'creer', element: n1 }])
    mb.faire([{ type: 'creer', element: n2 }])
    ma.faire([{ type: 'deplacer', id: n2.id, de: [2, 0], vers: [5, 6] }])
    expect(ma.lire().elements).toEqual(mb.lire().elements)
    expect(mb.lire().elements.find((e) => e.id === n2.id)).toMatchObject({ x: 5, y: 6 })
    expect(ids(mb.lire())).toEqual([n1.id, n2.id])
  })

  it('l’annulation de A ne touche pas ce qu’a fait B', () => {
    const { ma, mb } = relies()
    const [n1, n2, n3] = [note(1), note(2), note(3)]
    ma.faire([{ type: 'creer', element: n1 }])
    mb.faire([{ type: 'creer', element: n2 }])
    ma.faire([{ type: 'creer', element: n3 }])
    expect(ma.annuler()).toBe(true)
    expect(ids(mb.lire())).toEqual([n1.id, n2.id])
    expect(ma.annuler()).toBe(true)
    expect(ids(ma.lire())).toEqual([n2.id])
    // B n'a rien à annuler au-delà de son propre geste, et A n'a plus rien du tout.
    expect(ma.annuler()).toBe(false)
    expect(mb.annuler()).toBe(true)
    expect(ma.lire().elements).toEqual([])
  })

  it('rétablit un geste annulé', () => {
    const { ma, mb } = relies()
    const n = note(1)
    ma.faire([{ type: 'creer', element: n }])
    ma.annuler()
    expect(mb.lire().elements).toEqual([])
    expect(ma.retablir()).toBe(true)
    expect(ids(mb.lire())).toEqual([n.id])
  })

  // Le reste de ce que garantit `corriger`, commun aux deux magasins, est dans `magasin.test.ts`.
  it('pendant que l’autre écrit, une correction en plein glisser laisse Annuler défaire le glisser, la pose, puis le pas d’avant', () => {
    const { ma, mb } = relies()
    const [n, autre] = [note(1), note(40)]
    const photo: Element = { id: 'p', x: 20, y: 0, largeur: 10, contenu: { type: 'image', fichier: 'f', largeurOrigine: 10, hauteurOrigine: 10 } }
    ma.faire([{ type: 'creer', element: n }])
    ma.faire([{ type: 'creer', element: photo }])
    ma.appliquerSeulement([{ type: 'deplacer', id: n.id, de: [1, 0], vers: [5, 5] }])
    mb.faire([{ type: 'creer', element: autre }])
    ma.corriger([{ type: 'contenu', id: 'p', avant: photo.contenu, apres: { ...photo.contenu, couleurs: ['#aa0000'] } as Contenu }])
    ma.inscrire([{ type: 'deplacer', id: n.id, de: [1, 0], vers: [5, 5] }])
    expect(ma.annuler()).toBe(true)
    expect(mb.lire().elements.find((e) => e.id === n.id)).toMatchObject({ x: 1, y: 0 })
    expect(ma.annuler()).toBe(true)
    expect(ids(mb.lire())).toEqual([n.id, autre.id])
    expect(ma.annuler()).toBe(true)
    expect(ids(mb.lire())).toEqual([autre.id])
    expect(ma.annuler()).toBe(false)
  })

  it('corriger ce qu’un autre a posé ne le fait pas entrer dans mon historique, ni ne vide ce que je peux rétablir', () => {
    const { ma, mb } = relies()
    const [n, o] = [note(1), note(2)]
    mb.faire([{ type: 'creer', element: o }])
    ma.faire([{ type: 'creer', element: n }])
    ma.annuler()
    ma.corriger([{ type: 'deplacer', id: o.id, de: [2, 0], vers: [9, 0] }])
    expect(mb.lire().elements).toEqual([{ ...o, x: 9 }])
    expect(ma.peutAnnuler()).toBe(false)
    expect(ma.retablir()).toBe(true)
    expect(ma.annuler()).toBe(true)
    expect(ma.annuler()).toBe(false)
    expect(mb.lire().elements).toEqual([{ ...o, x: 9 }])
  })

  it('le texte d’une note se partage, hors de l’historique du tableau', () => {
    const { ma, mb } = relies()
    const n = note(1)
    ma.faire([{ type: 'creer', element: n }])
    const fa = ma.texte(n.id)
    fa.insert(0, [new Y.XmlText('Bonjour')])
    expect(mb.texte(n.id).toString()).toBe('Bonjour')
    // Créé d'un côté, le fragment est le même de l'autre : pas de second texte qui l'écraserait.
    expect(mb.texte(n.id)).toBe(mb.texte(n.id))
    expect(ma.annuler()).toBe(true)
    expect(ma.lire().elements).toEqual([])
    expect(ma.annuler()).toBe(false)
  })

  it('un élément qui quitte le document emporte son texte, sa ligne et sa trace ; annuler l’effacement le rend, texte compris', () => {
    const { a, b, ma, mb } = relies({ id: 'ana', nom: 'Ana' })
    const n = nouvelleNote(1, 1, 'Le budget secret')
    ma.faire([{ type: 'creer', element: n }])
    ma.texte(n.id).insert(0, [new Y.XmlText('Le budget secret')])
    ma.ligne(n.id).insert(0, 'Budget')
    expect(mb.texte(n.id).toString()).toContain('Le budget secret')
    // Effacé (une corbeille qu'on vide).
    ma.faire([{ type: 'supprimer', element: ma.lire().elements[0]! }])
    for (const doc of [a, b]) for (const cle of ['textes', 'lignes', 'traces']) expect(doc.getMap(cle).has(n.id)).toBe(false)
    // Chez un autre membre, le document ne garde plus rien de ce texte, ni dans l'élément, ni dans le fragment.
    expect(new TextDecoder().decode(Y.encodeStateAsUpdate(b))).not.toContain('secret')
    // Annulé, il revient avec son texte : l'éditeur repartira de son contenu, qui en garde la copie.
    expect(ma.annuler()).toBe(true)
    expect(mb.lire().elements).toEqual([n])
    expect(ma.texte(n.id).length).toBe(0)
  })

  it('parti pour une autre toile, un élément emporte son texte, et aucune annulation ne le rend, même celle d’un autre membre qui l’avait touché', () => {
    const { a, b, ma, mb } = relies({ id: 'ana', nom: 'Ana' })
    const n = nouvelleNote(1, 1, 'Le budget')
    ma.faire([{ type: 'creer', element: n }])
    ma.texte(n.id).insert(0, [new Y.XmlText('Le budget secret')])
    mb.faire([{ type: 'deplacer', id: n.id, de: [1, 1], vers: [8, 8] }])
    ma.transferer([{ type: 'supprimer', element: ma.lire().elements[0]! }])
    for (const doc of [a, b]) expect(doc.getMap('textes').has(n.id)).toBe(false)
    // L'historique de B garde la note d'avant son déplacement (c'est le sien), pas le texte écrit à plusieurs.
    expect(new TextDecoder().decode(Y.encodeStateAsUpdate(b))).not.toContain('secret')
    // Sans quoi B, en annulant son déplacement, le ferait revenir ici, en double de sa copie là-bas.
    expect(mb.annuler()).toBe(false)
    expect(ma.annuler()).toBe(false)
    expect([ma.lire().elements, mb.lire().elements]).toEqual([[], []])
  })

  it('le glisser qui n’écrivait que ce qui part s’en va avec lui : il ne reste pas d’Annuler qui ne fait rien', () => {
    const { ma, mb } = relies()
    const [colonne, n, autre] = [nouvelleColonne(0, 0), note(1, 1), note(40)]
    const range = { ...n, parent: colonne.id, ordre: 'a' }
    // Posé par un autre : rien dans l'historique de A.
    mb.faire([{ type: 'creer', element: colonne }, { type: 'creer', element: range }, { type: 'creer', element: autre }])
    // Il sort de sa colonne en chemin, y revient au lâcher, puis part.
    const glisser = () => {
      const avant = ma.lire().elements.find((e) => e.id === n.id)!
      ma.appliquerSeulement([{ type: 'ranger', id: n.id, de: placeDe(avant), vers: { x: 9, y: 9 } }])
      ma.appliquerSeulement([{ type: 'ranger', id: n.id, de: { x: 9, y: 9 }, vers: placeDe(avant) }])
    }
    glisser()
    ma.transferer([{ type: 'supprimer', element: ma.lire().elements.find((e) => e.id === n.id)! }])
    expect(ma.peutAnnuler()).toBe(false)
    // Un glisser qui a écrit autre chose que ce qui part reste, lui, à annuler.
    mb.faire([{ type: 'creer', element: range }])
    glisser()
    ma.appliquerSeulement([{ type: 'deplacer', id: autre.id, de: [40, 0], vers: [41, 0] }])
    ma.transferer([{ type: 'supprimer', element: ma.lire().elements.find((e) => e.id === n.id)! }])
    expect(ma.annuler()).toBe(true)
    expect(ma.lire().elements.map((e) => [e.id, e.x])).toEqual([[colonne.id, 0], [autre.id, 40]])
  })

  it('la corbeille garde le texte ; la vider, ou remplacer le tableau sans l’élément, l’emporte', () => {
    const { a, ma } = relies()
    const [n1, n2] = [nouvelleNote(1, 0, 'Un'), nouvelleNote(2, 0, 'Deux')]
    ma.faire([{ type: 'creer', element: n1 }, { type: 'creer', element: n2 }])
    for (const n of [n1, n2]) ma.texte(n.id).insert(0, [new Y.XmlText('texte')])
    ma.faire([{ type: 'ranger', id: n1.id, de: placeDe(n1), vers: { ...placeDe(n1), corbeille: 5 } }])
    expect(a.getMap('textes').has(n1.id)).toBe(true)
    ma.faire([{ type: 'supprimer', element: ma.lire().elements.find((e) => e.id === n1.id)! }])
    expect(a.getMap('textes').has(n1.id)).toBe(false)
    ma.remplacer({ ...ma.lire(), elements: [] })
    expect(a.getMap('textes').size).toBe(0)
  })

  it('ce qu’un geste fait hors du document se défait et se refait avec son pas, même un pas qui ne change rien de visible', () => {
    const { ma } = relies()
    const carte: Element = { id: 'carte', x: 0, y: 0, largeur: 10, contenu: { type: 'tableau', cible: 'budget' } }
    ma.faire([{ type: 'creer', element: carte }])
    const faits: string[] = []
    // Le renommage d'une toile depuis sa carte : la carte ne change pas, le titre vit dans le document de la toile.
    ma.faire([{ type: 'contenu', id: 'carte', avant: carte.contenu, apres: carte.contenu }], { faire: () => faits.push('Neuf'), defaire: () => faits.push('Ancien') })
    expect(ma.annuler()).toBe(true)
    expect(ma.lire().elements).toEqual([carte])
    expect(ma.retablir()).toBe(true)
    expect(ma.annuler()).toBe(true)
    expect(faits).toEqual(['Neuf', 'Ancien', 'Neuf', 'Ancien'])
    // Un nouveau geste efface ce qu'on pouvait rétablir, et ce qu'il aurait refait.
    ma.faire([{ type: 'deplacer', id: 'carte', de: [0, 0], vers: [4, 4] }])
    expect(ma.retablir()).toBe(false)
    expect(ma.annuler()).toBe(true)
    expect(faits).toHaveLength(4)
  })

  it('un geste qui ne change rien n’ouvre pas de pas : ce qu’il fait ailleurs ne s’accroche pas au précédent', () => {
    const { ma } = relies()
    const n = note(1, 1)
    ma.faire([{ type: 'creer', element: n }])
    const faits: string[] = []
    ma.faire([{ type: 'deplacer', id: n.id, de: [1, 1], vers: [1, 1] }], { faire: () => faits.push('fait'), defaire: () => faits.push('défait') })
    expect(ma.annuler()).toBe(true)
    expect(ma.lire().elements).toEqual([])
    expect(faits).toEqual(['fait'])
  })

  it('un glisser inscrit fait un seul pas, qui ramène au début du geste', () => {
    const { ma, mb } = relies()
    const n = note(1, 1)
    ma.faire([{ type: 'creer', element: n }])
    for (let x = 2; x <= 10; x++) ma.appliquerSeulement([{ type: 'deplacer', id: n.id, de: [x - 1, 1], vers: [x, 1] }])
    expect(mb.lire().elements[0]).toMatchObject({ x: 10 })
    ma.inscrire([{ type: 'deplacer', id: n.id, de: [1, 1], vers: [10, 1] }])
    expect(mb.lire().elements[0]).toMatchObject({ x: 10 })
    ma.annuler()
    expect(ma.lire().elements[0]).toMatchObject({ x: 1, y: 1 })
    expect(mb.lire().elements[0]).toMatchObject({ x: 1, y: 1 })
    ma.retablir()
    expect(mb.lire().elements[0]).toMatchObject({ x: 10 })
  })

  it('un geste de groupe s’annule d’un coup', () => {
    const { ma } = relies()
    const [n1, n2] = [note(1), note(2)]
    ma.faire([{ type: 'creer', element: n1 }, { type: 'creer', element: n2 }])
    ma.faire([
      { type: 'deplacer', id: n1.id, de: [1, 0], vers: [4, 0] },
      { type: 'deplacer', id: n2.id, de: [2, 0], vers: [5, 0] },
    ])
    ma.annuler()
    expect(ma.lire().elements.map((e) => e.x)).toEqual([1, 2])
  })

  it('l’ordre d’empilement est le même partout et ce qu’on crée passe dessus', () => {
    const { ma, mb } = relies()
    const [n1, n2, n3] = [note(1), note(2), note(3)]
    ma.faire([{ type: 'creer', element: n1 }])
    mb.faire([{ type: 'creer', element: n2 }])
    ma.faire([{ type: 'creer', element: n3 }])
    expect(ids(ma.lire())).toEqual([n1.id, n2.id, n3.id])
    expect(ids(mb.lire())).toEqual(ids(ma.lire()))
  })

  it('deux créations en même temps se rangent pareil des deux côtés', () => {
    const [a, b] = [new Y.Doc(), new Y.Doc()]
    const [ma, mb] = [creerMagasinYjs(a), creerMagasinYjs(b)]
    const [n1, n2] = [note(1), note(2)]
    ma.faire([{ type: 'creer', element: n1 }])
    mb.faire([{ type: 'creer', element: n2 }])
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    expect(ids(ma.lire())).toEqual(ids(mb.lire()))
    expect(ma.lire().elements).toHaveLength(2)
  })

  it('le premier plan ne réécrit que ce qui remonte', () => {
    const { a, ma, mb } = relies()
    const [n1, n2, n3] = [note(1), note(2), note(3)]
    ma.faire([{ type: 'creer', element: n1 }, { type: 'creer', element: n2 }, { type: 'creer', element: n3 }])
    const plans = () => Object.fromEntries([...a.getMap<ElementStocke>('elements')].map(([id, s]) => [id, s.plan]))
    const avant = plans()
    ma.remplacer(auPremierPlan(ma.lire(), [n1.id]))
    const apres = plans()
    ma.inscrire([{ type: 'deplacer', id: n1.id, de: [1, 0], vers: [1, 0] }])
    expect(ids(mb.lire())).toEqual([n2.id, n3.id, n1.id])
    expect(apres[n2.id]).toBe(avant[n2.id])
    expect(apres[n3.id]).toBe(avant[n3.id])
    expect(apres[n1.id]! > avant[n3.id]!).toBe(true)
  })

  it('annuler un glisser rend aussi son rang, puis annuler la création retire l’élément', () => {
    const { ma, mb } = relies()
    const [n1, n2] = [note(1), note(2)]
    ma.faire([{ type: 'creer', element: n1 }, { type: 'creer', element: n2 }])
    ma.appliquerSeulement([{ type: 'deplacer', id: n1.id, de: [1, 0], vers: [7, 7] }])
    ma.remplacer(auPremierPlan(ma.lire(), [n1.id]))
    ma.inscrire([{ type: 'deplacer', id: n1.id, de: [1, 0], vers: [7, 7] }])
    expect(ids(mb.lire())).toEqual([n2.id, n1.id])
    expect(ma.annuler()).toBe(true)
    expect(ids(mb.lire())).toEqual([n1.id, n2.id])
    expect(mb.lire().elements[0]).toMatchObject({ x: 1 })
    expect(ma.annuler()).toBe(true)
    expect(mb.lire().elements).toEqual([])
    expect(ma.annuler()).toBe(false)
  })

  it('lire() rend le même objet tant que rien ne change', () => {
    const { ma } = relies()
    const [n1, n2] = [note(1), note(2)]
    ma.faire([{ type: 'creer', element: n1 }, { type: 'creer', element: n2 }])
    const t = ma.lire()
    expect(ma.lire()).toBe(t)
    ma.faire([{ type: 'deplacer', id: n2.id, de: [2, 0], vers: [9, 9] }])
    const u = ma.lire()
    expect(u).not.toBe(t)
    expect(u.elements[0]).toBe(t.elements[0])
    expect(u.elements[1]).not.toBe(t.elements[1])
  })

  it('prévient ceux qui écoutent, pour ce qui vient des autres aussi', () => {
    const { ma, mb } = relies()
    let n = 0
    const fin = mb.ecouter(() => n++)
    ma.faire([{ type: 'creer', element: note(1) }])
    expect(n).toBe(1)
    fin()
    ma.faire([{ type: 'creer', element: note(2) }])
    expect(n).toBe(1)
  })

  it('le titre et la couleur viennent de meta et passent par remplacer', () => {
    const { b, ma, mb } = relies()
    ma.remplacer({ titre: 'Idées', couleur: 'vert', elements: [] })
    expect(mb.lire()).toMatchObject({ titre: 'Idées', couleur: 'vert' })
    b.getMap('meta').set('titre', 'Autre')
    expect(ma.lire().titre).toBe('Autre')
  })

  it('supprimer puis annuler remet l’élément à son rang', () => {
    const { ma, mb } = relies()
    const [n1, n2] = [note(1), note(2)]
    ma.faire([{ type: 'creer', element: n1 }, { type: 'creer', element: n2 }])
    ma.faire([{ type: 'supprimer', element: n1 }])
    expect(ids(mb.lire())).toEqual([n2.id])
    ma.annuler()
    expect(ids(mb.lire())).toEqual([n1.id, n2.id])
  })
})

describe('plansPour', () => {
  const pile = (...ids: string[]) => ids.map((id, i) => ({ id, plan: String.fromCharCode(65 + i) }))
  it('ne bouge pas ce qui garde son ordre', () => {
    const p = plansPour(pile('a', 'b', 'c'), ['b', 'c', 'a'])
    expect([...p.keys()]).toEqual(['a'])
    expect(p.get('a')! > 'C').toBe(true)
  })
  it('place un élément entre ses nouveaux voisins', () => {
    const p = plansPour(pile('a', 'b', 'c'), ['a', 'c', 'b'])
    expect([...p.keys()].length).toBe(1)
  })
  it('donne un plan à un élément nouveau', () => {
    const p = plansPour(pile('a', 'b'), ['a', 'n', 'b'])
    expect(p.get('n')! > 'A' && p.get('n')! < 'B').toBe(true)
  })
  it('ne fait rien quand l’ordre est le même', () => {
    expect(plansPour(pile('a', 'b'), ['a', 'b']).size).toBe(0)
  })
})

describe('enLectureSeule', () => {
  it('lit, mais ne change rien', () => {
    const { ma } = relies()
    const ro = enLectureSeule(ma)
    ro.faire([{ type: 'creer', element: note(1) }])
    expect(ma.lire().elements).toEqual([])
    ma.faire([{ type: 'creer', element: note(1) }])
    expect(ro.lire().elements).toHaveLength(1)
    expect(ro.annuler()).toBe(false)
  })
})

describe('étiquettes et annotations', () => {
  it('les étiquettes du tableau et celles d’un élément arrivent chez l’autre', () => {
    const { ma, mb } = relies()
    const n = note(1)
    ma.faire([{ type: 'creer', element: n }])
    const etiquette = { id: 'e1', nom: 'Urgent', couleur: 'rouge' as const }
    ma.faire([{ type: 'etiquettes', de: [], vers: [etiquette] }, annoter(n, { etiquettes: ['e1'], echeance: '2026-11-02' })!])
    expect(mb.lire().etiquettes).toEqual([etiquette])
    expect(mb.lire().elements[0]).toMatchObject({ etiquettes: ['e1'], echeance: '2026-11-02' })
    // La liste se reconstruit sans nouvel objet tant que rien ne change.
    expect(mb.lire().etiquettes).toBe(mb.lire().etiquettes)
    ma.faire([{ type: 'etiquettes', de: [etiquette], vers: [] }])
    expect(mb.lire().etiquettes).toBeUndefined()
  })

  it('annuler un geste d’annotation ne touche que l’élément', () => {
    const { ma } = relies()
    const n = note(1)
    ma.faire([{ type: 'creer', element: n }])
    ma.faire([annoter(ma.lire().elements[0]!, { affichage: 'icone' })!])
    expect(ma.lire().elements[0]!.affichage).toBe('icone')
    ma.annuler()
    expect(ma.lire().elements[0]!.affichage).toBeUndefined()
    expect(ma.lire().elements).toHaveLength(1)
  })

  it('remplacer écrit aussi les étiquettes', () => {
    const { ma, mb } = relies()
    ma.remplacer({ titre: 'T', etiquettes: [{ id: 'e', nom: 'A', couleur: 'vert' }], elements: [] })
    expect(mb.lire().etiquettes).toHaveLength(1)
    ma.remplacer({ titre: 'T', elements: [] })
    expect(mb.lire().etiquettes).toBeUndefined()
  })
})

describe('magasin Yjs : ce que d’autres ont écrit de travers', () => {
  /** Un document où quelqu'un a écrit sans passer par le magasin. */
  function empoisonne(brut: Record<string, unknown>) {
    const doc = new Y.Doc()
    const m = creerMagasinYjs(doc)
    const bonne = note(1)
    m.faire([{ type: 'creer', element: bonne }])
    doc.getMap('elements').set('poison', brut as never)
    return { doc, m, bonne }
  }

  it('un élément illisible ne fait pas tomber le tableau et reste hors de la toile', () => {
    for (const brut of [
      null,
      42,
      'texte',
      {},
      { id: 'poison', x: 0, y: 0, largeur: 10 },
      { id: 'poison', x: 0, y: 0, largeur: 10, contenu: { type: 'inconnu-d-une-autre-version' } },
      { id: 'poison', x: 0, y: 0, largeur: 10, contenu: { type: 'note' } },
      { id: 'poison', x: 0, y: 0, largeur: 10, contenu: { type: 'note', texte: { content: [] } } },
      { id: 'poison', x: 0, y: 0, largeur: 10, contenu: { type: 'image', fichier: 3 } },
    ]) {
      const { m, bonne } = empoisonne(brut as Record<string, unknown>)
      expect(ids(m.lire())).toEqual([bonne.id])
    }
  })

  it('un élément réparable est réparé à la lecture, sans réécrire le document', () => {
    const { doc, m } = empoisonne({
      id: 'autre-chose',
      x: Number.NaN,
      y: 1e12,
      largeur: -4,
      verrou: 'oui',
      etiquettes: [1, 2],
      contenu: { type: 'note', texte: { type: 'doc', content: [] } },
    })
    const lu = m.lire().elements.find((e) => e.id === 'poison')!
    expect(lu).toMatchObject({ id: 'poison', x: 0, y: 15_000, largeur: 34 })
    expect(lu).not.toHaveProperty('verrou')
    expect(lu).not.toHaveProperty('etiquettes')
    expect((doc.getMap('elements').get('poison') as { x: number }).x).toBeNaN()
  })

  it('renommer ou recolorer le tableau n’efface pas ce qu’il ne sait pas lire', () => {
    const { doc, m, bonne } = empoisonne({ id: 'poison', x: 0, y: 0, largeur: 10, contenu: { type: 'venu-du-futur' } })
    m.remplacer({ ...m.lire(), titre: 'Nouveau titre' })
    expect(doc.getMap('elements').has('poison')).toBe(true)
    expect(ids(m.lire())).toEqual([bonne.id])
  })

  it('un geste sur un élément illisible ne fait rien', () => {
    const { m } = empoisonne({ id: 'poison', x: 0, y: 0, largeur: 10, contenu: { type: 'note' } })
    expect(() => m.faire([{ type: 'deplacer', id: 'poison', de: [0, 0], vers: [3, 3] }])).not.toThrow()
  })

  it('un plan qui n’est pas une chaîne ne casse pas l’empilement', () => {
    const { m } = empoisonne({ id: 'poison', x: 0, y: 0, largeur: 10, plan: 7, contenu: { type: 'note', texte: { type: 'doc' } } })
    expect(() => m.faire([{ type: 'creer', element: note(5) }])).not.toThrow()
    expect(m.lire().elements).toHaveLength(3)
  })
})
