import { randomUUID } from 'node:crypto'
import { ACCUEIL } from '@notak/tableau/modeles/accueil'
import { cleDeRang, elementsDuModele } from '@notak/tableau/modeles/construire'
import * as Y from 'yjs'

/**
 * Le document Yjs du tableau d'accueil d'un compte neuf : la map `meta` (le titre) et la map `elements`, comme
 * le fait la toile, avec les gestes présentés par le modèle `ACCUEIL`. Un document par appel : les identifiants
 * sont neufs, deux comptes ne partagent rien.
 */
export function documentAccueil(titre: string): Y.Doc {
  const doc = new Y.Doc()
  doc.transact(() => {
    doc.getMap('meta').set('titre', titre)
    const elements = doc.getMap('elements')
    elementsDuModele(ACCUEIL, randomUUID).forEach((e, i) => elements.set(e.id, { ...e, plan: cleDeRang(i) }))
  })
  return doc
}
