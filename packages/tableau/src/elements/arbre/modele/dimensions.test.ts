import { describe, expect, it } from 'vitest'
import { type Ligne, type Mesure, TAILLES_DE_BASE, ajuster, dimensions, hauteurDe, interligne, plusGrandeTaille, socle, tronquer, unites } from './dimensions'

/**
 * Une mesure d'essai, sans navigateur : chaque caractère est large de 0,5 × la taille ; on coupe aux espaces, et un mot
 * trop long se coupe où il déborde (`break-word`).
 */
const mesure: Mesure = (texte, taille, _police, largeur) => {
  const parLigne = Math.max(1, Math.floor(largeur / (0.5 * taille)))
  const lignes: Ligne[] = []
  let courante = ''
  const pousser = (t: string) => lignes.push({ texte: t, largeur: t.length * 0.5 * taille })
  for (let mot of texte.split(' ')) {
    const essai = courante ? `${courante} ${mot}` : mot
    if (essai.length <= parLigne) {
      courante = essai
      continue
    }
    if (courante) pousser(courante)
    while (mot.length > parLigne) {
      pousser(mot.slice(0, parLigne))
      mot = mot.slice(parLigne)
    }
    courante = mot
  }
  pousser(courante)
  return lignes
}

describe('les mesures des diapositives (mode Pitch)', () => {
  it('la taille de base de chaque rapport, et les unités : 1 vmin vaut 9 px partout', () => {
    expect(TAILLES_DE_BASE['16:9']).toEqual({ l: 1600, h: 900 })
    expect(TAILLES_DE_BASE['9:16']).toEqual({ l: 900, h: 1600 })
    for (const r of ['16:9', '4:3', '9:16', '3:4'] as const) expect(unites(r).vmin(1)).toBe(9)
    expect(unites('16:9').vw(1)).toBe(16)
    expect(unites('3:4').vmax(10)).toBe(120)
  })

  it('les marges de diapositive : 100/13 vw en paysage, 100/15 vw en portrait, 12,5 vh partout', () => {
    expect(socle('16:9').marges.h).toBeCloseTo(123.08, 1)
    expect(socle('16:9').marges.v).toBe(112.5)
    expect(socle('9:16').marges.h).toBe(60)
    expect(socle('9:16').marges.v).toBe(200)
    expect(socle('9:16').espacementV.normal).toBe(13 * 9)
  })

  it('les tables : le portrait a la sienne, le 4:3 change l’arête et la chronologie', () => {
    const d = dimensions('16:9')
    expect(d.sujet.paliers[0]).toEqual({ max: 135, min: 72, lignesPreferees: 1 })
    expect(d.sujet.paliers[1]!.max).toBe(108)
    expect(d.accolade.zoneParent).toBeCloseTo(0.3 * (1600 - 2 * (1600 / 13)), 5)
    expect(d.accolade.elements).toEqual({ max: 63, min: 40.5, lignesPreferees: 2, lignesMax: 3 })
    expect(dimensions('9:16').accolade.parent.max).toBe(126)
    expect(dimensions('9:16').sujet.paliers[0]!.max).toBe(126)
    expect([d.arete.intervalle, dimensions('4:3').arete.intervalle]).toEqual([594, 423])
    expect(d.chronologie.colonne.c).toBeCloseTo(438.03, 2)
    expect(dimensions('4:3').chronologie.colonne.c).toBe(342)
    expect(dimensions('4:3').chronologie.parent.max).toBe(54)
    expect(dimensions('4:3').accolade.parent.max).toBe(90)
  })

  it('l’interligne par paliers', () => {
    expect([interligne(49), interligne(50), interligne(89), interligne(90)]).toEqual([1.5, 1.4, 1.4, 1.3])
    expect(hauteurDe(2, 100)).toBe(260)
  })

  it('la dichotomie trouve la plus grande taille qui tient', () => {
    expect(plusGrandeTaille(10, 100, (t) => t <= 37)).toBe(37)
    expect(plusGrandeTaille(10, 100, () => true)).toBe(100)
    expect(plusGrandeTaille(10, 100, () => false)).toBeNull()
    // Une borne haute non entière est essayée telle quelle.
    expect(plusGrandeTaille(72, 108.5, () => true)).toBe(108.5)
    expect(plusGrandeTaille(40.5, 63, (t) => t < 41)).toBe(40.5)
  })

  it('le texte tient sur une ligne à la plus grande taille possible', () => {
    // « Bonjour » : 7 caractères à 0,5 × la taille dans 400 px : jusqu'à 114 px.
    const r = ajuster({ texte: 'Bonjour', police: 'x', largeur: 400, paliers: [{ max: 135, min: 72, lignes: 1 }], repli: { taille: 72 }, mesurer: mesure })
    expect([r.taille, r.lignes.length, r.interligne, r.tronque]).toEqual([114, 1, 1.3, false])
  })

  it('palier après palier, puis le repli tronqué avec « ... »', () => {
    const texte = 'un deux trois quatre cinq six sept huit neuf dix onze douze'
    const deux = ajuster({ texte, police: 'x', largeur: 400, paliers: [{ max: 60, min: 50, lignes: 1 }, { max: 40, min: 20, lignes: 2 }], repli: { taille: 20 }, mesurer: mesure })
    expect(deux.lignes.length).toBeLessThanOrEqual(2)
    expect(deux.taille).toBeLessThanOrEqual(40)
    const coupe = ajuster({ texte, police: 'x', largeur: 200, paliers: [{ max: 60, min: 50, lignes: 1 }], repli: { taille: 40, lignesMax: 2 }, mesurer: mesure })
    expect(coupe.tronque).toBe(true)
    expect(coupe.lignes).toHaveLength(2)
    expect(coupe.lignes.at(-1)!.texte.endsWith('...')).toBe(true)
  })

  it('la troncature garde le plus de caractères possible', () => {
    const t = tronquer('abcdefghij', 10, 'x', 1000, 1, () => [{ texte: '', largeur: 0 }])
    expect(t).toMatchObject({ texte: 'abcdefghij', tronque: false })
    // Pas plus de 6 caractères par ligne, une ligne : « abc... ».
    const six: Mesure = (s) => Array.from({ length: Math.ceil(s.length / 6) }, (_, i) => ({ texte: s.slice(i * 6, i * 6 + 6), largeur: 0 }))
    expect(tronquer('abcdefghij', 10, 'x', 1000, 1, six).texte).toBe('abc...')
  })

  it('une dernière ligne trop courte fait réessayer à 0,8 × la taille', () => {
    // À 100 px dans 1000 px : 20 caractères par ligne ; « mot » tombe seul en dernière ligne (150 px ≤ 20 %).
    const texte = 'aaaaaaaaa bbbbbbbbb mot'
    const r = ajuster({ texte, police: 'x', largeur: 1000, paliers: [{ max: 100, min: 50, lignes: 2 }], repli: { taille: 50 }, mesurer: mesure })
    expect(r.taille).toBe(80)
    expect(r.lignes).toHaveLength(1)
    const sans = ajuster({ texte, police: 'x', largeur: 1000, paliers: [{ max: 100, min: 50, lignes: 2 }], repli: { taille: 50 }, derniereLigne: false, mesurer: mesure })
    expect([sans.taille, sans.lignes.length]).toEqual([100, 2])
  })
})
