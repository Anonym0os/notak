import { describe, expect, it } from 'vitest'
import type { TacheDeLOutil } from '../api'
import { type EtatPanneau, type LigneTache, avecTache, enRetard, grouper, initiales, placer, sansTache } from './modele'

const tache = (id: string, champs: Partial<LigneTache> = {}): LigneTache => ({
  id,
  titre: id,
  fait: false,
  enRetard: false,
  echeance: null,
  recurrente: false,
  projet: null,
  personnes: [],
  lien: null,
  ...champs,
})

const panneau = (taches: LigneTache[]): EtatPanneau => ({
  disponible: true,
  outil: 'Silak',
  taches,
  total: taches.length,
  complet: true,
  aujourdhui: '2026-11-23',
  ecrire: true,
  lien: null,
})

const ids = (taches: readonly TacheDeLOutil[]) => taches.map((x) => x.id)

describe('le panneau des tâches, en fonctions pures', () => {
  it('range les datées, les retards sans jour compris, avant celles sans date, dans l’ordre de l’outil', () => {
    const { datees, sansDate } = grouper([tache('limite', { enRetard: true }), tache('demain', { echeance: '2026-11-24' }), tache('libre'), tache('autre')])
    expect([ids(datees), ids(sansDate)]).toEqual([
      ['limite', 'demain'],
      ['libre', 'autre'],
    ])
  })

  it('dit deux initiales au plus, accents et traits d’union compris', () => {
    expect(['Samy Agher', 'Jean-Baptiste de La Tour', 'Fram', 'élise durand', '  '].map(initiales)).toEqual(['SA', 'JT', 'F', 'ÉD', '?'])
  })

  it('compte les retards des tâches ouvertes seulement', () => {
    expect(enRetard([tache('a', { enRetard: true }), tache('b', { enRetard: true, fait: true }), tache('c')])).toBe(1)
  })

  it('range une tâche neuve où l’outil la mettrait', () => {
    const liste = [tache('retard', { enRetard: true, echeance: '2026-11-20' }), tache('mardi', { echeance: '2026-11-24' }), tache('jeudi', { echeance: '2026-11-26' }), tache('libre')]
    expect(ids(placer(liste, tache('mercredi', { echeance: '2026-11-25' })))).toEqual(['retard', 'mardi', 'mercredi', 'jeudi', 'libre'])
    expect(ids(placer(liste, tache('mardi bis', { echeance: '2026-11-24' })))).toEqual(['retard', 'mardi', 'mardi bis', 'jeudi', 'libre'])
    expect(ids(placer(liste, tache('plus tard', { echeance: '2027-01-04' })))).toEqual(['retard', 'mardi', 'jeudi', 'plus tard', 'libre'])
    expect(ids(placer(liste, tache('sans jour')))).toEqual(['retard', 'mardi', 'jeudi', 'libre', 'sans jour'])
  })

  it('remplace une tâche à sa place, celle d’un ajout sous l’identifiant du geste, et retire un ajout refusé', () => {
    const p = panneau([tache('a', { echeance: '2026-11-24' }), tache('b')])
    expect(avecTache(p, tache('b', { fait: true })).taches[1]).toMatchObject({ id: 'b', fait: true })
    const ajoutee = avecTache(p, tache('geste-1', { attend: 'ajouter' }))
    expect([ids(ajoutee.taches), ajoutee.total]).toEqual([['a', 'b', 'geste-1'], 3])
    const rendue = avecTache(ajoutee, tache('t-9', { personnes: ['Samy Agher'] }), 'geste-1')
    expect([ids(rendue.taches), rendue.total]).toEqual([['a', 'b', 't-9'], 3])
    const refusee = sansTache(ajoutee, 'geste-1')
    expect([ids(refusee.taches), refusee.total]).toEqual([['a', 'b'], 2])
  })
})
