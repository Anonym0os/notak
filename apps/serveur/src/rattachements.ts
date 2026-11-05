import type * as Y from 'yjs'
import { nouvelId, planApres } from './arrivee.ts'
import { normaliserOrigine } from './auth.ts'
import type { ElementLu } from './contenu.ts'

/**
 * Une source de rattachements (`NOTAK_RATTACHEMENTS`) : un autre outil, dont chaque fiche (un client, un projet…) peut
 * avoir son dossier ici. L'outil ouvre `/relier?source=…&cle=…` ; Notak y trouve le dossier de la fiche, ou le crée
 * quand on le lui demande, rangé dans celui de la source. Rien de propre à cet outil n'est écrit dans Notak : seulement
 * ce que dit l'environnement.
 */
export interface SourceRattachement {
  /** Ce que l'outil écrit dans l'adresse, en lettres simples. */
  source: string
  /** Son nom, tel que les gens le lisent (« Ouvrir la fiche dans … »). */
  nom: string
  /** Le titre du dossier qui range ceux de la source. */
  dossier: string
  /** L'origine des fiches : l'adresse de retour doit y être, et seules ses pages lisent un dossier depuis l'outil. */
  origine: string
  /** L'espace où ranger ; absent, l'espace personnel de qui crée. */
  espace?: string
}

const NOM_SOURCE = /^[a-z0-9][a-z0-9-]{0,31}$/
/** La clé d'une fiche dans l'outil (`societe:42`) : courte, et sans rien qui se lise autrement dans une adresse. */
export const CLE_FICHE = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/
const TITRE_MAX = 200

/**
 * Les sources que décrit `NOTAK_RATTACHEMENTS`, une liste JSON. Une entrée illisible est signalée, puis laissée de
 * côté : le reste du serveur démarre.
 */
export function sourcesDe(valeur: string | undefined, signaler: (message: string) => void = console.warn): SourceRattachement[] {
  const brute = valeur?.trim()
  if (!brute) return []
  let liste: unknown
  try {
    liste = JSON.parse(brute)
  } catch {
    signaler('Notak : NOTAK_RATTACHEMENTS n’est pas du JSON : aucun rattachement')
    return []
  }
  if (!Array.isArray(liste)) {
    signaler('Notak : NOTAK_RATTACHEMENTS doit être une liste ([{"source": …}]) : aucun rattachement')
    return []
  }
  const lues = new Map<string, SourceRattachement>()
  for (const [i, e] of liste.entries()) {
    const o = e && typeof e === 'object' ? (e as Record<string, unknown>) : {}
    const champ = (nom: string) => (typeof o[nom] === 'string' ? (o[nom] as string).trim() : '')
    const source = champ('source')
    const origine = normaliserOrigine(champ('origine'))
    const refus = !NOM_SOURCE.test(source)
      ? '« source » en minuscules, chiffres et tirets'
      : !champ('nom')
        ? '« nom » manque'
        : !champ('dossier')
          ? '« dossier » manque'
          : !origine || !/^https?:\/\//.test(origine)
            ? '« origine » doit être une adresse en http(s)'
            : lues.has(source)
              ? `la source « ${source} » est déjà déclarée`
              : null
    if (refus) {
      signaler(`Notak : NOTAK_RATTACHEMENTS, entrée ${i + 1} ignorée : ${refus}`)
      continue
    }
    const espace = champ('espace')
    lues.set(source, {
      source,
      nom: champ('nom').slice(0, 60),
      dossier: champ('dossier').slice(0, TITRE_MAX),
      origine: origine!,
      ...(espace ? { espace } : {}),
    })
  }
  return [...lues.values()]
}

/** Le titre d'un dossier : sans blancs autour, borné, et à défaut la clé de la fiche. */
export const titreDuDossier = (titre: unknown, cle: string) => (typeof titre === 'string' ? titre.trim().slice(0, TITRE_MAX) : '') || cle

/**
 * L'adresse de la fiche, si elle est bien chez l'outil : une autre ferait du lien « Ouvrir la fiche » une porte vers
 * n'importe où. `undefined` : pas d'adresse ; `null` : refusée.
 */
export function adresseDeLaFiche(adresse: unknown, source: SourceRattachement): string | null | undefined {
  if (adresse === undefined || adresse === null || adresse === '') return undefined
  if (typeof adresse !== 'string' || adresse.length > 2000) return null
  try {
    const u = new URL(adresse)
    return u.origin === source.origine ? u.href : null
  } catch {
    return null
  }
}

/** Le document d'une toile neuve qui se montre en dossier : son titre, et la marque du dossier. */
export function ecrireDossierNeuf(doc: Y.Doc, titre: string): void {
  const meta = doc.getMap<unknown>('meta')
  doc.transact(() => {
    meta.set('titre', titre)
    meta.set('dossier', true)
  })
}

/** La largeur d'une carte de toile, celle que pose la bibliothèque (`rangement.ts`). */
const LARGEUR_CARTE = 10

/**
 * Pose sur une toile la carte d'une autre, à droite de ce qu'elle porte déjà (en haut du contenu), au-dessus de tout,
 * comme la bibliothèque le fait de ses dossiers neufs : c'est la carte qui range la toile dans l'autre. Écrite à même
 * le document, comme `poserDansNonTries` : le magasin de la toile ne se charge pas sous Node.
 */
export function poserCarteDeToile(doc: Y.Doc, cible: string, maintenant: number): void {
  const stockes = doc.getMap<ElementLu & { plan?: string }>('elements')
  doc.transact(() => {
    let plan = ''
    const posables: ElementLu[] = []
    stockes.forEach((e) => {
      if (typeof e.plan === 'string' && e.plan > plan) plan = e.plan
      if (!e.parent && e.corbeille === undefined && e.nonTrie === undefined && e.contenu?.type !== 'ligne' && Number.isFinite(e.x) && Number.isFinite(e.y)) posables.push(e)
    })
    const x = posables.length === 0 ? 5 : Math.max(...posables.map((e) => e.x + (Number.isFinite(e.largeur) ? e.largeur : 0))) + 4
    const y = posables.length === 0 ? 5 : Math.min(...posables.map((e) => e.y))
    const id = nouvelId(maintenant)
    stockes.set(id, { id, x, y, largeur: LARGEUR_CARTE, contenu: { type: 'tableau', cible }, plan: planApres(plan) })
  })
}
