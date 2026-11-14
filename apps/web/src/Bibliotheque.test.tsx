// @vitest-environment jsdom
import { type Element as ElementToile, creerEspace, definirLangue, montrerDemande } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { EntreeBibliotheque } from './api'
import { PageBibliotheque, adresseDe, entreesDe, filtrer, sectionsDeLAccueil, sectionsParDate, sectionsParDossier, titreDe } from './Bibliotheque'

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
    expect(entreesDe({ portee: 'tout', filtre: 'toile' }, TOUTES).map((e) => e.titre)).toEqual(['Budget', 'Voyage', 'atelier'])
    expect(entreesDe({ portee: 'recents', filtre: 'tout' }, TOUTES).map((e) => e.titre)).toEqual(['Budget', 'Plan', 'Voyage', ''])
  })

  it('range chaque genre dans sa rubrique, favoris et partages compris', () => {
    expect(entreesDe({ portee: 'tout', filtre: 'arbre' }, TOUTES).map((e) => e.titre)).toEqual(['Plan'])
    expect(entreesDe({ portee: 'tout', filtre: 'document' }, TOUTES).map((e) => e.element)).toEqual(['notes'])
    expect(entreesDe({ portee: 'favoris', filtre: 'tout' }, TOUTES).map((e) => e.tableau)).toEqual(['voyage'])
    expect(entreesDe({ portee: 'partages', filtre: 'tout' }, TOUTES).map((e) => e.tableau)).toEqual(['budget'])
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

  it('ont chacun leur puce, et les fichiers ouverts entrent dans les récents, sous la leur ; « Tout » ne les mêle pas aux toiles', () => {
    const toutes = [...TOUTES, ...PORTES]
    expect(entreesDe({ portee: 'tout', filtre: 'image' }, toutes).map((e) => e.element)).toEqual(['port'])
    expect(entreesDe({ portee: 'tout', filtre: 'lien' }, toutes).map((e) => e.element)).toEqual(['site'])
    expect(entreesDe({ portee: 'tout', filtre: 'fichier' }, toutes).map((e) => e.element)).toEqual(['billets'])
    expect(entreesDe({ portee: 'recents', filtre: 'fichier' }, toutes).map((e) => e.element)).toEqual(['billets'])
    expect(entreesDe({ portee: 'tout', filtre: 'toile' }, toutes).every((e) => e.genre === 'toile')).toBe(true)
    for (const portee of ['tout', 'recents'] as const) expect(entreesDe({ portee, filtre: 'tout' }, toutes).map((e) => e.genre)).not.toContain('fichier')
    // Le dossier qui les porte les montre, lui, sous « Tout ».
    expect(entreesDe({ portee: 'tout', filtre: 'tout', dossier: 'voyage' }, toutes).map((e) => e.element).sort()).toEqual(['billets', 'notes', 'plan', 'port', 'site'])
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

  it('l’accueil de la bibliothèque : reprendre, favoris, puis un genre qui s’ouvre par rubrique, chaque entrée une seule fois', () => {
    const beaucoup = Array.from({ length: 10 }, (_, i) => entree({ tableau: `t${i}`, titre: `Toile ${i}` }))
    const s = sectionsDeLAccueil(entreesDe({ portee: 'tout', filtre: 'tout' }, [...TOUTES, ...PORTES, ...beaucoup]))
    // Ni photos, ni liens, ni fichiers : le PDF ouvert n'entre pas dans « Reprendre », et ils n'ont pas de rubrique.
    expect(s.map((x) => [x.titre, x.entrees.length, x.voir ?? null])).toEqual([
      ['Reprendre', 4, null],
      ['Toiles', 8, { portee: 'tout', filtre: 'toile' }],
    ])
    // Même si on les lui donnait, il ne leur fait pas de rubrique : leur puce les montre.
    expect(sectionsDeLAccueil(PORTES).map((x) => x.cle)).toEqual(['reprendre'])
    const cles = s.flatMap((x) => x.entrees.map((e) => `${e.tableau}/${e.element ?? ''}`))
    expect(new Set(cles).size).toBe(cles.length)
    // « Voyage », favori et ouvert, est dans « Reprendre » : « Favoris » n'a plus rien à montrer.
    expect(s.some((x) => x.cle === 'favoris')).toBe(false)
  })

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
  const puce = (nom: string) => [...hote.querySelectorAll<HTMLButtonElement>('.biblio-puce')].find((b) => b.textContent?.startsWith(nom))!
  const titres = () => [...hote.querySelectorAll('.biblio-section h2')].map((h) => h.textContent)
  const tuiles = () => [...hote.querySelectorAll<HTMLElement>('[data-cle]')].map((li) => [li.querySelector('.biblio-tuile-titre')!.textContent, li.dataset.cle])

  it('s’ouvre sur les récents, rangés par date, avec la tuile qui crée en tête ; la colonne et les puces disent combien', async () => {
    await ouvrir(async () => TOUTES)
    expect(rubrique('Récents').getAttribute('aria-current')).toBe('page')
    expect(hote.querySelector('h1')!.textContent).toBe('Récents')
    expect(rubrique('Bibliothèque').textContent).toBe('Bibliothèque5')
    expect(rubrique('Favoris').textContent).toBe('Favoris1')
    // Les puces comptent là où l'on est : deux toiles ouvertes parmi trois.
    expect(puce('Tout').getAttribute('aria-pressed')).toBe('true')
    expect(puce('Toiles').textContent).toBe('Toiles2')
    expect(puce('Photos').hasAttribute('data-vide')).toBe(true)
    expect(hote.querySelector('.biblio-tuile-neuve')!.textContent).toContain('Nouvelle toile')
    expect(tuiles()[0]).toEqual(['Budget', 'budget/'])
    expect(hote.querySelectorAll('.biblio-tuile-ou')[2]!.textContent).toBe('dans Voyage')
  })

  it('ce qu’on range ailleurs (le dossier d’une fiche de Silak, la toile d’un collègue) paraît au retour sur la page, sans la recharger', async () => {
    let liste = TOUTES
    let lectures = 0
    let panne = false
    await ouvrir(async () => {
      lectures++
      if (panne) throw new Error('hors ligne')
      return liste
    })
    act(() => rubrique('Bibliothèque').click())
    const avant = tuiles()
    liste = [...TOUTES, entree({ tableau: 'dupont', titre: 'Dupont SARL', ou: 'Accueil', dans: 'racine' })]
    // La page vient de se lire : un instant plus tard, la fenêtre redevient active.
    const plusTard = Date.now() + 60_000
    const horloge = vi.spyOn(Date, 'now').mockReturnValue(plusTard)
    await act(async () => void window.dispatchEvent(new Event('focus')))
    expect(tuiles().map(([titre]) => titre)).toContain('Dupont SARL')
    expect(hote.querySelector('[role=alert]')).toBeNull()
    // Rien n'a changé : la page garde ce qu'elle montre, tuile pour tuile.
    horloge.mockReturnValue(plusTard + 60_000)
    const vues = tuiles()
    await act(async () => void window.dispatchEvent(new Event('focus')))
    expect(tuiles()).toEqual(vues)
    expect(vues).not.toEqual(avant)
    // Une panne passagère laisse la liste qu'on voit.
    horloge.mockReturnValue(plusTard + 120_000)
    panne = true
    await act(async () => void window.dispatchEvent(new Event('focus')))
    expect(tuiles()).toEqual(vues)
    expect(lectures).toBe(4)
    horloge.mockRestore()
  })

  it('où et quoi se choisissent et se combinent ; le tri par dossier regroupe et se retient', async () => {
    await ouvrir(async () => TOUTES)
    act(() => puce('Cartes mentales').click())
    expect(location.search).toBe('?type=arbre')
    expect(tuiles()).toEqual([['Plan', 'voyage/plan']])
    act(() => rubrique('Favoris').click())
    expect(hote.querySelector('.biblio-vide')!.textContent).toContain('Aucune carte mentale.La puce « Tout » montre le reste.')
    act(() => rubrique('Bibliothèque').click())
    act(() => puce('Toiles').click())
    expect(location.search).toBe('?vue=tout&type=toile')
    expect(hote.querySelector('h1')!.textContent).toBe('Toiles')
    expect(tuiles().map(([, cle]) => cle)).toEqual(['budget/', 'voyage/', 'atelier/'])
    act(() => [...hote.querySelectorAll<HTMLButtonElement>('.biblio-tri-choix')].find((b) => b.textContent === 'Par dossier')!.click())
    expect(titres()).toEqual(['Accueil', 'Partagés avec moi'])
    expect(localStorage.getItem('notak:bibliotheque-tri')).toBe('dossier')
    // Rangée par dossier, une tuile ne répète pas sa toile : elle dit son genre.
    expect(hote.querySelector('[data-cle] .biblio-tuile-ou')!.textContent).toBe('Toile')
  })

  it('« Tout » montre ce qui s’ouvre ; les photos, liens et fichiers restent sous leur puce, qui les compte', async () => {
    await ouvrir(async () => [...TOUTES, ...PORTES])
    act(() => rubrique('Bibliothèque').click())
    // La colonne compte ce que la rubrique montre : cinq toiles, pages et cartes mentales.
    expect(rubrique('Bibliothèque').textContent).toBe('Bibliothèque5')
    expect(titres()).toEqual(['Reprendre', 'ToilesTout voir'])
    expect(tuiles().map(([, cle]) => cle).filter((c) => /port|site|billets/.test(c!))).toEqual([])
    expect(['Photos', 'Liens', 'Fichiers'].map((p) => puce(p).textContent)).toEqual(['Photos1', 'Liens1', 'Fichiers1'])
    act(() => puce('Photos').click())
    expect(tuiles()).toEqual([['Photo', 'voyage/port']])
    // Les récents gardent la puce ; sous « Tout », le PDF qu'on vient d'ouvrir reste sous la sienne.
    act(() => rubrique('Récents').click())
    act(() => puce('Tout').click())
    expect(tuiles().map(([, cle]) => cle)).toEqual(['budget/', 'voyage/plan', 'voyage/', 'voyage/notes'])
    act(() => puce('Fichiers').click())
    expect(tuiles()).toEqual([['Billets', 'voyage/billets']])
    // La recherche, elle, trouve tout : un PDF par son nom.
    const champ = hote.querySelector<HTMLInputElement>('input[type="search"]')!
    act(() => puce('Tout').click())
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'tap.pdf')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(tuiles()).toEqual([['Billets', 'voyage/billets']])
  })

  it('dans un dossier comme parmi les favoris, « Tout » montre aussi ce qu’on y a rangé ou choisi', async () => {
    history.replaceState(null, '', '/?dossier=voyage')
    await ouvrir(async () => [...TOUTES, ...PORTES.map((e) => (e.element === 'port' ? { ...e, favori: true } : e))])
    expect(tuiles().map(([, cle]) => cle).sort()).toEqual(['voyage/billets', 'voyage/notes', 'voyage/plan', 'voyage/port', 'voyage/site'])
    act(() => rubrique('Favoris').click())
    expect(tuiles().map(([, cle]) => cle).sort()).toEqual(['voyage/', 'voyage/port'])
    expect(rubrique('Favoris').textContent).toBe('Favoris2')
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

  it('la bibliothèque s’ouvre sur son accueil en rubriques ; « Tout voir » mène à la puce du genre', async () => {
    const beaucoup = Array.from({ length: 10 }, (_, i) => entree({ tableau: `t${i}`, titre: `Toile ${i}` }))
    await ouvrir(async () => [...TOUTES, ...beaucoup])
    act(() => rubrique('Bibliothèque').click())
    expect(titres()).toEqual(['Reprendre', 'ToilesTout voir'])
    act(() => hote.querySelector<HTMLButtonElement>('.biblio-voir')!.click())
    expect(location.search).toBe('?vue=tout&type=toile')
    expect(puce('Toiles').getAttribute('aria-pressed')).toBe('true')
    expect(hote.querySelectorAll('[data-cle]')).toHaveLength(13)
  })

  it('le tiroir de la colonne : ☰ l’ouvre ; une rubrique, Échap ou le voile le referment ; son « + » crée', async () => {
    const crees: string[] = []
    await ouvrir(
      async () => TOUTES,
      async (genre) => (crees.push(genre), { tableau: 'racine', element: null }),
    )
    const bouton = hote.querySelector<HTMLButtonElement>('[aria-controls="biblio-colonne"]')!
    const ouvert = () => hote.querySelector('.biblio')!.hasAttribute('data-tiroir')
    act(() => bouton.click())
    expect([ouvert(), bouton.getAttribute('aria-expanded')]).toEqual([true, 'true'])
    act(() => rubrique('Favoris').click())
    expect([ouvert(), hote.querySelector('h1')!.textContent]).toEqual([false, 'Favoris'])
    act(() => bouton.click())
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(ouvert()).toBe(false)
    expect(document.activeElement).toBe(bouton)
    act(() => bouton.click())
    act(() => void hote.querySelector('.biblio-voile')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })))
    expect(ouvert()).toBe(false)
    act(() => hote.querySelector<HTMLButtonElement>('.biblio-nouveau-tete .biblio-nouveau-bouton')!.click())
    const choix = [...hote.querySelectorAll<HTMLButtonElement>('.biblio-nouveau-tete [role="menuitem"]')]
    expect(choix.map((b) => b.querySelector('span')!.firstChild!.textContent)).toEqual(['Toile', 'Page', 'Carte mentale'])
    await act(async () => choix[0]!.click())
    expect(crees).toEqual(['toile'])
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
    // Rangée à la racine, elle n'a pas de toile où se montrer : la racine n'en est pas une.
    expect(libelles).toEqual([
      'Ouvrir',
      'Parcourir',
      'Renommer',
      'Dupliquer',
      'Retirer des favoris',
      'Afficher comme dossier',
      'Déplacer vers…',
      'Copier le lien',
      'Mettre à la corbeille',
    ])
    expect(hote.querySelectorAll('.notak-menu .notak-e-icone svg')).toHaveLength(9)
    expect(choisies()).toEqual(['voyage/'])
  })

  describe('les dossiers', () => {
    /** « Voyage » se montre en dossier ; il porte la carte « Plan » et une page. */
    const AVEC_DOSSIER = TOUTES.map((e) => (e.tableau === 'voyage' && e.element === null ? { ...e, resume: { ...e.resume, dossier: true as const } } : e))

    it('un dossier s’ouvre ici, en liste de ce qu’il porte, avec son chemin et sans toile à ouvrir ; ce qu’on crée y va', async () => {
      history.replaceState(null, '', '/')
      const crees: [string, string | undefined][] = []
      await act(async () =>
        racine.render(<PageBibliotheque charger={async () => AVEC_DOSSIER} espace={monde()} creer={async (g, dans) => (crees.push([g, dans]), { tableau: dans ?? 'racine', element: 'neuf' })} />),
      )
      // Rangé à la racine, il dit ce qu'il est : la racine porte tout.
      expect(tuile('voyage/').querySelector('.biblio-tuile-ou')!.textContent).toBe('Dossier')
      act(() => tuile('voyage/').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
      expect(location.pathname).toBe('/')
      expect(location.search).toBe('?dossier=voyage')
      expect(hote.querySelector('h1')!.textContent).toBe('Voyage')
      expect([...hote.querySelectorAll('.biblio-fil button')].map((b) => b.textContent)).toEqual(['Mon espace'])
      // Un dossier n'est pas une toile : rien ne propose de l'ouvrir comme telle.
      expect(hote.querySelector('.biblio-ouvrir-toile-lien')).toBeNull()
      expect([...hote.querySelectorAll<HTMLElement>('[data-cle]')].map((x) => x.dataset.cle).sort()).toEqual(['voyage/notes', 'voyage/plan'])
      // La colonne le montre dans l'arbre, courant ; aucune portée ne l'est.
      expect(hote.querySelector('.biblio-arbre [aria-current="page"]')!.textContent).toBe('Voyage')
      expect(hote.querySelector('[data-rubrique][aria-current="page"]')).toBeNull()
      expect(hote.querySelector('.biblio-tuile-neuve .biblio-tuile-ou')!.textContent).toBe('dans « Voyage »')
      await act(async () => hote.querySelector<HTMLButtonElement>('.biblio-tuile-neuve')!.click())
      expect(crees).toEqual([['toile', 'voyage']])
    })

    it('le dossier d’une fiche d’un autre outil mène à sa fiche, hors de Notak', async () => {
      const avecFiche = AVEC_DOSSIER.map((e) => (e.tableau === 'voyage' && e.element === null ? { ...e, fiche: { nom: 'Mon CRM', adresse: 'https://crm.exemple.fr/societes/42' } } : e))
      const ouvertes: string[] = []
      const espion = vi.spyOn(window, 'open').mockImplementation((u) => (ouvertes.push(String(u)), null))
      onTestFinished(() => espion.mockRestore())
      history.replaceState(null, '', '/?dossier=voyage')
      await act(async () => racine.render(<PageBibliotheque charger={async () => avecFiche} espace={monde()} />))
      const lien = [...hote.querySelectorAll<HTMLAnchorElement>('.biblio-ouvrir-toile-lien')].find((a) => a.textContent === 'Fiche dans Mon CRM')!
      expect(lien.getAttribute('href')).toBe('https://crm.exemple.fr/societes/42')
      expect(lien.title).toBe('Ouvrir la fiche de ce dossier dans Mon CRM')
      act(() => lien.click())
      expect(ouvertes).toEqual(['https://crm.exemple.fr/societes/42'])
      expect(location.search).toBe('?dossier=voyage')
      // La racine, sans fiche, n'a rien à ouvrir : la toile d'accueil qui la tient ne se montre pas.
      act(() => hote.querySelector<HTMLButtonElement>('.biblio-fil button')!.click())
      expect([...hote.querySelectorAll('.biblio-ouvrir-toile-lien')].map((a) => a.textContent)).toEqual([])
    })

    it('le clic droit d’un dossier de l’arbre ouvre le menu de sa tuile ; « Renommer » va la montrer, prête', async () => {
      history.replaceState(null, '', '/?vue=partages')
      await act(async () => racine.render(<PageBibliotheque charger={async () => AVEC_DOSSIER} espace={monde()} definirFavori={async () => {}} />))
      expect(hote.querySelector('[data-cle="voyage/"]')).toBeNull()
      const ligne = [...hote.querySelectorAll<HTMLElement>('.biblio-arbre .biblio-rubrique')].find((b) => b.textContent === 'Voyage')!
      const clic = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 200 })
      act(() => void ligne.dispatchEvent(clic))
      // Pas le menu de la webview : celui de Notak, le même que celui de la tuile.
      expect(clic.defaultPrevented).toBe(true)
      expect([...hote.querySelectorAll('.notak-menu .notak-e-libelle')].map((x) => x.textContent)).toEqual([
        'Ouvrir',
        'Renommer',
        'Dupliquer',
        'Retirer des favoris',
        'Afficher comme toile',
        'Déplacer vers…',
        'Copier le lien',
        'Mettre à la corbeille',
      ])
      // Sa tuile n'est pas à l'écran : on va dans le dossier qui la range, où elle se renomme.
      act(() => entree('Renommer').click())
      expect(location.search).toBe('?dossier=racine')
      expect(tuile('voyage/').querySelector<HTMLInputElement>('.biblio-renommer')!.value).toBe('Voyage')
      expect(tuile('voyage/').getAttribute('aria-selected')).toBe('true')
    })

    it('le fil d’Ariane et l’accueil de la colonne y mènent ; une portée en sort', async () => {
      history.replaceState(null, '', '/?dossier=voyage')
      await act(async () => racine.render(<PageBibliotheque charger={async () => AVEC_DOSSIER} espace={monde()} />))
      act(() => hote.querySelector<HTMLButtonElement>('.biblio-fil button')!.click())
      expect(location.search).toBe('?dossier=racine')
      expect(hote.querySelector('h1')!.textContent).toBe('Mon espace')
      expect([...hote.querySelectorAll<HTMLElement>('[data-cle]')].map((x) => x.dataset.cle).sort()).toEqual(['atelier/', 'voyage/'])
      act(() => [...hote.querySelectorAll<HTMLButtonElement>('[data-rubrique]')].find((b) => b.dataset.rubrique === 'favoris')!.click())
      expect(location.search).toBe('?vue=favoris')
      expect(hote.querySelector('.biblio-fil')).toBeNull()
    })

    it('glisser dans un dossier : la tuile qui crée devient celle qui remonte au parent, en grille comme en liste', async () => {
      history.replaceState(null, '', '/?dossier=voyage')
      const espace = monde()
      await act(async () => racine.render(<PageBibliotheque charger={async () => AVEC_DOSSIER} espace={espace} rangerToile={async () => ({ nouveaux: 0, perdus: 0, permanents: 0, liensOuverts: 0, liensEteints: 0, fait: true })} />))
      const zone = () => hote.querySelector<HTMLElement>('[data-remonter]')
      const glisserDe = (cle: string) => {
        act(() => void tuile(cle).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 })))
        act(() => void window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 60, clientY: 40 })))
      }
      expect(zone()).toBeNull()
      glisserDe('voyage/plan')
      // À la place de « Nouvelle toile », sans rien décaler : le dossier du dessus, qui prend ce qu'on y lâche.
      expect(hote.querySelector('.biblio-tuile-neuve')).toBe(zone())
      expect(zone()!.textContent).toBe('Remonterdans « Mon espace »')
      expect(zone()!.dataset.depot).toBe('racine')
      const sous = document.elementFromPoint
      document.elementFromPoint = () => zone()
      onTestFinished(() => void (document.elementFromPoint = sous))
      act(() => void window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 70, clientY: 45 })))
      expect(zone()!.hasAttribute('data-survol-depot')).toBe(true)
      await act(async () => void window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })))
      expect(espace.tableau('racine')!.elements.some((e) => e.contenu.type === 'arbre')).toBe(true)
      expect(espace.tableau('voyage')!.elements.some((e) => e.contenu.type === 'arbre')).toBe(false)
      expect(hote.querySelector('.notak-avis')!.textContent).toContain('Déplacé dans « Mon espace »')
      expect(zone()).toBeNull()
      expect(hote.querySelector('.biblio-tuile-neuve .biblio-tuile-titre')!.textContent).toBe('Nouvelle toile')
      // En liste aussi ; Échap y renonce.
      act(() => [...hote.querySelectorAll<HTMLButtonElement>('.biblio-tri-choix')].find((b) => b.getAttribute('aria-label') === 'Liste')!.click())
      glisserDe('voyage/notes')
      expect(hote.querySelector('.biblio-grille[data-affichage="liste"] [data-remonter]')).not.toBeNull()
      touche('Escape')
      expect(zone()).toBeNull()
      // À l'accueil, rien au-dessus : la tuile reste celle qui crée.
      act(() => hote.querySelector<HTMLButtonElement>('.biblio-fil button')!.click())
      document.elementFromPoint = () => null
      glisserDe('atelier/')
      expect(hote.querySelector('.biblio-fantome')).not.toBeNull()
      expect(zone()).toBeNull()
      act(() => void window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })))
    })

    it('une toile se montre en dossier, et de nouveau en toile ; chaque fois, le menu le propose et Annuler le défait', async () => {
      const espace = await ouvrir()
      menu(tuile('atelier/'))
      await act(async () => entree('Afficher comme dossier').click())
      expect(espace.tableau('atelier')!.dossier).toBe(true)
      expect(tuile('atelier/').querySelector('.biblio-vignette')!.getAttribute('data-genre')).toBe('dossier')
      expect(hote.querySelector('.notak-avis')!.textContent).toContain('« atelier » se montre en dossier')
      const libelles = menu(tuile('atelier/')).map((b) => b.querySelector('.notak-e-libelle')!.textContent)
      // En dossier, elle ne se montre plus en toile : « Ouvrir » la parcourt, et rien d'autre ne l'ouvre.
      expect(libelles).toContain('Ouvrir')
      expect(libelles).not.toContain('Ouvrir la toile')
      expect(libelles).toContain('Afficher comme toile')
      expect(libelles).not.toContain('Parcourir')
      act(() => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
      await act(async () => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true })))
      expect(espace.tableau('atelier')).not.toHaveProperty('dossier')
    })
  })

  describe('les dossiers qu’un outil a générés', () => {
    /** « Voyage » range les dossiers de « Mon CRM » ; « atelier » est celui d'une de ses fiches. */
    const GENERES = TOUTES.map((e) =>
      e.element !== null
        ? e
        : e.tableau === 'voyage'
          ? { ...e, outil: 'Mon CRM', resume: { ...e.resume, dossier: true as const } }
          : e.tableau === 'atelier'
            ? { ...e, outil: 'Mon CRM', fiche: { nom: 'Mon CRM' }, resume: { ...e.resume, dossier: true as const } }
            : e,
    )
    const monter = async () => {
      const espace = monde()
      appels.length = 0
      await act(async () =>
        racine.render(
          <PageBibliotheque
            charger={async () => GENERES}
            espace={espace}
            rangerToile={async (toile, parent, options) => (appels.push([toile, parent, options ?? {}]), { nouveaux: 0, perdus: 0, permanents: 0, liensOuverts: 0, liensEteints: 0, fait: !options?.essai })}
            definirFavori={async () => {}}
          />,
        ),
      )
      return espace
    }
    /** Les lignes du menu, et celles qui sont éteintes. */
    const lignes = (el: Element) => {
      const boutons = menu(el)
      const nom = (b: HTMLButtonElement) => b.querySelector('.notak-e-libelle')!.textContent
      return { toutes: boutons.map(nom), eteintes: boutons.filter((b) => b.disabled).map(nom) }
    }
    const avis = () => hote.querySelector('.notak-avis')!.textContent
    const fermerMenu = () => touche('Escape')

    it('portent le nom de l’outil, dans la tuile et dans l’arbre de la colonne', async () => {
      await monter()
      expect(tuile('atelier/').querySelector('.biblio-tuile-titre .biblio-genere')!.textContent).toBe('Mon CRM')
      expect(tuile('atelier/').getAttribute('aria-label')).toBe('atelier, Généré par Mon CRM')
      expect(tuile('budget/').querySelector('.biblio-genere')).toBeNull()
      expect([...hote.querySelectorAll('.biblio-arbre .biblio-rubrique')].map((b) => [b.querySelector('span')!.textContent, b.querySelector('.biblio-genere')?.textContent])).toEqual([
        ['atelier', 'Mon CRM'],
        ['Voyage', 'Mon CRM'],
      ])
    })

    it('ne se modifient d’aucune façon : le menu éteint ses gestes, F2, ⌫, le glisser et la barre n’y font rien', async () => {
      const espace = await monter()
      for (const cle of ['atelier/', 'voyage/']) {
        const { toutes, eteintes } = lignes(tuile(cle))
        expect(eteintes).toEqual(['Renommer', 'Afficher comme toile', 'Déplacer vers…', 'Mettre à la corbeille'])
        // Ce qui ne le change pas reste : l'ouvrir, le copier, le mettre en favori, copier son lien.
        expect(toutes).toEqual(expect.arrayContaining(['Ouvrir', 'Dupliquer', 'Copier le lien']))
        fermerMenu()
      }
      appuyer(tuile('voyage/'))
      touche('F2')
      expect(hote.querySelector('.biblio-renommer')).toBeNull()
      await act(async () => touche('Backspace'))
      expect(tuile('voyage/')).not.toBeNull()
      expect(espace.tableau('racine')!.elements.find((e) => e.id === 'c-voyage')!.corbeille).toBeUndefined()
      expect(avis()).toContain('« Voyage » est généré par Mon CRM : il reste tel quel.')
      // Glissé, il ne se décolle pas : l'avis le dit tout de suite, et rien ne part au serveur.
      act(() => void tuile('atelier/').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 })))
      act(() => void window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 60, clientY: 40 })))
      expect(hote.querySelector('.biblio-fantome')).toBeNull()
      expect(avis()).toContain('« atelier » est généré par Mon CRM : il reste tel quel.')
      act(() => void window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })))
      // Choisis ensemble, la barre retient « Déplacer » et la corbeille, et son infobulle dit pourquoi.
      appuyer(tuile('voyage/'))
      appuyer(tuile('atelier/'), { metaKey: true })
      const retenus = [...hote.querySelectorAll<HTMLButtonElement>('.biblio-barre-choix button[aria-disabled="true"]')].map((b) => b.getAttribute('aria-label'))
      expect(retenus).toEqual(['Généré par Mon CRM', 'Généré par Mon CRM'])
      expect(appels).toEqual([])
    })

    it('le clic droit de l’arbre de la colonne montre les mêmes gestes éteints', async () => {
      await monter()
      const ligne = [...hote.querySelectorAll<HTMLElement>('.biblio-arbre .biblio-rubrique')].find((b) => b.querySelector('span')!.textContent === 'atelier')!
      act(() => void ligne.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 200 })))
      expect([...hote.querySelectorAll<HTMLButtonElement>('.notak-menu button')].filter((b) => b.disabled).map((b) => b.querySelector('.notak-e-libelle')!.textContent)).toEqual([
        'Renommer',
        'Afficher comme toile',
        'Déplacer vers…',
        'Mettre à la corbeille',
      ])
    })

    it('choisis avec d’autres, ils restent tels quels et l’avis le dit ; on range dedans ce qu’on veut', async () => {
      history.replaceState(null, '', '/?vue=tout')
      const espace = await monter()
      appuyer(tuile('voyage/plan'))
      appuyer(tuile('atelier/'), { metaKey: true })
      menu(tuile('voyage/plan'))
      act(() => entree('Déplacer vers…').click())
      // La fenêtre ne parle que de ce qui part.
      expect(document.querySelector('.notak-dialogue-titre')!.textContent).toBe('Déplacer « Plan »')
      await act(async () => [...hote.querySelectorAll<HTMLElement>('.biblio-deplacer-liste li')].find((li) => li.textContent?.startsWith('Budget'))!.click())
      expect(espace.tableau('budget')!.elements.some((e) => e.contenu.type === 'arbre')).toBe(true)
      expect(espace.tableau('racine')!.elements.some((e) => e.id === 'c-atelier')).toBe(true)
      expect(avis()).toContain('Déplacé dans « Budget ». « atelier » est généré par Mon CRM : il reste tel quel.')
      // Le dossier d'une fiche prend ce qu'on y range.
      touche('Escape')
      menu(tuile('voyage/notes'))
      act(() => entree('Déplacer vers…').click())
      await act(async () => [...hote.querySelectorAll<HTMLElement>('.biblio-deplacer-liste li')].find((li) => li.textContent?.startsWith('atelier'))!.click())
      expect(espace.tableau('atelier')!.elements.some((e) => e.contenu.type === 'document')).toBe(true)
      expect(avis()).toContain('Déplacé dans « atelier »')
      expect(appels).toEqual([])
    })
  })

  describe('la toile d’accueil', () => {
    it('ne se montre pas : la racine nomme l’espace, la tuile qui crée dit où, une tuile rangée là dit ce qu’elle est', async () => {
      history.replaceState(null, '', '/')
      await ouvrir()
      expect(hote.querySelector('.biblio-locale-vedette')).toBeNull()
      expect(hote.querySelector('.biblio-colonne [data-depot="racine"]')!.textContent).toBe('Mon espace')
      expect(hote.querySelector('.biblio-tuile-neuve .biblio-tuile-ou')!.textContent).toBe('dans « Mon espace »')
      expect(tuile('voyage/').querySelector('.biblio-tuile-ou')!.textContent).toBe('Toile')
      // Rien ne l'ouvre : vide, elle n'a rien à montrer.
      expect(hote.querySelector('.biblio-restes')).toBeNull()
      act(() => [...hote.querySelectorAll<HTMLButtonElement>('.biblio-tri-choix')].find((b) => b.textContent === 'Par dossier')!.click())
      const titre = [...hote.querySelectorAll<HTMLElement>('.biblio-section h2')].find((h) => h.dataset.dossier === 'racine')!
      expect(titre.textContent).toBe('Mon espace')
      const libelles = menu(titre).map((b) => b.querySelector('.notak-e-libelle')!.textContent)
      expect(libelles).toEqual(['Parcourir', 'Créer ici', 'Nouveau dossier'])
    })

    it('qui porte encore des notes à elle : une ligne le dit, en tête de la racine et de la bibliothèque, et y mène', async () => {
      history.replaceState(null, '', '/?vue=tout')
      const espace = monde()
      espace.magasin('racine').faire([{ type: 'creer', element: { id: 'memo', x: 60, y: 0, largeur: 20, contenu: { type: 'note', texte: 'À ne pas perdre' } } as unknown as ElementToile }])
      await ouvrir(espace)
      const ligne = () => hote.querySelector('.biblio-restes')
      expect(ligne()!.querySelector('p')!.textContent).toBe('Un élément posé dans « Mon espace » ne se voit que sur sa toile.')
      // Ni dans les récents, ni sous une puce : seulement là où la racine se montre.
      act(() => [...hote.querySelectorAll<HTMLButtonElement>('[data-rubrique]')].find((b) => b.dataset.rubrique === 'recents')!.click())
      expect(ligne()).toBeNull()
      act(() => hote.querySelector<HTMLButtonElement>('.biblio-colonne [data-depot="racine"]')!.click())
      expect(location.search).toBe('?dossier=racine')
      const lien = ligne()!.querySelector<HTMLAnchorElement>('a')!
      expect([lien.textContent, lien.getAttribute('href')]).toEqual(['Ouvrir la toile', '/t/racine'])
      act(() => lien.click())
      expect(location.pathname).toBe('/t/racine')
    })

    it('une photo lâchée sur le fond va à la racine ; « Voir » l’ouvre seule, sans passer par la toile d’accueil', async () => {
      history.replaceState(null, '', '/?vue=tout')
      const photo = { id: 'ph', x: 0, y: 0, largeur: 10, contenu: { type: 'image', fichier: 'f-ph', largeurOrigine: 4, hauteurOrigine: 3 } } as unknown as ElementToile
      const importes: string[] = []
      await act(async () =>
        racine.render(
          <PageBibliotheque
            charger={async () => TOUTES}
            espace={monde()}
            definirFavori={async () => {}}
            noterVu={async () => {}}
            vignettes={{ adresse: async (f: string) => `/api/fichiers/${f}`, distant: () => true }}
            importer={async (_f, dans) => (importes.push(dans), { elements: [photo], toiles: [], refuses: [] })}
          />,
        ),
      )
      const lacher = new Event('drop', { bubbles: true, cancelable: true })
      Object.defineProperty(lacher, 'dataTransfer', { value: { types: ['Files'], files: [new File(['x'], 'ph.jpg', { type: 'image/jpeg' })], dropEffect: 'none' } })
      await act(async () => void hote.querySelector('.biblio-corps')!.dispatchEvent(lacher))
      expect(importes).toEqual(['racine'])
      // Une photo n'a pas sa place sous « Tout » : les récents, sous la puce des photos.
      expect(location.search).toBe('?type=image')
      expect(tuile('racine/ph').getAttribute('aria-selected')).toBe('true')
      const voir = [...hote.querySelectorAll<HTMLButtonElement>('.notak-avis button')].find((b) => b.textContent === 'Voir')!
      await act(async () => voir.click())
      expect(location.pathname).toBe('/')
      expect(document.querySelector<HTMLImageElement>('.notak-fenetre-image')!.getAttribute('src')).toBe('/api/fichiers/f-ph')
      act(() => document.querySelector('.notak-fenetre')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    })
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
    // C'est une toile qui se montre en dossier.
    expect(espace.tableau(dossier)!.dossier).toBe(true)
    expect(tuile(`${dossier}/`).querySelector('.biblio-vignette')!.getAttribute('data-genre')).toBe('dossier')
    expect(location.search).toBe('?vue=toiles')
    expect(choisies()).toEqual([`${dossier}/`])
    expect(hote.querySelector<HTMLInputElement>('.biblio-renommer')!.value).toBe('Nouveau dossier')
    expect(hote.querySelector('.notak-avis')!.textContent).toContain('Dossier créé dans « Mon espace »')
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
    expect(ouverture).toHaveBeenCalledWith('https://www.hotel-lisbonne.pt/chambres', '_blank', 'noopener')
    menu(tuile('voyage/site'))
    await act(async () => entree('Ajouter aux favoris').click())
    expect(favoris).toEqual([['voyage', true, 'site']])
    ouverture.mockRestore()
  })

  describe('ce qu’un dossier range', () => {
    /** « Voyage » devient un dossier : sa photo, son lien et son PDF n'ont plus de toile où s'ouvrir. */
    const EN_DOSSIER = [...TOUTES, ...PORTES].map((e) => (e.tableau === 'voyage' && e.element === null ? { ...e, resume: { ...e.resume, dossier: true as const } } : e))
    const vignettes = { adresse: async (f: string) => `/api/fichiers/${f}`, distant: () => true }
    const monter = (extra: Partial<Parameters<typeof PageBibliotheque>[0]> = {}) =>
      act(async () => racine.render(<PageBibliotheque charger={async () => EN_DOSSIER} espace={monde()} vignettes={vignettes} {...extra} />))

    it('une photo ou un fichier s’ouvre seul, dans la fenêtre des fichiers, sans aller sur la toile du dossier', async () => {
      history.replaceState(null, '', '/?dossier=voyage')
      await monter()
      await act(async () => tuile('voyage/port').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
      expect(location.pathname).toBe('/')
      expect(document.querySelector<HTMLImageElement>('.notak-fenetre-image')!.getAttribute('src')).toBe('/api/fichiers/f-port')
      act(() => document.querySelector('.notak-fenetre')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
      expect(document.querySelector('.notak-fenetre')).toBeNull()
      await act(async () => tuile('voyage/billets').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
      expect(document.querySelector('.notak-fenetre-lecteur')!.getAttribute('src')).toBe('/api/fichiers/f-billets')
      expect(location.pathname).toBe('/')
    })

    it('un lien s’ouvre dans le navigateur ; « Afficher dans sa toile » n’est plus proposé', async () => {
      history.replaceState(null, '', '/?dossier=voyage')
      const ouvertes: string[] = []
      const espion = vi.spyOn(window, 'open').mockImplementation((u) => (ouvertes.push(String(u)), null))
      onTestFinished(() => espion.mockRestore())
      await monter()
      act(() => tuile('voyage/site').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
      expect(ouvertes).toEqual(['https://www.hotel-lisbonne.pt/chambres'])
      expect(location.pathname).toBe('/')
      const libelles = menu(tuile('voyage/plan')).map((b) => b.querySelector('.notak-e-libelle')?.textContent)
      expect(libelles).not.toContain('Afficher dans sa toile')
    })

    it('l’adresse d’un élément de dossier le choisit, et l’ouvre seul ; « Copier le lien » la donne', async () => {
      history.replaceState(null, '', '/?dossier=voyage&element=port')
      const copies: string[] = []
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async (x: string) => void copies.push(x) } })
      await monter()
      expect(document.querySelector<HTMLImageElement>('.notak-fenetre-image')!.getAttribute('src')).toBe('/api/fichiers/f-port')
      expect(choisies()).toEqual(['voyage/port'])
      act(() => document.querySelector('.notak-fenetre')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
      expect(document.querySelector('.notak-fenetre')).toBeNull()
      menu(tuile('voyage/port'))
      await act(async () => entree('Copier le lien').click())
      menu(tuile('voyage/plan'))
      await act(async () => entree('Copier le lien').click())
      expect(copies).toEqual([`${location.origin}/?dossier=voyage&element=port`, `${location.origin}/t/voyage/e/plan`])
    })

    it('ce que sa toile porte encore et qu’aucune tuile ne montre se range dans une toile du dossier, et se défait', async () => {
      history.replaceState(null, '', '/?dossier=voyage')
      const espace = monde()
      espace.magasin('voyage').faire([{ type: 'creer', element: { id: 'memo', x: 60, y: 0, largeur: 20, contenu: { type: 'note', texte: 'À ne pas perdre' } } as unknown as ElementToile }])
      await act(async () => racine.render(<PageBibliotheque charger={async () => EN_DOSSIER} espace={espace} vignettes={vignettes} rangerToile={async () => ({ nouveaux: 0, perdus: 0, permanents: 0, liensOuverts: 0, liensEteints: 0, fait: true })} definirFavori={async () => {}} />))
      // Le plan de « Voyage » (l'entrée d'essai) porte une note : la ligne le dit.
      expect(hote.querySelector('.biblio-restes p')!.textContent).toBe('Une note ou une forme de ce dossier ne se voit que sur une toile.')
      await act(async () => hote.querySelector<HTMLButtonElement>('.biblio-restes button')!.click())
      expect(hote.querySelector('.biblio-restes')).toBeNull()
      const restes = espace.tableau('voyage')!.elements
      expect(restes.some((e) => e.id === 'memo')).toBe(false)
      const carte = restes.find((e) => e.contenu.type === 'tableau')!
      const neuve = (carte.contenu as { cible: string }).cible
      expect(espace.tableau(neuve)!.titre).toBe('Voyage')
      expect(espace.tableau(neuve)!.elements.map((e) => e.contenu.type)).toEqual(['note'])
      // Le document et la carte mentale restent dans le dossier.
      expect(restes.map((e) => e.id)).toEqual(expect.arrayContaining(['plan', 'notes']))
      await act(async () => touche('z', { metaKey: true }))
      expect(espace.tableau('voyage')!.elements.some((e) => e.contenu.type === 'note')).toBe(true)
    })
  })

  it('« Afficher dans sa toile » ouvre celle qui la porte et lui demande de la montrer ; pas pour ce qui est à la racine', async () => {
    history.replaceState(null, '', '/')
    await ouvrir()
    menu(tuile('voyage/plan'))
    act(() => entree('Afficher dans sa toile').click())
    expect(location.pathname).toBe('/t/voyage')
    expect(montrerDemande()).toBe('plan')
    // La carte d'une toile rangée à la racine est sur la toile d'accueil, qui ne se montre plus.
    history.replaceState(null, '', '/?vue=toiles')
    expect(menu(tuile('voyage/')).map((b) => b.querySelector('.notak-e-libelle')!.textContent)).not.toContain('Afficher dans sa toile')
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
    // Ni elle-même ; la racine, où elle est déjà, est grisée, sous le nom de l'espace ; une toile rangée là n'en dit rien.
    expect(options.map((o) => o.querySelector('.biblio-deplacer-nom')!.textContent)).toEqual(['Mon espace', 'Budget', 'Voyage'])
    expect(options[2]!.querySelector('small')).toBeNull()
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
    const puce = (nom: string) => [...hote.querySelectorAll<HTMLButtonElement>('.biblio-puce')].find((b) => b.textContent?.startsWith(nom))!
    act(() => puce('Pages').click())
    const fichier = new File(['# Compte rendu'], 'Compte rendu.md', { type: 'text/markdown' })
    const glisser = (type: string, sur: Element) => {
      const e = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(e, 'dataTransfer', { value: { types: ['Files'], files: [fichier], dropEffect: 'none' } })
      act(() => void sur.dispatchEvent(e))
      return e
    }
    // Sur le fond : la racine ; le bandeau dit où ils iraient.
    expect(glisser('dragover', hote.querySelector('.biblio-corps')!).defaultPrevented).toBe(true)
    expect(hote.querySelector('.biblio-apport')!.textContent).toBe('Déposer pour importer dans « Mon espace »')
    act(() => puce('Toiles').click())
    glisser('dragover', tuile('voyage/'))
    expect(hote.querySelector('.biblio-apport')!.textContent).toBe('Déposer pour importer dans « Voyage »')
    expect(tuile('voyage/').hasAttribute('data-survol-depot')).toBe(true)
    await act(async () => void glisser('drop', tuile('voyage/')))
    expect(importes).toEqual([[['Compte rendu.md'], 'voyage']])
    expect(hote.querySelector('.biblio-apport')).toBeNull()
    expect(hote.querySelector('.notak-avis')!.textContent).toContain('Un fichier importé dans « Voyage » « vieux.pages » n’a pas pu être lu.')
    // Une page n'a pas sa place parmi les toiles : on passe aux récents, sans puce, où l'import compte, la tuile choisie.
    expect(rubrique('Récents').getAttribute('aria-current')).toBe('page')
    expect(puce('Tout').getAttribute('aria-pressed')).toBe('true')
    expect(vus).toEqual(['voyage/cr'])
    const arrivee = hote.querySelector<HTMLElement>('[data-cle="voyage/cr"]')!
    expect(arrivee.getAttribute('aria-selected')).toBe('true')
    expect(arrivee.hasAttribute('data-arrivee')).toBe(true)
    // Là où elle a sa place, on reste : une page lâchée sur les pages récentes.
    act(() => puce('Pages').click())
    await act(async () => void glisser('drop', hote.querySelector('.biblio-corps')!))
    expect(puce('Pages').getAttribute('aria-pressed')).toBe('true')
    expect(rubrique('Récents').getAttribute('aria-current')).toBe('page')
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
