import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Compte, type Monde, monde } from './essai.ts'
import { type SourceRattachement, annoncerSignalement, signer, sourcesDe } from './rattachements.ts'
import { A_TRAITER, TRAITES, decouperSignalement, markdownDuSignalement } from './signalements.ts'

const SECRET = 'un-secret-partage-de-plus-de-trente-deux-caracteres'
const SILAK: SourceRattachement = {
  source: 'silak',
  nom: 'Silak',
  dossier: 'Clients',
  origine: 'https://app.silak.fr',
  secret: SECRET,
  webhook: 'https://api.silak.fr/hooks/notak',
  signalements: true,
}
const CRM: SourceRattachement = { ...SILAK, source: 'crm', nom: 'Mon CRM' }
delete (CRM as { signalements?: true }).signalements
/** Un PNG d'un pixel. */
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

describe('le réglage : un outil qui reçoit les signalements', () => {
  it('les reçoit avec un secret et un webhook, jamais sans', () => {
    const dits: string[] = []
    const [a, b] = sourcesDe(
      JSON.stringify([
        { ...SILAK },
        { source: 'nu', nom: 'N', dossier: 'D', origine: 'https://a.fr', signalements: true },
      ]),
      (m) => void dits.push(m),
    )
    expect(a).toEqual(SILAK)
    expect(b).not.toHaveProperty('signalements')
    expect(dits).toEqual([expect.stringContaining('les signalements demandent un secret et un webhook')])
  })
})

describe('decouperSignalement', () => {
  const md = (texte: string, captures: number) =>
    markdownDuSignalement('2026-11-07_16h55m06-82f1', {
      texte,
      contexte: '- Adresse : https://notak.silak.fr/?type=image\n- Navigateur : Notak de bureau (Tauri)',
      captures: Array.from({ length: captures }, () => Buffer.from(PIXEL, 'base64')),
      auteur: { nom: 'Samy Agher', email: 'samy@silak.fr' },
      quand: new Date(2026, 10, 7, 16, 55, 6),
    })

  it('rend les mots tels quels, le contexte à part, et qui a signalé', () => {
    const d = decouperSignalement(md('Il y en a que 3 qui apparaissent.\n\nEt mal.', 2))
    expect(d.texte).toBe('Il y en a que 3 qui apparaissent.\n\nEt mal.')
    expect(d.contexte).toMatch(/^- Signalé par : Samy Agher <samy@silak\.fr>\n- Le : .*\n- Adresse : https:\/\/notak\.silak\.fr\/\?type=image\n- Navigateur : Notak de bureau \(Tauri\)$/)
    expect(d.par).toEqual({ nom: 'Samy Agher', email: 'samy@silak.fr' })
  })

  it('rend des mots vides quand la personne n’a rien écrit, avec ou sans capture', () => {
    expect(decouperSignalement(md('', 1)).texte).toBe('')
    expect(decouperSignalement(md('  ', 0)).texte).toBe('')
  })
})

describe('les signalements, annoncés à l’outil puis relus et classés', () => {
  let m: Monde
  let ana: Compte
  let compteur = 0
  const dossier = () => join(m.dossier, 'signalements')
  const demander = async (corps: Record<string, unknown>, source = 'silak') => {
    const texte = JSON.stringify({ id: `demande-sig-${++compteur}`, ...corps })
    const r = await m.appelerBrut(`/api/outils/${source}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'notak-signature': signer(SECRET, texte, m.maintenant()) },
      body: texte,
    })
    return { statut: r.status, corps: (await r.json()) as Record<string, unknown> }
  }
  const annonces = () =>
    m.base
      .envoisAFaire(Number.MAX_SAFE_INTEGER, 50)
      .filter((e) => e.type === 'signalement.depose')
      .map((e) => ({ source: e.source, ...(JSON.parse(e.charge) as Record<string, unknown>) }))

  beforeAll(async () => {
    m = monde({ rattachements: [SILAK, CRM], signalements: true })
    ana = await m.compte('Ana')
  })
  afterAll(() => m.fermer())

  it('annonce le dépôt au seul outil qui reçoit les signalements, une fois', async () => {
    const r = await m.appeler('/api/signalements', { compte: ana, json: { texte: 'Le filtre Photos en oublie six', contexte: '- Version : abc1234', captures: [PIXEL, PIXEL] } })
    expect(r.status).toBe(201)
    const { id } = (await r.json()) as { id: string }
    expect(annonces()).toEqual([{ source: 'silak', id: `signalement:${id}`, type: 'signalement.depose', cle: `signalement:${id}`, quand: expect.any(Number), par: 'Ana' }])

    // Relu : les mots, le contexte, qui, et les captures dans l'ordre.
    const lu = await demander({ action: 'lire_signalement', cle: `signalement:${id}` })
    expect(lu.statut).toBe(200)
    expect(lu.corps).toMatchObject({ etat: 'a-traiter', id, texte: 'Le filtre Photos en oublie six', par: { nom: 'Ana' } })
    expect(lu.corps.contexte).toContain('- Version : abc1234')
    expect(lu.corps.captures).toEqual([
      { nom: 'capture.png', png: PIXEL },
      { nom: 'capture-2.png', png: PIXEL },
    ])
    // Relire ne change rien : la même demande se refait.
    expect((await demander({ action: 'lire_signalement', cle: `signalement:${id}` })).corps).toMatchObject({ etat: 'a-traiter' })

    // Classé : la référence du ticket au bas du fichier, et le signalement dans les traités ; renvoyé, rien ne change.
    const classement = { id: 'classer-une-fois', action: 'classer_signalement', cle: `signalement:${id}`, ticket: '01a1913f-252d-76f6-a253-27e2bfd69505' }
    expect(await demander(classement)).toEqual({ statut: 200, corps: { etat: 'traite' } })
    expect(existsSync(join(dossier(), A_TRAITER, id))).toBe(false)
    const md = readFileSync(join(dossier(), TRAITES, id, 'signalement.md'), 'utf8')
    expect(md.trimEnd().endsWith('- Ticket Silak : 01a1913f-252d-76f6-a253-27e2bfd69505')).toBe(true)
    expect(await demander({ ...classement, id: 'classer-une-autre-fois' })).toEqual({ statut: 200, corps: { etat: 'traite' } })
    expect(readFileSync(join(dossier(), TRAITES, id, 'signalement.md'), 'utf8')).toBe(md)
    expect((await demander({ action: 'lire_signalement', cle: `signalement:${id}` })).corps).toMatchObject({ etat: 'traite', texte: 'Le filtre Photos en oublie six' })
  })

  it('rend « absent » pour un signalement qui n’existe pas', async () => {
    expect((await demander({ action: 'lire_signalement', cle: 'signalement:2020-01-01_00h00m00-abcd' })).corps).toMatchObject({ etat: 'absent', captures: [] })
    expect((await demander({ action: 'classer_signalement', cle: 'signalement:2020-01-01_00h00m00-abcd' })).corps).toEqual({ etat: 'absent' })
  })

  it('refuse un outil qui ne reçoit pas les signalements, une clé ou un ticket mal formés, un champ de trop', async () => {
    expect((await demander({ action: 'lire_signalement', cle: 'signalement:2020-01-01_00h00m00-abcd' }, 'crm')).statut).toBe(404)
    expect((await demander({ action: 'lire_signalement', cle: 'societe:1' })).statut).toBe(400)
    expect((await demander({ action: 'lire_signalement', cle: 'signalement:../../etc' })).statut).toBe(400)
    expect((await demander({ action: 'classer_signalement', cle: 'signalement:2020-01-01_00h00m00-abcd', ticket: 'pas de blancs' })).statut).toBe(400)
    expect((await demander({ action: 'lire_signalement', cle: 'signalement:2020-01-01_00h00m00-abcd', ticket: 'x' })).statut).toBe(400)
    expect((await demander({ action: 'lire', cle: 'societe:1', ticket: 'x' })).statut).toBe(400)
  })
})

describe('une annonce répétée', () => {
  it('n’entre qu’une fois dans la file, comme au redémarrage d’un serveur dont le signalement attend encore', async () => {
    const m = monde({ rattachements: [SILAK], signalements: true })
    try {
      annoncerSignalement(m.base, [SILAK], '2026-11-05_10h40m16-3d44', m.maintenant(), null)
      annoncerSignalement(m.base, [SILAK], '2026-11-05_10h40m16-3d44', m.maintenant(), null)
      expect(m.base.envoisAFaire(Number.MAX_SAFE_INTEGER, 50).map((e) => e.id)).toEqual(['silak:signalement:2026-11-05_10h40m16-3d44'])
    } finally {
      m.fermer()
    }
  })
})
