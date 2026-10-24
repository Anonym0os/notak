import type { Arbre } from '../../coeur/tableau'
import { t } from '../../langue'
import type { Geste } from './modele/gestes'

/** L'onglet Présenter du panneau de côté. Provisoire. */
export function OngletPresenter({ presenter }: { arbre: Arbre; faire(g: Geste): void; presenter(): void }) {
  return (
    <button type="button" onClick={presenter}>
      {t('arbre.presenter')}
    </button>
  )
}
