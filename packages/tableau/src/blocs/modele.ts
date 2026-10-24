import type { Node as NoeudPM } from '@tiptap/pm/model'
import { finDuSousArbre, ligneDe, structurer } from './structure'

/**
 * Le document relu comme des enregistrements de blocs, à la façon de Notion (docs/NOTION.md § 1) : chaque bloc a son
 * id, son type, son texte, son parent et ses enfants. Les blocs sont des frères à plat (voir `plats.ts`) ; le parent
 * se lit au retrait (`structure.ts`). Une rangée de colonnes et ses colonnes sont des blocs, dont les colonnes sont
 * les enfants ; les blocs d'une colonne sont les enfants de la colonne.
 */

export type TypeBloc =
  | 'texte'
  | 'titre1'
  | 'titre2'
  | 'titre3'
  | 'puce'
  | 'numero'
  | 'tache'
  | 'deroulant'
  | 'titreDeroulant1'
  | 'titreDeroulant2'
  | 'titreDeroulant3'
  | 'citation'
  | 'encadre'
  | 'code'
  | 'separateur'
  | 'image'
  | 'apercuLien'
  | 'tableau'
  | 'colonnes'
  | 'colonne'

export interface Bloc {
  id: string | null
  type: TypeBloc
  /** La position du nœud du bloc dans le document, et sa taille (le bloc seul). */
  pos: number
  taille: number
  /** La fin de son sous-arbre (lui et ses enfants, qui le suivent) : là où commence le bloc suivant de son rang. */
  fin: number
  /** 0 au premier niveau (le retrait corrigé, plus la profondeur des colonnes). */
  profondeur: number
  parent: string | null
  enfants: string[]
  /** Le texte du bloc seul, sans celui de ses enfants. */
  texte: string
  /** Ce que Notion range dans `format` : la couleur, et ce que le type porte de plus. */
  format: Record<string, unknown>
}

/** Le type d'un nœud de bloc, dans le vocabulaire des blocs. */
export function typeDe(n: NoeudPM): TypeBloc {
  switch (n.type.name) {
    case 'heading': {
      const niveau = Math.min(3, Math.max(1, Number(n.attrs.level) || 1)) as 1 | 2 | 3
      return n.attrs.depliant ? `titreDeroulant${niveau}` : `titre${niveau}`
    }
    case 'puce':
    case 'numero':
    case 'tache':
    case 'citation':
    case 'image':
    case 'apercuLien':
    case 'colonnes':
    case 'colonne':
      return n.type.name
    case 'depliant':
      return 'deroulant'
    case 'encadreBloc':
      return 'encadre'
    case 'codeBlock':
      return 'code'
    case 'horizontalRule':
      return 'separateur'
    case 'table':
      return 'tableau'
    default:
      return 'texte'
  }
}

/** Les attributs du bloc qui s'écartent de leur valeur par défaut, sans l'id ni le retrait. */
function formatDe(n: NoeudPM): Record<string, unknown> {
  const { id: _, retrait: _r, ...attrs } = n.attrs
  return Object.fromEntries(Object.entries(attrs).filter(([cle, v]) => v !== null && v !== undefined && v !== n.type.spec.attrs?.[cle]?.default))
}

/** Les blocs du document, dans l'ordre de lecture. */
export function blocsDe(doc: NoeudPM): Bloc[] {
  const sortie: Bloc[] = []
  const ranger = (conteneur: NoeudPM, debut: number, parent: Bloc | null, base: number) => {
    const noeuds: [NoeudPM, number][] = []
    conteneur.forEach((n, decalage) => noeuds.push([n, debut + decalage]))
    const places = structurer(noeuds.map(([n]) => ligneDe(n)))
    const ici: Bloc[] = []
    noeuds.forEach(([n, pos], i) => {
      const place = places[i]!
      const pere = place.parent === null ? parent : ici[place.parent]!
      const finIndex = finDuSousArbre(places, i)
      const fin = finIndex < noeuds.length ? noeuds[finIndex]![1] : debut + conteneur.content.size
      const bloc: Bloc = {
        id: (n.attrs.id as string | null) ?? null,
        type: typeDe(n),
        pos,
        taille: n.nodeSize,
        fin,
        profondeur: base + place.profondeur,
        parent: pere?.id ?? null,
        enfants: [],
        texte: n.isTextblock ? n.textContent : '',
        format: formatDe(n),
      }
      ici.push(bloc)
      sortie.push(bloc)
      if (pere && bloc.id) pere.enfants.push(bloc.id)
      if (n.type.name === 'colonnes') {
        n.forEach((colonne, d) => {
          const c: Bloc = {
            id: (colonne.attrs.id as string | null) ?? null,
            type: 'colonne',
            pos: pos + 1 + d,
            taille: colonne.nodeSize,
            fin: pos + 1 + d + colonne.nodeSize,
            profondeur: bloc.profondeur + 1,
            parent: bloc.id,
            enfants: [],
            texte: '',
            format: formatDe(colonne),
          }
          sortie.push(c)
          if (bloc.id && c.id) bloc.enfants.push(c.id)
          ranger(colonne, pos + 1 + d + 1, c, c.profondeur + 1)
        })
      }
    })
  }
  ranger(doc, 0, null, 0)
  return sortie
}

/** Le bloc qui porte cet id, ou `undefined`. */
export const blocDe = (doc: NoeudPM, id: string): Bloc | undefined => blocsDe(doc).find((b) => b.id === id)
