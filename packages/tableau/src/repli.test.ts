import { describe, expect, it } from 'vitest'
import { type EntreeRepli, ORDRE, garderAuPlus, pasDe, replier } from './repli'

const tuile = (id: string, ordre: number = ORDRE.defaut, masque?: boolean): EntreeRepli => ({ id, genre: 'tuile', ordre, ...(masque ? { masque } : {}) })
const creation = [
  tuile('note'), tuile('lien'), tuile('taches'), tuile('ligne'), tuile('tableau', ORDRE.tard), tuile('colonne'), tuile('commentaire'), tuile('table'),
  tuile('croquis', ORDRE.toujours),
  tuile('image', 2, true), tuile('fichier', 2, true), tuile('dessin', 2, true),
]
const fixe = () => 150

describe('le repli de la barre de gauche', () => {
  it('une fenêtre haute montre tout, en grande taille, sauf ce qui est toujours rangé', () => {
    const r = replier({ entrees: creation, hauteur: 2000, fixe })
    expect(r.palier).toBe('grande')
    expect(r.ranges).toEqual(['croquis'])
    expect(r.visibles).toHaveLength(creation.length - 1)
  })

  it('une fenêtre plus basse réduit d’abord les tuiles, sans rien ranger de plus', () => {
    const sansToujours = creation.filter((e) => e.ordre < ORDRE.toujours)
    const grande = fixe() + sansToujours.reduce((s) => s + pasDe('tuile', 'grande'), 0)
    const r = replier({ entrees: creation, hauteur: grande - 1, fixe })
    expect(r.palier).toBe('moyenne')
    expect(r.ranges).toEqual(['croquis'])
  })

  it('trop court même en petite taille : part d’abord le plus grand ordre (le dernier à égalité), Tableau tient plus longtemps', () => {
    const r = replier({ entrees: creation, hauteur: 600, fixe })
    expect(r.palier).toBe('petite')
    expect(r.ranges).toContain('croquis')
    expect(r.ranges).toContain('table')
    expect(r.visibles).toContain('tableau')
    const total = fixe() + r.visibles.reduce((s) => s + pasDe('tuile', 'petite'), 0)
    expect(total).toBeLessThanOrEqual(600)
    // Image, Upload, Draw (ordre 2) sont les derniers à partir, et ne sont jamais rangés.
    expect(r.visibles).toContain('image')
  })

  it('Image, Upload et Draw partent sans être rangés quand rien d’autre ne reste', () => {
    const r = replier({ entrees: creation, hauteur: 200, fixe })
    expect(r.visibles).not.toContain('image')
    expect(r.ranges).not.toContain('image')
    expect(r.ranges).not.toContain('dessin')
  })

  it('un outil d’ordre 0 ne se replie jamais', () => {
    const texte: EntreeRepli[] = [
      { id: 'style', genre: 'tuile', ordre: 10 },
      { id: 'gras', genre: 'icone', ordre: 100 },
      { id: 'code', genre: 'icone', ordre: 1005 },
      { id: 'souligne', genre: 'icone', ordre: 1004 },
      { id: 'lien', genre: 'icone', ordre: 1000 },
      { id: 'commentaire', genre: 'icone', ordre: 0 },
    ]
    const r = replier({ entrees: texte, hauteur: 10, fixe: () => 0 })
    expect(r.visibles).toEqual(['commentaire'])
    const un = replier({ entrees: texte, hauteur: 200, fixe: () => 0 })
    expect(un.ranges).toEqual(['code', 'souligne'])
    expect(un.ranges).not.toContain('commentaire')
  })
})

describe('la capsule de sélection d’un téléphone', () => {
  it('garde les trois outils les plus importants et range les autres dans le « ••• »', () => {
    const r = garderAuPlus(
      [
        { id: 'couleur', genre: 'tuile', ordre: 10 },
        { id: 'sep', genre: 'sep', ordre: 100 },
        { id: 'etiquettes', genre: 'tuile', ordre: 100 },
        { id: 'reagir', genre: 'tuile', ordre: 200 },
        { id: 'commenter', genre: 'tuile', ordre: 50 },
        { id: 'legende', genre: 'tuile', ordre: 10000 },
      ],
      3,
    )
    expect(r.visibles).toEqual(['couleur', 'etiquettes', 'commenter'])
    expect(r.ranges).toEqual(['reagir', 'legende'])
  })
})
