import { describe, expect, test } from 'vitest'
import {
  FONCTIONS,
  citerReferences,
  dateVersSerie,
  decalerFormule,
  evaluerTable,
  fermerParentheses,
  lireReference,
  modeCitation,
  nomCellule,
  nomColonne,
  requeteAutocompletion,
  serieVersDate,
  suggererFonctions,
  translaterFormule,
  typeDuResultat,
  type Valeur,
} from './formules'

/** Évalue une formule seule, dans une table dont `donnees` remplit les premières lignes. */
const f = (formule: string, ...donnees: string[][]) => {
  const grille = [...donnees, [formule]]
  const r = evaluerTable(grille, () => new Date(2024, 0, 15, 12, 0, 0))
  return r[donnees.length]![0]!
}
const v = (formule: string, ...donnees: string[][]) => f(formule, ...donnees).valeur
const e = (formule: string, ...donnees: string[][]) => f(formule, ...donnees).erreur

describe('les noms de cellules', () => {
  test('nomColonne', () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(nomColonne)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA'])
  })
  test('nomCellule', () => expect(nomCellule(2, 1)).toBe('B3'))
  test('lireReference relative', () => {
    expect(lireReference('B3')).toEqual({ ligne: 2, colonne: 1, absLigne: false, absColonne: false })
  })
  test('lireReference absolue', () => {
    expect(lireReference('$AA$10')).toEqual({ ligne: 9, colonne: 26, absLigne: true, absColonne: true })
    expect(lireReference('c$1')).toEqual({ ligne: 0, colonne: 2, absLigne: true, absColonne: false })
  })
  test('lireReference refuse le reste', () => {
    expect(lireReference('A0')).toBeNull()
    expect(lireReference('12')).toBeNull()
    expect(lireReference('SUM')).toBeNull()
  })
})

describe('les cellules qui ne sont pas des formules', () => {
  const r = evaluerTable([['12', '3,5', '1 234,5', 'true', '', 'bonjour', '-2.5', '1e3']])[0]!
  test('un nombre', () => expect(r[0]!.valeur).toBe(12))
  test('virgule décimale', () => expect(r[1]!.valeur).toBe(3.5))
  test('espaces de milliers', () => expect(r[2]!.valeur).toBe(1234.5))
  test('booléen', () => expect(r[3]!.valeur).toBe(true))
  test('vide', () => expect(r[4]!.valeur).toBeNull())
  test('texte', () => expect(r[5]!.valeur).toBe('bonjour'))
  test('point décimal négatif', () => expect(r[6]!.valeur).toBe(-2.5))
  test('une notation scientifique reste du texte', () => expect(r[7]!.valeur).toBe('1e3'))
  test('une table rectangulaire à partir de lignes inégales', () => {
    expect(evaluerTable([['1'], ['1', '2']])[0]).toHaveLength(2)
  })
})

describe('les opérateurs', () => {
  test('priorités', () => expect(v('=1+2*3')).toBe(7))
  test('parenthèses', () => expect(v('=(1+2)*3')).toBe(9))
  test('puissance de gauche à droite', () => expect(v('=2^3^2')).toBe(64))
  test('moins unaire avant la puissance', () => expect(v('=-2^2')).toBe(4))
  test('plus et moins unaires', () => expect(v('=+3--2')).toBe(5))
  test('pourcentage', () => expect(v('=50%*10')).toBe(5))
  test('concaténation', () => expect(v('="a"&1&TRUE')).toBe('a1TRUE'))
  test('guillemet doublé', () => expect(v('="dit ""oui"""')).toBe('dit "oui"'))
  test('comparaisons', () => {
    expect(v('=1<2')).toBe(true)
    expect(v('=2<=1')).toBe(false)
    expect(v('=2<>3')).toBe(true)
    expect(v('="A"="a"')).toBe(true)
    expect(v('="b">"a"')).toBe(true)
  })
  test('les flottants sont nettoyés', () => expect(v('=0.1+0.2')).toBe(0.3))
  test('la division par zéro', () => expect(e('=1/0')).toBe('#DIV/0!'))
  test('un texte dans une somme', () => expect(e('="a"+1')).toBe('#VALUE!'))
  test('un texte qui se lit comme un nombre', () => expect(v('="3"+1')).toBe(4))
  test('TRUE et FALSE', () => expect(v('=TRUE+FALSE')).toBe(1))
  test('les noms de fonctions sont insensibles à la casse', () => expect(v('=sum(1;2,3)')).toBe(6))
})

describe('les erreurs de syntaxe', () => {
  test.each(['=', '=1+', '=(1', '=1 2', '=SUM(1', '=)', '=1+*2', '=@'])('%s', (t) => expect(e(t)).toBe('#PARSE'))
  test('un nom inconnu', () => expect(e('=FOO(1)')).toBe('#NAME?'))
  test('un mot seul', () => expect(e('=bidule')).toBe('#NAME?'))
  test('un #REF! écrit', () => expect(e('=#REF!+1')).toBe('#REF!'))
})

describe('les références', () => {
  test('une cellule', () => expect(v('=B1*2', ['1', '4'])).toBe(8))
  test('une cellule vide vaut 0', () => expect(v('=A1', [''])).toBe(0))
  test('une référence absolue', () => expect(v('=$A$1+1', ['1'])).toBe(2))
  test('hors grille', () => {
    expect(e('=Z1', ['1'])).toBe('#REF!')
    expect(e('=A9', ['1'])).toBe('#REF!')
  })
  test('plage hors grille', () => expect(e('=SUM(A1:A9)', ['1'])).toBe('#REF!'))
  test('une plage seule n\'est pas une valeur', () => expect(e('=A1:A2', ['1'], ['2'])).toBe('#VALUE!'))
  test('une plage à l\'envers', () => expect(v('=SUM(B2:A1)', ['1', '2'], ['3', '4'])).toBe(10))
  test('une formule en texte dans une autre', () => expect(v('=A1&"!"', ['=1+1'])).toBe('2!'))
})

describe('les dépendances', () => {
  test('dans le désordre', () => {
    const r = evaluerTable([['=B1+1', '=C1+1', '5']])[0]!
    expect(r.map((c) => c.valeur)).toEqual([7, 6, 5])
  })
  test('un cycle direct', () => {
    expect(evaluerTable([['=A1']])[0]![0]!.erreur).toBe('#CYCLE!')
  })
  test('un cycle à deux', () => {
    const r = evaluerTable([['=B1', '=A1']])[0]!
    expect(r.map((c) => c.erreur)).toEqual(['#CYCLE!', '#CYCLE!'])
  })
  test('qui dépend d\'un cycle', () => {
    expect(evaluerTable([['=B1', '=A1', '=A1+1']])[0]![2]!.erreur).toBe('#CYCLE!')
  })
  test('une erreur se propage', () => {
    expect(evaluerTable([['=1/0', '=A1+1', '=SUM(A1:B1)']])[0]!.map((c) => c.erreur)).toEqual(['#DIV/0!', '#DIV/0!', '#DIV/0!'])
  })
  test('une longue chaîne', () => {
    const grille = Array.from({ length: 300 }, (_, i) => [i === 0 ? '1' : `=A${i}+1`])
    expect(evaluerTable(grille)[299]![0]!.valeur).toBe(300)
  })
})

describe('les fonctions de total', () => {
  const d = [['1', '2', 'x'], ['3', '', 'true']]
  test('SUM ignore les textes d\'une plage', () => expect(v('=SUM(A1:C2)', ...d)).toBe(6))
  test('SUM convertit les arguments directs', () => expect(v('=SUM("2",TRUE)')).toBe(3))
  test('SUM d\'un texte direct', () => expect(e('=SUM("x")')).toBe('#VALUE!'))
  test('SUM d\'une cellule en erreur', () => expect(e('=SUM(A1)', ['=1/0'])).toBe('#DIV/0!'))
  test('AVERAGE', () => expect(v('=AVERAGE(A1:C2)', ...d)).toBe(2))
  test('AVERAGE sans nombre', () => expect(e('=AVERAGE(C1)', ...d)).toBe('#DIV/0!'))
  test('MIN et MAX', () => {
    expect(v('=MIN(A1:B2)', ...d)).toBe(1)
    expect(v('=MAX(A1:B2,10)', ...d)).toBe(10)
  })
  test('MIN sans nombre', () => expect(v('=MIN(C1)', ...d)).toBe(0))
  test('COUNT', () => expect(v('=COUNT(A1:C2)', ...d)).toBe(3))
  test('COUNTA', () => expect(v('=COUNTA(A1:C2)', ...d)).toBe(5))
  test('COUNTBLANK', () => expect(v('=COUNTBLANK(A1:C2)', ...d)).toBe(1))
  test('PRODUCT', () => expect(v('=PRODUCT(A1:B2)', ...d)).toBe(6))
  test('MEDIAN impair', () => expect(v('=MEDIAN(1,9,3)')).toBe(3))
  test('MEDIAN pair', () => expect(v('=MEDIAN(1,2,3,10)')).toBe(2.5))
})

describe('les fonctions de nombre', () => {
  test('ROUND', () => {
    expect(v('=ROUND(2.5)')).toBe(3)
    expect(v('=ROUND(-2.5)')).toBe(-3)
    expect(v('=ROUND(1.005,2)')).toBe(1.01)
    expect(v('=ROUND(1234,-2)')).toBe(1200)
  })
  test('ROUNDUP et ROUNDDOWN', () => {
    expect(v('=ROUNDUP(1.21,1)')).toBe(1.3)
    expect(v('=ROUNDUP(-1.21,1)')).toBe(-1.3)
    expect(v('=ROUNDDOWN(1.29,1)')).toBe(1.2)
    expect(v('=ROUNDDOWN(-1.29,1)')).toBe(-1.2)
  })
  test('ABS, INT', () => {
    expect(v('=ABS(-3)')).toBe(3)
    expect(v('=INT(-1.5)')).toBe(-2)
  })
  test('SQRT', () => {
    expect(v('=SQRT(16)')).toBe(4)
    expect(e('=SQRT(-1)')).toBe('#VALUE!')
  })
  test('POWER', () => {
    expect(v('=POWER(2,10)')).toBe(1024)
    expect(e('=POWER(0,-1)')).toBe('#DIV/0!')
  })
  test('MOD suit le signe du diviseur', () => {
    expect(v('=MOD(7,3)')).toBe(1)
    expect(v('=MOD(-7,3)')).toBe(2)
    expect(e('=MOD(1,0)')).toBe('#DIV/0!')
  })
  test('PI', () => expect(v('=PI()')).toBeCloseTo(3.14159265, 6))
  test('mauvais nombre d\'arguments', () => expect(e('=ABS(1,2)')).toBe('#VALUE!'))
})

describe('la logique', () => {
  test('IF', () => {
    expect(v('=IF(1>0,"oui","non")')).toBe('oui')
    expect(v('=IF(1>2,"oui")')).toBe(false)
  })
  test('IF ne calcule que la branche choisie', () => expect(v('=IF(A1=0,0,1/A1)', ['0'])).toBe(0))
  test('IF sur un texte qui n\'est pas booléen', () => expect(e('=IF("x",1,2)')).toBe('#VALUE!'))
  test('IFERROR', () => {
    expect(v('=IFERROR(1/0,"zéro")')).toBe('zéro')
    expect(v('=IFERROR(5,"zéro")')).toBe(5)
    expect(v('=IFERROR(FOO(),1)')).toBe(1)
  })
  test('AND, OR, NOT', () => {
    expect(v('=AND(TRUE,1,2>1)')).toBe(true)
    expect(v('=AND(TRUE,0)')).toBe(false)
    expect(v('=OR(FALSE,0,A1)', ['1'])).toBe(true)
    expect(v('=NOT(FALSE)')).toBe(true)
  })
  test('AND ignore les textes d\'une plage', () => expect(v('=AND(A1:A2)', ['x'], ['true'])).toBe(true))
  test('AND sans valeur', () => expect(e('=AND(A1)', [''])).toBe('#VALUE!'))
})

describe('le texte', () => {
  test('CONCAT et CONCATENATE', () => {
    expect(v('=CONCAT("a",1,A1:B1)', ['x', 'y'])).toBe('a1xy')
    expect(v('=CONCATENATE("a","b")')).toBe('ab')
  })
  test('LEN, UPPER, LOWER', () => {
    expect(v('=LEN("abc")')).toBe(3)
    expect(v('=UPPER("abc")')).toBe('ABC')
    expect(v('=LOWER("ABC")')).toBe('abc')
  })
  test('TRIM', () => expect(v('=TRIM("  a   b ")')).toBe('a b'))
  test('LEFT, RIGHT, MID', () => {
    expect(v('=LEFT("bonjour",3)')).toBe('bon')
    expect(v('=LEFT("bonjour")')).toBe('b')
    expect(v('=RIGHT("bonjour",4)')).toBe('jour')
    expect(v('=RIGHT("bonjour",0)')).toBe('')
    expect(v('=MID("bonjour",2,3)')).toBe('onj')
    expect(e('=MID("bonjour",0,3)')).toBe('#VALUE!')
  })
  test('TEXT : nombres', () => {
    expect(v('=TEXT(3.14159,"0.00")')).toBe('3.14')
    expect(v('=TEXT(1234.5,"#,##0.00")')).toBe('1,234.50')
    expect(v('=TEXT(0.256,"0%")')).toBe('26%')
    expect(v('=TEXT(5,"0 ""€""")')).toBe('5 €')
    expect(v('=TEXT(7,"000")')).toBe('007')
    expect(v('=TEXT(-1.5,"0.0")')).toBe('-1.5')
  })
  test('TEXT : dates', () => {
    expect(v('=TEXT(DATE(2024,3,5),"dd/mm/yyyy")')).toBe('05/03/2024')
    expect(v('=TEXT(DATE(2024,3,5),"yyyy-mm-dd")')).toBe('2024-03-05')
    expect(v('=TEXT(NOW(),"hh:nn")')).toBe('12:00')
  })
  test('TEXT d\'un texte', () => expect(v('=TEXT("a","0.00")')).toBe('a'))
})

describe('les dates', () => {
  test('1 = 01/01/1900', () => {
    expect(dateVersSerie(new Date(1900, 0, 1))).toBe(1)
    expect(dateVersSerie(new Date(1900, 1, 28))).toBe(59)
  })
  test('le faux 29/02/1900 : le 01/03/1900 est le 61', () => {
    expect(dateVersSerie(new Date(1900, 2, 1))).toBe(61)
  })
  test('valeurs connues', () => {
    expect(dateVersSerie(new Date(2000, 0, 1))).toBe(36526)
    expect(dateVersSerie(new Date(2024, 0, 15))).toBe(45306)
  })
  test('l\'heure est la partie décimale', () => {
    expect(dateVersSerie(new Date(2024, 0, 15, 18, 0, 0))).toBeCloseTo(45306.75, 8)
  })
  test('serieVersDate fait le chemin inverse', () => {
    for (const n of [1, 59, 61, 36526, 45306]) expect(dateVersSerie(serieVersDate(n))).toBe(n)
    const d = serieVersDate(45306.5)
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2024, 0, 15, 12])
  })
  test('TODAY et NOW lisent l\'horloge donnée', () => {
    expect(v('=TODAY()')).toBe(45306)
    expect(v('=NOW()')).toBeCloseTo(45306.5, 8)
  })
  test('DATE, YEAR, MONTH, DAY', () => {
    expect(v('=DATE(2024,1,15)')).toBe(45306)
    expect(v('=YEAR(45306)')).toBe(2024)
    expect(v('=MONTH(45306)')).toBe(1)
    expect(v('=DAY(45306)')).toBe(15)
  })
  test('DATE déborde', () => {
    expect(v('=DATE(2024,13,1)')).toBe(v('=DATE(2025,1,1)'))
    expect(v('=DATE(2024,1,32)')).toBe(v('=DATE(2024,2,1)'))
    expect(v('=DATE(24,1,1)')).toBe(v('=DATE(1924,1,1)'))
  })
  test('le 29/02/1900 existe pour YEAR, MONTH, DAY', () => {
    expect([v('=YEAR(60)'), v('=MONTH(60)'), v('=DAY(60)')]).toEqual([1900, 2, 29])
  })
  test('une date écrite en texte', () => expect(v('=DAY("2024-03-05")')).toBe(5))
  test('un écart de dates', () => expect(v('=DATE(2024,3,1)-DATE(2024,2,1)')).toBe(29))
})

describe('les fonctions à critère', () => {
  const d = [['a', '1'], ['b', '5'], ['A', '10'], ['', '7']]
  test('SUMIF avec comparaison', () => expect(v('=SUMIF(B1:B4,">5")', ...d)).toBe(17))
  test('SUMIF avec texte, sans casse', () => expect(v('=SUMIF(A1:A4,"a",B1:B4)', ...d)).toBe(11))
  test('SUMIF avec =texte', () => expect(v('=SUMIF(A1:A4,"=b",B1:B4)', ...d)).toBe(5))
  test('SUMIF avec <>', () => expect(v('=SUMIF(A1:A4,"<>a",B1:B4)', ...d)).toBe(12))
  test('SUMIF avec une valeur', () => expect(v('=SUMIF(B1:B4,5)', ...d)).toBe(5))
  test('SUMIF avec joker', () => expect(v('=COUNTIF(A1:A4,"?")', ...d)).toBe(3))
  test('COUNTIF', () => {
    expect(v('=COUNTIF(B1:B4,">=5")', ...d)).toBe(3)
    expect(v('=COUNTIF(B1:B4,"<5")', ...d)).toBe(1)
    expect(v('=COUNTIF(A1:A4,"")', ...d)).toBe(1)
  })
  test('un ordre ne compare pas un texte à un nombre', () => expect(v('=COUNTIF(A1:A4,">5")', ...d)).toBe(0))
  test('AVERAGEIF', () => {
    expect(v('=AVERAGEIF(B1:B4,">1")', ...d)).toBeCloseTo(22 / 3, 10)
    expect(v('=AVERAGEIF(A1:A4,"a",B1:B4)', ...d)).toBe(5.5)
  })
  test('AVERAGEIF sans correspondance', () => expect(e('=AVERAGEIF(B1:B4,">100")', ...d)).toBe('#DIV/0!'))
  test('une plage de somme décalée', () => expect(v('=SUMIF(A1:A2,"b",B2:B3)', ...d)).toBe(10))
})

describe('VLOOKUP', () => {
  const d = [['10', 'dix'], ['20', 'vingt'], ['30', 'trente']]
  test('exact', () => expect(v('=VLOOKUP(20,A1:B3,2,FALSE)', ...d)).toBe('vingt'))
  test('exact introuvable', () => expect(e('=VLOOKUP(25,A1:B3,2,FALSE)', ...d)).toBe('#N/A'))
  test('approché', () => expect(v('=VLOOKUP(25,A1:B3,2)', ...d)).toBe('vingt'))
  test('approché trop petit', () => expect(e('=VLOOKUP(5,A1:B3,2)', ...d)).toBe('#N/A'))
  test('texte sans casse', () => {
    expect(v('=VLOOKUP("B",A1:B2,2,0)', ['a', '1'], ['b', '2'])).toBe(2)
  })
  test('colonne hors plage', () => expect(e('=VLOOKUP(10,A1:B3,3,FALSE)', ...d)).toBe('#REF!'))
  test('indice nul', () => expect(e('=VLOOKUP(10,A1:B3,0,FALSE)', ...d)).toBe('#VALUE!'))
})

type Cas = [formule: string, attendu: Valeur, ...donnees: string[][]]
const verifier = (formule: string, attendu: Valeur, ...donnees: string[][]) => {
  const r = f(formule, ...donnees)
  if (typeof attendu === 'number') expect(r.valeur).toBeCloseTo(attendu, 9)
  else expect(r.valeur).toBe(attendu)
  expect(r.erreur).toBeUndefined()
}

const lettres = [['a', '1', 'x'], ['b', '2', 'y'], ['a', '3', 'y'], ['c', '4', 'y']]
const notes = [['3'], ['1'], ['4'], ['1'], ['5']]
const tableau = [['a', '10'], ['b', '20'], ['c', '30']]

describe('les fonctions de tableur : maths', () => {
  test.each<Cas>([
    ['=CEILING(2.5,2)', 4], ['=CEILING(-2.5,-2)', -4], ['=CEILING(-2.5,2)', -2], ['=FLOOR(2.5,2)', 2], ['=FLOOR(-2.5,2)', -4],
    ['=TRUNC(8.97,1)', 8.9], ['=TRUNC(-8.97)', -8], ['=SIGN(-4)', -1], ['=LN(1)', 0], ['=LOG(8,2)', 3], ['=LOG10(1000)', 3], ['=EXP(0)', 1],
    ['=SUMSQ(1,2,3)', 14], ['=QUOTIENT(-7,2)', -3], ['=GCD(12,18)', 6], ['=LCM(4,6)', 12], ['=FACT(5)', 120], ['=EVEN(3)', 4], ['=ODD(-2)', -3],
    ['=DEGREES(PI())', 180], ['=RADIANS(180)', Math.PI], ['=SIN(0)', 0], ['=COS(0)', 1], ['=TAN(0)', 0], ['=ASIN(1)', Math.PI / 2],
    ['=ACOS(1)', 0], ['=ATAN(1)', Math.PI / 4], ['=ATAN2(1,1)', Math.PI / 4], ['=RANDBETWEEN(3,3)', 3], ['=RAND()<1', true],
    ['=SUMPRODUCT(A1:A2,B1:B2)', 14, ['1', '2'], ['3', '4']],
  ])('%s', (...cas) => verifier(...cas))
  test.each([['=ASIN(2)', '#VALUE!'], ['=LN(0)', '#VALUE!'], ['=FACT(-1)', '#VALUE!'], ['=QUOTIENT(1,0)', '#DIV/0!'], ['=SQRT(-1)', '#VALUE!']])('%s', (formule, code) =>
    expect(e(formule)).toBe(code))
})

describe('les fonctions de tableur : conditions', () => {
  test.each<Cas>([
    ['=SUMIFS(B1:B4,A1:A4,"a")', 4, ...lettres], ['=SUMIFS(B1:B4,A1:A4,"a",C1:C4,"y")', 3, ...lettres], ['=SUMIFS(B1:B4,B1:B4,">1")', 9, ...lettres],
    ['=SUMIFS(B1:B4,A1:A4,"*")', 10, ...lettres], ['=COUNTIFS(A1:A4,"<>a",C1:C4,"y")', 2, ...lettres], ['=COUNTIFS(A1:A4,"?")', 4, ...lettres],
    ['=AVERAGEIFS(B1:B4,C1:C4,"y")', 3, ...lettres], ['=MAXIFS(B1:B4,A1:A4,"a")', 3, ...lettres], ['=MINIFS(B1:B4,C1:C4,"y")', 2, ...lettres],
    ['=IFNA(NA(),"x")', 'x'], ['=IFS(1>2,"a",2>1,"b")', 'b'], ['=SWITCH(2,1,"un",2,"deux","autre")', 'deux'], ['=SWITCH(9,1,"un","autre")', 'autre'],
    ['=XOR(TRUE,FALSE)', true], ['=XOR(TRUE,TRUE)', false], ['=CHOOSE(2,"a","b","c")', 'b'],
  ])('%s', (...cas) => verifier(...cas))
  test.each([['=IFNA(1/0,"x")', '#DIV/0!'], ['=IFS(1>2,"a")', '#N/A'], ['=SWITCH(9,1,"un")', '#N/A'], ['=CHOOSE(4,1,2)', '#VALUE!'], ['=SUMIFS(A1:A2,A1:A3,"a")', '#VALUE!']])('%s', (formule, code) =>
    expect(e(formule, ['1'], ['2'], ['3'])).toBe(code))
})

describe('les fonctions de tableur : statistiques', () => {
  test.each<Cas>([
    ['=MODE(A1:A5)', 1, ...notes], ['=MODE.SNGL(A1:A5)', 1, ...notes], ['=STDEV.P(A1:A5)', 1.6, ...notes], ['=STDEVP(A1:A5)', 1.6, ...notes],
    ['=STDEV(A1:A5)', Math.sqrt(3.2), ...notes], ['=STDEV.S(A1:A5)', Math.sqrt(3.2), ...notes], ['=VAR.P(A1:A5)', 2.56, ...notes], ['=VARP(A1:A5)', 2.56, ...notes],
    ['=VAR(A1:A5)', 3.2, ...notes], ['=VAR.S(A1:A5)', 3.2, ...notes], ['=LARGE(A1:A5,2)', 4, ...notes], ['=SMALL(A1:A5,2)', 1, ...notes],
    ['=RANK(4,A1:A5)', 2, ...notes], ['=RANK.EQ(1,A1:A5,1)', 1, ...notes], ['=AVERAGEA(A1:A2)', 2, ...notes], ['=AVERAGEA(A1:A3)', 2 / 3, ['1'], ['x'], ['true']],
  ])('%s', (...cas) => verifier(...cas))
  test.each([['=MODE(A2:A3)', '#N/A'], ['=LARGE(A1:A5,6)', '#VALUE!'], ['=RANK(9,A1:A5)', '#N/A'], ['=VAR(A1)', '#DIV/0!']])('%s', (formule, code) =>
    expect(e(formule, ...notes)).toBe(code))
})

describe('les fonctions de tableur : recherche', () => {
  test.each<Cas>([
    ['=INDEX(A1:B3,2,2)', 20, ...tableau], ['=INDEX(B1:B3,3)', 30, ...tableau], ['=MATCH("b",A1:A3,0)', 2, ...tableau], ['=MATCH("*c",A1:A3,0)', 3, ...tableau],
    ['=MATCH(25,B1:B3,1)', 2, ...tableau], ['=MATCH(25,B1:B3)', 2, ...tableau], ['=MATCH(25,A1:A3,-1)', 1, ['30'], ['20'], ['10']],
    ['=HLOOKUP(20,A1:C2,2,FALSE)', 'y', ['10', '20', '30'], ['x', 'y', 'z']], ['=XLOOKUP("b",A1:A3,B1:B3)', 20, ...tableau],
    ['=XLOOKUP("z",A1:A3,B1:B3,"non")', 'non', ...tableau], ['=XLOOKUP(25,B1:B3,A1:A3,"",-1)', 'b', ...tableau], ['=XLOOKUP(25,B1:B3,A1:A3,"",1)', 'c', ...tableau],
    ['=ROW(B3)', 3], ['=COLUMN(C1)', 3], ['=ROW()', 4, ...tableau], ['=ROWS(A1:B3)', 3, ...tableau], ['=COLUMNS(A1:B3)', 2, ...tableau],
  ])('%s', (...cas) => verifier(...cas))
  test.each([['=MATCH("z",A1:A3,0)', '#N/A'], ['=INDEX(A1:B3,4,1)', '#REF!'], ['=HLOOKUP(1,A1:B3,9,FALSE)', '#REF!'], ['=XLOOKUP("z",A1:A3,B1:B3)', '#N/A']])('%s', (formule, code) =>
    expect(e(formule, ...tableau)).toBe(code))
})

describe('les fonctions de tableur : texte', () => {
  test.each<Cas>([
    ['=PROPER("hello wORLD")', 'Hello World'], ['=SUBSTITUTE("a-b-c","-","+")', 'a+b+c'], ['=SUBSTITUTE("a-b-c","-","+",2)', 'a-b+c'],
    ['=REPLACE("abcdef",2,3,"X")', 'aXef'], ['=FIND("b","abcb")', 2], ['=FIND("b","abcb",3)', 4], ['=SEARCH("A?C","xabcd")', 2], ['=REPT("ab",3)', 'ababab'],
    ['=TEXTJOIN("-",TRUE,"a","","b")', 'a-b'], ['=TEXTJOIN("-",FALSE,"a","","b")', 'a--b'], ['=EXACT("a","A")', false], ['=VALUE("12,5")', 12.5],
    ['=VALUE("50%")', 0.5], ['=T(5)', ''], ['=T("x")', 'x'], ['=N(TRUE)', 1], ['=N("x")', 0], ['=CHAR(65)', 'A'], ['=CODE("A")', 65], ['=CLEAN("a"&CHAR(7)&"b")', 'ab'],
  ])('%s', (...cas) => verifier(...cas))
  test.each([['=FIND("z","abc")', '#VALUE!'], ['=VALUE("abc")', '#VALUE!'], ['=REPT("a",-1)', '#VALUE!'], ['=CHAR(0)', '#VALUE!']])('%s', (formule, code) =>
    expect(e(formule)).toBe(code))
})

describe('les fonctions de tableur : dates', () => {
  const iso = (x: string) => `TEXT(${x},"yyyy-mm-dd")`
  test.each<Cas>([
    [`=${iso('EDATE(DATE(2024,1,31),1)')}`, '2024-02-29'], [`=${iso('EOMONTH(DATE(2024,1,15),1)')}`, '2024-02-29'], [`=${iso('WORKDAY(DATE(2024,1,12),1)')}`, '2024-01-15'],
    ['=WEEKDAY(DATE(2024,1,15))', 2], ['=WEEKDAY(DATE(2024,1,15),2)', 1], ['=WEEKDAY(DATE(2024,1,15),3)', 0], ['=WEEKNUM(DATE(2024,1,15))', 3],
    ['=ISOWEEKNUM(DATE(2024,1,15))', 3], ['=ISOWEEKNUM(DATE(2021,1,3))', 53], ['=DAYS(DATE(2024,3,1),DATE(2024,2,1))', 29],
    ['=DAYS360(DATE(2024,1,31),DATE(2024,3,31))', 60], ['=DAYS360(DATE(2024,1,31),DATE(2024,3,31),TRUE)', 60],
    ['=DATEDIF(DATE(2020,2,15),DATE(2024,1,10),"Y")', 3], ['=DATEDIF(DATE(2020,2,15),DATE(2024,1,10),"M")', 46], ['=DATEDIF(DATE(2020,2,15),DATE(2024,1,10),"YM")', 10],
    ['=DATEDIF(DATE(2020,2,15),DATE(2024,1,10),"MD")', 26], ['=DATEDIF(DATE(2024,1,1),DATE(2024,1,31),"D")', 30],
    ['=NETWORKDAYS(DATE(2024,1,15),DATE(2024,1,21))', 5], ['=NETWORKDAYS(DATE(2024,1,15),DATE(2024,1,21),A1)', 4, ['=DATE(2024,1,17)']],
    ['=DATEVALUE("05/03/2024")=DATE(2024,3,5)', true], ['=DATEVALUE("2024-03-05")=DATE(2024,3,5)', true], ['=TIMEVALUE("12:00")', 0.5], ['=TIME(6,0,0)', 0.25],
    ['=HOUR(0.75)', 18], ['=MINUTE(TIME(1,30,0))', 30], ['=SECOND(TIME(0,0,45))', 45],
    ['=YEARFRAC(DATE(2024,1,1),DATE(2024,7,1))', 0.5], ['=YEARFRAC(DATE(2024,1,1),DATE(2024,7,1),1)', 182 / 366], ['=YEARFRAC(DATE(2023,1,1),DATE(2023,7,1),3)', 181 / 365],
  ])('%s', (...cas) => verifier(...cas))
  test.each([['=DATEDIF(DATE(2024,2,1),DATE(2024,1,1),"D")', '#VALUE!'], ['=DATEVALUE("31/02/2024")', '#VALUE!'], ['=TIME(-1,0,0)', '#VALUE!'], ['=WEEKDAY(1,9)', '#VALUE!']])('%s', (formule, code) =>
    expect(e(formule)).toBe(code))
})

describe('les fonctions de tableur : informations', () => {
  test.each<Cas>([
    ['=ISBLANK(A1)', true, ['', '1']], ['=ISBLANK(B1)', false, ['', '1']], ['=ISNUMBER(B1)', true, ['', '1']], ['=ISNUMBER("1")', false], ['=ISTEXT("a")', true],
    ['=ISTEXT(B1)', false, ['', '1']], ['=ISLOGICAL(TRUE)', true], ['=ISERROR(1/0)', true], ['=ISERROR(1)', false], ['=ISERR(NA())', false], ['=ISERR(1/0)', true],
    ['=ISNA(NA())', true], ['=ISEVEN(4)', true], ['=ISODD(4)', false], ['=ISODD(-3)', true], ['=TRUE()', true], ['=FALSE()', false],
  ])('%s', (...cas) => verifier(...cas))
  test('NA donne #N/A', () => expect(e('=NA()')).toBe('#N/A'))
})

describe('les fonctions', () => {
  test('la liste est triée et complète', () => {
    expect([...FONCTIONS].sort()).toEqual([...FONCTIONS])
    expect(FONCTIONS).toContain('VLOOKUP')
    expect(FONCTIONS).toContain('IFERROR')
    expect(FONCTIONS.length).toBeGreaterThanOrEqual(140)
    expect(FONCTIONS).toEqual(expect.arrayContaining(['SUMIFS', 'INDEX', 'MATCH', 'STDEV.S', 'RANK.EQ', 'ISOWEEKNUM', 'YEARFRAC', 'XLOOKUP']))
  })
  test('chaque fonction de la liste est connue du moteur', () => {
    for (const nom of FONCTIONS) expect(e(`=${nom}()`)).not.toBe('#NAME?')
  })
})

describe('suggererFonctions', () => {
  test('sans requête', () => expect(suggererFonctions('')).toEqual(['SUM', 'IF', 'MIN', 'MAX', 'COUNT', 'AVERAGE']))
  test('préfixe, tri par longueur puis alphabet', () => {
    const r = suggererFonctions('co')
    expect(r.slice(0, 6)).toEqual(['COS', 'CODE', 'COUNT', 'COLUMN', 'CONCAT', 'COUNTA'])
    expect(r.every((n) => n.startsWith('CO'))).toBe(true)
  })
  test('insensible à la casse', () => expect(suggererFonctions('su')).toEqual(['SUM', 'SUMIF', 'SUMSQ', 'SUMIFS', 'SUBSTITUTE', 'SUMPRODUCT']))
  test('noms pointés', () => expect(suggererFonctions('stdev.')).toEqual(['STDEV.P', 'STDEV.S']))
  test('rien', () => expect(suggererFonctions('zz')).toEqual([]))
})

describe('requeteAutocompletion', () => {
  test('= seul', () => expect(requeteAutocompletion('=', 1)).toEqual({ debut: 1, requete: '' }))
  test('lettres après =', () => expect(requeteAutocompletion('=SU', 3)).toEqual({ debut: 1, requete: 'SU' }))
  test.each(['(', ',', ';', '+', '-', '*', '/', '^', '&', '<', '>', ' '])('après %s', (c) => {
    const t = `=1${c}ab`
    expect(requeteAutocompletion(t, t.length)).toEqual({ debut: 3, requete: 'ab' })
  })
  test('requête vide juste après un déclencheur', () => {
    expect(requeteAutocompletion('=1+', 3)).toEqual({ debut: 3, requete: '' })
    expect(requeteAutocompletion('=SUM(', 5)).toEqual({ debut: 5, requete: '' })
  })
  test('le mot peut porter _ et .', () => expect(requeteAutocompletion('=1+STDEV.', 9)).toEqual({ debut: 3, requete: 'STDEV.' }))
  test('jamais de chiffre dans la requête', () => expect(requeteAutocompletion('=LOG10', 6)).toBeNull())
  test('pas dans une référence', () => expect(requeteAutocompletion('=A1', 3)).toBeNull())
  test('pas collé à un mot', () => expect(requeteAutocompletion('=1a', 3)).toBeNull())
  test('pas sans =', () => expect(requeteAutocompletion('SU', 2)).toBeNull())
  test('pas dans une chaîne', () => expect(requeteAutocompletion('="un su', 7)).toBeNull())
  test('le curseur compte', () => expect(requeteAutocompletion('=SUM(A1)', 3)).toEqual({ debut: 1, requete: 'SU' }))
})

describe('modeCitation', () => {
  test.each(['=', '=1+', '=SUM(', '=SUM(A1,', '=A1;', '=1 * ', '=A1<', '=A1&', '=A1^', '=A1=', '=A1>', '=A1-', '=A1/'])('vrai pour %s', (t) =>
    expect(modeCitation(t, t.length)).toBe(true),
  )
  test.each(['=A1', '=SUM(A1)', '=1', '="a+', 'abc+'])('faux pour %s', (t) => expect(modeCitation(t, t.length)).toBe(false))
  test('le curseur au milieu', () => expect(modeCitation('=SUM(A1)', 5)).toBe(true))
  test('curseur au début', () => expect(modeCitation('=', 0)).toBe(false))
})

describe('citerReferences', () => {
  test('références et plages avec leur place', () => {
    expect(citerReferences('=SUM(A1:B2)+$C$3')).toEqual([
      { debut: 5, fin: 10, plage: { l1: 0, c1: 0, l2: 1, c2: 1 } },
      { debut: 12, fin: 16, plage: { l1: 2, c1: 2, l2: 2, c2: 2 } },
    ])
  })
  test('une plage à l\'envers est remise dans l\'ordre', () => {
    expect(citerReferences('=B2:A1')[0]!.plage).toEqual({ l1: 0, c1: 0, l2: 1, c2: 1 })
  })
  test('ni les chaînes ni les noms', () => expect(citerReferences('=LOG10(1)&"A1"')).toEqual([]))
  test('pas une formule', () => expect(citerReferences('A1')).toEqual([]))
  test('une formule inachevée', () => expect(citerReferences('=SUM(A1,B')).toHaveLength(1))
})

describe('fermerParentheses', () => {
  test('ajoute ce qui manque', () => expect(fermerParentheses('=SUM(A1,IF(B1')).toBe('=SUM(A1,IF(B1))'))
  test('rien à faire', () => expect(fermerParentheses('=SUM(A1)')).toBe('=SUM(A1)'))
  test('ignore les parenthèses des chaînes', () => expect(fermerParentheses('=SUM(")")')).toBe('=SUM(")")'))
  test('chaîne ouverte', () => expect(fermerParentheses('=LEN("ab')).toBe('=LEN("ab")'))
  test('pas une formule', () => expect(fermerParentheses('(a')).toBe('(a'))
})

describe('decalerFormule : insérer', () => {
  test('lignes', () => {
    expect(decalerFormule('=A2+A3', { genre: 'insererLignes', a: 2, n: 1 })).toBe('=A2+A4')
  })
  test('colonnes', () => {
    expect(decalerFormule('=B1+C1', { genre: 'insererColonnes', a: 2, n: 2 })).toBe('=B1+E1')
  })
  test('les $ suivent aussi', () => {
    expect(decalerFormule('=$A$3', { genre: 'insererLignes', a: 0, n: 2 })).toBe('=$A$5')
  })
  test('une plage s\'étend', () => {
    expect(decalerFormule('=SUM(A1:A3)', { genre: 'insererLignes', a: 1, n: 2 })).toBe('=SUM(A1:A5)')
  })
  test('une plage qui suit l\'insertion se décale', () => {
    expect(decalerFormule('=SUM(A2:A3)', { genre: 'insererLignes', a: 0, n: 1 })).toBe('=SUM(A3:A4)')
  })
  test('pas de changement hors formule ni dans une chaîne', () => {
    expect(decalerFormule('A5', { genre: 'insererLignes', a: 0, n: 1 })).toBe('A5')
    expect(decalerFormule('="A5"&A5', { genre: 'insererLignes', a: 0, n: 1 })).toBe('="A5"&A6')
  })
})

describe('decalerFormule : retirer', () => {
  test('une référence après', () => {
    expect(decalerFormule('=A5', { genre: 'retirerLignes', a: 1, n: 2 })).toBe('=A3')
  })
  test('une référence retirée', () => {
    expect(decalerFormule('=A2+B1', { genre: 'retirerLignes', a: 1, n: 1 })).toBe('=#REF!+B1')
  })
  test('une colonne retirée', () => {
    expect(decalerFormule('=B1+C1', { genre: 'retirerColonnes', a: 1, n: 1 })).toBe('=#REF!+B1')
  })
  test('une plage rétrécit par le milieu', () => {
    expect(decalerFormule('=SUM(A1:A5)', { genre: 'retirerLignes', a: 1, n: 2 })).toBe('=SUM(A1:A3)')
  })
  test('une plage rétrécit par le haut', () => {
    expect(decalerFormule('=SUM(A2:A5)', { genre: 'retirerLignes', a: 0, n: 2 })).toBe('=SUM(A1:A3)')
  })
  test('une plage rétrécit par le bas', () => {
    expect(decalerFormule('=SUM(A1:A5)', { genre: 'retirerLignes', a: 3, n: 5 })).toBe('=SUM(A1:A3)')
  })
  test('une plage entièrement retirée', () => {
    expect(decalerFormule('=SUM(A2:A3)+1', { genre: 'retirerLignes', a: 1, n: 2 })).toBe('=SUM(#REF!)+1')
  })
  test('la formule réécrite se lit', () => {
    expect(e(decalerFormule('=A2', { genre: 'retirerLignes', a: 1, n: 1 }), ['1'], ['2'])).toBe('#REF!')
  })
})

describe('decalerFormule : déplacer', () => {
  // Les lignes 1 et 2 (indices 1..2) vont à l'indice 3 : l'ordre devient 0, 3, 1, 2.
  const op = { genre: 'deplacerLignes', de: 1, n: 2, vers: 3 } as const
  test('le bloc déplacé suit', () => {
    expect(decalerFormule('=A2+A3', op)).toBe('=A4+A5')
  })
  test('ce qui est entre les deux remonte', () => expect(decalerFormule('=A4', op)).toBe('=A2'))
  test('ce qui est avant ne bouge pas', () => expect(decalerFormule('=A1', op)).toBe('=A1'))
  test('ce qui est après ne bouge pas', () => expect(decalerFormule('=A6', op)).toBe('=A6'))
  test('vers le haut', () => {
    const haut = { genre: 'deplacerLignes', de: 3, n: 1, vers: 0 } as const
    expect(['=A1', '=A2', '=A3', '=A4', '=A5'].map((t) => decalerFormule(t, haut))).toEqual(['=A2', '=A3', '=A4', '=A1', '=A5'])
  })
  test('colonnes', () => {
    const c = { genre: 'deplacerColonnes', de: 0, n: 1, vers: 2 } as const
    expect(['=A1', '=B1', '=C1', '=D1'].map((t) => decalerFormule(t, c))).toEqual(['=C1', '=A1', '=B1', '=D1'])
  })
})

describe('translaterFormule', () => {
  test('relatif', () => expect(translaterFormule('=A1+B2', 1, 2)).toBe('=C2+D3'))
  test('absolu', () => expect(translaterFormule('=$A$1+A$1+$A1', 2, 3)).toBe('=$A$1+D$1+$A3'))
  test('plage', () => expect(translaterFormule('=SUM(A1:A3)', 0, 1)).toBe('=SUM(B1:B3)'))
  test('hors grille en haut', () => expect(translaterFormule('=A1+B2', -1, 0)).toBe('=#REF!+B1'))
  test('hors grille à gauche', () => expect(translaterFormule('=SUM(A1:B2)', 0, -1)).toBe('=SUM(#REF!)'))
  test('hors grille en bas, si on donne la taille', () => {
    expect(translaterFormule('=A1', 5, 0, { lignes: 4, colonnes: 3 })).toBe('=#REF!')
    expect(translaterFormule('=A1', 3, 0, { lignes: 4, colonnes: 3 })).toBe('=A4')
  })
  test('un absolu ne sort jamais', () => expect(translaterFormule('=$A$1', -5, -5)).toBe('=$A$1'))
  test('pas une formule', () => expect(translaterFormule('A1', 1, 1)).toBe('A1'))
})

describe('typeDuResultat', () => {
  const cellules = [['1', '=SUM(A1)'], ['2', '3']]
  const formats = [[{ type: 'monnaie' as const }, null], [null, { type: 'pourcent' as const }]]
  test('le type de la première cellule citée', () => {
    expect(typeDuResultat('=SUM(A1:A2)', cellules, formats)).toBe('monnaie')
    expect(typeDuResultat('=max(B2, A1)', cellules, formats)).toBe('pourcent')
  })
  test.each(['SUMIF', 'MIN', 'AVERAGE', 'AVERAGEIF', 'PRODUCT', 'MEDIAN'])('%s', (nom) => {
    expect(typeDuResultat(`=${nom}(A1:A2,">1")`, cellules, formats)).toBe('monnaie')
  })
  test('sans format, undefined', () => expect(typeDuResultat('=SUM(A2)', cellules, formats)).toBeUndefined())
  test('sans formats du tout', () => expect(typeDuResultat('=SUM(A1)', cellules)).toBeUndefined())
  test('une formule citée rend son propre type', () => {
    expect(typeDuResultat('=SUM(B1)', cellules, formats)).toBe('monnaie')
  })
  test('les dates', () => {
    expect(typeDuResultat('=TODAY()', cellules)).toBe('date')
    expect(typeDuResultat('=NOW()', cellules)).toBe('date')
    expect(typeDuResultat('=DATE(2024,1,1)', cellules)).toBe('date')
  })
  test('les autres fonctions n\'ont pas de type', () => {
    expect(typeDuResultat('=IF(A1,1,2)', cellules, formats)).toBeUndefined()
    expect(typeDuResultat('=A1+1', cellules, formats)).toBeUndefined()
  })
  test('une boucle ne tourne pas', () => {
    expect(typeDuResultat('=SUM(A1)', [['=SUM(A1)']])).toBeUndefined()
  })
})
