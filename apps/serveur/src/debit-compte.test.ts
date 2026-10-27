import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Hono } from 'hono'
import { creerApp } from './app.ts'
import { type Base, ouvrirBase } from './base.ts'
import { creerLimiteur } from './debit.ts'
import { ORIGINE_ESSAI, authEssai, autorisationEssai, inscrireEssai } from './essai.ts'

describe('la limite par compte', () => {
  let base: Base
  let dossier: string
  let app: Hono
  // Chaque appel vient d'une autre machine : seule la limite par compte peut tenir.
  let machine = 0
  const poster = (chemin: string, corps: object) =>
    app.request(`/api/auth${chemin}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGINE_ESSAI },
      body: JSON.stringify(corps),
    }, { incoming: { socket: { remoteAddress: `10.0.0.${++machine}` } } })

  beforeAll(async () => {
    base = ouvrirBase(':memory:')
    dossier = mkdtempSync(join(tmpdir(), 'notak-compte-'))
    const auth = authEssai(base)
    await inscrireEssai(auth, base, 'Ana')
    app = creerApp({
      base,
      auth,
      autorisation: autorisationEssai(base),
      moyens: { fournisseurs: [], courriel: false },
      dossierFichiers: join(dossier, 'fichiers'),
      limiteur: creerLimiteur(1000, 60_000),
      limiteurCompte: creerLimiteur(3, 15 * 60_000),
      maintenant: () => 1_000_000,
      synchro: () => null,
      relais: 0,
      cookieSecurise: false,
    })
  })
  afterAll(() => {
    base.fermer()
    rmSync(dossier, { recursive: true, force: true })
  })

  it('des essais de mot de passe venus de machines différentes s’arrêtent au compte, avec le temps d’attente', async () => {
    const statuts: number[] = []
    for (let i = 0; i < 4; i++) statuts.push((await poster('/sign-in/email', { email: 'ana@exemple.fr', password: `faux-${i}-mot-de-passe` })).status)
    expect(statuts.slice(0, 3).every((s) => s === 401)).toBe(true)
    const refus = await poster('/sign-in/email', { email: 'ANA@exemple.fr ', password: 'motdepasse' })
    expect(refus.status).toBe(429)
    expect(Number(refus.headers.get('retry-after'))).toBeGreaterThan(60)
    // Un autre compte n'en pâtit pas.
    expect((await poster('/sign-in/email', { email: 'bea@exemple.fr', password: 'faux-faux-faux' })).status).toBe(401)
  })

  it('les liens de mot de passe aussi : la boîte de quelqu’un ne se remplit pas', async () => {
    const statuts: number[] = []
    for (let i = 0; i < 4; i++) statuts.push((await poster('/request-password-reset', { email: 'cle@exemple.fr', redirectTo: '/' })).status)
    expect(statuts.at(-1)).toBe(429)
  })

  it('la limite tombe de la même façon pour une adresse sans compte : elle ne dit rien de lui', async () => {
    const statuts: number[] = []
    for (let i = 0; i < 4; i++) statuts.push((await poster('/sign-in/email', { email: 'personne@exemple.fr', password: 'faux-faux-faux' })).status)
    expect(statuts).toEqual([401, 401, 401, 429])
  })
})
