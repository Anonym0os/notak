// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Element, Nuancier } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { ouvrirSelecteur, suggestionsDuNuancier } from './selecteur'

afterEach(() => {
  document.body.replaceChildren()
})

const nuancier = (couleur = '#4f8cff'): Element<Nuancier> => ({ id: 'N', x: 0, y: 0, largeur: 17, contenu: { type: 'nuancier', couleur } })
function monde(plus: Element[] = [], options: { lectureSeule?: boolean } = {}) {
  const el = nuancier()
  const magasin = creerMagasin({ titre: '', elements: [el, ...plus] })
  const contexte = { magasin, services: { lectureSeule: !!options.lectureSeule } } as unknown as ContexteToile
  const couleur = () => (magasin.lire().elements[0]!.contenu as Nuancier).couleur
  return { el, magasin, contexte, couleur }
}
const champ = () => document.querySelector<HTMLInputElement>('input[type=color]')
const ecrire = (c: HTMLInputElement, valeur: string, type: 'input' | 'change') => {
  c.value = valeur
  c.dispatchEvent(new Event(type, { bubbles: true }))
}

describe('le double-clic sur un nuancier', () => {
  it('ouvre un sélecteur de couleur du système, avec au moins trois suggestions', () => {
    const m = monde()
    ouvrirSelecteur(m.el, m.contexte)
    const c = champ()!
    expect(c.value).toBe('#4f8cff')
    const options = document.querySelectorAll(`datalist#${c.getAttribute('list')} option`)
    expect(options.length).toBeGreaterThanOrEqual(3)
  })

  it('les couleurs du tableau passent d’abord', () => {
    const autre: Element = { id: 'C', x: 0, y: 0, largeur: 34, contenu: { type: 'croquis', traits: [{ points: [0, 0, 1, 1], couleur: '#12ab34', epaisseur: 2 }, { points: [1, 1, 2, 2], couleur: '#12ab34', epaisseur: 2 }] } }
    expect(suggestionsDuNuancier([nuancier(), autre])[0]).toBe('#12ab34')
    expect(suggestionsDuNuancier([nuancier(), autre]).length).toBeGreaterThanOrEqual(3)
  })

  it('la couleur suit le sélecteur en direct, et le geste entier est un seul pas d’historique', () => {
    const m = monde()
    ouvrirSelecteur(m.el, m.contexte)
    const c = champ()!
    ecrire(c, '#112233', 'input')
    expect(m.couleur()).toBe('#112233')
    ecrire(c, '#445566', 'input')
    expect(m.couleur()).toBe('#445566')
    expect(m.magasin.peutAnnuler()).toBe(false)
    ecrire(c, '#445566', 'change')
    expect(m.magasin.peutAnnuler()).toBe(true)
    expect(champ()).toBeNull()
    m.magasin.annuler()
    expect(m.couleur()).toBe('#4f8cff')
    expect(m.magasin.peutAnnuler()).toBe(false)
  })

  it('un sélecteur refermé sans rien choisir ne laisse rien dans l’historique', () => {
    const m = monde()
    ouvrirSelecteur(m.el, m.contexte)
    champ()!.dispatchEvent(new Event('change', { bubbles: true }))
    expect(m.magasin.peutAnnuler()).toBe(false)
    expect(champ()).toBeNull()
  })

  it('en lecture seule, rien ne s’ouvre ; un deuxième double-clic remplace le premier sélecteur', () => {
    const lecture = monde([], { lectureSeule: true })
    ouvrirSelecteur(lecture.el, lecture.contexte)
    expect(champ()).toBeNull()
    const m = monde()
    ouvrirSelecteur(m.el, m.contexte)
    ouvrirSelecteur(m.el, m.contexte)
    expect(document.querySelectorAll('input[type=color]')).toHaveLength(1)
  })
})
