import { describe, expect, it } from 'vitest'
import type { Arbre, Id } from '../../../coeur/tableau'
import { brancheDe, couleurDe, habitDe, mesurer, uniformiser } from '../apparence'
import { ECARTS, ECARTS_COMPACTS, disposer, emprise } from '../disposition'
import { ajouterEnfant, ajouterFlottant, changerSujet, lire, nouvelArbre } from '../modele/sujets'
import { THEMES, fondDe, themeDe, themeDeArbre, variantesDe } from '../themes'
import { pileDe } from './polices'

/** Une carte : central → A (A1, A2), B, C ; un flottant F. */
function exemple() {
  let a = nouvelArbre('Centre')
  const c = lire(a).central
  let A: Id, B: Id, C: Id, A1: Id, A2: Id, F: Id
  ;[a, A] = ajouterEnfant(a, c, 'Un titre assez long pour être large')
  ;[a, B] = ajouterEnfant(a, c, 'B')
  ;[a, C] = ajouterEnfant(a, c, 'C')
  ;[a, A1] = ajouterEnfant(a, A, 'A1')
  ;[a, A2] = ajouterEnfant(a, A, 'A2 plus long encore')
  ;[a, F] = ajouterFlottant(a, { x: 400, y: 0 }, 'F')
  return { a, c, A, B, C, A1, A2, F }
}

describe('carte compacte', () => {
  it('serre les marges de chaque rang', () => {
    const { a, A1 } = exemple()
    const l = lire(a)
    for (const id of [l.central, A1]) {
      const normal = habitDe(l, id, themeDe(undefined))
      const compact = habitDe(l, id, themeDe(undefined), true)
      expect(compact.marge[0]).toBeLessThan(normal.marge[0])
      expect(compact.marge[1]).toBeLessThan(normal.marge[1])
    }
  })

  it('rapproche le central de ses principaux et resserre la carte', () => {
    const { a, c, B } = exemple()
    const l = lire(a)
    const taille = () => ({ l: 80, h: 24 })
    const [normale, compacte] = [disposer(l, taille, ECARTS), disposer(l, taille, ECARTS_COMPACTS)]
    const ecartDuCentral = (d: ReturnType<typeof disposer>) => d.boites.get(B)!.x - (d.boites.get(c)!.x + d.boites.get(c)!.l)
    expect(ecartDuCentral(compacte)).toBeLessThan(ecartDuCentral(normale))
    expect(emprise(compacte.boites.values()).l).toBeLessThan(emprise(normale.boites.values()).l)
    expect(emprise(compacte.boites.values()).h).toBeLessThan(emprise(normale.boites.values()).h)
  })
})

describe('police globale et police CJK', () => {
  it('la police de la carte l’emporte sur celle du thème, pas sur celle d’un sujet', () => {
    const { a, A, B } = exemple()
    const avec = changerSujet({ ...a, theme: 'papier', police: 'Verdana' }, A, (s) => ({ ...s, style: { police: 'Menlo' } }))
    const l = lire(avec)
    const theme = themeDeArbre(avec)
    expect(habitDe(l, B, theme).famille).toContain('Verdana')
    expect(habitDe(l, B, theme).famille).not.toContain('Georgia')
    expect(habitDe(l, A, theme).famille).toBe('Menlo')
    // Sans police de carte, celle du thème.
    expect(habitDe(lire(a), B, themeDeArbre({ theme: 'papier' })).famille).toContain('Georgia')
  })

  it('la police CJK vient derrière la police latine', () => {
    const { a, B } = exemple()
    const theme = themeDeArbre({ police: 'Verdana', policeCjk: 'Yu Gothic' })
    const famille = habitDe(lire(a), B, theme).famille
    expect(famille.indexOf('Verdana')).toBeLessThan(famille.indexOf('Yu Gothic'))
    expect(famille.endsWith('"Yu Gothic"')).toBe(true)
  })

  it('un nom de famille se met en pile ; une pile déjà écrite reste telle quelle', () => {
    expect(pileDe('Georgia')).toBe('"Georgia", serif')
    expect(pileDe('Une Police Inconnue')).toBe('"Une Police Inconnue", sans-serif')
    expect(pileDe('Georgia, serif')).toBe('Georgia, serif')
  })
})

describe('largeur et effilement des branches', () => {
  it('la largeur de la carte vaut pour toutes les branches, celle d’un sujet l’emporte', () => {
    const { a, c, A } = exemple()
    const l = lire(a)
    expect(brancheDe(l, c).epaisseur).toBeNull()
    expect(brancheDe(l, c, { largeur: 3 }).epaisseur).toBe(4)
    expect(brancheDe(l, A, { largeur: 8 }).epaisseur).toBeCloseTo(10.7, 1)
    const propre = lire(changerSujet(a, A, (s) => ({ ...s, style: { epaisseurBranche: 2 } })))
    expect(brancheDe(propre, A, { largeur: 8 }).epaisseur).toBe(2)
  })

  it('l’effilement de la carte touche les branches principales, pas les autres', () => {
    const { a, c, A } = exemple()
    const l = lire(a)
    expect(brancheDe(l, c, { effilee: true }).effilee).toBe(true)
    expect(brancheDe(l, A, { effilee: true }).effilee).toBe(false)
    expect(brancheDe(l, c).effilee).toBe(false)
  })
})

describe('couleur des branches', () => {
  const theme = THEMES[0]!

  it('par défaut, chaque principal a sa couleur et ses descendants la gardent', () => {
    const { a, A, A1, B } = exemple()
    const l = lire(a)
    expect(couleurDe(l, A, theme)).toBe(theme.palette[0])
    expect(couleurDe(l, A1, theme)).toBe(theme.palette[0])
    expect(couleurDe(l, B, theme)).toBe(theme.palette[1])
  })

  it('sans branches de couleur : la couleur de ligne, sinon rien (l’encre du thème)', () => {
    const { a, A, A1, c } = exemple()
    const l = lire(a)
    expect(couleurDe(l, A, theme, true)).toBeNull()
    expect(couleurDe(l, A, theme, true, { ligne: '#123456' })).toBe('#123456')
    expect(couleurDe(l, A1, theme, true, { ligne: '#123456' })).toBe('#123456')
    expect(couleurDe(l, c, theme, true, { ligne: '#123456' })).toBeNull()
  })

  it('un jeu de couleurs remplace la palette du thème', () => {
    const { a, A, B } = exemple()
    const t = themeDeArbre({ jeuCouleurs: ['#111111', '#222222'] })
    expect(t.palette).toEqual(['#111111', '#222222', '#111111', '#222222', '#111111', '#222222'])
    expect(couleurDe(lire(a), A, t)).toBe('#111111')
    expect(couleurDe(lire(a), B, t)).toBe('#222222')
  })

  it('un flottant et sa branche n’ont pas de couleur, sauf si les flottants sont colorés', () => {
    const { a, F } = exemple()
    const l = lire(a)
    expect(couleurDe(l, F, theme)).toBeNull()
    expect(couleurDe(l, F, theme, false, { flottants: true })).toBe(theme.palette[0])
    const t = themeDeArbre({ options: { flottantsColores: true } })
    expect(habitDe(l, F, t).plein).toBe(true)
    expect(habitDe(l, F, themeDeArbre({})).plein).toBe(false)
  })
})

describe('longueur uniforme des sujets', () => {
  it('les sujets d’un même niveau prennent la largeur du plus large ; le central et les flottants gardent la leur', () => {
    const { a, c, A, B, C, A1, A2, F } = exemple()
    const l = lire(a)
    const theme = themeDe(undefined)
    const mesures = new Map(([...l.sujets.keys()] as Id[]).map((id) => [id, mesurer(l.sujets.get(id)!.titre, habitDe(l, id, theme))]))
    const u = uniformiser(l, mesures)
    const largeurPrincipaux = Math.max(...[A, B, C].map((id) => mesures.get(id)!.l))
    for (const id of [A, B, C]) expect(u.get(id)!.l).toBe(largeurPrincipaux)
    const largeurSous = Math.max(...[A1, A2].map((id) => mesures.get(id)!.l))
    for (const id of [A1, A2]) expect(u.get(id)!.l).toBe(largeurSous)
    expect(u.get(c)!.l).toBe(mesures.get(c)!.l)
    expect(u.get(F)!.l).toBe(mesures.get(F)!.l)
    // Le texte reste centré dans la boîte élargie.
    const [avant, apres] = [mesures.get(B)!, u.get(B)!]
    expect(apres.texte.x - avant.texte.x).toBeCloseTo((apres.l - avant.l) / 2)
  })
})

describe('toutes les notes', () => {
  it('le texte de la note s’affiche en bloc sous le titre, et agrandit le sujet', () => {
    const { a, B } = exemple()
    const l = lire(a)
    const h = habitDe(l, B, themeDe(undefined))
    const sans = mesurer('B', h)
    const avec = mesurer('B', h, { note: 'Une note de quelques mots qui passe sur plusieurs lignes quand la largeur du bloc est dépassée, vraiment.' })
    expect(sans.note).toBeNull()
    expect(avec.note?.lignes.length).toBeGreaterThan(1)
    expect(avec.h).toBeGreaterThan(sans.h)
    expect(avec.note!.y).toBeGreaterThanOrEqual(avec.texte.y + avec.texte.h)
  })

  it('une note très longue est coupée à huit lignes, avec des points de suspension', () => {
    const { a, B } = exemple()
    const m = mesurer('B', habitDe(lire(a), B, themeDe(undefined)), { note: 'mot '.repeat(400) })
    expect(m.note!.lignes).toHaveLength(8)
    expect(m.note!.lignes[7]!.endsWith('…')).toBe(true)
  })
})

describe('thèmes', () => {
  it('chaque thème a un nom dans les deux langues', async () => {
    const { fr, en } = await import('../../../langue')
    const { cleNomTheme } = await import('../themes')
    for (const th of THEMES) {
      expect(fr[cleNomTheme(th.id)], th.id).toBeTruthy()
      expect(en[cleNomTheme(th.id)], th.id).toBeTruthy()
    }
  })

  it('chaque thème a une catégorie et six couleurs', () => {
    for (const th of THEMES) {
      expect(['colore', 'classique'], th.id).toContain(th.categorie)
      expect(th.palette, th.id).toHaveLength(6)
    }
    expect(new Set(THEMES.map((x) => x.id)).size).toBe(THEMES.length)
  })

  it('un thème a au plus six variantes : celle à branches de couleur, puis une par couleur d’accent', () => {
    for (const th of THEMES) {
      const v = variantesDe(th)
      expect(v[0], th.id).toBeUndefined()
      expect(v.length, th.id).toBeLessThanOrEqual(6)
      expect(new Set(v).size, th.id).toBe(v.length)
    }
  })

  it('le fond de la carte l’emporte sur celui du thème', () => {
    expect(fondDe({ theme: 'nuit' })).toBe('#161b26')
    expect(fondDe({ theme: 'nuit', fond: '#ffeecc' })).toBe('#ffeecc')
    expect(fondDe({})).toBeUndefined()
  })

  it('un thème de couleur à soi vient de la carte', () => {
    const t = themeDeArbre({ theme: 'perso:x', themePerso: { nom: 'Mien', palette: ['#111111', '#222222', '#333333'] } })
    expect(t.palette).toEqual(['#111111', '#222222', '#333333', '#111111', '#222222', '#333333'])
    // Sans ses données (une carte abîmée), retour au classique.
    expect(themeDeArbre({ theme: 'perso:x' }).id).toBe('classique')
  })
})

describe('type de carte', () => {
  it('les nouveaux champs ne sont jamais obligatoires', () => {
    const a: Arbre = nouvelArbre('x')
    expect(a.options).toBeUndefined()
    expect(themeDeArbre(a).id).toBe('classique')
  })
})
