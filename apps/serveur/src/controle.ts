import * as decoding from 'lib0/decoding'
import * as Y from 'yjs'
import { type DroitsTableau, gesteSurElement, permis } from '../../../packages/tableau/src/coeur/droitsElements.ts'
import { decouper } from '../../../packages/tableau/src/coeur/arbresYjs.ts'

// Le contrôle des mises à jour reçues par la synchro, élément par élément. Un geste qu'on n'a pas le droit de faire
// n'est pas rejeté (le client le renverrait sans fin) : il est appliqué, puis annulé aussitôt par le serveur. Tout le
// monde reçoit l'annulation, son auteur compris, et chacun retombe sur le même état. Un commentateur y passe aussi :
// il écrit ses fils et ses réactions, pas le reste.

/** Les cartes du document d'un tableau (`magasinYjs.ts`) ; les clés de `textes`, `lignes` et `traces` sont des éléments. */
const CARTES = ['elements', 'textes', 'lignes', 'traces', 'meta'] as const
const ARBRES = 'arbres'

/** Le contenu d'une mise à jour de document, si ce message de synchro en porte une (sinon `null`). */
export function miseAJourDuMessage(message: Uint8Array): Uint8Array | null {
  try {
    const d = decoding.createDecoder(message)
    decoding.readVarString(d) // le document (et sa session)
    if (decoding.readVarUint(d) !== 0) return null // pas un message de synchro
    const genre = decoding.readVarUint(d)
    // 1 : la réponse à un premier échange (ce que le client a et que le serveur n'a pas) ; 2 : une mise à jour.
    return genre === 1 || genre === 2 ? decoding.readVarUint8Array(d) : null
  } catch {
    return null
  }
}

export interface Changements {
  /** Chaque élément de `elements` qui a changé : avant, après (`undefined` : absent). */
  elements: Map<string, { avant: unknown; apres: unknown }>
  /** Les éléments dont un texte, une ligne ou une carte mentale a changé. */
  textes: Set<string>
  /** Le titre, le fond ou les étiquettes du tableau. */
  meta: boolean
}

/** La carte racine et la clé sous laquelle se trouve un type imbriqué du document. */
function racineDe(type: Y.AbstractType<any>): { racine: Y.AbstractType<any>; cle: string | null } {
  let t = type
  let cle: string | null = null
  while (t._item) {
    cle = t._item.parentSub ?? cle
    t = t._item.parent as Y.AbstractType<any>
  }
  return { racine: t, cle }
}

/**
 * Applique `miseAJour` au document sous `origine`, et rend ce qu'elle a changé. Les éléments sont lus avant et après,
 * pour savoir si le changement n'est qu'un commentaire.
 */
export function appliquerEnRelevant(doc: Y.Doc, miseAJour: Uint8Array, origine: object): Changements {
  const elements = doc.getMap<unknown>('elements')
  const cartes = new Map<unknown, string>([...CARTES, ARBRES].map((nom) => [doc.getMap(nom), nom]))
  const releve: Changements = { elements: new Map(), textes: new Set(), meta: false }

  const surElements = (ev: Y.YMapEvent<unknown>, tx: Y.Transaction) => {
    if (tx.origin !== origine) return
    for (const [cle, ch] of ev.changes.keys) {
      if (!releve.elements.has(cle)) releve.elements.set(cle, { avant: ch.action === 'add' ? undefined : ch.oldValue, apres: elements.get(cle) })
    }
  }
  const surTransaction = (tx: Y.Transaction) => {
    if (tx.origin !== origine) return
    const types = new Set<Y.AbstractType<any>>([...tx.changed.keys(), ...tx.changedParentTypes.keys()] as Y.AbstractType<any>[])
    for (const type of types) {
      const { racine, cle } = racineDe(type)
      const nom = cartes.get(racine)
      // Une carte racine changée directement : ses clés ; un type imbriqué : la clé de la racine qui le porte.
      const cles = type === racine ? [...(tx.changed.get(type) ?? [])].filter((c): c is string => c !== null) : cle ? [cle] : []
      if (nom === 'meta') releve.meta = true
      else if (nom === 'textes' || nom === 'lignes') for (const c of cles) releve.textes.add(c)
      else if (nom === ARBRES) for (const c of cles) releve.textes.add(decouper(c)?.[0] ?? c)
      else if (nom === undefined) releve.meta = true // une carte inconnue : seul qui écrit le tableau y touche
    }
  }
  elements.observe(surElements)
  doc.on('afterTransaction', surTransaction)
  try {
    Y.applyUpdate(doc, miseAJour, origine)
  } finally {
    elements.unobserve(surElements)
    doc.off('afterTransaction', surTransaction)
  }
  return releve
}

/** Ces changements sont-ils tous permis à `auteur`, avec ces droits ? Les traces (qui a touché quoi) ne comptent pas. */
export function changementsPermis(c: Changements, droits: DroitsTableau, auteur: string): boolean {
  if (c.meta && !permis(droits, null, 'ecriture')) return false
  for (const [id, { avant, apres }] of c.elements) if (!permis(droits, id, gesteSurElement(avant, apres, auteur))) return false
  for (const id of c.textes) if (!permis(droits, id, 'ecriture')) return false
  return true
}

/**
 * Contrôle une mise à jour reçue d'une connexion : appliquée sous une origine suivie, puis annulée si elle n'est pas
 * permise. Rend vrai si elle a été gardée. `origine` doit être un objet propre à cet appel.
 */
export function controler(doc: Y.Doc, miseAJour: Uint8Array, droits: DroitsTableau, auteur: string, origine: object): boolean {
  const suivi = new Y.UndoManager(
    [...CARTES, ARBRES].map((nom) => doc.getMap(nom)),
    { trackedOrigins: new Set([origine]), captureTimeout: 0 },
  )
  try {
    const c = appliquerEnRelevant(doc, miseAJour, origine)
    if (changementsPermis(c, droits, auteur)) return true
    suivi.undo()
    return false
  } finally {
    suivi.destroy()
  }
}
