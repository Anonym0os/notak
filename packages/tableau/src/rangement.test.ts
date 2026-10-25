import { describe, expect, it } from 'vitest'
import { creerEspace } from './coeur/espace'
import { type Element, type Tableau, nouvelleColonne, nouvelleNote, surLeTableau } from './coeur/tableau'
import { nouvelleCarteMentale } from './elements/arbre'
import { nouveauDocument } from './elements/document/texte'
import { carteDeLaToile, creerDans, deplacer, dupliquer, jeter, rangerDansNeuve, renommerChose, toilesPortees } from './rangement'

const renvoi = (id: string, cible: string, x = 0): Element => ({ id, x, y: 0, largeur: 10, contenu: { type: 'tableau', cible } })

/** L'accueil porte la toile « Projets », une carte mentale et un document ; « Projets » est vide. */
function monde() {
  const carte = { ...nouvelleCarteMentale(0, 0), id: 'carte' }
  const doc = { ...nouveauDocument(30, 0), id: 'doc' }
  const espace = creerEspace({
    racine: 'accueil',
    tableaux: {
      accueil: { titre: 'Accueil', elements: [renvoi('r-projets', 'projets', 60), carte, doc] },
      projets: { titre: 'Projets', elements: [] },
    },
  })
  const vivants = (id: string) => surLeTableau(espace.tableau(id)!)
  return { espace, vivants }
}

const titreCarte = (t: Tableau, id: string) => {
  const e = t.elements.find((x) => x.id === id)!
  return e.contenu.type === 'arbre' ? Object.values(e.contenu.sujets).find((s) => !s.parent && !s.genre)?.titre : undefined
}

describe('rangement', () => {
  it('trouve la carte d’une toile et les toiles que portent des cartes', () => {
    const { espace } = monde()
    expect(carteDeLaToile(espace, 'accueil', 'projets')).toBe('r-projets')
    expect(carteDeLaToile(espace, 'accueil', 'ailleurs')).toBeNull()
    expect(toilesPortees(espace.tableau('accueil')!, ['r-projets', 'doc'])).toEqual(['projets'])
  })

  it('jette à la corbeille d’un pas, et le défait', () => {
    const { espace, vivants } = monde()
    const j = jeter(espace, [
      { toile: 'accueil', element: 'doc' },
      { toile: 'accueil', element: 'carte' },
    ])
    expect(j.nombre).toBe(2)
    expect(vivants('accueil').map((e) => e.id)).toEqual(['r-projets'])
    j.annuler()
    expect(vivants('accueil')).toHaveLength(3)
  })

  it('déplace dans une autre toile, dit quelle toile a bougé, et remet tout à l’identique', () => {
    const { espace, vivants } = monde()
    espace.magasin('accueil').faire([{ type: 'creer', element: renvoi('r-autre', 'autre') }])
    const d = deplacer(
      espace,
      [
        { toile: 'accueil', element: 'doc' },
        { toile: 'accueil', element: 'r-autre' },
      ],
      'projets',
    )
    expect(vivants('projets').map((e) => e.contenu.type).sort()).toEqual(['document', 'tableau'])
    expect(d.neufs.map((p) => [p.de.element, p.vers.toile]).sort()).toEqual([
      ['doc', 'projets'],
      ['r-autre', 'projets'],
    ])
    expect(d.toiles).toEqual([{ toile: 'autre', de: 'accueil' }])
    expect(vivants('accueil').map((e) => e.id).sort()).toEqual(['carte', 'r-projets'])
    d.annuler()
    expect(vivants('projets')).toHaveLength(0)
    expect(vivants('accueil').map((e) => e.id).sort()).toEqual(['carte', 'doc', 'r-autre', 'r-projets'])
  })

  it('ne met pas une toile dans elle-même', () => {
    const { espace, vivants } = monde()
    const d = deplacer(espace, [{ toile: 'accueil', element: 'r-projets' }], 'projets')
    expect(d.neufs).toEqual([])
    expect(vivants('accueil').map((e) => e.id)).toContain('r-projets')
  })

  it('emporte le contenu d’une colonne', () => {
    const { espace, vivants } = monde()
    const col = nouvelleColonne(0, 40)
    const dedans = { ...nouvelleNote(0, 0), parent: col.id, ordre: 'V' }
    espace.magasin('accueil').faire([
      { type: 'creer', element: col },
      { type: 'creer', element: dedans },
    ])
    deplacer(espace, [{ toile: 'accueil', element: col.id }], 'projets')
    const la = espace.tableau('projets')!.elements
    expect(la).toHaveLength(2)
    expect(la.find((e) => e.parent)?.parent).toBe(la.find((e) => e.contenu.type === 'colonne')?.id)
    expect(vivants('accueil').map((e) => e.id)).not.toContain(col.id)
  })

  it('sort un élément de sa colonne pour le déplacer', () => {
    const { espace, vivants } = monde()
    const col = nouvelleColonne(0, 40)
    const carte = { ...renvoi('r-range', 'rangee'), parent: col.id, ordre: 'V' }
    espace.magasin('accueil').faire([
      { type: 'creer', element: col },
      { type: 'creer', element: carte },
    ])
    const d = deplacer(espace, [{ toile: 'accueil', element: 'r-range' }], 'projets')
    expect(d.toiles).toEqual([{ toile: 'rangee', de: 'accueil' }])
    expect(vivants('projets').map((e) => [e.contenu.type, e.parent])).toEqual([['tableau', undefined]])
    expect(vivants('accueil').map((e) => e.id)).toContain(col.id)
    expect(vivants('accueil').map((e) => e.id)).not.toContain('r-range')
  })

  it('renomme une toile, une carte mentale (son central) et un document', () => {
    const { espace } = monde()
    renommerChose(espace, { toile: 'projets', element: null }, 'Chantiers')
    renommerChose(espace, { toile: 'accueil', element: 'carte' }, 'Idées')
    renommerChose(espace, { toile: 'accueil', element: 'doc' }, 'Compte rendu')
    const accueil = espace.tableau('accueil')!
    expect(espace.tableau('projets')!.titre).toBe('Chantiers')
    expect(titreCarte(accueil, 'carte')).toBe('Idées')
    expect(accueil.elements.find((e) => e.id === 'doc')!.contenu).toMatchObject({ titre: 'Compte rendu' })
  })

  it('copie un document ou une toile à côté de l’original, titrés « (copie) »', () => {
    const { espace } = monde()
    renommerChose(espace, { toile: 'accueil', element: 'doc' }, 'Budget')
    const copie = dupliquer(espace, { toile: 'accueil', element: 'doc' })!
    expect(espace.tableau('accueil')!.elements.find((e) => e.id === copie.element)!.contenu).toMatchObject({ type: 'document', titre: 'Budget (copie)' })
    espace.magasin('projets').faire([{ type: 'creer', element: nouvelleNote(0, 0) }])
    const toile = dupliquer(espace, { toile: 'projets', element: null }, 'accueil')!
    expect(espace.tableau(toile.tableau)).toMatchObject({ titre: 'Projets (copie)' })
    expect(espace.tableau(toile.tableau)!.elements).toHaveLength(1)
    expect(carteDeLaToile(espace, 'accueil', toile.tableau)).not.toBeNull()
  })

  it('crée dans une toile, et range une sélection dans une toile neuve', () => {
    const { espace, vivants } = monde()
    const doc = creerDans(espace, 'projets', 'document')
    expect(doc.tableau).toBe('projets')
    expect(vivants('projets').map((e) => e.id)).toEqual([doc.element])
    const neuve = creerDans(espace, 'projets', 'toile')
    expect(carteDeLaToile(espace, 'projets', neuve.tableau)).not.toBeNull()

    const r = rangerDansNeuve(espace, [{ toile: 'accueil', element: 'carte' }], 'accueil', 'Classeur')
    expect(espace.tableau(r.toile)).toMatchObject({ titre: 'Classeur' })
    expect(vivants(r.toile).map((e) => e.contenu.type)).toEqual(['arbre'])
    expect(carteDeLaToile(espace, 'accueil', r.toile)).not.toBeNull()
    r.annuler()
    expect(vivants('accueil').map((e) => e.id)).toContain('carte')
    expect(carteDeLaToile(espace, 'accueil', r.toile)).toBeNull()
  })
})
