// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte, Taches } from '../../coeur/tableau'
import { EXTENSIONS_TACHES, clavierListe, gestesDe, retirerDansEditeur, retrait } from './extensions'
import { contenuDepuis, docEditeur } from './titre'

/** Une liste décrite en JS : un texte est une tâche, un tableau est la sous-liste de la tâche d'avant. */
type Plan = (string | Plan)[]

const tache = (texte: string, sous: NoeudTexte[] = [], attrs: Record<string, unknown> = {}): NoeudTexte => ({
  type: 'taskItem',
  attrs: { checked: false, ...attrs },
  content: [texte ? { type: 'paragraph', content: [{ type: 'text', text: texte }] } : { type: 'paragraph' }, ...(sous.length > 0 ? [{ type: 'taskList', content: sous }] : [])],
})

function items(plan: Plan, attrs: Record<string, Record<string, unknown>> = {}): NoeudTexte[] {
  const res: NoeudTexte[] = []
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i]!
    if (typeof p !== 'string') continue
    const suivant = plan[i + 1]
    if (Array.isArray(suivant)) {
      res.push(tache(p, items(suivant, attrs), attrs[p]))
      i++
    } else res.push(tache(p, [], attrs[p]))
  }
  return res
}

const contenu = (plan: Plan, attrs: Record<string, Record<string, unknown>> = {}, titre?: string): Taches => ({
  type: 'taches',
  ...(titre !== undefined ? { titre } : {}),
  texte: { type: 'doc', content: [{ type: 'taskList', content: items(plan, attrs) }] },
})

function lire(n: NoeudTexte): Plan {
  const res: Plan = []
  for (const t of n.content?.[0]?.content ?? []) {
    res.push(t.content?.[0]?.content?.[0]?.text ?? '')
    const sous = t.content?.[1]
    if (sous) res.push(lire({ type: 'doc', content: [sous] }))
  }
  return res
}

let editeur: Editor
const ouvrir = (c: Taches) => (editeur = new Editor({ extensions: [...EXTENSIONS_TACHES, clavierListe({ current: { jeter: () => {} } })], content: docEditeur(c) }))
afterEach(() => editeur?.destroy())
const actuel = () => lire(contenuDepuis(editeur.getJSON() as NoeudTexte, contenu([])).texte)
const attrsDe = (texte: string) => {
  let res: Record<string, unknown> = {}
  editeur.state.doc.descendants((n) => {
    if (n.type.name === 'taskItem' && n.child(0).textContent === texte) res = n.attrs
  })
  return res
}

/** Le curseur au début ou à la fin du texte de la tâche qui porte ce texte. */
function curseur(texte: string, ou: 'debut' | 'fin') {
  editeur.state.doc.descendants((n, pos) => {
    if (n.type.name === 'paragraph' && n.textContent === texte) editeur.commands.setTextSelection(pos + 1 + (ou === 'fin' ? n.content.size : 0))
  })
}
const touche = (key: string, options: KeyboardEventInit = {}) =>
  editeur.view.someProp('handleKeyDown', (f) => f(editeur.view, new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }))) === true
const taper = (texte: string) => {
  const { from, to } = editeur.state.selection
  editeur.view.dispatch(editeur.state.tr.insertText(texte, from, to))
}
const cursor = () => {
  taper('|')
  return actuel()
}

describe('Suppr', () => {
  it('au bout d’une tâche, la tâche suivante s’y fond', () => {
    ouvrir(contenu(['ab', 'cd', 'ef']))
    curseur('ab', 'fin')
    expect(touche('Delete')).toBe(true)
    expect(actuel()).toEqual(['abcd', 'ef'])
  })

  it('la suite garde sa place : c’est la première sous-tâche qui s’y fond', () => {
    ouvrir(contenu(['ab', ['s1', 's2'], 'cd']))
    curseur('ab', 'fin')
    touche('Delete')
    expect(actuel()).toEqual(['abs1', ['s2'], 'cd'])
  })

  it('la sous-tâche qui se fond laisse ses propres sous-tâches à sa place', () => {
    ouvrir(contenu(['ab', ['s1', ['t1']]]))
    curseur('ab', 'fin')
    touche('Delete')
    expect(actuel()).toEqual(['abs1', ['t1']])
  })

  it('la tâche suivante emmène ses sous-tâches', () => {
    ouvrir(contenu(['ab', 'cd', ['d1']]))
    curseur('ab', 'fin')
    touche('Delete')
    expect(actuel()).toEqual(['abcd', ['d1']])
  })

  it('au bout d’une sous-tâche, la tâche d’après (du niveau d’au-dessus) s’y fond', () => {
    ouvrir(contenu(['A', ['a1'], 'B']))
    curseur('a1', 'fin')
    touche('Delete')
    expect(actuel()).toEqual(['A', ['a1B']])
  })

  it('sur une tâche vide, elle disparaît et le curseur passe au début de la suivante, qui garde ses puces', () => {
    ouvrir(contenu(['', 'cd'], { cd: { echeance: '2026-11-02' } }))
    curseur('', 'debut')
    touche('Delete')
    expect(actuel()).toEqual(['cd'])
    expect(attrsDe('cd')).toMatchObject({ echeance: '2026-11-02' })
    expect(cursor()).toEqual(['|cd'])
  })

  it('à la dernière ligne, rien ; au milieu d’un texte, Suppr garde son geste', () => {
    ouvrir(contenu(['ab', 'cd']))
    curseur('cd', 'fin')
    expect(touche('Delete')).toBe(true)
    expect(actuel()).toEqual(['ab', 'cd'])
    curseur('ab', 'debut')
    expect(touche('Delete')).toBe(false)
  })

  it('la fusion garde les puces de la première, pas celles de la seconde', () => {
    ouvrir(contenu(['ab', 'cd'], { ab: { assigne: 'Léa' }, cd: { echeance: '2026-11-02' } }))
    curseur('ab', 'fin')
    touche('Delete')
    expect(attrsDe('abcd')).toMatchObject({ assigne: 'Léa', echeance: null })
  })

  it('refuse de fondre des sous-tâches qui passeraient le sixième niveau', () => {
    // 'f' est au niveau 5 ; la suivante 'X' (niveau 1) a 3 niveaux : ses enfants iraient jusqu'au niveau 8.
    ouvrir(contenu(['1', ['2', ['3', ['4', ['f']]]], 'X', ['x1', ['x2']]]))
    curseur('f', 'fin')
    touche('Delete')
    expect(actuel()).toEqual(['1', ['2', ['3', ['4', ['f']]]], 'X', ['x1', ['x2']]])
  })

  it('Cmd+Suppr au bout d’une tâche fait de même', () => {
    ouvrir(contenu(['', 'cd']))
    curseur('', 'debut')
    expect(touche('Delete', { ctrlKey: true })).toBe(true)
    expect(actuel()).toEqual(['cd'])
    ouvrir(contenu(['ab', 'cd']))
    curseur('ab', 'fin')
    touche('Delete', { ctrlKey: true })
    expect(actuel()).toEqual(['abcd'])
  })
})

describe('Maj+Tab, quand la tâche a déjà des sous-tâches', () => {
  it('les tâches qui la suivent deviennent ses sous-tâches', () => {
    ouvrir(contenu(['A', ['a1', 'x', ['x1'], 'a3']]))
    curseur('x', 'debut')
    expect(retrait(editeur, -1)).toBe(true)
    expect(actuel()).toEqual(['A', ['a1'], 'x', ['x1', 'a3']])
  })

  it('sans sous-tâche, elles la suivent comme avant', () => {
    ouvrir(contenu(['A', ['a1', 'x', 'a3']]))
    curseur('x', 'debut')
    retrait(editeur, -1)
    expect(actuel()).toEqual(['A', ['a1'], 'x', ['a3']])
  })

  it('Retour arrière au début de la première sous-tâche, même avec des sœurs derrière', () => {
    ouvrir(contenu(['A', ['x', ['x1'], 'a3']]))
    curseur('x', 'debut')
    expect(touche('Backspace')).toBe(true)
    expect(actuel()).toEqual(['A', 'x', ['x1', 'a3']])
  })
})

describe('Entrée sur une sélection de plusieurs lignes', () => {
  it('la sélection s’efface, puis Entrée scinde au curseur', () => {
    ouvrir(contenu(['abcd', 'efgh']))
    // De "bcd" à "ef".
    editeur.commands.setTextSelection({ from: 4, to: 13 })
    touche('Enter')
    expect(actuel()).toEqual(['a', 'gh'])
  })

  it('une sélection qui ne tient que la frontière place le curseur au début de la seconde', () => {
    ouvrir(contenu(['ab', 'cd']))
    editeur.commands.setTextSelection({ from: 5, to: 9 })
    touche('Enter')
    expect(actuel()).toEqual(['ab', 'cd'])
    expect(editeur.state.selection.empty).toBe(true)
    expect(editeur.state.selection.$from.parentOffset).toBe(0)
    expect(editeur.state.selection.$from.parent.textContent).toBe('cd')
  })
})

describe('Flèches de bord', () => {
  it('flèche droite au bout d’une tâche : début de la suivante ; à la dernière, le curseur reste', () => {
    ouvrir(contenu(['ab', 'cd']))
    curseur('ab', 'fin')
    expect(touche('ArrowRight')).toBe(true)
    expect(cursor()).toEqual(['ab', '|cd'])
    ouvrir(contenu(['ab', 'cd']))
    curseur('cd', 'fin')
    expect(touche('ArrowRight')).toBe(true)
    expect(cursor()).toEqual(['ab', 'cd|'])
  })

  it('Maj+flèche droite étend jusqu’au début du bloc suivant', () => {
    ouvrir(contenu(['ab', 'cd']))
    curseur('ab', 'fin')
    expect(touche('ArrowRight', { shiftKey: true })).toBe(true)
    const s = editeur.state.selection
    expect(s.from).toBe(5)
    expect(s.to).toBe(9)
  })

  it('au milieu d’un texte, la flèche garde son geste', () => {
    ouvrir(contenu(['abcd']))
    curseur('abcd', 'debut')
    expect(touche('ArrowRight')).toBe(false)
  })
})

describe('autres touches', () => {
  it('Cmd+Maj+9 ne sort pas les tâches de la liste', () => {
    ouvrir(contenu(['ab']))
    curseur('ab', 'fin')
    expect(touche('9', { ctrlKey: true, shiftKey: true })).toBe(true)
    expect(actuel()).toEqual(['ab'])
  })

  it('Alt+Retour ajoute le titre, curseur dedans ; il y revient s’il existe', () => {
    ouvrir(contenu(['ab']))
    curseur('ab', 'fin')
    expect(touche('Enter', { altKey: true })).toBe(true)
    expect(editeur.state.doc.firstChild?.type.name).toBe('titreListe')
    curseur('ab', 'fin')
    touche('Enter', { altKey: true })
    taper('T')
    expect(contenuDepuis(editeur.getJSON() as NoeudTexte, contenu([])).titre).toBe('T')
  })
})

describe('retirer la dernière tâche, dans l’éditeur', () => {
  const avecGestes = (c: Taches) => {
    let jetee = false
    ouvrir(c)
    gestesDe.set(editeur, { current: { jeter: () => (jetee = true), titreCache: () => c.titreCache } })
    return () => jetee
  }

  it('sans titre : la liste part à la corbeille', () => {
    const jetee = avecGestes(contenu(['ab']))
    retirerDansEditeur(editeur, 1)
    expect(jetee()).toBe(true)
  })

  it('avec un titre : une tâche vide reste, le curseur monte au titre', () => {
    const jetee = avecGestes(contenu(['ab'], {}, 'Courses'))
    retirerDansEditeur(editeur, editeur.state.doc.firstChild!.nodeSize + 1)
    expect(jetee()).toBe(false)
    expect(actuel()).toEqual([''])
    taper('!')
    expect(contenuDepuis(editeur.getJSON() as NoeudTexte, contenu([])).titre).toBe('Courses!')
  })

  it('avec plusieurs tâches : seule la tâche part', () => {
    const jetee = avecGestes(contenu(['ab', 'cd']))
    retirerDansEditeur(editeur, 1)
    expect(jetee()).toBe(false)
    expect(actuel()).toEqual(['cd'])
  })
})
