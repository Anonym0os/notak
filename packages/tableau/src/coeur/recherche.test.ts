import { describe, expect, it } from 'vitest'
import { chercher, normaliser } from './recherche'
import { type Commentaire, type Element, type Note, nouvelleColonne, nouvelleNote } from './tableau'

describe('recherche', () => {
  const colonne = nouvelleColonne(0, 0, 'Été 2026')
  const dedans: Element = { ...nouvelleNote(0, 0, 'Réserver le gîte'), parent: colonne.id, ordre: 'V' }
  const haut = nouvelleNote(40, -10, 'Gîte à Biarritz, réserver vite')
  const renvoi: Element = { id: 'R', x: 0, y: 30, largeur: 10, contenu: { type: 'tableau', cible: 'T' } }
  const tout = [colonne, dedans, haut, renvoi]
  const titre = (id: string) => (id === 'T' ? 'Vacances' : undefined)

  it('ignore accents et majuscules', () => {
    expect(normaliser('ÉTÉ')).toBe('ete')
  })

  it('trouve tous les mots, dans l’ordre de lecture', () => {
    expect(chercher(tout, 'gite reserver', titre).map((e) => e.id)).toEqual([haut.id, dedans.id])
  })

  it('cherche le titre d’un tableau imbriqué et d’une colonne', () => {
    expect(chercher(tout, 'vacances', titre).map((e) => e.id)).toEqual(['R'])
    expect(chercher(tout, 'ete', titre).map((e) => e.id)).toEqual([colonne.id])
  })

  it('trouve une cellule sur son texte affiché : le résultat d’une formule, un montant formaté', () => {
    const table: Element = {
      id: 'TB',
      x: 0,
      y: 60,
      largeur: 24,
      contenu: {
        type: 'table',
        cellules: [['Total', '=SUM(B2:B3)'], ['', '1200'], ['', '34']],
        formats: [[null, { type: 'nombre', decimales: 1, sansMilliers: true }], [null, null], [null, null]],
      },
    }
    expect(chercher([...tout, table], '1234', titre).map((e) => e.id)).toEqual(['TB'])
    expect(chercher([...tout, table], 'total', titre).map((e) => e.id)).toEqual(['TB'])
  })

  it('ne trouve rien sans requête', () => {
    expect(chercher(tout, '  ', titre)).toEqual([])
  })

  it('trouve un commentaire où qu’il soit : accroché à une carte, dans la marge d’une note, sur un sujet de carte', () => {
    const fil = (texte: string): Commentaire => ({ type: 'commentaire', messages: [{ id: texte, auteur: { id: 'bob', nom: 'Bob' }, date: 1, texte }] })
    const accroche: Element = { ...nouvelleNote(0, 90, 'Budget'), commentaire: fil('Trop juste') }
    const note = nouvelleNote(0, 120, 'Programme')
    const enMarge: Element = { ...note, contenu: { ...(note.contenu as Note), fils: { f1: fil('Et le dimanche ?') } } }
    const carte: Element = { id: 'A', x: 0, y: 150, largeur: 40, contenu: { type: 'arbre', sujets: {}, fils: { s1: fil('Ce sujet manque') } } }
    const avec = [...tout, accroche, enMarge, carte]
    expect(chercher(avec, 'trop juste', titre).map((e) => e.id)).toEqual([accroche.id])
    expect(chercher(avec, 'dimanche', titre).map((e) => e.id)).toEqual([enMarge.id])
    expect(chercher(avec, 'sujet manque', titre).map((e) => e.id)).toEqual(['A'])
    // Le nom de qui a écrit se cherche aussi, comme dans une épingle.
    expect(chercher(avec, 'bob', titre).map((e) => e.id)).toEqual([accroche.id, enMarge.id, 'A'])
  })
})
