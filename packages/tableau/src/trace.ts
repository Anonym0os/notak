import type { Auteur, Trace } from './coeur/tableau'
import { t } from './langue'

/** Ce que le menu d'un élément dit de son histoire : une ligne par fait, avec la personne et l'âge. */
export interface LigneTrace {
  texte: string
  auteur: Auteur
}

const CINQ_MINUTES = 5 * 60_000

/** Un âge en quelques mots : « il y a quelques secondes », « il y a 3 min », « il y a 2 h », « il y a 4 j ». */
export function ageRelatif(quand: number, maintenant = Date.now()): string {
  const minutes = Math.floor(Math.max(0, maintenant - quand) / 60_000)
  if (minutes < 1) return t('toile.ageSecondes')
  if (minutes < 60) return t('toile.ageMinutes', { n: minutes })
  const heures = Math.floor(minutes / 60)
  if (heures < 24) return t('menu.ageHeures', { n: heures })
  return t('menu.ageJours', { n: Math.floor(heures / 24) })
}

/**
 * Les lignes d'histoire d'un élément seul : « Créé par vous il y a 2 h », « Modifié par Léa il y a 3 min ». Une seule
 * phrase quand la même personne a créé puis modifié à moins de cinq minutes, ou quand les deux âges s'écrivent
 * pareil. Rien si l'on ne sait pas qui.
 */
export function lignesDeTrace(trace: Trace | undefined, moi: string | undefined, maintenant = Date.now()): LigneTrace[] {
  if (!trace) return []
  const nom = (a: Auteur) => (a.id === moi ? t('menu.vous') : a.nom)
  const creation = trace.par && trace.cree !== undefined ? { auteur: trace.par, quand: trace.cree } : null
  const modification = trace.modifiePar && trace.modifie !== undefined ? { auteur: trace.modifiePar, quand: trace.modifie } : null
  if (creation && modification && creation.auteur.id === modification.auteur.id) {
    const memeAge = ageRelatif(creation.quand, maintenant) === ageRelatif(modification.quand, maintenant)
    if (memeAge || modification.quand - creation.quand < CINQ_MINUTES) {
      return [{ auteur: creation.auteur, texte: t('menu.creeModifiePar', { nom: nom(creation.auteur), age: ageRelatif(modification.quand, maintenant) }) }]
    }
  }
  return [
    ...(creation ? [{ auteur: creation.auteur, texte: t('menu.creePar', { nom: nom(creation.auteur), age: ageRelatif(creation.quand, maintenant) }) }] : []),
    ...(modification ? [{ auteur: modification.auteur, texte: t('menu.modifiePar', { nom: nom(modification.auteur), age: ageRelatif(modification.quand, maintenant) }) }] : []),
  ]
}
