import type { Arbre } from '../coeur/tableau.ts'
import { enfantsDe, lire } from '../elements/arbre/modele/sujets.ts'
import { type Boite, boitesDe, chevauche, hauteurDe, placeParDefaut } from './poser.ts'
import { markdownDePage, markdownDepuisDoc, pageRiche, texteSimple } from './texte.ts'
import { type ElementLu, type NoeudTexte, type TableauLu, texteDesFils } from '../export/contenu.ts'

// Ce qu'un agent lit d'un tableau : chaque élément en clair (son texte en Markdown, une carte mentale en plan imbriqué,
// une table en lignes, une liste en tâches), sa place et sa taille, et la mise en page de l'ensemble (zones,
// chevauchements, place libre). Compact : rien de ce qui ne sert qu'à dessiner.

export interface PlanSujet {
  id: string
  titre: string
  note?: string
  enfants: PlanSujet[]
}

/** Le plan d'une carte mentale, depuis son central ; les flottants à part. */
export function planDeLArbre(a: Arbre): { plan: PlanSujet; flottants: { id: string; titre: string }[] } {
  const l = lire(a)
  const sujet = (id: string, vus: Set<string>): PlanSujet => {
    vus.add(id)
    const s = l.sujets.get(id)!
    const note = s.note ? texteSimple(s.note as NoeudTexte) : ''
    return { id, titre: s.titre, ...(note ? { note } : {}), enfants: enfantsDe(l, id).filter((e) => !vus.has(e)).map((e) => sujet(e, vus)) }
  }
  return { plan: sujet(l.central, new Set()), flottants: l.flottants.map((id) => ({ id, titre: l.sujets.get(id)?.titre ?? '' })) }
}

/** Les tâches d'une liste, à plat dans l'ordre de lecture (les sous-tâches après leur tâche) : leur rang sert à cocher. */
export function tachesDe(doc: unknown): { texte: string; faite: boolean; niveau?: number }[] {
  const sortie: { texte: string; faite: boolean; niveau?: number }[] = []
  const parcourir = (n: NoeudTexte | undefined, niveau: number) => {
    for (const liste of n?.content ?? []) {
      if (liste.type !== 'taskList') continue
      for (const item of liste.content ?? []) {
        const [tete, ...reste] = item.content ?? []
        sortie.push({ texte: texteSimple(tete), faite: item.attrs?.checked === true, ...(niveau ? { niveau } : {}) })
        parcourir({ type: 'doc', content: reste }, niveau + 1)
      }
    }
  }
  parcourir(doc as NoeudTexte, 0)
  return sortie
}

const chaine = (v: unknown) => (typeof v === 'string' ? v : '')

/** Le texte d'une page, au plus : en entier quand on la lit seule (`seulement`), son début dans le tableau entier. */
export const TEXTE_PAGE_MAX = 50_000
export const DEBUT_PAGE = 4_000

/** Ce qu'un agent lit d'un élément, par son type, sans sa place. `entier` : le texte entier d'une page. */
function corps(e: ElementLu, titreDe: (id: string) => string | undefined, entier = false): Record<string, unknown> {
  const c = e.contenu
  switch (c.type) {
    case 'note':
      return c.variante === 'titre'
        ? { type: 'titre', texte: texteSimple(c.texte as NoeudTexte) }
        : { type: 'note', texte: markdownDepuisDoc(c.texte), ...(chaine(c.couleur) && c.couleur !== 'transparent' ? { couleur: c.couleur } : {}) }
    case 'taches':
      return { type: 'taches', ...(chaine(c.titre) ? { titre: c.titre } : {}), ...(chaine(c.couleur) ? { couleur: c.couleur } : {}), taches: tachesDe(c.texte) }
    case 'lien': {
      const apercu = (c.apercu ?? {}) as Record<string, unknown>
      const titre = chaine(c.titre) || chaine(apercu.titre)
      const description = chaine(c.legende) || chaine(apercu.description)
      return { type: 'lien', url: chaine(c.url), ...(titre ? { titre } : {}), ...(description ? { description: description.slice(0, 300) } : {}) }
    }
    case 'colonne':
      return { type: 'colonne', titre: chaine(c.titre), ...(chaine(c.couleur) ? { couleur: c.couleur } : {}), ...(c.repliee === true ? { repliee: true } : {}) }
    case 'table':
      return {
        type: 'table',
        ...(chaine(c.titre) && c.avecTitre !== false ? { titre: c.titre } : {}),
        lignes: Array.isArray(c.cellules) ? (c.cellules as unknown[][]).map((l) => (Array.isArray(l) ? l.map((x) => chaine(x)) : [])) : [],
      }
    case 'arbre': {
      const { plan, flottants } = planDeLArbre(c as unknown as Arbre)
      const structure = lire(c as unknown as Arbre).sujets.get(plan.id)?.structure
      return { type: 'carte_mentale', plan, ...(flottants.length ? { flottants } : {}), ...(structure ? { structure } : {}) }
    }
    case 'tableau': {
      const cible = chaine(c.cible)
      return { type: 'tableau', cible, titre: titreDe(cible) ?? chaine(c.titre), ...(c.raccourci ? { raccourci: true } : {}) }
    }
    case 'ligne': {
      const bout = (b: unknown) => {
        const o = (b ?? {}) as Record<string, unknown>
        return typeof o.element === 'string' ? o.element : { x: Number(o.x) || 0, y: Number(o.y) || 0 }
      }
      return { type: 'ligne', de: bout(c.depart), vers: bout(c.arrivee), ...(chaine(c.libelle) ? { libelle: c.libelle } : {}) }
    }
    case 'image':
      return { type: 'image', ...(chaine(c.legende) ? { legende: c.legende } : {}) }
    case 'fichier':
      return { type: 'fichier', nom: chaine(c.titre) || chaine(c.nom) }
    case 'document': {
      // Une page, en Markdown : celui qu'on lui écrit (`texte`, `ajouter_texte`). Riche, elle ne se récrit pas d'un bloc.
      const texte = markdownDePage(c.texte)
      const max = entier ? TEXTE_PAGE_MAX : DEBUT_PAGE
      return {
        type: 'page',
        titre: chaine(c.titre),
        texte: texte.slice(0, max),
        ...(texte.length > max ? { tronque: true } : {}),
        ...(chaine(c.couleur) ? { couleur: c.couleur } : {}),
        ...(c.carte === true ? { apercu: true } : {}),
        ...(pageRiche(c) ? { riche: true } : {}),
      }
    }
    case 'commentaire':
      return { type: 'commentaire', texte: texteDesFils({ ...e, commentaire: c }).slice(0, 2000) }
    case 'nuancier':
      return { type: 'nuancier', couleur: chaine(c.couleur), ...(chaine(c.legende) ? { legende: c.legende } : {}) }
    case 'lieu':
      return { type: 'lieu', adresse: chaine(c.adresse), ...(chaine(c.nom) ? { nom: c.nom } : {}) }
    default:
      return { type: c.type }
  }
}

export interface Lecture {
  elements: Record<string, unknown>[]
  structure: {
    cadre: Boite | null
    zones: { titre?: string; elements: string[]; cadre: Boite }[]
    chevauchements: [string, string][]
    place_libre: { x: number; y: number }
  }
}

/** Deux éléments à moins de tant d'UG l'un de l'autre sont d'une même zone. */
const PROCHE = 6

/**
 * Le tableau tel que l'agent le lit. `seulement` : ces éléments (et ce que rangent leurs colonnes). `caches` : les
 * cartes que la personne ne doit pas voir (`DroitsTableau.caches`), tues comme la toile les tait.
 */
export function lirePourAgent(
  t: TableauLu,
  o: { titreDe: (id: string) => string | undefined; corbeille?: boolean; seulement?: readonly string[]; caches?: ReadonlySet<string> },
): Lecture {
  const caches = o.caches ?? new Set<string>()
  const vivants = t.elements.filter((e) => !caches.has(e.id) && (o.corbeille || e.corbeille === undefined))
  const boites = boitesDe({ ...t, elements: t.elements.filter((e) => !caches.has(e.id)) })
  const boiteDe = new Map(boites.map((b) => [b.id, b]))
  // Ce que range chaque colonne, dans son ordre.
  const enfants = new Map<string, ElementLu[]>()
  for (const e of vivants) if (e.parent) enfants.set(e.parent, [...(enfants.get(e.parent) ?? []), e])
  for (const l of enfants.values()) l.sort((a, b) => ((a.ordre ?? '') < (b.ordre ?? '') ? -1 : (a.ordre ?? '') > (b.ordre ?? '') ? 1 : 0))
  const voulus = o.seulement ? new Set(o.seulement.flatMap((id) => [id, ...(enfants.get(id) ?? []).map((e) => e.id)])) : null
  const titreDe = o.titreDe

  const elements = vivants
    .filter((e) => !voulus || voulus.has(e.id))
    .map((e) => {
      const b = boiteDe.get(e.id)
      const rang = e.parent ? (enfants.get(e.parent) ?? []).indexOf(e) : -1
      const place = e.parent
        ? { colonne: e.parent, rang, l: Math.round(e.largeur), h: hauteurDe(e) }
        : b
          ? { x: b.x, y: b.y, l: b.l, h: b.h }
          : { x: Math.round(e.x), y: Math.round(e.y), l: Math.round(e.largeur) }
      const lu = corps(e, titreDe, !!o.seulement?.includes(e.id))
      const range = e.contenu.type === 'colonne' ? { elements: (enfants.get(e.id) ?? []).map((x) => x.id) } : {}
      return {
        id: e.id,
        ...lu,
        ...place,
        ...range,
        ...(e.corbeille !== undefined ? { corbeille: true } : {}),
        ...(e.nonTrie !== undefined ? { non_trie: true } : {}),
        ...((e as { verrou?: boolean }).verrou ? { verrouille: true } : {}),
      }
    })

  // Les zones : les éléments posés, groupés de proche en proche.
  const parent = boites.map((_, i) => i)
  const racine = (i: number): number => (parent[i] === i ? i : (parent[i] = racine(parent[i]!)))
  for (let i = 0; i < boites.length; i++) {
    for (let j = i + 1; j < boites.length; j++) if (chevauche(boites[i]!, boites[j]!, PROCHE)) parent[racine(i)] = racine(j)
  }
  const groupes = new Map<number, (Boite & { id: string })[]>()
  boites.forEach((b, i) => groupes.set(racine(i), [...(groupes.get(racine(i)) ?? []), b]))
  const enTitre = new Map(t.elements.filter((e) => e.contenu.type === 'note' && e.contenu.variante === 'titre').map((e) => [e.id, texteSimple(e.contenu.texte as NoeudTexte)]))
  const zones = [...groupes.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      const tries = [...g].sort((a, b) => a.y - b.y || a.x - b.x)
      const titre = enTitre.get(tries[0]!.id)
      return { ...(titre ? { titre } : {}), elements: tries.map((b) => b.id), cadre: englobante(tries) }
    })
    .sort((a, b) => a.cadre.y - b.cadre.y || a.cadre.x - b.cadre.x)

  const chevauchements: [string, string][] = []
  for (let i = 0; i < boites.length && chevauchements.length < 50; i++) {
    for (let j = i + 1; j < boites.length && chevauchements.length < 50; j++) if (chevauche(boites[i]!, boites[j]!)) chevauchements.push([boites[i]!.id, boites[j]!.id])
  }
  return {
    elements,
    structure: { cadre: boites.length ? englobante(boites) : null, zones, chevauchements, place_libre: placeParDefaut(boites, 34, 20) },
  }
}

export function englobante(boites: readonly Boite[]): Boite {
  const x = Math.min(...boites.map((b) => b.x))
  const y = Math.min(...boites.map((b) => b.y))
  return { x, y, l: Math.max(...boites.map((b) => b.x + b.l)) - x, h: Math.max(...boites.map((b) => b.y + b.h)) - y }
}
