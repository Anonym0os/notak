import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Dessin, Element, Trait } from '../../coeur/tableau'
import { BarreEpaisseur, VoletCouleur, VoletEpaisseur, curseurCrayon } from '../croquis/partage'
import {
  COULEURS_TRAIT,
  EPAISSEURS_TRAIT,
  EPAISSEUR_DEFAUT,
  ajouterPoint,
  arrondir,
  cheminLisse,
  ecrireReglage,
  epaisseurFeuille,
  gommer,
  lireReglage,
  traitVise,
} from '../croquis/trace'
import { BoutonOutil } from '../../BoutonOutil'
import type { ContexteToile, PropsOutils, PropsRendu } from '../types'
import { type Historique, defaire, historiqueVide, noter, refaire } from './historique'
import { dessinLibreOuvert, poserDessinLibre } from './mode'
import { deplacerTraits, dessinsDepuis, operationsApresEdition, presDuBas, sansTraits, traitsDansMarquise, traitsDe } from './trace'
import { t } from '../../langue'
import { ico } from '../../icones'

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

const CLE_COULEUR = 'notak.dessin.couleur'
const CLE_EPAISSEUR = 'notak.dessin.epaisseur'
const ROUGE_GOMME = '#ff0000'
/** Le rayon de la gomme et la zone de capture d'un trait pour la sélection, en pixels d'écran. */
const GOMME_PX = 7
const CAPTURE_PX = 6
/** Les contours (trait visé par la gomme, trait choisi) débordent de ce nombre de pixels d'écran de chaque côté. */
const CONTOUR_PX = 3

/** Ce que la couche garde pour elle : rien de ce qui s'y passe ne doit atteindre la toile dessous. */
const EVENEMENTS_ARRETES = ['dblclick', 'click', 'contextmenu', 'wheel', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mousedown', 'mouseup'] as const

/**
 * Le dessin libre : toute la toile devient une feuille. On y trace au crayon, on gomme (le trait entier), on choisit
 * et déplace des traits, on défait et on refait (100 pas). Rien n'existe sur le tableau avant « Enregistrer » : les
 * traits se rangent alors par proximité, un élément par groupe. `existant` : un dessin posé qu'on rouvre ; il se met
 * à jour sur place, ou disparaît s'il ne reste aucun trait.
 */
export function ouvrirDessinLibre(contexte: ContexteToile, existant?: Element<Dessin>) {
  const toile = document.querySelector<HTMLElement>('.notak-toile')
  if (!toile || contexte.services.lectureSeule || dessinLibreOuvert()) return
  const hote = document.createElement('div')
  hote.className = 'notak-dessin-libre'
  toile.append(hote)
  poserDessinLibre(true)
  const racine = createRoot(hote)
  const fermer = (traits: Trait[] | null) => {
    if (traits) {
      if (existant) {
        contexte.magasin.faire(operationsApresEdition(existant, traits))
        contexte.choisir(traits.some((tr) => tr.points.length >= 2) ? [existant.id] : [])
      } else {
        const els = dessinsDepuis(traits)
        if (els.length > 0) {
          contexte.magasin.faire(els.map((element) => ({ type: 'creer' as const, element })))
          contexte.choisir(els.map((e) => e.id))
        }
      }
    }
    racine.unmount()
    hote.remove()
    poserDessinLibre(false)
    toile.focus({ preventScroll: true })
  }
  racine.render(<Couche contexte={contexte} hote={hote} fermer={fermer} depart={existant ? traitsDe(existant) : []} masque={existant?.id ?? null} />)
}

type Outil = 'crayon' | 'selection' | 'gomme'
type Volet = 'couleur' | 'epaisseur' | null
type Geste =
  | { type: 'trace'; points: number[]; epaisseur: number }
  | { type: 'gomme'; avant: Trait[] }
  | { type: 'deplacer'; depart: { x: number; y: number }; avant: Trait[]; choix: ReadonlySet<Trait> }
  | { type: 'marquise'; depart: { x: number; y: number }; ecran: { x: number; y: number }; ajoute: boolean; base: ReadonlySet<Trait> }

const couleurValide = (v: string | null): v is string => v !== null && /^#[0-9a-f]{6}$/i.test(v)

function Couche({
  contexte,
  hote,
  fermer,
  depart,
  masque,
}: {
  contexte: ContexteToile
  hote: HTMLElement
  fermer(traits: Trait[] | null): void
  depart: Trait[]
  /** Le dessin rouvert : il se cache du tableau le temps de l'édition. */
  masque: string | null
}) {
  const [traits, setTraits] = useState<Trait[]>(depart)
  const [histo, setHisto] = useState<Historique<Trait[]>>(historiqueVide)
  const [outil, setOutil] = useState<Outil>('crayon')
  const [couleur, setCouleur] = useState<string>(() => {
    const v = lireReglage(CLE_COULEUR)
    return couleurValide(v) ? v : COULEURS_TRAIT[0]
  })
  const [precedente, setPrecedente] = useState(couleur)
  const [epaisseur, setEpaisseur] = useState<number>(() => {
    const n = Number(lireReglage(CLE_EPAISSEUR))
    return Number.isInteger(n) && n >= 0 && n < EPAISSEURS_TRAIT.length ? n : EPAISSEUR_DEFAUT
  })
  const [volet, setVolet] = useState<Volet>(null)
  const [choix, setChoix] = useState<ReadonlySet<Trait>>(new Set())
  const [vise, setVise] = useState<Trait | null>(null)
  const [enCours, setEnCours] = useState<number[] | null>(null)
  const [marquise, setMarquise] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [effacee, setEffacee] = useState(false)
  const geste = useRef<Geste | null>(null)
  const doigts = useRef(new Set<number>())
  const modifie = histo.passe.length > 0

  // Tout ce qu'un écouteur du document doit lire à jour.
  const etat = { traits, histo, outil, couleur, precedente, epaisseur, volet, choix, modifie }
  const sur = useRef(etat)
  sur.current = etat

  // La couche garde pour elle ses gestes : la toile dessous ne reçoit ni double-clic, ni molette, ni appui.
  useEffect(() => {
    const arreter = (e: Event) => {
      e.stopPropagation()
      if (e.type === 'contextmenu' || e.type === 'wheel') e.preventDefault()
    }
    for (const n of EVENEMENTS_ARRETES) hote.addEventListener(n, arreter, { passive: false })
    return () => {
      for (const n of EVENEMENTS_ARRETES) hote.removeEventListener(n, arreter)
    }
  }, [hote])

  const echelle = contexte.camera.echelle * 10
  const origine = contexte.versTableau({ x: 0, y: 0 })
  const ici = (e: { clientX: number; clientY: number }) => {
    const r = hote.getBoundingClientRect()
    return contexte.versTableau({ x: e.clientX - r.left, y: e.clientY - r.top })
  }
  const ecran = (e: { clientX: number; clientY: number }) => {
    const r = hote.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const versEcran = (points: readonly number[]) => points.map((v, i) => (v - (i % 2 === 0 ? origine.x : origine.y)) * echelle)

  const valider = (suite: Trait[], avant: Trait[]) => {
    setHisto((h) => noter(h, avant))
    setTraits(suite)
  }
  const annuler = () => {
    const r = defaire(sur.current.histo, sur.current.traits)
    if (!r) return
    setHisto(r.historique)
    setTraits(r.etat)
    setChoix(new Set())
  }
  const retablir = () => {
    const r = refaire(sur.current.histo, sur.current.traits)
    if (!r) return
    setHisto(r.historique)
    setTraits(r.etat)
    setChoix(new Set())
  }
  const enregistrer = () => {
    if (sur.current.modifie) fermer(sur.current.traits)
  }
  const abandonner = () => fermer(null)

  /** Applique un changement de couleur ou d'épaisseur aux traits choisis : un seul pas. */
  const surChoix = (f: (t: Trait) => Trait) => {
    const { traits: tous, choix: c } = sur.current
    if (c.size === 0) return false
    const suivants = new Set<Trait>()
    const apres = tous.map((tr) => {
      if (!c.has(tr)) return tr
      const neuf = f(tr)
      suivants.add(neuf)
      return neuf
    })
    valider(apres, tous)
    setChoix(suivants)
    return true
  }
  const choisirCouleur = (c: string) => {
    const { couleur: actuelle, outil: o } = sur.current
    if (o === 'gomme') return
    if (o === 'selection') {
      if (!surChoix((tr) => ({ ...tr, couleur: c }))) return
    }
    if (c !== actuelle) setPrecedente(actuelle)
    setCouleur(c)
    ecrireReglage(CLE_COULEUR, c)
  }
  const choisirEpaisseur = (i: number) => {
    setEpaisseur(i)
    setOutil('crayon')
    ecrireReglage(CLE_EPAISSEUR, String(i))
  }
  const supprimerChoix = () => {
    const { traits: tous, choix: c } = sur.current
    if (c.size === 0) return
    valider(sansTraits(tous, c), tous)
    setChoix(new Set())
  }
  const decaler = (dx: number, dy: number) => {
    const { traits: tous, choix: c } = sur.current
    if (c.size === 0) return
    const r = deplacerTraits(tous, c, dx, dy)
    valider(r.traits, tous)
    setChoix(r.choix)
  }

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      // Le tableau dessous n'entend rien du clavier tant que le mode est ouvert.
      e.stopPropagation()
      const s = sur.current
      const cmd = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      const pris = () => {
        e.preventDefault()
      }
      if (cmd && k === 'z') {
        pris()
        if (e.shiftKey) retablir()
        else annuler()
        return
      }
      if (cmd && k === 's') {
        pris()
        enregistrer()
        return
      }
      if (cmd && k === 'a') {
        pris()
        if (s.outil === 'selection') setChoix(new Set(s.traits))
        return
      }
      if (cmd && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')) {
        pris()
        return
      }
      if (e.key === 'Escape') {
        pris()
        if (s.volet) setVolet(null)
        else if (s.outil === 'selection' && s.choix.size > 0) setChoix(new Set())
        else abandonner()
        return
      }
      if (cmd || e.altKey || (e.target as HTMLElement).tagName === 'INPUT') return
      if (k === 'd' || k === 'm' || k === 'b') setOutil('crayon')
      else if (k === 'v' || k === 's') setOutil('selection')
      else if (k === 'e') setOutil('gomme')
      else if (k === 'c') setVolet((v) => (v === 'couleur' ? null : s.outil === 'gomme' ? null : 'couleur'))
      else if (k === 'x') choisirCouleur(s.precedente)
      else if (k >= '1' && k <= '4') choisirEpaisseur(Number(k) - 1)
      else if (s.outil === 'selection' && (k === 'delete' || k === 'backspace')) supprimerChoix()
      else if (s.outil === 'selection' && k.startsWith('arrow')) {
        const pas = (e.shiftKey ? 10 : 1) / (contexte.camera.echelle * 10)
        decaler(k === 'arrowleft' ? -pas : k === 'arrowright' ? pas : 0, k === 'arrowup' ? -pas : k === 'arrowdown' ? pas : 0)
      } else return
      pris()
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
    // Les actions lisent `sur` : l'écouteur se pose une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rayon = (px: number) => px / echelle
  const largeurTrait = () => epaisseurFeuille(EPAISSEURS_TRAIT[epaisseur]!.px, echelle)

  const abandonnerGeste = () => {
    const g = geste.current
    geste.current = null
    setEnCours(null)
    setMarquise(null)
    setEffacee(false)
    if (g && (g.type === 'gomme' || g.type === 'deplacer')) setTraits(g.avant)
    if (g?.type === 'deplacer') setChoix(g.choix)
  }
  const debut = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    doigts.current.add(e.pointerId)
    // Plus de deux doigts : le geste en cours est annulé.
    if (doigts.current.size > 2) return abandonnerGeste()
    if (geste.current) return
    setVolet(null)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Sans capture, le trait suit tant que le pointeur reste sur la couche.
    }
    const p = ici(e)
    if (outil === 'crayon') {
      geste.current = { type: 'trace', points: [p.x, p.y], epaisseur: largeurTrait() }
      setEnCours([p.x, p.y])
    } else if (outil === 'gomme') {
      geste.current = { type: 'gomme', avant: traits }
      setVise(null)
      effacer(p.x, p.y)
    } else {
      const i = traitVise(traits, p.x, p.y, rayon(CAPTURE_PX))
      const ajoute = e.shiftKey || e.metaKey || e.ctrlKey
      if (i >= 0) {
        const trait = traits[i]!
        let suite: ReadonlySet<Trait> = choix
        if (ajoute) {
          const c = new Set(choix)
          if (c.has(trait)) c.delete(trait)
          else c.add(trait)
          suite = c
        } else if (!choix.has(trait)) suite = new Set([trait])
        setChoix(suite)
        // Retirer un trait de la sélection n'ouvre pas de glisser.
        if (suite.has(trait)) geste.current = { type: 'deplacer', depart: p, avant: traits, choix: suite }
      } else {
        if (!ajoute) setChoix(new Set())
        geste.current = { type: 'marquise', depart: p, ecran: ecran(e), ajoute, base: ajoute ? choix : new Set() }
      }
    }
  }
  /** La gomme enlève les traits entiers qu'elle touche, une seule fois chacun. */
  const effacer = (x: number, y: number) => setTraits((tous) => gommer(tous, x, y, rayon(GOMME_PX)))
  const deplacement = (e: React.PointerEvent) => {
    const g = geste.current
    if (g) setEffacee(presDuBas(e.clientY, window.innerHeight))
    if (!g) {
      if (outil === 'gomme') {
        const p = ici(e)
        const i = traitVise(traits, p.x, p.y, rayon(GOMME_PX))
        const v = i < 0 ? null : traits[i]!
        setVise((anc) => (anc === v ? anc : v))
      }
      return
    }
    // Le navigateur regroupe parfois plusieurs mouvements en un : on les reprend tous.
    const evenements = e.nativeEvent.getCoalescedEvents?.() ?? []
    const sources = evenements.length > 0 ? evenements : [e.nativeEvent]
    if (g.type === 'trace') {
      let suite = g.points
      for (const m of sources) {
        const p = ici(m)
        suite = ajouterPoint(suite, p.x, p.y)
      }
      if (suite !== g.points) {
        g.points = suite
        setEnCours(suite)
      }
    } else if (g.type === 'gomme') {
      for (const m of sources) {
        const p = ici(m)
        effacer(p.x, p.y)
      }
    } else if (g.type === 'deplacer') {
      const p = ici(e)
      const r = deplacerTraits(g.avant, g.choix, p.x - g.depart.x, p.y - g.depart.y)
      setTraits(r.traits)
      setChoix(r.choix)
    } else {
      const s = ecran(e)
      setMarquise({ x0: g.ecran.x, y0: g.ecran.y, x1: s.x, y1: s.y })
    }
  }
  const fin = (e: React.PointerEvent) => {
    doigts.current.delete(e.pointerId)
    const g = geste.current
    geste.current = null
    setEffacee(false)
    if (!g) return
    if (g.type === 'trace') {
      setEnCours(null)
      valider([...traits, { points: arrondir(g.points), couleur, epaisseur: g.epaisseur }], traits)
    } else if (g.type === 'gomme') {
      if (traits !== g.avant) setHisto((h) => noter(h, g.avant))
    } else if (g.type === 'deplacer') {
      if (traits !== g.avant) setHisto((h) => noter(h, g.avant))
    } else {
      const m = marquise
      setMarquise(null)
      if (!m) return
      const a = contexte.versTableau(m ? { x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1) } : { x: 0, y: 0 })
      const b = contexte.versTableau({ x: Math.max(m.x0, m.x1), y: Math.max(m.y0, m.y1) })
      const dedans = traitsDansMarquise(traits, { x0: a.x, y0: a.y, x1: b.x, y1: b.y })
      setChoix(new Set([...g.base, ...dedans]))
    }
  }

  // Les chemins se refont quand la caméra ou les traits changent, pas à chaque survol.
  const chemins = useMemo(
    () => new Map(traits.map((tr) => [tr, cheminLisse(versEcran(tr.points))])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [traits, echelle, origine.x, origine.y],
  )
  const px = (tr: Trait) => tr.epaisseur * echelle
  const enCoursTrait: Trait | null = enCours ? { points: enCours, couleur, epaisseur: largeurTrait() } : null

  const desactive = { couleur: outil === 'gomme' || (outil === 'selection' && choix.size === 0), epaisseur: outil !== 'crayon' }
  /** Un bouton grisé garde ses événements (aria-disabled, pas disabled) : un double-clic ne le traverse jamais vers la toile. */
  const agir = (grise: boolean, f: () => void) => () => {
    if (!grise) f()
  }
  return (
    <>
      {masque && <style>{`.notak-toile [data-id="${masque}"] { visibility: hidden; }`}</style>}
      <svg
        className="notak-dessin-libre-feuille"
        data-outil={outil}
        style={outil === 'crayon' ? { cursor: curseurCrayon(couleur) } : undefined}
        onPointerDown={debut}
        onPointerMove={deplacement}
        onPointerUp={fin}
        onPointerCancel={(e) => (doigts.current.delete(e.pointerId), abandonnerGeste())}
        onPointerLeave={() => setVise(null)}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {traits.map((tr, i) => (
          <g key={i}>
            {outil === 'gomme' && vise === tr && (
              <path d={chemins.get(tr)} fill="none" stroke={ROUGE_GOMME} strokeWidth={px(tr) + 2 * CONTOUR_PX} strokeLinecap="round" strokeLinejoin="round" />
            )}
            {outil === 'selection' && choix.has(tr) && (
              <path d={chemins.get(tr)} fill="none" stroke="var(--notak-accent)" strokeWidth={px(tr) + 2 * CONTOUR_PX} strokeLinecap="round" strokeLinejoin="round" />
            )}
            <path d={chemins.get(tr)} fill="none" stroke={tr.couleur} strokeWidth={px(tr)} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}
        {enCoursTrait && (
          <path d={cheminLisse(versEcran(enCoursTrait.points))} fill="none" stroke={couleur} strokeWidth={px(enCoursTrait)} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {marquise && (
          <rect
            className="notak-dessin-libre-marquise"
            x={Math.min(marquise.x0, marquise.x1)}
            y={Math.min(marquise.y0, marquise.y1)}
            width={Math.abs(marquise.x1 - marquise.x0)}
            height={Math.abs(marquise.y1 - marquise.y0)}
          />
        )}
      </svg>
      <div
        className="notak-croquis-barre notak-dessin-libre-barre"
        role="toolbar"
        aria-label={t('dessin.surToile')}
        data-effacee={effacee || undefined}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button type="button" title={`${t('dessin.crayon')} (D)`} aria-label={t('dessin.crayon')} aria-pressed={outil === 'crayon'} onClick={() => setOutil('crayon')}>
          {ico('croquis')}
        </button>
        <button type="button" title={`${t('dessin.selection')} (V)`} aria-label={t('dessin.selection')} aria-pressed={outil === 'selection'} onClick={() => setOutil('selection')}>
          {ico('pointeur')}
        </button>
        <button type="button" title={`${t('dessin.gomme')} (E)`} aria-label={t('dessin.gomme')} aria-pressed={outil === 'gomme'} onClick={() => setOutil('gomme')}>
          {ico('gomme')}
        </button>
        <span className="notak-croquis-sep" role="separator" />
        <span className="notak-croquis-volet-hote">
          <button
            type="button"
            title={`${t('couleur.titre')} (C)`}
            aria-label={t('couleur.titre')}
            aria-expanded={volet === 'couleur'}
            aria-disabled={desactive.couleur || undefined}
            onClick={agir(desactive.couleur, () => setVolet(volet === 'couleur' ? null : 'couleur'))}
          >
            <span className="notak-croquis-pastille" style={{ background: couleur }} />
          </button>
          {volet === 'couleur' && !desactive.couleur && <VoletCouleur couleur={couleur} choisir={choisirCouleur} />}
        </span>
        <span className="notak-croquis-volet-hote">
          <button
            type="button"
            title={`${t('croquis.epaisseur')} (1-4)`}
            aria-label={t('croquis.epaisseur')}
            aria-expanded={volet === 'epaisseur'}
            aria-disabled={desactive.epaisseur || undefined}
            onClick={agir(desactive.epaisseur, () => setVolet(volet === 'epaisseur' ? null : 'epaisseur'))}
          >
            <BarreEpaisseur i={epaisseur} />
          </button>
          {volet === 'epaisseur' && !desactive.epaisseur && <VoletEpaisseur epaisseur={epaisseur} choisir={choisirEpaisseur} />}
        </span>
        <span className="notak-croquis-sep" role="separator" />
        <button type="button" title={`${t('espace.annuler')} (⌘Z)`} aria-label={t('espace.annuler')} aria-disabled={histo.passe.length === 0 || undefined} onClick={agir(histo.passe.length === 0, annuler)}>
          {ico('annuler')}
        </button>
        <button type="button" title={`${t('espace.retablir')} (⌘⇧Z)`} aria-label={t('espace.retablir')} aria-disabled={histo.futur.length === 0 || undefined} onClick={agir(histo.futur.length === 0, retablir)}>
          {ico('retablir')}
        </button>
        <span className="notak-croquis-espace" />
        <button type="button" className="notak-croquis-texte" title="Esc" onClick={abandonner}>
          {modifie ? t('croquis.abandonner') : t('commun.annuler')}
        </button>
        <button type="button" className="notak-croquis-texte notak-croquis-enregistrer" title="⌘S" aria-disabled={!modifie || undefined} onClick={agir(!modifie, enregistrer)}>
          {t('croquis.enregistrer')}
        </button>
      </div>
    </>
  )
}

/** « Modifier le dessin », dans la barre de sélection : rouvre le dessin dans le mode, avec ses traits. */
export function OutilsDessin({ elements, contexte }: PropsOutils<Dessin>) {
  if (contexte.services.lectureSeule || elements.length !== 1) return null
  return <BoutonOutil icone="dessin" titre={t('dessin.modifier')} libelle={t('dessin.modifier')} onClick={() => ouvrirDessinLibre(contexte, elements[0]!)} />
}
