import { describe, expect, it } from 'vitest'
import { type DroitsTableau, carteIntacte, garderLesGeneres, gesteSurElement, pasPermis, permis, peutSupprimerMessage, sansCaches } from './droitsElements'
import { creerMagasin } from './magasin'
import { type Element, type Tableau, auPremierPlan } from './tableau'

const message = (id: string, auteur: string, texte: string, reactions?: Record<string, string[]>) => ({
  id,
  auteur: { id: auteur, nom: auteur },
  date: 1,
  texte,
  ...(reactions ? { reactions } : {}),
})
const fil = (id: string, messages: unknown[], extra: object = {}) => ({ id, x: 0, y: 0, largeur: 300, contenu: { type: 'commentaire', messages }, ...extra })
const note = (id: string, extra: object = {}) => ({ id, x: 0, y: 0, largeur: 200, contenu: { type: 'note', texte: { type: 'doc', content: [] } }, ...extra })

describe('gesteSurElement', () => {
  it('créer un fil, y répondre, le déplacer : commenter suffit', () => {
    expect(gesteSurElement(undefined, fil('f', [message('m1', 'bob', 'Salut')]), 'bob')).toBe('commentaire')
    const avant = fil('f', [message('m1', 'ana', 'Une question')])
    expect(gesteSurElement(avant, fil('f', [message('m1', 'ana', 'Une question'), message('m2', 'bob', 'Réponse')]), 'bob')).toBe('commentaire')
    expect(gesteSurElement(avant, { ...avant, x: 40 }, 'bob')).toBe('commentaire')
  })

  it('changer ou effacer le message d’un autre, ou écrire au nom d’un autre : il faut écrire', () => {
    const avant = fil('f', [message('m1', 'ana', 'Une question')])
    expect(gesteSurElement(avant, fil('f', [message('m1', 'ana', 'Autre chose')]), 'bob')).toBe('ecriture')
    expect(gesteSurElement(avant, fil('f', []), 'bob')).toBe('ecriture')
    expect(gesteSurElement(avant, undefined, 'bob')).toBe('ecriture')
    expect(gesteSurElement(undefined, fil('f', [message('m1', 'ana', 'Faux')]), 'bob')).toBe('ecriture')
  })

  it('réagir pour soi passe, retirer la réaction d’un autre non', () => {
    const avant = fil('f', [message('m1', 'ana', 'Q', { '👍': ['ana'] })])
    expect(gesteSurElement(avant, fil('f', [message('m1', 'ana', 'Q', { '👍': ['ana', 'bob'] })]), 'bob')).toBe('commentaire')
    expect(gesteSurElement(avant, fil('f', [message('m1', 'ana', 'Q', { '👍': [] })]), 'bob')).toBe('ecriture')
  })

  it('sur une carte mentale, le fil d’un sujet relève du commentaire, ses sujets de l’écriture', () => {
    const carte = (extra: object = {}) => ({ id: 'c', x: 0, y: 0, largeur: 300, contenu: { type: 'arbre', sujets: { s1: { titre: 'Central' } }, ...extra } })
    const fils = (messages: unknown[]) => ({ fils: { s1: { type: 'commentaire', messages } } })
    expect(gesteSurElement(carte(), carte(fils([message('m1', 'bob', 'Ici ?')])), 'bob')).toBe('commentaire')
    expect(gesteSurElement(carte(fils([message('m1', 'ana', 'Q')])), carte(fils([message('m1', 'ana', 'Q'), message('m2', 'bob', 'R')])), 'bob')).toBe('commentaire')
    expect(gesteSurElement(carte(fils([message('m1', 'ana', 'Q')])), carte(fils([message('m1', 'ana', 'Volé')])), 'bob')).toBe('ecriture')
    expect(gesteSurElement(carte(), { ...carte(), contenu: { type: 'arbre', sujets: { s1: { titre: 'Renommé' } } } }, 'bob')).toBe('ecriture')
  })

  it('sur un autre élément, seuls son fil et ses réactions relèvent du commentaire', () => {
    const avant = note('n')
    expect(gesteSurElement(avant, note('n', { commentaire: { type: 'commentaire', messages: [message('m1', 'bob', 'Ici ?')] } }), 'bob')).toBe('commentaire')
    expect(gesteSurElement(avant, note('n', { reactions: { '🎉': ['bob'] } }), 'bob')).toBe('commentaire')
    expect(gesteSurElement(avant, note('n', { x: 10 }), 'bob')).toBe('ecriture')
    expect(gesteSurElement(avant, undefined, 'bob')).toBe('ecriture')
    expect(gesteSurElement(undefined, note('n'), 'bob')).toBe('ecriture')
  })
})

describe('permis', () => {
  const droits = (role: DroitsTableau['role'], elements: DroitsTableau['elements'] = {}): DroitsTableau => ({ role, elements })
  it('le rôle sur le tableau vaut pour les éléments sans droits propres', () => {
    expect(permis(droits('commentaire'), 'x', 'commentaire')).toBe(true)
    expect(permis(droits('commentaire'), 'x', 'ecriture')).toBe(false)
    expect(permis(droits('lecture'), 'x', 'commentaire')).toBe(false)
    expect(permis(droits('edition'), null, 'ecriture')).toBe(true)
    expect(permis(droits('commentaire'), null, 'commentaire')).toBe(false)
  })
  it('un élément qui a ses droits les impose', () => {
    expect(permis(droits('edition', { x: { ecrire: false, commenter: true } }), 'x', 'ecriture')).toBe(false)
    expect(permis(droits('commentaire', { x: { ecrire: true, commenter: true } }), 'x', 'ecriture')).toBe(true)
  })
})

describe('peutSupprimerMessage', () => {
  const droits = (role: DroitsTableau['role'], elements: DroitsTableau['elements'] = {}): DroitsTableau => ({ role, elements })
  it('chacun supprime les siens, partout où il commente', () => {
    for (const role of ['commentaire', 'edition', 'proprietaire'] as const) expect(peutSupprimerMessage({ droits: droits(role) }, 'x', 'ana', 'ana')).toBe(true)
    expect(peutSupprimerMessage({ lectureSeule: true, droits: droits('commentaire') }, 'x', 'ana', 'ana')).toBe(true)
    expect(peutSupprimerMessage({ droits: droits('lecture') }, 'x', 'ana', 'ana')).toBe(false)
    expect(peutSupprimerMessage({ droits: droits('edition', { x: { ecrire: false, commenter: false } }) }, 'x', 'ana', 'ana')).toBe(false)
    expect(peutSupprimerMessage({ presentation: true }, 'x', 'ana', 'ana')).toBe(false)
  })
  it('celui d’un autre : le propriétaire seul, comme chez Notion ; ni l’éditeur, ni le commentateur', () => {
    expect(peutSupprimerMessage({ droits: droits('proprietaire') }, 'x', 'bob', 'ana')).toBe(true)
    expect(peutSupprimerMessage({ droits: droits('edition') }, 'x', 'bob', 'ana')).toBe(false)
    expect(peutSupprimerMessage({ lectureSeule: true, droits: droits('commentaire') }, 'x', 'bob', 'ana')).toBe(false)
  })
  it('sans droits du serveur, le tableau est à qui l’ouvre, hors lecture seule', () => {
    expect(peutSupprimerMessage({}, undefined, 'bob', 'ana')).toBe(true)
    expect(peutSupprimerMessage({ lectureSeule: true }, undefined, 'bob', 'ana')).toBe(false)
  })
})

describe('pasPermis', () => {
  const t: Tableau = { titre: 'T', elements: [note('libre'), note('fige')] as unknown as Element[] }
  const droits: DroitsTableau = { role: 'edition', elements: { fige: { ecrire: false, commenter: true } } }
  it('un geste qui touche un élément figé est refusé en entier', () => {
    expect(pasPermis(t, [{ type: 'deplacer', id: 'libre', de: [0, 0], vers: [5, 5] }], droits, 'bob')).toBe(true)
    expect(
      pasPermis(
        t,
        [
          { type: 'deplacer', id: 'libre', de: [0, 0], vers: [5, 5] },
          { type: 'deplacer', id: 'fige', de: [0, 0], vers: [5, 5] },
        ],
        droits,
        'bob',
      ),
    ).toBe(false)
  })
})

describe('la carte d’un dossier généré par un outil', () => {
  const carte = (id: string, cible: string, extra: object = {}, contenu: object = {}) =>
    ({ id, x: 0, y: 0, largeur: 10, contenu: { type: 'tableau', cible, ...contenu }, ...extra }) as unknown as Element
  const genere = (toile: string) => toile === 'clients'

  it('ne change que de place : ni corbeille, ni contenu, ni départ, ni double ; un raccourci se pose', () => {
    const c = carte('c1', 'clients')
    expect(carteIntacte(c, { ...c, x: 40, y: 12, parent: 'col', ordre: 'a1', hauteur: 3 }, genere)).toBe(true)
    expect(carteIntacte(c, { ...c, corbeille: 5 }, genere)).toBe(false)
    expect(carteIntacte(c, { ...c, nonTrie: 5 }, genere)).toBe(false)
    expect(carteIntacte(c, { ...c, verrou: true }, genere)).toBe(false)
    expect(carteIntacte(c, carte('c1', 'clients', {}, { icone: 'etoile' }), genere)).toBe(false)
    expect(carteIntacte(c, undefined, genere)).toBe(false)
    expect(carteIntacte(undefined, carte('c2', 'clients'), genere)).toBe(false)
    expect(carteIntacte(undefined, carte('r1', 'clients', {}, { raccourci: true }), genere)).toBe(true)
    // Un raccourci qui deviendrait la carte elle-même : une seconde carte.
    expect(carteIntacte(carte('r1', 'clients', {}, { raccourci: true }), carte('r1', 'clients'), genere)).toBe(false)
    // Une autre toile, une note : rien à garder.
    expect(carteIntacte(carte('c3', 'autre'), undefined, genere)).toBe(true)
    expect(carteIntacte(note('n'), undefined, genere)).toBe(true)
  })

  describe('garderLesGeneres', () => {
    const depart = (): Tableau => ({ titre: 'Accueil', elements: [carte('c1', 'clients'), note('n1') as unknown as Element] })
    const garde = () => {
      const m = creerMagasin(depart())
      const refus: string[][] = []
      return { m, g: garderLesGeneres(m, () => ({ clients: 'Silak' }), (d) => void refus.push(d)), refus }
    }
    const c1 = () => depart().elements[0]!

    it('laisse la carte bouger, et tout le reste de la toile', () => {
      const { m, g, refus } = garde()
      g.faire([{ type: 'deplacer', id: 'c1', de: [0, 0], vers: [30, 8] }])
      g.appliquerSeulement([{ type: 'deplacer', id: 'n1', de: [0, 0], vers: [2, 2] }])
      g.inscrire([{ type: 'deplacer', id: 'n1', de: [0, 0], vers: [2, 2] }])
      g.remplacer(auPremierPlan(m.lire(), ['c1']))
      g.faire([{ type: 'supprimer', element: m.lire().elements.find((e) => e.id === 'n1')! }])
      g.faire([{ type: 'creer', element: carte('r1', 'clients', {}, { raccourci: true }) }])
      expect(refus).toEqual([])
      expect(m.lire().elements.map((e) => e.id)).toEqual(['c1', 'r1'])
      expect(m.lire().elements[0]).toMatchObject({ x: 30, y: 8 })
    })

    it('refuse en entier ce qui la jetterait, la retirerait, la changerait ou la doublerait, et dit lequel', () => {
      const { m, g, refus } = garde()
      const pas = [
        [{ type: 'ranger', id: 'c1', de: { x: 0, y: 0 }, vers: { x: 0, y: 0, corbeille: 9 } }],
        [{ type: 'supprimer', element: c1() }],
        [{ type: 'contenu', id: 'c1', avant: c1().contenu, apres: { ...c1().contenu, titre: 'Autre' } }],
        [{ type: 'verrouiller', id: 'c1', de: false, vers: true }],
        [
          { type: 'deplacer', id: 'n1', de: [0, 0], vers: [5, 5] },
          { type: 'creer', element: carte('c2', 'clients', { x: 2, y: 2 }) },
        ],
      ] as const
      for (const p of pas) g.faire([...p] as never)
      g.corriger([{ type: 'supprimer', element: c1() }])
      // Inscrire refait le geste depuis son début : une copie qu'il porterait se refuse aussi.
      g.inscrire([{ type: 'creer', element: carte('c3', 'clients') }])
      g.remplacer({ ...m.lire(), elements: m.lire().elements.filter((e) => e.id !== 'c1') })
      expect(refus).toHaveLength(pas.length + 3)
      expect(refus.every((d) => d.length === 1 && d[0] === 'clients')).toBe(true)
      expect(m.lire()).toEqual(depart())
    })

    it('un geste refusé ne fait pas non plus ce qu’il ferait hors du document ; un geste permis le fait', () => {
      const { g } = garde()
      const faits: string[] = []
      const hors = (nom: string) => ({ faire: () => void faits.push(nom), defaire: () => {} })
      g.faire([{ type: 'supprimer', element: c1() }], hors('refusé'))
      g.faire([{ type: 'deplacer', id: 'n1', de: [0, 0], vers: [5, 5] }], hors('permis'))
      expect(faits).toEqual(['permis'])
    })
  })
})

describe('sansCaches', () => {
  const ligne = (id: string, de: string, vers: string) => ({ id, x: 0, y: 0, largeur: 1, contenu: { type: 'ligne', depart: { element: de }, arrivee: { element: vers } } })
  const carte = (id: string, cible: string) => ({ id, x: 0, y: 0, largeur: 10, contenu: { type: 'tableau', cible } })
  const depart = (): Tableau => ({ titre: 'Accueil', elements: [note('n'), carte('privee', 'compta'), ligne('l', 'n', 'privee'), ligne('l2', 'n', 'n')] as unknown as Element[] })

  it('la toile ne voit ni la carte d’une toile qu’on ne lit pas, ni les lignes qui y tiennent ; le reste passe', () => {
    const m = sansCaches(creerMagasin(depart()), new Set(['privee']))
    expect(m.lire().elements.map((e) => e.id)).toEqual(['n', 'l2'])
    m.faire([{ type: 'deplacer', id: 'n', de: [0, 0], vers: [4, 4] }])
    expect(m.lire().elements.find((e) => e.id === 'n')).toMatchObject({ x: 4, y: 4 })
  })

  it('remplacer le tableau garde, dessous, ce que la toile ne voyait pas', () => {
    const brut = creerMagasin(depart())
    const m = sansCaches(brut, new Set(['privee']))
    m.remplacer({ ...m.lire(), elements: [note('neuve')] as unknown as Element[] })
    expect(brut.lire().elements.map((e) => e.id).sort()).toEqual(['l', 'neuve', 'privee'])
  })
})
