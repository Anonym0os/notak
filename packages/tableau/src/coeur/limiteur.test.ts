import { describe, expect, it } from 'vitest'
import { creerLimiteur } from './limiteur'

function horloge() {
  let t = 1000
  const taches: { a: number; f: () => void }[] = []
  return {
    maintenant: () => t,
    minuterie: (f: () => void, ms: number) => void taches.push({ a: t + ms, f }),
    avancer(ms: number) {
      t += ms
      for (const x of taches.splice(0).sort((p, q) => p.a - q.a)) x.a <= t ? x.f() : taches.push(x)
    },
  }
}

describe('limiteur', () => {
  it('envoie la première valeur tout de suite', () => {
    const h = horloge()
    const vus: number[] = []
    creerLimiteur((v: number) => vus.push(v), 100, h.maintenant, h.minuterie).pousser(1)
    expect(vus).toEqual([1])
  })

  it('regroupe les suivantes et n’envoie que la dernière', () => {
    const h = horloge()
    const vus: number[] = []
    const l = creerLimiteur((v: number) => vus.push(v), 100, h.maintenant, h.minuterie)
    l.pousser(1)
    h.avancer(30)
    l.pousser(2)
    l.pousser(3)
    expect(vus).toEqual([1])
    h.avancer(70)
    expect(vus).toEqual([1, 3])
    h.avancer(500)
    l.pousser(4)
    expect(vus).toEqual([1, 3, 4])
  })

  it('forcer envoie tout de suite et oublie l’attente', () => {
    const h = horloge()
    const vus: (number | null)[] = []
    const l = creerLimiteur((v: number | null) => vus.push(v), 100, h.maintenant, h.minuterie)
    l.pousser(1)
    l.pousser(2)
    l.forcer(null)
    h.avancer(200)
    expect(vus).toEqual([1, null])
  })
})
