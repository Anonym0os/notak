import { describe, expect, it } from 'vitest'
import { rangerLesToiles } from './catalogue'

describe('où est rangée chaque toile', () => {
  it('dans celle qui porte sa carte, où qu’on l’ait glissée ; son parent déclaré compte s’il la porte', () => {
    const { dossierDe } = rangerLesToiles([
      { id: 'accueil', parent: null, cartes: ['voyage', 'budget'] },
      { id: 'voyage', parent: 'accueil', cartes: ['japon'] },
      // Créée dans l'accueil, puis glissée dans « Voyage » : l'index la croit encore dans l'accueil.
      { id: 'japon', parent: 'accueil' },
      { id: 'budget', parent: 'accueil' },
      { id: 'idees', parent: 'budget' },
    ])
    expect(dossierDe('japon')).toBe('voyage')
    expect(dossierDe('voyage')).toBe('accueil')
    expect(dossierDe('accueil')).toBeNull()
    // Aucune toile lue ne porte sa carte : son parent déclaré.
    expect(dossierDe('idees')).toBe('budget')
  })

  it('une toile dont la carte est jetée part à la corbeille, avec tout ce qu’elle contient', () => {
    const { cachees } = rangerLesToiles([
      { id: 'accueil', parent: null, cartes: ['garde'], jetees: ['vieux'] },
      { id: 'vieux', parent: 'accueil', cartes: ['dedans'] },
      { id: 'dedans', parent: 'vieux', cartes: ['tout-au-fond'] },
      { id: 'tout-au-fond', parent: 'dedans' },
      { id: 'garde', parent: 'accueil' },
    ])
    expect([...cachees].sort()).toEqual(['dedans', 'tout-au-fond', 'vieux'])
  })

  it('une carte jetée d’un côté mais posée d’un autre : la toile reste là où sa carte vit', () => {
    const { cachees, dossierDe } = rangerLesToiles([
      { id: 'accueil', parent: null, jetees: ['deplacee'] },
      { id: 'autre', parent: 'accueil', cartes: ['deplacee'] },
      { id: 'deplacee', parent: 'accueil' },
    ])
    expect(cachees.has('deplacee')).toBe(false)
    expect(dossierDe('deplacee')).toBe('autre')
  })
})
