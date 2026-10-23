import { describe, expect, test } from 'vitest'
import type { Commentaire, Message } from '../../coeur/tableau'
import { ajouterMessage, dateLisible, filVide, initiales, modifierMessage, morceauxDeTexte, plier, prenom, replier, resoudre, retirerMessage } from './fil'

const auteur = { id: 'a', nom: 'Samy' }
const msg = (id: string, texte = 'Bonjour'): Message => ({ id, auteur, date: 0, texte })
const vide: Commentaire = { type: 'commentaire', messages: [] }

describe('le fil', () => {
  test('un message s’ajoute, sans ses blancs ; un message vide ne change rien', () => {
    const c = ajouterMessage(vide, msg('1', '  Salut  '))
    expect(c.messages.map((m) => m.texte)).toEqual(['Salut'])
    expect(ajouterMessage(c, msg('2', '   '))).toBe(c)
  })

  test('le même message réécrit remplace le précédent (le brouillon qu’on tape)', () => {
    const c = ajouterMessage(ajouterMessage(vide, msg('1', 'Sa')), msg('1', 'Salut'))
    expect(c.messages).toHaveLength(1)
    expect(c.messages[0]!.texte).toBe('Salut')
  })

  test('répondre rouvre un fil résolu ; résoudre et rouvrir', () => {
    const r = resoudre(ajouterMessage(vide, msg('1')), true)
    expect(r.resolu).toBe(true)
    expect(ajouterMessage(r, msg('2')).resolu).toBeUndefined()
    expect('resolu' in resoudre(r, false)).toBe(false)
  })

  test('replier et déplier ; répondre déplie', () => {
    const r = plier(ajouterMessage(vide, msg('1')), true)
    expect(r.replie).toBe(true)
    expect('replie' in plier(r, false)).toBe(false)
    expect(ajouterMessage(r, msg('2')).replie).toBeUndefined()
  })

  test('un fil sans message est vide ; avec un message, il reste', () => {
    expect(filVide(vide)).toBe(true)
    expect(filVide(ajouterMessage(vide, msg('1')))).toBe(false)
    expect(filVide(retirerMessage(ajouterMessage(vide, msg('1')), '1'))).toBe(true)
  })

  test('retirer un message', () => {
    expect(retirerMessage(ajouterMessage(vide, msg('1')), '1').messages).toEqual([])
  })

  test('un long fil se replie sur le premier et le dernier', () => {
    const ms = ['1', '2', '3', '4', '5'].map((i) => msg(i))
    expect(replier(ms)).toEqual({ montres: [ms[0], ms[4]], caches: 3 })
    expect(replier(ms.slice(0, 3)).caches).toBe(0)
  })
})

test('initiales', () => {
  expect(initiales('Samy Agher')).toBe('SA')
  expect(initiales('geoffrey')).toBe('GE')
  expect(initiales('  ')).toBe('?')
  expect(initiales('Élodie de la Tour')).toBe('ÉT')
})

test('la date se dit comme chez Milanote', () => {
  const maintenant = new Date(2026, 9, 23, 15, 0).getTime()
  expect(dateLisible(maintenant - 10_000, maintenant)).toBe('à l’instant')
  expect(dateLisible(maintenant - 5 * 60_000, maintenant)).toBe('il y a 5 min')
  expect(dateLisible(maintenant - 6 * 3600_000, maintenant)).toBe('il y a 6 h')
  expect(dateLisible(maintenant - 26 * 3600_000, maintenant)).toBe('il y a 1 jour')
  expect(dateLisible(maintenant - 3 * 86_400_000, maintenant)).toBe('il y a 3 jours')
  expect(dateLisible(maintenant - 8 * 86_400_000, maintenant)).toBe('il y a 1 semaine')
  expect(dateLisible(maintenant - 28 * 86_400_000, maintenant)).toBe('il y a 4 semaines')
  expect(dateLisible(new Date(2026, 8, 12).getTime(), maintenant)).toBe('12 sept. 2026')
  expect(dateLisible(new Date(2025, 0, 3).getTime(), maintenant)).toBe('3 janv. 2025')
})

test('le prénom est le premier mot du nom', () => {
  expect(prenom('Samy Agher')).toBe('Samy')
  expect(prenom('  ')).toBe('Quelqu’un')
})

test('modifier un message garde les autres et refuse un texte vide', () => {
  const c = ajouterMessage(ajouterMessage(vide, msg('1')), msg('2'))
  expect(modifierMessage(c, '2', ' Corrigé ').messages.map((m) => m.texte)).toEqual([c.messages[0]!.texte, 'Corrigé'])
  expect(modifierMessage(c, '2', '  ')).toBe(c)
})

test('les adresses d’un texte deviennent des liens, sans la ponctuation finale', () => {
  expect(morceauxDeTexte('Voir https://exemple.fr/a?b=1, puis http://x.org.')).toEqual([
    { texte: 'Voir ' },
    { texte: 'https://exemple.fr/a?b=1', lien: 'https://exemple.fr/a?b=1' },
    { texte: ', puis ' },
    { texte: 'http://x.org', lien: 'http://x.org' },
    { texte: '.' },
  ])
  expect(morceauxDeTexte('rien')).toEqual([{ texte: 'rien' }])
})
