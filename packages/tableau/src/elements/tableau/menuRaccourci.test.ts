import { describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Element, RenvoiTableau } from '../../coeur/tableau'
import '../index'
import { toutesLesEntreesMenu } from '../registre'
import type { ContexteToile, Services } from '../types'
import { montrerDemande } from './montrer'

const carte = (id: string, contenu: Partial<RenvoiTableau> = {}): Element<RenvoiTableau> => ({
  id,
  x: 0,
  y: 0,
  largeur: 10,
  contenu: { type: 'tableau', cible: 'T2', ...contenu },
})

const entree = (nom: string) => toutesLesEntreesMenu().find((e) => e.libelle === nom)!

function monde(services: Partial<Services>, elements: Element[]) {
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements })
  const montres: string[] = []
  const contexte = { magasin, services, montrer: (id: string) => void montres.push(id), choisir: () => {} } as unknown as ContexteToile
  return { magasin, contexte, montres }
}

describe('« Retrouver la toile d’origine »', () => {
  const retrouver = entree('Retrouver la toile d’origine')
  const raccourci = carte('r', { raccourci: true })

  it('ne sert que pour un raccourci seul', () => {
    const { contexte } = monde({ retrouverOriginal: () => undefined }, [raccourci])
    expect(retrouver.visible([raccourci], contexte)).toBe(true)
    expect(retrouver.visible([carte('x')], contexte)).toBe(false)
    expect(retrouver.visible([raccourci, raccourci], contexte)).toBe(false)
  })

  it('l’original est sur ce tableau : on le montre', () => {
    const original = carte('o')
    const { contexte, montres } = monde({ retrouverOriginal: () => ({ tableau: 'ici', element: 'o' }) }, [raccourci, original])
    retrouver.faire([raccourci], contexte)
    expect(montres).toEqual(['o'])
  })

  it('l’original est dans un autre tableau : on l’ouvre, et la carte se montrera à l’arrivée', () => {
    const ouverts: string[] = []
    const { contexte, montres } = monde({ retrouverOriginal: () => ({ tableau: 'ailleurs', element: 'o' }), ouvrirTableau: (id) => void ouverts.push(id) }, [raccourci])
    retrouver.faire([raccourci], contexte)
    expect(ouverts).toEqual(['ailleurs'])
    expect(montres).toEqual([])
    expect(montrerDemande()).toBe('o')
  })
})

describe('« Dupliquer la toile liée »', () => {
  const dupliquer = entree('Dupliquer la toile liée')

  it('le raccourci devient un vrai tableau : la copie, avec le nom et la couleur du raccourci', () => {
    const r = carte('r', { raccourci: true, titre: 'Mon nom', couleur: 'rouge', icone: 'livre' })
    const noms: [string, string][] = []
    const teintes: [string, string][] = []
    const { contexte, magasin } = monde(
      {
        dupliquerTableau: () => 'T3',
        renommerTableau: (id, titre) => void noms.push([id, titre]),
        colorerTableau: (id, couleur) => void teintes.push([id, couleur]),
        tableau: () => undefined,
      },
      [r],
    )
    expect(dupliquer.visible([r], contexte)).toBe(true)
    dupliquer.faire([r], contexte)
    expect(magasin.lire().elements[0]!.contenu).toEqual({ type: 'tableau', cible: 'T3', icone: 'livre' })
    expect(noms).toEqual([['T3', 'Mon nom']])
    expect(teintes).toEqual([['T3', 'rouge']])
    magasin.annuler()
    expect(magasin.lire().elements[0]!.contenu).toEqual(r.contenu)
  })

  it('n’est pas proposé pour un tableau ordinaire ni en lecture seule', () => {
    const { contexte } = monde({ dupliquerTableau: () => 'T3' }, [])
    expect(dupliquer.visible([carte('x')], contexte)).toBe(false)
    const { contexte: lecture } = monde({ dupliquerTableau: () => 'T3', lectureSeule: true }, [])
    expect(dupliquer.visible([carte('r', { raccourci: true })], lecture)).toBe(false)
  })
})
