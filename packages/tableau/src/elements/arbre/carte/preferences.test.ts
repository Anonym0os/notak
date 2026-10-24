// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { basculerFavori, cleFavori, modifierPreferences, nomSuivant, preferences, relirePreferences } from './preferences'

beforeEach(() => {
  localStorage.clear()
  relirePreferences()
})

describe('les préférences de l’onglet Carte', () => {
  it('un favori se pose et se retire', () => {
    basculerFavori('ocean', '#0b6e99')
    basculerFavori('foret')
    expect(preferences().favoris).toEqual(['ocean|#0b6e99', 'foret|'])
    expect(cleFavori('foret')).toBe('foret|')
    basculerFavori('ocean', '#0b6e99')
    expect(preferences().favoris).toEqual(['foret|'])
  })

  it('elles survivent à un rechargement de la page', () => {
    modifierPreferences((p) => ({ ...p, policesRecentes: ['Georgia'], couleursPerso: [{ id: 'perso:1', nom: 'A', palette: ['#111111'] }], ongletThemes: 'perso' }))
    relirePreferences()
    expect(preferences()).toMatchObject({ policesRecentes: ['Georgia'], ongletThemes: 'perso' })
    expect(preferences().couleursPerso).toHaveLength(1)
  })

  it('un stockage abîmé ne casse rien', () => {
    localStorage.setItem('notak.arbre.carte', '{pas du json')
    relirePreferences()
    expect(preferences().favoris).toEqual([])
    localStorage.setItem('notak.arbre.carte', JSON.stringify({ favoris: 3, couleursPerso: [{ nom: 4 }], themesPerso: 'x' }))
    relirePreferences()
    expect(preferences().favoris).toEqual([])
    expect(preferences().couleursPerso).toEqual([])
    expect(preferences().themesPerso).toEqual([])
  })

  it('le nom d’un thème neuf : « Personnalisé », puis le numéro qui suit le plus grand déjà pris', () => {
    expect(nomSuivant('Personnalisé', [])).toBe('Personnalisé')
    expect(nomSuivant('Personnalisé', ['Personnalisé'])).toBe('Personnalisé 2')
    expect(nomSuivant('Personnalisé', ['Personnalisé', 'Personnalisé 2', 'Personnalisé 7'])).toBe('Personnalisé 8')
    expect(nomSuivant('Personnalisé', ['Autre'])).toBe('Personnalisé')
  })
})
