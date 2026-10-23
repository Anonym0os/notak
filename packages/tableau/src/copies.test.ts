import { describe, expect, it } from 'vitest'
import { copieDuContenu, versLesNonTries } from './EspaceNotak'
import { type Element, nouvelleColonne, nouvelleNote, nonTriesDe, surLeTableau } from './coeur/tableau'

describe('ranger dans les non triés', () => {
  const a = { ...nouvelleNote(40, 40, 'a'), parent: undefined }
  const b = nouvelleNote(60, 90, 'b')
  const ligne: Element = { id: 'l', x: 0, y: 0, largeur: 1, contenu: { type: 'ligne', depart: { element: a.id }, arrivee: { element: b.id } } as never }

  it('les cartes entrent dans l’ordre, sans place sur la toile, sans les lignes', () => {
    const vides = { titre: 'T', elements: [] }
    const venues = versLesNonTries(vides, [a, b, ligne], 1000)
    expect(venues).toHaveLength(2)
    expect(venues.map((e) => e.nonTrie)).toEqual([1000, 1001])
    expect(venues.every((e) => e.x === 0 && e.y === 0 && e.id !== a.id && e.id !== b.id)).toBe(true)
    expect(nonTriesDe({ ...vides, elements: venues })).toHaveLength(2)
    expect(surLeTableau({ ...vides, elements: venues })).toHaveLength(0)
  })

  it('arrivent après ce qui attend déjà', () => {
    const attend = { ...nouvelleNote(0, 0, 'x'), nonTrie: 5000 }
    const venues = versLesNonTries({ titre: 'T', elements: [attend] }, [a], 1000)
    expect(venues[0]!.nonTrie).toBe(5001)
  })
})

describe('copier le contenu d’un tableau', () => {
  it('identifiants neufs, lignes recâblées, verrou et non triés gardés, corbeille laissée', () => {
    const a = { ...nouvelleNote(1, 2, 'a'), verrou: true }
    const b = { ...nouvelleNote(5, 6, 'b'), nonTrie: 12 }
    const jetee = { ...nouvelleNote(0, 0, 'jetée'), corbeille: 3 }
    const colonne = nouvelleColonne(10, 10, 'C')
    const dedans = { ...nouvelleNote(0, 0, 'd'), parent: colonne.id, ordre: 'm' }
    const ligne: Element = { id: 'l', x: 0, y: 0, largeur: 1, contenu: { type: 'ligne', depart: { element: a.id }, arrivee: { element: colonne.id } } as never }
    const copie = copieDuContenu([a, b, jetee, colonne, dedans, ligne])
    expect(copie).toHaveLength(5)
    const ids = new Set([a.id, b.id, colonne.id, dedans.id, 'l'])
    expect(copie.every((e) => !ids.has(e.id))).toBe(true)
    expect(copie[0]).toMatchObject({ x: 1, y: 2, verrou: true })
    expect(copie[1]!.nonTrie).toBe(12)
    expect(copie[3]!.parent).toBe(copie[2]!.id)
    const l = copie[4]!.contenu as { depart: { element: string }; arrivee: { element: string } }
    expect([l.depart.element, l.arrivee.element]).toEqual([copie[0]!.id, copie[2]!.id])
  })
})
