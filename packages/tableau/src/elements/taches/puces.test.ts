import { describe, expect, it } from 'vitest'
import { type NoeudTexte } from '../../coeur/tableau'
import { regler, docVide, sousTaches } from './liste'
import { assigneDe, decaler, echeanceDe, initiales, jourDe, jourValide, libelleEcheance, personnes, puces, teinteDe } from './puces'

describe('jours', () => {
  it('écrit le jour de la machine AAAA-MM-JJ', () => {
    expect(jourDe(new Date(2026, 9, 3))).toBe('2026-10-03')
  })

  it('décale à travers les mois et les années', () => {
    expect(decaler('2026-10-31', 1)).toBe('2026-11-01')
    expect(decaler('2026-01-01', -1)).toBe('2025-12-31')
    expect(decaler('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('refuse un jour qui n’existe pas', () => {
    expect(jourValide('2026-02-30')).toBe(false)
    expect(jourValide('26-10-03')).toBe(false)
    expect(jourValide(null)).toBe(false)
    expect(jourValide('2026-10-03')).toBe(true)
  })
})

describe('libelleEcheance', () => {
  const ajd = '2026-10-23'
  it('nomme hier, aujourd’hui et demain', () => {
    expect(libelleEcheance('2026-10-22', ajd)).toBe('Hier')
    expect(libelleEcheance('2026-10-23', ajd)).toBe("Aujourd'hui")
    expect(libelleEcheance('2026-10-24', ajd)).toBe('Demain')
  })

  it('écrit le jour et le mois, avec l’année si elle change', () => {
    expect(libelleEcheance('2026-12-01', ajd)).toBe('1 déc.')
    expect(libelleEcheance('2027-03-12', ajd)).toBe('12 mars 2027')
  })
})

describe('puces', () => {
  it('sans échéance, la puce est vide', () => {
    const [p] = puces({ checked: false }, '2026-10-23')
    expect(p).toMatchObject({ genre: 'echeance', vide: true, retard: false })
  })

  it('une échéance passée est en retard tant que la tâche n’est pas faite', () => {
    expect(puces({ echeance: '2026-10-20' }, '2026-10-23')[0]).toMatchObject({ vide: false, texte: '20 oct.', retard: true })
    expect(puces({ echeance: '2026-10-20', checked: true }, '2026-10-23')[0]!.retard).toBe(false)
    expect(puces({ echeance: '2026-10-23' }, '2026-10-23')[0]!.retard).toBe(false)
  })

  it('ignore une échéance illisible', () => {
    expect(echeanceDe({ echeance: 'demain' })).toBeNull()
  })
})

describe('personne assignée', () => {
  it('prend les initiales d’un ou de plusieurs mots', () => {
    expect(initiales('samy')).toBe('S')
    expect(initiales('Samy Agher')).toBe('SA')
    expect(initiales('Jean-Pierre de la Fontaine')).toBe('JF')
    expect(initiales('  élodie  ')).toBe('É')
  })

  it('tire une couleur du nom, la même à chaque fois, sans tenir compte de la casse', () => {
    expect(teinteDe('Samy')).toBe(teinteDe('samy'))
    expect(teinteDe('Samy')).toMatch(/^hsl\(\d+ 45% 40%\)$/)
  })

  it('une puce pleine montre les initiales, une puce vide invite à assigner', () => {
    const [, pleine] = puces({ assigne: 'Samy Agher' }, '2026-10-23')
    expect(pleine).toMatchObject({ genre: 'assigne', vide: false, texte: 'SA', titre: 'Assignée à Samy Agher' })
    expect(pleine!.teinte).toBeDefined()
    expect(puces({ assigne: '   ' }, '2026-10-23')[1]).toMatchObject({ vide: true, texte: 'Assigner' })
    expect(assigneDe({ assigne: ' Léa ' })).toBe('Léa')
  })

  it('propose soi d’abord, puis les autres, chaque nom une fois', () => {
    const liste = personnes({ nom: 'Samy' }, [{ nom: 'Léa' }, { nom: 'samy' }, { nom: ' ' }, { nom: 'Léa' }])
    expect(liste.map((p) => p.nom)).toEqual(['Samy', 'Léa'])
    expect(personnes(undefined, [])).toEqual([])
  })
})

describe('regler', () => {
  const doc: NoeudTexte = {
    type: 'doc',
    content: [
      {
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] },
          { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph' }, { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }] }] },
        ],
      },
    ],
  }

  it('pose un attribut sur la tâche visée, à n’importe quel niveau', () => {
    const apres = regler(doc, [1, 0], { echeance: '2026-10-30' })
    expect(sousTaches(sousTaches(apres)[1]!)[0]!.attrs).toEqual({ checked: false, echeance: '2026-10-30' })
    expect(sousTaches(apres)[0]!.attrs).toEqual({ checked: false })
  })

  it('le retire avec null, sans toucher au reste', () => {
    const avec = regler(doc, [0], { echeance: '2026-10-30' })
    expect(sousTaches(regler(avec, [0], { echeance: null }))[0]!.attrs).toEqual({ checked: false })
  })

  it('pose plusieurs attributs d’un coup, et un nom', () => {
    const apres = regler(doc, [0], { echeance: '2026-10-30', assigne: 'Léa' })
    expect(sousTaches(apres)[0]!.attrs).toEqual({ checked: false, echeance: '2026-10-30', assigne: 'Léa' })
  })

  it('un chemin inconnu ne change rien', () => {
    expect(regler(doc, [9], { echeance: '2026-10-30' })).toBe(doc)
    expect(regler(docVide(), [], { echeance: '2026-10-30' })).toEqual(docVide())
  })
})
