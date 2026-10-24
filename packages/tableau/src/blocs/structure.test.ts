import { describe, expect, it } from 'vitest'
import { finDuSousArbre, numeroter, structurer } from './structure'

const l = (type: string, retrait = 0, plus: { ouvert?: boolean; depliant?: boolean } = {}) => ({ type, retrait, ...plus })

describe('NOTION.md § 1 : les blocs à plat, rangés par leur retrait', () => {
  it('le parent est le dernier bloc moins en retrait au-dessus ; un cran sauté est ramené', () => {
    const places = structurer([l('paragraph'), l('puce', 1), l('puce', 3), l('paragraph', 0)])
    expect(places.map((p) => [p.profondeur, p.parent])).toEqual([[0, null], [1, 0], [2, 1], [0, null]])
    expect(finDuSousArbre(places, 0)).toBe(3)
    expect(places[0]!.aEnfants).toBe(true)
  })

  it('la numérotation suit les frères numérotés, repart après un autre bloc, et change de forme en profondeur', () => {
    const places = structurer([l('numero'), l('numero'), l('numero', 1), l('numero', 1), l('numero'), l('paragraph'), l('numero')])
    expect(places.map((p) => p.numero)).toEqual(['1.', '2.', 'a.', 'b.', '3.', null, '1.'])
    expect(numeroter(4, 2)).toBe('iv.')
    expect(numeroter(28, 1)).toBe('ab.')
  })

  it('un dépliant fermé cache ses enfants, pas ses frères', () => {
    const places = structurer([l('depliant', 0, { ouvert: false }), l('paragraph', 1), l('puce', 2), l('paragraph')])
    expect(places.map((p) => p.cache)).toEqual([false, true, true, false])
    const titre = structurer([l('heading', 0, { depliant: true, ouvert: false }), l('paragraph', 1)])
    expect(titre[1]!.cache).toBe(true)
  })

  it('les enfants d’un encadré et d’une citation restent dans leur cadre', () => {
    const places = structurer([l('encadreBloc'), l('paragraph', 1), l('puce', 2), l('paragraph'), l('citation'), l('paragraph', 1)])
    expect(places.map((p) => p.encadre)).toEqual([null, 0, 0, null, null, null])
    expect(places.map((p) => p.finEncadre)).toEqual([false, false, true, false, false, false])
    expect(places[5]!.citation).toBe(4)
  })
})
