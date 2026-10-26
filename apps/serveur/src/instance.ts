import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { type Habillage, ErreurHabillage, lireHabillageTexte } from '@notak/tableau/habillage'

/**
 * Ce qu'une instance dit d'elle-même (`GET /api/instance`), réglé par l'environnement au démarrage
 * (docs/AUTO-HEBERGER.md) : son nom, si l'on peut s'y inscrire, et les habillages qu'elle fournit à ses comptes.
 */
export interface Instance {
  nom: string
  inscriptions: 'ouvertes' | 'fermees'
  habillages: Habillage[]
  /** Imposé à tous les comptes : le choix de chacun ne compte plus. */
  impose?: string
  /** Proposé à qui n'a rien choisi. */
  parDefaut?: string
  /**
   * L'adresse où un autre appareil joint ce serveur (un iPhone qui envoie vers les non triés) : `NOTAK_ADRESSE_PUBLIQUE`,
   * sinon `NOTAK_ORIGINE`. Absente, la page ne la connaît que par l'adresse où elle est ouverte.
   */
  adresse?: string
}

export const INSTANCE_PAR_DEFAUT: Instance = { nom: 'Notak', inscriptions: 'ouvertes', habillages: [] }

/**
 * Les habillages d'un dossier : chaque `.json` y est relu par la même liste blanche que dans le navigateur. Un fichier
 * refusé est signalé au journal et laissé de côté : un thème abîmé n'empêche pas le serveur de démarrer.
 */
export function lireHabillages(dossier: string, signaler: (message: string) => void): Habillage[] {
  let noms: string[]
  try {
    noms = readdirSync(dossier).filter((n) => n.endsWith('.json')).sort()
  } catch {
    return []
  }
  const lus = new Map<string, Habillage>()
  for (const n of noms) {
    try {
      const h = lireHabillageTexte(readFileSync(join(dossier, n), 'utf8'))
      if (lus.has(h.id)) signaler(`Notak : habillage ${n} ignoré, l'identifiant « ${h.id} » est déjà pris`)
      else lus.set(h.id, h)
    } catch (e) {
      signaler(`Notak : habillage ${n} refusé (${e instanceof ErreurHabillage ? e.message : 'illisible'})`)
    }
  }
  return [...lus.values()]
}

/** L'instance que décrit l'environnement. Un thème imposé ou proposé qui n'existe pas est signalé, puis oublié. */
export function instanceDe(env: Record<string, string | undefined>, dossierDonnees: string, signaler: (message: string) => void = console.warn): Instance {
  const habillages = lireHabillages(env.NOTAK_HABILLAGES || join(dossierDonnees, 'habillages'), signaler)
  const connu = (variable: 'NOTAK_HABILLAGE' | 'NOTAK_HABILLAGE_DEFAUT') => {
    const id = env[variable]?.trim()
    if (!id) return undefined
    if (habillages.some((h) => h.id === id)) return id
    signaler(`Notak : ${variable}=${id}, mais aucun habillage ne porte cet identifiant`)
    return undefined
  }
  const impose = connu('NOTAK_HABILLAGE')
  const parDefaut = connu('NOTAK_HABILLAGE_DEFAUT')
  const adresse = adresseDe(env, signaler)
  const inscriptions = env.NOTAK_INSCRIPTIONS?.trim()
  if (inscriptions && inscriptions !== 'ouvertes' && inscriptions !== 'fermees') signaler(`Notak : NOTAK_INSCRIPTIONS=${inscriptions} n'est ni « ouvertes » ni « fermees » : elles restent ouvertes`)
  return {
    nom: env.NOTAK_NOM?.trim().slice(0, 60) || INSTANCE_PAR_DEFAUT.nom,
    inscriptions: inscriptions === 'fermees' ? 'fermees' : 'ouvertes',
    habillages,
    ...(impose ? { impose } : {}),
    ...(parDefaut ? { parDefaut } : {}),
    ...(adresse ? { adresse } : {}),
  }
}

/** L'origine d'une adresse en http ou https ; une autre valeur est signalée, puis oubliée. */
function adresseDe(env: Record<string, string | undefined>, signaler: (message: string) => void): string | undefined {
  for (const variable of ['NOTAK_ADRESSE_PUBLIQUE', 'NOTAK_ORIGINE'] as const) {
    const brute = env[variable]?.trim()
    if (!brute) continue
    try {
      const u = new URL(brute)
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.origin
    } catch {
      // signalée plus bas, comme une adresse d'un autre protocole
    }
    signaler(`Notak : ${variable}=${brute} n'est pas une adresse en http ou https : elle est ignorée`)
  }
  return undefined
}
