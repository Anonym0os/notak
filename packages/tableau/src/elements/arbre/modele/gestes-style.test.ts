import { describe, expect, it } from 'vitest'
import type { Id } from '../../../coeur/tableau'
import { ajouterLimite, ajouterRelation, ajouterResume, numeroDe } from './elements'
import { appliquerGeste } from './gestes'
import { fusionner } from './gestes-style'
import { ajouterEnfant, lire, nouvelArbre } from './sujets'

const titre = () => 'x'

function carte() {
  let a = nouvelArbre('Centre')
  const c = lire(a).central
  let pa: Id, pb: Id, pc: Id, aa: Id, ab: Id
  ;[a, pa] = ajouterEnfant(a, c, 'A')
  ;[a, pb] = ajouterEnfant(a, c, 'B')
  ;[a, pc] = ajouterEnfant(a, c, 'C')
  ;[a, aa] = ajouterEnfant(a, pa, 'AA')
  ;[a, ab] = ajouterEnfant(a, pa, 'AB')
  return { a, c, pa, pb, pc, aa, ab }
}

describe('fusionner un style', () => {
  it('pose, retire (undefined) et laisse un style vide disparaître', () => {
    expect(fusionner({ a: 1, b: 2 }, { b: undefined, c: 3 })).toEqual({ a: 1, c: 3 })
    expect(fusionner({ a: 1 }, { a: undefined })).toBeUndefined()
    expect(fusionner(undefined, { a: 1 })).toEqual({ a: 1 })
  })
})

describe('les gestes de style d’un sujet', () => {
  it('plusieurs réglages d’un coup : un seul geste, une seule étape d’historique', () => {
    const { a, pa } = carte()
    const e = appliquerGeste(a, { type: 'style', ids: [pa], style: { motifBordure: 'aucun', epaisseurBordure: 0 } }, titre)!
    expect(e.arbre.sujets[pa]!.style).toEqual({ motifBordure: 'aucun', epaisseurBordure: 0 })
  })

  it('réinitialiser retire le style entier', () => {
    const { a, pa } = carte()
    const e1 = appliquerGeste(a, { type: 'style', ids: [pa], style: { forme: 'etoile', taille: 30 } }, titre)!
    const e2 = appliquerGeste(e1.arbre, { type: 'style', ids: [pa], style: null }, titre)!
    expect(e2.arbre.sujets[pa]!.style).toBeUndefined()
  })

  it('la largeur imposée : arrondie, au moins 1 ; « adapter » la retire', () => {
    const { a, pa, pb } = carte()
    const e1 = appliquerGeste(a, { type: 'largeur', ids: [pa, pb], largeur: 150.4 }, titre)!
    expect(e1.arbre.sujets[pa]!.largeur).toBe(150)
    expect(e1.arbre.sujets[pb]!.largeur).toBe(150)
    expect(appliquerGeste(e1.arbre, { type: 'largeur', ids: [pa], largeur: 0 }, titre)!.arbre.sujets[pa]!.largeur).toBe(1)
    const e2 = appliquerGeste(e1.arbre, { type: 'largeur', ids: [pa], largeur: undefined }, titre)!
    expect(e2.arbre.sujets[pa]!.largeur).toBeUndefined()
    expect(e2.arbre.sujets[pb]!.largeur).toBe(150)
  })

  it('mettre à jour : le style d’un sujet sur ceux de son niveau, ou sur ses sous-sujets', () => {
    const { a, pa, pb, pc, aa, ab } = carte()
    const e1 = appliquerGeste(a, { type: 'style', ids: [pa], style: { couleurTexte: '#ff0000' } }, titre)!
    const niveau = appliquerGeste(e1.arbre, { type: 'mettreAJourStyle', id: pa, portee: 'niveau' }, titre)!
    expect([pb, pc].map((x) => niveau.arbre.sujets[x]!.style)).toEqual([{ couleurTexte: '#ff0000' }, { couleurTexte: '#ff0000' }])
    expect(niveau.arbre.sujets[aa]!.style).toBeUndefined()
    const sous = appliquerGeste(e1.arbre, { type: 'mettreAJourStyle', id: pa, portee: 'sous-sujets' }, titre)!
    expect([aa, ab].map((x) => sous.arbre.sujets[x]!.style)).toEqual([{ couleurTexte: '#ff0000' }, { couleurTexte: '#ff0000' }])
    expect(sous.arbre.sujets[pb]!.style).toBeUndefined()
  })
})

describe('la numérotation des frères', () => {
  it('copie la numérotation d’un sujet sur ses frères', () => {
    const { a, pa, pb, pc, aa, ab } = carte()
    const e1 = appliquerGeste(a, { type: 'porter', ids: [pa], champ: 'numerotation', valeur: { motif: 'romain', paliers: true } }, titre)!
    const e2 = appliquerGeste(e1.arbre, { type: 'numeroterFreres', id: pa }, titre)!
    expect(e2.arbre.sujets[pb]!.numerotation).toEqual({ motif: 'romain', paliers: true })
    expect(e2.arbre.sujets[pc]!.numerotation).toEqual({ motif: 'romain', paliers: true })
    expect(numeroDe(lire(e2.arbre), ab)).toBe('II')
    expect(numeroDe(lire(e2.arbre), aa)).toBe('I')
  })

  it('« commencer depuis le début » retire le numéro du parent devant ceux des enfants', () => {
    const { a, pa, aa, ab } = carte()
    const c = lire(a).central
    let b = appliquerGeste(a, { type: 'porter', ids: [c], champ: 'numerotation', valeur: { motif: 'arabe', paliers: true } }, titre)!.arbre
    b = appliquerGeste(b, { type: 'porter', ids: [pa], champ: 'numerotation', valeur: { motif: 'arabe', paliers: true } }, titre)!.arbre
    expect(numeroDe(lire(b), aa)).toBe('1.1')
    expect(numeroDe(lire(b), ab)).toBe('1.2')
    b = appliquerGeste(b, { type: 'porter', ids: [pa], champ: 'numerotation', valeur: { motif: 'arabe', paliers: true, debut: true } }, titre)!.arbre
    expect(numeroDe(lire(b), aa)).toBe('1')
    expect(numeroDe(lire(b), ab)).toBe('2')
  })
})

describe('le style d’une relation, d’une limite, d’un résumé', () => {
  it('une relation : les réglages s’ajoutent, un correctif vide les retire, réinitialiser rend la main au thème', () => {
    const { a, pa, pb } = carte()
    const [b, r] = ajouterRelation(a, pa, pb)
    const e1 = appliquerGeste(b, { type: 'styleObjet', ids: [r!], style: { forme: 'zigzag', motif: 'points', epaisseur: 3, pointeDepart: 'point' } }, titre)!
    expect(e1.arbre.relations![r!]!.style).toEqual({ forme: 'zigzag', motif: 'points', epaisseur: 3, pointeDepart: 'point' })
    const e2 = appliquerGeste(e1.arbre, { type: 'styleObjet', ids: [r!], style: { motif: undefined } }, titre)!
    expect(e2.arbre.relations![r!]!.style).toEqual({ forme: 'zigzag', epaisseur: 3, pointeDepart: 'point' })
    const e3 = appliquerGeste(e2.arbre, { type: 'styleObjet', ids: [r!], style: null }, titre)!
    expect(e3.arbre.relations![r!]!.style).toBeUndefined()
  })

  it('réinitialiser une relation rend aussi ses anciennes valeurs (forme, pointes)', () => {
    const { a, pa, pb } = carte()
    const [b, r] = ajouterRelation(a, pa, pb)
    const e1 = appliquerGeste(b, { type: 'relationStyle', id: r!, forme: 'droite', pointes: { depart: true, arrivee: true } }, titre)!
    expect(e1.arbre.relations![r!]!.forme).toBe('droite')
    const e2 = appliquerGeste(e1.arbre, { type: 'styleObjet', ids: [r!], style: null }, titre)!
    expect(e2.arbre.relations![r!]).toEqual({ de: pa, vers: pb })
  })

  it('une limite et un résumé', () => {
    const { a, pa, pb } = carte()
    const [b, x] = ajouterLimite(a, [pa])
    const e1 = appliquerGeste(b, { type: 'styleObjet', ids: [x!], style: { forme: 'festons', remplissage: '#ff000033', couleurTexte: '#112233' } }, titre)!
    expect(e1.arbre.limites![x!]!.style).toEqual({ forme: 'festons', remplissage: '#ff000033', couleurTexte: '#112233' })
    const [c2] = ajouterResume(e1.arbre, [pa, pb], 'R')
    const rid = Object.keys(c2.resumes!)[0]!
    const e2 = appliquerGeste(c2, { type: 'styleObjet', ids: [rid], style: { forme: 'carre', epaisseur: 5 } }, titre)!
    expect(e2.arbre.resumes![rid]!.style).toEqual({ forme: 'carre', epaisseur: 5 })
    expect(appliquerGeste(e2.arbre, { type: 'styleObjet', ids: [rid], style: null }, titre)!.arbre.resumes![rid]!.style).toBeUndefined()
  })
})
