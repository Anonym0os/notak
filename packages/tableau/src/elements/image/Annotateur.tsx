import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Element, Image, TraitImage } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import {
  type Point2,
  CONTOUR_GOMME_PX,
  EPAISSEURS_PX,
  GOMME_PX,
  ajouterPoint,
  avecTraits,
  cheminTrait,
  couleurSure,
  epaisseurPour,
  gommer,
  traitVise,
  versImage,
} from './annotation'
import { miseEnPage } from './geometrie'
import { annoter, choisirCouleur, choisirEpaisseur, choisirOutil, useAnnotation } from './modeAnnotation'
import { largeurEntiereAffichee } from './tailles'
import { BarreEpaisseur, VoletCouleur, VoletEpaisseur } from '../croquis/partage'
import '../croquis/croquis.css'
import { t } from '../../langue'
import { ico } from '../../icones'

/** Les traits d'une image, en SVG par-dessus elle : l'espace du dessin est celui des pixels de l'image d'origine. */
export function Traits({ contenu, traits, style }: { contenu: Image; traits: readonly TraitImage[]; style: React.CSSProperties }) {
  return (
    <svg
      className="notak-traits"
      viewBox={`0 0 ${contenu.largeurOrigine} ${contenu.hauteurOrigine}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={style}
    >
      {traits.map((t, i) => (
        <path
          key={i}
          d={cheminTrait(t, contenu)}
          fill="none"
          stroke={couleurSure(t.couleur)}
          strokeWidth={t.epaisseur * contenu.largeurOrigine}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}

type Geste = { outil: 'crayon'; points: Point2[]; avant: TraitImage[]; trait: Omit<TraitImage, 'points'> } | { outil: 'gomme'; avant: TraitImage[] }
type Volet = 'couleur' | 'epaisseur' | null
const ROUGE_GOMME = '#ff0000'

/**
 * La couche qui prend le crayon ou la gomme au-dessus de l'image, avec sa barre en pilule (celle du croquis). Le trait
 * est celui du croquis : tous les points du pointeur, lissés par les milieux, bouts ronds, largeur constante à
 * l'écran. La gomme retire le trait entier qu'elle touche, cerné de rouge avant. Les gestes se gardent en brouillon
 * (`brouillon` les montre sur l'image) : Enregistrer (⌘S, ou quitter le mode) les pose en un seul pas dans le
 * tableau, Abandonner (Échap) les jette.
 */
export function Annotateur({
  element,
  contexte,
  brouillon,
}: {
  element: Element<Image>
  contexte: ContexteToile
  brouillon(traits: TraitImage[] | null): void
}) {
  const { outil, couleur, epaisseur } = useAnnotation()
  const boite = useRef<HTMLDivElement>(null)
  const geste = useRef<Geste | null>(null)
  const depart = useRef<readonly TraitImage[]>(element.contenu.traits ?? [])
  const [traits, setTraits] = useState<TraitImage[]>([...depart.current])
  const [passe, setPasse] = useState<TraitImage[][]>([])
  const [futur, setFutur] = useState<TraitImage[][]>([])
  const [volet, setVolet] = useState<Volet>(null)
  const [vise, setVise] = useState<number>(-1)
  const [precedente, setPrecedente] = useState(couleur)
  const modifie = passe.length > 0
  // Ce que les écouteurs du document et le démontage doivent lire à jour.
  const sur = useRef({ traits, modifie, outil, couleur, volet, precedente, annuler: () => {}, retablir: () => {}, enregistrer: () => {}, abandonner: () => {} })
  const decide = useRef(false)

  const actuel = (): Image => (contexte.magasin.lire().elements.find((e) => e.id === element.id)?.contenu as Image | undefined) ?? element.contenu
  const poser = (suite: TraitImage[]) => {
    setTraits(suite)
    brouillon(suite)
  }
  const valider = (suite: TraitImage[], avant: TraitImage[]) => {
    setPasse((p) => [...p.slice(-99), avant])
    setFutur([])
    poser(suite)
  }
  const annuler = () => {
    const avant = passe.at(-1)
    if (!avant) return
    setPasse(passe.slice(0, -1))
    setFutur([...futur, traits])
    poser(avant)
  }
  const retablir = () => {
    const apres = futur.at(-1)
    if (!apres) return
    setFutur(futur.slice(0, -1))
    setPasse([...passe, traits])
    poser(apres)
  }
  /** Pose le brouillon dans le tableau, en un pas. */
  const garder = () => {
    const { traits: finaux, modifie: change } = sur.current
    if (!change) return
    const c = actuel()
    contexte.magasin.faire([{ type: 'contenu', id: element.id, avant: c, apres: avecTraits(c, finaux) }])
  }
  const enregistrer = () => {
    decide.current = true
    garder()
    brouillon(null)
    annoter(null)
  }
  const abandonner = () => {
    decide.current = true
    brouillon(null)
    annoter(null)
  }
  sur.current = { traits, modifie, outil, couleur, volet, precedente, annuler, retablir, enregistrer, abandonner }

  // Sortir du mode sans choisir (l'image n'est plus choisie, un autre outil s'ouvre) garde ce qui est dessiné.
  useEffect(
    () => () => {
      if (!decide.current) garder()
      brouillon(null)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const prendreCouleur = (c: string) => {
    if (c !== couleur) setPrecedente(couleur)
    choisirCouleur(c)
  }

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const s = sur.current
      const cmd = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      const pris = () => {
        e.preventDefault()
        e.stopPropagation()
      }
      if (cmd && k === 'z') {
        pris()
        if (e.shiftKey) s.retablir()
        else s.annuler()
      } else if (cmd && k === 's') {
        pris()
        s.enregistrer()
      } else if (e.key === 'Escape') {
        pris()
        if (s.volet) setVolet(null)
        else s.abandonner()
      } else if (cmd || e.altKey || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA' || e.shiftKey) {
        // Maj+D (sortir du mode) et le reste appartiennent à la toile.
      } else if (k === 'd' || k === 'm' || k === 'b') {
        pris()
        choisirOutil('crayon')
      } else if (k === 'e') {
        pris()
        choisirOutil('gomme')
      } else if (k === 'c') {
        pris()
        setVolet((v) => (v === 'couleur' ? null : 'couleur'))
      } else if (k === 'x') {
        pris()
        choisirCouleur(s.precedente)
      } else if (k >= '1' && k <= '4') {
        pris()
        choisirEpaisseur(Number(k) - 1)
      }
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [])

  const point = (e: { clientX: number; clientY: number }): { p: Point2; largeurPx: number } | null => {
    const r = boite.current?.getBoundingClientRect()
    if (!r || r.width === 0 || r.height === 0) return null
    return { p: versImage((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, actuel()), largeurPx: r.width }
  }

  const descendre = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const cible = point(e)
    if (!cible) return
    setVolet(null)
    e.currentTarget.setPointerCapture(e.pointerId)
    const c = actuel()
    if (outil === 'crayon') {
      const largeurImage = largeurEntiereAffichee(c, cible.largeurPx)
      geste.current = { outil: 'crayon', points: [cible.p], avant: traits, trait: { couleur, epaisseur: epaisseurPour(EPAISSEURS_PX[epaisseur]!, largeurImage) } }
      brouillon([...traits, { ...geste.current.trait, points: [cible.p] }])
    } else {
      geste.current = { outil: 'gomme', avant: traits }
      setVise(-1)
      passerLaGomme(cible.p, cible.largeurPx, c)
    }
  }

  const passerLaGomme = (p: Point2, largeurPx: number, c: Image) => {
    const g = geste.current
    if (g?.outil !== 'gomme') return
    const apres = gommer(sur.current.traits, p, GOMME_PX / largeurEntiereAffichee(c, largeurPx), c)
    if (apres.length === sur.current.traits.length) return
    sur.current.traits = apres
    poser(apres)
  }

  const bouger = (e: React.PointerEvent) => {
    const g = geste.current
    const cible = point(e)
    if (!cible) return
    const c = actuel()
    if (!g) {
      if (outil === 'gomme') {
        const i = traitVise(traits, cible.p, GOMME_PX / largeurEntiereAffichee(c, cible.largeurPx), c)
        setVise((v) => (v === i ? v : i))
      }
      return
    }
    if (g.outil === 'crayon') {
      // Le navigateur regroupe parfois plusieurs mouvements en un : on les reprend tous.
      const evenements = e.nativeEvent.getCoalescedEvents?.() ?? []
      let points = g.points
      for (const m of evenements.length > 0 ? evenements : [e.nativeEvent]) {
        const q = point(m)
        if (q) points = ajouterPoint(points, q.p, c)
      }
      if (points === g.points) return
      g.points = points
      brouillon([...g.avant, { ...g.trait, points }])
    } else {
      passerLaGomme(cible.p, cible.largeurPx, c)
    }
  }

  const finir = () => {
    const g = geste.current
    geste.current = null
    if (!g) return
    if (g.outil === 'crayon') valider([...g.avant, { ...g.trait, points: g.points }], g.avant)
    else if (sur.current.traits !== g.avant) valider(sur.current.traits, g.avant)
  }

  const c = actuel()
  const cible = vise >= 0 && outil === 'gomme' ? traits[vise] : undefined
  const largeurPx = boite.current?.getBoundingClientRect().width ?? 0
  const extra = largeurPx > 0 ? CONTOUR_GOMME_PX / largeurEntiereAffichee(c, largeurPx) : 0

  return (
    <>
      <div
        ref={boite}
        className="notak-annotation"
        data-outil={outil}
        onPointerDown={descendre}
        onPointerMove={bouger}
        onPointerUp={finir}
        onPointerCancel={finir}
        onPointerLeave={() => setVise(-1)}
      >
        {cible && (
          <div className="notak-image-plan notak-annotation-vise" style={miseEnPage(c).plan}>
            <svg className="notak-traits" viewBox={`0 0 ${c.largeurOrigine} ${c.hauteurOrigine}`} preserveAspectRatio="none" aria-hidden="true" style={miseEnPage(c).image}>
              <path d={cheminTrait(cible, c)} fill="none" stroke={ROUGE_GOMME} strokeWidth={(cible.epaisseur + extra) * c.largeurOrigine} strokeLinecap="round" strokeLinejoin="round" />
              <path d={cheminTrait(cible, c)} fill="none" stroke={couleurSure(cible.couleur)} strokeWidth={cible.epaisseur * c.largeurOrigine} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>
      {createPortal(
        <div className="notak-croquis-barre notak-annotation-barre" role="toolbar" aria-label={t('croquis.outil')} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <button type="button" title={`${t('dessin.crayon')} (D)`} aria-label={t('dessin.crayon')} aria-pressed={outil === 'crayon'} onClick={() => choisirOutil('crayon')}>
            {ico('croquis')}
          </button>
          <button type="button" title={`${t('dessin.gomme')} (E)`} aria-label={t('dessin.gomme')} aria-pressed={outil === 'gomme'} onClick={() => choisirOutil('gomme')}>
            {ico('gomme')}
          </button>
          <span className="notak-croquis-sep" role="separator" />
          <span className="notak-croquis-volet-hote">
            <button type="button" title={`${t('couleur.titre')} (C)`} aria-label={t('couleur.titre')} aria-expanded={volet === 'couleur'} onClick={() => setVolet(volet === 'couleur' ? null : 'couleur')}>
              <span className="notak-croquis-pastille" style={{ background: couleur }} />
            </button>
            {volet === 'couleur' && <VoletCouleur couleur={couleur} choisir={prendreCouleur} />}
          </span>
          <span className="notak-croquis-volet-hote">
            <button type="button" title={`${t('croquis.epaisseur')} (1-4)`} aria-label={t('croquis.epaisseur')} aria-expanded={volet === 'epaisseur'} onClick={() => setVolet(volet === 'epaisseur' ? null : 'epaisseur')}>
              <BarreEpaisseur i={epaisseur} />
            </button>
            {volet === 'epaisseur' && <VoletEpaisseur epaisseur={epaisseur} choisir={choisirEpaisseur} />}
          </span>
          <span className="notak-croquis-sep" role="separator" />
          <button type="button" title={`${t('espace.annuler')} (⌘Z)`} aria-label={t('espace.annuler')} disabled={passe.length === 0} onClick={annuler}>
            {ico('annuler')}
          </button>
          <button type="button" title={`${t('espace.retablir')} (⌘⇧Z)`} aria-label={t('espace.retablir')} disabled={futur.length === 0} onClick={retablir}>
            {ico('retablir')}
          </button>
          <span className="notak-croquis-espace" />
          <button type="button" className="notak-croquis-texte" title="Esc" onClick={abandonner}>
            {modifie ? t('croquis.abandonner') : t('commun.annuler')}
          </button>
          <button type="button" className="notak-croquis-texte notak-croquis-enregistrer" title="⌘S" disabled={!modifie} onClick={enregistrer}>
            {t('croquis.enregistrer')}
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}
