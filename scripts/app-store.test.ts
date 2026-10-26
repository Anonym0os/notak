import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * La fiche App Store (`apps/bureau/app-store/metadata`) tient dans ce qu'App Store Connect accepte : on le sait
 * ici, pas au moment d'envoyer.
 */
const dossier = new URL('../apps/bureau/app-store/metadata/', import.meta.url).pathname
const LANGUES = ['fr-FR', 'en-US']
const LIMITES: Record<string, number> = { 'name.txt': 30, 'subtitle.txt': 30, 'promotional_text.txt': 170, 'description.txt': 4000, 'release_notes.txt': 4000 }

const lire = (...chemin: string[]) => readFileSync(join(dossier, ...chemin), 'utf8')

describe('la fiche App Store', () => {
  it('a les mêmes champs dans chaque langue', () => {
    const [fr, en] = LANGUES.map((l) => readdirSync(join(dossier, l)).sort())
    expect(fr).toEqual(en)
    expect(fr).toEqual(expect.arrayContaining(Object.keys(LIMITES).concat(['keywords.txt', 'support_url.txt', 'marketing_url.txt', 'privacy_url.txt'])))
  })

  it.each(LANGUES)('%s : chaque champ tient dans sa limite, et les mots-clés dans 100 octets', (langue) => {
    for (const [f, max] of Object.entries(LIMITES)) {
      const texte = lire(langue, f).trim()
      expect(texte.length, f).toBeGreaterThan(0)
      expect(texte.length, f).toBeLessThanOrEqual(max)
    }
    const mots = lire(langue, 'keywords.txt').trim()
    expect(Buffer.byteLength(mots, 'utf8')).toBeLessThanOrEqual(100)
    expect(mots).not.toMatch(/,\s/)
    expect(mots.split(',').length).toBeGreaterThanOrEqual(5)
  })

  it.each(LANGUES)('%s : les adresses sont sur notak.app, en https', (langue) => {
    for (const f of ['support_url.txt', 'marketing_url.txt', 'privacy_url.txt']) expect(lire(langue, f).trim()).toMatch(/^https:\/\/notak\.app(\/[a-z-]+)?$/)
  })

  it('les catégories sont celles d’App Store Connect, et rien de personnel n’est dans le dépôt', () => {
    expect(lire('primary_category.txt').trim()).toBe('PRODUCTIVITY')
    expect(lire('secondary_category.txt').trim()).toBe('GRAPHICS_AND_DESIGN')
    expect(statSync(join(dossier, 'review_information/demo_user.txt')).size).toBe(0)
    expect(statSync(join(dossier, 'review_information/demo_password.txt')).size).toBe(0)
  })
})
