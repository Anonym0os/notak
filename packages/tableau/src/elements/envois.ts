import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import type { Contenu, Element } from '../coeur/tableau'
import { annoncer } from '../avis'
import type { ContexteToile, DepotFichiers } from './types'

/**
 * Les fichiers que ce navigateur est en train d'envoyer. L'élément naît tout de suite avec un fichier
 * provisoire (`envoi-…`), montré depuis la copie locale ; une fois le fichier reçu par le serveur, l'élément
 * prend son vrai id. Les autres, qui n'ont pas la copie, voient une roue en attendant.
 */
const PREFIXE = 'envoi-'

type Envoi = { local: string; fini?: string; echec?: string }
const envois = new Map<string, Envoi>()
const abonnes = new Set<() => void>()
const prevenir = () => abonnes.forEach((f) => f())
const ecouter = (f: () => void) => {
  abonnes.add(f)
  return () => abonnes.delete(f)
}

export const enEnvoi = (fichier: string) => fichier.startsWith(PREFIXE)

/** Lance l'envoi et rend tout de suite l'id provisoire à mettre dans l'élément. */
export function commencerEnvoi(fichier: Blob, depot: DepotFichiers): string {
  const id = PREFIXE + crypto.randomUUID()
  envois.set(id, { local: URL.createObjectURL(fichier) })
  depot.enregistrer(fichier).then(
    (fini) => {
      envois.set(id, { ...envois.get(id)!, fini })
      prevenir()
    },
    (e: unknown) => {
      const nom = fichier instanceof File && fichier.name ? `« ${fichier.name} »` : 'Le fichier'
      const cause = e instanceof Error ? e.message : 'Envoi impossible'
      envois.set(id, { ...envois.get(id)!, echec: `${nom} n'a pas été envoyé : ${cause.charAt(0).toLowerCase()}${cause.slice(1)}.` })
      prevenir()
    },
  )
  return id
}

/** Ce que l'élément en cours d'envoi devient : son vrai fichier, ou `null` si l'envoi a échoué. */
type Issue = { fini: string } | { echec: string } | null

function useEnvoi(fichier: string) {
  return useSyncExternalStore(ecouter, () => (enEnvoi(fichier) ? envois.get(fichier) : undefined))
}

/**
 * L'adresse à montrer pour le fichier d'un élément, et s'il est encore en route. `undefined` : en
 * chargement ; `null` : introuvable. À la fin d'un envoi parti d'ici, l'élément prend son vrai fichier (hors de
 * l'historique : c'est la suite de sa création) ; un envoi qui échoue retire l'élément et le dit.
 */
export function useFichier<C extends Contenu & { fichier: string }>(element: Element<C>, contexte: ContexteToile) {
  const { fichier } = element.contenu
  const envoi = useEnvoi(fichier)
  const depot = contexte.services.fichiers
  const reel = envoi?.fini ?? (enEnvoi(fichier) ? null : fichier)
  const [adresse, setAdresse] = useState<string | null | undefined>(undefined)

  useLayoutEffect(() => {
    let vivant = true
    setAdresse(undefined)
    if (!fichier || !reel) return // Le fantôme d'un outil, ou un envoi pas encore reçu.
    if (!depot) return setAdresse(null)
    depot.adresse(reel).then(
      (a) => vivant && setAdresse(a),
      () => vivant && setAdresse(null),
    )
    return () => {
      vivant = false
    }
  }, [depot, fichier, reel])

  const issue: Issue = envoi?.fini ? { fini: envoi.fini } : envoi?.echec ? { echec: envoi.echec } : null
  const cle = issue && ('fini' in issue ? issue.fini : issue.echec)
  useEffect(() => {
    if (!issue || contexte.services.lectureSeule) return
    const { magasin } = contexte
    const present = magasin.lire().elements.find((e) => e.id === element.id)
    if (!present || (present.contenu as C).fichier !== fichier) return
    if ('fini' in issue) {
      const apres = { ...present.contenu, fichier: issue.fini } as C
      magasin.corriger([{ type: 'contenu', id: element.id, avant: present.contenu, apres }])
    } else {
      magasin.corriger([{ type: 'supprimer', element: present }])
      annoncer({ texte: issue.echec })
    }
    // `cle` résume l'issue : l'effet ne rejoue que quand elle change.
  }, [cle, fichier, element.id])

  // La copie locale tant que la vraie adresse n'est pas là : l'image ne clignote pas au passage.
  return { adresse: envoi?.local && !adresse ? envoi.local : adresse, enRoute: enEnvoi(fichier) && !envoi?.echec }
}
