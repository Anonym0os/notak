import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Dessin, Trait } from '../../coeur/tableau'
import { cheminLisse } from '../croquis/trace'
import type { ContexteToile, PropsRendu } from '../types'
import { dessinDepuis } from './trace'
import { t } from '../../langue'

export function RenduDessin({ element }: PropsRendu<Dessin>) {
  const c = element.contenu
  return (
    <svg className="notak-dessin" viewBox={`0 0 ${c.largeurOrigine} ${c.hauteurOrigine}`} style={{ aspectRatio: `${c.largeurOrigine} / ${c.hauteurOrigine}` }}>
      {c.traits.map((tr, i) => (
        <path key={i} d={cheminLisse(tr.points)} stroke={tr.couleur} strokeWidth={tr.epaisseur} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  )
}

const COULEURS = ['#1f2328', '#d84b4b', '#3a76df', '#3c9d5b', '#ef8a2f']
/** L'épaisseur du crayon, en pixels d'écran : le trait garde la même allure quel que soit le zoom. */
const EPAISSEUR_ECRAN = 3

/**
 * Le dessin libre : une couche posée sur la toile, où le pointeur trace. Entrée ou « Terminer » pose ce qui a été
 * tracé comme un élément (un seul pas d'annulation) ; Échap aussi, et ne pose rien si rien n'a été tracé.
 */
export function ouvrirDessinLibre(contexte: ContexteToile) {
  const toile = document.querySelector<HTMLElement>('.notak-toile')
  if (!toile || contexte.services.lectureSeule) return
  const hote = document.createElement('div')
  hote.className = 'notak-dessin-libre'
  toile.append(hote)
  const racine = createRoot(hote)
  const fermer = (traits: Trait[]) => {
    const el = dessinDepuis(traits)
    if (el) {
      contexte.magasin.faire([{ type: 'creer', element: el }])
      contexte.choisir([el.id])
    }
    racine.unmount()
    hote.remove()
    toile.focus({ preventScroll: true })
  }
  racine.render(<Couche contexte={contexte} hote={hote} fermer={fermer} />)
}

function Couche({ contexte, hote, fermer }: { contexte: ContexteToile; hote: HTMLElement; fermer(traits: Trait[]): void }) {
  const [traits, setTraits] = useState<Trait[]>([])
  const [couleur, setCouleur] = useState(COULEURS[0]!)
  const [enCours, setEnCours] = useState<number[] | null>(null)
  const sur = useRef(traits)
  sur.current = traits
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return
      e.preventDefault()
      e.stopPropagation()
      fermer(sur.current)
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [fermer])
  // Les traits se gardent en UG du tableau ; on les dessine à l'écran par la caméra du moment.
  const ici = (e: React.PointerEvent) => {
    const r = hote.getBoundingClientRect()
    return contexte.versTableau({ x: e.clientX - r.left, y: e.clientY - r.top })
  }
  const echelle = contexte.camera.echelle * 10
  const epaisseur = EPAISSEUR_ECRAN / echelle
  const versEcran = (points: readonly number[]) => {
    const o = contexte.versTableau({ x: 0, y: 0 })
    return points.map((v, i) => (v - (i % 2 === 0 ? o.x : o.y)) * echelle)
  }
  return (
    <>
      <svg
        className="notak-dessin-libre-feuille"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.stopPropagation()
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            // Sans capture, le trait suit tant que le pointeur reste sur la couche.
          }
          const p = ici(e)
          setEnCours([p.x, p.y])
        }}
        onPointerMove={(e) => {
          if (!enCours) return
          const p = ici(e)
          setEnCours((pts) => (pts ? [...pts, p.x, p.y] : pts))
        }}
        onPointerUp={() => {
          if (enCours && enCours.length >= 2) setTraits((tr) => [...tr, { points: enCours, couleur, epaisseur }])
          setEnCours(null)
        }}
      >
        {[...traits, ...(enCours ? [{ points: enCours, couleur, epaisseur }] : [])].map((tr, i) => (
          <path key={i} d={cheminLisse(versEcran(tr.points))} stroke={tr.couleur} strokeWidth={tr.epaisseur * echelle} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
      <div className="notak-dessin-libre-barre" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <span>{t('dessin.surToile')}</span>
        {COULEURS.map((c) => (
          <button key={c} type="button" aria-label={t('image.couleurTrait', { couleur: c })} aria-pressed={couleur === c} style={{ background: c }} onClick={() => setCouleur(c)} />
        ))}
        <button type="button" className="notak-dessin-libre-texte" disabled={traits.length === 0} onClick={() => setTraits((tr) => tr.slice(0, -1))}>
          {t('dessin.annulerTrait')}
        </button>
        <button type="button" className="notak-dessin-libre-texte notak-dessin-libre-fin" onClick={() => fermer(traits)}>
          {t('commun.terminer')}
        </button>
      </div>
    </>
  )
}
