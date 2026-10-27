import { describe, expect, it, vi } from 'vitest'
import { choisirEmplacement } from './enregistrer'

const fichier = { nom: 'Voyage.notak', extension: 'notak', type: 'application/x-notak', description: 'Notak' }
const blob = () => new Blob([new Uint8Array([80, 75, 3, 4])], { type: 'application/x-notak' })

describe('où va un export', () => {
  it('dans Notak de bureau : la fenêtre du système, puis la coque écrit les octets bruts', async () => {
    const invoke = vi.fn(async (commande: string) => (commande === 'choisir_emplacement' ? 'Voyage final.notak' : null))
    const ou = await choisirEmplacement(fichier, { __TAURI_INTERNALS__: { invoke } } as never)
    expect(invoke).toHaveBeenCalledWith('choisir_emplacement', { nom: 'Voyage.notak', extension: 'notak', description: 'Notak' })
    expect(ou?.nom).toBe('Voyage final.notak')
    await ou!.ecrire(blob())
    expect(invoke).toHaveBeenLastCalledWith('ecrire_fichier', new Uint8Array([80, 75, 3, 4]))
  })

  it('dans Notak de bureau, Annuler ne rend rien', async () => {
    const invoke = vi.fn(async () => null)
    expect(await choisirEmplacement(fichier, { __TAURI_INTERNALS__: { invoke } } as never)).toBeNull()
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('dans Chrome : la fenêtre « Enregistrer sous », avec le nom, le type et l’extension, puis l’écriture', async () => {
    const ecrits: Blob[] = []
    const showSaveFilePicker = vi.fn(async () => ({
      name: 'Ailleurs.notak',
      createWritable: async () => ({ write: async (b: Blob) => void ecrits.push(b), close: async () => {} }),
    }))
    const ou = await choisirEmplacement(fichier, { showSaveFilePicker } as never)
    expect(showSaveFilePicker).toHaveBeenCalledWith({ suggestedName: 'Voyage.notak', types: [{ description: 'Notak', accept: { 'application/x-notak': ['.notak'] } }] })
    expect(ou?.nom).toBe('Ailleurs.notak')
    await ou!.ecrire(blob())
    expect(ecrits).toHaveLength(1)
  })

  it('dans Chrome, Annuler ne rend rien ; une autre erreur retombe sur le téléchargement', async () => {
    const annuler = vi.fn(async () => {
      throw new DOMException('non', 'AbortError')
    })
    expect(await choisirEmplacement(fichier, { showSaveFilePicker: annuler } as never)).toBeNull()
    const refuser = vi.fn(async () => {
      throw new TypeError('type refusé')
    })
    expect((await choisirEmplacement(fichier, { showSaveFilePicker: refuser } as never))?.nom).toBe('Voyage.notak')
  })

  it('ailleurs : un téléchargement sous le nom proposé', async () => {
    const ou = await choisirEmplacement(fichier, {} as never)
    expect(ou?.nom).toBe('Voyage.notak')
  })
})

describe('une coque de bureau d’avant les commandes d’enregistrement', () => {
  it('dit qu’il faut la mettre à jour, plutôt qu’un échec sans cause', async () => {
    const invoke = vi.fn(async () => {
      throw 'Command choisir_emplacement not found'
    })
    await expect(choisirEmplacement(fichier, { __TAURI_INTERNALS__: { invoke } } as never)).rejects.toThrow('bureau_a_mettre_a_jour')
  })
})

describe('sur un iPhone ou un iPad', () => {
  it('l’export part dans la feuille de partage du système, avec son nom, une fois fait', async () => {
    const invoke = vi.fn(async () => ({ fait: true, activite: 'com.apple.DocumentManagerUICore.SaveToFiles' }))
    const w = { __TAURI_INTERNALS__: { invoke }, __NOTAK_PLATEFORME__: 'ios', navigator: { userAgent: '', maxTouchPoints: 5 } }
    const ou = await choisirEmplacement(fichier, w as never)
    expect(invoke).not.toHaveBeenCalled()
    await ou!.ecrire(blob())
    expect(invoke).toHaveBeenCalledWith('plugin:appareil|partager', { nom: 'Voyage.notak', donnees: btoa(String.fromCharCode(80, 75, 3, 4)) })
  })
})

