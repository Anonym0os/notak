// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Moi, ecouterSessionFinie } from '../api'
import { PageAutoriser, quandEnMots } from './Autoriser'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
let routes: Record<string, () => Response | Promise<Response>>
let appels: { cle: string; corps: unknown }[]

const ana: Moi = { id: 'u1', email: 'ana@exemple.fr', nom: 'Ana', couleur: '#000000', racine: 'r', photo: null }
const CODE = 'ABCD2345'
const lire = (chemin: string) => `GET ${chemin}`

const json = (corps: unknown, statut = 200) => new Response(JSON.stringify(corps), { status: statut })
const refus = (statut: number, error: string) => json({ error, error_description: 'in English' }, statut)
const ouvert = (extra: Record<string, unknown> = {}) => json({ user_code: CODE, status: 'pending', client_id: 'notak-bureau', ...extra })
const demande = (extra: Record<string, unknown> = {}) => json({ ip: '203.0.113.9', quand: Date.now() - 2 * 60_000, ipActuelle: '203.0.113.9', ...extra })

beforeEach(() => {
  definirLangue('fr')
  appels = []
  routes = {
    [lire(`/api/auth/device?user_code=${CODE}`)]: () => ouvert(),
    [lire(`/api/bureau/demande?user_code=${CODE}`)]: () => demande(),
    'POST /api/auth/device/approve': () => json({ success: true }),
    'POST /api/auth/device/deny': () => json({ success: true }),
  }
  vi.stubGlobal('fetch', async (chemin: string, init?: RequestInit) => {
    const cle = `${init?.method ?? 'GET'} ${chemin}`
    appels.push({ cle, corps: init?.body ? JSON.parse(String(init.body)) : undefined })
    const r = routes[cle]
    if (!r) throw new Error(`appel imprévu : ${cle}`)
    return r()
  })
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.unstubAllGlobals()
  history.replaceState(null, '', '/')
})

const monter = async (adresse = `/bureau/autoriser?user_code=${CODE}`) => {
  history.replaceState(null, '', adresse)
  await act(async () => racine.render(<PageAutoriser moi={ana} />))
}
const bouton = (texte: RegExp) => [...hote.querySelectorAll('button')].find((b) => texte.test(b.textContent ?? ''))!
const alertes = () => [...hote.querySelectorAll('[role=alert]')].map((a) => a.textContent)

describe('la page où l’on autorise l’app de bureau', () => {
  it('montre le code à comparer, d’où et quand l’app l’a demandé, et ouvre le code avant de lire la demande', async () => {
    await monter()
    expect(hote.querySelector('h1')?.textContent).toBe('Autoriser l’app Notak de bureau ?')
    expect(hote.textContent).toContain('Une app Notak de bureau demande à se connecter au compte Ana (ana@exemple.fr) sur ce serveur.')
    expect(hote.querySelector('.autoriser-code')?.textContent).toBe('ABCD 2345')
    expect(hote.textContent).toContain('203.0.113.9')
    expect(hote.textContent).toContain('il y a 2 minutes')
    // Le code se confie d'abord à ce compte : sans cela, la demande est refusée.
    expect(appels.map((a) => a.cle)).toEqual([lire(`/api/auth/device?user_code=${CODE}`), lire(`/api/bureau/demande?user_code=${CODE}`)])
    // Même réseau : rien ne s'alarme.
    expect(alertes()).toEqual([])
    expect(bouton(/^Autoriser$/)).toBeTruthy()
    expect(bouton(/^Refuser$/)).toBeTruthy()
    // Une demande d'ici : « Autoriser » est le bouton principal.
    expect(bouton(/^Autoriser$/).className).toContain('bouton-plein')
    expect(bouton(/^Refuser$/).className).not.toContain('bouton-plein')
  })

  it('le curseur arrive sur la carte, pas sur « Autoriser » : un Entrée ne suffit pas', async () => {
    await monter()
    const carte = hote.querySelector('.autoriser-carte')!
    expect(document.activeElement).toBe(carte)
    expect(carte.getAttribute('aria-labelledby')).toBe('autoriser-comparer')
  })

  it('une demande qui ne vient pas du réseau de la personne est signalée, avec les deux adresses', async () => {
    routes[lire(`/api/bureau/demande?user_code=${CODE}`)] = () => demande({ ipActuelle: '198.51.100.4' })
    await monter()
    expect(alertes()).toEqual(['Cette demande ne vient pas de votre réseau actuel : si vous n’avez pas lancé la connexion vous-même, refusez.'])
    expect(hote.textContent).toContain('203.0.113.9')
    expect(hote.textContent).toContain('198.51.100.4')
    // Et c'est « Refuser » qui prend la place du bouton principal : le geste qui protège est celui qu'on trouve d'abord.
    expect(bouton(/^Refuser$/).className).toContain('bouton-plein')
    expect(bouton(/^Autoriser$/).className).not.toContain('bouton-plein')
  })

  it('une origine que le serveur ne sait plus (redémarré) est dite aussi, et l’on peut toujours décider', async () => {
    routes[lire(`/api/bureau/demande?user_code=${CODE}`)] = () => json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    await monter()
    expect(alertes()).toEqual(['Le serveur ne sait plus d’où cette demande est partie (il a redémarré depuis). Si vous n’avez pas lancé la connexion vous-même, refusez.'])
    expect(bouton(/^Autoriser$/).disabled).toBe(false)
    expect(bouton(/^Refuser$/).className).toContain('bouton-plein')
  })

  it('« Autoriser » dit au serveur d’accepter ce code, et la page dit de revenir dans l’app', async () => {
    await monter()
    await act(async () => bouton(/^Autoriser$/).click())
    expect(appels.at(-1)).toEqual({ cle: 'POST /api/auth/device/approve', corps: { userCode: CODE } })
    expect(hote.querySelector('[role=status]')?.textContent).toContain('C’est fait : revenez dans l’app Notak.')
    expect(hote.textContent).toContain('Vous pouvez fermer cet onglet.')
    expect(hote.querySelector('button')).toBeNull()
  })

  it('« Refuser » dit au serveur de refuser, et la page le dit', async () => {
    await monter()
    await act(async () => bouton(/^Refuser$/).click())
    expect(appels.at(-1)).toEqual({ cle: 'POST /api/auth/device/deny', corps: { userCode: CODE } })
    expect(hote.querySelector('[role=status]')?.textContent).toContain('Demande refusée.')
  })

  it('un second clic pendant l’envoi n’envoie rien, et les boutons le disent', async () => {
    let finir: (r: Response) => void = () => {}
    routes['POST /api/auth/device/approve'] = () => new Promise<Response>((r) => (finir = r))
    await monter()
    await act(async () => bouton(/^Autoriser$/).click())
    expect(bouton(/Un instant/).disabled).toBe(true)
    expect(bouton(/^Refuser$/).disabled).toBe(true)
    await act(async () => bouton(/Un instant/).click())
    await act(async () => bouton(/^Refuser$/).click())
    expect(appels.filter((a) => a.cle.startsWith('POST'))).toHaveLength(1)
    await act(async () => finir(json({ success: true })))
    expect(hote.textContent).toContain('C’est fait')
  })

  it('une coupure pendant l’envoi se dit, et l’on peut réessayer', async () => {
    let essais = 0
    routes['POST /api/auth/device/approve'] = () => {
      if (++essais === 1) throw new TypeError('hors ligne')
      return json({ success: true })
    }
    await monter()
    await act(async () => bouton(/^Autoriser$/).click())
    expect(alertes()).toEqual(['Serveur injoignable'])
    expect(bouton(/^Autoriser$/).disabled).toBe(false)
    await act(async () => bouton(/^Autoriser$/).click())
    expect(hote.textContent).toContain('C’est fait')
  })

  it('un code confié à un autre compte ne se laisse pas autoriser', async () => {
    routes[lire(`/api/auth/device?user_code=${CODE}`)] = () => json({ user_code: CODE, status: 'pending' })
    // Et la session tient (sinon la page reviendrait à la connexion).
    routes[lire('/api/moi')] = () => json({ id: 'u1' })
    await monter()
    expect(alertes()).toEqual(['Cette demande a été ouverte avec un autre compte : connectez-vous avec le compte qui l’a ouverte, ou relancez la connexion dans l’app.'])
    expect(hote.querySelector('h2')?.textContent).toBe('Cette demande ne peut pas être traitée')
    expect(hote.textContent).toContain('Relancez la connexion dans l’app Notak')
    expect(appels.map((a) => a.cle)).not.toContain(lire(`/api/bureau/demande?user_code=${CODE}`))
  })

  it('le serveur qui refuse l’accord à ce compte (403) le dit de même', async () => {
    routes['POST /api/auth/device/approve'] = () => refus(403, 'access_denied')
    await monter()
    await act(async () => bouton(/^Autoriser$/).click())
    expect(alertes()[0]).toContain('autre compte')
    expect(hote.querySelector('button')).toBeNull()
  })

  it('un code expiré, inconnu ou déjà utilisé a chacun ses mots', async () => {
    const cle = lire(`/api/auth/device?user_code=${CODE}`)
    routes[cle] = () => refus(400, 'expired_token')
    await monter()
    expect(alertes()).toEqual(['Ce code a expiré.'])

    routes[cle] = () => refus(400, 'invalid_request')
    await act(async () => racine.render(null))
    await monter()
    expect(alertes()).toEqual(['Ce code n’est pas reconnu, ou il a déjà servi.'])

    routes[cle] = () => ouvert({ status: 'approved' })
    await act(async () => racine.render(null))
    await monter()
    expect(alertes()).toEqual(['Ce code a déjà été utilisé.'])

    // Accepté entre-temps, depuis un autre onglet : l'accord se refuse, avec les mots du serveur.
    routes[cle] = () => ouvert()
    routes['POST /api/auth/device/approve'] = () => refus(400, 'invalid_request')
    await act(async () => racine.render(null))
    await monter()
    await act(async () => bouton(/^Autoriser$/).click())
    expect(alertes()).toEqual(['Ce code n’est pas reconnu, ou il a déjà servi.'])
  })

  it('trop d’essais : combien attendre', async () => {
    routes[lire(`/api/auth/device?user_code=${CODE}`)] = () => new Response(JSON.stringify({ code: 'trop_d_essais' }), { status: 429, headers: { 'retry-after': '600' } })
    await monter()
    expect(alertes()).toEqual(['Trop d’essais : réessayez dans 10 min'])
  })

  it('le code de l’adresse est relu avec méfiance : rien ne part pour ce qui n’en est pas un', async () => {
    await monter('/bureau/autoriser?user_code=%3Cscript%3Ealert(1)%3C/script%3E')
    expect(alertes()).toEqual(['Ce code n’est pas reconnu, ou il a déjà servi.'])
    expect(appels).toEqual([])
    expect(hote.querySelector('script')).toBeNull()
  })

  it('le code se lit comme on le tape : minuscules, tiret', async () => {
    await monter(`/bureau/autoriser?user_code=${CODE.slice(0, 4).toLowerCase()}-${CODE.slice(4)}`)
    expect(appels[0]!.cle).toBe(lire(`/api/auth/device?user_code=${CODE}`))
    expect(hote.querySelector('.autoriser-code')?.textContent).toBe('ABCD 2345')
  })

  it('une session qui finit pendant l’accord (401) renvoie à la connexion, sans perdre le code de l’adresse', async () => {
    routes['POST /api/auth/device/approve'] = () => refus(401, 'unauthorized')
    const fini = vi.fn()
    const arreter = ecouterSessionFinie(fini)
    await monter()
    await act(async () => bouton(/^Autoriser$/).click())
    expect(fini).toHaveBeenCalledTimes(1)
    expect(location.search).toBe(`?user_code=${CODE}`)
    arreter()
  })

  it('sans code dans l’adresse, la page le demande, et le garde dans l’adresse', async () => {
    await monter('/bureau/autoriser')
    expect(hote.querySelector('h2')?.textContent).toBe('Quel code l’app affiche-t-elle ?')
    expect(appels).toEqual([])
    const champ = hote.querySelector<HTMLInputElement>('input')!
    const ecrire = (v: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, v)
        champ.dispatchEvent(new Event('input', { bubbles: true }))
      })
    await ecrire('abc')
    await act(async () => void hote.querySelector('form')!.requestSubmit())
    expect(alertes()).toEqual(['Ce code n’a pas la bonne forme : des lettres et des chiffres, huit en tout.'])
    expect(champ.getAttribute('aria-invalid')).toBe('true')
    expect(appels).toEqual([])

    await ecrire(' abcd-2345 ')
    await act(async () => void hote.querySelector('form')!.requestSubmit())
    expect(location.search).toBe(`?user_code=${CODE}`)
    expect(hote.querySelector('.autoriser-code')?.textContent).toBe('ABCD 2345')
  })
})

describe('quand la demande a été faite', () => {
  const maintenant = Date.UTC(2026, 9, 26, 14, 5)
  it('à l’instant, il y a quelques minutes, il y a longtemps', () => {
    definirLangue('fr')
    expect(quandEnMots(maintenant - 20_000, maintenant)).toContain('à l’instant')
    expect(quandEnMots(maintenant - 5 * 60_000, maintenant)).toContain('il y a 5 minutes')
    // Au-delà d'une heure et demie, la date seule : le code vit dix minutes, c'est déjà étrange.
    expect(quandEnMots(maintenant - 3 * 3600_000, maintenant)).not.toContain('(')
    // Une horloge du serveur en avance : « à l'instant », pas « dans 3 minutes ».
    expect(quandEnMots(maintenant + 3 * 60_000, maintenant)).toContain('à l’instant')
  })

  it('en anglais', () => {
    definirLangue('en')
    expect(quandEnMots(maintenant - 5 * 60_000, maintenant)).toContain('5 minutes ago')
    expect(quandEnMots(maintenant - 10_000, maintenant)).toContain('just now')
  })
})
