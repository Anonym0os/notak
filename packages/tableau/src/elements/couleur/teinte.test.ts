import { describe, expect, it } from 'vitest'
import type { Contenu } from '../../coeur/tableau'
import { teinteDeCarte } from './teinte'

const lien = (couleur?: string) => ({ type: 'lien', url: 'https://a.fr', statut: 'pret', ...(couleur ? { couleur } : {}) }) as unknown as Contenu

describe('teinteDeCarte', () => {
  it('pose le fond et un texte lisible dessus', () => {
    const s = teinteDeCarte(true, lien('jaune')) as Record<string, string>
    expect(s['--notak-teinte']).toBe('#ffd14d')
    expect(s['--notak-teinte-texte']).toBe('#323b4a')
    expect((teinteDeCarte(true, lien('bleu_nuit')) as Record<string, string>)['--notak-teinte-texte']).toBe('#ffffff')
  })
  it('ne pose rien sans couleur, sans réglage du type ou avec une couleur inconnue', () => {
    expect(teinteDeCarte(true, lien())).toBeUndefined()
    expect(teinteDeCarte(undefined, lien('jaune'))).toBeUndefined()
    expect(teinteDeCarte(true, lien('chartreuse'))).toBeUndefined()
  })
})
