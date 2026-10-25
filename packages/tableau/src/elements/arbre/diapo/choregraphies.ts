import { COURBES, RYTHME } from '../modele/rythme'
import type { Instantane, Phase, VueBoite } from './transitions'
import { piste } from './transitions'

/**
 * Les entrées propres à chaque gabarit (relevé 10 § 7.5, relevé 11 « Étapes ») : ce que la diapositive cible joue
 * pendant l'effet (`transition`) et après lui (`postTransition`). Les délais et les durées sont des multiples d'une
 * unité, celle de notre rythme (`rythme.ts`) ; Xmind enchaîne ses étapes l'une après l'autre, on les fait se chevaucher.
 *
 * Chaque boîte animée ici est « réclamée » : l'effet la laisse à sa place, sans la fondre ni la faire glisser.
 */

const U = RYTHME.unite

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
const fondre = (p: Phase, b: VueBoite, debut: number, duree: number, courbe: string = COURBES.entree) => {
  p.pistes.push(piste('cible', b.ref, { opacite: 0 }, { opacite: b.opacite }, debut, duree, courbe))
  p.reclamees.add(b.cle)
}

/**
 * Un trait qui se dessine (de rien à tout). La boîte paraît sur le premier tiers : une forme pleine (la flèche des
 * paroles), que le trait ne dessine pas, surgirait sinon d'un coup.
 */
const dessiner = (p: Phase, b: VueBoite, debut: number, duree: number, courbe: string = COURBES.trait) => {
  p.pistes.push(piste('cible', `trace:${b.ref}`, { dessin: 0 }, { dessin: 1 }, debut, duree, courbe))
  if (!p.pistes.some((x) => x.ref === b.ref && 'opacite' in x.a)) p.pistes.push(piste('cible', b.ref, { opacite: 0 }, { opacite: b.opacite }, debut, duree / 3, COURBES.entree))
  p.reclamees.add(b.cle)
}

/** Une montée : la boîte part plus bas de `dy` et à 0, remonte en 1,75 unité et paraît en 1,25. */
const monter = (p: Phase, b: VueBoite, dy: number, debut: number, u: number) => {
  p.pistes.push(piste('cible', b.ref, { y: dy }, { y: 0 }, debut, 1.75 * u, COURBES.glisse))
  p.pistes.push(piste('cible', b.ref, { opacite: 0 }, { opacite: b.opacite }, debut, 1.25 * u, COURBES.entree))
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
      if (arete) (fondre(p, arete, 0, 0.5 * U), dessiner(p, arete, 0, 1.5 * U))
      if (titre) fondre(p, titre, 0.75 * U, U)
      return true
    }
    case 'tete-arete':
    case 'tete-chronologie': {
      const trait = role('trait')
      if (trait) dessiner(p, trait, 0, U)
      if (titre) fondre(p, titre, 0.5 * U, U)
      return true
    }
    case 'chronologie': {
      const point = role('point')
      const tige = role('tige')
      if (point) fondre(p, point, 0, U)
      if (tige) dessiner(p, tige, 0.5 * U, 1.5 * U)
      if (titre) fondre(p, titre, 1.25 * U, U)
      return true
    }
    case 'arbre': {
      const branche = role('branche')
      if (branche) dessiner(p, branche, 0, 1.5 * U)
      if (titre) {
        p.pistes.push(piste('cible', titre.ref, { y: -titre.rect.h }, { y: 0 }, 0, 1.5 * U, COURBES.glisse))
        fondre(p, titre, 0, U)
      }
      return true
    }
    default:
      return false
  }
}

/** Ce que la diapositive cible joue en entrant, selon son gabarit et l'effet qui l'amène. */
export function choregraphie(c: Instantane, s: Instantane | null): Choregraphie {
  const pendant = phase()
  const apres = phase()
  const contenu = c.boites.filter((b) => !HORS_CONTENU.has(roleDe(b.cle)) && b.opacite > 0.001)

  if (c.type === 'sujet' && (c.niveau === 'central' || c.niveau === 'flottant')) {
    // Le central et les flottants : chaque bloc, de haut en bas, monte d'un cinquième de sa hauteur en paraissant, un
    // tiers d'unité après le précédent (Xmind : 0,75 de la durée de l'effet, relevé 10 § 7.5). Une image de fond, elle,
    // part agrandie (1,2) et revient, avant les blocs.
    const u = U
    const fond = contenu.find((b) => b.fond)
    let rang = 0
    if (fond) {
      pendant.pistes.push(piste('cible', fond.ref, { sx: 1.2, sy: 1.2, x: -0.1 * fond.rect.l, y: -0.1 * fond.rect.h }, { sx: 1, sy: 1, x: 0, y: 0 }, 0, 3 * u, COURBES.glisse))
      fondre(pendant, fond, 0, 1.5 * u)
      rang = 1
    }
    const blocs = contenu.filter((b) => b !== fond).sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)
    for (const b of blocs) monter(pendant, b, b.rect.h / 5, rang++ * u / 3, u)
    return { pendant, apres }
  }

  if (c.type === 'sujet' || c.type === 'fin') {
    // Les autres sujets et « Merci » : tout sauf le titre paraît après l'effet ; le titre arrive par le morphing.
    for (const b of contenu) if (!['titre', 'merci'].includes(roleDe(b.cle)) && !visibleDans(s, b.cle)) fondre(apres, b, 0, U)
    return { pendant, apres }
  }

  if (c.type === 'resume') {
    if (c.moment !== 'entree') return { pendant, apres }
    // Le titre caché, la forme se dessine, puis le titre paraît.
    const sujet = c.sujet
    const forme = boiteDe(c, sujet, 'forme')
    const titre = boiteDe(c, sujet, 'titre')
    if (forme) dessiner(apres, forme, 0, U)
    if (titre) fondre(apres, titre, 0.5 * U, U)
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
        for (const b of boites) monter(apres, b, b.rect.h, 0.25 * U, U)
        continue
      }
      const geste = phase()
      if (arriveeDEnfant(c.gabarit, geste, boites)) {
        apres.pistes.push(...geste.pistes.map((p) => ({ ...p, debut: p.debut + 0.25 * U })))
        for (const k of geste.reclamees) apres.reclamees.add(k)
      }
      for (const b of boites) if (!apres.reclamees.has(b.cle)) fondre(apres, b, 0.25 * U, U)
    }
    // Les traits du gabarit : l'accolade une demi-unité après le groupe, la flèche des paroles, les séparateurs.
    const traits: Record<string, [string, number]> = {
      accolade: ['accolade', 0.5 * U],
      paroles: ['fleche', 0.25 * U],
      'enfant-unique': ['separateur', 0.25 * U],
      'enfant-unique-parent-illustre': ['separateur', 0.25 * U],
      'enfant-unique-illustre': ['separateur', 0.25 * U],
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
