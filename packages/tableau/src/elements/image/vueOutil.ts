import { type Camera, PX_PAR_UG } from '../../coeur/camera'
import { point } from '../../coeur/geometrie'

/** Un rectangle de l'écran, en pixels de la toile (son coin haut gauche à 0, 0). */
export interface Boite {
  gauche: number
  haut: number
  droite: number
  bas: number
}

const dedans = (a: Boite, b: Boite) => a.gauche >= b.gauche - 0.5 && a.haut >= b.haut - 0.5 && a.droite <= b.droite + 0.5 && a.bas <= b.bas + 0.5
const croise = (a: Boite, b: Boite) => a.gauche < b.droite && a.droite > b.gauche && a.haut < b.bas && a.bas > b.haut

/**
 * La caméra qui montre la carte d'un outil (recadrer, détourer, dessiner) dans la zone libre de l'écran, entre les
 * barres : `null` quand elle y est déjà. `entiere` : toute la carte doit y tenir (le cadre se tire par ses coins) ;
 * sinon il suffit qu'on en voie un bout (on dessine de près, zoomé exprès). On recule s'il le faut, jamais on n'avance,
 * et la carte vient au milieu de la zone.
 */
export function cameraPourVoir(camera: Camera, carte: Boite, zone: Boite, entiere: boolean): Camera | null {
  if (entiere ? dedans(carte, zone) : croise(carte, zone)) return null
  const [lc, hc] = [carte.droite - carte.gauche, carte.bas - carte.haut]
  const [lz, hz] = [zone.droite - zone.gauche, zone.bas - zone.haut]
  if (!(lc > 0 && hc > 0 && lz > 0 && hz > 0)) return null
  const echelle = camera.echelle * Math.min(1, lz / lc, hz / hc)
  const avant = PX_PAR_UG * camera.echelle
  const apres = PX_PAR_UG * echelle
  // Le centre de la carte sur le tableau, posé au centre de la zone à la nouvelle échelle.
  const centre = point(camera.origine.x + (carte.gauche + carte.droite) / 2 / avant, camera.origine.y + (carte.haut + carte.bas) / 2 / avant)
  return { echelle, origine: point(centre.x - (zone.gauche + zone.droite) / 2 / apres, centre.y - (zone.haut + zone.bas) / 2 / apres) }
}
