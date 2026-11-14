import { definirLangue } from '@notak/tableau'
import { afterEach, describe, expect, it } from 'vitest'
import type { GroupeActivite } from './api'
import { TYPES_NOMMES, nomDuType, phraseDuGroupe } from './phrases'
import { quand } from './Activite'

afterEach(() => definirLangue('fr'))

const groupe = (resume: GroupeActivite['resume'], types: string[]): GroupeActivite => ({
  auteur: { id: 'a', nom: 'Ana', couleur: '#000000' },
  debut: 0,
  fin: 0,
  resume,
  elements: types.map((typeElement, i) => ({ element: `e${i}`, genre: 'cree', typeElement, libelle: '' })),
})

describe('phrases de l’activité', () => {
  it('accorde le type d’élément', () => {
    expect(nomDuType('note', 1)).toBe('une note')
    expect(nomDuType('lien', 1)).toBe('un lien')
    expect(nomDuType('taches', 3)).toBe('3 listes de tâches')
    expect(nomDuType('inconnu', 2)).toBe('2 éléments')
  })

  it('nomme chaque type que l’activité peut citer : une page, une carte mentale, un dessin, plus « un élément »', () => {
    expect(phraseDuGroupe(groupe({ commente: 1 }, ['document']))).toBe('a commenté une page')
    expect(phraseDuGroupe(groupe({ commente: 2 }, ['arbre', 'arbre']))).toBe('a commenté 2 cartes mentales')
    expect(phraseDuGroupe(groupe({ cree: 1 }, ['dessin']))).toBe('a créé un dessin')
    expect(nomDuType('croquis', 3)).toBe('3 croquis')
    expect(nomDuType('lieu', 2)).toBe('2 lieux')
    for (const langue of ['fr', 'en'] as const) {
      definirLangue(langue)
      const element = [nomDuType('', 1), nomDuType('', 2)]
      for (const type of TYPES_NOMMES) {
        for (const n of [1, 2]) {
          const nom = nomDuType(type, n)
          expect(nom, `${langue} ${type} ${n}`).not.toContain('activite.type')
          expect(element, `${langue} ${type} ${n}`).not.toContain(nom)
        }
      }
    }
    definirLangue('en')
    expect(phraseDuGroupe(groupe({ commente: 1 }, ['document']))).toBe('commented on a page')
  })

  it('nomme le type quand il est unique, sinon dit « éléments »', () => {
    expect(phraseDuGroupe(groupe({ cree: 3 }, ['note', 'note', 'note']))).toBe('a créé 3 notes')
    expect(phraseDuGroupe(groupe({ cree: 1, modifie: 2 }, ['note', 'lien']))).toBe('a créé un élément, modifié 2 éléments')
  })

  it('le renommage du tableau ferme la phrase', () => {
    expect(phraseDuGroupe(groupe({ titre: 1 }, ['tableau']))).toBe('a renommé la toile')
    expect(phraseDuGroupe(groupe({}, []))).toBe('')
  })

  it('dit le temps qui passe', () => {
    const t = 10 * 86_400_000
    expect(quand(t - 5_000, t)).toBe('à l’instant')
    expect(quand(t - 5 * 60_000, t)).toBe('il y a 5 min')
    expect(quand(t - 3 * 3_600_000, t)).toBe('il y a 3 h')
  })
})
