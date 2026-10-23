// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { viserAilleurs } from './glisse'

const carte = (type: string, attrs: Record<string, string> = {}, avecListe = true) => {
  const c = document.createElement('div')
  c.className = 'notak-carte'
  c.dataset.type = type
  for (const [k, v] of Object.entries(attrs)) c.dataset[k] = v
  if (avecListe) {
    const l = document.createElement('div')
    l.className = 'notak-taches'
    c.append(l)
  }
  return c
}
const toile = () => Object.assign(document.createElement('div'), { className: 'notak-toile' })

describe('viserAilleurs', () => {
  it('sa propre carte : on reste dans la liste', () => {
    const moi = carte('taches')
    expect(viserAilleurs([moi, toile()], moi)).toEqual({ genre: 'ici' })
  })

  it('une autre liste de tâches reçoit la tâche', () => {
    const autre = carte('taches', { id: 'T2' })
    const v = viserAilleurs([autre, toile()], carte('taches'))
    expect(v.genre).toBe('liste')
    expect(v.genre === 'liste' && v.carte).toBe(autre)
  })

  it('une liste en édition, verrouillée, ou un autre type : rien', () => {
    const moi = carte('taches')
    expect(viserAilleurs([carte('taches', { edition: '' }), toile()], moi).genre).toBe('rien')
    expect(viserAilleurs([carte('taches', { verrou: '' }), toile()], moi).genre).toBe('rien')
    expect(viserAilleurs([carte('note', {}, false), toile()], moi).genre).toBe('rien')
  })

  it('le vide de la toile : une nouvelle liste', () => {
    expect(viserAilleurs([toile()], carte('taches')).genre).toBe('toile')
  })

  it('hors de la toile : rien', () => {
    expect(viserAilleurs([document.body], carte('taches')).genre).toBe('rien')
  })
})
