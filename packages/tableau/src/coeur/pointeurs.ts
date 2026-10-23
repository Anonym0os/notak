import * as cam from './camera'
import { type Point, point } from './geometrie'

/** Ce vers quoi un pointeur de bord montre : une personne (son curseur) ou une activité sortie de la vue. */
export interface CibleBord {
  id: string
  /** Où c'est, sur le tableau (UG). */
  ou: Point
  genre: 'personne' | 'activite'
  nom: string
  couleur?: string
}

export interface PointeurBord {
  cle: string
  genre: CibleBord['genre']
  /** Sa place à l'écran, contre le bord de la vue. */
  x: number
  y: number
  /** Le sens de la flèche, en degrés (0 : vers la droite, 90 : vers le bas). */
  angle: number
  /** Combien de cibles il regroupe (un pointeur d'activité en regroupe plusieurs). */
  nombre: number
  nom: string
  couleur?: string
  /** Où il mène (UG) : le centre de ce qu'il regroupe. */
  vers: Point
}

/** Combien d'écart sépare un pointeur du bord de la fenêtre, en pixels. */
export const MARGE_POINTEUR = 24

/** Les pointeurs de ce qui sort de la vue : un par personne, et un par direction pour l'activité (huit secteurs). */
export function pointeursDeBord(cibles: readonly CibleBord[], camera: cam.Camera, vue: cam.Vue, gauche = 0, marge = MARGE_POINTEUR): PointeurBord[] {
  if (vue.largeur <= 0 || vue.hauteur <= 0) return []
  // La zone où l'on voit vraiment : la barre de gauche en cache une part.
  const [x0, y0, x1, y1] = [gauche, 0, vue.largeur, vue.hauteur]
  const centre = point((x0 + x1) / 2, (y0 + y1) / 2)
  const hors = cibles
    .map((c) => ({ c, e: cam.versEcran(camera, c.ou) }))
    .filter(({ e }) => e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1)
  const sorties: PointeurBord[] = []
  const secteurs = new Map<number, { c: CibleBord; e: Point }[]>()
  for (const h of hors) {
    if (h.c.genre === 'activite') {
      const angle = Math.atan2(h.e.y - centre.y, h.e.x - centre.x)
      const secteur = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8
      secteurs.set(secteur, [...(secteurs.get(secteur) ?? []), h])
    } else sorties.push(unPointeur(h.c.id, [h], centre, [x0 + marge, y0 + marge, x1 - marge, y1 - marge]))
  }
  for (const [secteur, liste] of secteurs) sorties.push(unPointeur(`activite:${secteur}`, liste, centre, [x0 + marge, y0 + marge, x1 - marge, y1 - marge]))
  return sorties
}

function unPointeur(cle: string, liste: { c: CibleBord; e: Point }[], centre: Point, [ax, ay, bx, by]: number[]): PointeurBord {
  const e = point(liste.reduce((s, h) => s + h.e.x, 0) / liste.length, liste.reduce((s, h) => s + h.e.y, 0) / liste.length)
  const [dx, dy] = [e.x - centre.x, e.y - centre.y]
  // Le rayon du centre vers la cible rencontre le bord rentré de la vue : c'est là que le pointeur se pose.
  const t = Math.min(dx > 0 ? (bx! - centre.x) / dx : dx < 0 ? (ax! - centre.x) / dx : Infinity, dy > 0 ? (by! - centre.y) / dy : dy < 0 ? (ay! - centre.y) / dy : Infinity)
  const premier = liste[0]!.c
  return {
    cle,
    genre: premier.genre,
    x: centre.x + dx * t,
    y: centre.y + dy * t,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    nombre: liste.length,
    nom: premier.nom,
    ...(premier.couleur ? { couleur: premier.couleur } : {}),
    vers: point(liste.reduce((s, h) => s + h.c.ou.x, 0) / liste.length, liste.reduce((s, h) => s + h.c.ou.y, 0) / liste.length),
  }
}
