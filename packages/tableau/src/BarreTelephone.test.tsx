// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerEspace } from './coeur/espace'
import './elements'
import { EspaceNotak, demanderReglages, surplusBarre } from './EspaceNotak'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** La barre du haut d'une toile au téléphone, quand l'application lui donne sa version (`telephone`) : une ligne. */

class ObservateurMuet {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let racine: Root
let hote: HTMLElement
const largeur = window.innerWidth
const auDoigt = (doigt: boolean) => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: doigt && q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  Object.defineProperty(window, 'innerWidth', { value: doigt ? 390 : 1280, configurable: true })
}
beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ObservateurMuet
  document.elementFromPoint ??= () => null
  document.elementsFromPoint ??= () => []
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'innerWidth', { value: largeur, configurable: true })
})

const espace = () => creerEspace({ racine: 'r', tableaux: { r: { titre: '', elements: [] } } })

function rendre(avecTelephone = true) {
  const telephone = vi.fn((_courant: string, _ouvrir: unknown, outils: { reglages(): void }) => ({
    plus: (
      <button type="button" data-essai="plus" onClick={outils.reglages}>
        •••
      </button>
    ),
    compte: <span data-essai="compte" />,
  }))
  act(() =>
    racine.render(
      <EspaceNotak
        espace={espace()}
        actions={() => <span data-essai="actions" />}
        actionsTableau={() => <span data-essai="export" />}
        partage={() => <span data-essai="partage" />}
        actionsCompte={() => <span data-essai="cloche" />}
        {...(avecTelephone ? { telephone } : {})}
      />,
    ),
  )
  return telephone
}
const present = (essai: string) => hote.querySelector(`.notak-entete [data-essai="${essai}"]`) !== null

describe('la barre du haut au téléphone', () => {
  it('ne garde que la loupe, « ••• » et le compte : ni partage, ni boutons du bureau, ni roue des réglages', () => {
    auDoigt(true)
    rendre()
    expect(present('plus')).toBe(true)
    expect(present('compte')).toBe(true)
    for (const essai of ['actions', 'export', 'partage', 'cloche']) expect(present(essai)).toBe(false)
    expect(hote.querySelector('.notak-ilot-partage')).toBeNull()
    expect(hote.querySelector('.notak-reglages-bouton')).toBeNull()
    const droite = hote.querySelector('.notak-ilot-compte')!
    expect(droite.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe('Chercher dans la toile')
  })

  it('« ••• » ouvre les réglages de la toile, que la roue ouvrait', () => {
    auDoigt(true)
    rendre()
    act(() => hote.querySelector<HTMLButtonElement>('[data-essai="plus"]')!.click())
    expect(document.querySelector('.notak-par-dessus')).not.toBeNull()
  })

  it('un écran posé sur la toile (la bibliothèque) en ouvre les réglages, sans passer par sa barre', () => {
    auDoigt(true)
    rendre(false)
    expect(document.querySelector('.notak-par-dessus')).toBeNull()
    act(() => demanderReglages())
    expect(document.querySelector('.notak-par-dessus')).not.toBeNull()
  })

  it('au bureau, rien ne change : les boutons, le partage et la roue, sans la version du téléphone', () => {
    auDoigt(false)
    const telephone = rendre()
    for (const essai of ['actions', 'export', 'partage', 'cloche']) expect(present(essai)).toBe(true)
    expect(hote.querySelector('.notak-reglages-bouton')).not.toBeNull()
    expect(telephone).not.toHaveBeenCalled()
  })

  it('sans version du téléphone (l’édition locale), le téléphone garde la barre qu’il avait', () => {
    auDoigt(true)
    rendre(false)
    expect(present('actions')).toBe(true)
    expect(hote.querySelector('.notak-reglages-bouton')).not.toBeNull()
  })
})

describe('la maison et ‹ au téléphone', () => {
  // L'accueil range « Clients », qui range « Dupont ».
  const carte = (id: string, cible: string) => ({ id, x: 0, y: 0, largeur: 10, contenu: { type: 'tableau' as const, cible } })
  const monde = () =>
    creerEspace({
      racine: 'r',
      tableaux: {
        r: { titre: '', elements: [carte('c1', 'clients')] },
        clients: { titre: 'Clients', elements: [carte('c2', 'dupont')] },
        dupont: { titre: 'Dupont', elements: [] },
      },
    })
  const ouvrir = (id: string, bibliotheque: () => void) =>
    act(() => racine.render(<EspaceNotak espace={monde()} adresse={{ lire: () => id, ecrire() {}, ecouter: () => () => {} }} bibliotheque={bibliotheque} />))
  const boutons = () => [...hote.querySelectorAll('.notak-ilot-fil button[aria-label]')].map((b) => b.getAttribute('aria-label'))

  it('une toile rangée à l’accueil rentre à la bibliothèque par la maison, et non à la toile d’accueil', () => {
    auDoigt(true)
    const bibliotheque = vi.fn()
    ouvrir('clients', bibliotheque)
    expect(boutons()).toEqual(['Bibliothèque'])
    act(() => hote.querySelector<HTMLButtonElement>('.notak-ilot-fil button[aria-label="Bibliothèque"]')!.click())
    expect(bibliotheque).toHaveBeenCalledOnce()
  })

  it('plus bas, ‹ remonte à la toile parente ; au bureau, la maison et ‹ restent côte à côte', () => {
    auDoigt(true)
    ouvrir('dupont', vi.fn())
    expect(boutons()).toEqual(['Revenir à la toile parente'])
    auDoigt(false)
    ouvrir('clients', vi.fn())
    expect(boutons().slice(0, 2)).toEqual(['Bibliothèque', 'Revenir à la toile parente'])
  })
})

describe('surplusBarre', () => {
  const ilot = (top: number, hauteur = 44) => ({ top, bottom: top + hauteur, height: hauteur })

  it('rien quand les îlots tiennent sur une ligne', () => {
    expect(surplusBarre([ilot(16), ilot(16), ilot(16)])).toBe(0)
    expect(surplusBarre([])).toBe(0)
  })

  it('la seconde ligne et son écart quand les îlots passent dessous', () => {
    expect(surplusBarre([ilot(16), ilot(16), ilot(64)])).toBe(48)
  })

  it('un îlot vide (caché) ne compte pas', () => {
    expect(surplusBarre([ilot(16), { top: 0, bottom: 0, height: 0 }])).toBe(0)
  })
})
