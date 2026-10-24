import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Node, mergeAttributes } from '@tiptap/react'
import { Citation } from '../elements/note/noeuds'

/**
 * Les blocs que le moteur ajoute à ceux de la note (docs/NOTION.md § 2). Les noms des nœuds de la note restent : un
 * texte de note se lit tel quel comme un document.
 */

/** La citation, sans la règle `> ` de la note : dans le moteur, `> ` fait un dépliant (NOTION.md § 4). */
export const CitationBloc = Citation.extend({ addInputRules: () => [] })

/**
 * Le dépliant : une ligne de résumé, puis des blocs qui se cachent. `niveau` 1 à 3 en fait un titre dépliant. Qu'il
 * soit ouvert est écrit dans le texte : → Notak, tout le monde le voit ouvert ou fermé (Notion le garde par personne).
 */
export const Deroulant = Node.create({
  name: 'deroulant',
  group: 'block',
  content: 'resumeDeroulant block*',
  defining: true,
  addAttributes() {
    return {
      ouvert: {
        default: true,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-ouvert') !== 'non',
        renderHTML: (a: { ouvert?: boolean }) => (a.ouvert === false ? { 'data-ouvert': 'non' } : {}),
      },
      niveau: {
        default: 0,
        parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-niveau') ?? 0) || 0,
        renderHTML: (a: { niveau?: number }) => (a.niveau ? { 'data-niveau': a.niveau } : {}),
      },
    }
  },
  parseHTML: () => [{ tag: 'div[data-type="deroulant"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'deroulant', class: 'notak-deroulant' }), 0],
  addProseMirrorPlugins() {
    const type = this.type
    return [
      new Plugin({
        key: new PluginKey('triangleDeroulant'),
        props: {
          // Le triangle est dessiné dans la marge gauche du résumé : un appui là ouvre ou ferme le dépliant.
          handleDOMEvents: {
            mousedown: (view, e) => {
              const resume = (e.target as HTMLElement).closest?.('.notak-deroulant-resume')
              if (!resume || e.clientX - resume.getBoundingClientRect().left > 0) return false
              const pos = view.posAtDOM(resume, 0) - 2
              const noeud = view.state.doc.nodeAt(pos)
              if (noeud?.type !== type) return false
              e.preventDefault()
              view.dispatch(view.state.tr.setNodeAttribute(pos, 'ouvert', !noeud.attrs.ouvert))
              return true
            },
          },
        },
      }),
    ]
  },
})

/** La ligne de résumé d'un dépliant. */
export const ResumeDeroulant = Node.create({
  name: 'resumeDeroulant',
  content: 'inline*',
  defining: true,
  parseHTML: () => [{ tag: 'div[data-type="resume"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'resume', class: 'notak-deroulant-resume' }), 0],
})

/**
 * Une rangée de colonnes (NOTION.md § 8). Le schéma accepte une seule colonne, pour qu'une fusion à plusieurs ne
 * jette jamais de texte : c'est le modèle qui dissout une rangée restée seule.
 */
export const Colonnes = Node.create({
  name: 'colonnes',
  group: 'block',
  content: 'colonne+',
  isolating: true,
  parseHTML: () => [{ tag: 'div[data-type="colonnes"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'colonnes', class: 'notak-colonnes' }), 0],
})

/** Une colonne : des blocs, et sa part de la largeur (`ratio`, absente : parts égales). */
export const Colonne = Node.create({
  name: 'colonne',
  content: 'block+',
  isolating: true,
  addAttributes() {
    return {
      ratio: {
        default: null,
        parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-ratio')) || null,
        renderHTML: (a: { ratio?: number | null }) => (a.ratio ? { 'data-ratio': a.ratio, style: `flex-grow: ${a.ratio}` } : {}),
      },
    }
  },
  parseHTML: () => [{ tag: 'div[data-type="colonne"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'colonne', class: 'notak-colonne' }), 0],
})

/**
 * Une image dans le texte : un fichier du tableau (`fichier`) ou une adresse (`url`), sa part de la largeur de la
 * page (`largeur`, de 0 à 1 ; absente : sa taille naturelle), son alignement et sa légende.
 */
export interface OptionsImage {
  /** L'adresse affichable d'un fichier du tableau (voir `DepotFichiers.adresse`). */
  adresse: ((fichier: string) => Promise<string | null>) | null
}

export const ImageBloc = Node.create<OptionsImage>({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: false,
  addOptions: () => ({ adresse: null }),
  addAttributes() {
    return {
      fichier: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-fichier') },
      url: { default: null, parseHTML: (el: HTMLElement) => el.querySelector('img')?.getAttribute('src') ?? null },
      largeur: { default: null, parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-largeur')) || null },
      alignement: { default: 'centre', parseHTML: (el: HTMLElement) => el.getAttribute('data-alignement') ?? 'centre' },
      legende: { default: '', parseHTML: (el: HTMLElement) => el.querySelector('figcaption')?.textContent ?? '' },
    }
  },
  parseHTML: () => [{ tag: 'figure[data-type="image"]' }],
  renderHTML: ({ node, HTMLAttributes }) => {
    const { fichier, url, largeur, alignement, legende, ...reste } = HTMLAttributes as Record<string, unknown>
    const attrs = mergeAttributes(reste, {
      'data-type': 'image',
      class: 'notak-image-bloc',
      'data-alignement': String(alignement ?? 'centre'),
      ...(fichier ? { 'data-fichier': String(fichier) } : {}),
      ...(largeur ? { 'data-largeur': String(largeur), style: `width: ${Math.round(Number(largeur) * 100)}%` } : {}),
    })
    const texte = String(node.attrs.legende ?? '')
    return ['figure', attrs, ['img', { src: String(url ?? ''), alt: texte }], ...(legende ? [['figcaption', {}, texte] as const] : [])]
  },
  // Dans l'éditeur, l'image d'un fichier du tableau va chercher son adresse ; hors édition, voir `remplirImages`.
  addNodeView() {
    const { adresse } = this.options
    return ({ node }) => {
      const figure = document.createElement('figure')
      figure.className = 'notak-image-bloc'
      figure.dataset.type = 'image'
      figure.dataset.alignement = String(node.attrs.alignement ?? 'centre')
      if (node.attrs.id) figure.dataset.bloc = String(node.attrs.id)
      if (node.attrs.largeur) figure.style.width = `${Math.round(Number(node.attrs.largeur) * 100)}%`
      const img = document.createElement('img')
      img.alt = String(node.attrs.legende ?? '')
      if (node.attrs.url) img.src = String(node.attrs.url)
      else if (node.attrs.fichier && adresse) void adresse(String(node.attrs.fichier)).then((u) => u && (img.src = u))
      figure.append(img)
      if (node.attrs.legende) {
        const legende = document.createElement('figcaption')
        legende.textContent = String(node.attrs.legende)
        figure.append(legende)
      }
      return { dom: figure, update: (n) => n === node }
    }
  },
})

/** Hors édition (aperçu, lecture), les images des fichiers du tableau reçoivent leur adresse. */
export function remplirImages(racine: HTMLElement, adresse: (fichier: string) => Promise<string | null>) {
  for (const figure of racine.querySelectorAll<HTMLElement>('figure[data-fichier]')) {
    const img = figure.querySelector('img')
    if (!img || img.getAttribute('src')) continue
    void adresse(figure.dataset.fichier!).then((u) => u && img.setAttribute('src', u))
  }
}

/** Une adresse montrée en carte : son titre, sa description et son image, lus comme ceux des liens de la toile. */
export const ApercuLien = Node.create({
  name: 'apercuLien',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      url: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('href') ?? '' },
      titre: { default: '', parseHTML: (el: HTMLElement) => el.querySelector('.notak-apercu-lien-titre')?.textContent ?? '' },
      description: { default: '', parseHTML: (el: HTMLElement) => el.querySelector('.notak-apercu-lien-description')?.textContent ?? '' },
      image: { default: null },
    }
  },
  parseHTML: () => [{ tag: 'a[data-type="apercu-lien"]' }],
  renderHTML: ({ node, HTMLAttributes }) => {
    const { url, titre, description, image, ...reste } = HTMLAttributes as Record<string, unknown>
    const adresse = String(node.attrs.url ?? '')
    return [
      'a',
      mergeAttributes(reste, { 'data-type': 'apercu-lien', class: 'notak-apercu-lien', href: adresse, target: '_blank', rel: 'noopener' }),
      ['span', { class: 'notak-apercu-lien-titre' }, String(node.attrs.titre || adresse)],
      ...(node.attrs.description ? [['span', { class: 'notak-apercu-lien-description' }, String(node.attrs.description)] as const] : []),
      ['span', { class: 'notak-apercu-lien-adresse' }, adresse],
    ]
  },
})
