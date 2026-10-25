import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lireHabillageTexte } from './format'

// Les thèmes d'exemple du dépôt (`exemples/habillages/`) se relisent à chaque essai : un changement de format qui les
// casserait ne passe pas inaperçu.
const dossier = new URL('../../../../exemples/habillages/', import.meta.url)

describe('les habillages d’exemple', () => {
  const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.json'))

  it('existent', () => expect(fichiers).toContain('silak.json'))

  for (const f of fichiers)
    it(`${f} est un habillage valide, qui porte le nom de son fichier`, () => {
      const h = lireHabillageTexte(readFileSync(new URL(f, dossier), 'utf8'))
      expect(`${h.id}.json`).toBe(f)
    })
})
