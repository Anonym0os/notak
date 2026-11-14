import { type Reseau, creerEspaceDistant } from '@notak/tableau'
import { describe, expect, it } from 'vitest'
import { poserLeGuideServeur } from './guide'

const reseau: Reseau = {
  connecter: () => ({ awareness: null, lectureSeule: () => false, refuse: () => false, synchronise: () => true, detruire() {} }),
  declarer: async () => {},
}

describe('le guide sur un serveur', () => {
  it('annuler le premier geste qu’on y fait ne défait que lui : le guide reste, et rien de lui n’est à annuler', async () => {
    const espace = creerEspaceDistant({ racine: 'accueil', utilisateur: { id: 'u1', nom: 'Ana', couleur: '#2f6feb' }, reseau })
    const guide = await poserLeGuideServeur(espace)
    const m = espace.magasin(guide)
    const poses = m.lire().elements.length
    expect(poses).toBeGreaterThan(0)
    expect(m.peutAnnuler()).toBe(false)
    // Un premier glisser, comme la toile l'écrit : en chemin, puis inscrit au lâcher.
    const e = m.lire().elements.find((x) => !x.parent)!
    m.appliquerSeulement([{ type: 'deplacer', id: e.id, de: [e.x, e.y], vers: [e.x + 4, e.y] }])
    m.inscrire([{ type: 'deplacer', id: e.id, de: [e.x, e.y], vers: [e.x + 4, e.y] }])
    expect(m.annuler()).toBe(true)
    expect(m.lire().elements).toHaveLength(poses)
    expect(m.lire().elements.find((x) => x.id === e.id)).toMatchObject({ x: e.x, y: e.y })
    expect(m.annuler()).toBe(false)
    espace.detruire()
  })
})
