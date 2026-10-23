import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { ouvrirBase } from './base.ts'
import { type Monde, monde } from './essai.ts'

let m: Monde | null = null
afterEach(() => {
  m?.fermer()
  m = null
})

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])

async function deposer(mo: Monde, compte: Awaited<ReturnType<Monde['compte']>>, type = 'image/png'): Promise<string> {
  const r = await mo.appeler('/api/fichiers', { compte, corps: PNG, type })
  expect(r.status).toBe(201)
  return ((await r.json()) as { id: string }).id
}
const patch = (mo: Monde, compte: Awaited<ReturnType<Monde['compte']>> | undefined, json: unknown) => mo.appeler('/api/moi', { methode: 'PATCH', compte, json })

describe('PATCH /api/moi : couleur et photo du compte', () => {
  it('refuse sans session', async () => {
    m = monde()
    expect((await patch(m, undefined, { couleur: '#112233' })).status).toBe(401)
  })

  it('change la couleur, que /api/moi relit ensuite', async () => {
    m = monde()
    const ana = await m.compte('Ana')
    const r = await patch(m, ana, { couleur: '#AA33CC' })
    expect(r.status).toBe(200)
    expect(((await r.json()) as { couleur: string }).couleur).toBe('#aa33cc')
    const moi = (await (await m.appeler('/api/moi', { compte: ana })).json()) as { couleur: string; photo: string | null }
    expect(moi).toMatchObject({ couleur: '#aa33cc', photo: null })
    expect(m.base.utilisateurParId(ana.utilisateur.id)?.couleur).toBe('#aa33cc')
  })

  it('refuse une couleur qui n’en est pas une, et une demande vide', async () => {
    m = monde()
    const ana = await m.compte('Ana')
    for (const mauvaise of ['rouge', '#12345', '#gggggg', 12, null, '#1234567']) {
      expect((await patch(m, ana, { couleur: mauvaise })).status).toBe(400)
    }
    expect((await patch(m, ana, {})).status).toBe(400)
    expect(m.base.utilisateurParId(ana.utilisateur.id)?.couleur).toBe(ana.utilisateur.couleur)
  })

  it('prend un fichier déposé par le compte pour photo, et la retire avec null', async () => {
    m = monde()
    const ana = await m.compte('Ana')
    const fichier = await deposer(m, ana)
    const r = await patch(m, ana, { photo: fichier })
    expect(r.status).toBe(200)
    expect(((await r.json()) as { photo: string }).photo).toBe(fichier)
    expect(m.base.utilisateurParId(ana.utilisateur.id)?.photo).toBe(fichier)
    // La photo se lit comme tout fichier, par un autre compte aussi (c'est ce que la présence montre).
    const bob = await m.compte('Bob')
    expect((await m.appeler(`/api/fichiers/${fichier}`, { compte: bob })).status).toBe(200)

    const retiree = await patch(m, ana, { photo: null })
    expect(((await retiree.json()) as { photo: string | null }).photo).toBeNull()
    expect(m.base.utilisateurParId(ana.utilisateur.id)?.photo).toBeNull()
  })

  it('refuse le fichier d’un autre, un fichier inconnu, un format sans image sûre', async () => {
    m = monde()
    const ana = await m.compte('Ana')
    const bob = await m.compte('Bob')
    const deBob = await deposer(m, bob)
    expect((await patch(m, ana, { photo: deBob })).status).toBe(400)
    expect((await patch(m, ana, { photo: '00000000-0000-0000-0000-000000000000' })).status).toBe(400)
    expect((await patch(m, ana, { photo: 'pas-un-id' })).status).toBe(400)
    expect((await patch(m, ana, { photo: 42 })).status).toBe(400)
    const svg = await deposer(m, ana, 'image/svg+xml')
    const pdf = await deposer(m, ana, 'application/pdf')
    expect((await patch(m, ana, { photo: svg })).status).toBe(415)
    expect((await patch(m, ana, { photo: pdf })).status).toBe(415)
    expect(m.base.utilisateurParId(ana.utilisateur.id)?.photo ?? null).toBeNull()
  })

  it('règle la couleur et la photo d’un seul geste, sans toucher à ce qui n’est pas demandé', async () => {
    m = monde()
    const ana = await m.compte('Ana')
    const fichier = await deposer(m, ana, 'image/jpeg')
    await patch(m, ana, { couleur: '#010203', photo: fichier })
    await patch(m, ana, { couleur: '#040506' })
    expect(m.base.utilisateurParId(ana.utilisateur.id)).toMatchObject({ couleur: '#040506', photo: fichier })
  })

  it('la connexion rend aussi la photo', async () => {
    m = monde()
    const ana = await m.compte('Ana')
    expect(((await (await m.appeler('/api/moi', { compte: ana })).json()) as { photo: unknown }).photo).toBeNull()
  })
})

describe('une base d’avant la photo', () => {
  it('gagne sa colonne à l’ouverture, sans perdre les comptes', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'notak-migr-'))
    try {
      const chemin = join(dossier, 'vieille.db')
      const ancienne = new DatabaseSync(chemin)
      ancienne.exec(
        "CREATE TABLE utilisateurs (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, nom TEXT NOT NULL, hash TEXT NOT NULL, couleur TEXT NOT NULL, racine TEXT NOT NULL);" +
          "INSERT INTO utilisateurs VALUES ('u1','a@b.fr','Ana','h','#000000','r1');",
      )
      ancienne.close()
      const base = ouvrirBase(chemin)
      expect(base.utilisateurParId('u1')).toMatchObject({ nom: 'Ana', photo: null })
      base.reglerCompte('u1', { photo: 'f' })
      expect(base.utilisateurParId('u1')?.photo).toBe('f')
      base.fermer()
      // Rouvrir ne rajoute pas la colonne une seconde fois.
      ouvrirBase(chemin).fermer()
    } finally {
      rmSync(dossier, { recursive: true, force: true })
    }
  })
})
