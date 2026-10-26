// @vitest-environment jsdom
import { TextSelection } from '@tiptap/pm/state'
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { definirLangue } from '../langue'
import { poserIds } from './ids'
import { basculerDepliants, effacerFormat, numeroAccepte, valeursDeNumero } from './saisie'
import { EXTENSIONS_BLOCS } from './schema'
import { guillemet } from './typographie'
import { colorer, dupliquerBloc, inserer, supprimerBloc, transformer, versActuel } from './transformer'

definirLangue('fr')

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
})

const p = (text: string): NoeudTexte => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })

/** Un éditeur du moteur, le curseur à la fin du premier bloc de texte. */
function ouvrir(...content: NoeudTexte[]): Editor {
  editeur = new Editor({ extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content: content.length ? content : [p('')] } })
  const ids = poserIds(editeur.state)
  if (ids) editeur.view.dispatch(ids)
  editeur.commands.setTextSelection(1)
  editeur.commands.selectTextblockEnd()
  return editeur
}

/** Tape comme au clavier : chaque caractère passe par les règles de saisie. */
function taper(ed: Editor, texte: string) {
  for (const c of texte) {
    const { from, to } = ed.state.selection
    const pris = ed.view.someProp('handleTextInput', (f) => f(ed.view, from, to, c, () => ed.state.tr.insertText(c, from, to)))
    if (!pris) ed.view.dispatch(ed.state.tr.insertText(c, from, to))
  }
}

const types = (ed: Editor) => (ed.getJSON().content ?? []).map((n) => n.type)
const texte = (ed: Editor) => ed.state.doc.textContent

describe('NOTION.md § 4 : les raccourcis markdown', () => {
  it('`#`, `##` et `###` font les trois titres', () => {
    for (const [signe, niveau] of [['#', 1], ['##', 2], ['###', 3]] as const) {
      const ed = ouvrir()
      taper(ed, `${signe} T`)
      expect(ed.getJSON().content?.[0]).toMatchObject({ type: 'heading', attrs: { level: niveau } })
      ed.destroy()
    }
  })

  it('`> ` fait un dépliant', () => {
    const ed = ouvrir()
    taper(ed, '> Plus')
    expect(types(ed)).toEqual(['depliant'])
    expect(texte(ed)).toBe('Plus')
  })

  it('un raccourci garde le retrait du bloc', () => {
    const ed = ouvrir({ type: 'paragraph', attrs: { retrait: 2 } })
    taper(ed, '- x')
    expect(ed.getJSON().content?.[0]).toMatchObject({ type: 'puce', attrs: { retrait: 2 } })
  })

  it('`---` fait un séparateur tout de suite, un texte neuf dessous', () => {
    const ed = ouvrir()
    taper(ed, '---')
    expect(types(ed)).toEqual(['horizontalRule', 'paragraph'])
    expect(ed.state.selection.$from.parent.type.name).toBe('paragraph')
  })

  it('`" ` fait une citation', () => {
    const ed = ouvrir()
    taper(ed, '" cité')
    expect(types(ed)).toEqual(['citation'])
    expect(texte(ed)).toBe('cité')
  })

  it('`- `, `1. `, `a. ` et `[] ` font des listes', () => {
    for (const [signe, type] of [['- ', 'puce'], ['* ', 'puce'], ['1. ', 'numero'], ['a. ', 'numero'], ['[] ', 'tache']] as const) {
      const ed = ouvrir()
      taper(ed, `${signe}x`)
      expect(types(ed)).toEqual([type])
      ed.destroy()
    }
  })

  it('`*mot*` met en italique (et non en gras comme dans la note), `~mot~` barre', () => {
    const ed = ouvrir()
    taper(ed, 'un *mot* et ~ça~ ')
    const marques = ((ed.getJSON().content?.[0]?.content ?? []) as NoeudTexte[]).flatMap((n) => (n.marks ?? []).map((m) => `${n.text}:${m.type}`))
    expect(marques).toEqual(['mot:italic', 'ça:strike'])
  })
})

describe('NOTION.md § 4 : les motifs complets', () => {
  const premier = (ed: Editor) => ed.getJSON().content?.[0]

  it('`[ ] `, `[x] ` et `[X] ` font une tâche, cochée pour x et X', () => {
    for (const [signe, coche] of [['[] ', false], ['[ ] ', false], ['[x] ', true], ['[X] ', true]] as const) {
      const ed = ouvrir()
      taper(ed, `${signe}a`)
      expect(premier(ed)).toMatchObject({ type: 'tache' })
      expect(!!premier(ed)?.attrs?.coche).toBe(coche)
      ed.destroy()
    }
  })

  it('`• ` fait une puce, `| ` et `“ ` une citation', () => {
    for (const [signe, type] of [['• ', 'puce'], ['| ', 'citation'], ['" ', 'citation']] as const) {
      const ed = ouvrir()
      taper(ed, `${signe}a`)
      expect(types(ed)).toEqual([type])
      ed.destroy()
    }
  })

  it('`3. ` en tête de liste la fait partir de 3 ; derrière une liste, seul le numéro suivant est pris', () => {
    const ed = ouvrir()
    taper(ed, '3. a')
    expect(ed.getJSON().content?.[0]).toMatchObject({ type: 'numero', attrs: { depart: 3 } })
    ed.destroy()
    const suite = ouvrir({ type: 'numero', content: [{ type: 'text', text: 'un' }] }, p(''))
    suite.commands.setTextSelection(suite.state.doc.child(0).nodeSize + 1)
    taper(suite, '5. b')
    expect(types(suite)).toEqual(['numero', 'paragraph'])
  })

  it('`1) ` fait une liste numérotée comme `1. `', () => {
    const ed = ouvrir()
    taper(ed, '1) a')
    expect(types(ed)).toEqual(['numero'])
  })

  it('un numéro doit continuer la liste d’avant, ou la commencer', () => {
    expect(numeroAccepte('1', 1)).toBe(true)
    expect(numeroAccepte('a', 1)).toBe(true)
    expect(numeroAccepte('i', 1)).toBe(true)
    expect(numeroAccepte('3', 1)).toBe(false)
    expect(numeroAccepte('b', 1)).toBe(false)
    expect(numeroAccepte('2', 2)).toBe(true)
    expect(numeroAccepte('b', 2)).toBe(true)
    expect(numeroAccepte('ii', 2)).toBe(true)
    expect(numeroAccepte('iiii', 4)).toBe(false)
    expect(valeursDeNumero('i')).toEqual([9, 1])
    expect(valeursDeNumero('xiv')).toEqual([14])
  })

  it('`c. ` en tête ne fait rien ; `2. ` sous un élément numéroté continue la liste', () => {
    const ed = ouvrir()
    taper(ed, 'c. a')
    expect(types(ed)).toEqual(['paragraph'])
    expect(texte(ed)).toBe('c. a')
    const ed2 = ouvrir({ type: 'numero', content: [{ type: 'text', text: 'un' }] }, p(''))
    ed2.commands.setTextSelection(ed2.state.doc.content.size - 1)
    taper(ed2, '2. deux')
    expect(types(ed2)).toEqual(['numero', 'numero'])
    expect(texte(ed2)).toBe('undeux')
  })

  it('un titre ne devient pas une liste numérotée', () => {
    const ed = ouvrir({ type: 'heading', attrs: { level: 1 }, content: [] })
    taper(ed, '1. ')
    expect(types(ed)).toEqual(['heading'])
  })

  it('ces motifs convertissent un bloc d’un autre type : `# ` depuis une puce, `- ` depuis une tâche, `[] ` depuis un titre', () => {
    for (const [depart, signe, type] of [
      ['puce', '# ', 'heading'],
      ['tache', '- ', 'puce'],
      ['heading', '[] ', 'tache'],
      ['citation', '> ', 'citation'],
      ['numero', '- ', 'puce'],
    ] as const) {
      const ed = ouvrir({ type: depart, ...(depart === 'heading' ? { attrs: { level: 2 } } : {}) })
      taper(ed, `${signe}x`)
      expect(types(ed)[0]).toBe(type === 'citation' ? 'citation' : type)
      ed.destroy()
    }
  })

  it('dans un dépliant, `# ` fait un titre dépliant ; dans un titre, `> ` fait le titre dépliant du même niveau', () => {
    const ed = ouvrir({ type: 'depliant' })
    taper(ed, '## x')
    expect(premier(ed)).toMatchObject({ type: 'heading', attrs: { level: 2, depliant: true } })
    const ed2 = ouvrir({ type: 'heading', attrs: { level: 3 } })
    taper(ed2, '> x')
    expect(premier(ed2)).toMatchObject({ type: 'heading', attrs: { level: 3, depliant: true } })
  })

  it('depuis une citation, le motif crée un enfant et lui verse le reste', () => {
    const ed = ouvrir({ type: 'citation', content: [{ type: 'text', text: 'reste' }] })
    ed.commands.setTextSelection(1)
    taper(ed, '## ')
    expect(ed.getJSON().content).toMatchObject([{ type: 'citation' }, { type: 'heading', attrs: { level: 2, retrait: 1 } }])
    expect(ed.state.doc.child(1).textContent).toBe('reste')
    expect(ed.state.selection.$from.parent.type.name).toBe('heading')
  })

  it('aucun motif de type dans un encadré ni dans un code', () => {
    const ed = ouvrir({ type: 'encadreBloc' })
    taper(ed, '# a')
    expect(types(ed)).toEqual(['encadreBloc'])
    expect(texte(ed)).toBe('# a')
    const ed2 = ouvrir({ type: 'codeBlock' })
    taper(ed2, '- a')
    expect(types(ed2)).toEqual(['codeBlock'])
  })

  it('``` fait un code tout de suite, sans espace', () => {
    const ed = ouvrir()
    taper(ed, '```')
    expect(types(ed)).toEqual(['codeBlock'])
  })

  it('`---` fait un séparateur, et le reste du texte passe dans le bloc neuf', () => {
    const ed = ouvrir(p('suite'))
    ed.commands.setTextSelection(1)
    taper(ed, '---')
    expect(types(ed)).toEqual(['horizontalRule', 'paragraph'])
    expect(ed.state.doc.child(1).textContent).toBe('suite')
    expect(ed.state.selection.$from.parentOffset).toBe(0)
  })

  it('`***` et `___` ne font pas de séparateur, avec ou sans espace', () => {
    for (const signe of ['***', '___', '*** ', '___ ']) {
      const ed = ouvrir()
      taper(ed, signe)
      expect(types(ed)).toEqual(['paragraph'])
      ed.destroy()
    }
  })
})

describe('NOTION.md § 4 : les marques en ligne', () => {
  const marques = (ed: Editor) => ((ed.getJSON().content?.[0]?.content ?? []) as NoeudTexte[]).map((n) => `${n.text}:${(n.marks ?? []).map((m) => m.type).join('+')}`)

  it('`**x**`, `__x__`, `*x*`, `_x_`, `~x~` et `x` posent leur marque et ôtent les délimiteurs', () => {
    for (const [saisie, marque] of [['**x** ', 'bold'], ['__x__ ', 'bold'], ['*x* ', 'italic'], ['_x_ ', 'italic'], ['~x~ ', 'strike'], ['`x` ', 'code']] as const) {
      const ed = ouvrir()
      taper(ed, saisie)
      expect(marques(ed)).toEqual([`x:${marque}`, ' :'])
      ed.destroy()
    }
  })

  it('le signe avant le délimiteur ouvrant : début, espace ou parenthèse, pas une lettre', () => {
    const ed = ouvrir()
    taper(ed, 'mot (_x_)')
    expect(marques(ed)).toEqual(['mot (:', 'x:italic', '):'])
    const ed2 = ouvrir()
    taper(ed2, 'snake_case_mot_')
    expect(marques(ed2)).toEqual(['snake_case_mot_:'])
  })

  it('le contenu ne commence ni ne finit par une espace', () => {
    const ed = ouvrir()
    taper(ed, 'a * x*')
    expect(marques(ed)).toEqual(['a * x*:'])
  })

  it('la marque ne se prolonge pas à la frappe suivante', () => {
    const ed = ouvrir()
    taper(ed, '**x**y')
    expect(marques(ed)).toEqual(['x:bold', 'y:'])
  })

  it('⌘Z juste après rend les délimiteurs tapés', () => {
    const ed = ouvrir()
    taper(ed, '**x**')
    expect(marques(ed)).toEqual(['x:bold'])
    ed.commands.undo()
    expect(texte(ed)).toBe('**x**')
  })

  it('un code en ligne ouvert suspend la typographie', () => {
    const ed = ouvrir()
    taper(ed, '`a -> b')
    expect(texte(ed)).toBe('`a -> b')
  })
})

describe('NOTION.md § 4 : ce qu’on tape à côté', () => {
  it('une adresse tapée devient un lien à l’espace qui suit', () => {
    const ed = ouvrir()
    taper(ed, 'voir https://notak.fr ')
    const contenu = ed.getJSON().content?.[0]?.content as NoeudTexte[]
    expect(contenu.find((n) => n.marks?.some((m) => m.type === 'link'))?.text).toBe('https://notak.fr')
  })

  it('une ponctuation tapée juste après une mention retire l’espace qui la suit', () => {
    const ed = ouvrir({ type: 'paragraph', content: [{ type: 'mention', attrs: { id: 'u', label: 'Léa' } }, { type: 'text', text: ' ' }] })
    ed.commands.selectTextblockEnd()
    taper(ed, '.')
    expect((ed.getJSON().content?.[0]?.content as NoeudTexte[]).map((n) => n.text ?? n.type)).toEqual(['mention', '.'])
    const ed2 = ouvrir({ type: 'paragraph', content: [{ type: 'mention', attrs: { id: 'u', label: 'Léa' } }, { type: 'text', text: ' ' }] })
    ed2.commands.selectTextblockEnd()
    taper(ed2, 'a')
    expect((ed2.getJSON().content?.[0]?.content as NoeudTexte[]).map((n) => n.text ?? n.type)).toEqual(['mention', ' a'])
  })
})

describe('NOTION.md § 5 : les raccourcis du moteur', () => {
  it('⌘Entrée coche une tâche et ne fait rien sur un texte', () => {
    const ed = ouvrir({ type: 'tache', content: [{ type: 'text', text: 'a' }] })
    ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
    expect(ed.getJSON().content?.[0]?.attrs?.coche).toBe(true)
    // La case s'anime au geste : le bloc refait par ProseMirror porte `data-anime`.
    expect((ed.view.dom.querySelector('.notak-b-tache') as HTMLElement).dataset.anime).toBe('coche')
    const ed2 = ouvrir(p('a'))
    ed2.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
    expect(types(ed2)).toEqual(['paragraph'])
    expect(ed2.getJSON().content?.[0]?.content?.some((n) => n.type === 'hardBreak')).toBeFalsy()
  })

  it('Ctrl+Maj+chiffre transforme, comme ⌘⌥chiffre (Windows, Linux)', () => {
    const ed = ouvrir(p('x'))
    ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: '#', code: 'Digit2', ctrlKey: true, shiftKey: true, bubbles: true }))
    expect(versActuel(ed)).toBe('titre2')
  })

  it('⌘⇧X barre comme ⌘⇧S', () => {
    const ed = ouvrir(p('abc'))
    ed.commands.selectAll()
    ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'X', keyCode: 88, code: 'KeyX', ctrlKey: true, shiftKey: true, bubbles: true }))
    expect(ed.getJSON().content?.[0]?.content?.[0]?.marks?.[0]?.type).toBe('strike')
  })

  it('⌘⌥\\ efface la mise en forme, sauf le lien', () => {
    const ed = ouvrir({
      type: 'paragraph',
      content: [{ type: 'text', text: 'abc', marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'link', attrs: { href: 'https://a.fr' } }] }],
    })
    ed.commands.selectAll()
    effacerFormat(ed)
    expect(ed.getJSON().content?.[0]?.content?.[0]?.marks?.map((m) => m.type)).toEqual(['link'])
  })

  it('⌘⌥T ferme tous les dépliants si l’un est ouvert, sinon les ouvre', () => {
    const ed = ouvrir({ type: 'depliant' }, { type: 'depliant', attrs: { ouvert: false } }, { type: 'heading', attrs: { level: 1, depliant: true } })
    basculerDepliants(ed)
    expect((ed.getJSON().content ?? []).map((n) => n.attrs?.ouvert)).toEqual([false, false, false])
    basculerDepliants(ed)
    expect((ed.getJSON().content ?? []).map((n) => n.attrs?.ouvert)).toEqual([true, true, true])
  })
})

describe('NOTION.md § 4 : les remplacements typographiques', () => {
  it('flèches, comparaisons, tiret cadratin et points de suspension', () => {
    const ed = ouvrir()
    taper(ed, 'a -> b <- c <-> d => e >= f <= g != h -- i...')
    expect(texte(ed)).toBe('a → b ← c ↔ d ⇒ e ≥ f ≤ g ≠ h — i…')
  })

  it('les guillemets sont toujours à l’anglaise, quelle que soit la langue ; l’apostrophe devient courbe', () => {
    for (const langue of ['fr', 'en'] as const) {
      definirLangue(langue)
      const ed = ouvrir()
      taper(ed, 'il dit "oui" et l\'arbre')
      expect(texte(ed)).toBe('il dit “oui” et l’arbre')
      ed.destroy()
    }
    definirLangue('fr')
  })

  it('ouvrant en tête de bloc et après une espace, fermant partout ailleurs, y compris après une parenthèse', () => {
    expect(guillemet('', false)).toBe('“')
    expect(guillemet('un ', false)).toBe('“')
    expect(guillemet('mot', false)).toBe('”')
    expect(guillemet('(', false)).toBe('”')
    expect(guillemet('', true)).toBe('‘')
    expect(guillemet('rock ', true)).toBe('‘')
    expect(guillemet('l', true)).toBe('’')
    const ed = ouvrir()
    taper(ed, '"oui')
    expect(texte(ed)).toBe('“oui')
  })

  it('rien ne se remplace dans du code', () => {
    const ed = ouvrir({ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] })
    taper(ed, ' -> ...')
    expect(texte(ed)).toBe('x -> ...')
  })
})

describe('NOTION.md § 5 : Transformer en', () => {
  it('un paragraphe devient chaque type, et revient en texte', () => {
    for (const vers of ['titre2', 'puce', 'numero', 'tache', 'citation', 'encadre', 'code', 'deroulant', 'titreDeroulant1'] as const) {
      const ed = ouvrir(p('bonjour'))
      transformer(ed, vers)
      expect(versActuel(ed)).toBe(vers)
      expect(texte(ed)).toBe('bonjour')
      transformer(ed, 'texte')
      expect(versActuel(ed)).toBe('texte')
      expect(types(ed)).toEqual(['paragraph'])
      expect(texte(ed)).toBe('bonjour')
      ed.destroy()
    }
  })

  it('le curseur reste dans le bloc transformé, même vide et suivi d’un autre', () => {
    const ed = ouvrir(p(''), p('suite'))
    transformer(ed, 'titre2')
    expect(ed.state.selection.$from.parent.type.name).toBe('heading')
    expect(ed.state.selection.$from.parent.textContent).toBe('')
  })

  it('une puce devient une tâche, en gardant son id et son retrait', () => {
    const ed = ouvrir({ type: 'puce', attrs: { id: 'X', retrait: 1 }, content: [{ type: 'text', text: 'a' }] })
    transformer(ed, 'tache')
    expect(ed.getJSON().content?.[0]).toMatchObject({ type: 'tache', attrs: { id: 'X', retrait: 1 } })
  })

  it('un titre rendu dépliant range dessous les blocs jusqu’au prochain titre de son rang', () => {
    const ed = ouvrir(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Partie' }] },
      p('un'),
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Sous' }] },
      p('deux'),
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Suite' }] },
    )
    transformer(ed, 'titreDeroulant2')
    const blocs = ed.getJSON().content ?? []
    expect(blocs[0]).toMatchObject({ type: 'heading', attrs: { level: 2, depliant: true } })
    expect(blocs.map((n) => n.attrs?.retrait ?? 0)).toEqual([0, 1, 1, 1, 0])
  })

  it('un dépliant défait garde ses enfants sous lui', () => {
    const ed = ouvrir({ type: 'depliant', content: [{ type: 'text', text: 'R' }] }, { type: 'paragraph', attrs: { retrait: 1 }, content: [{ type: 'text', text: 'dedans' }] })
    transformer(ed, 'titre1')
    expect(types(ed)).toEqual(['heading', 'paragraph'])
    expect(ed.getJSON().content?.[1]?.attrs?.retrait).toBe(1)
  })

  it('⌘⌥ et un chiffre transforment, lus sur la touche', () => {
    const ed = ouvrir(p('x'))
    ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: '¡', code: 'Digit1', metaKey: true, altKey: true, bubbles: true }))
    expect(versActuel(ed)).toBe('titre1')
  })
})

describe('les gestes du menu', () => {
  it('insère un séparateur sous le bloc, le curseur après lui', () => {
    const ed = ouvrir(p('a'))
    inserer(ed, 'separateur')
    expect(types(ed)).toEqual(['paragraph', 'horizontalRule', 'paragraph'])
    expect(ed.state.selection.$from.index(0)).toBe(2)
  })

  it('remplace le bloc vide par des colonnes, le curseur dans la première', () => {
    const ed = ouvrir()
    inserer(ed, 'colonnes3')
    expect(ed.getJSON().content?.[0]).toMatchObject({ type: 'colonnes' })
    expect(ed.getJSON().content?.[0]?.content).toHaveLength(3)
    expect(ed.state.selection.$from.node(2).type.name).toBe('colonne')
  })

  it('duplique le bloc juste après lui, la copie avec son propre id', () => {
    const ed = ouvrir(p('a'), p('b'))
    dupliquerBloc(ed)
    expect(texte(ed)).toBe('aab')
    const [x, y] = ed.getJSON().content ?? []
    expect(x!.attrs?.id).toBeTruthy()
    expect(y!.attrs?.id).toBeTruthy()
    expect(y!.attrs?.id).not.toBe(x!.attrs?.id)
  })

  it('supprime le bloc avec ses enfants', () => {
    const ed = ouvrir({ type: 'puce', content: [{ type: 'text', text: 'a' }] }, { type: 'puce', attrs: { retrait: 1 }, content: [{ type: 'text', text: 'a1' }] }, p('b'))
    supprimerBloc(ed)
    expect(types(ed)).toEqual(['paragraph'])
    expect(texte(ed)).toBe('b')
  })

  it('colore le bloc sans passage choisi, le passage sinon', () => {
    const ed = ouvrir(p('abc'))
    colorer(ed, { nom: 'rouge', fond: true })
    expect(ed.getJSON().content?.[0]?.attrs?.couleur).toBe('rouge-fond')
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, 3)))
    colorer(ed, { nom: 'bleu', fond: false })
    expect(ed.getJSON().content?.[0]?.content?.[0]?.marks?.[0]).toMatchObject({ type: 'textStyle', attrs: { color: 'var(--notak-bloc-bleu)' } })
  })
})
