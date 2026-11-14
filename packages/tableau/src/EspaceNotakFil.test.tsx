// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerEspace } from './coeur/espace'
import { creerEspaceDistant } from './coeur/espaceDistant'
import type { Element, Id } from './coeur/tableau'
import './elements'
import { type Adresse, EspaceNotak, type NiveauRange } from './EspaceNotak'
import { definirLangue } from './langue'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Le fil de l'en-tête d'une toile : il part de la racine de son espace, qui mène à la bibliothèque. */

class ObservateurMuet {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  definirLangue('fr')
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
})

const carte = (cible: Id): Element => ({ id: `carte-${cible}`, x: 0, y: 0, largeur: 4, contenu: { type: 'tableau', cible } })
/** « Mon espace » range la toile t et l'accueil de l'équipe e, qui range la toile u. */
const espace = () =>
  creerEspace({
    racine: 'r',
    tableaux: {
      r: { titre: 'Accueil de Samy', elements: [carte('t'), carte('e')] },
      t: { titre: 'Une toile', elements: [] },
      e: { titre: 'Accueil de l’équipe', elements: [carte('u')] },
      u: { titre: 'Projet de l’équipe', elements: [] },
    },
  })

function rendre(ouverte: Id, o: { bibliotheque?: boolean; equipes?: { racine: Id; nom: string }[] } = {}) {
  const ecrits: Id[] = []
  const adresse: Adresse = { lire: () => ouverte, ecrire: (id) => void ecrits.push(id), ecouter: () => () => {} }
  const bibliotheque = vi.fn()
  const dossier = vi.fn()
  act(() =>
    racine.render(
      <EspaceNotak
        espace={espace()}
        adresse={adresse}
        dossier={dossier}
        {...(o.bibliotheque === false ? {} : { bibliotheque })}
        {...(o.equipes ? { espacesDEquipe: o.equipes } : {})}
      />,
    ),
  )
  return { ecrits, bibliotheque, dossier }
}
const niveaux = () => [...hote.querySelectorAll<HTMLButtonElement>('.notak-entete .notak-fil-segment')]

describe('le fil d’une toile part de la racine de son espace', () => {
  it('« Mon espace », avec la tuile de la bibliothèque : il mène à la bibliothèque, sur « Mon espace », et n’ouvre plus l’accueil en toile', () => {
    const { ecrits, dossier, bibliotheque } = rendre('t')
    expect(niveaux().map((b) => [b.textContent, b.dataset.genre])).toEqual([['Mon espace', 'accueil']])
    act(() => niveaux()[0]!.click())
    expect(dossier).toHaveBeenCalledWith('r', { remplacer: false })
    expect(bibliotheque).not.toHaveBeenCalled()
    expect(ecrits).not.toContain('r')
  })

  it('‹ d’une toile rangée à la racine y mène aussi', () => {
    const { ecrits, dossier } = rendre('t')
    act(() => hote.querySelector<HTMLButtonElement>('.notak-entete [aria-label="Revenir à la toile parente"]')!.click())
    expect(dossier).toHaveBeenCalledWith('r', { remplacer: false })
    expect(ecrits).not.toContain('r')
  })

  it('une toile d’un espace d’équipe part du nom de l’équipe, qui mène à la bibliothèque', () => {
    const { bibliotheque, dossier } = rendre('u', { equipes: [{ racine: 'e', nom: 'Silak' }] })
    expect(niveaux().map((b) => b.textContent)).toEqual(['Silak'])
    expect(hote.querySelector<HTMLInputElement>('.notak-entete .notak-fil-titre input')!.value).toBe('Projet de l’équipe')
    act(() => niveaux()[0]!.click())
    expect(bibliotheque).toHaveBeenCalledOnce()
    expect(dossier).not.toHaveBeenCalled()
  })

  it('sans bibliothèque (un hôte qui n’en a pas), la racine s’ouvre en toile, comme avant', () => {
    const { ecrits } = rendre('t', { bibliotheque: false })
    act(() => niveaux()[0]!.click())
    expect(ecrits).toContain('r')
  })
})

/** Un espace synchronisé, comme sur un serveur : son chemin, il l'apprend en naviguant, ou de l'hôte. Ses documents n'arrivent pas. */
const distant = () =>
  creerEspaceDistant({
    racine: 'r',
    utilisateur: { id: 'u1', nom: 'Samy', couleur: '#2f6feb' },
    reseau: {
      connecter: () => ({ awareness: null, lectureSeule: () => false, refuse: () => false, synchronise: () => false, detruire() {} }),
      declarer: async () => {},
    },
  })

describe('le fil d’une toile ouverte par son adresse (un lien, un rechargement)', () => {
  async function ouvrirParLAdresse(ouverte: Id, rangement: (id: Id) => Promise<readonly NiveauRange[] | null>, equipes?: { racine: Id; nom: string }[]) {
    const e = distant()
    const adresse: Adresse = { lire: () => ouverte, ecrire: () => {}, ecouter: () => () => {} }
    await act(async () =>
      racine.render(<EspaceNotak espace={e} adresse={adresse} dossier={vi.fn()} bibliotheque={vi.fn()} rangement={rangement} {...(equipes ? { espacesDEquipe: equipes } : {})} />),
    )
    await act(async () => {})
    return e
  }

  it('montre tout le chemin dès l’ouverture, comme l’hôte le sait ; ses dossiers se nomment le temps que leurs documents arrivent', async () => {
    const demandes: Id[] = []
    const e = await ouvrirParLAdresse('t', async (id) => {
      demandes.push(id)
      return [{ id: 'r', titre: 'Accueil de Samy' }, { id: 'p', titre: 'Projets', dossier: true }, { id: 'v', titre: 'Voyage' }]
    })
    expect(demandes).toEqual(['t'])
    expect(niveaux().map((b) => [b.textContent, b.dataset.genre])).toEqual([
      ['Mon espace', 'accueil'],
      ['Projets', 'dossier'],
      ['Voyage', 'toile'],
    ])
    // L'espace le retient : remonter (⌘U, ‹) va au parent où la toile est rangée.
    expect(e.parent('t')).toBe('v')
    act(() => racine.unmount())
    racine = createRoot(hote)
    e.detruire()
  })

  it('une toile d’un espace d’équipe part de son nom ; ce que l’hôte ne nomme pas (une toile qu’on ne lit pas) n’y est pas', async () => {
    const equipe = await ouvrirParLAdresse('u', async () => [{ id: 'e', titre: 'Accueil de l’équipe' }, { id: 'c', titre: 'Compta' }], [{ racine: 'e', nom: 'Silak' }])
    expect(niveaux().map((b) => b.textContent)).toEqual(['Silak', 'Compta'])
    act(() => racine.unmount())
    racine = createRoot(hote)
    equipe.detruire()
    // Un partage dont on ne lit pas le haut : rien au-dessus de lui, sinon la sortie vers « Mon espace ».
    const partage = await ouvrirParLAdresse('s', async () => [])
    expect(niveaux().map((b) => b.textContent)).toEqual(['Mon espace'])
    act(() => racine.unmount())
    racine = createRoot(hote)
    partage.detruire()
  })
})
