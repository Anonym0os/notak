// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { capacites, releveEnTexte, releverStylet } from './diagnostic'

describe('les capacités relevées', () => {
  it('dit ce qui est là et ce qu’on attend sur iOS', () => {
    const c = capacites({
      isSecureContext: true,
      crypto: { subtle: {} },
      indexedDB: {},
      BroadcastChannel: class {},
      navigator: { locks: {}, share: () => {}, canShare: () => true, clipboard: { read: () => {}, writeText: () => {} }, storage: { estimate: () => {} } },
      visualViewport: {},
      PointerEvent: { prototype: { getCoalescedEvents: () => [], getPredictedEvents: () => [] } },
    })
    const par = Object.fromEntries(c.map((x) => [x.nom, x]))
    expect(par['isSecureContext']).toMatchObject({ present: true, attenduSurIos: 'present' })
    expect(par['navigator.canShare({ files })']?.present).toBe(true)
    expect(par['showSaveFilePicker']).toMatchObject({ present: false, attenduSurIos: 'absent' })
    expect(par['serviceWorker']?.present).toBe(false)
    expect(par['PointerEvent.altitudeAngle']?.present).toBe(false)
  })

  it('une fenêtre vide : rien de présent, sans exception', () => {
    expect(capacites({}).every((c) => !c.present)).toBe(true)
  })
})

describe('le relevé du stylet', () => {
  it('arrondit, compte les points groupés et prédits, et reconnaît le survol du Pencil', () => {
    const r = releverStylet({
      type: 'pointermove',
      pointerType: 'pen',
      pressure: 0.33333,
      tiltX: 12.4,
      tiltY: -3.6,
      altitudeAngle: 1.2345678,
      buttons: 1,
      getCoalescedEvents: () => [1, 2, 3],
      getPredictedEvents: () => [1],
    })
    expect(r).toMatchObject({ type: 'pen', pression: 0.333, inclinaisonX: 12, inclinaisonY: -4, altitude: 1.235, azimut: null, groupes: 3, predits: 1, survol: false })
    expect(releverStylet({ type: 'pointermove', pointerType: 'pen', pressure: 0, tiltX: 0, tiltY: 0, buttons: 0 }).survol).toBe(true)
    expect(releverStylet({ type: 'pointermove', pointerType: 'touch', pressure: 0, tiltX: 0, tiltY: 0, buttons: 0 }).survol).toBe(false)
  })
})

describe('le relevé en texte', () => {
  it('est du JSON lisible, avec les capacités à plat', () => {
    const texte = releveEnTexte({ plateforme: 'ios', idiome: 'tablette', agent: 'ua', infos: null, capacites: capacites({ isSecureContext: true }), stylet: null, stockage: { usage: 1 } })
    const lu = JSON.parse(texte)
    expect(lu.capacites.isSecureContext).toBe(true)
    expect(lu.stockage).toEqual({ usage: 1 })
  })
})
