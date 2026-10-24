import { describe, expect, it } from 'vitest'
import type { Arbre, Id, StyleSujet } from '../../coeur/tableau'
import { appliquerCasse, brancheDe, couleurDe, couleursDe, habitDe, limiteEffective, mesurer, relationEffective, resumeEffectif, separerAlpha, sur, tiretsDe } from './apparence'
import { appliquerGeste } from './modele/gestes'
import { ajouterEnfant, lire, nouvelArbre } from './modele/sujets'
import { THEMES } from './themes'

const theme = THEMES[0]!

function carte(style?: StyleSujet, titre = 'Un titre assez long pour passer à la ligne quelque part') {
  let a: Arbre = nouvelArbre('Centre')
  const c = lire(a).central
  let p: Id
  ;[a, p] = ajouterEnfant(a, c, titre)
  if (style) a = appliquerGeste(a, { type: 'style', ids: [p], style }, () => 'x')!.arbre
  const l = lire(a)
  return { a, l, c, p, h: habitDe(l, p, theme) }
}

describe('la mesure d’un sujet suit son style', () => {
  it('la casse change le texte mesuré et dessiné', () => {
    expect(appliquerCasse('bonjour le monde', 'majuscules')).toBe('BONJOUR LE MONDE')
    expect(appliquerCasse('BONJOUR', 'minuscules')).toBe('bonjour')
    expect(appliquerCasse('bonjour le l’été-ici', 'capitales')).toBe('Bonjour Le L’Été-Ici')
    expect(appliquerCasse('inchangé', undefined)).toBe('inchangé')
    const { h } = carte({ casse: 'majuscules' }, 'abc')
    expect(mesurer('abc', h).lignes).toEqual(['ABC'])
  })

  it('une taille de police plus grande agrandit le sujet', () => {
    const [petit, grand] = [carte({ taille: 10 }, 'Titre'), carte({ taille: 40 }, 'Titre')]
    const [mp, mg] = [mesurer('Titre', petit.h), mesurer('Titre', grand.h)]
    expect(mg.l).toBeGreaterThan(mp.l)
    expect(mg.h).toBeGreaterThan(mp.h)
  })

  it('une largeur imposée fixe la largeur du sujet et fait passer le titre à la ligne', () => {
    const libre = mesurer('Un titre assez long pour passer à la ligne', carte(undefined, 'x').h)
    const { a, p } = carte()
    const imposee = appliquerGeste(a, { type: 'largeur', ids: [p], largeur: 120 }, () => 'x')!.arbre
    const h = habitDe(lire(imposee), p, theme)
    const m = mesurer('Un titre assez long pour passer à la ligne', h)
    expect(m.l).toBe(120)
    expect(m.lignes.length).toBeGreaterThan(libre.lignes.length)
    // Le texte tient dans la largeur, aux marges près.
    expect(m.texte.x + m.texte.l).toBeLessThanOrEqual(120)
  })

  it('l’alignement range le bloc de texte à gauche, au centre ou à droite d’un sujet plus large que lui', () => {
    const rangee = (alignement: 'gauche' | 'centre' | 'droite') => {
      const { a, p } = carte({ alignement }, 'Court')
      const b = appliquerGeste(a, { type: 'largeur', ids: [p], largeur: 300 }, () => 'x')!.arbre
      return mesurer('Court', habitDe(lire(b), p, theme)).rangee.x
    }
    const [g, c, d] = [rangee('gauche'), rangee('centre'), rangee('droite')]
    expect(g).toBeLessThan(c)
    expect(c).toBeLessThan(d)
  })

  it('le cercle tient dans un carré, texte recentré', () => {
    const m = mesurer('Un titre assez long', carte({ forme: 'cercle' }, 'Un titre').h)
    expect(m.l).toBe(m.h)
  })

  it('une forme qui ronge le texte (ellipse) agrandit les marges', () => {
    const [r, e] = [carte({ forme: 'rectangle' }, 'Titre'), carte({ forme: 'ellipse' }, 'Titre')]
    expect(mesurer('Titre', e.h).l).toBeGreaterThan(mesurer('Titre', r.h).l)
  })
})

describe('les couleurs effectives', () => {
  it('« aucun remplissage » retire le fond ; le texte se lit alors sur le fond de la carte', () => {
    const { l, c, h } = carte({ motifRemplissage: 'aucun' })
    const hc = habitDe(l, c, theme)
    const avec = couleursDe(hc, 'central', theme, undefined, null)
    const sans = couleursDe({ ...hc, motifRemplissage: 'aucun' }, 'central', theme, undefined, null)
    expect(avec.fond).not.toBe('none')
    expect(avec.plein).toBe(true)
    expect(sans.fond).toBe('none')
    expect(sans.plein).toBe(false)
    expect(sans.encre).toBe(theme.texte ?? 'var(--notak-arbre-texte)')
    expect(h.motifRemplissage).toBe('aucun')
  })

  it('une bordure d’épaisseur 0, ou « aucune », disparaît', () => {
    const { l, p } = carte({ bordure: '#ff0000', epaisseurBordure: 0 })
    expect(couleursDe(habitDe(l, p, theme), 'principal', theme, undefined, null).bordure).toBe('none')
    const { l: l2, p: p2 } = carte({ bordure: '#ff0000', epaisseurBordure: 2 })
    expect(couleursDe(habitDe(l2, p2, theme), 'principal', theme, undefined, null).bordure).toBe('#ff0000')
  })

  it('une encre lisible sur un fond clair ou foncé, avec ou sans opacité', () => {
    expect(sur('#ffffff')).toBe('#1f2328')
    expect(sur('#101010')).toBe('#ffffff')
    expect(sur('#ffffff80')).toBe('#1f2328')
    expect(sur('var(--x)')).toBe('#ffffff')
  })

  it('sépare l’opacité d’une couleur à huit chiffres', () => {
    expect(separerAlpha('#ff0000')).toEqual({ couleur: '#ff0000', opacite: 1 })
    expect(separerAlpha('#ff000080')).toEqual({ couleur: '#ff0000', opacite: 0.5 })
    expect(separerAlpha('var(--a)')).toEqual({ couleur: 'var(--a)', opacite: 1 })
  })

  it('les motifs de trait ont leur tiret', () => {
    expect(tiretsDe('plein')).toBeUndefined()
    expect(tiretsDe('tirets')).toBe('7 5')
    expect(tiretsDe('tirets-main')).toBe('7 5')
    expect(tiretsDe('tiret-point')).toBe('7 4 1.5 4')
  })
})

describe('la branche d’un sujet', () => {
  it('hérite du premier ancêtre qui la règle, pointe et motif compris', () => {
    const { a, l, c, p } = carte()
    const b = appliquerGeste(a, { type: 'style', ids: [c], style: { motif: 'tirets', pointeBranche: 'diamant', epaisseurBranche: 5, branche: 'anse' } }, () => 'x')!.arbre
    expect(brancheDe(lire(b), p)).toEqual({ forme: 'anse', epaisseur: 5, effilee: false, motif: 'tirets', pointe: 'diamant' })
    expect(brancheDe(l, p)).toEqual({ forme: null, epaisseur: null, effilee: false, motif: 'plein', pointe: 'aucune' })
  })

  it('la série de couleurs du central remplace celle du thème ; une seule couleur : celle du central', () => {
    const { a, c, p } = carte()
    const serie = appliquerGeste(a, { type: 'style', ids: [c], style: { serieCouleurs: ['#111111', '#222222'] } }, () => 'x')!.arbre
    expect(couleurDe(lire(serie), p, theme)).toBe('#111111')
    const une = appliquerGeste(a, { type: 'style', ids: [c], style: { couleurBranche: '#abcdef' } }, () => 'x')!.arbre
    expect(couleurDe(lire(une), p, theme, true)).toBe('#abcdef')
    expect(couleurDe(lire(une), p, theme, false)).toBe(theme.palette[0])
  })
})

describe('les valeurs d’une relation, d’une limite et d’un résumé', () => {
  it('une relation sans style : courbe en tirets, pointe à l’arrivée ; ses anciennes valeurs se lisent encore', () => {
    expect(relationEffective({ de: 'a', vers: 'b' })).toMatchObject({ forme: 'courbe', motif: 'tirets', epaisseur: 1.5, pointeDepart: 'aucune', pointeArrivee: 'triangle' })
    expect(relationEffective({ de: 'a', vers: 'b', forme: 'droite', pointes: { depart: true, arrivee: false } })).toMatchObject({ forme: 'droite', pointeDepart: 'triangle', pointeArrivee: 'aucune' })
    expect(relationEffective({ de: 'a', vers: 'b', forme: 'droite', style: { forme: 'zigzag', pointeArrivee: 'point' } })).toMatchObject({ forme: 'zigzag', pointeArrivee: 'point' })
  })

  it('une limite : rectangle arrondi, tirets ; un résumé : accolade pleine', () => {
    expect(limiteEffective({ de: 'a' })).toMatchObject({ forme: 'arrondi', motif: 'tirets', motifRemplissage: 'plein', remplissage: undefined })
    expect(limiteEffective({ de: 'a', style: { forme: 'croix', taille: 20, casse: 'majuscules' } }).texte).toMatchObject({ taille: 20, casse: 'majuscules' })
    expect(resumeEffectif(undefined)).toMatchObject({ forme: 'accolade', motif: 'plein' })
  })
})
