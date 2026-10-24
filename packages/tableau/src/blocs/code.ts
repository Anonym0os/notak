import type { Node as NoeudPM } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView, NodeView } from '@tiptap/pm/view'
import { Extension } from '@tiptap/react'
import { t } from '../langue'
import { pluginColoration } from './coloration'

/**
 * Le bloc de code (docs/NOTION.md § 2) : au survol, une barre en haut à droite de la boîte, avec le langage du bloc
 * (qu'on change) et « Copier ». La barre n'est pas du texte : ProseMirror ne la voit pas.
 */

/** Les langages proposés, dans l'ordre du menu ; `null` est le texte brut. */
export const LANGAGES: readonly (readonly [string | null, string])[] = [
  [null, 'Texte brut'],
  ['bash', 'Bash'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['csharp', 'C#'],
  ['css', 'CSS'],
  ['go', 'Go'],
  ['html', 'HTML'],
  ['java', 'Java'],
  ['javascript', 'JavaScript'],
  ['json', 'JSON'],
  ['kotlin', 'Kotlin'],
  ['markdown', 'Markdown'],
  ['php', 'PHP'],
  ['python', 'Python'],
  ['ruby', 'Ruby'],
  ['rust', 'Rust'],
  ['sql', 'SQL'],
  ['swift', 'Swift'],
  ['typescript', 'TypeScript'],
  ['yaml', 'YAML'],
]

/** Les noms courts qu'on tape après ```, ramenés au langage du menu. */
const ALIAS: Record<string, string> = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', shell: 'bash', zsh: 'bash', yml: 'yaml', md: 'markdown', rb: 'ruby', rs: 'rust', 'c++': 'cpp', cs: 'csharp', kt: 'kotlin' }

/** Le langage du menu pour l'attribut d'un bloc (un nom inconnu reste tel quel, montré à part). */
export const langageDe = (attr: unknown): string | null => {
  const brut = typeof attr === 'string' ? attr.trim().toLowerCase() : ''
  return brut ? (ALIAS[brut] ?? brut) : null
}

/** Pose les attributs de bloc que le rendu attend (`data-bloc`, couleur, retrait) sur l'élément de la vue. */
function poserAttributs(el: HTMLElement, n: NoeudPM) {
  const a = n.attrs as Record<string, unknown>
  const regler = (nom: string, v: unknown) => (v ? el.setAttribute(nom, String(v)) : el.removeAttribute(nom))
  regler('data-bloc', a.id)
  regler('data-couleur', a.couleur)
  regler('data-retrait', Number(a.retrait) || null)
  regler('data-langage', langageDe(a.language))
}

class VueCode implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private barre: HTMLElement
  private choix: HTMLSelectElement
  private copier: HTMLButtonElement

  constructor(
    private noeud: NoeudPM,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.dom = document.createElement('pre')
    this.contentDOM = document.createElement('code')
    this.barre = document.createElement('div')
    this.barre.className = 'notak-code-barre'
    this.barre.contentEditable = 'false'
    this.choix = document.createElement('select')
    this.choix.className = 'notak-code-langage'
    this.choix.setAttribute('aria-label', t('blocs.code.langage'))
    this.copier = document.createElement('button')
    this.copier.type = 'button'
    this.copier.className = 'notak-code-copier'
    this.copier.textContent = t('blocs.code.copier')
    this.barre.append(this.choix, this.copier)
    this.dom.append(this.barre, this.contentDOM)
    this.remplirChoix()
    this.choix.addEventListener('change', () => {
      const pos = this.getPos()
      if (pos === undefined) return
      this.view.dispatch(this.view.state.tr.setNodeAttribute(pos, 'language', this.choix.value || null))
      this.view.focus()
    })
    this.copier.addEventListener('mousedown', (e) => e.preventDefault())
    this.copier.addEventListener('click', () => {
      void navigator.clipboard?.writeText(this.noeud.textContent)
      this.copier.textContent = t('blocs.code.copie')
      window.setTimeout(() => (this.copier.textContent = t('blocs.code.copier')), 1500)
    })
    poserAttributs(this.dom, noeud)
  }

  /** Le menu des langages ; un langage inconnu (écrit par ```xyz) s'y ajoute pour rester choisi. */
  private remplirChoix() {
    const actuel = langageDe(this.noeud.attrs.language)
    const options = LANGAGES.some(([v]) => v === actuel) ? LANGAGES : [...LANGAGES, [actuel, actuel ?? ''] as const]
    this.choix.replaceChildren(
      ...options.map(([v, nom]) => {
        const o = document.createElement('option')
        o.value = v ?? ''
        o.textContent = v === null ? t('blocs.code.texteBrut') : nom
        return o
      }),
    )
    this.choix.value = actuel ?? ''
  }

  update(n: NoeudPM): boolean {
    if (n.type !== this.noeud.type) return false
    const changeLangage = n.attrs.language !== this.noeud.attrs.language
    this.noeud = n
    poserAttributs(this.dom, n)
    if (changeLangage) this.remplirChoix()
    return true
  }

  stopEvent(e: Event): boolean {
    return this.barre.contains(e.target as Node)
  }

  ignoreMutation(m: { target: Node; type: string }): boolean {
    return this.barre.contains(m.target) || (m.type === 'attributes' && m.target === this.dom)
  }
}

export const CodeBlocs = Extension.create({
  name: 'codeBlocs',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('codeBlocs'),
        props: {
          nodeViews: { codeBlock: (n, view, getPos) => new VueCode(n, view, getPos) },
        },
      }),
      // La coloration syntaxique : des décorations par jeton, recalculées pour les blocs que la transaction touche.
      pluginColoration(),
    ]
  },
})
