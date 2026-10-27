import { describe, expect, it } from 'vitest'
import { argumentsDeConstruction } from './bureau'

describe('construire l’app de bureau', () => {
  it('passe ses arguments à tauri build', () => {
    expect(argumentsDeConstruction([])).toEqual(['build'])
    expect(argumentsDeConstruction(['--bundles', 'dmg'])).toEqual(['build', '--bundles', 'dmg'])
  })

  it('ne construit plus de coque pour un serveur : il se choisit dans l’app', () => {
    expect(() => argumentsDeConstruction(['--serveur', 'https://notak.exemple.fr'])).toThrow(/se choisit dans l’app/)
  })
})
