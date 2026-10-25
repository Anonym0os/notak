import { type Habillage, HABILLAGE_NOTAK, lireHabillage } from './format'

/**
 * Les habillages importés sur cet appareil, gardés dans le navigateur. Chacun est relu à chaque lecture : une entrée
 * abîmée, ou devenue invalide après un changement de format, est oubliée sans rien faire planter.
 */
const CLE = 'notak:habillages'

export function lireBibliotheque(): Habillage[] {
  try {
    const brut: unknown = JSON.parse(localStorage.getItem(CLE) ?? '[]')
    if (!Array.isArray(brut)) return []
    return brut.flatMap((b) => {
      try {
        return [lireHabillage(b)]
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

/** Range la bibliothèque ; `false` quand le navigateur refuse (navigation privée, stockage plein). */
export function ecrireBibliotheque(habillages: readonly Habillage[]): boolean {
  try {
    localStorage.setItem(CLE, JSON.stringify(habillages.map((h) => ({ notak: 'habillage', version: 1, ...h }))))
    return true
  } catch {
    return false
  }
}

/** D'où vient un habillage : le serveur le fournit à tous ses comptes, ou on l'a importé ici. */
export type OrigineHabillage = 'fourni' | 'importe'

export interface HabillageDisponible {
  habillage: Habillage
  origine: OrigineHabillage
}

/** Ce que l'application prête à l'espace : les habillages du serveur, et celui qu'il impose ou propose. */
export interface OffreHabillages {
  fournis?: readonly Habillage[]
  /** Imposé à tous : le choix de l'appareil ne compte plus. */
  impose?: string
  /** Proposé tant que l'appareil n'a rien choisi. */
  parDefaut?: string
}

/** Les habillages qu'on peut choisir : ceux du serveur d'abord, puis ceux importés (un même identifiant : le serveur). */
export function disponibles(offre: OffreHabillages | undefined, importes: readonly Habillage[]): HabillageDisponible[] {
  const fournis = offre?.fournis ?? []
  const pris = new Set(fournis.map((h) => h.id))
  return [...fournis.map((habillage) => ({ habillage, origine: 'fourni' as const })), ...importes.filter((h) => !pris.has(h.id)).map((habillage) => ({ habillage, origine: 'importe' as const }))]
}

/**
 * L'habillage actif : celui qu'impose le serveur, sinon celui choisi sur l'appareil, sinon celui que le serveur
 * propose. `null` : l'habillage de Notak. Un choix qui ne désigne plus rien (un thème retiré) retombe sur la suite.
 */
export function habillageActif(liste: readonly HabillageDisponible[], offre: OffreHabillages | undefined, choix: string | undefined): Habillage | null {
  const de = (id: string | undefined) => (id ? liste.find((d) => d.habillage.id === id)?.habillage : undefined)
  const impose = de(offre?.impose)
  if (impose) return impose
  if (choix === HABILLAGE_NOTAK) return null
  return de(choix) ?? de(offre?.parDefaut) ?? null
}
