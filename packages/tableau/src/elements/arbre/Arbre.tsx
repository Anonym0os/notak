import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type Arbre, type Id, type StyleSujet, nouvelId } from '../../coeur/tableau'
import { t } from '../../langue'
import { Surcouche } from '../surcouche'
import type { ContexteToile, PropsRendu, Services } from '../types'
import { INTERLIGNE, POLICE, type Mesure, habitDe, mesurer } from './apparence'
import { themeDe } from './themes'
import { Dessin } from './Dessin'
import { exporterCartes } from './exporter'
import { BarreBas } from './BarreBas'
import { BoutonIcone, EnTete, type Onglet, PanneauCote } from './Fenetre'
import { ONGLETS_FORMAT, ONGLETS_ICONES, OngletCarte, OngletIcones, OngletPresenter, OngletStyle, type OngletIcone } from './onglets'
import { Outils } from './Outils'
import { Icone } from '../../icones'
import { type Boite, type Disposition, ECARTS, ECARTS_COMPACTS, disposer, emprise } from './disposition'
import { gesteDe } from './modele/clavier'
import { numeroDe, resumesValides, sujetsDePlage } from './modele/elements'
import { comptes, reperesDe, sujetsMisEnEvidence } from './modele/listes'
import { type Geste, appliquerGeste } from './modele/gestes'
import { type Lacher, ouLacher } from './modele/lacher'
import { type Lecture, lire, nouvelArbre, renommer, sousCarte } from './modele/sujets'
import { titreNeuf } from './modele/titres'
import { type Section } from './Panneau'
import { type OngletGauche, PanneauGauche } from './PanneauGauche'
import { Plan } from './Plan'
import { PopoverNote } from './PopoverNote'
import { Presentation } from './Presentation'
import { Recherche, correspondances } from './Recherche'
import { courbeRelation } from './trace/relations'

/** La carte lue, mesurée et disposée ; recalculée seulement quand elle change. */
export function useVue(a: Arbre): { lecture: Lecture; mesures: Map<Id, Mesure>; disposition: Disposition } {
  return useMemo(() => {
    const lecture = lire(a)
    const theme = themeDe(a.theme)
    const mesures = new Map<Id, Mesure>()
    for (const [id, s] of lecture.sujets)
      mesures.set(
        id,
        mesurer(s.titre, habitDe(lecture, id, theme), {
          tache: !!s.tache,
          marqueurs: s.marqueurs?.length ?? 0,
          prefixe: numeroDe(lecture, id),
          icones: (s.note ? 1 : 0) + (s.lien ? 1 : 0),
          ...(s.etiquettes?.length ? { etiquettes: s.etiquettes } : {}),
          ...(s.image ? { image: { l: s.image.l, h: s.image.h } } : {}),
        }),
      )
    const resumes = resumesValides(a, lecture).map(([, r]) => ({ sujet: r.sujet, plage: sujetsDePlage(lecture, r) }))
    const disposition = disposer(lecture, (id) => mesures.get(id) ?? { l: 40, h: 20 }, a.options?.compacte ? ECARTS_COMPACTS : ECARTS, !!a.options?.libre, resumes)
    return { lecture, mesures, disposition }
  }, [a.sujets, a.options, a.resumes, a.theme])
}

/** Les adresses affichables des images d'une carte, chargées au besoin. */
function useAdresses(a: Arbre, services: Services): (fichier: Id) => string | undefined {
  const [adresses, setAdresses] = useState<ReadonlyMap<Id, string>>(new Map())
  const fichiers = useMemo(() => [...new Set(Object.values(a.sujets).flatMap((s) => (s?.image?.fichier ? [s.image.fichier] : [])))], [a.sujets])
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
    <div className="notak-arbre" style={themeDe(a.theme).fond ? { background: themeDe(a.theme).fond } : undefined}>
      <svg className="notak-arbre-apercu" viewBox={`${x} ${y} ${l} ${h}`} style={{ aspectRatio: `${Math.min(3, Math.max(0.75, l / h))}` }} aria-label={lecture.sujets.get(lecture.central)?.titre || t('arbre.vide')} role="img">
        <Dessin arbre={a} lecture={lecture} disposition={disposition} mesures={mesures} adresse={adresse} />
      </svg>
      {enEdition && <Grand id={element.id} contexte={contexte} changer={changer} />}
    </div>
  )
}

interface Camera {
  x: number
  y: number
  z: number
}

const ZOOM_MIN = 0.1
const ZOOM_MAX = 5

type Edition = { id: Id; texte: string; tout: boolean }
type Point = { x: number; y: number }

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
  const { lecture, mesures, disposition } = useVue(vue)
  const adresse = useAdresses(a, contexte.services)
  const lectureSeule = !!contexte.services.lectureSeule

  // La sélection mêle des sujets, des relations et des limites : chacun est un identifiant.
  const [selection, setSelection] = useState<ReadonlySet<Id>>(() => new Set([lecture.central]))
  const [edition, setEdition] = useState<Edition | null>(null)
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

  const estObjet = useCallback((x: Id) => !!(vue.relations?.[x] || vue.limites?.[x]), [vue])
  // Ce qui a disparu (effacé, ou par un autre) sort de la sélection.
  const choisis = useMemo(() => new Set([...selection].filter((x) => disposition.boites.has(x) || estObjet(x))), [selection, disposition, estObjet])
  const sujetsChoisis = [...choisis].filter((x) => disposition.boites.has(x))
  const courant = sujetsChoisis.at(-1) ?? lecture.central

  const faire = useCallback(
    (geste: Geste) => {
      const avant = actuel()
      if (!avant || lectureSeule) return
      const r = appliquerGeste(avant, geste, titreNeuf)
      if (!r) return
      if (r.arbre !== avant) changer(r.arbre)
      if (r.choisir) setSelection(new Set([r.choisir]))
      // Dans le plan, le sujet neuf s'écrit sur sa ligne, pas dans un champ posé sur la carte.
      if (r.editer && !plan) setEdition({ id: r.editer, texte: r.arbre.sujets[r.editer]?.titre ?? '', tout: true })
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

  // Le style copié (Cmd+Alt+C), à coller sur d'autres sujets ; `undefined` : rien de copié, `null` : un sujet sans style.
  const styleCopie = useRef<StyleSujet | null | undefined>(undefined)

  const titreObjet = (x: Id) => vue.relations?.[x]?.titre ?? vue.limites?.[x]?.titre ?? ''

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
        if (!lectureSeule) setEdition({ id: objet, texte: titreObjet(objet), tout: true })
        return true
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        faire({ type: 'retirer', ids: [...choisis] })
        setSelection(new Set([lecture.central]))
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
        if (!lectureSeule) setEdition({ id: geste.id, texte: geste.frappe ?? lecture.sujets.get(geste.id)?.titre ?? '', tout: geste.frappe === undefined })
        return true
      case 'choisir':
        setSelection(new Set(geste.ids))
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

  // Le glisser du fond fait défiler la carte ; celui d'un sujet le déplace (au-delà de quelques pixels) ; celui d'un
  // point de contrôle courbe une relation.
  const glisse = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const prise = useRef<{ id: Id; x: number; y: number; dx: number; dy: number } | null>(null)
  const [tire, setTire] = useState<{ id: Id; p: Point; lacher: Lacher; maj: boolean } | null>(null)
  const [controle, setControle] = useState<{ relation: Id; i: 0 | 1; p: Point } | null>(null)
  const versCarte = (e: { clientX: number; clientY: number }) => {
    const r = surface.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left - camera.x) / camera.z, y: (e.clientY - r.top - camera.y) / camera.z }
  }
  const surAppui = (e: React.PointerEvent) => {
    const cible = e.target as Element
    // Un bouton garde son clic : capturer le pointeur pour défiler l'enverrait à la surface.
    if (cible.closest('button, textarea, input, select, label, .notak-arbre-barre, .notak-arbre-panneau')) return
    const attribut = (nom: string) => cible.closest(`[${nom}]`)?.getAttribute(nom) ?? null
    const repli = attribut('data-repli')
    if (repli) return faire({ type: 'replier', id: repli })
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
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
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
    if (sujet) {
      setSelection((s) => (e.shiftKey || e.metaKey ? basculer(s, sujet) : new Set([sujet])))
      const b = disposition.boites.get(sujet)
      if (b && !lectureSeule && sujet !== lecture.central) {
        const p = versCarte(e)
        // Pas de capture du pointeur ici : elle volerait le double-clic au sujet. La surface couvre tout l'écran.
        prise.current = { id: sujet, x: e.clientX, y: e.clientY, dx: p.x - b.x, dy: p.y - b.y }
      }
      return
    }
    glisse.current = { x: e.clientX, y: e.clientY, cx: camera.x, cy: camera.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const surMouvement = (e: React.PointerEvent) => {
    if (relier) return setRelier({ ...relier, p: versCarte(e) })
    if (controle) return setControle({ ...controle, p: versCarte(e) })
    const g = glisse.current
    if (g) return setCamera((c) => ({ ...c, x: g.cx + e.clientX - g.x, y: g.cy + e.clientY - g.y }))
    const pr = prise.current
    if (!pr || (!tire && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 4)) return
    const p = versCarte(e)
    setTire({ id: pr.id, p, lacher: ouLacher(lecture, disposition, pr.id, p, e.shiftKey), maj: e.shiftKey })
  }
  const surRelache = () => {
    glisse.current = null
    if (controle) {
      lacherControle(controle)
      setControle(null)
      return
    }
    const pr = prise.current
    prise.current = null
    if (!tire || !pr) return setTire(null)
    setTire(null)
    const l = tire.lacher
    // Placement libre : la branche reste où on la lâche, sauf sur un autre sujet (elle s'y rattache) ou avec Maj (elle flotte).
    if (vue.options?.libre && l.type !== 'enfant' && !tire.maj && lecture.sujets.get(tire.id)?.genre !== 'detache') {
      const b = disposition.boites.get(tire.id)
      if (b) faire({ type: 'decaler', id: tire.id, de: { x: tire.p.x - pr.dx - b.x, y: tire.p.y - pr.dy - b.y } })
      return
    }
    if (l.type === 'enfant') faire({ type: 'rattacher', id: tire.id, parent: l.parent, index: Number.MAX_SAFE_INTEGER })
    else if (l.type === 'inserer') faire({ type: 'rattacher', id: tire.id, parent: l.parent, index: l.index })
    else {
      // La position d'un flottant compte depuis le centre du central de la carte entière, pas de la branche montrée.
      const b = disposition.boites.get(tire.id)
      if (!b || seule) return
      faire({ type: 'poser', id: tire.id, position: { x: tire.p.x - pr.dx + b.l / 2, y: tire.p.y - pr.dy + b.h / 2 } })
    }
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
  const surDoubleClic = (e: React.MouseEvent) => {
    if (lectureSeule) return
    const cible = e.target as Element
    if (cible.closest('.notak-arbre-barre, .notak-arbre-panneau')) return
    const sujet = cible.closest('[data-sujet]')?.getAttribute('data-sujet')
    if (sujet) return setEdition({ id: sujet, texte: lecture.sujets.get(sujet)?.titre ?? '', tout: true })
    const objet = cible.closest('[data-relation]')?.getAttribute('data-relation') ?? cible.closest('[data-limite]')?.getAttribute('data-limite')
    if (objet) return setEdition({ id: objet, texte: titreObjet(objet), tout: true })
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
      if (e.ctrlKey || e.metaKey) {
        const r = s.getBoundingClientRect()
        setCamera((c) => zoomer(c, Math.exp(-e.deltaY * 0.01), s, { x: e.clientX - r.left, y: e.clientY - r.top }))
      } else setCamera((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }))
    }
    s.addEventListener('wheel', roue, { passive: false })
    return () => s.removeEventListener('wheel', roue)
  }, [montee])

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

  const champ = edition ? positionDuChamp(edition.id, lecture, disposition, mesures, vue) : null
  const depart = relier ? disposition.boites.get(relier.de) : undefined

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
      <div className="notak-arbre-fenetre" data-cote={coteOuvert ? '' : undefined} data-gauche={gaucheOuvert ? '' : undefined} data-zen={zen ? '' : undefined}>
      <div className="notak-arbre-scene">
      <div
        ref={poserSurface}
        className="notak-arbre-surface"
        style={themeDe(vue.theme).fond ? { background: themeDe(vue.theme).fond } : undefined}
        data-relier={relier ? '' : undefined}
        onPointerDown={surAppui}
        onPointerMove={surMouvement}
        onPointerUp={surRelache}
        onPointerCancel={surRelache}
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
            />
            {tire && <Fantome tire={tire} prise={prise.current} disposition={disposition} />}
            {depart && relier?.p && <line className="notak-arbre-relier" x1={depart.x + depart.l / 2} y1={depart.y + depart.h / 2} x2={relier.p.x} y2={relier.p.y} />}
          </g>
        </svg>
        {edition && champ && (
          <ChampTitre
            texte={edition.texte}
            tout={edition.tout}
            style={{
              left: camera.x + champ.x * camera.z,
              top: camera.y + champ.y * camera.z,
              minWidth: champ.l * camera.z,
              minHeight: champ.h * camera.z,
              font: `${champ.graisse} ${champ.police * camera.z}px/${INTERLIGNE} ${champ.famille ?? POLICE}`,
            }}
            changer={(texte) => setEdition({ ...edition, texte, tout: false })}
            valider={valider}
          />
        )}
        {relier && <p className="notak-arbre-consigne">{t('arbre.relier')}</p>}
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
                ouvrir={(section) => (section === 'note' ? ouvrirNote(courant) : setPanneau({ section }))}
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
          <OngletIcones onglet={ongletIcones} lecture={lecture} ids={sujetsChoisis.length ? sujetsChoisis : [courant]} faire={faire} />
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
      </div>
      {presentation !== null && (
        <Presentation arbre={vue} lecture={lecture} depart={presentation.depart} faire={faire} adresse={adresse} lectureSeule={lectureSeule} quitter={() => setPresentation(null)} />
      )}
    </Surcouche>
  )
}

/** Où poser le champ de saisie d'un titre : sur le texte d'un sujet, au milieu d'une relation, en tête d'une limite. */
function positionDuChamp(
  id: Id,
  l: Lecture,
  d: Disposition,
  mesures: ReadonlyMap<Id, Mesure>,
  a: Arbre,
): { x: number; y: number; l: number; h: number; police: number; graisse: number; famille?: string } | null {
  const b = d.boites.get(id)
  const m = mesures.get(id)
  if (b && m) {
    const h = habitDe(l, id, themeDe(a.theme))
    return { x: b.x + m.texte.x - 4, y: b.y + m.texte.y - 2, l: m.texte.l + 8, h: m.texte.h + 4, police: h.police, graisse: h.graisse, famille: h.famille }
  }
  const r = a.relations?.[id]
  if (r) {
    const [ba, bb] = [d.boites.get(r.de), d.boites.get(r.vers)]
    if (!ba || !bb) return null
    const c = courbeRelation(ba, bb, r.controles, r.forme)
    return { x: c.milieu.x - 80, y: c.milieu.y - 22, l: 160, h: 22, police: 12, graisse: 400 }
  }
  const x = a.limites?.[id]
  if (x) {
    const boites = sujetsDePlage(l, x).flatMap((s) => d.boites.get(s) ?? [])
    if (boites.length === 0) return null
    return { x: Math.min(...boites.map((v) => v.x)) - 2, y: Math.min(...boites.map((v) => v.y)) - 36, l: 160, h: 22, police: 12, graisse: 600 }
  }
  return null
}

/**
 * Pendant qu'on glisse un sujet : son cadre suit le pointeur, et la cible du lâcher se signale (le sujet qui le
 * recevra, ou le trait où il s'insérera).
 */
function Fantome({ tire, prise, disposition: d }: { tire: { id: Id; p: Point; lacher: Lacher }; prise: { dx: number; dy: number } | null; disposition: Disposition }) {
  const b = d.boites.get(tire.id)
  if (!b || !prise) return null
  const l = tire.lacher
  const cible = l.type === 'enfant' ? d.boites.get(l.parent) : undefined
  return (
    <g className="notak-arbre-fantome" pointerEvents="none">
      {cible && <rect x={cible.x - 5} y={cible.y - 5} width={cible.l + 10} height={cible.h + 10} rx={8} className="notak-arbre-cible" />}
      {l.type === 'inserer' && <Insertion lacher={l} d={d} />}
      <rect x={tire.p.x - prise.dx} y={tire.p.y - prise.dy} width={b.l} height={b.h} rx={6} className="notak-arbre-tire" />
    </g>
  )
}

/** Le trait qui montre où le sujet s'insérera : entre deux frères, ou au bout de la liste. */
function Insertion({ lacher, d }: { lacher: { parent: Id; index: number }; d: Disposition }) {
  const freres = d.liens.filter((x) => x.de === lacher.parent).map((x) => d.boites.get(x.vers)!)
  const avant = freres[lacher.index - 1]
  const apres = freres[lacher.index]
  const ref = apres ?? avant
  if (!ref) return null
  const y = avant && apres ? (avant.y + avant.h + apres.y) / 2 : apres ? apres.y - 6 : avant!.y + avant!.h + 6
  return <line x1={ref.x} x2={ref.x + ref.l} y1={y} y2={y} className="notak-arbre-cible" />
}

/** Le champ où l'on écrit un titre, posé sur lui. Entrée valide, Maj+Entrée va à la ligne, Échap valide. */
function ChampTitre({ texte, tout, style, changer, valider }: { texte: string; tout: boolean; style: React.CSSProperties; changer(t: string): void; valider(): void }) {
  const champ = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const c = champ.current
    if (!c) return
    c.focus({ preventScroll: true })
    if (tout) c.select()
    else c.setSelectionRange(c.value.length, c.value.length)
    // Seulement à l'ouverture du champ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useLayoutEffect(() => {
    const c = champ.current
    if (!c) return
    c.style.height = 'auto'
    c.style.height = `${c.scrollHeight}px`
  }, [texte])
  return (
    <textarea
      ref={champ}
      className="notak-arbre-champ"
      aria-label={t('arbre.titre')}
      rows={1}
      spellCheck={false}
      value={texte}
      style={style}
      onChange={(e) => changer(e.target.value)}
      onBlur={valider}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.nativeEvent.isComposing) return
        if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
          e.preventDefault()
          valider()
          champ.current?.closest<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true })
        }
      }}
    />
  )
}

function basculer(s: ReadonlySet<Id>, id: Id): Set<Id> {
  const n = new Set(s)
  if (n.has(id)) n.delete(id)
  else n.add(id)
  return n
}

/** Zoome de `facteur` autour de `autour` (px de la surface ; son milieu par défaut). */
function zoomer(c: Camera, facteur: number, s: HTMLElement | null, autour?: Point): Camera {
  const r = s?.getBoundingClientRect()
  const p = autour ?? { x: (r?.width ?? 0) / 2, y: (r?.height ?? 0) / 2 }
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.z * facteur))
  const k = z / c.z
  return { x: p.x - (p.x - c.x) * k, y: p.y - (p.y - c.y) * k, z }
}
