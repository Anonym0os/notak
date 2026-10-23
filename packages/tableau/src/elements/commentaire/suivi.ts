import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { Message } from '../../coeur/tableau'
import type { ContexteToile, Presence } from '../types'

/**
 * Ce qu'un fil dit de la vie autour de lui : ce que je n'ai pas encore lu, et qui est en train d'écrire.
 * Le « lu » est à moi seul : il vit dans ce navigateur, il ne s'écrit pas dans le tableau.
 */

const CLE = 'notak:fils-lus'
/** Un message plus vieux que ça ne compte plus comme nouveau : on ne signale pas un vieux fil que l'on découvre. */
export const RECENT = 7 * 86_400_000

let lus: Record<string, number> | null = null
let version = 0
const ecouteurs = new Set<() => void>()

function lire(): Record<string, number> {
  if (lus) return lus
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? '{}') as unknown
    lus = brut && typeof brut === 'object' && !Array.isArray(brut) ? (brut as Record<string, number>) : {}
  } catch {
    lus = {}
  }
  return lus
}

/** Les messages des autres, récents, écrits depuis la dernière fois que j'ai regardé ce fil. */
export function nonLus(cle: string, messages: readonly Message[], moi: string, maintenant = Date.now()): Message[] {
  const depuis = lire()[cle] ?? 0
  return messages.filter((m) => m.auteur.id !== moi && m.date > depuis && maintenant - m.date < RECENT)
}

/** J'ai vu ce fil jusqu'à ce message : il n'a plus rien de nouveau. */
export function marquerLu(cle: string, jusqua: number) {
  const tous = lire()
  if ((tous[cle] ?? 0) >= jusqua) return
  lus = { ...tous, [cle]: jusqua }
  version++
  try {
    localStorage.setItem(CLE, JSON.stringify(lus))
  } catch {
    // Pas de stockage : le « lu » ne vaut que pour cette séance.
  }
  for (const f of ecouteurs) f()
}

/** Oublie ce qui est retenu (pour les tests). */
export function oublierLus() {
  lus = null
  version++
  for (const f of ecouteurs) f()
}

const souscrire = (f: () => void) => {
  ecouteurs.add(f)
  return () => void ecouteurs.delete(f)
}

/**
 * Les messages que je n'ai pas lus de ce fil. `vu` : le fil est sous mes yeux (choisi, ouvert) ; il est alors marqué
 * lu, mais ses messages restent signalés le temps de ce rendu, pour qu'on les repère.
 */
export function useNonLus(cle: string, messages: readonly Message[], moi: string, vu: boolean): Message[] {
  useSyncExternalStore(souscrire, () => version)
  const vus = useRef<Set<string>>(new Set())
  const nouveaux = nonLus(cle, messages, moi)
  for (const m of nouveaux) vus.current.add(m.id)
  const dernier = messages.reduce((d, m) => Math.max(d, m.date), 0)
  useEffect(() => {
    if (vu && dernier > 0) marquerLu(cle, dernier)
  }, [vu, cle, dernier])
  // Un message vu à l'instant reste signalé tant que ce fil est sous les yeux.
  return vu ? messages.filter((m) => vus.current.has(m.id)) : nouveaux
}

const sansEcoute = () => () => {}

/**
 * Les autres personnes qui écrivent dans ce fil : celles dont la présence dit qu'elles éditent l'une de ces clés
 * (l'élément fil lui-même, ou `fil:<id>` pour le fil accroché à l'élément `<id>`).
 */
export function useQuiEcrit(contexte: ContexteToile, cles: readonly string[]): Presence['utilisateur'][] {
  const presence = contexte.services.presence
  // Le cliché est une chaîne : il reste le même tant que personne ne se met à écrire ou n'arrête.
  const cliche = useSyncExternalStore(presence ? presence.ecouter : sansEcoute, () =>
    (presence?.autres() ?? [])
      .filter((p) => p.edition !== null && cles.includes(p.edition))
      .map((p) => `${p.client}`)
      .join('|'),
  )
  return useMemo(
    () => (presence?.autres() ?? []).filter((p) => p.edition !== null && cles.includes(p.edition)).map((p) => p.utilisateur),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [presence, cliche, cles.join('|')],
  )
}

/** Le délai sans frappe après lequel je cesse de dire que j'écris. */
export const FRAPPE_REPOS = 5_000

/**
 * Dit aux autres que j'écris dans ce fil (`cle` : ce que la présence en retient), au plus une fois par seconde, et
 * cesse cinq secondes après la dernière frappe. Rend le geste à appeler à chaque frappe.
 */
export function useSignalerFrappe(contexte: ContexteToile, cle: string | null): () => void {
  const presence = contexte.services.presence
  const etat = useRef<{ dernier: number; repos?: ReturnType<typeof setTimeout> }>({ dernier: 0 })
  useEffect(
    () => () => {
      clearTimeout(etat.current.repos)
      if (cle && etat.current.dernier) presence?.signaler({ edition: null })
    },
    [presence, cle],
  )
  return () => {
    if (!presence || !cle) return
    const e = etat.current
    const maintenant = Date.now()
    if (maintenant - e.dernier >= 1000) {
      e.dernier = maintenant
      presence.signaler({ edition: cle })
    }
    clearTimeout(e.repos)
    e.repos = setTimeout(() => {
      e.dernier = 0
      presence.signaler({ edition: null })
    }, FRAPPE_REPOS)
  }
}
