import { afterEach, describe, expect, it } from 'vitest'
import { nombreDeTraitsReleves, oublierReleves, releveEnTexte, releverDebut, releverFin, releverMouvement } from './releve'
import { VERSION_EPURE } from './trace'

const pointeur = (timeStamp: number, clientX: number, clientY: number, pressure: number, groupes: PointerEvent[] = []) =>
  ({ timeStamp, clientX, clientY, pressure, pointerType: 'pen', getCoalescedEvents: () => groupes, getPredictedEvents: () => [] }) as unknown as PointerEvent
const couche = { getBoundingClientRect: () => ({ left: 10, top: 20 }) }
const vue = { echelle: 10, origine: { x: 0, y: 0 }, epaisseur: 0.4, affinage: 0.6 }

describe('le relevé des traits', () => {
  afterEach(oublierReleves)

  it('garde chaque événement et ses points groupés, relatifs à la couche et à l’appui', () => {
    releverDebut(pointeur(1000, 110, 120, 0.2), couche, vue)
    releverMouvement(pointeur(1016, 130, 120, 0.4, [pointeur(1008, 120, 120, 0.3), pointeur(1016, 130, 120, 0.4)]))
    releverFin(pointeur(1020, 131, 120, 0), { points: [10, 10, 12, 10], couleur: '#000000', epaisseur: 0.4 })
    const r = JSON.parse(releveEnTexte())
    expect(r.epure).toBe(VERSION_EPURE)
    const [t] = r.traits
    expect(t.evenements.map((e: { k: string }) => e.k)).toEqual(['d', 'm', 'u'])
    expect(t.evenements[0]).toEqual({ k: 'd', t: 0, x: 100, y: 100, p: 0.2 })
    expect(t.evenements[1].g).toEqual([[8, 110, 100, 0.3], [16, 120, 100, 0.4]])
    expect(t.trait.points).toEqual([10, 10, 12, 10])
  })

  it('ne garde que les trois derniers traits', () => {
    for (let i = 0; i < 5; i++) {
      releverDebut(pointeur(i * 100, 0, 0, 0.5), couche, vue)
      releverFin(null)
    }
    expect(nombreDeTraitsReleves()).toBe(3)
  })
})
