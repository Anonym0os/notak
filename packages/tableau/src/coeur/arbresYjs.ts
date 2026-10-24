import type * as Y from 'yjs'

/**
 * Les sujets d'une carte mentale (et ses relations, limites, résumés) vivent hors de l'élément, dans la carte Yjs
 * `arbres`, une entrée par sujet : `<élément>␟<dictionnaire>␟<identifiant>`. Deux personnes qui écrivent au même
 * instant dans deux sujets écrivent deux clés différentes, et Yjs garde les deux ; dans le même sujet, la dernière
 * écriture l'emporte, sujet par sujet. Une entrée à plat plutôt qu'une carte imbriquée par élément : créer une carte
 * imbriquée des deux côtés à la fois en perdrait une.
 *
 * L'élément, dans `elements`, garde le reste de son contenu (`options`, `theme`) et un `sujets` vide, pour que
 * les lecteurs qui ne connaissent pas `arbres` le voient bien formé.
 */

export const NOM_ARBRES = 'arbres'
export const CHAMPS_ARBRE = ['sujets', 'relations', 'limites', 'resumes'] as const
export type ChampArbre = (typeof CHAMPS_ARBRE)[number]
export type Dicos = Partial<Record<ChampArbre, Record<string, unknown>>>

const SEP = '\u001f'

export const cleArbre = (element: string, champ: ChampArbre, id: string) => `${element}${SEP}${champ}${SEP}${id}`

export function decouper(cle: string): [string, ChampArbre, string] | null {
  const morceaux = cle.split(SEP)
  if (morceaux.length !== 3 || !(CHAMPS_ARBRE as readonly string[]).includes(morceaux[1]!)) return null
  return morceaux as [string, ChampArbre, string]
}

/** Les dictionnaires de chaque carte, lus d'un coup dans `arbres` (pour une lecture ponctuelle : l'export, le serveur). */
export function toutLire(arbres: Y.Map<unknown>): Map<string, Dicos> {
  const sortie = new Map<string, Dicos>()
  arbres.forEach((valeur, cle) => {
    const d = decouper(cle)
    if (!d) return
    const [el, champ, id] = d
    const dicos = sortie.get(el) ?? {}
    ;(dicos[champ] ??= {})[id] = valeur
    sortie.set(el, dicos)
  })
  return sortie
}

/**
 * Un index des dictionnaires par carte, tenu à jour à chaque changement de `arbres`. Une carte inchangée garde ses
 * mêmes objets d'une lecture à l'autre (les vues mémorisées sur `sujets` ne se recalculent pas) ; une carte changée
 * reçoit des copies neuves des seuls dictionnaires touchés. À créer avant tout autre observateur de `arbres`.
 */
export function indexerArbres(arbres: Y.Map<unknown>) {
  const index = toutLire(arbres)
  const observer = (e: Y.YMapEvent<unknown>) => {
    const neufs = new Map<string, Dicos>()
    for (const cle of e.keysChanged) {
      const d = decouper(cle)
      if (!d) continue
      const [el, champ, id] = d
      const dicos = neufs.get(el) ?? { ...index.get(el) }
      if (!neufs.has(el)) neufs.set(el, dicos)
      // Copie à l'écriture : seul le dictionnaire touché change d'identité.
      const dico = (dicos[champ] = dicos[champ] === index.get(el)?.[champ] ? { ...dicos[champ] } : (dicos[champ] ?? {}))
      if (arbres.has(cle)) dico[id] = arbres.get(cle)
      else delete dico[id]
    }
    for (const [el, d] of neufs) index.set(el, d)
  }
  arbres.observe(observer)
  return {
    dicos: (element: string): Dicos | undefined => index.get(element),
    /** Les clés de `arbres` qui appartiennent à cette carte. */
    cles(element: string): string[] {
      const d = index.get(element)
      if (!d) return []
      return CHAMPS_ARBRE.flatMap((champ) => Object.keys(d[champ] ?? {}).map((id) => cleArbre(element, champ, id)))
    },
    detruire: () => arbres.unobserve(observer),
  }
}

const estDico = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const pareil = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

/** Le contenu sans ses dictionnaires (ce que garde l'élément), avec un `sujets` vide pour les lecteurs d'avant. */
export function sansDicos<C extends object>(contenu: C): C {
  const reste: Record<string, unknown> = { ...(contenu as Record<string, unknown>) }
  for (const champ of CHAMPS_ARBRE) delete reste[champ]
  reste.sujets = {}
  return reste as C
}

/** Écrit dans `arbres` ce qui change d'un contenu à l'autre, entrée par entrée. À appeler dans une transaction. */
export function ecrireDifference(arbres: Y.Map<unknown>, element: string, avant: object, apres: object) {
  const [a, b] = [avant as Record<string, unknown>, apres as Record<string, unknown>]
  for (const champ of CHAMPS_ARBRE) {
    const de = estDico(a[champ]) ? a[champ] : {}
    const vers = estDico(b[champ]) ? b[champ] : {}
    for (const id of new Set([...Object.keys(de), ...Object.keys(vers)])) {
      if (pareil(de[id], vers[id])) continue
      const cle = cleArbre(element, champ, id)
      if (vers[id] === undefined) arbres.delete(cle)
      else arbres.set(cle, vers[id])
    }
  }
}

/** Les dictionnaires qu'un contenu porte encore en lui-même (une carte écrite avant `arbres`), ou `null`. */
export function dicosEnLigne(contenu: object): Dicos | null {
  const c = contenu as Record<string, unknown>
  const d: Dicos = {}
  for (const champ of CHAMPS_ARBRE) if (estDico(c[champ]) && Object.keys(c[champ]).length > 0) d[champ] = c[champ]
  return Object.keys(d).length > 0 ? d : null
}
