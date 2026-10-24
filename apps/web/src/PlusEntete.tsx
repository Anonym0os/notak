import { t } from './langue'
import type { ReactNode } from 'react'
import { Icone, Infobulle } from '@notak/tableau'
import { DansPanneau, usePanneau } from './panneaux'

/**
 * Les actions de l'en-tête dont on se sert moins (activité, import, export) : rangées derrière « … » pour laisser
 * la place au fil d'Ariane. Chacune garde son propre panneau, qui s'ouvre dans le menu sans le fermer ; un clic
 * dehors ou Échap referme le menu (voir `panneaux.ts`).
 */
export function PlusEntete({ children }: { children: ReactNode }) {
  const { ouvert, basculer, ancre, bouton, panneau, id } = usePanneau<HTMLDivElement, HTMLButtonElement>()
  return (
    <div className="plus-entete" ref={ancre}>
      <Infobulle libelle={t('plus.actions')} desactivee={ouvert}>
        <button type="button" ref={bouton} className="bouton bouton-nu" aria-expanded={ouvert} aria-label={t('plus.actions')} onClick={basculer}>
          <Icone nom="plus" taille={22} trait={1.5} />
        </button>
      </Infobulle>
      {/* Toujours monté : l'activité se relit en continu, menu fermé aussi. */}
      <div className="plus-entete-menu" ref={panneau} hidden={!ouvert}>
        <DansPanneau value={id}>{children}</DansPanneau>
      </div>
    </div>
  )
}
