import { describe, expect, it } from 'vitest'
import { type Ligne, bordGauche, defilementAuto, estGlisse, hautPoignee, ligneSelonY, rayonHalo, retraitsHalo, sortiDuTexte, survolDe, vitesseDefilement } from './glisser'

const L = (id: string, haut: number, bas: number, plus: Partial<Ligne> = {}): Ligne => ({
  id,
  type: 'texte',
  pos: 0,
  fin: 0,
  niveau: 0,
  parent: null,
  conteneur: null,
  gauche: 400,
  droite: 1120,
  haut,
  bas,
  cadre: { gauche: 400, droite: 1120 },
  ferme: false,
  aEnfants: false,
  ...plus,
})

describe('NOTION.md § 6 : la poignée', () => {
  it('la zone de survol va de 150 px à gauche du bloc à son bord droit exclu', () => {
    const lignes = [L('A', 0, 40)]
    expect(survolDe(lignes, 250, 20)?.id).toBe('A')
    expect(survolDe(lignes, 249, 20)).toBeNull()
    expect(survolDe(lignes, 1119, 20)?.id).toBe('A')
    expect(survolDe(lignes, 1120, 20)).toBeNull()
    expect(survolDe(lignes, 600, 40)).toBeNull()
  })

  it('plusieurs blocs : le plus en retrait gagne ; la rangée n’a pas de poignée', () => {
    const lignes = [L('R', 0, 40, { type: 'colonnes' }), L('A', 0, 40, { gauche: 400, droite: 700 }), L('B', 0, 40, { gauche: 760, droite: 1120, cadre: { gauche: 760, droite: 1120 } })]
    expect(survolDe(lignes, 700, 20)?.id).toBe('B')
    expect(survolDe(lignes, 500, 20)?.id).toBe('A')
  })

  it('le bord gauche d’un bloc suit son niveau, d’un pas par niveau', () => {
    expect(bordGauche({ cadre: { gauche: 400 }, niveau: 2 })).toBe(464)
    expect(bordGauche({ cadre: { gauche: 400 }, niveau: 2 }, 24)).toBe(448)
  })

  it('la poignée de 24 px se centre sur la première ligne', () => {
    expect(hautPoignee(284)).toBe(272)
  })

  it('un point tenu à moins de 6 px est un clic', () => {
    expect(estGlisse(3, 4)).toBe(false)
    expect(estGlisse(6, 0)).toBe(true)
  })
})

describe('NOTION.md § 7 : le défilement automatique', () => {
  it('la vitesse va de H/600 px par image au bord de la bande à 3·H/60 au bord de la fenêtre, en carré', () => {
    expect(vitesseDefilement(90, 90, 900)).toBeCloseTo(1.5)
    expect(vitesseDefilement(0, 90, 900)).toBeCloseTo(45)
    expect(vitesseDefilement(45, 90, 900)).toBeCloseTo(1.5 + 43.5 * 0.25)
    // Hors de la fenêtre, la vitesse reste au plafond.
    expect(vitesseDefilement(-50, 90, 900)).toBeCloseTo(45)
  })

  it('la bande fait 10 % de la hauteur, 20 px au moins, en haut et en bas', () => {
    expect(defilementAuto(500, 0, 900)).toBe(0)
    expect(defilementAuto(10, 0, 900)).toBeLessThan(0)
    expect(defilementAuto(895, 0, 900)).toBeGreaterThan(0)
    expect(defilementAuto(89, 0, 900)).toBeCloseTo(-vitesseDefilement(89, 90, 900))
    expect(defilementAuto(91, 0, 900)).toBe(0)
    // Une zone basse : la bande ne descend pas sous 20 px.
    expect(defilementAuto(19, 0, 100)).toBeLessThan(0)
    expect(defilementAuto(21, 0, 100)).toBe(0)
  })
})

describe('NOTION.md § 7 : le halo de sélection', () => {
  it('2 px de retrait, 1 px entre deux éléments de liste voisins', () => {
    expect(retraitsHalo('texte', 'texte', 'texte')).toEqual({ haut: 2, bas: 2, cote: 2 })
    expect(retraitsHalo('puce', 'puce', 'numero')).toEqual({ haut: 1, bas: 1, cote: 2 })
    expect(retraitsHalo('puce', 'texte', null)).toEqual({ haut: 2, bas: 2, cote: 2 })
  })

  it('le rayon : 4 px, 16 px pour un encadré et un code, aucun pour un tableau', () => {
    expect([rayonHalo('texte'), rayonHalo('encadre'), rayonHalo('code'), rayonHalo('tableau')]).toEqual([4, 16, 16, 0])
  })
})

describe('NOTION.md § 7 : glisser une sélection de texte au-delà du bloc', () => {
  it('le pointeur sort quand il quitte le bloc agrandi de 20 px', () => {
    const bloc = { gauche: 100, haut: 100, droite: 300, bas: 140 }
    expect(sortiDuTexte(bloc, 200, 155)).toBe(false)
    expect(sortiDuTexte(bloc, 200, 161)).toBe(true)
    expect(sortiDuTexte(bloc, 200, 79)).toBe(true)
    expect(sortiDuTexte(bloc, 321, 120)).toBe(true)
  })

  it('le bloc sous une hauteur, ou le plus proche au-delà des bouts', () => {
    const lignes = [L('A', 0, 40), L('B', 40, 80), L('C', 80, 120)]
    expect(ligneSelonY(lignes, 60)?.id).toBe('B')
    expect(ligneSelonY(lignes, -50)?.id).toBe('A')
    expect(ligneSelonY(lignes, 500)?.id).toBe('C')
  })
})
