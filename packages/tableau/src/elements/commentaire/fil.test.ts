import { describe, expect, test } from 'vitest'
import type { Commentaire, Message } from '../../coeur/tableau'
import { ajouterMessage, dateLisible, filVide, initiales, plier, replier, resoudre, retirerMessage } from './fil'

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

test('la date se dit comme on la dit', () => {
  const maintenant = new Date(2026, 9, 23, 15, 0).getTime()
  expect(dateLisible(maintenant - 10_000, maintenant)).toBe('à l’instant')
  expect(dateLisible(maintenant - 5 * 60_000, maintenant)).toBe('il y a 5 min')
  expect(dateLisible(new Date(2026, 9, 23, 9, 0).getTime(), maintenant)).toBe('il y a 6 h')
  expect(dateLisible(new Date(2026, 9, 22, 23, 0).getTime(), maintenant)).toBe('hier')
  expect(dateLisible(new Date(2026, 9, 12).getTime(), maintenant)).toBe('12 oct.')
  expect(dateLisible(new Date(2025, 0, 3).getTime(), maintenant)).toBe('3 janv. 2025')
})
