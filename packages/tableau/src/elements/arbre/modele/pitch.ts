import type { Arbre, Id, ReglagesDiapo, ReglagesPitch } from '../../../coeur/tableau'
import { THEME_PITCH_DEFAUT } from '../themesPitch'
import { changerSujet } from './sujets'

/** Un réglage de diapositive à poser ; `null` rend la main à Auto (le champ disparaît). */
export type ReglageDiapo = { [K in keyof ReglagesDiapo]?: ReglagesDiapo[K] | null }
export type ReglagePitch = { [K in keyof ReglagesPitch]?: ReglagesPitch[K] | null }

/** Pose (ou, avec `null`, retire) des réglages de diapositive sur ces sujets. Un sujet sans réglage n'a plus de champ `diapo`. */
export function poserDiapo(a: Arbre, ids: readonly Id[], reglage: ReglageDiapo): Arbre {
  let sortie = a
  for (const id of ids)
    sortie = changerSujet(sortie, id, ({ diapo, ...s }) => {
      const neuf: Record<string, unknown> = { ...diapo }
      for (const [cle, valeur] of Object.entries(reglage)) {
        if (valeur === null || valeur === undefined) delete neuf[cle]
        else neuf[cle] = valeur
      }
      return Object.keys(neuf).length > 0 ? { ...s, diapo: neuf as ReglagesDiapo } : s
    })
  return sortie
}

/**
 * Pose le thème ou le rapport des diapositives de la carte. Le thème par défaut (sombre) et le rapport automatique
 * s'écrivent en retirant le champ : une carte intacte n'en porte aucun.
 */
export function poserPitch(a: Arbre, reglage: ReglagePitch): Arbre {
  const neuf: Record<string, unknown> = { ...a.pitch }
  for (const [cle, valeur] of Object.entries(reglage)) {
    if (valeur === null || valeur === undefined || (cle === 'theme' && valeur === THEME_PITCH_DEFAUT)) delete neuf[cle]
    else neuf[cle] = valeur
  }
  const { pitch: _p, ...reste } = a
  return Object.keys(neuf).length > 0 ? { ...reste, pitch: neuf as ReglagesPitch } : reste
}
