// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import type { ResumeContenu } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BibliothequeLocale, CLE_BIENVENUE, type EntreeLocale, entreesLocales, lireVus, noterVu, ordonner, recents } from './BibliothequeLocale'
import { acces, poserCoque, retirerCoque } from '../bureau/essai'
import { espaceLocal } from './espace'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const entree = (id: string, autre: Partial<EntreeLocale> = {}): EntreeLocale => ({
  cle: id,
  tableau: id,
  element: null,
  genre: 'toile',
  titre: id,
  cree: 0,
  accueil: false,
  ...autre,
})
const attendre = (ms = 50) => act(async () => void (await new Promise((fin) => setTimeout(fin, ms))))

describe('l’ordre de la bibliothèque locale', () => {
  it('l’accueil en tête, puis la plus récemment ouverte, puis la plus récemment créée', () => {
    const liste = [entree('vieille', { cree: 1 }), entree('neuve', { cree: 5 }), entree('vue', { vu: 10 }), entree('Accueil', { accueil: true })]
    expect(ordonner(liste).map((e) => e.cle)).toEqual(['Accueil', 'vue', 'neuve', 'vieille'])
  })

  it('la recherche filtre sur le titre et la toile qui le porte, sans casse ni accents, mot à mot', () => {
    const liste = [entree('Voyage au Japon'), entree('Courses'), entree('Budget', { dans: 'Été au Japon' })]
    expect(ordonner(liste, 'japon voy').map((e) => e.cle)).toEqual(['Voyage au Japon'])
    expect(ordonner(liste, 'ete budget').map((e) => e.cle)).toEqual(['Budget'])
  })

  it('les récents : ce qu’on a ouvert, sans l’accueil, le plus récent d’abord, huit au plus', () => {
    const liste = [entree('Accueil', { accueil: true, vu: 99 }), entree('jamais'), ...Array.from({ length: 10 }, (_, i) => entree(`v${i}`, { vu: i + 1 }))]
    expect(recents(liste).map((e) => e.cle)).toEqual(['v9', 'v8', 'v7', 'v6', 'v5', 'v4', 'v3', 'v2'])
  })

  it('retient la dernière ouverture de chaque toile et de chaque élément', () => {
    localStorage.clear()
    noterVu('a', 100)
    noterVu('b/e/x', 200)
    noterVu('a', 300)
    expect(lireVus()).toEqual({ a: 300, 'b/e/x': 200 })
  })

  it('les cartes mentales et les documents viennent des résumés de la toile qui les porte', () => {
    const resumes: Record<string, ResumeContenu[]> = {
      voyage: [
        { genre: 'toile', element: '', titre: 'Voyage', boites: [] },
        { genre: 'arbre', element: 'c1', titre: 'Itinéraire', branches: [] },
        { genre: 'document', element: 'd1', titre: 'Valise', lignes: [] },
      ],
    }
    const liste = entreesLocales(
      [
        { id: 'racine', titre: '', cree: 1 },
        { id: 'voyage', titre: 'Voyage', parent: 'racine', cree: 2 },
      ],
      'racine',
      resumes,
      { 'voyage/e/d1': 50 },
    )
    expect(liste.map((e) => [e.cle, e.genre, e.dans ?? null, e.vu ?? null])).toEqual([
      ['racine', 'toile', null, null],
      ['voyage', 'toile', null, null],
      ['voyage/e/c1', 'arbre', 'Voyage', null],
      ['voyage/e/d1', 'document', 'Voyage', 50],
    ])
  })
})

describe('l’écran de la bibliothèque', () => {
  let racine: Root
  let hote: HTMLElement
  beforeEach(() => {
    hote = document.createElement('div')
    document.body.append(hote)
    racine = createRoot(hote)
  })
  afterEach(() => {
    act(() => racine.unmount())
    hote.remove()
    document.querySelectorAll('.notak-tiroir-bas-calque').forEach((n) => n.remove())
  })

  const creerPar = async (genre: string) => {
    act(() => hote.querySelector<HTMLButtonElement>('.biblio-locale-plus')!.click())
    const bouton = document.querySelector<HTMLButtonElement>(`.biblio-locale-neuf button[data-genre='${genre}']`)!
    act(() => bouton.click())
    await attendre()
  }

  it('met la toile d’accueil en tête et l’ouvre au toucher', async () => {
    const el = await espaceLocal()
    const ouvrir = vi.fn()
    await act(async () => racine.render(<BibliothequeLocale el={el} ouvrir={ouvrir} reglages={vi.fn()} />))
    const vedette = hote.querySelector<HTMLButtonElement>('.biblio-locale-vedette')!
    expect(hote.querySelector('.biblio-locale-entete')!.nextElementSibling).toBe(vedette)
    act(() => vedette.click())
    expect(ouvrir).toHaveBeenCalledWith(el.index.racine(), null)
  })

  it('dans l’app, le rond du compte, à côté du « + », ouvre la feuille « Compte » ; plus de ligne « serveur » en bas', async () => {
    vi.stubEnv('VITE_EDITION', 'locale')
    poserCoque({ acces: () => acces() })
    try {
      const el = await espaceLocal()
      await act(async () => racine.render(<BibliothequeLocale el={el} ouvrir={vi.fn()} reglages={vi.fn()} />))
      expect(hote.querySelector('.biblio-serveur')).toBeNull()
      const rond = hote.querySelector<HTMLButtonElement>('.biblio-locale-actions .biblio-locale-compte-bouton')!
      expect(rond.getAttribute('aria-label')).toBe('Compte')
      act(() => rond.click())
      await attendre()
      const feuille = document.querySelector('.notak-tiroir-bas.compte-serveur-feuille')!
      expect(feuille.querySelector('.compte-serveur-tete strong')!.textContent).toBe('Pas de compte')
    } finally {
      retirerCoque()
      vi.unstubAllEnvs()
    }
  })

  it('la roue des réglages, à gauche du compte et du « + », ouvre les réglages', async () => {
    vi.stubEnv('VITE_EDITION', 'locale')
    poserCoque({ acces: () => acces() })
    try {
      const el = await espaceLocal()
      const reglages = vi.fn()
      await act(async () => racine.render(<BibliothequeLocale el={el} ouvrir={vi.fn()} reglages={reglages} />))
      const ordre = [...hote.querySelector('.biblio-locale-actions')!.children].map((n) => n.className)
      expect(ordre).toEqual(['biblio-locale-reglages', 'biblio-locale-compte-bouton', 'biblio-locale-plus'])
      const roue = hote.querySelector<HTMLButtonElement>('.biblio-locale-reglages')!
      expect(roue.getAttribute('aria-label')).toBe('Réglages')
      act(() => roue.click())
      expect(reglages).toHaveBeenCalledOnce()
    } finally {
      retirerCoque()
      vi.unstubAllEnvs()
    }
  })

  describe('la carte de bienvenue', () => {
    /** Un téléphone (au doigt et étroit), ou une tablette (au doigt, mais large). */
    const telephone = (oui: boolean) =>
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse') && (oui || !q.includes('max-width')), media: q, addEventListener() {}, removeEventListener() {} }))
    beforeEach(() => localStorage.removeItem(CLE_BIENVENUE))
    afterEach(() => vi.unstubAllGlobals())
    const montrer = async (ouvrir = vi.fn()) => {
      const el = await espaceLocal()
      await act(async () => racine.render(<BibliothequeLocale el={el} ouvrir={ouvrir} reglages={vi.fn()} />))
      return el
    }

    it('au téléphone, en tête, la première fois : trois lignes, puis plus jamais une fois fermée', async () => {
      telephone(true)
      await montrer()
      const carte = hote.querySelector('.biblio-bienvenue')!
      expect(hote.querySelector('.biblio-locale-entete')!.nextElementSibling).toBe(carte)
      expect(carte.querySelector('h2')!.textContent).toBe('Bienvenue dans Notak')
      expect(carte.querySelectorAll('li')).toHaveLength(3)
      expect(carte.textContent).toContain('touchez-la pour l’ouvrir')
      act(() => carte.querySelector<HTMLButtonElement>('.biblio-bienvenue-fermer')!.click())
      expect(hote.querySelector('.biblio-bienvenue')).toBeNull()
      act(() => racine.unmount())
      racine = createRoot(hote)
      await montrer()
      expect(hote.querySelector('.biblio-bienvenue')).toBeNull()
    })

    it('« C’est parti » ouvre la toile d’accueil, et la carte ne revient plus', async () => {
      telephone(true)
      const ouvrir = vi.fn()
      const el = await montrer(ouvrir)
      act(() => hote.querySelector<HTMLButtonElement>('.biblio-bienvenue-partir')!.click())
      expect(ouvrir).toHaveBeenCalledWith(el.index.racine(), null)
      expect(localStorage.getItem(CLE_BIENVENUE)).toBe('1')
    })

    it('sur une tablette, pas de carte', async () => {
      telephone(false)
      await montrer()
      expect(hote.querySelector('.biblio-bienvenue')).toBeNull()
    })
  })

  it('dans un navigateur, pas de rond du compte : il n’y a pas de serveur à joindre', async () => {
    const el = await espaceLocal()
    await act(async () => racine.render(<BibliothequeLocale el={el} ouvrir={vi.fn()} reglages={vi.fn()} />))
    expect(hote.querySelector('.biblio-locale-compte-bouton')).toBeNull()
  })

  it('montre les toiles de l’appareil et ouvre celle qu’on touche', async () => {
    const el = await espaceLocal()
    const voyage = el.espace.creerTableau('Voyage', el.index.racine())
    await attendre()
    const ouvrir = vi.fn()
    await act(async () => racine.render(<BibliothequeLocale el={el} ouvrir={ouvrir} reglages={vi.fn()} />))
    const tuile = [...hote.querySelectorAll<HTMLButtonElement>('.biblio-locale-grille .biblio-locale-tuile')].find((b) => b.textContent?.includes('Voyage'))!
    act(() => tuile.click())
    expect(ouvrir).toHaveBeenCalledWith(voyage, null)
  })

  it('« + » › Toile en crée une sur l’accueil et l’ouvre', async () => {
    const el = await espaceLocal()
    const avant = el.index.lister().length
    const ouvrir = vi.fn()
    await act(async () => racine.render(<BibliothequeLocale el={el} ouvrir={ouvrir} reglages={vi.fn()} />))
    await creerPar('toile')
    const [neuve, element] = ouvrir.mock.calls[0]!
    expect(element).toBeNull()
    expect(neuve).not.toBe(el.index.racine())
    expect(el.espace.existe(neuve as string)).toBe(true)
    expect(el.index.lister().length).toBeGreaterThan(avant)
  })

  it.each(['arbre', 'document'] as const)('« + » › %s le pose sur l’accueil et l’ouvre en grand', async (genre) => {
    const el = await espaceLocal()
    const ouvrir = vi.fn()
    await act(async () => racine.render(<BibliothequeLocale el={el} ouvrir={ouvrir} reglages={vi.fn()} />))
    await creerPar(genre)
    const [tableau, element] = ouvrir.mock.calls[0]! as [string, string]
    expect(tableau).toBe(el.index.racine())
    expect(el.espace.magasin(tableau).lire().elements.find((e) => e.id === element)?.contenu.type).toBe(genre)
    expect(lireVus()[`${tableau}/e/${element}`]).toBeGreaterThan(0)
  })

  it('la recherche replie la page et répond sur les titres à chaque lettre', async () => {
    const el = await espaceLocal()
    el.espace.creerTableau('Recettes de saison', el.index.racine())
    await attendre()
    await act(async () => racine.render(<BibliothequeLocale el={el} ouvrir={vi.fn()} reglages={vi.fn()} />))
    const champ = hote.querySelector<HTMLInputElement>('.biblio-locale-recherche input')!
    act(() => champ.focus())
    expect(hote.querySelector('.biblio-locale')!.hasAttribute('data-cherche')).toBe(true)
    expect(hote.querySelector('.biblio-locale-vedette')).toBeNull()
    const ecrire = (texte: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, texte)
        champ.dispatchEvent(new Event('input', { bubbles: true }))
      })
    ecrire('recet')
    expect([...hote.querySelectorAll('.biblio-locale-ligne .biblio-locale-titre')].map((n) => n.textContent)).toContain('Recettes de saison')
    expect(hote.querySelector('.biblio-locale-ligne mark')?.textContent).toBe('Recet')
    ecrire('introuvable')
    expect(hote.querySelector('.biblio-locale-vide')?.textContent).toContain('introuvable')
    act(() => hote.querySelector<HTMLButtonElement>('.biblio-locale-annuler')!.click())
    expect(hote.querySelector('.biblio-locale-vedette')).not.toBeNull()
  })
})
