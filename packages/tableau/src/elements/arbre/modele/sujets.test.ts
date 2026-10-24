import { describe, expect, it } from 'vitest'
import type { Arbre, Id } from '../../../coeur/tableau'
import {
  ajouterEnfant,
  ajouterFlottant,
  ajouterFrere,
  ajouterParent,
  carteNeuve,
  basculerRepli,
  deplierJusquA,
  detacher,
  dupliquer,
  echanger,
  enfantsDe,
  lire,
  nouvelArbre,
  rattacher,
  supprimerBranches,
  supprimerSeul,
  toutReplier,
} from './sujets'

/** Une carte : central → A (A1, A2), B. */
function exemple(): { a: Arbre; c: Id; A: Id; A1: Id; A2: Id; B: Id } {
  let a = nouvelArbre('C')
  const c = lire(a).central
  let A: Id, A1: Id, A2: Id, B: Id
  ;[a, A] = ajouterEnfant(a, c, 'A')
  ;[a, B] = ajouterEnfant(a, c, 'B')
  ;[a, A1] = ajouterEnfant(a, A, 'A1')
  ;[a, A2] = ajouterEnfant(a, A, 'A2')
  return { a, c, A, A1, A2, B }
}

const titres = (a: Arbre, id: Id) => enfantsDe(lire(a), id).map((x) => a.sujets[x]!.titre)

describe('la carte lue comme un arbre', () => {
  it('range les enfants par leur clé', () => {
    const { a, c, A } = exemple()
    expect(titres(a, c)).toEqual(['A', 'B'])
    expect(titres(a, A)).toEqual(['A1', 'A2'])
  })

  it('écarte un sujet dont le parent manque, et un sujet mal formé', () => {
    const { a, c } = exemple()
    const abime: Arbre = { ...a, sujets: { ...a.sujets, x: { parent: 'disparu', ordre: 'V', titre: 'orphelin' }, y: { ordre: 3 } as never } }
    const l = lire(abime)
    expect(l.central).toBe(c)
    expect(l.sujets.has('x')).toBe(false)
    expect(l.sujets.has('y')).toBe(false)
  })
})

describe('les gestes', () => {
  it('Entrée crée un frère juste après, Maj+Entrée juste avant', () => {
    const { a, A, A1 } = exemple()
    const [b] = ajouterFrere(a, A1, 'après')
    expect(titres(b, A)).toEqual(['A1', 'après', 'A2'])
    const [d] = ajouterFrere(a, A1, 'avant', true)
    expect(titres(d, A)).toEqual(['avant', 'A1', 'A2'])
  })

  it('Entrée sur le central crée un enfant', () => {
    const { a, c } = exemple()
    const [b] = ajouterFrere(a, c, 'D')
    expect(titres(b, c)).toEqual(['A', 'B', 'D'])
  })

  it('Cmd+Entrée intercale un parent à la place du sujet', () => {
    const { a, c, A } = exemple()
    const [b, p] = ajouterParent(a, A, 'P')
    expect(titres(b, c)).toEqual(['P', 'B'])
    expect(titres(b, p!)).toEqual(['A'])
    expect(ajouterParent(a, c, 'P')[1]).toBeNull()
  })

  it('supprimer une branche emporte ses descendants, jamais le central', () => {
    const { a, c, A, A1 } = exemple()
    const b = supprimerBranches(a, [A, c])
    expect(b.sujets[A]).toBeUndefined()
    expect(b.sujets[A1]).toBeUndefined()
    expect(b.sujets[c]).toBeDefined()
  })

  it('supprimer le sujet seul remonte ses enfants à sa place', () => {
    const { a, c, A } = exemple()
    expect(titres(supprimerSeul(a, A), c)).toEqual(['A1', 'A2', 'B'])
  })

  it('replier, tout replier, déplier jusqu’au niveau N', () => {
    const { a, c, A, B } = exemple()
    expect(basculerRepli(a, A).sujets[A]!.replie).toBe(true)
    expect(basculerRepli(a, B)).toBe(a)
    expect(toutReplier(a, true).sujets[A]!.replie).toBe(true)
    expect(toutReplier(toutReplier(a, true), false).sujets[A]!.replie).toBeUndefined()
    const n1 = deplierJusquA(a, 1)
    expect(n1.sujets[A]!.replie).toBe(true)
    expect(n1.sujets[c]!.replie).toBeUndefined()
  })

  it('échanger avec un frère', () => {
    const { a, A, A1 } = exemple()
    expect(titres(echanger(a, A1, 1), A)).toEqual(['A2', 'A1'])
    expect(echanger(a, A1, -1)).toBe(a)
  })

  it('dupliquer copie la branche juste après elle', () => {
    const { a, c, A } = exemple()
    const [b, copie] = dupliquer(a, A)
    expect(titres(b, c)).toEqual(['A', 'A', 'B'])
    expect(titres(b, copie!)).toEqual(['A1', 'A2'])
  })

  it('rattacher refuse de faire d’un sujet l’enfant de son descendant', () => {
    const { a, c, A, A1, B } = exemple()
    expect(rattacher(a, A, A1, 0)).toBe(a)
    expect(titres(rattacher(a, B, A, 0), A)).toEqual(['B', 'A1', 'A2'])
    expect(titres(rattacher(a, B, A, 0), c)).toEqual(['A'])
  })

  it('un flottant vit à part, et garde ses enfants', () => {
    const { a, c, B } = exemple()
    const [b, f] = ajouterFlottant(a, { x: 300, y: 0 }, 'F')
    const l = lire(b)
    expect(l.flottants).toEqual([f])
    expect(enfantsDe(l, c)).not.toContain(f)
    const d = detacher(b, B, { x: -200, y: 50 })
    expect(lire(d).flottants).toHaveLength(2)
    expect(enfantsDe(lire(d), c)).not.toContain(B)
  })
})

describe('une carte neuve', () => {
  it('se crée au squelette de Xmind ; la carte nue (nouvelArbre) n’en a pas', () => {
    expect(carteNeuve('Idée').squelette).toBe('carte-1')
    expect(lire(carteNeuve('Idée')).sujets.size).toBe(1)
    expect(nouvelArbre('Idée').squelette).toBeUndefined()
  })
})
