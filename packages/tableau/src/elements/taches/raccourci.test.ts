// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { Element, Taches } from '../../coeur/tableau'
import { tousLesRaccourcis } from '../registre'
import type { ContexteToile } from '../types'
import { docVide } from './liste'
import './index'

const liste = (plus: Partial<Taches> = {}, verrou = false): Element<Taches> => ({ id: 'L', x: 0, y: 0, largeur: 34, ...(verrou ? { verrou: true } : {}), contenu: { type: 'taches', texte: docVide(), ...plus } })
const monde = (e: Element, services = {}) => {
  const faire = vi.fn()
  const commencerEdition = vi.fn()
  const contexte = { magasin: { lire: () => ({ elements: [e] }), faire }, selection: new Set([e.id]), services, commencerEdition } as unknown as ContexteToile
  return { contexte, faire, commencerEdition }
}
const altEntree = (contexte: ContexteToile) => tousLesRaccourcis().some((r) => r(new KeyboardEvent('keydown', { key: 'Enter', altKey: true }), contexte))

describe('Alt+Retour sur une liste choisie', () => {
  it('fait paraître le titre et ouvre l’écriture', () => {
    const { contexte, faire, commencerEdition } = monde(liste())
    expect(altEntree(contexte)).toBe(true)
    expect(faire.mock.calls[0]![0][0].apres.titre).toBe('')
    expect(commencerEdition).toHaveBeenCalledWith('L')
  })

  it('un titre caché revient avec ses mots', () => {
    const { contexte, faire } = monde(liste({ titreCache: 'Courses' }))
    altEntree(contexte)
    expect(faire.mock.calls[0]![0][0].apres).toMatchObject({ titre: 'Courses' })
  })

  it('un titre déjà là : on y met seulement le curseur', () => {
    const { contexte, faire, commencerEdition } = monde(liste({ titre: 'T' }))
    altEntree(contexte)
    expect(faire).not.toHaveBeenCalled()
    expect(commencerEdition).toHaveBeenCalled()
  })

  it('rien sur une liste verrouillée, en lecture seule, ou une autre sélection', () => {
    expect(altEntree(monde(liste({}, true)).contexte)).toBe(false)
    expect(altEntree(monde(liste(), { lectureSeule: true }).contexte)).toBe(false)
    const note: Element = { id: 'N', x: 0, y: 0, largeur: 34, contenu: { type: 'colonne', titre: '' } }
    expect(altEntree(monde(note).contexte)).toBe(false)
  })
})
