import { Fragment, type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { Icone, type NomIcone } from '../../icones'
import { t } from '../../langue'
import { placerBarreSujet } from './geometrieMenus'

/** Ce que chaque bouton de la barre fait : l'appelant (Arbre.tsx) les relie à ses éditeurs, sur le sujet qu'il montre. */
export interface ActionsBarreSujet {
  /** Relier ce sujet à un autre : arme le tracé d'une relation depuis lui. */
  relation(): void
  /** Poser un lien web sur le sujet. */
  lienWeb(): void
  /** Poser une image locale sur le sujet. */
  image(): void
  /** Ouvrir la note du sujet. */
  note(): void
  /** Poser une tâche à faire sur le sujet (la case à cocher). */
  tache(): void
  /** Le pinceau de style, quand la barre n'a pas de fenêtre à ouvrir (`choixStyle`). */
  style?(): void
}

export interface PropsBarreSujet {
  /** Le milieu du bord haut du sujet, en px de la zone où la barre est posée. La barre se centre dessus, 8 px au-dessus. */
  x: number
  y: number
  /** Le bord bas du sujet : si le haut n'a pas la place (sous la barre d'outils), la barre passe sous le sujet. Sans lui, elle reste dessus. */
  bas?: number
  actions: ActionsBarreSujet
  /** Les boutons à griser (un sujet qui ne peut pas porter d'image, par exemple). */
  inactifs?: Partial<Record<keyof ActionsBarreSujet, boolean>>
  /** La fenêtre « Style » que le pinceau ouvre et ferme, posée sous lui. */
  choixStyle?(ancre: RefObject<HTMLElement | null>, fermer: () => void): ReactNode
}

const BOUTONS: { id: keyof ActionsBarreSujet; icone: NomIcone; libelle: string }[] = [
  { id: 'relation', icone: 'arbreRelation', libelle: 'arbre.relationAide' },
  { id: 'lienWeb', icone: 'monde', libelle: 'arbre.inserer.lienWeb' },
  { id: 'image', icone: 'image', libelle: 'arbre.imageLocale' },
  { id: 'note', icone: 'note', libelle: 'arbre.note' },
  { id: 'tache', icone: 'tache', libelle: 'arbre.aFaire' },
  { id: 'style', icone: 'menuPinceau', libelle: 'arbre.sujet.pinceau' },
]

/**
 * La barre qui flotte au-dessus du sujet choisi (capture 20 ; docs/XMIND.md § 8) : une pilule blanche ombrée, des
 * boutons de 28 px (relation, lien web, image, note, tâche), un filet, puis le pinceau, qui ouvre la fenêtre « Style ».
 * « Grow Ideas » de Xmind est de l'IA payante : Notak ne l'a pas.
 *
 * À monter dans la zone de la carte (la surface), en position absolue : `x` et `y` sont les coordonnées du milieu du
 * bord haut du sujet dans cette zone. Elle reste dans la zone, passe sous le sujet si le haut manque de place, ne prend
 * pas le focus (le clavier reste à la carte) et garde ses clics (ni sélection ni double-clic ne traversent).
 */
export function BarreSujet({ x, y, bas, actions, inactifs = {}, choixStyle }: PropsBarreSujet) {
  const racine = useRef<HTMLDivElement>(null)
  const pinceau = useRef<HTMLButtonElement>(null)
  const [style, setStyle] = useState(false)
  const [taille, setTaille] = useState({ l: 0, h: 0, zone: 0, zoneH: 0 })
  // Mesurée à chaque rendu, d'un bord à l'autre : la barre change de largeur avec ses boutons, la zone avec la fenêtre.
  useLayoutEffect(() => {
    const el = racine.current
    if (!el) return
    const mesure = { l: el.offsetWidth, h: el.offsetHeight, zone: el.parentElement?.clientWidth ?? 0, zoneH: el.parentElement?.clientHeight ?? 0 }
    setTaille((avant) => (avant.l === mesure.l && avant.h === mesure.h && avant.zone === mesure.zone && avant.zoneH === mesure.zoneH ? avant : mesure))
  })
  const place = placerBarreSujet({ x, y, bas }, { l: taille.l, h: taille.h }, { l: taille.zone, h: taille.zoneH })
  const arreter = (e: React.SyntheticEvent) => e.stopPropagation()
  return (
    <div
      ref={racine}
      className="notak-arbre-sujet-barre notak-arbre-pilule"
      role="toolbar"
      aria-label={t('arbre.sujet.barre')}
      data-dessous={place.dessous ? '' : undefined}
      style={{ left: place.x, top: place.y }}
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={arreter}
      onDoubleClick={arreter}
      onContextMenu={arreter}
    >
      {BOUTONS.map((b) => (
        <Fragment key={b.id}>
          {b.id === 'style' && <i className="notak-arbre-sujet-filet" aria-hidden="true" />}
          {b.id === 'style' && choixStyle ? (
            <button ref={pinceau} type="button" className="notak-arbre-sujet-bouton" aria-label={t(b.libelle)} title={t(b.libelle)} aria-haspopup="dialog" aria-expanded={style} disabled={inactifs.style} onClick={() => setStyle((o) => !o)}>
              <Icone nom={b.icone} taille={20} trait={1.5} />
            </button>
          ) : (
            <button type="button" className="notak-arbre-sujet-bouton" aria-label={t(b.libelle)} title={t(b.libelle)} disabled={inactifs[b.id]} onClick={actions[b.id]}>
              <Icone nom={b.icone} taille={20} trait={1.5} />
            </button>
          )}
        </Fragment>
      ))}
      {style && choixStyle?.(pinceau, () => setStyle(false))}
    </div>
  )
}
