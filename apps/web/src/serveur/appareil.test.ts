import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIENT_BUREAU, type EtatAppareil, PAGE_AUTORISER, codePlausible, epeler, grouperCode, lancerConnexionParCode, lienDeConfirmation, normaliserCode } from './appareil'

const ORIGINE = 'https://notak.exemple.fr'

/** Ce que le serveur répond, dans l'ordre : la demande du code, puis chaque essai du jeton. */
let reponses: (Response | Error)[]
let appels: { chemin: string; corps: Record<string, unknown>; init: RequestInit }[]

beforeEach(() => {
  vi.useFakeTimers()
  reponses = []
  appels = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (chemin: string, init: RequestInit) => {
      appels.push({ chemin, corps: JSON.parse(String(init.body)) as Record<string, unknown>, init })
      const r = reponses.shift()
      if (!r) throw new Error('plus de réponse prévue')
      if (r instanceof Error) throw r
      return r
    }),
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const accorde = (extra: Record<string, unknown> = {}) =>
  Response.json({
    device_code: 'dev-123',
    user_code: 'ABCD2345',
    verification_uri: `${ORIGINE}/bureau/autoriser`,
    verification_uri_complete: `${ORIGINE}/bureau/autoriser?user_code=ABCD2345`,
    expires_in: 600,
    interval: 5,
    ...extra,
  })
const erreur = (error: string, status = 400, entetes: Record<string, string> = {}) => new Response(JSON.stringify({ error }), { status, headers: entetes })
const jeton = () => Response.json({ access_token: 'x', token_type: 'Bearer' })

function lancer() {
  const etats: EtatAppareil[] = []
  const ouvrir = vi.fn()
  const appareil = lancerConnexionParCode({ surEtat: (e) => etats.push(e), ouvrir, origine: ORIGINE })
  const dernier = () => etats[etats.length - 1]!
  const avancer = (ms: number) => vi.advanceTimersByTimeAsync(ms)
  return { etats, ouvrir, appareil, dernier, avancer }
}

describe('la connexion par un code', () => {
  it('demande un code au serveur, montre le code, ouvre le navigateur, puis attend l’accord', async () => {
    reponses = [accorde(), erreur('authorization_pending'), erreur('authorization_pending'), jeton()]
    const { etats, ouvrir, dernier, avancer } = lancer()
    await avancer(0)

    expect(etats[0]).toEqual({ type: 'demande' })
    expect(appels[0]).toMatchObject({ chemin: '/api/auth/device/code', corps: { client_id: 'notak-bureau' } })
    // Un envoi de la page : JSON, avec ses cookies, pour que le serveur y pose la session.
    expect(appels[0]!.init).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } })
    expect(dernier()).toMatchObject({ type: 'attente', code: 'ABCD2345', lien: `${ORIGINE}/bureau/autoriser?user_code=ABCD2345` })
    expect(ouvrir).toHaveBeenCalledExactlyOnceWith(`${ORIGINE}/bureau/autoriser?user_code=ABCD2345`)

    // Pas d'essai avant l'intervalle que le serveur a donné.
    await avancer(4_999)
    expect(appels).toHaveLength(1)
    await avancer(1)
    expect(appels[1]).toMatchObject({
      chemin: '/api/auth/device/token',
      corps: { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: 'dev-123', client_id: 'notak-bureau' },
    })
    expect(dernier().type).toBe('attente')
    await avancer(5_000)
    expect(dernier().type).toBe('attente')
    await avancer(5_000)
    expect(dernier()).toEqual({ type: 'accorde' })

    // Fini : plus rien ne part.
    await avancer(60_000)
    expect(appels).toHaveLength(4)
  })

  it('« ralentissez » : cinq secondes de plus entre deux essais, pour de bon', async () => {
    reponses = [accorde(), erreur('slow_down'), erreur('authorization_pending'), jeton()]
    const { dernier, avancer } = lancer()
    await avancer(5_000)
    expect(appels).toHaveLength(2)
    await avancer(9_999)
    expect(appels).toHaveLength(2)
    await avancer(1)
    expect(appels).toHaveLength(3)
    // Le ralentissement dure : le troisième essai est à 10 s du deuxième, lui aussi.
    await avancer(9_999)
    expect(appels).toHaveLength(3)
    await avancer(1)
    expect(dernier()).toEqual({ type: 'accorde' })
  })

  it('un serveur qui répond « trop de demandes » est ménagé, au moins autant qu’il le demande', async () => {
    reponses = [accorde(), erreur('slow_down', 429, { 'retry-after': '30' }), jeton()]
    const { dernier, avancer } = lancer()
    await avancer(5_000)
    await avancer(29_999)
    expect(appels).toHaveLength(2)
    await avancer(1)
    expect(dernier()).toEqual({ type: 'accorde' })
  })

  it('un code expiré côté serveur se dit, et on cesse d’interroger', async () => {
    reponses = [accorde(), erreur('expired_token')]
    const { dernier, avancer } = lancer()
    await avancer(5_000)
    expect(dernier()).toEqual({ type: 'expire' })
    await avancer(60_000)
    expect(appels).toHaveLength(2)
  })

  it('un code que le serveur ne connaît plus (déjà servi, effacé) vaut un code expiré', async () => {
    reponses = [accorde(), erreur('invalid_grant')]
    const { dernier, avancer } = lancer()
    await avancer(5_000)
    expect(dernier()).toEqual({ type: 'expire' })
  })

  it('un refus dans le navigateur se dit, et on cesse d’interroger', async () => {
    reponses = [accorde(), erreur('authorization_pending'), erreur('access_denied')]
    const { dernier, avancer } = lancer()
    await avancer(10_000)
    expect(dernier()).toEqual({ type: 'refuse' })
    await avancer(60_000)
    expect(appels).toHaveLength(3)
  })

  it('sans réponse du serveur, le code s’éteint à l’heure dite, sans un essai de plus', async () => {
    reponses = [accorde({ expires_in: 12 }), erreur('authorization_pending'), erreur('authorization_pending')]
    const { dernier, avancer } = lancer()
    await avancer(5_000)
    await avancer(5_000)
    expect(dernier().type).toBe('attente')
    expect(appels).toHaveLength(3)
    await avancer(1_999)
    expect(dernier().type).toBe('attente')
    await avancer(1)
    expect(dernier()).toEqual({ type: 'expire' })
    expect(appels).toHaveLength(3)
  })

  it('une coupure passagère ne tue pas l’attente ; quatre d’affilée, si', async () => {
    reponses = [accorde(), new TypeError('coupé'), new TypeError('coupé'), new TypeError('coupé'), erreur('authorization_pending'), jeton()]
    const a = lancer()
    await a.avancer(5_000 * 5)
    expect(a.dernier()).toEqual({ type: 'accorde' })

    appels.length = 0
    reponses = [accorde(), new TypeError('coupé'), new Response('', { status: 502 }), new TypeError('coupé'), new TypeError('coupé')]
    const b = lancer()
    await b.avancer(5_000 * 4)
    expect(b.dernier()).toEqual({ type: 'echec', cause: 'reseau' })
    await b.avancer(60_000)
    expect(appels).toHaveLength(5)
  })

  it('le lien se construit sur l’origine de la page, pas sur ce que le serveur dirait', async () => {
    reponses = [accorde({ verification_uri_complete: 'https://hameçon.example/ouvrez-moi' })]
    const { ouvrir, dernier, avancer } = lancer()
    await avancer(0)
    expect(dernier()).toMatchObject({ lien: `${ORIGINE}/bureau/autoriser?user_code=ABCD2345` })
    expect(ouvrir).toHaveBeenCalledExactlyOnceWith(`${ORIGINE}/bureau/autoriser?user_code=ABCD2345`)
  })

  it('ce que le serveur donne est relu avec méfiance : un code qui n’en est pas un', async () => {
    reponses = [accorde({ user_code: '<img src=x>' })]
    const { dernier, avancer } = lancer()
    await avancer(0)
    expect(dernier()).toEqual({ type: 'echec', cause: 'serveur' })
  })

  it('ce que le serveur donne est relu avec méfiance : un intervalle nul reprend cinq secondes, un délai démesuré est borné', async () => {
    reponses = [accorde({ interval: 0, expires_in: 10 ** 9 }), erreur('authorization_pending')]
    const { etats, avancer } = lancer()
    await avancer(4_999)
    expect(appels).toHaveLength(1)
    await avancer(1)
    expect(appels).toHaveLength(2)
    expect(etats.find((e) => e.type === 'attente')).toMatchObject({ expire: Date.now() - 5_000 + 1_800_000 })
  })

  it('« Rouvrir » remet le lien dans le navigateur, tant que l’attente dure', async () => {
    reponses = [accorde(), erreur('access_denied')]
    const { appareil, ouvrir, avancer } = lancer()
    await avancer(0)
    appareil.rouvrir()
    expect(ouvrir).toHaveBeenCalledTimes(2)
    await avancer(5_000)
    appareil.rouvrir()
    expect(ouvrir).toHaveBeenCalledTimes(2)
  })

  it('un navigateur qui refuse de s’ouvrir n’arrête pas l’attente', async () => {
    reponses = [accorde(), jeton()]
    const etats: EtatAppareil[] = []
    lancerConnexionParCode({
      surEtat: (e) => etats.push(e),
      ouvrir: () => {
        throw new Error('bloqué')
      },
      origine: ORIGINE,
    })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(etats[etats.length - 1]).toEqual({ type: 'accorde' })
  })

  it('annuler arrête tout : plus d’essai, plus d’état, et l’envoi en route est abandonné', async () => {
    reponses = [accorde(), erreur('authorization_pending')]
    const { appareil, etats, ouvrir, avancer } = lancer()
    await avancer(0)
    const avant = etats.length
    appareil.annuler()
    await avancer(60_000)
    expect(appels).toHaveLength(1)
    expect(etats).toHaveLength(avant)
    appareil.rouvrir()
    expect(ouvrir).toHaveBeenCalledTimes(1)
    const signal = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal!
    expect(signal.aborted).toBe(true)
  })

  it('annuler avant la réponse du serveur : le code reçu ensuite n’ouvre rien', async () => {
    let repondre: (r: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((r) => (repondre = r))),
    )
    const etats: EtatAppareil[] = []
    const ouvrir = vi.fn()
    const appareil = lancerConnexionParCode({ surEtat: (e) => etats.push(e), ouvrir, origine: ORIGINE })
    await vi.advanceTimersByTimeAsync(0)
    appareil.annuler()
    repondre(accorde())
    await vi.advanceTimersByTimeAsync(10_000)
    expect(ouvrir).not.toHaveBeenCalled()
    expect(etats).toEqual([{ type: 'demande' }])
  })
})

describe('quand le code ne se demande pas', () => {
  it('un serveur injoignable', async () => {
    reponses = [new TypeError('hors ligne')]
    const { dernier, avancer } = lancer()
    await avancer(0)
    expect(dernier()).toEqual({ type: 'echec', cause: 'reseau' })
  })

  it('trop de codes demandés : combien attendre', async () => {
    reponses = [new Response(JSON.stringify({ code: 'trop_d_essais' }), { status: 429, headers: { 'retry-after': '41' } })]
    const { dernier, avancer } = lancer()
    await avancer(0)
    expect(dernier()).toEqual({ type: 'echec', cause: 'trop_d_essais', attente: 41 })
  })

  it('un serveur d’avant les codes (route absente) ou qui refuse ce client', async () => {
    for (const statut of [404, 400]) {
      reponses = [new Response('{}', { status: statut })]
      const { dernier, avancer } = lancer()
      await avancer(0)
      expect(dernier()).toEqual({ type: 'echec', cause: 'ancien' })
    }
  })

  it('une panne du serveur, ou une réponse illisible', async () => {
    for (const r of [new Response('', { status: 500 }), new Response('pas du JSON', { status: 200 }), Response.json({ device_code: 'x' })]) {
      reponses = [r]
      const { dernier, avancer } = lancer()
      await avancer(0)
      expect(dernier()).toEqual({ type: 'echec', cause: 'serveur' })
    }
  })

  it('une réponse inattendue à l’essai du jeton est une erreur du serveur, pas une attente sans fin', async () => {
    reponses = [accorde(), erreur('invalid_scope')]
    const { dernier, avancer } = lancer()
    await avancer(5_000)
    expect(dernier()).toEqual({ type: 'echec', cause: 'serveur' })
  })
})

describe('le code et son lien', () => {
  it('se montre par groupes de quatre', () => {
    expect(grouperCode('ABCD2345')).toBe('ABCD 2345')
    expect(grouperCode('ABC')).toBe('ABC')
  })

  it('se lit comme on le tape : sans espace ni tiret, en capitales', () => {
    expect(normaliserCode(' abcd-2345 ')).toBe('ABCD2345')
    expect(codePlausible('ABCD2345')).toBe(true)
    expect(codePlausible('ABC')).toBe(false)
    expect(codePlausible('AB CD')).toBe(false)
    expect(codePlausible('<script>')).toBe(false)
    expect(codePlausible('A'.repeat(40))).toBe(false)
  })

  it('se dit lettre par lettre au lecteur d’écran, par groupes : « ABCD » ne se lirait pas comme un mot', () => {
    expect(epeler('ABCD2345')).toBe('A B C D, 2 3 4 5')
    expect(epeler('ABC')).toBe('A B C')
    expect(epeler('')).toBe('')
  })

  it('mène à la page de confirmation de ce serveur', () => {
    expect(lienDeConfirmation('ABCD2345', 'https://notak.exemple.fr')).toBe('https://notak.exemple.fr/bureau/autoriser?user_code=ABCD2345')
    expect(lienDeConfirmation('A&B', 'http://localhost:3000')).toBe('http://localhost:3000/bureau/autoriser?user_code=A%26B')
  })
})

describe('ce que la page et le serveur se disent', () => {
  const web = join(import.meta.dirname, '..')

  // Le serveur (`apps/serveur/src/auth.ts`) a ses deux valeurs, la page les siennes : qu'une change seule, et l'app ne se
  // connecte plus (`invalid_client`, ou une page de confirmation introuvable). Lues dans son code, sans le charger.
  it('le même client et la même page de confirmation que le serveur', () => {
    const auth = readFileSync(join(import.meta.dirname, '../../../serveur/src/auth.ts'), 'utf8')
    const valeur = (nom: string) => new RegExp(`export const ${nom} = '([^']+)'`).exec(auth)?.[1]
    expect(valeur('CLIENT_BUREAU')).toBeDefined()
    expect(CLIENT_BUREAU).toBe(valeur('CLIENT_BUREAU'))
    expect(PAGE_AUTORISER).toBe(valeur('PAGE_AUTORISER'))
  })

  it('et la page n’en garde qu’une copie : appareil.ts, que les autres fichiers importent', () => {
    const copies = readdirSync(web, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && f !== join('serveur', 'appareil.ts'))
      .filter((f) => /'notak-bureau'|'\/bureau\/autoriser'/.test(readFileSync(join(web, f), 'utf8')))
    expect(copies).toEqual([])
  })
})
