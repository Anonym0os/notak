// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  /** Ce que l'édition serveur a donné à `creerReseauNavigateur` : de quoi simuler un refus ou une reconnexion. */
  options: [] as { surRefus?(t: string): void; surConnexion?(): void }[],
}))
vi.mock('@notak/tableau', async (origine) => ({
  ...(await origine<typeof import('@notak/tableau')>()),
  // Pas de vrai WebSocket ici : un réseau qui accepte tout, et dit tout synchronisé.
  creerReseauNavigateur: (_id: string, options: { surRefus?(t: string): void; surConnexion?(): void } = {}) => {
    m.options.push(options)
    return {
      connecter: () => ({ awareness: null, lectureSeule: () => false, refuse: () => false, synchronise: () => true, detruire() {} }),
      declarer: async () => {},
    }
  },
}))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const MOI = { id: 'u1', email: 'ana@exemple.fr', nom: 'Ana', couleur: '#336699', racine: 'racine', photo: null, admin: true }
const json = (corps: unknown, statut = 200, entetes: Record<string, string> = {}) => new Response(JSON.stringify(corps), { status: statut, headers: entetes })
const nonConnecte = () => json({ erreur: 'non connecté', code: 'non_connecte' }, 401)

let routes: Record<string, () => Response>
let appels: string[]
let version: string

beforeEach(() => {
  definirLangue('fr')
  vi.resetModules()
  m.options.length = 0
  appels = []
  version = '1.0.0'
  routes = {
    '/api/instance': () => json({ nom: 'Chez nous', inscriptions: 'ouvertes', habillages: [], version: '1.0.0' }),
    '/api/connexion/moyens': () => json({ fournisseurs: [], courriel: true }),
    '/api/moi': () => json(MOI),
    '/api/tableaux': () => json([]),
    '/api/bibliotheque': () => json([]),
    '/api/notifications': () => json({ notifications: [], nonLues: 0 }),
    '/api/sante': () => json({ produit: 'notak', version, origine: null, ok: true }),
    '/api/instance/mise-a-jour': () => json({ actuelle: '1.0.0', active: true }),
  }
  vi.stubGlobal('fetch', async (chemin: string | URL) => {
    const c = String(chemin)
    appels.push(c)
    return routes[c]?.() ?? json({ erreur: 'introuvable', code: 'introuvable' }, 404)
  })
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  localStorage.clear()
  document.body.innerHTML = '<div id="racine"></div>'
  history.replaceState(null, '', '/')
})
afterEach(() => {
  document.body.innerHTML = ''
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  vi.unstubAllGlobals()
  history.replaceState(null, '', '/')
})

const attendre = (ms = 0) => act(async () => void (await new Promise((fin) => setTimeout(fin, ms))))
/** Charge l'édition serveur : elle monte son application sur `#racine`, et lit le compte. */
async function demarrer() {
  await act(async () => void (await import('../edition/serveur')))
  await attendre()
  await attendre()
}
const racine = () => document.getElementById('racine')!
/** L'app de bureau : sa coque répond par `invoke`, qui rend `undefined` pour tout ce qu'on ne lui a pas appris. */
const dansLApp = (invoke = vi.fn().mockResolvedValue(undefined)) => {
  ;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = { invoke, transformCallback: () => 1 }
  return invoke
}
/** Une réponse qui n'arrive jamais : un serveur dont l'API reste pendue. */
const jamais = () => new Promise<Response>(() => {}) as unknown as Response
const commandes = (invoke: ReturnType<typeof vi.fn>) => invoke.mock.calls.map((c) => c[0])

describe('l’édition serveur : la bibliothèque', () => {
  it('s’ouvre sur le compte, et porte les bandeaux de la version : le rechargement web, et la nouvelle version du serveur', async () => {
    routes['/api/instance/mise-a-jour'] = () => json({ actuelle: '1.0.0', active: true, nouvelle: { version: '1.1.0', notes: 'Mieux.', adresse: 'https://exemple.fr/v110' } })
    await demarrer()
    expect(racine().textContent).not.toContain('Se connecter')
    expect(racine().querySelector('.bandeau-admin')?.textContent).toContain('Notak 1.1.0 est disponible (ce serveur : 1.0.0).')

    // La version web qui arrive sous la page ouverte : le même bandeau que sur une toile.
    const { signalerNouvelleVersion } = await import('../pwa')
    await act(async () => signalerNouvelleVersion())
    expect(racine().textContent).toContain('Une nouvelle version de Notak est arrivée')
    expect([...racine().querySelectorAll('button')].some((b) => b.textContent === 'Recharger')).toBe(true)
  })

  it('un compte qui n’administre pas le serveur ne voit pas la nouvelle version du serveur, et la question ne part pas', async () => {
    routes['/api/moi'] = () => json({ ...MOI, admin: false })
    await demarrer()
    expect(racine().querySelector('.bandeau-admin')).toBeNull()
    expect(appels).not.toContain('/api/instance/mise-a-jour')
  })
})

describe('l’édition serveur : un serveur qui ne répond pas', () => {
  it('dans l’app de bureau, la sortie reste là : changer de serveur, ou les toiles de cet ordinateur', async () => {
    dansLApp()
    routes['/api/moi'] = () => new Response('', { status: 503 })
    await demarrer()
    expect(racine().querySelector('.connexion-erreur')?.textContent).toBe('Le serveur a un souci')
    expect([...racine().querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Réessayer', 'Changer de serveur', 'Ouvrir les toiles de cet ordinateur'])
  })

  it('dans un navigateur, « Réessayer » seul', async () => {
    routes['/api/moi'] = () => new Response('', { status: 503 })
    await demarrer()
    expect([...racine().querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Réessayer'])
  })
})

describe('l’édition serveur : le signe de vie envoyé à la coque', () => {
  it('une fois le premier écran là — connecté, connexion ou erreur — et une seule fois', async () => {
    const cas: [string, () => void][] = [
      ['connecté', () => {}],
      ['connexion', () => void (routes['/api/moi'] = nonConnecte)],
      ['erreur', () => void (routes['/api/moi'] = () => new Response('', { status: 503 }))],
    ]
    for (const [ecran, preparer] of cas) {
      document.body.innerHTML = '<div id="racine"></div>'
      vi.resetModules()
      preparer()
      const invoke = dansLApp()
      await demarrer()
      expect(commandes(invoke).filter((c) => c === 'acces'), ecran).toHaveLength(1)
      // « Réessayer » repasse par le chargement : la coque est déjà prévenue.
      if (ecran === 'erreur') {
        await act(async () => [...racine().querySelectorAll('button')].find((b) => b.textContent === 'Réessayer')!.click())
        await attendre()
        expect(commandes(invoke).filter((c) => c === 'acces')).toHaveLength(1)
      }
    }
  })

  it('pas tant que l’API ne répond pas : un serveur muet ramène la fenêtre à l’écran d’accès au bout de 20 s', async () => {
    for (const muette of ['/api/moi', '/api/instance']) {
      document.body.innerHTML = '<div id="racine"></div>'
      vi.resetModules()
      routes[muette] = jamais
      const invoke = dansLApp()
      await demarrer()
      // L'écran d'attente seul : rien n'est monté, la coque ne sait pas la page vivante.
      expect(racine().querySelector('.ecran-attente'), muette).not.toBeNull()
      expect(commandes(invoke), muette).not.toContain('acces')
      routes[muette] = () => json(muette === '/api/moi' ? MOI : { nom: 'Chez nous', inscriptions: 'ouvertes', habillages: [] })
    }
  })
})

describe('l’édition serveur : une copie ouverte pendant la connexion ou quand le serveur ne répond pas', () => {
  const FICHIER = { id: 'f1', nom: 'Plan.notak', taille: 2048, confiee: false }
  /** Une coque dont la file tient `file`, et qui obéit à `revenir_ici`. */
  const coque = (file: unknown[]) =>
    vi.fn(async (commande: string) => {
      if (commande === 'fichiers_ouverts') return file
    })
  const bandeau = () => racine().querySelector('.bandeau-attente')

  it('l’écran de connexion le dit, et propose de l’ouvrir sur cet ordinateur sans attendre', async () => {
    routes['/api/moi'] = nonConnecte
    const invoke = dansLApp(coque([FICHIER]))
    await demarrer()
    expect(bandeau()?.textContent).toContain('Une copie Notak attend : connectez-vous pour l’importer sur localhost:3000, ou ouvrez-la sur cet ordinateur.')
    await act(async () => bandeau()!.querySelector('button')!.click())
    expect(invoke).toHaveBeenLastCalledWith('revenir_ici', { ecran: 'local' }, undefined)
  })

  it('la carte d’erreur d’un serveur qui ne répond pas aussi, au pluriel quand elles sont plusieurs', async () => {
    routes['/api/moi'] = () => new Response('', { status: 503 })
    dansLApp(coque([FICHIER, { ...FICHIER, id: 'f2', nom: 'Autre.notak' }]))
    await demarrer()
    expect(bandeau()?.textContent).toContain('2 copies Notak attendent : connectez-vous pour les importer sur localhost:3000, ou ouvrez-les sur cet ordinateur.')
  })

  it('les toiles de cet ordinateur confiées au serveur attendent aussi, sans bouton : elles sont pour lui', async () => {
    routes['/api/moi'] = nonConnecte
    dansLApp(coque([{ ...FICHIER, confiee: true }]))
    await demarrer()
    expect(bandeau()?.textContent).toContain('Une copie de vos toiles de cet ordinateur attend : connectez-vous pour l’importer sur localhost:3000.')
    expect(bandeau()!.querySelector('button')).toBeNull()
  })

  it('si la coque refuse de partir, on le dit', async () => {
    routes['/api/moi'] = nonConnecte
    const invoke = coque([FICHIER])
    invoke.mockImplementation(async (commande: string) => {
      if (commande === 'fichiers_ouverts') return [FICHIER]
      if (commande === 'revenir_ici') throw { code: 'interdit' }
    })
    dansLApp(invoke)
    await demarrer()
    await act(async () => bandeau()!.querySelector('button')!.click())
    expect(bandeau()!.querySelector('[role=alert]')?.textContent).toBe('Impossible de quitter ce serveur pour le moment. Réessayez.')
  })

  it('sans copie en attente, ou hors de l’app de bureau, rien', async () => {
    routes['/api/moi'] = nonConnecte
    dansLApp(coque([]))
    await demarrer()
    expect(bandeau()).toBeNull()
  })
})

describe('l’édition serveur : la session prend fin', () => {
  it('un « non connecté » sur un appel ramène à la connexion, avec un mot', async () => {
    await demarrer()
    expect(racine().textContent).not.toContain('Se connecter')
    routes['/api/tableaux'] = nonConnecte
    routes['/api/moi'] = nonConnecte
    // Chaque retour sur la fenêtre relit la liste des tableaux : c'est là que la session finie se découvre.
    await act(async () => void window.dispatchEvent(new Event('focus')))
    await attendre(10)
    await attendre(10)
    expect(racine().querySelector('h1')?.textContent).toBe('Chez nous')
    expect(racine().querySelector('.connexion-notice')?.textContent).toBe('Votre session a pris fin. Reconnectez-vous pour continuer.')
    expect(racine().querySelector('.connexion-notice')?.getAttribute('role')).toBe('alert')
    expect(racine().querySelector('input[type=email]')).not.toBeNull()
  })

  it('un 401 isolé que /api/moi dément ne déconnecte personne', async () => {
    await demarrer()
    routes['/api/tableaux'] = nonConnecte
    await act(async () => void window.dispatchEvent(new Event('focus')))
    await attendre(10)
    await attendre(10)
    expect(racine().querySelector('input[type=email]')).toBeNull()
  })

  it('l’espace refusé par la synchronisation : session finie, retour à la connexion ; sinon rien ne change', async () => {
    await demarrer()
    const { surRefus } = m.options.at(-1)!
    // Un accès retiré à ce seul tableau : la session tient, la page ne bouge pas.
    await act(async () => void surRefus?.('t1'))
    await attendre(10)
    expect(racine().querySelector('input[type=email]')).toBeNull()

    routes['/api/moi'] = nonConnecte
    await act(async () => void surRefus?.('t1'))
    await attendre(10)
    await attendre(10)
    expect(racine().querySelector('.connexion-notice')?.textContent).toContain('Votre session a pris fin')
  })

  it('la même personne qui se reconnecte retrouve son accueil, sans mot de la session finie', async () => {
    await demarrer()
    routes['/api/moi'] = nonConnecte
    routes['/api/tableaux'] = nonConnecte
    await act(async () => void window.dispatchEvent(new Event('focus')))
    await attendre(10)
    await attendre(10)
    expect(racine().querySelector('.connexion-notice')).not.toBeNull()

    routes['/api/moi'] = () => json(MOI)
    routes['/api/tableaux'] = () => json([])
    routes['/api/auth/sign-in/email'] = () => json({ token: 'x' })
    const champ = (nom: string) => racine().querySelector<HTMLInputElement>(`[data-champ="${nom}"]`)!
    const ecrire = (nom: string, valeur: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ(nom), valeur)
        champ(nom).dispatchEvent(new Event('input', { bubbles: true }))
      })
    await ecrire('email', 'ana@exemple.fr')
    await ecrire('mdp', 'motdepasse')
    await act(async () => void racine().querySelector('form')!.requestSubmit())
    await attendre(10)
    expect(racine().querySelector('.connexion-notice')).toBeNull()
    expect(racine().querySelector('input[type=email]')).toBeNull()
  })
})

describe('l’édition serveur : dans l’app de bureau', () => {
  it('un serveur mis à jour sous la fenêtre se voit à sa version, quand la fenêtre reprend la main', async () => {
    dansLApp()
    await demarrer()
    expect(racine().textContent).not.toContain('Une nouvelle version de Notak est arrivée')
    version = '1.0.1'
    await act(async () => void window.dispatchEvent(new Event('focus')))
    await attendre(10)
    expect(racine().textContent).toContain('Une nouvelle version de Notak est arrivée')
  })

  it('ou quand la synchronisation se rétablit', async () => {
    dansLApp()
    await demarrer()
    version = '1.0.1'
    // Au chargement, la première connexion a déjà demandé la version : la minute d'attente passe par là.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 120_000 })
    await act(async () => void m.options.at(-1)!.surConnexion?.())
    vi.useRealTimers()
    await attendre(10)
    expect(racine().textContent).toContain('Une nouvelle version de Notak est arrivée')
  })

  it('dans un navigateur, la page ne demande pas la version : le service worker s’en charge', async () => {
    await demarrer()
    version = '1.0.1'
    await act(async () => void window.dispatchEvent(new Event('focus')))
    await attendre(10)
    expect(appels).not.toContain('/api/sante')
    expect(racine().textContent).not.toContain('Une nouvelle version de Notak est arrivée')
  })
})

describe('l’édition serveur : la page où l’on autorise l’app de bureau', () => {
  it('sans compte : la connexion, avec le code de l’adresse gardé et un mot qui dit pourquoi', async () => {
    routes['/api/moi'] = nonConnecte
    history.replaceState(null, '', '/bureau/autoriser?user_code=ABCD2345')
    await demarrer()
    expect(racine().querySelector('.connexion-notice')?.textContent).toBe('Connectez-vous pour autoriser l’app Notak de bureau.')
    expect(location.pathname + location.search).toBe('/bureau/autoriser?user_code=ABCD2345')
  })

  it('une fois connecté, la page de confirmation du code', async () => {
    routes['/api/auth/device?user_code=ABCD2345'] = () => json({ user_code: 'ABCD2345', status: 'pending', client_id: 'notak-bureau' })
    routes['/api/bureau/demande?user_code=ABCD2345'] = () => json({ ip: '203.0.113.9', quand: Date.now(), ipActuelle: '203.0.113.9' })
    history.replaceState(null, '', '/bureau/autoriser?user_code=ABCD2345')
    await demarrer()
    expect(racine().querySelector('h1')?.textContent).toBe('Autoriser l’app Notak de bureau ?')
    expect(racine().querySelector('.autoriser-code')?.textContent).toBe('ABCD 2345')
  })
})
