// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reglerRubriqueBureau } from './index'
import { PageReglages } from './PageReglages'
import type { Reglages } from './reglages'
import { rubriquesVisibles } from './rubriquesReglages'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  localStorage.clear()
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  reglerRubriqueBureau(null)
  act(() => racine.unmount())
  hote.remove()
})

const reglages: Reglages = { theme: 'clair', taille: 'moyenne', doubleClic: true, grille: 10, barre: 'flottante' }
const c = { reglages, changer: () => {} }

describe('la rubrique « App de bureau » des réglages', () => {
  it('n’existe pas tant que l’application ne dit pas de quoi la dessiner (un navigateur, un serveur sans bureau)', () => {
    expect(rubriquesVisibles(c).map((r) => r.id)).not.toContain('bureau')
  })

  it('une fois le contenu posé, elle paraît avec une section et une ligne libre, qui rend ce contenu', () => {
    reglerRubriqueBureau(() => <p className="contenu-bureau">L’app dit</p>)
    const bureau = rubriquesVisibles(c).find((r) => r.id === 'bureau')!
    expect(bureau.groupe).toBe('application')
    expect(bureau.sections).toHaveLength(1)
    expect(bureau.sections[0]!.lignes).toHaveLength(1)
    const ligne = bureau.sections[0]!.lignes[0]!
    expect(ligne.controle.type).toBe('libre')
    act(() => racine.render(ligne.controle.type === 'libre' ? <>{ligne.controle.rendre(c)}</> : null))
    expect(hote.querySelector('.contenu-bureau')?.textContent).toBe('L’app dit')
  })

  it('on peut la retirer : elle disparaît de nouveau', () => {
    reglerRubriqueBureau(() => <p>là</p>)
    expect(rubriquesVisibles(c).map((r) => r.id)).toContain('bureau')
    reglerRubriqueBureau(null)
    expect(rubriquesVisibles(c).map((r) => r.id)).not.toContain('bureau')
  })

  it('la page des réglages l’ouvre comme les autres, et y met le contenu de l’application', () => {
    reglerRubriqueBureau(() => <button type="button" className="contenu-bureau">essai</button>)
    act(() => racine.render(<PageReglages reglages={reglages} changer={() => {}} fermer={() => {}} />))
    const lien = [...hote.querySelectorAll<HTMLButtonElement>('.notak-rg-lien')].find((b) => b.querySelector('span')?.textContent === 'App de bureau')!
    expect(lien).toBeTruthy()
    act(() => lien.click())
    expect(hote.querySelector('h2')?.textContent).toBe('App de bureau')
    expect(hote.querySelector('.notak-rg-ligne .contenu-bureau')).not.toBeNull()
    expect(hote.querySelector('.notak-rg-libelle')?.textContent).toBe('Où s’ouvre Notak')
  })

  it('la recherche la trouve par les mots de sa ligne', () => {
    reglerRubriqueBureau(() => <p>là</p>)
    act(() => racine.render(<PageReglages reglages={reglages} changer={() => {}} fermer={() => {}} />))
    const champ = hote.querySelector<HTMLInputElement>('input[type="search"]')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'mises à jour')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(hote.querySelector('.notak-rg-section-titre button')?.textContent).toBe('App de bureau')
  })

  it('sans contenu, la page des réglages ne la montre pas', () => {
    act(() => racine.render(<PageReglages reglages={reglages} changer={() => {}} fermer={() => {}} />))
    expect([...hote.querySelectorAll('.notak-rg-lien > span:first-of-type')].map((s) => s.textContent)).not.toContain('App de bureau')
  })
})
