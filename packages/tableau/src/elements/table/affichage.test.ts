import { afterEach, describe, expect, test } from 'vitest'
import type { Table } from '../../coeur/tableau'
import { definirLangue } from '../../langue'
import { messageErreur, resumeTable, texteCherchableDeTable, textesAffiches } from './affichage'

afterEach(() => definirLangue('fr'))

const espaces = (v: string) => v.replace(/[\u202f\u00a0]/g, ' ')
const table: Table = {
  type: 'table',
  cellules: [['Prix', 'Qté'], ['1234.5', '2'], ['=A2*B2', '=1/0']],
  formats: [[null, null], [{ type: 'monnaie' }, null], [{ type: 'monnaie' }, null]],
}

describe('ce que la table montre', () => {
  test('le texte formaté selon le type, une formule montre son résultat formaté', () => {
    const t = textesAffiches(table, 'fr')
    expect(espaces(t[1]![0]!)).toBe('1 234,50 €')
    expect(espaces(t[2]![0]!)).toBe('2 469,00 €')
  })
  test('une formule en erreur ne montre rien, et l’erreur a sa phrase', () => {
    expect(textesAffiches(table, 'fr')[2]![1]).toBe('')
    expect(messageErreur('#DIV/0!')).toBe('Division par zéro.')
  })
  test('la recherche lit le texte affiché, le titre compris', () => {
    const lu = texteCherchableDeTable({ ...table, avecTitre: true, titre: 'Devis' }, 'en-US')
    expect(lu).toContain('Devis')
    expect(lu).toContain('€1,234.50')
  })
  test('les nombres et les dates suivent les réglages régionaux, pas la langue de l’interface', () => {
    const d: Table = { type: 'table', cellules: [['45953'], ['0.15']], formats: [[{ type: 'date', date: 'chiffres' }], [{ type: 'pourcent' }]] }
    expect(textesAffiches(d, 'en-GB')[0]![0]).toBe('23/10/2025')
    expect(textesAffiches(d, 'en-US')[0]![0]).toBe('10/23/2025')
    expect(espaces(textesAffiches(d, 'fr-FR')[1]![0]!)).toBe('15,00 %')
  })
  test('le résumé dit la première ligne, ou le titre', () => {
    expect(resumeTable(table)).toBe('Prix | Qté (3 lignes × 2 colonnes)')
    expect(resumeTable({ ...table, avecTitre: true, titre: 'Devis' })).toBe('Devis (3 lignes × 2 colonnes)')
  })
})
