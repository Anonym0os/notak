import { describe, expect, it } from 'vitest'
import { commencerEnvoi, copieLocale, progressionEnvoi } from './envois'
import type { DepotFichiers } from './types'

describe('progression d’un envoi', () => {
  it('suit les octets partis, puis cesse quand le fichier est reçu', async () => {
    let dire: (envoyes: number, total: number) => void = () => {}
    let finir: (id: string) => void = () => {}
    const depot: DepotFichiers = {
      enregistrer: (_f, progression) => {
        dire = progression ?? dire
        return new Promise((fini) => (finir = fini))
      },
      adresse: async () => null,
    }
    const id = commencerEnvoi(new Blob(['abcd']), depot)
    // Rien n'est encore parti : on ne sait pas.
    expect(progressionEnvoi(id)).toBe(-1)
    expect(copieLocale(id)).toMatch(/^blob:/)
    dire(1, 4)
    expect(progressionEnvoi(id)).toBe(0.25)
    dire(4, 4)
    expect(progressionEnvoi(id)).toBe(1)
    finir('vrai-id')
    await Promise.resolve()
    expect(progressionEnvoi(id)).toBeNull()
  })

  it('un fichier qui n’est pas en route n’a ni progression ni copie locale', () => {
    expect(progressionEnvoi('abc')).toBeNull()
    expect(copieLocale('abc')).toBeUndefined()
  })
})
