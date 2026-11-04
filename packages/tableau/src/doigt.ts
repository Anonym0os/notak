import { useSyncExternalStore } from 'react'

/**
 * L'écran se touche-t-il du doigt (un téléphone, une tablette) plutôt qu'à la souris ? Ce que la page dit alors de
 * ses gestes change : on touche deux fois au lieu de double-cliquer, et ni ⌘S ni « / » ne veulent rien dire sans
 * clavier. Une tablette avec clavier et pavé reste au doigt : c'est son pointeur premier.
 */
export const auDoigt = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches


/**
 * Le téléphone : au doigt, et étroit (portrait) ou bas (un iPhone couché fait 844 à 932 px de large pour 390 de
 * haut). Les menus et panneaux y montent en feuille, la barre est en bas. Les règles CSS « téléphone » disent la même
 * chose : `@media (pointer: coarse) and (max-width: 640px), (pointer: coarse) and (max-height: 500px)`.
 */
export const REQUETE_TELEPHONE = '(pointer: coarse) and (max-width: 640px), (pointer: coarse) and (max-height: 500px)'

/** Sommes-nous sur un téléphone, à l'instant ? */
export const auTelephone = (): boolean => auDoigt() && typeof innerWidth === 'number' && (innerWidth <= 640 || innerHeight <= 500)

/** Sommes-nous sur un téléphone ? Suit l'écran qui tourne. */
export function useAuTelephone(): boolean {
  return useSyncExternalStore(
    (f) => {
      if (typeof matchMedia !== 'function') return () => {}
      const m = matchMedia(REQUETE_TELEPHONE)
      m.addEventListener?.('change', f)
      window.addEventListener('resize', f)
      return () => {
        m.removeEventListener?.('change', f)
        window.removeEventListener('resize', f)
      }
    },
    auTelephone,
    () => false,
  )
}
