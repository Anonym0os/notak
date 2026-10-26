// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Acces } from '../bureau'
import { texteErreur } from './acces'
import { LENTEUR_MS, Porte, passerLaPorte } from './Porte'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SERVEUR = 'https://notak.exemple.fr'
const acces = (o: Partial<Acces> = {}): Acces => ({ ouvrir: 'local', serveur: null, majAuto: true, version: '0.1.0', ...o })
const retenu = (o: Partial<Acces> = {}) => acces({ ouvrir: 'serveur', serveur: SERVEUR, ...o })

let racine: Root
let hote: HTMLElement
let invoke: ReturnType<typeof vi.fn>
let coque: Record<string, (args: unknown) => unknown>

beforeEach(() => {
  definirLangue('fr')
  coque = {}
  invoke = vi.fn(async (commande: string, args: unknown) => {
    const r = coque[commande]
    if (!r) throw `Command ${commande} not found`
    return r(args)
  })
  ;(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = { invoke }
  history.replaceState(null, '', '/')
  hote = document.createElement('div')
  hote.id = 'racine'
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  vi.useRealTimers()
  act(() => racine.unmount())
  hote.remove()
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
})

const appelsDe = (commande: string) => invoke.mock.calls.filter((c) => c[0] === commande).map((c) => c[1])
const commandes = () => [...new Set(invoke.mock.calls.map((c) => c[0] as string))]
const bouton = (texte: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === texte)
const alerte = () => document.querySelector('[role="alert"]')?.textContent ?? null

describe('la connexion au serveur retenu, au lancement', () => {
  it('dit à quel serveur elle se connecte, et l’y envoie en le retenant encore', async () => {
    coque.joindre_serveur = () => new Promise(() => {})
    await act(async () => racine.render(<Porte acces={retenu()} recherche="" surLocal={() => {}} />))
    expect(document.querySelector('h1')?.textContent).toBe('Connexion à notak.exemple.fr…')
    expect(document.querySelector('.bureau-roue')).not.toBeNull()
    expect(appelsDe('joindre_serveur')).toEqual([{ adresse: SERVEUR, garder: true }])
  })

  it('ne touche pas aux copies .notak ouvertes : la page du serveur les prendra', async () => {
    coque.joindre_serveur = () => new Promise(() => {})
    await act(async () => racine.render(<Porte acces={retenu()} recherche="" surLocal={() => {}} />))
    expect(commandes()).toEqual(['joindre_serveur'])
  })

  it('ne propose rien tout de suite, puis, passé dix secondes, d’ouvrir les toiles de cet ordinateur', async () => {
    vi.useFakeTimers()
    coque.joindre_serveur = () => new Promise(() => {})
    const surLocal = vi.fn()
    await act(async () => racine.render(<Porte acces={retenu()} recherche="" surLocal={surLocal} />))
    await act(async () => void vi.advanceTimersByTime(LENTEUR_MS - 1))
    expect(bouton('Ouvrir les toiles de cet ordinateur')).toBeUndefined()
    await act(async () => void vi.advanceTimersByTime(1))
    const ouvrir = bouton('Ouvrir les toiles de cet ordinateur')!
    expect(ouvrir).toBeTruthy()
    expect(document.querySelector('[role="status"]')?.textContent).toBe('notak.exemple.fr tarde à répondre.')
    expect(document.body.textContent).toContain('Pour cette fois seulement : notak.exemple.fr reste retenu')
    expect(document.activeElement).toBe(ouvrir)
    await act(async () => ouvrir.click())
    expect(surLocal).toHaveBeenCalledOnce()
    // Pour cette fois seulement : ni le serveur ni où Notak s'ouvre ne changent.
    expect(commandes()).toEqual(['joindre_serveur'])
  })

  it('un serveur qui répond mal : l’écran d’accès dit pourquoi, avec son adresse sous la main', async () => {
    coque.joindre_serveur = () => {
      throw { code: 'certificat' }
    }
    await act(async () => racine.render(<Porte acces={retenu()} recherche="" surLocal={() => {}} />))
    expect(alerte()).toBe(texteErreur({ code: 'certificat' }))
    expect(document.querySelector<HTMLInputElement>('input[name="adresse"]')!.value).toBe(SERVEUR)
    expect(bouton('Toiles de cet ordinateur')).toBeTruthy()
    expect(bouton('Oublier ce serveur')).toBeTruthy()
    // Un seul essai : l'écran ne se reconnecte pas tout seul.
    expect(appelsDe('joindre_serveur')).toHaveLength(1)
  })

  it('depuis cet écran, « Toiles de cet ordinateur » fait rouvrir ici dès la prochaine fois', async () => {
    coque.joindre_serveur = () => {
      throw { code: 'injoignable' }
    }
    coque.revenir_ici = () => undefined
    await act(async () => racine.render(<Porte acces={retenu()} recherche="" surLocal={() => {}} />))
    await act(async () => bouton('Toiles de cet ordinateur')!.click())
    expect(appelsDe('revenir_ici')).toEqual([{ ecran: 'local' }])
  })

  it('« Réessayer » (« Se connecter ») renvoie l’adresse du champ', async () => {
    coque.joindre_serveur = () => {
      throw { code: 'delai' }
    }
    await act(async () => racine.render(<Porte acces={retenu()} recherche="" surLocal={() => {}} />))
    await act(async () => void document.querySelector('form')!.requestSubmit())
    expect(appelsDe('joindre_serveur')).toEqual([
      { adresse: SERVEUR, garder: true },
      { adresse: SERVEUR, garder: true },
    ])
  })
})

describe('l’écran d’accès demandé (?acces)', () => {
  it('ne se connecte jamais de lui-même, même avec un serveur à ouvrir', async () => {
    await act(async () => racine.render(<Porte acces={retenu()} recherche="?acces" surLocal={() => {}} />))
    expect(document.querySelector('h1')?.textContent).toBe('Se connecter à un serveur Notak')
    expect(invoke).not.toHaveBeenCalled()
    expect(alerte()).toBeNull()
  })

  it('erreur=muette : le serveur retenu n’a pas répondu, et le champ le porte', async () => {
    await act(async () => racine.render(<Porte acces={retenu()} recherche="?acces&erreur=muette" surLocal={() => {}} />))
    expect(alerte()).toContain('notak.exemple.fr n’a pas répondu')
    expect(document.querySelector<HTMLInputElement>('input[name="adresse"]')!.value).toBe(SERVEUR)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('une autre valeur d’erreur dans l’adresse ne s’affiche pas', async () => {
    await act(async () => racine.render(<Porte acces={retenu()} recherche="?acces&erreur=<b>piege</b>" surLocal={() => {}} />))
    expect(alerte()).toBeNull()
    expect(document.body.textContent).not.toContain('piege')
  })

  it('sans serveur retenu, il n’y a rien à reprocher à personne', async () => {
    await act(async () => racine.render(<Porte acces={acces()} recherche="?acces&erreur=muette" surLocal={() => {}} />))
    expect(alerte()).toBeNull()
    expect(document.querySelector<HTMLInputElement>('input[name="adresse"]')!.value).toBe('')
  })

  it('« Toiles de cet ordinateur » rend la main à l’édition locale', async () => {
    const surLocal = vi.fn()
    await act(async () => racine.render(<Porte acces={acces()} recherche="?acces" surLocal={surLocal} />))
    await act(async () => bouton('Toiles de cet ordinateur')!.click())
    expect(surLocal).toHaveBeenCalledOnce()
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('passer la porte', () => {
  it('les toiles de cet ordinateur : l’édition locale se monte sans rien afficher d’autre', async () => {
    coque.acces = () => acces()
    const monter = vi.fn()
    await act(async () => passerLaPorte(monter))
    expect(monter).toHaveBeenCalledOnce()
    expect(hote.childElementCount).toBe(0)
  })

  it('une coque d’avant les serveurs (réglages refusés) : l’édition locale', async () => {
    const monter = vi.fn()
    await act(async () => passerLaPorte(monter))
    expect(monter).toHaveBeenCalledOnce()
  })

  it('une coque qui ne répond pas retient la page trois secondes, pas davantage', async () => {
    vi.useFakeTimers()
    coque.acces = () => new Promise(() => {})
    const monter = vi.fn()
    const fin = passerLaPorte(monter)
    await vi.advanceTimersByTimeAsync(2_999)
    expect(monter).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await fin
    expect(monter).toHaveBeenCalledOnce()
  })

  it('un serveur retenu : la connexion prend la place, et l’édition locale ne se monte pas', async () => {
    coque.acces = () => retenu()
    coque.joindre_serveur = () => new Promise(() => {})
    const monter = vi.fn()
    await act(async () => passerLaPorte(monter))
    expect(monter).not.toHaveBeenCalled()
    expect(hote.querySelector('h1')?.textContent).toBe('Connexion à notak.exemple.fr…')
    expect(commandes()).toEqual(['acces', 'joindre_serveur'])
  })

  it('l’écran d’accès : choisir les toiles d’ici retire la porte, nettoie l’adresse et monte l’édition locale', async () => {
    history.replaceState(null, '', '/?acces&erreur=muette&garde=1#fin')
    coque.acces = () => acces({ serveur: SERVEUR })
    const monter = vi.fn(() => expect(hote.childElementCount).toBe(0))
    await act(async () => passerLaPorte(monter))
    expect(hote.querySelector('h1')?.textContent).toBe('Se connecter à un serveur Notak')
    expect(monter).not.toHaveBeenCalled()
    await act(async () => bouton('Toiles de cet ordinateur')!.click())
    expect(monter).toHaveBeenCalledOnce()
    // Un rechargement ne ramène pas à l'écran d'accès ; le reste de l'adresse est intact.
    expect(location.search).toBe('?garde=1')
    expect(location.hash).toBe('#fin')
  })
})
