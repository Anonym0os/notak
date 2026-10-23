import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { t } from '../../langue'
import { Envoi, boutonOutil, estLOutil } from '../image/Banque'
import '../image/banque.css'
import type { ContexteToile } from '../types'
import { envoyerFichiers } from '../image/banqueImages'
import { fermerEnvoi, useEnvoiOuvert } from './etatEnvoi'

/** Une feuille qui part vers le haut : le dessin du panneau d'envoi, aux traits de la barre. */
function Dessin() {
  return (
    <svg viewBox="0 0 150 144" width="150" height="144" aria-hidden className="notak-envoi-dessin">
      <rect x="30" y="26" width="78" height="96" rx="8" transform="rotate(-8 69 74)" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2" />
      <path d="M46 20h56l22 22v78a8 8 0 0 1-8 8H46a8 8 0 0 1-8-8V28a8 8 0 0 1 8-8Z" fill="var(--notak-carte, #fff)" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M102 20v16a6 6 0 0 0 6 6h16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M52 62h38M52 76h50M52 90h30" stroke="currentColor" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" />
      <circle cx="108" cy="106" r="20" fill="var(--notak-accent, #3b7ddd)" />
      <path d="M108 115V97m0 0-8 8m8-8 8 8" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Le panneau de l'outil d'envoi : s'ouvre au clic sur l'outil, se pose à sa droite, se ferme au choix, à Échap ou hors de lui. */
export function PanneauEnvoi({ contexte, libelleOutil }: { contexte: ContexteToile; libelleOutil: string }) {
  const ouvert = useEnvoiOuvert()
  // La toile qui s'en va emporte son panneau : le suivant repart fermé.
  useEffect(() => fermerEnvoi, [])
  return ouvert ? <Panneau contexte={contexte} libelleOutil={libelleOutil} /> : null
}

function Panneau({ contexte, libelleOutil }: { contexte: ContexteToile; libelleOutil: string }) {
  const [pos, setPos] = useState<{ left: number; top: number; fleche: number } | null>(null)
  const panneau = useRef<HTMLDivElement>(null)

  // À droite de l'outil, à sa hauteur ; la flèche le désigne même si le panneau remonte pour tenir à l'écran.
  useLayoutEffect(() => {
    const place = () => {
      const bouton = boutonOutil(libelleOutil)
      const p = panneau.current
      if (!bouton || !p) return
      const r = bouton.getBoundingClientRect()
      const h = p.offsetHeight
      const milieu = r.top + r.height / 2
      const top = Math.max(8, Math.min(milieu - 60, window.innerHeight - h - 8))
      setPos({ left: r.right + 15, top, fleche: Math.max(16, Math.min(milieu - top, h - 16)) })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [libelleOutil])

  useEffect(() => {
    const appui = (e: PointerEvent) => {
      const cible = e.target as Element | null
      if (!cible || panneau.current?.contains(cible) || estLOutil(cible, libelleOutil)) return
      fermerEnvoi()
    }
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      fermerEnvoi()
    }
    document.addEventListener('pointerdown', appui, true)
    document.addEventListener('keydown', touche, true)
    return () => {
      document.removeEventListener('pointerdown', appui, true)
      document.removeEventListener('keydown', touche, true)
    }
  }, [libelleOutil])

  const surFichiers = (fichiers: Iterable<File>) => {
    if (envoyerFichiers(fichiers, contexte)) fermerEnvoi()
  }

  return (
    <div
      ref={panneau}
      className="notak-banque notak-envoi"
      role="dialog"
      aria-label={t('fichier.envoi.titre')}
      data-sans-banque=""
      style={pos ? { left: pos.left, top: pos.top, ['--notak-banque-fleche' as string]: `${pos.fleche}px` } : { visibility: 'hidden' }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <Envoi surFichiers={surFichiers} accepte="" choisir={t('fichier.envoi.choisir')} astuce={t('fichier.envoi.astuce')} dessin={<Dessin />} />
    </div>
  )
}
