// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EcranConnexion, adressePlausible } from './connexion'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
/** Ce que le serveur répond, adresse par adresse ; `/api/connexion/moyens` répond toujours. */
let reponses: Record<string, () => Response>
const appels: string[] = []

beforeEach(() => {
  definirLangue('fr')
  appels.length = 0
  reponses = {}
  vi.stubGlobal('fetch', async (adresse: string) => {
    appels.push(adresse)
    if (adresse === '/api/connexion/moyens') return Response.json({ fournisseurs: [], courriel: true })
    return reponses[adresse]?.() ?? new Response('{}', { status: 404 })
  })
  hote = document.createElement('div')
  document.body.appendChild(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.unstubAllGlobals()
})

const monter = async (surConnexion = vi.fn()) => {
  await act(async () => racine.render(<EcranConnexion instance={{ nom: 'Notak', inscriptions: 'ouvertes', habillages: [] }} surConnexion={surConnexion} />))
  return surConnexion
}
const champ = (nom: string) => hote.querySelector<HTMLInputElement>(`[data-champ="${nom}"]`)!
const ecrire = (nom: string, valeur: string) =>
  act(() => {
    const c = champ(nom)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(c, valeur)
    c.dispatchEvent(new Event('input', { bubbles: true }))
  })
const envoyer = () => act(async () => void hote.querySelector('form')!.requestSubmit())
const bouton = (texte: RegExp) => [...hote.querySelectorAll('button')].find((b) => texte.test(b.textContent ?? '') || texte.test(b.getAttribute('aria-label') ?? ''))!

describe('l’écran de connexion', () => {
  it('une adresse mal formée se dit avant d’aller au serveur, et son champ se marque', async () => {
    await monter()
    await ecrire('email', 'ana@exemple')
    await ecrire('mdp', 'motdepasse')
    await envoyer()
    expect(hote.querySelector('[role=alert]')?.textContent).toBe('Adresse invalide')
    expect(champ('email').getAttribute('aria-invalid')).toBe('true')
    expect(champ('email').getAttribute('aria-describedby')).toBe('connexion-erreur')
    expect(appels).not.toContain('/api/auth/sign-in/email')
  })

  it('le mot de passe s’affiche à la demande, et se cache de nouveau', async () => {
    await monter()
    expect(champ('mdp').type).toBe('password')
    await act(() => bouton(/Afficher le mot de passe/).click())
    expect(champ('mdp').type).toBe('text')
    expect(bouton(/Masquer le mot de passe/).getAttribute('aria-pressed')).toBe('true')
    await act(() => bouton(/Masquer le mot de passe/).click())
    expect(champ('mdp').type).toBe('password')
  })

  it('les majuscules verrouillées se signalent', async () => {
    await monter()
    await act(() => {
      const e = new KeyboardEvent('keydown', { key: 'A', bubbles: true })
      Object.defineProperty(e, 'getModifierState', { value: (m: string) => m === 'CapsLock' })
      champ('mdp').dispatchEvent(e)
    })
    expect(hote.textContent).toContain('Majuscules verrouillées')
    expect(champ('mdp').getAttribute('aria-describedby')).toContain('connexion-majuscules')
  })

  it('après trop d’essais, combien attendre ; le mot de passe reste, le curseur y revient', async () => {
    reponses['/api/auth/sign-in/email'] = () => new Response(JSON.stringify({ code: 'trop_d_essais' }), { status: 429, headers: { 'retry-after': '600' } })
    await monter()
    await ecrire('email', 'ana@exemple.fr')
    await ecrire('mdp', 'motdepasse')
    await envoyer()
    expect(hote.querySelector('[role=alert]')?.textContent).toBe('Trop d’essais : réessayez dans 10 min')
    expect(champ('mdp').value).toBe('motdepasse')
    expect(document.activeElement).toBe(champ('mdp'))
  })

  it('le bouton dit qu’il travaille, et un second Entrée ne renvoie rien', async () => {
    let finir: (r: Response) => void = () => {}
    reponses['/api/auth/sign-in/email'] = () => new Promise<Response>((r) => (finir = r)) as unknown as Response
    await monter()
    await ecrire('email', 'ana@exemple.fr')
    await ecrire('mdp', 'motdepasse')
    await envoyer()
    await envoyer()
    expect(hote.querySelector<HTMLButtonElement>('button[type=submit]')!.textContent).toBe('Un instant…')
    expect(hote.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true)
    expect(appels.filter((a) => a === '/api/auth/sign-in/email')).toHaveLength(1)
    await act(async () => finir(new Response(JSON.stringify({ code: 'identifiants_incorrects' }), { status: 401 })))
    expect(hote.querySelector('[role=alert]')?.textContent).toBe('Adresse ou mot de passe incorrect')
  })

  it('créer un compte dit la règle du mot de passe avant le refus', async () => {
    await monter()
    await act(() => bouton(/^Créer un compte$/).click())
    expect(document.activeElement).toBe(champ('nom'))
    expect(hote.textContent).toContain('8 caractères au moins.')
    expect(champ('mdp').getAttribute('autocomplete')).toBe('new-password')
    await ecrire('nom', 'Ana')
    await ecrire('email', 'ana@exemple.fr')
    await ecrire('mdp', 'court')
    await envoyer()
    expect(hote.querySelector('[role=alert]')?.textContent).toBe('8 caractères au moins')
  })

  it('le lien de mot de passe oublié dit à quelle adresse il part, sans dire si elle a un compte', async () => {
    reponses['/api/auth/request-password-reset'] = () => Response.json({ status: true })
    await monter()
    await act(() => bouton(/Mot de passe oublié/).click())
    await ecrire('email', 'Ana@Exemple.fr ')
    await envoyer()
    expect(hote.querySelector('[role=status]')?.textContent).toContain('Si ana@exemple.fr a un compte, un lien vient de partir')
  })
})

describe('une adresse plausible', () => {
  it('a un nom, une arobase et un domaine à point', () => {
    expect(adressePlausible('ana@exemple.fr')).toBe(true)
    expect(adressePlausible('ana.b+notak@sous.exemple.co')).toBe(true)
    expect(adressePlausible('ana@exemple')).toBe(false)
    expect(adressePlausible('@exemple.fr')).toBe(false)
    expect(adressePlausible('ana @exemple.fr')).toBe(false)
  })
})
