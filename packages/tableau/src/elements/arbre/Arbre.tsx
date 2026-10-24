import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type Arbre, type Id, type StyleSujet, nouvelId } from '../../coeur/tableau'
import { t } from '../../langue'
import { Surcouche } from '../surcouche'
import type { ContexteToile, PropsRendu, Services } from '../types'
import { POLICE, type Mesure, brancheDe, habitDe, mesureDeSujet, souligne, uniformiser } from './apparence'
import { fondDe, themeDeArbre } from './themes'
import { Dessin, type Glisses, RepereDepot } from './Dessin'
import { exporterCartes } from './exporter'
import { BarreBas } from './BarreBas'
import { BarreSujet } from './BarreSujet'
import { BoutonIcone, EnTete, type Onglet, PanneauCote } from './Fenetre'
import { ONGLETS_FORMAT, ONGLETS_ICONES, OngletCarte, OngletIcones, OngletPresenter, OngletStyle, type OngletIcone } from './onglets'
import { Outils } from './Outils'
import { type Hote, executer, styleDeRelation } from './actionsMenu'
import { MenuContextuel } from './MenuContextuel'
import { type CibleMenu, construireMenu } from './menus'
import { type Ancre, useInsertions } from './Insertions'
import { TYPE_GLISSE } from './OngletIcones'
import { type Fragment, boitesDeBranche, choisirParGenre, contenuZone, extraire, rectAutour } from './modele/insertions'
import { Icone } from '../../icones'
import { type Boite, type Disposition, disposer, ecartsDe, emprise } from './disposition'
import { gesteDe } from './modele/clavier'
import { resumesValides, sujetsDePlage } from './modele/elements'
import { comptes, reperesDe, sujetsMisEnEvidence } from './modele/listes'
import { equation } from './equation'
import { resumePlanning } from './modele/insertions'
import { type Geste, appliquerGeste } from './modele/gestes'
import { type Camera, DUREE_REVELATION, ZOOM_MIN, borner, defilementAuto, facteurMolette, interpoler, reveler, zoomAutour } from './modele/camera'
import { basculer, memeEnsemble, rectDeDeuxPoints, franchiLeSeuil, selectionDuCadre, selectionParPlage, sujetsDansCadre, tetesDe } from './modele/cadre'
import { type DebutEdition, type ChampPose, debutEdition, positionDuChamp, titreRemplace } from './modele/champ'
import { PASTILLE, ZOOM_PASTILLES, pastillesDe } from './modele/contour'
import { repereDeDepot } from './modele/depot'
import { copierSujets, deplacerSujets, ouLacher } from './modele/lacher'
import { type Lecture, branche, enfantsDe, lire, nouvelArbre, renommer, sousCarte } from './modele/sujets'
import { titreNeuf } from './modele/titres'
import { type Section } from './Panneau'
import { type OngletGauche, PanneauGauche } from './PanneauGauche'
import { Plan } from './Plan'
import { PopoverNote } from './PopoverNote'
import { Presentation } from './Presentation'
import { Recherche, correspondances } from './Recherche'
import { courbeRelation } from './trace/relations'

const tailleEquation = (latex: string) => {
  const { l, h } = equation(latex)
  return { l, h }
}

/** La carte lue, mesurée et disposée ; recalculée seulement quand elle change. */
export function useVue(a: Arbre): { lecture: Lecture; mesures: Map<Id, Mesure>; disposition: Disposition } {
  return useMemo(() => {
    const lecture = lire(a)
    const theme = themeDeArbre(a)
    const compacte = !!a.options?.compacte
    let mesures = new Map<Id, Mesure>()
    for (const id of lecture.sujets.keys()) mesures.set(id, mesureDeSujet(lecture, id, theme, { compacte, toutesNotes: !!a.options?.toutesNotes, tailleEquation, planning: resumePlanning }))
    if (a.options?.uniforme) mesures = uniformiser(lecture, mesures)
    const resumes = resumesValides(a, lecture).map(([id, r]) => ({ id, sujet: r.sujet, plage: sujetsDePlage(lecture, r), ...(r.style?.forme ? { forme: r.style.forme } : {}) }))
    const disposition = disposer(lecture, (id) => mesures.get(id) ?? { l: 40, h: 20 }, ecartsDe(brancheDe(lecture, lecture.central).forme ?? theme.branche, compacte), !!a.options?.libre, resumes)
    return { lecture, mesures, disposition }
  }, [a.sujets, a.options, a.resumes, a.theme, a.themePerso, a.police, a.policeCjk])
}

/** Les adresses affichables des images d'une carte, chargées au besoin. */
function useAdresses(a: Arbre, services: Services): (fichier: Id) => string | undefined {
  const [adresses, setAdresses] = useState<ReadonlyMap<Id, string>>(new Map())
  const fichiers = useMemo(
    () => [
      ...new Set([
        ...Object.values(a.sujets).flatMap((s) => (s?.image?.fichier ? [s.image.fichier] : [])),
        ...Object.values(a.groupes ?? {}).flatMap((g) => g?.marqueurs.flatMap((m) => (m.fichier ? [m.fichier] : [])) ?? []),
      ]),
    ],
    [a.sujets, a.groupes],
  )
  useEffect(() => {
    let vivant = true
    const manquants = fichiers.filter((f) => !adresses.has(f))
    if (manquants.length === 0 || !services.fichiers) return
    void Promise.all(manquants.map(async (f) => [f, await services.fichiers!.adresse(f)] as const)).then((paires) => {
      if (!vivant) return
      setAdresses((m) => {
        const n = new Map(m)
        for (const [f, adr] of paires) if (adr) n.set(f, adr)
        return n
      })
    })
    return () => {
      vivant = false
    }
  }, [fichiers, adresses, services])
  return useCallback((f: Id) => adresses.get(f), [adresses])
}

/** La marge autour de la carte dans l'aperçu, en px de carte. */
const MARGE_APERCU = 24

/** Sur la toile : la carte en réduction. Ouverte (double-clic, Entrée), elle passe en grand. */
export function RenduArbre({ element, enEdition, contexte, changer }: PropsRendu<Arbre>) {
  const a = element.contenu
  const { lecture, mesures, disposition } = useVue(a)
  const adresse = useAdresses(a, contexte.services)
  const cadre = emprise(disposition.boites.values())
  const [x, y, l, h] = [cadre.x - MARGE_APERCU, cadre.y - MARGE_APERCU, cadre.l + 2 * MARGE_APERCU, cadre.h + 2 * MARGE_APERCU]
  return (
    <div className="notak-arbre" style={fondDe(a) ? { background: fondDe(a) } : undefined}>
      <svg className="notak-arbre-apercu" viewBox={`${x} ${y} ${l} ${h}`} style={{ aspectRatio: `${Math.min(3, Math.max(0.75, l / h))}` }} aria-label={lecture.sujets.get(lecture.central)?.titre || t('arbre.vide')} role="img">
        <Dessin arbre={a} lecture={lecture} disposition={disposition} mesures={mesures} adresse={adresse} />
      </svg>
      {enEdition && <Grand id={element.id} contexte={contexte} changer={changer} />}
    </div>
  )
}

type Edition = DebutEdition
type Point = { x: number; y: number }

/** La taille de la surface, en px d'écran (rien : 0 sur 0, comme avant qu'elle ne soit montée). */
const fenetreDe = (s: HTMLElement | null) => {
  const r = s?.getBoundingClientRect()
  return { l: r?.width ?? 0, h: r?.height ?? 0 }
}

/** Les gestes qui créent un sujet sans l'ouvrir à l'écriture (Entrée, Tab, Maj+Entrée, Cmd+Entrée) ; les autres (un flottant au double-clic, un résumé) l'ouvrent. */
const GESTES_SANS_EDITION: ReadonlySet<string> = new Set(['enfant', 'frere', 'parent'])
/** Ceux après lesquels la caméra ramène le sujet dans la vue, s'il en sort. */
const GESTES_QUI_REVELENT: ReadonlySet<string> = new Set(['enfant', 'frere', 'parent', 'dupliquer', 'flottant', 'resume'])

/**
 * La carte ouverte en grand : on y choisit, crée, écrit et range les sujets au clavier et à la souris
 * (docs/XMIND.md § 4). Chaque geste part de l'état le plus récent du tableau, jamais d'une copie gardée : un geste
 * d'un autre arrivé entre-temps n'est pas défait.
 */
function Grand({ id, contexte, changer }: { id: Id; contexte: ContexteToile; changer(a: Arbre): void }) {
  const actuel = useCallback((): Arbre | null => {
    const e = contexte.magasin.lire().elements.find((x) => x.id === id)
    return e?.contenu.type === 'arbre' ? e.contenu : null
  }, [contexte, id])
  const [a, setA] = useState<Arbre>(() => actuel() ?? { type: 'arbre', sujets: {} })
  useEffect(
    () =>
      contexte.magasin.ecouter(() => {
        const neuf = actuel()
        if (neuf) setA(neuf)
      }),
    [contexte, actuel],
  )
  // « Afficher la branche seule » (Cmd+;) : la vue ne montre que cette branche, les gestes touchent la carte entière.
  const [seule, setSeule] = useState<Id | null>(null)
  const vue = useMemo(() => (seule && a.sujets[seule] ? sousCarte(a, seule) : a), [a, seule])
  // Le titre qu'on écrit : tant qu'il s'écrit, il remplace celui du sujet dans ce que la carte mesure et dispose, pour que
  // le sujet grandisse et que la carte se range autour (les autres gestes, eux, partent du titre enregistré).
  const [edition, setEdition] = useState<Edition | null>(null)
  const vueTitree = useMemo(() => titreRemplace(vue, edition?.id, edition?.texte), [vue, edition?.id, edition?.texte])
  const { lecture, mesures, disposition } = useVue(vueTitree)
  const adresse = useAdresses(a, contexte.services)
  const lectureSeule = !!contexte.services.lectureSeule

  // La sélection mêle des sujets, des relations et des limites : chacun est un identifiant.
  const [selection, setSelection] = useState<ReadonlySet<Id>>(() => new Set([lecture.central]))
  const [panneau, setPanneau] = useState<{ section?: Section } | null>(null)
  // Le panneau de côté, comme celui de Xmind : le format (Style, Présenter, Carte) ou les icônes.
  const [onglet, setOnglet] = useState<Onglet>('style')
  const [icones, setIcones] = useState(false)
  const [ongletIcones, setOngletIcones] = useState<OngletIcone>('marqueurs')
  // Les modes de docs/XMIND.md § 6 : le plan remplace la carte ; Zen, la présentation et la recherche s'y posent.
  const [plan, setPlan] = useState(false)
  const [zen, setZen] = useState(false)
  // Le mode Pitch : le sujet d'où l'on part (absent : le central) tant que la présentation dure.
  const [presentation, setPresentation] = useState<{ depart?: Id } | null>(null)
  // Le panneau de gauche (plan, notes, étiquettes), les repères cochés qu'il met en évidence, la note ouverte en popover.
  const [gauche, setGauche] = useState<{ onglet: OngletGauche } | null>(null)
  const [coches, setCoches] = useState<ReadonlySet<string>>(new Set())
  const [noteDe, setNoteDe] = useState<Id | null>(null)
  const [zoomPlan, setZoomPlan] = useState(1)
  const [recherche, setRecherche] = useState<{ texte: string; i: number } | null>(null)
  // Maj+Cmd+R : la relation part de ce sujet, et attend le clic sur sa cible.
  const [relier, setRelier] = useState<{ de: Id; p: Point | null } | null>(null)
  // Le menu contextuel, et ce qu'il vise.
  const [menu, setMenu] = useState<{ x: number; y: number; cible: CibleMenu } | null>(null)
  // Créer une zone au glisser : armé par le bouton Zone, puis le rectangle qu'on trace.
  const [traceZone, setTraceZone] = useState<{ de: Point; vers: Point } | 'arme' | null>(null)
  // Une zone qu'on tire : de combien elle a bougé depuis la prise.
  const [zoneTiree, setZoneTiree] = useState<{ id: Id; depart: Point; p: Point; membres: Id[] } | null>(null)
  // Les branches copiées ou coupées, à coller ; le style d'une relation copiée.
  const presse = useRef<Fragment | null>(null)
  const styleRelation = useRef<ReturnType<typeof styleDeRelation> | null>(null)
  const surface = useRef<HTMLDivElement | null>(null)
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, z: 1 })
  const [montee, setMontee] = useState(false)
  // La surcouche ne monte la surface qu'au second rendu (elle lit d'abord le thème) : on centre le central dès qu'elle est là.
  const poserSurface = useCallback((noeud: HTMLDivElement | null) => {
    const premiere = !surface.current && noeud
    surface.current = noeud
    if (!premiere) return
    const r = noeud.getBoundingClientRect()
    setCamera({ x: r.width / 2, y: r.height / 2, z: 1 })
    setMontee(true)
  }, [])

  // La caméra suit la carte et se retient dans l'étendue défilable (le contenu, plus une fenêtre de marge de chaque côté).
  const contenu = useMemo(() => emprise(disposition.boites.values()), [disposition])
  const contenuRef = useRef(contenu)
  contenuRef.current = contenu
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const poser = useCallback((f: (c: Camera) => Camera) => setCamera((c) => borner(f(c), contenuRef.current, fenetreDe(surface.current))), [])
  // La caméra qui rejoint un sujet glisse en 200 ms, d'un mouvement linéaire ; tout geste de l'utilisateur l'arrête.
  const animation = useRef(0)
  const arreterAnimation = useCallback(() => cancelAnimationFrame(animation.current), [])
  const animerVers = useCallback((cible: Camera) => {
    cancelAnimationFrame(animation.current)
    const depart = cameraRef.current
    const t0 = performance.now()
    const pas = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / DUREE_REVELATION))
      setCamera(interpoler(depart, cible, k))
      if (k < 1) animation.current = requestAnimationFrame(pas)
    }
    animation.current = requestAnimationFrame(pas)
  }, [])
  useEffect(() => () => cancelAnimationFrame(animation.current), [])

  const estObjet = useCallback((x: Id) => !!(vue.relations?.[x] || vue.limites?.[x] || vue.zones?.[x]), [vue])
  // Ce qui a disparu (effacé, ou par un autre) sort de la sélection.
  const choisis = useMemo(() => new Set([...selection].filter((x) => disposition.boites.has(x) || estObjet(x))), [selection, disposition, estObjet])
  const sujetsChoisis = [...choisis].filter((x) => disposition.boites.has(x))
  const courant = sujetsChoisis.at(-1) ?? lecture.central

  /** Le sujet qu'un geste vient de créer ou de choisir, que la caméra doit ramener dans la vue au prochain rendu. */
  const aReveler = useRef<Id | null>(null)

  const faire = useCallback(
    (geste: Geste) => {
      const avant = actuel()
      if (!avant || lectureSeule) return
      const r = appliquerGeste(avant, geste, titreNeuf)
      if (!r) return
      if (r.arbre !== avant) changer(r.arbre)
      if (r.choisir) setSelection(new Set([r.choisir]))
      // Un sujet que le clavier vient de créer : la caméra le ramène dans la vue s'il en sort.
      if (r.choisir && GESTES_QUI_REVELENT.has(geste.type)) aReveler.current = r.choisir
      // Entrée, Tab et Maj+Entrée créent et choisissent le sujet, sans ouvrir le champ : Espace, un double-clic ou une
      // frappe l'ouvrent. Dans le plan, le sujet neuf s'écrit sur sa ligne, pas dans un champ posé sur la carte.
      if (r.editer && !plan && !GESTES_SANS_EDITION.has(geste.type)) setEdition(debutEdition(r.editer, r.arbre.sujets[r.editer]?.titre ?? ''))
    },
    [actuel, changer, lectureSeule, plan],
  )
  const valider = useCallback(() => {
    if (!edition) return
    const avant = actuel()
    setEdition(null)
    if (!avant) return
    if (avant.sujets[edition.id]) {
      if (avant.sujets[edition.id]!.titre !== edition.texte) faire({ type: 'renommer', id: edition.id, titre: edition.texte })
    } else faire({ type: 'titrer', id: edition.id, titre: edition.texte })
  }, [edition, actuel, faire])
  /** Échap : le texte écrit est abandonné, le titre reste ce qu'il était. */
  const annulerEdition = useCallback(() => setEdition(null), [])

  // Le style copié (Cmd+Alt+C), à coller sur d'autres sujets ; `undefined` : rien de copié, `null` : un sujet sans style.
  const styleCopie = useRef<StyleSujet | null | undefined>(undefined)

  const titreObjet = (x: Id) => vue.relations?.[x]?.titre ?? vue.limites?.[x]?.titre ?? vue.zones?.[x]?.titre ?? ''
  /** Ouvre le champ d'un titre ; `frappe` : le caractère tapé, qui remplace le titre. */
  const ouvrirEdition = (x: Id, frappe?: string) => {
    if (lectureSeule) return
    const sujet = vue.sujets[x]
    setEdition(debutEdition(x, sujet ? sujet.titre : titreObjet(x), { ...(frappe !== undefined ? { frappe } : {}), objet: !sujet }))
  }

  // — Insérer, copier, menus : ce que la barre d'outils et le clic droit posent sur la carte —
  const ouvrirIcones = useCallback((o: OngletIcone) => (setIcones(true), setOngletIcones(o), setPanneau(null)), [])
  /** Où est un sujet à l'écran : le popover d'un éditeur se pose dessous. */
  const ancre = (x: Id): Ancre | null => {
    const b = disposition.boites.get(x)
    const r = surface.current?.getBoundingClientRect()
    return b && r ? { x: r.left + camera.x + b.x * camera.z, y: r.top + camera.y + b.y * camera.z, l: b.l * camera.z, h: b.h * camera.z } : null
  }
  /** Le bouton Zone : autour des flottants choisis, sinon on trace le cadre au glisser. */
  const creerZone = useCallback(() => {
    const flottants = sujetsChoisis.filter((x) => lecture.sujets.get(x)?.genre === 'detache')
    const boites = boitesDeBranche(lecture, disposition.boites, flottants)
    if (boites.length > 0) faire({ type: 'zone', rect: rectAutour(boites), titre: t('arbre.inserer.zone') })
    else setTraceZone('arme')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sujetsChoisis.join(','), lecture, disposition, faire])
  const insertions = useInsertions({
    lecture,
    ids: sujetsChoisis,
    faire,
    contexte,
    ancre,
    ouvrirIcones,
    ouvrirNote: () => ouvrirNote(courant),
    zone: creerZone,
    adresse,
  })
  const membresDeZone = (id: Id) => {
    const z = vue.zones?.[id]
    return z ? contenuZone(lecture, disposition.boites, z) : []
  }
  const copier = (ids: Id[], couper: boolean) => {
    const f = extraire(actuel() ?? vue, ids)
    if (!f) return
    presse.current = f
    if (couper) faire({ type: 'supprimer', ids })
  }
  const collerAu = (cible: { parent: Id } | { x: number; y: number }) => {
    const fragment = presse.current
    if (fragment) faire({ type: 'coller', fragment, ...('parent' in cible ? { parent: cible.parent } : { position: { x: cible.x, y: cible.y } }) })
  }
  const hote: Hote = {
    arbre: () => actuel() ?? vue,
    lecture: () => lecture,
    faire,
    choisir: (ids) => setSelection(new Set(ids)),
    editer: (x) => ouvrirEdition(x),
    copier,
    coller: collerAu,
    copierStyle: (x) => void (styleCopie.current = lecture.sujets.get(x)?.style ?? null),
    collerStyle: (ids) => styleCopie.current !== undefined && faire({ type: 'collerStyle', ids, style: styleCopie.current ?? undefined }),
    copierStyleRelation: (x) => void (styleRelation.current = styleDeRelation(vue.relations?.[x])),
    collerStyleRelation: (ids) => styleRelation.current && faire({ type: 'relationStyleColler', ids, ...styleRelation.current }),
    inserer: insertions.actions,
    ouvrirIcones,
    ouvrirNote: (x) => (x && setSelection(new Set([x])), setPanneau({ section: 'note' })),
    allerAuCentral: () => {
      const r = surface.current?.getBoundingClientRect()
      if (r) setCamera((c) => ({ ...c, x: r.width / 2, y: r.height / 2 }))
      setSelection(new Set([lecture.central]))
    },
    brancheSeule: (x) => (setSeule((v) => (v ? null : x === lecture.central ? null : x)), setSelection(new Set([x]))),
    relier: (x) => setRelier({ de: x, p: null }),
    tailles: (ids) => Object.fromEntries(ids.flatMap((x) => (disposition.boites.get(x) ? [[x, { l: disposition.boites.get(x)!.l, h: disposition.boites.get(x)!.h }]] : []))),
    contenuZone: membresDeZone,
    ajusterZone: (x) => {
      const boites = boitesDeBranche(lecture, disposition.boites, membresDeZone(x))
      if (boites.length > 0) faire({ type: 'zoneRect', id: x, rect: rectAutour(boites) })
    },
    telecharger: (fichier, nom) => void ouvrirOuTelecharger(contexte, fichier, nom),
    ouvrirFichier: (fichier) => void ouvrirOuTelecharger(contexte, fichier),
    flottant: (x, y) => faire({ type: 'flottant', position: { x, y } }),
    ouvrirLien: (x) => ouvrirIcone(`lien:${x}`),
  }

  // Le plan ou le panneau qui se ferment emportent le champ qui avait le focus : on le rend à la carte, sans quoi le
  // clavier ne parle plus à personne.
  useEffect(() => {
    if (plan || panneau) return
    const actif = document.activeElement
    if (!actif || actif === document.body) surface.current?.closest<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true })
  }, [plan, panneau])

  /** Cadre la vue sur ces boîtes, avec une marge. */
  const cadrer = useCallback((boites: Boite[]) => {
    const r = surface.current?.getBoundingClientRect()
    if (!r || boites.length === 0) return
    const e = emprise(boites)
    const z = Math.min(2, Math.max(ZOOM_MIN, Math.min((r.width - 160) / e.l, (r.height - 160) / e.h)))
    setCamera({ x: r.width / 2 - (e.x + e.l / 2) * z, y: r.height / 2 - (e.y + e.h / 2) * z, z })
  }, [])
  const basculerZen = useCallback(() => {
    // Le Zen ferme le panneau de gauche, comme Xmind.
    setGauche(null)
    setZen((z) => {
      const fond = surface.current?.closest('.notak-arbre-fond') as HTMLElement | null
      if (!z) void fond?.requestFullscreen?.().catch(() => {})
      else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
      return !z
    })
  }, [])
  const resultats = useMemo(() => (recherche ? correspondances(lecture, recherche.texte) : []), [recherche, lecture])
  useEffect(() => {
    if (!recherche || resultats.length === 0) return
    const id = resultats[recherche.i % resultats.length]!
    setSelection(new Set([id]))
    const b = disposition.boites.get(id)
    const r = surface.current?.getBoundingClientRect()
    if (b && r) setCamera((c) => ({ ...c, x: r.width / 2 - (b.x + b.l / 2) * c.z, y: r.height / 2 - (b.y + b.h / 2) * c.z }))
  }, [recherche, resultats, disposition])

  const surTouche = (e: React.KeyboardEvent): boolean => {
    if (edition) return e.key === 'Escape'
    // Échap pendant un cadre ou un glisser d'un sujet : le geste s'arrête (le cadre garde ce qu'il avait pris, le sujet ne bouge pas).
    if (e.key === 'Escape' && (tire || cadre)) {
      abandonnerGeste()
      return true
    }
    // La présentation prend toutes les touches (Presentation.tsx) : la carte dessous n'en voit aucune.
    if (presentation !== null) return true
    if (e.key === 'Escape' && zen) {
      basculerZen()
      return true
    }
    // Dans le plan, la ligne garde ses touches ; seuls les raccourcis de la carte entière remontent.
    const dansLePlan = !!(e.target as Element).closest?.('.notak-arbre-plan')
    if (e.key === 'Escape' && plan) {
      setPlan(false)
      return true
    }
    // La barre et le panneau gardent leurs touches.
    if ((e.target as Element).closest?.('.notak-arbre-barre, .notak-arbre-panneau')) return false
    if (e.key === 'Escape' && relier) {
      setRelier(null)
      return true
    }
    if (e.key === 'Escape' && traceZone) {
      setTraceZone(null)
      return true
    }
    if (e.key === 'Escape' && panneau) {
      setPanneau(null)
      return true
    }
    // Échap sort de la branche seule avant de fermer la carte.
    if (e.key === 'Escape' && seule) {
      setSeule(null)
      return true
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) contexte.magasin.retablir()
      else contexte.magasin.annuler()
      return true
    }
    // Une relation ou une limite choisie seule : Espace édite son titre, Suppr la retire.
    const objet = [...choisis].find(estObjet)
    if (objet && sujetsChoisis.length === 0) {
      if (e.key === ' ' || e.key === 'F2' || e.key === 'Enter') {
        e.preventDefault()
        ouvrirEdition(objet)
        return true
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        faire({ type: 'retirer', ids: [...choisis] })
        setSelection(new Set([lecture.central]))
        return true
      }
    }
    // Cmd+C, Cmd+X, Cmd+V, Cmd+A : copier, couper, coller des branches, tout choisir ; Alt+Cmd+Z : une zone.
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
      const k = e.key.toLowerCase()
      if (!e.altKey && (k === 'c' || k === 'x') && !dansLePlan) {
        e.preventDefault()
        copier(sujetsChoisis.length ? sujetsChoisis : [courant], k === 'x' && !lectureSeule)
        return true
      }
      if (!e.altKey && k === 'v' && !dansLePlan && !lectureSeule) {
        e.preventDefault()
        collerAu({ parent: courant })
        return true
      }
      if (!e.altKey && k === 'a' && !dansLePlan) {
        e.preventDefault()
        setSelection(new Set(choisirParGenre(vue, lecture, null, 'tout')))
        return true
      }
      if (e.altKey && (e as unknown as KeyboardEvent).code === 'KeyZ' && !lectureSeule) {
        e.preventDefault()
        creerZone()
        return true
      }
    }
    const geste = gesteDe(e.nativeEvent, sujetsChoisis.length ? sujetsChoisis : [courant], lecture, disposition)
    if (!geste) return false
    if (dansLePlan && geste.type !== 'mode') return false
    e.preventDefault()
    switch (geste.type) {
      case 'mode':
        if (geste.mode === 'plan') setPlan((x) => !x)
        else if (geste.mode === 'zen') basculerZen()
        else if (geste.mode === 'presentation') lancerPresentation()
        else if (geste.mode === 'navigation') basculerGauche()
        else setRecherche({ texte: recherche?.texte ?? '', i: 0 })
        return true
      case 'editer':
        ouvrirEdition(geste.id, geste.frappe)
        return true
      case 'choisir':
        setSelection(new Set(geste.ids))
        aReveler.current = geste.ids.at(-1) ?? null
        return true
      case 'recadrer': {
        const r = surface.current?.getBoundingClientRect()
        if (r) setCamera((c) => ({ ...c, x: r.width / 2, y: r.height / 2 }))
        setSelection(new Set([lecture.central]))
        return true
      }
      case 'brancheSeule':
        setSeule((x) => (x ? null : geste.id === lecture.central ? null : geste.id))
        setSelection(new Set([geste.id]))
        return true
      case 'zoom':
        setCamera((c) => zoomer(c, geste.facteur === 0 ? 1 / c.z : geste.facteur, surface.current))
        return true
      case 'relier':
        if (!lectureSeule) setRelier({ de: geste.id, p: null })
        return true
      case 'panneau':
        if (geste.section === 'note') ouvrirNote(courant)
        // Étiquettes, lien web et image locale s'ouvrent près du sujet, comme dans Xmind.
        else if (geste.section === 'etiquettes') insertions.actions.etiquettes()
        else if (geste.section === 'lien') insertions.actions.lienWeb()
        else if (geste.section === 'image') insertions.actions.imageLocale()
        else setPanneau((p) => (p && !geste.section ? null : { ...(geste.section ? { section: geste.section } : {}) }))
        return true
      case 'supprimer':
        faire({ type: 'supprimer', ids: [...choisis] })
        return true
      case 'copierStyle':
        styleCopie.current = lecture.sujets.get(geste.id)?.style ?? null
        return true
      case 'collerStyleCopie':
        if (styleCopie.current !== undefined) faire({ type: 'collerStyle', ids: geste.ids, style: styleCopie.current ?? undefined })
        return true
    }
    faire(geste)
    return true
  }

  // Les gestes de la souris sur la toile (docs/XMIND.md § 4 bis). Le glisser du fond trace le cadre de sélection ; celui d'un
  // sujet le déplace ; celui du central, ou du bouton droit, fait défiler la carte ; celui d'un point de contrôle courbe
  // une relation. Tous partent d'un appui et ne commencent qu'au-delà de 2 px : en deçà, c'est un clic.
  const fond = useRef<{ x: number; y: number; de: Point } | null>(null)
  const prise = useRef<{ id: Id; x: number; y: number; depart: Point; reduire: boolean } | null>(null)
  /** Le défilement à la main : le bouton droit (le menu attend le relâchement), ou le bouton gauche sur le central. */
  const main = useRef<{ x: number; y: number; cx: number; cy: number; bouton: 0 | 1 | 2; panne: boolean; id?: Id; reduire?: boolean; menu?: { x: number; y: number; cible: Element } } | null>(null)
  const supprimerMenu = useRef(false)
  const [cadre, setCadre] = useState<{ de: Point; ajout: boolean } | null>(null)
  const [tire, setTire] = useState<{ id: Id; ids: Id[]; depart: Point; maj: boolean; alt: boolean } | null>(null)
  const [pointeur, setPointeur] = useState<Point | null>(null)
  const [panne, setPanne] = useState(false)
  const [survol, setSurvol] = useState<Id | null>(null)
  const [controle, setControle] = useState<{ relation: Id; i: 0 | 1; p: Point } | null>(null)
  // La fenêtre qui n'a plus le focus grise le contour de sélection et cache les pastilles.
  const [fenetreActive, setFenetreActive] = useState(() => typeof document === 'undefined' || document.hasFocus())
  useEffect(() => {
    const activer = () => setFenetreActive(true)
    const desactiver = () => setFenetreActive(false)
    window.addEventListener('focus', activer)
    window.addEventListener('blur', desactiver)
    return () => (window.removeEventListener('focus', activer), window.removeEventListener('blur', desactiver))
  }, [])
  const versCarte = (e: { clientX: number; clientY: number }) => {
    const r = surface.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left - camera.x) / camera.z, y: (e.clientY - r.top - camera.y) / camera.z }
  }
  const capturer = (e: React.PointerEvent) => {
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // Un pointeur que le navigateur ne connaît plus : le glisser continue sans capture.
    }
  }
  const abandonnerGeste = () => {
    fond.current = null
    prise.current = null
    setCadre(null)
    setTire(null)
    setPointeur(null)
  }
  // Pendant un cadre ou un glisser, la sélection suit le pointeur et la caméra défile près du bord.
  const enGeste = cadre !== null || tire !== null
  const pointeurCarte = enGeste && pointeur ? versCarte({ clientX: pointeur.x, clientY: pointeur.y }) : null
  const rectCadre = cadre && pointeurCarte ? rectDeDeuxPoints(cadre.de, pointeurCarte) : null
  useEffect(() => {
    if (!cadre || !rectCadre) return
    const trouves = sujetsDansCadre(disposition.boites, rectCadre)
    setSelection((s) => {
      const suivante = selectionDuCadre(s, trouves, cadre.ajout)
      return memeEnsemble(s, suivante) ? s : suivante
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadre?.ajout, rectCadre?.x, rectCadre?.y, rectCadre?.l, rectCadre?.h, disposition])
  const pointeurRef = useRef<Point | null>(null)
  pointeurRef.current = pointeur
  useEffect(() => {
    if (!enGeste) return
    let image = 0
    const boucle = () => {
      const r = surface.current?.getBoundingClientRect()
      const p = pointeurRef.current
      if (r && p) {
        const { dx, dy } = defilementAuto({ x: p.x - r.left, y: p.y - r.top }, { l: r.width, h: r.height }, cameraRef.current.z)
        if (dx !== 0 || dy !== 0) poser((c) => ({ ...c, x: c.x + dx, y: c.y + dy }))
      }
      image = requestAnimationFrame(boucle)
    }
    image = requestAnimationFrame(boucle)
    return () => cancelAnimationFrame(image)
  }, [enGeste, poser])
  // Maj, Alt et Cmd se lisent en continu : on les presse ou les relâche en plein glisser.
  useEffect(() => {
    if (!enGeste) return
    const suivre = (e: KeyboardEvent) => {
      setTire((t) => (t && (t.maj !== e.shiftKey || t.alt !== e.altKey) ? { ...t, maj: e.shiftKey, alt: e.altKey } : t))
      setCadre((c) => (c && c.ajout !== (e.shiftKey || e.metaKey) ? { ...c, ajout: e.shiftKey || e.metaKey } : c))
    }
    window.addEventListener('keydown', suivre, true)
    window.addEventListener('keyup', suivre, true)
    return () => (window.removeEventListener('keydown', suivre, true), window.removeEventListener('keyup', suivre, true))
  }, [enGeste])

  const surAppui = (e: React.PointerEvent) => {
    const cible = e.target as Element
    // Un bouton garde son clic : capturer le pointeur pour défiler l'enverrait à la surface.
    if (cible.closest('button, textarea, input, select, label, .notak-arbre-barre, .notak-arbre-panneau')) return
    // Le bouton droit défile la carte ; sans glisser, son menu s'ouvre au relâchement.
    if (e.button === 2) {
      main.current = { x: e.clientX, y: e.clientY, cx: camera.x, cy: camera.y, bouton: 2, panne: false }
      return
    }
    // Le clic molette défile la carte dès l'appui, où qu'on le prenne (ni sélection, ni menu).
    if (e.button === 1) {
      e.preventDefault()
      main.current = { x: e.clientX, y: e.clientY, cx: camera.x, cy: camera.y, bouton: 1, panne: true }
      setPanne(true)
      setSurvol(null)
      capturer(e)
      return
    }
    if (e.button !== 0) return
    const attribut = (nom: string) => cible.closest(`[${nom}]`)?.getAttribute(nom) ?? null
    if (traceZone === 'arme' && !lectureSeule) {
      const p = versCarte(e)
      setTraceZone({ de: p, vers: p })
      capturer(e)
      return
    }
    const repli = attribut('data-repli')
    if (repli) return faire({ type: 'replier', id: repli })
    // Les pastilles « + » d'un sujet choisi : un enfant, ou un frère après lui.
    const ajout = attribut('data-ajout')
    if (ajout && !lectureSeule) {
      const [genre, id] = ajout.split(':') as ['enfant' | 'frere', Id]
      return faire(genre === 'enfant' ? { type: 'enfant', id } : { type: 'frere', id, avant: false })
    }
    const tache = attribut('data-tache')
    if (tache && !lectureSeule) {
      const s = lecture.sujets.get(tache)
      return faire({ type: 'porter', ids: [tache], champ: 'tache', valeur: s?.tache === 'faite' ? 'a-faire' : 'faite' })
    }
    const icone = attribut('data-icone')
    if (icone) return ouvrirIcone(icone)
    const ctrl = attribut('data-controle')
    if (ctrl && !lectureSeule) {
      const [rel, i] = ctrl.split(':') as [Id, string]
      setControle({ relation: rel, i: i === '1' ? 1 : 0, p: versCarte(e) })
      capturer(e)
      return
    }
    const sujet = attribut('data-sujet')
    if (edition && sujet !== edition.id) valider()
    if (relier) {
      if (sujet && sujet !== relier.de) faire({ type: 'relation', de: relier.de, vers: sujet })
      setRelier(null)
      return
    }
    const objet = attribut('data-relation') ?? attribut('data-limite')
    if (objet && !sujet) {
      setSelection((s) => (e.shiftKey || e.metaKey ? basculer(s, objet) : new Set([objet])))
      return
    }
    const zone = attribut('data-zone')
    if (zone && !sujet) {
      setSelection((s) => (e.shiftKey || e.metaKey ? basculer(s, zone) : new Set([zone])))
      if (!lectureSeule) {
        const p = versCarte(e)
        setZoneTiree({ id: zone, depart: p, p, membres: membresDeZone(zone) })
        capturer(e)
      }
      return
    }
    const depart = { x: e.clientX, y: e.clientY }
    if (sujet) {
      // Le sujet pressé est choisi à l'appui ; pressé dans une sélection, il la laisse entière (pour glisser le groupe).
      // Cmd le bascule, Maj prend aussi les frères d'entre deux.
      const suivante = e.metaKey ? basculer(choisis, sujet) : e.shiftKey ? selectionParPlage(lecture, choisis, sujet) : choisis.has(sujet) ? new Set(choisis) : new Set([sujet])
      setSelection(suivante)
      if (!suivante.has(sujet) || !disposition.boites.has(sujet)) return
      // Relâché sans glisser, il réduit une sélection multiple à lui seul.
      const reduire = !e.metaKey && !e.shiftKey && suivante.size > 1
      // Pas de capture du pointeur ici : elle volerait le double-clic au sujet (elle viendra avec le glisser).
      if (sujet === lecture.central) main.current = { ...depart, cx: camera.x, cy: camera.y, bouton: 0, panne: false, id: sujet, reduire }
      else if (!lectureSeule) prise.current = { id: sujet, ...depart, depart: versCarte(e), reduire }
      return
    }
    // Le fond : l'appui vide la sélection (Maj ou Cmd la gardent), le glisser trace le cadre.
    if (!e.shiftKey && !e.metaKey) setSelection(new Set())
    fond.current = { ...depart, de: versCarte(e) }
  }
  const surMouvement = (e: React.PointerEvent) => {
    if (relier) return setRelier({ ...relier, p: versCarte(e) })
    if (traceZone && traceZone !== 'arme') return setTraceZone({ ...traceZone, vers: versCarte(e) })
    if (zoneTiree) return setZoneTiree({ ...zoneTiree, p: versCarte(e) })
    if (controle) return setControle({ ...controle, p: versCarte(e) })
    const client = { x: e.clientX, y: e.clientY }
    const m = main.current
    if (m) {
      if (!m.panne && franchiLeSeuil(m, client)) {
        m.panne = true
        setPanne(true)
        setSurvol(null)
        capturer(e)
      }
      if (m.panne) {
        arreterAnimation()
        poser((c) => ({ ...c, x: m.cx + client.x - m.x, y: m.cy + client.y - m.y }))
      }
      return
    }
    const f = fond.current
    if (f) {
      if (cadre || franchiLeSeuil(f, client)) {
        if (!cadre) (capturer(e), setSurvol(null))
        const ajout = e.shiftKey || e.metaKey
        setCadre((c) => (c && c.ajout === ajout ? c : { de: f.de, ajout }))
        setPointeur(client)
      }
      return
    }
    const pr = prise.current
    if (pr) {
      if (tire || franchiLeSeuil(pr, client)) {
        if (!tire) {
          // Les sujets de tête de la sélection se glissent ensemble, dans l'ordre où ils sont à l'écran.
          const ids = tetesDe(lecture, choisis)
          if (!ids.includes(pr.id)) ids.push(pr.id)
          const place = (x: Id) => disposition.boites.get(x) ?? { x: 0, y: 0 }
          ids.sort((u, v) => place(u).y - place(v).y || place(u).x - place(v).x)
          capturer(e)
          setSurvol(null)
          setTire({ id: pr.id, ids, depart: pr.depart, maj: e.shiftKey, alt: e.altKey })
        } else setTire((t) => (t && (t.maj !== e.shiftKey || t.alt !== e.altKey) ? { ...t, maj: e.shiftKey, alt: e.altKey } : t))
        setPointeur(client)
      }
      return
    }
    // Sans bouton : le sujet sous le pointeur prend le contour du survol.
    const sous = (e.target as Element).closest?.('[data-sujet]')?.getAttribute('data-sujet') ?? null
    setSurvol((v) => (v === sous ? v : sous))
  }
  const surRelache = (e: React.PointerEvent) => {
    if (traceZone && traceZone !== 'arme') {
      // Le cadre tracé : trop petit, c'est un simple clic, on garde le mode armé.
      const [x0, x1] = [Math.min(traceZone.de.x, traceZone.vers.x), Math.max(traceZone.de.x, traceZone.vers.x)]
      const [y0, y1] = [Math.min(traceZone.de.y, traceZone.vers.y), Math.max(traceZone.de.y, traceZone.vers.y)]
      if (x1 - x0 < 12 || y1 - y0 < 12) return setTraceZone('arme')
      setTraceZone(null)
      return faire({ type: 'zone', rect: { x: x0, y: y0, l: x1 - x0, h: y1 - y0 }, titre: t('arbre.inserer.zone') })
    }
    if (zoneTiree) {
      const de = { x: zoneTiree.p.x - zoneTiree.depart.x, y: zoneTiree.p.y - zoneTiree.depart.y }
      setZoneTiree(null)
      if (Math.hypot(de.x, de.y) >= 4) faire({ type: 'zoneDeplacer', id: zoneTiree.id, de, membres: zoneTiree.membres })
      return
    }
    if (controle) {
      lacherControle(controle)
      setControle(null)
      return
    }
    const m = main.current
    if (m && e.button === m.bouton) {
      main.current = null
      setPanne(false)
      if (m.bouton === 2) {
        // Un défilement à la main n'ouvre pas de menu ; un clic droit sans glisser, si.
        if (m.panne) {
          supprimerMenu.current = true
          setTimeout(() => (supprimerMenu.current = false), 0)
        } else if (m.menu) ouvrirMenuDe(m.menu.x, m.menu.y, m.menu.cible)
      } else if (!m.panne && m.reduire && m.id && e.type !== 'pointercancel') setSelection(new Set([m.id]))
      return
    }
    if (e.button !== 0) return
    if (fond.current) {
      // Au lâcher, la sélection reste telle que le cadre l'a laissée.
      fond.current = null
      setCadre(null)
      setPointeur(null)
      return
    }
    const pr = prise.current
    prise.current = null
    if (!pr) return
    if (!tire) {
      if (pr.reduire && e.type !== 'pointercancel') setSelection(new Set([pr.id]))
      return
    }
    setTire(null)
    setPointeur(null)
    if (e.type !== 'pointercancel') lacherTire(tire, e)
  }
  /** Lâcher les sujets glissés : les rattacher à la cible, les copier (Alt), ou les laisser flotter là où on les lâche. */
  const lacherTire = (t: NonNullable<typeof tire>, e: React.PointerEvent) => {
    const avant = actuel()
    if (!avant || lectureSeule) return
    const p = versCarte(e)
    const cible = ouLacher(lecture, disposition, t.id, p, e.shiftKey, vue.options, t.ids.filter((x) => x !== t.id))
    const decalage = { x: p.x - t.depart.x, y: p.y - t.depart.y }
    const boite = (x: Id) => disposition.boites.get(x)
    let arbre = avant
    let apres: Id[] = t.ids
    if (e.altKey) {
      // Les copies flottent à la place que montrait le fantôme, au centre de leur boîte.
      const centres = new Map(t.ids.flatMap((x) => { const b = boite(x); return b ? [[x, { x: Math.round(b.x + decalage.x + b.l / 2), y: Math.round(b.y + decalage.y + b.h / 2) }] as const] : [] }))
      if (seule && cible.type === 'libre') return
      ;[arbre, apres] = copierSujets(arbre, t.ids, cible, centres)
    } else if (cible.type !== 'libre') {
      arbre = deplacerSujets(arbre, t.ids, cible)
    } else if (vue.options?.libre && !e.shiftKey && t.ids.every((x) => lecture.sujets.get(x)?.genre !== 'detache')) {
      // Placement libre : la branche reste où on la lâche.
      for (const id of t.ids) arbre = appliquerGeste(arbre, { type: 'decaler', id, de: decalage }, titreNeuf)?.arbre ?? arbre
    } else {
      // La position d'un flottant compte depuis le centre du central de la carte entière, pas de la branche montrée.
      if (seule) return
      for (const id of t.ids) {
        const b = boite(id)
        if (b) arbre = appliquerGeste(arbre, { type: 'poser', id, position: { x: b.x + decalage.x + b.l / 2, y: b.y + decalage.y + b.h / 2 } }, titreNeuf)?.arbre ?? arbre
      }
    }
    if (arbre !== avant) changer(arbre)
    if (apres.length > 0) setSelection(new Set(apres))
  }
  /** Un point de contrôle lâché : il se compte depuis le bout de la relation auquel il tient. */
  const lacherControle = (c: { relation: Id; i: 0 | 1; p: Point }) => {
    const r = vue.relations?.[c.relation]
    const [ba, bb] = [r && disposition.boites.get(r.de), r && disposition.boites.get(r.vers)]
    if (!r || !ba || !bb) return
    const courbe = courbeRelation(ba, bb, r.controles, r.forme)
    const bouts = [courbe.depart, courbe.arrivee] as const
    const actuels = courbe.controles.map((p, i) => ({ x: p.x - bouts[i]!.x, y: p.y - bouts[i]!.y }))
    actuels[c.i] = { x: c.p.x - bouts[c.i].x, y: c.p.y - bouts[c.i].y }
    faire({ type: 'controles', id: c.relation, controles: [actuels[0]!, actuels[1]!] })
  }
  /** L'icône de note ouvre le panneau sur la note ; celle du lien ouvre l'adresse, ou va au sujet visé. */
  const ouvrirIcone = (valeur: string) => {
    const [nom, sujet] = valeur.split(':') as [string, Id]
    setSelection(new Set([sujet]))
    if (nom === 'notes') return ouvrirNote(sujet)
    if (nom === 'piece') {
      const p = lecture.sujets.get(sujet)?.piece
      if (p?.audio) insertions.ouvrirAudio(sujet)
      else if (p) void ouvrirOuTelecharger(contexte, p.fichier)
      return
    }
    const lien = lecture.sujets.get(sujet)?.lien
    if (!lien) return
    if (lien.startsWith('sujet:')) {
      const cible = lien.slice(6)
      const b = disposition.boites.get(cible)
      const r = surface.current?.getBoundingClientRect()
      if (b && r) setCamera((c) => ({ ...c, x: r.width / 2 - (b.x + b.l / 2) * c.z, y: r.height / 2 - (b.y + b.h / 2) * c.z }))
      setSelection(new Set([cible]))
    } else window.open(/^[a-z][\w+.-]*:/i.test(lien) ? lien : `https://${lien}`, '_blank', 'noopener')
  }
  /** Ce que le clic droit vise, d'après ce que le dessin porte : un marqueur, une étiquette, une image, un sujet, le fond… */
  const cibleDe = (cible: Element, p: Point): CibleMenu => {
    const lu = (nom: string) => cible.closest(`[${nom}]`)?.getAttribute(nom) ?? null
    const marqueur = lu('data-marqueur')
    if (marqueur) {
      const i = marqueur.lastIndexOf(':')
      return { genre: 'marqueur', marqueur: marqueur.slice(0, i), id: marqueur.slice(i + 1) }
    }
    const etiquette = lu('data-etiquette')
    if (etiquette) {
      const i = etiquette.indexOf(':')
      return { genre: 'etiquette', rang: Number(etiquette.slice(0, i)), id: etiquette.slice(i + 1) }
    }
    const icone = lu('data-icone')
    if (icone) {
      const [nom, id] = icone.split(':') as [string, Id]
      return { genre: nom === 'notes' ? 'note' : nom === 'piece' ? 'piece' : 'lien', id }
    }
    for (const [attr, genre] of [['data-tache', 'tache'], ['data-equation', 'equation'], ['data-image', 'image'], ['data-planning', 'planning']] as const) {
      const id = lu(attr)
      if (id) return { genre, id }
    }
    const sujet = lu('data-sujet')
    if (sujet) return { genre: 'sujet', id: sujet }
    const relation = lu('data-relation')
    if (relation) return { genre: 'relation', id: relation }
    const limite = lu('data-limite')
    if (limite) return { genre: 'limite', id: limite }
    const zone = lu('data-zone')
    if (zone) return { genre: 'zone', id: zone }
    return { genre: 'fond', x: p.x, y: p.y }
  }
  const ouvrirMenuDe = (x: number, y: number, element: Element) => {
    if (lectureSeule || plan || relier || traceZone) return
    const cible = cibleDe(element, versCarte({ clientX: x, clientY: y }))
    // Comme Xmind : un clic droit sur ce qui n'est pas choisi le choisit d'abord ; sur le fond, il désélectionne.
    const vise = 'id' in cible ? cible.id : null
    if (cible.genre === 'fond') setSelection(new Set())
    else if (vise && !choisis.has(vise)) setSelection(new Set([vise]))
    if (edition) valider()
    setMenu({ x, y, cible })
  }
  const surMenuContextuel = (e: React.MouseEvent) => {
    e.preventDefault()
    if (supprimerMenu.current) return
    // Sur macOS, le menu naît à l'appui : tant que le bouton droit est tenu, on attend de savoir s'il glisse (défilement) ou non.
    const droit = main.current
    if (droit?.bouton === 2) {
      droit.menu = { x: e.clientX, y: e.clientY, cible: e.target as Element }
      return
    }
    ouvrirMenuDe(e.clientX, e.clientY, e.target as Element)
  }
  /** Un autocollant ou une illustration lâchés sur un sujet : le sujet les prend. */
  const surLacher = (e: React.DragEvent) => {
    const donnee = e.dataTransfer.getData(TYPE_GLISSE)
    if (!donnee || lectureSeule) return
    e.preventDefault()
    const sujet = (e.target as Element).closest('[data-sujet]')?.getAttribute('data-sujet')
    if (!sujet) return
    try {
      faire({ type: 'porter', ids: [sujet], champ: 'vignette', valeur: JSON.parse(donnee) })
      setSelection(new Set([sujet]))
    } catch {
      // Une donnée qui n'est pas de nous : rien.
    }
  }
  const surDoubleClic = (e: React.MouseEvent) => {
    if (lectureSeule) return
    const cible = e.target as Element
    // Le champ d'un titre, une pastille « + » : le double-clic leur appartient.
    if (cible.closest('.notak-arbre-barre, .notak-arbre-panneau, textarea, input, [data-ajout]')) return
    const sujet = cible.closest('[data-sujet]')?.getAttribute('data-sujet')
    if (sujet) return ouvrirEdition(sujet)
    const objet = cible.closest('[data-relation]')?.getAttribute('data-relation') ?? cible.closest('[data-limite]')?.getAttribute('data-limite') ?? cible.closest('[data-zone]')?.getAttribute('data-zone')
    if (objet) return ouvrirEdition(objet)
    // Dans la branche seule, les positions ne sont pas celles de la carte : pas de flottant.
    if (seule) return
    faire({ type: 'flottant', position: versCarte(e) })
  }
  // La molette fait défiler ; avec Cmd (ou le pincement du pavé), elle zoome autour du pointeur.
  useEffect(() => {
    const s = surface.current
    if (!s) return
    const roue = (e: WheelEvent) => {
      if ((e.target as Element).closest('.notak-arbre-panneau, .notak-arbre-menu')) return
      e.preventDefault()
      // Défiler fait disparaître le survol et arrête la caméra qui rejoignait un sujet.
      setSurvol(null)
      cancelAnimationFrame(animation.current)
      if (e.ctrlKey || e.metaKey) {
        const r = s.getBoundingClientRect()
        poser((c) => zoomAutour(c, facteurMolette(e.deltaY), { x: e.clientX - r.left, y: e.clientY - r.top }))
      } else poser((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }))
    }
    s.addEventListener('wheel', roue, { passive: false })
    return () => s.removeEventListener('wheel', roue)
  }, [montee, poser])

  // Pendant qu'on courbe une relation, elle suit le pointeur.
  const vueAffichee = useMemo(() => {
    if (!controle) return vue
    const r = vue.relations?.[controle.relation]
    const [ba, bb] = [r && disposition.boites.get(r.de), r && disposition.boites.get(r.vers)]
    if (!r || !ba || !bb) return vue
    const courbe = courbeRelation(ba, bb, r.controles)
    const bouts = [courbe.depart, courbe.arrivee] as const
    const c = courbe.controles.map((p, i) => ({ x: p.x - bouts[i]!.x, y: p.y - bouts[i]!.y }))
    c[controle.i] = { x: controle.p.x - bouts[controle.i].x, y: controle.p.y - bouts[controle.i].y }
    return { ...vue, relations: { ...vue.relations, [controle.relation]: { ...r, controles: [c[0]!, c[1]!] as [Point, Point] } } }
  }, [vue, controle, disposition])

  const champ = edition ? positionDuChamp(edition.id, lecture, disposition, mesures, vueTitree) : null
  const depart = relier ? disposition.boites.get(relier.de) : undefined

  // Ce qu'on glisse : les sujets de tête, ce qu'ils emportent, de combien ils ont bougé, et où ils se poseraient.
  const lacher = tire && pointeurCarte ? ouLacher(lecture, disposition, tire.id, pointeurCarte, tire.maj, vue.options, tire.ids.filter((x) => x !== tire.id)) : null
  const glisses: Glisses | null =
    tire && pointeurCarte ? { tetes: tire.ids, branches: new Set(tire.ids.flatMap((x) => branche(lecture, x))), decalage: { x: pointeurCarte.x - tire.depart.x, y: pointeurCarte.y - tire.depart.y } } : null
  const repere = lacher && glisses ? repereDeDepot(lecture, disposition, lacher, new Set(tire!.ids)) : null
  // Les pastilles « + » d'un sujet choisi seul : un enfant à droite (à gauche pour une branche de ce côté), un frère dessous.
  const seulChoisi = choisis.size === 1 && sujetsChoisis.length === 1 ? sujetsChoisis[0]! : null
  const ajouts =
    seulChoisi && !edition && !enGeste && !panne && fenetreActive && camera.z > ZOOM_PASTILLES && !lectureSeule && !plan && !relier && !traceZone && presentation === null && lecture.sujets.get(seulChoisi)?.genre !== 'resume'
      ? (() => {
          const b = disposition.boites.get(seulChoisi)
          const sujet = lecture.sujets.get(seulChoisi)
          if (!b || !sujet) return null
          return pastillesDe(b, {
            gauche: disposition.liens.find((x) => x.vers === seulChoisi)?.cote === 'gauche',
            souligne: souligne(habitDe(lecture, seulChoisi, themeDeArbre(vue), !!vue.options?.compacte).forme),
            replie: !!sujet.replie && enfantsDe(lecture, seulChoisi).length > 0,
            frere: seulChoisi !== lecture.central && sujet.genre === undefined,
          })
        })()
      : null

  // La barre qui flotte au-dessus du sujet choisi seul (relation, lien, image, note, tâche, pinceau de style).
  const pinceauDe = useRef<Id | null>(null)
  const barreSujet =
    seulChoisi && !edition && !enGeste && !panne && !lectureSeule && !plan && !relier && !traceZone && presentation === null && lecture.sujets.get(seulChoisi)?.genre !== 'resume' ? disposition.boites.get(seulChoisi) : undefined
  /** Le pinceau : un premier clic copie le style du sujet choisi ; un clic sur un autre sujet le lui colle. */
  const pinceau = () => {
    if (!seulChoisi) return
    if (pinceauDe.current && pinceauDe.current !== seulChoisi && styleCopie.current !== undefined) {
      faire({ type: 'collerStyle', ids: [seulChoisi], style: styleCopie.current ?? undefined })
      pinceauDe.current = null
    } else {
      styleCopie.current = lecture.sujets.get(seulChoisi)?.style ?? null
      pinceauDe.current = seulChoisi
    }
  }

  // Un sujet que le clavier vient de créer ou de choisir, ou que la frappe agrandit : la caméra le ramène dans la vue, du
  // minimum, en 200 ms.
  useEffect(() => {
    const id = edition?.id ?? aReveler.current
    if (!id || plan) return
    const b = disposition.boites.get(id)
    if (!b) return
    if (!edition) aReveler.current = null
    const vers = reveler(cameraRef.current, fenetreDe(surface.current), b, contenu)
    if (vers) animerVers(vers)
  }, [disposition, selection, edition?.id, plan]) // eslint-disable-line react-hooks/exhaustive-deps

  const habille = !zen && presentation === null
  const coteOuvert = habille && !lectureSeule && (!!panneau || icones)
  const gaucheOuvert = habille && gauche !== null
  const zoomerA = (z: number) => (plan ? setZoomPlan(z) : setCamera((c) => zoomer(c, z / c.z, surface.current)))
  const ajuster = () => cadrer([...disposition.boites.values()])

  /** Choisit un sujet et y centre la carte (le panneau de gauche, les notes). */
  const aller = (x: Id) => {
    setSelection(new Set([x]))
    const b = disposition.boites.get(x)
    const r = surface.current?.getBoundingClientRect()
    if (b && r && !plan) setCamera((c) => ({ ...c, x: r.width / 2 - (b.x + b.l / 2) * c.z, y: r.height / 2 - (b.y + b.h / 2) * c.z }))
  }
  const basculerGauche = () => setGauche((g) => (g ? null : { onglet: 'plan' }))
  const lancerPresentation = () => {
    setPlan(false)
    setNoteDe(null)
    // Un sujet choisi (autre que le central) donne le départ ; sinon la présentation commence au central.
    setPresentation(sujetsChoisis.length === 1 && sujetsChoisis[0] !== lecture.central ? { depart: sujetsChoisis[0]! } : {})
  }
  /** La note d'un sujet s'ouvre en popover près de lui, comme dans Xmind. */
  const ouvrirNote = (x: Id) => {
    setSelection(new Set([x]))
    setNoteDe(x)
  }
  const evidence = useMemo(() => (coches.size > 0 ? sujetsMisEnEvidence(reperesDe(lecture), coches) : null), [coches, lecture])
  const basculerCoche = (cle: string) =>
    setCoches((c) => {
      const n = new Set(c)
      if (n.has(cle)) n.delete(cle)
      else n.add(cle)
      return n
    })
  const statsCarte = useMemo(() => comptes(lecture), [lecture])
  const titreCentral = lecture.sujets.get(lecture.central)?.titre ?? ''
  /** Une feuille de Notak est une carte posée sur la toile : une feuille de plus est une carte neuve à droite de celle-ci. */
  const elementCourant = () => {
    const e = contexte.magasin.lire().elements.find((x) => x.id === id)
    return e?.contenu.type === 'arbre' ? e : null
  }
  const poserFeuille = (contenu: Arbre) => {
    const e = elementCourant()
    if (!e) return
    const neuf = { id: nouvelId(), x: e.x + e.largeur + 2, y: e.y, largeur: e.largeur, contenu }
    contexte.magasin.faire([{ type: 'creer', element: neuf }])
    contexte.finirEdition()
    setTimeout(() => contexte.commencerEdition(neuf.id), 0)
  }
  const nouvelleFeuille = () => poserFeuille(nouvelArbre(t('arbre.central')))
  const dupliquerFeuille = () => {
    const e = elementCourant()
    if (!e || e.contenu.type !== 'arbre') return
    const central = lire(e.contenu).central
    poserFeuille(renommer(e.contenu, central, `${lire(e.contenu).sujets.get(central)?.titre ?? ''} ${t('arbre.bas.copie')}`.trim()))
  }
  // Le popover de note : posé à droite du sujet, dans la surface (ou au centre dans le plan).
  const notePlace = (() => {
    if (!noteDe || !lecture.sujets.has(noteDe)) return null
    const r = surface.current?.getBoundingClientRect()
    const largeur = r?.width ?? 800
    const hauteur = r?.height ?? 600
    const b = disposition.boites.get(noteDe)
    const [bx, by] = b && !plan ? [camera.x + (b.x + b.l) * camera.z + 12, camera.y + b.y * camera.z - 8] : [(largeur - 400) / 2, (hauteur - 280) / 2]
    return { x: Math.max(8, Math.min(largeur - 408, bx)), y: Math.max(64, Math.min(hauteur - 288, by)) }
  })()

  return (
    <Surcouche etiquette={t('type.arbre')} className="notak-arbre-fond" fermer={contexte.finirEdition} surTouche={surTouche}>
      <div
        className="notak-arbre-fenetre"
        data-cote={coteOuvert ? '' : undefined}
        data-gauche={gaucheOuvert ? '' : undefined}
        data-zen={zen ? '' : undefined}
        data-inactif={fenetreActive ? undefined : ''}
        onContextMenu={(e) => !(e.target as Element).closest('input, textarea') && e.preventDefault()}
      >
      <div className="notak-arbre-scene">
      <div
        ref={poserSurface}
        className="notak-arbre-surface"
        style={fondDe(vue) ? { background: fondDe(vue) } : undefined}
        data-relier={relier ? '' : undefined}
        data-trace={traceZone ? '' : undefined}
        data-curseur={panne ? 'main' : tire ? (tire.alt ? 'copie' : 'sujet') : undefined}
        onContextMenu={surMenuContextuel}
        onDragOver={(e) => e.dataTransfer.types.includes(TYPE_GLISSE) && e.preventDefault()}
        onDrop={surLacher}
        onPointerDown={surAppui}
        // Sans quoi le clic molette lance le défilement automatique du navigateur ou ouvre un lien.
        onMouseDown={(e) => e.button === 1 && e.preventDefault()}
        onAuxClick={(e) => e.button === 1 && e.preventDefault()}
        onPointerMove={surMouvement}
        onPointerUp={surRelache}
        onPointerCancel={surRelache}
        onPointerLeave={() => setSurvol(null)}
        onDoubleClick={surDoubleClic}
      >
        {plan && <Plan lecture={lecture} courant={courant} choisir={(x) => setSelection(new Set([x]))} faire={faire} lectureSeule={lectureSeule} zoom={zoomPlan} />}
        <svg className="notak-arbre-grand" style={plan ? { display: 'none' } : undefined}>
          <g
            style={{
              transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`,
            }}
          >
            <Dessin
              arbre={vueAffichee}
              lecture={lecture}
              disposition={disposition}
              mesures={mesures}
              selection={presentation === null ? choisis : undefined}
              edition={edition?.id ?? null}
              adresse={adresse}
              surlignes={evidence}
              survol={enGeste || panne ? null : survol}
              zoom={camera.z}
              glisses={glisses}
            />
            {repere && <RepereDepot arbre={vueAffichee} lecture={lecture} disposition={disposition} repere={repere} />}
            {rectCadre && <rect className="notak-arbre-cadre" x={rectCadre.x} y={rectCadre.y} width={rectCadre.l} height={rectCadre.h} strokeWidth={1 / camera.z} />}
            {ajouts && seulChoisi && <Ajouts id={seulChoisi} pastilles={ajouts} />}
            {traceZone && traceZone !== 'arme' && (
              <rect className="notak-arbre-tire" x={Math.min(traceZone.de.x, traceZone.vers.x)} y={Math.min(traceZone.de.y, traceZone.vers.y)} width={Math.abs(traceZone.vers.x - traceZone.de.x)} height={Math.abs(traceZone.vers.y - traceZone.de.y)} rx={12} pointerEvents="none" />
            )}
            {zoneTiree && vue.zones?.[zoneTiree.id] && (
              <rect className="notak-arbre-tire" x={vue.zones[zoneTiree.id]!.x + zoneTiree.p.x - zoneTiree.depart.x} y={vue.zones[zoneTiree.id]!.y + zoneTiree.p.y - zoneTiree.depart.y} width={vue.zones[zoneTiree.id]!.l} height={vue.zones[zoneTiree.id]!.h} rx={14} pointerEvents="none" />
            )}
            {depart && relier?.p && <line className="notak-arbre-relier" x1={depart.x + depart.l / 2} y1={depart.y + depart.h / 2} x2={relier.p.x} y2={relier.p.y} />}
          </g>
        </svg>
        {barreSujet && seulChoisi && (
          <BarreSujet
            x={camera.x + (barreSujet.x + barreSujet.l / 2) * camera.z}
            y={camera.y + barreSujet.y * camera.z}
            bas={camera.y + (barreSujet.y + barreSujet.h) * camera.z}
            actions={{
              relation: () => setRelier({ de: seulChoisi, p: null }),
              lienWeb: () => insertions.actions.lienWeb(),
              image: () => insertions.actions.imageLocale(),
              note: () => ouvrirNote(seulChoisi),
              tache: () => faire({ type: 'tache', ids: [seulChoisi] }),
              style: pinceau,
            }}
          />
        )}
        {edition && champ && (
          // Le champ vit dans le repère de la carte : il prend la caméra, donc le texte écrit est juste à tout zoom.
          <div className="notak-arbre-repere" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})` }}>
            <ChampTitre pose={champ} texte={edition.texte} tout={edition.tout} changer={(texte) => setEdition({ ...edition, texte, tout: false })} valider={valider} annuler={annulerEdition} />
          </div>
        )}
        {relier && <p className="notak-arbre-consigne">{t('arbre.relier')}</p>}
        {traceZone && <p className="notak-arbre-consigne">{t('arbre.inserer.zoneAide')}</p>}
        {recherche && (
          <Recherche
            texte={recherche.texte}
            trouves={resultats.length}
            rang={resultats.length ? (recherche.i % resultats.length) + 1 : 0}
            changer={(texte) => setRecherche({ texte, i: 0 })}
            suivant={(sens) => setRecherche((r) => (r ? { ...r, i: (r.i + sens + resultats.length) % Math.max(1, resultats.length) } : r))}
            fermer={() => setRecherche(null)}
          />
        )}
      </div>
        {habille && (
          <>
            <EnTete titre={titreCentral} etat={lectureSeule ? t('arbre.lectureSeule') : ''} fermer={contexte.finirEdition} navigation={{ actif: gaucheOuvert, basculer: basculerGauche }} />
            {!lectureSeule && (
              <Outils
                arbre={vue}
                lecture={lecture}
                choisis={sujetsChoisis}
                courant={courant}
                faire={faire}
                relier={() => setRelier({ de: courant, p: null })}
                actions={insertions.actions}
              />
            )}
            <div className="notak-arbre-droite">
              <button type="button" className="notak-arbre-pastille" aria-label={t('arbre.exporter')} title={t('arbre.exporter')} onClick={() => {
                  const e = contexte.magasin.lire().elements.find((x) => x.id === id)
                  if (e) void exporterCartes([e], contexte)
                }}>
                <Icone nom="partager" taille={20} trait={1.5} />
              </button>
              {!lectureSeule && (
                <div className="notak-arbre-pilule">
                  <BoutonIcone icone="humeurSourire" libelle={t('arbre.icones')} actif={icones} onClick={() => (setIcones((x) => !x), setPanneau(null))} />
                  <BoutonIcone icone="arbreCote" libelle={t('arbre.format')} touche="⌘]" actif={!!panneau} onClick={() => (setPanneau((p) => (p ? null : {})), setIcones(false))} />
                </div>
              )}
            </div>
            <BarreBas
              titre={titreCentral}
              lectureSeule={lectureSeule}
              sujets={statsCarte.sujets}
              choisis={sujetsChoisis.length}
              mots={statsCarte.mots}
              caracteres={statsCarte.caracteres}
              zoom={plan ? zoomPlan : camera.z}
              enPlan={plan}
              zenActif={zen}
              pitchActif={presentation !== null}
              zoomer={zoomerA}
              ajuster={ajuster}
              basculerPlan={() => setPlan((x) => !x)}
              zen={basculerZen}
              presenter={lancerPresentation}
              renommer={(titre) => faire({ type: 'renommer', id: lecture.central, titre })}
              dupliquer={dupliquerFeuille}
              nouvelle={nouvelleFeuille}
              enregistrer={() => {
                const e = elementCourant()
                if (e) void exporterCartes([e], contexte)
              }}
            />
            {noteDe && notePlace && (
              <PopoverNote
                key={noteDe}
                titre={lecture.sujets.get(noteDe)?.titre.replace(/\n/g, ' ') ?? ''}
                note={lecture.sujets.get(noteDe)?.note}
                x={notePlace.x}
                y={notePlace.y}
                lectureSeule={lectureSeule}
                valider={(n) => faire({ type: 'porter', ids: [noteDe], champ: 'note', valeur: n })}
                fermer={() => setNoteDe(null)}
              />
            )}
          </>
        )}
      </div>
      {gaucheOuvert && gauche && (
        <PanneauGauche
          onglet={gauche.onglet}
          choisirOnglet={(o) => setGauche({ onglet: o })}
          fermer={() => (setGauche(null), setCoches(new Set()))}
          arbre={vue}
          lecture={lecture}
          choisis={choisis}
          aller={aller}
          coches={coches}
          cocher={basculerCoche}
        />
      )}
      {coteOuvert && icones && (
        <PanneauCote onglets={ONGLETS_ICONES()} actif={ongletIcones} choisir={(o) => setOngletIcones(o as typeof ongletIcones)}>
          <OngletIcones onglet={ongletIcones} arbre={vue} lecture={lecture} ids={sujetsChoisis.length ? sujetsChoisis : [courant]} faire={faire} contexte={contexte} adresse={adresse} />
        </PanneauCote>
      )}
      {coteOuvert && panneau && (
        <PanneauCote onglets={ONGLETS_FORMAT()} actif={onglet} choisir={(o) => setOnglet(o as Onglet)}>
          {onglet === 'style' && (
            <OngletStyle arbre={vue} lecture={lecture} choisis={[...choisis]} courant={courant} faire={faire} contexte={contexte} section={panneau.section} />
          )}
          {onglet === 'presenter' && <OngletPresenter arbre={vue} lecture={lecture} choisis={sujetsChoisis} faire={faire} adresse={adresse} />}
          {onglet === 'carte' && <OngletCarte arbre={vue} lecture={lecture} faire={faire} />}
        </PanneauCote>
      )}
      {menu && (
        <MenuContextuel
          x={menu.x}
          y={menu.y}
          items={construireMenu({ arbre: vue, lecture, selection: [...choisis], cible: menu.cible, presse: !!presse.current, styleCopie: styleCopie.current !== undefined || !!styleRelation.current, brancheSeule: seule })}
          etiquette={t('arbre.menu.titre')}
          choisir={(action) => {
            const { cible } = menu
            setMenu(null)
            executer(action, cible, [...choisis], hote)
          }}
          fermer={() => setMenu(null)}
        />
      )}
      {insertions.rendu}
      </div>
      {presentation !== null && (
        <Presentation arbre={vue} lecture={lecture} depart={presentation.depart} faire={faire} adresse={adresse} lectureSeule={lectureSeule} quitter={() => setPresentation(null)} />
      )}
    </Surcouche>
  )
}

/** Les pastilles « + » d'un sujet choisi seul : un clic ajoute un enfant ou un frère, comme Tab et Entrée. */
function Ajouts({ id, pastilles }: { id: Id; pastilles: { enfant: Point; frere: Point | null } }) {
  const r = PASTILLE.diametre / 2
  const pastille = (genre: 'enfant' | 'frere', c: Point) => (
    <g key={genre} className="notak-arbre-ajout" data-ajout={`${genre}:${id}`} transform={`translate(${c.x} ${c.y})`}>
      <circle r={PASTILLE.prise / 2} fill="transparent" />
      <circle className="notak-arbre-ajout-disque" r={r} />
      <g transform="translate(-7 -7)" style={{ color: '#fff' }}>
        <Icone nom="ajouter" taille={14} trait={2.25} />
      </g>
    </g>
  )
  return (
    <g className="notak-arbre-ajouts">
      {pastille('enfant', pastilles.enfant)}
      {pastilles.frere && pastille('frere', pastilles.frere)}
    </g>
  )
}

/**
 * Le champ où l'on écrit un titre : transparent, posé exactement sur le texte du sujet, à sa police, sa taille, sa graisse,
 * sa couleur et son alignement. Entrée et Tab valident, Maj+Entrée et Cmd+Entrée vont à la ligne, Échap abandonne.
 */
function ChampTitre({ pose, texte, tout, changer, valider, annuler }: { pose: ChampPose; texte: string; tout: boolean; changer(t: string): void; valider(): void; annuler(): void }) {
  const champ = useRef<HTMLTextAreaElement>(null)
  // Une fois validé ou abandonné, le champ qui disparaît perd son focus : ce blur-là ne valide pas une seconde fois.
  const fini = useRef(false)
  useLayoutEffect(() => {
    const c = champ.current
    if (!c) return
    c.focus({ preventScroll: true })
    if (tout) c.select()
    else c.setSelectionRange(c.value.length, c.value.length)
    // Seulement à l'ouverture du champ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Le champ ne défile jamais : quand le texte passe à la ligne avant que la carte ne l'ait re-mesuré (WebKit, l'app
  // macOS), il grandit au lieu de faire sortir la première ligne par le haut.
  useLayoutEffect(() => {
    const c = champ.current
    if (!c) return
    c.style.height = `${pose.h}px`
    if (c.scrollHeight > c.clientHeight) c.style.height = `${c.scrollHeight}px`
    c.scrollTop = 0
  }, [texte, pose.h, pose.l])
  const quitter = (issue: () => void) => {
    fini.current = true
    issue()
    champ.current?.closest<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true })
  }
  const casse = { majuscules: 'uppercase', minuscules: 'lowercase', capitales: 'capitalize' } as const
  // Un peu de marge en largeur : le navigateur ne coupe pas les lignes au pixel près comme la mesure de la carte, et un
  // mot qui passerait trop tôt à la ligne ferait sauter le texte. Le surplus s'étend du côté où le texte peut pousser.
  const marge = pose.genre === 'sujet' ? pose.police * 0.5 : 0
  const decalage = pose.alignement === 'centre' ? marge / 2 : pose.alignement === 'droite' ? marge : 0
  const style: React.CSSProperties = {
    left: pose.x - decalage,
    top: pose.y,
    width: pose.l + marge,
    height: pose.h,
    font: `${pose.italique ? 'italic ' : ''}${pose.graisse} ${pose.police}px/${pose.interligne}px ${pose.famille ?? POLICE}`,
    textAlign: pose.alignement === 'centre' ? 'center' : pose.alignement === 'droite' ? 'right' : 'left',
    ...(pose.couleur ? { color: pose.couleur } : {}),
    ...(pose.casse ? { textTransform: casse[pose.casse] } : {}),
    ...(pose.decoration ? { textDecoration: pose.decoration } : {}),
  }
  return (
    <textarea
      ref={champ}
      className="notak-arbre-champ"
      data-objet={pose.genre === 'objet' ? '' : undefined}
      aria-label={t('arbre.titre')}
      rows={1}
      spellCheck={false}
      value={texte}
      style={style}
      onChange={(e) => changer(e.target.value)}
      onScroll={(e) => (e.currentTarget.scrollTop = 0)}
      onBlur={() => !fini.current && valider()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Escape') {
          e.preventDefault()
          quitter(annuler)
        } else if (e.key === 'Tab') {
          e.preventDefault()
          quitter(valider)
        } else if (e.key === 'Enter') {
          if (e.metaKey || e.ctrlKey) {
            // Cmd+Entrée va à la ligne, comme Maj+Entrée (que le champ fait de lui-même).
            e.preventDefault()
            const c = e.currentTarget
            c.setRangeText('\n', c.selectionStart, c.selectionEnd, 'end')
            changer(c.value)
          } else if (!e.shiftKey && !e.altKey) {
            e.preventDefault()
            quitter(valider)
          }
        }
      }}
    />
  )
}

/** Ouvre un fichier de la carte dans un onglet, ou l'enregistre sous ce nom. */
async function ouvrirOuTelecharger(contexte: ContexteToile, fichier: Id, nom?: string) {
  const adresse = await contexte.services.fichiers?.adresse(fichier)
  if (!adresse) return
  if (!nom) return void window.open(adresse, '_blank', 'noopener')
  const lien = document.createElement('a')
  lien.href = adresse
  lien.download = nom
  lien.click()
}

/** Zoome de `facteur` autour de `autour` (px de la surface ; son milieu par défaut). */
function zoomer(c: Camera, facteur: number, s: HTMLElement | null, autour?: Point): Camera {
  const { l, h } = fenetreDe(s)
  return zoomAutour(c, facteur, autour ?? { x: l / 2, y: h / 2 })
}
