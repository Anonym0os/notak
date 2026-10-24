import { Node, mergeAttributes } from '@tiptap/react'

/**
 * Les blocs de texte du moteur (docs/NOTION.md § 1 et § 2). Comme chez Notion, chacun est **un bloc à plat** : son
 * texte, et rien dedans. Ses enfants sont les blocs qui le suivent avec un retrait plus grand (l'attribut `retrait`,
 * posé par `ids.ts` sur tous les blocs) ; `structure.ts` en tire la numérotation, ce qu'un dépliant fermé cache et ce
 * qu'un encadré enveloppe.
 *
 * → Notak : l'arbre de Notion (`content` d'un bloc) est rendu par le retrait plutôt que par des nœuds imbriqués ;
 * ProseMirror garde ainsi ses gestes de texte (coupure, fusion, sélection d'un bloc à l'autre) sur des frères, et le
 * fragment partagé n'a jamais de structure à réécrire quand un bloc change de parent.
 */

/** Un bloc de texte : un `div` à classe, son texte dedans. */
const blocDeTexte = (name: string, classe: string, extra: Partial<Parameters<typeof Node.create>[0]> = {}) =>
  Node.create({
    name,
    group: 'block',
    content: 'inline*',
    defining: true,
    parseHTML: () => [{ tag: `div[data-type="${name}"]` }],
    renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': name, class: `notak-b ${classe}` }), 0],
    ...extra,
  })

/** Un attribut booléen écrit `data-<nom>` quand il est vrai. */
const drapeau = (nom: string, defaut = false) => ({
  default: defaut,
  keepOnSplit: false,
  parseHTML: (el: HTMLElement) => (defaut ? el.getAttribute(`data-${nom}`) !== 'non' : el.hasAttribute(`data-${nom}`)),
  renderHTML: (a: Record<string, unknown>) => (defaut ? (a[nom] === false ? { [`data-${nom}`]: 'non' } : {}) : a[nom] ? { [`data-${nom}`]: '' } : {}),
})

/** Un élément de liste à puces. */
export const Puce = blocDeTexte('puce', 'notak-b-puce')

/** Un élément de liste numérotée : son numéro (1., a., i.) est calculé par `structure.ts`. */
export const Numero = blocDeTexte('numero', 'notak-b-numero')

/** Une tâche, cochée ou non. La case est dessinée dans la marge du bloc ; `structure.ts` en reçoit le clic. */
export const Tache = blocDeTexte('tache', 'notak-b-tache', {
  addAttributes: () => ({ coche: drapeau('coche') }),
})

/** Un dépliant : son texte est le résumé, ses enfants se cachent quand il est fermé. */
export const Depliant = blocDeTexte('depliant', 'notak-b-depliant', {
  addAttributes: () => ({ ouvert: { ...drapeau('ouvert', true), keepOnSplit: true } }),
})

/** Une citation : un trait à gauche ; ses enfants restent dans le trait. */
export const CitationPlate = blocDeTexte('citation', 'notak-b-citation')

/** L'icône qu'un encadré neuf reçoit. */
export const ICONE_ENCADRE = '💡'

/** Un encadré : une icône, un fond ; ses enfants restent dans le cadre. */
export const EncadrePlat = blocDeTexte('encadreBloc', 'notak-b-encadre', {
  addAttributes: () => ({
    icone: {
      default: ICONE_ENCADRE,
      parseHTML: (el: HTMLElement) => el.getAttribute('data-icone') || ICONE_ENCADRE,
      renderHTML: (a: { icone?: string }) => ({ 'data-icone': a.icone || ICONE_ENCADRE }),
    },
  }),
})

/**
 * Le titre dépliant (NOTION.md § 2) : un titre de la page qui porte `depliant`, et `ouvert` comme le dépliant. Un
 * attribut plutôt qu'un nœud : un titre reste un titre pour l'export et pour le sommaire.
 */
export const ATTRIBUTS_TITRE = { depliant: drapeau('depliant'), ouvert: { ...drapeau('ouvert', true), keepOnSplit: true } }

/** Les noms des blocs à plat que ce fichier définit. */
export const NOEUDS_PLATS = ['puce', 'numero', 'tache', 'depliant', 'citation', 'encadreBloc'] as const
