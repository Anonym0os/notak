import { describe, expect, it } from 'vitest'
import { appliquerGeste } from './gestes'
import { ajouterEnfant, lire, nouvelArbre } from './sujets'
import { poserDiapo, poserPitch } from './pitch'
import { titreNeuf } from './titres'

describe('les réglages de diapositives dans la carte', () => {
  const [a, p] = ajouterEnfant(nouvelArbre('C'), lire(nouvelArbre('C')).central, 'P')

  it('un réglage se pose sur les sujets choisis, et Auto (null) le retire avec son champ', () => {
    const b = poserDiapo(a, [p], { sujet: 'masque', livraison: 'tout' })
    expect(b.sujets[p]!.diapo).toEqual({ sujet: 'masque', livraison: 'tout' })
    const c = poserDiapo(b, [p], { sujet: null })
    expect(c.sujets[p]!.diapo).toEqual({ livraison: 'tout' })
    // Plus aucun réglage : plus de champ du tout.
    expect('diapo' in poserDiapo(c, [p], { livraison: null }).sujets[p]!).toBe(false)
  })

  it('le thème et le rapport sont ceux de la carte ; le thème sombre et le rapport automatique n’écrivent rien', () => {
    const b = poserPitch(a, { theme: 'innocence', ratio: '4:3' })
    expect(b.pitch).toEqual({ theme: 'innocence', ratio: '4:3' })
    expect(poserPitch(b, { ratio: null }).pitch).toEqual({ theme: 'innocence' })
    expect('pitch' in poserPitch(poserPitch(b, { ratio: null }), { theme: 'default' })).toBe(false)
  })

  it('passe par les gestes de la carte, et ne touche pas le reste', () => {
    const r = appliquerGeste(a, { type: 'diapo', ids: [p], reglage: { image: 'fond' } }, titreNeuf)
    expect(r?.arbre.sujets[p]!.diapo).toEqual({ image: 'fond' })
    expect(r?.arbre.sujets[p]!.titre).toBe('P')
    expect(appliquerGeste(a, { type: 'pitch', reglage: { theme: 'hand-drawn' } }, titreNeuf)?.arbre.pitch).toEqual({ theme: 'hand-drawn' })
  })
})
