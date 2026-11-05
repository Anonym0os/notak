// @vitest-environment jsdom
import { type Element as ElementToile, creerEspace, definirLangue, montrerDemande } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EntreeBibliotheque } from './api'
import { PageBibliotheque, adresseDe, entreesDe, filtrer, sectionsParDate, sectionsParDossier, titreDe } from './Bibliotheque'

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
          : { genre: genre as 'document', element: e.element ?? 'd', titre: e.titre, lignes: ['Première ligne'] },
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

/** Une photo sans légende, un lien et un PDF posés sur « Voyage ». */
const PORTES: EntreeBibliotheque[] = [
  { ...entree({ tableau: 'voyage', titre: '', ou: 'Voyage', dans: 'voyage' }), element: 'port', genre: 'image', resume: { genre: 'image', element: 'port', titre: '', fichier: 'f-port', largeur: 4, hauteur: 3 } },
  {
    ...entree({ tableau: 'voyage', titre: '', ou: 'Voyage', dans: 'voyage' }),
    element: 'site',
    genre: 'lien',
    resume: { genre: 'lien', element: 'site', titre: '', url: 'https://www.hotel-lisbonne.pt/chambres', site: '' },
  },
  {
    ...entree({ tableau: 'voyage', titre: 'Billets', ou: 'Voyage', dans: 'voyage', vu: MAINTENANT }),
    element: 'billets',
    genre: 'fichier',
    resume: { genre: 'fichier', element: 'billets', titre: 'Billets', fichier: 'f-billets', nom: 'billets-tap.pdf', typeMime: 'application/pdf', taille: 12 },
  },
]

describe('les photos, les liens et les fichiers', () => {
  beforeEach(() => definirLangue('fr'))

  it('ont chacun leur rubrique, et les fichiers ouverts entrent dans les récents', () => {
    const toutes = [...TOUTES, ...PORTES]
    expect(entreesDe('photos', toutes).map((e) => e.element)).toEqual(['port'])
    expect(entreesDe('liens', toutes).map((e) => e.element)).toEqual(['site'])
    expect(entreesDe('fichiers', toutes).map((e) => e.element)).toEqual(['billets'])
    expect(entreesDe('recents', toutes)[0]!.element).toBe('billets')
    expect(entreesDe('toiles', toutes).every((e) => e.genre === 'toile')).toBe(true)
  })

  it('se nomment même sans titre : « Photo », le site du lien', () => {
    expect(PORTES.map(titreDe)).toEqual(['Photo', 'hotel-lisbonne.pt', 'Billets'])
  })

  it('se trouvent par l’adresse d’un lien et le nom d’un fichier', () => {
    expect(filtrer(PORTES, 'lisbonne').map((e) => e.element)).toEqual(['site'])
    expect(filtrer(PORTES, 'tap.pdf').map((e) => e.element)).toEqual(['billets'])
    expect(filtrer(PORTES, 'photo').map((e) => e.element)).toEqual(['port'])
  })

  it('n’ont pas d’adresse à eux : celle de leur toile', () => {
    expect(PORTES.map(adresseDe)).toEqual(['/t/voyage', '/t/voyage', '/t/voyage'])
  })
})

describe('les sections', () => {
  beforeEach(() => definirLangue('fr'))

  it('par date : aujourd’hui, cette semaine, plus tôt, puis jamais ouvertes', () => {
    expect(sectionsParDate(TOUTES, MAINTENANT).map((s) => [s.titre, s.entrees.map((e) => e.titre)])).toEqual([
      ['Aujourd’hui', ['Budget', 'Plan']],
      ['Cette semaine', ['Voyage']],
      ['Plus tôt', ['']],
      ['Pas encore ouverts', ['atelier']],
    ])
  })

  it('par dossier : une section par toile, la plus récemment ouverte d’abord, ce qui vient d’ailleurs en dernier', () => {
    expect(sectionsParDossier(TOUTES).map((s) => [s.titre, s.dans, s.entrees.map((e) => e.titre)])).toEqual([
      ['Voyage', 'voyage', ['Plan', '']],
      ['Accueil', 'racine', ['Voyage', 'atelier']],
      ['Partagés avec moi', null, ['Budget']],
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
  const tuiles = () => [...hote.querySelectorAll<HTMLElement>('[data-cle]')].map((li) => [li.querySelector('.biblio-tuile-titre')!.textContent, li.dataset.cle])

  it('s’ouvre sur les récents, rangés par date, avec la tuile qui crée en tête ; chaque rubrique dit combien elle en a', async () => {
    await ouvrir(async () => TOUTES)
    expect(rubrique('Récents').getAttribute('aria-current')).toBe('page')
    expect(hote.querySelector('h1')!.textContent).toBe('Récents')
    expect(rubrique('Toiles').textContent).toBe('Toiles3')
    expect(rubrique('Favoris').textContent).toBe('Favoris1')
    expect(hote.querySelector('.biblio-tuile-neuve')!.textContent).toContain('Nouvelle toile')
    expect(tuiles()[0]).toEqual(['Budget', 'budget/'])
    expect(hote.querySelectorAll('.biblio-tuile-ou')[2]!.textContent).toBe('dans Voyage')
  })

  it('une rubrique se choisit ; le tri par dossier regroupe et se retient', async () => {
    await ouvrir(async () => TOUTES)
    act(() => rubrique('Toiles').click())
    expect(location.search).toBe('?vue=toiles')
    expect(hote.querySelector('h1')!.textContent).toBe('Toiles')
    act(() => [...hote.querySelectorAll<HTMLButtonElement>('.biblio-tri-choix')].find((b) => b.textContent === 'Par dossier')!.click())
    expect(titres()).toEqual(['Accueil', 'Partagés avec moi'])
    expect(localStorage.getItem('notak:bibliotheque-tri')).toBe('dossier')
    // Rangée par dossier, une tuile ne répète pas sa toile : elle dit son genre.
    expect(hote.querySelector('[data-cle] .biblio-tuile-ou')!.textContent).toBe('Toile')
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
    expect(tuiles()).toEqual([['Plan', 'voyage/plan']])
    expect(hote.querySelector('.biblio-tuile-neuve')).toBeNull()
    saisir('zzz')
    expect(hote.querySelector('.biblio-vide')!.textContent).toContain('Rien ne s’appelle « zzz ».')
  })

  it('sans rien encore, le premier écran : de quoi créer, qui crée puis ouvre, au lieu d’une toile déjà remplie', async () => {
    const crees: string[] = []
    await ouvrir(
      async () => [],
      async (genre) => (crees.push(genre), { tableau: 'neuve', element: null }),
    )
    const premiers = hote.querySelector('.biblio-premiers')!
    expect(premiers.querySelector('h2')!.textContent).toBe('Bienvenue dans Notak')
    const choix = [...premiers.querySelectorAll<HTMLButtonElement>('.biblio-premiers-choix')]
    expect(choix.map((b) => b.querySelector('.biblio-premiers-libelle > span')!.textContent)).toEqual(['Toile', 'Page', 'Carte mentale'])
    await act(async () => choix[2]!.click())
    expect(crees).toEqual(['arbre'])
    expect(location.pathname).toBe('/t/neuve')
  })

  it('le premier écran propose le guide quand on peut le poser, et attend iCloud quand il le faut', async () => {
    await act(async () => racine.render(<PageBibliotheque charger={async () => []} decouvrir={async () => 'guide'} />))
    const decouvrir = [...hote.querySelectorAll<HTMLButtonElement>('.biblio-premiers-choix')].find((b) => b.textContent?.startsWith('Découvrir Notak'))!
    await act(async () => decouvrir.click())
    expect(location.pathname).toBe('/t/guide')
    await act(async () => racine.render(<PageBibliotheque charger={async () => []} attente />))
    expect(hote.querySelector('.biblio-premiers-attente')!.textContent).toBe('Recherche de vos toiles dans iCloud…')
    expect(hote.querySelector('.biblio-premiers-choix')).toBeNull()
  })

  it('le bouton Nouveau propose une toile, une page ou une carte mentale', async () => {
    const crees: string[] = []
    await ouvrir(
      async () => TOUTES,
      async (genre) => (crees.push(genre), { tableau: 'racine', element: 'doc' }),
    )
    act(() => hote.querySelector<HTMLButtonElement>('.biblio-nouveau-bouton')!.click())
    const choix = [...hote.querySelectorAll<HTMLButtonElement>('.biblio-menu [role="menuitem"]')]
    expect(choix.map((b) => b.querySelector('span')!.firstChild!.textContent)).toEqual(['Toile', 'Page', 'Carte mentale'])
    await act(async () => choix[1]!.click())
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

describe('les gestes', () => {
  let hote: HTMLDivElement
  let racine: Root
  beforeEach(() => {
    definirLangue('fr')
    localStorage.clear()
    history.replaceState(null, '', '/?vue=toiles')
    hote = document.createElement('div')
    document.body.append(hote)
    racine = createRoot(hote)
  })
  afterEach(() => {
    act(() => racine.unmount())
    hote.remove()
  })

  const renvoi = (id: string, cible: string, x: number): ElementToile => ({ id, x, y: 0, largeur: 10, contenu: { type: 'tableau', cible } })
  /** L'accueil porte « Voyage » et « atelier » ; « Voyage » porte la carte « Plan » et un document. */
  const monde = () =>
    creerEspace({
      racine: 'racine',
      tableaux: {
        racine: { titre: 'Accueil', elements: [renvoi('c-voyage', 'voyage', 0), renvoi('c-atelier', 'atelier', 20)] },
        voyage: {
          titre: 'Voyage',
          elements: [
            { id: 'plan', x: 0, y: 0, largeur: 20, contenu: { type: 'arbre', sujets: { c: { titre: 'Plan', ordre: 'a0' } } } } as ElementToile,
            { id: 'notes', x: 30, y: 0, largeur: 20, contenu: { type: 'document', titre: '' } } as unknown as ElementToile,
          ],
        },
        atelier: { titre: 'atelier', elements: [] },
        budget: { titre: 'Budget', elements: [] },
      },
    })
  const appels: [string, string, unknown][] = []
  const ouvrir = async (espace = monde(), nouveaux = 0, perdus = 0) => {
    appels.length = 0
    await act(async () =>
      racine.render(
        <PageBibliotheque
          charger={async () => TOUTES}
          espace={espace}
          rangerToile={async (toile, parent, options) => (appels.push([toile, parent, options ?? {}]), { nouveaux, perdus, permanents: 0, liensOuverts: 0, liensEteints: nouveaux > 0 ? 1 : 0, fait: !options?.essai })}
          definirFavori={async () => {}}
        />,
      ),
    )
    return espace
  }
  const tuile = (cle: string) => hote.querySelector<HTMLElement>(`[data-cle="${cle}"]`)!
  const appuyer = (el: Element, options: MouseEventInit = {}) =>
    act(() => {
      el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, ...options }))
      window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
    })
  const choisies = () => [...hote.querySelectorAll<HTMLElement>('[aria-selected="true"][data-cle]')].map((x) => x.dataset.cle)
  const touche = (key: string, options: KeyboardEventInit = {}) => act(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options })))
  const menu = (el: Element) => {
    act(() => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 })))
    return [...hote.querySelectorAll<HTMLButtonElement>('.notak-menu button')]
  }
  const entree = (libelle: string) => [...hote.querySelectorAll<HTMLButtonElement>('.notak-menu button')].find((b) => b.textContent?.startsWith(libelle))!

  it('un clic choisit, ⌘ ajoute, ⇧ prend la suite ; la barre de la sélection le dit ; Échap vide', async () => {
    await ouvrir()
    appuyer(tuile('voyage/'))
    expect(choisies()).toEqual(['voyage/'])
    appuyer(tuile('budget/'), { metaKey: true })
    expect(choisies()).toHaveLength(2)
    expect(hote.querySelector('.biblio-barre-choix')!.textContent).toContain('2 sélectionnés')
    appuyer(tuile('atelier/'), { shiftKey: true })
    expect(choisies()).toHaveLength(3)
    touche('Escape')
    expect(choisies()).toEqual([])
    touche('a', { metaKey: true })
    expect(choisies()).toHaveLength(3)
  })

  it('un double-clic ou Entrée ouvre', async () => {
    await ouvrir()
    act(() => tuile('budget/').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    expect(location.pathname).toBe('/t/budget')
    history.replaceState(null, '', '/?vue=toiles')
    appuyer(tuile('voyage/'))
    touche('Enter')
    expect(location.pathname).toBe('/t/voyage')
  })

  it('le clic droit d’une tuile dit ce qu’on peut en faire, avec des icônes', async () => {
    await ouvrir()
    const libelles = menu(tuile('voyage/')).map((b) => b.querySelector('.notak-e-libelle')!.textContent)
    expect(libelles).toEqual([
      'Ouvrir',
      'Afficher dans sa toile',
      'Renommer',
      'Dupliquer',
      'Retirer des favoris',
      'Déplacer vers…',
      'Copier le lien',
      'Mettre à la corbeille',
    ])
    expect(hote.querySelectorAll('.notak-menu .notak-e-icone svg')).toHaveLength(8)
    expect(choisies()).toEqual(['voyage/'])
  })

  it('le clic droit du fond crée, range et choisit tout', async () => {
    await ouvrir()
    const libelles = menu(hote.querySelector('.biblio-corps')!).map((b) => b.querySelector('.notak-e-libelle')!.textContent)
    expect(libelles).toEqual(['Nouveau', 'Nouveau dossier', 'Par date', 'Par dossier', 'Tout sélectionner'])
    act(() => entree('Tout sélectionner').click())
    expect(choisies()).toHaveLength(3)
  })

  it('met à la corbeille, et l’annule', async () => {
    const espace = await ouvrir()
    appuyer(tuile('atelier/'))
    await act(async () => touche('Backspace'))
    expect(tuile('atelier/')).toBeNull()
    expect(espace.tableau('racine')!.elements.find((e) => e.id === 'c-atelier')!.corbeille).toBeDefined()
    expect(hote.querySelector('.notak-avis')!.textContent).toContain('Mis à la corbeille')
    await act(async () => touche('z', { metaKey: true }))
    expect(espace.tableau('racine')!.elements.find((e) => e.id === 'c-atelier')!.corbeille).toBeUndefined()
    expect(tuile('atelier/')).not.toBeNull()
  })

  it('crée un dossier vide sans quitter la page, choisi et prêt à renommer ; ⇧⌘N fait de même', async () => {
    const espace = await ouvrir()
    menu(hote.querySelector('.biblio-corps')!)
    await act(async () => entree('Nouveau dossier').click())
    const carte = espace.tableau('racine')!.elements.find((e) => e.contenu.type === 'tableau' && !['voyage', 'atelier'].includes(e.contenu.cible))!
    const dossier = (carte.contenu as { cible: string }).cible
    expect(espace.tableau(dossier)!.titre).toBe('Nouveau dossier')
    expect(location.search).toBe('?vue=toiles')
    expect(choisies()).toEqual([`${dossier}/`])
    expect(hote.querySelector<HTMLInputElement>('.biblio-renommer')!.value).toBe('Nouveau dossier')
    expect(hote.querySelector('.notak-avis')!.textContent).toContain('Dossier créé dans « Accueil »')
    await act(async () => void hote.querySelector('.biblio-renommer')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    await act(async () => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'N', metaKey: true, shiftKey: true, bubbles: true })))
    expect(espace.tableau('racine')!.elements.filter((e) => e.contenu.type === 'tableau')).toHaveLength(4)
  })

  it('une photo, un lien ou un fichier s’ouvrent sur leur toile, centrée sur eux, et entrent dans les récents', async () => {
    history.replaceState(null, '', '/?vue=photos')
    const vus: unknown[] = []
    await act(async () => racine.render(<PageBibliotheque charger={async () => [...TOUTES, ...PORTES]} espace={monde()} noterVu={async (e) => void vus.push(e)} />))
    expect(hote.querySelector('h1')!.textContent).toBe('Photos')
    expect(tuile('voyage/port').querySelector('.biblio-tuile-titre')!.textContent).toBe('Photo')
    act(() => tuile('voyage/port').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    expect(location.pathname).toBe('/t/voyage')
    expect(montrerDemande()).toBe('port')
    expect(vus).toMatchObject([{ tableau: 'voyage', element: 'port' }])
  })

  it('le menu d’un lien l’ouvre ; ce qu’une toile porte se met en favori', async () => {
    history.replaceState(null, '', '/?vue=liens')
    const favoris: unknown[] = []
    const ouverture = vi.spyOn(window, 'open').mockReturnValue(null)
    await act(async () =>
      racine.render(<PageBibliotheque charger={async () => [...TOUTES, ...PORTES]} espace={monde()} definirFavori={async (...a) => void favoris.push(a)} />),
    )
    const libelles = menu(tuile('voyage/site')).map((b) => b.textContent)
    expect(libelles.some((l) => l?.startsWith('Ouvrir le lien'))).toBe(true)
    expect(libelles.some((l) => l === 'Ouvrir')).toBe(false)
    act(() => entree('Ouvrir le lien').click())
    expect(ouverture).toHaveBeenCalledWith('https://www.hotel-lisbonne.pt/chambres', '_blank', 'noopener,noreferrer')
    menu(tuile('voyage/site'))
    await act(async () => entree('Ajouter aux favoris').click())
    expect(favoris).toEqual([['voyage', true, 'site']])
    ouverture.mockRestore()
  })

  it('« Afficher dans sa toile » ouvre celle qui la porte et lui demande de la montrer ; pour une toile, sa carte', async () => {
    history.replaceState(null, '', '/')
    await ouvrir()
    menu(tuile('voyage/plan'))
    act(() => entree('Afficher dans sa toile').click())
    expect(location.pathname).toBe('/t/voyage')
    expect(montrerDemande()).toBe('plan')
    history.replaceState(null, '', '/?vue=toiles')
    menu(tuile('voyage/'))
    act(() => entree('Afficher dans sa toile').click())
    expect(location.pathname).toBe('/t/racine')
    expect(montrerDemande()).toBe('voyage')
  })

  it('renomme sur place', async () => {
    const espace = await ouvrir()
    appuyer(tuile('atelier/'))
    touche('F2')
    const champ = hote.querySelector<HTMLInputElement>('.biblio-renommer')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'Atelier bois')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(espace.tableau('atelier')!.titre).toBe('Atelier bois')
    expect(tuile('atelier/').querySelector('.biblio-tuile-titre')!.textContent).toBe('Atelier bois')
  })

  it('déplace une toile vers une autre ; quand cela change qui la voit, il le dit ligne à ligne avant', async () => {
    const espace = await ouvrir(undefined, 2, 1)
    menu(tuile('atelier/'))
    act(() => entree('Déplacer vers…').click())
    const options = [...hote.querySelectorAll<HTMLElement>('.biblio-deplacer-liste li')]
    // Ni elle-même ; l'accueil, où elle est déjà, est grisé.
    expect(options.map((o) => o.querySelector('.biblio-deplacer-nom')!.textContent)).toEqual(['Accueil', 'Budget', 'Voyage'])
    expect(options[0]!.getAttribute('aria-disabled')).toBe('true')
    await act(async () => options[2]!.click())
    expect([...hote.querySelectorAll('[role="alertdialog"] li')].map((l) => l.textContent)).toEqual([
      '2 personnes ou équipes qui ont accès à « Voyage » la verront aussi.',
      'Une personne ou une équipe qui la voit aujourd’hui n’y aura plus accès.',
      'Un lien de visiteur qui y mène ne l’ouvrira plus.',
    ])
    await act(async () => [...hote.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find((b) => b.textContent === 'Déplacer')!.click())
    expect(appels).toEqual([
      ['atelier', 'voyage', { essai: true }],
      ['atelier', 'voyage', {}],
    ])
    expect(espace.tableau('voyage')!.elements.some((e) => e.contenu.type === 'tableau' && e.contenu.cible === 'atelier')).toBe(true)
    expect(espace.tableau('racine')!.elements.some((e) => e.id === 'c-atelier')).toBe(false)
    expect(hote.querySelector('.notak-avis')!.textContent).toContain('Déplacé dans « Voyage »')
  })

  it('des fichiers lâchés sur une toile y sont importés ; ce qui en naît s’y montre aussitôt', async () => {
    const espace = monde()
    const importes: [string[], string][] = []
    const vus: string[] = []
    await act(async () =>
      racine.render(
        <PageBibliotheque
          charger={async () => TOUTES}
          espace={espace}
          definirFavori={async () => {}}
          noterVu={async (e) => void vus.push(`${e.tableau}/${e.element ?? ''}`)}
          importer={async (fichiers, dans) => {
            importes.push([fichiers.map((f) => f.name), dans])
            const doc = { id: 'cr', x: 0, y: 0, largeur: 10, contenu: { type: 'document', titre: 'Compte rendu', texte: { type: 'doc', content: [] } } } as unknown as ElementToile
            return { elements: [doc], toiles: [], refuses: ['vieux.pages'] }
          }}
        />,
      ),
    )
    const rubrique = (nom: string) => [...hote.querySelectorAll<HTMLButtonElement>('[data-rubrique]')].find((b) => b.textContent?.startsWith(nom))!
    act(() => rubrique('Pages').click())
    const fichier = new File(['# Compte rendu'], 'Compte rendu.md', { type: 'text/markdown' })
    const glisser = (type: string, sur: Element) => {
      const e = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(e, 'dataTransfer', { value: { types: ['Files'], files: [fichier], dropEffect: 'none' } })
      act(() => void sur.dispatchEvent(e))
      return e
    }
    // Sur le fond : l'accueil ; le bandeau dit où ils iraient.
    expect(glisser('dragover', hote.querySelector('.biblio-corps')!).defaultPrevented).toBe(true)
    expect(hote.querySelector('.biblio-apport')!.textContent).toBe('Déposer pour importer dans « Accueil »')
    act(() => rubrique('Toiles').click())
    glisser('dragover', tuile('voyage/'))
    expect(hote.querySelector('.biblio-apport')!.textContent).toBe('Déposer pour importer dans « Voyage »')
    expect(tuile('voyage/').hasAttribute('data-survol-depot')).toBe(true)
    await act(async () => void glisser('drop', tuile('voyage/')))
    expect(importes).toEqual([[['Compte rendu.md'], 'voyage']])
    expect(hote.querySelector('.biblio-apport')).toBeNull()
    expect(hote.querySelector('.notak-avis')!.textContent).toContain('Un fichier importé dans « Voyage » « vieux.pages » n’a pas pu être lu.')
    // Un document n'a pas sa place dans « Toiles » : on passe aux récents, où l'import compte, la tuile choisie.
    expect(rubrique('Récents').getAttribute('aria-current')).toBe('page')
    expect(vus).toEqual(['voyage/cr'])
    const arrivee = hote.querySelector<HTMLElement>('[data-cle="voyage/cr"]')!
    expect(arrivee.getAttribute('aria-selected')).toBe('true')
    expect(arrivee.hasAttribute('data-arrivee')).toBe(true)
    // Là où il a sa place, on reste : un document lâché sur « Pages ».
    act(() => rubrique('Pages').click())
    await act(async () => void glisser('drop', hote.querySelector('.biblio-corps')!))
    expect(rubrique('Pages').getAttribute('aria-current')).toBe('page')
  })

  describe('au doigt et au Pencil', () => {
    /** Un appui du doigt (ou du Pencil) : jsdom n'a pas de PointerEvent, son type se pose à la main. */
    const pointeur = (el: Element | Window, type: string, sorte: 'touch' | 'pen', init: MouseEventInit = {}) => {
      const e = new MouseEvent(type, { bubbles: true, button: 0, clientX: 50, clientY: 60, ...init })
      Object.defineProperties(e, { pointerType: { value: sorte }, pointerId: { value: 1 } })
      el.dispatchEvent(e)
    }
    /** Un écran qu'on touche, assez large pour la page du bureau (un iPad). */
    const ecranTactile = () =>
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)', media: q, addEventListener() {}, removeEventListener() {} }))
    afterEach(() => {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    })

    it('un appui long ouvre le menu de la tuile sans l’ouvrir ; le doigt qui bouge (on fait défiler) l’annule', async () => {
      await ouvrir()
      vi.useFakeTimers()
      act(() => pointeur(tuile('budget/'), 'pointerdown', 'touch'))
      act(() => pointeur(window, 'pointermove', 'touch', { clientX: 50, clientY: 90 }))
      act(() => void vi.advanceTimersByTime(600))
      expect(hote.querySelector('.notak-menu')).toBeNull()

      act(() => pointeur(tuile('voyage/'), 'pointerdown', 'touch'))
      act(() => void vi.advanceTimersByTime(500))
      expect(entree('Ouvrir')).toBeTruthy()
      expect(choisies()).toEqual(['voyage/'])
      // Le doigt se relève sur la tuile : le clic qui suit n'ouvre rien.
      act(() => {
        pointeur(window, 'pointerup', 'touch')
        tuile('voyage/').click()
      })
      expect(location.pathname).toBe('/')
    })

    it('un appui long sur le fond ouvre le menu du fond', async () => {
      await ouvrir()
      vi.useFakeTimers()
      act(() => pointeur(hote.querySelector('.biblio-corps')!, 'pointerdown', 'touch'))
      act(() => void vi.advanceTimersByTime(500))
      expect(entree('Nouveau dossier')).toBeTruthy()
    })

    it('le Pencil ouvre d’un toucher, comme le doigt', async () => {
      await ouvrir()
      act(() => {
        pointeur(tuile('budget/'), 'pointerdown', 'pen')
        tuile('budget/').click()
      })
      expect(location.pathname).toBe('/t/budget')
    })

    it('le « ••• » d’une tuile ouvre son menu, sans la choisir d’abord', async () => {
      await ouvrir()
      act(() => tuile('atelier/').querySelector<HTMLButtonElement>('.biblio-tuile-plus')!.click())
      expect(entree('Renommer')).toBeTruthy()
      expect(choisies()).toEqual(['atelier/'])
    })

    it('« Sélectionner » : toucher choisit et retire, la barre agit sur le choix, « OK » en sort', async () => {
      ecranTactile()
      await ouvrir()
      act(() => [...hote.querySelectorAll<HTMLButtonElement>('.biblio-choisir-bouton')].find((b) => b.textContent === 'Sélectionner')!.click())
      expect(hote.querySelector('.biblio-barre-choix')!.textContent).toContain('Touchez pour choisir')
      expect(hote.querySelectorAll('.biblio-tuile-case').length).toBeGreaterThan(0)
      const toucher = (cle: string) =>
        act(() => {
          pointeur(tuile(cle), 'pointerdown', 'touch')
          tuile(cle).click()
        })
      toucher('voyage/')
      toucher('budget/')
      expect(choisies().sort()).toEqual(['budget/', 'voyage/'])
      expect(location.pathname).toBe('/')
      expect(hote.querySelector('.biblio-barre-choix')!.textContent).toContain('2 sélectionnés')
      toucher('budget/')
      expect(choisies()).toEqual(['voyage/'])
      // La barre met en favori ce qui est choisi : « Voyage » l'est déjà, le bouton l'en retire.
      expect(hote.querySelector('.biblio-barre-choix [aria-label="Retirer des favoris"]')).not.toBeNull()
      act(() => [...hote.querySelectorAll<HTMLButtonElement>('.biblio-choisir-bouton')].find((b) => b.textContent === 'OK')!.click())
      expect(choisies()).toEqual([])
      expect(hote.querySelector('.biblio-tuile-case')).toBeNull()
    })

    it('renommer au doigt fait monter le clavier : un champ relais prend le focus dans le geste, puis le vrai', async () => {
      ecranTactile()
      await ouvrir()
      act(() => tuile('atelier/').querySelector<HTMLButtonElement>('.biblio-tuile-plus')!.click())
      act(() => entree('Renommer').click())
      expect(document.getElementById('notak-relais-clavier')).not.toBeNull()
      expect(document.activeElement).toBe(hote.querySelector('.biblio-renommer'))
    })
  })
})
