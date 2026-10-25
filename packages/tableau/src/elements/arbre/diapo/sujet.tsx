import type { ReactNode } from 'react'
import type { Id } from '../../../coeur/tableau'
import { t } from '../../../langue'
import type { DiapoFin, DiapoSujet } from '../modele/diapositives'
import { type Palier, type Police, ajuster } from '../modele/dimensions'
import { type Ctx, Entete, Image, type PropsGabarit, Texte, etiquettes, imageNaturelle, marqueursDe, note, noterTitre, titreDe } from './commun'
import { contenir, couvrir, estPetite } from './geometrie'
import { largeurDe } from './tailles'

/**
 * La diapositive d'un sujet (relevé 11 § 1 et § 2) : son titre, ses étiquettes, sa note, centrés ; avec une image, à la
 * place que le réglage (ou Auto) lui donne. La taille du titre se cherche par paliers : une ligne, puis deux, puis
 * plusieurs dans la hauteur ; centré sur une ligne, aligné à gauche dès deux. « Merci » est un sujet central.
 */

/** Une partie de la colonne : sa hauteur, l'écart qui la précède, et son dessin à une place et une largeur données. */
interface Partie {
  cle: 'titre' | 'etiquettes' | 'note' | 'image'
  l: number
  h: number
  ecart: number
  rendre: (x: number, y: number, largeur: number) => ReactNode
}

interface Contenu {
  align: 'left' | 'center'
  /** La largeur de la colonne : sa partie la plus large. */
  l: number
  parties: Partie[]
  lignesTitre: number
}

/** Les paliers d'un gabarit : ceux qui fixent un nombre de lignes, puis le dernier qui doit tenir dans `hauteur`. */
const versPaliers = (ps: readonly Police[], hauteur: number): Palier[] => ps.map((p) => (p.lignesPreferees !== undefined ? { max: p.max, min: p.min, lignes: p.lignesPreferees } : { max: p.max, min: p.min, hauteur }))

/**
 * Le titre, les étiquettes et la note d'un sujet sur `largeur`. `reserve` : la hauteur que prend déjà autre chose
 * (une image au-dessus) ; sans annexes le titre tient entre les marges, avec elles dans la diapositive.
 */
function contenuDeSujet(c: Ctx, id: Id, o: { largeur: number; paliers: readonly Police[]; ecartNote: number; reserve?: number; texte?: string; boiteTitre?: string; fond?: boolean; centrable?: boolean }): Contenu {
  const { d, s, u } = c
  const ecarts = d.sujet.ecarts
  const et0 = o.texte === undefined ? etiquettes(c, id, o.largeur, true) : null
  const no = o.texte === undefined ? note(c, id, o.largeur) : null
  const annexes = (et0 ? et0.h + ecarts.titreEtiquettes : 0) + (no ? no.h + o.ecartNote : 0)
  const limite = (et0 || no ? u.h : u.h - 2 * s.marges.v) - annexes - (o.reserve ?? 0)
  const paliers = versPaliers(o.paliers, Math.max(0, limite))
  const repli = o.paliers.at(-1)?.max ?? d.sujet.repli
  const texte = o.texte ?? titreDe(c, id)
  const a = ajuster({ texte, police: c.polices.titre, largeur: o.largeur, paliers, repli: { taille: repli }, mesurer: c.mesurer })
  const uneLigne = a.lignes.length <= 1
  // Centré sur une ligne ; dès deux, à gauche, et les annexes avec ; une note de plusieurs lignes aussi.
  const align: 'left' | 'center' = o.centrable !== false && uneLigne && !(no && no.lignes > 1) ? 'center' : 'left'
  const et = et0 && align === 'left' ? etiquettes(c, id, o.largeur, false) : et0
  const marqueurs = o.texte === undefined ? marqueursDe(c, id) : []
  const parties: Partie[] = [
    {
      cle: 'titre',
      l: largeurDe(a),
      h: a.hauteur,
      ecart: 0,
      rendre: (x, y, l) => (noterTitre(c, x, y, l, a.hauteur), <Texte key="titre" boite={o.boiteTitre ?? `${id}:titre`} x={x} y={y} a={a} largeur={l} align={align} titre marqueurs={marqueurs} className={o.fond ? 'notak-arbre-diapo-ombre' : undefined} />),
    },
  ]
  if (et) parties.push({ cle: 'etiquettes', l: et.l, h: et.h, ecart: ecarts.titreEtiquettes, rendre: (x, y, l) => <span key="etiquettes">{et.rendre(align === 'center' ? x + (l - et.l) / 2 : x, y)}</span> })
  if (no) parties.push({ cle: 'note', l: no.l, h: no.h, ecart: o.ecartNote, rendre: (x, y, l) => <span key="note">{no.rendre(align === 'center' ? x + (l - no.l) / 2 : x, y)}</span> })
  return { align, l: Math.max(...parties.map((p) => p.l)), parties, lignesTitre: a.lignes.length }
}

const hauteurDe = (parties: readonly Partie[]) => parties.reduce((h, p, i) => h + p.h + (i ? p.ecart : 0), 0)

/** La colonne posée de haut en bas depuis (x, y), sur sa largeur. */
function empiler(parties: readonly Partie[], x: number, y: number, l: number): ReactNode[] {
  let yy = y
  return parties.map((p, i) => {
    yy += i ? p.ecart : 0
    const n = p.rendre(x, yy, l)
    yy += p.h
    return n
  })
}

/** Le haut d'un bloc centré dans la diapositive ; s'il dépasse, il part des marges (la diapositive défile). */
const haut = (c: Ctx, h: number) => (h <= c.u.h ? (c.u.h - h) / 2 : c.s.marges.v)

export function GabaritSujet({ c, diapo }: PropsGabarit<DiapoSujet>) {
  const { d, u } = c
  const contenu = contenuDeSujet(c, diapo.sujet, { largeur: d.sujet.largeurTexte, paliers: d.sujet.paliers, ecartNote: d.sujet.ecarts.titreNote })
  const h = hauteurDe(contenu.parties)
  return (
    <>
      <Entete c={c} sujet={diapo.sujet} />
      {empiler(contenu.parties, (u.l - contenu.l) / 2, haut(c, h), contenu.l)}
    </>
  )
}

/** « Merci » : un sujet central, sans annexes. */
export function GabaritFin({ c, diapo }: PropsGabarit<DiapoFin>) {
  const { d, u } = c
  const contenu = contenuDeSujet(c, diapo.sujet, { largeur: d.sujet.largeurTexte, paliers: d.sujet.paliers, ecartNote: 0, texte: t('arbre.pitch.merci'), boiteTitre: `${diapo.sujet}:merci` })
  const h = hauteurDe(contenu.parties)
  return <>{empiler(contenu.parties, (u.l - contenu.l) / 2, haut(c, h), contenu.l)}</>
}

/** La diapositive d'un sujet illustré (relevé 11 § 2) : cinq places d'image, `contain` partout sauf « fond » (`cover`). */
export function GabaritSujetImage({ c, diapo }: PropsGabarit<DiapoSujet>) {
  const { d, s, u } = c
  const id = diapo.sujet
  const sujet = c.l.sujets.get(id)
  const im = imageNaturelle(sujet) ?? { l: 0, h: 0 }
  const petite = estPetite(im)
  const place = diapo.placeImage ?? 'gauche'
  const di = d['sujet-image']
  const contenuW = u.l - 2 * s.marges.h
  const sansTexte = !sujet?.titre.trim() && !(sujet?.marqueurs?.length) && !sujet?.etiquettes?.some((e) => e.trim()) && !sujet?.note
  const entete = <Entete c={c} sujet={id} />

  if (sansTexte && place !== 'fond') {
    // Rien que l'image, centrée dans les marges (deux fois plus larges pour une petite).
    const zone = petite ? { l: u.l - 4 * s.marges.h, h: u.h - 4 * s.marges.v } : di.seulImage
    const t = contenir(im, zone)
    return (
      <>
        {entete}
        <Image c={c} id={id} x={(u.l - t.l) / 2} y={(u.h - t.h) / 2} l={t.l} h={t.h} />
      </>
    )
  }

  if (place === 'fond') {
    // L'image couvre la diapositive depuis (0, 0) : elle déborde à droite ou en bas, la diapositive rogne.
    const t = couvrir(im, { l: u.l, h: u.h })
    const contenu = contenuDeSujet(c, id, { largeur: contenuW, paliers: di.fond.paliers, ecartNote: di.ecartEtiquettesNote, fond: true })
    const h = hauteurDe(contenu.parties)
    return (
      <>
        <Image c={c} id={id} x={0} y={0} l={t.l} h={t.h} className="notak-arbre-diapo-image-fond" />
        {entete}
        {empiler(contenu.parties, (u.l - contenu.l) / 2, haut(c, h), contenu.l)}
      </>
    )
  }

  if (place === 'gauche' || place === 'droite') {
    const zone = { l: petite ? di.cote.zone.lPetite : di.cote.zone.l, h: di.cote.zone.h }
    const t = contenir(im, zone)
    const contenu = contenuDeSujet(c, id, { largeur: contenuW - zone.l - di.cote.ecart, paliers: di.cote.paliers, ecartNote: di.ecartEtiquettesNote, centrable: false })
    const h = hauteurDe(contenu.parties)
    const total = t.l + di.cote.ecart + contenu.l
    const x0 = (u.l - total) / 2
    const [xImage, xTexte] = place === 'gauche' ? [x0, x0 + t.l + di.cote.ecart] : [x0 + contenu.l + di.cote.ecart, x0]
    return (
      <>
        {entete}
        <Image c={c} id={id} x={xImage} y={(u.h - t.h) / 2} l={t.l} h={t.h} />
        {empiler(contenu.parties, xTexte, haut(c, h), contenu.l)}
      </>
    )
  }

  // Au-dessus ou au-dessous du titre : une colonne centrée.
  const zone = { l: di.dessus.zone.l, h: petite ? di.dessus.zone.hPetite : di.dessus.zone.h }
  const t = contenir(im, zone)
  // Centré seulement sur une ligne, et si l'image ne prend pas toute la largeur de sa zone en paysage.
  const pleine = !s.portrait && t.l >= zone.l - 0.5
  const contenu = contenuDeSujet(c, id, { largeur: contenuW, paliers: di.dessus.paliers, ecartNote: di.ecartEtiquettesNote, reserve: t.h + di.dessus.ecart, centrable: !pleine })
  const partieImage: Partie = { cle: 'image', l: t.l, h: t.h, ecart: di.dessus.ecart, rendre: (x, y, l) => <Image key="image" c={c} id={id} x={x + (l - t.l) / 2} y={y} l={t.l} h={t.h} /> }
  const parties = contenu.parties
  const avecImage = place === 'dessus' ? [{ ...partieImage, ecart: 0 }, ...parties.map((p, i) => (i === 0 ? { ...p, ecart: di.dessus.ecart } : p))] : [...parties.filter((p) => p.cle !== 'note'), partieImage, ...parties.filter((p) => p.cle === 'note')]
  const l = Math.max(contenu.l, t.l)
  const h = hauteurDe(avecImage)
  return (
    <>
      {entete}
      {empiler(avecImage, (u.l - l) / 2, haut(c, h), l)}
    </>
  )
}
