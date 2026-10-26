// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContexteToile } from '../types'
import { ouvrirOuTelecharger } from './Arbre'

let onglet: ReturnType<typeof vi.spyOn>
let liens: HTMLAnchorElement[]
beforeEach(() => {
  onglet = vi.spyOn(window, 'open').mockReturnValue(null)
  liens = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    liens.push(this)
  })
})
afterEach(() => vi.restoreAllMocks())

const contexte = (ouvrirAilleurs?: (adresse: string, nom?: string) => void, adresse: string | null = '/api/fichiers/ab') =>
  ({ services: { fichiers: { adresse: async () => adresse }, ouvrirAilleurs } }) as unknown as ContexteToile

describe('ouvrir une pièce jointe de la carte', () => {
  it('l’hôte, s’il sait ouvrir ailleurs, reçoit l’adresse et le nom ; aucun onglet, aucun téléchargement', async () => {
    const ailleurs = vi.fn()
    await ouvrirOuTelecharger(contexte(ailleurs), 'f1', 'plan.pdf', false)
    expect(ailleurs).toHaveBeenCalledExactlyOnceWith('/api/fichiers/ab', 'plan.pdf')
    expect(onglet).not.toHaveBeenCalled()
    expect(liens).toEqual([])
  })

  it('sans hôte pour cela, un nouvel onglet', async () => {
    await ouvrirOuTelecharger(contexte(), 'f1', 'plan.pdf', false)
    expect(onglet).toHaveBeenCalledExactlyOnceWith('/api/fichiers/ab', '_blank', 'noopener,noreferrer')
    expect(liens).toEqual([])
  })

  it('sans nom connu, l’hôte reçoit l’adresse seule', async () => {
    const ailleurs = vi.fn()
    await ouvrirOuTelecharger(contexte(ailleurs), 'f1')
    expect(ailleurs).toHaveBeenCalledExactlyOnceWith('/api/fichiers/ab', undefined)
  })

  it('un fichier sans adresse ne s’ouvre nulle part', async () => {
    const ailleurs = vi.fn()
    await ouvrirOuTelecharger(contexte(ailleurs, null), 'f1', 'plan.pdf', false)
    expect(ailleurs).not.toHaveBeenCalled()
    expect(onglet).not.toHaveBeenCalled()
  })
})

describe('enregistrer une image de la carte', () => {
  it('passe par un lien de téléchargement (la coque le traite), jamais par l’hôte ni par un onglet', async () => {
    const ailleurs = vi.fn()
    await ouvrirOuTelecharger(contexte(ailleurs), 'f1', 'Idées.png')
    expect(liens).toHaveLength(1)
    expect(liens[0]!.getAttribute('href')).toBe('/api/fichiers/ab')
    expect(liens[0]!.download).toBe('Idées.png')
    expect(ailleurs).not.toHaveBeenCalled()
    expect(onglet).not.toHaveBeenCalled()
  })
})
