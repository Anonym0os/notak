import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Carte } from './Carte'
import * as cam from './coeur/camera'
import { type Point, type Rect, contient, depuisCoins, depuisTaille, englobant, point, soustraire } from './coeur/geometrie'
import type { Magasin } from './coeur/magasin'
import { cliquer, lasso } from './coeur/selection'
import {
  HAUTEUR_NOTE_MIN,
  type Element,
  type Id,
  type NoeudTexte,
  type Operation,
  aimanter,
  auPremierPlan,
  nouvelleNote,
  position,
} from './coeur/tableau'

type Geste =
  | { type: 'attraper'; dernier: Point }
  | { type: 'lasso'; depart: Point; avant: ReadonlySet<Id>; inverser: boolean }
  | { type: 'glisser'; depart: Point; initiales: Map<Id, [number, number]>; axe: 'h' | 'v' | null }

/** Le verrou d'axe de Maj : choisi d'après le plus grand déplacement, il ne bascule que si l'autre le dépasse franchement. */
function choisirAxe(actuel: 'h' | 'v' | null, d: Point): 'h' | 'v' {
  const [ax, ay] = [Math.abs(d.x), Math.abs(d.y)]
  if (actuel === 'h' && ay < ax * 2) return 'h'
  if (actuel === 'v' && ax < ay * 2) return 'v'
  return ax >= ay ? 'h' : 'v'
}

const memesTextes = (a: NoeudTexte, b: NoeudTexte) => JSON.stringify(a) === JSON.stringify(b)

export function Toile({ magasin }: { magasin: Magasin }) {
  const tableau = useSyncExternalStore(magasin.ecouter, magasin.lire)
  const [camera, setCamera] = useState<cam.Camera>(cam.CAMERA_DEPART)
  const [vue, setVue] = useState<cam.Vue>({ largeur: 1, hauteur: 1 })
  const [selection, setSelection] = useState<ReadonlySet<Id>>(new Set())
  const [edition, setEdition] = useState<Id | null>(null)
  const [zoneLasso, setZoneLasso] = useState<Rect | null>(null)
  const [espace, setEspace] = useState(false)
  const [anime, setAnime] = useState(false)

  const racine = useRef<HTMLDivElement>(null)
  const geste = useRef<Geste | null>(null)
  const hauteurs = useRef(new Map<Id, number>())
  const geste_zoom = useRef(new cam.GesteZoom())
  const animation = useRef<{ depart: cam.Camera; cible: cam.Camera; debut: number } | null>(null)
  // Les gestionnaires d'événements natifs (molette, animation) lisent l'état courant ici.
  const etat = useRef({ camera, vue, tableau })
  etat.current = { camera, vue, tableau }

  const rect = useCallback(
    (e: Element): Rect => depuisTaille(position(e), e.largeur, hauteurs.current.get(e.id) ?? HAUTEUR_NOTE_MIN),
    [],
  )
  const contenu = useCallback(() => englobant(etat.current.tableau.elements.map(rect)), [rect])
  const sous = (p: Point) => [...tableau.elements].reverse().find((e) => contient(rect(e), p))?.id ?? null

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = racine.current!.getBoundingClientRect()
    return point(e.clientX - r.left, e.clientY - r.top)
  }

  const surHauteur = useCallback((id: Id, h: number) => hauteurs.current.set(id, h), [])
  const brouillon = useRef<{ id: Id; texte: NoeudTexte } | null>(null)
  const surBrouillon = useCallback((id: Id, texte: NoeudTexte) => {
    brouillon.current = { id, texte }
  }, [])
  const commencerEdition = (id: Id) => {
    finirEdition()
    brouillon.current = null
    setSelection(new Set([id]))
    setEdition(id)
  }
  const finirEdition = () => {
    const b = brouillon.current
    brouillon.current = null
    setEdition(null)
    racine.current?.focus({ preventScroll: true })
    const el = b && magasin.lire().elements.find((x) => x.id === b.id)
    if (!b || !el || memesTextes(el.contenu.texte, b.texte)) return
    magasin.faire([{ type: 'contenu', id: b.id, avant: el.contenu, apres: { ...el.contenu, texte: b.texte } }])
  }

  useLayoutEffect(() => {
    const div = racine.current!
    const obs = new ResizeObserver(() => setVue({ largeur: div.clientWidth, hauteur: div.clientHeight }))
    obs.observe(div)
    return () => obs.disconnect()
  }, [])

  // Molette et pincement : il faut un écouteur non passif pour empêcher le zoom du navigateur.
  useEffect(() => {
    const div = racine.current!
    const molette = (e: WheelEvent) => {
      e.preventDefault()
      animation.current = null
      const { camera: c, vue: v } = etat.current
      if (e.ctrlKey || e.metaKey) {
        // Le pincement du trackpad arrive en Ctrl+molette, à petits pas : on le rend trois fois plus vif.
        const facteur = Math.exp(-e.deltaY * (e.metaKey ? 0.0025 : 0.0075))
        const echelle = geste_zoom.current.appliquer(c.echelle, facteur, cam.echelleMin(contenu(), v), e.timeStamp)
        setCamera(cam.echelleAutour(c, echelle, cam.pointFixe(echelle, local(e), v)))
      } else {
        setCamera(cam.defiler(c, -e.deltaX, -e.deltaY))
      }
    }
    div.addEventListener('wheel', molette, { passive: false })
    return () => div.removeEventListener('wheel', molette)
  }, [contenu])

  const lancerAnimation = (cible: cam.Camera) => {
    animation.current = { depart: camera, cible, debut: performance.now() }
    setAnime(true)
    const pas = (t: number) => {
      const a = animation.current
      if (!a) return setAnime(false)
      const { camera: c, fini } = cam.animer(a.depart, a.cible, t - a.debut, etat.current.vue)
      setCamera(c)
      if (fini) {
        animation.current = null
        setAnime(false)
      } else requestAnimationFrame(pas)
    }
    requestAnimationFrame(pas)
  }

  const ajuster = () => {
    const cible = cam.ajuster(contenu(), vue)
    if (!cible) return
    lancerAnimation(cam.dejaAjuste(camera, cible) ? cam.centree(cam.centreCamera(camera, vue), 1, vue) : cible)
  }

  const zoomerVers = (echelle: number) => {
    animation.current = null
    setCamera(cam.echelleAutour(camera, echelle, point(vue.largeur / 2, vue.hauteur / 2)))
  }

  const choisis = () => tableau.elements.filter((e) => selection.has(e.id))

  const deplacer = (dx: number, dy: number) =>
    magasin.faire(choisis().map((e) => ({ type: 'deplacer', id: e.id, de: [e.x, e.y], vers: [e.x + dx, e.y + dy] })))

  const clavier = (e: React.KeyboardEvent) => {
    const cmd = e.metaKey || e.ctrlKey
    const touche = e.key.toLowerCase()
    const min = cam.echelleMin(contenu(), vue)
    if (cmd && (e.key === '=' || e.key === '+' || e.code === 'Equal')) {
      e.preventDefault()
      return zoomerVers(cam.cranDessus(camera.echelle, min))
    }
    if (cmd && (e.key === '-' || e.code === 'Minus')) {
      e.preventDefault()
      return zoomerVers(cam.cranDessous(camera.echelle, min))
    }
    if (cmd && (e.key === '0' || e.code === 'Digit0')) {
      e.preventDefault()
      return zoomerVers(1)
    }
    // Pendant l'écriture, le clavier appartient à l'éditeur, sauf Échap qui en sort.
    if (edition) {
      if (e.key === 'Escape') {
        e.preventDefault()
        finirEdition()
      }
      return
    }

    if (cmd && touche === 'z') {
      e.preventDefault()
      return e.shiftKey ? magasin.retablir() : magasin.annuler()
    }
    if (cmd && touche === 'y') {
      e.preventDefault()
      return magasin.retablir()
    }
    if (cmd && touche === 'a') {
      e.preventDefault()
      return setSelection(new Set(tableau.elements.map((x) => x.id)))
    }
    if (cmd) return
    const pas = e.shiftKey ? 5 : 1
    const fleches: Record<string, [number, number]> = {
      ArrowLeft: [-pas, 0],
      ArrowRight: [pas, 0],
      ArrowUp: [0, -pas],
      ArrowDown: [0, pas],
    }
    if (fleches[e.key] && selection.size > 0) {
      e.preventDefault()
      return deplacer(...fleches[e.key]!)
    }
    switch (e.key) {
      case 'Escape':
        return setSelection(new Set())
      case 'Enter':
        if (selection.size === 1) {
          e.preventDefault()
          commencerEdition([...selection][0]!)
        }
        return
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        return magasin.faire(choisis().map((x): Operation => ({ type: 'supprimer', element: x })))
      case ' ':
        e.preventDefault()
        return setEspace(true)
    }
    if (touche === 'z' && !e.repeat) ajuster()
  }

  const appui = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-edition]')) return
    if (edition) finirEdition()
    racine.current!.focus({ preventScroll: true })
    const p = local(e)
    if (e.button === 1 || (e.button === 0 && espace)) {
      e.preventDefault()
      geste.current = { type: 'attraper', dernier: p }
    } else if (e.button === 2) {
      if (!sous(cam.versTableau(camera, p))) setSelection(new Set())
      return
    } else if (e.button === 0) {
      const ici = cam.versTableau(camera, p)
      const id = sous(ici)
      if (id) {
        const s = cliquer(selection, id, e.metaKey || e.ctrlKey)
        setSelection(s)
        if (!s.has(id)) return
        const initiales = new Map(
          tableau.elements.filter((x) => s.has(x.id)).map((x): [Id, [number, number]] => [x.id, [x.x, x.y]]),
        )
        geste.current = { type: 'glisser', depart: ici, initiales, axe: null }
      } else {
        const inverser = e.shiftKey || e.metaKey || e.ctrlKey
        const avant = inverser ? selection : new Set<Id>()
        setSelection(avant)
        geste.current = { type: 'lasso', depart: ici, avant, inverser }
      }
    } else return
    racine.current!.setPointerCapture(e.pointerId)
  }

  const mouvement = (e: React.PointerEvent) => {
    const g = geste.current
    if (!g) return
    const p = local(e)
    if (g.type === 'attraper') {
      const d = soustraire(p, g.dernier)
      g.dernier = p
      animation.current = null
      return setCamera((c) => cam.defiler(c, d.x, d.y))
    }
    const ici = cam.versTableau(camera, p)
    if (g.type === 'lasso') {
      const zone = depuisCoins(g.depart, ici)
      setZoneLasso(zone)
      return setSelection(lasso(zone, tableau.elements.map((x): [Id, Rect] => [x.id, rect(x)]), g.avant, g.inverser))
    }
    const d = soustraire(ici, g.depart)
    g.axe = e.shiftKey ? choisirAxe(g.axe, d) : null
    if (g.axe === 'h') d.y = 0
    if (g.axe === 'v') d.x = 0
    magasin.appliquerSeulement(
      [...g.initiales].map(([id, [x, y]]) => ({ type: 'deplacer', id, de: [x, y], vers: aimanter(point(x + d.x, y + d.y)) })),
    )
  }

  const relache = () => {
    const g = geste.current
    geste.current = null
    setZoneLasso(null)
    if (g?.type !== 'glisser') return
    const t = magasin.lire()
    const pas: Operation[] = []
    for (const [id, de] of g.initiales) {
      const el = t.elements.find((x) => x.id === id)
      if (el && (el.x !== de[0] || el.y !== de[1])) pas.push({ type: 'deplacer', id, de, vers: [el.x, el.y] })
    }
    if (pas.length === 0) return
    magasin.remplacer(auPremierPlan(t, g.initiales.keys()))
    magasin.inscrire(pas)
  }

  const doubleClic = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-edition]')) return
    const ici = cam.versTableau(camera, local(e))
    const id = sous(ici)
    if (id) return commencerEdition(id)
    const [x, y] = aimanter(ici)
    const note = nouvelleNote(x, y)
    magasin.faire([{ type: 'creer', element: note }])
    commencerEdition(note.id)
  }

  // La sélection ne garde que ce qui existe encore (après une suppression, une annulation).
  useEffect(() => {
    setSelection((s) => {
      const ids = new Set(tableau.elements.map((e) => e.id))
      return [...s].every((id) => ids.has(id)) ? s : new Set([...s].filter((id) => ids.has(id)))
    })
  }, [tableau])

  const k = cam.PX_PAR_UG * camera.echelle
  const grille = Math.abs(camera.echelle - 1) < 1e-3 && !anime
  const styleRacine = useMemo(
    () =>
      grille
        ? {
            backgroundSize: `${cam.PX_PAR_UG}px ${cam.PX_PAR_UG}px`,
            backgroundPosition: `${-camera.origine.x * k}px ${-camera.origine.y * k}px`,
          }
        : { backgroundImage: 'none' },
    [grille, camera, k],
  )
  const lassoEcran = zoneLasso && {
    min: cam.versEcran(camera, zoneLasso.min),
    max: cam.versEcran(camera, zoneLasso.max),
  }

  return (
    <div
      ref={racine}
      className="notak-toile"
      data-attraper={espace || undefined}
      tabIndex={0}
      style={styleRacine}
      onKeyDown={clavier}
      onKeyUp={(e) => e.key === ' ' && setEspace(false)}
      onBlur={() => setEspace(false)}
      onPointerDown={appui}
      onPointerMove={mouvement}
      onPointerUp={relache}
      onPointerCancel={relache}
      onDoubleClick={doubleClic}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="notak-plan"
        style={{
          transform: `translate(${-camera.origine.x * k}px, ${-camera.origine.y * k}px) scale(${camera.echelle})`,
        }}
      >
        {tableau.elements.map((e) => (
          <Carte
            key={e.id}
            element={e}
            choisie={selection.has(e.id)}
            enEdition={edition === e.id}
            surHauteur={surHauteur}
            surBrouillon={surBrouillon}
          />
        ))}
      </div>
      {lassoEcran && (
        <div
          className="notak-lasso"
          style={{
            left: lassoEcran.min.x,
            top: lassoEcran.min.y,
            width: lassoEcran.max.x - lassoEcran.min.x,
            height: lassoEcran.max.y - lassoEcran.min.y,
          }}
        />
      )}
      <div className="notak-echelle">{Math.round(camera.echelle * 100)} %</div>
    </div>
  )
}
