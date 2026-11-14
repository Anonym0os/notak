import { type KeyboardEvent as ToucheReact, type SyntheticEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Element, Fichier } from '../../../coeur/tableau'
import { Icone, type NomIcone } from '../../../icones'
import { t } from '../../../langue'
import type { ContexteToile } from '../../types'
import { useThemeDeLaToile } from '../../image/barreOutil'
import { moteurPdf } from '../apercuPdf'
import { ouvrirDehors } from '../ouverture'
import { type MoteurPdf, PagePdf } from './PagePdf'
import { CalqueTraits, useDessinPdf } from './DessinPdf'
import { useCommentairesPdf } from './CommentairesPdf'
import {
  type Disposition,
  type TaillePage,
  MARGE_PAGES,
  bornerZoom,
  defilementApresZoom,
  disposer,
  largeurUsuelle,
  lireNumeroPage,
  pageCourante,
  pagesADessiner,
  pourcent,
  PX_PAR_POINT,
  zoomAjuste,
  zoomInitial,
  zoomSuivant,
} from './mise'
import { type Bout, type MorceauTexte, type Trouve, chercherDansPage, requeteNormale } from './recherche'
import './pdf.css'

type EtatDocument =
  | { etat: 'charge' }
  | { etat: 'pret'; pdfjs: MoteurPdf; doc: PDFDocumentProxy; tailles: TaillePage[] }
  | { etat: 'erreur' }

const tailleDe = (v: { width: number; height: number }): TaillePage => ({ largeur: v.width, hauteur: v.height })

/**
 * Le PDF ouvert : chargé une fois par adresse, et relâché quand la visionneuse se ferme. La première page suffit à
 * montrer le document (les autres prennent sa taille) ; les tailles de toutes arrivent ensuite, sans rien bloquer.
 */
function useDocumentPdf(adresse: string): EtatDocument {
  const [etat, setEtat] = useState<EtatDocument>({ etat: 'charge' })
  useEffect(() => {
    let vivant = true
    let doc: PDFDocumentProxy | null = null
    let tache: { destroy(): Promise<void> } | null = null
    setEtat({ etat: 'charge' })
    void (async () => {
      const [pdfjs, octets] = await Promise.all([moteurPdf(), fetch(adresse).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))])
      if (!vivant) return
      const chargement = pdfjs.getDocument({ data: new Uint8Array(octets), isEvalSupported: false })
      tache = chargement
      const ouvert = await chargement.promise
      doc = ouvert
      if (!vivant) return void ouvert.destroy()
      const premiere = tailleDe((await ouvert.getPage(1)).getViewport({ scale: 1 }))
      if (!vivant) return
      const provisoires = Array.from({ length: ouvert.numPages }, () => premiere)
      setEtat({ etat: 'pret', pdfjs, doc: ouvert, tailles: provisoires })
      const tailles = await Promise.all(provisoires.map(async (_, i) => tailleDe((await ouvert.getPage(i + 1)).getViewport({ scale: 1 }))))
      if (vivant && tailles.some((p, i) => p.largeur !== provisoires[i]!.largeur || p.hauteur !== provisoires[i]!.hauteur)) setEtat({ etat: 'pret', pdfjs, doc: ouvert, tailles })
    })().catch(() => vivant && setEtat({ etat: 'erreur' }))
    return () => {
      vivant = false
      if (doc) void doc.destroy()
      else void tache?.destroy()
    }
  }, [adresse])
  return etat
}

/** Ce qui se fait dans la visionneuse ne remonte pas à la toile : un portail renvoie ses événements à ses parents React. */
const clos = (e: SyntheticEvent) => e.stopPropagation()

/** Le fond de la colonne, à côté des pages, et non une page ou ce qu'elle porte. */
const estFond = (cible: EventTarget, defile: EventTarget) => cible === defile || (cible instanceof HTMLElement && cible.classList.contains('notak-pdf-colonne'))

const estSaisie = (cible: EventTarget | null) =>
  cible instanceof HTMLElement && (cible.isContentEditable || cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.tagName === 'SELECT')

/** Ce que la recherche a trouvé : chaque résultat, avec sa page (indice à partir de 0). */
interface Recherche {
  texte: string
  /** La recherche lit encore des pages. */
  enCours: boolean
  resultats: { page: number; bouts: Trouve }[]
  /** Le résultat montré, ou -1. */
  courant: number
}

const RECHERCHE_VIDE: Recherche = { texte: '', enCours: false, resultats: [], courant: -1 }

/**
 * La visionneuse PDF de Notak, à la place de celle du navigateur : les pages en colonne qu'on fait défiler, dessinées
 * nettes par pdf.js à la densité de l'écran, et seulement celles qui sont près de la vue (un PDF de 200 pages reste
 * fluide). En haut, une barre à nous, dont chaque bouton dit ce qu'il fait : fermer, le zoom (−, +, la valeur, ajuster à
 * la largeur), la page (n sur N, qu'on tape pour y sauter), rechercher, télécharger, et ouvrir ailleurs (l'app par défaut
 * dans Notak de bureau, un nouvel onglet dans un navigateur). ⌘+ ⌘− ⌘0 zooment, ⌘F cherche, les flèches et ⇞ ⇟ tournent
 * les pages, Échap ferme ; au doigt, on pince pour zoomer. Le texte reste sélectionnable et copiable.
 *
 * « Dessiner » (⇧D) trace sur les pages au crayon, au surligneur, et gomme (`DessinPdf`) ; les traits se rangent dans
 * l'élément, page par page, et se montrent à tous, même en lecture seule. « Commenter » (⌥⌘M) épingle un fil à un
 * endroit d'une page (`CommentairesPdf`), le même fil que sur la toile.
 *
 * `element` et `contexte` (absents dans la bibliothèque, hors de toute toile) servent à ce que la toile prête : ouvrir
 * avec l'app de bureau, dessiner, commenter, l'historique.
 */
export function VisionneusePdf({
  contenu,
  adresse,
  fermer,
  element,
  contexte,
}: {
  contenu: Fichier
  adresse: string
  fermer(): void
  element?: Element<Fichier>
  contexte?: ContexteToile
}) {
  const titre = contenu.titre ?? contenu.nom
  const services = contexte?.services
  const ancre = useRef<HTMLSpanElement>(null)
  const theme = useThemeDeLaToile(ancre)
  const racine = useRef<HTMLDivElement>(null)
  const defile = useRef<HTMLDivElement>(null)
  const document_ = useDocumentPdf(adresse)
  const pret = document_.etat === 'pret' ? document_ : null
  const tailles = useMemo(() => pret?.tailles ?? [], [pret?.tailles])
  const dessin = useDessinPdf({ element, contexte, annotations: contenu.annotations })

  const [vue, setVue] = useState({ haut: 0, hauteur: 0, largeur: 0 })
  const [zoom, setZoom] = useState<number | null>(null)
  // `largeur` : le zoom suit la largeur de la fenêtre (à l'ouverture, ou après « Ajuster ») ; `libre` : on l'a choisi.
  const [mode, setMode] = useState<'largeur' | 'libre'>('largeur')
  const echelle = (zoom ?? 1) * PX_PAR_POINT
  const d = useMemo(() => disposer(tailles, echelle), [tailles, echelle])
  const largeurPage = useMemo(() => largeurUsuelle(tailles), [tailles])
  const tranche = zoom === null ? null : pagesADessiner(d, vue.haut, vue.hauteur, 1)
  const courante = pageCourante(d, vue.haut, vue.hauteur)
  const [saisiePage, setSaisiePage] = useState<string | null>(null)
  const [recherche, setRecherche] = useState<Recherche | null>(null)
  const textes = useRef(new Map<number, Promise<MorceauTexte[]>>())
  const fondPresse = useRef(false)

  // Ce que les gestes (clavier, molette, doigts) lisent à jour.
  const etat = useRef({ zoom, d, mode, courante, largeurPage })
  etat.current = { zoom, d, mode, courante, largeurPage }
  /** Le zoom qui change garde sous `ancre` (pixels dans la vue) le même point du document ; `vers` : là où le doigt l'a mené. */
  const ancrage = useRef<{ avant: Disposition; defile: { x: number; y: number }; ancre: { x: number; y: number }; vers?: { x: number; y: number } } | null>(null)

  const mesurer = () => {
    const s = defile.current
    if (!s) return
    setVue((v) => (v.haut === s.scrollTop && v.hauteur === s.clientHeight && v.largeur === s.clientWidth ? v : { haut: s.scrollTop, hauteur: s.clientHeight, largeur: s.clientWidth }))
  }

  const zoomer = (vers: number, ancreVue?: { x: number; y: number }, libre = true) => {
    const s = defile.current
    const z = bornerZoom(vers)
    if (libre) setMode('libre')
    if (!s || z === etat.current.zoom) return
    ancrage.current = { avant: etat.current.d, defile: { x: s.scrollLeft, y: s.scrollTop }, ancre: ancreVue ?? { x: s.clientWidth / 2, y: s.clientHeight / 2 } }
    setZoom(z)
  }
  const ajuster = () => {
    setMode('largeur')
    zoomer(zoomAjuste(etat.current.largeurPage, defile.current?.clientWidth ?? 0), { x: (defile.current?.clientWidth ?? 0) / 2, y: 0 }, false)
  }
  const allerA = (page: number) => {
    const s = defile.current
    const n = etat.current.d.hauts.length
    if (!s || n === 0) return
    const i = Math.max(0, Math.min(n - 1, page))
    s.scrollTop = etat.current.d.hauts[i]! - MARGE_PAGES / 2
    mesurer()
  }
  const commentaires = useCommentairesPdf({
    element,
    contexte,
    contenu,
    pret: !!pret && zoom !== null,
    // Le point d'un fil (page à partir de 1, hauteur en fraction de la page) vient au tiers haut de la vue.
    montrer: (page, y) => {
      const s = defile.current
      const { d: disp } = etat.current
      const i = page - 1
      if (!s || disp.hauts[i] === undefined) return
      s.scrollTop = Math.max(0, disp.hauts[i]! + y * disp.hauteurs[i]! - s.clientHeight / 3)
      mesurer()
    },
  })
  const commencerDessin = () => {
    commentaires.quitter()
    dessin.commencer()
  }
  const basculerCommentaire = () => {
    if (dessin.actif) dessin.enregistrer()
    commentaires.basculer()
  }

  // Le zoom d'ouverture, dès que la première page et la largeur de la vue sont connues.
  useLayoutEffect(() => {
    if (zoom !== null || !pret || vue.largeur === 0) return
    const ajuste = zoomAjuste(largeurPage, vue.largeur)
    setZoom(zoomInitial(largeurPage, vue.largeur))
    setMode(ajuste <= 1 ? 'largeur' : 'libre')
  }, [zoom, pret, vue.largeur, largeurPage])

  // Les vraies tailles arrivées, un zoom ajusté à la largeur se refait sur la leur.
  useLayoutEffect(() => {
    const s = defile.current
    if (!s || etat.current.zoom === null || etat.current.mode !== 'largeur') return
    zoomer(zoomAjuste(largeurPage, s.clientWidth), { x: s.clientWidth / 2, y: 0 }, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [largeurPage])

  // Après un zoom, le défilement qui garde le point visé sous le pointeur (ou les doigts).
  useLayoutEffect(() => {
    const a = ancrage.current
    const s = defile.current
    if (!a || !s) return
    ancrage.current = null
    const p = defilementApresZoom(a.defile, a.ancre, a.avant, d, s.clientWidth, a.vers)
    s.scrollLeft = p.x
    s.scrollTop = p.y
    mesurer()
  }, [d])

  // À l'ouverture, et quand les vraies tailles des pages arrivent, une colonne plus large que la vue (une page à
  // l'italienne parmi d'autres) se montre par son milieu.
  const centree = useRef<TaillePage[] | null>(null)
  useLayoutEffect(() => {
    const s = defile.current
    if (!s || zoom === null || centree.current === tailles) return
    centree.current = tailles
    s.scrollLeft = Math.max(0, (s.scrollWidth - s.clientWidth) / 2)
  }, [tailles, zoom])

  // La vue se mesure à l'ouverture et quand la fenêtre change ; ajusté à la largeur, le zoom la suit.
  useLayoutEffect(() => {
    const s = defile.current
    if (!s) return
    mesurer()
    // Sans `ResizeObserver` (un vieux navigateur, jsdom), la vue garde sa mesure d'ouverture.
    if (typeof ResizeObserver === 'undefined') return
    const suivi = new ResizeObserver(() => {
      mesurer()
      const { mode: m, largeurPage: l, zoom: z } = etat.current
      if (m === 'largeur' && z !== null) zoomer(zoomAjuste(l, s.clientWidth), { x: s.clientWidth / 2, y: 0 }, false)
    })
    suivi.observe(s)
    return () => suivi.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // La visionneuse prend le clavier à l'ouverture, et le rend en partant.
  useEffect(() => {
    const avant = document.activeElement instanceof HTMLElement ? document.activeElement : null
    racine.current?.focus({ preventScroll: true })
    return () => avant?.focus({ preventScroll: true })
  }, [])

  // La molette avec Ctrl (ou le pincement du pavé tactile, qui arrive ainsi) zoome autour du pointeur.
  useEffect(() => {
    const s = defile.current
    if (!s) return
    const molette = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      if (geste) return
      const r = s.getBoundingClientRect()
      const z = etat.current.zoom ?? 1
      zoomer(z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), { x: e.clientX - r.left, y: e.clientY - r.top })
    }
    // Le pincement à deux doigts (iPhone, iPad) : le point sous les doigts au départ reste sous eux.
    let pince: { ecart: number; zoom: number; avant: Disposition; defile: { x: number; y: number }; milieu: { x: number; y: number } } | null = null
    const lire = (e: TouchEvent) => {
      const r = s.getBoundingClientRect()
      const [a, b] = [e.touches[0]!, e.touches[1]!]
      return { ecart: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), milieu: { x: (a.clientX + b.clientX) / 2 - r.left, y: (a.clientY + b.clientY) / 2 - r.top } }
    }
    const debut = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      const { ecart, milieu } = lire(e)
      pince = { ecart: Math.max(1, ecart), zoom: etat.current.zoom ?? 1, avant: etat.current.d, defile: { x: s.scrollLeft, y: s.scrollTop }, milieu }
    }
    const suite = (e: TouchEvent) => {
      if (!pince || e.touches.length !== 2) return
      if (e.cancelable) e.preventDefault()
      const { ecart, milieu } = lire(e)
      const z = bornerZoom((pince.zoom * ecart) / pince.ecart)
      setMode('libre')
      ancrage.current = { avant: pince.avant, defile: pince.defile, ancre: pince.milieu, vers: milieu }
      if (z === etat.current.zoom) {
        // Le zoom bute : les doigts déplacent seulement la page.
        const p = defilementApresZoom(pince.defile, pince.milieu, pince.avant, etat.current.d, s.clientWidth, milieu)
        ancrage.current = null
        s.scrollLeft = p.x
        s.scrollTop = p.y
      } else setZoom(z)
    }
    const fin = (e: TouchEvent) => {
      if (e.touches.length < 2) pince = null
    }
    // Safari pince au pavé tactile par ses `gesture*` : sans eux, il agrandirait toute la page.
    let geste: { zoom: number } | null = null
    const gesteDebut = (e: Event) => {
      e.preventDefault()
      if (!pince) geste = { zoom: etat.current.zoom ?? 1 }
    }
    const gesteSuite = (e: Event) => {
      e.preventDefault()
      const g = e as Event & { scale?: number; clientX?: number; clientY?: number }
      if (!geste || pince || !g.scale) return
      const r = s.getBoundingClientRect()
      zoomer(geste.zoom * g.scale, g.clientX === undefined ? undefined : { x: g.clientX - r.left, y: (g.clientY ?? 0) - r.top })
    }
    const gesteFin = (e: Event) => {
      e.preventDefault()
      geste = null
    }
    s.addEventListener('wheel', molette, { passive: false })
    s.addEventListener('touchstart', debut, { passive: true })
    s.addEventListener('touchmove', suite, { passive: false })
    s.addEventListener('touchend', fin)
    s.addEventListener('touchcancel', fin)
    s.addEventListener('gesturestart', gesteDebut)
    s.addEventListener('gesturechange', gesteSuite)
    s.addEventListener('gestureend', gesteFin)
    return () => {
      s.removeEventListener('gesturestart', gesteDebut)
      s.removeEventListener('gesturechange', gesteSuite)
      s.removeEventListener('gestureend', gesteFin)
      s.removeEventListener('wheel', molette)
      s.removeEventListener('touchstart', debut)
      s.removeEventListener('touchmove', suite)
      s.removeEventListener('touchend', fin)
      s.removeEventListener('touchcancel', fin)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // — La recherche : le texte des pages se lit à la première recherche, une fois par page, puis se garde. —
  const texteDePage = (i: number): Promise<MorceauTexte[]> => {
    if (!pret) return Promise.resolve([])
    let p = textes.current.get(i)
    if (!p) {
      p = pret.doc
        .getPage(i + 1)
        .then((page) => page.getTextContent())
        .then((c) => c.items.flatMap((it) => ('str' in it ? [{ str: it.str, hasEOL: it.hasEOL }] : [])))
        .catch(() => [])
      textes.current.set(i, p)
    }
    return p
  }
  useEffect(() => {
    const q = recherche?.texte ?? ''
    if (!pret || !requeteNormale(q)) return
    let vivant = true
    const minuterie = setTimeout(async () => {
      const resultats: Recherche['resultats'] = []
      for (let i = 0; i < pret.doc.numPages; i++) {
        const morceaux = await texteDePage(i)
        if (!vivant) return
        for (const bouts of chercherDansPage(morceaux, q)) resultats.push({ page: i, bouts })
      }
      // Le premier résultat montré est celui de la page qu'on lit, ou d'après.
      const depuis = resultats.findIndex((r) => r.page >= etat.current.courante)
      setRecherche((r) => (r && r.texte === q ? { ...r, enCours: false, resultats, courant: resultats.length === 0 ? -1 : Math.max(0, depuis) } : r))
    }, 180)
    return () => {
      vivant = false
      clearTimeout(minuterie)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche?.texte, pret])
  const resultat = recherche && recherche.courant >= 0 ? recherche.resultats[recherche.courant] : undefined
  // Le résultat montré passe dans la vue : sa page, puis le mot lui-même, une fois son calque de texte posé.
  useEffect(() => {
    if (!resultat) return
    const s = defile.current
    const { d: disp } = etat.current
    if (!s) return
    const haut = disp.hauts[resultat.page] ?? 0
    if (haut < s.scrollTop || haut + (disp.hauteurs[resultat.page] ?? 0) > s.scrollTop + s.clientHeight) allerA(resultat.page)
    const viser = () => s.querySelector('.notak-pdf-trouve-courant')?.scrollIntoView?.({ block: 'center', inline: 'nearest' })
    const minuterie = setTimeout(viser, 120)
    return () => clearTimeout(minuterie)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultat])
  const boutsParPage = useMemo(() => {
    const parPage = new Map<number, (Bout & { courant?: boolean })[]>()
    for (const [i, r] of (recherche?.resultats ?? []).entries()) {
      const liste = parPage.get(r.page) ?? []
      for (const b of r.bouts) liste.push(i === recherche?.courant ? { ...b, courant: true } : b)
      parPage.set(r.page, liste)
    }
    return parPage
  }, [recherche?.resultats, recherche?.courant])
  const champRecherche = useRef<HTMLInputElement>(null)
  const ouvrirRecherche = () => {
    setRecherche((r) => r ?? RECHERCHE_VIDE)
    requestAnimationFrame(() => champRecherche.current?.select())
  }
  const fermerRecherche = () => {
    setRecherche(null)
    racine.current?.focus({ preventScroll: true })
  }
  const resultatVoisin = (pas: 1 | -1) =>
    setRecherche((r) => (r && r.resultats.length > 0 ? { ...r, courant: (r.courant + pas + r.resultats.length) % r.resultats.length } : r))

  const clavier = (e: ToucheReact) => {
    e.stopPropagation()
    const cmd = e.metaKey || e.ctrlKey
    const k = e.key
    const faire = (f: () => void) => {
      e.preventDefault()
      f()
    }
    const z = etat.current.zoom ?? 1
    if (cmd && (k === '=' || k === '+')) return faire(() => zoomer(zoomSuivant(z, 1)))
    if (cmd && (k === '-' || k === '_')) return faire(() => zoomer(zoomSuivant(z, -1)))
    if (cmd && k === '0') return faire(ajuster)
    if (cmd && k.toLowerCase() === 'f') return faire(ouvrirRecherche)
    if (!estSaisie(e.target) && dessin.clavier(e)) return
    if (!estSaisie(e.target) && cmd && e.altKey && e.code === 'KeyM' && commentaires.autorise) return faire(basculerCommentaire)
    if (!estSaisie(e.target) && commentaires.clavier(e)) return
    if (k === 'Escape') return faire(() => (recherche ? fermerRecherche() : fermer()))
    if (estSaisie(e.target)) return
    // ⌘Z et ⌘⇧Z défont et refont ici comme sur la toile : un dessin enregistré, par exemple.
    if (cmd && k.toLowerCase() === 'z' && contexte && dessin.autorise) return faire(() => void (e.shiftKey ? contexte.magasin.retablir() : contexte.magasin.annuler()))
    if (e.shiftKey && !cmd && !e.altKey && k.toLowerCase() === 'd' && dessin.autorise && pret) return faire(commencerDessin)
    if (cmd || e.altKey) return
    const s = defile.current
    if (!s) return
    const page = etat.current.courante
    if (k === 'ArrowRight' || k === 'PageDown') return faire(() => allerA(page + 1))
    if (k === 'ArrowLeft' || k === 'PageUp') return faire(() => allerA(page - 1))
    const defiler = (dy: number) => () => {
      s.scrollTop += dy
      mesurer()
    }
    if (k === 'ArrowDown') return faire(defiler(60))
    if (k === 'ArrowUp') return faire(defiler(-60))
    if (k === ' ') return faire(defiler((e.shiftKey ? -1 : 1) * s.clientHeight * 0.9))
    if (k === 'Home') return faire(() => allerA(0))
    if (k === 'End') return faire(() => allerA(etat.current.d.hauts.length - 1))
  }

  // Une bulle de commentaire refermée rend le focus à la page : la visionneuse le reprend, et la touche avec lui, avant
  // que la toile dessous ne la lise (Espace, Échap).
  const clavierActuel = useRef(clavier)
  clavierActuel.current = clavier
  useEffect(() => {
    const repli = (e: KeyboardEvent) => {
      if (e.target !== document.body && e.target !== document.documentElement) return
      racine.current?.focus({ preventScroll: true })
      clavierActuel.current(e as unknown as ToucheReact)
    }
    document.addEventListener('keydown', repli, true)
    return () => document.removeEventListener('keydown', repli, true)
  }, [])

  const n = tailles.length
  const bouton = (icone: NomIcone, libelle: string, onClick: () => void, plus: { court?: string; actif?: boolean; presse?: boolean } = {}) => (
    <button
      type="button"
      className="notak-pdf-bouton"
      aria-label={libelle}
      title={libelle}
      disabled={plus.actif === false}
      {...(plus.presse !== undefined ? { 'aria-pressed': plus.presse } : {})}
      onClick={onClick}
    >
      <Icone nom={icone} taille={18} />
      {plus.court && <span className="notak-pdf-libelle">{plus.court}</span>}
    </button>
  )
  const ailleurs = !!services?.ouvrirAilleurs

  const portail = createPortal(
    <div
      ref={racine}
      className="notak-pdf"
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      tabIndex={-1}
      data-sombre={theme?.colorScheme === 'dark' || undefined}
      data-dessin={dessin.actif || undefined}
      style={theme ?? undefined}
      onKeyDown={clavier}
      onKeyUp={clos}
      onPointerDown={clos}
      onPointerMove={clos}
      onPointerUp={clos}
      onClick={clos}
      onDoubleClick={clos}
      onContextMenu={clos}
    >
      <div className="notak-pdf-barre" role="toolbar" aria-label={t('pdf.barre')}>
        <div className="notak-pdf-groupe notak-pdf-titre-groupe">
          <span className="notak-pdf-titre" title={contenu.nom}>
            {titre}
          </span>
        </div>
        <div className="notak-pdf-groupe notak-pdf-milieu">
          <span className="notak-pdf-zoom-groupe">
            {bouton('zoomMoins', t('pdf.zoomMoins'), () => zoomer(zoomSuivant(zoom ?? 1, -1)), { actif: !!pret })}
            <span className="notak-pdf-pourcent" aria-label={t('pdf.zoom')}>
              {zoom === null ? '' : pourcent(zoom)}
            </span>
            {bouton('zoom', t('pdf.zoomPlus'), () => zoomer(zoomSuivant(zoom ?? 1, 1)), { actif: !!pret })}
          </span>
          {bouton('ajusterLargeur', t('pdf.ajuster'), ajuster, { court: t('pdf.ajuster.court'), actif: !!pret, presse: mode === 'largeur' })}
          <span className="notak-pdf-sep" role="separator" />
          <label className="notak-pdf-pages">
            <input
              className="notak-pdf-numero"
              type="text"
              inputMode="numeric"
              aria-label={t('pdf.allerPage')}
              title={t('pdf.allerPage')}
              disabled={!pret}
              value={saisiePage ?? (n > 0 ? String(courante + 1) : '')}
              size={Math.max(1, String(n).length)}
              onFocus={(e) => {
                setSaisiePage(e.currentTarget.value)
                e.currentTarget.select()
              }}
              onChange={(e) => setSaisiePage(e.currentTarget.value)}
              onBlur={() => setSaisiePage(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const p = lireNumeroPage(e.currentTarget.value, n)
                  if (p !== null) allerA(p - 1)
                  setSaisiePage(null)
                  racine.current?.focus({ preventScroll: true })
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  e.stopPropagation()
                  setSaisiePage(null)
                  racine.current?.focus({ preventScroll: true })
                }
              }}
            />
            <span className="notak-pdf-total">{n > 0 ? t('pdf.surPages', { n }) : ''}</span>
          </label>
        </div>
        <div className="notak-pdf-groupe notak-pdf-actions">
          {bouton('recherche', t('pdf.rechercher'), () => (recherche ? fermerRecherche() : ouvrirRecherche()), { actif: !!pret, presse: !!recherche })}
          {dessin.autorise &&
            bouton('croquis', t('pdf.dessiner.titre'), () => (dessin.actif ? dessin.enregistrer() : commencerDessin()), {
              court: t('pdf.dessiner'),
              actif: !!pret,
              presse: dessin.actif,
            })}
          {commentaires.autorise &&
            bouton('commentaire', t('pdf.commenter.titre'), basculerCommentaire, {
              court: t('pdf.commenter'),
              actif: !!pret,
              presse: commentaires.actif,
            })}
          <span className="notak-pdf-sep" role="separator" />
          <a className="notak-pdf-bouton" href={adresse} download={contenu.nom} rel="noopener" aria-label={t('pdf.telecharger.titre')} title={t('pdf.telecharger.titre')}>
            <Icone nom="exporter" taille={18} />
            <span className="notak-pdf-libelle">{t('pdf.telecharger')}</span>
          </a>
          {bouton('ouvrir', t(ailleurs ? 'pdf.ouvrirAilleurs' : 'pdf.ouvrirOnglet'), () => ouvrirDehors(services ?? {}, adresse, contenu.nom), {
            court: t(ailleurs ? 'pdf.ouvrirAilleurs.court' : 'pdf.ouvrirOnglet.court'),
          })}
          <span className="notak-pdf-sep" role="separator" />
          {bouton('fermer', t('pdf.fermer'), fermer)}
        </div>
      </div>
      {recherche && (
        <div className="notak-pdf-recherche" role="search">
          <Icone nom="recherche" taille={16} />
          <input
            ref={champRecherche}
            type="search"
            className="notak-pdf-recherche-champ"
            aria-label={t('pdf.rechercher.champ')}
            placeholder={t('pdf.rechercher.champ')}
            autoFocus
            value={recherche.texte}
            onChange={(e) => {
              const texte = e.currentTarget.value
              setRecherche({ ...RECHERCHE_VIDE, texte, enCours: !!requeteNormale(texte) })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                resultatVoisin(e.shiftKey ? -1 : 1)
              }
            }}
          />
          <span className="notak-pdf-recherche-compte" role="status">
            {!requeteNormale(recherche.texte)
              ? ''
              : recherche.enCours
                ? t('pdf.rechercheEnCours')
                : recherche.resultats.length === 0
                  ? t('pdf.aucunResultat')
                  : t('pdf.resultats', { i: recherche.courant + 1, n: recherche.resultats.length })}
          </span>
          {bouton('haut', t('pdf.resultatPrecedent'), () => resultatVoisin(-1), { actif: recherche.resultats.length > 0 })}
          {bouton('bas', t('pdf.resultatSuivant'), () => resultatVoisin(1), { actif: recherche.resultats.length > 0 })}
          {bouton('fermer', t('pdf.fermerRecherche'), fermerRecherche)}
        </div>
      )}
      <div
        ref={defile}
        className="notak-pdf-defile"
        onScroll={mesurer}
        onPointerDown={(e) => (fondPresse.current = estFond(e.target, e.currentTarget))}
        onClick={(e) => {
          // Un clic à côté des pages ferme, comme sur le voile de l'image en grand ; pas la fin d'une sélection de texte.
          const presse = fondPresse.current
          fondPresse.current = false
          if (presse && !dessin.actif && !commentaires.actif && estFond(e.target, e.currentTarget) && !window.getSelection()?.toString()) fermer()
        }}
      >
        {document_.etat === 'charge' && (
          <div className="notak-pdf-etat" role="status">
            <span className="notak-roue" aria-hidden /> {t('pdf.chargement')}
          </div>
        )}
        {document_.etat === 'erreur' && (
          <div className="notak-pdf-etat" role="alert">
            {t('pdf.erreur')}
          </div>
        )}
        {pret && zoom !== null && (
          <div className="notak-pdf-colonne" style={{ height: d.total, minWidth: d.largeur }}>
            {tranche &&
              Array.from({ length: tranche.derniere - tranche.premiere + 1 }, (_, k) => tranche.premiere + k).map((i) => (
                <PagePdf
                  key={i}
                  pdfjs={pret.pdfjs}
                  doc={pret.doc}
                  index={i}
                  echelle={echelle}
                  haut={d.hauts[i]!}
                  largeur={d.largeurs[i]!}
                  hauteur={d.hauteurs[i]!}
                  bouts={boutsParPage.get(i)}
                  dessous={<CalqueTraits traits={dessin.traitsDe(i + 1)} taille={tailles[i]!} vise={dessin.viseDe(i + 1)} contour={dessin.contour / Math.max(1, d.largeurs[i]!)} />}
                >
                  {dessin.saisie(i + 1, tailles[i]!)}
                  {commentaires.saisie(i + 1)}
                  {commentaires.epingles(i + 1)}
                </PagePdf>
              ))}
          </div>
        )}
      </div>
      {dessin.barre}
      {commentaires.actif && (
        <div className="notak-pdf-consigne" role="status">
          {t('pdf.commenter.consigne')}
        </div>
      )}
    </div>,
    document.body,
  )
  // L'ancre reste dans la carte : elle seule sait sous quelle toile (et donc quel thème) le fichier est posé.
  return (
    <>
      <span ref={ancre} hidden />
      {portail}
    </>
  )
}

