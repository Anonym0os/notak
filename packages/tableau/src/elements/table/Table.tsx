import { type CSSProperties, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PX_PAR_UG } from '../../coeur/camera'
import type { Element, FormatCellule, Table } from '../../coeur/tableau'
import { Icone } from '../../icones'
import { t, useLangue } from '../../langue'
import { MenuContextuel } from '../../Menus'
import type { PropsRendu } from '../types'
import {
  type Issue,
  bornerPlages,
  insererApres,
  insererAutourColonnes,
  insererAutourLignes,
  basculerStyle,
  deplacerLesColonnes,
  deplacerLesLignes,
  ecrireCellule,
  plageDe,
  plageEntre,
  plageDeRecopie,
  recopierSur,
  retirerSelection,
  versDeFrontiere,
  viderSelection,
} from './actions'
import { collerDansTable, preparerCopie } from './collage'
import { serieDeIso } from './dates'
import { ouvrirEdition } from './edition'
import { texteAffiche, messageErreur } from './affichage'
import { Editeur, type Deplacement } from './Editeur'
import {
  type Cellule,
  enregistrerNoeud,
  focaliser,
  lireEtat,
  oublierEtat,
  poserEtat,
  prendreDemandeTitre,
  rendreALaToile,
  useEtatTable,
} from './etat'
import { COULEURS_REFERENCES, alignementDe, couleurSurlignage, couleurTexte, regional, regionalDuSysteme, texteSurFond } from './formats'
import { citerReferences, evaluerTable, modeCitation, nomCellule, nomColonne } from './formules'
import {
  type Plage,
  LARGEUR_COLONNE_MIN,
  calerSurGrille,
  celluleSuivante,
  changerCellule,
  colonnesDe,
  colonnesEntieres,
  dansPlage,
  elargirColonnes,
  formatsDe,
  largeursDe,
  nombreColonnes,
  normaliserPlage,
} from './grille'
import { entreesTable } from './menu'
import { largeurDesColonnes, modifierTable } from './modifier'

/* ───────────── Les gestes à la souris ───────────── */

type Geste =
  | { type: 'plage'; depart: Cellule; moved: boolean; ouvrir: boolean; ou: { x: number; y: number } }
  | { type: 'citation'; ancre: Cellule }
  | { type: 'recopie'; source: Plage; cible: Plage }
  | { type: 'repere'; axe: 'ligne' | 'colonne'; depart: number }
  | {
      type: 'deplacer'
      axe: 'ligne' | 'colonne'
      repere: number
      de: number
      n: number
      moved: boolean
      ou: { x: number; y: number }
      boite: { x: number; y: number; w: number; h: number }
      vers: number | null
    }

interface Visuel {
  /** La plage que la poignée de recopie vise. */
  cible?: Plage
  /** L'ombre qui suit le pointeur quand on déplace des lignes ou des colonnes, et la ligne de la place visée. */
  ombre?: { x: number; y: number; w: number; h: number }
  ligne?: { x: number; y: number; w: number; h: number }
}

interface Contour {
  haut: boolean
  bas: boolean
  gauche: boolean
  droite: boolean
}

const LIEN = /^https?:\/\/\S+$/i
const SEUIL_GLISSER = 4

const fond = (f: FormatCellule | null | undefined, apercu: string | null | undefined): string | undefined => {
  const v = apercu !== undefined ? (apercu ?? undefined) : f?.fond
  return v === 'entete' ? 'var(--notak-table-entete)' : v
}

/** Le style d'une cellule d'après son format ; `apercu` : un fond regardé au survol dans la barre d'outils. */
export function styleDeCellule(f: FormatCellule | null | undefined, estFormule: boolean, apercu?: string | null): CSSProperties {
  const v = fond(f, apercu)
  const a = alignementDe(f, estFormule)
  const vertical = { haut: 'top', milieu: 'middle', bas: 'bottom' } as const
  return {
    ...(v ? { background: v } : {}),
    // Sur un fond de couleur, le texte se lit en sombre ou en blanc selon la clarté du fond, quel que soit le thème.
    ...(f?.couleur ? { color: couleurTexte(f.couleur) } : v && v !== 'var(--notak-table-entete)' ? { color: texteSurFond(v) } : {}),
    textAlign: a === 'gauche' ? 'left' : a === 'droite' ? 'right' : 'center',
    ...(f?.vertical ? { verticalAlign: vertical[f.vertical] } : {}),
    ...(f?.gras ? { fontWeight: 700 } : {}),
    ...(f?.italique ? { fontStyle: 'italic' } : {}),
    ...(f?.barre ? { textDecoration: 'line-through' } : {}),
  }
}

/** Le contour d'une plage, en ombres intérieures. */
function ombreContour(c: Pick<Contour, 'haut' | 'bas' | 'gauche' | 'droite'>, couleur: string, epaisseur: number): string {
  const e = epaisseur
  return [c.haut && `inset 0 ${e}px 0 0 ${couleur}`, c.bas && `inset 0 -${e}px 0 0 ${couleur}`, c.gauche && `inset ${e}px 0 0 0 ${couleur}`, c.droite && `inset -${e}px 0 0 0 ${couleur}`]
    .filter(Boolean)
    .join(', ')
}

/** Les cellules de ces plages, avec leurs bords. */
function contoursDe(plages: readonly Plage[]): Map<string, Contour> {
  const m = new Map<string, Contour>()
  plages.forEach((brute) => {
    const p = normaliserPlage(brute)
    for (let l = p.l1; l <= p.l2; l++)
      for (let c = p.c1; c <= p.c2; c++) {
        const cle = `${l},${c}`
        const e = m.get(cle) ?? { haut: false, bas: false, gauche: false, droite: false }
        e.haut ||= l === p.l1
        e.bas ||= l === p.l2
        e.gauche ||= c === p.c1
        e.droite ||= c === p.c2
        m.set(cle, e)
      }
  })
  return m
}

/** La référence d'une formule que touche le curseur, s'il y en a une. */
const referenceSous = (texte: string, curseur: number) => citerReferences(texte).find((r) => r.debut <= curseur && curseur <= r.fin) ?? null

/* ───────────── Le titre et la légende ───────────── */

/** La hauteur d'un bandeau de titre, arrondie à la grille : une ligne fait six unités, deux en font neuf. */
const hauteurTitre = (n: HTMLElement | null): number => {
  if (!n) return 0
  n.style.height = 'auto'
  const h = Math.ceil(n.scrollHeight / PX_PAR_UG) * PX_PAR_UG
  n.style.height = `${h}px`
  return h
}

interface PropsTitre {
  id: string
  valeur: string
  ecrivable: boolean
  change(v: string): void
  /** Quitter le titre pour la première cellule. */
  suite(): void
  /** Retour arrière sur un titre vide : il disparaît. */
  retirer(): void
  /** Entrée : le titre est écrit, la table se déchoisit. */
  finir(): void
  hauteur(h: number): void
}

/**
 * Le titre, centré au-dessus de la grille, sur autant de lignes qu'il faut. Il s'écrit quand la table est seule
 * choisie ; un pas par validation. Tab, → en fin de texte ou ↓ sur la dernière ligne vont à la première cellule.
 */
function Titre({ id, valeur, ecrivable, change, suite, retirer, finir, hauteur }: PropsTitre) {
  const [brouillon, setBrouillon] = useState(valeur)
  const champ = useRef<HTMLTextAreaElement | null>(null)
  const lecture = useRef<HTMLDivElement>(null)
  useEffect(() => setBrouillon(valeur), [valeur])
  useLayoutEffect(() => {
    hauteur(hauteurTitre(ecrivable ? champ.current : lecture.current))
  })
  if (!ecrivable)
    return (
      <div ref={lecture} className="notak-table-titre">
        {valeur}
      </div>
    )
  const valider = () => {
    if (brouillon !== valeur) change(brouillon)
  }
  const vers = (e: React.KeyboardEvent) => {
    e.preventDefault()
    valider()
    suite()
  }
  return (
    <textarea
      ref={(n) => {
        champ.current = n
        if (n && prendreDemandeTitre(id)) n.focus({ preventScroll: true })
      }}
      className="notak-table-titre"
      rows={1}
      value={brouillon}
      placeholder={t('table.titre')}
      aria-label={t('table.titre')}
      maxLength={200}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => setBrouillon(e.target.value.replace(/\n/g, ' '))}
      onBlur={valider}
      onKeyDown={(e) => {
        const n = e.currentTarget
        const vide = n.selectionStart === n.selectionEnd
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          // ⌘Entrée : la toile crée l'élément suivant.
          valider()
          return
        }
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          valider()
          finir()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setBrouillon(valeur)
          n.blur()
        } else if (e.key === 'Tab' && !e.shiftKey) vers(e)
        else if (e.key === 'ArrowRight' && vide && n.selectionEnd === brouillon.length) vers(e)
        // ↓ sur la dernière ligne : le curseur au bout, ou un titre qui tient sur une ligne.
        else if (e.key === 'ArrowDown' && vide && (n.selectionEnd === brouillon.length || n.scrollHeight <= 2 * PX_PAR_UG * 3)) vers(e)
        else if (e.key === 'Backspace' && brouillon === '') {
          e.preventDefault()
          retirer()
        }
      }}
    />
  )
}

/** La légende, sous la grille ; elle s'écrit quand la table est seule choisie. Entrée valide. */
function LegendeTable({ valeur, ecrivable, change }: { valeur: string; ecrivable: boolean; change(v: string): void }) {
  const [brouillon, setBrouillon] = useState(valeur)
  const champ = useRef<HTMLTextAreaElement>(null)
  useEffect(() => setBrouillon(valeur), [valeur])
  useLayoutEffect(() => {
    const n = champ.current
    if (!n) return
    n.style.height = 'auto'
    n.style.height = `${n.scrollHeight}px`
  }, [brouillon, ecrivable])
  if (!ecrivable) return valeur ? <p className="notak-table-legende">{valeur}</p> : null
  return (
    <textarea
      ref={champ}
      className="notak-table-legende"
      data-table-legende
      rows={1}
      value={brouillon}
      placeholder={t('note.legende')}
      aria-label={t('note.legende')}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => setBrouillon(e.target.value.replace(/\n/g, ' '))}
      onBlur={() => brouillon !== valeur && change(brouillon)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          if (e.key === 'Escape') setBrouillon(valeur)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

/* ───────────── La table ───────────── */

export function RenduTable({ element, seule, contexte, changer }: PropsRendu<Table>) {
  const id = element.id
  const c = element.contenu
  const lg = regionalDuSysteme(useLangue())
  const etat = useEtatTable(id)
  const racine = useRef<HTMLDivElement>(null)
  const geste = useRef<Geste | null>(null)
  const minuteurBulle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [visuel, setVisuel] = useState<Visuel>({})
  const [bulle, setBulle] = useState<Cellule | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [dispo, setDispo] = useState(0)
  const [hTitre, setHTitre] = useState(0)

  const lectureSeule = !!contexte.services.lectureSeule
  const actif = !!seule && !lectureSeule
  const dansColonne = !!element.parent
  const reperes = actif && !dansColonne
  const lignes = c.cellules.length
  const colonnes = nombreColonnes(c.cellules)

  const formats = useMemo(() => formatsDe(c), [c])
  const resultats = useMemo(() => evaluerTable(c.cellules), [c.cellules])
  const largeurs = useMemo(() => largeursDe(c, element.largeur), [c, element.largeur])
  const plages = useMemo(() => bornerPlages(etat.plages, c), [etat.plages, c])
  const edition = etat.edition
  const contours = useMemo(() => contoursDe(plages), [plages])

  // La table qui cesse d'être la seule choisie oublie ses cellules ; elle les oublie aussi en disparaissant.
  useEffect(() => {
    if (!actif) oublierEtat(id)
  }, [actif, id])
  useEffect(() => () => oublierEtat(id), [id])
  useEffect(() => () => clearTimeout(minuteurBulle.current), [])

  // Dans une colonne, la table sait de quelle largeur elle dispose.
  useLayoutEffect(() => {
    const n = racine.current
    if (!dansColonne || !n) return
    const mesurer = () => setDispo(n.clientWidth)
    mesurer()
    if (typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(mesurer)
    obs.observe(n)
    return () => obs.disconnect()
  }, [dansColonne])

  const refNoeud = useCallback((n: HTMLTextAreaElement | null) => enregistrerNoeud(id, n), [id])

  /* ── la sélection ── */

  const choisir = (suite: Plage[], ancre: Cellule | null, tete: Cellule | null) => poserEtat(id, { plages: suite, ancre, tete })
  const allerA1 = () => {
    const a1 = { l: 0, c: 0 }
    choisir([plageDe(a1)], a1, a1)
    focaliser(id)
  }
  const courante = () => {
    const el = contexte.magasin.lire().elements.find((x) => x.id === id)
    return el && el.contenu.type === 'table' ? (el as Element<Table>) : null
  }
  const dimensions = () => {
    const el = courante()
    return { l: el ? el.contenu.cellules.length : lignes, c: el ? nombreColonnes(el.contenu.cellules) : colonnes }
  }
  const bornerCel = (cel: Cellule): Cellule => {
    const d = dimensions()
    return { l: Math.min(Math.max(cel.l, 0), d.l - 1), c: Math.min(Math.max(cel.c, 0), d.c - 1) }
  }
  const colonneEntiere = (j: number): Plage => ({ l1: 0, c1: j, l2: dimensions().l - 1, c2: j })
  const ligneEntiere = (i: number): Plage => ({ l1: i, c1: 0, l2: i, c2: dimensions().c - 1 })

  const celluleDe = (cible: EventTarget | null): Cellule | null => {
    const td = (cible as HTMLElement | null)?.closest?.<HTMLElement>('[data-cellule]')
    if (!td || !racine.current?.contains(td)) return null
    const [l, col] = (td.dataset.cellule ?? '').split(',').map(Number)
    return l === undefined || col === undefined ? null : { l, c: col }
  }
  /** La cellule sous le pointeur ; hors de la grille, la plus proche. */
  const celluleSous = (x: number, y: number): Cellule | null => {
    const grille = racine.current?.querySelector('table')?.getBoundingClientRect()
    if (!grille || typeof document.elementFromPoint !== 'function') return null
    const px = Math.min(Math.max(x, grille.left + 2), grille.right - 2)
    const py = Math.min(Math.max(y, grille.top + 2), grille.bottom - 2)
    return celluleDe(document.elementFromPoint(px, py))
  }
  const noeudCellule = (l: number, col: number) => racine.current?.querySelector<HTMLElement>(`[data-cellule="${l},${col}"]`) ?? null
  /** Le rectangle d'une plage, en pixels de la table (sans le zoom). */
  const boiteDe = (p: Plage) => {
    const a = noeudCellule(p.l1, p.c1)
    const b = noeudCellule(p.l2, p.c2)
    if (!a || !b) return { x: 0, y: 0, w: 0, h: 0 }
    return { x: a.offsetLeft, y: a.offsetTop, w: b.offsetLeft + b.offsetWidth - a.offsetLeft, h: b.offsetTop + b.offsetHeight - a.offsetTop }
  }

  /* ── l'écriture d'une cellule ── */

  const demarrerEdition = (l: number, col: number, options: { texte?: string; curseur?: number; point?: { x: number; y: number } } = {}) =>
    ouvrirEdition(contexte, id, l, col, { ...options, noeud: noeudCellule(l, col) })

  /** Range ce qui s'écrit dans la cellule (un seul pas), referme l'éditeur et déplace la sélection. */
  const valider = (deplacement: Deplacement) => {
    const e = lireEtat(id).edition
    if (!e) return
    poserEtat(id, { edition: null })
    const calendrier = e.depuisCalendrier ? serieDeIso(e.texte) : null
    modifierTable(contexte, id, (tab) => ({
      table: ecrireCellule(tab, e.l, e.c, e.texte, regional(), calendrier ? { serie: calendrier, ...(e.avecHeure !== undefined ? { avecHeure: e.avecHeure } : {}) } : undefined),
    }))
    if (deplacement !== 'aucun') {
      const d = { bas: [1, 0], haut: [-1, 0], droite: [0, 1], gauche: [0, -1] }[deplacement]
      const vers = bornerCel({ l: e.l + d[0]!, c: e.c + d[1]! })
      choisir([plageDe(vers)], vers, vers)
    }
    focaliser(id)
  }
  const abandonner = () => {
    poserEtat(id, { edition: null })
    focaliser(id)
  }

  /** Les cases à cocher se cochent d'un clic, sans passer par la sélection. */
  const cocher = (l: number, col: number) => {
    if (lectureSeule) return
    changer(changerCellule(c, l, col, c.cellules[l]?.[col] === 'true' ? 'false' : 'true'))
  }

  /* ── la citation d'une cellule dans une formule ── */

  const citer = (cel: Cellule, plus: { maj: boolean; cmd: boolean }, etendre?: Cellule) => {
    const e = lireEtat(id).edition
    if (!e) return
    const ancre = etendre ?? (plus.maj && e.citation ? e.citation.ancre : cel)
    const nom = ancre.l === cel.l && ancre.c === cel.c ? nomCellule(cel.l, cel.c) : (() => {
      const p = plageEntre(ancre, cel)
      return `${nomCellule(p.l1, p.c1)}:${nomCellule(p.l2, p.c2)}`
    })()
    let debut = e.curseur
    let avant = e.texte.slice(0, e.curseur)
    let apres = e.texte.slice(e.curseur)
    if (e.citation && !plus.cmd) {
      // Un autre clic remplace la référence qu'on vient de citer.
      debut = e.citation.debut
      avant = e.texte.slice(0, debut)
      apres = e.texte.slice(e.citation.fin)
    } else if (e.citation && plus.cmd) {
      avant += ','
      debut += 1
    } else if (!plus.cmd) {
      // Le curseur touche une référence déjà écrite : le clic la remplace.
      const sous = referenceSous(e.texte, e.curseur)
      if (sous) {
        debut = sous.debut
        avant = e.texte.slice(0, debut)
        apres = e.texte.slice(sous.fin)
      }
    }
    const texte = avant + nom + apres
    const curseur = debut + nom.length
    poserEtat(id, {
      edition: { ...e, texte, curseur, maj: e.maj + 1, suggestion: 0, citation: { debut, fin: debut + nom.length, ancre }, depuisCalendrier: false },
    })
  }

  /* ── la souris ── */

  const surAppui = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!actif) return
    const cible = e.target as HTMLElement
    // Ce qui se gère seul : l'éditeur, le titre, les cases, les liens.
    if (cible.closest('.notak-table-editeur, .notak-table-titre, input, a, .notak-table-erreur')) {
      e.stopPropagation()
      return
    }
    if (e.button !== 0) return
    const cel = celluleDe(cible)
    if (!cel) return
    e.stopPropagation()
    const maj = e.shiftKey
    const cmd = e.metaKey || e.ctrlKey
    const ed = lireEtat(id).edition
    if (ed) {
      if (ed.l === cel.l && ed.c === cel.c) return
      if (ed.texte.startsWith('=') && (ed.citation || modeCitation(ed.texte, ed.curseur) || referenceSous(ed.texte, ed.curseur))) {
        e.preventDefault()
        citer(cel, { maj, cmd })
        geste.current = { type: 'citation', ancre: lireEtat(id).edition?.citation?.ancre ?? cel }
        racine.current?.setPointerCapture?.(e.pointerId)
        return
      }
      valider('aucun')
    }
    const avant = lireEtat(id)
    const seuleCel = avant.plages.length === 1 && (() => {
      const p = normaliserPlage(avant.plages[0]!)
      return p.l1 === cel.l && p.l2 === cel.l && p.c1 === cel.c && p.c2 === cel.c
    })()
    let depart = cel
    if (maj && avant.ancre) {
      depart = avant.ancre
      choisir([...avant.plages.slice(0, -1), plageEntre(depart, cel)], depart, cel)
    } else if (cmd) choisir([...avant.plages, plageDe(cel)], cel, cel)
    else choisir([plageDe(cel)], cel, cel)
    geste.current = { type: 'plage', depart, moved: false, ouvrir: !maj && !cmd && seuleCel, ou: { x: e.clientX, y: e.clientY } }
    racine.current?.setPointerCapture?.(e.pointerId)
    focaliser(id)
  }

  const surMouvement = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = geste.current
    if (!g) return
    e.stopPropagation()
    if (g.type === 'plage') {
      const cel = celluleSous(e.clientX, e.clientY)
      const e0 = lireEtat(id)
      if (!cel || (e0.tete?.l === cel.l && e0.tete.c === cel.c)) return
      g.moved = true
      choisir([...e0.plages.slice(0, -1), plageEntre(g.depart, cel)], g.depart, cel)
    } else if (g.type === 'citation') {
      const cel = celluleSous(e.clientX, e.clientY)
      if (cel) citer(cel, { maj: false, cmd: false }, g.ancre)
    } else if (g.type === 'recopie') {
      const cel = celluleSous(e.clientX, e.clientY)
      if (!cel) return
      const cible = plageDeRecopie(g.source, cel)
      g.cible = cible
      setVisuel({ cible })
    } else if (g.type === 'repere') {
      const cel = celluleSous(e.clientX, e.clientY)
      if (!cel) return
      const fin = g.axe === 'colonne' ? cel.c : cel.l
      const e0 = lireEtat(id)
      const p = g.axe === 'colonne' ? { ...colonneEntiere(Math.min(g.depart, fin)), c2: Math.max(g.depart, fin) } : { ...ligneEntiere(Math.min(g.depart, fin)), l2: Math.max(g.depart, fin) }
      choisir([...e0.plages.slice(0, -1), p], e0.ancre, e0.tete)
    } else if (g.type === 'deplacer') {
      if (!g.moved && Math.hypot(e.clientX - g.ou.x, e.clientY - g.ou.y) < SEUIL_GLISSER) return
      g.moved = true
      const echelle = contexte.camera.echelle || 1
      const cel = celluleSous(e.clientX, e.clientY)
      const ombre = {
        x: g.boite.x + (e.clientX - g.ou.x) / echelle,
        y: g.boite.y + (e.clientY - g.ou.y) / echelle,
        w: g.boite.w,
        h: g.boite.h,
      }
      if (!cel) return setVisuel({ ombre })
      const noeud = noeudCellule(cel.l, cel.c)
      const rect = noeud?.getBoundingClientRect()
      const apres = !!rect && (g.axe === 'colonne' ? e.clientX > rect.left + rect.width / 2 : e.clientY > rect.top + rect.height / 2)
      const frontiere = (g.axe === 'colonne' ? cel.c : cel.l) + (apres ? 1 : 0)
      g.vers = versDeFrontiere(g.de, g.n, frontiere)
      const grille = boiteDe({ l1: 0, c1: 0, l2: dimensions().l - 1, c2: dimensions().c - 1 })
      const tout = noeud && g.axe === 'colonne' ? { x: noeud.offsetLeft + (apres ? noeud.offsetWidth : 0) - 1, w: 2 } : null
      const ligne =
        g.vers === null
          ? undefined
          : g.axe === 'colonne'
            ? { x: tout!.x, y: grille.y, w: 2, h: grille.h }
            : { x: grille.x, y: (noeud?.offsetTop ?? 0) + (apres ? (noeud?.offsetHeight ?? 0) : 0) - 1, w: grille.w, h: 2 }
      setVisuel({ ombre, ...(ligne ? { ligne } : {}) })
    }
  }

  const finGeste = (e: React.PointerEvent<HTMLDivElement>, annule: boolean) => {
    const g = geste.current
    if (!g) return
    geste.current = null
    e.stopPropagation()
    if (racine.current?.hasPointerCapture?.(e.pointerId)) racine.current.releasePointerCapture(e.pointerId)
    setVisuel({})
    if (annule) return
    if (g.type === 'plage' && g.ouvrir && !g.moved) demarrerEdition(g.depart.l, g.depart.c, { point: { x: g.ou.x, y: g.ou.y } })
    else if (g.type === 'recopie' && g.cible) {
      const cible = g.cible
      modifierTable(contexte, id, (tab) => recopierSur(tab, g.source, cible))
      focaliser(id)
    } else if (g.type === 'deplacer') {
      if (g.moved && g.vers !== null) {
        const vers = g.vers
        modifierTable(contexte, id, (tab, l) => (g.axe === 'colonne' ? deplacerLesColonnes(tab, l, g.de, g.n, vers) : deplacerLesLignes(tab, g.de, g.n, vers)))
      } else if (!g.moved) {
        const p = g.axe === 'colonne' ? colonneEntiere(g.repere) : ligneEntiere(g.repere)
        choisir([p], { l: p.l1, c: p.c1 }, { l: p.l1, c: p.c1 })
      }
      focaliser(id)
    }
  }

  /** Un appui sur une lettre ou un numéro : la colonne ou la ligne entière, ou le début d'un déplacement si elle l'est déjà. */
  const surRepere = (e: React.PointerEvent<HTMLElement>, axe: 'ligne' | 'colonne', k: number) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    if (lireEtat(id).edition) valider('aucun')
    const e0 = lireEtat(id)
    const p = axe === 'colonne' ? colonneEntiere(k) : ligneEntiere(k)
    const maj = e.shiftKey
    const cmd = e.metaKey || e.ctrlKey
    const unique = e0.plages.length === 1 ? normaliserPlage(e0.plages[0]!) : null
    const dejaChoisi =
      !!unique && !maj && !cmd && (axe === 'colonne' ? unique.l1 === 0 && unique.l2 === dimensions().l - 1 && unique.c1 <= k && k <= unique.c2 : unique.c1 === 0 && unique.c2 === dimensions().c - 1 && unique.l1 <= k && k <= unique.l2)
    racine.current?.setPointerCapture?.(e.pointerId)
    focaliser(id)
    if (dejaChoisi && unique) {
      const de = axe === 'colonne' ? unique.c1 : unique.l1
      const n = axe === 'colonne' ? unique.c2 - unique.c1 + 1 : unique.l2 - unique.l1 + 1
      geste.current = { type: 'deplacer', axe, repere: k, de, n, moved: false, ou: { x: e.clientX, y: e.clientY }, boite: boiteDe(unique), vers: null }
      return
    }
    const ancre = e0.ancre
    if (maj && ancre) {
      const a = axe === 'colonne' ? ancre.c : ancre.l
      const q =
        axe === 'colonne'
          ? { ...colonneEntiere(Math.min(a, k)), c2: Math.max(a, k) }
          : { ...ligneEntiere(Math.min(a, k)), l2: Math.max(a, k) }
      choisir([...e0.plages.slice(0, -1), q], ancre, { l: q.l1, c: q.c1 })
      geste.current = { type: 'repere', axe, depart: a }
    } else {
      const debut = { l: p.l1, c: p.c1 }
      choisir(cmd ? [...e0.plages, p] : [p], debut, debut)
      geste.current = { type: 'repere', axe, depart: k }
    }
  }

  /** La poignée de recopie, au coin de la dernière plage. */
  const surRecopie = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const derniere = lireEtat(id).plages.at(-1)
    if (!derniere) return
    const source = normaliserPlage(derniere)
    geste.current = { type: 'recopie', source, cible: source }
    racine.current?.setPointerCapture?.(e.pointerId)
  }

  /* ── la largeur des colonnes ── */

  const largeurEnCours = useRef<{ x: number; colonnes: number[]; depart: Table; largeur: number; largeurs: number[] } | null>(null)

  /** Les colonnes que tire la poignée de la colonne `j` : toutes celles de la sélection, si elle en fait partie. */
  const colonnesVisees = (tab: Table, j: number): number[] => {
    const p = lireEtat(id).plages
    const choisies = p.length && colonnesEntieres(p, tab) ? colonnesDe(p) : []
    return choisies.includes(j) ? choisies : [j]
  }

  const surLargeur = (e: React.PointerEvent<HTMLElement>, j: number) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const el = courante()
    if (!el) return
    largeurEnCours.current = { x: e.clientX, colonnes: colonnesVisees(el.contenu, j), depart: el.contenu, largeur: el.largeur, largeurs: largeursDe(el.contenu, el.largeur) }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const mouvementLargeur = (e: React.PointerEvent<HTMLElement>) => {
    const g = largeurEnCours.current
    const el = courante()
    if (!g || !el) return
    e.stopPropagation()
    const d = (e.clientX - g.x) / (PX_PAR_UG * (contexte.camera.echelle || 1))
    const ls = elargirColonnes(g.largeurs, g.colonnes, d)
    const contenu: Table = { ...g.depart, largeurs: ls }
    contexte.magasin.appliquerSeulement([
      { type: 'redimensionner', id, de: el.largeur, vers: largeurDesColonnes(contenu, g.largeur) },
      { type: 'contenu', id, avant: el.contenu, apres: contenu },
    ])
  }
  const finLargeur = (e: React.PointerEvent<HTMLElement>, j: number) => {
    const g = largeurEnCours.current
    largeurEnCours.current = null
    if (!g) return
    e.stopPropagation()
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    const el = courante()
    if (!el) return
    // Au lâcher, la largeur totale se cale sur la grille ; tout le geste est un seul pas.
    const calees = calerSurGrille(el.contenu.largeurs ?? g.largeurs, j)
    const contenu: Table = { ...el.contenu, largeurs: calees }
    const largeur = largeurDesColonnes(contenu, el.largeur)
    contexte.magasin.appliquerSeulement([
      { type: 'redimensionner', id, de: el.largeur, vers: largeur },
      { type: 'contenu', id, avant: el.contenu, apres: contenu },
    ])
    if (JSON.stringify(contenu) === JSON.stringify(g.depart) && largeur === g.largeur) return
    contexte.magasin.inscrire([
      { type: 'redimensionner', id, de: g.largeur, vers: largeur },
      { type: 'contenu', id, avant: g.depart, apres: contenu },
    ])
  }
  /** Double-clic sur la poignée : la colonne prend la largeur de son texte le plus long. */
  const ajusterAuContenu = (j: number) => {
    let plusLarge = 0
    for (const td of racine.current?.querySelectorAll<HTMLElement>('td[data-cellule]') ?? []) {
      if (!td.dataset.cellule?.endsWith(`,${j}`)) continue
      const texte = td.querySelector<HTMLElement>('.notak-table-texte')
      if (!texte) continue
      const avant = texte.style.cssText
      texte.style.whiteSpace = 'pre'
      texte.style.display = 'inline-block'
      plusLarge = Math.max(plusLarge, texte.offsetWidth)
      texte.style.cssText = avant
    }
    const cible = Math.max(LARGEUR_COLONNE_MIN, Math.ceil((plusLarge + 18) / PX_PAR_UG))
    modifierTable(contexte, id, (tab) => {
      const ls = tab.largeurs ?? []
      return { table: { ...tab, largeurs: calerSurGrille(elargirColonnes(ls, colonnesVisees(tab, j), cible - (ls[j] ?? cible)), j) } }
    })
  }

  /* ── le clavier ── */

  const surClavier = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.target !== e.currentTarget || e.nativeEvent.isComposing) return
    const e0 = lireEtat(id)
    if (!e0.plages.length) return
    const cmd = e.metaKey || e.ctrlKey
    const k = e.key
    const prendre = () => {
      e.preventDefault()
      e.stopPropagation()
    }
    const geste_ = (f: (tab: Table, l: number) => Issue | null) => {
      prendre()
      modifierTable(contexte, id, f)
    }
    const d = dimensions()
    const active = e0.ancre ?? e0.tete ?? { l: 0, c: 0 }
    const tete = e0.tete ?? active
    const fleches: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }

    if (k === 'Escape') {
      prendre()
      rendreALaToile(id)
      poserEtat(id, { plages: [], ancre: null, tete: null, apercuFond: undefined })
    } else if (fleches[k] && e.altKey && !cmd) {
      const plages_ = e0.plages
      if (k === 'ArrowUp') geste_((tab, l) => insererAutourLignes(tab, l, plages_, 'dessus'))
      else if (k === 'ArrowDown') geste_((tab, l) => insererAutourLignes(tab, l, plages_, 'dessous'))
      else if (k === 'ArrowLeft') geste_((tab, l) => insererAutourColonnes(tab, l, plages_, 'gauche'))
      else geste_((tab, l) => insererAutourColonnes(tab, l, plages_, 'droite'))
    } else if (fleches[k] && cmd) {
      // ⌘ + flèche : jusqu'au bord de la grille ; avec Maj, la plage s'étend jusque-là.
      prendre()
      const [dl, dc] = fleches[k]!
      const vers = { l: dl ? (dl < 0 ? 0 : d.l - 1) : tete.l, c: dc ? (dc < 0 ? 0 : d.c - 1) : tete.c }
      if (e.shiftKey) {
        const ancre = e0.ancre ?? tete
        choisir([...e0.plages.slice(0, -1), plageEntre(ancre, vers)], ancre, vers)
      } else choisir([plageDe(vers)], vers, vers)
    } else if (k === 'Home' || k === 'End') {
      // Début, Fin : le bout de la ligne ; avec ⌘, la première ou la dernière cellule.
      prendre()
      const fin = k === 'End'
      const vers = cmd ? (fin ? { l: d.l - 1, c: d.c - 1 } : { l: 0, c: 0 }) : { l: tete.l, c: fin ? d.c - 1 : 0 }
      choisir([plageDe(vers)], vers, vers)
    } else if (k === ' ' && (e.ctrlKey || e.shiftKey) && !e.metaKey && !e.altKey) {
      // Ctrl+Espace : la colonne entière ; Maj+Espace : la ligne entière.
      prendre()
      if (e.ctrlKey) choisir([{ l1: 0, c1: tete.c, l2: d.l - 1, c2: tete.c }], { l: 0, c: tete.c }, { l: d.l - 1, c: tete.c })
      else choisir([{ l1: tete.l, c1: 0, l2: tete.l, c2: d.c - 1 }], { l: tete.l, c: 0 }, { l: tete.l, c: d.c - 1 })
    } else if (fleches[k] && !cmd) {
      prendre()
      const [dl, dc] = fleches[k]!
      const vers = { l: Math.min(Math.max(tete.l + dl, 0), d.l - 1), c: Math.min(Math.max(tete.c + dc, 0), d.c - 1) }
      if (e.shiftKey) {
        const ancre = e0.ancre ?? tete
        choisir([...e0.plages.slice(0, -1), plageEntre(ancre, vers)], ancre, vers)
      } else choisir([plageDe(vers)], vers, vers)
    } else if (k === 'Enter' && cmd && !e.shiftKey) {
      geste_((tab, l) => insererApres(tab, l, e0.plages))
    } else if ((k === 'Enter' || k === 'F2') && !cmd && !e.altKey) {
      prendre()
      const f = formatsDe(c)[active.l]?.[active.c]
      if (f?.type === 'case') cocher(active.l, active.c)
      else demarrerEdition(active.l, active.c)
    } else if (k === 'Backspace' && cmd) {
      geste_((tab, l) => retirerSelection(tab, l, e0.plages))
    } else if (k === 'Backspace' || k === 'Delete') {
      geste_((tab) => ({ table: viderSelection(tab, e0.plages) }))
    } else if (k === 'Tab') {
      prendre()
      const suivante = celluleSuivante(c.cellules, tete.l, tete.c, e.shiftKey)
      if (suivante) {
        const vers = { l: suivante[0], c: suivante[1] }
        choisir([plageDe(vers)], vers, vers)
      } else if (!e.shiftKey && c.avecLegende) {
        // Tab depuis la dernière cellule : vers la légende.
        racine.current?.querySelector<HTMLTextAreaElement>('textarea.notak-table-legende')?.focus()
      } else if (e.shiftKey && c.avecTitre) {
        // Maj+Tab depuis la première cellule : vers le titre.
        racine.current?.querySelector<HTMLTextAreaElement>('textarea.notak-table-titre')?.focus()
      }
    } else if (cmd && !e.altKey && (k.toLowerCase() === 'b' || k.toLowerCase() === 'i' || (k.toLowerCase() === 'x' && e.shiftKey))) {
      const style = k.toLowerCase() === 'b' ? 'gras' : k.toLowerCase() === 'i' ? 'italique' : 'barre'
      geste_((tab) => ({ table: basculerStyle(tab, e0.plages, style) }))
    } else if (cmd && !e.altKey && k.toLowerCase() === 'a') {
      prendre()
      choisir([{ l1: 0, c1: 0, l2: d.l - 1, c2: d.c - 1 }], { l: 0, c: 0 }, { l: d.l - 1, c: d.c - 1 })
    } else if (k === ' ' && !cmd && formatsDe(c)[active.l]?.[active.c]?.type === 'case') {
      prendre()
      cocher(active.l, active.c)
    } else if (!cmd && k.length === 1) {
      // Un caractère tombe dans le champ caché, et `surSaisie` ouvre l'édition avec lui : ainsi les accents
      // à touche morte, la dictée et ce qui arrive sans touche passent aussi.
      e.stopPropagation()
    }
  }

  /** Ce qui s'écrit sur la table choisie remplace le contenu de la cellule active. */
  const surSaisie = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const n = e.currentTarget
    if ((e.nativeEvent as InputEvent).isComposing) return
    const texte = n.value
    n.value = ''
    const e0 = lireEtat(id)
    const active = e0.ancre ?? e0.tete
    if (!texte || !active || e0.edition || formatsDe(c)[active.l]?.[active.c]?.type === 'case') return
    demarrerEdition(active.l, active.c, { texte, curseur: texte.length })
  }

  const surCopie = (e: React.ClipboardEvent, couper: boolean) => {
    const copie = preparerCopie(contexte, id, couper)
    if (!copie) return
    e.preventDefault()
    e.stopPropagation()
    e.clipboardData.setData('text/plain', copie.texte)
    e.clipboardData.setData('text/html', copie.html)
    // Couper vide les cellules tout de suite, comme un tableur.
    if (couper) modifierTable(contexte, id, (tab) => ({ table: viderSelection(tab, lireEtat(id).plages) }))
  }
  const surColle = (e: React.ClipboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    collerDansTable(contexte, id, e.clipboardData.getData('text/html') || null, e.clipboardData.getData('text/plain'))
  }

  /**
   * Le clic droit ouvre le menu de la table seulement s'il y a des cellules choisies et pas d'écriture en cours ;
   * sinon c'est le menu de l'élément (ou celui du navigateur dans une cellule ouverte). Sur une lettre ou un numéro
   * hors de la sélection, la colonne ou la ligne entière se choisit ; sur une cellule hors de la sélection, elle seule.
   */
  const surMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!actif) return
    const e0 = lireEtat(id)
    if (e0.edition || (e.target as HTMLElement).closest('.notak-table-editeur, .notak-table-titre, input, textarea:not(.notak-table-clavier)')) return e.stopPropagation()
    if (e0.plages.length === 0) return
    const repere = (e.target as HTMLElement).closest<HTMLElement>('.notak-table-repere')
    const cel = celluleDe(e.target)
    if (!cel) return
    e.preventDefault()
    e.stopPropagation()
    const p = e0.plages
    if (repere?.classList.contains('notak-table-repere-colonne')) {
      if (!colonneChoisie(cel.c)) choisir([colonneEntiere(cel.c)], { l: 0, c: cel.c }, { l: dimensions().l - 1, c: cel.c })
    } else if (repere) {
      if (!ligneChoisie(cel.l)) choisir([ligneEntiere(cel.l)], { l: cel.l, c: 0 }, { l: cel.l, c: dimensions().c - 1 })
    } else if (!p.some((q) => dansPlage(q, cel.l, cel.c))) choisir([plageDe(cel)], cel, cel)
    focaliser(id)
    const toile = racine.current?.closest('.notak-toile')?.getBoundingClientRect()
    if (toile) setMenu({ x: e.clientX - toile.left, y: e.clientY - toile.top })
  }

  /* ── ce qu'on dessine ── */

  const refs = useMemo(() => {
    const m = new Map<string, { couleur: string; haut: boolean; bas: boolean; gauche: boolean; droite: boolean }>()
    if (!edition?.texte.startsWith('=')) return m
    citerReferences(edition.texte).forEach((cit, i) => {
      const p = normaliserPlage(cit.plage)
      const couleur = COULEURS_REFERENCES[i % COULEURS_REFERENCES.length]!
      for (let l = p.l1; l <= Math.min(p.l2, lignes - 1); l++)
        for (let col = p.c1; col <= Math.min(p.c2, colonnes - 1); col++)
          m.set(`${l},${col}`, { couleur, haut: l === p.l1, bas: l === p.l2, gauche: col === p.c1, droite: col === p.c2 })
    })
    return m
  }, [edition?.texte, lignes, colonnes])

  const derniere = plages.at(-1)
  const coin = derniere ? normaliserPlage(derniere) : null
  const cibleRecopie = visuel.cible ? normaliserPlage(visuel.cible) : null
  const contoursCible = useMemo(() => (visuel.cible ? contoursDe([visuel.cible]) : null), [visuel.cible])
  const apercu = etat.apercuFond

  const somme = largeurs.reduce((a, b) => a + b, 0) || 1
  const brutes = dansColonne && c.largeurs && c.largeurs.length === colonnes && c.largeurs.every((v) => v > 0) ? c.largeurs : largeurs
  const naturelle = brutes.reduce((a, b) => a + b, 0) * PX_PAR_UG
  const etire = !dansColonne || dispo === 0 || naturelle <= dispo + 10 * PX_PAR_UG
  const sommeBrutes = brutes.reduce((a, b) => a + b, 0) || 1
  const styleTable: CSSProperties = etire ? { width: '100%' } : { width: naturelle }
  const largeurCol = (j: number): string | number => (etire ? `${((dansColonne ? brutes[j]! / sommeBrutes : largeurs[j]! / somme) * 100).toFixed(4)}%` : brutes[j]! * PX_PAR_UG)

  const colonneChoisie = (j: number) => plages.some((p) => { const n = normaliserPlage(p); return n.l1 <= 0 && n.l2 >= lignes - 1 && n.c1 <= j && j <= n.c2 })
  const ligneChoisie = (i: number) => plages.some((p) => { const n = normaliserPlage(p); return n.c1 <= 0 && n.c2 >= colonnes - 1 && n.l1 <= i && i <= n.l2 })

  const armerBulle = (l: number, col: number) => {
    clearTimeout(minuteurBulle.current)
    minuteurBulle.current = setTimeout(() => setBulle({ l, c: col }), 200)
  }
  const rangerBulle = () => {
    clearTimeout(minuteurBulle.current)
    setBulle(null)
  }

  const cellule = (i: number, j: number): ReactNode => {
    const brut = c.cellules[i]?.[j] ?? ''
    const f = formats[i]?.[j] ?? null
    const estFormule = brut.startsWith('=')
    const r = resultats[i]?.[j]
    const cle = `${i},${j}`
    const contour = contours.get(cle)
    const ref = refs.get(cle)
    const enEdition = edition?.l === i && edition.c === j
    const dansSel = apercu !== undefined && !!contour
    const affiche = texteAffiche(brut, f, r, lg)
    let contenu: ReactNode
    if (enEdition && edition) {
      contenu = <Editeur id={id} edition={edition} format={f} valider={valider} abandonner={abandonner} />
    } else if (f?.type === 'case') {
      contenu = (
        <input
          type="checkbox"
          className="notak-table-case"
          checked={brut === 'true'}
          aria-label={t('table.case', { ligne: i + 1, colonne: j + 1 })}
          // Une case se coche d'un clic, même sur une table qui n'est pas choisie.
          onPointerDown={(e) => !lectureSeule && e.stopPropagation()}
          onChange={() => !lectureSeule && cocher(i, j)}
        />
      )
    } else if (estFormule && r?.erreur) {
      const message = messageErreur(r.erreur)
      contenu = (
        <span className="notak-table-erreur" role="img" aria-label={message} onPointerEnter={() => armerBulle(i, j)} onPointerLeave={rangerBulle}>
          <Icone nom="alerte" taille={16} />
          {bulle?.l === i && bulle.c === j && (
            <span className="notak-table-bulle" role="tooltip">
              {message}
            </span>
          )}
        </span>
      )
    } else if (!estFormule && LIEN.test(brut.trim())) {
      contenu = (
        <a
          className="notak-table-texte"
          href={brut.trim()}
          target="_blank"
          rel="noopener noreferrer"
          // Un lien s'ouvre d'un clic, table choisie ou non.
          onPointerDown={(e) => e.stopPropagation()}
        >
          {affiche}
        </a>
      )
    } else if (affiche !== '') {
      contenu = (
        <span className="notak-table-texte" style={f?.surligne ? { background: couleurSurlignage(f.surligne), color: f.surligne === 'grisFonce' ? '#fff' : 'var(--notak-surligne-texte)' } : undefined}>
          {affiche}
        </span>
      )
    }
    const poignee = coin && !edition && actif && i === coin.l2 && j === coin.c2
    return (
      <td
        key={j}
        data-cellule={cle}
        data-edition={enEdition || undefined}
        data-case={f?.type === 'case' || undefined}
        style={styleDeCellule(
          // Le résultat d'une formule s'aligne comme sa valeur : un nombre à droite ; seule l'écriture reste à gauche.
          estFormule && !enEdition && !f?.type && typeof r?.valeur === 'number' && !r.erreur ? { ...f, type: 'nombre' } : f,
          estFormule && enEdition,
          dansSel ? apercu : undefined,
        )}
      >
        {contenu}
        {ref && (
          <i
            className="notak-table-ref"
            aria-hidden
            style={{ background: `color-mix(in srgb, ${ref.couleur} 10%, transparent)`, boxShadow: ombreContour(ref, ref.couleur, 2) }}
          />
        )}
        {contour && !(enEdition && edition) && (
          <i
            className="notak-table-sel"
            aria-hidden
            // Comme Milanote : le seul contour extérieur de la plage, sans voile sur les cellules.
            style={{ boxShadow: ombreContour(contour, 'var(--notak-selection)', 2) }}
          />
        )}
        {contour && enEdition && <i className="notak-table-sel" aria-hidden style={{ boxShadow: 'inset 0 0 0 2px var(--notak-selection)' }} />}
        {cibleRecopie && contoursCible?.get(cle) && <i className="notak-table-cible" aria-hidden style={{ boxShadow: ombreContour(contoursCible.get(cle)!, 'var(--notak-selection)', 1) }} />}
        {poignee && <span className="notak-table-recopie" data-recopie title={t('table.recopier')} onPointerDown={surRecopie} />}
        {reperes && i === 0 && (
          <div
            className="notak-table-repere notak-table-repere-colonne"
            data-choisi={colonneChoisie(j) || undefined}
            data-touche={plages.some((p) => { const n = normaliserPlage(p); return n.c1 <= j && j <= n.c2 }) || undefined}
            role="columnheader"
            aria-label={t('table.repere.colonne', { nom: nomColonne(j) })}
            // Chaque lettre passe sur la suivante : la moitié droite de sa poignée de largeur reste saisissable.
            style={{ zIndex: 3 + nombreColonnes(c.cellules) - j }}
            onPointerDown={(e) => surRepere(e, 'colonne', j)}
          >
            {nomColonne(j)}
            <span
              className="notak-table-largeur"
              data-derniere={j === colonnes - 1 || undefined}
              aria-label={t('table.largeur')}
              onPointerDown={(e) => surLargeur(e, j)}
              onPointerMove={mouvementLargeur}
              onPointerUp={(e) => finLargeur(e, j)}
              onPointerCancel={(e) => finLargeur(e, j)}
              onDoubleClick={(e) => {
                e.stopPropagation()
                ajusterAuContenu(j)
              }}
            />
          </div>
        )}
        {reperes && j === 0 && (
          <div
            className="notak-table-repere notak-table-repere-ligne"
            data-choisi={ligneChoisie(i) || undefined}
            data-touche={plages.some((p) => { const n = normaliserPlage(p); return n.l1 <= i && i <= n.l2 }) || undefined}
            role="rowheader"
            aria-label={t('table.repere.ligne', { n: i + 1 })}
            onPointerDown={(e) => surRepere(e, 'ligne', i)}
          >
            {i + 1}
          </div>
        )}
      </td>
    )
  }

  const toile = menu ? racine.current?.closest('.notak-toile') : null

  return (
    <div
      ref={racine}
      className="notak-tableur"
      data-actif={actif || undefined}
      data-cellules={actif && plages.length > 0 ? '' : undefined}
      data-colonne={dansColonne || undefined}
      data-titre={c.avecTitre || undefined}
      data-legende={c.avecLegende || undefined}
      data-pair={lignes % 2 === 0 || undefined}
      style={c.avecTitre && hTitre ? ({ '--notak-table-titre-h': `${hTitre}px` } as CSSProperties) : undefined}
      data-deplace={!!visuel.ombre || undefined}
      onPointerDown={surAppui}
      onPointerMove={surMouvement}
      onPointerUp={(e) => finGeste(e, false)}
      onPointerCancel={(e) => finGeste(e, true)}
      onMouseDown={(e) => {
        // Les cellules ne prennent pas le focus du navigateur : c'est le nœud de la table qui le tient.
        if (actif && !(e.target as HTMLElement).closest('input, textarea, select, button, a, label')) e.preventDefault()
      }}
      onDoubleClick={(e) => actif && e.stopPropagation()}
      onContextMenu={surMenu}
    >
      {c.avecTitre && (
        <Titre
          id={id}
          valeur={c.titre ?? ''}
          ecrivable={actif}
          change={(v) => changer({ ...c, titre: v })}
          suite={allerA1}
          retirer={() => {
            changer({ ...c, avecTitre: false })
            allerA1()
          }}
          finir={() => contexte.choisir([])}
          hauteur={(h) => {
            if (h && h !== hTitre) setHTitre(h)
          }}
        />
      )}
      <div className="notak-table-defile">
        <table style={styleTable}>
          <colgroup>
            {Array.from({ length: colonnes }, (_, j) => (
              <col key={j} style={{ width: largeurCol(j) }} />
            ))}
          </colgroup>
          <tbody>
            {c.cellules.map((_, i) => (
              <tr key={i}>{Array.from({ length: colonnes }, (_, j) => cellule(i, j))}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {c.avecLegende && <LegendeTable valeur={c.legende ?? ''} ecrivable={actif} change={(v) => changer({ ...c, legende: v })} />}
      {visuel.ombre && <div className="notak-table-ombre" aria-hidden style={{ left: visuel.ombre.x, top: visuel.ombre.y, width: visuel.ombre.w, height: visuel.ombre.h }} />}
      {visuel.ligne && <div className="notak-table-place" aria-hidden style={{ left: visuel.ligne.x, top: visuel.ligne.y, width: visuel.ligne.w, height: visuel.ligne.h }} />}
      {actif && plages.length > 0 && (
        <textarea
          ref={refNoeud}
          className="notak-table-clavier"
          data-table-clavier
          tabIndex={-1}
          aria-label={t('type.table')}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onKeyDown={surClavier}
          onInput={surSaisie}
          onCompositionEnd={surSaisie}
          onCopy={(e) => surCopie(e, false)}
          onCut={(e) => surCopie(e, true)}
          onPaste={surColle}
        />
      )}
      {menu && toile && createPortal(<MenuContextuel x={menu.x} y={menu.y} entrees={entreesTable(contexte, id, 'clic')} fermer={() => { setMenu(null); focaliser(id) }} />, toile)}
    </div>
  )
}

