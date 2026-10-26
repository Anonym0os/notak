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
/** Ce que `/api/connexion/moyens` propose : aucun fournisseur, par défaut. */
let moyens: { fournisseurs: string[]; courriel: boolean }
const appels: string[] = []

beforeEach(() => {
  definirLangue('fr')
  appels.length = 0
  reponses = {}
  moyens = { fournisseurs: [], courriel: true }
  vi.stubGlobal('fetch', async (adresse: string) => {
    appels.push(adresse)
    if (adresse === '/api/connexion/moyens') return Response.json(moyens)
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

const monter = async (surConnexion = vi.fn(), notice?: { texte: string; urgent?: boolean }) => {
  await act(async () =>
    racine.render(<EcranConnexion instance={{ nom: 'Notak', inscriptions: 'ouvertes', habillages: [] }} surConnexion={surConnexion} {...(notice ? { notice } : {})} />),
  )
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

describe('ce qu’on sait en arrivant sur l’écran de connexion', () => {
  it('une session finie se dit, et d’abord à qui ne lit que les alertes', async () => {
    await monter(vi.fn(), { texte: 'Votre session a pris fin. Reconnectez-vous pour continuer.', urgent: true })
    expect(hote.querySelector('.connexion-notice')?.getAttribute('role')).toBe('alert')
    expect(hote.querySelector('.connexion-notice')?.textContent).toBe('Votre session a pris fin. Reconnectez-vous pour continuer.')
  })

  it('une indication sans urgence est un simple état', async () => {
    await monter(vi.fn(), { texte: 'Connectez-vous pour autoriser l’app Notak de bureau.' })
    expect(hote.querySelector('.connexion-notice')?.getAttribute('role')).toBe('status')
  })

  it('le retour d’un fournisseur en erreur garde le reste de l’adresse (le code de l’app qu’on autorise)', async () => {
    history.replaceState(null, '', '/bureau/autoriser?user_code=ABCD2345&error=access_denied&error_description=refus')
    await monter()
    expect(hote.querySelector('[role=alert]')?.textContent).toBe('La connexion n’a pas abouti. Réessayez, ou passez par votre mot de passe.')
    expect(location.pathname + location.search).toBe('/bureau/autoriser?user_code=ABCD2345')
    history.replaceState(null, '', '/')
  })

  it('et rend l’adresse nue quand il n’y avait rien d’autre', async () => {
    history.replaceState(null, '', '/?error=access_denied')
    await monter()
    expect(location.pathname + location.search).toBe('/')
  })
})

describe('l’écran de connexion dans un navigateur', () => {
  it('n’a ni la ligne du serveur ni la sortie vers cet ordinateur, et un fournisseur y mène chez lui', async () => {
    moyens = { fournisseurs: ['google'], courriel: true }
    reponses['/api/auth/sign-in/social'] = () => Response.json({})
    await monter()
    expect(hote.querySelector('.connexion-bureau')).toBeNull()
    expect(hote.textContent).not.toContain('toiles de cet ordinateur')
    await act(async () => bouton(/Continuer avec Google/).click())
    expect(appels).toContain('/api/auth/sign-in/social')
    expect(appels).not.toContain('/api/auth/device/code')
  })
})

describe('l’écran de connexion dans l’app de bureau', () => {
  const invoke = vi.fn()
  const ouvrir = vi.fn()
  const CODE = { device_code: 'dev-1', user_code: 'ABCD2345', verification_uri: 'x', verification_uri_complete: 'x', expires_in: 600, interval: 1 }
  const jeton = () => new Response(JSON.stringify({ error: 'authorization_pending' }), { status: 400 })
  const LIEN = 'http://localhost:3000/bureau/autoriser?user_code=ABCD2345'
  /** Les fois où la page a demandé à la coque d'ouvrir la page d'accord dans le navigateur. */
  const appelsOuvrir = () => invoke.mock.calls.filter((c) => c[0] === 'ouvrir_dans_le_navigateur')

  beforeEach(() => {
    invoke.mockReset().mockResolvedValue(undefined)
    ouvrir.mockReset()
    ;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = { invoke }
    vi.stubGlobal('open', ouvrir)
    moyens = { fournisseurs: ['google', 'github'], courriel: true }
    reponses['/api/auth/device/code'] = () => Response.json(CODE)
    reponses['/api/auth/device/token'] = jeton
  })
  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    vi.useRealTimers()
  })

  /** Avance l'horloge, dans `act` : la page se redessine avec ce que la machine d'états a dit. */
  const avancer = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
  const lancer = async (libelle = /Continuer avec Google/) => {
    vi.useFakeTimers()
    await monter()
    await act(async () => bouton(libelle).click())
    await avancer(0)
  }

  it('dit le serveur où l’on est, de quoi en changer, et de quoi ouvrir les toiles de cet ordinateur', async () => {
    await monter()
    const ligne = hote.querySelector('.connexion-bureau')!
    expect(ligne.textContent).toContain('Serveur : localhost:3000')
    await act(async () => bouton(/Changer de serveur/).click())
    expect(invoke).toHaveBeenLastCalledWith('revenir_ici', { ecran: 'acces' }, undefined)
    await act(async () => bouton(/Ouvrir les toiles de cet ordinateur/).click())
    expect(invoke).toHaveBeenLastCalledWith('revenir_ici', { ecran: 'local' }, undefined)
  })

  it('la sortie vers cet ordinateur est un verbe, et un lien : elle se voit cliquable', async () => {
    await monter()
    const local = bouton(/Ouvrir les toiles de cet ordinateur/)
    expect(local.className).toContain('bouton-lien')
    expect(local.className).toContain('connexion-local')
    expect(local.closest('.connexion-bureau')).not.toBeNull()
  })

  it('la note sous les connexions ne nomme aucun fournisseur : le serveur n’en propose peut-être aucun', async () => {
    moyens = { fournisseurs: ['github'], courriel: true }
    await monter()
    const note = hote.querySelector('.connexion-fournisseurs .connexion-note')?.textContent
    expect(note).toBe('Ces connexions se terminent dans votre navigateur.')
    expect(note).not.toMatch(/Google|Microsoft|GitHub/)
  })

  it('si la coque refuse de partir, on le dit et les boutons restent', async () => {
    invoke.mockRejectedValue({ code: 'interdit' })
    await monter()
    await act(async () => bouton(/Changer de serveur/).click())
    expect(hote.querySelector('.connexion-bureau [role=alert]')?.textContent).toContain('Impossible de quitter ce serveur')
    expect(bouton(/Changer de serveur/).disabled).toBe(false)
  })

  it('un fournisseur ne mène pas la fenêtre chez lui : l’écran d’attente montre le code, et le navigateur s’ouvre', async () => {
    await lancer()
    expect(appels).not.toContain('/api/auth/sign-in/social')
    expect(appels).toContain('/api/auth/device/code')
    expect(hote.querySelector('h1')?.textContent).toBe('Terminez la connexion dans votre navigateur')
    expect(hote.querySelector('.connexion-code-valeur')?.textContent).toBe('ABCD 2345')
    expect(hote.querySelector('[role=group]')?.getAttribute('aria-labelledby')).toBe('connexion-code-etiquette')
    // La coque ouvre elle-même la page d'accord (WebKit refuserait `window.open`, qui n'est plus le fruit d'un clic).
    expect(invoke).toHaveBeenCalledWith('ouvrir_dans_le_navigateur', { adresse: LIEN }, undefined)
    expect(appelsOuvrir()).toHaveLength(1)
    expect(ouvrir).not.toHaveBeenCalled()
    expect(hote.textContent).toContain('Ce code expire dans 10 min.')
    // Le curseur est sur ce qui sert d'abord : rouvrir le navigateur.
    expect(document.activeElement).toBe(bouton(/Rouvrir le navigateur/))
  })

  it('le lecteur d’écran, qui n’entend que le bouton où va le curseur, y trouve l’aide et le code, lus lettre par lettre', async () => {
    await lancer()
    const rouvrir = bouton(/Rouvrir le navigateur/)
    const decrit = rouvrir.getAttribute('aria-describedby')!.split(' ')
    expect(decrit).toEqual(['connexion-code-aide', 'connexion-code-bloc'])
    expect(hote.querySelector(`#${decrit[0]}`)?.textContent).toContain('Votre navigateur s’ouvre sur localhost:3000.')
    // À l'écran : « ABCD 2345 », caché au lecteur d'écran ; pour lui : les lettres une à une.
    const valeur = hote.querySelector('.connexion-code-valeur')!
    expect(valeur.getAttribute('aria-hidden')).toBe('true')
    expect(valeur.nextElementSibling?.className).toBe('sr-seulement')
    expect(valeur.nextElementSibling?.textContent).toBe('A B C D, 2 3 4 5')
    // Aucun ancêtre `aria-busy` ne retarde les annonces des régions d'état.
    expect(hote.querySelector('.connexion-code')?.hasAttribute('aria-busy')).toBe(false)
  })

  it('« Rouvrir le navigateur » remet le lien dans le navigateur', async () => {
    await lancer()
    await act(async () => bouton(/Rouvrir le navigateur/).click())
    expect(appelsOuvrir()).toHaveLength(2)
    expect(appelsOuvrir()[1]![1]).toEqual({ adresse: LIEN })
  })

  it('une coque qui ne sait pas ouvrir la page (ou qui refuse) : la fenêtre retombe sur window.open, et « Rouvrir » reste là', async () => {
    invoke.mockImplementation(async (commande: string) => {
      if (commande === 'ouvrir_dans_le_navigateur') throw { code: 'interdit' }
    })
    await lancer()
    expect(ouvrir).toHaveBeenCalledExactlyOnceWith(LIEN, '_blank', 'noopener')
    expect(bouton(/Rouvrir le navigateur/)).toBeTruthy()
  })

  it('le compte à rebours avance', async () => {
    await lancer()
    await avancer(60_000 + 1000)
    expect(hote.textContent).toContain('Ce code expire dans 9 min.')
  })

  it('accordé dans le navigateur : la session est relue, et l’écran de connexion rend la main', async () => {
    reponses['/api/moi'] = () => Response.json({ id: 'u1', email: 'ana@exemple.fr', nom: 'Ana' })
    const surConnexion = vi.fn()
    vi.useFakeTimers()
    await monter(surConnexion)
    await act(async () => bouton(/Continuer avec GitHub/).click())
    await avancer(0)
    reponses['/api/auth/device/token'] = () => Response.json({ access_token: 'x' })
    await avancer(1000)
    expect(appels).toContain('/api/moi')
    expect(surConnexion).toHaveBeenCalledExactlyOnceWith({ id: 'u1', email: 'ana@exemple.fr', nom: 'Ana' })
  })

  it('accordé, mais la session n’est pas arrivée dans cette fenêtre : on le dit, et l’on peut recommencer', async () => {
    reponses['/api/moi'] = () => new Response('{}', { status: 401 })
    const surConnexion = vi.fn()
    vi.useFakeTimers()
    await monter(surConnexion)
    await act(async () => bouton(/Continuer avec Google/).click())
    await avancer(0)
    reponses['/api/auth/device/token'] = () => Response.json({ access_token: 'x' })
    await avancer(1000)
    expect(surConnexion).not.toHaveBeenCalled()
    expect(hote.querySelector('[role=alert]')?.textContent).toContain('cette fenêtre n’a pas reçu votre session')
    expect(hote.querySelector('h1')?.textContent).toBe('La connexion n’a pas abouti')
  })

  it('annuler ramène au formulaire, arrête l’attente, et le curseur y revient', async () => {
    await lancer()
    const avant = appels.length
    await act(async () => bouton(/Annuler/).click())
    expect(hote.querySelector('form')).not.toBeNull()
    expect(document.activeElement).toBe(champ('email'))
    await avancer(30_000)
    expect(appels.length).toBe(avant)
  })

  it('chaque issue a ses mots, et « Recommencer » demande un nouveau code', async () => {
    const issues: [() => Response, RegExp][] = [
      [() => new Response(JSON.stringify({ error: 'expired_token' }), { status: 400 }), /Ce code n’est plus valable/],
      [() => new Response(JSON.stringify({ error: 'access_denied' }), { status: 400 }), /refusée dans le navigateur/],
      [() => new Response(JSON.stringify({ error: 'invalid_scope' }), { status: 400 }), /La connexion n’a pas abouti\. Réessayez/],
    ]
    for (const [jetonRefuse, mots] of issues) {
      vi.useFakeTimers()
      appels.length = 0
      reponses['/api/auth/device/token'] = jetonRefuse
      await monter()
      await act(async () => bouton(/Continuer avec Google/).click())
      await avancer(1000)
      expect(hote.querySelector('[role=alert]')?.textContent).toMatch(mots)
      expect(document.activeElement).toBe(bouton(/Recommencer/))
      const codes = appels.filter((a) => a === '/api/auth/device/code').length
      reponses['/api/auth/device/token'] = jeton
      await act(async () => bouton(/Recommencer/).click())
      await avancer(0)
      expect(appels.filter((a) => a === '/api/auth/device/code')).toHaveLength(codes + 1)
      expect(hote.querySelector('.connexion-code-valeur')?.textContent).toBe('ABCD 2345')
      await act(async () => bouton(/Annuler/).click())
      vi.useRealTimers()
    }
  })

  it('un serveur qui ne répond pas, qui ne connaît pas les codes, ou qui limite : un mot pour chaque', async () => {
    const cas: [() => Response, RegExp][] = [
      [() => new Response('', { status: 404 }), /ne sait pas encore connecter l’app par le navigateur/],
      [() => new Response(JSON.stringify({ code: 'trop_d_essais' }), { status: 429, headers: { 'retry-after': '120' } }), /Trop d’essais : réessayez dans 2 min/],
    ]
    for (const [code, mots] of cas) {
      reponses['/api/auth/device/code'] = code
      vi.useFakeTimers()
      await monter()
      await act(async () => bouton(/Continuer avec Google/).click())
      await avancer(0)
      expect(hote.querySelector('[role=alert]')?.textContent).toMatch(mots)
      await act(async () => bouton(/Retour à la connexion/).click())
      expect(hote.querySelector('form')).not.toBeNull()
      vi.useRealTimers()
    }
  })

  it('le SSO ne demande pas l’adresse ici : elle se donne dans le navigateur', async () => {
    await monter()
    await act(async () => bouton(/SSO de mon entreprise/).click())
    expect(hote.textContent).toContain('Votre navigateur s’ouvrira sur ce serveur')
    expect(champ('email')).toBeNull()
    expect(bouton(/Continuer dans le navigateur/)).toBeTruthy()
    vi.useFakeTimers()
    await act(async () => bouton(/Continuer dans le navigateur/).click())
    await avancer(0)
    expect(appels).toContain('/api/auth/device/code')
    expect(appels).not.toContain('/api/auth/sign-in/sso')
    expect(hote.querySelector('.connexion-code-valeur')?.textContent).toBe('ABCD 2345')
  })

  it('le mot de passe oublié dit que le lien s’ouvrira dans le navigateur', async () => {
    reponses['/api/auth/request-password-reset'] = () => Response.json({ status: true })
    await monter()
    await act(() => bouton(/Mot de passe oublié/).click())
    expect(hote.textContent).toContain('Le lien reçu s’ouvrira dans votre navigateur')
    await ecrire('email', 'ana@exemple.fr')
    await envoyer()
    const avis = hote.querySelector('[role=status]')?.textContent
    expect(avis).toContain('Si ana@exemple.fr a un compte, un lien vient de partir')
    // Après « Pensez à regarder dans les indésirables. » : « Ce lien » et non « Il », qui se rattacherait aux indésirables.
    expect(avis).toContain('Ce lien s’ouvrira dans votre navigateur : changez-y le mot de passe, puis revenez ici pour vous connecter.')
  })

  it('le mot de passe se tape comme avant', async () => {
    reponses['/api/auth/sign-in/email'] = () => new Response(JSON.stringify({ code: 'identifiants_incorrects' }), { status: 401 })
    await monter()
    await ecrire('email', 'ana@exemple.fr')
    await ecrire('mdp', 'motdepasse')
    await envoyer()
    expect(appels).toContain('/api/auth/sign-in/email')
    expect(hote.querySelector('[role=alert]')?.textContent).toBe('Adresse ou mot de passe incorrect')
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
