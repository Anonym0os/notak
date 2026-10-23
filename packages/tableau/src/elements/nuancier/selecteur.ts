import type { Element, Nuancier } from '../../coeur/tableau'
import { couleursDuTableau } from '../couleur/suggestions'
import { t } from '../../langue'
import type { ContexteToile } from '../types'
import { PALETTE_DEPART, normaliserHex } from './couleur'

/** Au moins trois suggestions, au plus dix : celles du tableau, complétées par la palette de départ. */
export function suggestionsDuNuancier(elements: readonly Element[]): string[] {
  const du = couleursDuTableau(elements)
  for (const c of PALETTE_DEPART) {
    if (du.length >= 3) break
    if (!du.includes(c)) du.push(c)
  }
  return du
}

let ouvert: { retirer(): void } | null = null

/**
 * Le double-clic sur un nuancier : le sélecteur de couleur du système, posé contre l'élément, avec les couleurs du
 * tableau en suggestions. La couleur suit le sélecteur en direct ; ce qui est choisi forme un seul pas d'historique,
 * inscrit quand le sélecteur se ferme.
 */
export function ouvrirSelecteur(element: Element<Nuancier>, contexte: ContexteToile): void {
  if (contexte.services.lectureSeule || element.verrou) return
  ouvert?.retirer()
  const depart = element.contenu
  const rect = [...document.querySelectorAll<HTMLElement>('[data-id]')].find((n) => n.dataset.id === element.id)?.getBoundingClientRect()

  const champ = document.createElement('input')
  champ.type = 'color'
  champ.value = depart.couleur
  champ.tabIndex = -1
  champ.setAttribute('aria-label', t('couleur.titre'))
  Object.assign(champ.style, {
    position: 'fixed',
    left: `${Math.round(rect?.left ?? 0)}px`,
    top: `${Math.round(rect?.bottom ?? 0)}px`,
    width: '1px',
    height: '1px',
    padding: '0',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  })
  const liste = document.createElement('datalist')
  liste.id = `notak-nuancier-${element.id}`
  for (const c of suggestionsDuNuancier(contexte.magasin.lire().elements)) {
    const o = document.createElement('option')
    o.value = c
    liste.append(o)
  }
  champ.setAttribute('list', liste.id)
  document.body.append(liste, champ)

  let derniere = depart.couleur
  const retirer = () => {
    champ.remove()
    liste.remove()
    if (ouvert?.retirer === retirer) ouvert = null
  }
  const poser = (couleur: string): Nuancier => ({ ...depart, couleur })
  // En direct, rien dans l'historique ; à la fermeture, le geste entier en est un seul pas.
  champ.addEventListener('input', () => {
    const hex = normaliserHex(champ.value)
    if (!hex) return
    contexte.magasin.appliquerSeulement([{ type: 'contenu', id: element.id, avant: poser(derniere), apres: poser(hex) }])
    derniere = hex
  })
  let fini = false
  const finir = () => {
    if (fini) return
    fini = true
    if (derniere !== depart.couleur) contexte.magasin.inscrire([{ type: 'contenu', id: element.id, avant: depart, apres: poser(derniere) }])
    retirer()
  }
  champ.addEventListener('change', finir)
  champ.addEventListener('blur', finir)
  ouvert = { retirer }

  if (typeof champ.showPicker === 'function') {
    try {
      champ.showPicker()
    } catch {
      champ.click()
    }
  } else champ.click()
}
