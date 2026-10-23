// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../../coeur/tableau'
import { EXTENSIONS_TACHES, cocherDansEditeur } from './extensions'

/** Une liste décrite en JS : un texte est une tâche, un tableau est la sous-liste de la tâche d'avant. */
type Plan = (string | Plan)[]

const tache = (texte: string, sous: NoeudTexte[] = []): NoeudTexte => ({
  type: 'taskItem',
  attrs: { checked: false },
  content: [
    texte ? { type: 'paragraph', content: [{ type: 'text', text: texte }] } : { type: 'paragraph' },
    ...(sous.length > 0 ? [{ type: 'taskList', content: sous }] : []),
  ],
})

function items(plan: Plan): NoeudTexte[] {
  const res: NoeudTexte[] = []
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i]!
    const suivant = plan[i + 1]
    if (typeof p !== 'string') continue
    if (Array.isArray(suivant)) {
      res.push(tache(p, items(suivant)))
      i++
    } else res.push(tache(p))
  }
  return res
}

const doc = (plan: Plan): NoeudTexte => ({ type: 'doc', content: [{ type: 'taskList', content: items(plan) }] })

/** Le plan que décrit un document, pour comparer. */
function plan(n: NoeudTexte): Plan {
  const res: Plan = []
  for (const t of n.content?.[0]?.content ?? []) {
    res.push(t.content?.[0]?.content?.[0]?.text ?? '')
    const sous = t.content?.[1]
    if (sous) res.push(plan({ type: 'doc', content: [sous] }))
  }
  return res
}

let editeur: Editor
const ouvrir = (p: Plan) => (editeur = new Editor({ extensions: EXTENSIONS_TACHES, content: doc(p) }))
afterEach(() => editeur?.destroy())

/** La position d'une tâche (la n-ième dans l'ordre du document) : curseur au début ou à la fin de son texte. */
function curseur(n: number, ou: 'debut' | 'fin') {
  let k = 0
  editeur.state.doc.descendants((noeud, pos) => {
    if (noeud.type.name !== 'taskItem') return
    if (k++ === n) {
      const p = noeud.child(0)
      editeur.commands.setTextSelection(pos + 2 + (ou === 'fin' ? p.content.size : 0))
    }
  })
}

/** Joue une touche comme le fait le navigateur ; rend vrai si l'éditeur l'a prise. */
function touche(key: string, options: KeyboardEventInit = {}) {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
  const pris = editeur.view.someProp('handleKeyDown', (f) => f(editeur.view, e)) === true
  return pris
}

const actuel = () => plan(editeur.getJSON() as NoeudTexte)

describe('Entrée', () => {
  it('scinde la tâche au curseur', () => {
    ouvrir(['abcd'])
    editeur.commands.setTextSelection(5) // entre "ab" et "cd"
    touche('Enter')
    expect(actuel()).toEqual(['ab', 'cd'])
  })

  it('sur une tâche vide imbriquée, la fait remonter d’un niveau', () => {
    ouvrir(['A', ['a1', '']])
    curseur(2, 'debut')
    touche('Enter')
    expect(actuel()).toEqual(['A', ['a1'], ''])
  })

  it('sur une tâche vide tout en haut, ne fait rien', () => {
    ouvrir(['A', ''])
    curseur(1, 'debut')
    expect(touche('Enter')).toBe(true)
    expect(actuel()).toEqual(['A', ''])
  })
})

describe('Retour arrière', () => {
  it('au début d’une tâche, la fusionne avec la précédente', () => {
    ouvrir(['un', 'deux'])
    curseur(1, 'debut')
    touche('Backspace')
    expect(actuel()).toEqual(['undeux'])
  })

  it('au début de la première tâche, ne casse rien', () => {
    ouvrir(['un', 'deux'])
    curseur(0, 'debut')
    touche('Backspace')
    expect(actuel()).toEqual(['un', 'deux'])
  })

  it('dans l’unique tâche vide, laisse une tâche', () => {
    ouvrir([''])
    curseur(0, 'debut')
    touche('Backspace')
    expect(actuel()).toEqual([''])
  })

  it('rejoint la dernière sous-tâche de la précédente, et lui amène ses propres sous-tâches', () => {
    ouvrir(['A', ['a1', 'a2'], 'B', ['b1']])
    curseur(3, 'debut') // B
    touche('Backspace')
    expect(actuel()).toEqual(['A', ['a1', 'a2B', ['b1']]])
  })

  it('amenée plus profond que le sixième niveau, ne fait rien', () => {
    ouvrir(['1', ['2', ['3', ['4', ['5', ['6']]]]], 'B', ['b1']])
    curseur(6, 'debut') // B (niveau 1) irait dans "6" : b1 passerait au niveau 7
    touche('Backspace')
    expect(actuel()).toEqual(['1', ['2', ['3', ['4', ['5', ['6']]]]], 'B', ['b1']])
  })

  it('au début de la première sous-tâche, la remonte d’un niveau (Tiptap)', () => {
    ouvrir(['A', ['x', 'y']])
    curseur(1, 'debut')
    touche('Backspace')
    expect(actuel()).toEqual(['A', 'x', ['y']])
  })

  it('au début d’une sous-tâche, la fusionne avec la précédente', () => {
    ouvrir(['A', ['x', 'y']])
    curseur(2, 'debut')
    touche('Backspace')
    expect(actuel()).toEqual(['A', ['xy']])
  })
})

describe('Cmd ou Alt + retour arrière', () => {
  it('sur une tâche vide, la réduit dans la précédente', () => {
    ouvrir(['un', ''])
    curseur(1, 'debut')
    expect(touche('Backspace', { altKey: true })).toBe(true)
    expect(actuel()).toEqual(['un'])
  })

  it('Cmd (Ctrl sous jsdom) fait de même, et ramène les sous-tâches', () => {
    ouvrir(['un', '', ['b1']])
    curseur(1, 'debut')
    touche('Backspace', { ctrlKey: true })
    expect(actuel()).toEqual(['un', ['b1']])
  })

  it('sur la première sous-tâche vide, la remonte d’un niveau', () => {
    ouvrir(['A', ['', 'y']])
    curseur(1, 'debut')
    expect(touche('Backspace', { altKey: true })).toBe(true)
    expect(actuel()).toEqual(['A', '', ['y']])
  })

  it('sur une tâche qui a du texte, laisse le navigateur effacer le mot', () => {
    ouvrir(['un', 'deux'])
    curseur(1, 'fin')
    expect(touche('Backspace', { altKey: true })).toBe(false)
    expect(actuel()).toEqual(['un', 'deux'])
  })

  it('sur l’unique tâche vide tout en haut, ne casse rien', () => {
    ouvrir([''])
    curseur(0, 'debut')
    touche('Backspace', { altKey: true })
    expect(actuel()).toEqual([''])
  })
})

describe('Échéance', () => {
  const echeances = () => {
    const res: (string | null)[] = []
    editeur.state.doc.descendants((n) => {
      if (n.type.name === 'taskItem') res.push((n.attrs.echeance as string | null) ?? null)
    })
    return res
  }

  it('se pose sur la tâche et reste dans le JSON', () => {
    ouvrir(['A', 'B'])
    editeur.view.dispatch(editeur.state.tr.setNodeMarkup(1, undefined, { ...editeur.state.doc.nodeAt(1)!.attrs, echeance: '2026-10-30' }))
    expect(echeances()).toEqual(['2026-10-30', null])
    const json = editeur.getJSON() as NoeudTexte
    expect(json.content![0]!.content![0]!.attrs!.echeance).toBe('2026-10-30')
  })

  it('ne se recopie pas sur la tâche née d’Entrée', () => {
    ouvrir(['abcd'])
    editeur.view.dispatch(editeur.state.tr.setNodeMarkup(1, undefined, { ...editeur.state.doc.nodeAt(1)!.attrs, echeance: '2026-10-30' }))
    editeur.commands.setTextSelection(5)
    touche('Enter')
    expect(actuel()).toEqual(['ab', 'cd'])
    expect(echeances()).toEqual(['2026-10-30', null])
  })

  it('la personne assignée ne se recopie pas non plus, mais reste dans le JSON', () => {
    ouvrir(['abcd'])
    editeur.view.dispatch(editeur.state.tr.setNodeMarkup(1, undefined, { ...editeur.state.doc.nodeAt(1)!.attrs, assigne: 'Léa' }))
    editeur.commands.setTextSelection(5)
    touche('Enter')
    const noms: unknown[] = []
    editeur.state.doc.descendants((n) => void (n.type.name === 'taskItem' && noms.push(n.attrs.assigne)))
    expect(noms).toEqual(['Léa', null])
  })

  it('se relit depuis le JSON', () => {
    editeur = new Editor({
      extensions: EXTENSIONS_TACHES,
      content: { type: 'doc', content: [{ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false, echeance: '2026-11-02' }, content: [{ type: 'paragraph' }] }] }] },
    })
    expect(echeances()).toEqual(['2026-11-02'])
  })
})

describe('Collage', () => {
  /** Colle comme le fait le navigateur ; rend vrai si l'éditeur a pris le collage. */
  const coller = (html: string, texte = '') => {
    const donnees = { getData: (type: string) => (type === 'text/html' ? html : type === 'text/plain' ? texte : '') }
    const e = { clipboardData: donnees } as unknown as ClipboardEvent
    return editeur.view.someProp('handlePaste', (f) => f(editeur.view, e)) === true
  }

  it('une liste HTML (Google Docs) devient des tâches avec leurs sous-tâches', () => {
    ouvrir([''])
    curseur(0, 'debut')
    expect(coller('<b id="docs-internal-guid-1"><ul><li><p>Un</p></li><li><p>Deux</p><ul><li><p>deux-a</p></li></ul></li></ul></b>', 'Un\nDeux\ndeux-a')).toBe(true)
    expect(actuel().filter((x) => x !== '')).toEqual(['Un', 'Deux', ['deux-a']])
  })

  it('un copier de Notak se colle tel quel', () => {
    ouvrir([''])
    expect(coller('<ul data-pm-slice="1 1 []"><li>a</li><li>b</li></ul>', 'a\nb')).toBe(false)
  })

  it('une phrase seule se colle comme du texte', () => {
    ouvrir([''])
    expect(coller('<p>une phrase</p>', 'une phrase')).toBe(false)
  })
})

describe('Tab', () => {
  it('fait de la tâche une sous-tâche de la précédente', () => {
    ouvrir(['A', 'B'])
    curseur(1, 'debut')
    expect(touche('Tab')).toBe(true)
    expect(actuel()).toEqual(['A', ['B']])
  })

  it('sur la première tâche, ne fait rien mais garde la touche', () => {
    ouvrir(['A', 'B'])
    curseur(0, 'debut')
    expect(touche('Tab')).toBe(true)
    expect(actuel()).toEqual(['A', 'B'])
  })

  it('s’arrête au sixième niveau', () => {
    ouvrir(['1', ['2', ['3', ['4', ['5', ['6', '6bis']]]]]])
    curseur(6, 'debut') // "6bis", déjà au niveau 6 : rien à faire
    expect(touche('Tab')).toBe(true)
    expect(actuel()).toEqual(['1', ['2', ['3', ['4', ['5', ['6', '6bis']]]]]])
  })

  it('descend jusqu’au sixième niveau', () => {
    ouvrir(['1', ['2', ['3', ['4', ['5', '5bis']]]]])
    curseur(5, 'debut') // "5bis" passe au niveau 6
    touche('Tab')
    expect(actuel()).toEqual(['1', ['2', ['3', ['4', ['5', ['5bis']]]]]])
  })

  it('refuse de descendre une tâche dont les sous-tâches dépasseraient', () => {
    ouvrir(['1', ['2', ['3', ['4', ['5']], '3bis', ['x']]]])
    curseur(5, 'debut') // "3bis" porte "x" : 3bis passerait niveau 4, x niveau 5 : permis
    touche('Tab')
    expect(actuel()).toEqual(['1', ['2', ['3', ['4', ['5'], '3bis', ['x']]]]])
  })

  it('refuse quand une sous-tâche passerait le sixième niveau', () => {
    ouvrir(['1', ['2', ['3', ['4', ['5']], '3bis', ['x', ['y', ['z']]]]]])
    curseur(5, 'debut') // 3bis : niveau 3, hauteur 4 → 3 + 4 > 6
    touche('Tab')
    expect(actuel()).toEqual(['1', ['2', ['3', ['4', ['5']], '3bis', ['x', ['y', ['z']]]]]])
  })
})

describe('Maj+Tab', () => {
  it('remonte une sous-tâche d’un niveau', () => {
    ouvrir(['A', ['a1']])
    curseur(1, 'debut')
    expect(touche('Tab', { shiftKey: true })).toBe(true)
    expect(actuel()).toEqual(['A', 'a1'])
  })

  it('en haut, ne fait rien mais garde la touche', () => {
    ouvrir(['A', 'B'])
    curseur(1, 'debut')
    expect(touche('Tab', { shiftKey: true })).toBe(true)
    expect(actuel()).toEqual(['A', 'B'])
  })
})

describe('Cases, en édition', () => {
  const coches = () => {
    const res: string[] = []
    editeur.state.doc.descendants((n) => {
      if (n.type.name === 'taskItem') res.push(`${n.child(0).textContent}:${n.attrs.checked ? 1 : 0}`)
    })
    return res.join(' ')
  }

  it('un clic coche la tâche seule', () => {
    ouvrir(['A', ['a1'], 'B'])
    cocherDansEditeur(editeur, 1, false)
    expect(coches()).toBe('A:1 a1:0 B:0')
  })

  it('Maj+clic coche aussi les sous-tâches, et décoche de même', () => {
    ouvrir(['A', ['a1', 'a2'], 'B'])
    cocherDansEditeur(editeur, 1, true)
    expect(coches()).toBe('A:1 a1:1 a2:1 B:0')
    cocherDansEditeur(editeur, 1, true)
    expect(coches()).toBe('A:0 a1:0 a2:0 B:0')
  })
})
