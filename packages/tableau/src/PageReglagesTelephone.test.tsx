// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageReglages } from './PageReglages'
import type { Reglages } from './reglages'
import { RUBRIQUES, lire, rubriquesVisibles } from './rubriquesReglages'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const reglages: Reglages = { theme: 'clair', taille: 'moyenne', doubleClic: true, grille: 10, barre: 'flottante' }
const outils = { caches: false, basculer() {} }

let racine: Root
let hote: HTMLElement
const largeur = window.innerWidth
beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
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

const ids = (telephone: boolean) => rubriquesVisibles({ reglages, changer: () => {}, outils }, RUBRIQUES, telephone)
const lignes = (telephone: boolean, rubrique: string) =>
  ids(telephone)
    .find((r) => r.id === rubrique)!
    .sections.flatMap((s) => s.lignes)

describe('le tri des réglages au téléphone', () => {
  it('écarte les raccourcis clavier, que le bureau garde', () => {
    expect(ids(false).map((r) => r.id)).toContain('raccourcis')
    expect(ids(true).map((r) => r.id)).not.toContain('raccourcis')
  })

  it('écarte la barre de gauche, les outils de la sélection et la taille de l’interface', () => {
    expect(lignes(false, 'tableau').map((l) => l.id)).toEqual(['doubleClic', 'minicarte', 'grille', 'barre', 'outils'])
    expect(lignes(true, 'tableau').map((l) => l.id)).toEqual(['doubleClic', 'minicarte', 'grille'])
    expect(lignes(false, 'apparence').map((l) => l.id)).toContain('taille')
    expect(lignes(true, 'apparence').map((l) => l.id)).not.toContain('taille')
  })

  it('écarte la rubrique de l’app de bureau, même quand l’application l’a posée', async () => {
    const { reglerRubriqueBureau } = await import('./rubriquesReglages')
    reglerRubriqueBureau(() => null)
    try {
      expect(ids(false).map((r) => r.id)).toContain('bureau')
      expect(ids(true).map((r) => r.id)).not.toContain('bureau')
    } finally {
      reglerRubriqueBureau(null)
    }
  })

  it('dit l’aide sans touches ni souris', () => {
    for (const rubrique of ['general', 'apparence', 'tableau']) {
      for (const l of lignes(true, rubrique)) {
        const aide = l.aide ? lire(l.aide) : ''
        expect(aide, l.id).not.toMatch(/⌘|⇧|clic|souris|navigateur|macOS/)
      }
    }
  })
})

describe('les réglages sur un téléphone', () => {
  const rg = () => document.querySelector('.notak-rg')!
  const rangee = (texte: string) => [...document.querySelectorAll<HTMLButtonElement>('.notak-rgt-racine .notak-rgt-rangee')].find((b) => b.textContent === texte)

  it('listent les rubriques en cartes, sans recherche ni raccourcis ; une rubrique glisse par-dessus, « Réglages » y ramène', () => {
    const fermer = vi.fn()
    act(() => racine.render(<PageReglages reglages={reglages} changer={() => {}} fermer={fermer} outils={outils} />))
    expect(rg().classList.contains('notak-rg-telephone')).toBe(true)
    expect(document.querySelector('.notak-champ-recherche')).toBeNull()
    expect([...document.querySelectorAll('.notak-rgt-racine .notak-rgt-rangee')].map((b) => b.textContent)).toEqual(['Général', 'Apparence', 'Toile'])
    expect(rg().classList.contains('notak-rg-poussee')).toBe(false)
    expect(document.querySelector('.notak-rgt-rubrique')!.hasAttribute('inert')).toBe(true)

    act(() => rangee('Toile')!.click())
    expect(rg().classList.contains('notak-rg-poussee')).toBe(true)
    expect(document.querySelector('.notak-rgt-racine')!.hasAttribute('inert')).toBe(true)
    expect(document.querySelector('.notak-rgt-rubrique .notak-rgt-barre-titre')!.textContent).toBe('Toile')
    expect([...document.querySelectorAll('.notak-rgt-rubrique .notak-rgt-entete')].map((h) => h.textContent)).toEqual(['Deux touchers sur le vide', 'Mini-carte', 'Grille'])

    act(() => document.querySelector<HTMLButtonElement>('.notak-rg-retour')!.click())
    expect(rg().classList.contains('notak-rg-poussee')).toBe(false)
    act(() => document.querySelector<HTMLButtonElement>('.notak-rg-ok')!.click())
    expect(fermer).toHaveBeenCalled()
  })

  it('un choix se coche ligne à ligne, et le toucher change le réglage', () => {
    const changer = vi.fn()
    act(() => racine.render(<PageReglages reglages={reglages} changer={changer} fermer={() => {}} />))
    act(() => rangee('Toile')!.click())
    const grille = [...document.querySelectorAll('.notak-rgt-rubrique [role="radiogroup"]')].find((g) => g.getAttribute('aria-label') === 'Grille')!
    const options = [...grille.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
    expect(options.map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true'])
    act(() => options[0]!.click())
    expect(changer).toHaveBeenCalledWith({ grille: 8 })
  })
  it('ouvrent sur la carte « Compte » quand l’application la donne : elle mène au compte et au serveur, photo et couleur dessous', async () => {
    const { reglerRubriqueCompte } = await import('./rubriquesReglages')
    reglerRubriqueCompte({ carte: (c) => <span className="essai-carte">{c.compte?.nom ?? 'Pas de compte'}</span>, rendre: () => <p className="essai-serveur">notak.exemple.fr</p> })
    const compte = { nom: 'Ada', couleur: '#2f6feb', photo: null, changerCouleur: async () => {}, changerPhoto: async () => {} }
    try {
      act(() => racine.render(<PageReglages reglages={reglages} changer={() => {}} fermer={() => {}} compte={compte} />))
      const carte = document.querySelector<HTMLButtonElement>('.notak-rgt-racine .notak-rgt-moi')!
      expect(carte.dataset.rubrique).toBe('compte')
      expect(carte.querySelector('.essai-carte')!.textContent).toBe('Ada')
      // « Profil » ne se répète pas : sa photo et sa couleur sont dans « Compte ».
      expect(rangee('Profil')).toBeUndefined()
      act(() => carte.click())
      expect(document.querySelector('.notak-rgt-rubrique .notak-rgt-barre-titre')!.textContent).toBe('Compte')
      expect(document.querySelector('.notak-rgt-rubrique .essai-serveur')).not.toBeNull()
      expect([...document.querySelectorAll('.notak-rgt-rubrique .notak-rgt-entete')].map((h) => h.textContent)).toEqual(['Serveur Notak', 'Photo', 'Couleur du compte'])
      // Sans compte (l'app, sans serveur) : la carte reste, la rubrique aussi.
      act(() => racine.render(<PageReglages reglages={reglages} changer={() => {}} fermer={() => {}} />))
      expect(document.querySelector('.notak-rgt-racine .essai-carte')!.textContent).toBe('Pas de compte')
    } finally {
      reglerRubriqueCompte(null)
    }
  })

  it('le bureau n’a pas de rubrique « Compte » : le menu du compte et « App de bureau » le disent déjà', async () => {
    const { reglerRubriqueCompte } = await import('./rubriquesReglages')
    reglerRubriqueCompte({ carte: () => null, rendre: () => null })
    try {
      expect(ids(false).map((r) => r.id)).not.toContain('compte')
      expect(ids(true).map((r) => r.id)).toContain('compte')
    } finally {
      reglerRubriqueCompte(null)
    }
  })
})
