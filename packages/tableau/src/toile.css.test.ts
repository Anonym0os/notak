import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Le chemin passe par une variable : écrit en dur dans `new URL`, Vite le changerait en adresse d'asset.
const fichier = './toile.css'
const css = readFileSync(new URL(fichier, import.meta.url), 'utf8')
const regle = (selecteur: string) => {
  const debut = css.indexOf(`\n${selecteur} {`)
  expect(debut, selecteur).toBeGreaterThanOrEqual(0)
  return css.slice(debut, css.indexOf('}', debut))
}

describe('le filet d’une carte', () => {
  it('en édition, rentre de 2 px et perd 2 px d’arrondi : son bord épouse encore l’arrondi de la carte', () => {
    const edition = regle(".notak-carte[data-edition]:not([data-sans-fond], [data-type='tableau'])::before")
    expect(edition).toMatch(/inset: 2px;/)
    expect(edition).toMatch(/border-radius: max\(0px, calc\(var\(--notak-rayon-carte, 0px\) - 2px\)\);/)
    // Choisie, il suit l'arrondi de la carte, 2 px au-dehors ; l'arrondi glisse avec lui vers l'édition.
    const filet = regle(".notak-carte:not([data-sans-fond], [data-type='tableau'])::before")
    expect(filet).toMatch(/border-radius: inherit;/)
    expect(filet).toMatch(/border-radius 0\.1s ease-out/)
  })
})

describe('le « ••• » de la barre de gauche', () => {
  it('donne à chaque outil toute sa colonne, à tout palier : un nom de deux mots s’y lit sans se resserrer', () => {
    expect(regle('.notak-tiroir')).toMatch(/grid-template-columns: repeat\(3, 76px\);/)
    expect(regle('.notak-barre-outils[data-palier] .notak-tiroir .notak-outil')).toMatch(/width: 100%;/)
  })
})
