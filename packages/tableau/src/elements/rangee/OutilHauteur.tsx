import type { Element } from '../../coeur/tableau'
import { definition } from '../registre'
import type { ContexteToile, OutilCommun } from '../types'
import { hauteurApresCran } from './hauteur'
import { t } from '../../langue'

/** Ce dont la hauteur se règle ici : un élément rangé dans une colonne, de ceux qui savent être bornés. */
const reglable = (e: Element) => !!e.parent && !e.verrou && !!definition(e.contenu.type)?.hauteurBornable

function cran(elements: Element[], contexte: ContexteToile, sens: 1 | -1) {
  const pas = elements.filter(reglable).flatMap((e) => {
    const r = contexte.rect(e.id)
    const vers = hauteurApresCran(e.hauteur, r ? r.max.y - r.min.y : 0, sens)
    return JSON.stringify(vers) === JSON.stringify(e.hauteur ?? null) ? [] : [{ type: 'borner' as const, id: e.id, de: e.hauteur ?? null, vers }]
  })
  contexte.magasin.faire(pas)
}

/**
 * « Hauteur » : règle la hauteur des éléments rangés d'une colonne, d'un cran à la fois. La poignée du coin
 * n'existe que pour les éléments libres ; dans une colonne, la poignée du bas de la carte (`PoigneeHauteur`) règle
 * à la main, et ces boutons au cran.
 */
export const OutilHauteur: OutilCommun = ({ elements, contexte }) => {
  if (contexte.services.lectureSeule || elements.length === 0 || !elements.every(reglable)) return null
  const reglee = elements.some((e) => e.hauteur)
  return (
    <>
      <button type="button" title={t('hauteur.moins')} aria-label={t('hauteur.moins')} onClick={() => cran(elements, contexte, -1)}>
        {t('hauteur.titre')} −
      </button>
      <button type="button" title={t('hauteur.plus')} aria-label={t('hauteur.plus')} onClick={() => cran(elements, contexte, 1)}>
        {t('hauteur.titre')} +
      </button>
      {reglee && (
        <button
          type="button"
          title={t('hauteur.auto.titre')}
          onClick={() => contexte.magasin.faire(elements.flatMap((e) => (e.hauteur ? [{ type: 'borner' as const, id: e.id, de: e.hauteur, vers: null }] : [])))}
        >
          {t('hauteur.auto')}
        </button>
      )}
    </>
  )
}
