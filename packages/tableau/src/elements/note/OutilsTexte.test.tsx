// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BarreEdition } from '../../barreEdition'
import { DELAI_INFOBULLE, oublierInfobulle } from '../../Infobulle'
import { fermerMenus } from '../../menuUnique'
import { OutilsTexteGauche } from './OutilsTexte'
import { EXTENSIONS_LEGENDE, EXTENSIONS_NOTE } from './extensions'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
const ouverts: Editor[] = []
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
  ouverts.splice(0).forEach((e) => e.destroy())
})

function monter(texte = 'abc') {
  const editor = new Editor({
    extensions: EXTENSIONS_NOTE,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: texte }] }] },
  })
  ouverts.push(editor)
  const finir = vi.fn()
  const commenter = vi.fn()
  act(() => racine.render(<OutilsTexteGauche editor={editor} lien={null} surLien={() => {}} commenter={commenter} finir={finir} />))
  return { editor, finir, commenter }
}
const outil = (nom: string) => hote.querySelector<HTMLButtonElement>(`button[aria-label="${nom}"]`)!
const retour = () => hote.querySelector<HTMLButtonElement>('.notak-barre-retour')!

describe('les outils de texte dans la barre de gauche', () => {
  it('dans l’ordre du relevé : Style de texte (avec son nom), puis des icônes seules', () => {
    monter()
    const style = hote.querySelector('.notak-outil-selection')!
    expect(style.textContent).toBe('Style de texte')
    const noms = [...hote.querySelectorAll<HTMLButtonElement>('button.notak-outil-texte')].map((b) => b.getAttribute('aria-label'))
    expect(noms).toEqual(['Gras', 'Italique', 'Barré', 'Souligné', 'Puces', 'Numérotée', 'Centrer', 'Code', 'Lien', 'Commenter le passage'])
    // Icône seule : pas de libellé dans la tuile ; ni retrait ni « Insérer » dans cette barre.
    expect(outil('Gras').textContent).toBe('')
    expect(hote.querySelector('button[aria-label^="Retrait"], button[aria-label^="Insérer"]')).toBeNull()
  })

  it('l’infobulle maison remplace le title natif, et porte le raccourci en pastilles', () => {
    vi.useFakeTimers()
    try {
      oublierInfobulle()
      monter()
      expect(outil('Gras').hasAttribute('title')).toBe(false)
      act(() => void outil('Gras').dispatchEvent(new MouseEvent('pointerover', { bubbles: true })))
      act(() => void vi.advanceTimersByTime(DELAI_INFOBULLE))
      const bulle = hote.querySelector('.notak-infobulle')!
      expect(bulle.textContent).toContain('Gras')
      expect([...bulle.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['⌘', 'B'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('Lien et Commentaire sont grisés sans texte choisi, et ne font rien', () => {
    const { commenter } = monter()
    expect(outil('Lien').getAttribute('aria-disabled')).toBe('true')
    expect(outil('Commenter le passage').getAttribute('aria-disabled')).toBe('true')
    act(() => outil('Commenter le passage').click())
    expect(commenter).not.toHaveBeenCalled()
  })

  it('avec du texte choisi, Lien et Commentaire s’activent ; dans du code, Commentaire reste grisé', () => {
    const { editor, commenter } = monter()
    act(() => void editor.commands.selectAll())
    expect(outil('Lien').getAttribute('aria-disabled')).toBeNull()
    expect(outil('Commenter le passage').getAttribute('aria-disabled')).toBeNull()
    act(() => outil('Commenter le passage').click())
    expect(commenter).toHaveBeenCalledTimes(1)
    act(() => void editor.chain().selectAll().toggleCode().run())
    expect(outil('Commenter le passage').getAttribute('aria-disabled')).toBe('true')
  })

  it('un outil actif est pressé', () => {
    const { editor } = monter()
    expect(outil('Gras').getAttribute('aria-pressed')).toBe('false')
    act(() => outil('Gras').click())
    act(() => void editor.chain().selectAll().toggleBold().run())
    expect(outil('Gras').getAttribute('aria-pressed')).toBe('true')
  })

  it('la flèche retour termine l’écriture ; avec du texte choisi, elle replie la sélection d’abord', () => {
    const { editor, finir } = monter()
    act(() => void editor.commands.setTextSelection({ from: 1, to: 3 }))
    act(() => retour().click())
    expect(finir).not.toHaveBeenCalled()
    expect(editor.state.selection.empty).toBe(true)
    expect(editor.state.selection.from).toBe(1)
    act(() => retour().click())
    expect(finir).toHaveBeenCalledTimes(1)
  })

  it('le menu Style de texte : les sept blocs dans l’ordre, la coche sur l’actif, le raccourci sur les autres', () => {
    const { editor } = monter()
    act(() => hote.querySelector<HTMLButtonElement>('.notak-outil-selection')!.click())
    const lignes = [...hote.querySelectorAll<HTMLElement>('.notak-menu-style [role="menuitem"]')]
    expect(lignes.map((l) => l.querySelector('span')!.textContent)).toEqual([
      'Grand titre', 'Titre', 'Texte normal', 'Petit texte', 'Bloc de code', 'Encadré', 'Citation',
    ])
    expect(lignes[2]!.hasAttribute('aria-current')).toBe(true)
    expect(lignes[2]!.querySelector('kbd')).toBeNull()
    expect(lignes[0]!.querySelector('kbd')!.textContent).toBe('⌘⇧1')
    act(() => lignes[5]!.click())
    expect(editor.isActive('encadre')).toBe(true)
    // Il reste ouvert après un choix.
    expect(hote.querySelector('.notak-menu-style')).not.toBeNull()
    expect(hote.querySelector('.notak-menu-style [data-style="encadre"]')!.hasAttribute('aria-current')).toBe(true)
  })
})

describe('la barre de gauche en édition', () => {
  it('prête un emplacement, avec la corbeille en bas', () => {
    let cible: HTMLElement | null = null
    const panneau = { nombre: 2, ouverte: false, basculer() {} }
    act(() => racine.render(<BarreEdition cible={(el) => (cible = el)} corbeille={panneau} nonTries={panneau} />))
    expect(cible).toBe(hote.querySelector('nav[data-edition] .notak-barre-edition-liste'))
    expect(hote.querySelector('nav [data-corbeille]')!.textContent).toContain('Corbeille (2)')
  })
})

describe('les outils de la légende', () => {
  it('Gras, Italique, Barré, Souligné, Lien, Centrer, et le menu sans blocs', () => {
    const editor = new Editor({ extensions: EXTENSIONS_LEGENDE, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abc' }] }] } })
    ouverts.push(editor)
    act(() => racine.render(<OutilsTexteGauche editor={editor} variante="legende" lien={null} surLien={() => {}} finir={() => {}} />))
    const noms = [...hote.querySelectorAll<HTMLButtonElement>('button.notak-outil-texte')].map((b) => b.getAttribute('aria-label'))
    expect(noms).toEqual(['Gras', 'Italique', 'Barré', 'Souligné', 'Lien', 'Centrer'])
    act(() => hote.querySelector<HTMLButtonElement>('.notak-outil-selection')!.click())
    const menu = hote.querySelector('.notak-menu-style')!
    expect(menu.querySelector('[data-style]')).toBeNull()
    expect(menu.querySelectorAll('.notak-note-pastilles button').length).toBeGreaterThan(5)
  })
})
