import { useLayoutEffect, useRef } from 'react'
import { Icone } from '../../icones'
import { t } from '../../langue'
import { type Jeu, jouerZoom, mouvementPermis } from './diapo/jouer'
import { type Rect, cadreDuZoom } from './diapo/morphing'

/**
 * L'agrandissement d'une image pendant la présentation (relevé 12 § 8.5). Au survol d'une image, un bouton rond à 20 px
 * de son coin bas droit ; il ouvre une fenêtre qui couvre la scène, floutée, sous un voile noir (fond sombre) ou blanc,
 * où une copie de l'image grandit jusqu'à tenir à 72 px des bords. Un clic n'importe où, ou Échap, la referme.
 */

/** L'image visée : son élément dans la diapositive et sa boîte dans la scène. */
export interface ImageVisee {
  el: HTMLElement
  rect: Rect
}

/** Le bouton zoom : 40 px, à 20 px du bas et de la droite de l'image. */
export function BoutonAgrandir({ image, ouvrir }: { image: ImageVisee; ouvrir(): void }) {
  const r = image.rect
  return (
    <button
      type="button"
      className="notak-arbre-pitch-agrandir"
      style={{ left: r.x + r.l - 20 - 40, top: r.y + r.h - 20 - 40 }}
      aria-label={t('arbre.pitch.agrandir')}
      title={t('arbre.pitch.agrandir')}
      onClick={(e) => {
        e.stopPropagation()
        e.currentTarget.blur()
        ouvrir()
      }}
    >
      <Icone nom="zoom" taille={20} trait={2} />
    </button>
  )
}

interface Props {
  image: ImageVisee
  /** La taille de la scène. */
  scene: { l: number; h: number }
  /** Le fond de la diapositive est sombre : voile noir, croix blanche. */
  sombre: boolean
  portrait: boolean
  fermer(): void
  /** Reçoit de quoi refermer en animant (Échap, que la présentation intercepte). */
  refermeur?: { current: (() => void) | null }
}

export function Agrandissement({ image, scene, sombre, portrait, fermer, refermeur }: Props) {
  const fenetre = useRef<HTMLDivElement>(null)
  const copie = useRef<HTMLDivElement>(null)
  const voile = useRef<HTMLDivElement>(null)
  const jeu = useRef<Jeu | null>(null)
  const vers = cadreDuZoom({ l: image.rect.l, h: image.rect.h }, scene)

  useLayoutEffect(() => {
    const c = copie.current
    if (!c || !fenetre.current || !voile.current) return
    // La copie reprend le dessin de l'image (la photo ou l'illustration), à sa nouvelle taille.
    for (const n of image.el.children) c.append(n.cloneNode(true))
    if (mouvementPermis()) jeu.current = jouerZoom(fenetre.current, c, voile.current, image.rect, 'ouvrir')
    return () => {
      jeu.current?.arreter()
      c.replaceChildren()
    }
  }, [image])

  const refermer = () => {
    jeu.current?.arreter()
    if (!mouvementPermis() || !fenetre.current || !copie.current || !voile.current) return fermer()
    const j = jouerZoom(fenetre.current, copie.current, voile.current, image.rect, 'fermer')
    jeu.current = j
    void j.fini.then((auBout) => auBout && fermer())
  }
  if (refermeur) refermeur.current = refermer

  return (
    <div
      ref={fenetre}
      className="notak-arbre-pitch-zoom"
      role="dialog"
      aria-label={t('arbre.pitch.agrandir')}
      data-sombre={sombre ? '' : undefined}
      onClick={(e) => {
        e.stopPropagation()
        refermer()
      }}
    >
      <div ref={voile} className="notak-arbre-pitch-zoom-voile" />
      <div ref={copie} className="notak-arbre-pitch-zoom-image" style={{ left: vers.x, top: vers.y, width: vers.l, height: vers.h }} />
      <button type="button" className="notak-arbre-pitch-zoom-fermer" data-grand={portrait ? '' : undefined} aria-label={t('arbre.pitch.fermerImage')} title={t('arbre.pitch.fermerImage')}>
        <Icone nom="fermer" taille={portrait ? 24 : 16} trait={2} />
      </button>
    </div>
  )
}
