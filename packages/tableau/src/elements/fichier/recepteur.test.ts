import { describe, expect, it, vi } from 'vitest'
import type { ContexteToile } from '../types'
import { recevoirFichiers } from './recepteur'

vi.mock('../../avis', () => ({ annoncer: () => {} }))

const contexte = (largeurVue = 1440) =>
  ({ services: { fichiers: { enregistrer: async () => 'f', adresse: async () => null } }, largeurVue: () => largeurVue }) as unknown as ContexteToile
const recus = (...fichiers: File[]) => ({ files: fichiers }) as unknown as DataTransfer
const photo = (nom: string, type = 'image/jpeg') => new File([new Uint8Array([0xff, 0xd8, 0xff])], nom, { type })

describe('recevoirFichiers', () => {
  it('une photo HEIC n’est pas un fichier joint : les images la prennent', () => {
    expect(recevoirFichiers(recus(photo('IMG_0001.HEIC', 'image/heic')), { x: 0, y: 0 }, contexte())).toBeNull()
    expect(recevoirFichiers(recus(photo('IMG_0002.HEIC', '')), { x: 0, y: 0 }, contexte())).toBeNull()
  })
})
