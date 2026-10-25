import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openfgaEssai } from './essai.ts'
import { type ServeurDemarre, demarrer } from './serveur.ts'
import { A_TRAITER, TRAITES, deposerSignalement, horodatage, listerSignalements, marquerTraite } from './signalements.ts'

const SECRET = 'un-secret-d-essai-assez-long-pour-better-auth'
/** Un PNG d'un pixel. */
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

describe('la file des signalements', () => {
  let dossier: string
  beforeAll(() => {
    dossier = mkdtempSync(join(tmpdir(), 'notak-signalements-'))
  })
  afterAll(() => rmSync(dossier, { recursive: true, force: true }))

  it('range un signalement en dossier, le liste, puis le passe dans les traités', async () => {
    const quand = new Date(2026, 9, 25, 22, 41, 7)
    expect(horodatage(quand)).toBe('2026-10-25_22h41m07')
    const id = await deposerSignalement(dossier, {
      texte: 'Deux croix dans la bulle',
      contexte: '- Adresse : /t/abc',
      captures: [Buffer.from(PIXEL, 'base64'), Buffer.from(PIXEL, 'base64')],
      auteur: { nom: 'Samy', email: 'samy@exemple.fr' },
      quand,
    })
    expect(id).toMatch(/^2026-10-25_22h41m07-[0-9a-f]{4}$/)
    const [lu, ...reste] = await listerSignalements(dossier)
    expect(reste).toEqual([])
    expect(lu!.markdown).toContain('Deux croix dans la bulle')
    expect(lu!.markdown).toContain('- Adresse : /t/abc')
    expect(lu!.markdown).toContain('Samy <samy@exemple.fr>')
    expect(lu!.captures).toEqual([join(dossier, A_TRAITER, id, 'capture.png'), join(dossier, A_TRAITER, id, 'capture-2.png')])
    expect(lu!.markdown).toContain('![Capture 2](capture-2.png)')

    expect(await marquerTraite(dossier, id)).toBe(true)
    expect(await marquerTraite(dossier, id)).toBe(false)
    expect(await marquerTraite(dossier, '../a-traiter')).toBe(false)
    expect(await listerSignalements(dossier)).toEqual([])
    expect((await listerSignalements(dossier, TRAITES)).map((s) => s.id)).toEqual([id])
  })
})

describe('POST /api/signalements', () => {
  let serveur: ServeurDemarre
  let dossier: string
  let origine: string
  beforeAll(async () => {
    dossier = mkdtempSync(join(tmpdir(), 'notak-essai-'))
    serveur = await demarrer({ port: 0, dossier, secret: SECRET, openfga: openfgaEssai(), dossierSignalements: join(dossier, 'signalements') })
    origine = `http://localhost:${serveur.port}`
  })
  afterAll(async () => {
    await serveur.fermer()
    rmSync(dossier, { recursive: true, force: true })
  })

  const poster = (corps: unknown, cookie?: string) =>
    fetch(`${origine}/api/signalements`, {
      method: 'POST',
      headers: { origin: origine, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(corps),
    })

  it('refuse sans compte, range le signalement et sa capture pour un compte', async () => {
    expect((await poster({ texte: 'x' })).status).toBe(401)
    const inscription = await fetch(`${origine}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { origin: origine, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ana@exemple.fr', password: 'motdepasse', name: 'Ana' }),
    })
    const cookie = inscription.headers.get('set-cookie')!.split(';')[0]!
    const r = await poster({ texte: 'Le bouton ne répond pas', contexte: '- Version : abc1234', captures: [`data:image/png;base64,${PIXEL}`, PIXEL] }, cookie)
    expect(r.status).toBe(201)
    const { id } = (await r.json()) as { id: string }
    const ici = join(dossier, 'signalements', A_TRAITER, id)
    expect(readFileSync(join(ici, 'signalement.md'), 'utf8')).toContain('Le bouton ne répond pas')
    expect(readFileSync(join(ici, 'capture.png')).equals(Buffer.from(PIXEL, 'base64'))).toBe(true)
    expect(existsSync(join(ici, 'capture-2.png'))).toBe(true)

    const ancienne = (await (await poster({ texte: 'Une seule', capture: PIXEL }, cookie)).json()) as { id: string }
    expect(existsSync(join(dossier, 'signalements', A_TRAITER, ancienne.id, 'capture.png'))).toBe(true)

    const sansCapture = (await (await poster({ texte: 'Rien à voir' }, cookie)).json()) as { id: string }
    expect(existsSync(join(dossier, 'signalements', A_TRAITER, sansCapture.id, 'capture.png'))).toBe(false)
  })

  it("répond comme une route absente quand l'instance ne reçoit pas de signalements", async () => {
    const autre = await demarrer({ port: 0, dossier: mkdtempSync(join(tmpdir(), 'notak-essai-')), secret: SECRET, openfga: openfgaEssai() })
    try {
      const r = await fetch(`http://localhost:${autre.port}/api/signalements`, { method: 'POST', body: '{}' })
      expect(r.status).toBe(404)
    } finally {
      await autre.fermer()
    }
  })
})
