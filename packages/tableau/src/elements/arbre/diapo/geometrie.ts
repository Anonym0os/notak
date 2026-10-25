import { IMAGE_PETITE } from '../modele/gabarits'

/**
 * La géométrie des gabarits de diapositive (relevé 11) : ce qui se calcule sans texte ni dessin. Les positions des
 * arêtes et de la chronologie, la galerie en rangées justifiées, les images contenues ou couvrantes, le défilement qui
 * centre l'élément courant, les pastilles d'étiquettes. Tout est en pixels de base.
 */

export interface Taille {
  l: number
  h: number
}

/** Le décalage d'une zone qui défile pour centrer `centre`, borné entre 0 et (contenu − zone). */
export function defilement(contenu: number, zone: number, centre: number): number {
  if (contenu <= zone) return 0
  return Math.min(contenu - zone, Math.max(0, centre - zone / 2))
}

/** Une image dans une zone, en entier (`contain`) : le plus petit des deux rapports. */
export function contenir(image: Taille, zone: Taille): Taille {
  if (image.l <= 0 || image.h <= 0) return { l: 0, h: 0 }
  const k = Math.min(zone.l / image.l, zone.h / image.h)
  return { l: image.l * k, h: image.h * k }
}

/** Une image qui couvre la zone (`cover`) : le plus grand des deux rapports ; elle déborde, la zone rogne. */
export function couvrir(image: Taille, zone: Taille): Taille {
  if (image.l <= 0 || image.h <= 0) return { ...zone }
  const k = Math.max(zone.l / image.l, zone.h / image.h)
  return { l: image.l * k, h: image.h * k }
}

/** Une image « petite » : moins de 400 px de base de large. */
export const estPetite = (image: Taille): boolean => image.l < IMAGE_PETITE

/** Le rapport largeur / hauteur ; 1 pour une image sans taille. */
export const rapport = (image: Taille): number => (image.l > 0 && image.h > 0 ? image.l / image.h : 1)

// — L'accolade —

/**
 * Le départ du trio [parent][accolade][liste] (relevé 11 § 3) : centré dans le contenu, mais l'accolade ne passe
 * jamais le milieu de la diapositive (on garde le plus petit des deux départs).
 */
export function departTrio(o: { marge: number; contenu: number; largeurDiapo: number; parent: number; accolade: number; liste: number }): number {
  const centre = o.marge + (o.contenu - (o.parent + o.accolade + o.liste)) / 2
  return Math.min(centre, o.largeurDiapo / 2 - o.parent - o.accolade)
}

/**
 * L'écart entre les éléments d'une liste à accolade : au moins `minimum` ; une liste plus courte que sa zone s'écarte
 * pour la remplir (le reste partagé entre les n − 1 intervalles, en trois pour deux éléments).
 */
export function ecartAccolade(hauteurs: readonly number[], zone: number, minimum: number): number {
  const n = hauteurs.length
  if (n < 2) return Math.max(0, minimum)
  const texte = hauteurs.reduce((a, b) => a + b, 0)
  const reste = zone - texte
  const reparti = n === 2 ? reste / 3 : reste / (n - 1)
  return Math.max(Math.max(0, minimum), reparti)
}

// — L'arête de poisson et la chronologie —

export interface Arete {
  /** Le départ sur l'épine, depuis le bord gauche de la zone des arêtes. */
  x: number
  haut: boolean
  colonne: number
  /** Le bout de l'arête, depuis son départ : vers la droite, et vers le haut (au-dessus) ou le bas. */
  dx: number
  dy: number
}

/**
 * Les arêtes (relevé 11 § 9) : l'élément n est dans la colonne ⌊n/2⌋, au-dessus si n est pair ; son départ est à
 * `debut` + intervalle × colonne, + décalage pour celles du dessous ; chaque arête est un trait de `longueur`, incliné de
 * `angle` degrés sur la verticale, qui s'éloigne de l'épine vers la droite.
 */
export function aretes(n: number, o: { debut: number; intervalle: number; decalageBas: number; longueur: number; angle: number }): Arete[] {
  const a = (o.angle * Math.PI) / 180
  const dx = o.longueur * Math.sin(a)
  const dy = o.longueur * Math.cos(a)
  return Array.from({ length: n }, (_, i) => {
    const colonne = Math.floor(i / 2)
    const haut = i % 2 === 0
    return { x: o.debut + o.intervalle * colonne + (haut ? 0 : o.decalageBas), haut, colonne, dx, dy }
  })
}

export interface Jalon {
  /** Le point sur l'axe, depuis le bord gauche de la zone de l'axe. */
  x: number
  haut: boolean
  colonne: number
}

/**
 * Les jalons de la chronologie (relevé 11 § 11) : en alternance haut (pairs) et bas (impairs) ; le point est à
 * `debut` + (C + O) × colonne, plus C/2 au-dessus ou C + S au-dessous : ceux du bas tombent entre ceux du haut.
 */
export function jalons(n: number, o: { debut: number; c: number; o: number; s: number }): Jalon[] {
  return Array.from({ length: n }, (_, i) => {
    const colonne = Math.floor(i / 2)
    const haut = i % 2 === 0
    return { x: o.debut + (o.c + o.o) * colonne + (haut ? o.c / 2 : o.c + o.s), haut, colonne }
  })
}

// — La galerie justifiée (relevé 11 § 15) —

export interface CaseGalerie {
  /** L'indice de l'image dans la liste donnée. */
  i: number
  x: number
  y: number
  l: number
  h: number
}

export interface Galerie {
  cases: CaseGalerie[]
  l: number
  h: number
}

const largeurRangee = (rapports: readonly number[], rangee: readonly number[], h: number, ecart: number) => rangee.reduce((s, i) => s + rapports[i]! * h, 0) + (rangee.length - 1) * ecart

/**
 * Les rangées à une hauteur de référence : on ajoute les images dans l'ordre tant que la rangée s'approche de la largeur
 * voulue (l'écart absolu diminue), puis on passe à la suivante.
 */
export function rangees(rapports: readonly number[], largeur: number, ecart: number, reference: number): number[][] {
  const sortie: number[][] = []
  let rangee: number[] = []
  rapports.forEach((_, i) => {
    if (rangee.length === 0) {
      rangee.push(i)
      return
    }
    const avant = Math.abs(largeurRangee(rapports, rangee, reference, ecart) - largeur)
    const apres = Math.abs(largeurRangee(rapports, [...rangee, i], reference, ecart) - largeur)
    if (apres <= avant) rangee.push(i)
    else {
      sortie.push(rangee)
      rangee = [i]
    }
  })
  if (rangee.length) sortie.push(rangee)
  return sortie
}

/** Chaque rangée mise à l'échelle pour remplir exactement la largeur. */
function poser(rapports: readonly number[], decoupe: readonly number[][], largeur: number, ecart: number): Galerie {
  const cases: CaseGalerie[] = []
  let y = 0
  decoupe.forEach((rangee, r) => {
    const somme = rangee.reduce((s, i) => s + rapports[i]!, 0)
    const h = (largeur - (rangee.length - 1) * ecart) / somme
    let x = 0
    for (const i of rangee) {
      const l = rapports[i]! * h
      cases.push({ i, x, y, l, h })
      x += l + ecart
    }
    y += h + (r < decoupe.length - 1 ? ecart : 0)
  })
  return { cases, l: largeur, h: y }
}

/**
 * La galerie : on essaie chaque hauteur de référence (celle où les k premières images rempliraient une rangée, k = 1 … n)
 * et on garde la plus haute disposition qui tient dans la hauteur ; si aucune ne tient, la plus basse, réduite pour
 * tenir (les rangées se centrent alors dans la largeur).
 */
export function galerie(rapports: readonly number[], largeur: number, hauteur: number, ecart: number): Galerie {
  if (rapports.length === 0) return { cases: [], l: 0, h: 0 }
  const essais: Galerie[] = []
  let somme = 0
  rapports.forEach((a, k) => {
    somme += a
    const reference = (largeur - k * ecart) / somme
    if (reference > 0) essais.push(poser(rapports, rangees(rapports, largeur, ecart, reference), largeur, ecart))
  })
  const tiennent = essais.filter((g) => g.h <= hauteur + 1e-6)
  if (tiennent.length) return tiennent.reduce((a, b) => (b.h > a.h ? b : a))
  const basse = essais.reduce((a, b) => (b.h < a.h ? b : a))
  // Réduite : les images rapetissent, les écarts restent ; chaque rangée se recentre.
  const nRangees = new Set(basse.cases.map((c) => c.y)).size
  const k = Math.max(0, (hauteur - (nRangees - 1) * ecart) / (basse.h - (nRangees - 1) * ecart))
  const parRangee = new Map<number, CaseGalerie[]>()
  for (const c of basse.cases) parRangee.set(c.y, [...(parRangee.get(c.y) ?? []), c])
  const cases: CaseGalerie[] = []
  let y = 0
  let large = 0
  for (const rangee of parRangee.values()) {
    const h = rangee[0]!.h * k
    const l = rangee.reduce((s, c) => s + c.l * k, 0) + (rangee.length - 1) * ecart
    large = Math.max(large, l)
    let x = (largeur - l) / 2
    for (const c of rangee) {
      cases.push({ i: c.i, x, y, l: c.l * k, h })
      x += c.l * k + ecart
    }
    y += h + ecart
  }
  return { cases, l: largeur, h: Math.max(0, y - ecart) }
}

// — Les étiquettes (relevé 11 § 0.6) —

export interface Pastille {
  x: number
  y: number
  l: number
}

/**
 * Les pastilles en ligne, avec retour : chacune large de son texte plus ses marges, bornée entre `largeurMin` et la
 * largeur dispo ; `ecart` entre deux, `interligne` entre deux rangées, rangées alignées comme le titre.
 */
export function pastilles(largeurs: readonly number[], o: { largeur: number; largeurMin: number; ecart: number; interligne: number; hauteur: number; centre: boolean }): { pastilles: Pastille[]; l: number; h: number } {
  const bornees = largeurs.map((l) => Math.min(o.largeur, Math.max(o.largeurMin, l)))
  const lignes: number[][] = []
  let ligne: number[] = []
  let x = 0
  bornees.forEach((l, i) => {
    if (ligne.length && x + o.ecart + l > o.largeur) {
      lignes.push(ligne)
      ligne = []
      x = 0
    }
    x += (ligne.length ? o.ecart : 0) + l
    ligne.push(i)
  })
  if (ligne.length) lignes.push(ligne)
  const larg = (li: number[]) => li.reduce((s, i) => s + bornees[i]!, 0) + (li.length - 1) * o.ecart
  const l = Math.max(0, ...lignes.map(larg))
  const sortie: Pastille[] = []
  lignes.forEach((li, r) => {
    let px = o.centre ? (l - larg(li)) / 2 : 0
    for (const i of li) {
      sortie[i] = { x: px, y: r * (o.hauteur + o.interligne), l: bornees[i]! }
      px += bornees[i]! + o.ecart
    }
  })
  return { pastilles: sortie, l, h: lignes.length ? lignes.length * o.hauteur + (lignes.length - 1) * o.interligne : 0 }
}
