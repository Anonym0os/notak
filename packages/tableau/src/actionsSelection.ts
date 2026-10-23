import { type Element, type Operation, auDernierPlan, auPremierPlan } from './coeur/tableau'
import type { ContexteToile } from './elements/types'
import { toutesLesEntreesMenu } from './elements/registre'
import { langue, t } from './langue'
import type { NomIcone } from './icones'

/** Une ligne du menu « ••• » de la barre de gauche : une action, ou une information (sans `faire`). */
export interface ActionMenu {
  cle: string
  libelle: string
  icone?: NomIcone
  raccourci?: string
  /** Case cochée devant (Verrouiller la position). */
  coche?: boolean
  faire?(): void
}

const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Le jour où l'élément est né, lu dans son identifiant (ULID : les dix premiers signes sont la date en ms) ; `null` si ce n'en est pas un. */
export function creeLe(id: string): number | null {
  if (id.length < 10) return null
  let ms = 0
  for (const c of id.slice(0, 10)) {
    const i = BASE32.indexOf(c)
    if (i < 0) return null
    ms = ms * 32 + i
  }
  return ms > Date.UTC(2020, 0, 1) && ms < Date.now() + 86_400_000 ? ms : null
}

/**
 * Le menu « ••• » des éléments choisis, dans l'ordre de Milanote : ce que les modules apportent au clic droit
 * (ouvrir, raccourci, mettre dans une colonne, convertir…), puis Verrouiller, Premier plan, Arrière-plan, et
 * pour un élément seul la date de sa création. Ce qui a sa tuile dans la barre (commenter, relier, renommer, affichage)
 * n'est pas répété.
 */
export function actionsSelection(elements: Element[], contexte: ContexteToile): ActionMenu[] {
  const ids = new Set(elements.map((e) => e.id))
  const verrouilles = elements.length > 0 && elements.every((e) => e.verrou)
  const verrouiller = () => {
    const verrou = !verrouilles
    contexte.magasin.faire(elements.filter((x) => !!x.verrou !== verrou).map((x): Operation => ({ type: 'verrouiller', id: x.id, de: !verrou, vers: verrou })))
  }
  const modules: ActionMenu[] = toutesLesEntreesMenu()
    .filter((x) => !x.tuile && x.visible(elements, contexte))
    .map((x) => ({
      cle: `m:${x.libelle}`,
      libelle: x.libelle,
      ...(x.raccourci ? { raccourci: x.raccourci } : {}),
      ...(x.coche ? { coche: x.coche(elements, contexte) } : {}),
      faire: () => x.faire(elements, contexte),
    }))
  const seul = elements.length === 1 ? creeLe(elements[0]!.id) : null
  return [
    ...modules,
    { cle: 'verrou', libelle: t('toile.verrouiller'), icone: 'verrou', coche: verrouilles, faire: verrouiller },
    { cle: 'haut', libelle: t('toile.premierPlan'), icone: 'premierPlan', raccourci: '⇧⌘↑', faire: () => contexte.magasin.remplacer(auPremierPlan(contexte.magasin.lire(), ids)) },
    { cle: 'bas', libelle: t('toile.arrierePlan'), icone: 'arrierePlan', raccourci: '⇧⌘↓', faire: () => contexte.magasin.remplacer(auDernierPlan(contexte.magasin.lire(), ids)) },
    ...(seul !== null
      ? [{ cle: 'infos', libelle: t('menu.creeLe', { date: new Date(seul).toLocaleDateString(langue(), { day: 'numeric', month: 'long', year: 'numeric' }) }), icone: 'infos' as const }]
      : []),
  ]
}
