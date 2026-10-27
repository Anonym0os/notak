import { readFileSync } from 'node:fs'
import { definirLangue, textesEn, textesFr } from '@notak/tableau'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ErreurApi,
  deverrouiller,
  ecouterSessionFinie,
  lireDemandeBureau,
  lireInstance,
  listerAcces,
  listerFavoris,
  listerTableaux,
  ouvrirCodeBureau,
  reglerCompte,
  repondreCodeBureau,
  seConnecter,
  sessionEncoreValide,
  sInscrire,
  moi,
} from './api'

afterEach(() => {
  definirLangue('fr')
  vi.unstubAllGlobals()
})

const repond = (statut: number, corps: unknown) =>
  vi.stubGlobal('fetch', async () => new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), { status: statut }))

const echec = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (x) {
    return x as ErreurApi
  }
  throw new Error('aurait dû échouer')
}

describe('les refus du serveur, dits dans la langue de l’interface', () => {
  it('se traduisent à partir du code, avec le texte du serveur en repli', async () => {
    repond(409, { erreur: 'adresse prise', code: 'adresse_prise' })
    const fr = await echec(sInscrire('a@b.fr', 'motdepasse', 'Ana'))
    expect(fr).toMatchObject({ message: 'Cette adresse a déjà un compte', statut: 409, code: 'adresse_prise' })
    definirLangue('en')
    expect((await echec(sInscrire('a@b.fr', 'motdepasse', 'Ana'))).message).toBe('This address already has an account')

    // Un code que le front ne connaît pas : le texte du serveur, tel quel.
    repond(400, { erreur: 'quelque chose de neuf', code: 'code_inconnu' })
    expect((await echec(listerFavoris())).message).toBe('quelque chose de neuf')
  })

  it('un code sans traduction ni texte retombe sur le statut', async () => {
    repond(502, 'pas du JSON')
    definirLangue('en')
    expect((await echec(listerAcces('t'))).message).toBe('The server is having trouble')
    repond(418, {})
    expect((await echec(listerAcces('t'))).message).toBe('Request refused')
  })

  it('ce que l’appel dit pour son contexte passe avant la traduction du code', async () => {
    repond(404, { erreur: 'introuvable', code: 'introuvable' })
    definirLangue('en')
    expect((await echec(listerAcces('t'))).message).toBe('Board not found')
    repond(401, { erreur: 'mot de passe incorrect', code: 'mot_de_passe_incorrect' })
    expect((await echec(deverrouiller('t', 'x'))).message).toBe('Wrong password')
    repond(401, { erreur: 'identifiants incorrects', code: 'identifiants_incorrects' })
    expect((await echec(seConnecter('a@b.fr', 'x'))).message).toBe('Wrong address or password')
  })

  it('trop d’essais : combien attendre, d’après le serveur', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ erreur: 'trop d’essais', code: 'trop_d_essais' }), { status: 429, headers: { 'retry-after': '725' } }))
    expect((await echec(seConnecter('a@b.fr', 'x'))).message).toBe('Trop d’essais : réessayez dans 13 min')
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ code: 'trop_d_essais' }), { status: 429, headers: { 'retry-after': '41' } }))
    definirLangue('en')
    expect((await echec(seConnecter('a@b.fr', 'x'))).message).toBe('Too many attempts: try again in 41 s')
    // Sans durée, le message général.
    repond(429, { code: 'trop_d_essais' })
    expect((await echec(seConnecter('a@b.fr', 'x'))).message).toBe('Too many attempts, please wait a moment')
  })

  it('un réseau absent se dit aussi', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline')
    })
    definirLangue('en')
    expect((await echec(seConnecter('a@b.fr', 'x'))).message).toBe('Server unreachable')
  })
})

describe('les codes du serveur', () => {
  it('ont tous une traduction ici', () => {
    const source = readFileSync(new URL('../../serveur/src/app.ts', import.meta.url), 'utf8')
    const emis = [...source.matchAll(/code: '([a-z_]+)'/g)].map((m) => m[1]!)
    expect(emis.length).toBeGreaterThan(20)
    for (const code of new Set(emis)) {
      expect(textesFr[`erreur.${code}`], code).toBeTruthy()
      expect(textesEn[`erreur.${code}`], code).toBeTruthy()
    }
  })
})

/** Un serveur qui répond selon l'adresse, et se souvient de ce qu'on lui a demandé. */
function serveur(reponses: Record<string, () => Response>) {
  const appels: string[] = []
  vi.stubGlobal('fetch', async (chemin: string, init?: RequestInit) => {
    appels.push(`${init?.method ?? 'GET'} ${chemin}`)
    const r = reponses[chemin]
    if (!r) throw new Error(`appel imprévu : ${chemin}`)
    return r()
  })
  return appels
}
const nonConnecte = () => new Response(JSON.stringify({ erreur: 'non connecté', code: 'non_connecte' }), { status: 401 })
/** Laisse les promesses déjà prêtes se régler : le signal part après la lecture du corps. */
const regler = () => new Promise((fin) => setTimeout(fin, 0))

describe('la session qui prend fin sous la page', () => {
  it('un appel qui demande un compte et répond « non connecté » le signale', async () => {
    serveur({ '/api/tableaux': nonConnecte, '/api/moi': nonConnecte })
    const signal = vi.fn()
    const arreter = ecouterSessionFinie(signal)
    await echec(listerTableaux())
    await regler()
    expect(signal).toHaveBeenCalledTimes(1)
    // La réponse reste lisible pour l'appel lui-même : son message ne change pas.
    expect((await echec(listerTableaux())).message).toBe('Vous n’êtes pas connecté')
    await regler()
    expect(signal).toHaveBeenCalledTimes(2)
    arreter()
    await echec(listerTableaux())
    await regler()
    expect(signal).toHaveBeenCalledTimes(2)
  })

  it('une modification du compte aussi, mais pas la lecture de /api/moi, qui sert à savoir si l’on est connecté', async () => {
    serveur({ '/api/moi': nonConnecte })
    const signal = vi.fn()
    const arreter = ecouterSessionFinie(signal)
    expect(await moi()).toBeNull()
    await regler()
    expect(signal).not.toHaveBeenCalled()
    await echec(reglerCompte({ couleur: '#112233' }))
    await regler()
    expect(signal).toHaveBeenCalledTimes(1)
    arreter()
  })

  it('un 401 qui dit autre chose n’est pas une session finie : mot de passe incorrect, tableau verrouillé, connexion', async () => {
    serveur({
      '/api/auth/sign-in/email': () => new Response(JSON.stringify({ code: 'non_connecte' }), { status: 401 }),
      '/api/tableaux/t/deverrouiller': () => new Response(JSON.stringify({ code: 'mot_de_passe_incorrect' }), { status: 401 }),
      '/api/tableaux': () => new Response('pas du JSON', { status: 401 }),
    })
    const signal = vi.fn()
    const arreter = ecouterSessionFinie(signal)
    await echec(seConnecter('a@b.fr', 'x'))
    await echec(deverrouiller('t', 'x'))
    await echec(listerTableaux())
    await regler()
    expect(signal).not.toHaveBeenCalled()
    arreter()
  })

  it('un refus de la synchronisation se départage par /api/moi : session finie, ou accès retiré', async () => {
    const signal = vi.fn()
    const arreter = ecouterSessionFinie(signal)

    // Le même appel, demandé deux fois à la fois, ne part qu'une fois.
    const appels = serveur({ '/api/moi': nonConnecte })
    expect(await Promise.all([sessionEncoreValide(), sessionEncoreValide()])).toEqual([false, false])
    expect(appels).toEqual(['GET /api/moi'])
    expect(signal).toHaveBeenCalledTimes(1)

    // La session tient : l'accès à ce tableau seul est refusé.
    serveur({ '/api/moi': () => Response.json({ id: 'u' }) })
    expect(await sessionEncoreValide()).toBe(true)
    expect(signal).toHaveBeenCalledTimes(1)

    // Pas de réseau : on garde ce qu'on croyait.
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('hors ligne')
    })
    expect(await sessionEncoreValide()).toBe(true)
    expect(signal).toHaveBeenCalledTimes(1)
    arreter()
  })
})

describe('la version du serveur au chargement', () => {
  it('se lit dans /api/instance, bornée', async () => {
    serveur({ '/api/instance': () => Response.json({ nom: 'Chez nous', inscriptions: 'fermees', habillages: [], version: '1.4.0' }) })
    expect((await lireInstance()).version).toBe('1.4.0')
    serveur({ '/api/instance': () => Response.json({ nom: 'Chez nous', version: 'x'.repeat(65) }) })
    expect((await lireInstance()).version).toBeUndefined()
    serveur({ '/api/instance': () => Response.json({ nom: 'Chez nous', version: 12 }) })
    expect((await lireInstance()).version).toBeUndefined()
  })
})

describe('la demande de connexion d’une app de bureau', () => {
  it('ouvrir un code le confie à ce compte : son statut, et le client s’il est à lui', async () => {
    const appels = serveur({
      '/api/auth/device?user_code=ABCD2345': () => Response.json({ user_code: 'ABCD2345', status: 'pending', client_id: 'notak-bureau' }),
      '/api/auth/device?user_code=ZZZZ2345': () => Response.json({ user_code: 'ZZZZ2345', status: 'pending' }),
    })
    expect(await ouvrirCodeBureau('ABCD2345')).toEqual({ statut: 'pending', client: 'notak-bureau' })
    // Sans `client_id` : un autre compte l'a pris en main.
    expect(await ouvrirCodeBureau('ZZZZ2345')).toEqual({ statut: 'pending', client: null })
    expect(appels).toEqual(['GET /api/auth/device?user_code=ABCD2345', 'GET /api/auth/device?user_code=ZZZZ2345'])
  })

  it('les refus de Better Auth se disent selon leur code, dans la langue de l’interface', async () => {
    const refuse = (statut: number, error: string) => () => new Response(JSON.stringify({ error, error_description: 'in English' }), { status: statut })
    serveur({
      '/api/auth/device?user_code=INCONNU22': refuse(400, 'invalid_request'),
      '/api/auth/device?user_code=EXPIRE222': refuse(400, 'expired_token'),
      '/api/auth/device/approve': refuse(403, 'access_denied'),
      '/api/auth/device/deny': refuse(401, 'unauthorized'),
    })
    const inconnu = await echec(ouvrirCodeBureau('INCONNU22'))
    expect(inconnu).toMatchObject({ message: 'Ce code n’est pas reconnu, ou il a déjà servi.', statut: 400, code: 'invalid_request' })
    expect(await echec(ouvrirCodeBureau('EXPIRE222'))).toMatchObject({ message: 'Ce code a expiré.', code: 'expired_token' })
    expect(await echec(repondreCodeBureau('ABCD2345', true))).toMatchObject({ statut: 403, code: 'access_denied' })
    definirLangue('en')
    expect((await echec(ouvrirCodeBureau('EXPIRE222'))).message).toBe('This code has expired.')
    // Pas de session : le statut 401 suffit à la page pour revenir à la connexion.
    expect(await echec(repondreCodeBureau('ABCD2345', false))).toMatchObject({ statut: 401 })
  })

  it('autoriser ou refuser envoie le code à la bonne route, en JSON', async () => {
    const corps: unknown[] = []
    const chemins: string[] = []
    vi.stubGlobal('fetch', async (chemin: string, init: RequestInit) => {
      chemins.push(chemin)
      corps.push(JSON.parse(String(init.body)))
      return Response.json({ success: true })
    })
    await repondreCodeBureau('ABCD2345', true)
    await repondreCodeBureau('ABCD2345', false)
    expect(chemins).toEqual(['/api/auth/device/approve', '/api/auth/device/deny'])
    expect(corps).toEqual([{ userCode: 'ABCD2345' }, { userCode: 'ABCD2345' }])
  })

  it('d’où l’app a demandé le code : lu avec méfiance, absent quand le serveur ne le sait plus', async () => {
    serveur({
      '/api/bureau/demande?user_code=ABCD2345': () => Response.json({ ip: '203.0.113.9', quand: 1_700_000_000_000, ipActuelle: '198.51.100.4' }),
      '/api/bureau/demande?user_code=PERDU222': () => new Response(JSON.stringify({ code: 'introuvable' }), { status: 404 }),
      '/api/bureau/demande?user_code=BIZARRE2': () => Response.json({ ip: 12, quand: 'hier' }),
    })
    expect(await lireDemandeBureau('ABCD2345')).toEqual({ ip: '203.0.113.9', quand: 1_700_000_000_000, ipActuelle: '198.51.100.4' })
    expect(await lireDemandeBureau('PERDU222')).toBeNull()
    expect(await lireDemandeBureau('BIZARRE2')).toBeNull()
  })
})
