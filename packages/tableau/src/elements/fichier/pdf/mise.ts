/**
 * La mise en page de la visionneuse PDF, sans pdf.js : les pages en colonne, celles qu'on dessine, la page courante,
 * les paliers du zoom et le défilement qui garde sous le doigt le même point du document quand l'échelle change.
 */

/** Un point PDF (1/72 de pouce) fait 4/3 de pixel CSS (1/96) : à 100 %, une page a sa taille réelle, comme dans Aperçu. */
export const PX_PAR_POINT = 96 / 72
export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 5
/** Les crans de ⌘+ et ⌘−, ceux d'Aperçu et de Chrome. */
export const PALIERS_ZOOM = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5] as const
/** L'écart entre deux pages et la marge autour de la colonne, en pixels d'écran : ils ne grandissent pas au zoom. */
export const ECART_PAGES = 16
export const MARGE_PAGES = 24
/** Au-delà, une page se dessine moins fine que l'écran : une toile de plus de 8 Mpx coûte cher, surtout sur iPhone. */
export const PIXELS_MAX = 8_000_000

/** La taille d'une page, en points, telle qu'elle se montre (sa rotation comprise). */
export interface TaillePage {
  largeur: number
  hauteur: number
}

/** Les pages posées en colonne à une échelle (pixels par point) : le haut et la taille de chacune, en pixels. */
export interface Disposition {
  hauts: number[]
  largeurs: number[]
  hauteurs: number[]
  /** La hauteur de toute la colonne, marges comprises. */
  total: number
  /** La largeur de la page la plus large, marges comprises : la colonne ne se fait jamais plus étroite. */
  largeur: number
}

export function disposer(tailles: readonly TaillePage[], echelle: number, ecart = ECART_PAGES, marge = MARGE_PAGES): Disposition {
  const hauts: number[] = []
  const largeurs: number[] = []
  const hauteurs: number[] = []
  let y = marge
  let large = 0
  for (const [i, p] of tailles.entries()) {
    if (i > 0) y += ecart
    hauts.push(y)
    largeurs.push(p.largeur * echelle)
    hauteurs.push(p.hauteur * echelle)
    y += p.hauteur * echelle
    large = Math.max(large, p.largeur * echelle)
  }
  return { hauts, largeurs, hauteurs, total: y + marge, largeur: large + 2 * marge }
}

/** La dernière page dont le haut est au-dessus de `y` (0 au-dessus de la première). */
function pageSous(d: Disposition, y: number): number {
  let bas = 0
  let haut = d.hauts.length - 1
  if (haut < 0) return -1
  while (bas < haut) {
    const m = Math.ceil((bas + haut) / 2)
    if (d.hauts[m]! <= y) bas = m
    else haut = m - 1
  }
  return bas
}

/**
 * Les pages à dessiner pour une vue qui commence à `haut` et fait `hauteur` pixels : celles qu'elle touche, et
 * `avance` de plus de chaque côté, pour qu'une page soit prête avant d'entrer dans la vue. Indices à partir de 0 ;
 * `null` sans page.
 */
export function pagesADessiner(d: Disposition, haut: number, hauteur: number, avance = 1): { premiere: number; derniere: number } | null {
  const n = d.hauts.length
  if (n === 0) return null
  let premiere = Math.max(0, pageSous(d, haut))
  // Une vue qui commence dans l'écart sous une page ne la touche plus.
  if (d.hauts[premiere]! + d.hauteurs[premiere]! < haut && premiere < n - 1) premiere++
  const derniere = Math.max(premiere, pageSous(d, haut + Math.max(0, hauteur)))
  return { premiere: Math.max(0, premiere - avance), derniere: Math.min(n - 1, derniere + avance) }
}

/** La page qu'on lit : celle qui occupe le plus de la vue (la première, à égalité). Indice à partir de 0. */
export function pageCourante(d: Disposition, haut: number, hauteur: number): number {
  const tranche = pagesADessiner(d, haut, hauteur, 0)
  if (!tranche) return 0
  let meilleure = tranche.premiere
  let vu = -1
  for (let i = tranche.premiere; i <= tranche.derniere; i++) {
    const part = Math.min(haut + hauteur, d.hauts[i]! + d.hauteurs[i]!) - Math.max(haut, d.hauts[i]!)
    if (part > vu + 0.5) {
      vu = part
      meilleure = i
    }
  }
  return meilleure
}

/** Un point de la colonne (pixels depuis son haut), dit en page et en fraction de sa hauteur : il survit au zoom. */
export function pointDuDocument(d: Disposition, y: number): { page: number; fraction: number } {
  const page = Math.max(0, pageSous(d, y))
  const h = d.hauteurs[page] ?? 0
  return { page, fraction: h > 0 ? (y - (d.hauts[page] ?? 0)) / h : 0 }
}

export const yDuPoint = (d: Disposition, p: { page: number; fraction: number }): number => (d.hauts[p.page] ?? 0) + p.fraction * (d.hauteurs[p.page] ?? 0)

/**
 * Le défilement qui garde le même point du document sous `ancre` (en pixels depuis le coin de la vue) quand on passe
 * de la disposition `avant` à `apres`, ou qui l'amène sous `vers` (les doigts d'un pincement ont bougé). Les pages
 * sont centrées dans une colonne au moins aussi large que la vue.
 */
export function defilementApresZoom(
  defile: { x: number; y: number },
  ancre: { x: number; y: number },
  avant: Disposition,
  apres: Disposition,
  largeurVue: number,
  vers: { x: number; y: number } = ancre,
): { x: number; y: number } {
  const point = pointDuDocument(avant, defile.y + ancre.y)
  const y = yDuPoint(apres, point) - vers.y
  const [l0, l1] = [Math.max(largeurVue, avant.largeur), Math.max(largeurVue, apres.largeur)]
  // Les pages grandissent depuis le milieu de la colonne.
  const rapport = (apres.largeur - 2 * MARGE_PAGES) / Math.max(1, avant.largeur - 2 * MARGE_PAGES)
  const x = l1 / 2 + (defile.x + ancre.x - l0 / 2) * rapport - vers.x
  return { x: Math.max(0, Math.min(l1 - largeurVue, x)), y: Math.max(0, Math.min(apres.total, y)) }
}

export const bornerZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(z) ? z : 1))

/** Le cran suivant (`1`) ou précédent (`-1`) de ce zoom, sans s'arrêter sur un cran qu'on touche presque. */
export function zoomSuivant(z: number, sens: 1 | -1): number {
  const marge = 0.005
  const cran = sens > 0 ? PALIERS_ZOOM.find((p) => p > z + marge) : [...PALIERS_ZOOM].reverse().find((p) => p < z - marge)
  return cran ?? (sens > 0 ? ZOOM_MAX : ZOOM_MIN)
}

/**
 * La largeur (en points) sur laquelle on ajuste : celle que portent le plus de pages, la plus grande à égalité. Une page
 * à l'italienne glissée dans un document en hauteur ne rapetisse pas toutes les autres.
 */
export function largeurUsuelle(tailles: readonly TaillePage[]): number {
  const comptes = new Map<number, number>()
  for (const p of tailles) comptes.set(Math.round(p.largeur), (comptes.get(Math.round(p.largeur)) ?? 0) + 1)
  let meilleure = 0
  let vu = 0
  for (const [l, n] of comptes) if (n > vu || (n === vu && l > meilleure)) [meilleure, vu] = [l, n]
  return meilleure
}

/** Le zoom où une page de cette largeur (en points) prend toute la largeur de la vue, marges comprises. */
export const zoomAjuste = (largeurPage: number, largeurVue: number): number =>
  largeurPage > 0 && largeurVue > 0 ? bornerZoom((largeurVue - 2 * MARGE_PAGES) / (largeurPage * PX_PAR_POINT)) : 1

/** Le zoom d'ouverture : ajusté à la largeur, sans dépasser la taille réelle sur un grand écran. */
export const zoomInitial = (largeurPage: number, largeurVue: number): number => Math.min(1, zoomAjuste(largeurPage, largeurVue))

/** Le zoom en pourcentage, pour la barre. */
export const pourcent = (z: number) => `${Math.round(z * 100)} %`

/** Le numéro de page tapé (« 12 ») ramené entre 1 et `total`, ou `null` s'il n'en est pas un. */
export function lireNumeroPage(saisie: string, total: number): number | null {
  const n = Number.parseInt(saisie.trim(), 10)
  if (!Number.isFinite(n) || total < 1) return null
  return Math.min(total, Math.max(1, n))
}

/**
 * Combien de pixels de toile par pixel d'écran pour dessiner une page de `largeur` × `hauteur` pixels : la densité de
 * l'écran, moins si la toile dépasserait `max` pixels.
 */
export function densiteDeDessin(largeur: number, hauteur: number, dpr: number, max = PIXELS_MAX): number {
  const d = dpr > 0 ? dpr : 1
  const aire = largeur * hauteur
  if (aire <= 0) return d
  return Math.min(d, Math.sqrt(max / aire))
}
