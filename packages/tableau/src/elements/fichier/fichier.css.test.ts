import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Le chemin passe par une variable : écrit en dur dans `new URL`, Vite le changerait en adresse d'asset.
const fichier = './fichier.css'
const fichierToile = '../../toile.css'
const css = readFileSync(new URL(fichier, import.meta.url), 'utf8')
/** Les déclarations d'une règle, du sélecteur exact à son accolade fermante. */
const regle = (selecteur: string) => {
  const debut = css.indexOf(`\n${selecteur} {`)
  expect(debut, selecteur).toBeGreaterThanOrEqual(0)
  return css.slice(debut, css.indexOf('}', debut))
}

describe('le nom d’un fichier reste dans sa carte', () => {
  it('en icône, le texte prend la largeur de la carte, sans marge négative qui le ferait dépasser de ses deux bords', () => {
    const texte = regle('.notak-fichier-texte')
    expect(texte).toMatch(/width: 100%;/)
    expect(texte).toMatch(/box-sizing: border-box;/)
    expect(texte).not.toMatch(/margin: [^;]*-\d/)
    expect(texte).not.toMatch(/width: 180px/)
    // La taille, dessous, ne sort pas non plus.
    expect(regle('.notak-fichier-texte .notak-fichier-details')).toMatch(/max-width: 100%;/)
  })

  it('en icône, le nom passe à la ligne entre les mots, coupe un mot trop long, et s’arrête sur une ellipse après trois lignes', () => {
    const nom = regle('.notak-fichier-texte .notak-fichier-nom')
    expect(nom).toMatch(/display: -webkit-box;/)
    expect(nom).toMatch(/-webkit-box-orient: vertical;/)
    expect(nom).toMatch(/-webkit-line-clamp: 3;/)
    expect(nom).toMatch(/line-clamp: 3;/)
    expect(nom).toMatch(/overflow-wrap: anywhere;/)
    expect(nom).toMatch(/white-space: normal;/)
  })

  it('en carte détaillée, le nom tient sur une ligne et finit sur une ellipse', () => {
    const nom = regle('.notak-fichier-nom')
    expect(nom).toMatch(/white-space: nowrap;/)
    expect(nom).toMatch(/overflow: hidden;/)
    expect(nom).toMatch(/text-overflow: ellipsis;/)
    expect(nom).toMatch(/min-width: 0;/)
    // Sa colonne peut rétrécir sous la largeur du nom : sans cela, l'ellipse ne viendrait jamais.
    expect(regle('.notak-fichier-infos')).toMatch(/min-width: 0;/)
  })

  it('le champ du nom, hors du curseur, finit lui aussi sur une ellipse au lieu d’être coupé net', () => {
    const champ = regle('.notak-fichier-champ')
    expect(champ).toMatch(/text-overflow: ellipsis;/)
    expect(champ).toMatch(/width: 100%;/)
  })

  it('soulevé pendant un glisser, la feuille porte une ombre de la taille de la carte : le nom et la taille y tiennent', () => {
    // Le fond clair arrondi de la capture de Samy : l'ombre de vol de la carte (toile.css), posée sur toute sa boîte,
    // arrondie comme elle. La boîte contient le texte de la feuille, de sa largeur ; il ne déborde plus de ses bords.
    const toile = readFileSync(new URL(fichierToile, import.meta.url), 'utf8')
    const debut = toile.indexOf("\n.notak-carte[data-vol]:not([data-type='tableau'])::after {")
    expect(debut).toBeGreaterThanOrEqual(0)
    const vol = toile.slice(debut, toile.indexOf('}', debut))
    expect(vol).toMatch(/inset: 0;/)
    expect(vol).toMatch(/border-radius: inherit;/)
    expect(vol).toMatch(/box-shadow: var\(--notak-ombre-vol\);/)
    // Rien ne retire cette ombre à la feuille d'un fichier (comme fait le document) sans retirer aussi le débordement.
    expect(css).not.toMatch(/\[data-type='fichier'\][^{]*::after\s*\{[^}]*display: none/)
    expect(regle('.notak-fichier-texte')).toMatch(/width: 100%;/)
  })

  it('dans une colonne, la feuille à gauche, le texte reprend la place qui reste, sans marge ni retrait', () => {
    const texte = regle('.notak-fichier[data-feuille][data-colonne] .notak-fichier-texte')
    expect(texte).toMatch(/min-width: 0;/)
    expect(texte).toMatch(/padding: 0;/)
  })
})
