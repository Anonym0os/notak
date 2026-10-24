import { DUREE_BASE, type Effet } from '../modele/gabarits'
import type { Instantane, Phase, VueBoite } from './transitions'
import { piste } from './transitions'

/**
 * Les entrées propres à chaque gabarit (relevé 10 § 7.5, relevé 11 « Étapes ») : ce que la diapositive cible joue
 * pendant l'effet (`transition`) et après lui (`postTransition`). Les délais et les durées sont des multiples d'une
 * unité : la durée de base (400 ms), ou celle de l'effet pour l'entrée du sujet central.
 *
 * Chaque boîte animée ici est « réclamée » : l'effet la laisse à sa place, sans la fondre ni la faire glisser.
 */

const U = DUREE_BASE

/** Le rôle d'une boîte (`<sujet>:<rôle>`), sans le rang d'une clé répétée. */
export const roleDe = (cle: string) => cle.slice(cle.lastIndexOf(':') + 1).replace(/#\d+$/, '')
export const sujetDe = (cle: string) => cle.slice(0, cle.lastIndexOf(':'))

/** Ce qui ne fait pas partie du contenu d'un sujet : le fil d'Ariane et son filet. */
const HORS_CONTENU = new Set(['entete', 'filet'])

interface Choregraphie {
  pendant: Phase
  apres: Phase
}

const phase = (): Phase => ({ pistes: [], reclamees: new Set() })

/** Une boîte visible dans la source, à la même clé : l'effet la fait passer, l'entrée ne la rejoue pas. */
const visibleDans = (s: Instantane | null, cle: string) => !!s?.boites.some((b) => b.cle === cle && b.opacite > 0.001)

/** Un fondu d'entrée : de 0 à l'opacité naturelle. */
const fondre = (p: Phase, b: VueBoite, debut: number, duree: number, courbe = 'easeOutQuad') => {
  p.pistes.push(piste('cible', b.ref, { opacite: 0 }, { opacite: b.opacite }, debut, duree, courbe))
  p.reclamees.add(b.cle)
}

/** Un trait qui se dessine (de rien à tout), l'opacité à la sienne. */
const dessiner = (p: Phase, b: VueBoite, debut: number, duree: number, courbe = 'easeInOutCubic') => {
  p.pistes.push(piste('cible', `trace:${b.ref}`, { dessin: 0 }, { dessin: 1 }, debut, duree, courbe))
  p.reclamees.add(b.cle)
}

/** Une montée : la boîte part plus bas de `dy` et à 0, remonte en 1,75 unité et paraît en 2,5 (easeInOutCubic). */
const monter = (p: Phase, b: VueBoite, dy: number, debut: number, u: number) => {
  p.pistes.push(piste('cible', b.ref, { y: dy }, { y: 0 }, debut, 1.75 * u, 'easeInOutCubic'))
  p.pistes.push(piste('cible', b.ref, { opacite: 0 }, { opacite: b.opacite }, debut, 2.5 * u, 'easeInOutCubic'))
  p.reclamees.add(b.cle)
}

/** Les enfants montrés d'une liste, par sujet, avec leurs boîtes. */
function enfants(c: Instantane): Map<string, VueBoite[]> {
  const m = new Map<string, VueBoite[]>()
  for (const b of c.boites) {
    if (!b.etat || b.etat === 'cache' || b.opacite <= 0.001) continue
    const id = sujetDe(b.cle)
    m.set(id, [...(m.get(id) ?? []), b])
  }
  return m
}

/** La boîte d'un rôle du sujet donné. */
const boiteDe = (c: Instantane, sujet: string, role: string) => c.boites.find((b) => sujetDe(b.cle) === sujet && roleDe(b.cle) === role)

/**
 * L'arrivée d'un enfant sur une étape de liste, quand son gabarit lui donne un geste (relevé 11) : l'arête se dessine
 * en paraissant puis l'étiquette suit ; le petit trait d'une tête, puis le texte ; le point, la tige, puis l'étiquette
 * d'une chronologie ; la branche de l'arbre, avec le titre qui glisse le long. `null` : le fondu de l'effet suffit.
 */
function arriveeDEnfant(gabarit: string, p: Phase, boites: VueBoite[]): boolean {
  const role = (r: string) => boites.find((b) => roleDe(b.cle) === r)
  const titre = role('titre')
  switch (gabarit) {
    case 'arete': {
      const arete = role('arete')
      if (arete) (dessiner(p, arete, 0, 1.5 * U), fondre(p, arete, 0, 1.5 * U, 'easeInOutCubic'))
      if (titre) fondre(p, titre, 1.5 * U, U)
      return true
    }
    case 'tete-arete':
    case 'tete-chronologie': {
      const trait = role('trait')
      if (trait) dessiner(p, trait, 0, U)
      if (titre) fondre(p, titre, 0.8 * U, U)
      return true
    }
    case 'chronologie': {
      const point = role('point')
      const tige = role('tige')
      if (point) fondre(p, point, 0, U)
      if (tige) dessiner(p, tige, U, 1.5 * U)
      if (titre) fondre(p, titre, 2.5 * U, U)
      return true
    }
    case 'arbre': {
      const branche = role('branche')
      if (branche) dessiner(p, branche, 0, 1.5 * U)
      if (titre) {
        p.pistes.push(piste('cible', titre.ref, { y: -titre.rect.h }, { y: 0 }, 0, 1.5 * U, 'easeInOutCubic'))
        fondre(p, titre, 0, 1.5 * U, 'easeInOutCubic')
      }
      return true
    }
    default:
      return false
  }
}

/** Ce que la diapositive cible joue en entrant, selon son gabarit et l'effet qui l'amène. */
export function choregraphie(c: Instantane, s: Instantane | null, effet: Effet): Choregraphie {
  const pendant = phase()
  const apres = phase()
  const contenu = c.boites.filter((b) => !HORS_CONTENU.has(roleDe(b.cle)) && b.opacite > 0.001)

  if (c.type === 'sujet' && (c.niveau === 'central' || c.niveau === 'flottant')) {
    // Le central et les flottants : chaque bloc, de haut en bas, monte d'un cinquième de sa hauteur en paraissant,
    // 0,75 unité après le précédent ; l'unité est la durée de l'effet (relevé 10 § 7.5). Une image de fond, elle, part
    // agrandie (1,2) et revient, avant les blocs.
    const u = effet.duree
    const fond = contenu.find((b) => b.fond)
    let rang = 0
    if (fond) {
      pendant.pistes.push(piste('cible', fond.ref, { sx: 1.2, sy: 1.2, x: -0.1 * fond.rect.l, y: -0.1 * fond.rect.h }, { sx: 1, sy: 1, x: 0, y: 0 }, 0, 1.75 * u, 'easeInOutCubic'))
      fondre(pendant, fond, 0, 2.5 * u, 'easeInOutCubic')
      rang = 1
    }
    const blocs = contenu.filter((b) => b !== fond).sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)
    for (const b of blocs) monter(pendant, b, b.rect.h / 5, rang++ * 0.75 * u, u)
    return { pendant, apres }
  }

  if (c.type === 'sujet' || c.type === 'fin') {
    // Les autres sujets et « Merci » : tout sauf le titre paraît après l'effet ; le titre arrive par le morphing.
    for (const b of contenu) if (!['titre', 'merci'].includes(roleDe(b.cle)) && !visibleDans(s, b.cle)) fondre(apres, b, 0.75 * U, U)
    return { pendant, apres }
  }

  if (c.type === 'resume') {
    if (c.moment !== 'entree') return { pendant, apres }
    // Le titre caché, la forme se dessine, puis le titre paraît.
    const sujet = c.sujet
    const forme = boiteDe(c, sujet, 'forme')
    const titre = boiteDe(c, sujet, 'titre')
    if (forme) dessiner(apres, forme, 0, U)
    if (titre) fondre(apres, titre, 0.75 * U, U)
    return { pendant, apres }
  }

  // Les listes.
  const sujet = c.sujet
  const montres = enfants(c)
  const nouveaux = [...montres].filter(([, boites]) => !boites.some((b) => visibleDans(s, b.cle)))
  if (c.premiere) {
    // La première étape : le groupe des enfants paraît après l'effet (relevé 11 § 0.8), avec le geste de son gabarit.
    for (const [, boites] of nouveaux) {
      if (c.gabarit === 'paroles') {
        for (const b of boites) monter(apres, b, b.rect.h, 0.75 * U, U)
        continue
      }
      const geste = phase()
      if (arriveeDEnfant(c.gabarit, geste, boites)) {
        apres.pistes.push(...geste.pistes.map((p) => ({ ...p, debut: p.debut + 0.75 * U })))
        for (const k of geste.reclamees) apres.reclamees.add(k)
      }
      for (const b of boites) if (!apres.reclamees.has(b.cle)) fondre(apres, b, 0.75 * U, U)
    }
    // Les traits du gabarit : l'accolade une demi-unité après le groupe, la flèche des paroles, les séparateurs.
    const traits: Record<string, [string, number]> = {
      accolade: ['accolade', 1.25 * U],
      paroles: ['fleche', 0.75 * U],
      'enfant-unique': ['separateur', 0.75 * U],
      'enfant-unique-parent-illustre': ['separateur', 0.75 * U],
      'enfant-unique-illustre': ['separateur', 0.75 * U],
    }
    const t = traits[c.gabarit]
    const b = t && boiteDe(c, sujet, t[0])
    if (t && b && !visibleDans(s, b.cle)) dessiner(apres, b, t[1], U)
    return { pendant, apres }
  }
  // Une étape suivante : l'enfant qui arrive fait le geste de son gabarit pendant l'effet.
  for (const [, boites] of nouveaux) arriveeDEnfant(c.gabarit, pendant, boites)
  return { pendant, apres }
}
