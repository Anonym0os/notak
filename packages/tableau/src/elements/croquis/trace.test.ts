import { describe, expect, it, test } from 'vitest'
import type { Trait } from '../../coeur/tableau'
import {
  AFFINAGE,
  affinageDe,
  commencerTrace,
  pressionDe,
  pressionsDe,
  prolongerTrace,
  traitFini,
  attributsTrait,
  dessinTrait,
  dessinDuTrait,
  epurer,
  OPACITE_SURLIGNEUR,
  traitEnSvg,
  COULEURS_TRAIT,
  EPAISSEURS_TRAIT,
  HAUTEUR_FEUILLE,
  HAUTEUR_FEUILLE_NEUVE,
  LARGEUR_FEUILLE,
  ajouterPoint,
  arrondir,
  cheminLisse,
  croquisEnSvg,
  distanceSegment,
  epaisseurFeuille,
  gommer,
  hauteurFeuille,
  nouveauCroquis,
  resume,
  toucheTrait,
  traitVise,
} from './trace'

const trait = (points: number[], epaisseur = 2): Trait => ({ points, couleur: '#000000', epaisseur })

describe('le tracé', () => {
  test('tous les points sont gardés, seul un doublon exact du dernier est écarté', () => {
    const t = [0, 0]
    expect(ajouterPoint(t, 0, 0)).toBe(t)
    expect(ajouterPoint(t, 0.1, 0.1)).toEqual([0, 0, 0.1, 0.1])
    let suite: number[] = [0, 0]
    for (let i = 1; i <= 50; i++) suite = ajouterPoint(suite, i * 0.2, 0)
    expect(suite.length).toBe(102)
  })

  test('les points sont arrondis au centième', () => {
    expect(arrondir([1.234, 5.678, 2, 3.001])).toEqual([1.23, 5.68, 2, 3])
  })

  test('le chemin lissé : un point, une ligne, puis des quadratiques entre milieux et un dernier segment droit', () => {
    expect(cheminLisse([])).toBe('')
    expect(cheminLisse([4, 5])).toBe('M4 5l0 0.01')
    expect(cheminLisse([0, 0, 10, 10])).toBe('M0 0L10 10')
    expect(cheminLisse([0, 0, 10, 0, 10, 10])).toBe('M0 0Q10 0 10 5L10 10')
    expect(cheminLisse([0, 0, 10, 0, 10, 10, 0, 10])).toBe('M0 0Q10 0 10 5Q10 10 5 10L0 10')
    expect(cheminLisse([0, 0, 1.234, 0.333, 3, 3])).toBe('M0 0Q1.23 0.33 2.12 1.67L3 3')
  })

  test('l’épaisseur à l’écran est constante : 2, 4, 8 et 32 pixels, rangés en unités de feuille', () => {
    expect(EPAISSEURS_TRAIT.map((e) => e.px)).toEqual([2, 4, 8, 32])
    expect(epaisseurFeuille(4, 1)).toBe(4)
    // Une feuille affichée deux fois plus large : un pixel vaut deux fois moins d'unités.
    expect(epaisseurFeuille(4, 2)).toBe(2)
    expect(epaisseurFeuille(4, 0.5)).toBe(8)
    // Une échelle absurde ne fait pas de trait infini.
    expect(epaisseurFeuille(4, 0)).toBe(4)
  })

  test('treize couleurs, de l’encre au blanc', () => {
    expect(COULEURS_TRAIT).toHaveLength(13)
    expect(COULEURS_TRAIT[0]).toBe('#323b4a')
    expect(COULEURS_TRAIT.at(-1)).toBe('#ffffff')
  })

  test('une feuille neuve a le rapport de 1,63 et 34 UG de large ; un ancien croquis garde ses 4:3', () => {
    const neuf = nouveauCroquis(0, 0)
    expect(neuf.largeur).toBe(34)
    expect(hauteurFeuille(neuf.contenu)).toBe(HAUTEUR_FEUILLE_NEUVE)
    expect(LARGEUR_FEUILLE / HAUTEUR_FEUILLE_NEUVE).toBeCloseTo(1.63, 2)
    expect(hauteurFeuille({ type: 'croquis', traits: [] })).toBe(HAUTEUR_FEUILLE)
  })

  test('la distance à un segment, y compris au-delà de ses bouts', () => {
    expect(distanceSegment(5, 3, 0, 0, 10, 0)).toBe(3)
    expect(distanceSegment(13, 4, 0, 0, 10, 0)).toBe(5)
    expect(distanceSegment(3, 4, 0, 0, 0, 0)).toBe(5)
  })

  test('la gomme retire les traits qu’elle touche, pas les autres', () => {
    const a = trait([0, 0, 100, 0])
    const b = trait([0, 50, 100, 50])
    expect(gommer([a, b], 50, 3, 6)).toEqual([b])
    const rien = [a, b]
    expect(gommer(rien, 50, 25, 6)).toBe(rien)
  })

  test('l’épaisseur du trait compte pour le toucher ; un simple point se gomme aussi', () => {
    expect(toucheTrait(trait([0, 0, 100, 0], 20), 50, 14, 6)).toBe(true)
    expect(toucheTrait(trait([0, 0, 100, 0], 2), 50, 14, 6)).toBe(false)
    expect(toucheTrait(trait([10, 10]), 12, 10, 3)).toBe(true)
  })

  test('la gomme vise le trait du dessus qu’elle touche', () => {
    const dessous = trait([0, 0, 100, 0])
    const dessus = trait([0, 0, 100, 0])
    const loin = trait([0, 50, 100, 50])
    expect(traitVise([dessous, loin, dessus], 50, 1, 3)).toBe(2)
    expect(traitVise([dessous, loin], 50, 25, 3)).toBe(-1)
    expect(traitVise([], 0, 0, 3)).toBe(-1)
  })

  test('le résumé compte les traits', () => {
    expect(resume({ type: 'croquis', traits: [] })).toBe('Croquis vide')
    expect(resume({ type: 'croquis', traits: [trait([0, 0])] })).toBe('Croquis (1 trait)')
    expect(resume({ type: 'croquis', traits: [trait([0, 0]), trait([1, 1])] })).toBe('Croquis (2 traits)')
  })
})

describe('le croquis en SVG', () => {
  test('un fond blanc puis un chemin par trait', () => {
    const c = { ...nouveauCroquis(0, 0).contenu, traits: [{ points: [0, 0, 10, 10], couleur: '#ff5757', epaisseur: 3 }] }
    const svg = croquisEnSvg(c)
    expect(svg).toContain('fill="#ffffff"')
    expect(svg).toContain('stroke="#ff5757"')
    expect(svg.match(/<path/g)).toHaveLength(1)
  })
})

describe("l'effet d'encre", () => {
  const points = [0, 0, 10, 2, 22, 8, 30, 20, 34, 34]
  it('dessine un trait affiné en contour plein et fermé', () => {
    const dt = dessinTrait(points, 4, AFFINAGE)
    expect(dt.plein).toBe(true)
    expect(dt.d.startsWith('M') && dt.d.endsWith('Z')).toBe(true)
    expect(traitEnSvg({ points, couleur: '#323b4a', epaisseur: 4, affinage: AFFINAGE })).toContain('fill="#323b4a"')
  })
  it("garde la ligne d'épaisseur constante sans affinage, et pour le très épais", () => {
    expect(dessinTrait(points, 4).plein).toBe(false)
    expect(affinageDe(EPAISSEURS_TRAIT.length - 1)).toBe(0)
    expect(affinageDe(0)).toBe(AFFINAGE)
  })
  it('élargit un trait plein par son contour, pas par son épaisseur', () => {
    const a = attributsTrait(dessinTrait(points, 4, AFFINAGE), 'red', 3)
    expect([a.fill, a.stroke, a.strokeWidth]).toEqual(['red', 'red', 3])
    expect(attributsTrait(dessinTrait(points, 4), 'red', 3).strokeWidth).toBe(7)
  })
})

describe('la pression du stylet', () => {
  const pen = (pressure: number) => ({ pointerType: 'pen', pressure })
  it('garde la pression du stylet, pas celle de la souris ni du doigt', () => {
    expect(pressionDe(pen(0.4))).toBe(0.4)
    expect(pressionDe(pen(0))).toBe(0.05)
    expect(pressionDe({ pointerType: 'mouse', pressure: 0.5 })).toBeNull()
    expect(pressionDe({ pointerType: 'touch', pressure: 0.5 })).toBeNull()
  })
  it('suit une pression par point, sans doublon', () => {
    let t = commencerTrace(0, 0, pen(0.2))
    t = prolongerTrace(t, 5, 1, pen(0.5))
    expect(prolongerTrace(t, 5, 1, pen(0.9))).toBe(t)
    t = prolongerTrace(t, 10, 3, pen(0.8))
    expect(t.pressions).toEqual([0.2, 0.5, 0.8])
    const fini = traitFini(t, '#323b4a', 2, AFFINAGE)
    expect(fini.pressions).toEqual([0.2, 0.5, 0.8])
    expect(pressionsDe(fini)).toEqual([0.2, 0.5, 0.8])
  })
  it('ne garde rien à la souris, ni pour un trait sans affinage', () => {
    const souris = prolongerTrace(commencerTrace(0, 0, { pointerType: 'mouse', pressure: 0.5 }), 4, 4, { pointerType: 'mouse', pressure: 0.5 })
    expect(traitFini(souris, '#000000', 2, AFFINAGE).pressions).toBeUndefined()
    const t = prolongerTrace(commencerTrace(0, 0, pen(0.3)), 4, 4, pen(0.6))
    expect(traitFini(t, '#000000', 8, 0).pressions).toBeUndefined()
  })
  it("la pression change le contour, et des pressions qui ne vont pas avec les points sont ignorées", () => {
    const points = [0, 0, 10, 2, 22, 8, 30, 20, 34, 34]
    const leger = dessinTrait(points, 4, AFFINAGE, true, [0.1, 0.1, 0.1, 0.1, 0.1])
    const appuye = dessinTrait(points, 4, AFFINAGE, true, [1, 1, 1, 1, 1])
    expect(leger.plein && appuye.plein).toBe(true)
    expect(leger.d).not.toBe(appuye.d)
    expect(dessinTrait(points, 4, AFFINAGE, true, [0.5]).d).toBe(dessinTrait(points, 4, AFFINAGE).d)
    expect(pressionsDe({ points, pressions: [0.5] })).toBeUndefined()
  })
})

describe('le tracé épuré (le flux du Pencil)', () => {
  // Une droite parcourue à 2 px par point, comme le Pencil à vitesse moyenne.
  const droite = Array.from({ length: 40 }, (_, i) => [i * 2, 0]).flat()

  it('écarte un point déjà passé que ramène un paquet de points groupés', () => {
    const avecRecul = [...droite.slice(0, 20), 14, 0, ...droite.slice(20)]
    expect(epurer(avecRecul, 4).points).toEqual(epurer(droite, 4).points)
  })
  it('fond les points trop serrés, garde le premier et le dernier', () => {
    const serre = Array.from({ length: 81 }, (_, i) => [i * 0.25, 0]).flat()
    const r = epurer(serre, 4).points
    expect(r.length).toBeLessThan(serre.length / 2)
    expect(r.slice(0, 2)).toEqual([0, 0])
    expect(r.at(-2)).toBeGreaterThan(19)
  })
  it('garde un vrai virage : le trait repart dans l’autre sens', () => {
    const allerRetour = [...Array.from({ length: 20 }, (_, i) => [i * 2, 0]).flat(), ...Array.from({ length: 20 }, (_, i) => [38 - i * 2, 6]).flat()]
    const r = epurer(allerRetour, 2).points
    expect(Math.min(...r.filter((_, i) => i % 2 === 0 && r[i + 1] === 6))).toBeLessThan(5)
  })
  it('les pressions muettes prennent celle de leurs voisines, et toutes sont lissées', () => {
    const points = Array.from({ length: 8 }, (_, i) => [i * 4, 0]).flat()
    const r = epurer(points, 2, [0.05, 0.4, 0.05, 0.4, 0.4, 0.05, 0.4, 0.4])
    expect(r.pressions!.every((p) => Math.abs(p - 0.4) < 1e-9)).toBe(true)
  })
  it('un trait au chapelet de reculs se dessine comme le trait propre', () => {
    const haché = droite.flatMap((v, i) => (i % 8 === 0 && i > 8 ? [droite[i - 4]!, 0, v] : [v]))
    expect(dessinTrait(haché, 4, AFFINAGE, true).d).toBe(dessinTrait(droite, 4, AFFINAGE, true).d)
  })
})

describe('le tracé épuré, à toute vitesse', () => {
  // Une droite à 240 points par seconde : à 4000 px/s, 17 px entre deux points ; chaque paquet de 4 renvoie les 2 d'avant.
  const aVitesse = (v: number) => {
    const pas = v / 240
    const propre = Array.from({ length: Math.floor(900 / pas) }, (_, i) => [i * pas, 0])
    const flux = propre.flatMap((p, i) => (i % 4 === 0 && i > 8 ? [propre[i - 2]!, propre[i - 1]!, p] : [p]))
    return { propre: propre.flat(), flux: flux.flat() }
  }
  for (const v of [300, 1500, 4000]) {
    it(`écarte les points renvoyés à ${v} px/s, même quand leur recul dépasse deux épaisseurs`, () => {
      const { propre, flux } = aVitesse(v)
      expect(epurer(flux, 4).points).toEqual(epurer(propre, 4).points)
    })
  }
  it('garde un gribouillis rapide : chaque aller et chaque retour', () => {
    const flat: number[] = []
    for (let aller = 0; aller < 6; aller++)
      for (let i = 0; i < 6; i++) flat.push(aller % 2 === 0 ? i * 20 : 100 - i * 20, aller * 6 + i)
    expect(epurer(flat, 3).points).toEqual(flat)
  })
})

describe("le trait enregistré se dessine comme à l'écran", () => {
  // La barre d'un E au Pencil, à 71 % : 40 px d'écran à 240 points par seconde, 4 px d'épaisseur, pression variable.
  const k = 7.1
  const ecran = Array.from({ length: 24 }, (_, i) => [100 + i * 1.7, 200 + Math.sin(i / 3) * 0.6]).flat()
  const pressions = Array.from({ length: 24 }, (_, i) => 0.3 + (i / 24) * 0.4)
  const nombres = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
  it('en UG (un dessin posé), une lettre courte garde sa forme au lieu de virer à la tache', () => {
    const enDirect = dessinTrait(ecran, 4, AFFINAGE, true, pressions)
    const pose = dessinTrait(ecran.map((v) => v / k), 4 / k, AFFINAGE, true, pressions)
    const a = nombres(enDirect.d)
    const b = nombres(pose.d).map((v) => v * k)
    expect(b.length).toBe(a.length)
    for (let i = 0; i < a.length; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(0.1)
  })
})

describe('le surligneur', () => {
  const points = [0, 0, 10, 2, 22, 8, 30, 20]
  it('trace une ligne constante et translucide, sans affinage ni pression', () => {
    const t = prolongerTrace(commencerTrace(0, 0, { pointerType: 'pen', pressure: 0.3 }), 8, 2, { pointerType: 'pen', pressure: 0.6 })
    const fini = traitFini(t, '#ffd14d', 18, AFFINAGE, true)
    expect(fini).toEqual({ points: [0, 0, 8, 2], couleur: '#ffd14d', epaisseur: 18, surligneur: true })
    const a = attributsTrait(dessinDuTrait({ points, couleur: '#ffd14d', epaisseur: 18, surligneur: true }), '#ffd14d')
    expect([a.fill, a.strokeWidth, a.strokeOpacity]).toEqual(['none', 18, OPACITE_SURLIGNEUR])
    // Son contour de choix ou de gomme reste opaque.
    expect(attributsTrait(dessinDuTrait({ points, couleur: '#ffd14d', epaisseur: 18, surligneur: true }), 'red', 3).strokeOpacity).toBeUndefined()
    expect(traitEnSvg({ points, couleur: '#ffd14d', epaisseur: 18, surligneur: true })).toContain(`stroke-opacity="${OPACITE_SURLIGNEUR}"`)
  })
})
