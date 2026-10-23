// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import { texteDuPaquet } from '../../coeur/pressePapiers'
import type { Element, NoeudTexte, Taches } from '../../coeur/tableau'
import { tousLesCollages, tousLesRecepteurs } from '../registre'
import { EXTENSIONS_TACHES } from './extensions'
import { ajouterALaFin } from './liste'
import { docEditeur } from './titre'
import './index'

const tache = (texte: string, attrs: Record<string, unknown> = {}, sous: NoeudTexte[] = []): NoeudTexte => ({
  type: 'taskItem',
  attrs: { checked: false, ...attrs },
  content: [texte ? { type: 'paragraph', content: [{ type: 'text', text: texte }] } : { type: 'paragraph' }, ...(sous.length ? [{ type: 'taskList', content: sous }] : [])],
})
const doc = (...taches: NoeudTexte[]): NoeudTexte => ({ type: 'doc', content: [{ type: 'taskList', content: taches }] })
const contenu = (texte: NoeudTexte, plus: Partial<Taches> = {}): Taches => ({ type: 'taches', texte, ...plus })
const noms = (texte: NoeudTexte) => (texte.content![0]!.content ?? []).map((t) => t.content![0]!.content?.[0]?.text ?? '')

let editeur: Editor
afterEach(() => editeur?.destroy())

/** Joue un copier ou un couper sur l'éditeur, avec un presse-papiers de poche. */
function presser(type: 'copy' | 'cut') {
  const donnees: Record<string, string> = {}
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(e, 'clipboardData', {
    value: { clearData: () => {}, setData: (k: string, v: string) => (donnees[k] = v), getData: (k: string) => donnees[k] ?? '' },
  })
  editeur.view.dom.dispatchEvent(e)
  return { donnees, pris: e.defaultPrevented }
}

describe('copier et couper une tâche entière', () => {
  const ouvrir = () => {
    editeur = new Editor({
      extensions: EXTENSIONS_TACHES,
      content: docEditeur(contenu(doc(tache('Appeler', { echeance: '2026-11-02', assigne: 'Léa', montreEcheance: true }, [tache('sous')]), tache('Autre')))),
    })
  }

  it('tout le texte d’une tâche : la tâche part avec ses puces, sans ses sous-tâches', () => {
    ouvrir()
    editeur.commands.setTextSelection({ from: 3, to: 10 })
    const { donnees, pris } = presser('copy')
    expect(pris).toBe(true)
    expect(donnees['text/html']).toContain('data-type="taskList"')
    expect(donnees['text/html']).toContain('data-echeance="2026-11-02"')
    expect(donnees['text/html']).toContain('data-assigne="Léa"')
    expect(donnees['text/html']).not.toContain('sous')
    expect(donnees['text/plain']).toContain('Appeler')
  })

  it('une partie du texte seulement : copie ordinaire', () => {
    ouvrir()
    editeur.commands.setTextSelection({ from: 3, to: 6 })
    // ProseMirror prend la main : le texte seul, sans la tâche ni ses puces.
    expect(presser('copy').donnees['text/html'] ?? '').not.toContain('data-echeance')
  })

  it('couper laisse la ligne vide, remise à zéro, et garde les sous-tâches', () => {
    ouvrir()
    editeur.commands.setTextSelection({ from: 3, to: 10 })
    expect(presser('cut').pris).toBe(true)
    const premiere = editeur.state.doc.firstChild!.child(0)
    expect(premiere.child(0).textContent).toBe('')
    expect(premiere.attrs).toMatchObject({ echeance: null, assigne: null, montreEcheance: null })
    expect(premiere.childCount).toBe(2)
  })

  it('le HTML copié redonne la tâche avec ses puces quand on le colle sur le tableau', () => {
    ouvrir()
    editeur.commands.setTextSelection({ from: 3, to: 10 })
    const { donnees } = presser('copy')
    const recepteur = tousLesRecepteurs().find((r) => r.priorite === 20)!
    const [op] = recepteur.recevoir({ getData: (k: string) => donnees[k] ?? '' } as unknown as DataTransfer, { x: 4, y: 6 }, {} as never) as { element: Element<Taches> }[]
    const t = op!.element.contenu.texte.content![0]!.content![0]!
    expect(t.attrs).toMatchObject({ echeance: '2026-11-02', assigne: 'Léa', montreEcheance: true })
    expect(t.content![0]!.content![0]!.text).toBe('Appeler')
  })
})

describe('coller des tâches sur une liste choisie', () => {
  const liste = (id: string, texte: NoeudTexte, plus: Partial<Taches> = {}): Element<Taches> => ({ id, x: 0, y: 0, largeur: 34, contenu: contenu(texte, plus) })
  const coller = (paquet: Element[], choisis: Element[]) => tousLesCollages().map((c) => c({ elements: paquet, cadre: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } } }, choisis, {} as never)).find(Boolean) ?? null

  it('les tâches s’ajoutent à la fin, sans le titre de la liste copiée', () => {
    const cible = liste('A', doc(tache('a1'), tache('a2')))
    const [op] = coller([liste('B', doc(tache('b1', {}, [tache('b1bis')])), { titre: 'Autre' })], [cible]) as { id: string; apres: Taches }[]
    expect(op!.id).toBe('A')
    expect(noms(op!.apres.texte)).toEqual(['a1', 'a2', 'b1'])
    expect(op!.apres.titre).toBeUndefined()
    expect(op!.apres.texte.content![0]!.content![2]!.content).toHaveLength(2)
  })

  it('une liste vierge est remplacée', () => {
    const cible = liste('A', doc(tache('')))
    const [op] = coller([liste('B', doc(tache('b1')))], [cible]) as { apres: Taches }[]
    expect(noms(op!.apres.texte)).toEqual(['b1'])
  })

  it('rien quand ce n’est pas une seule liste qui est choisie, ou ce n’est pas des tâches qu’on colle', () => {
    expect(coller([liste('B', doc(tache('b1')))], [liste('A', doc(tache('a'))), liste('A2', doc(tache('a')))])).toBeNull()
    expect(coller([liste('B', doc(tache('b1')))], [])).toBeNull()
    expect(coller([{ id: 'N', x: 0, y: 0, largeur: 34, contenu: { type: 'colonne', titre: 'C' } }], [liste('A', doc(tache('a')))])).toBeNull()
  })

  it('ajouterALaFin laisse la destination quand il n’y a rien à ajouter', () => {
    const d = doc(tache('a'))
    expect(ajouterALaFin(d, { type: 'doc', content: [] })).toBe(d)
  })
})

describe('le texte brut d’une liste copiée', () => {
  it('le titre d’abord, puis une ligne par tâche, les sous-tâches décalées de 4 espaces', () => {
    const element: Element<Taches> = { id: 'A', x: 0, y: 0, largeur: 34, contenu: contenu(doc(tache('un', {}, [tache('deux', {}, [tache('trois')])]), tache('quatre')), { titre: 'Liste' }) }
    expect(texteDuPaquet({ elements: [element], cadre: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } } })).toBe('Liste\nun\n    deux\n        trois\nquatre')
  })
})
