import type { CouleurNote } from '../coeur/tableau'
import { type ModeleTableau, hauteurEstimee, hauteurFeuille, largeurModele } from './construire'

/** Un rectangle de l'aperçu d'un modèle, en UG. */
export interface Forme {
  genre: 'titre' | 'note' | 'taches' | 'colonne' | 'feuille'
  x: number
  y: number
  largeur: number
  hauteur: number
  couleur?: CouleurNote
}

/** Ce qu'on dessine pour montrer un modèle : une forme par élément, les feuilles d'une colonne rangées dedans. */
export function formesApercu(m: ModeleTableau): { formes: Forme[]; largeur: number; hauteur: number } {
  const formes: Forme[] = []
  for (const e of m.elements) {
    const largeur = largeurModele(e)
    const hauteur = hauteurEstimee(e)
    formes.push({ genre: e.genre, x: e.x, y: e.y, largeur, hauteur, ...(e.genre !== 'titre' && e.couleur ? { couleur: e.couleur } : {}) })
    if (e.genre === 'colonne') {
      let y = e.y + 5
      for (const f of e.contenu) {
        const h = hauteurFeuille(f, largeur)
        formes.push({ genre: 'feuille', x: e.x + 1, y, largeur: largeur - 2, hauteur: h, ...(f.couleur ? { couleur: f.couleur } : {}) })
        y += h + 1
      }
    }
  }
  const [x0, y0] = [Math.min(...formes.map((f) => f.x)), Math.min(...formes.map((f) => f.y))]
  return {
    formes: formes.map((f) => ({ ...f, x: f.x - x0, y: f.y - y0 })),
    largeur: Math.max(...formes.map((f) => f.x + f.largeur)) - x0,
    hauteur: Math.max(...formes.map((f) => f.y + f.hauteur)) - y0,
  }
}
