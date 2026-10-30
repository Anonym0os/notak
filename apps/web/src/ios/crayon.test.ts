import { EVENEMENT_DOUBLE_TOUCHER } from '@notak/tableau'
import { describe, expect, it } from 'vitest'
import { actionDoubleToucher, relayerDoubleToucher } from './crayon'

describe('le double toucher du Pencil', () => {
  it('reconnaît les actions de la coque, et rien d’autre', () => {
    expect(actionDoubleToucher({ action: 'gomme' })).toBe('gomme')
    expect(actionDoubleToucher({ action: 'precedent' })).toBe('precedent')
    expect(actionDoubleToucher({ action: 'raccourci' })).toBeNull()
    expect(actionDoubleToucher(null)).toBeNull()
    expect(actionDoubleToucher('gomme')).toBeNull()
  })
  it('relaie une action connue à la fenêtre, et seulement elle', () => {
    const recus: Event[] = []
    const fenetre = new EventTarget()
    fenetre.addEventListener(EVENEMENT_DOUBLE_TOUCHER, (e) => recus.push(e))
    relayerDoubleToucher(fenetre, { action: 'couleurs' })
    relayerDoubleToucher(fenetre, { action: 'inconnue' })
    expect(recus.map((e) => (e as CustomEvent).detail)).toEqual(['couleurs'])
  })
})
