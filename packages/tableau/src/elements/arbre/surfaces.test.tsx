// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { MesureFlottant } from './Flottant'
import { MenuContextuel } from './MenuContextuel'
import type { Item } from './menus'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Les surfaces de la carte mentale ouverte sont celles de la toile : ses menus et leurs sous-menus prennent la surface
 * pleine des menus communs, et ce qui flotte sur la carte (barres, pastilles) celle des îlots. Un verre à 70 % laissait
 * voir la carte au travers, « juste une opacité réduite » (signalement du 26/10).
 */

// Le chemin passe par une variable : écrit en dur dans `new URL`, Vite le changerait en adresse d'asset.
const lire = (fichier: string) => readFileSync(new URL(fichier, import.meta.url), 'utf8')
const regle = (css: string, selecteur: string) => {
  const debut = css.indexOf(`\n${selecteur} {`)
  expect(debut, selecteur).toBeGreaterThanOrEqual(0)
  return css.slice(debut, css.indexOf('}', debut))
}

const racines: { unmount(): void }[] = []
afterEach(() => {
  for (const r of racines.splice(0)) act(() => r.unmount())
  document.body.innerHTML = ''
})

describe('les surfaces de la carte mentale', () => {
  it('le menu du clic droit et son sous-menu ont la surface des menus de la toile, icônes, raccourcis et filets compris', () => {
    const items: Item[] = [
      { id: 'inserer', libelle: 'Insérer', icone: 'ajouter', sous: [{ id: 'note', libelle: 'Note', icone: 'note', touche: '⇧⌘N' }] },
      'sep',
      { id: 'copier', libelle: 'Copier', icone: 'menuCopier', touche: '⌘C' },
    ]
    const hote = document.createElement('div')
    document.body.append(hote)
    const racine = createRoot(hote)
    racines.push(racine)
    act(() =>
      racine.render(
        <MesureFlottant value={() => ({ l: 230, h: 200 })}>
          <MenuContextuel x={100} y={100} items={items} choisir={() => {}} fermer={() => {}} />
        </MesureFlottant>,
      ),
    )
    const menu = document.querySelector<HTMLElement>('.notak-arbre-ctx')!
    expect([...menu.classList]).toEqual(expect.arrayContaining(['notak-pop', 'notak-menu']))
    expect(menu.querySelector('.notak-e-icone svg')).not.toBeNull()
    expect(menu.querySelector('.notak-touches')).not.toBeNull()
    expect(menu.querySelector('.notak-sep')).not.toBeNull()
    act(() => [...menu.querySelectorAll<HTMLButtonElement>('.notak-e')].find((b) => b.textContent!.includes('Insérer'))!.click())
    const sous = document.querySelector('.notak-menu-sous-liste')!
    expect([...sous.classList]).toEqual(expect.arrayContaining(['notak-pop', 'notak-menu']))
    // Rien de la carte ne repeint la surface commune : ni fond, ni verre, ni opacité.
    expect(regle(lire('./menus.css'), '.notak-arbre-ctx')).not.toMatch(/background|backdrop-filter|opacity/)
  })

  it('ce qui flotte sur la carte prend la surface des îlots, sans verre ni flou, en clair comme en sombre', () => {
    const fenetre = lire('./fenetre.css')
    const bas = lire('./barre-bas.css')
    // Les barres (outils, sujet) et les pastilles du bas : le fond et l'ombre des îlots, à 88 % comme sur la toile.
    expect(fenetre).toMatch(/\.notak-arbre-pilule,\n\.notak-arbre-pastille \{\n {2}background: var\(--notak-ilot-fond\);\n {2}box-shadow: var\(--notak-ilot-ombre\);/)
    expect(regle(bas, '.notak-arbre-bas-pastille')).toMatch(/background: var\(--notak-ilot-fond\);[\s\S]*box-shadow: var\(--notak-ilot-ombre\);/)
    expect(regle(fenetre, '.notak-arbre-fond')).toMatch(/--notak-ilot-fond: color-mix\(in srgb, var\(--notak-arbre-fond\) 88%, transparent\);/)
    for (const css of [fenetre, bas]) {
      expect(css).not.toContain('backdrop-filter')
      expect(css).not.toContain('--notak-arbre-verre')
    }
    // En sombre, l'îlot sombre de la toile : un fond à peine plus clair qu'elle, un anneau d'un pixel.
    const sombre = regle(fenetre, "[data-theme='sombre'] :is(.notak-arbre-pilule, .notak-arbre-pastille, .notak-arbre-bas-pastille)")
    expect(sombre).toMatch(/--notak-ilot-fond: color-mix\(in oklab, var\(--notak-fond, #1b1e23\), white 6%\);/)
    expect(sombre).toMatch(/--notak-ilot-ombre: 0 0 0 1px rgb\(255 255 255 \/ 0\.1\);/)
  })
})
