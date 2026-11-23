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

  it('un raccourci montre la toile aussi là où il est posé, sans la ranger ailleurs', () => {
    const { dossierDe, raccourcisVers } = rangerLesToiles([
      { id: 'clients', parent: null, cartes: ['dupont', 'atelier', 'refonte'] },
      { id: 'dupont', parent: 'clients', cartes: ['refonte'] },
      { id: 'atelier', parent: 'clients', raccourcis: ['refonte', 'refonte'] },
      // Le raccourci posé là où elle est déjà rangée ne la montre pas deux fois.
      { id: 'refonte', parent: 'dupont', raccourcis: ['refonte'] },
    ])
    expect(dossierDe('refonte')).toBe('dupont')
    expect(raccourcisVers('refonte')).toEqual(['atelier'])
    expect(raccourcisVers('dupont')).toEqual([])
  })

  it('ni la toile, ni le raccourci à la corbeille ; ni une toile qu’on ne lit pas', () => {
    const { raccourcisVers } = rangerLesToiles([
      { id: 'accueil', parent: null, cartes: ['a', 'b', 'projet'], jetees: ['jete'] },
      { id: 'a', parent: 'accueil', raccourcis: ['projet', 'cache', 'jete'] },
      { id: 'b', parent: 'accueil', raccourcis: ['projet'] },
      { id: 'jete', parent: 'accueil', raccourcis: ['projet'] },
      { id: 'projet', parent: 'accueil' },
    ])
    // « jete » est à la corbeille : son raccourci ne montre plus rien ; « cache » n'est pas parmi ce qu'on lit.
    expect(raccourcisVers('projet')).toEqual(['a', 'b'])
    expect(raccourcisVers('cache')).toEqual([])
    expect(raccourcisVers('jete')).toEqual([])
  })
})
