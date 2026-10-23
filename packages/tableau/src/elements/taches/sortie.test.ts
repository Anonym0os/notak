// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Element, NoeudTexte, Taches } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { operationsDeSortie } from './Taches'
import { sousTaches } from './liste'

const tache = (t: string): NoeudTexte => ({ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
const liste = (id: string, ...taches: string[]): Element<Taches> => ({
  id,
  x: 0,
  y: 0,
  largeur: 34,
  contenu: { type: 'taches', texte: { type: 'doc', content: [{ type: 'taskList', content: taches.map(tache) }] } },
})
const noms = (e: Element) => sousTaches((e.contenu as Taches).texte).map((t) => t.content![0]!.content![0]!.text)

function monde() {
  const magasin = creerMagasin({ titre: '', elements: [liste('A', 'a1', 'a2', 'a3'), liste('B', 'b1')] })
  const contexte = { magasin, services: {}, versTableau: (p: { x: number; y: number }) => ({ x: p.x / 2, y: p.y / 2 }) } as unknown as ContexteToile
  const lire = (id: string) => magasin.lire().elements.find((e) => e.id === id)!
  return { magasin, contexte, lire }
}

describe('lâcher une tâche hors de sa liste', () => {
  it('vers une autre liste : un seul pas d’annulation pour les deux', () => {
    const { magasin, contexte, lire } = monde()
    const r = operationsDeSortie(contexte, 'A', 1, { genre: 'liste', carte: 'B', vers: 0, place: 'apres' })!
    magasin.faire(r.operations)
    expect(noms(lire('A'))).toEqual(['a1', 'a3'])
    expect(noms(lire('B'))).toEqual(['b1', 'a2'])
    magasin.annuler()
    expect(noms(lire('A'))).toEqual(['a1', 'a2', 'a3'])
    expect(noms(lire('B'))).toEqual(['b1'])
  })

  it('vers la toile : une liste d’une tâche naît au point lâché, en un pas', () => {
    const { magasin, contexte, lire } = monde()
    const r = operationsDeSortie(contexte, 'A', 0, { genre: 'toile', x: 101, y: 61 })!
    magasin.faire(r.operations)
    const neuve = lire(r.nouvelle!)
    expect(noms(neuve)).toEqual(['a1'])
    expect([neuve.x, neuve.y]).toEqual([51, 31])
    expect(noms(lire('A'))).toEqual(['a2', 'a3'])
    magasin.annuler()
    expect(magasin.lire().elements).toHaveLength(2)
    expect(noms(lire('A'))).toEqual(['a1', 'a2', 'a3'])
  })

  it('refuse une cible qui n’est pas une liste, ou la liste elle-même', () => {
    const { contexte } = monde()
    expect(operationsDeSortie(contexte, 'A', 0, { genre: 'liste', carte: 'Z', vers: 0, place: 'avant' })).toBeNull()
    expect(operationsDeSortie(contexte, 'A', 0, { genre: 'liste', carte: 'A', vers: 0, place: 'avant' })).toBeNull()
    expect(operationsDeSortie(contexte, 'A', 9, { genre: 'toile', x: 0, y: 0 })).toBeNull()
  })
})

describe('lâcher une tâche dans une colonne, ou en copie', () => {
  const colonne = (): Element => ({ id: 'C', x: 100, y: 0, largeur: 34, contenu: { type: 'colonne', titre: 'Col' } })
  const rangee = (id: string, ordre: string): Element => ({ ...liste(id, 'x'), parent: 'C', ordre })

  it('dans une colonne : une liste d’une tâche naît à l’index visé, en un seul pas', () => {
    const magasin = creerMagasin({ titre: '', elements: [liste('A', 'a1', 'a2'), colonne(), rangee('R1', 'A'), rangee('R2', 'C')] })
    const contexte = { magasin, services: {}, versTableau: (p: { x: number; y: number }) => p } as unknown as ContexteToile
    const r = operationsDeSortie(contexte, 'A', 0, { genre: 'colonne', colonne: 'C', index: 1 })!
    magasin.faire(r.operations)
    const neuve = magasin.lire().elements.find((e) => e.id === r.nouvelle)!
    expect(neuve.parent).toBe('C')
    expect(neuve.ordre! > 'A' && neuve.ordre! < 'C').toBe(true)
    expect(noms(neuve)).toEqual(['a1'])
    expect(noms(magasin.lire().elements.find((e) => e.id === 'A')!)).toEqual(['a2'])
    magasin.annuler()
    expect(magasin.lire().elements).toHaveLength(4)
  })

  it('une colonne qui n’existe pas : rien', () => {
    const { contexte } = monde()
    expect(operationsDeSortie(contexte, 'A', 0, { genre: 'colonne', colonne: 'Z', index: 0 })).toBeNull()
  })

  it('en copie, la liste d’origine ne perd rien : vers une autre liste, la toile, une colonne', () => {
    const { magasin, contexte, lire } = monde()
    const vers = operationsDeSortie(contexte, 'A', 1, { genre: 'liste', carte: 'B', vers: 0, place: 'apres' }, true)!
    expect(vers.operations).toHaveLength(1)
    magasin.faire(vers.operations)
    expect(noms(lire('A'))).toEqual(['a1', 'a2', 'a3'])
    expect(noms(lire('B'))).toEqual(['b1', 'a2'])
    const toile = operationsDeSortie(contexte, 'A', 0, { genre: 'toile', x: 20, y: 20 }, true)!
    expect(toile.operations.map((o) => o.type)).toEqual(['creer'])
  })

  it('« dans » une tâche de l’autre liste en fait une sous-tâche', () => {
    const { magasin, contexte, lire } = monde()
    magasin.faire(operationsDeSortie(contexte, 'A', 2, { genre: 'liste', carte: 'B', vers: 0, place: 'dans' })!.operations)
    expect(noms(lire('B'))).toEqual(['b1'])
    expect(sousTaches(sousTaches((lire('B').contenu as Taches).texte)[0]!).map((t) => t.content![0]!.content![0]!.text)).toEqual(['a3'])
  })
})

