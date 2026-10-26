// @vitest-environment jsdom
import { definirLangue, reglerRubriqueBureau } from '@notak/tableau'
import { act, isValidElement } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Acces } from '../bureau'
import { DialogueAcces } from './FormulaireAcces'
import { fermerDialogueAcces } from './etat'
import { ReglagesBureau, brancherReglagesBureau } from './ReglagesBureau'

vi.mock('@notak/tableau', async (origine) => ({ ...(await origine<typeof import('@notak/tableau')>()), reglerRubriqueBureau: vi.fn() }))
/** Sur la page d'un serveur, ou sur celle des toiles d'ici : `estPageServeur` ne se devine pas depuis jsdom. */
let surServeur = false
vi.mock('../bureau', async (origine) => ({ ...(await origine<typeof import('../bureau')>()), estPageServeur: () => surServeur }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}

const SERVEUR = 'https://notak.exemple.fr'
const acces = (o: Partial<Acces> = {}): Acces => ({ ouvrir: 'local', serveur: null, majAuto: true, version: '0.1.0', ...o })

let racine: Root
let hote: HTMLElement
let invoke: ReturnType<typeof vi.fn>
let coque: Record<string, (args: unknown) => unknown>

beforeEach(() => {
  definirLangue('fr')
  surServeur = false
  coque = { acces: () => acces() }
  invoke = vi.fn(async (commande: string, args: unknown) => {
    const r = coque[commande]
    if (!r) throw `Command ${commande} not found`
    return r(args)
  })
  ;(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = { invoke }
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
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  vi.mocked(reglerRubriqueBureau).mockClear()
})

const appelsDe = (commande: string) => invoke.mock.calls.filter((c) => c[0] === commande).map((c) => c[1])
const bouton = (texte: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === texte)
const monter = async () => act(async () => racine.render(<ReglagesBureau />))

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
  it('sans serveur retenu : où Notak s’ouvre, et de quoi se connecter', async () => {
    await monter()
    expect(hote.querySelector('h3')?.textContent).toBe('Accès')
    expect(hote.textContent).toContain('Notak s’ouvre sur les toiles de cet ordinateur.')
    expect(bouton('Se connecter à un serveur Notak…')).toBeTruthy()
    expect([...hote.querySelectorAll('button')].some((b) => b.textContent?.startsWith('Revenir sur'))).toBe(false)
    expect(bouton('Changer de serveur…')).toBeUndefined()
  })

  it('avec un serveur retenu : il se lit, et « Revenir sur » y envoie la fenêtre, en le gardant', async () => {
    coque.acces = () => acces({ serveur: SERVEUR })
    coque.joindre_serveur = () => new Promise(() => {})
    await monter()
    expect(hote.textContent).toContain('Notak s’ouvre sur les toiles de cet ordinateur. Serveur retenu : notak.exemple.fr.')
    await act(async () => bouton('Revenir sur notak.exemple.fr')!.click())
    expect(appelsDe('joindre_serveur')).toEqual([{ adresse: SERVEUR, garder: true }])
    expect(bouton('Revenir sur notak.exemple.fr')!.disabled).toBe(true)
  })

  it('un serveur qui s’ouvrirait d’office, vu pour cette fois depuis les toiles d’ici : on le dit', async () => {
    coque.acces = () => acces({ ouvrir: 'serveur', serveur: SERVEUR })
    await monter()
    expect(hote.textContent).toContain('Notak s’ouvre sur notak.exemple.fr ; pour cette fois, vous êtes sur les toiles de cet ordinateur.')
  })

  it('un refus de la coque se dit en alerte, et les boutons se rendent', async () => {
    coque.acces = () => acces({ serveur: SERVEUR })
    coque.joindre_serveur = () => {
      throw { code: 'injoignable' }
    }
    await monter()
    await act(async () => bouton('Revenir sur notak.exemple.fr')!.click())
    expect(hote.querySelector('[role="alert"]')?.textContent).toContain('Ce serveur ne répond pas')
    expect(bouton('Revenir sur notak.exemple.fr')!.disabled).toBe(false)
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
    expect([...hote.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Accès', 'Mises à jour'])
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

  it('dit sur quel serveur on est, et propose d’en changer ou de rentrer aux toiles d’ici', async () => {
    await monter()
    expect(hote.textContent).toContain('Notak s’ouvre sur notak.exemple.fr.')
    expect(bouton('Changer de serveur…')).toBeTruthy()
    expect(bouton('Toiles de cet ordinateur')).toBeTruthy()
    expect(bouton('Se connecter à un serveur Notak…')).toBeUndefined()
  })

  it('« Changer de serveur… » ramène à l’écran d’accès, « Toiles de cet ordinateur » aux toiles d’ici', async () => {
    coque.revenir_ici = () => new Promise(() => {})
    await monter()
    await act(async () => bouton('Changer de serveur…')!.click())
    expect(appelsDe('revenir_ici')).toEqual([{ ecran: 'acces' }])
    // Un seul geste à la fois, le temps que la fenêtre change de page.
    expect(bouton('Toiles de cet ordinateur')!.disabled).toBe(true)
  })

  it('« Toiles de cet ordinateur » demande à la coque d’y ouvrir Notak désormais', async () => {
    coque.revenir_ici = () => undefined
    await monter()
    await act(async () => bouton('Toiles de cet ordinateur')!.click())
    expect(appelsDe('revenir_ici')).toEqual([{ ecran: 'local' }])
  })

  it('un serveur visité sans être celui qu’on ouvre le dit', async () => {
    coque.acces = () => acces({ ouvrir: 'local', serveur: SERVEUR })
    await monter()
    expect(hote.textContent).toContain('Vous êtes sur notak.exemple.fr. Au prochain lancement, Notak s’ouvrira sur les toiles de cet ordinateur.')
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
