// @vitest-environment jsdom
import { act, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Arbre, Id } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { OngletIcones } from './OngletIcones'
import type { Geste } from './modele/gestes'
import { ajouterEnfant, lire, nouvelArbre } from './modele/sujets'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const racines: { unmount(): void }[] = []
afterEach(() => {
  for (const r of racines.splice(0)) act(() => r.unmount())
  document.body.innerHTML = ''
})

function monter(noeud: ReactElement) {
  const hote = document.createElement('div')
  document.body.appendChild(hote)
  const racine = createRoot(hote)
  racines.push(racine)
  act(() => racine.render(noeud))
  return hote
}

function carte(): { a: Arbre; x: Id } {
  let a: Arbre = nouvelArbre('Central')
  let x: Id
  ;[a, x] = ajouterEnfant(a, lire(a).central, 'A')
  return { a, x }
}

const contexte = { services: { fichiers: { enregistrer: async () => 'fichier-1', adresse: async () => 'blob:x' } } } as unknown as ContexteToile

function panneau(onglet: 'marqueurs' | 'autocollants' | 'illustrations', a: Arbre, x: Id, faire: (g: Geste) => void = () => {}) {
  return monter(<OngletIcones onglet={onglet} arbre={a} lecture={lire(a)} ids={[x]} faire={faire} contexte={contexte} adresse={() => 'blob:x'} />)
}
const clic = (e: Element) => act(() => void e.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const bouton = (hote: HTMLElement, texte: string) => [...hote.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte || b.getAttribute('aria-label') === texte)!

describe('le panneau d’icônes : Marqueur', () => {
  it('sept groupes dans l’ordre, 58 marqueurs, la légende en tête, « Nouveau groupe » en pied', () => {
    const { a, x } = carte()
    const h = panneau('marqueurs', a, x)
    expect([...h.querySelectorAll('.notak-arbre-icones-entete')].map((e) => e.textContent)).toEqual(['Étiquette', 'Priorité', 'Tâche', 'Drapeau', 'Étoile', 'Personnes', 'Symbole'])
    expect(h.querySelectorAll('.notak-arbre-icones-marqueur')).toHaveLength(58)
    expect(h.querySelector('.notak-arbre-icones-legende')!.textContent).toBe('Afficher la légende')
    expect(h.querySelector('.notak-arbre-icones-pied')!.textContent).toBe('Nouveau groupe')
  })

  it('cliquer un marqueur le pose sur les sujets choisis ; un groupe se replie', () => {
    const { a, x } = carte()
    const gestes: Geste[] = []
    const h = panneau('marqueurs', a, x, (g) => gestes.push(g))
    clic(h.querySelectorAll('.notak-arbre-icones-marqueur')[8]!)
    expect(gestes).toEqual([{ type: 'marqueur', ids: [x], marqueur: 'priority-2' }])
    const tags = h.querySelector('[aria-label="Étiquette"]')!
    expect(tags.querySelectorAll('.notak-arbre-icones-marqueur')).toHaveLength(7)
    clic(h.querySelector('.notak-arbre-icones-entete button')!)
    expect(h.querySelector('[aria-label="Étiquette"]')).toBeNull()
  })

  it('un marqueur déjà posé sur tous les sujets choisis se montre cerclé', () => {
    const { a, x } = carte()
    const h = panneau('marqueurs', { ...a, sujets: { ...a.sujets, [x]: { ...a.sujets[x]!, marqueurs: ['flag-blue'] } } }, x)
    const pose = [...h.querySelectorAll('.notak-arbre-icones-marqueur[aria-pressed="true"]')]
    expect(pose.map((p) => p.getAttribute('aria-label'))).toEqual(['Drapeau bleu'])
  })

  it('la légende se bascule, et dit ce que chaque marqueur de la carte veut dire', () => {
    const { a, x } = carte()
    const gestes: Geste[] = []
    const avec = { ...a, sujets: { ...a.sujets, [x]: { ...a.sujets[x]!, marqueurs: ['priority-1'] } }, legende: { visible: true } }
    const h = panneau('marqueurs', avec, x, (g) => gestes.push(g))
    expect(h.querySelector('.notak-arbre-icones-legende')!.textContent).toBe('Masquer la légende')
    clic(h.querySelector('.notak-arbre-icones-legende')!)
    expect(gestes).toEqual([{ type: 'legende' }])
    const champ = h.querySelector<HTMLInputElement>('.notak-arbre-icones-ligne-legende input')!
    expect(champ).toBeTruthy()
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'Urgent')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => void champ.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(gestes.at(-1)).toEqual({ type: 'legendeTexte', marqueur: 'priority-1', texte: 'Urgent' })
  })

  it('« Nouveau groupe » crée un groupe, qu’on renomme sur place', () => {
    const { a, x } = carte()
    const gestes: Geste[] = []
    const h = panneau('marqueurs', a, x, (g) => gestes.push(g))
    clic(h.querySelector('.notak-arbre-icones-pied')!)
    expect(gestes[0]).toMatchObject({ type: 'groupe', action: 'creer', nom: 'Groupe sans titre' })
  })

  it('les groupes à soi : leur nom, le « + », le message d’un groupe vide, la confirmation avant de supprimer', () => {
    const { a, x } = carte()
    const gestes: Geste[] = []
    const avec: Arbre = { ...a, groupes: { g1: { ordre: 'V', nom: 'Logos', marqueurs: [] }, g2: { ordre: 'W', nom: 'Pays', marqueurs: [{ id: 'm1', nom: 'France', fichier: 'f' }] } } }
    const h = panneau('marqueurs', avec, x, (g) => gestes.push(g))
    const noms = [...h.querySelectorAll('.notak-arbre-icones-nom')].map((n) => n.textContent)
    expect(noms).toEqual(['Logos', 'Pays'])
    expect(h.textContent).toContain('Cliquez sur + pour ajouter un marqueur.')
    expect(h.querySelectorAll('[aria-label="Ajouter un marqueur"]')).toHaveLength(2)
    const france = h.querySelector('[aria-label="France"]')!
    clic(france)
    expect(gestes.at(-1)).toEqual({ type: 'marqueur', ids: [x], marqueur: 'perso-m1' })
    // Clic droit sur le titre d'un groupe : Renommer, Supprimer ; Supprimer demande confirmation.
    const entete = h.querySelectorAll('.notak-arbre-icones-entete')[7]!
    act(() => void entete.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 })))
    const menu = document.querySelector('[role=menu]')!
    expect([...menu.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Renommer', 'Supprimer'])
    clic([...menu.querySelectorAll('button')][1]!)
    expect(h.querySelector('[role=alertdialog]')!.textContent).toContain('Supprimer « Logos » ?')
    expect(gestes.some((g) => g.type === 'groupe' && g.action === 'supprimer')).toBe(false)
    clic(bouton(h.querySelector('[role=alertdialog]') as HTMLElement, 'Supprimer'))
    expect(gestes.at(-1)).toEqual({ type: 'groupe', action: 'supprimer', id: 'g1' })
  })
})

describe('le panneau d’icônes : Autocollant', () => {
  it('un filtre de catégorie, treize groupes, des cellules de quatre colonnes ; un clic pose l’autocollant', () => {
    const { a, x } = carte()
    const gestes: Geste[] = []
    const h = panneau('autocollants', a, x, (g) => gestes.push(g))
    const filtre = h.querySelector<HTMLSelectElement>('select')!
    expect([...filtre.options].map((o) => o.textContent)).toHaveLength(14)
    expect(filtre.options[0]!.textContent).toBe('Tout')
    expect(h.querySelectorAll('.notak-arbre-icones-entete')).toHaveLength(13)
    clic(h.querySelector('.notak-arbre-icones-autocollant')!)
    expect(gestes[0]).toMatchObject({ type: 'porter', ids: [x], champ: 'vignette', valeur: { genre: 'autocollant', l: 64, h: 64 } })
    act(() => {
      filtre.value = 'sport'
      filtre.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(h.querySelectorAll('.notak-arbre-icones-entete')).toHaveLength(1)
  })
})

describe('le panneau d’icônes : Illustration', () => {
  it('la liste des douze groupes avec leur nombre et trois vignettes, puis un groupe ouvert, puis le retour', () => {
    const { a, x } = carte()
    const gestes: Geste[] = []
    const h = panneau('illustrations', a, x, (g) => gestes.push(g))
    expect(h.querySelectorAll('.notak-arbre-icones-titre-groupe')).toHaveLength(12)
    expect(h.querySelectorAll('.notak-arbre-icones-illustration')).toHaveLength(36)
    clic(h.querySelector('.notak-arbre-icones-titre-groupe')!)
    expect(h.querySelector('.notak-arbre-icones-retour strong')!.textContent).toBe('Minimaliste')
    expect([...h.querySelectorAll('h4')].map((e) => e.textContent)).toEqual(['Productivité', 'Voyage', 'Vacances', 'Nourriture et boissons', 'Autres'])
    clic(h.querySelectorAll('.notak-arbre-icones-illustration')[0]!)
    expect(gestes[0]).toMatchObject({ type: 'porter', champ: 'vignette', valeur: { genre: 'illustration', id: 'minimaliste.productivite.0' } })
    clic(h.querySelector('.notak-arbre-icones-retour button')!)
    expect(h.querySelectorAll('.notak-arbre-icones-titre-groupe')).toHaveLength(12)
  })

  it('la recherche attend 200 ms, puis filtre par nom de groupe ou de catégorie, et dit quand rien ne va', () => {
    vi.useFakeTimers()
    try {
      const { a, x } = carte()
      const h = panneau('illustrations', a, x)
      const champ = h.querySelector<HTMLInputElement>('input[type=search]')!
      const saisir = (v: string) => {
        act(() => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, v)
          champ.dispatchEvent(new Event('input', { bubbles: true }))
        })
        act(() => void vi.advanceTimersByTime(250))
      }
      saisir('gemme')
      expect(h.querySelector('.notak-arbre-icones-aucun')!.textContent).toBe('Aucun résultat n’a été trouvé.')
      saisir('rubis')
      expect([...h.querySelectorAll('h4')].map((e) => e.textContent)).toEqual(['Pierres précieuses'])
      expect(h.querySelectorAll('.notak-arbre-icones-illustration')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
