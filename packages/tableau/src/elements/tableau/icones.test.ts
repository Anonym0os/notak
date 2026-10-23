import { describe, expect, it } from 'vitest'
import type { Element, RenvoiTableau } from '../../coeur/tableau'
import { ICONES_TABLEAU, avecIcone, avecImage, nouveauRaccourci, pastilleDe } from './icones'

const carte = (contenu: Partial<RenvoiTableau> = {}): Element<RenvoiTableau> => ({
  id: 'a',
  x: 3,
  y: 4,
  largeur: 10,
  contenu: { type: 'tableau', cible: 'T', ...contenu },
})

describe('la pastille d’un tableau', () => {
  it('rend l’initiale sans icône ni image', () => {
    expect(pastilleDe({})).toEqual({ genre: 'initiale' })
  })
  it('préfère l’image à l’icône', () => {
    expect(pastilleDe({ icone: 'maison', image: 'F1' })).toEqual({ genre: 'image', fichier: 'F1' })
    expect(pastilleDe({ icone: 'maison' })).toMatchObject({ genre: 'icone', libelle: 'Maison' })
  })
  it('retombe sur l’initiale si l’icône n’est plus dans la bibliothèque', () => {
    expect(pastilleDe({ icone: 'disparue' })).toEqual({ genre: 'initiale' })
  })
})

describe('changer l’icône', () => {
  it('une icône chasse l’image, une image chasse l’icône', () => {
    expect(avecIcone(carte({ image: 'F1' }).contenu, 'fusee')).toEqual({ type: 'tableau', cible: 'T', icone: 'fusee' })
    expect(avecImage(carte({ icone: 'fusee' }).contenu, 'F2')).toEqual({ type: 'tableau', cible: 'T', image: 'F2' })
  })
  it('sans nom, ou avec un nom inconnu, il n’y a plus d’icône', () => {
    expect(avecIcone(carte({ icone: 'fusee' }).contenu, undefined)).toEqual({ type: 'tableau', cible: 'T' })
    expect(avecIcone(carte().contenu, 'inconnue')).toEqual({ type: 'tableau', cible: 'T' })
  })
  it('chaque icône a un signe et un nom lisible', () => {
    for (const { signe, libelle } of Object.values(ICONES_TABLEAU)) expect(signe && libelle).toBeTruthy()
  })
})

describe('un raccourci', () => {
  it('vise le même tableau, garde l’icône, pas le nom donné, et naît ailleurs', () => {
    const r = nouveauRaccourci(carte({ icone: 'livre', titre: 'Ancien' }), { x: 20.4, y: 8 })
    expect(r.id).not.toBe('a')
    expect(r).toMatchObject({ x: 20, y: 8, largeur: 10, contenu: { cible: 'T', icone: 'livre', raccourci: true } })
    expect(r.contenu.titre).toBeUndefined()
  })
  it('un raccourci de raccourci reste un raccourci du même tableau', () => {
    const r = nouveauRaccourci(nouveauRaccourci(carte(), { x: 0, y: 0 }), { x: 5, y: 5 })
    expect(r.contenu).toMatchObject({ cible: 'T', raccourci: true })
  })
})
