import type { Arbre, Id } from '../../../coeur/tableau'
import { type Boite, type Disposition, type Lien, partager } from '../disposition'
import { coller, extraire } from './insertions'
import { type Lecture, basculerRepli, branche, changerSujet, enfantsDe, lire, rattacher } from './sujets'

/** Où va un sujet qu'on lâche (docs/XMIND.md § 4). */
export type Lacher =
  /** Il devient le dernier enfant de `parent`. */
  | { type: 'enfant'; parent: Id }
  /** Il s'insère parmi les enfants de `parent`, au rang `index` (l'ordre du modèle, sans les sujets glissés). */
  | { type: 'inserer'; parent: Id; index: number }
  /**
   * Il s'insère parmi les principaux d'une carte, **tels qu'on les voit** : du côté `cote` du central, au rang `rang` de
   * la colonne de ce côté, de haut en bas et sans compter les sujets glissés. L'ordre du modèle s'en déduit
   * (`ordreDesPrincipaux`) : il n'est pas celui de l'écran (la gauche se lit de bas en haut en horaire, etc.).
   */
  | { type: 'carte'; parent: Id; cote: CoteCarte; rang: number }
  /** Il reste là où on l'a lâché : un flottant. */
  | { type: 'libre' }

export type CoteCarte = 'droite' | 'gauche'

/** Plus loin que ça de tout sujet, un sujet lâché devient flottant (px de carte). */
export const PORTEE_LACHER = 48

const distance = (b: Boite, p: { x: number; y: number }) => {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.l))
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h))
  return Math.hypot(dx, dy)
}

/**
 * Où lâcher `glisse` quand le pointeur est en `p` (px de carte). Sur un sujet : il en devient l'enfant. Près d'un sujet
 * (à moins de `PORTEE_LACHER`) : il s'insère à côté de lui, avant ou après selon le côté du pointeur. Ailleurs : libre.
 * Jamais dans sa propre branche, ni dans celle d'un `compagnons` (les autres sujets qu'on glisse avec lui).
 *
 * Maj (`inverse`), comme Xmind : un sujet attaché se détache, quelle que soit la cible (il flotte là où on le lâche) ;
 * un flottant, lui, peut alors se rattacher (cf. « Sujet flottant flexible »).
 *
 * Deux réglages de la carte (onglet Carte) y changent : « Sujet flottant flexible » (un flottant glissé ne se rattache
 * à rien, Maj le permet le temps du geste) et « Chevauchement des sujets » (un sujet lâché sur un autre reste là, au
 * lieu d'en devenir l'enfant, sauf avec Maj ; l'insertion à côté d'un frère reste possible).
 */
export function ouLacher(l: Lecture, d: Disposition, glisse: Id, p: { x: number; y: number }, inverse = false, options: Arbre['options'] = {}, compagnons: readonly Id[] = []): Lacher {
  const flottant = l.sujets.get(glisse)?.genre === 'detache'
  if (options?.flottantSouple && flottant) return inverse ? ouLacher(l, d, glisse, p, false, { ...options, flottantSouple: false }, compagnons) : { type: 'libre' }
  const tetes = new Set([glisse, ...compagnons])
  const interdits = new Set([...tetes].flatMap((x) => branche(l, x)))
  let proche: { id: Id; b: Boite; dist: number } | null = null
  for (const [id, b] of d.boites) {
    if (interdits.has(id)) continue
    const dist = distance(b, p)
    if (!proche || dist < proche.dist) proche = { id, b, dist }
  }
  // Chevauchement : sur un sujet, il se pose librement ; l'inverse (Maj) lui rend le rattachement.
  const posable = !!options?.chevauchement && !inverse
  const attache: Lacher | null = !proche
    ? null
    : proche.dist === 0
      ? posable
        ? { type: 'libre' }
        : { type: 'enfant', parent: proche.id }
      : proche.dist <= PORTEE_LACHER
        ? insertionPres(l, d, proche.id, proche.b, p, tetes)
        : null
  // Chevauchement : Maj rend le rattachement qu'il retient d'ordinaire, sur un sujet.
  if (inverse && options?.chevauchement && proche?.dist === 0) return { type: 'enfant', parent: proche.id }
  if (inverse) return flottant && !attache && proche ? { type: 'enfant', parent: proche.id } : { type: 'libre' }
  return attache ?? { type: 'libre' }
}

/** Dans quel sens se lit l'ordre du modèle parmi des frères, à l'écran : vers le bas, vers le haut, ou vers la droite. */
export type Sens = 'bas' | 'haut' | 'droite'

/**
 * Le sens des frères que ce lien relie à leur parent, d'après la forme de la branche que leur structure leur donne :
 * un organigramme et une chronologie horizontale alignent leurs enfants de gauche à droite, les branches d'une
 * chronologie qui pendent vers le haut (un arbre dont les tracés montent) se lisent de bas en haut, le reste de haut en bas.
 */
export function sensDe(lien: Pick<Lien, 'cote' | 'forme'> | undefined): Sens {
  if (!lien) return 'bas'
  if (lien.forme === 'coudee' || (lien.forme === 'droite' && lien.cote === 'droite')) return 'droite'
  return lien.cote === 'haut' ? 'haut' : 'bas'
}

const STRUCTURES_CARTE: ReadonlySet<string> = new Set(['carte', 'carte-libre', 'carte-horaire', 'carte-antihoraire'])

/** Le central range ses principaux des deux côtés (une carte) : leur ordre à l'écran n'est pas celui du modèle. */
const estCarte = (l: Lecture): boolean => STRUCTURES_CARTE.has(l.sujets.get(l.central)?.structure ?? 'carte')

/** Les principaux d'une carte tels qu'on les voit, de haut en bas : [droite, gauche], sans `ecartes`. */
function colonnes(l: Lecture, ecartes: ReadonlySet<Id>): [Id[], Id[]] {
  const [droite, gauche] = partager(l, l.central, enfantsDe(l, l.central))
  return [droite.filter((x) => !ecartes.has(x)), gauche.filter((x) => !ecartes.has(x))]
}

/**
 * S'insérer à côté de `voisin`, avant ou après lui à l'écran selon que le pointeur est avant ou après son milieu. Les
 * principaux d'une carte se raisonnent par côté et par rang à l'écran ; ailleurs, l'index se donne dans l'ordre du
 * modèle, en tenant compte du sens où cette structure le dessine. Près du central, on choisit le côté du pointeur.
 */
function insertionPres(l: Lecture, d: Disposition, voisin: Id, b: Boite, p: { x: number; y: number }, glisses: ReadonlySet<Id>): Lacher {
  const s = l.sujets.get(voisin)
  if (!s || s.genre === 'detache') return { type: 'enfant', parent: voisin }
  if (s.parent === undefined) {
    if (!estCarte(l)) return { type: 'enfant', parent: voisin }
    const cote: CoteCarte = p.x < b.x + b.l / 2 ? 'gauche' : 'droite'
    const colonne = colonnes(l, glisses)[cote === 'droite' ? 0 : 1]
    const rang = colonne.filter((x) => { const bx = d.boites.get(x); return !!bx && bx.y + bx.h / 2 < p.y }).length
    return { type: 'carte', parent: voisin, cote, rang }
  }
  const auDessus = p.y < b.y + b.h / 2
  if (s.parent === l.central && estCarte(l)) {
    const [droite, gauche] = colonnes(l, glisses)
    const cote: CoteCarte = droite.includes(voisin) ? 'droite' : 'gauche'
    const i = (cote === 'droite' ? droite : gauche).indexOf(voisin)
    if (i >= 0) return { type: 'carte', parent: s.parent, cote, rang: auDessus ? i : i + 1 }
    return { type: 'enfant', parent: voisin }
  }
  const freres = enfantsDe(l, s.parent).filter((x) => !glisses.has(x))
  const i = freres.indexOf(voisin)
  const sens = sensDe(d.liens.find((x) => x.de === s.parent && x.vers === voisin))
  const avant = sens === 'droite' ? p.x < b.x + b.l / 2 : sens === 'haut' ? !auDessus : auDessus
  return { type: 'inserer', parent: s.parent, index: avant ? i : i + 1 }
}

/**
 * L'ordre du modèle des enfants du central, et `aDroite` s'il change, pour que `ids` se rangent du côté `cote`, au rang
 * `rang` de sa colonne à l'écran (une seule source de vérité avec le repère de dépôt). On construit les colonnes
 * visibles sans les sujets glissés, on y insère ceux-ci, puis on en déduit l'ordre du modèle selon la structure :
 * équilibrée (droite puis gauche, de haut en bas), horaire (la gauche se lit de bas en haut), antihoraire (la gauche
 * d'abord, la droite de bas en haut), libre (`aDroite` principaux à droite). Quand l'équilibre ⌈n/2⌉ ne tient plus avec
 * le sujet du côté voulu, c'est le voisin de bord de l'autre colonne qui change de côté : le sujet glissé reste là où on
 * l'a lâché.
 */
export function ordreDesPrincipaux(l: Lecture, ids: readonly Id[], cote: CoteCarte, rang: number): { ordre: Id[]; aDroite?: number } {
  const glisses = new Set(ids)
  const [droite, gauche] = colonnes(l, glisses)
  const colonne = cote === 'droite' ? droite : gauche
  const r = Math.max(0, Math.min(rang, colonne.length))
  const avec = [...colonne.slice(0, r), ...glisses, ...colonne.slice(r)]
  const [D, G] = cote === 'droite' ? [avec, gauche] : [droite, avec]
  const structure = l.sujets.get(l.central)?.structure ?? 'carte'
  if (structure === 'carte-libre') return { ordre: [...D, ...G], aDroite: D.length }
  // `premiere` se lit en tête dans le modèle ; `seconde`, à la suite (renversée en horaire et en antihoraire).
  const anti = structure === 'carte-antihoraire'
  let premiere = anti ? G : D
  let seconde = anti ? D : G
  if (structure !== 'carte') seconde = seconde.toReversed()
  const moitie = Math.ceil((D.length + G.length) / 2)
  if (premiere.length > moitie) {
    // Trop de monde en tête : ses derniers (hors sujets glissés) passent devant la suite.
    const passent = premiere.filter((x) => !glisses.has(x)).slice(-(premiere.length - moitie))
    premiere = premiere.filter((x) => !passent.includes(x))
    seconde = [...passent, ...seconde]
  } else if (premiere.length < moitie) {
    const passent = seconde.filter((x) => !glisses.has(x)).slice(0, moitie - premiere.length)
    seconde = seconde.filter((x) => !passent.includes(x))
    premiere = [...premiere, ...passent]
  }
  return { ordre: [...premiere, ...seconde] }
}

/** Les indices de la plus longue suite croissante de `v` (ce qui n'a pas à bouger pour mettre `v` en ordre). */
function suiteCroissante(v: readonly number[]): Set<number> {
  const longueur: number[] = []
  const prec: number[] = []
  let meilleur = -1
  for (let i = 0; i < v.length; i++) {
    longueur[i] = 1
    prec[i] = -1
    for (let j = 0; j < i; j++) if (v[j]! < v[i]! && longueur[j]! + 1 > longueur[i]!) [longueur[i], prec[i]] = [longueur[j]! + 1, j]
    if (meilleur < 0 || longueur[i]! > longueur[meilleur]!) meilleur = i
  }
  const sortie = new Set<number>()
  for (let i = meilleur; i >= 0; i = prec[i]!) sortie.add(i)
  return sortie
}

/**
 * Range les enfants de `parent` dans cet `ordre` en ne réécrivant que le rang de ce qui bouge : les sujets `deplaces`,
 * et ceux qui ont changé de côté pour garder l'équilibre. Le reste garde sa clé (deux personnes écrivent en même temps).
 */
function ranger(a: Arbre, parent: Id, ordre: readonly Id[], deplaces: ReadonlySet<Id>): Arbre {
  const actuels = enfantsDe(lire(a), parent).filter((x) => !deplaces.has(x))
  const voulu = ordre.filter((x) => !deplaces.has(x))
  const stables = suiteCroissante(actuels.map((x) => voulu.indexOf(x)))
  const bougent = new Set(deplaces)
  actuels.forEach((x, i) => {
    if (!stables.has(i)) bougent.add(x)
  })
  let arbre = a
  ordre.forEach((x, i) => {
    if (!bougent.has(x)) return
    const ancre = ordre.slice(i + 1).find((y) => !bougent.has(y))
    arbre = rattacher(arbre, x, parent, rangAvant(arbre, parent, x, ancre))
  })
  return arbre
}

/** Pose le rangement d'un lâcher sur la carte : l'ordre des principaux et, en carte libre, le nombre de ceux de droite. */
function rangerPrincipaux(a: Arbre, central: Id, plan: { ordre: Id[]; aDroite?: number }, deplaces: ReadonlySet<Id>): Arbre {
  const avant = new Set(colonnes(lire(a), new Set())[0])
  let arbre = ranger(a, central, plan.ordre, deplaces)
  if (plan.aDroite !== undefined) arbre = changerSujet(arbre, central, (s) => ({ ...s, aDroite: plan.aDroite }))
  // Un principal qui change de côté perd son décalage libre : posé pour l'autre côté, il le ferait chevaucher le central.
  const apres = new Set(colonnes(lire(arbre), new Set())[0])
  for (const id of plan.ordre) {
    if (avant.has(id) === apres.has(id) || !arbre.sujets[id]?.decalage) continue
    arbre = changerSujet(arbre, id, ({ decalage: _d, ...reste }) => reste)
  }
  return arbre
}

/** Le frère devant lequel s'insèrent les sujets déplacés, parmi ceux qui ne bougent pas : `undefined` pour la fin de la liste. */
function ancreDe(l: Lecture, cible: Lacher, deplaces: ReadonlySet<Id>): Id | undefined {
  return cible.type === 'inserer' ? enfantsDe(l, cible.parent).filter((x) => !deplaces.has(x))[cible.index] : undefined
}

/** Le rang où ranger `id` parmi les enfants de `parent` pour qu'il tombe juste devant `ancre` (à la fin s'il n'y en a pas). */
const rangAvant = (a: Arbre, parent: Id, id: Id, ancre: Id | undefined): number =>
  ancre === undefined ? Number.MAX_SAFE_INTEGER : enfantsDe(lire(a), parent).filter((x) => x !== id).indexOf(ancre)

/**
 * Lâche ces sujets sur une cible (`enfant` ou `inserer`) : ils se rattachent ensemble, dans l'ordre donné, à la place
 * que le repère montrait. Une branche repliée qui les reçoit se déplie, pour qu'on les voie. Un lâcher libre n'est pas
 * l'affaire de cette fonction : la carte reste telle quelle.
 */
export function deplacerSujets(a: Arbre, ids: readonly Id[], cible: Lacher): Arbre {
  if (cible.type === 'libre') return a
  const deplaces = new Set(ids)
  let arbre = a
  if (cible.type === 'carte') arbre = rangerPrincipaux(a, cible.parent, ordreDesPrincipaux(lire(a), ids, cible.cote, cible.rang), deplaces)
  else {
    const ancre = ancreDe(lire(a), cible, deplaces)
    for (const id of ids) arbre = rattacher(arbre, id, cible.parent, rangAvant(arbre, cible.parent, id, ancre))
  }
  return lire(arbre).sujets.get(cible.parent)?.replie ? basculerRepli(arbre, cible.parent) : arbre
}

/**
 * Comme `deplacerSujets`, mais ⌥ : ce sont des copies de leurs branches qui se posent, les originaux restent. Rend la
 * carte et les copies. Pour un lâcher libre, chaque copie flotte à son `centres` (le centre de sa boîte, px de carte).
 */
export function copierSujets(a: Arbre, ids: readonly Id[], cible: Lacher, centres: ReadonlyMap<Id, { x: number; y: number }> = new Map()): [Arbre, Id[]] {
  const ancre = ancreDe(lire(a), cible, new Set(ids))
  // Pour une carte, le rangement se calcule sur la carte d'avant (les copies n'y sont pas), avec des repères à la place des copies.
  const reperes = ids.map((_, i) => `copie:${i}`)
  const plan = cible.type === 'carte' ? ordreDesPrincipaux(lire(a), reperes, cible.cote, cible.rang) : null
  let arbre = a
  const copies: Id[] = []
  const reperesPoses = new Map<Id, Id>()
  for (const [i, id] of ids.entries()) {
    const fragment = extraire(arbre, [id])
    if (!fragment) continue
    if (cible.type === 'libre') {
      const [neuf, collees] = coller(arbre, fragment, { position: centres.get(id) ?? { x: 0, y: 0 } })
      arbre = neuf
      copies.push(...collees)
      continue
    }
    const [neuf, collees] = coller(arbre, fragment, { parent: cible.parent })
    arbre = neuf
    for (const copie of collees) {
      if (plan) reperesPoses.set(reperes[i]!, copie)
      else arbre = rattacher(arbre, copie, cible.parent, rangAvant(arbre, cible.parent, copie, ancre))
      copies.push(copie)
    }
  }
  if (cible.type === 'carte' && plan && copies.length > 0) arbre = rangerPrincipaux(arbre, cible.parent, { ...plan, ordre: plan.ordre.flatMap((x) => (reperesPoses.has(x) ? [reperesPoses.get(x)!] : reperes.includes(x) ? [] : [x])) }, new Set(copies))
  if (cible.type !== 'libre' && copies.length > 0 && lire(arbre).sujets.get(cible.parent)?.replie) arbre = basculerRepli(arbre, cible.parent)
  return [arbre, copies]
}
