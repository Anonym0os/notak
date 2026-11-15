import { useEffect, useState } from 'react'
import { t } from '../../langue'
import type { ApplicationOuverture, Services } from '../types'

/**
 * Ce que dit le bouton qui ouvre un fichier hors de Notak (`ouvrirDehors`), dans la visionneuse d'un PDF comme dans
 * celle des images : avec quoi il l'ouvre. « Ouvrir avec l'app » ne disait rien, dans l'app même.
 * - dans un navigateur : un nouvel onglet ;
 * - dans l'app d'un Mac : l'application que le système associe à la sorte du fichier, nommée (« Ouvrir dans
 *   Aperçu »), demandée à la coque (`application_par_defaut`) ; aucune, et le bouton s'efface ; un système qui ne le dit
 *   pas (Windows, Linux) ou une app d'avant la question, « Ouvrir sur l'ordinateur » ;
 * - dans l'app d'un iPhone ou d'un iPad, où rien n'est « par défaut » : « Ouvrir dans… », la feuille de partage.
 */
export interface LibelleOuvrir {
  /** L'infobulle et le nom pour un lecteur d'écran. */
  libelle: string
  /** Ce qu'écrit la barre à côté de l'icône, quand elle a la place. */
  court: string
}

type Demande = NonNullable<Services['applicationPour']>

/** Les réponses, par service et par extension : la coque n'est demandée qu'une fois pour tous les PDF. */
const reponses = new WeakMap<Demande, Map<string, ApplicationOuverture | Promise<ApplicationOuverture>>>()

/** L'extension d'un nom, en minuscules ; sans extension, le nom entier (la coque n'en ouvre aucun). */
export const sorteDe = (nom: string): string => {
  const point = nom.lastIndexOf('.')
  return point > 0 ? nom.slice(point + 1).toLowerCase() : nom.toLowerCase()
}

function memoire(demander: Demande) {
  let m = reponses.get(demander)
  if (!m) reponses.set(demander, (m = new Map()))
  return m
}

/** La réponse déjà connue pour ce nom, sans attendre. */
function connue(demander: Demande, nom: string): ApplicationOuverture | undefined {
  const r = memoire(demander).get(sorteDe(nom))
  return r instanceof Promise ? undefined : r
}

/** La réponse pour ce nom ; un échec (une app d'avant la question) vaut « on ne sait pas ». */
export function applicationDe(demander: Demande, nom: string): Promise<ApplicationOuverture> {
  const m = memoire(demander)
  const cle = sorteDe(nom)
  const deja = m.get(cle)
  if (deja) return Promise.resolve(deja)
  const enCours = demander(nom)
    .catch((): ApplicationOuverture => ({ sorte: 'inconnue' }))
    .then((r) => {
      m.set(cle, r)
      return r
    })
  m.set(cle, enCours)
  return enCours
}

/**
 * Le libellé, d'après ce que l'hôte sait faire et ce qu'il a répondu ; `null` : rien ne l'ouvrirait, pas de bouton.
 * Sans réponse encore, ou une qu'on ne connaît pas : « Ouvrir sur l'ordinateur ».
 */
export function libelleOuvrir(services: Pick<Services, 'ouvrirAilleurs'>, reponse?: ApplicationOuverture): LibelleOuvrir | null {
  if (!services.ouvrirAilleurs) return { libelle: t('fichier.ouvrirOnglet'), court: t('fichier.ouvrirOnglet.court') }
  switch (reponse?.sorte) {
    case 'application': {
      const texte = t('fichier.ouvrirDans', { app: reponse.nom })
      return { libelle: texte, court: texte }
    }
    case 'aucune':
      return null
    case 'partage':
      return { libelle: t('fichier.ouvrirPartage'), court: t('fichier.ouvrirPartage.court') }
    default: {
      const texte = t('fichier.ouvrirOrdinateur')
      return { libelle: texte, court: texte }
    }
  }
}

/** Le libellé du bouton qui ouvre `nom` hors de Notak, qui se précise quand l'hôte a répondu ; `null` : pas de bouton. */
export function useOuvrirAvec(services: Pick<Services, 'ouvrirAilleurs' | 'applicationPour'> | undefined, nom: string): LibelleOuvrir | null {
  const demander = services?.ouvrirAilleurs ? services.applicationPour : undefined
  const cle = sorteDe(nom)
  const [reponse, setReponse] = useState<{ cle: string; r: ApplicationOuverture } | null>(() => {
    const r = demander && connue(demander, nom)
    return r ? { cle, r } : null
  })
  useEffect(() => {
    if (!demander) return
    let vivant = true
    void applicationDe(demander, nom).then((r) => vivant && setReponse({ cle, r }))
    return () => {
      vivant = false
    }
    // `nom` ne compte que par sa sorte (`cle`) : deux PDF, une seule question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demander, cle])
  const actuelle = demander ? (reponse?.cle === cle ? reponse.r : connue(demander, nom)) : undefined
  return libelleOuvrir(services ?? {}, actuelle)
}
