import { TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { t } from '../langue'
import { enColonnes } from './colonnes'
import { type Depot, choisirDepot, ouDuDepot } from './depot'
import { poser, racines } from './gestes'
import { type Ligne, PERIODE_DEFILEMENT, RETRAIT_DROIT, bordGauche, defilementAuto, estGlisse, hautPoignee, rayonHalo, retraitsHalo, survolDe } from './glisser'
import { centrePremiereLigne, creerFantome, lignesDe, mesurer, niveauRelatif, origine, pasRetrait } from './glisserMesure'
import { blocsDe } from './modele'
import { ecrireALaFin } from './transformer'
import { entreDeuxPoints, blocsTouches, departPermis, ouExclusif } from './rectangle'
import { CLE_CHOIX, blocsChoisis, choisir, choixDeLaPoignee, idsDuChoix, parcours } from './selection'

/**
 * La poignée (docs/NOTION.md § 6 à § 8) : au survol d'un bloc, `+` et `⋮⋮` dans sa marge gauche. `+` ajoute un bloc
 * dessous et y ouvre le menu « / » ; `⋮⋮` se tire pour déplacer les blocs choisis (⌥ les copie), ou se clique pour son
 * menu. Tirer un rectangle depuis la marge ou un espace vide choisit les blocs qu'il touche. Les décisions (zones de
 * dépôt, blocs touchés, vitesse du défilement) sont dans `glisser.ts`, `depot.ts` et `rectangle.ts` ; ici, les gestes.
 */

interface Survol {
  id: string
  pos: number
  /** Le haut de la poignée et le bord gauche du bloc, dans le repère de la zone qui défile. */
  haut: number
  gauche: number
}

interface Halo {
  id: string
  gauche: number
  haut: number
  largeur: number
  hauteur: number
  rayon: number
}

type Ancre = { left: number; top: number; right: number; bottom: number }

interface Props {
  editeur: Editor
  /** La zone qui défile et porte la poignée (`position: relative`). */
  zone: RefObject<HTMLElement | null>
  /** Ouvre le menu de la poignée sur les blocs choisis ; `ancre` : le bouton `⋮⋮` dans l'écran. */
  ouvrirMenu(ancre?: Ancre): void
  /**
   * Ouvre le menu « / » sur le bloc neuf que `+` vient d'ajouter, en mode ajout, sans écrire de `/`. Absent, `+` écrit
   * le `/` qui l'ouvre, comme la touche.
   */
  ouvrirAjout?(): void
}

/** Les éléments où un appui ne lance pas de rectangle : ce qu'on manie, et ce qu'on édite. */
const INTERACTIFS = 'input, textarea, select, button, a, label, [role="button"], [contenteditable], .notak-blocs-poignee, .notak-blocs-largeur, .notak-note-marge'

/** Un appui lance-t-il un rectangle ? Dans la marge, sous le dernier bloc, au fond d'une rangée ou d'une colonne ; pas dans un bloc. */
function departPossible(cible: Element, editeur: Editor): boolean {
  const dom = editeur.view.dom
  if (cible === dom) return true
  if (dom.contains(cible)) {
    const type = cible.closest('[data-bloc]')?.getAttribute('data-type')
    return type === 'colonnes' || type === 'colonne'
  }
  return !cible.closest(INTERACTIFS)
}

function Plus() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 5.5v9M5.5 10h9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function Grille() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
      {[5.5, 10, 14.5].flatMap((y) => [7.5, 12.5].map((x) => <circle key={`${x}:${y}`} cx={x} cy={y} r="1.3" />))}
    </svg>
  )
}

/** Le calque de la sélection de blocs : un rectangle par bloc choisi, enfants compris, à 2 px du bord. */
function Halos({ editeur, zone }: { editeur: Editor; zone: RefObject<HTMLElement | null> }) {
  const [halos, setHalos] = useState<Halo[]>([])
  useEffect(() => {
    const calculer = () => {
      const z = zone.current
      const choix = CLE_CHOIX.getState(editeur.state)
      if (!z || !choix) return setHalos((h) => (h.length ? [] : h))
      const m = mesurer(editeur, z)
      const pas = pasRetrait(editeur.view.dom)
      const suivants = racines(editeur.state.doc, idsDuChoix(editeur.state.doc, choix)).flatMap((x) => {
        const i = m.lignes.findIndex((l) => l.id === x.id)
        const l = m.lignes[i]
        if (!l) return []
        const sous = lignesDe(m.lignes, x.pos, x.fin)
        const apres = m.lignes.find((k) => k.pos >= x.fin)
        const ins = retraitsHalo(l.type, m.lignes[i - 1]?.type ?? null, apres?.type ?? null)
        const gauche = bordGauche(l, pas) + ins.cote
        const droite = l.cadre.droite - l.niveau * RETRAIT_DROIT - ins.cote
        const haut = l.haut + ins.haut
        const bas = Math.max(...sous.map((k) => k.bas)) - ins.bas
        return [{ id: x.id, gauche, haut, largeur: Math.max(0, droite - gauche), hauteur: Math.max(0, bas - haut), rayon: rayonHalo(l.type) }]
      })
      setHalos((h) => (JSON.stringify(h) === JSON.stringify(suivants) ? h : suivants))
    }
    calculer()
    editeur.on('transaction', calculer)
    window.addEventListener('resize', calculer)
    const observateur = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(calculer)
    observateur?.observe(editeur.view.dom)
    return () => {
      editeur.off('transaction', calculer)
      window.removeEventListener('resize', calculer)
      observateur?.disconnect()
    }
  }, [editeur, zone])
  return (
    <>
      {halos.map((h) => (
        <div key={h.id} className="notak-blocs-halo" style={{ left: h.gauche, top: h.haut, width: h.largeur, height: h.hauteur, borderRadius: h.rayon }} aria-hidden />
      ))}
    </>
  )
}

export function Poignee({ editeur, zone, ouvrirMenu, ouvrirAjout }: Props) {
  const [survol, setSurvol] = useState<Survol | null>(null)
  // Le menu ouvert par ⋮⋮ : la poignée reste là, teintée, tant qu'il est ouvert (NOTION.md § 6).
  const [menuOuvert, setMenuOuvert] = useState(false)
  useEffect(() => {
    if (!menuOuvert) return
    const verifier = () => window.setTimeout(() => !document.querySelector('.notak-menu-blocs') && setMenuOuvert(false), 0)
    window.addEventListener('pointerdown', verifier, true)
    window.addEventListener('keydown', verifier, true)
    return () => {
      window.removeEventListener('pointerdown', verifier, true)
      window.removeEventListener('keydown', verifier, true)
    }
  }, [menuOuvert])
  const [depot, setDepot] = useState<Depot | null>(null)
  const [rectangle, setRectangle] = useState<{ x: number; y: number; l: number; h: number } | null>(null)
  const [glisse, setGlisse] = useState(false)
  const tire = useRef(false)

  // Le survol (§ 6) : la poignée suit le bloc dont la tranche contient la souris, de 150 px à gauche de son bord à son bord
  // droit. Le calcul se fait au plus toutes les 60 ms ; une frappe la cache jusqu'au prochain mouvement.
  useEffect(() => {
    const z = zone.current
    if (!z) return
    let minuteur: ReturnType<typeof setTimeout> | undefined
    let derniere = Number.NEGATIVE_INFINITY
    let point: { x: number; y: number } | null = null
    const evaluer = () => {
      minuteur = undefined
      derniere = performance.now()
      // Rien ne se calcule pendant un glisser, un rectangle, ni tant que le menu est ouvert.
      if (!point || tire.current || document.querySelector('.notak-menu-blocs')) return
      const m = mesurer(editeur, z)
      const o = origine(z)
      const pas = pasRetrait(editeur.view.dom)
      const l = survolDe(m.lignes, point.x - o.x, point.y - o.y, pas)
      const dom = l ? editeur.view.nodeDOM(l.pos) : null
      if (!l || !(dom instanceof HTMLElement)) return setSurvol(null)
      const haut = hautPoignee(centrePremiereLigne(dom)) - o.y
      const gauche = bordGauche(l, pas)
      setSurvol((s) => (s && s.id === l.id && s.pos === l.pos && s.haut === haut && s.gauche === gauche ? s : { id: l.id, pos: l.pos, haut, gauche }))
    }
    const planifier = () => {
      const attente = 60 - (performance.now() - derniere)
      if (attente <= 0) evaluer()
      else if (minuteur === undefined) minuteur = setTimeout(evaluer, attente)
    }
    const bouger = (e: PointerEvent) => {
      if (e.buttons) return
      point = { x: e.clientX, y: e.clientY }
      planifier()
    }
    const sortir = () => {
      point = null
      // La souris part vers le menu du bloc : la poignée reste.
      if (document.querySelector('.notak-menu-blocs')) return
      setSurvol(null)
    }
    const taper = () => setSurvol(null)
    z.addEventListener('pointermove', bouger)
    z.addEventListener('pointerleave', sortir)
    z.addEventListener('scroll', planifier, { passive: true })
    editeur.view.dom.addEventListener('keydown', taper)
    return () => {
      if (minuteur !== undefined) clearTimeout(minuteur)
      z.removeEventListener('pointermove', bouger)
      z.removeEventListener('pointerleave', sortir)
      z.removeEventListener('scroll', planifier)
      editeur.view.dom.removeEventListener('keydown', taper)
    }
  }, [editeur, zone])

  // Le rectangle (§ 7) : il part de la marge ou d'un espace vide et choisit les blocs qu'il touche ; au bord de la zone, la
  // page défile.
  useEffect(() => {
    const z = zone.current
    if (!z) return
    const bas = (e: PointerEvent) => {
      const cible = e.target as Element
      const rz = z.getBoundingClientRect()
      if (!departPermis({ bouton: e.button, refuse: !departPossible(cible, editeur), x: e.clientX, gaucheZone: rz.left, largeurUtile: z.clientWidth })) return
      // L'éditeur ne voit pas cet appui : sa propre sélection à la souris ne doit pas se mêler au rectangle.
      e.preventDefault()
      const o0 = origine(z)
      const x0 = e.clientX - o0.x
      const y0 = e.clientY - o0.y
      const vue = editeur.view
      const maj = e.shiftKey
      // Maj tenue : le rectangle bascule les blocs par rapport à la sélection de départ.
      const depart = maj ? blocsChoisis(vue.state) : []
      let actif = false
      let lignes: Ligne[] = []
      let px = e.clientX
      let py = e.clientY
      let dernier = ''
      let minuteur: ReturnType<typeof setInterval> | undefined
      const majour = () => {
        const o = origine(z)
        const r = entreDeuxPoints(x0, y0, px - o.x, py - o.y)
        setRectangle({ x: r.gauche, y: r.haut, l: r.droite - r.gauche, h: r.bas - r.haut })
        const touches = blocsTouches(lignes, r)
        const ordre = parcours(vue.state.doc).map((b) => b.id!)
        const ids = maj ? ouExclusif(ordre, depart, touches) : ordre.filter((id) => touches.includes(id))
        const cle = ids.join(',')
        if (cle === dernier) return
        dernier = cle
        if (ids.length) vue.dispatch(choisir(vue.state, { ancre: ids[0]!, tete: ids[ids.length - 1]!, ids }))
        else if (CLE_CHOIX.getState(vue.state)) vue.dispatch(vue.state.tr.setMeta(CLE_CHOIX, null))
      }
      const bouger = (m: PointerEvent) => {
        px = m.clientX
        py = m.clientY
        if (!actif) {
          if (!estGlisse(px - e.clientX, py - e.clientY)) return
          actif = true
          lignes = mesurer(editeur, z).lignes
          // Le défilement automatique, tant qu'on tire : 60 fois par seconde, vers le bord le plus proche.
          minuteur = setInterval(() => {
            const r = z.getBoundingClientRect()
            const dy = defilementAuto(py, r.top, r.bottom)
            if (dy === 0) return
            z.scrollTop += dy
            majour()
          }, PERIODE_DEFILEMENT)
        }
        m.preventDefault()
        majour()
      }
      const lever = () => {
        window.removeEventListener('pointermove', bouger, true)
        window.removeEventListener('pointerup', lever, true)
        if (minuteur !== undefined) clearInterval(minuteur)
        setRectangle(null)
        if (!actif) {
          // Un simple appui sous le dernier bloc écrit à la fin de la page (NOTION.md § 9) ; dans la marge, le curseur va
          // au texte le plus proche, à cette hauteur.
          const dernier = vue.dom.lastElementChild?.getBoundingClientRect()
          if (dernier && e.clientY > dernier.bottom) return void ecrireALaFin(editeur)
          const r = vue.dom.getBoundingClientRect()
          const ou = vue.posAtCoords({ left: Math.min(Math.max(e.clientX, r.left + 1), r.right - 1), top: e.clientY })
          if (ou) vue.dispatch(vue.state.tr.setSelection(TextSelection.near(vue.state.doc.resolve(ou.pos))))
        }
        vue.focus()
      }
      window.addEventListener('pointermove', bouger, true)
      window.addEventListener('pointerup', lever, true)
    }
    z.addEventListener('pointerdown', bas)
    return () => z.removeEventListener('pointerdown', bas)
  }, [editeur, zone])

  // Le glisser de la poignée (§ 8) : le fantôme suit le pointeur, le repère montre où les blocs tomberont.
  const tirer = (e: React.PointerEvent, s: Survol) => {
    const z = zone.current
    if (e.button !== 0 || !z) return
    e.preventDefault()
    const vue = editeur.view
    const x0 = e.clientX
    const y0 = e.clientY
    const maj = e.shiftKey
    const mod = e.metaKey || e.ctrlKey
    const bouton = e.currentTarget.getBoundingClientRect()
    const ancre: Ancre = { left: bouton.left, top: bouton.top, right: bouton.right, bottom: bouton.bottom }
    const choixClic = choixDeLaPoignee(vue.state.doc, CLE_CHOIX.getState(vue.state) ?? null, s.id, maj, mod)
    let bouge = false
    let ici: Depot | null = null
    let ids: string[] = []
    let px = x0
    let py = y0
    let copier = e.altKey
    let fantome: ReturnType<typeof creerFantome> | null = null
    let minuteur: ReturnType<typeof setInterval> | undefined
    let m: ReturnType<typeof mesurer> | null = null
    let tires: { pos: number; fin: number }[] = []
    const defilement0 = z.scrollTop
    const pas = pasRetrait(vue.dom)

    const actualiser = () => {
      if (!m || !fantome) return
      fantome.deplacer(px - x0, py - y0 + (z.scrollTop - defilement0))
      const o = origine(z)
      ici = choisirDepot({ lignes: m.lignes, colonnes: m.colonnes, fins: m.fins, x: px - o.x, y: py - o.y, tires, copier, pas, flancs: editeur.isEditable })
      setDepot(ici)
    }
    const demarrer = () => {
      bouge = true
      tire.current = true
      setGlisse(true)
      setSurvol(null)
      // Le bloc est choisi (Maj étend, Maj+⌘ bascule) et ce sont tous les blocs choisis qui partent.
      if (choixClic) vue.dispatch(choisir(vue.state, choixClic))
      ids = blocsChoisis(vue.state)
      if (!ids.length) ids = [s.id]
      tires = racines(vue.state.doc, ids).map((r) => ({ pos: r.pos, fin: r.fin }))
      m = mesurer(editeur, z)
      fantome = creerFantome(editeur, z, m.lignes.filter((l) => tires.some((t) => l.pos >= t.pos && l.pos < t.fin)))
      z.setAttribute('data-glisse', '')
      // Le défilement automatique : 60 fois par seconde, vers le bord le plus proche (la page seulement, pas de côté).
      minuteur = setInterval(() => {
        const r = z.getBoundingClientRect()
        const dy = defilementAuto(py, r.top, r.bottom)
        if (dy === 0) return
        z.scrollTop += dy
        actualiser()
      }, PERIODE_DEFILEMENT)
    }
    const nettoyer = () => {
      window.removeEventListener('pointermove', bouger, true)
      window.removeEventListener('pointerup', lacher, true)
      window.removeEventListener('keydown', toucher, true)
      window.removeEventListener('keyup', toucher, true)
      if (minuteur !== undefined) clearInterval(minuteur)
      fantome?.retirer()
      z.removeAttribute('data-glisse')
      tire.current = false
      setGlisse(false)
      setDepot(null)
    }
    const bouger = (p: PointerEvent) => {
      px = p.clientX
      py = p.clientY
      copier = p.altKey
      if (!bouge) {
        if (!estGlisse(px - x0, py - y0)) return
        demarrer()
      }
      actualiser()
    }
    // ⌥ se lit au lâcher, mais le repère le suit : les blocs tirés deviennent des cibles. Échap annule.
    const toucher = (k: KeyboardEvent) => {
      if (k.key === 'Escape' && k.type === 'keydown') {
        k.preventDefault()
        k.stopPropagation()
        ici = null
        nettoyer()
        return
      }
      if (k.key === 'Alt') {
        copier = k.type === 'keydown'
        actualiser()
      }
    }
    const lacher = (u: PointerEvent) => {
      const cible = ici
      const copie = u.altKey
      nettoyer()
      if (!bouge) {
        // Un clic : le bloc est choisi et son menu s'ouvre.
        vue.dispatch(choisir(vue.state, choixClic))
        setMenuOuvert(true)
        ouvrirMenu(ancre)
        return
      }
      if (!cible) return vue.focus()
      const doc = vue.state.doc
      const avant = new Set(blocsDe(doc).map((b) => b.id))
      const ou = ouDuDepot(doc, cible)
      const tr = cible.genre === 'flanc' ? enColonnes(vue.state, ids, cible.cible, cible.flanc, copie) : ou === null ? null : poser(vue.state, ids, ou, cible.niveau, copie)
      if (!tr) return vue.focus()
      // Les blocs déplacés, ou leurs copies, deviennent la sélection.
      const neufs = copie
        ? blocsDe(tr.doc)
            .filter((b) => b.id && !avant.has(b.id))
            .map((b) => b.id!)
        : []
      const racinesIds = copie ? neufs : racines(doc, ids).map((r) => r.id)
      const choix = racinesIds.length ? { ancre: racinesIds[0]!, tete: racinesIds[racinesIds.length - 1]! } : null
      vue.dispatch(choisir(vue.state, choix, tr))
      vue.focus()
    }
    window.addEventListener('pointermove', bouger, true)
    window.addEventListener('pointerup', lacher, true)
    window.addEventListener('keydown', toucher, true)
    window.addEventListener('keyup', toucher, true)
  }

  // `+` : un bloc texte vide dessous, après les enfants (⌥ : dessus), où le menu « / » s'ouvre sans écrire de `/`.
  const ajouter = (e: React.MouseEvent, s: Survol) => {
    const vue = editeur.view
    const blocs = blocsDe(vue.state.doc)
    const b = blocs.find((x) => x.id === s.id)
    if (!b) return
    const ou = e.altKey ? b.pos : b.fin
    const $ou = vue.state.doc.resolve(ou)
    const paragraphe = vue.state.schema.nodes.paragraph!
    if (!$ou.parent.canReplaceWith($ou.index(), $ou.index(), paragraphe)) return
    const tr = vue.state.tr.insert(ou, paragraphe.create({ retrait: niveauRelatif(blocs, b) }))
    vue.dispatch(tr.setSelection(TextSelection.create(tr.doc, ou + 1)).scrollIntoView())
    vue.focus()
    if (ouvrirAjout) ouvrirAjout()
    else editeur.commands.insertContent('/')
  }

  return (
    <>
      {!glisse && <Halos editeur={editeur} zone={zone} />}
      {survol && !glisse && (
        <div className="notak-blocs-poignee" data-menu={menuOuvert || undefined} style={{ top: survol.haut, left: survol.gauche }} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className="notak-blocs-poignee-plus" title={t('selection.poignee.ajouter')} aria-label={t('selection.poignee.ajouter')} onMouseDown={(e) => e.preventDefault()} onClick={(e) => ajouter(e, survol)}>
            <Plus />
          </button>
          <button type="button" className="notak-blocs-poignee-tenir" title={t('selection.poignee.tenir')} aria-label={t('selection.poignee.tenir')} onPointerDown={(e) => tirer(e, survol)}>
            <Grille />
          </button>
        </div>
      )}
      {depot?.genre === 'entre' && depot.voile && (
        <div className="notak-blocs-halo" data-parent="" style={{ left: depot.voile.gauche, top: depot.voile.haut, width: depot.voile.droite - depot.voile.gauche, height: depot.voile.bas - depot.voile.haut }} aria-hidden />
      )}
      {depot && (
        <div
          className="notak-blocs-depot"
          {...(depot.genre === 'flanc' ? { 'data-flanc': '' } : depot.genre === 'dans' ? { 'data-dans': '' } : {})}
          style={{ left: depot.repere.x, top: depot.repere.y, width: depot.repere.largeur, height: depot.repere.hauteur }}
          aria-hidden
        />
      )}
      {rectangle && <div className="notak-blocs-rectangle" style={{ left: rectangle.x, top: rectangle.y, width: rectangle.l, height: rectangle.h }} aria-hidden />}
    </>
  )
}
