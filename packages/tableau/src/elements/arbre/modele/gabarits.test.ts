import { describe, expect, it } from 'vitest'
import {
  type BoutDeTransition,
  type FaitsDeVariante,
  ECRAN_DE_FIN,
  admissible,
  dispositionDeListe,
  effetDeTransition,
  estPortrait,
  formeDuResume,
  gabaritDeListe,
  gabaritDeResume,
  gabaritDeSujet,
  miseEnPageParDefaut,
  placeImageAuto,
  titreCourt,
} from './gabarits'

const faits = (f: Partial<FaitsDeVariante> = {}): FaitsDeVariante => ({ portrait: false, enfants: 3, parentIllustre: false, enfantsIllustres: false, ...f })

describe('le choix du gabarit (mode Pitch)', () => {
  it('la mise en page par défaut d’une liste : structure, accolade, puces, paroles', () => {
    const base = { niveau: 'principal' as const, enfants: 3, titresCourts: true, structure: null, livraison: 'percer' as const }
    expect(miseEnPageParDefaut({ ...base, structure: 'arete' })).toBe('arete')
    expect(miseEnPageParDefaut({ ...base, structure: 'chronologie' })).toBe('chronologie')
    expect(miseEnPageParDefaut(base)).toBe('accolade')
    expect(miseEnPageParDefaut({ ...base, niveau: 'central', enfants: 1, titresCourts: false })).toBe('accolade')
    // Un principal à un seul enfant, ou trop long, ou un sous-sujet : puces en tout à la fois, paroles sinon.
    expect(miseEnPageParDefaut({ ...base, enfants: 1 })).toBe('paroles')
    expect(miseEnPageParDefaut({ ...base, titresCourts: false, livraison: 'tout' })).toBe('puces')
    expect(miseEnPageParDefaut({ ...base, niveau: 'sous-sujet', livraison: 'un-par-un' })).toBe('paroles')
  })

  it('24 caractères au plus', () => {
    expect(titreCourt('x'.repeat(24))).toBe(true)
    expect(titreCourt('x'.repeat(25))).toBe(false)
  })

  it('le réglage s’il est admissible ; les têtes héritées passent avant', () => {
    expect(admissible('paroles', 'tout')).toBe(false)
    expect(dispositionDeListe({ defaut: 'puces', reglage: 'paroles', livraison: 'tout', heritage: null })).toBe('puces')
    expect(dispositionDeListe({ defaut: 'puces', reglage: 'chronologie', livraison: 'tout', heritage: null })).toBe('chronologie')
    expect(dispositionDeListe({ defaut: 'paroles', reglage: 'accolade', livraison: 'percer', heritage: 'arete' })).toBe('tete-arete')
    expect(dispositionDeListe({ defaut: 'paroles', reglage: undefined, livraison: 'percer', heritage: 'chronologie' })).toBe('tete-chronologie')
  })

  it('les variantes de l’accolade, des puces et des paroles', () => {
    for (const d of ['accolade', 'puces', 'paroles'] as const) {
      expect(gabaritDeListe(d, faits({ parentIllustre: true }))).toBe('parent-illustre')
      expect(gabaritDeListe(d, faits({ parentIllustre: true, enfants: 1 }))).toBe('enfant-unique-parent-illustre')
      expect(gabaritDeListe(d, faits({ enfantsIllustres: true }))).toBe('enfants-illustres')
      expect(gabaritDeListe(d, faits({ enfantsIllustres: true, enfants: 1 }))).toBe('enfant-unique-illustre')
      expect(gabaritDeListe(d, faits({ parentIllustre: true, enfantsIllustres: true }))).toBe('liste-illustree')
      expect(gabaritDeListe(d, faits({ enfants: 1 }))).toBe('enfant-unique')
      expect(gabaritDeListe(d, faits())).toBe(d)
    }
    // En portrait, seule l'accolade devient un arbre ; les images passent avant.
    expect(gabaritDeListe('accolade', faits({ portrait: true }))).toBe('arbre')
    expect(gabaritDeListe('puces', faits({ portrait: true }))).toBe('puces')
    expect(gabaritDeListe('paroles', faits({ portrait: true }))).toBe('paroles')
    expect(gabaritDeListe('accolade', faits({ portrait: true, parentIllustre: true }))).toBe('parent-illustre')
  })

  it('l’arête, la chronologie et leurs têtes : pas de variante à images', () => {
    for (const d of ['arete', 'chronologie'] as const) {
      expect(gabaritDeListe(d, faits())).toBe(d)
      expect(gabaritDeListe(d, faits({ enfants: 1, portrait: true }))).toBe('enfant-unique')
      expect(gabaritDeListe(d, faits({ portrait: true }))).toBe('arbre')
      expect(gabaritDeListe(d, faits({ parentIllustre: true }))).toBe(d)
    }
    expect(gabaritDeListe('tete-arete', faits({ enfants: 1 }))).toBe('tete-arete')
    expect(gabaritDeListe('tete-chronologie', faits())).toBe('tete-chronologie')
    expect(gabaritDeListe('tete-arete', faits({ portrait: true }))).toBe('arbre')
    expect(gabaritDeListe('tete-chronologie', faits({ portrait: true }))).toBe('arbre')
  })

  it('sujet, résumé, et la forme de la plage', () => {
    expect([gabaritDeSujet(true), gabaritDeSujet(false)]).toEqual(['sujet-image', 'sujet'])
    expect([gabaritDeResume(false), gabaritDeResume(true)]).toEqual(['resume', 'resume-defilant'])
    expect([formeDuResume(1), formeDuResume(2)]).toEqual(['trait', 'accolade'])
    expect(['16:9', '4:3', '9:16', '3:4'].map((r) => estPortrait(r as '16:9'))).toEqual([false, false, true, true])
  })

  it('la place Auto d’une image', () => {
    const im = { portrait: false, largeur: 800, hauteur: 600, svg: false }
    expect(placeImageAuto({ ...im, portrait: true })).toBe('dessus')
    expect(placeImageAuto({ ...im, largeur: 300 })).toBe('gauche')
    expect(placeImageAuto({ ...im, largeur: 300, svg: true })).toBe('dessus')
    expect(placeImageAuto({ ...im, largeur: 1200 })).toBe('dessus')
    expect(placeImageAuto(im)).toBe('gauche')
    expect(placeImageAuto({ ...im, svg: true })).toBe('dessus')
  })
})

describe('l’effet entre deux diapositives', () => {
  const sujet = (sujet: string, niveau: BoutDeTransition['niveau'] = 'principal'): BoutDeTransition => ({ type: 'sujet', sujet, niveau })
  const liste = (sujet: string): BoutDeTransition => ({ type: 'liste', sujet, niveau: 'principal' })

  it('dans l’ordre des règles', () => {
    expect(effetDeTransition(liste('A'), sujet('C', 'central'), 'avancer', true)).toEqual({ nom: 'fondu', duree: 600, animationsDiapo: true })
    expect(effetDeTransition(null, sujet('A'), 'depart', true)).toEqual({ nom: 'fondu', duree: 400, animationsDiapo: true })
    expect(effetDeTransition(sujet('A'), null, 'avancer', true).duree).toBe(400)
    expect(effetDeTransition(liste('A'), sujet('A'), 'avancer', true)).toMatchObject({ nom: 'morphing', duree: 1000 })
    expect(effetDeTransition(liste('A'), liste('A'), 'avancer', true)).toMatchObject({ nom: 'dans-la-diapo', duree: 600 })
    expect(effetDeTransition(sujet('A'), liste('A'), 'avancer', true)).toMatchObject({ nom: 'morphing', duree: 1000 })
    expect(effetDeTransition(liste('A'), sujet('B'), 'passer', true)).toMatchObject({ nom: 'morphing', duree: 1000 })
  })

  it('reculer et l’animation coupée : rien ; remonter : l’effet sans les animations des diapositives', () => {
    const aucun = { nom: 'aucun', duree: 0, animationsDiapo: false }
    expect(effetDeTransition(liste('A'), liste('A'), 'reculer', true)).toEqual(aucun)
    expect(effetDeTransition(liste('A'), liste('A'), 'avancer', false)).toEqual(aucun)
    expect(effetDeTransition(liste('A'), sujet('B'), 'remonter', true)).toEqual({ nom: 'morphing', duree: 1000, animationsDiapo: false })
  })

  it('l’écran de fin garde ses durées, et sa vignette est plus grande en 4:3', () => {
    expect([ECRAN_DE_FIN.apparition, ECRAN_DE_FIN.disparition]).toEqual([1000, 400])
    expect([ECRAN_DE_FIN.echelle('16:9'), ECRAN_DE_FIN.echelle('4:3')]).toEqual([0.2, 0.233])
  })
})
