import { describe, expect, it } from 'vitest'
import { lireHabillageTexte } from './format'

// Les thèmes d'exemple du dépôt (`exemples/habillages/`) se relisent à chaque essai : un changement de format qui les
// casserait ne passe pas inaperçu.
const fichiers = (import.meta as unknown as { glob(m: string, o: object): Record<string, string> }).glob('../../../../exemples/habillages/*.json', { query: '?raw', import: 'default', eager: true })

describe('les habillages d’exemple', () => {
  const noms = Object.keys(fichiers).map((chemin) => chemin.split('/').at(-1)!)

  it('existent', () => expect(noms).toContain('silak.json'))

  for (const [chemin, texte] of Object.entries(fichiers))
    it(`${chemin.split('/').at(-1)} est un habillage valide, qui porte le nom de son fichier`, () => {
      const h = lireHabillageTexte(texte)
      expect(chemin.endsWith(`/${h.id}.json`)).toBe(true)
    })
})
