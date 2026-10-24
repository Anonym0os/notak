import { describe, expect, it } from 'vitest'
import type { Arbre, Id } from '../../../coeur/tableau'
import { ajouterLimite, ajouterRelation, ajouterResume } from './elements'
import { appliquerGeste } from './gestes'
import {
  MULTIPLE,
  POLICES,
  cibleDeMiseAJour,
  cibler,
  commun,
  epaisseurProche,
  familleDe,
  famillesPour,
  genreDe,
  nomGraisse,
  nomPolice,
  patchCouleurBordure,
  patchCouleurRemplissage,
  patchEpaisseurBranche,
  patchGras,
  patchMotifBordure,
  patchMotifBranche,
  patchMotifRemplissage,
  peutEffiler,
  valeursDe,
} from './style'
import { ajouterEnfant, ajouterFlottant, lire, nouvelArbre } from './sujets'

/** Un central, deux principaux (a, b), un sous-sujet sous a (aa), un flottant. */
function carte() {
  let a = nouvelArbre('Centre')
  const c = lire(a).central
  let pa: Id, pb: Id, aa: Id, fl: Id
  ;[a, pa] = ajouterEnfant(a, c, 'A')
  ;[a, pb] = ajouterEnfant(a, c, 'B')
  ;[a, aa] = ajouterEnfant(a, pa, 'AA')
  ;[a, fl] = ajouterFlottant(a, { x: 200, y: 100 }, 'Libre')
  return { a, c, pa, pb, aa, fl }
}

const titre = (a: Arbre, id: Id) => a.sujets[id]!.titre

describe('ce que la sélection désigne', () => {
  const { a, c, pa, pb, aa, fl } = carte()
  const l = lire(a)

  it('rien : l’état vide', () => {
    expect(cibler(a, l, [])).toEqual({ genre: 'vide' })
  })

  it('des sujets : le genre de chacun, central, principal, sous-sujet, flottant', () => {
    expect([c, pa, aa, fl].map((x) => genreDe(l, x))).toEqual(['central', 'principal', 'sous', 'flottant'])
    expect(cibler(a, l, [pa, pb])).toEqual({ genre: 'sujets', ids: [pa, pb], genres: ['principal', 'principal'] })
  })

  it('une relation, une limite : leur vue', () => {
    let b: Arbre, r: Id | null, x: Id | null
    ;[b, r] = ajouterRelation(a, pa, pb)
    ;[b, x] = ajouterLimite(b, [pa])
    const lb = lire(b)
    expect(cibler(b, lb, [r!])).toEqual({ genre: 'relations', ids: [r!] })
    expect(cibler(b, lb, [x!])).toEqual({ genre: 'limites', ids: [x!] })
  })

  it('un mélange (un sujet et une relation) : l’état vide', () => {
    const [b, r] = ajouterRelation(a, pa, pb)
    expect(cibler(b, lire(b), [pa, r!])).toEqual({ genre: 'vide' })
  })

  it('le sujet d’un résumé : la vue Résumé, avec son accolade', () => {
    const [b, sujet] = ajouterResume(a, [pa, pb], 'En bref')
    const lb = lire(b)
    const cible = cibler(b, lb, [sujet!])
    expect(cible.genre).toBe('resume')
    if (cible.genre === 'resume') expect(cible.resumes).toHaveLength(1)
    expect(titre(b, sujet!)).toBe('En bref')
  })
})

describe('les valeurs communes', () => {
  it('une valeur partagée, ou « multiple »', () => {
    expect(commun([2, 2, 2])).toBe(2)
    expect(commun([2, 3])).toBe(MULTIPLE)
    expect(commun([undefined, undefined])).toBeUndefined()
  })
})

describe('les valeurs effectives d’un sujet', () => {
  it('suivent le rang et le thème : le central est centré, un principal à gauche', () => {
    const { a, c, pa } = carte()
    const l = lire(a)
    expect(valeursDe(a, l, c).alignement).toBe('centre')
    expect(valeursDe(a, l, pa).alignement).toBe('gauche')
    expect(valeursDe(a, l, c).taille).toBeGreaterThan(valeursDe(a, l, pa).taille)
    expect(valeursDe(a, l, c).motifRemplissage).toBe('plein')
    expect(valeursDe(a, l, pa).niveau).toBe(1)
  })

  it('montrent ce que le style change, et « aucun » quand il n’y a ni fond ni bordure', () => {
    const { a, pa } = carte()
    const e = appliquerGeste(a, { type: 'style', ids: [pa], style: { motifRemplissage: 'aucun', motifBordure: 'aucun', epaisseurBordure: 0, graisse: 300, barre: true, casse: 'majuscules', taille: 22 } }, () => 'x')!
    const v = valeursDe(e.arbre, lire(e.arbre), pa)
    expect(v.remplissage).toBeNull()
    expect(v.motifRemplissage).toBe('aucun')
    expect(v.bordure).toBeNull()
    expect(v.motifBordure).toBe('aucun')
    expect(v.epaisseurBordure).toBe(0)
    expect(v).toMatchObject({ graisse: 300, barre: true, casse: 'majuscules', taille: 22, surcharge: true })
  })

  it('la largeur mesurée est celle du sujet, la largeur imposée la remplace', () => {
    const { a, pa } = carte()
    const e = appliquerGeste(a, { type: 'largeur', ids: [pa], largeur: 180 }, () => 'x')!
    const v = valeursDe(e.arbre, lire(e.arbre), pa)
    expect(v.largeur).toBe(180)
    expect(v.largeurMesuree).toBe(180)
    expect(valeursDe(a, lire(a), pa).largeur).toBeUndefined()
  })

  it('la structure effective d’un sujet suit son parent tant qu’il n’en a pas une', () => {
    const { a, pa } = carte()
    const v = valeursDe(a, lire(a), pa)
    expect(v.structure).toBeUndefined()
    expect(v.structureEffective).toBe('carte')
  })
})

describe('les règles qui lient des réglages', () => {
  it('« aucune bordure » met l’épaisseur à 0 ; un motif choisi à 0 la remet à 2', () => {
    expect(patchMotifBordure('aucun', 2)).toEqual({ motifBordure: 'aucun', epaisseurBordure: 0 })
    expect(patchMotifBordure('tirets', 0)).toEqual({ motifBordure: 'tirets', epaisseurBordure: 2 })
    expect(patchMotifBordure('tirets', 3)).toEqual({ motifBordure: 'tirets' })
  })

  it('une couleur choisie sans remplissage le rend plein', () => {
    expect(patchCouleurRemplissage('aucun', '#ff0000')).toEqual({ remplissage: '#ff0000', motifRemplissage: 'plein' })
    expect(patchCouleurRemplissage('plein', '#ff0000')).toEqual({ remplissage: '#ff0000' })
    expect(patchCouleurRemplissage('aucun', undefined)).toEqual({ remplissage: undefined })
    expect(patchMotifRemplissage('diagonales')).toEqual({ motifRemplissage: 'diagonales' })
  })

  it('une couleur de bordure choisie sans bordure la fait réapparaître', () => {
    expect(patchCouleurBordure('aucun', 0, '#00ff00')).toEqual({ bordure: '#00ff00', motifBordure: 'plein', epaisseurBordure: 2 })
    expect(patchCouleurBordure('plein', 2, '#00ff00')).toEqual({ bordure: '#00ff00' })
  })

  it('la ligne d’une branche suit la même règle', () => {
    expect(patchMotifBranche('aucun', 2)).toEqual({ motif: 'aucun', epaisseurBranche: 0 })
    expect(patchMotifBranche('plein', 0)).toEqual({ motif: 'plein', epaisseurBranche: 2 })
  })

  it('une épaisseur effilée change l’épaisseur et l’effilage ensemble', () => {
    expect(patchEpaisseurBranche(3, true)).toEqual({ epaisseurBranche: 3, effilee: true })
    expect(patchEpaisseurBranche(3, false)).toEqual({ epaisseurBranche: 3, effilee: undefined })
    expect(peutEffiler('courbe')).toBe(true)
    expect(peutEffiler('coudee')).toBe(true)
    expect(peutEffiler('organique')).toBe(true)
    expect(peutEffiler('aucune')).toBe(false)
    expect(peutEffiler(null)).toBe(false)
  })

  it('le gras passe de 700 à 400 et l’inverse', () => {
    expect(patchGras(400)).toEqual({ graisse: 700, gras: undefined })
    expect(patchGras(700)).toEqual({ graisse: 400, gras: undefined })
    expect(patchGras(600).graisse).toBe(400)
  })

  it('1,5 pt se lit « mince » (2) ; les cinq épaisseurs sont 1, 2, 3, 5, 8', () => {
    expect(epaisseurProche(1.5)).toBe(2)
    expect(epaisseurProche(1.75)).toBe(2)
    expect(epaisseurProche(2.5)).toBe(3)
    expect(epaisseurProche(6)).toBe(5)
    expect(epaisseurProche(20)).toBe(8)
  })
})

describe('les polices, graisses et structures', () => {
  it('nomment une pile par son nom', () => {
    expect(nomPolice(POLICES[5]!.valeur)).toBe('Georgia')
    expect(nomPolice('"Fira Sans", sans-serif')).toBe('Fira Sans')
    expect(nomGraisse(500)).toBe('Medium')
    expect(nomGraisse(430)).toBe('Regular')
  })

  it('rangent chaque structure dans sa famille ; la carte est réservée au central', () => {
    expect(familleDe('carte-horaire').id).toBe('carte')
    expect(familleDe('arete-gauche').id).toBe('arete')
    expect(famillesPour(true).map((f) => f.id)).toContain('carte')
    expect(famillesPour(false).map((f) => f.id)).not.toContain('carte')
    expect(famillesPour(false)).toHaveLength(7)
  })
})

describe('mettre à jour', () => {
  it('les sujets du même niveau, ou les sous-sujets', () => {
    const { a, pa, pb, aa } = carte()
    const l = lire(a)
    expect(cibleDeMiseAJour(l, pa, 'niveau')).toEqual(expect.arrayContaining([pb]))
    expect(cibleDeMiseAJour(l, pa, 'niveau')).not.toContain(aa)
    expect(cibleDeMiseAJour(l, pa, 'sous-sujets')).toEqual([aa])
    expect(cibleDeMiseAJour(l, pb, 'sous-sujets')).toEqual([])
  })
})
