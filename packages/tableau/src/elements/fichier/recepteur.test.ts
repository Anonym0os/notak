import { describe, expect, it, vi } from 'vitest'
import type { Element, Fichier } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { recevoirFichiers } from './recepteur'

vi.mock('../../avis', () => ({ annoncer: () => {} }))

const contexte = (largeurVue = 1440) =>
  ({ services: { fichiers: { enregistrer: async () => 'f', adresse: async () => null } }, largeurVue: () => largeurVue }) as unknown as ContexteToile
const recus = (...fichiers: File[]) => ({ files: fichiers }) as unknown as DataTransfer
const pdf = (nom: string) => new File(['%PDF-1.7'], nom, { type: 'application/pdf' })
const photo = (nom: string, type = 'image/jpeg') => new File([new Uint8Array([0xff, 0xd8, 0xff])], nom, { type })
const poses = (ops: ReturnType<typeof recevoirFichiers>) => (ops ?? []).flatMap((op) => (op.type === 'creer' ? [op.element as Element<Fichier>] : []))

describe('recevoirFichiers', () => {
  it('une photo HEIC n’est pas un fichier joint : les images la prennent', () => {
    expect(recevoirFichiers(recus(photo('IMG_0001.HEIC', 'image/heic')), { x: 0, y: 0 }, contexte())).toBeNull()
    expect(recevoirFichiers(recus(photo('IMG_0002.HEIC', '')), { x: 0, y: 0 }, contexte())).toBeNull()
  })

  it('range les fichiers à droite de toutes les colonnes des images du même dépôt, sans les chevaucher', () => {
    // Un fichier seul se pose une UG en haut à gauche du point, comme une image seule. Une image : à sa droite, comme avant.
    expect(poses(recevoirFichiers(recus(photo('a.jpg'), pdf('a.pdf')), { x: 0, y: 0 }, contexte()))[0]!.x).toBe(36 - 1)
    // Cinq images sur quatre colonnes (une vue de 1440 px) : les fichiers commencent après la quatrième.
    const cinq = ['a', 'b', 'c', 'd', 'e'].map((n) => photo(`${n}.jpg`))
    expect(poses(recevoirFichiers(recus(...cinq, pdf('a.pdf')), { x: 10, y: 0 }, contexte()))[0]!.x).toBe(10 + 4 * 36 - 1)
    // Deux images : deux colonnes.
    expect(poses(recevoirFichiers(recus(photo('a.jpg'), photo('b.jpg'), pdf('a.pdf')), { x: 0, y: 0 }, contexte()))[0]!.x).toBe(72 - 1)
    // Sans image : au point de dépôt.
    expect(poses(recevoirFichiers(recus(pdf('a.pdf')), { x: 3, y: 4 }, contexte()))[0]).toMatchObject({ x: 2, y: 3 })
  })
})
