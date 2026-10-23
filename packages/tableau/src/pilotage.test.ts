import { afterEach, describe, expect, it } from 'vitest'
import type { Camera } from './coeur/camera'
import { depuisTaille, point } from './coeur/geometrie'
import { type PiloteToile, avecToutLeTableau, brancherPilote, rapportDeCapture } from './pilotage'

describe('rapportDeCapture', () => {
  it('reste sous les 4000 px de large', () => {
    expect(rapportDeCapture(1600, 0.3)).toBe(2.5)
    expect(1600 * rapportDeCapture(1600, 0.3)).toBeLessThanOrEqual(4000)
  })
  it('regrossit un contenu vu de loin, mais pas au-delà de 3', () => {
    expect(rapportDeCapture(1000, 0.4)).toBe(2.5)
    expect(rapportDeCapture(1000, 0.1)).toBe(3)
  })
  it('garde 2 quand le contenu est déjà grand', () => {
    expect(rapportDeCapture(1000, 1)).toBe(2)
  })
  it('descend sous 1 pour une vue démesurée', () => {
    expect(rapportDeCapture(8000, 1)).toBe(0.5)
  })
})

let debrancher: (() => void) | null = null
afterEach(() => debrancher?.())

function pilote(contenu = depuisTaille(point(0, 0), 200, 100)) {
  const poses: Camera[] = []
  let camera = { origine: point(30, 40), echelle: 1.5 }
  const p: PiloteToile = {
    camera: () => camera,
    vue: () => ({ largeur: 1000, hauteur: 600 }),
    contenu: () => contenu,
    poser: (c) => {
      camera = c
      poses.push(c)
    },
  }
  debrancher = brancherPilote(p)
  return { poses, camera: () => camera }
}

describe('avecToutLeTableau', () => {
  it('cadre tout le contenu pendant la capture puis rend la caméra', async () => {
    const { poses, camera } = pilote()
    const avant = camera()
    let pendant: Camera | null = null
    const r = await avecToutLeTableau(async ({ rapport }) => {
      pendant = camera()
      return rapport
    }, 0)
    expect(pendant).not.toEqual(avant)
    expect(r).toBeGreaterThan(0)
    expect(poses).toHaveLength(2)
    expect(camera()).toEqual(avant)
  })

  it('rend la caméra même quand la capture échoue', async () => {
    const { camera } = pilote()
    const avant = camera()
    await expect(avecToutLeTableau(() => Promise.reject(new Error('non')), 0)).rejects.toThrow('non')
    expect(camera()).toEqual(avant)
  })

  it('refuse un tableau vide sans bouger la caméra', async () => {
    const { poses } = pilote(null as never)
    await expect(avecToutLeTableau(async () => 1, 0)).rejects.toThrow('vide')
    expect(poses).toHaveLength(0)
  })

  it('refuse quand aucune toile n’est là', async () => {
    debrancher?.()
    await expect(avecToutLeTableau(async () => 1, 0)).rejects.toThrow('Aucun tableau')
  })
})
