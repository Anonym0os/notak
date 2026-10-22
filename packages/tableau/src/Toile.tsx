import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { BarreOutils, BarreSelection } from './Barres'
import { Cadre } from './Cadre'
import * as cam from './coeur/camera'
import { type Point, type Rect, depuisCoins, englobant, point, soustraire } from './coeur/geometrie'
import type { Magasin } from './coeur/magasin'
import { largeurDoubleClic, largeurTiree, LARGEUR_MIN_DEFAUT } from './coeur/largeur'
import { cliquer, lasso } from './coeur/selection'
import { type Contenu, type Element, type Id, type Operation, aimanter, auPremierPlan, nouvelleNote } from './coeur/tableau'
import './elements'
import { definition, tousLesRaccourcis, tousLesRecepteurs } from './elements/registre'
import type { ContexteToile, Services } from './elements/types'

type Geste =
  | { type: 'attraper'; dernier: Point }
  | { type: 'lasso'; depart: Point; avant: ReadonlySet<Id>; inverser: boolean }
  | { type: 'glisser'; depart: Point; initiales: Map<Id, [number, number]>; axe: 'h' | 'v' | null }
  | { type: 'redimensionner'; id: Id; depart: Point; largeurDepart: number; min: number }

/** Le verrou d'axe de Maj : choisi d'après le plus grand déplacement, il ne bascule que si l'autre le dépasse franchement. */
function choisirAxe(actuel: 'h' | 'v' | null, d: Point): 'h' | 'v' {
  const [ax, ay] = [Math.abs(d.x), Math.abs(d.y)]
  if (actuel === 'h' && ay < ax * 2) return 'h'
  if (actuel === 'v' && ax < ay * 2) return 'v'
  return ax >= ay ? 'h' : 'v'
}

const memes = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
/** Un élément posé librement sur la toile : ni dans une colonne, ni une ligne. */
const libre = (e: Element) => !e.parent && definition(e.contenu.type)?.calque !== 'lignes'
/** Hauteur réservée au-dessus de la sélection pour sa barre, en pixels. */
const MARGE_BARRE = 52

/** La vue n'est signalée à l'hôte qu'à ce rythme au plus, en millisecondes. */
const DELAI_SIGNAL_CAMERA = 300

interface PropsToile {
  magasin: Magasin
  services?: Services
  /** Où regarder à l'ouverture (la vue mémorisée du tableau). */
  cameraInitiale?: cam.Camera
  /** La vue a changé : au plus toutes les 300 ms, et une dernière fois en quittant la toile. */
  surCamera?(c: cam.Camera): void
}

export function Toile({ magasin, services = {}, cameraInitiale, surCamera }: PropsToile) {
  const tableau = useSyncExternalStore(magasin.ecouter, magasin.lire)
  const [camera, setCamera] = useState<cam.Camera>(cameraInitiale ?? cam.CAMERA_DEPART)
  const [vue, setVue] = useState<cam.Vue>({ largeur: 1, hauteur: 1 })
  const [selection, setSelection] = useState<ReadonlySet<Id>>(new Set())
  const [edition, setEdition] = useState<Id | null>(null)
  const [zoneLasso, setZoneLasso] = useState<Rect | null>(null)
  const [espace, setEspace] = useState(false)
  const [anime, setAnime] = useState(false)
  const [enGeste, setEnGeste] = useState(false)

  const racine = useRef<HTMLDivElement>(null)
  const geste = useRef<Geste | null>(null)
  const gesteZoom = useRef(new cam.GesteZoom())
  const animation = useRef<{ depart: cam.Camera; cible: cam.Camera; debut: number } | null>(null)
  const brouillon = useRef<{ id: Id; contenu: Contenu } | null>(null)
  // Les gestionnaires natifs (molette, collage, animation) et le contexte lisent l'état courant ici.
  const etat = useRef({ camera, vue, tableau, selection, edition, magasin, services })
  etat.current = { camera, vue, tableau, selection, edition, magasin, services }

  const signalee = useRef(camera)
  const signal = useRef<{ f?: (c: cam.Camera) => void; minuteur?: ReturnType<typeof setTimeout> }>({})
  signal.current.f = surCamera
  useEffect(() => {
    const s = signal.current
    if (camera === signalee.current || s.minuteur) return
    s.minuteur = setTimeout(() => {
      s.minuteur = undefined
      signalee.current = etat.current.camera
      s.f?.(signalee.current)
    }, DELAI_SIGNAL_CAMERA)
  }, [camera])
  // En quittant la toile, la dernière vue part tout de suite.
  useEffect(() => {
    const s = signal.current
    return () => {
      if (!s.minuteur) return
      clearTimeout(s.minuteur)
      s.minuteur = undefined
      s.f?.(etat.current.camera)
    }
  }, [])

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = racine.current!.getBoundingClientRect()
    return point(e.clientX - r.left, e.clientY - r.top)
  }

  /** Le rectangle d'un élément, mesuré sur son nœud DOM et ramené au tableau. */
  const rect = useCallback((id: Id): Rect | null => {
    const div = racine.current
    const noeud = div?.querySelector(`[data-id="${CSS.escape(id)}"]`)
    if (!div || !noeud) return null
    const [o, r] = [div.getBoundingClientRect(), noeud.getBoundingClientRect()]
    const c = etat.current.camera
    return {
      min: cam.versTableau(c, point(r.left - o.left, r.top - o.top)),
      max: cam.versTableau(c, point(r.right - o.left, r.bottom - o.top)),
    }
  }, [])
  const contenu = useCallback(
    () => englobant(etat.current.tableau.elements.filter(libre).flatMap((e) => rect(e.id) ?? [])),
    [rect],
  )
  const sous = (cible: EventTarget | null): Id | null => {
    const n = (cible as HTMLElement | null)?.closest?.('[data-id]')
    return n && racine.current?.contains(n) ? n.getAttribute('data-id') : null
  }

  const finirEdition = useCallback(() => {
    const b = brouillon.current
    brouillon.current = null
    setEdition(null)
    racine.current?.focus({ preventScroll: true })
    const el = b && etat.current.magasin.lire().elements.find((x) => x.id === b.id)
    if (!b || !el || memes(el.contenu, b.contenu)) return
    etat.current.magasin.faire([{ type: 'contenu', id: b.id, avant: el.contenu, apres: b.contenu }])
  }, [])
  const commencerEdition = useCallback(
    (id: Id) => {
      // Le magasin, pas l'état rendu : l'élément vient peut-être d'être créé.
      const el = etat.current.magasin.lire().elements.find((x) => x.id === id)
      if (!el || !definition(el.contenu.type)?.editable) return
      if (etat.current.edition) finirEdition()
      brouillon.current = null
      setSelection(new Set([id]))
      setEdition(id)
    },
    [finirEdition],
  )
  const surBrouillon = useCallback((el: Element, apres: Contenu) => {
    brouillon.current = { id: el.id, contenu: apres }
  }, [])
  const surChanger = useCallback((el: Element, apres: Contenu) => {
    const m = etat.current.magasin
    const actuel = m.lire().elements.find((x) => x.id === el.id)
    if (actuel && !memes(actuel.contenu, apres)) m.faire([{ type: 'contenu', id: el.id, avant: actuel.contenu, apres }])
  }, [])

  // Le contexte est stable : ses champs lisent l'état courant, les cartes ne se redessinent pas à chaque zoom.
  const contexte = useMemo<ContexteToile>(
    () => ({
      get magasin() {
        return etat.current.magasin
      },
      get services() {
        return etat.current.services
      },
      get camera() {
        return etat.current.camera
      },
      get selection() {
        return etat.current.selection
      },
      rect,
      versTableau: (p) => cam.versTableau(etat.current.camera, p),
      largeurVue: () => etat.current.vue.largeur,
      centreVue: () => cam.centreCamera(etat.current.camera, etat.current.vue),
      choisir: (ids) => setSelection(new Set(ids)),
      commencerEdition,
      finirEdition,
    }),
    [rect, commencerEdition, finirEdition],
  )

  const recevoir = async (original: DataTransfer, ou: Point) => {
    // Le navigateur vide le presse-papiers dès que l'événement est fini : on le recopie avant d'attendre
    // le premier récepteur.
    const donnees = new DataTransfer()
    for (const type of original.types) if (type !== 'Files') donnees.setData(type, original.getData(type))
    for (const f of original.files) donnees.items.add(f)
    for (const r of tousLesRecepteurs()) {
      const pas = await r.recevoir(donnees, ou, contexte)
      if (pas && pas.length > 0) {
        magasin.faire(pas)
        setSelection(new Set(pas.flatMap((op) => (op.type === 'creer' ? [op.element.id] : []))))
        return
      }
    }
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
      if (etat.current.edition && (e.target as HTMLElement).closest('[data-edition]') && !(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      animation.current = null
      const { camera: c, vue: v } = etat.current
      if (e.ctrlKey || e.metaKey) {
        // Le pincement du trackpad arrive en Ctrl+molette, à petits pas : on le rend trois fois plus vif.
        const facteur = Math.exp(-e.deltaY * (e.metaKey ? 0.0025 : 0.0075))
        const echelle = gesteZoom.current.appliquer(c.echelle, facteur, cam.echelleMin(contenu(), v), e.timeStamp)
        setCamera(cam.echelleAutour(c, echelle, cam.pointFixe(echelle, local(e), v)))
      } else {
        setCamera(cam.defiler(c, -e.deltaX, -e.deltaY))
      }
    }
    div.addEventListener('wheel', molette, { passive: false })
    return () => div.removeEventListener('wheel', molette)
  }, [contenu])

  // Coller sur la toile, hors édition.
  useEffect(() => {
    const coller = (e: ClipboardEvent) => {
      if (document.activeElement !== racine.current || etat.current.edition || !e.clipboardData) return
      e.preventDefault()
      void recevoir(e.clipboardData, contexte.centreVue())
    }
    document.addEventListener('paste', coller)
    return () => document.removeEventListener('paste', coller)
  })

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
    magasin.faire(
      choisis()
        .filter(libre)
        .map((e) => ({ type: 'deplacer', id: e.id, de: [e.x, e.y], vers: [e.x + dx, e.y + dy] })),
    )

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
    if (e.target !== racine.current) return
    for (const r of tousLesRaccourcis()) {
      if (r(e.nativeEvent, contexte)) return e.preventDefault()
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
      return setSelection(new Set(tableau.elements.filter((x) => !x.parent).map((x) => x.id)))
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
    const id = sous(e.target)
    if (e.button === 1 || (e.button === 0 && espace)) {
      e.preventDefault()
      geste.current = { type: 'attraper', dernier: p }
    } else if (e.button === 2) {
      if (!id) setSelection(new Set())
      return
    } else if (e.button === 0) {
      const ici = cam.versTableau(camera, p)
      const el = id && tableau.elements.find((x) => x.id === id)
      if (el && (e.target as HTMLElement).closest('[data-poignee]')) {
        const min = definition(el.contenu.type)?.largeurMin ?? LARGEUR_MIN_DEFAUT
        geste.current = { type: 'redimensionner', id: el.id, depart: ici, largeurDepart: el.largeur, min }
      } else if (id) {
        const s = cliquer(selection, id, e.metaKey || e.ctrlKey)
        setSelection(s)
        if (!s.has(id)) return
        const initiales = new Map(
          tableau.elements
            .filter((x) => s.has(x.id) && libre(x))
            .map((x): [Id, [number, number]] => [x.id, [x.x, x.y]]),
        )
        geste.current = { type: 'glisser', depart: ici, initiales, axe: null }
      } else {
        const inverser = e.shiftKey || e.metaKey || e.ctrlKey
        const avant = inverser ? selection : new Set<Id>()
        setSelection(avant)
        geste.current = { type: 'lasso', depart: ici, avant, inverser }
      }
    } else return
    setEnGeste(true)
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
      const rects = tableau.elements.filter((x) => !x.parent).flatMap((x): [Id, Rect][] => {
        const r = rect(x.id)
        return r ? [[x.id, r]] : []
      })
      return setSelection(lasso(zone, rects, g.avant, g.inverser))
    }
    if (g.type === 'redimensionner') {
      const vers = largeurTiree(g.largeurDepart + ici.x - g.depart.x, g.min)
      return magasin.appliquerSeulement([{ type: 'redimensionner', id: g.id, de: g.largeurDepart, vers }])
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
    setEnGeste(false)
    setZoneLasso(null)
    if (g?.type === 'redimensionner') {
      const el = magasin.lire().elements.find((x) => x.id === g.id)
      if (el && el.largeur !== g.largeurDepart) {
        magasin.inscrire([{ type: 'redimensionner', id: g.id, de: g.largeurDepart, vers: el.largeur }])
      }
      return
    }
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
    // Le pointeur est capturé par la toile : la cible du double-clic n'est pas fiable, on regarde sous le curseur.
    if (document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-poignee]')) {
      const el = tableau.elements.find((x) => selection.has(x.id))
      const def = el && definition(el.contenu.type)
      if (!el || !def) return
      const vers = largeurDoubleClic(el.largeur, def.largeurNaturelle?.(el.contenu), def.largeurMin)
      if (vers !== el.largeur) magasin.faire([{ type: 'redimensionner', id: el.id, de: el.largeur, vers }])
      return
    }
    const id = sous(e.target)
    if (id) return commencerEdition(id)
    const [x, y] = aimanter(cam.versTableau(camera, local(e)))
    const note = nouvelleNote(x, y)
    magasin.faire([{ type: 'creer', element: note }])
    commencerEdition(note.id)
  }

  const deposer = (e: React.DragEvent) => {
    e.preventDefault()
    void recevoir(e.dataTransfer, cam.versTableau(camera, local(e)))
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
  const styleRacine = grille
    ? {
        backgroundSize: `${cam.PX_PAR_UG}px ${cam.PX_PAR_UG}px`,
        backgroundPosition: `${-camera.origine.x * k}px ${-camera.origine.y * k}px`,
      }
    : { backgroundImage: 'none' }
  const versEcran = (r: Rect) => ({ min: cam.versEcran(camera, r.min), max: cam.versEcran(camera, r.max) })
  const lassoEcran = zoneLasso && versEcran(zoneLasso)

  const elementsChoisis = choisis()
  const cadreChoisis = !enGeste && !edition && elementsChoisis.length > 0
    ? englobant(elementsChoisis.flatMap((x) => rect(x.id) ?? []))
    : null
  const barre = cadreChoisis && versEcran(cadreChoisis)

  const cartes = tableau.elements.filter(libre)
  const seule = !edition && selection.size === 1 ? [...selection][0] : undefined
  const lignes = tableau.elements.filter((e) => definition(e.contenu.type)?.calque === 'lignes')

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
      onDragOver={(e) => e.preventDefault()}
      onDrop={deposer}
    >
      <div
        className="notak-plan"
        style={{
          transform: `translate(${-camera.origine.x * k}px, ${-camera.origine.y * k}px) scale(${camera.echelle})`,
        }}
      >
        {cartes.map((e) => (
          <Cadre
            key={e.id}
            element={e}
            choisie={selection.has(e.id)}
            enEdition={edition === e.id}
            poignee={e.id === seule}
            contexte={contexte}
            brouillon={surBrouillon}
            changer={surChanger}
          />
        ))}
        <svg className="notak-calque-lignes" aria-hidden>
          {lignes.map((e) => {
            const Rendu = definition(e.contenu.type)!.Rendu
            return (
              <Rendu
                key={e.id}
                element={e}
                choisie={selection.has(e.id)}
                enEdition={edition === e.id}
                contexte={contexte}
                brouillon={(c) => surBrouillon(e, c)}
                changer={(c) => surChanger(e, c)}
              />
            )
          })}
        </svg>
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
      {barre && (
        <BarreSelection
          elements={elementsChoisis}
          contexte={contexte}
          position={{ x: (barre.min.x + barre.max.x) / 2, y: Math.max(8, barre.min.y - MARGE_BARRE) }}
        />
      )}
      <BarreOutils contexte={contexte} surCreation={(ids) => ids[0] && commencerEdition(ids[0])} />
      <div className="notak-echelle">{Math.round(camera.echelle * 100)} %</div>
    </div>
  )
}
