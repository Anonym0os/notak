import * as Y from 'yjs'
import type { Dossier } from './dossier'
import { decoderFichier, encoderFichier } from './fichierNotak'

/**
 * L'historique d'un tableau, gardé par chaque appareil dans son propre dossier : de quoi revenir à l'état d'un jour
 * passé, même si quelqu'un a tout effacé depuis (l'effacement s'est propagé partout, l'historique de chacun reste).
 *
 * ```
 * <chemin>/<tableau>/<aaaa-mm-jj>-complet.nmv   l'état entier du tableau ce jour-là (au plus une fois par semaine)
 * <chemin>/<tableau>/<aaaa-mm-jj>-delta.nmv     ce qui a changé depuis la version précédente
 * ```
 *
 * Seuls les tableaux modifiés reçoivent une version. On garde chaque jour pendant 30 jours, puis une version par
 * semaine (les complètes) pendant 6 mois : un iCloud gratuit ne se remplit pas d'historique.
 */

const JOUR = 24 * 3600 * 1000
export const GARDE_QUOTIDIENNE = 30 * JOUR
export const GARDE_HEBDOMADAIRE = 183 * JOUR
const NOM = /^(\d{4}-\d{2}-\d{2})-(complet|delta)\.nmv$/

export const jourDe = (t: number) => new Date(t).toISOString().slice(0, 10)
const tempsDe = (jour: string) => Date.parse(`${jour}T00:00:00Z`)

interface FichierVersion {
  jour: string
  genre: 'complet' | 'delta'
  nom: string
}

async function lister(dossier: Dossier, chemin: string): Promise<FichierVersion[]> {
  const entrees = await dossier.lister(chemin)
  return entrees
    .flatMap((e) => {
      const m = e.genre === 'fichier' ? NOM.exec(e.nom) : null
      return m ? [{ jour: m[1]!, genre: m[2] as 'complet' | 'delta', nom: e.nom }] : []
    })
    .sort((a, b) => (a.jour < b.jour ? -1 : a.jour > b.jour ? 1 : a.genre === 'complet' ? -1 : 1))
}

/** Ce qu'on garde d'une version à l'autre, par tableau : le vecteur d'état de la dernière version écrite. */
export interface EtatVersions {
  sv: Uint8Array
  ds: Uint8Array
  dernierComplet?: string
}

/**
 * Écrit la version du jour de ce tableau, s'il a changé depuis la précédente. L'appelant lit le document d'un bloc :
 * son vecteur d'état, ses suppressions, son état complet et ce qui a changé depuis `avant.sv`.
 * Rend le nouvel état à garder (ou `null` si rien n'a changé).
 */
export async function noterVersion(
  dossier: Dossier,
  chemin: string,
  tableau: string,
  etat: { sv: Uint8Array; ds: Uint8Array; complet: Uint8Array; delta?: Uint8Array },
  avant: EtatVersions | undefined,
  maintenant: number,
): Promise<EtatVersions | null> {
  const egal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((o, i) => o === b[i])
  if (avant && egal(avant.sv, etat.sv) && egal(avant.ds, etat.ds)) return null
  const jour = jourDe(maintenant)
  const ici = `${chemin}/${tableau}`
  const existants = await lister(dossier, ici)
  const complet = !avant?.dernierComplet || maintenant - tempsDe(avant.dernierComplet) >= 7 * JOUR || !existants.some((f) => f.genre === 'complet')
  // Une seule version par jour et par genre : la dernière du jour remplace la précédente (le fichier est le mien seul).
  const maj = complet || !etat.delta ? etat.complet : etat.delta
  const deltaDuJour = existants.find((f) => f.jour === jour && f.genre === 'delta')
  const octets = await encoderFichier({
    genre: 'version',
    enregistrements: [{ tableau, maj: !complet && deltaDuJour ? await fusionnerAvec(dossier, `${ici}/${deltaDuJour.nom}`, maj) : maj }],
  })
  await dossier.ecrireAtomique(`${ici}/${jour}-${complet ? 'complet' : 'delta'}.nmv`, octets)
  return { sv: etat.sv, ds: etat.ds, dernierComplet: complet ? jour : avant!.dernierComplet! }
}

async function fusionnerAvec(dossier: Dossier, chemin: string, maj: Uint8Array) {
  const o = await dossier.lire(chemin)
  const f = o instanceof Uint8Array ? await decoderFichier(o) : null
  const avant = f?.enregistrements[0]?.maj
  return avant ? Y.mergeUpdates([avant, maj]) : maj
}

/** Les jours auxquels on peut revenir : ceux dont toute la chaîne depuis une version complète est là. */
export async function joursDisponibles(dossier: Dossier, chemin: string, tableau: string): Promise<string[]> {
  const fichiers = await lister(dossier, `${chemin}/${tableau}`)
  const jours: string[] = []
  let base = false
  for (const f of fichiers) {
    if (f.genre === 'complet') base = true
    if (base && !jours.includes(f.jour)) jours.push(f.jour)
  }
  return jours
}

/** L'état entier du tableau tel qu'il était à la fin de ce jour, ou `null` si ce jour n'est pas disponible. */
export async function lireVersion(dossier: Dossier, chemin: string, tableau: string, jour: string): Promise<Uint8Array | null> {
  const fichiers = (await lister(dossier, `${chemin}/${tableau}`)).filter((f) => f.jour <= jour)
  const i = fichiers.findLastIndex((f) => f.genre === 'complet')
  if (i < 0) return null
  const majs: Uint8Array[] = []
  for (const f of fichiers.slice(i)) {
    const o = await dossier.lire(`${chemin}/${tableau}/${f.nom}`)
    const fi = o instanceof Uint8Array ? await decoderFichier(o) : null
    if (!fi) return null
    for (const e of fi.enregistrements) majs.push(e.maj)
  }
  return Y.mergeUpdates(majs)
}

/** Efface ce qui a passé l'âge : les deltas après 30 jours, les complètes après 6 mois (sauf la plus récente). */
export async function elaguerVersions(dossier: Dossier, chemin: string, tableau: string, maintenant: number) {
  const fichiers = await lister(dossier, `${chemin}/${tableau}`)
  const derniere = fichiers.findLast((f) => f.genre === 'complet')
  for (const f of fichiers) {
    const age = maintenant - tempsDe(f.jour)
    const vieux = f.genre === 'delta' ? age > GARDE_QUOTIDIENNE : age > GARDE_HEBDOMADAIRE && f !== derniere
    if (vieux) await dossier.supprimer(`${chemin}/${tableau}/${f.nom}`)
  }
}
