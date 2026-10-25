import type { EtatItem } from '../modele/diapositives'
import { DUREE_BASE, type Effet } from '../modele/gabarits'
import { COURBES, RYTHME, courbeVive } from '../modele/rythme'
import { choregraphie } from './choregraphies'
import { dureeImposee } from './courbes'
import { ANIMATIONS_DE_DECOR, type AnimationDeDecor, type DureeDecor } from './decor'
import { type Mot, type Rect, type Trace, type Transfo, IMMOBILE, apparierDecors, apparierUnites, deplacement, horsChamp, melanger, sortDImage, union } from './morphing'

/**
 * Les transitions du mode Pitch (docs/XMIND.md § 12, relevé 10 § 7, relevé 12 § 8.3) : d'une diapositive à la suivante,
 * le fondu (`dissolve`), l'interpolation dans la diapositive (`animateInSlide`) et le morphing (`magicMove`), avec les
 * entrées propres à chaque gabarit et les décors du thème.
 *
 * Tout ici est pur : on part de deux instantanés (ce que `jouer.ts` a mesuré des deux diapositives montées côte à côte),
 * on en tire un plan, une liste de pistes datées. Chaque piste mène un élément de valeurs de départ à des valeurs
 * d'arrivée sur une courbe ; les valeurs d'arrivée sont toujours l'état naturel de la diapositive cible, si bien qu'à la
 * fin il suffit d'effacer ce qu'on a posé. `jouer.ts` confie le temps à anime.js.
 */

/** Le genre d'une boîte : du texte (morphing par unités), une forme (tracé), une image, ou autre chose (glissement). */
export type Genre = 'texte' | 'forme' | 'image' | 'bloc'

/** Une boîte `data-boite` telle qu'on l'a mesurée, en px de base. */
export interface VueBoite {
  /** La référence de l'élément pour `jouer.ts`. */
  ref: string
  /** `<sujet>:<rôle>`, le même d'une diapositive à l'autre ; `#2`, `#3`… si la clé revient dans la diapositive. */
  cle: string
  genre: Genre
  rect: Rect
  /** L'opacité qu'on voit : celle de la boîte multipliée par celles de ses ancêtres dans la diapositive. */
  opacite: number
  /** La part de la boîte qu'on voit (rognée par la diapositive et les zones qui défilent). */
  visible: number
  couleur?: string
  /** Un texte : ses mots. */
  mots?: Mot[]
  /** Une forme : ses tracés. */
  traces?: Trace[]
  /** Une image : sa source (`''` pour un emplacement vide). */
  image?: string
  /** L'image couvre la diapositive (`full`). */
  fond?: boolean
  etat?: EtatItem
}

/** Un décor de forme du thème (`[data-decor][data-rang]`) : un groupe placé, un groupe tourné et mis à l'échelle. */
export interface VueDecor {
  ref: string
  /** Le groupe intérieur (rotation, échelle). */
  interne: string
  nom: string
  rang: number
  t: Transfo
  rect: Rect
  opacite: number
}

/** Une bande de couleur (`[data-decor="bande"]`). */
export interface VueBande {
  ref: string
  rect: Rect
}

/** Un élément trouvé par un sélecteur d'`ANIMATIONS_DE_DECOR`. */
export interface VueElement {
  ref: string
  rect: Rect
  /** Un groupe de décor : sa place. */
  t?: Transfo
  /** Un tracé : `pathLength` vaut 1 (sinon on mesure sa longueur). */
  unitaire?: boolean
}

export interface Instantane {
  /** La taille de base de la diapositive. */
  l: number
  h: number
  theme: string
  /** L'identifiant du sujet de la diapositive (`data-sujet`). */
  sujet: string
  type: 'sujet' | 'liste' | 'resume' | 'fin'
  gabarit: string
  niveau?: string
  /** Une liste : sa première étape. */
  premiere?: boolean
  /** Un résumé : on y entre ou on en sort. */
  moment?: 'entree' | 'sortie'
  boites: VueBoite[]
  decors: VueDecor[]
  bandes: VueBande[]
  /** Pour chaque sélecteur d'`ANIMATIONS_DE_DECOR` du thème, les éléments qu'il trouve dans le décor. */
  correspondances: Record<string, VueElement[]>
}

/** Ce qu'une piste fait varier. Les translations et échelles se posent en `transform`, origine au coin haut gauche. */
export type Propriete =
  | 'opacite'
  | 'x'
  | 'y'
  | 'sx'
  | 'sy'
  | 'couleur'
  | 'fond'
  /** La part dessinée d'un trait, de 0 à 1. */
  | 'dessin'
  /** L'avancée d'un tracé copié de sa forme source à sa forme cible, de 0 à 1. */
  | 'morph'
  /** Les attributs d'un décor : son centre, sa rotation et son échelle (`sx`, `sy` sur le groupe intérieur). */
  | 'cx'
  | 'cy'
  | 'rotation'
  /** Les attributs d'une bande : x, y, largeur, hauteur. */
  | 'bx'
  | 'by'
  | 'bl'
  | 'bh'

export type Valeurs = Partial<Record<Propriete, number | string>>

/** `source`, `cible` : les éléments des deux diapositives ; `calque` : les copies posées pour le morphing. */
export type Cote = 'source' | 'cible' | 'calque'

/**
 * Les références réservées : `cadre` (toute la diapositive), `contenu` et `decor` (ses deux couches) ; les autres sont
 * celles des instantanés, ou `copie:<n>` pour une copie.
 */
export interface Piste {
  cote: Cote
  ref: string
  de: Valeurs
  a: Valeurs
  /** En ms depuis le début de la transition. */
  debut: number
  duree: number
  /** Un nom de courbe d'anime.js 3 (`courbes.ts`). */
  courbe: string
}

/** Une copie que le morphing pose par-dessus la cible : des mots d'une boîte de texte, ou un tracé qui se transforme. */
export type Copie =
  | { id: string; genre: 'mots'; cote: 'source' | 'cible'; boite: string; mots: number[]; rect: Rect; opacite: number }
  | { id: string; genre: 'trace'; de: Trace; a: Trace }

export interface Minutage {
  /** Les animations de sortie de la source (`preTransition`). */
  avant: number
  /** L'effet, avec les animations d'étape `transition`, de `avant` à `avant + effet`. */
  pendant: number
  /** Les animations d'entrée de la cible (`postTransition`), après l'effet. */
  apres: number
  total: number
}

export interface Plan {
  effet: Effet
  minutage: Minutage
  pistes: Piste[]
  /** Les éléments masqués tout du long (leur copie, ou leur partenaire, les remplace). */
  caches: { cote: 'source' | 'cible'; ref: string }[]
  copies: Copie[]
  /** Le fond de la cible s'efface pour laisser voir la source dessous (même thème, même fond). */
  fondTransparent: boolean
}

/** Les trois temps : la sortie, l'effet, l'entrée, à la suite (relevé 10 § 7.2). */
export const minutage = (avant: number, effet: number, apres: number): Minutage => ({ avant, pendant: effet, apres, total: avant + effet + apres })

/** Ce qu'une phase fait, avant d'être datée : des pistes à partir de 0. */
export interface Phase {
  pistes: Piste[]
  /** Les boîtes de la cible qu'elle anime : l'effet les laisse à leur place. */
  reclamees: Set<string>
}

const fin = (p: Piste) => p.debut + p.duree
const duree = (pistes: readonly Piste[]) => pistes.reduce((m, p) => Math.max(m, fin(p)), 0)
const decaler = (pistes: readonly Piste[], de: number) => pistes.map((p) => ({ ...p, debut: p.debut + de }))

/** Une piste ; la durée d'un ressort est la sienne, pas celle demandée. */
export const piste = (cote: Cote, ref: string, de: Valeurs, a: Valeurs, debut: number, d: number, courbe: string): Piste => ({ cote, ref, de, a, debut, duree: dureeImposee(courbe, d), courbe })

const VIDE = (effet: Effet): Plan => ({ effet, minutage: minutage(0, 0, 0), pistes: [], caches: [], copies: [], fondTransparent: false })

/**
 * Le plan d'une transition. Rien pour l'effet nul (reculer, l'animation coupée). Les entrées des gabarits ne se jouent
 * que si l'effet le permet (pas en remontant au parent).
 */
export function planifier(effet: Effet, source: Instantane | null, cible: Instantane | null): Plan {
  if (effet.nom === 'aucun' || effet.duree <= 0 || !cible) return VIDE(effet)
  const chore = effet.animationsDiapo ? choregraphie(cible, source) : { pendant: { pistes: [], reclamees: new Set<string>() }, apres: { pistes: [], reclamees: new Set<string>() } }
  const reclamees = new Set([...chore.pendant.reclamees, ...chore.apres.reclamees])
  const corps = effet.nom === 'fondu' || !source ? fondu(effet.duree, source, cible) : interpolation(effet, source, cible, reclamees)
  const avant = 0
  // Les entrées « après l'effet » partent avant sa fin, quand il ralentit : rien n'attend que l'autre ait fini.
  const relance = avant + effet.duree * RYTHME.chevauchement
  const pistes = [...decaler([...corps.pistes, ...chore.pendant.pistes], avant), ...decaler(chore.apres.pistes, relance)]
  // L'effet dure ce qu'il dure ; une piste qui déborde (un ressort, une entrée échelonnée) allonge la transition.
  const total = Math.max(avant + effet.duree, duree(pistes))
  return { effet, minutage: { avant, pendant: effet.duree, apres: total - avant - effet.duree, total }, pistes, caches: corps.caches, copies: corps.copies, fondTransparent: !!source }
}

interface Corps {
  pistes: Piste[]
  caches: Plan['caches']
  copies: Copie[]
}

/** La valeur d'une durée d'`ANIMATIONS_DE_DECOR` pour une transition de durée d ; celles en ms suivent notre rythme. */
const ms = (x: DureeDecor, d: number) => (typeof x === 'number' ? x * RYTHME.facteur : x.fois * d)

const entreesDuTheme = (theme: string, quand: AnimationDeDecor['quand']) => ANIMATIONS_DE_DECOR.filter((a) => a.theme === theme && a.quand === quand)

// — dissolve (`314 · 45163`) —

/**
 * Le fondu : la source s'efface sur les trois cinquièmes de la durée, la cible paraît à partir du quart ; les deux
 * textes ne se superposent qu'un instant, déjà pâles. Xmind fond les deux sur toute la durée, la cible en easeInQuad :
 * on lit deux textes l'un sur l'autre, et rien ne paraît d'abord. Si le thème anime l'entrée de ses décors, ils jouent
 * leur partition (tracés qui se dessinent, formes qui grandissent, formes qui arrivent du coin le plus proche) ; une
 * animation du contenu (Midnight Rose) remplace son fondu.
 */
export function fondu(d: number, source: Instantane | null, cible: Instantane): Corps {
  const pistes: Piste[] = []
  // La cible paraît après la source quand il y en a une ; seule, tout de suite.
  const [debut, longueur] = source ? [0.25 * d, 0.75 * d] : [0, d]
  if (source) {
    pistes.push(piste('source', 'contenu', { opacite: 1 }, { opacite: 0 }, 0, 0.6 * d, COURBES.sortie))
    pistes.push(piste('source', 'decor', { opacite: 1 }, { opacite: 0 }, 0, 0.6 * d, COURBES.sortie))
  } else {
    // Rien dessous : c'est toute la diapositive qui paraît, son fond compris.
    pistes.push(piste('cible', 'cadre', { opacite: 0 }, { opacite: 1 }, 0, d, COURBES.entree))
  }
  const entrees = entreesDuTheme(cible.theme, 'entree')
  const duContenu = entrees.find((a) => a.cible === 'contenu')
  if (duContenu) pistes.push(piste('cible', 'contenu', { opacite: Number(duContenu.de) }, { opacite: Number(duContenu.a) }, ms(duContenu.delai, d), ms(duContenu.duree, d), courbeVive(duContenu.courbe)))
  else pistes.push(piste('cible', 'contenu', { opacite: 0 }, { opacite: 1 }, debut, longueur, COURBES.entree))
  const decors = entrees.filter((a) => a.cible !== 'contenu')
  if (!decors.length) pistes.push(piste('cible', 'decor', { opacite: 0 }, { opacite: 1 }, debut, longueur, COURBES.entree))
  for (const a of decors) {
    for (const e of cible.correspondances[a.cible] ?? []) {
      const p = pisteDeDecor(a, e, d, cible)
      if (p) pistes.push(p)
    }
  }
  return { pistes, caches: [], copies: [] }
}

/** Une entrée de décor appliquée à un élément trouvé (relevé 12 § 8.3). */
export function pisteDeDecor(a: AnimationDeDecor, e: VueElement, d: number, c: Pick<Instantane, 'l' | 'h'>): Piste | null {
  const debut = ms(a.delai, d)
  const longueur = ms(a.duree, d)
  const courbe = courbeVive(a.courbe)
  const t = e.t
  switch (a.propriete) {
    case 'opacity':
      return piste('cible', e.ref, { opacite: Number(a.de) }, { opacite: Number(a.a) }, debut, longueur, courbe)
    case 'strokeDashoffset':
      // Le décalage va de 1 à 0 : la part dessinée, de 0 à 1.
      return piste('cible', e.ref, { dessin: 1 - Number(a.de) }, { dessin: 1 - Number(a.a) }, debut, longueur, courbe)
    case 'rotate':
      return t ? piste('cible', e.ref, { rotation: t.rotation + Number(a.de) }, { rotation: t.rotation + Number(a.a) }, debut, longueur, courbe) : null
    case 'scale':
      return t ? piste('cible', e.ref, { sx: t.sx * Number(a.de), sy: t.sy * Number(a.de) }, { sx: t.sx * Number(a.a), sy: t.sy * Number(a.a) }, debut, longueur, courbe) : null
    case 'translate': {
      if (!t) return null
      const h = horsChamp(e.rect, c.l, c.h)
      return piste('cible', e.ref, { cx: t.cx + h.dx, cy: t.cy + h.dy }, { cx: t.cx, cy: t.cy }, debut, longueur, courbe)
    }
    default:
      return null
  }
}

// — animateInSlide (`314 · 52641`) et magicMove (`314 · 1988`) —

/** La cible prend la place et l'allure de la source, puis revient à elle : ce qui pose la boîte `c` sur la boîte `s`. */
const depuis = (c: Rect, s: Rect, uniforme = false): Valeurs => {
  const m = deplacement(c, s, uniforme)
  return { x: m.x, y: m.y, sx: m.sx, sy: m.sy }
}
const naturel: Valeurs = { x: IMMOBILE.x, y: IMMOBILE.y, sx: IMMOBILE.sx, sy: IMMOBILE.sy }

/**
 * L'interpolation d'une diapositive à l'autre. Dans la diapositive (`dans-la-diapo`) : chaque boîte commune glisse de
 * sa place à la nouvelle et prend son opacité et sa couleur ; les autres se fondent. Le morphing découpe en plus les
 * textes en unités, transforme les tracés, croise les images. Dans les deux cas, ce qui n'a pas de partenaire s'efface
 * sur les deux premiers cinquièmes et ce qui arrive paraît ensuite : les deux ne se lisent jamais ensemble.
 */
export function interpolation(effet: Effet, source: Instantane, cible: Instantane, reclamees: ReadonlySet<string>): Corps {
  const d = effet.duree
  const morphing = effet.nom === 'morphing'
  const courbe = morphing ? COURBES.morphing : COURBES.glisse
  const pistes: Piste[] = []
  const caches: Plan['caches'] = []
  const copies: Copie[] = []
  let n = 0
  const nouvelle = () => `copie:${n++}`
  // Ce qui part s'efface vite, avant que ce qui glisse ne passe dessus.
  const sortie = (ref: string, o: number) => pistes.push(piste('source', ref, { opacite: o }, { opacite: 0 }, 0, 0.4 * d, COURBES.sortie))
  const entree = (cote: Cote, ref: string, o: number) => pistes.push(piste(cote, ref, { opacite: 0 }, { opacite: o }, 0.4 * d, 0.6 * d, COURBES.entree))
  const parCle = new Map(source.boites.map((b) => [b.cle, b]))
  const vues = new Set<string>()

  for (const c of cible.boites) {
    if (reclamees.has(c.cle)) continue
    const s = parCle.get(c.cle)
    if (!s || s.opacite <= 0.001 || c.opacite <= 0.001) {
      if (c.opacite > 0.001) entree('cible', c.ref, c.opacite)
      continue
    }
    vues.add(c.cle)
    if (morphing && c.genre === 'texte' && s.genre === 'texte' && s.mots?.length && c.mots?.length) {
      caches.push({ cote: 'source', ref: s.ref }, { cote: 'cible', ref: c.ref })
      morphingDeTexte(s, c, d, nouvelle, pistes, copies)
      continue
    }
    if (morphing && c.genre === 'forme' && s.genre === 'forme' && s.traces?.length && c.traces?.length) {
      caches.push({ cote: 'source', ref: s.ref }, { cote: 'cible', ref: c.ref })
      morphingDeForme(s, c, d, nouvelle, pistes, copies)
      continue
    }
    if (morphing && c.genre === 'image' && s.genre === 'image') {
      const sort = sortDImage({ image: s.image ?? '', visible: s.visible, opacite: s.opacite }, { image: c.image ?? '', visible: c.visible, opacite: c.opacite })
      if (sort === 'glisse') {
        caches.push({ cote: 'source', ref: s.ref })
        pistes.push(piste('cible', c.ref, { ...depuis(c.rect, s.rect, true), opacite: s.opacite }, { ...naturel, opacite: c.opacite }, 0, d, courbe))
      } else if (sort === 'croise') {
        // Les deux se déplacent ; la source s'efface (sur la moitié si c'est un emplacement), la cible paraît.
        const vide = (x: VueBoite) => !x.image
        pistes.push(piste('source', s.ref, { ...naturel, opacite: s.opacite }, { ...depuis(s.rect, c.rect, true) }, 0, d, courbe))
        pistes.push(piste('source', s.ref, { opacite: s.opacite }, { opacite: 0 }, 0, vide(s) ? d / 2 : d, COURBES.relais))
        pistes.push(piste('cible', c.ref, { ...depuis(c.rect, s.rect, true) }, { ...naturel }, 0, d, courbe))
        pistes.push(piste('cible', c.ref, { opacite: 0 }, { opacite: c.opacite }, vide(c) ? d / 2 : 0, vide(c) ? d / 2 : d, COURBES.relais))
      } else {
        if (sort !== 'entre') sortie(s.ref, s.opacite)
        else caches.push({ cote: 'source', ref: s.ref })
        if (sort !== 'sort') entree('cible', c.ref, c.opacite)
        else caches.push({ cote: 'cible', ref: c.ref })
      }
      continue
    }
    // Tout le reste glisse, et prend l'opacité et la couleur de la cible.
    caches.push({ cote: 'source', ref: s.ref })
    const de: Valeurs = { ...depuis(c.rect, s.rect), opacite: s.opacite }
    const a: Valeurs = { ...naturel, opacite: c.opacite }
    if (s.couleur && c.couleur && s.couleur !== c.couleur) ((de.couleur = s.couleur), (a.couleur = c.couleur))
    pistes.push(piste('cible', c.ref, de, a, 0, d, courbe))
  }
  for (const s of source.boites) if (!vues.has(s.cle) && s.opacite > 0.001) sortie(s.ref, s.opacite)

  decorsCommuns(effet, source, cible, courbe, pistes, caches)
  return { pistes, caches, copies }
}

/**
 * Le relais de deux exemplaires d'une unité qui change de forme (une graisse, une police, une taille de lettre) : ils se
 * fondent l'un dans l'autre du cinquième aux sept dixièmes du trajet. Xmind les relaie à 300 ms en 0,12 × d (relevé 10
 * § 7.3) : la graisse saute d'un coup sous les yeux.
 */
export const RELAIS = { debut: 0.2, part: 0.5 }

/** L'axe qui part devant quand un texte change de nombre de lignes : `null`, les deux ensemble. */
export type Devant = 'x' | 'y' | null

/**
 * Un texte qui passe à plus de lignes s'ouvre d'abord en hauteur, puis se range en largeur ; à moins de lignes, l'inverse.
 * Avec les deux axes ensemble, les mots d'une ligne qui devient une colonne se resserrent avant de s'écarter, et passent
 * les uns sur les autres.
 */
export const axeDevant = (de: readonly Mot[], a: readonly Mot[]): Devant => {
  const lignes = (m: readonly Mot[]) => new Set(m.map((x) => x.ligne)).size
  const l1 = lignes(de)
  const l2 = lignes(a)
  return l2 > l1 ? 'y' : l2 < l1 ? 'x' : null
}

const AXES = { x: ['x', 'sx'], y: ['y', 'sy'] } as const
const garder = (v: Valeurs, cles: readonly string[]) => Object.fromEntries(Object.entries(v).filter(([k]) => cles.includes(k))) as Valeurs
const sauf = (v: Valeurs, cles: readonly string[]) => Object.fromEntries(Object.entries(v).filter(([k]) => !cles.includes(k))) as Valeurs

/** Un déplacement en arc : l'axe de devant fait les trois quarts du chemin d'abord, l'autre suit d'un quart. */
export function enArc(cote: Cote, ref: string, de: Valeurs, a: Valeurs, d: number, devant: Devant, courbe: string): Piste[] {
  if (!devant) return [piste(cote, ref, de, a, 0, d, courbe)]
  const tete = AXES[devant]
  const queue = AXES[devant === 'x' ? 'y' : 'x']
  const pistes = [piste(cote, ref, garder(de, tete), garder(a, tete), 0, 0.75 * d, courbe), piste(cote, ref, garder(de, queue), garder(a, queue), 0.25 * d, 0.75 * d, courbe)]
  const reste = sauf(a, [...tete, ...queue])
  if (Object.keys(reste).length) pistes.push(piste(cote, ref, sauf(de, [...tete, ...queue]), reste, 0, d, courbe))
  return pistes
}

/**
 * Le texte, unité par unité. Une unité commune glisse et s'étire de sa boîte à l'autre, en arc si le texte change de
 * nombre de lignes ; si sa police change, deux exemplaires (l'ancien, le nouveau) font ce chemin ensemble et se fondent
 * l'un dans l'autre. Une unité seule s'efface sur la première moitié ou paraît à partir des deux cinquièmes.
 */
function morphingDeTexte(s: VueBoite, c: VueBoite, d: number, nouvelle: () => string, pistes: Piste[], copies: Copie[]) {
  const ma = s.mots!
  const mb = c.mots!
  const devant = axeDevant(ma, mb)
  const copie = (cote: 'source' | 'cible', boite: VueBoite, mots: number[]): Copie & { genre: 'mots' } => {
    const rect = union(mots.map((i) => boite.mots![i]!.rect))
    const x: Copie & { genre: 'mots' } = { id: nouvelle(), genre: 'mots', cote, boite: boite.ref, mots, rect, opacite: boite.opacite }
    copies.push(x)
    return x
  }
  for (const u of apparierUnites(ma, mb)) {
    if (u.a && u.b) {
      const A = copie('source', s, u.a)
      const ra = A.rect
      const rb = union(u.b.map((i) => mb[i]!.rect))
      const meme = u.a.every((i, k) => ma[i]!.police === mb[u.b![k] ?? u.b!.length - 1]?.police)
      const couleurA = ma[u.a[0]!]!.couleur
      const couleurB = mb[u.b[0]!]!.couleur
      if (meme) {
        const de: Valeurs = { ...naturel, opacite: s.opacite }
        const a: Valeurs = { ...depuis(ra, rb), opacite: c.opacite }
        if (couleurA !== couleurB) ((de.couleur = couleurA), (a.couleur = couleurB))
        pistes.push(...enArc('calque', A.id, de, a, d, devant, COURBES.morphing))
      } else {
        const B = copie('cible', c, u.b)
        pistes.push(...enArc('calque', A.id, { ...naturel }, { ...depuis(ra, rb) }, d, devant, COURBES.morphing))
        pistes.push(piste('calque', A.id, { opacite: s.opacite }, { opacite: 0 }, RELAIS.debut * d, RELAIS.part * d, COURBES.relais))
        pistes.push(...enArc('calque', B.id, { ...depuis(rb, ra) }, { ...naturel }, d, devant, COURBES.morphing))
        pistes.push(piste('calque', B.id, { opacite: 0 }, { opacite: c.opacite }, RELAIS.debut * d, RELAIS.part * d, COURBES.relais))
      }
    } else if (u.a) {
      pistes.push(piste('calque', copie('source', s, u.a).id, { opacite: s.opacite }, { opacite: 0 }, 0, d / 2, COURBES.sortie))
    } else if (u.b) {
      pistes.push(piste('calque', copie('cible', c, u.b).id, { opacite: 0 }, { opacite: c.opacite }, 0.4 * d, 0.6 * d, COURBES.entree))
    }
  }
}

/** Une forme : chaque tracé devient celui de même rang ; ceux qui restent s'effacent ou paraissent. */
function morphingDeForme(s: VueBoite, c: VueBoite, d: number, nouvelle: () => string, pistes: Piste[], copies: Copie[]) {
  const ta = s.traces!
  const tb = c.traces!
  const n = Math.max(ta.length, tb.length)
  for (let i = 0; i < n; i++) {
    const a = ta[i]
    const b = tb[i]
    const id = nouvelle()
    if (a && b) {
      copies.push({ id, genre: 'trace', de: { ...a, opacite: a.opacite * s.opacite }, a: { ...b, opacite: b.opacite * c.opacite } })
      pistes.push(piste('calque', id, { morph: 0 }, { morph: 1 }, 0, d, COURBES.morphing))
    } else if (a) {
      copies.push({ id, genre: 'trace', de: a, a })
      pistes.push(piste('calque', id, { opacite: s.opacite }, { opacite: 0 }, 0, d / 2, COURBES.sortie))
    } else if (b) {
      copies.push({ id, genre: 'trace', de: b, a: b })
      pistes.push(piste('calque', id, { opacite: 0 }, { opacite: c.opacite }, 0.4 * d, 0.6 * d, COURBES.entree))
    }
  }
}

/**
 * Les décors communs glissent de leur place à la nouvelle (tournent, changent d'échelle et d'opacité), sur d, 1,5 × d
 * pour les bulles de Hubble Bubble ; les autres s'effacent ou paraissent. Les bandes de couleur suivent après 300 ms,
 * en 0,5 × d, sur la courbe du thème.
 */
function decorsCommuns(effet: Effet, source: Instantane, cible: Instantane, courbe: string, pistes: Piste[], caches: Plan['caches']) {
  const d = effet.duree
  const morphing = effet.nom === 'morphing'
  const regles = entreesDuTheme(cible.theme, 'morphing')
  const formes = regles.find((r) => r.cible === '[data-decor][data-rang]')
  const bandes = regles.find((r) => r.cible === '[data-decor="bande"]')
  const dureeForme = morphing && formes ? ms(formes.duree, d) : d
  const courbeForme = morphing && formes ? courbeVive(formes.courbe) : courbe
  const paires = apparierDecors(source.decors, cible.decors)
  const prisA = new Set(paires.map((p) => p[0]))
  const prisB = new Set(paires.map((p) => p[1]))
  for (const [i, j] of paires) {
    const s = source.decors[i]!
    const c = cible.decors[j]!
    caches.push({ cote: 'source', ref: s.ref })
    pistes.push(piste('cible', c.ref, { cx: s.t.cx, cy: s.t.cy, opacite: s.opacite }, { cx: c.t.cx, cy: c.t.cy, opacite: c.opacite }, 0, dureeForme, courbeForme))
    pistes.push(piste('cible', c.interne, { rotation: s.t.rotation, sx: s.t.sx, sy: s.t.sy }, { rotation: c.t.rotation, sx: c.t.sx, sy: c.t.sy }, 0, dureeForme, courbeForme))
  }
  source.decors.forEach((s, i) => prisA.has(i) || pistes.push(piste('source', s.ref, { opacite: s.opacite }, { opacite: 0 }, 0, d / 2, COURBES.sortie)))
  cible.decors.forEach((c, j) => prisB.has(j) || pistes.push(piste('cible', c.ref, { opacite: 0 }, { opacite: c.opacite }, 0.4 * d, 0.6 * d, COURBES.entree)))
  cible.bandes.forEach((c, j) => {
    const s = source.bandes[j]
    if (!s) return void pistes.push(piste('cible', c.ref, { opacite: 0 }, { opacite: 1 }, 0.4 * d, 0.6 * d, COURBES.entree))
    caches.push({ cote: 'source', ref: s.ref })
    const b = (r: Rect): Valeurs => ({ bx: r.x, by: r.y, bl: r.l, bh: r.h })
    if (morphing && bandes) pistes.push(piste('cible', c.ref, b(s.rect), b(c.rect), ms(bandes.delai, d), ms(bandes.duree, d), bandes.courbe))
    else pistes.push(piste('cible', c.ref, b(s.rect), b(c.rect), 0, d, courbe))
  })
  source.bandes.slice(cible.bandes.length).forEach((s) => pistes.push(piste('source', s.ref, { opacite: 1 }, { opacite: 0 }, 0, d / 2, COURBES.sortie)))
}

// — Après la transition : l'animation d'affichage (Hubble Bubble) —

/** Une durée de l'animation d'affichage : elle respire au rythme de Xmind, elle ne retient rien. */
const brut = (x: DureeDecor) => (typeof x === 'number' ? x : x.fois * DUREE_BASE)

/**
 * Les animations qui se jouent chaque fois qu'une diapositive paraît, sans retenir la présentation : les bulles de
 * Hubble Bubble gonflent d'environ 25 px de diamètre en 2 s, puis reviennent (easeInQuart, aller et retour).
 */
export function planAffichage(c: Instantane): Piste[] {
  const pistes: Piste[] = []
  for (const a of entreesDuTheme(c.theme, 'affichage')) {
    if (a.propriete !== 'scale') continue
    const longueur = brut(a.duree)
    for (const e of c.correspondances[a.cible] ?? []) {
      if (!e.t || e.rect.l <= 0) continue
      const k = 1 + 25 / e.rect.l
      const base = { sx: e.t.sx, sy: e.t.sy }
      const gros = { sx: e.t.sx * k, sy: e.t.sy * k }
      pistes.push(piste('cible', e.ref, base, gros, brut(a.delai), longueur, a.courbe))
      // Le retour : la même courbe jouée à l'envers.
      if (a.sens === 'alternate') pistes.push(piste('cible', e.ref, gros, base, brut(a.delai) + longueur, longueur, a.courbe.replace('easeIn', 'easeOut')))
    }
  }
  return pistes
}

// — Ce que l'exécution applique —

/** Les valeurs d'une piste à l'avancée donnée (déjà passée par sa courbe), de 0 (départ) à 1 (arrivée). */
export function valeursA(p: Pick<Piste, 'de' | 'a'>, avancee: number): Valeurs {
  const sortie: Valeurs = {}
  for (const k of Object.keys(p.a) as Propriete[]) {
    const a = p.a[k]!
    const de = p.de[k] ?? a
    sortie[k] = typeof a === 'number' && typeof de === 'number' ? de + (a - de) * avancee : melanger(String(de), String(a), avancee)
  }
  return sortie
}

const cleDe = (p: Pick<Piste, 'cote' | 'ref'>) => `${p.cote}|${p.ref}`

/**
 * L'état de chaque élément avant la première image : pour chaque propriété, le départ de sa première piste. Ce qui
 * paraît après l'effet est ainsi caché dès le début, et rien ne clignote.
 */
export function etatsInitiaux(plan: Pick<Plan, 'pistes' | 'caches'>): Map<string, { cote: Cote; ref: string; valeurs: Valeurs }> {
  const etats = new Map<string, { cote: Cote; ref: string; valeurs: Valeurs }>()
  const prendre = (cote: Cote, ref: string) => {
    const k = cleDe({ cote, ref })
    let e = etats.get(k)
    if (!e) etats.set(k, (e = { cote, ref, valeurs: {} }))
    return e
  }
  for (const c of plan.caches) prendre(c.cote, c.ref).valeurs.opacite = 0
  for (const p of [...plan.pistes].sort((x, y) => x.debut - y.debut)) {
    const e = prendre(p.cote, p.ref)
    for (const k of Object.keys(p.de) as Propriete[]) if (!(k in e.valeurs)) e.valeurs[k] = p.de[k]!
  }
  return etats
}
