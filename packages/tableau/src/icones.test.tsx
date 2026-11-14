// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Icone } from './icones'

const classes = (html: string) => /class="([^"]*)"/.exec(html)![1]!.split(' ')

// Le chemin passe par une variable : écrit en dur dans `new URL`, Vite le changerait en adresse d'asset.
const lire = (fichier: string) => readFileSync(new URL(fichier, import.meta.url), 'utf8')
const regle = (css: string, selecteur: string) => {
  const debut = css.indexOf(`${selecteur} {`)
  expect(debut).toBeGreaterThan(-1)
  return css.slice(debut, css.indexOf('}', debut))
}

describe('Icone', () => {
  it('prend la couleur du texte, et garde la classe qu’on lui donne', () => {
    expect(classes(renderToStaticMarkup(<Icone nom="favori" className="ici" />))).toEqual(expect.arrayContaining(['notak-ico', 'ici']))
    expect(renderToStaticMarkup(<Icone nom="favori" />)).not.toContain('notak-ico-favori')
  })

  it('peint l’étoile pleine d’un favori en jaune partout où elle paraît, en clair comme en sombre', () => {
    expect(classes(renderToStaticMarkup(<Icone nom="favoriPlein" className="ici" />))).toEqual(expect.arrayContaining(['notak-ico', 'notak-ico-favori', 'ici']))
    // Le marqueur « étoile » d'une carte mentale a le même dessin, mais la couleur de son sujet.
    expect(renderToStaticMarkup(<Icone nom="marqueurEtoile" />)).not.toContain('notak-ico-favori')
    const css = lire('./toile.css')
    expect(regle(css, '\n.notak-ico.notak-ico-favori')).toMatch(/color: #e8a400;/)
    expect(regle(css, "[data-theme='sombre'] .notak-ico.notak-ico-favori")).toMatch(/color: #f5b82e;/)
  })
})
