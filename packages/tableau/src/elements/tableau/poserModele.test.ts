import { describe, expect, it } from 'vitest'
import type { Element, Tableau } from '../../coeur/tableau'
import { MODELES } from '../../modeles/catalogue'
import type { Services } from '../types'
import { peutPoserModele, poserModele } from './poserModele'

function services(elements: Element[], extra: Partial<Services> = {}) {
  const appels: string[] = []
  const deposes: Element[][] = []
  const s: Services = {
    tableau: (): Tableau => ({ titre: 'Nouveau tableau', elements }),
    deposerDans: (cible, els) => {
      appels.push(`depose:${cible}`)
      deposes.push(els)
    },
    renommerTableau: (cible, titre) => void appels.push(`titre:${cible}:${titre}`),
    colorerTableau: (cible, couleur) => void appels.push(`couleur:${cible}:${couleur}`),
    ...extra,
  }
  return { s, appels, deposes }
}

describe('poser un modèle dans un tableau', () => {
  it('remplit un tableau vide : éléments, titre, couleur', () => {
    const { s, appels, deposes } = services([])
    const m = MODELES[0]!
    expect(poserModele(m, 'cible', s)).toBe(true)
    expect(appels).toEqual(['depose:cible', `titre:cible:${m.titre}`, `couleur:cible:${m.couleur}`])
    expect(deposes[0]!.length).toBeGreaterThanOrEqual(m.elements.length)
  })

  it('peut laisser au tableau son titre et sa couleur', () => {
    const { s, appels } = services([])
    expect(poserModele(MODELES[0]!, 'cible', s, { identite: false })).toBe(true)
    expect(appels).toEqual(['depose:cible'])
  })

  it('ne touche pas à un tableau qui a déjà du contenu, ni en lecture seule, ni sans dépôt possible', () => {
    const plein: Element[] = [{ id: 'a', x: 0, y: 0, largeur: 34, contenu: { type: 'colonne', titre: 'X' } }]
    for (const { s, appels } of [services(plein), services([], { lectureSeule: true }), services([], { deposerDans: undefined })]) {
      expect(peutPoserModele('cible', s)).toBe(false)
      expect(poserModele(MODELES[0]!, 'cible', s)).toBe(false)
      expect(appels.filter((a) => a.startsWith('depose'))).toEqual([])
    }
  })
})
