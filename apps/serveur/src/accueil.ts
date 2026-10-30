import { randomUUID } from 'node:crypto'
import { ACCUEIL } from '@notak/tableau/modeles/accueil'
import { ACCUEIL_EN } from '@notak/tableau/modeles/accueil.en'
import { accueilAuDoigt } from '@notak/tableau/modeles/accueilDoigt'
import { cleDeRang, elementsDuModele } from '@notak/tableau/modeles/construire'
import * as Y from 'yjs'

/**
 * Le compte naît sur un écran qu'on touche : un iPhone, un iPad, un Android, d'après l'agent utilisateur de la requête
 * qui le crée. Un iPad qui se dit Macintosh n'est pas reconnu ; il garde l'accueil à la souris, comme un ordinateur.
 */
export const agentAuDoigt = (agent: string | null | undefined): boolean => /iPhone|iPad|iPod|Android|Mobile/.test(agent ?? '')

/**
 * Le document Yjs du tableau d'accueil d'un compte neuf : la map `meta` (le titre) et la map `elements`, comme
 * le fait la toile, avec les gestes présentés par le modèle `ACCUEIL`, au doigt (`doigt`) pour un compte créé depuis
 * un téléphone. Un document par appel : les identifiants sont neufs, deux comptes ne partagent rien.
 */
export function documentAccueil(titre: string, langue: 'fr' | 'en' = 'fr', doigt = false): Y.Doc {
  const modele = langue === 'en' ? ACCUEIL_EN : ACCUEIL
  const doc = new Y.Doc()
  doc.transact(() => {
    doc.getMap('meta').set('titre', titre)
    const elements = doc.getMap('elements')
    elementsDuModele(doigt ? accueilAuDoigt(modele, langue) : modele, randomUUID).forEach((e, i) => elements.set(e.id, { ...e, plan: cleDeRang(i) }))
  })
  return doc
}
