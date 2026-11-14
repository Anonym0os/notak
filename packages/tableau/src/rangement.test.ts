import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { creerEspace } from './coeur/espace'
import { type Reseau, creerEspaceDistant } from './coeur/espaceDistant'
import { type Element, type Tableau, nouvelleColonne, nouvelleNote, surLeTableau } from './coeur/tableau'
import { nouvelleCarteMentale } from './elements/arbre'
import { nouveauDocument } from './elements/document/texte'
import { carteDeLaToile, creerDans, deplacer, dupliquer, jeter, montrerEnDossier, rangerDansNeuve, renommerChose, toilesPortees } from './rangement'

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

  it('une page déplacée n’en laisse pas le texte dans le document qu’elle quitte ; annuler la rend, texte compris', () => {
    const docs = new Map<string, Y.Doc>()
    const reseau: Reseau = {
      connecter(id, doc) {
        docs.set(id, doc)
        return { awareness: null, lectureSeule: () => false, refuse: () => false, synchronise: () => true, detruire() {} }
      },
      async declarer() {},
    }
    const espace = creerEspaceDistant({ racine: 'accueil', utilisateur: { id: 'u1', nom: 'Ana', couleur: '#2f6feb' }, reseau })
    const texte = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Le budget secret' }] }] }
    const page = { ...nouveauDocument(0, 0), id: 'page', contenu: { type: 'document' as const, titre: 'Budget', texte } }
    const accueil = espace.magasin('accueil')
    accueil.faire([{ type: 'creer', element: page }])
    accueil.texte!('page').insert(0, [new Y.XmlText('Le budget secret')])
    espace.magasin('prive')
    const d = deplacer(espace, [{ toile: 'accueil', element: 'page' }], 'prive')
    expect(docs.get('accueil')!.getMap('textes').has('page')).toBe(false)
    expect(espace.tableau('prive')!.elements.map((e) => e.contenu)).toEqual([page.contenu])
    d.annuler()
    expect(espace.tableau('accueil')!.elements.find((e) => e.id === 'page')?.contenu).toEqual(page.contenu)
    espace.detruire()
  })

  it('« Déplacer vers… » : annuler dans la toile qu’on a quittée n’y fait pas revenir la page en double, ni annuler dans l’autre ne la perd', () => {
    const reseau: Reseau = {
      connecter: () => ({ awareness: null, lectureSeule: () => false, refuse: () => false, synchronise: () => true, detruire() {} }),
      async declarer() {},
    }
    const espace = creerEspaceDistant({ racine: 'accueil', utilisateur: { id: 'u1', nom: 'Ana', couleur: '#2f6feb' }, reseau })
    const [page, note] = [{ ...nouveauDocument(0, 0), id: 'page' }, { ...nouvelleNote(40, 0), id: 'note' }]
    // Les deux toiles sont ouvertes (leur historique vit) ; dans l'accueil, la page a bougé avant de partir.
    const [accueil, prive] = [espace.magasin('accueil'), espace.magasin('prive')]
    accueil.faire([{ type: 'creer', element: page }, { type: 'creer', element: note }])
    accueil.faire([{ type: 'deplacer', id: 'note', de: [40, 0], vers: [50, 0] }])
    accueil.faire([{ type: 'deplacer', id: 'page', de: [0, 0], vers: [10, 0] }])
    const d = deplacer(espace, [{ toile: 'accueil', element: 'page' }], 'prive')
    // Ce que porte chaque toile (là-bas, la page prend un nouvel identifiant).
    const genres = () => ['accueil', 'prive'].map((t) => espace.tableau(t)!.elements.map((e) => e.contenu.type).sort())
    expect(genres()).toEqual([['note'], ['document']])
    // L'annulation de l'accueil défait le pas d'avant le déplacement, sans rendre la page.
    expect(accueil.annuler()).toBe(true)
    expect(espace.tableau('accueil')!.elements).toMatchObject([{ id: 'note', x: 40 }])
    expect(prive.annuler()).toBe(false)
    expect(genres()).toEqual([['note'], ['document']])
    // L'avis « Annuler » du déplacement, lui, la remet là d'où elle vient, et nulle part ailleurs.
    d.annuler()
    expect(genres()).toEqual([['document', 'note'], []])
    expect([accueil.annuler(), prive.annuler()]).toEqual([true, false])
    expect(genres()).toEqual([['document'], []])
    espace.detruire()
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

  it('montre une toile en dossier, et de nouveau en toile, sans toucher à ce qu’elle porte', () => {
    const { espace } = monde()
    espace.magasin('projets').faire([{ type: 'creer', element: nouvelleNote(0, 0) }])
    expect(montrerEnDossier(espace, 'projets', true)).toBe(true)
    expect(espace.tableau('projets')!.dossier).toBe(true)
    expect(espace.tableau('projets')!.elements).toHaveLength(1)
    expect(montrerEnDossier(espace, 'projets', false)).toBe(true)
    expect(espace.tableau('projets')).not.toHaveProperty('dossier')
  })

  it('renomme une photo (sa légende), un lien et un fichier (leur titre)', () => {
    const { espace } = monde()
    const m = espace.magasin('projets')
    m.faire([
      { type: 'creer', element: { id: 'photo', x: 0, y: 0, largeur: 10, contenu: { type: 'image', fichier: 'f', legende: '' } } as Element },
      { type: 'creer', element: { id: 'site', x: 0, y: 10, largeur: 10, contenu: { type: 'lien', url: 'https://exemple.fr' } } as Element },
      { type: 'creer', element: { id: 'pdf', x: 0, y: 20, largeur: 10, contenu: { type: 'fichier', fichier: 'g', nom: 'a.pdf' } } as unknown as Element },
    ])
    renommerChose(espace, { toile: 'projets', element: 'photo' }, 'Le port')
    renommerChose(espace, { toile: 'projets', element: 'site' }, 'L’hôtel')
    renommerChose(espace, { toile: 'projets', element: 'pdf' }, 'Billets')
    const contenu = (id: string) => m.lire().elements.find((e) => e.id === id)!.contenu
    expect(contenu('photo')).toMatchObject({ legende: 'Le port' })
    expect(contenu('site')).toMatchObject({ titre: 'L’hôtel', url: 'https://exemple.fr' })
    expect(contenu('pdf')).toMatchObject({ titre: 'Billets', nom: 'a.pdf' })
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
