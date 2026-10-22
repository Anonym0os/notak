/**
 * Les règles d'une liste de tâches, en fonctions pures sur le JSON Tiptap :
 * `doc > taskList > taskItem(checked) > paragraph (+ taskList imbriquée)`.
 * Une tâche se désigne par son chemin : l'indice dans la liste, puis l'indice dans la sous-liste, etc.
 */
import { type Element, type NoeudTexte, type Taches, borner, nouvelId } from '../../coeur/tableau'

/** Une tâche et ses sous-tâches : six niveaux au plus. */
export const PROFONDEUR_MAX = 6
export const LARGEUR_TACHES = 34
export const HAUTEUR_TACHES_MIN = 6

export type Chemin = number[]

export const estFaite = (tache: NoeudTexte) => tache.attrs?.checked === true

export function docVide(): NoeudTexte {
  return {
    type: 'doc',
    content: [
      {
        type: 'taskList',
        content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }],
      },
    ],
  }
}

/** Un document qui n'est pas une liste de tâches (collé, ancien) est remplacé par une liste vide. */
export function docTaches(texte: NoeudTexte): NoeudTexte {
  return texte.content?.[0]?.type === 'taskList' ? texte : docVide()
}

export function nouvelleListeTaches(x: number, y: number): Element<Taches> {
  return {
    id: nouvelId(),
    x: borner(x),
    y: borner(y),
    largeur: LARGEUR_TACHES,
    contenu: { type: 'taches', texte: docVide() },
  }
}

/** Les tâches directement sous un nœud (le document, ou une tâche), toutes ses listes confondues. */
export const sousTaches = (noeud: NoeudTexte): NoeudTexte[] =>
  (noeud.content ?? []).flatMap((n) => (n.type === 'taskList' ? (n.content ?? []) : []))

/** Cochées et total, à toutes les profondeurs. */
export function compter(noeud: NoeudTexte): { faites: number; total: number } {
  let faites = 0
  let total = 0
  for (const t of sousTaches(noeud)) {
    const sous = compter(t)
    total += 1 + sous.total
    faites += (estFaite(t) ? 1 : 0) + sous.faites
  }
  return { faites, total }
}

/** Le nombre de niveaux d'une tâche : 1 pour une tâche sans sous-tâche. */
export function hauteur(tache: NoeudTexte): number {
  return 1 + Math.max(0, ...sousTaches(tache).map(hauteur))
}

/** Peut-on descendre d'un niveau une tâche de ce niveau (1 = en haut) et de cette hauteur ? */
export const peutDescendre = (niveau: number, hauteurTache: number) => niveau + hauteurTache <= PROFONDEUR_MAX

function cocher(tache: NoeudTexte, fait: boolean, enCascade: boolean): NoeudTexte {
  return {
    ...tache,
    attrs: { ...tache.attrs, checked: fait },
    content: enCascade
      ? tache.content?.map((n) =>
          n.type === 'taskList' ? { ...n, content: n.content?.map((t) => cocher(t, fait, true)) } : n,
        )
      : tache.content,
  }
}

function modifierEnfant(parent: NoeudTexte, indice: number, f: (t: NoeudTexte) => NoeudTexte): NoeudTexte | null {
  let reste = indice
  let trouve = false
  const content = (parent.content ?? []).map((n) => {
    if (n.type !== 'taskList' || trouve) return n
    const nb = n.content?.length ?? 0
    if (reste >= nb) {
      reste -= nb
      return n
    }
    trouve = true
    return { ...n, content: n.content!.map((t, k) => (k === reste ? f(t) : t)) }
  })
  return trouve ? { ...parent, content } : null
}

function modifier(parent: NoeudTexte, chemin: Chemin, f: (t: NoeudTexte) => NoeudTexte): NoeudTexte | null {
  const [indice, ...suite] = chemin
  if (indice === undefined) return null
  return modifierEnfant(parent, indice, (t) => (suite.length === 0 ? f(t) : (modifier(t, suite, f) ?? t)))
}

/**
 * Le document où cette tâche a basculé (cochée si elle était à faire, et inversement).
 * `enCascade` (Maj+clic) pose le même état à toutes ses sous-tâches. Un chemin inconnu ne change rien.
 */
export function basculer(doc: NoeudTexte, chemin: Chemin, enCascade = false): NoeudTexte {
  return modifier(doc, chemin, (t) => cocher(t, !estFaite(t), enCascade)) ?? doc
}

function sansFaites(parent: NoeudTexte): NoeudTexte {
  return {
    ...parent,
    content: (parent.content ?? []).flatMap((n): NoeudTexte[] => {
      if (n.type !== 'taskList') return [n]
      const restantes = (n.content ?? []).filter((t) => !estFaite(t)).map(sansFaites)
      return restantes.length > 0 ? [{ ...n, content: restantes }] : []
    }),
  }
}

/** Le document sans les tâches cochées, sous-tâches comprises. Il reste toujours une tâche. */
export function effacerFaites(doc: NoeudTexte): NoeudTexte {
  const reste = sansFaites(doc)
  return sousTaches(reste).length > 0 ? reste : docVide()
}
