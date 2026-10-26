// @vitest-environment jsdom
import { definirLangue, reglerRubriqueBureau } from '@notak/tableau'
import { act, isValidElement } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SERVEUR, acces, appelsDe, bouton, coque, dialoguesDeJsdom, poserCoque, retirerCoque } from './essai'
import { DialogueAcces } from './FormulaireAcces'
import { fermerDialogueAcces } from './etat'
import { ReglagesBureau, brancherReglagesBureau } from './ReglagesBureau'

vi.mock('@notak/tableau', async (origine) => ({ ...(await origine<typeof import('@notak/tableau')>()), reglerRubriqueBureau: vi.fn() }))
/** Sur la page d'un serveur, ou sur celle des toiles d'ici : `estPageServeur` ne se devine pas depuis jsdom. */
let surServeur = false
vi.mock('../bureau', async (origine) => ({ ...(await origine<typeof import('../bureau')>()), estPageServeur: () => surServeur }))

dialoguesDeJsdom()

let racine: Root
let hote: HTMLElement

beforeEach(() => {
  definirLangue('fr')
  surServeur = false
  poserCoque({ acces: () => acces() })
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => {
    fermerDialogueAcces()
    racine.unmount()
  })
  hote.remove()
  document.querySelectorAll('dialog').forEach((d) => d.remove())
  retirerCoque()
  vi.mocked(reglerRubriqueBureau).mockClear()
})

const monter = async () => act(async () => racine.render(<ReglagesBureau />))
const choix = () => [...hote.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
const attente = () => hote.querySelector('[role="status"]')?.textContent ?? ''

describe('brancher la rubrique « App de bureau »', () => {
  it('donne aux réglages de la toile de quoi la dessiner : le contenu de l’app, comme un composant', async () => {
    brancherReglagesBureau()
    expect(reglerRubriqueBureau).toHaveBeenCalledOnce()
    const rendre = vi.mocked(reglerRubriqueBureau).mock.calls[0]![0]!
    const contenu = rendre()
    expect(isValidElement(contenu)).toBe(true)
    await act(async () => racine.render(contenu))
    expect(hote.querySelector('.bureau-reglages')).not.toBeNull()
  })
})

describe('les réglages de l’app de bureau, sur la page des toiles d’ici', () => {
  it('sans serveur mémorisé : où Notak s’ouvre, et de quoi se connecter', async () => {
    await monter()
    expect(hote.querySelector('h3')?.textContent).toBe('Serveur')
    expect(hote.textContent).toContain('Notak s’ouvre sur les toiles de cet ordinateur.')
    // Un seul lieu possible : pas de choix à faire.
    expect(choix()).toEqual([])
    expect(bouton('Se connecter à un serveur Notak…')).toBeTruthy()
    expect([...hote.querySelectorAll('button')].some((b) => b.textContent?.startsWith('Revenir sur'))).toBe(false)
    expect(bouton('Changer de serveur…')).toBeUndefined()
  })

  it('avec un serveur mémorisé : où Notak s’ouvre au démarrage se choisit ici, et se retient dans la coque', async () => {
    coque.acces = () => acces({ serveur: SERVEUR })
    coque.regler_ouverture = (a) => {
      const { ouvrir } = a as { ouvrir: 'local' | 'serveur' }
      coque.acces = () => acces({ serveur: SERVEUR, ouvrir })
    }
    await monter()
    expect(hote.querySelector('legend')?.textContent).toBe('Au démarrage, Notak s’ouvre :')
    expect(choix().map((c) => [c.parentElement!.textContent, c.checked, c.disabled])).toEqual([
      ['sur cet ordinateur', true, false],
      ['sur notak.exemple.fr', false, false],
    ])
    await act(async () => choix()[1]!.click())
    expect(appelsDe('regler_ouverture')).toEqual([{ ouvrir: 'serveur' }])
    expect(choix().map((c) => c.checked)).toEqual([false, true])
    await act(async () => choix()[0]!.click())
    expect(appelsDe('regler_ouverture')).toEqual([{ ouvrir: 'serveur' }, { ouvrir: 'local' }])
    expect(choix().map((c) => c.checked)).toEqual([true, false])
  })

  it('« Revenir sur » y envoie la fenêtre en le gardant, et dit qu’il se connecte sans retirer le bouton du clavier', async () => {
    coque.acces = () => acces({ serveur: SERVEUR })
    coque.joindre_serveur = () => new Promise(() => {})
    await monter()
    expect(attente()).toBe('')
    const revenir = bouton('Revenir sur notak.exemple.fr')!
    revenir.focus()
    await act(async () => revenir.click())
    expect(appelsDe('joindre_serveur')).toEqual([{ adresse: SERVEUR, garder: true }])
    expect(attente()).toBe('Connexion à notak.exemple.fr…')
    expect(revenir.getAttribute('aria-disabled')).toBe('true')
    expect(revenir.disabled).toBe(false)
    expect(document.activeElement).toBe(revenir)
    // Pris : un second geste ne part pas, ni la fenêtre d'accès (qui relirait les réglages en s'ouvrant).
    const lectures = appelsDe('acces').length
    await act(async () => revenir.click())
    await act(async () => bouton('Se connecter à un serveur Notak…')!.click())
    expect(appelsDe('joindre_serveur')).toHaveLength(1)
    expect(appelsDe('acces')).toHaveLength(lectures)
  })

  it('un refus de la coque se dit en alerte, et les boutons se rendent', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    coque.acces = () => acces({ serveur: SERVEUR })
    coque.joindre_serveur = () => {
      throw { code: 'injoignable' }
    }
    await monter()
    await act(async () => bouton('Revenir sur notak.exemple.fr')!.click())
    expect(hote.querySelector('[role="alert"]')?.textContent).toContain('Ce serveur ne répond pas')
    expect(bouton('Revenir sur notak.exemple.fr')!.getAttribute('aria-disabled')).toBeNull()
    expect(attente()).toBe('')
  })

  it('« Se connecter à un serveur… » ouvre la fenêtre d’accès', async () => {
    await act(async () => racine.render(<><ReglagesBureau /><DialogueAcces /></>))
    expect(document.querySelector('dialog')).toBeNull()
    await act(async () => bouton('Se connecter à un serveur Notak…')!.click())
    expect(document.querySelector<HTMLDialogElement>('dialog')?.open).toBe(true)
  })

  it('les mises à jour y sont, et la case de la recherche automatique se change depuis ici', async () => {
    coque.regler_maj_auto = () => undefined
    await monter()
    expect([...hote.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Serveur', 'Mises à jour'])
    const case_ = hote.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(case_.checked).toBe(true)
    expect(case_.disabled).toBe(false)
    await act(async () => case_.click())
    expect(appelsDe('regler_maj_auto')).toEqual([{ actif: false }])
  })
})

describe('les réglages de l’app de bureau, sur la page d’un serveur', () => {
  beforeEach(() => {
    surServeur = true
    coque.acces = () => acces({ ouvrir: 'serveur', serveur: SERVEUR })
  })

  it('dit sur quel serveur on est et où Notak s’ouvre, sans le changer d’ici ; propose d’en changer ou de rentrer', async () => {
    await monter()
    expect(hote.textContent).toContain('Vous êtes sur notak.exemple.fr.')
    expect(choix().map((c) => [c.parentElement!.textContent, c.checked, c.matches(':disabled')])).toEqual([
      ['sur cet ordinateur', false, true],
      ['sur notak.exemple.fr', true, true],
    ])
    const groupe = hote.querySelector('fieldset')!
    expect(document.getElementById(groupe.getAttribute('aria-describedby')!)?.textContent).toBe('Ce choix se règle depuis les toiles de cet ordinateur.')
    expect(bouton('Changer de serveur…')).toBeTruthy()
    expect(bouton('Toiles de cet ordinateur')).toBeTruthy()
    expect(bouton('Se connecter à un serveur Notak…')).toBeUndefined()
  })

  it('« Changer de serveur… » ramène à l’écran d’accès, en le disant ; un seul geste à la fois', async () => {
    coque.revenir_ici = () => new Promise(() => {})
    await monter()
    await act(async () => bouton('Changer de serveur…')!.click())
    expect(appelsDe('revenir_ici')).toEqual([{ ecran: 'acces' }])
    expect(attente()).toBe('Ouverture de l’écran de connexion…')
    expect(bouton('Toiles de cet ordinateur')!.getAttribute('aria-disabled')).toBe('true')
    await act(async () => bouton('Toiles de cet ordinateur')!.click())
    expect(appelsDe('revenir_ici')).toHaveLength(1)
  })

  it('« Toiles de cet ordinateur » y ramène la fenêtre pour un coup d’œil, sans rien régler', async () => {
    coque.revenir_ici = () => new Promise(() => {})
    await monter()
    await act(async () => bouton('Toiles de cet ordinateur')!.click())
    expect(appelsDe('revenir_ici')).toEqual([{ ecran: 'local' }])
    expect(appelsDe('regler_ouverture')).toEqual([])
    expect(attente()).toBe('Ouverture des toiles de cet ordinateur…')
  })

  it('un serveur visité sans être celui où Notak s’ouvre : le choix le dit', async () => {
    coque.acces = () => acces({ ouvrir: 'local', serveur: SERVEUR })
    await monter()
    expect(choix().map((c) => c.checked)).toEqual([true, false])
  })

  it('la recherche automatique se lit sans se changer : la case est grisée et dit d’où elle se règle', async () => {
    await monter()
    const case_ = hote.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(case_.disabled).toBe(true)
    expect(case_.getAttribute('aria-describedby')).toBeTruthy()
    expect(hote.textContent).toContain('Ce réglage est celui de l’ordinateur : changez-le depuis les toiles de cet ordinateur')
    await act(async () => case_.click())
    expect(appelsDe('regler_maj_auto')).toHaveLength(0)
  })
})
