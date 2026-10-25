import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { poserIds } from './ids'
import { EXTENSIONS_BLOCS } from './schema'
import { AIR, cibleDefilement, longueurTrait, memesTitres, placeSuffisante, retraitLigne, SEUIL, titreCourant, titresDe } from './sommaireTitres'

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
})

const b = (type: string, text: string, attrs: Record<string, unknown> = {}): NoeudTexte => ({ type, attrs, ...(text ? { content: [{ type: 'text', text }] } : {}) })
const h = (niveau: number, text: string, attrs: Record<string, unknown> = {}) => b('heading', text, { level: niveau, ...attrs })

function ouvrir(blocs: NoeudTexte[]): Editor {
  editeur = new Editor({ extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content: blocs } })
  const ids = poserIds(editeur.state)
  if (ids) editeur.view.dispatch(ids)
  return editeur
}

describe('NOTION.md § 9 : le sommaire latéral', () => {
  it('le trait est de 16 px pour un titre 1, 12 px pour un titre 2, 8 px pour un titre 3', () => {
    expect([1, 2, 3].map((n) => longueurTrait(n as 1 | 2 | 3))).toEqual([16, 12, 8])
  })

  it('la ligne du panneau est à 6 px du bord, puis 12 px de plus par niveau', () => {
    expect([1, 2, 3].map((n) => retraitLigne(n as 1 | 2 | 3))).toEqual([6, 18, 30])
  })

  it('les titres de la page, dans l’ordre, avec ceux des colonnes et les titres dépliants', () => {
    const ed = ouvrir([
      h(1, 'Un'),
      b('paragraph', 'texte'),
      h(2, 'Deux', { depliant: true, ouvert: false }),
      h(3, 'Caché', { retrait: 1 }),
      { type: 'colonnes', content: [{ type: 'colonne', content: [h(2, 'Dans la colonne')] }, { type: 'colonne', content: [b('paragraph', 'autre')] }] },
      h(3, 'Fin'),
    ])
    expect(titresDe(ed.state.doc).map((t) => [t.niveau, t.texte])).toEqual([
      [1, 'Un'],
      [2, 'Deux'],
      [3, 'Caché'],
      [2, 'Dans la colonne'],
      [3, 'Fin'],
    ])
    expect(titresDe(ed.state.doc).every((t) => !!t.id)).toBe(true)
  })

  it('une page sans titre n’en liste aucun', () => {
    expect(titresDe(ouvrir([b('paragraph', 'a'), b('puce', 'b')]).state.doc)).toEqual([])
  })

  it('deux listes identiques ne se redessinent pas', () => {
    const a = [{ id: 'A', niveau: 1 as const, texte: 'x' }]
    expect(memesTitres(a, [{ ...a[0]! }])).toBe(true)
    expect(memesTitres(a, [{ ...a[0]!, texte: 'y' }])).toBe(false)
    expect(memesTitres(a, [])).toBe(false)
  })

  it('le titre courant est le dernier passé en haut de la zone, le premier s’il n’y en a aucun', () => {
    expect(titreCourant([-400, -50, 300, 900])).toBe(1)
    expect(titreCourant([SEUIL, SEUIL + 1, 900])).toBe(0)
    expect(titreCourant([120, 300, 900])).toBe(0)
    expect(titreCourant([-10, 20, 40, 70])).toBe(3)
    expect(titreCourant([])).toBe(0)
  })

  it('un titre caché par un dépliant fermé n’est jamais le courant', () => {
    expect(titreCourant([-300, null, null, 500])).toBe(0)
    expect(titreCourant([-300, -200, null, 500])).toBe(1)
  })

  it('au clic, le titre s’arrête un peu sous le haut de la zone, jamais au-dessus de zéro', () => {
    // La zone commence à 44, le titre est à 844 : on défile de 800 moins le décalage, en plus du défilement présent.
    expect(cibleDefilement(844, 44, 1000, 56)).toBe(1744)
    expect(cibleDefilement(60, 44, 0, 56)).toBe(0)
    expect(cibleDefilement(-300, 44, 200, 56)).toBe(0)
  })

  it('la colonne ne se montre que si elle tient à droite du texte, sans le chevaucher', () => {
    // Fenêtre de 1728, texte centré de 720 px : il finit à 1224, la colonne commence à 1728 - 35 - 16 - 20 = 1657.
    expect(placeSuffisante(1728, 1224)).toBe(true)
    expect(placeSuffisante(900, 840)).toBe(false)
    const gauche = 1000 - 35 - 16 - 20
    expect(placeSuffisante(1000, gauche - AIR)).toBe(true)
    expect(placeSuffisante(1000, gauche - AIR + 1)).toBe(false)
  })
})
