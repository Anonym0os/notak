import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Arbre, Id } from '../../coeur/tableau'
import { t } from '../../langue'
import { Surcouche } from '../surcouche'
import type { ContexteToile, PropsRendu } from '../types'
import { HABITS, INTERLIGNE, POLICE, type Mesure, mesurer, rangDe } from './apparence'
import { Dessin } from './Dessin'
import { type Disposition, disposer, emprise } from './disposition'
import { type Lecture, lire, sousCarte } from './modele/sujets'
import { type Lacher, ouLacher } from './modele/lacher'
import { gesteDe } from './modele/clavier'
import { titreNeuf } from './modele/titres'
import { type Geste, appliquerGeste } from './modele/gestes'

/** La carte lue, mesurée et disposée ; recalculée seulement quand ses sujets changent. */
export function useVue(a: Arbre): { lecture: Lecture; mesures: Map<Id, Mesure>; disposition: Disposition } {
  return useMemo(() => {
    const lecture = lire(a)
    const mesures = new Map<Id, Mesure>()
    for (const id of lecture.sujets.keys()) mesures.set(id, mesurer(lecture.sujets.get(id)!.titre, rangDe(lecture, id)))
    const disposition = disposer(lecture, (id) => mesures.get(id) ?? { l: 40, h: 20 })
    return { lecture, mesures, disposition }
  }, [a.sujets])
}

/** La marge autour de la carte dans l'aperçu, en px de carte. */
const MARGE_APERCU = 24

/** Sur la toile : la carte en réduction. Ouverte (double-clic, Entrée), elle passe en grand. */
export function RenduArbre({ element, enEdition, contexte, changer }: PropsRendu<Arbre>) {
  const { lecture, mesures, disposition } = useVue(element.contenu)
  const cadre = emprise(disposition.boites.values())
  const [x, y, l, h] = [cadre.x - MARGE_APERCU, cadre.y - MARGE_APERCU, cadre.l + 2 * MARGE_APERCU, cadre.h + 2 * MARGE_APERCU]
  return (
    <div className="notak-arbre">
      <svg className="notak-arbre-apercu" viewBox={`${x} ${y} ${l} ${h}`} style={{ aspectRatio: `${Math.min(3, Math.max(0.75, l / h))}` }} aria-label={lecture.sujets.get(lecture.central)?.titre || t('arbre.vide')} role="img">
        <Dessin lecture={lecture} disposition={disposition} mesures={mesures} />
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

const ZOOM_MIN = 0.2
const ZOOM_MAX = 4

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
  useEffect(() => contexte.magasin.ecouter(() => {
    const neuf = actuel()
    if (neuf) setA(neuf)
  }), [contexte, actuel])
  // « Afficher la branche seule » (Cmd+;) : la vue ne montre que cette branche, les gestes touchent la carte entière.
  const [seule, setSeule] = useState<Id | null>(null)
  const vue = useMemo(() => (seule && a.sujets[seule] ? sousCarte(a, seule) : a), [a, seule])
  const { lecture, mesures, disposition } = useVue(vue)
  const lectureSeule = !!contexte.services.lectureSeule

  const [selection, setSelection] = useState<ReadonlySet<Id>>(() => new Set([lecture.central]))
  const [edition, setEdition] = useState<{ id: Id; texte: string; tout: boolean } | null>(null)
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

  // Un sujet choisi qui disparaît (effacé, ou par un autre) laisse la place au central.
  const choisis = useMemo(() => new Set([...selection].filter((x) => disposition.boites.has(x))), [selection, disposition])
  const courant = [...choisis].at(-1) ?? lecture.central

  const faire = useCallback(
    (geste: Geste) => {
      const avant = actuel()
      if (!avant || lectureSeule) return
      const r = appliquerGeste(avant, geste, titreNeuf)
      if (!r) return
      if (r.arbre !== avant) changer(r.arbre)
      if (r.choisir) setSelection(new Set([r.choisir]))
      if (r.editer) setEdition({ id: r.editer, texte: r.arbre.sujets[r.editer]?.titre ?? '', tout: true })
    },
    [actuel, changer, lectureSeule],
  )

  const valider = useCallback(() => {
    if (!edition) return
    const avant = actuel()
    setEdition(null)
    if (avant && avant.sujets[edition.id] && avant.sujets[edition.id]!.titre !== edition.texte) faire({ type: 'renommer', id: edition.id, titre: edition.texte })
  }, [edition, actuel, faire])

  const surTouche = (e: React.KeyboardEvent): boolean => {
    if (edition) return e.key === 'Escape'
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
    const geste = gesteDe(e.nativeEvent, [...choisis].length ? [...choisis] : [courant], lecture, disposition)
    if (!geste) return false
    e.preventDefault()
    if (geste.type === 'editer') {
      if (!lectureSeule) setEdition({ id: geste.id, texte: geste.frappe ?? lecture.sujets.get(geste.id)?.titre ?? '', tout: geste.frappe === undefined })
      return true
    }
    if (geste.type === 'choisir') {
      setSelection(new Set(geste.ids))
      return true
    }
    if (geste.type === 'recadrer') {
      const r = surface.current?.getBoundingClientRect()
      if (r) setCamera((c) => ({ ...c, x: r.width / 2, y: r.height / 2 }))
      setSelection(new Set([lecture.central]))
      return true
    }
    if (geste.type === 'brancheSeule') {
      setSeule((x) => (x ? null : geste.id === lecture.central ? null : geste.id))
      setSelection(new Set([geste.id]))
      return true
    }
    if (geste.type === 'zoom') {
      setCamera((c) => zoomer(c, geste.facteur === 0 ? 1 / c.z : geste.facteur, surface.current))
      return true
    }
    faire(geste)
    return true
  }

  // Le glisser du fond fait défiler la carte ; celui d'un sujet le déplace (au-delà de quelques pixels).
  const glisse = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const prise = useRef<{ id: Id; x: number; y: number; dx: number; dy: number } | null>(null)
  const [tire, setTire] = useState<{ id: Id; p: { x: number; y: number }; lacher: Lacher } | null>(null)
  const versCarte = (e: { clientX: number; clientY: number }) => {
    const r = surface.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left - camera.x) / camera.z, y: (e.clientY - r.top - camera.y) / camera.z }
  }
  const surAppui = (e: React.PointerEvent) => {
    const cible = e.target as Element
    // Un bouton garde son clic : capturer le pointeur pour défiler l'enverrait à la surface.
    if (cible.closest('button, textarea')) return
    const repli =cible.closest('[data-repli]')?.getAttribute('data-repli')
    if (repli) return faire({ type: 'replier', id: repli })
    const sujet = cible.closest('[data-sujet]')?.getAttribute('data-sujet')
    if (edition && sujet !== edition.id) valider()
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
    const g = glisse.current
    if (g) return setCamera((c) => ({ ...c, x: g.cx + e.clientX - g.x, y: g.cy + e.clientY - g.y }))
    const pr = prise.current
    if (!pr || (!tire && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 4)) return
    const p = versCarte(e)
    setTire({ id: pr.id, p, lacher: ouLacher(lecture, disposition, pr.id, p, e.shiftKey) })
  }
  const surRelache = () => {
    glisse.current = null
    const pr = prise.current
    prise.current = null
    if (!tire || !pr) return setTire(null)
    setTire(null)
    const l = tire.lacher
    if (l.type === 'enfant') faire({ type: 'rattacher', id: tire.id, parent: l.parent, index: Number.MAX_SAFE_INTEGER })
    else if (l.type === 'inserer') faire({ type: 'rattacher', id: tire.id, parent: l.parent, index: l.index })
    else {
      // La position d'un flottant compte depuis le centre du central de la carte entière, pas de la branche montrée.
      const b = disposition.boites.get(tire.id)
      if (!b || seule) return
      faire({ type: 'poser', id: tire.id, position: { x: tire.p.x - pr.dx + b.l / 2, y: tire.p.y - pr.dy + b.h / 2 } })
    }
  }
  const surDoubleClic = (e: React.MouseEvent) => {
    if (lectureSeule) return
    const sujet = (e.target as Element).closest('[data-sujet]')?.getAttribute('data-sujet')
    if (sujet) return setEdition({ id: sujet, texte: lecture.sujets.get(sujet)?.titre ?? '', tout: true })
    // Dans la branche seule, les positions ne sont pas celles de la carte : pas de flottant.
    if (seule) return
    const r = surface.current!.getBoundingClientRect()
    faire({ type: 'flottant', position: { x: (e.clientX - r.left - camera.x) / camera.z, y: (e.clientY - r.top - camera.y) / camera.z } })
  }
  // La molette fait défiler ; avec Cmd (ou le pincement du pavé), elle zoome autour du pointeur.
  useEffect(() => {
    const s = surface.current
    if (!s) return
    const roue = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const r = s.getBoundingClientRect()
        setCamera((c) => zoomer(c, Math.exp(-e.deltaY * 0.01), s, { x: e.clientX - r.left, y: e.clientY - r.top }))
      } else setCamera((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }))
    }
    s.addEventListener('wheel', roue, { passive: false })
    return () => s.removeEventListener('wheel', roue)
  }, [montee])

  const boite = edition ? disposition.boites.get(edition.id) : undefined
  const habit = edition ? HABITS[rangDe(lecture, edition.id)] : undefined

  return (
    <Surcouche etiquette={t('type.arbre')} className="notak-arbre-fond" fermer={contexte.finirEdition} surTouche={surTouche}>
      <div
        ref={poserSurface}
        className="notak-arbre-surface"
        onPointerDown={surAppui}
        onPointerMove={surMouvement}
        onPointerUp={surRelache}
        onPointerCancel={surRelache}
        onDoubleClick={surDoubleClic}
      >
        <svg className="notak-arbre-grand">
          <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.z})`}>
            <Dessin lecture={lecture} disposition={disposition} mesures={mesures} selection={choisis} edition={edition?.id ?? null} />
            {tire && <Fantome tire={tire} prise={prise.current} disposition={disposition} />}
          </g>
        </svg>
        {edition && boite && habit && (
          <ChampTitre
            texte={edition.texte}
            tout={edition.tout}
            style={{
              left: camera.x + boite.x * camera.z,
              top: camera.y + boite.y * camera.z,
              minWidth: boite.l * camera.z,
              minHeight: boite.h * camera.z,
              padding: `${habit.marge[0] * camera.z}px ${habit.marge[1] * camera.z}px`,
              font: `${habit.graisse} ${habit.police * camera.z}px/${INTERLIGNE} ${POLICE}`,
              borderRadius: (habit.arrondi ?? 4) * camera.z,
            }}
            changer={(texte) => setEdition({ ...edition, texte, tout: false })}
            valider={valider}
          />
        )}
        <button type="button" className="notak-arbre-fermer" onClick={contexte.finirEdition}>
          {t('arbre.fermer')}
        </button>
      </div>
    </Surcouche>
  )
}

/**
 * Pendant qu'on glisse un sujet : son cadre suit le pointeur, et la cible du lâcher se signale (le sujet qui le
 * recevra, ou le trait où il s'insérera).
 */
function Fantome({ tire, prise, disposition: d }: { tire: { id: Id; p: { x: number; y: number }; lacher: Lacher }; prise: { dx: number; dy: number } | null; disposition: Disposition }) {
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

/** Le champ où l'on écrit le titre d'un sujet, posé sur lui. Entrée valide, Maj+Entrée va à la ligne, Échap valide. */
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
function zoomer(c: Camera, facteur: number, s: HTMLElement | null, autour?: { x: number; y: number }): Camera {
  const r = s?.getBoundingClientRect()
  const p = autour ?? { x: (r?.width ?? 0) / 2, y: (r?.height ?? 0) / 2 }
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.z * facteur))
  const k = z / c.z
  return { x: p.x - (p.x - c.x) * k, y: p.y - (p.y - c.y) * k, z }
}
