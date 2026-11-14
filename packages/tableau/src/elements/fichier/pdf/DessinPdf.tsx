import { type KeyboardEvent as ToucheReact, type PointerEvent as PointeurReact, type ReactNode, useEffect, useRef, useState } from 'react'
import { type Element, type Fichier, type TraitPage, nouvelId } from '../../../coeur/tableau'
import { permis } from '../../../coeur/droitsElements'
import type { ContexteToile } from '../../types'
import { ico } from '../../../icones'
import { t } from '../../../langue'
import { CONTOUR_GOMME_PX, EPAISSEURS_PX, GOMME_PX, cheminTrait, couleurSure } from '../../image/annotation'
import { choisirCouleur, choisirEpaisseur, useAnnotation } from '../../image/modeAnnotation'
import { COULEUR_SURLIGNEUR_DEFAUT, EPAISSEURS_SURLIGNEUR, OPACITE_SURLIGNEUR, ecrireReglage, lireReglage } from '../../croquis/trace'
import { BarreEpaisseur, CURSEUR_GOMME, VoletCouleur, VoletEpaisseur, curseurCrayon } from '../../croquis/partage'
import '../../croquis/croquis.css'
import type { TaillePage } from './mise'
import {
  type Pages,
  avecAnnotations,
  avecTraitsDePage,
  epaisseurSurPage,
  fusionnerAnnotations,
  gommerPage,
  pointSurPage,
  prolonger,
  traitViseSurPage,
  traitsDeLaPage,
} from './annotations'

export type OutilDessin = 'crayon' | 'surligneur' | 'gomme'
type Volet = 'couleur' | 'epaisseur' | null

// Le surligneur garde sa couleur et son épaisseur, celles du dessin libre de la toile.
const CLE_COULEUR_SURLIGNEUR = 'notak.dessin.surligneur.couleur'
const CLE_EPAISSEUR_SURLIGNEUR = 'notak.dessin.surligneur.epaisseur'
const ROUGE_GOMME = '#ff0000'

/**
 * On dessine sur ce PDF : il est sur une toile qu'on peut écrire, l'élément n'est pas figé, et ni une présentation ni
 * l'aperçu d'un modèle ne sont en cours. En lecture seule, on voit les traits sans en tracer.
 */
export function peutDessiner(element: Element<Fichier> | undefined, contexte: ContexteToile | undefined): boolean {
  const s = contexte?.services
  if (!element || !s || s.lectureSeule || s.presentation || s.apercuModele || element.verrou) return false
  return s.droits ? permis(s.droits, element.id, 'ecriture') : true
}

/** Les traits du document, tels qu'on peut les dessiner, page par page. */
const lirePages = (annotations: Fichier['annotations']): Pages =>
  Object.fromEntries(Object.keys(annotations ?? {}).flatMap((p) => {
    const traits = traitsDeLaPage(annotations, Number(p))
    return traits.length > 0 ? [[p, traits]] : []
  }))

/**
 * Les traits d'une page, en SVG entre l'image de la page et son texte : l'espace du dessin est celui de la page, en
 * points. Le surligneur est translucide et se mêle à l'encre (le texte dessous reste noir). `vise` : le trait que la
 * gomme retirerait, cerné de rouge.
 */
export function CalqueTraits({ traits, taille, vise, contour = 0 }: { traits: readonly TraitPage[]; taille: TaillePage; vise?: TraitPage | undefined; contour?: number }) {
  if (traits.length === 0) return null
  const image = { largeurOrigine: taille.largeur, hauteurOrigine: taille.hauteur }
  const chemin = (tr: TraitPage, couleur: string, extra = 0, surligne = !!tr.surligneur) => (
    <path
      d={cheminTrait(tr, image)}
      fill="none"
      stroke={couleur}
      strokeWidth={(tr.epaisseur + extra) * taille.largeur}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(surligne ? { strokeOpacity: OPACITE_SURLIGNEUR, 'data-surligneur': '' } : {})}
    />
  )
  return (
    <svg className="notak-pdf-traits" viewBox={`0 0 ${taille.largeur} ${taille.hauteur}`} preserveAspectRatio="none" aria-hidden="true">
      {traits.map((tr) => (
        <g key={tr.id}>
          {tr === vise && chemin(tr, ROUGE_GOMME, contour, false)}
          {chemin(tr, couleurSure(tr.couleur))}
        </g>
      ))}
    </svg>
  )
}

/** Le geste en cours, tenu par un seul pointeur : un autre doigt ne s'y mêle pas. */
interface Geste {
  pointeur: number
  toucher: boolean
  page: number
  taille: TaillePage
  largeurPx: number
  /** Le brouillon au début du geste : l'annuler y revient. */
  avant: Pages
  trait?: TraitPage
}

interface Brouillon {
  depart: Pages
  traits: Pages
  passe: Pages[]
  futur: Pages[]
}

/**
 * Le dessin sur les pages d'un PDF, comme celui d'une image (`image/Annotateur.tsx`) : crayon, surligneur, gomme,
 * couleurs et épaisseurs, dans la même barre en pilule. Les gestes se gardent en brouillon, avec leur propre annuler et
 * rétablir ; « Enregistrer » (⌘S, ⇧D, ou fermer la visionneuse) les pose en un seul pas dans le tableau, par-dessus ce
 * que d'autres ont dessiné entre-temps ; « Abandonner » (Échap) les jette. Un doigt dessine, deux font défiler et zoomer.
 */
export function useDessinPdf({ element, contexte, annotations }: { element: Element<Fichier> | undefined; contexte: ContexteToile | undefined; annotations: Fichier['annotations'] }) {
  const autorise = peutDessiner(element, contexte)
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null)
  const [outil, setOutil] = useState<OutilDessin>('crayon')
  const [volet, setVolet] = useState<Volet>(null)
  const crayon = useAnnotation()
  const [precedente, setPrecedente] = useState(crayon.couleur)
  const [surligneur, setSurligneur] = useState(() => {
    const c = lireReglage(CLE_COULEUR_SURLIGNEUR)
    const e = Number(lireReglage(CLE_EPAISSEUR_SURLIGNEUR) ?? 1)
    return { couleur: c && /^#[0-9a-f]{6}$/i.test(c) ? c : COULEUR_SURLIGNEUR_DEFAUT, epaisseur: Number.isInteger(e) && e >= 0 && e < EPAISSEURS_SURLIGNEUR.length ? e : 1 }
  })
  const [enCours, setEnCours] = useState<{ page: number; trait: TraitPage } | null>(null)
  const [vise, setVise] = useState<{ page: number; id: string } | null>(null)
  const geste = useRef<Geste | null>(null)
  const modifie = !!brouillon && brouillon.passe.length > 0
  const encre = outil === 'surligneur' ? surligneur.couleur : crayon.couleur
  const epaisseur = outil === 'surligneur' ? surligneur.epaisseur : crayon.epaisseur

  /** Pose le brouillon dans le tableau, en un pas, sur les annotations telles qu'elles sont maintenant. */
  const garder = (b: Brouillon | null) => {
    if (!b || b.passe.length === 0 || !element || !contexte) return
    const actuel = (contexte.magasin.lire().elements.find((e) => e.id === element.id)?.contenu as Fichier | undefined) ?? element.contenu
    const fusion = fusionnerAnnotations(actuel.annotations ?? {}, b.depart, b.traits)
    const apres = avecAnnotations(actuel, fusion)
    if (JSON.stringify(apres) !== JSON.stringify(actuel)) contexte.magasin.faire([{ type: 'contenu', id: element.id, avant: actuel, apres }])
  }
  const commencer = () => {
    if (!autorise || brouillon) return
    const depart = lirePages(annotations)
    setBrouillon({ depart, traits: depart, passe: [], futur: [] })
    setOutil('crayon')
    setVolet(null)
  }
  const fermer = () => {
    geste.current = null
    setEnCours(null)
    setVise(null)
    setVolet(null)
    setBrouillon(null)
  }
  const enregistrer = () => {
    garder(sur.current.brouillon)
    fermer()
  }
  const valider = (traits: Pages, avant: Pages) =>
    setBrouillon((b) => (b ? { ...b, traits, passe: [...b.passe.slice(-99), avant], futur: [] } : b))
  const annuler = () =>
    setBrouillon((b) => {
      const avant = b?.passe.at(-1)
      return b && avant ? { ...b, traits: avant, passe: b.passe.slice(0, -1), futur: [...b.futur, b.traits] } : b
    })
  const retablir = () =>
    setBrouillon((b) => {
      const apres = b?.futur.at(-1)
      return b && apres ? { ...b, traits: apres, futur: b.futur.slice(0, -1), passe: [...b.passe, b.traits] } : b
    })
  const prendreCouleur = (c: string) => {
    if (outil === 'surligneur') {
      ecrireReglage(CLE_COULEUR_SURLIGNEUR, c)
      setSurligneur((s) => ({ ...s, couleur: c }))
      return
    }
    if (c !== crayon.couleur) setPrecedente(crayon.couleur)
    choisirCouleur(c)
    setOutil('crayon')
  }
  const prendreEpaisseur = (i: number) => {
    if (outil === 'surligneur') {
      if (!(i >= 0 && i < EPAISSEURS_SURLIGNEUR.length)) return
      ecrireReglage(CLE_EPAISSEUR_SURLIGNEUR, String(i))
      setSurligneur((s) => ({ ...s, epaisseur: i }))
      return
    }
    choisirEpaisseur(i)
    setOutil('crayon')
  }

  // Ce que les écouteurs et le départ lisent à jour.
  const sur = useRef({ brouillon, outil, volet, precedente, annuler, retablir, enregistrer, fermer, prendreCouleur, prendreEpaisseur })
  sur.current = { brouillon, outil, volet, precedente, annuler, retablir, enregistrer, fermer, prendreCouleur, prendreEpaisseur }

  // La visionneuse qui se ferme en plein dessin garde ce qui est dessiné, comme l'image qu'on quitte.
  useEffect(
    () => () => garder(sur.current.brouillon),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Un deuxième doigt posé pendant un trait au doigt, c'est la page qu'on pince ou fait défiler : le trait s'efface.
  useEffect(() => {
    const second = (e: PointerEvent) => {
      const g = geste.current
      if (!g?.toucher || e.pointerType !== 'touch' || e.pointerId === g.pointeur) return
      geste.current = null
      setEnCours(null)
      setBrouillon((b) => (b ? { ...b, traits: g.avant } : b))
    }
    window.addEventListener('pointerdown', second, true)
    return () => window.removeEventListener('pointerdown', second, true)
  }, [])

  const traitsDe = (page: number): TraitPage[] => {
    if (!brouillon) return traitsDeLaPage(annotations, page)
    const traits = brouillon.traits[String(page)] ?? []
    return enCours && enCours.page === page ? [...traits, enCours.trait] : traits
  }
  const viseDe = (page: number): TraitPage | undefined =>
    vise && vise.page === page && outil === 'gomme' ? brouillon?.traits[String(page)]?.find((tr) => tr.id === vise.id) : undefined

  const passerLaGomme = (g: Geste, p: [number, number]) => {
    setBrouillon((b) => {
      if (!b) return b
      const traits = b.traits[String(g.page)] ?? []
      const apres = gommerPage(traits, p, GOMME_PX / Math.max(1, g.largeurPx), g.taille)
      return apres.length === traits.length ? b : { ...b, traits: avecTraitsDePage(b.traits, g.page, apres) }
    })
  }

  /** La couche qui prend le crayon, le surligneur ou la gomme au-dessus d'une page (1 pour la première). */
  const saisie = (page: number, taille: TaillePage): ReactNode => {
    if (!brouillon) return null
    const descendre = (e: PointeurReact<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      if (geste.current) return
      const r = e.currentTarget.getBoundingClientRect()
      const p = pointSurPage(e.clientX, e.clientY, r)
      setVolet(null)
      e.currentTarget.setPointerCapture?.(e.pointerId)
      const g: Geste = { pointeur: e.pointerId, toucher: e.pointerType === 'touch', page, taille, largeurPx: r.width, avant: brouillon.traits }
      if (outil === 'gomme') {
        geste.current = g
        setVise(null)
        passerLaGomme(g, p)
        return
      }
      const px = outil === 'surligneur' ? EPAISSEURS_SURLIGNEUR[epaisseur]!.px : EPAISSEURS_PX[epaisseur]!
      const trait: TraitPage = { id: nouvelId(), couleur: encre, epaisseur: epaisseurSurPage(px, r.width), points: [p], ...(outil === 'surligneur' ? { surligneur: true } : {}) }
      geste.current = { ...g, trait }
      setEnCours({ page, trait })
    }
    const bouger = (e: PointeurReact<HTMLDivElement>) => {
      const g = geste.current
      if (g && g.pointeur !== e.pointerId) return
      const r = e.currentTarget.getBoundingClientRect()
      if (!g) {
        if (outil !== 'gomme') return
        const traits = brouillon.traits[String(page)] ?? []
        const i = traitViseSurPage(traits, pointSurPage(e.clientX, e.clientY, r), GOMME_PX / Math.max(1, r.width), taille)
        const id = i >= 0 ? traits[i]!.id : null
        setVise((v) => (id === null ? null : v?.id === id && v.page === page ? v : { page, id }))
        return
      }
      if (!g.trait) return passerLaGomme(g, pointSurPage(e.clientX, e.clientY, r))
      // Le navigateur regroupe parfois plusieurs mouvements en un : on les reprend tous.
      const evenements = e.nativeEvent.getCoalescedEvents?.() ?? []
      let points = g.trait.points
      for (const m of evenements.length > 0 ? evenements : [e.nativeEvent]) points = prolonger(points, pointSurPage(m.clientX, m.clientY, r))
      if (points === g.trait.points) return
      g.trait = { ...g.trait, points }
      setEnCours({ page, trait: g.trait })
    }
    const finir = (e: PointeurReact<HTMLDivElement>) => {
      const g = geste.current
      if (!g || g.pointeur !== e.pointerId) return
      geste.current = null
      if (g.trait) {
        const trait = g.trait
        setEnCours(null)
        valider(avecTraitsDePage(g.avant, page, [...(g.avant[String(page)] ?? []), trait]), g.avant)
      } else if (sur.current.brouillon && sur.current.brouillon.traits !== g.avant) valider(sur.current.brouillon.traits, g.avant)
    }
    return (
      <div
        className="notak-pdf-saisie"
        data-outil={outil}
        style={{ cursor: outil === 'gomme' ? CURSEUR_GOMME : curseurCrayon(encre) }}
        onPointerDown={descendre}
        onPointerMove={bouger}
        onPointerUp={finir}
        onPointerCancel={finir}
        onPointerLeave={() => setVise(null)}
      />
    )
  }

  /** Les touches du dessin, celles de l'image : rend vrai si la touche est prise. */
  const clavier = (e: ToucheReact): boolean => {
    const s = sur.current
    if (!s.brouillon) return false
    const cmd = e.metaKey || e.ctrlKey
    const k = e.key.toLowerCase()
    const pris = (f: () => void) => {
      e.preventDefault()
      f()
      return true
    }
    if (cmd && k === 'z') return pris(e.shiftKey ? s.retablir : s.annuler)
    if (cmd && k === 's') return pris(s.enregistrer)
    if (e.key === 'Escape') return pris(() => (s.volet ? setVolet(null) : s.fermer()))
    if (e.shiftKey && !cmd && !e.altKey && k === 'd') return pris(s.enregistrer)
    if (cmd || e.altKey || e.shiftKey) return false
    if (k === 'd' || k === 'm' || k === 'b') return pris(() => setOutil('crayon'))
    if (k === 'h' || k === 'u') return pris(() => setOutil('surligneur'))
    if (k === 'e') return pris(() => setOutil('gomme'))
    if (k === 'c') return pris(() => setVolet((v) => (v === 'couleur' ? null : 'couleur')))
    if (k === 'x') return pris(() => s.prendreCouleur(s.precedente))
    if (k >= '1' && k <= '4') return pris(() => s.prendreEpaisseur(Number(k) - 1))
    return false
  }

  const barre = brouillon && (
    <div className="notak-croquis-barre notak-annotation-barre notak-pdf-barre-dessin" role="toolbar" aria-label={t('pdf.dessin.barre')}>
      <button type="button" title={`${t('dessin.crayon')} (D)`} aria-label={t('dessin.crayon')} aria-pressed={outil === 'crayon'} onClick={() => setOutil('crayon')}>
        {ico('croquis')}
      </button>
      <button type="button" title={`${t('dessin.surligneur')} (H)`} aria-label={t('dessin.surligneur')} aria-pressed={outil === 'surligneur'} onClick={() => setOutil('surligneur')}>
        {ico('surligneur')}
      </button>
      <button type="button" title={`${t('dessin.gomme')} (E)`} aria-label={t('dessin.gomme')} aria-pressed={outil === 'gomme'} onClick={() => setOutil('gomme')}>
        {ico('gomme')}
      </button>
      <span className="notak-croquis-sep" role="separator" />
      <span className="notak-croquis-volet-hote">
        <button type="button" title={`${t('couleur.titre')} (C)`} aria-label={t('couleur.titre')} aria-expanded={volet === 'couleur'} onClick={() => setVolet(volet === 'couleur' ? null : 'couleur')}>
          <span className="notak-croquis-pastille" style={{ background: encre }} />
        </button>
        {volet === 'couleur' && <VoletCouleur couleur={encre} choisir={prendreCouleur} />}
      </span>
      <span className="notak-croquis-volet-hote">
        <button type="button" title={`${t('croquis.epaisseur')} (1-4)`} aria-label={t('croquis.epaisseur')} aria-expanded={volet === 'epaisseur'} onClick={() => setVolet(volet === 'epaisseur' ? null : 'epaisseur')}>
          <BarreEpaisseur i={epaisseur} />
        </button>
        {volet === 'epaisseur' && <VoletEpaisseur epaisseur={epaisseur} choisir={prendreEpaisseur} {...(outil === 'surligneur' ? { liste: EPAISSEURS_SURLIGNEUR } : {})} />}
      </span>
      <span className="notak-croquis-sep" role="separator" />
      <button type="button" title={`${t('espace.annuler')} (⌘Z)`} aria-label={t('espace.annuler')} disabled={brouillon.passe.length === 0} onClick={annuler}>
        {ico('annuler')}
      </button>
      <button type="button" title={`${t('espace.retablir')} (⌘⇧Z)`} aria-label={t('espace.retablir')} disabled={brouillon.futur.length === 0} onClick={retablir}>
        {ico('retablir')}
      </button>
      <span className="notak-croquis-espace" />
      <button type="button" className="notak-croquis-texte" title="Esc" onClick={fermer}>
        {modifie ? t('croquis.abandonner') : t('commun.annuler')}
      </button>
      <button type="button" className="notak-croquis-texte notak-croquis-enregistrer" title="⌘S" disabled={!modifie} onClick={enregistrer}>
        {t('croquis.enregistrer')}
      </button>
    </div>
  )

  return { autorise, actif: !!brouillon, commencer, enregistrer, traitsDe, viseDe, contour: CONTOUR_GOMME_PX, saisie, clavier, barre }
}
