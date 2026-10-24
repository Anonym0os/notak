import type { Node as NoeudPM } from '@tiptap/pm/model'
import type { Flanc } from './colonnes'
import { EPAISSEUR_REPERE, type Ligne, PAS_RETRAIT, RETRAIT_DROIT, type Rect } from './glisser'
import { blocsDe } from './modele'

/**
 * Où tombe un bloc qu'on tire (docs/NOTION.md § 8) : les zones de dépôt de Notion, et le repère qui les montre. Pur : il
 * reçoit les lignes mesurées (`glisser.ts`) et le pointeur, et rend l'endroit, ou `null` quand on ne peut pas lâcher.
 *
 * Les blocs étant à plat, une limite entre deux blocs offre autant de niveaux d'imbrication que Notion offre de zones
 * « au-dessous » qui coïncident (le bas d'un parent et le bas de son dernier enfant) ; l'abscisse de la souris choisit
 * le niveau.
 */

/** Une colonne, mesurée : sa rangée, son rang, son cadre et ses blocs. */
export interface ColonneMesuree extends Rect {
  id: string
  rangee: string
  indice: number
  total: number
  /** Les ids de ses blocs, dans l'ordre. */
  blocs: string[]
}

export interface EntreeDepot {
  lignes: readonly Ligne[]
  colonnes: readonly ColonneMesuree[]
  /** La fin de chaque conteneur (la page : `null`) : là où se pose un bloc après le dernier. */
  fins: ReadonlyMap<string | null, number>
  x: number
  y: number
  /** Les sous-arbres tirés, qui ne sont pas des cibles (sauf à copier). */
  tires: readonly { pos: number; fin: number }[]
  /** ⌥ tenu : on copie, et on peut déposer à côté du bloc tiré lui-même. */
  copier: boolean
  /** Le retrait d'un niveau, en px. */
  pas?: number
  /** Les flancs (colonnes) ne sont offerts qu'à qui peut éditer, hors téléphone. */
  flancs?: boolean
}

export interface Repere {
  x: number
  y: number
  largeur: number
  hauteur: number
}

export type Depot =
  /** Entre deux blocs d'un conteneur, au niveau d'imbrication `niveau` ; `voile` : le parent qui reçoit. */
  | { genre: 'entre'; conteneur: string | null; suivant: string | null; ou: number; niveau: number; repere: Repere; voile: Rect | null }
  /** Dans un dépliant fermé, comme dernier enfant, sans l'ouvrir. */
  | { genre: 'dans'; cible: string; ou: number; niveau: number; repere: Repere }
  /** À côté d'un bloc de la page ou d'une colonne : une colonne naît. */
  | { genre: 'flanc'; cible: string; flanc: Flanc; repere: Repere }

/** La tolérance verticale d'une zone au-dessus ou au-dessous, la tranche où un bloc haut reste ciblable, et sa limite à gauche. */
const PORTEE_VERTICALE = 125
const BANDE_BLOC_HAUT = 25
const HAUTEUR_COURTE = 50
const TOLERANCE_GAUCHE = 30
/** La portée d'une zone latérale, dehors comme dedans. */
const PORTEE_FLANC = 200
/** Un bord plus proche que cela l'emporte sur la zone « dessus » d'un dépliant fermé. */
const BORD_PROCHE = 7
/** Des zones latérales à moins de 20 px l'une de l'autre en abscisse : la plus basse (de plus petite hauteur) gagne. */
const GROUPE_FLANC = 20

const dansRect = (r: Rect, x: number, y: number) => x >= r.gauche && x <= r.droite && y >= r.haut && y <= r.bas

const estDepliant = (l: Pick<Ligne, 'type'>) => l.type === 'deroulant' || l.type.startsWith('titreDeroulant')

/**
 * Les niveaux d'imbrication où se pose un bloc entre `avant` et `apres` (du même conteneur) : de celui du bloc d'après
 * (qui garderait ses parents) à celui du bloc d'avant, un de plus s'il peut recevoir un enfant (un dépliant ouvert, ou
 * un bloc qui en a, l'enfant suivant juste après).
 */
export function niveauxEntre(avant: Pick<Ligne, 'niveau' | 'type' | 'ferme'> | null, apres: Pick<Ligne, 'niveau'> | null, avantAEnfants: boolean): number[] {
  const min = apres ? apres.niveau : 0
  if (!avant) return [0]
  const accueille = avantAEnfants || (estDepliant(avant) && !avant.ferme)
  const max = Math.max(min, avant.niveau + (accueille ? 1 : 0))
  return Array.from({ length: max - min + 1 }, (_, i) => min + i)
}

/** Le niveau que l'abscisse choisit : le plus profond dont le bord gauche est à gauche du pointeur, sinon le moins profond. */
export function niveauParX(niveaux: readonly number[], x: number, gaucheDuCadre: number, pas = PAS_RETRAIT): number {
  let choisi = niveaux[0]!
  for (const n of niveaux) if (gaucheDuCadre + n * pas <= x) choisi = n
  return choisi
}

/** Le trait horizontal d'un niveau : de son bord gauche (`pas` par niveau) à la droite du cadre, moins la marge de chaque niveau. */
export function traitDuNiveau(cadre: { gauche: number; droite: number }, niveau: number, y: number, pas = PAS_RETRAIT): Repere {
  const gauche = cadre.gauche + niveau * pas
  return { x: gauche, y, largeur: Math.max(0, cadre.droite - niveau * RETRAIT_DROIT - gauche), hauteur: EPAISSEUR_REPERE }
}

/** Le trait vertical d'un flanc : 4 px de large, à 8 px dehors du bord gauche ou à 4 px dehors du bord droit. */
export function traitDuFlanc(flanc: Flanc, bord: number, haut: number, bas: number): Repere {
  return { x: flanc === 'gauche' ? bord - 8 : bord + 4, y: haut, largeur: EPAISSEUR_REPERE, hauteur: bas - haut }
}

interface ZoneBord {
  ligne: Ligne
  genre: 'dessus' | 'dessous'
  y: number
  priorite: number
}

interface ZoneFlanc {
  /** Le bloc qui sert de cible à `enColonnes`. */
  cible: string
  flanc: Flanc
  /** L'abscisse du bord, l'étendue verticale. */
  bord: number
  haut: number
  bas: number
  priorite: number
  repere: Repere
}

/** Où tombe le bloc : voir le haut du fichier. `null` quand la souris n'est sur aucune zone. */
export function choisirDepot(e: EntreeDepot): Depot | null {
  const pas = e.pas ?? PAS_RETRAIT
  const { x, y } = e
  const tire = (l: Ligne) => !e.copier && e.tires.some((t) => l.pos >= t.pos && l.pos < t.fin)
  // Sur un bloc tiré lui-même (ou l'un de ses enfants), sans ⌥ : aucune zone.
  if (e.lignes.some((l) => tire(l) && dansRect(l, x, y))) return null
  const restantes = e.lignes.filter((l) => !tire(l))
  const parConteneur = new Map<string | null, Ligne[]>()
  for (const l of restantes) {
    const liste = parConteneur.get(l.conteneur) ?? []
    liste.push(l)
    parConteneur.set(l.conteneur, liste)
  }
  const priorite = (l: Ligne) => (l.conteneur === null ? 0 : 1)
  const derniereDeLaPage = parConteneur.get(null)?.at(-1)

  // Les bords : au-dessus et au-dessous de chaque bloc, selon sa hauteur et la distance du pointeur.
  const bords: ZoneBord[] = []
  for (const l of restantes) {
    if (x < l.gauche - TOLERANCE_GAUCHE || x > l.droite) continue
    const h = l.bas - l.haut
    if (Math.abs(y - l.haut) <= PORTEE_VERTICALE && (h <= HAUTEUR_COURTE || y <= l.haut + BANDE_BLOC_HAUT)) bords.push({ ligne: l, genre: 'dessus', y: l.haut, priorite: priorite(l) })
    const sansPlafond = l === derniereDeLaPage && y > l.bas
    if ((sansPlafond || Math.abs(y - l.bas) <= PORTEE_VERTICALE) && (h <= HAUTEUR_COURTE || y >= l.bas - BANDE_BLOC_HAUT)) bords.push({ ligne: l, genre: 'dessous', y: l.bas, priorite: priorite(l) })
  }

  // « Dessus » : le pointeur dans un dépliant fermé.
  const dessus = restantes.filter((l) => estDepliant(l) && l.ferme && dansRect(l, x, y))

  // Les flancs : le bord de chaque bloc du premier niveau de la page (hors rangée), et ceux de chaque colonne.
  const flancs: ZoneFlanc[] = []
  if (e.flancs !== false) {
    for (const l of restantes) {
      if (l.conteneur !== null || l.niveau !== 0 || l.type === 'colonnes' || l.type === 'tableau') continue
      // Le bloc et ses enfants forment un seul rectangle.
      const bas = Math.max(...e.lignes.filter((x2) => x2.pos >= l.pos && x2.pos < l.fin).map((x2) => x2.bas))
      if (y < l.haut || y > bas) continue
      if (Math.abs(x - l.gauche) <= PORTEE_FLANC) flancs.push({ cible: l.id, flanc: 'gauche', bord: l.gauche, haut: l.haut, bas, priorite: 0, repere: traitDuFlanc('gauche', l.gauche, l.haut, bas) })
      if (Math.abs(x - l.droite) <= PORTEE_FLANC) flancs.push({ cible: l.id, flanc: 'droite', bord: l.droite, haut: l.haut, bas, priorite: 0, repere: traitDuFlanc('droite', l.droite, l.haut, bas) })
    }
    for (const c of e.colonnes) {
      if (y < c.haut || y > c.bas) continue
      // La cible : le premier bloc de la colonne qui ne soit pas tiré.
      const cible = c.blocs.find((id) => restantes.some((l) => l.id === id))
      if (!cible) continue
      if (Math.abs(x - c.gauche) <= PORTEE_FLANC) {
        // Entre deux colonnes, le trait se pose au milieu de l'écart.
        const avant = c.indice > 0 ? e.colonnes.find((k) => k.rangee === c.rangee && k.indice === c.indice - 1) : null
        const repere = avant ? { x: (avant.droite + c.gauche) / 2 - EPAISSEUR_REPERE / 2, y: c.haut, largeur: EPAISSEUR_REPERE, hauteur: c.bas - c.haut } : traitDuFlanc('gauche', c.gauche, c.haut, c.bas)
        flancs.push({ cible, flanc: 'gauche', bord: c.gauche, haut: c.haut, bas: c.bas, priorite: 1, repere })
      }
      if (c.indice === c.total - 1 && Math.abs(x - c.droite) <= PORTEE_FLANC) flancs.push({ cible, flanc: 'droite', bord: c.droite, haut: c.haut, bas: c.bas, priorite: 1, repere: traitDuFlanc('droite', c.droite, c.haut, c.bas) })
    }
  }

  // La plus haute priorité d'abord : le conteneur le plus profond.
  const prio = Math.max(-1, ...bords.map((b) => b.priorite), ...flancs.map((f) => f.priorite), ...dessus.map(priorite))
  if (prio < 0) return null
  const bordsP = bords.filter((b) => b.priorite === prio)
  const dessusP = dessus.filter((l) => priorite(l) === prio)
  const proche = bordsP.reduce((m, b) => Math.min(m, Math.abs(b.y - y)), Number.POSITIVE_INFINITY)

  // 1. Dessus, sauf si un bord est à moins de 7 px.
  if (dessusP.length && proche >= BORD_PROCHE) {
    const l = dessusP.reduce((a, b) => ((b.bas - b.haut) * (b.droite - b.gauche) < (a.bas - a.haut) * (a.droite - a.gauche) ? b : a))
    return { genre: 'dans', cible: l.id, ou: l.fin, niveau: l.niveau + 1, repere: { x: l.gauche, y: l.haut, largeur: l.droite - l.gauche, hauteur: l.bas - l.haut } }
  }

  // 2. Les flancs, sauf si un bord a le sien dans leur étendue verticale.
  const flancsP = flancs.filter((f) => f.priorite === prio && !bordsP.some((b) => b.y >= f.haut && b.y <= f.bas))
  if (flancsP.length) {
    const ecart = Math.min(...flancsP.map((f) => Math.abs(x - f.bord)))
    const groupe = flancsP.filter((f) => Math.abs(x - f.bord) <= ecart + GROUPE_FLANC)
    const f = groupe.reduce((a, b) => (b.bas - b.haut < a.bas - a.haut ? b : a))
    return { genre: 'flanc', cible: f.cible, flanc: f.flanc, repere: f.repere }
  }

  // 3. Le bord le plus proche, et son niveau d'imbrication par l'abscisse.
  if (bordsP.length === 0) return null
  const b = bordsP.reduce((a, c) => (Math.abs(c.y - y) < Math.abs(a.y - y) ? c : a))
  const frere = parConteneur.get(b.ligne.conteneur)!
  const i = frere.indexOf(b.ligne)
  const avant = b.genre === 'dessus' ? (frere[i - 1] ?? null) : b.ligne
  const apres = b.genre === 'dessus' ? b.ligne : (frere[i + 1] ?? null)
  const avantAEnfants = !!avant && frere.some((l) => l.parent === avant.id)
  const niveaux = niveauxEntre(avant, apres, avantAEnfants)
  const cadre = b.ligne.cadre
  const niveau = niveauParX(niveaux, x, cadre.gauche, pas)
  const ou = apres ? apres.pos : (e.fins.get(b.ligne.conteneur) ?? b.ligne.fin)
  // Le parent qui reçoit : l'ancêtre d'`avant` un cran moins profond que le niveau choisi.
  let parent: Ligne | null = null
  if (niveau > 0 && avant) {
    let p: Ligne | undefined = avant
    while (p && p.niveau > niveau - 1) p = p.parent ? frere.find((l) => l.id === p!.parent) : undefined
    parent = p ?? null
  }
  let voile: Rect | null = null
  if (parent) {
    const p = parent
    const sousArbre = e.lignes.filter((l) => l.pos >= p.pos && l.pos < p.fin)
    voile = {
      gauche: p.cadre.gauche + p.niveau * pas + 2,
      droite: p.cadre.droite - p.niveau * RETRAIT_DROIT - 2,
      haut: p.haut + 2,
      bas: Math.max(...sousArbre.map((l) => l.bas)) - 2,
    }
  }
  return { genre: 'entre', conteneur: b.ligne.conteneur, suivant: apres?.id ?? null, ou, niveau, repere: traitDuNiveau(cadre, niveau, b.y, pas), voile }
}

/**
 * La position où poser les blocs, relue dans le document au moment du lâcher (il a pu changer depuis la mesure) :
 * avant le bloc suivant, ou à la fin du conteneur ; à la fin du dépliant fermé, pour « dans ». `null` si le bloc a disparu.
 */
export function ouDuDepot(doc: NoeudPM, d: Depot): number | null {
  if (d.genre === 'flanc') return null
  const blocs = blocsDe(doc)
  if (d.genre === 'dans') return blocs.find((b) => b.id === d.cible)?.fin ?? null
  if (d.suivant) return blocs.find((b) => b.id === d.suivant)?.pos ?? null
  if (d.conteneur === null) return doc.content.size
  const colonne = blocs.find((b) => b.id === d.conteneur)
  return colonne ? colonne.fin - 1 : null
}
