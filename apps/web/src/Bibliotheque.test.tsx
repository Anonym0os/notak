// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { EntreeBibliotheque } from './api'
import { PageBibliotheque, adresseDe, entreesDe, filtrer, sectionsParDate, sectionsParDossier } from './Bibliotheque'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const entree = (e: Partial<EntreeBibliotheque> & Pick<EntreeBibliotheque, 'tableau' | 'titre'>): EntreeBibliotheque => {
  const genre = e.genre ?? 'toile'
  return {
    element: null,
    genre,
    ou: null,
    dans: null,
    vu: null,
    favori: false,
    partage: false,
    resume:
      genre === 'toile'
        ? { genre, element: '', titre: e.titre, boites: [[0, 0, 34, 7, 'jaune', 'note', 1]] }
        : genre === 'arbre'
          ? { genre, element: e.element ?? 'a', titre: e.titre, branches: ['Une', 'Deux', 'Trois'] }
          : { genre, element: e.element ?? 'd', titre: e.titre, lignes: ['Première ligne'] },
    ...e,
  }
}

const MAINTENANT = new Date(2026, 9, 25, 15, 0).getTime()
const JOUR = 86_400_000

const TOUTES: EntreeBibliotheque[] = [
  entree({ tableau: 'voyage', titre: 'Voyage', vu: MAINTENANT - 3 * JOUR, favori: true, ou: 'Accueil', dans: 'racine' }),
  entree({ tableau: 'atelier', titre: 'atelier', ou: 'Accueil', dans: 'racine' }),
  entree({ tableau: 'budget', titre: 'Budget', partage: true, vu: MAINTENANT - 60_000 }),
  entree({ tableau: 'voyage', element: 'plan', genre: 'arbre', titre: 'Plan', ou: 'Voyage', dans: 'voyage', vu: MAINTENANT - 3_600_000 }),
  entree({ tableau: 'voyage', element: 'notes', genre: 'document', titre: '', ou: 'Voyage', dans: 'voyage', vu: MAINTENANT - 20 * JOUR }),
]

describe('entreesDe', () => {
  it('trie par dernière ouverture, puis par titre, sans tenir à la casse', () => {
    expect(entreesDe('toiles', TOUTES).map((e) => e.titre)).toEqual(['Budget', 'Voyage', 'atelier'])
    expect(entreesDe('recents', TOUTES).map((e) => e.titre)).toEqual(['Budget', 'Plan', 'Voyage', ''])
  })

  it('range chaque genre dans sa rubrique, favoris et partages compris', () => {
    expect(entreesDe('cartes', TOUTES).map((e) => e.titre)).toEqual(['Plan'])
    expect(entreesDe('documents', TOUTES).map((e) => e.element)).toEqual(['notes'])
    expect(entreesDe('favoris', TOUTES).map((e) => e.tableau)).toEqual(['voyage'])
    expect(entreesDe('partages', TOUTES).map((e) => e.tableau)).toEqual(['budget'])
  })
})

describe('les sections', () => {
  beforeEach(() => definirLangue('fr'))

  it('par date : aujourd’hui, cette semaine, plus tôt, puis jamais ouvertes', () => {
    expect(sectionsParDate(TOUTES, MAINTENANT).map((s) => [s.titre, s.entrees.map((e) => e.titre)])).toEqual([
      ['Aujourd’hui', ['Budget', 'Plan']],
      ['Cette semaine', ['Voyage']],
      ['Plus tôt', ['']],
      ['Pas encore ouvertes', ['atelier']],
    ])
  })

  it('par dossier : une section par toile, la plus récemment ouverte d’abord, ce qui vient d’ailleurs en dernier', () => {
    expect(sectionsParDossier(TOUTES).map((s) => [s.titre, s.dans, s.entrees.map((e) => e.titre)])).toEqual([
      ['Voyage', 'voyage', ['Plan', '']],
      ['Accueil', 'racine', ['Voyage', 'atelier']],
      ['Partagées avec moi', null, ['Budget']],
    ])
  })

  it('la recherche ne tient ni aux accents ni à la casse, et lit aussi la toile qui porte', () => {
    expect(filtrer(TOUTES, 'ATELIER').map((e) => e.tableau)).toEqual(['atelier'])
    expect(filtrer(TOUTES, 'voyage plan').map((e) => e.element)).toEqual(['plan'])
    expect(filtrer(TOUTES, '  ')).toHaveLength(TOUTES.length)
    expect(filtrer([entree({ tableau: 'e', titre: 'Étape' })], 'etape')).toHaveLength(1)
  })

  it('ouvre une toile à son adresse, un élément en grand sur la sienne', () => {
    expect(adresseDe(TOUTES[0]!)).toBe('/t/voyage')
    expect(adresseDe(TOUTES[3]!)).toBe('/t/voyage/e/plan')
  })
})

describe('la page', () => {
  let hote: HTMLDivElement
  let racine: Root
  beforeEach(() => {
    definirLangue('fr')
    localStorage.clear()
    history.replaceState(null, '', '/')
    hote = document.createElement('div')
    document.body.append(hote)
    racine = createRoot(hote)
  })
  afterEach(() => {
    act(() => racine.unmount())
    hote.remove()
  })

  const ouvrir = async (charger: () => Promise<EntreeBibliotheque[]>, creer?: Parameters<typeof PageBibliotheque>[0]['creer']) => {
    await act(async () => racine.render(<PageBibliotheque charger={charger} {...(creer ? { creer } : {})} />))
  }
  const rubrique = (nom: string) => [...hote.querySelectorAll<HTMLButtonElement>('[data-rubrique]')].find((b) => b.textContent?.startsWith(nom))!
  const titres = () => [...hote.querySelectorAll('.biblio-section h2')].map((h) => h.textContent)
  const tuiles = () => [...hote.querySelectorAll<HTMLAnchorElement>('a.biblio-tuile')].map((a) => [a.querySelector('.biblio-tuile-titre')!.textContent, a.getAttribute('href')])

  it('s’ouvre sur les récents, rangés par date, avec la tuile qui crée en tête ; chaque rubrique dit combien elle en a', async () => {
    await ouvrir(async () => TOUTES)
    expect(rubrique('Récents').getAttribute('aria-current')).toBe('page')
    expect(hote.querySelector('h1')!.textContent).toBe('Récents')
    expect(rubrique('Toiles').textContent).toBe('Toiles3')
    expect(rubrique('Favoris').textContent).toBe('Favoris1')
    expect(hote.querySelector('.biblio-tuile-neuve')!.textContent).toContain('Nouvelle toile')
    expect(tuiles()[0]).toEqual(['Budget', '/t/budget'])
    expect(hote.querySelectorAll('.biblio-tuile-ou')[2]!.textContent).toBe('dans Voyage')
  })

  it('une rubrique se choisit ; le tri par dossier regroupe et se retient', async () => {
    await ouvrir(async () => TOUTES)
    act(() => rubrique('Toiles').click())
    expect(location.search).toBe('?vue=toiles')
    expect(hote.querySelector('h1')!.textContent).toBe('Toiles')
    act(() => [...hote.querySelectorAll<HTMLButtonElement>('.biblio-tri-choix')].find((b) => b.textContent === 'Par dossier')!.click())
    expect(titres()).toEqual(['Accueil', 'Partagées avec moi'])
    expect(localStorage.getItem('notak:bibliotheque-tri')).toBe('dossier')
    // Rangée par dossier, une tuile ne répète pas sa toile : elle dit son genre.
    expect(hote.querySelector('a.biblio-tuile .biblio-tuile-ou')!.textContent).toBe('Toile')
  })

  it('la recherche filtre tout, d’où qu’on soit, et dit quand rien ne répond', async () => {
    await ouvrir(async () => TOUTES)
    const champ = hote.querySelector<HTMLInputElement>('input[type="search"]')!
    const saisir = (v: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, v)
        champ.dispatchEvent(new Event('input', { bubbles: true }))
      })
    saisir('plan')
    expect(hote.querySelector('h1')!.textContent).toBe('Résultats')
    expect(tuiles()).toEqual([['Plan', '/t/voyage/e/plan']])
    expect(hote.querySelector('.biblio-tuile-neuve')).toBeNull()
    saisir('zzz')
    expect(hote.querySelector('.biblio-vide')!.textContent).toContain('Rien ne s’appelle « zzz ».')
  })

  it('sans rien d’ouvert, commence par les toiles ; la tuile neuve crée puis ouvre', async () => {
    const crees: string[] = []
    await ouvrir(
      async () => [],
      async (genre) => (crees.push(genre), { tableau: 'neuve', element: null }),
    )
    expect(rubrique('Toiles').getAttribute('aria-current')).toBe('page')
    expect(hote.querySelector('.biblio-vide')!.textContent).toContain('Aucune toile.')
    act(() => rubrique('Cartes mentales').click())
    await act(async () => hote.querySelector<HTMLButtonElement>('.biblio-tuile-neuve')!.click())
    expect(crees).toEqual(['arbre'])
    expect(location.pathname).toBe('/t/neuve')
  })

  it('le bouton Nouveau propose une toile, une carte ou un document', async () => {
    const crees: string[] = []
    await ouvrir(
      async () => TOUTES,
      async (genre) => (crees.push(genre), { tableau: 'racine', element: 'doc' }),
    )
    act(() => hote.querySelector<HTMLButtonElement>('.biblio-nouveau-bouton')!.click())
    const choix = [...hote.querySelectorAll<HTMLButtonElement>('.biblio-menu [role="menuitem"]')]
    expect(choix.map((b) => b.querySelector('span')!.firstChild!.textContent)).toEqual(['Toile', 'Carte mentale', 'Document'])
    await act(async () => choix[2]!.click())
    expect(crees).toEqual(['document'])
    expect(location.pathname).toBe('/t/racine/e/doc')
    expect(hote.querySelector('.biblio-menu')).toBeNull()
  })

  it('un échec se dit, et se réessaie', async () => {
    let fois = 0
    await ouvrir(async () => {
      if (fois++ === 0) throw new Error('Serveur injoignable')
      return TOUTES
    })
    expect(hote.querySelector('[role="alert"]')!.textContent).toContain('Serveur injoignable')
    await act(async () => hote.querySelector<HTMLButtonElement>('[role="alert"] button')!.click())
    expect(tuiles()).toHaveLength(4)
  })
})
