// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { type ResultatRecherche, definirLangue, montrerDemande } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EntreeBibliotheque } from '../api'
import { CLE_BIENVENUE_SERVEUR, PageBibliotheque } from '../Bibliotheque'
import { acces, poserCoque, retirerCoque } from '../bureau/essai'
import { BibliothequeApp, CLE_BIENVENUE } from '../local/BibliothequeApp'
import { espaceLocal } from '../local/espace'
import { lireVus } from '../local/vus'
import { Surligne } from './AuDoigt'
import type { EspaceRangement } from './actions'

/**
 * La bibliothèque au téléphone : la même page qu'ailleurs, sous sa forme au doigt. Sur un serveur (`PageBibliotheque`)
 * comme dans l'app (`BibliothequeApp`, sur les toiles de l'appareil).
 */

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
          : { genre: genre as 'document', element: e.element ?? 'd', titre: e.titre, lignes: ['Ligne'] },
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

/** Un téléphone (au doigt, étroit), une tablette (au doigt, large) ou un ordinateur. */
const ecran = (sorte: 'telephone' | 'tablette' | 'ordinateur') =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: sorte !== 'ordinateur' && q.includes('coarse') && (sorte === 'telephone' || !q.includes('max-width')),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }))

const attendre = (ms = 50) => act(async () => void (await new Promise((fin) => setTimeout(fin, ms))))

let hote: HTMLDivElement
let racine: Root
beforeEach(() => {
  definirLangue('fr')
  localStorage.clear()
  history.replaceState(null, '', '/')
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  ecran('telephone')
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  document.querySelectorAll('.notak-tiroir-bas-calque').forEach((n) => n.remove())
  vi.unstubAllGlobals()
})

const filtre = (nom: string) => [...hote.querySelectorAll<HTMLButtonElement>('.biblio-locale-filtre')].find((b) => b.textContent?.startsWith(nom))!
const titres = (selecteur: string) => [...hote.querySelectorAll(`${selecteur} .biblio-tuile-titre`)].map((n) => n.textContent)
const section = (titre: string) => [...hote.querySelectorAll('.biblio-section')].find((s) => s.querySelector('h2')?.firstChild?.textContent === titre)!
const champ = () => hote.querySelector<HTMLInputElement>('.biblio-locale-recherche input')!
const ecrire = (texte: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ(), texte)
    champ().dispatchEvent(new Event('input', { bubbles: true }))
  })

describe('sur un serveur', () => {
  const fenetres = { reglages: vi.fn(), aide: vi.fn() }
  const ouvrir = async (o: Partial<Parameters<typeof PageBibliotheque>[0]> = {}) => {
    await act(async () =>
      racine.render(
        <PageBibliotheque
          charger={async () => TOUTES}
          espace={espace}
          fenetres={fenetres}
          compte={<button type="button" className="essai-cloche" />}
          avatar={<button type="button" className="essai-avatar" />}
          chercherContenu={async () => []}
          {...o}
        />,
      ),
    )
  }

  it('prend la forme au doigt : grand titre, réglages, compte et « + », l’accueil en vedette, puis l’accueil en rubriques', async () => {
    await ouvrir()
    expect(hote.querySelector('.biblio-colonne')).toBeNull()
    expect(hote.querySelector('.biblio-telephone h1')!.textContent).toBe('Bibliothèque')
    const actions = hote.querySelector('.biblio-locale-actions')!
    expect([...actions.children].map((n) => n.className)).toEqual(['biblio-locale-reglages', 'biblio-locale-avatar', 'biblio-locale-plus'])
    expect(actions.querySelector('.essai-avatar')).not.toBeNull()
    // Ni cloche, ni insecte : la barre du bureau reste au bureau.
    expect(hote.querySelector('.essai-cloche')).toBeNull()
    expect(hote.querySelector('.biblio-locale-vedette')!.textContent).toContain('Silak')
    // « Reprendre », ce qu'on a ouvert, glisse ; sous chaque tuile, la toile qui la porte, sinon quand on l'a ouverte.
    expect(titres('[data-rail]')).toEqual(['Budget', 'Voyage', 'Plan'])
    expect([...hote.querySelectorAll('[data-rail] .biblio-tuile-ou')].map((n) => n.textContent)).toEqual(['Aujourd’hui', 'Aujourd’hui', 'dans Voyage'])
    // Les toiles qui n'y sont pas déjà, quatre au téléphone, et « Tout voir » qui mène à la puce.
    expect(titres('.biblio-section:not([data-rail])')).toEqual(['Atelier', 'Cuisine', 'Jardin', 'Lectures'])
    act(() => section('Toiles').querySelector<HTMLButtonElement>('.biblio-voir')!.click())
    expect(filtre('Toiles').getAttribute('aria-pressed')).toBe('true')
    expect(hote.querySelectorAll('[data-cle]')).toHaveLength(6)
  })

  it('la rangée des filtres : où et quoi se combinent, un second toucher les retire, « Tout » revient à l’accueil', async () => {
    await ouvrir()
    expect(filtre('Tout').getAttribute('aria-pressed')).toBe('true')
    expect(filtre('Toiles').textContent).toBe('Toiles6')
    act(() => filtre('Favoris').click())
    expect(location.search).toBe('?vue=favoris')
    expect(titres('.biblio-corps')).toEqual(['Voyage'])
    act(() => filtre('Cartes mentales').click())
    expect(location.search).toBe('?vue=favoris&type=arbre')
    expect(hote.querySelector('.biblio-vide')!.textContent).toContain('Aucune carte mentale.')
    act(() => filtre('Favoris').click())
    expect(titres('.biblio-corps')).toEqual(['Plan'])
    act(() => filtre('Tout').click())
    expect([filtre('Tout').getAttribute('aria-pressed'), filtre('Cartes mentales').getAttribute('aria-pressed')]).toEqual(['true', 'false'])
    act(() => hote.querySelector<HTMLButtonElement>('.biblio-locale-vedette')!.click())
    expect(location.pathname).toBe('/t/racine')
  })

  it('« + » ouvre la feuille de ce qu’on crée, crée sur l’accueil, puis ouvre', async () => {
    const crees: string[] = []
    await ouvrir({ creer: async (genre) => (crees.push(genre), { tableau: 'racine', element: 'doc' }) })
    act(() => hote.querySelector<HTMLButtonElement>('.biblio-locale-plus')!.click())
    expect([...document.querySelectorAll('.biblio-locale-neuf button')].map((b) => b.getAttribute('data-genre'))).toEqual(['toile', 'document', 'arbre', 'dossier'])
    await act(async () => document.querySelector<HTMLButtonElement>(".biblio-locale-neuf button[data-genre='document']")!.click())
    expect(crees).toEqual(['document'])
    expect(location.pathname).toBe('/t/racine/e/doc')
  })

  it('la recherche replie le titre, répond sur les titres à chaque lettre, puis dans le contenu ; rien trouvé propose de créer', async () => {
    const passages: ResultatRecherche[] = [
      { tableau: 'cuisine', titre: 'Cuisine', element: 'n1', extrait: 'Planter des herbes au jardin' },
      { tableau: 'jardin', titre: 'Jardin', extrait: 'Jardin' },
    ]
    await ouvrir({ chercherContenu: async () => passages })
    act(() => champ().focus())
    expect(hote.querySelector('.biblio-telephone')!.hasAttribute('data-cherche')).toBe(true)
    expect(hote.querySelector('.biblio-locale-filtres')).toBeNull()
    ecrire('jard')
    expect([...hote.querySelectorAll('.biblio-locale-resultats:not(.biblio-passages) .biblio-locale-titre')].map((n) => n.textContent)).toEqual(['Jardin'])
    expect(hote.querySelector('.biblio-locale-ligne mark')!.textContent).toBe('Jard')
    // Le contenu répond un instant après ; le titre d'une toile, la recherche des titres l'a déjà.
    await attendre(260)
    const trouves = hote.querySelector('.biblio-passages')!
    expect(trouves.querySelector('h2')!.textContent).toBe('Dans le contenu')
    expect([...trouves.querySelectorAll('.biblio-locale-titre')].map((n) => n.textContent)).toEqual(['Cuisine'])
    expect(trouves.querySelector('mark')!.textContent).toBe('jard')
    act(() => trouves.querySelector<HTMLButtonElement>('.biblio-locale-ligne')!.click())
    expect(location.pathname).toBe('/t/cuisine')
    expect(montrerDemande()).toBe('n1')
  })

  it('rien trouvé : la toile de ce nom se crée ; « Annuler » rend la page', async () => {
    await ouvrir()
    act(() => champ().focus())
    ecrire('zzz')
    expect(hote.querySelector('.biblio-locale-vide')!.textContent).toContain('Aucun résultat pour « zzz »')
    expect(hote.querySelector('.biblio-locale-vide button')!.textContent).toBe('Créer la toile « zzz »')
    act(() => hote.querySelector<HTMLButtonElement>('.biblio-locale-annuler')!.click())
    expect(hote.querySelector('.biblio-locale-filtres')).not.toBeNull()
    expect(hote.querySelector('.biblio-telephone')!.hasAttribute('data-cherche')).toBe(false)
  })

  it('la roue ouvre les réglages, les mêmes que ceux de la toile', async () => {
    fenetres.reglages.mockClear()
    await ouvrir()
    const roue = hote.querySelector<HTMLButtonElement>('.biblio-locale-actions .biblio-locale-reglages')!
    expect(roue.getAttribute('aria-label')).toBe('Réglages')
    act(() => roue.click())
    expect(fenetres.reglages).toHaveBeenCalledOnce()
  })

  it('au premier passage, une carte de bienvenue ; « C’est parti » ouvre l’accueil, et elle ne revient plus', async () => {
    await ouvrir()
    const carte = hote.querySelector('.biblio-bienvenue')!
    expect(carte.querySelector('h2')!.textContent).toBe('Vos toiles sur ce serveur')
    expect(carte.querySelectorAll('li')).toHaveLength(3)
    act(() => carte.querySelector<HTMLButtonElement>('.biblio-bienvenue-partir')!.click())
    expect(location.pathname).toBe('/t/racine')
    expect(localStorage.getItem(CLE_BIENVENUE_SERVEUR)).toBe('1')
    act(() => racine.unmount())
    racine = createRoot(hote)
    await ouvrir()
    expect(hote.querySelector('.biblio-bienvenue')).toBeNull()
  })

  it('l’appui long ouvre le menu en feuille ; « Sélectionner » choisit la tuile tenue, et sa barre monte en bas', async () => {
    await ouvrir()
    const tuile = hote.querySelector<HTMLElement>('[data-cle="atelier/"]')!
    const doigt = (el: Element | Window, type: string) => {
      const e = new MouseEvent(type, { bubbles: true, button: 0, clientX: 40, clientY: 40 })
      Object.defineProperties(e, { pointerType: { value: 'touch' }, pointerId: { value: 1 } })
      el.dispatchEvent(e)
    }
    // En temps réel : le menu ignore un toucher trop proche de son ouverture, et de faux minuteurs fausseraient l'horloge.
    act(() => doigt(tuile, 'pointerdown'))
    await attendre(600)
    // Le doigt se relève sur la tuile : le clic qui suit, la page l'avale (il ouvrirait la tuile).
    act(() => {
      doigt(window, 'pointerup')
      tuile.click()
    })
    expect(location.search).toBe('')
    await attendre(300)
    // En feuille sur un vrai téléphone ; jsdom est trop large pour elle : en bulle.
    const ligne = [...document.querySelectorAll<HTMLButtonElement>('.notak-tiroir-bas-actions button, .notak-menu button')].find((b) => b.textContent?.trim() === 'Sélectionner')!
    act(() => ligne.click())
    expect(hote.querySelector('.biblio-locale-choix .biblio-barre-compte')!.textContent).toBe('1 sélectionné')
    expect(hote.querySelector('[data-cle="atelier/"]')!.getAttribute('aria-selected')).toBe('true')
  })

  it('un dossier s’y parcourt aussi, avec le retour à ce qui le porte et « Ouvrir la toile »', async () => {
    const avecDossier = TOUTES.map((e) => (e.tableau === 'voyage' && e.element === null ? { ...e, dans: 'racine', resume: { ...e.resume, dossier: true as const } } : e))
    await ouvrir({ charger: async () => avecDossier })
    act(() => hote.querySelector<HTMLElement>('[data-cle="voyage/"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    expect(location.search).toBe('?dossier=voyage')
    expect(hote.querySelector('.biblio-telephone h1')!.textContent).toBe('Voyage')
    expect(titres('.biblio-corps')).toEqual(['Plan'])
    expect(hote.querySelector('.biblio-locale-dossier a')!.getAttribute('href')).toBe('/t/voyage')
    act(() => hote.querySelector<HTMLButtonElement>('.biblio-locale-retour')!.click())
    expect(location.search).toBe('?dossier=racine')
  })

  it('le dossier d’une fiche d’un autre outil y mène aussi à sa fiche', async () => {
    const avecFiche = TOUTES.map((e) =>
      e.tableau === 'voyage' && e.element === null ? { ...e, dans: 'racine', resume: { ...e.resume, dossier: true as const }, fiche: { nom: 'Mon CRM', adresse: 'https://crm.exemple.fr/s/42' } } : e,
    )
    history.replaceState(null, '', '/?dossier=voyage')
    await ouvrir({ charger: async () => avecFiche })
    const fiche = hote.querySelector<HTMLAnchorElement>('.biblio-locale-fiche')!
    expect([fiche.textContent, fiche.getAttribute('href')]).toEqual(['Fiche dans Mon CRM', 'https://crm.exemple.fr/s/42'])
    // La ligne du dossier reste celle d'avant : le retour, et « Ouvrir la toile ».
    expect([...hote.querySelectorAll<HTMLAnchorElement>('.biblio-locale-dossier a')].map((a) => a.textContent)).toEqual(['Ouvrir la toile'])
  })

  it('sur un ordinateur, la page du bureau : ni roue ronde, ni carte de bienvenue', async () => {
    ecran('ordinateur')
    await ouvrir()
    expect(hote.querySelector('.biblio-telephone')).toBeNull()
    expect(hote.querySelector('.biblio-colonne')).not.toBeNull()
    expect(hote.querySelector('.essai-cloche')).not.toBeNull()
    expect(hote.querySelector('.essai-avatar')).toBeNull()
    expect(hote.querySelector('.biblio-locale-reglages, .biblio-bienvenue')).toBeNull()
  })

  it('sur un ordinateur comme sur un iPad, la toile d’accueil en tête, qu’un clic ouvre ; pas dans un dossier', async () => {
    ecran('ordinateur')
    await ouvrir()
    const vedette = hote.querySelector<HTMLButtonElement>('.biblio-corps .biblio-locale-vedette')!
    expect(vedette).not.toBeNull()
    act(() => vedette.click())
    expect(location.pathname).toBe('/t/racine')
  })

  it('dans un dossier, sur un ordinateur, pas de toile d’accueil en tête', async () => {
    ecran('ordinateur')
    history.replaceState(null, '', '/?dossier=voyage')
    await ouvrir()
    expect(hote.querySelector('.biblio-corps')).not.toBeNull()
    expect(hote.querySelector('.biblio-locale-vedette')).toBeNull()
  })
})

describe('dans l’app, sur les toiles de l’appareil', () => {
  /** L'app, son hôte compris : la page dans `HoteNotak`, comme au lancement. */
  const montrer = async () => {
    const el = await espaceLocal()
    await act(async () => racine.render(<BibliothequeApp el={el} importer={async () => ({ elements: [], toiles: [], refuses: [] })} rangement={<span className="essai-rangement" />} />))
    await attendre()
    return el
  }
  /** De quoi ne pas tomber sur le premier écran : une toile, sur l'accueil. */
  const avecUneToile = async (titre = 'Voyage') => {
    const el = await espaceLocal()
    const id = el.espace.creerTableau(titre, el.index.racine())
    await attendre()
    return { el, id }
  }

  it('l’accueil en vedette, en tête, s’ouvre au toucher ; ni pastille du stockage ni barre du bureau', async () => {
    const { el } = await avecUneToile()
    await montrer()
    await vi.waitFor(() => expect(hote.querySelector('.biblio-locale-vedette')).not.toBeNull())
    expect(hote.querySelector('.essai-rangement')).toBeNull()
    act(() => hote.querySelector<HTMLButtonElement>('.biblio-locale-vedette')!.click())
    expect(location.pathname).toBe(`/t/${el.index.racine()}`)
  })

  it('montre les toiles de l’appareil et ouvre celle qu’on touche', async () => {
    const { id } = await avecUneToile()
    await montrer()
    await vi.waitFor(() => expect(hote.querySelector(`[data-cle="${id}/"]`)).not.toBeNull())
    act(() => hote.querySelector<HTMLElement>(`[data-cle="${id}/"]`)!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    expect(location.pathname).toBe(`/t/${id}`)
  })

  it('dans l’app, le rond du compte, entre la roue et le « + », ouvre la feuille « Compte »', async () => {
    vi.stubEnv('VITE_EDITION', 'locale')
    poserCoque({ acces: () => acces() })
    try {
      await avecUneToile()
      await montrer()
      const ordre = [...hote.querySelector('.biblio-locale-actions')!.children].map((n) => n.className)
      expect(ordre).toEqual(['biblio-locale-reglages', 'biblio-locale-avatar', 'biblio-locale-plus'])
      const rond = hote.querySelector<HTMLButtonElement>('.biblio-locale-avatar .biblio-locale-compte-bouton')!
      expect(rond.getAttribute('aria-label')).toBe('Compte')
      act(() => rond.click())
      await attendre()
      expect(document.querySelector('.notak-tiroir-bas.compte-serveur-feuille .compte-serveur-tete strong')!.textContent).toBe('Pas de compte')
    } finally {
      retirerCoque()
      vi.unstubAllEnvs()
    }
  })

  it('dans un navigateur, pas de rond du compte : il n’y a pas de serveur à joindre', async () => {
    await avecUneToile()
    await montrer()
    expect(hote.querySelector('.biblio-locale-compte-bouton')).toBeNull()
  })

  describe('la carte de bienvenue', () => {
    it('au téléphone, la première fois : trois lignes, puis plus jamais une fois fermée', async () => {
      await avecUneToile()
      await montrer()
      const carte = await vi.waitFor(() => hote.querySelector('.biblio-bienvenue')!)
      expect(carte.querySelector('h2')!.textContent).toBe('Bienvenue dans Notak')
      expect(carte.querySelectorAll('li')).toHaveLength(3)
      expect(carte.textContent).toContain('touchez-la pour l’ouvrir')
      act(() => carte.querySelector<HTMLButtonElement>('.biblio-bienvenue-fermer')!.click())
      expect(hote.querySelector('.biblio-bienvenue')).toBeNull()
      expect(localStorage.getItem(CLE_BIENVENUE)).toBe('1')
      act(() => racine.unmount())
      racine = createRoot(hote)
      await montrer()
      expect(hote.querySelector('.biblio-bienvenue')).toBeNull()
    })

    it('« C’est parti » ouvre la toile d’accueil', async () => {
      const { el } = await avecUneToile()
      await montrer()
      act(() => hote.querySelector<HTMLButtonElement>('.biblio-bienvenue-partir')!.click())
      expect(location.pathname).toBe(`/t/${el.index.racine()}`)
    })

    it('sur une tablette, pas de carte : la page du bureau', async () => {
      ecran('tablette')
      await avecUneToile()
      await montrer()
      expect(hote.querySelector('.biblio-bienvenue')).toBeNull()
      expect(hote.querySelector('.biblio-colonne')).not.toBeNull()
    })
  })

  it('« + » › Toile en crée une sur l’accueil et l’ouvre ; une carte mentale s’y pose, s’ouvre en grand, et compte parmi les récents', async () => {
    const { el } = await avecUneToile()
    await montrer()
    act(() => hote.querySelector<HTMLButtonElement>('.biblio-locale-plus')!.click())
    await act(async () => document.querySelector<HTMLButtonElement>(".biblio-locale-neuf button[data-genre='toile']")!.click())
    await attendre()
    const neuve = decodeURIComponent(location.pathname.split('/')[2]!)
    expect(neuve).not.toBe(el.index.racine())
    expect(el.espace.existe(neuve)).toBe(true)
    history.replaceState(null, '', '/')
    act(() => hote.querySelector<HTMLButtonElement>('.biblio-locale-plus')!.click())
    await act(async () => document.querySelector<HTMLButtonElement>(".biblio-locale-neuf button[data-genre='arbre']")!.click())
    await attendre()
    const [, , tableau, , element] = location.pathname.split('/')
    expect(tableau).toBe(el.index.racine())
    expect(el.espace.magasin(tableau!).lire().elements.find((e) => e.id === element)?.contenu.type).toBe('arbre')
    expect(lireVus()[`${tableau}/e/${element}`]).toBeGreaterThan(0)
  })

  it('la recherche replie la page et répond sur les titres à chaque lettre', async () => {
    await avecUneToile('Recettes de saison')
    await montrer()
    await vi.waitFor(() => expect(hote.querySelector('.biblio-locale-vedette')).not.toBeNull())
    act(() => champ().focus())
    expect(hote.querySelector('.biblio-locale')!.hasAttribute('data-cherche')).toBe(true)
    expect(hote.querySelector('.biblio-locale-vedette')).toBeNull()
    ecrire('recet')
    expect([...hote.querySelectorAll('.biblio-locale-ligne .biblio-locale-titre')].map((n) => n.textContent)).toContain('Recettes de saison')
    expect(hote.querySelector('.biblio-locale-ligne mark')?.textContent).toBe('Recet')
    ecrire('introuvable')
    expect(hote.querySelector('.biblio-locale-vide')?.textContent).toContain('introuvable')
    act(() => hote.querySelector<HTMLButtonElement>('.biblio-locale-annuler')!.click())
    expect(hote.querySelector('.biblio-locale-vedette')).not.toBeNull()
  })
})

describe('Surligne', () => {
  it('met en gras les mots trouvés, accents compris', () => {
    expect(renderToStaticMarkup(<Surligne texte="Été à Paris" requete="ete paris" />)).toBe('<mark>Été</mark> à <mark>Paris</mark>')
  })
})
