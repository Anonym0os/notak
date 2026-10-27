import { describe, expect, it } from 'vitest'
import { accueilLocal } from './accueil'

const textes = (v: unknown): string[] =>
  Array.isArray(v) ? v.flatMap(textes) : typeof v === 'object' && v !== null ? Object.values(v).flatMap(textes) : typeof v === 'string' ? [v] : []

describe('accueil de l’édition locale', () => {
  it('ne parle pas de ce qui n’existe pas sans serveur, et parle de la copie', () => {
    for (const langue of ['fr', 'en']) {
      const tout = textes(accueilLocal(langue, false).elements).join('\n')
      expect(tout).not.toMatch(/Partager|Share button|photo|compte|account/)
      expect(tout).toMatch(/\.notak/)
    }
  })

  it('au doigt, ne promet ni clavier ni souris', () => {
    for (const langue of ['fr', 'en']) {
      const tout = textes(accueilLocal(langue, true).elements).join('\n')
      expect(tout).not.toMatch(/Cmd|⌘|[Dd]ouble-c|Espace et|Space and|Tapez \/|Type \/|depuis votre bureau|from your desktop|Partager|Share button|compte|account/)
      expect(tout).toMatch(/\.notak/)
      expect(tout).toMatch(langue === 'fr' ? /Touchez deux fois/ : /Tap twice/)
    }
  })
})
