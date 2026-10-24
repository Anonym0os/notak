import type { CSSProperties, ReactNode } from 'react'
import { type Id, type Sujet, texteBrut } from '../../../coeur/tableau'
import { Autocollant, DessinIllustration } from '../catalogue'
import { Marqueur } from '../marqueurs'
import type { Diapo, EtatItem } from '../modele/diapositives'
import type { Ajuste, Dimensions, Mesure, socle, unites } from '../modele/dimensions'
import type { Lecture } from '../modele/sujets'
import type { RatioPitch } from '../themesPitch'
import type { FormesDiapo, ProprietesForme } from './formes'
import { type Taille, pastilles } from './geometrie'
import { MARQUEUR } from './mesure'
import { aTaille, largeurDe } from './tailles'

/**
 * Ce que tous les gabarits partagent : le contexte de dessin (les tables du rapport, la mesure, les polices, les formes),
 * les blocs de texte posés en pixels de base, les formes posées dans leur boîte, les images, l'en-tête et son filet,
 * les étiquettes et la note.
 *
 * Chaque élément qui peut s'animer porte `data-boite="<sujet>:<rôle>"`, le même sur toutes les diapositives où il paraît :
 * le titre d'un enfant dans la liste de son parent et sur sa propre diapositive sont la même boîte (`<id>:titre`).
 */

export interface Ctx {
  l: Lecture
  ratio: RatioPitch
  u: ReturnType<typeof unites>
  s: ReturnType<typeof socle>
  d: Dimensions
  mesurer: Mesure
  /** Les polices de mesure (`police()` de mesure.ts) : texte courant, titres, et le gras du texte courant. */
  polices: { texte: string; titre: string; gras: string; italique: string }
  formes: FormesDiapo
  adresse: ((fichier: Id) => string | undefined) | undefined
  /**
   * Ce que le gabarit relève en se posant, pour le décor du thème : la boîte de son titre (px de base) et le centre de
   * chaque sous-sujet (en % de la diapositive).
   */
  releve: { titre?: { x: number; y: number; l: number; h: number }; sousSujets: [number, number][] }
}

/** Le titre du gabarit est posé là. */
export const noterTitre = (c: Ctx, x: number, y: number, l: number, h: number) => {
  c.releve.titre ??= { x, y, l, h }
}

/** Un sous-sujet est centré là (px de base). */
export const noterSousSujet = (c: Ctx, x: number, y: number) => {
  c.releve.sousSujets.push([(100 * x) / c.u.l, (100 * y) / c.u.h])
}

/** La couleur des formes : celle du texte du thème. */
export const COULEUR = 'var(--d-texte, #fff)'

export interface PropsGabarit<D extends Diapo = Diapo> {
  c: Ctx
  diapo: D
}

const aplatir = (s: string) => s.replace(/\s*\n\s*/g, ' ')

/** Les marqueurs montrés devant un titre : trois au plus. */
export const marqueursDe = (c: Ctx, id: Id): string[] => (c.l.sujets.get(id)?.marqueurs ?? []).slice(0, c.s.marqueursMax)

/** Le titre d'un sujet tel qu'on le mesure : sur une ligne, précédé de la place de ses marqueurs. */
export function titreDe(c: Ctx, id: Id, avecMarqueurs = true): string {
  const s = c.l.sujets.get(id)
  const titre = aplatir(s?.titre ?? '')
  const n = avecMarqueurs ? marqueursDe(c, id).length : 0
  // Sans titre ni marqueur, mais avec une note ou des étiquettes : six espaces tiennent la place (relevé 11 § 0.4).
  const vide = !titre.trim() && n === 0 && (s?.note || s?.etiquettes?.length) ? '      ' : titre
  return MARQUEUR.repeat(n) + vide
}

/** L'état d'un élément de liste en attribut, pour la feuille de style. */
export const attrEtat = (etat: EtatItem | undefined) => (etat ? { 'data-etat': etat } : {})

interface PropsTexte {
  boite?: string
  x: number
  y: number
  a: Ajuste
  /** La largeur de la boîte ; la plus longue ligne si absente. */
  largeur?: number
  align?: 'left' | 'center' | 'right'
  /** La police des titres (`--d-police-titre`, `--d-graisse-titre`). */
  titre?: boolean
  gras?: boolean
  italique?: boolean
  /** Une hauteur de ligne fixe, en px (l'en-tête) ; sinon l'interligne de l'ajustement. */
  hauteurLigne?: number
  /** Les marqueurs à dessiner à la place des `MARQUEUR` du texte. */
  marqueurs?: readonly string[]
  etat?: EtatItem
  className?: string
  style?: CSSProperties
}

/**
 * Un bloc de texte, posé en px de base, ligne par ligne comme la mesure l'a coupé : la mise en page qu'on a calculée est
 * celle qu'on voit, au pixel près.
 */
export function Texte({ boite, x, y, a, largeur, align = 'left', titre, gras, italique, hauteurLigne, marqueurs = [], etat, className, style }: PropsTexte) {
  let m = 0
  const ligne = (texte: string, i: number) => {
    if (!texte.includes(MARQUEUR)) return <span key={i}>{texte}</span>
    const morceaux: ReactNode[] = []
    texte.split(MARQUEUR).forEach((bout, j) => {
      if (j > 0) {
        const id = marqueurs[m++]
        morceaux.push(
          <span key={`m${j}`} className="notak-arbre-diapo-marqueur">
            {id && <Marqueur id={id} taille={a.taille} />}
          </span>,
        )
      }
      if (bout) morceaux.push(bout)
    })
    return <span key={i}>{morceaux}</span>
  }
  return (
    <div
      className={['notak-arbre-diapo-texte', className].filter(Boolean).join(' ')}
      data-boite={boite}
      data-titre={titre ? '' : undefined}
      data-gras={gras ? '' : undefined}
      data-italique={italique ? '' : undefined}
      {...attrEtat(etat)}
      style={{ left: x, top: y, width: largeur ?? largeurDe(a), fontSize: a.taille, lineHeight: hauteurLigne !== undefined ? `${hauteurLigne}px` : a.interligne, textAlign: align, ...style }}
    >
      {a.lignes.map((l, i) => ligne(l.texte, i))}
    </div>
  )
}

/** Une forme posée dans sa boîte : un SVG de la taille de la boîte, qui laisse déborder ses traits. */
export function Forme({ boite, x, y, l, h, etat, children, style }: { boite?: string; x: number; y: number; l: number; h: number; etat?: EtatItem; children: ReactNode; style?: CSSProperties }) {
  return (
    <svg className="notak-arbre-diapo-forme" data-boite={boite} {...attrEtat(etat)} style={{ left: x, top: y, ...style }} width={Math.max(0, l)} height={Math.max(0, h)} viewBox={`0 0 ${Math.max(0, l)} ${Math.max(0, h)}`} aria-hidden>
      {children}
    </svg>
  )
}

/** Les propriétés communes d'une forme : sa boîte, son trait, la couleur du thème. */
export const forme = (l: number, h: number, trait: number, graine = 0): ProprietesForme => ({ l, h, trait, couleur: COULEUR, graine })

/** L'image d'un sujet comme le Pitch la voit (image, autocollant, illustration), et sa taille naturelle. */
export function imageNaturelle(s: Sujet | undefined): Taille | null {
  if (s?.image && s.image.l > 0 && s.image.h > 0) return { l: s.image.l, h: s.image.h }
  if (s?.vignette && s.vignette.l > 0 && s.vignette.h > 0) return { l: s.vignette.l, h: s.vignette.h }
  return null
}

/** Une image posée dans sa boîte, sans rayon d'angle (aucun thème n'arrondit les images). */
export function Image({ c, id, x, y, l, h, etat, style, className }: { c: Ctx; id: Id; x: number; y: number; l: number; h: number; etat?: EtatItem; style?: CSSProperties; className?: string }) {
  const s = c.l.sujets.get(id)
  const src = s?.image ? c.adresse?.(s.image.fichier) : undefined
  const v = s?.vignette
  return (
    <div className={['notak-arbre-diapo-image', className].filter(Boolean).join(' ')} data-boite={`${id}:image`} {...attrEtat(etat)} style={{ left: x, top: y, width: l, height: h, ...style }}>
      {src ? (
        <img src={src} alt="" draggable={false} />
      ) : v ? (
        <svg viewBox={`0 0 ${v.l} ${v.h}`} width="100%" height="100%" aria-hidden>
          {v.genre === 'autocollant' ? <Autocollant emoji={v.id} l={v.l} h={v.h} /> : <DessinIllustration id={v.id} l={v.l} h={v.h} />}
        </svg>
      ) : null}
    </div>
  )
}

// — L'en-tête (relevé 11 § 0.5) —

/** Le sujet d'en-tête : l'ancêtre de rang principal (l'enfant du central ou d'un flottant), s'il n'est pas le sujet lui-même. */
export function sujetDEntete(l: Lecture, id: Id): Id | null {
  let x = id
  const vus = new Set<Id>()
  for (let s = l.sujets.get(x); s?.parent !== undefined && !vus.has(x); s = l.sujets.get(x)) {
    vus.add(x)
    const p = l.sujets.get(s.parent)
    if (p && (p.parent === undefined || l.flottants.includes(s.parent))) return x === id ? null : x
    x = s.parent
  }
  return null
}

/** Le fil d'Ariane en haut à gauche : le titre du sujet d'en-tête sur une ligne, et le filet dessous. */
export function Entete({ c, sujet }: { c: Ctx; sujet: Id }) {
  const id = sujetDEntete(c.l, sujet)
  if (id === null) return null
  const e = c.s.entete
  const a = aTaille(titreDe(c, id, false), e.police, e.largeurMax, c.polices.texte, c.mesurer, 1)
  const yFilet = e.y + e.hauteurLigne + c.u.vmin(1)
  return (
    <>
      <Texte boite={`${id}:entete`} x={e.x} y={e.y} a={a} hauteurLigne={e.hauteurLigne} className="notak-arbre-diapo-entete" />
      <Forme boite={`${id}:filet`} x={e.x} y={yFilet - e.filet.epaisseur / 2} l={e.filet.longueur} h={e.filet.epaisseur}>
        {c.formes.filet(forme(e.filet.longueur, e.filet.epaisseur, e.filet.epaisseur))}
      </Forme>
    </>
  )
}

// — Étiquettes et note (relevé 11 § 0.6) —

export interface Bloc {
  l: number
  h: number
  rendre: (x: number, y: number) => ReactNode
}

/** Les étiquettes d'un sujet en pastilles, sur la largeur donnée ; `null` s'il n'en a pas. */
export function etiquettes(c: Ctx, id: Id, largeur: number, centre: boolean): Bloc | null {
  const liste = (c.l.sujets.get(id)?.etiquettes ?? []).map((e) => e.trim()).filter(Boolean)
  if (liste.length === 0) return null
  const e = c.s.etiquettes
  const textes = liste.map((x) => aTaille(x, e.police, Math.max(0, largeur - 2 * e.marge), c.polices.texte, c.mesurer, 1))
  const hauteur = textes[0]!.hauteur
  const p = pastilles(
    textes.map((t) => largeurDe(t) + 2 * e.marge),
    { largeur, largeurMin: e.largeurMin, ecart: e.ecart, interligne: e.interligne, hauteur, centre },
  )
  return {
    l: p.l,
    h: p.h,
    rendre: (x, y) => (
      <div className="notak-arbre-diapo-etiquettes" data-boite={`${id}:etiquettes`} style={{ left: x, top: y, width: p.l, height: p.h }}>
        {p.pastilles.map((q, i) => (
          <span key={i} className="notak-arbre-diapo-etiquette" style={{ left: q.x, top: q.y, width: q.l, height: hauteur, fontSize: e.police, lineHeight: `${hauteur - 2 * e.trait}px`, borderWidth: e.trait }}>
            {textes[i]!.lignes[0]?.texte}
          </span>
        ))}
      </div>
    ),
  }
}

/** La note d'un sujet, à 4 vmin et 0,8 d'opacité ; `null` s'il n'en a pas. */
export function note(c: Ctx, id: Id, largeur: number): (Bloc & { lignes: number; a: Ajuste }) | null {
  const n = c.l.sujets.get(id)?.note
  const texte = n ? texteBrut(n).trim() : ''
  if (!texte) return null
  const a = aTaille(texte, c.s.note.police, largeur, c.polices.texte, c.mesurer)
  return {
    l: largeurDe(a),
    h: a.hauteur,
    lignes: a.lignes.length,
    a,
    rendre: (x, y) => <Texte boite={`${id}:note`} x={x} y={y} a={a} className="notak-arbre-diapo-note" />,
  }
}

/** Une zone qui peut défiler : ses enfants se posent dans son repère, décalés de `decalage` ; ses bords s'estompent. */
export function Zone({ x, y, l, h, decalage = { x: 0, y: 0 }, estompe, children, boite }: { x: number; y: number; l: number; h: number; decalage?: { x: number; y: number }; estompe?: { sens: 'v' | 'h'; taille: number; debut: boolean; fin: boolean }; children: ReactNode; boite?: string }) {
  let masque: string | undefined
  if (estompe && (estompe.debut || estompe.fin)) {
    const vers = estompe.sens === 'v' ? 'to bottom' : 'to right'
    const t = `${estompe.taille}px`
    masque = `linear-gradient(${vers}, ${estompe.debut ? `transparent 0, #000 ${t}` : '#000 0'}, ${estompe.fin ? `#000 calc(100% - ${t}), transparent 100%` : '#000 100%'})`
  }
  return (
    <div className="notak-arbre-diapo-zone" data-boite={boite} style={{ left: x, top: y, width: l, height: h, ...(masque ? { maskImage: masque, WebkitMaskImage: masque } : {}) }}>
      <div className="notak-arbre-diapo-defile" style={decalage.x || decalage.y ? { transform: `translate(${-decalage.x}px, ${-decalage.y}px)` } : undefined}>
        {children}
      </div>
    </div>
  )
}
