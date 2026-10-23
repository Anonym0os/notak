import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { Element, Id, Image } from '../../coeur/tableau'
import { Icone, type NomIcone } from '../../icones'
import { t } from '../../langue'
import type { ContexteToile } from '../types'
import { nomTelecharge } from '../fichier/telechargement'
import { aUneCarte } from './geometrie'
import { annoter } from './modeAnnotation'
import { borneDecalage, borneZoom, ordreImages, voisine } from './navigation'
import { recadrer } from './Recadreur'
import { detourerImage } from './Detoureur'

/** L'image montrée en grand, une seule à la fois : la carte qui la porte l'affiche par-dessus la page. */
let ouverte: Id | null = null
const ecouteurs = new Set<() => void>()

export const imageOuverte = () => ouverte
export function ouvrirImage(id: Id | null) {
  if (ouverte === id) return
  ouverte = id
  for (const f of ecouteurs) f()
}
const ecouter = (f: () => void) => {
  ecouteurs.add(f)
  return () => ecouteurs.delete(f)
}

export const useImageOuverte = () => useSyncExternalStore(ecouter, imageOuverte)

/** L'adresse d'un fichier du dépôt, ou `null` s'il manque ; `undefined` le temps de la chercher. */
function useAdresse(contexte: ContexteToile, fichier: string, connue?: string): string | null | undefined {
  const [adresse, setAdresse] = useState<string | null | undefined>(connue)
  useEffect(() => {
    let vivant = true
    if (connue) return setAdresse(connue)
    setAdresse(undefined)
    contexte.services.fichiers?.adresse(fichier).then(
      (a) => vivant && setAdresse(a),
      () => vivant && setAdresse(null),
    )
    return () => {
      vivant = false
    }
  }, [contexte, fichier, connue])
  return adresse
}

/**
 * L'image en grand (la fenêtre V2 de Milanote) : un voile à 70 %, l'image à sa taille au plus avec sa légende,
 * une barre sombre en bas (dessiner, modifier, fond, précédent, suivant, ouvrir, télécharger). La molette, = + − 0
 * zooment de 1 à 4 et on déplace l'image zoomée à la main ; ← ↑ et → ↓ passent d'une image à l'autre, Échap ferme.
 * Un clic sur le fond ferme, pas sur l'image, la légende ni la barre.
 */
export function Visionneuse({ element, adresse: adresseOuverte, contexte }: { element: Element<Image>; adresse: string; contexte: ContexteToile }) {
  const [courantId, setCourantId] = useState(element.id)
  const liste = ordreImages(contexte.magasin.lire().elements)
  const courant = (liste.find((e) => e.id === courantId) ?? element) as Element<Image>
  const c = courant.contenu
  const adresse = useAdresse(contexte, c.fichier, courant.id === element.id ? adresseOuverte : undefined)
  const [zoom, setZoom] = useState(1)
  const [decalage, setDecalage] = useState({ x: 0, y: 0 })
  const [bouge, setBouge] = useState(false)
  const fond = useRef<HTMLDivElement>(null)
  const figure = useRef<HTMLImageElement>(null)
  const geste = useRef<{ x: number; y: number; depart: { x: number; y: number } } | null>(null)
  const pret = useRef<ReturnType<typeof setTimeout>>(undefined)
  const modifiable = !contexte.services.lectureSeule && !contexte.services.presentation
  const plusieurs = liste.length > 1

  const reglerZoom = (vers: number) => {
    const z = borneZoom(vers)
    setZoom(z)
    const r = figure.current?.getBoundingClientRect()
    setDecalage((d) => (z === 1 || !r ? { x: 0, y: 0 } : { x: borneDecalage(d.x, r.width / (zoomRef.current || 1), z), y: borneDecalage(d.y, r.height / (zoomRef.current || 1), z) }))
    // La barre s'estompe le temps du zoom, puis revient.
    setBouge(true)
    clearTimeout(pret.current)
    pret.current = setTimeout(() => setBouge(false), 500)
  }
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const aller = (pas: 1 | -1) => {
    const v = voisine(liste, courant.id, pas)
    if (!v) return
    setCourantId(v.id)
    setZoom(1)
    setDecalage({ x: 0, y: 0 })
  }
  // Les gestes lisent toujours le dernier état.
  const dernier = useRef({ reglerZoom, aller })
  dernier.current = { reglerZoom, aller }

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const faire = (f: () => void) => {
        e.preventDefault()
        e.stopPropagation()
        f()
      }
      const d = dernier.current
      if (e.key === 'Escape') return faire(() => ouvrirImage(null))
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') return faire(() => d.aller(-1))
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') return faire(() => d.aller(1))
      if (e.key === '=' || e.key === '+') return faire(() => d.reglerZoom(zoomRef.current * 1.25))
      if (e.key === '-' || e.key === '_') return faire(() => d.reglerZoom(zoomRef.current / 1.25))
      if (e.key === '0') return faire(() => d.reglerZoom(1))
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [])

  // La molette (et le pincement du pavé tactile, qui arrive en Ctrl + molette) zoome ; il faut un écouteur non passif.
  useEffect(() => {
    const noeud = fond.current
    if (!noeud) return
    const molette = (e: WheelEvent) => {
      e.preventDefault()
      const force = e.ctrlKey ? 0.02 : 0.004
      dernier.current.reglerZoom(zoomRef.current * Math.exp(-e.deltaY * force))
    }
    noeud.addEventListener('wheel', molette, { passive: false })
    return () => noeud.removeEventListener('wheel', molette)
  }, [])
  useEffect(() => () => clearTimeout(pret.current), [])

  const lacher = (e: React.PointerEvent) => {
    geste.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  const sortir = (apres: () => void) => {
    contexte.choisir([courant.id])
    ouvrirImage(null)
    apres()
  }
  const outil = (icone: NomIcone, libelle: string, onClick: () => void, actif = true) => (
    <button type="button" className="notak-visionneuse-outil" aria-label={libelle} title={libelle} disabled={!actif} onClick={onClick}>
      <Icone nom={icone} taille={16} />
    </button>
  )
  const texte = (libelle: string, onClick: () => void) => (
    <button type="button" className="notak-visionneuse-texte" onClick={onClick}>
      {libelle}
    </button>
  )

  return createPortal(
    <div
      ref={fond}
      className="notak-visionneuse"
      role="dialog"
      aria-label={c.legende || t('type.image')}
      onPointerDown={(e) => {
        // Le fond ferme ; l'image, la légende et la barre gardent le clic.
        if (!(e.target instanceof HTMLElement && e.target.closest('[data-garder]'))) ouvrirImage(null)
      }}
    >
      <div className="notak-visionneuse-zone">
        <figure className="notak-visionneuse-figure">
          {adresse ? (
            <img
              ref={figure}
              data-garder
              className="notak-visionneuse-image"
              data-damier={!aUneCarte(c) || undefined}
              data-zoom={zoom > 1 || undefined}
              src={adresse}
              alt={c.legende ?? ''}
              draggable={false}
              style={{ transform: `translate(${decalage.x}px, ${decalage.y}px) scale(${zoom})`, maxWidth: `min(100%, ${c.largeurOrigine}px)` }}
              onPointerDown={(e) => {
                if (zoom <= 1) return
                e.preventDefault()
                e.currentTarget.setPointerCapture(e.pointerId)
                geste.current = { x: e.clientX, y: e.clientY, depart: decalage }
              }}
              onPointerMove={(e) => {
                const g = geste.current
                const r = figure.current?.getBoundingClientRect()
                if (!g || !r) return
                setDecalage({
                  x: borneDecalage(g.depart.x + e.clientX - g.x, r.width / zoom, zoom),
                  y: borneDecalage(g.depart.y + e.clientY - g.y, r.height / zoom, zoom),
                })
              }}
              onPointerUp={lacher}
              onPointerCancel={lacher}
            />
          ) : (
            <span data-garder className="notak-visionneuse-vide" role="img" aria-label={t('image.introuvable')}>
              <Icone nom="imageCassee" taille={32} trait={1.5} />
            </span>
          )}
          {c.legende && (
            <figcaption data-garder className="notak-visionneuse-legende">
              {c.legende}
            </figcaption>
          )}
        </figure>
      </div>
      <div data-garder className="notak-visionneuse-barre" data-estompee={bouge || undefined} role="toolbar" aria-label={t('visionneuse.barre')}>
        {modifiable && texte(t('visionneuse.dessiner'), () => sortir(() => annoter(courant.id)))}
        {modifiable && texte(t('visionneuse.modifier'), () => sortir(() => recadrer(courant.id)))}
        {modifiable && !!contexte.services.fichiers && aUneCarte({ ...c, fondBlanc: false }) && texte(t('visionneuse.fond'), () => sortir(() => detourerImage(courant.id)))}
        {modifiable && <span className="notak-visionneuse-sep" role="separator" />}
        {plusieurs && outil('precedent', t('visionneuse.precedent'), () => aller(-1))}
        {plusieurs && outil('suivant', t('visionneuse.suivant'), () => aller(1))}
        {plusieurs && <span className="notak-visionneuse-sep" role="separator" />}
        {outil('ouvrir', t('visionneuse.ouvrir'), () => adresse && window.open(adresse, '_blank', 'noopener,noreferrer'), !!adresse)}
        {adresse ? (
          <a className="notak-visionneuse-outil" href={adresse} download={nomTelecharge(c)} aria-label={t('visionneuse.telecharger')} title={t('visionneuse.telecharger')} rel="noopener">
            <Icone nom="exporter" taille={16} />
          </a>
        ) : (
          outil('exporter', t('visionneuse.telecharger'), () => {}, false)
        )}
      </div>
    </div>,
    document.body,
  )
}
