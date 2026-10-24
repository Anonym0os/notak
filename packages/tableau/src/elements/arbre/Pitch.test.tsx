// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { Arbre, Id } from '../../coeur/tableau'
import { poserDiapo } from './modele/pitch'
import type { Geste } from './modele/gestes'
import { ajouterEnfant, lire, nouvelArbre } from './modele/sujets'
import { OngletPresenter } from './OngletPresenter'
import { Presentation } from './Presentation'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Central → A (A1, A2), B. */
function carte() {
  let a: Arbre = nouvelArbre('Cours')
  const c = lire(a).central
  let A: Id, B: Id
  ;[a, A] = ajouterEnfant(a, c, 'Chapitre A')
  ;[a, B] = ajouterEnfant(a, c, 'Chapitre B')
  ;[a] = ajouterEnfant(a, A, 'Point 1')
  ;[a] = ajouterEnfant(a, A, 'Point 2')
  return { a, c, A, B }
}

const taper = (el: HTMLSelectElement, valeur: string) =>
  act(() => {
    el.value = valeur
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
const clic = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })))

function onglet(a: Arbre, choisis: Id[]) {
  const hote = document.createElement('div')
  document.body.append(hote)
  const racine = createRoot(hote)
  const faire = vi.fn<(g: Geste) => void>()
  act(() => racine.render(<OngletPresenter arbre={a} lecture={lire(a)} choisis={choisis} faire={faire} />))
  const menu = (info: string) => hote.querySelector<HTMLSelectElement>(`select[aria-label="${info}"]`)!
  return { hote, faire, menu, fin: () => (act(() => racine.unmount()), hote.remove()) }
}

describe('l’onglet Pitch', () => {
  it('rien de choisi : « Sélectionner un sujet à formater. »', () => {
    const { a } = carte()
    const o = onglet(a, [])
    expect(o.hote.textContent).toBe('Sélectionner un sujet à formater.')
    o.fin()
  })

  it('un principal : l’aperçu, le sujet et la liste avec leurs Auto dits, la livraison et les cinq mises en page', () => {
    const { a, A } = carte()
    const o = onglet(a, [A])
    expect(o.hote.querySelector('.notak-arbre-pitch-apercu .notak-arbre-diapo')).toBeTruthy()
    expect([...o.menu('Sujet comme diapositive').options].map((x) => x.textContent)).toEqual(['Auto (Visible)', 'Visible', 'Masqué'])
    expect([...o.menu('Sous-sujets comme diapositive').options].map((x) => x.textContent)).toEqual(['Auto (Visible)', 'Visible', 'Masqué'])
    expect([...o.menu('Livraison').options].map((x) => x.textContent)).toEqual(['Auto (Un par un, en profondeur)', 'Un par un, en profondeur', 'Un par un', 'Tout à la fois'])
    expect([...o.hote.querySelectorAll('.notak-arbre-pitch-segments button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Liste à accolade', 'Liste à puces', 'Paroles', 'Arêtes de poisson', 'Chronologie'])
    // Pas d’image sur ce sujet : pas de ligne « Position de l’image ».
    expect(o.hote.textContent).not.toContain('Position de l’image')
    o.fin()
  })

  it('un sous-sujet sans enfant : Auto (Masqué) et ni liste ni livraison', () => {
    const { a } = carte()
    const [, sans] = ajouterEnfant(a, Object.keys(a.sujets).find((k) => a.sujets[k]!.titre === 'Point 1')!, 'Détail')
    const o = onglet(a, [Object.keys(a.sujets).find((k) => a.sujets[k]!.titre === 'Point 2')!])
    expect([...o.menu('Sujet comme diapositive').options][0]!.textContent).toBe('Auto (Masqué)')
    expect(o.hote.textContent).not.toContain('Sous-sujets comme diapositive')
    expect(sans).toBeTruthy()
    o.fin()
  })

  it('changer un menu écrit un geste de réglage ; Auto le retire', () => {
    const { a, A } = carte()
    const o = onglet(a, [A])
    taper(o.menu('Sujet comme diapositive'), 'masque')
    expect(o.faire).toHaveBeenLastCalledWith({ type: 'diapo', ids: [A], reglage: { sujet: 'masque' } })
    taper(o.menu('Livraison'), 'tout')
    expect(o.faire).toHaveBeenLastCalledWith({ type: 'diapo', ids: [A], reglage: { livraison: 'tout' } })
    clic(o.hote.querySelectorAll('.notak-arbre-pitch-segments button')[4]!)
    expect(o.faire).toHaveBeenLastCalledWith({ type: 'diapo', ids: [A], reglage: { miseEnPage: 'chronologie' } })
    taper(o.menu('Rapport d’aspect'), '4:3')
    expect(o.faire).toHaveBeenLastCalledWith({ type: 'pitch', reglage: { ratio: '4:3' } })
    o.fin()
    const b = poserDiapo(a, [A], { sujet: 'masque' })
    const p = onglet(b, [A])
    expect(p.menu('Sujet comme diapositive').value).toBe('masque')
    taper(p.menu('Sujet comme diapositive'), 'auto')
    expect(p.faire).toHaveBeenLastCalledWith({ type: 'diapo', ids: [A], reglage: { sujet: null } })
    p.fin()
  })

  it('les rangées : un libellé court sur une ligne, un menu natif sous une valeur courte (« Auto »), 72 ou pleine largeur', () => {
    const { a, A } = carte()
    const o = onglet(a, [A])
    const rangees = [...o.hote.querySelectorAll<HTMLElement>('.notak-arbre-pitch-ligne')]
    // Rapport d'aspect, sujet, liste : courtes ; livraison, mise en page : verticales.
    expect(rangees.filter((r) => r.dataset.vertical === undefined).map((r) => r.firstElementChild!.textContent)).toEqual(['Rapport d’aspect', 'Diapositive du sujet', 'Sous-sujets en liste'])
    expect(rangees.filter((r) => r.dataset.vertical !== undefined).map((r) => r.firstElementChild!.textContent)).toEqual(['Livraison', 'Mise en page'])
    // Chaque libellé porte son texte en infobulle : coupé par « … » s'il ne tenait pas, jamais sur deux lignes.
    for (const r of rangees) expect(r.firstElementChild!.getAttribute('title')).toBe(r.firstElementChild!.textContent)
    // Le menu natif (clavier, liste) garde son nom accessible ; ce qu'on lit est « Auto », le détail est dans la liste.
    const court = o.hote.querySelector('.notak-arbre-pitch-select:not([data-large])')!
    expect(court.querySelector('select')!.getAttribute('aria-label')).toBe('Rapport d’aspect')
    expect(court.querySelector('.notak-arbre-pitch-valeur')!.textContent).toBe('Auto')
    const sujet = o.menu('Sujet comme diapositive').parentElement!
    expect(sujet.querySelector('.notak-arbre-pitch-valeur')!.textContent).toBe('Auto')
    const large = o.menu('Livraison').parentElement!
    expect(large.hasAttribute('data-large')).toBe(true)
    expect(large.querySelector('.notak-arbre-pitch-valeur')!.textContent).toBe('Auto (Un par un, en profondeur)')
    o.fin()
  })

  it('plusieurs sujets : « Plusieurs sujets sélectionnés. » à la place de l’aperçu, « Multiple » quand ils diffèrent', () => {
    const { a, A, B } = carte()
    const b = poserDiapo(a, [A], { sujet: 'masque' })
    const o = onglet(b, [A, B])
    expect(o.hote.querySelector('.notak-arbre-pitch-apercu-texte')?.textContent).toBe('Plusieurs sujets sélectionnés.')
    expect(o.menu('Sujet comme diapositive').value).toBe('multiple')
    o.fin()
  })

  it('« Changer de thème » ouvre les sept thèmes ; en choisir un écrit le thème de la carte', () => {
    const { a, A } = carte()
    const o = onglet(a, [A])
    clic(o.hote.querySelector('.notak-arbre-pitch-bouton')!)
    const vignettes = [...document.querySelectorAll('.notak-arbre-pitch-vignette')]
    expect(vignettes.map((v) => v.querySelector('.notak-arbre-pitch-legende')?.textContent)).toEqual(['Clair', 'Sombre', 'Innocence', 'Formes', 'Rose de minuit', 'Bulles', 'Carnet'])
    expect(vignettes[1]!.getAttribute('aria-pressed')).toBe('true')
    clic(vignettes[2]!)
    expect(o.faire).toHaveBeenLastCalledWith({ type: 'pitch', reglage: { theme: 'innocence' } })
    o.fin()
  })
})

function presenter(a: Arbre, depart?: Id) {
  const hote = document.createElement('div')
  hote.className = 'notak-arbre-fond'
  document.body.append(hote)
  const racine = createRoot(hote)
  const quitter = vi.fn()
  const faire = vi.fn<(g: Geste) => void>()
  act(() => racine.render(<Presentation arbre={a} lecture={lire(a)} depart={depart} faire={faire} lectureSeule={false} quitter={quitter} />))
  const touche = (key: string, mods: Partial<KeyboardEventInit> = {}) =>
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods })))
  const titre = () => hote.querySelector('.notak-arbre-diapo h1, .notak-arbre-diapo h2')?.textContent
  return { hote, quitter, faire, touche, titre, fin: () => (act(() => racine.unmount()), hote.remove()) }
}

describe('le mode présentation', () => {
  it('commence au central ; Espace et les flèches avancent, ← recule', () => {
    const { a } = carte()
    const p = presenter(a)
    expect(p.titre()).toBe('Cours')
    // La liste du central paraît avec son premier enfant ; on perce dans A.
    p.touche(' ')
    expect(p.hote.querySelector('.notak-arbre-diapo-liste h2')?.textContent).toBe('Cours')
    p.touche('ArrowRight')
    expect(p.titre()).toBe('Chapitre A')
    p.touche('ArrowLeft')
    expect(p.hote.querySelector('.notak-arbre-diapo-liste')).toBeTruthy()
    p.fin()
  })

  it('une liste se découvre étape par étape', () => {
    const { a, A } = carte()
    const p = presenter(a, A)
    expect(p.titre()).toBe('Chapitre A')
    p.touche('ArrowRight')
    const etats = () => [...p.hote.querySelectorAll('.notak-arbre-diapo-liste li')].map((li) => li.getAttribute('data-etat'))
    expect(etats()).toEqual(['courant', 'cache'])
    p.touche('ArrowRight')
    expect(etats()).toEqual(['passe', 'courant'])
    p.fin()
  })

  it('Maj+→ passe la branche, Maj+← revient au parent', () => {
    const { a, A } = carte()
    const p = presenter(a, A)
    // Retour dans la liste du central, où B paraît aussitôt.
    p.touche('ArrowRight', { shiftKey: true })
    expect(p.hote.querySelector('.notak-arbre-diapo-liste li[data-etat="courant"]')?.textContent).toBe('Chapitre B')
    // Depuis la liste du central, le parent est la diapositive du central.
    p.touche('ArrowLeft', { shiftKey: true })
    expect(p.titre()).toBe('Cours')
    p.fin()
  })

  it('Échap et Q quittent ; la fin de la dernière diapositive aussi ; ? montre les raccourcis', () => {
    const { a } = carte()
    const p = presenter(a)
    p.touche('?')
    expect(p.hote.querySelector('.notak-arbre-pitch-raccourcis')).toBeTruthy()
    p.touche('Escape')
    expect(p.hote.querySelector('.notak-arbre-pitch-raccourcis')).toBeNull()
    expect(p.quitter).not.toHaveBeenCalled()
    p.touche('Escape')
    expect(p.quitter).toHaveBeenCalledTimes(1)
    p.touche('q')
    expect(p.quitter).toHaveBeenCalledTimes(2)
    // « Merci », puis l'écran de fin, puis la fin.
    for (let i = 0; i < 20; i++) p.touche('ArrowRight')
    expect(p.quitter.mock.calls.length).toBeGreaterThan(2)
    p.fin()
  })

  it('au bout : « Merci », puis l’écran de fin, puis on quitte', () => {
    const { a } = carte()
    const p = presenter(a)
    for (let i = 0; i < 20 && p.titre() !== 'Merci'; i++) p.touche('ArrowRight')
    expect(p.titre()).toBe('Merci')
    p.touche('ArrowRight')
    expect(p.hote.querySelector('.notak-arbre-pitch-fin')).toBeTruthy()
    expect(p.quitter).not.toHaveBeenCalled()
    p.touche('ArrowLeft')
    expect(p.titre()).toBe('Merci')
    p.touche('ArrowRight')
    p.touche('ArrowRight')
    expect(p.quitter).toHaveBeenCalledTimes(1)
    p.fin()
  })

  it('le thème de la carte habille la diapositive, et la barre garde ses quatre groupes de boutons', () => {
    const { a } = carte()
    const p = presenter({ ...a, pitch: { theme: 'light', ratio: '4:3' } })
    expect((p.hote.querySelector('.notak-arbre-diapo-cadre') as HTMLElement).style.getPropertyValue('--d-fond')).toBe('#fafbfc')
    expect(p.hote.querySelector('.notak-arbre-diapo-cadre')?.getAttribute('data-ratio')).toBe('4:3')
    expect([...p.hote.querySelectorAll('.notak-arbre-pitch-outil')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Quitter le mode présentation.',
      'Paramètres',
      'Retour au sujet parent.',
      'Diapositive précédente',
      'Diapositive suivante',
      'Passer la branche actuelle.',
    ])
    p.fin()
  })
})
