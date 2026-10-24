import { describe, expect, it } from 'vitest'
import type { Arbre, Id } from '../../../coeur/tableau'
import { appliquerGeste } from './gestes'
import { appliquerStyleCarte, memeStyle, styleDeCarte, styleVisuel } from './reglages'
import { ajouterEnfant, ajouterFlottant, changerSujet, lire, nouvelArbre } from './sujets'
import { titreNeuf } from './titres'

/** Une carte : central → A (A1), B ; un flottant F. Chaque sujet porte des réglages posés à la main. */
function exemple() {
  let a = nouvelArbre('C')
  const c = lire(a).central
  let A: Id, B: Id, A1: Id, F: Id
  ;[a, A] = ajouterEnfant(a, c, 'A')
  ;[a, B] = ajouterEnfant(a, c, 'B')
  ;[a, A1] = ajouterEnfant(a, A, 'A1')
  ;[a, F] = ajouterFlottant(a, { x: 300, y: 0 }, 'F')
  for (const id of [A, B, A1, F]) a = changerSujet(a, id, (s) => ({ ...s, style: { police: 'Georgia', remplissage: '#ff0000', couleurBranche: '#00ff00', epaisseurBranche: 6, effilee: true, gras: true } }))
  return { a, c, A, B, A1, F }
}

const faire = (a: Arbre, g: Parameters<typeof appliquerGeste>[1]): Arbre => appliquerGeste(a, g, titreNeuf)!.arbre

describe('squelette', () => {
  it('pose la structure du central et retire celles des sujets principaux', () => {
    let { a, A, c } = exemple()
    a = faire(a, { type: 'structure', ids: [A], structure: 'accolade-droite' })
    a = faire(a, { type: 'squelette', squelette: 'organigramme-1' })
    expect(a.sujets[c]!.structure).toBe('organigramme-bas')
    expect(a.sujets[A]!.structure).toBeUndefined()
    expect(a.squelette).toBe('organigramme-1')
  })

  it('efface la police et la largeur de ligne de toute la carte, et les largeurs de sujets ; les couleurs restent', () => {
    let { a, A, c } = exemple()
    a = { ...a, police: 'Georgia', largeurBranche: 5, effile: true, theme: 'ocean', fond: '#112233' }
    a = changerSujet(a, A, (s) => ({ ...s, largeur: 180 }))
    a = faire(a, { type: 'squelette', squelette: 'carte-1' })
    expect(a.police).toBeUndefined()
    expect(a.largeurBranche).toBeUndefined()
    expect(a.effile).toBeUndefined()
    expect(a.sujets[A]!.largeur).toBeUndefined()
    // Le thème de couleur et le fond sont à lui, pas au squelette ; le style posé à la main sur un sujet reste.
    expect(a.theme).toBe('ocean')
    expect(a.fond).toBe('#112233')
    expect(a.sujets[A]!.style?.remplissage).toBe('#ff0000')
    expect(a.sujets[c]!.structure).toBe('carte')
  })

  it('l’effilé suit le squelette : un squelette effilé l’allume, un autre l’éteint', () => {
    let { a } = exemple()
    a = faire(a, { type: 'squelette', squelette: 'carte-2' })
    expect(a.effile).toBe(true)
    a = faire(a, { type: 'squelette', squelette: 'carte-1' })
    expect(a.effile).toBeUndefined()
  })

  it('un squelette inconnu ne change rien', () => {
    const { a } = exemple()
    expect(faire(a, { type: 'squelette', squelette: 'nexistepas' })).toBe(a)
  })
})

describe('carte équilibrée', () => {
  it('éteinte : le central passe à la carte non équilibrée ; allumée : au sens horaire', () => {
    const { a, c } = exemple()
    const non = faire(a, { type: 'equilibrer', actif: false })
    expect(non.sujets[c]!.structure).toBe('carte-libre')
    expect(faire(non, { type: 'equilibrer', actif: true }).sujets[c]!.structure).toBe('carte-horaire')
  })

  it('ne touche pas une carte qui l’est déjà (le central garde son sens antihoraire)', () => {
    let { a, c } = exemple()
    a = faire(a, { type: 'structure', ids: [c], structure: 'carte-antihoraire' })
    expect(faire(a, { type: 'equilibrer', actif: true })).toBe(a)
  })
})

describe('thème de couleur', () => {
  it('efface les couleurs posées à la main, le fond, le jeu de couleurs et la couleur de ligne', () => {
    let { a, A, F } = exemple()
    a = { ...a, fond: '#101010', jeuCouleurs: ['#111111'], couleurLigne: '#222222', options: { uneCouleur: true } }
    const r = faire(a, { type: 'themeCouleur', choix: { theme: 'ocean' } })
    expect(r.theme).toBe('ocean')
    expect(r.fond).toBeUndefined()
    expect(r.jeuCouleurs).toBeUndefined()
    expect(r.couleurLigne).toBeUndefined()
    expect(r.options).toBeUndefined()
    for (const id of [A, F]) {
      expect(r.sujets[id]!.style).toEqual({ police: 'Georgia', epaisseurBranche: 6, effilee: true, gras: true })
    }
  })

  it('une variante à une couleur : branches d’une seule couleur, celle de l’accent', () => {
    const { a } = exemple()
    const r = faire(a, { type: 'themeCouleur', choix: { theme: 'foret', accent: '#2f7d4f' } })
    expect(r.options?.uneCouleur).toBe(true)
    expect(r.couleurLigne).toBe('#2f7d4f')
  })

  it('le classique est le thème par défaut : la clé disparaît', () => {
    const { a } = exemple()
    expect(faire({ ...a, theme: 'nuit' }, { type: 'themeCouleur', choix: { theme: 'classique' } }).theme).toBeUndefined()
  })

  it('un thème de couleur à soi garde son nom et ses couleurs dans la carte', () => {
    const { a } = exemple()
    const r = faire(a, { type: 'themeCouleur', choix: { theme: 'perso:1', perso: { nom: 'Mien', palette: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'] } } })
    expect(r.theme).toBe('perso:1')
    expect(r.themePerso).toEqual({ nom: 'Mien', palette: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'] })
    // Un autre thème l'oublie.
    expect(faire(r, { type: 'themeCouleur', choix: { theme: 'nuit' } }).themePerso).toBeUndefined()
  })
})

describe('fond, polices, largeur', () => {
  it('le fond se pose et se retire', () => {
    const { a } = exemple()
    const avec = faire(a, { type: 'fond', couleur: '#aabbcc' })
    expect(avec.fond).toBe('#aabbcc')
    expect(faire(avec, { type: 'fond', couleur: null }).fond).toBeUndefined()
  })

  it('la police globale retire celles posées sujet par sujet ; « Par défaut » la retire', () => {
    const { a, A } = exemple()
    const r = faire(a, { type: 'policeGlobale', police: 'Verdana' })
    expect(r.police).toBe('Verdana')
    expect(r.sujets[A]!.style?.police).toBeUndefined()
    expect(r.sujets[A]!.style?.gras).toBe(true)
    expect(faire(r, { type: 'policeGlobale', police: null }).police).toBeUndefined()
  })

  it('la police CJK n’efface rien', () => {
    const { a, A } = exemple()
    const r = faire(a, { type: 'policeCjk', police: 'Yu Gothic' })
    expect(r.policeCjk).toBe('Yu Gothic')
    expect(r.sujets[A]!.style?.police).toBe('Georgia')
  })

  it('la largeur de ligne (et l’effilement) retirent la largeur et l’effilement posés sujet par sujet', () => {
    const { a, A } = exemple()
    const r = faire(a, { type: 'largeurBranche', pt: 5, effile: true })
    expect(r.largeurBranche).toBe(5)
    expect(r.effile).toBe(true)
    expect(r.sujets[A]!.style?.epaisseurBranche).toBeUndefined()
    expect(r.sujets[A]!.style?.effilee).toBeUndefined()
    const defaut = faire(r, { type: 'largeurBranche', pt: null })
    expect(defaut.largeurBranche).toBeUndefined()
    expect(defaut.effile).toBeUndefined()
  })

  it('le jeu de couleurs et la couleur de ligne se posent, un jeu vide se retire', () => {
    const { a } = exemple()
    expect(faire(a, { type: 'jeuCouleurs', couleurs: ['#111111', '#222222'] }).jeuCouleurs).toEqual(['#111111', '#222222'])
    expect(faire({ ...a, jeuCouleurs: ['#111111'] }, { type: 'jeuCouleurs', couleurs: null }).jeuCouleurs).toBeUndefined()
    expect(faire(a, { type: 'couleurLigne', couleur: '#123456' }).couleurLigne).toBe('#123456')
  })
})

describe('réglages tout ou rien', () => {
  it('se posent, et un réglage éteint n’est pas écrit', () => {
    const { a } = exemple()
    let r = faire(a, { type: 'reglage', cle: 'compacte', actif: true })
    expect(r.options).toEqual({ compacte: true })
    r = faire(r, { type: 'reglage', cle: 'toutesNotes', actif: true })
    expect(r.options).toEqual({ compacte: true, toutesNotes: true })
    r = faire(faire(r, { type: 'reglage', cle: 'compacte', actif: false }), { type: 'reglage', cle: 'toutesNotes', actif: false })
    expect(r.options).toBeUndefined()
  })

  it('éteindre les branches libres remet chaque sujet à sa place', () => {
    let { a, A } = exemple()
    a = faire(a, { type: 'reglage', cle: 'libre', actif: true })
    a = faire(a, { type: 'decaler', id: A, de: { x: 40, y: 20 } })
    expect(a.sujets[A]!.decalage).toEqual({ x: 40, y: 20 })
    a = faire(a, { type: 'reglage', cle: 'libre', actif: false })
    expect(a.sujets[A]!.decalage).toBeUndefined()
    expect(a.options?.libre).toBeUndefined()
  })

  it('allumer les flottants colorés retire le remplissage choisi des flottants, pas des autres', () => {
    const { a, A, F } = exemple()
    const r = faire(a, { type: 'reglage', cle: 'flottantsColores', actif: true })
    expect(r.sujets[F]!.style?.remplissage).toBeUndefined()
    expect(r.sujets[A]!.style?.remplissage).toBe('#ff0000')
  })
})

describe('thème personnalisé', () => {
  it('garde le style d’une carte et le rend à une autre, sans toucher son contenu ni son comportement', () => {
    const { a: source } = exemple()
    const modele: Arbre = { ...source, theme: 'ocean', fond: '#fafafa', police: 'Verdana', largeurBranche: 3, effile: true, jeuCouleurs: ['#111111'], options: { compacte: true, uneCouleur: true, libre: true } }
    const style = styleDeCarte(modele)
    expect(style.options).toEqual({ compacte: true, uneCouleur: true, libre: true })
    const { a: autre, A } = exemple()
    const cible = faire({ ...autre, options: { chevauchement: true, libre: true, toutesNotes: true } }, { type: 'styleCarte', style })
    expect(cible.theme).toBe('ocean')
    expect(cible.fond).toBe('#fafafa')
    expect(cible.police).toBe('Verdana')
    expect(cible.largeurBranche).toBe(3)
    expect(cible.effile).toBe(true)
    // L'aspect vient du thème (compacte, une couleur) ; le comportement reste à la carte (libre, chevauchement) ; une option d'aspect que le thème n'a pas s'éteint.
    expect(cible.options).toEqual({ chevauchement: true, libre: true, compacte: true, uneCouleur: true })
    expect(cible.sujets[A]!.titre).toBe('A')
    expect(cible.sujets[A]!.style?.remplissage).toBeUndefined()
    expect(memeStyle(styleDeCarte(cible), style)).toBe(true)
  })

  it('compare deux styles sur l’aspect seulement', () => {
    expect(memeStyle({ theme: 'nuit', options: { libre: true, compacte: true } }, { theme: 'nuit', options: { compacte: true } })).toBe(true)
    expect(memeStyle({ theme: 'nuit' }, { theme: 'ocean' })).toBe(false)
    expect(styleVisuel({ fond: '#AABBCC' }).fond).toBe('#aabbcc')
  })

  it('un style vide rend une carte sans réglage', () => {
    const { a } = exemple()
    const r = appliquerStyleCarte({ ...a, theme: 'nuit', fond: '#000000', police: 'Verdana' }, {})
    expect(r.theme).toBeUndefined()
    expect(r.fond).toBeUndefined()
    expect(r.police).toBeUndefined()
  })
})
