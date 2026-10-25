/**
 * Le rangement des blocs à plat (docs/NOTION.md § 1) : de la suite des blocs d'un conteneur et de leurs retraits, on
 * tire ce que Notion lit dans son arbre. Le parent d'un bloc est le dernier bloc moins en retrait au-dessus de lui ; un
 * retrait qui saute un cran est ramené au cran d'après son voisin. Pur, sans éditeur : la migration et les exports
 * (jusque sur le serveur) s'en servent comme le plugin de `structure.ts`.
 */

/** Ce qu'il faut savoir d'un bloc pour le ranger. */
export interface Ligne {
  type: string
  retrait: number
  /** Dépliant, titre dépliant : ouvert ou fermé. */
  ouvert?: boolean
  /** Un titre dépliant. */
  depliant?: boolean
  /** Le numéro d'où part une liste numérotée qui ne commence pas à 1. */
  depart?: number | null
  /** La couleur du bloc (`bleu`, `bleu-fond`…) : un encadré de couleur la donne au fond de ses enfants. */
  couleur?: string | null
}

export interface Place {
  /** Le retrait corrigé : jamais plus d'un cran sous le bloc d'avant. */
  profondeur: number
  /** L'index du bloc parent dans la suite, ou `null` au premier rang. */
  parent: number | null
  /** Le numéro d'un élément de liste numérotée (`1.`, `a.`, `i.` selon la profondeur). */
  numero: string | null
  /** Caché par un dépliant fermé au-dessus de lui. */
  cache: boolean
  /** L'encadré, la citation les plus proches au-dessus de lui (leurs index), dont il reste dans le cadre. */
  encadre: number | null
  citation: number | null
  /** L'encadré le plus haut au-dessus de lui (son index), et combien d'encadrés l'entourent. */
  encadreRacine: number | null
  encadres: number
  /** Le bloc a des enfants. */
  aEnfants: boolean
  /** Combien d'encadrés se ferment sous lui (il est le dernier bloc visible de leur sous-arbre) ; le plus haut en est. */
  fermes: number
  finEncadre: boolean
  finRacine: boolean
}

/** Un dépliant ou un titre dépliant fermé cache ses enfants. */
export const replie = (l: Ligne) => (l.type === 'depliant' || (l.type === 'heading' && !!l.depliant)) && l.ouvert === false

const ROMAINS: [number, string][] = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
]

const romain = (n: number) => ROMAINS.reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v } return s }, '')

/** `a` … `z`, puis `aa`, `ab`… */
const lettre = (n: number): string => (n <= 26 ? String.fromCharCode(96 + n) : lettre(Math.floor((n - 1) / 26)) + lettre(((n - 1) % 26) + 1))

/** Le numéro d'un élément : chiffres, puis lettres, puis chiffres romains, selon la profondeur (NOTION.md § 2). */
export function numeroter(n: number, profondeur: number): string {
  const rang = profondeur % 3
  return `${rang === 0 ? n : rang === 1 ? lettre(n) : romain(n)}.`
}

/** Range les blocs d'un conteneur. */
export function structurer(lignes: readonly Ligne[]): Place[] {
  const places: Place[] = []
  const pile: number[] = []
  const rang = new Map<number, number>()
  const dernierEnfant = new Map<number, number>()
  let avant = -1
  lignes.forEach((l, i) => {
    const profondeur = Math.max(0, Math.min(Math.floor(l.retrait) || 0, avant + 1))
    while (pile.length && places[pile[pile.length - 1]!]!.profondeur >= profondeur) pile.pop()
    const parent = pile.length ? pile[pile.length - 1]! : null
    const p = parent === null ? null : places[parent]!
    const cache = !!p && (p.cache || replie(lignes[parent!]!))
    // Le numéro suit celui du frère d'avant, s'il est lui aussi numéroté ; tout autre frère le fait repartir de 1 (ou
    // du numéro de départ de l'élément).
    const cle = parent ?? -1
    const frere = dernierEnfant.get(cle)
    let numero: string | null = null
    if (l.type === 'numero') {
      const n = frere !== undefined && lignes[frere]!.type === 'numero' ? rang.get(frere)! + 1 : Math.max(1, Math.floor(l.depart ?? 1))
      rang.set(i, n)
      numero = numeroter(n, profondeur)
    }
    dernierEnfant.set(cle, i)
    if (p) p.aEnfants = true
    places.push({
      profondeur,
      parent,
      numero,
      cache,
      encadre: parent === null ? null : lignes[parent]!.type === 'encadreBloc' ? parent : p!.encadre,
      citation: parent === null ? null : lignes[parent]!.type === 'citation' ? parent : p!.citation,
      encadreRacine: parent === null ? null : (p!.encadreRacine ?? (lignes[parent]!.type === 'encadreBloc' ? parent : null)),
      encadres: parent === null ? 0 : p!.encadres + (lignes[parent]!.type === 'encadreBloc' ? 1 : 0),
      aEnfants: false,
      fermes: 0,
      finEncadre: false,
      finRacine: false,
    })
    pile.push(i)
    avant = profondeur
  })
  // Chaque encadré qui a des enfants se ferme sous le dernier bloc visible de son sous-arbre (NOTION.md § 2) : un même
  // bloc peut en fermer plusieurs, l'encadré imbriqué et celui qui l'entoure.
  places.forEach((p, i) => {
    if (lignes[i]!.type !== 'encadreBloc' || !p.aEnfants) return
    let fin = finDuSousArbre(places, i) - 1
    while (fin > i + 1 && places[fin]!.cache) fin--
    const f = places[fin]!
    f.fermes++
    f.finEncadre = true
    if (p.encadreRacine === null) f.finRacine = true
  })
  return places
}

/** La fin du sous-arbre du bloc `i` (exclue) : le premier bloc d'après qui n'est pas plus profond que lui. */
export function finDuSousArbre(places: readonly Place[], i: number): number {
  let j = i + 1
  while (j < places.length && places[j]!.profondeur > places[i]!.profondeur) j++
  return j
}

