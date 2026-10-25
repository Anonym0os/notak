import { readFileSync } from 'node:fs'
import { definirLangue, textesEn, textesFr } from '@notak/tableau'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErreurApi, deverrouiller, listerAcces, listerFavoris, seConnecter, sInscrire } from './api'

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
