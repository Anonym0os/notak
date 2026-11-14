import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import type { Contenu, Element } from '../coeur/tableau'
import { annoncer } from '../avis'
import type { Magasin } from '../coeur/magasin'
import type { ContexteToile, DepotFichiers } from './types'
import { t } from '../langue'
import { typeAffichable } from '../securite'

/**
 * Les fichiers que ce navigateur est en train d'envoyer. L'élément naît tout de suite avec un fichier
 * provisoire (`envoi-…`), montré depuis la copie locale ; une fois le fichier reçu par le serveur, l'élément
 * prend son vrai id. Les autres, qui n'ont pas la copie, voient une roue en attendant.
 */
const PREFIXE = 'envoi-'

/** `local` : la copie qu'on montre en attendant le serveur, absente le temps de la réduire et une fois rendue. */
type Envoi = { local?: string; fini?: string; echec?: string; envoyes?: number; total?: number }
const envois = new Map<string, Envoi>()
/** L'envoi d'où vient chaque copie locale, et le fichier reçu de chaque envoi qui en a encore une. */
const copies = new Map<string, string>()
const recus = new Map<string, string>()
/** Combien d'images montrent la copie locale d'un envoi : tant qu'il y en a, elle reste. */
const vues = new Map<string, number>()
const abonnes = new Set<() => void>()
const prevenir = () => abonnes.forEach((f) => f())
const ecouter = (f: () => void) => {
  abonnes.add(f)
  return () => abonnes.delete(f)
}

export const enEnvoi = (fichier: string) => fichier.startsWith(PREFIXE)

/** Combien d'envois partis d'ici sont encore en route (pour l'en-tête). */
let enRoute = 0
export const envoisEnCours = () => enRoute
export const ecouterEnvois = ecouter

/** Le temps de l'envoi, l'aperçu vient de l'appareil : sous une sorte qui ne s'exécute pas, comme ensuite. */
function poserCopie(id: string, b: Blob) {
  const en = envois.get(id)
  if (!en) return
  const local = URL.createObjectURL(new Blob([b], { type: typeAffichable(b.type) }))
  copies.set(local, id)
  envois.set(id, { ...en, local })
  prevenir()
}

/**
 * La copie locale d'un envoi fini (ou échoué) que plus aucune image ne montre est rendue au navigateur : elle tenait
 * le fichier en mémoire, jusqu'à 25 Mo pour une photo.
 */
function libererSiInutile(id: string) {
  const en = envois.get(id)
  if (!en?.local || (!en.fini && !en.echec) || (vues.get(id) ?? 0) > 0) return
  const { local, ...reste } = en
  URL.revokeObjectURL(local)
  copies.delete(local)
  if (en.fini && recus.get(en.fini) === id) recus.delete(en.fini)
  envois.set(id, reste)
  prevenir()
}
/** Un peu plus tard, dans la même tâche : une image qui se remonte aussitôt (le double rendu de React) la retient d'abord. */
const libererPlusTard = (id: string) => queueMicrotask(() => libererSiInutile(id))

/**
 * Lance l'envoi et rend tout de suite l'id provisoire à mettre dans l'élément. `apercu` : ce qu'il faut montrer à la
 * place du fichier (une photo réduite), qui arrive plus tard ; `null`, ou un échec, montre le fichier lui-même.
 */
export function commencerEnvoi(fichier: Blob, depot: DepotFichiers, options: { apercu?: Promise<Blob | null> } = {}): string {
  const id = PREFIXE + crypto.randomUUID()
  envois.set(id, {})
  if (!options.apercu) poserCopie(id, fichier)
  else {
    const montrer = (apercu: Blob | null) => {
      // Reçu ou perdu entre-temps : plus personne n'attend d'aperçu.
      const en = envois.get(id)
      if (en && !en.fini && !en.echec) poserCopie(id, apercu ?? fichier)
    }
    options.apercu.then(montrer, () => montrer(null))
  }
  enRoute++
  prevenir()
  depot
    .enregistrer(fichier, (envoyes, total) => {
      const en = envois.get(id)
      if (!en || en.fini || en.echec) return
      envois.set(id, { ...en, envoyes, total })
      prevenir()
    })
    .then(
    (fini) => {
      enRoute--
      const en = envois.get(id)!
      // La carte qui prend son vrai fichier garde l'aperçu jusqu'à ce que la vraie image soit là.
      if (en.local) recus.set(fini, id)
      envois.set(id, { ...en, fini })
      prevenir()
      libererPlusTard(id)
    },
    (e: unknown) => {
      enRoute--
      const nom = fichier instanceof File && fichier.name ? t('envois.nomFichier', { nom: fichier.name }) : t('envois.leFichier')
      const cause = e instanceof Error ? e.message : t('envois.impossible')
      envois.set(id, { ...envois.get(id)!, echec: t('envois.echec', { nom, cause: `${cause.charAt(0).toLowerCase()}${cause.slice(1)}` }) })
      prevenir()
      libererPlusTard(id)
    },
  )
  return id
}

/**
 * Tient la copie locale que montre `adresse`, si elle en est une : une image qui l'affiche la garde, et quand la
 * dernière passe à la vraie adresse (ou s'en va), la copie d'un envoi fini est rendue au navigateur. Tenue avant que
 * le navigateur ne peigne : rien ne la rend entre l'image posée et sa lecture.
 */
export function useTenirCopie(adresse: string | null | undefined) {
  useLayoutEffect(() => {
    const id = adresse ? copies.get(adresse) : undefined
    if (!id) return
    vues.set(id, (vues.get(id) ?? 0) + 1)
    return () => {
      const n = (vues.get(id) ?? 1) - 1
      if (n > 0) vues.set(id, n)
      else vues.delete(id)
      libererPlusTard(id)
    }
  }, [adresse])
}

/**
 * Ces éléments, posés sur une toile que personne n'a ouverte (un import depuis la bibliothèque), prennent leur vrai
 * fichier à la fin de l'envoi, ou s'en vont s'il échoue, comme le fait `useFichier` pour un élément dessiné. Si la
 * toile s'ouvre entre-temps, le premier des deux qui voit la fin la pose, l'autre ne trouve plus rien à faire.
 */
export function suivreEnvois(magasin: Magasin, elements: readonly Element[]) {
  const attendus = new Map<string, string>()
  for (const e of elements) {
    const f = (e.contenu as { fichier?: unknown }).fichier
    if (typeof f === 'string' && enEnvoi(f)) attendus.set(f, e.id)
  }
  const voir = () => {
    for (const [fichier, id] of attendus) {
      const en = envois.get(fichier)
      if (!en?.fini && !en?.echec) continue
      attendus.delete(fichier)
      const present = magasin.lire().elements.find((e) => e.id === id)
      if (!present || (present.contenu as { fichier?: unknown }).fichier !== fichier) continue
      if (en.fini) magasin.corriger([{ type: 'contenu', id, avant: present.contenu, apres: { ...present.contenu, fichier: en.fini } as Contenu }])
      else {
        magasin.corriger([{ type: 'supprimer', element: present }])
        annoncer({ texte: en.echec! })
      }
    }
    if (attendus.size === 0) fin()
  }
  const fin = ecouter(voir)
  voir()
}

/** Le vrai fichier d'un envoi parti d'ici, une fois reçu par le serveur ; `undefined` avant, ou s'il n'est pas d'ici. */
export const fichierRecu = (fichier: string): string | undefined => (enEnvoi(fichier) ? envois.get(fichier)?.fini : undefined)

/**
 * La copie locale d'un fichier en cours d'envoi, pour le montrer sans attendre le serveur ; `undefined` s'il n'est pas
 * d'ici, ou si sa copie n'est pas encore prête (une photo qu'on réduit) ou déjà rendue.
 */
export const copieLocale = (fichier: string): string | undefined => (enEnvoi(fichier) ? envois.get(fichier)?.local : undefined)

/** La copie locale d'un envoi parti d'ici, depuis l'id provisoire du fichier ou celui qu'il a reçu, tant qu'elle n'est pas rendue. */
const copieDe = (fichier: string): string | undefined => envois.get(enEnvoi(fichier) ? fichier : (recus.get(fichier) ?? ''))?.local

/** Où en est l'envoi de ce fichier : `null` s'il n'est pas en route, sinon la part envoyée (0 à 1), ou `-1` si on ne la connaît pas. */
export function progressionEnvoi(fichier: string): number | null {
  const e = enEnvoi(fichier) ? envois.get(fichier) : undefined
  if (!e || e.fini || e.echec) return null
  return e.total ? Math.min(1, (e.envoyes ?? 0) / e.total) : -1
}

export const useProgressionEnvoi = (fichier: string): number | null => useSyncExternalStore(ecouter, () => progressionEnvoi(fichier))

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
  // Celle de l'envoi, ou de l'envoi dont l'élément a reçu son fichier : la carte corrigée la montre encore.
  const locale = useSyncExternalStore(ecouter, () => copieDe(fichier))
  const [adresse, setAdresse] = useState<string | null | undefined>(undefined)

  // `reel` suffit : l'élément qui prend son vrai fichier à la fin de l'envoi garde l'adresse déjà trouvée, sans
  // repasser par une carte vide.
  useLayoutEffect(() => {
    let vivant = true
    setAdresse(undefined)
    if (!reel) return // Le fantôme d'un outil, ou un envoi pas encore reçu.
    if (!depot) return setAdresse(null)
    depot.adresse(reel).then(
      (a) => vivant && setAdresse(a),
      () => vivant && setAdresse(null),
    )
    return () => {
      vivant = false
    }
  }, [depot, reel])

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
  const montree = locale && !adresse ? locale : adresse
  useTenirCopie(montree)
  return { adresse: montree, enRoute: enEnvoi(fichier) && !envoi?.echec }
}
