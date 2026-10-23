import { describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../../coeur/tableau'
import { cheminsEnOrdre, deplacer, sousTaches } from './liste'

describe('deplacer', () => {
  type Plan = (string | Plan)[]
  const t = (texte: string, sous: NoeudTexte[] = []): NoeudTexte => ({
    type: 'taskItem',
    attrs: { checked: false },
    content: [{ type: 'paragraph', content: [{ type: 'text', text: texte }] }, ...(sous.length ? [{ type: 'taskList', content: sous }] : [])],
  })
  const liste = (...taches: NoeudTexte[]): NoeudTexte => ({ type: 'doc', content: [{ type: 'taskList', content: taches }] })
  const lire = (doc: NoeudTexte): Plan =>
    sousTaches(doc).flatMap((x): Plan => {
      const texte = x.content![0]!.content![0]!.text!
      return sousTaches(x).length ? [texte, lire(x)] : [texte]
    })
  // A, B (b1, b2), C
  const doc = liste(t('A'), t('B', [t('b1'), t('b2')]), t('C'))

  it('compte les tâches dans l’ordre de lecture', () => {
    expect(cheminsEnOrdre(doc)).toEqual([[0], [1], [1, 0], [1, 1], [2]])
  })

  it('passe une tâche avant ou après une autre du même niveau', () => {
    expect(lire(deplacer(doc, 4, 0, true))).toEqual(['C', 'A', 'B', ['b1', 'b2']])
    expect(lire(deplacer(doc, 0, 4, false))).toEqual(['B', ['b1', 'b2'], 'C', 'A'])
    expect(lire(deplacer(doc, 0, 1, false))).toEqual(['B', ['b1', 'b2'], 'A', 'C'])
  })

  it('emmène les sous-tâches avec elle', () => {
    expect(lire(deplacer(doc, 1, 4, false))).toEqual(['A', 'C', 'B', ['b1', 'b2']])
    expect(lire(deplacer(doc, 1, 0, true))).toEqual(['B', ['b1', 'b2'], 'A', 'C'])
  })

  it('range une tâche parmi les sous-tâches d’une autre, au niveau de la cible', () => {
    expect(lire(deplacer(doc, 0, 3, true))).toEqual(['B', ['b1', 'A', 'b2'], 'C'])
    expect(lire(deplacer(doc, 4, 2, false))).toEqual(['A', 'B', ['b1', 'C', 'b2']])
  })

  it('sort une sous-tâche vers le haut, et supprime la sous-liste devenue vide', () => {
    const seul = liste(t('A', [t('a1')]), t('B'))
    expect(lire(deplacer(seul, 1, 2, false))).toEqual(['A', 'B', 'a1'])
  })

  it('un frère d’après la tâche garde le bon rang une fois la tâche partie', () => {
    expect(lire(deplacer(doc, 2, 3, false))).toEqual(['A', 'B', ['b2', 'b1'], 'C'])
    expect(lire(deplacer(doc, 2, 4, true))).toEqual(['A', 'B', ['b2'], 'b1', 'C'])
  })

  it('refuse de se poser sur soi ou dans ses propres sous-tâches', () => {
    expect(deplacer(doc, 1, 1, true)).toBe(doc)
    expect(deplacer(doc, 1, 2, true)).toBe(doc)
    expect(deplacer(doc, 1, 3, false)).toBe(doc)
  })

  it('refuse un rang qui n’existe pas', () => {
    expect(deplacer(doc, 9, 0, true)).toBe(doc)
    expect(deplacer(doc, 0, 9, true)).toBe(doc)
  })

  it('refuse une tâche à sous-tâches au sixième niveau, accepte une tâche seule', () => {
    let profond = t('6')
    for (const n of ['5', '4', '3', '2']) profond = t(n, [profond])
    // 1 > 2 > 3 > 4 > 5 > 6, puis X (une sous-tâche) et Y (seule)
    const d = liste(t('1', [profond]), t('X', [t('x1')]), t('Y'))
    // "6" est au niveau 6 : X (hauteur 2) ne peut pas devenir son frère, Y le peut.
    expect(deplacer(d, 6, 5, true)).toBe(d)
    expect(lire(deplacer(d, 8, 5, true))).toEqual(['1', ['2', ['3', ['4', ['5', ['Y', '6']]]]], 'X', ['x1']])
  })
})
