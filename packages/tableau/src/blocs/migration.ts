import type { NoeudTexte } from '../coeur/tableau'
import { type Ligne, structurer } from './rang.ts'

/**
 * Le passage entre les deux écritures d'un texte à blocs (docs/NOTION.md § 1) :
 * - **imbriquée**, celle de la note et des documents d'avant le 24/10/2026 : les listes, les citations, les encadrés
 *   et les dépliants contiennent leurs blocs ;
 * - **à plat**, celle du moteur : chaque bloc est un frère, rangé sous un autre par son `retrait`.
 *
 * `aplatir` ouvre dans le moteur un document d'avant ou une note ; `deplier` rend un texte du moteur aux exports et à
 * la note, qui lisent l'écriture imbriquée.
 */

/** Les nœuds qui n'existent que dans l'écriture imbriquée. */
const IMBRIQUES = new Set(['bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'blockquote', 'encadre', 'deroulant', 'resumeDeroulant'])

/** Le texte porte-t-il encore des blocs imbriqués ? */
export function estImbrique(n: NoeudTexte): boolean {
  return IMBRIQUES.has(n.type) || (n.content ?? []).some(estImbrique)
}

const TEXTUELS = new Set(['paragraph', 'heading', 'resumeDeroulant'])

/** Les attributs d'un bloc, avec son retrait (absent au premier rang). */
function avecRetrait(attrs: Record<string, unknown> | undefined, retrait: number): Record<string, unknown> | undefined {
  const { retrait: _, ...reste } = attrs ?? {}
  const a = retrait > 0 ? { ...reste, retrait } : reste
  return Object.keys(a).length ? a : undefined
}

/** Un bloc à plat de ce type, avec ce texte (le contenu d'un paragraphe) et ces attributs. */
function plat(type: string, texte: NoeudTexte | undefined, attrs: Record<string, unknown> | undefined): NoeudTexte {
  const a = attrs && Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== undefined && v !== null))
  return { type, ...(a && Object.keys(a).length ? { attrs: a } : {}), ...(texte?.content?.length ? { content: texte.content } : {}) }
}

/** L'id et la couleur d'un bloc imbriqué : ce qu'il garde en passant à plat. */
const marque = (n: NoeudTexte) => ({ id: n.attrs?.id, couleur: n.attrs?.couleur })

/** Un bloc qui contenait d'autres blocs : son premier texte devient le bloc, le reste ses enfants. */
function enveloppe(type: string, n: NoeudTexte, attrs: Record<string, unknown>, retrait: number): NoeudTexte[] {
  const [premier, ...reste] = n.content ?? []
  const titre = premier && TEXTUELS.has(premier.type) ? premier : undefined
  const enfants = titre ? reste : (n.content ?? [])
  return [plat(type, titre, avecRetrait(attrs, retrait)), ...aplatirBlocs(enfants, retrait + 1)]
}

function aplatirBlocs(noeuds: readonly NoeudTexte[], retrait: number): NoeudTexte[] {
  return noeuds.flatMap((n): NoeudTexte[] => {
    switch (n.type) {
      case 'bulletList':
      case 'orderedList':
      case 'taskList': {
        const type = n.type === 'bulletList' ? 'puce' : n.type === 'orderedList' ? 'numero' : 'tache'
        const depart = type === 'numero' && Number(n.attrs?.start) > 1 ? Number(n.attrs?.start) : null
        return (n.content ?? []).flatMap((li, k) =>
          enveloppe(type, li, { ...marque(li), ...(type === 'tache' && li.attrs?.checked ? { coche: true } : {}), ...(k === 0 && depart ? { depart } : {}) }, retrait),
        )
      }
      case 'blockquote':
        return enveloppe('citation', n, marque(n), retrait)
      case 'encadre':
        return enveloppe('encadreBloc', n, { ...marque(n), icone: n.attrs?.icone }, retrait)
      case 'deroulant': {
        const niveau = Math.min(3, Number(n.attrs?.niveau) || 0)
        const ouvert = n.attrs?.ouvert === false ? { ouvert: false } : {}
        return niveau
          ? enveloppe('heading', n, { ...marque(n), level: niveau, depliant: true, ...ouvert }, retrait)
          : enveloppe('depliant', n, { ...marque(n), ...ouvert }, retrait)
      }
      case 'colonnes':
        return [{ ...n, content: (n.content ?? []).map((c) => ({ ...c, content: aplatirBlocs(c.content ?? [], 0) })) }]
      case 'heading': {
        const level = Math.min(3, Number(n.attrs?.level) || 1)
        return [{ ...n, attrs: avecRetrait({ ...n.attrs, level }, retrait)! }]
      }
      default: {
        const attrs = avecRetrait(n.attrs, retrait)
        const { attrs: _, ...sans } = n
        return [attrs ? { ...sans, attrs } : sans]
      }
    }
  })
}

/** Le texte à plat ; un texte déjà à plat est rendu tel quel. */
export function aplatir(doc: NoeudTexte): NoeudTexte {
  if (!estImbrique(doc)) return doc
  return { ...doc, content: aplatirBlocs(doc.content ?? [], 0) }
}

/** Les listes de l'écriture imbriquée, par type de bloc à plat. */
const LISTES: Record<string, [string, string]> = { puce: ['bulletList', 'listItem'], numero: ['orderedList', 'listItem'], tache: ['taskList', 'taskItem'] }

/** Le texte d'un bloc à plat, en paragraphe. */
const paragraphe = (n: NoeudTexte): NoeudTexte => ({ type: 'paragraph', ...(n.content?.length ? { content: n.content } : {}) })

/** Les attributs d'un bloc à plat, sans ce que l'écriture imbriquée ne connaît pas. */
function sansPlat(attrs: Record<string, unknown> | undefined, aussi: readonly string[] = []): Record<string, unknown> | undefined {
  if (!attrs) return undefined
  const a = Object.fromEntries(Object.entries(attrs).filter(([k, v]) => k !== 'retrait' && !aussi.includes(k) && v !== undefined && v !== null))
  return Object.keys(a).length ? a : undefined
}

const ligne = (n: NoeudTexte): Ligne => ({
  type: n.type,
  retrait: Number(n.attrs?.retrait) || 0,
  ouvert: n.attrs?.ouvert !== false,
  depliant: !!n.attrs?.depliant,
  depart: Number(n.attrs?.depart) || null,
})

function deplierBlocs(noeuds: readonly NoeudTexte[]): NoeudTexte[] {
  const places = structurer(noeuds.map(ligne))
  const enfants = noeuds.map(() => [] as number[])
  const racines: number[] = []
  places.forEach((p, i) => (p.parent === null ? racines : enfants[p.parent]!).push(i))
  const emettre = (indices: readonly number[]): NoeudTexte[] => {
    const sortie: NoeudTexte[] = []
    for (const i of indices) {
      const n = noeuds[i]!
      const dessous = emettre(enfants[i]!)
      const attrs = sansPlat(n.attrs, ['coche', 'ouvert', 'depliant', 'depart'])
      const liste = LISTES[n.type]
      if (liste) {
        const [type, element] = liste
        const item: NoeudTexte = {
          type: element,
          ...(n.type === 'tache' ? { attrs: { ...attrs, checked: !!n.attrs?.coche } } : attrs ? { attrs } : {}),
          content: [paragraphe(n), ...dessous],
        }
        const derniere = sortie[sortie.length - 1]
        if (derniere?.type === type) derniere.content!.push(item)
        else sortie.push({ type, ...(n.type === 'numero' && Number(n.attrs?.depart) > 1 ? { attrs: { start: Number(n.attrs?.depart) } } : {}), content: [item] })
        continue
      }
      switch (n.type) {
        case 'citation':
          sortie.push({ type: 'blockquote', ...(attrs ? { attrs } : {}), content: [paragraphe(n), ...dessous] })
          break
        case 'encadreBloc': {
          // L'encadré de la note ne tient que des paragraphes : le reste le suit.
          const dedans = dessous.filter((d) => d.type === 'paragraph')
          sortie.push({ type: 'encadre', ...(attrs ? { attrs } : {}), content: [paragraphe(n), ...dedans] })
          sortie.push(...dessous.filter((d) => d.type !== 'paragraph'))
          break
        }
        case 'depliant':
          sortie.push({
            type: 'deroulant',
            attrs: { ...attrs, ...(n.attrs?.ouvert === false ? { ouvert: false } : {}) },
            content: [{ type: 'resumeDeroulant', ...(n.content?.length ? { content: n.content } : {}) }, ...dessous],
          })
          break
        case 'heading':
          if (n.attrs?.depliant) {
            const { level, ...reste } = attrs ?? {}
            sortie.push({
              type: 'deroulant',
              attrs: { ...reste, niveau: level, ...(n.attrs?.ouvert === false ? { ouvert: false } : {}) },
              content: [{ type: 'resumeDeroulant', ...(n.content?.length ? { content: n.content } : {}) }, ...dessous],
            })
            break
          }
          sortie.push({ ...n, ...(attrs ? { attrs } : {}) }, ...dessous)
          break
        case 'colonnes':
          sortie.push({ ...n, content: (n.content ?? []).map((c) => ({ ...c, content: deplierBlocs(c.content ?? []) })) })
          break
        default: {
          // Un bloc sans enveloppe (texte, titre, code…) : ses enfants le suivent au même rang.
          const { attrs: _, ...sans } = n
          sortie.push(attrs ? { ...sans, attrs } : sans, ...dessous)
        }
      }
    }
    return sortie
  }
  return emettre(racines)
}

/** Le texte dans l'écriture imbriquée (exports, note). */
export function deplier(doc: NoeudTexte): NoeudTexte {
  return { ...doc, content: deplierBlocs(doc.content ?? []) }
}
