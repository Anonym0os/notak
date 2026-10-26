import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminsDe } from './comptes.ts'
import { ADRESSE_ANNONCE, ANNONCE_MAX, GUIDE_MISE_A_JOUR, INTERVALLE_VERIFICATION_MS, comparerVersions, creerVerificateur, lireAnnonce } from './misesAJour.ts'

const annonce = (version: string, extra: object = {}) => ({ version, notes: '- Une chose.', pub_date: '2026-10-25T10:00:00Z', platforms: {}, ...extra })

/** Un GitHub d'essai : ce qu'il répond, et ce qu'on lui a demandé. */
function github(reponse: () => Response | Promise<Response>) {
  const demandes: { adresse: string; init?: RequestInit }[] = []
  const lire = (async (adresse: string | URL | Request, init?: RequestInit) => {
    demandes.push({ adresse: String(adresse), init })
    return reponse()
  }) as typeof fetch
  return { lire, demandes }
}
const json = (valeur: unknown, statut = 200) => new Response(JSON.stringify(valeur), { status: statut, headers: { 'content-type': 'application/json' } })

describe('comparer deux versions', () => {
  it('suit semver, nombre par nombre', () => {
    expect(comparerVersions('0.2.0', '0.1.9')).toBe(1)
    expect(comparerVersions('0.10.0', '0.9.0')).toBe(1)
    expect(comparerVersions('1.0.0', '0.99.99')).toBe(1)
    expect(comparerVersions('0.1.0', '0.1.0')).toBe(0)
    expect(comparerVersions('0.1.0', '0.2.0')).toBe(-1)
    // Un nombre trop grand pour un `number` reste comparé juste.
    expect(comparerVersions('0.99999999999999999999.0', '0.99999999999999999998.0')).toBe(1)
  })

  it('une pré-version vient avant sa version, et se compare champ par champ', () => {
    expect(comparerVersions('1.0.0-beta', '1.0.0')).toBe(-1)
    expect(comparerVersions('1.0.0', '1.0.0-rc.1')).toBe(1)
    expect(comparerVersions('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe(-1)
    expect(comparerVersions('1.0.0-alpha.10', '1.0.0-alpha.9')).toBe(1)
    expect(comparerVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1)
    expect(comparerVersions('1.0.0+abc', '1.0.0+def')).toBe(0)
  })

  it('refuse ce qui n’est pas une version', () => {
    for (const v of ['v1.0.0', '1.0', '01.0.0', '1.0.0.0', '', '1.0.0-', 'latest']) expect(comparerVersions(v, '1.0.0')).toBeNull()
  })
})

describe('lire l’annonce', () => {
  it('garde le numéro, les notes, la date, et pose l’adresse de la page de la version', () => {
    expect(lireAnnonce(annonce('0.3.0'))).toEqual({
      version: '0.3.0',
      notes: '- Une chose.',
      date: '2026-10-25T10:00:00.000Z',
      adresse: 'https://github.com/Anonym0os/notak/releases/tag/v0.3.0',
    })
  })

  it('ignore une pré-version, et tout ce qui n’a pas la forme attendue', () => {
    expect(lireAnnonce(annonce('0.3.0-beta.1'))).toBeNull()
    expect(lireAnnonce(annonce('v0.3.0'))).toBeNull()
    expect(lireAnnonce(annonce('0.3.0', { notes: 3 }))).toBeNull()
    expect(lireAnnonce(annonce('0.3.0', { pub_date: 'hier' }))).toBeNull()
    expect(lireAnnonce(annonce('0.3.0', { pub_date: undefined }))).toBeNull()
    expect(lireAnnonce([annonce('0.3.0')])).toBeNull()
    expect(lireAnnonce(null)).toBeNull()
    expect(lireAnnonce('0.3.0')).toBeNull()
  })

  it('coupe des notes démesurées', () => {
    expect(lireAnnonce(annonce('0.3.0', { notes: 'x'.repeat(100_000) }))!.notes.length).toBe(20_000)
  })
})

describe('la vérification des mises à jour', () => {
  it('trouve une version plus récente, et ne la dit au journal qu’une fois', async () => {
    const { lire, demandes } = github(() => json(annonce('0.2.0')))
    const journal: string[] = []
    const v = creerVerificateur({ actuelle: '0.1.0', active: true, lire, journal: (m) => journal.push(m), maintenant: () => 42, programmer: false })
    expect(v.etat()).toEqual({ actuelle: '0.1.0', active: true })
    await v.verifier()
    await v.verifier()
    expect(v.etat()).toEqual({
      actuelle: '0.1.0',
      active: true,
      verifiee: 42,
      nouvelle: { version: '0.2.0', notes: '- Une chose.', date: '2026-10-25T10:00:00.000Z', adresse: 'https://github.com/Anonym0os/notak/releases/tag/v0.2.0' },
    })
    expect(demandes.map((d) => d.adresse)).toEqual([ADRESSE_ANNONCE, ADRESSE_ANNONCE])
    expect(demandes[0]!.init).toMatchObject({ redirect: 'follow' })
    expect(demandes[0]!.init!.signal).toBeInstanceOf(AbortSignal)
    expect(journal).toHaveLength(1)
    expect(journal[0]).toContain('0.2.0')
    // Le compose.yaml de la version d'abord : c'est lui qui fait monter OpenFGA.
    expect(journal[0]).toContain('curl -fsSLO https://github.com/Anonym0os/notak/releases/latest/download/compose.yaml && docker compose pull && docker compose up -d')
    expect(journal[0]).toContain('docs/AUTO-HEBERGER.md#mettre-%C3%A0-jour')
  })

  it('rien de neuf : la même version, une plus ancienne, une pré-version', async () => {
    for (const version of ['0.2.0', '0.1.9', '0.3.0-rc.1']) {
      const journal: string[] = []
      const v = creerVerificateur({ actuelle: '0.2.0', active: true, lire: github(() => json(annonce(version))).lire, journal: (m) => journal.push(m), programmer: false })
      await v.verifier()
      expect(v.etat().nouvelle).toBeUndefined()
      expect(journal).toEqual([])
    }
  })

  it('une réponse ratée ne change rien à ce qu’on savait', async () => {
    let reponse: () => Response | Promise<Response> = () => json(annonce('0.2.0'))
    const v = creerVerificateur({ actuelle: '0.1.0', active: true, lire: github(() => reponse()).lire, journal: () => {}, maintenant: () => 7, programmer: false })
    await v.verifier()
    const connu = v.etat()
    expect(connu.nouvelle?.version).toBe('0.2.0')
    const rates: (() => Response | Promise<Response>)[] = [
      () => new Response('{ pas du json', { status: 200 }),
      () => json({ erreur: 'introuvable' }, 404),
      () => json(annonce('9.9.9'), 500),
      () => json({ version: '9.9.9' }),
      () => new Response('x'.repeat(ANNONCE_MAX + 1), { status: 200 }),
      () => Promise.reject(new TypeError('réseau coupé')),
      () => Promise.reject(new DOMException('délai dépassé', 'TimeoutError')),
    ]
    for (const r of rates) {
      reponse = r
      await expect(v.verifier()).resolves.toBeUndefined()
      expect(v.etat()).toEqual(connu)
    }
  })

  it('refuse une annonce trop grosse dès son en-tête, sans la lire', async () => {
    let lus = 0
    let annulee = false
    const corps = new ReadableStream({
      pull(c) {
        // Le flux se remplit d'avance d'un morceau : un second ne viendrait que d'une lecture.
        if (++lus > 1) throw new Error('lue')
        c.enqueue(new TextEncoder().encode('{}'))
      },
      cancel() {
        annulee = true
      },
    })
    const v = creerVerificateur({
      actuelle: '0.1.0',
      active: true,
      lire: github(() => new Response(corps, { headers: { 'content-length': String(ANNONCE_MAX * 4) } })).lire,
      programmer: false,
    })
    await v.verifier()
    expect(lus).toBe(1)
    expect(annulee).toBe(true)
    expect(v.etat().verifiee).toBeUndefined()
  })

  it('coupée (NOTAK_VERIFIER_MAJ=0, ou en développement), elle ne demande rien', async () => {
    const { lire, demandes } = github(() => json(annonce('0.2.0')))
    const v = creerVerificateur({ actuelle: '0.1.0', active: false, lire })
    await v.verifier()
    expect(demandes).toEqual([])
    expect(v.etat()).toEqual({ actuelle: '0.1.0', active: false })
    v.arreter()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('d’elle-même : une minute après le démarrage, puis toutes les douze heures, jusqu’à l’arrêt', async () => {
    vi.useFakeTimers()
    const { lire, demandes } = github(() => json(annonce('0.2.0')))
    const v = creerVerificateur({ actuelle: '0.1.0', active: true, lire, journal: () => {} })
    await vi.advanceTimersByTimeAsync(59_000)
    expect(demandes).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(demandes).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(INTERVALLE_VERIFICATION_MS)
    expect(demandes).toHaveLength(2)
    v.arreter()
    await vi.advanceTimersByTimeAsync(3 * INTERVALLE_VERIFICATION_MS)
    expect(demandes).toHaveLength(2)
  })

  it('deux vérifications en même temps ne font qu’une demande', async () => {
    const { lire, demandes } = github(() => json(annonce('0.2.0')))
    const v = creerVerificateur({ actuelle: '0.1.0', active: true, lire, journal: () => {}, programmer: false })
    await Promise.all([v.verifier(), v.verifier()])
    expect(demandes).toHaveLength(1)
  })
})

describe('le guide où renvoie le journal', () => {
  it('a bien la section « Mettre à jour » que vise son ancre', () => {
    const guide = readFileSync(join(import.meta.dirname, '../../../docs/AUTO-HEBERGER.md'), 'utf8')
    expect(guide).toMatch(/^## Mettre à jour$/m)
    expect(decodeURIComponent(GUIDE_MISE_A_JOUR)).toMatch(/docs\/AUTO-HEBERGER\.md#mettre-à-jour$/)
  })
})

describe('les admins du serveur', () => {
  it('des adresses séparées par des virgules, sans espaces ni majuscules, sans doublon', () => {
    expect(adminsDe(' Ana@Exemple.fr, bob@exemple.fr,,ana@exemple.fr ')).toEqual(['ana@exemple.fr', 'bob@exemple.fr'])
    expect(adminsDe(undefined)).toEqual([])
    expect(adminsDe('')).toEqual([])
  })
})
