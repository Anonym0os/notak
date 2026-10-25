import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { t } from '../langue'
import { GRACE, HAUT, REMPLISSAGE, SEUIL, type Titre, cibleDefilement, elementVisible, estCache, longueurTrait, memesTitres, placeSuffisante, retraitLigne, titreCourant, titresDe, titresDuRendu } from './sommaireTitres'
import './sommaire.css'

/**
 * Le sommaire latéral de la page (docs/NOTION.md § 9). Au repos, une colonne de traits fixée à droite de la fenêtre, un
 * par titre ; au survol, un panneau liste les titres et un clic défile jusqu'à l'un d'eux. Il se monte dans la zone qui
 * défile (`.notak-document-corps`) : `editeur` pour le document en édition (les titres se lisent dans le texte à
 * chaque mise à jour), sinon `lecture`, où ils se lisent dans le rendu. Il n'existe qu'à partir de deux titres, et si
 * la fenêtre laisse la place à droite du texte.
 */
export function Sommaire({ editeur, lecture }: { editeur?: Editor | null | undefined; lecture?: boolean | undefined }) {
  const racine = useRef<HTMLElement>(null)
  const [titres, setTitres] = useState<Titre[]>([])
  const [courant, setCourant] = useState(0)
  // Le haut de la colonne dans la fenêtre, ou `null` quand la place manque.
  const [haut, setHaut] = useState<number | null>(null)
  const [ouvert, setOuvert] = useState(false)
  const delai = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const zone = () => racine.current?.closest<HTMLElement>('.notak-document-corps') ?? null

  // La liste des titres : relue à chaque mise à jour du texte (ou du rendu).
  useEffect(() => {
    const z = zone()
    if (!z) return
    const lire = () => {
      const liste = editeur ? (editeur.isDestroyed ? [] : titresDe(editeur.state.doc)) : lecture ? titresDuRendu(z.querySelector('.notak-blocs')) : []
      setTitres((avant) => (memesTitres(avant, liste) ? avant : liste))
    }
    lire()
    if (editeur) {
      editeur.on('update', lire)
      return () => void editeur.off('update', lire)
    }
    const observateur = new MutationObserver(lire)
    observateur.observe(z, { childList: true, subtree: true, characterData: true })
    return () => observateur.disconnect()
  }, [editeur, lecture])

  // Les éléments des titres dans la page, dans l'ordre de `titres` (`null` : pas retrouvé).
  const elements = (z: HTMLElement): (HTMLElement | null)[] => {
    const tous = [...(z.querySelector('.notak-blocs')?.querySelectorAll<HTMLElement>('h1, h2, h3') ?? [])]
    const parId = new Map(tous.flatMap((el) => (el.dataset.bloc ? [[el.dataset.bloc, el] as const] : [])))
    return titres.map((titre, i) => (titre.id ? parId.get(titre.id) : undefined) ?? (tous.length === titres.length ? tous[i] : undefined) ?? null)
  }

  // La place et le titre courant : à l'ouverture, au changement de taille, à chaque mise à jour, et au défilement (une
  // seule lecture par image).
  useEffect(() => {
    const z = zone()
    if (!z || titres.length < 2) return setHaut(null)
    let image = 0
    const lireCourant = () => {
      image = 0
      const hautZone = z.getBoundingClientRect().top
      setCourant(titreCourant(elements(z).map((el) => (el && !estCache(el) ? el.getBoundingClientRect().top - hautZone : null)), SEUIL))
    }
    const planifier = () => {
      if (!image) image = requestAnimationFrame(lireCourant)
    }
    const mesurer = () => {
      const droiteTexte = z.querySelector('.notak-blocs')?.getBoundingClientRect().right ?? 0
      setHaut(placeSuffisante(window.innerWidth, droiteTexte) ? Math.round(z.getBoundingClientRect().top + HAUT) : null)
      lireCourant()
    }
    mesurer()
    z.addEventListener('scroll', planifier, { passive: true })
    window.addEventListener('resize', mesurer)
    editeur?.on('update', planifier)
    const observateur = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(mesurer)
    observateur?.observe(z)
    return () => {
      cancelAnimationFrame(image)
      z.removeEventListener('scroll', planifier)
      window.removeEventListener('resize', mesurer)
      editeur?.off('update', planifier)
      observateur?.disconnect()
    }
  }, [titres, editeur])

  useEffect(() => () => clearTimeout(delai.current), [])

  const ouvrir = () => {
    clearTimeout(delai.current)
    setOuvert(true)
  }
  const fermerBientot = () => {
    clearTimeout(delai.current)
    delai.current = setTimeout(() => setOuvert(false), GRACE)
  }
  const aller = (i: number) => {
    const z = zone()
    const el = z && elements(z)[i]
    clearTimeout(delai.current)
    setOuvert(false)
    if (racine.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
    if (!z || !el) return
    const haut = cibleDefilement(elementVisible(el).getBoundingClientRect().top, z.getBoundingClientRect().top, z.scrollTop)
    if (typeof z.scrollTo === 'function') z.scrollTo({ top: haut, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    else z.scrollTop = haut
  }

  const visible = haut !== null && titres.length >= 2
  return (
    <nav
      ref={racine}
      className="notak-sommaire"
      aria-label={t('page.sommaire')}
      hidden={!visible}
      data-ouvert={ouvert || undefined}
      style={{ top: (haut ?? 0) - REMPLISSAGE.haut }}
      onMouseEnter={ouvrir}
      onMouseLeave={fermerBientot}
      onFocus={ouvrir}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOuvert(false)
      }}
    >
      <div className="notak-sommaire-traits" aria-hidden="true">
        {titres.map((titre, i) => (
          <span key={i} className="notak-sommaire-trait" data-courant={i === courant || undefined} style={{ width: longueurTrait(titre.niveau) }} />
        ))}
      </div>
      <ul className="notak-sommaire-panneau" onMouseDown={(e) => e.preventDefault()}>
        {titres.map((titre, i) => (
          <li key={i} style={{ paddingLeft: retraitLigne(titre.niveau) }}>
            <button type="button" className="notak-sommaire-ligne" data-courant={i === courant || undefined} onClick={() => aller(i)}>
              {titre.texte.trim() || t('commun.sansTitre')}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
