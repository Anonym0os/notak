import type { FormatCellule, PassageCellule, RicheCellule } from '../../coeur/tableau'

/**
 * Le texte riche partiel d'une cellule : des passages (gras, italique, barré, lien, couleur, surlignage) posés sur
 * un texte qui reste du texte simple. Tout se calcule caractère par caractère : une cellule tient en 2 000
 * caractères au plus, et le découpage en passages n'est jamais que la compression de ce tableau.
 */

export type MarqueBooleenne = 'gras' | 'italique' | 'barre'

/** Ce que porte un caractère. Une clé absente n'est pas posée. */
export interface Marque {
  gras?: true
  italique?: true
  barre?: true
  lien?: string
  couleur?: string
  surligne?: string
}

export const MARQUES: readonly (keyof Marque)[] = ['gras', 'italique', 'barre', 'lien', 'couleur', 'surligne']

const memeMarque = (a: Marque, b: Marque) => MARQUES.every((k) => a[k] === b[k])
const vide = (m: Marque) => MARQUES.every((k) => m[k] === undefined)

/** Les marques de chaque caractère, d'après les passages (ce qui sort du texte est ignoré). */
export function parCaractere(passages: readonly PassageCellule[], longueur: number): Marque[] {
  const marques: Marque[] = Array.from({ length: longueur }, () => ({}))
  for (const p of passages) {
    for (let i = Math.max(0, p.de); i < Math.min(longueur, p.a); i++) {
      const m = marques[i]!
      for (const k of MARQUES) if (p[k] !== undefined) (m as Record<string, unknown>)[k] = p[k]
    }
  }
  return marques
}

/** Les passages qui disent ces marques : un par suite de caractères qui portent la même chose. */
export function enPassages(marques: readonly Marque[]): PassageCellule[] {
  const sortie: PassageCellule[] = []
  let debut = 0
  for (let i = 1; i <= marques.length; i++) {
    if (i < marques.length && memeMarque(marques[i]!, marques[debut]!)) continue
    const m = marques[debut]
    if (m && !vide(m)) sortie.push({ de: debut, a: i, ...m })
    debut = i
  }
  return sortie
}

/** Les passages remis d'équerre : bornés au texte, sans passage vide, soudés quand ils se touchent et disent la même chose. */
export const normaliser = (passages: readonly PassageCellule[], longueur: number): PassageCellule[] => enPassages(parCaractere(passages, longueur))

/** Des morceaux du texte, chacun avec ses marques, pour le dessiner. */
export interface Morceau extends Marque {
  texte: string
}

export function morceaux(texte: string, passages: readonly PassageCellule[]): Morceau[] {
  const marques = parCaractere(passages, texte.length)
  const sortie: Morceau[] = []
  let debut = 0
  for (let i = 1; i <= texte.length; i++) {
    if (i < texte.length && memeMarque(marques[i]!, marques[debut]!)) continue
    if (i > debut) sortie.push({ ...marques[debut], texte: texte.slice(debut, i) })
    debut = i
  }
  return sortie
}

const borne = (n: number, longueur: number) => Math.min(Math.max(n, 0), longueur)

/** Ce que tous les caractères de `[de, a)` portent en commun (une clé absente : un caractère au moins ne la porte pas). */
export function marquesCommunes(passages: readonly PassageCellule[], longueur: number, de: number, a: number): Marque {
  const d = borne(Math.min(de, a), longueur)
  const f = borne(Math.max(de, a), longueur)
  if (f <= d) return {}
  const marques = parCaractere(passages, longueur).slice(d, f)
  const commun: Marque = {}
  for (const k of MARQUES) {
    const v = marques[0]![k]
    if (v !== undefined && marques.every((m) => m[k] === v)) (commun as Record<string, unknown>)[k] = v
  }
  return commun
}

/** Gras, italique ou barré sur `[de, a)` : tout le passage l'a déjà, on l'ôte ; sinon on le pose partout. */
export function basculer(passages: readonly PassageCellule[], longueur: number, de: number, a: number, nom: MarqueBooleenne): PassageCellule[] {
  const d = borne(Math.min(de, a), longueur)
  const f = borne(Math.max(de, a), longueur)
  if (f <= d) return normaliser(passages, longueur)
  const marques = parCaractere(passages, longueur)
  const actif = marques.slice(d, f).every((m) => m[nom])
  for (let i = d; i < f; i++) {
    if (actif) delete marques[i]![nom]
    else marques[i]![nom] = true
  }
  return enPassages(marques)
}

/** Pose (ou, à `undefined`, ôte) un lien, une couleur ou un surlignage sur `[de, a)`. */
export function poser(
  passages: readonly PassageCellule[],
  longueur: number,
  de: number,
  a: number,
  patch: Partial<Pick<Marque, 'lien' | 'couleur' | 'surligne'>>,
): PassageCellule[] {
  const d = borne(Math.min(de, a), longueur)
  const f = borne(Math.max(de, a), longueur)
  const marques = parCaractere(passages, longueur)
  for (let i = d; i < f; i++) {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete (marques[i] as Record<string, unknown>)[k]
      else (marques[i] as Record<string, unknown>)[k] = v
    }
    // Une couleur de texte et un surlignage s'excluent, comme pour une cellule entière.
    if (patch.couleur !== undefined) delete marques[i]!.surligne
    if (patch.surligne !== undefined) delete marques[i]!.couleur
  }
  return enPassages(marques)
}

/** Une adresse web dans un texte. */
const ADRESSE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi

/**
 * Les adresses du texte deviennent des liens, comme on les détecte à la frappe. Une cellule qui n'est qu'une adresse
 * reste telle quelle : la table la dessine déjà en lien.
 */
export function detecterLiens(texte: string, passages: readonly PassageCellule[]): PassageCellule[] {
  const seule = /^https?:\/\/\S+$/i.test(texte.trim())
  if (seule && passages.length === 0) return []
  const marques = parCaractere(passages, texte.length)
  for (const m of texte.matchAll(ADRESSE)) {
    const debut = m.index!
    for (let i = debut; i < debut + m[0].length; i++) if (marques[i]!.lien === undefined) marques[i]!.lien = m[0]
  }
  return enPassages(marques)
}

/**
 * Le texte riche à ranger avec la cellule : `undefined` quand il ne reste aucun passage. Une cellule qui n'est qu'une
 * adresse sans autre mise en forme n'en garde pas non plus.
 */
export function richeDe(texte: string, passages: readonly PassageCellule[]): RicheCellule | undefined {
  const propres = normaliser(detecterLiens(texte, normaliser(passages, texte.length)), texte.length)
  return propres.length > 0 ? { texte, passages: propres } : undefined
}

/** Les passages d'une cellule, s'ils sont encore ceux de son texte ; sinon aucun (le texte a changé depuis). */
export function passagesDe(format: FormatCellule | null | undefined, texte: string): PassageCellule[] {
  const r = format?.riche
  return r && r.texte === texte ? r.passages : []
}

/** Une cellule peut-elle porter du texte riche ? Ni formule, ni type autre que le texte (nombre, date, case…). */
export const peutEtreRiche = (format: FormatCellule | null | undefined, texte: string): boolean =>
  !texte.startsWith('=') && (format?.type === undefined || format.type === 'texte')

/** Le format avec ce texte riche (ou sans, à `undefined`). */
export function avecRiche(format: FormatCellule | null, riche: RicheCellule | undefined): FormatCellule | null {
  if (!format && !riche) return null
  const { riche: _, ...reste } = format ?? {}
  const sortie: FormatCellule = riche ? { ...reste, riche } : reste
  return Object.keys(sortie).length ? sortie : null
}
