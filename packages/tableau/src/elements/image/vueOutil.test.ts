import { describe, expect, test } from 'vitest'
import { PX_PAR_UG, versEcran } from '../../coeur/camera'
import { point } from '../../coeur/geometrie'
import { type Boite, cameraPourVoir } from './vueOutil'

const zone: Boite = { gauche: 80, haut: 80, droite: 1000, bas: 640 }
const camera = { origine: point(0, 0), echelle: 1 }

describe('amener la carte d’un outil à l’écran', () => {
  test('une carte déjà dans la zone ne fait rien bouger', () => {
    expect(cameraPourVoir(camera, { gauche: 100, haut: 100, droite: 400, bas: 300 }, zone, true)).toBeNull()
  })

  test('une carte qui sort de l’écran vient au milieu de la zone, sans changer d’échelle si elle y tient', () => {
    const carte = { gauche: 700, haut: 500, droite: 1100, bas: 800 }
    const c = cameraPourVoir(camera, carte, zone, true)!
    expect(c.echelle).toBe(1)
    // Le centre de la carte, sur le tableau, tombe au centre de la zone.
    const centre = point((carte.gauche + carte.droite) / 2 / PX_PAR_UG, (carte.haut + carte.bas) / 2 / PX_PAR_UG)
    const vu = versEcran(c, centre)
    expect(vu.x).toBeCloseTo((zone.gauche + zone.droite) / 2)
    expect(vu.y).toBeCloseTo((zone.haut + zone.bas) / 2)
  })

  test('une carte plus grande que la zone (photo en hauteur, toile à 300 %) fait reculer juste assez', () => {
    const grande = { echelle: 3, origine: point(10, 10) }
    const carte = { gauche: 100, haut: 50, droite: 1100, bas: 2050 }
    const c = cameraPourVoir(grande, carte, zone, true)!
    // 2000 px de haut pour 560 de zone : l'échelle est divisée d'autant.
    expect(c.echelle).toBeCloseTo((3 * 560) / 2000)
    const coin = versEcran(c, point(grande.origine.x + carte.gauche / (PX_PAR_UG * 3), grande.origine.y + carte.haut / (PX_PAR_UG * 3)))
    expect(coin.y).toBeCloseTo(zone.haut)
  })

  test('pour dessiner, un bout de l’image à l’écran suffit : on ne dézoome pas qui s’est approché exprès', () => {
    expect(cameraPourVoir(camera, { gauche: -2000, haut: -2000, droite: 300, bas: 300 }, zone, false)).toBeNull()
    expect(cameraPourVoir(camera, { gauche: 2000, haut: 100, droite: 2400, bas: 300 }, zone, false)).not.toBeNull()
  })

  test('une mesure vide ne bouge rien', () => {
    expect(cameraPourVoir(camera, { gauche: 2000, haut: 0, droite: 2000, bas: 0 }, zone, true)).toBeNull()
  })
})
