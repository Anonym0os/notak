import { describe, expect, it } from 'vitest'
import type { Arbre, Id, StyleSujet } from '../../coeur/tableau'
import {
  appliquerCasse,
  avecOpacite,
  brancheDe,
  couleurDe,
  couleursDe,
  encreDeBranche,
  epaisseurSouligne,
  habitDe,
  hexVersTsl,
  limiteEffective,
  mesurer,
  rangDe,
  relationEffective,
  resumeEffectif,
  separerAlpha,
  sur,
  teinteClaire,
  teinteSombre,
  tiretsDe,
  tslVersHex,
} from './apparence'
import { appliquerGeste } from './modele/gestes'
import { ajouterEnfant, ajouterFlottant, lire, nouvelArbre } from './modele/sujets'
import { THEMES, themeDeArbre } from './themes'

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
    const { a, c, l, p } = carte()
    const hc = habitDe(l, c, theme)
    const b = appliquerGeste(a, { type: 'style', ids: [c], style: { motifRemplissage: 'aucun' } }, () => 'x')!.arbre
    const hs = habitDe(lire(b), c, theme)
    const avec = couleursDe(hc, 'central', theme, undefined, null)
    const sans = couleursDe(hs, 'central', theme, undefined, null)
    expect(avec.fond).not.toBe('none')
    expect(avec.plein).toBe(true)
    expect(sans.fond).toBe('none')
    expect(sans.plein).toBe(false)
    expect(sans.encre).toBe(theme.texte ?? 'var(--notak-arbre-texte)')
    expect(hs.motifRemplissage).toBe('aucun')
    expect(habitDe(l, p, theme).motifRemplissage).toBeUndefined()
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
    expect(brancheDe(lire(b), p)).toEqual({ forme: 'anse', formeSquelette: null, epaisseur: 5, effilee: false, motif: 'tirets', pointe: 'diamant', radial: false })
    expect(brancheDe(l, p)).toEqual({ forme: null, formeSquelette: null, epaisseur: null, effilee: false, motif: 'plein', pointe: 'aucune', radial: false })
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

/** Un central, trois principaux, chacun avec un enfant, lui-même avec un enfant, lui-même avec un enfant (niveaux 1 à 4). */
function profonde() {
  let a: Arbre = nouvelArbre('Centre')
  const l0 = lire(a)
  const c = l0.central
  const ids: { principaux: Id[]; n2: Id[]; n3: Id[]; n4: Id[]; flottant: Id } = { principaux: [], n2: [], n3: [], n4: [], flottant: '' }
  for (let i = 0; i < 3; i++) {
    let p: Id, x: Id, y: Id, z: Id
    ;[a, p] = ajouterEnfant(a, c, `P${i}`)
    ;[a, x] = ajouterEnfant(a, p, `S${i}`)
    ;[a, y] = ajouterEnfant(a, x, `T${i}`)
    ;[a, z] = ajouterEnfant(a, y, `U${i}`)
    ids.principaux.push(p)
    ids.n2.push(x)
    ids.n3.push(y)
    ids.n4.push(z)
  }
  ;[a, ids.flottant] = ajouterFlottant(a, { x: 300, y: 100 }, 'Flottant')
  return { a, l: lire(a), c, ...ids }
}

describe('les rangs et leurs valeurs (le squelette à soulignés de Xmind)', () => {
  it('chaque rang a sa police, sa graisse, ses marges et sa largeur de texte', () => {
    const { l, c, principaux, n2, n3, flottant } = profonde()
    const h = (id: Id) => habitDe(l, id, theme)
    expect(rangDe(l, c)).toBe('central')
    expect(h(c)).toMatchObject({ police: 28, graisse: 600, marge: [15, 29], largeurMax: 300 })
    expect(h(principaux[0]!)).toMatchObject({ police: 18, graisse: 500, marge: [10, 18], largeurMax: 300 })
    expect(h(n2[0]!)).toMatchObject({ police: 14, graisse: 400, marge: [6, 6], largeurMax: 300 })
    expect(h(n3[0]!)).toMatchObject({ police: 14, graisse: 400, marge: [6, 6], largeurMax: 300 })
    expect(h(flottant)).toMatchObject({ police: 14, graisse: 500, marge: [11, 11], largeurMax: 300 })
  })

  it('la carte compacte resserre les marges de chaque rang', () => {
    const { l, c, principaux, n2, flottant } = profonde()
    const h = (id: Id) => habitDe(l, id, theme, true).marge
    expect([h(c), h(principaux[0]!), h(n2[0]!), h(flottant)]).toEqual([[12, 22], [6, 12], [4, 4], [9, 9]])
  })

  it('une police plus grande ne change pas les marges du rang', () => {
    const { a, p } = carte({ taille: 40 }, 'Titre')
    expect(habitDe(lire(a), p, theme).marge).toEqual([10, 18])
  })

  it('un texte passe à la ligne à 300 px de texte, sans les marges', () => {
    const { h } = carte(undefined, 'mot '.repeat(80))
    const m = mesurer('mot '.repeat(80), h)
    expect(m.texte.l).toBeLessThanOrEqual(300)
    expect(m.lignes.length).toBeGreaterThan(1)
    expect(m.l).toBe(Math.ceil(m.texte.l + 2 * 18))
  })

  it('le thème par défaut : principal au souligné épais (5), sous-sujets au souligné fin (1), à tous les niveaux', () => {
    const { l, principaux, n2, n3, n4 } = profonde()
    const h = (id: Id) => habitDe(l, id, theme)
    expect(h(principaux[0]!)).toMatchObject({ forme: 'souligne', epaisseurBordure: 5 })
    for (const id of [n2[0]!, n3[0]!, n4[0]!]) expect(h(id)).toMatchObject({ forme: 'souligne', epaisseurBordure: 1 })
    expect(epaisseurSouligne(h(principaux[0]!))).toBe(5)
  })

  it('le style d’un sujet l’emporte sur l’épaisseur du thème ; sans trait souligné, l’épaisseur du thème ne s’applique pas', () => {
    expect(carte({ epaisseurBordure: 3 }).h.epaisseurBordure).toBe(3)
    const cadre = carte({ forme: 'arrondi' }).h
    expect(cadre.epaisseurBordure).toBeUndefined()
  })

  it('le souligné prend sa place sous le texte : le sujet en est plus haut de son épaisseur', () => {
    const [epais, fin] = [carte({ epaisseurBordure: 5 }, 'Titre').h, carte({ epaisseurBordure: 1 }, 'Titre').h]
    const [me, mf] = [mesurer('Titre', epais), mesurer('Titre', fin)]
    expect(me.h - mf.h).toBe(4)
    expect(me.h).toBe(Math.ceil(10 + 18 * 1.3 + 10 + 5))
    // Le texte reste en haut : la marge du haut ne bouge pas.
    expect(me.texte.y).toBe(mf.texte.y)
  })

  it('un sous-sujet cadré du premier niveau se remplit de sa branche à 20 %, pas les suivants (thème à cadres)', () => {
    const vif = THEMES.find((t) => t.id === 'vif')!
    const { l, n2, n3 } = profonde()
    expect(habitDe(l, n2[0]!, vif).fondBranche).toBe(0.2)
    expect(habitDe(l, n3[0]!, vif).fondBranche).toBeUndefined()
    expect(habitDe(l, n2[0]!, theme).fondBranche).toBeUndefined()
    const c = couleursDe(habitDe(l, n2[0]!, vif), 'sous', vif, undefined, '#ff6b6b')
    expect(c.fond).toBe('#ff6b6b33')
    expect(c.plein).toBe(true)
    expect(couleursDe(habitDe(l, n3[0]!, vif), 'sous', vif, undefined, '#ff6b6b').fond).toBe('none')
  })
})

describe('la teinte assombrie d’une branche', () => {
  it('garde la teinte et la saturation, à 20 % de luminosité (les valeurs relevées sur les six couleurs de Xmind)', () => {
    expect(teinteSombre('#FF6B6B')).toBe('#660000')
    expect(teinteSombre('#FF9F69')).toBe('#662500')
    expect(teinteSombre('#97D3B6')).toBe('#1e4834')
    expect(teinteSombre('#88E2D7')).toBe('#14524a')
    expect(teinteSombre('#6FD0F9')).toBe('#044662')
    expect(teinteSombre('#E18BEE')).toBe('#4f0d59')
  })

  it('un gris reste gris ; blanc et noir ne se confondent pas avec leur teinte', () => {
    expect(teinteSombre('#808080')).toBe('#333333')
    expect(teinteSombre('#ffffff')).toBe('#333333')
    expect(teinteSombre('#000000')).toBe('#333333')
  })

  it('l’aller-retour entre hexadécimal et teinte / saturation / luminosité est exact', () => {
    for (const hex of ['#e5534b', '#3fa66b', '#3a86d4', '#8b5cd6', '#c9a227', '#123456']) {
      const [t, sa, lu] = hexVersTsl(hex)!
      expect(tslVersHex(t, sa, lu)).toBe(hex)
    }
    expect(hexVersTsl('var(--x)')).toBeNull()
    expect(hexVersTsl('#ff000080')).toEqual(hexVersTsl('#ff0000'))
  })

  it('la teinte claire : la même teinte, à 85 %', () => {
    expect(teinteClaire('#ff6b6b')).toBe('#ffb3b3')
  })

  it('ce qui n’est pas hexadécimal reste tel quel', () => {
    expect(teinteSombre('var(--c)')).toBe('var(--c)')
    expect(teinteSombre('red')).toBe('red')
  })

  it('l’opacité s’écrit sur huit chiffres ; une variable se mélange au transparent', () => {
    expect(avecOpacite('#ff6b6b', 0.2)).toBe('#ff6b6b33')
    expect(avecOpacite('#ff6b6bff', 0.5)).toBe('#ff6b6b80')
    expect(avecOpacite('var(--c)', 0.2)).toBe('color-mix(in srgb, var(--c) 20%, transparent)')
  })

  it('le texte d’un sous-sujet : assombri sur un fond clair, éclairci sur un fond sombre, mélangé à l’encre quand le fond suit Notak', () => {
    expect(encreDeBranche('#ff6b6b', '#ffffff', '#222')).toBe('#660000')
    expect(encreDeBranche('#ff6b6b', '#161b26', '#eee')).toBe('#ffb3b3')
    expect(encreDeBranche('#ff6b6b', undefined, 'var(--notak-arbre-texte)')).toBe('color-mix(in srgb, #ff6b6b 32%, var(--notak-arbre-texte))')
    expect(encreDeBranche('var(--c)', '#ffffff', '#222222')).toBe('#222222')
  })
})

describe('les couleurs par rang du thème par défaut', () => {
  const { l, c, principaux, n2, n3, n4, flottant } = profonde()
  const coul = (id: Id, t = theme) => couleursDe(habitDe(l, id, t), rangDe(l, id), t, undefined, couleurDe(l, id, t))

  it('le central est plein noir, le texte blanc', () => {
    expect(coul(c).fond).toBe('#000000')
    expect(coul(c).encre).toBe('#ffffff')
    expect(habitDe(l, c, theme).forme).toBe('arrondi')
  })

  it('un principal : sans plein, souligné de la couleur de sa branche, texte de l’encre du thème', () => {
    const k = coul(principaux[1]!)
    // Sans cadre à dessiner (un souligné), son fond est celui de la carte.
    expect(k.plein).toBe(false)
    expect(k.fond).toBe('var(--notak-arbre-fond)')
    expect(k.bordure).toBe(theme.palette[1])
    expect(k.encre).toBe('var(--notak-arbre-texte)')
  })

  it('un sous-sujet : sans fond, le texte de la couleur de sa branche assombrie, à tous les niveaux', () => {
    for (const id of [n2[1]!, n3[1]!, n4[1]!]) {
      const k = coul(id)
      expect(k.fond).toBe('none')
      expect(k.teinte).toBe(theme.palette[1])
      expect(k.encre).toBe(`color-mix(in srgb, ${theme.palette[1]} 32%, var(--notak-arbre-texte))`)
    }
    // Sur un fond clair connu, la teinte sombre exacte.
    const clair = { ...theme, fond: '#ffffff', texte: '#222222' }
    expect(coul(n2[0]!, clair).encre).toBe(teinteSombre(theme.palette[0]!))
  })

  it('une classe « secondaire » ou une couleur de texte imposée l’emporte sur la teinte de la branche', () => {
    const h = habitDe(l, n2[0]!, theme)
    expect(couleursDe(h, 'sous', theme, 'secondaire', '#e5534b').encre).toBe('#8c939d')
    expect(couleursDe({ ...h, couleurTexte: '#123456' }, 'sous', theme, undefined, '#e5534b').encre).toBe('#123456')
  })

  it('un sous-sujet sans branche de couleur (une seule couleur) garde le texte du thème', () => {
    expect(couleursDe(habitDe(l, n2[0]!, theme), 'sous', theme, undefined, null).encre).toBe('var(--notak-arbre-texte)')
  })

  it('un flottant garde son cadre', () => {
    expect(habitDe(l, flottant, theme).forme).toBe('arrondi')
  })
})

describe('les couleurs de branches multicolores', () => {
  it('chaque principal prend sa couleur dans la palette, tour à tour, et tous ses descendants la gardent', () => {
    const { l, principaux, n2, n3, n4 } = profonde()
    principaux.forEach((p, i) => {
      const couleur = theme.palette[i % theme.palette.length]!
      expect(couleurDe(l, p, theme)).toBe(couleur)
      for (const d of [n2[i]!, n3[i]!, n4[i]!]) expect(couleurDe(l, d, theme)).toBe(couleur)
    })
    expect(new Set(principaux.map((p) => couleurDe(l, p, theme))).size).toBe(3)
  })

  it('la palette recommence après six principaux', () => {
    let a: Arbre = nouvelArbre('C')
    const c = lire(a).central
    const ids: Id[] = []
    for (let i = 0; i < 7; i++) {
      let p: Id
      ;[a, p] = ajouterEnfant(a, c, `P${i}`)
      ids.push(p)
    }
    const l = lire(a)
    expect(couleurDe(l, ids[6]!, theme)).toBe(theme.palette[0])
  })

  it('le central et les flottants n’ont pas de couleur de branche ; la couleur d’un sujet vaut pour ses descendants', () => {
    const { a, l, c, principaux, n2, n3, flottant } = profonde()
    expect(couleurDe(l, c, theme)).toBeNull()
    expect(couleurDe(l, flottant, theme)).toBeNull()
    const b = appliquerGeste(a, { type: 'style', ids: [n2[0]!], style: { couleurBranche: '#123456' } }, () => 'x')!.arbre
    expect(couleurDe(lire(b), n3[0]!, theme)).toBe('#123456')
    expect(couleurDe(lire(b), principaux[0]!, theme)).toBe(theme.palette[0])
    expect(couleurDe(lire(b), n3[1]!, theme)).toBe(theme.palette[1])
  })
})

describe('l’épaisseur des branches du thème', () => {
  it('le thème par défaut : 1,5 depuis le central, 1 ensuite, celle du souligné fin des sous-sujets', () => {
    const { l, c, principaux, n2, n3 } = profonde()
    expect(brancheDe(l, c, {}, theme).epaisseur).toBe(1.5)
    expect(brancheDe(l, principaux[0]!, {}, theme).epaisseur).toBe(1)
    expect(brancheDe(l, n2[0]!, {}, theme).epaisseur).toBe(1)
    expect(brancheDe(l, n3[0]!, {}, theme).epaisseur).toBe(1)
    expect(habitDe(l, n2[0]!, theme).epaisseurBordure).toBe(1)
  })

  it('le réglage de la carte, puis le style d’un sujet, l’emportent ; un thème sans épaisseur laisse celle de Notak', () => {
    const { a, l, c, principaux } = profonde()
    expect(brancheDe(l, c, { largeur: 3 }, theme).epaisseur).toBe(4)
    const b = appliquerGeste(a, { type: 'style', ids: [c], style: { epaisseurBranche: 5 } }, () => 'x')!.arbre
    expect(brancheDe(lire(b), principaux[0]!, {}, theme).epaisseur).toBe(5)
    expect(brancheDe(l, c, {}, THEMES.find((t) => t.id === 'pastel')!).epaisseur).toBeNull()
    expect(brancheDe(l, c).epaisseur).toBeNull()
  })
})

describe('le squelette passe avant le thème, et le style du sujet avant le squelette', () => {
  const avecSquelette = (squelette: string, extra: Partial<Arbre> = {}) => themeDeArbre({ squelette, ...extra })
  function exemple(style?: StyleSujet) {
    let a: Arbre = nouvelArbre('Centre')
    const c = lire(a).central
    let p: Id, s: Id, f: Id
    ;[a, p] = ajouterEnfant(a, c, 'Principal')
    ;[a, s] = ajouterEnfant(a, p, 'Sous')
    ;[a, f] = ajouterFlottant(a, { x: 300, y: 0 }, 'Libre')
    if (style) a = appliquerGeste(a, { type: 'style', ids: [p], style }, () => 'x')!.arbre
    return { l: lire(a), c, p, s, f }
  }

  it('sans squelette, rien ne change : l’habit est celui du thème', () => {
    const { l, c, p } = exemple()
    expect(habitDe(l, c, themeDeArbre({}))).toEqual(habitDe(l, c, theme))
    expect(habitDe(l, p, themeDeArbre({}))).toEqual(habitDe(l, p, theme))
  })

  it('le squelette par défaut : central de 30 en 800 sans fond, principal plein de 18 en 500, sous-sujet de 14', () => {
    const { l, c, p, s, f } = exemple()
    const t = avecSquelette('carte-1')
    expect(habitDe(l, c, t)).toMatchObject({ police: 30, graisse: 800, forme: 'arrondi', motifRemplissage: 'aucun', alignement: 'centre', epaisseurBordure: 0 })
    expect(habitDe(l, c, t).remplissage).toBeUndefined()
    expect(habitDe(l, p, t)).toMatchObject({ police: 18, graisse: 500, forme: 'arrondi', plein: true })
    expect(habitDe(l, s, t)).toMatchObject({ police: 14, graisse: 400, plein: false })
    expect(habitDe(l, f, t)).toMatchObject({ police: 14, graisse: 500 })
  })

  it('ses sous-sujets du premier niveau ont un fond pâle de leur branche, pas les suivants', () => {
    let { l, s } = exemple()
    const t = avecSquelette('carte-1')
    expect(habitDe(l, s, t).fondBranche).toBe(0.2)
    // Un sous-sujet de deuxième niveau n'en a pas.
    let a: Arbre = { type: 'arbre', sujets: { ...l.sujets.size ? Object.fromEntries(l.sujets) : {} } }
    let petit: Id
    ;[a, petit] = ajouterEnfant(a, s, 'Petit')
    expect(habitDe(lire(a), petit, t).fondBranche).toBeUndefined()
  })

  it('un squelette à soulignés : le trait d’un principal est sa bordure, celui d’un sous-sujet la branche qui arrive', () => {
    const { l, p, s } = exemple()
    const t = avecSquelette('carte-5')
    expect(habitDe(l, p, t)).toMatchObject({ forme: 'souligne', epaisseurBordure: 5 })
    expect(habitDe(l, s, t)).toMatchObject({ forme: 'souligne', epaisseurBordure: 1 })
  })

  it('le style posé sur le sujet passe avant le squelette', () => {
    const { l, p } = exemple({ forme: 'etoile', taille: 40, graisse: 300, alignement: 'droite' })
    const h = habitDe(l, p, avecSquelette('carte-1'))
    expect(h).toMatchObject({ forme: 'etoile', police: 40, graisse: 300, alignement: 'droite' })
  })

  it('la police : celle de toute la carte passe avant celle du squelette, qui passe avant celle du thème', () => {
    const { l, p } = exemple()
    expect(habitDe(l, p, avecSquelette('carte-2')).famille).toBe('"Roboto", sans-serif')
    expect(habitDe(l, p, avecSquelette('carte-2', { police: 'Georgia' })).famille).toBe('"Georgia", serif')
    // Le thème « papier » a sa police ; un squelette sans police (NeverMind) prend celle de Notak, pas celle du thème.
    expect(habitDe(l, p, avecSquelette('carte-1', { theme: 'papier' })).famille).toBe(habitDe(l, p, theme).famille)
  })

  it('le remplissage d’un squelette dessiné à la main est une hachure, et un fond hachuré garde le texte du thème', () => {
    const { l, p } = exemple()
    const t = avecSquelette('carte-10')
    const h = habitDe(l, p, t)
    expect(h.motifRemplissage).toBe('diagonales-fines')
    const c = couleursDe(h, 'principal', t, undefined, '#e76f8a')
    expect(c.encre).not.toBe('#ffffff')
  })

  it('la bordure d’un squelette a la couleur de la branche', () => {
    const { l, p, c } = exemple()
    const t = avecSquelette('carte-7')
    const h = habitDe(l, p, t)
    expect(h).toMatchObject({ epaisseurBordure: 3, bordureBranche: true })
    expect(couleursDe(h, 'principal', t, undefined, '#e76f8a').bordure).toBe('#e76f8a')
    // Le central de ce squelette a un fond et une bordure de 0 (héritée) : pas de bordure.
    expect(couleursDe(habitDe(l, c, t), 'central', t, undefined, null).bordure).toBe('none')
  })

  it('les branches : la forme, l’épaisseur, le motif et la pointe du rang du parent', () => {
    const { l, c, p } = exemple()
    const t = avecSquelette('carte-1')
    expect(brancheDe(l, c, {}, t)).toMatchObject({ forme: null, formeSquelette: 'organique', epaisseur: 2, effilee: false, radial: true })
    expect(brancheDe(l, p, {}, t)).toMatchObject({ formeSquelette: 'coudee-arrondie', epaisseur: 2 })
    const main = avecSquelette('carte-10')
    expect(brancheDe(l, c, {}, main).motif).toBe('main')
    expect(brancheDe(l, c, {}, avecSquelette('carte-7')).pointe).toBe('triangle')
    // Un squelette éteint les épaisseurs du thème.
    expect(brancheDe(l, c, {}, avecSquelette('carte-5')).epaisseur).toBe(1)
  })

  it('la largeur de toute la carte passe avant celle du squelette ; celle du sujet avant tout', () => {
    const { l, c, p } = exemple()
    const t = avecSquelette('carte-1')
    expect(brancheDe(l, c, { largeur: 3 }, t).epaisseur).toBe(4)
    const a = appliquerGeste({ type: 'arbre', sujets: Object.fromEntries(l.sujets) }, { type: 'style', ids: [c], style: { epaisseurBranche: 7, branche: 'droite' } }, () => 'x')!.arbre
    expect(brancheDe(lire(a), p, { largeur: 3 }, t)).toMatchObject({ epaisseur: 7, forme: 'droite', formeSquelette: 'coudee-arrondie' })
  })

  it('l’effilé est celui de la carte (le squelette l’y a écrit), et ne concerne que le central', () => {
    const { l, c, p } = exemple()
    const t = avecSquelette('carte-2')
    expect(brancheDe(l, c, { effilee: true }, t).effilee).toBe(true)
    expect(brancheDe(l, p, { effilee: true }, t).effilee).toBe(false)
  })
})
