import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { type Compte, type Monde, monde } from './essai.ts'
import { indexerDocument } from './indexation.ts'
import {
  ESSAIS_MAX,
  type SourceRattachement,
  changementDeCartes,
  delaiDEssai,
  signatureValable,
  signer,
  sourcesDe,
  suivreLesDossiers,
  viderLaFile,
} from './rattachements.ts'
import { nomDuDocument } from './synchro.ts'

const SECRET = 'un-secret-partage-de-plus-de-trente-deux-caracteres'
const CRM: SourceRattachement = {
  source: 'crm',
  nom: 'Mon CRM',
  dossier: 'Clients',
  origine: 'https://crm.exemple.fr',
  secret: SECRET,
  webhook: 'https://crm.exemple.fr/hooks/notak',
}

describe('le réglage d’un outil : son secret et son webhook', () => {
  it('lit le secret et le webhook ; écrits de travers, ils sont oubliés, pas la source', () => {
    const dits: string[] = []
    const [a, b, c] = sourcesDe(
      JSON.stringify([
        { ...CRM },
        { source: 'court', nom: 'C', dossier: 'D', origine: 'https://a.fr', secret: 'trop-court', webhook: 'https://a.fr/h' },
        { source: 'clair', nom: 'C', dossier: 'D', origine: 'https://a.fr', secret: SECRET, webhook: 'http://a.fr/h' },
      ]),
      (m) => void dits.push(m),
    )
    expect(a).toEqual(CRM)
    // Un secret trop court est ignoré, et un webhook sans secret ne reçoit rien.
    expect(b).not.toHaveProperty('secret')
    expect(b).not.toHaveProperty('webhook')
    // En http, seulement vers cette machine.
    expect(c).toMatchObject({ secret: SECRET })
    expect(c).not.toHaveProperty('webhook')
    expect(dits).toHaveLength(3)
    expect(sourcesDe(JSON.stringify([{ ...CRM, webhook: 'http://localhost:9999/h' }]))[0]?.webhook).toBe('http://localhost:9999/h')
  })
})

describe('la signature', () => {
  const corps = '{"id":"demande-1","action":"lire","cle":"societe:1"}'
  const maintenant = 1_800_000_000_000

  it('signe le corps à l’instant, comme `timestamped_hmac_sha256_matches` le vérifie', () => {
    const entete = signer(SECRET, corps, maintenant)
    expect(entete).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/)
    expect(signatureValable(SECRET, corps, entete, maintenant)).toBe(true)
    expect(signatureValable(SECRET, corps, entete, maintenant + 299_000)).toBe(true)
  })

  it('refuse un autre corps, un autre secret, une signature trop vieille ou mal écrite', () => {
    const entete = signer(SECRET, corps, maintenant)
    expect(signatureValable(SECRET, `${corps} `, entete, maintenant)).toBe(false)
    expect(signatureValable(`${SECRET}x`, corps, entete, maintenant)).toBe(false)
    expect(signatureValable(SECRET, corps, entete, maintenant + 301_000)).toBe(false)
    expect(signatureValable(SECRET, corps, undefined, maintenant)).toBe(false)
    expect(signatureValable(SECRET, corps, 'v1=abc', maintenant)).toBe(false)
    expect(signatureValable(SECRET, corps, 't=1800000000', maintenant)).toBe(false)
  })

  it('accepte l’un de plusieurs `v1`, comme pendant le changement d’un secret', () => {
    const bonne = signer(SECRET, corps, maintenant).split(',')[1]
    const autre = signer('ancien-secret-partage-de-plus-de-trente-deux-car', corps, maintenant).split(',')[1]
    expect(signatureValable(SECRET, corps, `t=1800000000,${autre},${bonne}`, maintenant)).toBe(true)
  })
})

describe('changementDeCartes', () => {
  it('une carte qui part à la corbeille, une qui en revient ; une carte effacée n’y est pas', () => {
    expect(changementDeCartes({ cartes: ['a', 'b'], jetees: ['c', 'd'] }, { cartes: ['b', 'c'], jetees: ['a'] })).toEqual({ jetees: ['a'], remises: ['c'] })
    expect(changementDeCartes(null, { cartes: ['a'], jetees: ['b'] })).toEqual({ jetees: [], remises: [] })
  })
})

describe('ce qu’un outil demande à Notak', () => {
  let m: Monde
  let ana: Compte
  let instant = Date.now()
  const demander = async (corps: unknown, o: { secret?: string; source?: string; quand?: number } = {}) => {
    const texte = JSON.stringify(corps)
    const r = await m.appelerBrut(`/api/outils/${o.source ?? 'crm'}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'notak-signature': signer(o.secret ?? SECRET, texte, o.quand ?? m.maintenant()) },
      body: texte,
    })
    return { statut: r.status, corps: (await r.json()) as { etat: string; dossiers: { etat: string; tableau: string; jete_par: string | null }[]; code?: string } }
  }
  let compteur = 0
  const demande = (action: string, cle = 'societe:1') => ({ id: `demande-${++compteur}-${instant}`, action, cle })
  const bibliotheque = async () => ((await (await m.appeler('/api/bibliotheque', { compte: ana })).json()) as { tableau: string; titre: string }[]).map((e) => e.titre)
  const carteDe = (dans: string, cible: string) => {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, m.base.document(nomDuDocument(dans))!)
    return [...doc.getMap<{ contenu: { cible?: string }; corbeille?: number }>('elements').values()].find((e) => e.contenu.cible === cible)
  }

  beforeAll(async () => {
    m = monde({ rattachements: [CRM, { source: 'muet', nom: 'Muet', dossier: 'Muets', origine: 'https://muet.fr' }] })
    ana = await m.compte('Ana')
    instant = m.maintenant()
    expect((await m.appeler('/api/rattachements/crm/societe:1', { compte: ana, json: { titre: 'Dupont SARL' } })).status).toBe(201)
  })
  afterAll(() => m.fermer())

  it('refuse un outil sans secret, une signature fausse ou trop vieille, une demande hors du catalogue', async () => {
    expect((await demander(demande('lire'), { source: 'muet' })).statut).toBe(404)
    expect(await demander(demande('lire'), { secret: `${SECRET}x` })).toMatchObject({ statut: 401, corps: { code: 'signature_invalide' } })
    expect(await demander(demande('lire'), { quand: m.maintenant() - 10 * 60_000 })).toMatchObject({ statut: 401 })
    expect(await demander({ ...demande('effacer') })).toMatchObject({ statut: 400, corps: { code: 'corps_invalide' } })
    expect(await demander({ ...demande('lire'), en_plus: 1 })).toMatchObject({ statut: 400 })
    expect(await demander({ id: 'court', action: 'lire', cle: 'societe:1' })).toMatchObject({ statut: 400 })
    expect(await demander(demande('fusionner'))).toMatchObject({ statut: 400, corps: { code: 'action_reservee' } })
  })

  it('lire : le dossier de la fiche dans chaque espace, ou rien', async () => {
    const r = await demander(demande('lire'))
    expect(r.statut).toBe(200)
    expect(r.corps).toMatchObject({ etat: 'present', dossiers: [{ etat: 'present', jete_par: null }] })
    expect((await demander(demande('lire', 'societe:404'))).corps).toEqual({ etat: 'absent', dossiers: [] })
  })

  it('jeter, puis remettre : la carte va à la corbeille et en revient ; deux fois, rien de plus', async () => {
    const d = demande('jeter')
    const jete = await demander(d)
    expect(jete.corps).toMatchObject({ etat: 'corbeille', dossiers: [{ etat: 'corbeille', jete_par: 'outil' }] })
    const dossier = jete.corps.dossiers[0]!.tableau
    const clients = m.base.tableau(dossier)!.parent!
    expect(carteDe(clients, dossier)?.corbeille).toBeTypeOf('number')
    expect(await bibliotheque()).not.toContain('Dupont SARL')
    expect(await (await m.appeler('/api/rattachements/crm/societe:1', { compte: ana })).json()).toMatchObject({ etat: 'corbeille' })
    // La même demande renvoyée : la même réponse, sans rien refaire, même après un autre geste.
    expect((await demander(demande('jeter'))).corps.dossiers[0]!.jete_par).toBe('outil')
    expect((await demander(demande('remettre'))).corps).toMatchObject({ etat: 'present', dossiers: [{ etat: 'present', jete_par: null }] })
    expect((await demander(d)).corps).toEqual(jete.corps)
    expect(carteDe(clients, dossier)).not.toHaveProperty('corbeille')
    expect(await bibliotheque()).toContain('Dupont SARL')
    // Un geste de l'outil ne lui revient pas.
    expect(m.base.envoisAFaire(m.maintenant() + 1, 50).filter((e) => e.type !== 'dossier.cree')).toEqual([])
  })

  it('la corbeille vidée, le dossier y reste ; remis, sa carte est reposée', async () => {
    const dossier = (await demander(demande('jeter'))).corps.dossiers[0]!.tableau
    const clients = m.base.tableau(dossier)!.parent!
    // « Vider la corbeille » de la toile : la carte s'efface, la toile reste.
    const doc = new Y.Doc()
    Y.applyUpdate(doc, m.base.document(nomDuDocument(clients))!)
    const elements = doc.getMap<{ contenu: { cible?: string } }>('elements')
    for (const [id, e] of [...elements.entries()]) if (e.contenu.cible === dossier) elements.delete(id)
    m.base.enregistrerDocument(nomDuDocument(clients), Y.encodeStateAsUpdate(doc))
    indexerDocument(m.base, clients, doc)
    expect(carteDe(clients, dossier)).toBeUndefined()
    expect(await bibliotheque()).not.toContain('Dupont SARL')
    expect((await demander(demande('lire'))).corps.etat).toBe('corbeille')

    expect((await demander(demande('remettre'))).corps.etat).toBe('present')
    expect(carteDe(clients, dossier)).toBeDefined()
    expect(await bibliotheque()).toContain('Dupont SARL')
  })

  it('ce qu’une personne a jeté, l’outil ne le remet pas', async () => {
    const dossier = (await demander(demande('lire'))).corps.dossiers[0]!.tableau
    m.base.marquerCorbeille(m.base.rattachementsDeLaFiche('crm', 'societe:1')[0]!, m.maintenant(), 'personne')
    expect((await demander(demande('remettre'))).corps).toMatchObject({ etat: 'corbeille', dossiers: [{ jete_par: 'personne' }] })
    m.base.marquerCorbeille(m.base.rattachementsDeLaFiche('crm', 'societe:1')[0]!, null, null)
    expect(dossier).toBeTruthy()
  })
})

describe('ce que font les personnes, et ce que Notak en dit à l’outil', () => {
  let m: Monde
  let ana: Compte
  const envois = () => m.base.envoisAFaire(m.maintenant() + 1, 50).map((e) => ({ type: e.type, ...(JSON.parse(e.charge) as { cle: string; par: string | null }) }))

  beforeAll(async () => {
    m = monde({ rattachements: [CRM] })
    ana = await m.compte('Ana')
  })
  afterAll(() => m.fermer())

  it('créer, jeter, remettre : chaque geste part, au nom de qui l’a fait', async () => {
    const cree = (await (await m.appeler('/api/rattachements/crm/societe:7', { compte: ana, json: { titre: 'Martin' } })).json()) as { tableau: string }
    expect(envois()).toEqual([expect.objectContaining({ type: 'dossier.cree', cle: 'societe:7', par: 'Ana' })])

    // Ana jette la carte du dossier dans la bibliothèque : l'enregistrement le voit (comme la synchro).
    const clients = m.base.tableau(cree.tableau)!.parent!
    const doc = new Y.Doc()
    Y.applyUpdate(doc, m.base.document(nomDuDocument(clients))!)
    const elements = doc.getMap<Record<string, unknown>>('elements')
    for (const [id, e] of elements) if ((e.contenu as { cible?: string }).cible === cree.tableau) elements.set(id, { ...e, corbeille: 1 })
    m.base.enregistrerDocument(nomDuDocument(clients), Y.encodeStateAsUpdate(doc))
    suivreLesDossiers({ base: m.base, sources: () => [CRM], maintenant: m.maintenant })(indexerDocument(m.base, clients, doc), { nom: 'Ana' })
    expect(m.base.rattachementsDeLaFiche('crm', 'societe:7')[0]).toMatchObject({ jete_par: 'personne' })
    expect(envois().at(-1)).toMatchObject({ type: 'dossier.jete', cle: 'societe:7', par: 'Ana' })

    // « Le remettre », depuis /relier.
    expect((await m.appeler('/api/rattachements/crm/societe:7/remettre', { compte: ana, json: {} })).status).toBe(200)
    expect(envois().at(-1)).toMatchObject({ type: 'dossier.remis', cle: 'societe:7', par: 'Ana' })
    expect(envois()).toHaveLength(3)
  })
})

describe('la file d’envoi', () => {
  let m: Monde
  beforeAll(() => {
    m = monde({ rattachements: [CRM] })
  })
  afterAll(() => m.fermer())

  it('envoie signé, ne renvoie pas ce qui est reçu, relance ce qui échoue, puis abandonne', async () => {
    const recus: { adresse: string; corps: string; signature: string | null }[] = []
    let reponse = 500
    const envoyer = (async (adresse: string, init: RequestInit) => {
      recus.push({ adresse, corps: String(init.body), signature: new Headers(init.headers).get('notak-signature') })
      return new Response(null, { status: reponse })
    }) as typeof fetch
    let maintenant = 1_800_000_000_000
    const horloge = () => maintenant
    m.base.mettreEnvoiEnFile({ id: 'e1', source: 'crm', type: 'dossier.jete', charge: '{"id":"e1"}', cree: maintenant, prochain: maintenant })

    expect(await viderLaFile({ base: m.base, sources: [CRM], maintenant: horloge, envoyer })).toBe(0)
    expect(recus[0]).toMatchObject({ adresse: CRM.webhook, corps: '{"id":"e1"}' })
    expect(signatureValable(SECRET, recus[0]!.corps, recus[0]!.signature, maintenant)).toBe(true)
    // Pas avant son heure.
    await viderLaFile({ base: m.base, sources: [CRM], maintenant: horloge, envoyer })
    expect(recus).toHaveLength(1)
    maintenant += delaiDEssai(1)
    reponse = 204
    expect(await viderLaFile({ base: m.base, sources: [CRM], maintenant: horloge, envoyer })).toBe(1)
    maintenant += 3_600_000
    await viderLaFile({ base: m.base, sources: [CRM], maintenant: horloge, envoyer })
    expect(recus).toHaveLength(2)

    // Abandonné au bout de ses essais.
    m.base.mettreEnvoiEnFile({ id: 'e2', source: 'crm', type: 'dossier.jete', charge: '{"id":"e2"}', cree: maintenant, prochain: maintenant })
    m.base.envoiManque('e2', ESSAIS_MAX - 1, maintenant, 'réponse 500')
    reponse = 500
    await viderLaFile({ base: m.base, sources: [CRM], maintenant: horloge, envoyer })
    expect(m.base.envoisAFaire(Number.MAX_SAFE_INTEGER, 10)).toEqual([])
    expect(delaiDEssai(1)).toBe(60_000)
    expect(delaiDEssai(20)).toBe(3_600_000)
  })
})
