import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { type Compte, type Monde, monde, poser } from './essai.ts'
import { reduire } from './tailles.ts'

// La vraie réduction, comptée : deux demandes de la même copie ne doivent la lancer qu'une fois.
vi.mock('./tailles.ts', async (original) => {
  const vrai = await original<typeof import('./tailles.ts')>()
  return { ...vrai, reduire: vi.fn(vrai.reduire) }
})

let m: Monde
let ana: Compte
let portrait: string

/** Une photo portrait d'iPhone : enregistrée couchée (3000 × 2000, gauche rouge, droite bleue), avec l'orientation 6. */
async function photoPortrait() {
  const rouge = await sharp({ create: { width: 1500, height: 2000, channels: 3, background: '#ff0000' } }).png().toBuffer()
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#0000ff' } })
    .composite([{ input: rouge, left: 0, top: 0 }])
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
}

const lireImage = async (r: Response) => {
  const octets = Buffer.from(await r.arrayBuffer())
  const meta = await sharp(octets).metadata()
  // Le pixel du haut à gauche : rouge si la photo est droite (sa gauche enregistrée est montée en haut).
  const { data } = await sharp(octets).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
  return { octets, largeur: meta.width, hauteur: meta.height, orientation: meta.orientation, haut: data[0]! > data[2]! ? 'rouge' : 'bleu' }
}

beforeAll(async () => {
  m = monde()
  ana = await m.compte('Ana')
  const depot = await m.appeler('/api/fichiers', { compte: ana, corps: new Uint8Array(await photoPortrait()), type: 'image/jpeg' })
  portrait = ((await depot.json()) as { id: string }).id
  m.tableau(ana, 'tableau-photos', 'Photos', (doc) => poser(doc, { type: 'image', fichier: portrait, largeurOrigine: 2000, hauteurOrigine: 3000 }, { id: 'img-1' }))
})
afterAll(() => m.fermer())

describe('les copies réduites d’une photo', () => {
  it('une photo portrait d’iPhone reste droite dans ses copies, sans EXIF qui la tournerait une seconde fois', async () => {
    for (const [l, h] of [
      [400, 600],
      [800, 1200],
      [1600, 2400],
    ] as const) {
      const copie = await lireImage(await m.appeler(`/api/fichiers/${portrait}?l=${l}`, { compte: ana }))
      expect([copie.largeur, copie.hauteur, copie.orientation, copie.haut]).toEqual([l, h, undefined, 'rouge'])
    }
  })

  it('des demandes simultanées de la même copie n’en fabriquent qu’une, et toutes la reçoivent', async () => {
    const depot = await m.appeler('/api/fichiers', { compte: ana, corps: new Uint8Array(await photoPortrait()), type: 'image/jpeg' })
    const id = ((await depot.json()) as { id: string }).id
    vi.mocked(reduire).mockClear()
    const reponses = await Promise.all(Array.from({ length: 6 }, () => m.appeler(`/api/fichiers/${id}?l=800`, { compte: ana })))
    const octets = await Promise.all(reponses.map(async (r) => Buffer.from(await r.arrayBuffer())))
    expect(reponses.map((r) => r.status)).toEqual(new Array(6).fill(200))
    for (const o of octets) expect(o.equals(octets[0]!)).toBe(true)
    const rangees = readdirSync(join(m.dossier, 'fichiers')).filter((n) => n.startsWith(id))
    expect(rangees.sort()).toEqual([id, `${id}.800`])
    expect(reduire).toHaveBeenCalledTimes(1)
  })

  it('un visiteur reçoit lui aussi la copie à la taille où il voit la photo', async () => {
    const r = await m.appeler('/api/tableaux/tableau-photos/liens', { compte: ana, json: {} })
    const { jeton } = (await r.json()) as { jeton: string }
    const copie = await lireImage(await m.appeler(`/api/public/${jeton}/fichiers/${portrait}?l=400`))
    expect([copie.largeur, copie.hauteur, copie.haut]).toEqual([400, 600, 'rouge'])
    expect((await m.appeler(`/api/public/${jeton}/fichiers/${portrait}?l=abc`)).status).toBe(400)
    // Sans largeur demandée, l'original, tel qu'il a été déposé.
    expect((await lireImage(await m.appeler(`/api/public/${jeton}/fichiers/${portrait}`))).orientation).toBe(6)
  })
})
