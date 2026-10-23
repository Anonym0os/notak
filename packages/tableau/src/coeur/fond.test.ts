import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { CANEVAS, estLibre, estNomme, estSombre, fondParDefaut, fondRange, lireFond, pointsAllumes } from './fond'
import { creerMagasinYjs } from './magasinYjs'
import { nouvelleNote } from './tableau'

describe('arrière-plan du tableau', () => {
  it('le gris et les points sont le défaut et ne s’écrivent pas', () => {
    expect(fondRange({ couleur: 'gris', points: true })).toBeUndefined()
    expect(fondParDefaut(undefined)).toBe(true)
    expect(fondParDefaut({ couleur: 'bleu' })).toBe(false)
    expect(fondParDefaut({ points: false })).toBe(false)
    expect(pointsAllumes(undefined)).toBe(true)
    expect(pointsAllumes({ points: false })).toBe(false)
  })

  it('range une couleur nommée ou libre et refuse le reste', () => {
    expect(fondRange({ couleur: 'bleu' })).toEqual({ couleur: 'bleu' })
    expect(fondRange({ couleur: '#12ab34', points: false })).toEqual({ couleur: '#12ab34', points: false })
    expect(fondRange({ couleur: 'rouge-vif' })).toBeUndefined()
    expect(estNomme('gris')).toBe(false)
    expect(estNomme('grisChaud')).toBe(true)
    expect(estLibre('#fff')).toBe(false)
  })

  it('lit sans se fier à ce qu’un autre client a écrit', () => {
    expect(lireFond(42)).toBeUndefined()
    expect(lireFond({ couleur: { a: 1 }, points: 'non' })).toBeUndefined()
    expect(lireFond({ couleur: 'jaune', points: false })).toEqual({ couleur: 'jaune', points: false })
  })

  it('distingue un fond sombre d’un fond clair', () => {
    expect(estSombre(CANEVAS.gris.sombre)).toBe(true)
    expect(estSombre(CANEVAS.bleu.clair)).toBe(false)
    expect(estSombre('#000000')).toBe(true)
  })

  it('l’opération passe par le magasin Yjs, s’annule en miroir et arrive chez l’autre', () => {
    const [a, b] = [new Y.Doc(), new Y.Doc()]
    a.on('update', (u: Uint8Array, o: unknown) => o !== 'distant' && Y.applyUpdate(b, u, 'distant'))
    const [ma, mb] = [creerMagasinYjs(a), creerMagasinYjs(b)]
    ma.faire([{ type: 'fond', de: undefined, vers: { couleur: 'vert', points: false } }])
    expect(mb.lire().fond).toEqual({ couleur: 'vert', points: false })
    expect(mb.lire().fond).toBe(mb.lire().fond)
    ma.faire([{ type: 'fond', de: { couleur: 'vert', points: false }, vers: undefined }])
    expect(mb.lire().fond).toBeUndefined()
  })
})

describe('trace de chaque élément', () => {
  it('note qui a créé et touché, sans compter les gestes anonymes', () => {
    const moi = { id: 'm', nom: 'Samy' }
    const m = creerMagasinYjs(new Y.Doc(), undefined, { auteur: () => moi })
    const n = nouvelleNote(1, 1)
    m.faire([{ type: 'creer', element: n }])
    expect(m.trace(n.id)).toMatchObject({ par: moi, modifiePar: moi })
    m.faire([{ type: 'deplacer', id: n.id, de: [1, 1], vers: [4, 4] }])
    expect(m.trace(n.id)?.par).toBe(moi)
    const anonyme = creerMagasinYjs(new Y.Doc())
    anonyme.faire([{ type: 'creer', element: n }])
    expect(anonyme.trace(n.id)).toBeUndefined()
  })
})
