// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import { type Element, nouvelId, nouvelleColonne, nouvelleNote } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import '../colonne'
import '../ligne'
import '../note'
import '../tableau'
import { appliquerAffichage, estReduit, pasAffichage, peutSeReduire } from './affichage'

const renvoi = (): Element => ({ id: nouvelId(), x: 0, y: 0, largeur: 10, contenu: { type: 'tableau', cible: 'T' } })
const ligne = (): Element => ({
  id: nouvelId(),
  x: 0,
  y: 0,
  largeur: 1,
  contenu: { type: 'ligne', depart: { x: 0, y: 0 }, arrivee: { x: 5, y: 5 }, pointeDepart: 'rien', pointeArrivee: 'fleche', trait: 'plein', epaisseur: 2 },
})

describe('le mode d’affichage', () => {
  it('une carte, une colonne : oui ; un tableau imbriqué et une ligne : non', () => {
    expect(peutSeReduire(nouvelleNote(0, 0))).toBe(true)
    expect(peutSeReduire(nouvelleColonne(0, 0))).toBe(true)
    expect(peutSeReduire(renvoi())).toBe(false)
    expect(peutSeReduire(ligne())).toBe(false)
  })

  it('une carte se réduit par le champ commun, une colonne en se repliant', () => {
    const note = nouvelleNote(0, 0)
    const colonne = nouvelleColonne(40, 0)
    const pas = pasAffichage([note, colonne], true)
    expect(pas).toHaveLength(2)
    expect(pas[0]).toMatchObject({ type: 'annoter', id: note.id, vers: { affichage: 'icone' } })
    expect(pas[1]).toMatchObject({ type: 'contenu', id: colonne.id, apres: { repliee: true } })
  })

  it('ne touche pas ce qui est déjà dans le bon mode', () => {
    const colonne = { ...nouvelleColonne(0, 0), contenu: { ...nouvelleColonne(0, 0).contenu, repliee: true } } as Element
    expect(estReduit(colonne)).toBe(true)
    expect(pasAffichage([colonne], true)).toEqual([])
    expect(pasAffichage([nouvelleNote(0, 0)], false)).toEqual([])
  })

  it('réduire une colonne et ses voisins se défait d’un seul pas, et la sélection quitte ce qui se cache', () => {
    const colonne = nouvelleColonne(0, 0)
    const enfant: Element = { ...nouvelleNote(0, 0), parent: colonne.id, ordre: 'a' }
    const note = nouvelleNote(50, 0)
    const magasin = creerMagasin({ titre: '', elements: [colonne, enfant, note] })
    let choisi: string[] = []
    const contexte = { magasin, selection: new Set([enfant.id, note.id]), choisir: (ids: Iterable<string>) => (choisi = [...ids]) } as unknown as ContexteToile
    appliquerAffichage([colonne, note], true, contexte)
    const lire = (id: string) => magasin.lire().elements.find((e) => e.id === id)!
    expect(estReduit(lire(colonne.id))).toBe(true)
    expect(estReduit(lire(note.id))).toBe(true)
    expect(choisi).toEqual([note.id])
    magasin.annuler()
    expect(estReduit(lire(colonne.id))).toBe(false)
    expect(estReduit(lire(note.id))).toBe(false)
  })
})
