import { describe, expect, it } from 'vitest'
import { POLICES, POLICES_CJK, RECENTES_GARDEES, RECENTES_MONTREES, polices, recentePolice } from './polices'

describe('les polices de l’onglet Carte', () => {
  it('chaque police a un nom et une pile qui le cite', () => {
    for (const p of [...POLICES, ...POLICES_CJK]) {
      expect(p.nom).toBeTruthy()
      expect(p.pile).toContain(`"${p.nom}"`)
    }
    expect(new Set(POLICES.map((p) => p.nom)).size).toBe(POLICES.length)
  })

  it('la liste CJK n’a que des polices CJK, la latine aucune', () => {
    expect(POLICES_CJK.map((p) => p.nom)).toContain('PingFang SC')
    expect(POLICES.map((p) => p.nom)).not.toContain('PingFang SC')
  })

  it('en tête de liste : les récentes (hors la courante) puis la courante', () => {
    const r = polices(POLICES, ['Georgia', 'Verdana', 'Inconnue', 'Arial'], 'Verdana')
    expect(r.recentes.map((p) => p.nom)).toEqual(['Georgia', 'Arial', 'Verdana'])
    expect(r.toutes).toBe(POLICES)
  })

  it('sans choix déjà fait, pas de bloc de récentes', () => {
    expect(polices(POLICES, [], undefined).recentes).toEqual([])
  })

  it('six récentes au plus sont montrées, dix gardées, la plus récente en tête', () => {
    const noms = POLICES.map((p) => p.nom)
    expect(polices(POLICES, noms, undefined).recentes).toHaveLength(RECENTES_MONTREES)
    let r: string[] = []
    for (const n of noms) r = recentePolice(r, n)
    expect(r).toHaveLength(RECENTES_GARDEES)
    expect(r[0]).toBe(noms.at(-1))
    expect(recentePolice(['A', 'B'], 'B')).toEqual(['B', 'A'])
  })
})
