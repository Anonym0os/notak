import type { FormatDate } from '../../coeur/tableau'
import { describe, expect, test } from 'vitest'
import { COULEURS_TEXTE, FONDS_CELLULE, SURLIGNAGES, afficher, alignementDe, deduireType, peutPrendreType, saisir } from './formats'

/** Les espaces insécables des milliers deviennent des espaces simples, pour écrire les attentes. */
const s = (v: string) => v.replace(/[  ]/g, ' ')

describe('afficher', () => {
  test('sans type, le texte tel quel', () => {
    expect(afficher('abc', null, 'fr')).toBe('abc')
    expect(afficher('12.5', { gras: true }, 'fr')).toBe('12.5')
    expect(afficher('x', { type: 'texte' }, 'fr')).toBe('x')
  })
  test('nombre : décimales autant que tapé, milliers selon la langue', () => {
    expect(s(afficher('1234.50', { type: 'nombre' }, 'fr'))).toBe('1 234,50')
    expect(afficher('1234.5', { type: 'nombre' }, 'en')).toBe('1,234.5')
    expect(afficher('1234', { type: 'nombre' }, 'en')).toBe('1,234')
    expect(afficher('1234.5', { type: 'nombre', sansMilliers: true }, 'en')).toBe('1234.5')
    expect(afficher('3.14159', { type: 'nombre', decimales: 2 }, 'fr')).toBe('3,14')
    expect(afficher('0.30000000000000004', { type: 'nombre' }, 'en')).toBe('0.3')
  })
  test('nombre : une valeur qui n’en est pas un reste telle quelle', () => {
    expect(afficher('abc', { type: 'nombre' }, 'fr')).toBe('abc')
    expect(afficher('', { type: 'nombre' }, 'fr')).toBe('')
  })
  test('pourcentage : 0,15 devient 15,00 %', () => {
    expect(s(afficher('0.15', { type: 'pourcent' }, 'fr'))).toBe('15,00 %')
    expect(afficher('0.15', { type: 'pourcent' }, 'en')).toBe('15.00%')
    expect(s(afficher('0.1234', { type: 'pourcent', decimales: 0 }, 'fr'))).toBe('12 %')
  })
  test('monnaie : euro par défaut, deux décimales', () => {
    expect(s(afficher('1234.5', { type: 'monnaie' }, 'fr'))).toBe('1 234,50 €')
    expect(afficher('1234.5', { type: 'monnaie' }, 'en')).toBe('€1,234.50')
    expect(afficher('9', { type: 'monnaie', devise: 'USD' }, 'en')).toBe('$9.00')
  })
  test('monnaie : code, nom, comptable', () => {
    expect(s(afficher('9', { type: 'monnaie', affichageDevise: 'code' }, 'fr'))).toBe('9,00 EUR')
    expect(s(afficher('9', { type: 'monnaie', affichageDevise: 'nom' }, 'fr'))).toBe('9,00 euros')
    expect(afficher('-9', { type: 'monnaie', comptable: true }, 'en')).toBe('(€9.00)')
  })
  test('case : rien', () => {
    expect(afficher('true', { type: 'case' }, 'fr')).toBe('')
  })
})

describe('afficher une date', () => {
  const d = (serie: string, date: FormatDate) => afficher(serie, { type: 'date', date, heure: 'aucune' }, 'fr')
  // 1er février 2006 = 38749
  test('les formats du relevé', () => {
    expect(d('38749', 'long')).toBe('1 février 2006')
    expect(d('38749', 'court')).toBe('1 févr. 2006')
    expect(d('38749', 'chiffres')).toBe('01/02/2006')
    expect(d('38749', 'chiffresCourts')).toBe('01/02/06')
    expect(d('38749', 'tirets')).toBe('01-02-2006')
    expect(d('38749', 'jour')).toBe('mercredi 1 février 2006')
  })
  test('une date ISO tapée s’affiche aussi', () => {
    expect(d('2006-02-01', 'chiffres')).toBe('01/02/2006')
  })
  test('le numéro de série : 1 est le 1er janvier 1900, 60 le faux 29 février', () => {
    expect(d('1', 'chiffres')).toBe('01/01/1900')
    expect(d('59', 'chiffres')).toBe('28/02/1900')
    expect(d('60', 'chiffres')).toBe('29/02/1900')
    expect(d('61', 'chiffres')).toBe('01/03/1900')
    expect(d('45658', 'chiffres')).toBe('01/01/2025')
  })
  test('l’heure : 24 h, 12 h, secondes, parenthèses', () => {
    expect(afficher('38749.5', { type: 'date', date: 'chiffres', heure: '24h' }, 'fr')).toBe('01/02/2006 12:00')
    expect(afficher('38749.75', { type: 'date', date: 'chiffres', heure: '24hs' }, 'fr')).toBe('01/02/2006 18:00:00')
    expect(s(afficher('38749.75', { type: 'date', date: 'chiffres', heure: '12h' }, 'en'))).toBe('2/1/2006 6:00 PM')
    expect(afficher('38749.5', { type: 'date', date: 'chiffres', heure: '24h', heureEntreParentheses: true }, 'fr')).toBe('01/02/2006 (12:00)')
    expect(afficher('38749.5', { type: 'date', date: 'aucun', heure: '24h' }, 'fr')).toBe('12:00')
  })
  test('date et heure toutes deux à aucun : chiffres', () => {
    expect(afficher('38749', { type: 'date', date: 'aucun', heure: 'aucune' }, 'fr')).toBe('01/02/2006')
  })
  test('une valeur qui n’est pas une date reste telle quelle', () => {
    expect(afficher('bonjour', { type: 'date' }, 'fr')).toBe('bonjour')
  })
})

describe('deduireType', () => {
  test('nombre selon la langue', () => {
    expect(deduireType('12,5', 'fr')).toMatchObject({ type: 'nombre', valeur: '12.5' })
    expect(deduireType('1 234,50', 'fr')).toMatchObject({ type: 'nombre', valeur: '1234.50' })
    expect(deduireType('1 234', 'fr')).toMatchObject({ type: 'nombre', valeur: '1234' })
    expect(deduireType('12.5', 'fr')).toMatchObject({ type: 'nombre', valeur: '12.5' })
    expect(deduireType('1,234.5', 'en')).toMatchObject({ type: 'nombre', valeur: '1234.5' })
    expect(deduireType('12,5', 'en')).toBeNull()
    expect(deduireType('-7', 'fr')).toMatchObject({ type: 'nombre', valeur: '-7' })
  })
  test('ce qui n’est pas un nombre', () => {
    expect(deduireType('abc', 'fr')).toBeNull()
    expect(deduireType('', 'fr')).toBeNull()
    expect(deduireType('=A1+1', 'fr')).toBeNull()
    expect(deduireType('1 2', 'fr')).toBeNull()
    expect(deduireType('1234567890123456', 'fr')).toBeNull()
  })
  test('pourcentage', () => {
    expect(deduireType('15 %', 'fr')).toMatchObject({ type: 'pourcent', valeur: '0.15' })
    expect(deduireType('15%', 'en')).toMatchObject({ type: 'pourcent', valeur: '0.15' })
    expect(deduireType('7,1 %', 'fr')).toMatchObject({ type: 'pourcent', valeur: '0.071' })
    expect(deduireType('100 %', 'fr')).toMatchObject({ type: 'pourcent', valeur: '1' })
    expect(deduireType('0,5 %', 'fr')).toMatchObject({ valeur: '0.005' })
    expect(deduireType('12,345 %', 'fr')?.options.decimales).toBe(3)
  })
  test('monnaie : symbole devant ou derrière', () => {
    expect(deduireType('12,50 €', 'fr')).toMatchObject({ type: 'monnaie', valeur: '12.50', options: { devise: 'EUR' } })
    expect(deduireType('12,50€', 'fr')).toMatchObject({ type: 'monnaie', options: { devise: 'EUR' } })
    expect(deduireType('$1,234.5', 'en')).toMatchObject({ type: 'monnaie', valeur: '1234.5', options: { devise: 'USD' } })
    expect(deduireType('£3', 'fr')).toMatchObject({ options: { devise: 'GBP' } })
    expect(deduireType('500 ¥', 'fr')).toMatchObject({ options: { devise: 'JPY' } })
    expect(deduireType('99 kr', 'fr')).toMatchObject({ options: { devise: 'SEK' } })
    expect(deduireType('CHF 40', 'fr')).toMatchObject({ options: { devise: 'CHF' } })
    expect(deduireType('3000 ₩', 'fr')).toMatchObject({ options: { devise: 'KRW' } })
    expect(deduireType('-5 €', 'fr')).toMatchObject({ valeur: '-5' })
    expect(deduireType('-€5', 'fr')).toMatchObject({ valeur: '-5' })
    expect(deduireType('12 xyz', 'fr')).toBeNull()
  })
  test('date : les formats du relevé', () => {
    expect(deduireType('01/02/2006', 'fr')).toMatchObject({ type: 'date', valeur: '38749', options: { date: 'chiffres', heure: 'aucune' } })
    expect(deduireType('01/02/06', 'fr')).toMatchObject({ valeur: '38749', options: { date: 'chiffresCourts' } })
    expect(deduireType('2006-02-01', 'fr')).toMatchObject({ valeur: '38749' })
    expect(deduireType('1 févr. 2006', 'fr')).toMatchObject({ valeur: '38749', options: { date: 'court' } })
    expect(deduireType('1 février 2006', 'fr')).toMatchObject({ valeur: '38749', options: { date: 'long' } })
    expect(deduireType('mercredi 1 févr. 2006', 'fr')).toMatchObject({ valeur: '38749', options: { date: 'jour' } })
    expect(deduireType('01-02-2006', 'fr')).toMatchObject({ valeur: '38749', options: { date: 'tirets' } })
    expect(deduireType('29/02/1900', 'fr')).toMatchObject({ valeur: '60' })
  })
  test('date en anglais : le mois d’abord', () => {
    expect(deduireType('02/01/2006', 'en')).toMatchObject({ valeur: '38749' })
    expect(deduireType('Feb 1, 2006', 'en')).toMatchObject({ valeur: '38749' })
  })
  test('date avec heure', () => {
    expect(deduireType('01/02/2006 12:00', 'fr')).toMatchObject({ valeur: '38749.5', options: { heure: '24h' } })
    expect(deduireType('2006-02-01T18:00:00', 'fr')).toMatchObject({ valeur: '38749.75', options: { heure: '24hs' } })
    expect(deduireType('01/02/2006 25:00', 'fr')).toBeNull()
  })
  test('une date impossible n’en est pas une', () => {
    expect(deduireType('31/02/2006', 'fr')).toBeNull()
    expect(deduireType('29/02/2023', 'fr')).toBeNull()
    expect(deduireType('29/02/2024', 'fr')).not.toBeNull()
    expect(deduireType('01/01/1899', 'fr')).toBeNull()
  })
})

describe('saisir', () => {
  test('type vide : le type se déduit, le texte se normalise', () => {
    expect(saisir(null, '1 234,5', 'fr')).toEqual({ texte: '1234.5', format: { type: 'nombre' } })
    expect(saisir({ gras: true }, '15 %', 'fr')).toEqual({ texte: '0.15', format: { gras: true, type: 'pourcent' } })
    expect(saisir(null, 'bonjour', 'fr')).toEqual({ texte: 'bonjour', format: null })
  })
  test('Texte et Case ne sont jamais écrasés', () => {
    expect(saisir({ type: 'texte' }, '12', 'fr')).toEqual({ texte: '12', format: { type: 'texte' } })
    expect(saisir({ type: 'case' }, '15 %', 'fr')).toEqual({ texte: '15 %', format: { type: 'case' } })
  })
  test('pourcentage, monnaie et date remplacent le type existant', () => {
    const r = saisir({ type: 'nombre', decimales: 3, gras: true }, '12 €', 'fr')
    expect(r).toEqual({ texte: '12', format: { gras: true, type: 'monnaie', devise: 'EUR' } })
    expect(saisir({ type: 'monnaie', devise: 'USD' }, '01/02/2006', 'fr').format).toMatchObject({ type: 'date', date: 'chiffres' })
    expect(saisir({ type: 'nombre' }, '5 %', 'fr').format?.type).toBe('pourcent')
  })
  test('un nombre ne remplace ni monnaie ni pourcentage, mais une date retombe en nombre', () => {
    expect(saisir({ type: 'monnaie', devise: 'GBP' }, '12,5', 'fr')).toEqual({ texte: '12.5', format: { type: 'monnaie', devise: 'GBP' } })
    expect(saisir({ type: 'date', date: 'long', gras: true }, '42', 'fr')).toEqual({ texte: '42', format: { gras: true, type: 'nombre' } })
  })
  test('rien de reconnu : retour à Auto', () => {
    expect(saisir({ type: 'nombre', decimales: 2, italique: true }, 'abc', 'fr')).toEqual({ texte: 'abc', format: { italique: true } })
    expect(saisir({ type: 'date' }, 'abc', 'fr')).toEqual({ texte: 'abc', format: null })
  })
  test('vide et formules ne changent rien', () => {
    expect(saisir({ type: 'nombre' }, '', 'fr')).toEqual({ texte: '', format: { type: 'nombre' } })
    expect(saisir({ type: 'nombre' }, '=A1', 'fr')).toEqual({ texte: '=A1', format: { type: 'nombre' } })
  })
})

describe('peutPrendreType', () => {
  test('Texte et Auto toujours', () => {
    expect(peutPrendreType('abc', 'texte')).toBe(true)
    expect(peutPrendreType('abc', undefined)).toBe(true)
  })
  test('Case : vide, true ou false', () => {
    expect(peutPrendreType('', 'case')).toBe(true)
    expect(peutPrendreType('true', 'case')).toBe(true)
    expect(peutPrendreType('abc', 'case')).toBe(false)
  })
  test('nombre, monnaie, pourcentage : numérique', () => {
    for (const type of ['nombre', 'monnaie', 'pourcent'] as const) {
      expect(peutPrendreType('12.5', type)).toBe(true)
      expect(peutPrendreType('abc', type)).toBe(false)
    }
    expect(peutPrendreType('=A1+1', 'nombre')).toBe(true)
  })
  test('date : un numéro de série ou une date lisible', () => {
    expect(peutPrendreType('38749', 'date')).toBe(true)
    expect(peutPrendreType('01/02/2006', 'date')).toBe(true)
    expect(peutPrendreType('bonjour', 'date')).toBe(false)
  })
})

describe('alignementDe', () => {
  test('par type, l’alignement choisi gagne', () => {
    expect(alignementDe(null)).toBe('gauche')
    expect(alignementDe({ type: 'nombre' })).toBe('droite')
    expect(alignementDe({ type: 'date' })).toBe('droite')
    expect(alignementDe({ type: 'case' })).toBe('centre')
    expect(alignementDe({ type: 'texte' })).toBe('gauche')
    expect(alignementDe({ type: 'nombre', alignement: 'centre' })).toBe('centre')
  })
  test('une formule sans type s’aligne à gauche', () => {
    expect(alignementDe({ type: 'nombre' }, true)).toBe('gauche')
    expect(alignementDe({ type: 'nombre', alignement: 'droite' }, true)).toBe('droite')
  })
})

describe('les couleurs', () => {
  test('les fonds du relevé, avec l’en-tête', () => {
    // « Aucune » vient avant, puis le gris d'en-tête, puis les dix couleurs.
    expect(FONDS_CELLULE).toHaveLength(11)
    expect(FONDS_CELLULE[0]?.valeur).toBe('entete')
    expect(FONDS_CELLULE.every((c) => c.valeur === 'entete' || /^#[0-9a-f]{6}$/.test(c.valeur))).toBe(true)
  })
  test('couleurs de texte et surlignages en #rrggbb', () => {
    expect([...COULEURS_TEXTE, ...SURLIGNAGES].every((c) => /^#[0-9a-f]{6}$/.test(c.valeur))).toBe(true)
    expect(SURLIGNAGES).toHaveLength(6)
  })
})

describe('les réglages régionaux', () => {
  test('une date en chiffres se lit le jour d’abord en en-GB, le mois d’abord en en-US', () => {
    expect(deduireType('23/10/2026', 'en-GB')?.type).toBe('date')
    expect(deduireType('23/10/2026', 'en-US')).toBeNull()
    expect(deduireType('10/23/2026', 'en-US')?.type).toBe('date')
  })
  test('la virgule décimale suit la locale', () => {
    expect(deduireType('12,5', 'de-DE')?.valeur).toBe('12.5')
    expect(deduireType('1,234.5', 'en-GB')?.valeur).toBe('1234.5')
  })
})
