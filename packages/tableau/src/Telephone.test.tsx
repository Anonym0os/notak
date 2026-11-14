// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BarreSelection } from './Barres'
import { creerMagasin } from './coeur/magasin'
import { type Element as ElementToile, type Image, nouvelId, nouvelleNote } from './coeur/tableau'
import './elements'
import { toutesLesEntreesMenu } from './elements/registre'
import type { ContexteToile } from './elements/types'
import { fermerMenus } from './menuUnique'
import { EVENEMENT_CHERCHER, Toile } from './Toile'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** La toile sur un téléphone, au doigt : le « + » et la feuille des outils, la barre de sélection en bas. */

class ObservateurMuet {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let racine: Root
let hote: HTMLElement
const largeur = window.innerWidth
beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ObservateurMuet
  document.elementFromPoint ??= () => null
  document.elementsFromPoint ??= () => []
  HTMLElement.prototype.setPointerCapture ??= () => {}
  HTMLElement.prototype.releasePointerCapture ??= () => {}
  HTMLElement.prototype.hasPointerCapture ??= () => false
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'innerWidth', { value: largeur, configurable: true })
})

function doigt(cible: Element, type: string, x = 200, y = 300) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y })
  Object.defineProperties(e, { pointerType: { value: 'touch' }, pointerId: { value: 1 }, isPrimary: { value: true } })
  act(() => void cible.dispatchEvent(e))
}

describe('la toile sur un téléphone', () => {
  it('n’a pas de barre à gauche, mais un « + » qui ouvre les outils en feuille', () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
    act(() => racine.render(<Toile magasin={magasin} />))
    expect(hote.querySelector('.notak-barre-outils')).toBeNull()
    act(() => hote.querySelector<HTMLButtonElement>('.notak-outils-ajouter')!.click())
    expect(document.querySelectorAll('.notak-outils-feuille .notak-outil').length).toBeGreaterThan(4)
  })

  it('pose le « + » en bas à gauche : le coin droit est au zoom et à la mini-carte, qu’il recouvrait', () => {
    // Le chemin passe par une variable : écrit en dur dans `new URL`, Vite le changerait en adresse d'asset.
    const lire = (fichier: string) => readFileSync(new URL(fichier, import.meta.url), 'utf8')
    const regle = (fichier: string, selecteur: string) => {
      const css = lire(fichier)
      const debut = css.indexOf(`${selecteur} {`)
      return css.slice(debut, css.indexOf('}', debut))
    }
    const plus = regle('./toile.css', '.notak-outils-ajouter')
    expect(plus).toMatch(/\bleft: calc\(16px \+ var\(--notak-zone-gauche/)
    expect(plus).not.toMatch(/\bright:/)
    // Le zoom reste dans le coin droit ; la mini-carte, au téléphone, ne part plus à gauche, où est le « + ».
    expect(regle('./toile.css', '.notak-vue-bas')).toMatch(/\bright: 16px/)
    expect(lire('./minicarte.css')).not.toMatch(/left: calc\(16px \+ var\(--notak-zone-gauche/)
  })

  it('un outil touché dans la feuille pose son élément au milieu de la vue, et la feuille se ferme', () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
    act(() => racine.render(<Toile magasin={magasin} />))
    act(() => hote.querySelector<HTMLButtonElement>('.notak-outils-ajouter')!.click())
    const note = document.querySelector<HTMLButtonElement>('.notak-outils-feuille .notak-outil')!
    doigt(note, 'pointerdown')
    doigt(hote.querySelector('.notak-toile')!, 'pointerup')
    expect(magasin.lire().elements).toHaveLength(1)
    expect(document.querySelector('.notak-outils-feuille')).toBeNull()
  })

  it('un élément choisi montre la barre de sélection, sans rien replier dans le « ••• »', () => {
    const n = nouvelleNote(0, 0, 'a')
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [n] })
    act(() => racine.render(<Toile magasin={magasin} services={{ barreAGauche: true }} />))
    const carte = hote.querySelector(`[data-id="${n.id}"]`)!
    doigt(carte, 'pointerdown')
    doigt(carte, 'pointerup')
    const barre = hote.querySelector('.notak-barre-outils[data-selection]')
    expect(barre).not.toBeNull()
    expect(barre!.getAttribute('data-palier')).toBe('grande')
    expect(hote.querySelector('.notak-outils-ajouter')).toBeNull()
  })

  it('le menu d’un outil de la capsule monte en feuille, qu’un toucher dedans ne referme pas', async () => {
    const n = nouvelleNote(0, 0, 'a')
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [n] })
    act(() => racine.render(<Toile magasin={magasin} services={{ barreAGauche: true }} />))
    const carte = hote.querySelector(`[data-id="${n.id}"]`)!
    doigt(carte, 'pointerdown')
    doigt(carte, 'pointerup')
    const outil = hote.querySelector<HTMLButtonElement>('.notak-barre-outils[data-capsule] button[aria-expanded]')!
    act(() => outil.click())
    const feuille = document.querySelector('.notak-tiroir-bas-outil')
    expect(feuille).not.toBeNull()
    // La feuille vit hors de la barre : un toucher dedans compte pourtant comme un toucher sur l'outil.
    doigt(feuille!.querySelector('.notak-tiroir-bas-corps')!, 'pointerdown')
    expect(document.querySelector('.notak-tiroir-bas-outil')).not.toBeNull()
    // « Fermer » attend que la feuille ait fini de s'ouvrir : le toucher qui l'ouvre ne la referme pas.
    await act(() => new Promise((r) => setTimeout(r, 400)))
    act(() => document.querySelector<HTMLButtonElement>('.notak-tiroir-bas-outil .notak-tiroir-bas-fermer')!.click())
    expect(document.querySelector('.notak-tiroir-bas-outil')).toBeNull()
  })
})

describe('la feuille d’actions d’un élément, au doigt', () => {
  /** Une image choisie, sa capsule montée, et sa feuille « ••• » ouverte : ses tuiles et ses lignes. */
  function feuilleDe(plus: Partial<Image>) {
    const e: ElementToile<Image> = { id: nouvelId(), x: 0, y: 0, largeur: 20, contenu: { type: 'image', fichier: 'f', largeurOrigine: 100, hauteurOrigine: 100, ...plus } }
    const contexte = {
      magasin: creerMagasin({ titre: '', etiquettes: [], elements: [e] }),
      choisir: () => {},
      rect: () => null,
      commencerEdition: () => {},
      finirEdition: () => {},
      selection: new Set([e.id]),
      services: { fichiers: { enregistrer: async () => 'x', adresse: async () => null }, tableau: () => undefined },
      // Les lignes du menu de l'élément, comme la toile les donne : les entrées des modules, telles quelles.
      actions: () => toutesLesEntreesMenu().filter((x) => x.visible([e], contexte)).map((x) => ({ libelle: x.libelle, icone: x.icone, faire: () => {} })),
    } as unknown as ContexteToile
    act(() => racine.render(<BarreSelection elements={[e]} contexte={contexte} position={{ x: 0, y: 0 }} aGauche />))
    act(() => hote.querySelector<HTMLButtonElement>('.notak-barre-outils[data-capsule] > .notak-outil-plus')!.click())
    const tuiles = [...document.querySelectorAll('button.notak-outil .notak-outil-libelle')].map((l) => l.textContent)
    const lignes = [...document.querySelectorAll('.notak-actions-ligne')].map((l) => l.textContent)
    return { tuiles, lignes }
  }

  it('ne répète pas en ligne ce que fait une tuile : « Légende » sans « Ajouter une légende » ; « Retirer la légende » reste', () => {
    const sans = feuilleDe({})
    expect(sans.tuiles).toContain('Légende')
    expect(sans.lignes).not.toContain('Ajouter une légende')
    expect(sans.lignes).not.toContain('Commenter')
    act(() => racine.render(null))
    const avec = feuilleDe({ legende: 'Un port' })
    expect(avec.tuiles).toContain('Légende')
    expect(avec.lignes).not.toContain('Modifier la légende')
    // La tuile ne la retire pas : la ligne est le seul moyen de le faire au doigt.
    expect(avec.lignes).toContain('Retirer la légende')
  })
})

describe('la recherche au doigt', () => {
  it('la loupe de l’en-tête ouvre la recherche de la toile, le champ prêt à écrire', () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
    act(() => racine.render(<Toile magasin={magasin} />))
    // jsdom ne met rien en page : la toile se dit visible.
    Object.defineProperty(hote.querySelector('.notak-toile')!, 'offsetParent', { get: () => document.body })
    act(() => void window.dispatchEvent(new Event(EVENEMENT_CHERCHER)))
    const champ = hote.querySelector<HTMLInputElement>('.notak-recherche input')
    expect(champ).not.toBeNull()
    expect(document.activeElement).toBe(champ)
  })
})

