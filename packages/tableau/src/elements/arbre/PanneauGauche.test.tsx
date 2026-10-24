// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { docDepuisTexte } from '../../coeur/tableau'
import { porter } from './modele/elements'
import { ajouterEnfant, lire, nouvelArbre } from './modele/sujets'
import { type OngletGauche, PanneauGauche } from './PanneauGauche'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function carte() {
  let a = nouvelArbre('Projet')
  const c = lire(a).central
  let x, y, z
  ;[a, x] = ajouterEnfant(a, c, 'Idées neuves')
  ;[a, y] = ajouterEnfant(a, x, 'Une')
  ;[a, z] = ajouterEnfant(a, c, 'Deux')
  a = porter(a, [x], 'note', docDepuisTexte('La première note'))
  a = porter(a, [y, z], 'etiquettes', ['urgent'])
  return { a, c, x, y, z }
}

function monter(onglet: OngletGauche, surTouche?: () => void) {
  const { a, c, x, y, z } = carte()
  const hote = document.createElement('div')
  document.body.append(hote)
  const racine = createRoot(hote)
  const p = { choisirOnglet: vi.fn(), fermer: vi.fn(), aller: vi.fn(), cocher: vi.fn() }
  act(() =>
    racine.render(
      <div onKeyDown={surTouche}>
        <PanneauGauche onglet={onglet} arbre={a} lecture={lire(a)} choisis={new Set()} coches={new Set(['etiquette:urgent'])} {...p} />
      </div>,
    ),
  )
  const clic = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  const taper = (champ: HTMLInputElement, valeur: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, valeur)
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
  return { hote, p, ids: { c, x, y, z }, clic, taper, fin: () => (act(() => racine.unmount()), hote.remove()) }
}

describe('le panneau de gauche', () => {
  it('trois onglets en capsule : Plan, Notes, Étiquettes ; un clic change d’onglet, la croix ferme', () => {
    const a = monter('plan')
    const onglets = [...a.hote.querySelectorAll('[role=tab]')]
    expect(onglets.map((o) => o.textContent)).toEqual(['Plan', 'Notes', 'Étiquettes'])
    expect(onglets.map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    a.clic(onglets[1]!)
    expect(a.p.choisirOnglet).toHaveBeenCalledWith('notes')
    a.clic(a.hote.querySelector('.notak-arbre-gauche-fermer')!)
    expect(a.p.fermer).toHaveBeenCalled()
    a.fin()
  })

  it('le plan : le titre de la feuille, l’arbre, les étiquettes sous le sujet ; un clic va au sujet', () => {
    const a = monter('plan')
    expect(a.hote.querySelector('.notak-arbre-gauche-feuille')?.textContent).toBe('Projet')
    expect([...a.hote.querySelectorAll('.notak-arbre-gauche-plan-titre')].map((t) => t.textContent)).toEqual(['Projet', 'Idées neuves', 'Une', 'Deux'])
    expect([...a.hote.querySelectorAll('.notak-arbre-gauche-plan-detail')].map((t) => t.textContent)).toEqual(['urgent', 'urgent'])
    a.clic(a.hote.querySelectorAll('.notak-arbre-gauche-plan-titre')[2]!)
    expect(a.p.aller).toHaveBeenCalledWith(a.ids.y)
    a.fin()
  })

  it('le plan se replie, et la recherche garde les sujets trouvés avec leurs ancêtres', () => {
    const a = monter('plan')
    a.clic(a.hote.querySelectorAll('.notak-arbre-gauche-plan-pli')[1]!)
    expect([...a.hote.querySelectorAll('.notak-arbre-gauche-plan-titre')].map((t) => t.textContent)).toEqual(['Projet', 'Idées neuves', 'Deux'])
    a.taper(a.hote.querySelector<HTMLInputElement>('input[type=search]')!, 'une')
    expect([...a.hote.querySelectorAll('.notak-arbre-gauche-plan-titre')].map((t) => t.textContent)).toEqual(['Projet', 'Idées neuves', 'Une'])
    a.taper(a.hote.querySelector<HTMLInputElement>('input[type=search]')!, 'zzz')
    expect(a.hote.textContent).toContain('Aucun résultat n’a été trouvé.')
    a.fin()
  })

  it('les notes : le titre du sujet puis son texte ; un clic va au sujet ; la recherche filtre', () => {
    const a = monter('notes')
    const lignes = [...a.hote.querySelectorAll('.notak-arbre-note-ligne')]
    expect(lignes.map((l) => l.textContent)).toEqual(['Idées neuvesLa première note'])
    a.clic(lignes[0]!)
    expect(a.p.aller).toHaveBeenCalledWith(a.ids.x)
    a.taper(a.hote.querySelector<HTMLInputElement>('input[type=search]')!, 'inconnu')
    expect(a.hote.querySelector('.notak-arbre-note-ligne')).toBeNull()
    expect(a.hote.textContent).toContain('Aucun résultat')
    a.fin()
  })

  it('les étiquettes : un repère par ligne avec son nombre de sujets, coché ou non', () => {
    const a = monter('etiquettes')
    const lignes = [...a.hote.querySelectorAll('.notak-arbre-gauche-repere')]
    expect(lignes.map((l) => l.textContent)).toEqual(['urgent2'])
    expect((lignes[0]!.querySelector('input') as HTMLInputElement).checked).toBe(true)
    a.clic(lignes[0]!.querySelector('input')!)
    expect(a.p.cocher).toHaveBeenCalledWith('etiquette:urgent')
    a.fin()
  })

  it('Échap ferme le panneau sans que la carte le voie', () => {
    let remonte = false
    const a = monter('plan', () => (remonte = true))
    act(() => void a.hote.querySelector('.notak-arbre-gauche')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(a.p.fermer).toHaveBeenCalled()
    expect(remonte).toBe(false)
    a.fin()
  })
})
