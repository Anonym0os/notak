import { definirLangue } from '@notak/tableau'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ouvrirAilleursAvecAvis, texteOuvrirAilleurs } from './ailleurs'

afterEach(() => definirLangue('fr'))

/** Laisse passer les promesses. */
const attendre = () => new Promise((fin) => setTimeout(fin, 0))

describe('ouvrir un fichier ailleurs, dans l’app de bureau', () => {
  it('trop de fichiers d’un coup : on dit d’attendre un instant', () => {
    expect(texteOuvrirAilleurs({ code: 'trop_vite' })).toBe('Trop de fichiers ouverts d’un coup : réessayez dans un instant.')
    definirLangue('en')
    expect(texteOuvrirAilleurs({ code: 'trop_vite' })).toBe('Too many files opened at once: try again in a moment.')
  })

  it('un fichier trop gros, ou tout autre échec, se dit aussi, avec quoi faire', () => {
    expect(texteOuvrirAilleurs({ code: 'trop_gros' })).toBe('Ce fichier est trop volumineux pour s’ouvrir ainsi : téléchargez-le, puis ouvrez-le depuis votre ordinateur.')
    expect(texteOuvrirAilleurs({ code: 'echec', message: 'boum' })).toBe('Ce fichier n’a pas pu s’ouvrir. Réessayez, ou téléchargez-le.')
    expect(texteOuvrirAilleurs(new Error('adresse refusée'))).toBe('Ce fichier n’a pas pu s’ouvrir. Réessayez, ou téléchargez-le.')
    expect(texteOuvrirAilleurs('Command ouvrir_fichier not found')).toBe('Ce fichier n’a pas pu s’ouvrir. Réessayez, ou téléchargez-le.')
  })

  it('passe l’adresse et le nom à la coque, et ne dit rien quand tout va bien', async () => {
    const ouvrir = vi.fn().mockResolvedValue('ouvert')
    const signaler = vi.fn()
    ouvrirAilleursAvecAvis('blob:http://tauri.localhost/x', 'plan.pdf', signaler, ouvrir)
    await attendre()
    expect(ouvrir).toHaveBeenCalledWith('blob:http://tauri.localhost/x', 'plan.pdf')
    expect(signaler).not.toHaveBeenCalled()
  })

  it('un refus de la coque se dit, au lieu d’un clic qui ne fait rien', async () => {
    const signaler = vi.fn()
    ouvrirAilleursAvecAvis('blob:x', undefined, signaler, vi.fn().mockRejectedValue({ code: 'trop_vite' }))
    await attendre()
    expect(signaler).toHaveBeenCalledWith('Trop de fichiers ouverts d’un coup : réessayez dans un instant.')
    ouvrirAilleursAvecAvis('blob:x', undefined, signaler, vi.fn().mockRejectedValue(new Error('le fichier ne s’est pas lu (404)')))
    await attendre()
    expect(signaler).toHaveBeenLastCalledWith('Ce fichier n’a pas pu s’ouvrir. Réessayez, ou téléchargez-le.')
  })

  it('un fichier qu’on a proposé à l’enregistrement, qu’on a renoncé à enregistrer ou à ouvrir, ne dit rien', async () => {
    const signaler = vi.fn()
    for (const suite of ['enregistre', 'annule']) ouvrirAilleursAvecAvis('blob:x', 'a.svg', signaler, vi.fn().mockResolvedValue(suite))
    await attendre()
    expect(signaler).not.toHaveBeenCalled()
  })
})
