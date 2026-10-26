import type { EspaceNavigable } from './coeur/espace'
import { empaqueter } from './coeur/pressePapiers'
import { type Element, type Id, type Operation, type RenvoiTableau, type Tableau, aimanter, inverse, nouvelId, placeDe } from './coeur/tableau'
import { nouveauDocument } from './elements/document/texte'
import { nouvelleCarteMentale } from './elements/arbre'
import { tousLesTypes } from './elements/registre'
import { copieDuContenu, placerALaSuite } from './EspaceNotak'
import { t } from './langue'

/**
 * Ranger sans ouvrir : ce que la bibliothèque fait des toiles, cartes mentales et documents (les jeter, les déplacer
 * d'une toile à l'autre, les renommer, les copier, en créer). Chaque chose est un élément d'une toile : une carte ou
 * un document, ou la carte d'une toile posée sur une autre. Les gestes passent par les magasins de l'espace, comme
 * s'ils étaient faits sur la toile ; ceux qui touchent deux toiles rendent de quoi les défaire.
 */

/** Ce que le bouton « Nouveau » de la bibliothèque sait créer. */
export type GenreNeuf = 'toile' | 'arbre' | 'document'

/** Un élément, sur la toile qui le porte. */
export interface Place {
  toile: Id
  element: Id
}

/** La largeur de la carte d'une toile posée sur une autre, en UG (comme l'outil Toile). */
const LARGEUR_RENVOI = 10

/** Ce que l'espace sait des toiles qu'il charge : `synchronise` dit si le contenu est arrivé du serveur. */
export type EspaceRangement = Pick<EspaceNavigable, 'magasin' | 'tableau' | 'ecouter' | 'creerTableau' | 'renommer' | 'lectureSeule' | 'synchronise' | 'racine'>

/** Ces toiles ont leur contenu, arrivé du serveur (au plus `delai` ms, après quoi on fait avec ce qu'on a). */
export function quandPretes(espace: Pick<EspaceRangement, 'tableau' | 'ecouter' | 'synchronise'>, toiles: readonly Id[], delai = 4000): Promise<void> {
  const pretes = () => toiles.every((id) => espace.synchronise?.(id) ?? true)
  for (const id of toiles) espace.tableau(id)
  if (pretes()) return Promise.resolve()
  return new Promise((fini) => {
    const arret = setTimeout(() => (fin(), fini()), delai)
    const fin = espace.ecouter(() => {
      if (!pretes()) return
      clearTimeout(arret)
      fin()
      fini()
    })
  })
}

/** La carte d'une toile sur celle qui la porte : celle qui n'est pas un raccourci, hors corbeille. */
export function carteDeLaToile(espace: Pick<EspaceRangement, 'tableau'>, porteuse: Id, toile: Id): Id | null {
  const carte = espace
    .tableau(porteuse)
    ?.elements.find((e) => e.contenu.type === 'tableau' && e.contenu.cible === toile && !e.contenu.raccourci && e.corbeille === undefined)
  return carte?.id ?? null
}

/** Les toiles que portent ces éléments, quand ce sont des cartes de toile. */
export function toilesPortees(t: Tableau, ids: Iterable<Id>): Id[] {
  const voulus = new Set(ids)
  return t.elements.flatMap((e) => (voulus.has(e.id) && e.contenu.type === 'tableau' && !e.contenu.raccourci ? [e.contenu.cible] : []))
}

const ecrivable = (espace: Pick<EspaceRangement, 'lectureSeule'>, toile: Id) => !espace.lectureSeule?.(toile)

/** Ce qui part avec ces éléments : les lignes qui s'y accrochent, sans doublon. */
function avecLiees(partants: Element[], tableau: Tableau): Element[] {
  const vus = new Set(partants.map((e) => e.id))
  const liees = tousLesTypes().flatMap((d) => d.emporterAvec?.(partants, tableau) ?? [])
  return [...partants, ...liees.filter((e) => !vus.has(e.id) && vus.add(e.id))]
}

const parToile = (places: readonly Place[]) => {
  const groupes = new Map<Id, Id[]>()
  for (const p of places) groupes.set(p.toile, [...(groupes.get(p.toile) ?? []), p.element])
  return groupes
}

/**
 * Une boîte approchée, sans mise en page : la place de l'élément et sa largeur. Un élément rangé dans une colonne en a
 * une aussi (sa place n'y veut rien dire, mais il en faut une pour qu'il parte : la toile d'arrivée le replace).
 */
const boiteDe = (t: Tableau) => (id: Id) => {
  const e = t.elements.find((x) => x.id === id)
  return e ? { min: { x: e.x, y: e.y }, max: { x: e.x + e.largeur, y: e.y + 1 } } : null
}

/**
 * Met ces éléments à la corbeille de leur toile, d'un pas d'historique par toile (les lignes accrochées suivent). Rend
 * de quoi les remettre, et combien sont partis.
 */
export function jeter(espace: EspaceRangement, places: readonly Place[], maintenant = Date.now()): { nombre: number; annuler(): void } {
  const faits: { toile: Id; pas: Operation[] }[] = []
  for (const [toile, ids] of parToile(places)) {
    if (!ecrivable(espace, toile)) continue
    const m = espace.magasin(toile)
    const tab = m.lire()
    const voulus = new Set(ids)
    const partants = avecLiees(
      tab.elements.filter((e) => voulus.has(e.id) && !e.verrou && e.corbeille === undefined),
      tab,
    )
    const dedans = new Set(partants.map((e) => e.id))
    const pas = partants
      .filter((e) => !(e.parent && dedans.has(e.parent)))
      .map((e): Operation => {
        const [x, y] = aimanter({ x: e.x, y: e.y })
        return { type: 'ranger', id: e.id, de: placeDe(e), vers: { x, y, corbeille: maintenant } }
      })
    if (pas.length === 0) continue
    m.faire(pas)
    faits.push({ toile, pas })
  }
  return {
    nombre: places.filter((x) => faits.some((f) => f.toile === x.toile && f.pas.some((p) => p.type === 'ranger' && p.id === x.element))).length,
    annuler: () => {
      for (const f of faits) espace.magasin(f.toile).faire(f.pas.map(inverse).reverse())
    },
  }
}

/**
 * Déplace ces éléments dans une autre toile, à la suite de son contenu (avec le contenu des colonnes et les lignes qui
 * les relient). Comme sur la toile, le déplacement n'entre pas dans l'historique : l'annuler là-bas laisserait un
 * double ici. Rend leurs nouvelles places, les toiles dont la carte a bougé, et de quoi tout remettre à l'identique.
 */
export function deplacer(
  espace: EspaceRangement,
  places: readonly Place[],
  vers: Id,
): { neufs: { de: Place; vers: Place }[]; toiles: { toile: Id; de: Id }[]; annuler(): void } {
  const neufs: { de: Place; vers: Place }[] = []
  const toiles: { toile: Id; de: Id }[] = []
  const defaire: (() => void)[] = []
  if (!ecrivable(espace, vers)) return { neufs, toiles, annuler: () => {} }
  const md = espace.magasin(vers)
  for (const [toile, ids] of parToile(places)) {
    if (toile === vers || !ecrivable(espace, toile)) continue
    const ms = espace.magasin(toile)
    const tab = ms.lire()
    // Une toile ne va pas dans elle-même.
    const gardes = ids.filter((id) => !toilesPortees(tab, [id]).includes(vers))
    const p = empaqueter(tab, gardes, boiteDe(tab))
    if (!p) continue
    const poses = placerALaSuite(md.lire(), p.elements.map((x) => ({ ...x })))
    md.appliquerSeulement(poses.map((element): Operation => ({ type: 'creer', element })))
    const partis = new Set(p.elements.map((x) => x.id))
    const lignesOrphelines = avecLiees(
      tab.elements.filter((x) => partis.has(x.id)),
      tab,
    ).filter((x) => !partis.has(x.id))
    const retires = [...tab.elements.filter((x) => partis.has(x.id) || (x.parent && partis.has(x.parent))), ...lignesOrphelines]
    ms.appliquerSeulement(retires.map((element): Operation => ({ type: 'supprimer', element })))
    const voulus = new Set(gardes)
    p.elements.forEach((x, i) => {
      if (voulus.has(x.id) && poses[i]) neufs.push({ de: { toile, element: x.id }, vers: { toile: vers, element: poses[i]!.id } })
    })
    for (const cible of toilesPortees(tab, gardes)) toiles.push({ toile: cible, de: toile })
    defaire.push(() => {
      md.appliquerSeulement(poses.map((element): Operation => ({ type: 'supprimer', element })))
      ms.appliquerSeulement(retires.map((element): Operation => ({ type: 'creer', element })))
    })
  }
  return { neufs, toiles, annuler: () => defaire.reverse().forEach((f) => f()) }
}

/** Le titre d'une carte mentale est celui de son sujet central : le premier sans parent, hors flottants. */
function centralDe(contenu: Element['contenu']): string | null {
  if (contenu.type !== 'arbre') return null
  const centraux = Object.entries(contenu.sujets).filter(([, s]) => s.parent === undefined && s.genre === undefined)
  centraux.sort(([a, x], [b, y]) => (x.ordre < y.ordre ? -1 : x.ordre > y.ordre ? 1 : a < b ? -1 : 1))
  return centraux[0]?.[0] ?? null
}

/** Le contenu renommé : le document change de titre, la carte mentale celui de son sujet central. */
function contenuRenomme(contenu: Element['contenu'], titre: string): Element['contenu'] | null {
  if (contenu.type === 'document') return { ...contenu, titre }
  const central = centralDe(contenu)
  if (contenu.type !== 'arbre' || central === null) return null
  return { ...contenu, sujets: { ...contenu.sujets, [central]: { ...contenu.sujets[central]!, titre } } }
}

/** Renomme une toile, ou la carte mentale ou le document d'une toile (un pas d'historique sur elle). */
export function renommerChose(espace: EspaceRangement, chose: { toile: Id; element: Id | null }, titre: string): void {
  if (chose.element === null) return void espace.renommer(chose.toile, titre)
  if (!ecrivable(espace, chose.toile)) return
  const m = espace.magasin(chose.toile)
  const e = m.lire().elements.find((x) => x.id === chose.element)
  const apres = e && contenuRenomme(e.contenu, titre)
  if (e && apres) m.faire([{ type: 'contenu', id: e.id, avant: e.contenu, apres }])
}

/**
 * Copie une toile (et son contenu), une carte mentale ou un document, posée juste après l'original sur la même toile,
 * titrée « … (copie) ». `porteuse` : la toile qui porte la carte de la toile copiée. Rend la copie.
 */
export function dupliquer(espace: EspaceRangement, chose: { toile: Id; element: Id | null }, porteuse?: Id): { tableau: Id; element: Id | null } | null {
  if (chose.element === null) {
    const source = espace.tableau(chose.toile)
    const ou = porteuse ?? espace.racine
    if (!source || !ecrivable(espace, ou)) return null
    const neuve = espace.creerTableau(t('rangement.copie', { titre: source.titre || t('commun.sansTitre') }), ou)
    const m = espace.magasin(neuve)
    m.appliquerSeulement(copieDuContenu(source.elements).map((element) => ({ type: 'creer' as const, element })))
    if (source.couleur) m.remplacer({ ...m.lire(), couleur: source.couleur })
    poserCarte(espace, ou, neuve, carteDeLaToile(espace, ou, chose.toile))
    return { tableau: neuve, element: null }
  }
  if (!ecrivable(espace, chose.toile)) return null
  const m = espace.magasin(chose.toile)
  const tab = m.lire()
  const e = tab.elements.find((x) => x.id === chose.element)
  if (!e) return null
  const titre = e.contenu.type === 'document' ? e.contenu.titre : e.contenu.type === 'arbre' ? (e.contenu.sujets[centralDe(e.contenu) ?? '']?.titre ?? '') : ''
  // Tirée d'une colonne, la copie se pose sur la toile.
  const { parent: _p, ordre: _o, ...libre } = e
  const [copie] = placerALaSuite(tab, [{ ...libre, contenu: contenuRenomme(e.contenu, t('rangement.copie', { titre: titre || t('commun.sansTitre') })) ?? e.contenu }])
  if (!copie) return null
  m.faire([{ type: 'creer', element: copie }])
  return { tableau: chose.toile, element: copie.id }
}

/** Pose la carte de `toile` sur `ou`, à la suite ; `modele` : la carte dont elle reprend la largeur et la couleur. */
function poserCarte(espace: EspaceRangement, ou: Id, toile: Id, modele: Id | null): Element {
  const m = espace.magasin(ou)
  const avant = modele ? m.lire().elements.find((x) => x.id === modele) : undefined
  const carte: Element<RenvoiTableau> = {
    id: nouvelId(),
    x: 0,
    y: 0,
    largeur: avant?.largeur ?? LARGEUR_RENVOI,
    contenu: { type: 'tableau', cible: toile },
  }
  const [pose] = placerALaSuite(m.lire(), [carte])
  m.faire([{ type: 'creer', element: pose! }])
  return pose!
}

/**
 * Crée une toile, une carte mentale ou un document sur une toile, à la suite de ce qui y est déjà : une toile neuve y
 * laisse sa carte. Rend où aller : la toile neuve, ou l'élément à ouvrir en grand.
 */
export function creerDans(espace: EspaceRangement, toile: Id, genre: GenreNeuf, titre?: string): { tableau: Id; element: Id | null } {
  if (genre === 'toile') {
    const cible = espace.creerTableau(titre ?? t('tableau.nouveau'), toile)
    poserCarte(espace, toile, cible, null)
    return { tableau: cible, element: null }
  }
  const magasin = espace.magasin(toile)
  const neuf = genre === 'arbre' ? nouvelleCarteMentale(0, 0) : nouveauDocument(0, 0)
  const [pose] = placerALaSuite(magasin.lire(), [neuf])
  magasin.faire([{ type: 'creer', element: pose! }])
  return { tableau: toile, element: pose!.id }
}

/** Crée sur la toile d'accueil (le bouton « Nouveau » de la bibliothèque). */
export const creerSurLAccueil = (espace: EspaceRangement, genre: GenreNeuf) => creerDans(espace, espace.racine, genre)

/**
 * Range ces éléments dans une toile neuve, posée sur `ou` (le « nouveau dossier avec la sélection » du Finder). Rend
 * la toile, ce qui y est parti, et de quoi défaire (la toile neuve va alors à la corbeille).
 */
export function rangerDansNeuve(espace: EspaceRangement, places: readonly Place[], ou: Id, titre = t('tableau.nouveau')) {
  const neuve = espace.creerTableau(titre, ou)
  const carte = poserCarte(espace, ou, neuve, null)
  const d = deplacer(espace, places, neuve)
  return {
    toile: neuve,
    ...d,
    annuler: () => {
      d.annuler()
      jeter(espace, [{ toile: ou, element: carte.id }])
    },
  }
}
