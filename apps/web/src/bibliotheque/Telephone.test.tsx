// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EntreeBibliotheque } from '../api'
import { PageBibliotheque } from '../Bibliotheque'
import { Surligne } from './AuDoigt'
import type { EspaceRangement } from './actions'

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
        ? { genre, element: '', titre: e.titre, boites: [] }
        : genre === 'arbre'
          ? { genre, element: e.element ?? 'a', titre: e.titre, branches: ['Une'] }
          : { genre, element: e.element ?? 'd', titre: e.titre, lignes: ['Ligne'] },
    ...e,
  }
}

const MAINTENANT = Date.now()
const TOUTES: EntreeBibliotheque[] = [
  entree({ tableau: 'voyage', titre: 'Voyage', vu: MAINTENANT - 3_600_000, favori: true }),
  entree({ tableau: 'budget', titre: 'Budget', partage: true, vu: MAINTENANT - 60_000 }),
  ...['Atelier', 'Cuisine', 'Jardin', 'Lectures'].map((titre) => entree({ tableau: titre.toLowerCase(), titre, ou: 'Silak', dans: 'racine' })),
  entree({ tableau: 'voyage', element: 'plan', genre: 'arbre', titre: 'Plan', ou: 'Voyage', dans: 'voyage', vu: MAINTENANT - 7_200_000 }),
]

/** Juste ce que la page lit de l'espace : l'accueil et son titre. */
const espace = { racine: 'racine', ecouter: () => () => {}, tableau: (id: string) => (id === 'racine' ? { titre: 'Silak' } : undefined) } as unknown as EspaceRangement

/** Un téléphone (au doigt, étroit), ou un ordinateur. */
const ecran = (telephone: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: telephone && q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} }))

describe('la bibliothèque d’un serveur au téléphone', () => {
  let hote: HTMLDivElement
  let racine: Root
  beforeEach(() => {
    definirLangue('fr')
    history.replaceState(null, '', '/')
    hote = document.createElement('div')
    document.body.append(hote)
    racine = createRoot(hote)
    ecran(true)
  })
  afterEach(() => {
    act(() => racine.unmount())
    hote.remove()
    document.querySelectorAll('.notak-tiroir-bas-calque').forEach((n) => n.remove())
    vi.unstubAllGlobals()
  })

  const ouvrir = async (creer?: Parameters<typeof PageBibliotheque>[0]['creer']) => {
    await act(async () =>
      racine.render(
        <PageBibliotheque
          charger={async () => TOUTES}
          espace={espace}
          compte={<button type="button" className="essai-cloche" />}
          avatar={<button type="button" className="essai-avatar" />}
          {...(creer ? { creer } : {})}
        />,
      ),
    )
  }
  const filtre = (nom: string) => [...hote.querySelectorAll<HTMLButtonElement>('.biblio-locale-filtre')].find((b) => b.textContent?.startsWith(nom))!
  const titresDe = (selecteur: string) => [...hote.querySelectorAll(`${selecteur} .biblio-locale-titre`)].map((n) => n.textContent)

  it('prend la forme de la bibliothèque de l’appareil : grand titre, « + » et pastille du compte seule, récents, puis tout par genre', async () => {
    await ouvrir()
    expect(hote.querySelector('.biblio-colonne')).toBeNull()
    expect(hote.querySelector('.biblio-telephone h1')!.textContent).toBe('Bibliothèque')
    const actions = hote.querySelector('.biblio-locale-actions')!
    expect(actions.querySelector('.biblio-locale-plus')).not.toBeNull()
    expect(actions.querySelector('.essai-avatar')).not.toBeNull()
    // Ni cloche, ni insecte, ni réglages : la barre du bureau reste au bureau.
    expect(hote.querySelector('.essai-cloche')).toBeNull()
    expect(titresDe('.biblio-locale-rangee')).toEqual(['Budget', 'Voyage', 'Plan'])
    const toiles = hote.querySelector('#biblio-tel-toiles')!.closest('section')!
    expect(toiles.querySelector('h2')!.textContent).toBe('Toiles 6')
    expect(toiles.querySelectorAll('.biblio-locale-tuile')).toHaveLength(4)
    act(() => toiles.querySelector<HTMLButtonElement>('.biblio-locale-voir')!.click())
    expect(toiles.querySelectorAll('.biblio-locale-tuile')).toHaveLength(6)
    expect(hote.querySelector('#biblio-tel-cartes')!.textContent).toBe('Cartes mentales 1')
    // Sous une tuile, la toile qui la porte ; l'accueil porte tout, il ne se répète pas : on dit quand on l'a ouverte.
    const details = [...hote.querySelectorAll('.biblio-locale-rangee .biblio-locale-detail')].map((n) => n.textContent)
    expect(details).toEqual(['Aujourd’hui', 'Aujourd’hui', 'dans Voyage'])
    expect(toiles.querySelector('[data-genre] .biblio-locale-detail')!.textContent).toBe('Aujourd’hui')
  })

  it('la rangée des filtres glisse : l’accueil de l’espace s’ouvre, un filtre se choisit et se retient dans l’adresse', async () => {
    await ouvrir()
    expect(filtre('Tout').getAttribute('aria-pressed')).toBe('true')
    expect(filtre('Toiles').textContent).toBe('Toiles6')
    act(() => filtre('Favoris').click())
    expect(location.search).toBe('?vue=favoris')
    expect(filtre('Favoris').getAttribute('aria-pressed')).toBe('true')
    expect(titresDe('.biblio-locale-grille')).toEqual(['Voyage'])
    act(() => filtre('Tout').click())
    expect(location.search).toBe('')
    const accueil = hote.querySelector<HTMLButtonElement>('.biblio-locale-filtre[data-espace]')!
    expect(accueil.textContent).toBe('Silak')
    act(() => accueil.click())
    expect(location.pathname).toBe('/t/racine')
  })

  it('« + » ouvre la feuille de ce qu’on crée, crée sur l’accueil, puis ouvre', async () => {
    const crees: string[] = []
    await ouvrir(async (genre) => (crees.push(genre), { tableau: 'racine', element: 'doc' }))
    act(() => hote.querySelector<HTMLButtonElement>('.biblio-locale-plus')!.click())
    await act(async () => document.querySelector<HTMLButtonElement>(".biblio-locale-neuf button[data-genre='document']")!.click())
    expect(crees).toEqual(['document'])
    expect(location.pathname).toBe('/t/racine/e/doc')
  })

  it('la recherche replie le titre et répond sur les titres à chaque lettre', async () => {
    await ouvrir()
    const champ = hote.querySelector<HTMLInputElement>('.biblio-locale-recherche input')!
    act(() => champ.focus())
    expect(hote.querySelector('.biblio-telephone')!.hasAttribute('data-cherche')).toBe(true)
    expect(hote.querySelector('.biblio-locale-filtres')).toBeNull()
    const ecrire = (texte: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, texte)
        champ.dispatchEvent(new Event('input', { bubbles: true }))
      })
    ecrire('jard')
    expect(titresDe('.biblio-locale-resultats')).toEqual(['Jardin'])
    expect(hote.querySelector('.biblio-locale-ligne mark')!.textContent).toBe('Jard')
    ecrire('zzz')
    expect(hote.querySelector('.biblio-locale-vide')!.textContent).toContain('zzz')
    act(() => hote.querySelector<HTMLButtonElement>('.biblio-locale-annuler')!.click())
    expect(hote.querySelector('.biblio-locale-filtres')).not.toBeNull()
  })

  it('sur un ordinateur, la page du bureau ne change pas', async () => {
    ecran(false)
    await ouvrir()
    expect(hote.querySelector('.biblio-telephone')).toBeNull()
    expect(hote.querySelector('.biblio-colonne')).not.toBeNull()
    expect(hote.querySelector('.essai-cloche')).not.toBeNull()
    expect(hote.querySelector('.essai-avatar')).toBeNull()
  })
})

describe('Surligne', () => {
  it('met en gras les mots trouvés, accents compris', () => {
    expect(renderToStaticMarkup(<Surligne texte="Été à Paris" requete="ete paris" />)).toBe('<mark>Été</mark> à <mark>Paris</mark>')
  })
})
