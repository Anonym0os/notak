import { describe, expect, it } from 'vitest'
import { TITRE_MAX, titreValide } from './titreValide'

describe('valider le titre d’un tableau', () => {
  it('retire les espaces de bord et ramène les retours à la ligne à une espace', () => {
    expect(titreValide('  Mon  tableau \n suite ', 'Ancien')).toBe('Mon tableau suite')
  })

  it('un titre vide ou fait d’espaces ne change rien : l’ancien revient', () => {
    expect(titreValide('', 'Ancien')).toBeNull()
    expect(titreValide('   \n ', 'Ancien')).toBeNull()
  })

  it('un titre inchangé n’écrit rien', () => {
    expect(titreValide('Ancien', 'Ancien')).toBeNull()
    expect(titreValide('  Ancien ', 'Ancien')).toBeNull()
  })

  it('coupe à 100 caractères', () => {
    const long = 'a'.repeat(TITRE_MAX + 40)
    expect(titreValide(long, 'x')).toBe('a'.repeat(TITRE_MAX))
    expect(titreValide('b'.repeat(TITRE_MAX), 'x')).toHaveLength(TITRE_MAX)
  })

  it('compte les caractères, pas les moitiés d’émoji', () => {
    const titre = titreValide('🙂'.repeat(TITRE_MAX + 5), 'x')!
    expect(Array.from(titre)).toHaveLength(TITRE_MAX)
  })
})
