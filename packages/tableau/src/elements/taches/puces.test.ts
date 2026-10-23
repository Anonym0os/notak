import { describe, expect, it } from 'vitest'
import { type NoeudTexte } from '../../coeur/tableau'
import { regler, docVide, sousTaches } from './liste'
import { assigneDe, attrsAllumes, attrsEteints, attrsHeure, attrsJour, attrsPersonne, attrsVides, decaler, heureDe, optionsRappel, rappelApres, rappelDe, echeanceDe, initiales, jourDe, jourValide, libelleEcheance, personnes, puces, teinteDe } from './puces'

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
  it('sans échéance, rien ne se dessine tant qu’on n’a pas demandé la puce', () => {
    expect(puces({ checked: false }, '2026-10-23')).toEqual([])
    const [p] = puces({ montreEcheance: true }, '2026-10-23')
    expect(p).toMatchObject({ genre: 'echeance', vide: true, retard: false, statut: 'aucun', texte: 'Fixer l’échéance' })
  })

  it('écrit « Pour » devant le jour, et donne à chaque état sa couleur', () => {
    const ajd = '2026-10-23'
    expect(puces({ echeance: '2026-10-23' }, ajd)[0]).toMatchObject({ texte: 'Pour aujourd\'hui', statut: 'aujourdhui' })
    expect(puces({ echeance: '2026-10-24' }, ajd)[0]).toMatchObject({ texte: 'Pour demain', statut: 'futur' })
    expect(puces({ echeance: '2026-12-01' }, ajd)[0]).toMatchObject({ texte: 'Pour le 1 déc.', statut: 'futur' })
    expect(puces({ echeance: '2026-10-20' }, ajd)[0]!.statut).toBe('retard')
    expect(puces({ echeance: '2026-10-20', checked: true }, ajd)[0]!.statut).toBe('fait')
  })

  it('poser une valeur allume la puce, l’effacer la laisse vide, l’éteindre efface tout', () => {
    const maintenant = new Date(2026, 9, 23, 10, 0)
    expect(attrsJour({}, '2026-10-24', maintenant)).toEqual({ echeance: '2026-10-24', montreEcheance: true, rappel: 'jour9' })
    expect(attrsJour({ echeance: '2026-10-24' }, null, maintenant)).toEqual({ echeance: null, heure: null, rappel: null })
    expect(attrsPersonne('Léa')).toEqual({ assigne: 'Léa', montreAssigne: true })
    expect(attrsPersonne(null)).toEqual({ assigne: null })
    expect(attrsVides('assigne')).toEqual({ assigne: null })
    expect(attrsAllumes('echeance')).toEqual({ montreEcheance: true })
    expect(attrsEteints('assigne')).toEqual({ assigne: null, montreAssigne: null })
    expect(attrsEteints('echeance')).toEqual({ echeance: null, heure: null, rappel: null, montreEcheance: null })
  })

  it('une échéance passée est en retard tant que la tâche n’est pas faite', () => {
    expect(puces({ echeance: '2026-10-20' }, '2026-10-23')[0]).toMatchObject({ vide: false, texte: 'Pour le 20 oct.', retard: true })
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
    const [pleine] = puces({ assigne: 'Samy Agher' }, '2026-10-23')
    expect(pleine).toMatchObject({ genre: 'assigne', vide: false, texte: '@Samy Agher', titre: 'Assignée à Samy Agher' })
    expect(puces({ assigne: '   ' }, '2026-10-23')).toEqual([])
    expect(puces({ montreAssigne: true }, '2026-10-23')[0]).toMatchObject({ vide: true, texte: 'Assigner à' })
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

describe('heure et rappel', () => {
  const maintenant = new Date(2026, 9, 23, 10, 0)

  it('lit une heure valable seulement', () => {
    expect(heureDe({ heure: '17:00' })).toBe('17:00')
    expect(heureDe({ heure: '25:00' })).toBeNull()
    expect(heureDe({ heure: 17 })).toBeNull()
    expect(rappelDe({ rappel: '1h' })).toBe('1h')
    expect(rappelDe({ rappel: 'bientôt' })).toBeNull()
  })

  it('propose, sans heure, 9 h le jour même et la veille, tant qu’ils sont à venir', () => {
    expect(optionsRappel('2026-10-25', null, maintenant)).toEqual(['aucun', 'jour9', 'veille9'])
    // Demain, 9 h la veille est déjà passé.
    expect(optionsRappel('2026-10-24', null, maintenant)).toEqual(['aucun', 'jour9'])
    // Aujourd'hui, 9 h est passé ; la veille aussi.
    expect(optionsRappel('2026-10-23', null, maintenant)).toEqual(['aucun'])
    expect(optionsRappel('2026-10-24', null, new Date(2026, 9, 24, 9, 30))).toEqual(['aucun'])
  })

  it('propose, avec une heure, l’échéance, 10 minutes et 1 heure avant', () => {
    expect(optionsRappel('2026-10-25', '17:00', maintenant)).toEqual(['aucun', 'echeance', '10min', '1h', 'jour9', 'veille9'])
    // 9 h le jour même n'est proposé que si l'échéance est à 9 h ou après.
    expect(optionsRappel('2026-10-25', '08:30', maintenant)).not.toContain('jour9')
    // Dans 40 minutes : une heure avant est déjà passé.
    expect(optionsRappel('2026-10-23', '10:40', maintenant)).toEqual(['aucun', 'echeance', '10min'])
  })

  it('rappelApres garde « aucun », garde un rappel valable, sinon prend 9 h le jour même', () => {
    expect(rappelApres('2026-10-24', null, 'aucun', maintenant)).toBe('aucun')
    expect(rappelApres('2026-10-25', null, 'veille9', maintenant)).toBe('veille9')
    expect(rappelApres('2026-10-24', null, null, maintenant)).toBe('jour9')
    // Une heure retire « 9 h le jour même » si l'échéance est tôt : le dernier proposé le remplace.
    expect(rappelApres('2026-10-25', '08:00', 'jour9', maintenant)).toBe('veille9')
    expect(rappelApres('2026-10-23', null, null, maintenant)).toBe('aucun')
  })

  it('fixer l’heure ajuste le rappel ; sans date, rien', () => {
    expect(attrsHeure({ echeance: '2026-10-24' }, '17:00', maintenant)).toEqual({ heure: '17:00', rappel: 'jour9' })
    expect(attrsHeure({ echeance: '2026-10-24', heure: '17:00', rappel: 'aucun' }, null, maintenant)).toEqual({ heure: null, rappel: 'aucun' })
    expect(attrsHeure({}, '17:00', maintenant)).toEqual({})
  })

  it('écrit l’heure entre parenthèses, et la cloche quand un rappel est posé', () => {
    const [p] = puces({ echeance: '2026-10-24', heure: '17:00', rappel: 'jour9' }, '2026-10-23', maintenant)
    expect(p).toMatchObject({ texte: 'Pour demain (17:00)', statut: 'futur', rappel: true })
    expect(puces({ echeance: '2026-10-24', rappel: 'aucun' }, '2026-10-23', maintenant)[0]!.rappel).toBe(false)
  })

  it('avec une heure, le retard commence à l’instant dit ; aujourd’hui passé, on dit depuis quand', () => {
    expect(puces({ echeance: '2026-10-23', heure: '11:00' }, '2026-10-23', maintenant)[0]).toMatchObject({ statut: 'aujourdhui', texte: 'Pour aujourd\'hui (11:00)' })
    const passe = puces({ echeance: '2026-10-23', heure: '08:00' }, '2026-10-23', maintenant)[0]!
    expect(passe.statut).toBe('retard')
    expect(passe.texte).toMatch(/^Pour il y a 2 heures$/)
    // Une tâche faite n'est jamais en retard.
    expect(puces({ echeance: '2026-10-23', heure: '08:00', checked: true }, '2026-10-23', maintenant)[0]).toMatchObject({ statut: 'fait', texte: 'Pour aujourd\'hui (08:00)' })
  })
})
