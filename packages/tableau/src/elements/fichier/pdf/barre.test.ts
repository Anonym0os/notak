import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TITRE_MIN, palierTient } from './barre'

// Le chemin passe par une variable : écrit en dur dans `new URL`, Vite le changerait en adresse d'asset.
const fichier = './pdf.css'
const css = readFileSync(new URL(fichier, import.meta.url), 'utf8')
/** Les déclarations d'une règle, du sélecteur exact à son accolade fermante. */
const regle = (selecteur: string) => {
  const debut = css.indexOf(`\n${selecteur} {`)
  expect(debut, selecteur).toBeGreaterThanOrEqual(0)
  return css.slice(debut, css.indexOf('}', debut))
}

describe('le palier de la barre du PDF', () => {
  const large = { barre: 1000, barreEntiere: 1000 }

  it('tient quand le nom garde au moins sa largeur minimale, même coupé d’une ellipse', () => {
    expect(palierTient({ ...large, titre: TITRE_MIN, titreEntier: 400 })).toBe(true)
    expect(palierTient({ ...large, titre: TITRE_MIN - 20, titreEntier: 400 })).toBe(false)
  })

  it('un nom court n’a besoin que de sa largeur', () => {
    expect(palierTient({ ...large, titre: 60, titreEntier: 60 })).toBe(true)
    expect(palierTient({ ...large, titre: 40, titreEntier: 60 })).toBe(false)
  })

  it('ne tient pas quand le contenu sort de la barre, même si le nom a sa place', () => {
    expect(palierTient({ barre: 400, barreEntiere: 480, titre: 300, titreEntier: 300 })).toBe(false)
    // Un pixel d'arrondi ne compte pas.
    expect(palierTient({ barre: 400, barreEntiere: 401, titre: 300, titreEntier: 300 })).toBe(true)
  })
})

describe('la barre du PDF, en CSS', () => {
  it('le nom ne déborde jamais de sa colonne : il s’y étire, la coupe, et finit sur une ellipse', () => {
    // La cause du chevauchement : calé au début, le groupe prenait la largeur du nom entier, par-dessus le zoom.
    const groupe = regle('.notak-pdf-titre-groupe')
    expect(groupe).not.toMatch(/justify-self: start/)
    expect(groupe).toMatch(/justify-self: stretch;/)
    expect(groupe).toMatch(/overflow: hidden;/)
    expect(regle('.notak-pdf-groupe')).toMatch(/min-width: 0;/)
    const nom = regle('.notak-pdf-titre')
    expect(nom).toMatch(/min-width: 0;/)
    expect(nom).toMatch(/white-space: nowrap;/)
    expect(nom).toMatch(/text-overflow: ellipsis;/)
    expect(regle('.notak-pdf-barre')).toMatch(/grid-template-columns: minmax\(0, 1fr\) auto minmax\(max-content, 1fr\);/)
  })

  it('au palier « deux-rangs », le nom et les actions, puis le zoom et la page dessous', () => {
    const barre = regle(".notak-pdf[data-palier='deux-rangs'] .notak-pdf-barre")
    expect(barre).toMatch(/grid-template-columns: minmax\(0, 1fr\) auto;/)
    expect(barre).toMatch(/grid-template-areas: 'titre actions' 'milieu milieu';/)
    // Plus de rangées décidées par la largeur de l'écran : c'est la mesure (`barre.ts`) qui décide.
    expect(css).not.toMatch(/@media \(max-width: \d+px\) \{\s*\.notak-pdf \{\s*--notak-pdf-hauteur-barre/)
    expect(css).not.toMatch(/@media \(max-width: \d+px\) \{\s*\.notak-pdf-libelle/)
  })

  it('dans l’app de Mac, la barre laisse la place des boutons de la fenêtre, et rend cette place en plein écran', () => {
    const barre = regle(':root[data-bureau]:not([data-plein-ecran]) .notak-pdf-barre')
    expect(barre).toMatch(/padding: 16px 8px 16px 96px;/)
    expect(regle(':root[data-bureau]:not([data-plein-ecran]) .notak-pdf')).toMatch(/--notak-pdf-hauteur-barre: 68px;/)
  })

  it('au doigt, des cibles de 44 px', () => {
    const debut = css.indexOf('@media (pointer: coarse)')
    expect(debut).toBeGreaterThanOrEqual(0)
    const bloc = css.slice(debut, css.indexOf('}', css.indexOf('.notak-pdf-bouton {', debut)))
    expect(bloc).toMatch(/min-width: 44px;/)
    expect(bloc).toMatch(/height: 44px;/)
  })
})
