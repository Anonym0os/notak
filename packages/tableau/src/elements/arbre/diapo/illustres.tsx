import type { DiapoListe } from '../modele/diapositives'
import { ajuster } from '../modele/dimensions'
import { type Ctx, Entete, Forme, Image, type PropsGabarit, Texte, Zone, forme, imageNaturelle, marqueursDe, noterSousSujet, noterTitre, titreDe } from './commun'
import { type Taille, contenir, couvrir, defilement, estPetite, galerie, rapport } from './geometrie'
import { aTaille, ajusterPolice, hauteurPile, largeurDe } from './tailles'

/**
 * Les listes à images (relevé 11 § 13 à § 17) : un parent illustré (image sans titre) et ses enfants, des enfants
 * illustrés en galerie justifiée, les deux à la fois, ou un seul enfant. Les images sont contenues (`contain`), sauf le
 * fond de la liste illustrée qui couvre la diapositive, flouté.
 */

const SANS_IMAGE: Taille = { l: 0, h: 0 }
const imageDe = (c: Ctx, id: string) => imageNaturelle(c.l.sujets.get(id)) ?? SANS_IMAGE

/** Image à côté du texte : en paysage, si l'image est petite ou moins de quatre fois plus large que haute. */
const aCote = (c: Ctx, im: Taille, rapportLarge: number) => !c.s.portrait && (estPetite(im) || rapport(im) < rapportLarge)

function pileDe(hauteurs: readonly number[], ecart: number) {
  let y = 0
  return hauteurs.map((h) => {
    const ici = y
    y += h + ecart
    return ici
  })
}

export function GabaritParentIllustre({ c, diapo }: PropsGabarit<DiapoListe>) {
  const { d, s, u } = c
  const dp = d['parent-illustre']
  const im = imageDe(c, diapo.sujet)
  const petite = estPetite(im)
  const contenu = u.l - 2 * s.marges.h
  const textes = diapo.items.map((i) => titreDe(c, i.id))
  const k = Math.max(0, diapo.items.findIndex((x) => x.etat === 'courant'))
  if (aCote(c, im, dp.rapportLarge)) {
    const o = dp.cote
    const largeurListe = petite ? o.largeurListePetite : o.largeurListe
    const as = textes.map((x) => aTaille(x, o.police, largeurListe, c.polices.texte, c.mesurer, o.lignesMax))
    const hauteurs = as.map((a) => a.hauteur)
    const dispo = u.h - 2 * s.marges.v
    const texte = hauteurs.reduce((a, b) => a + b, 0)
    const ecart = as.length > 4 ? Math.max(o.ecart, (dispo - texte) / (as.length - 1)) : o.ecart
    const hListe = hauteurPile(hauteurs, ecart)
    const lListe = Math.max(0, ...as.map(largeurDe))
    const zone = { l: Math.max(petite ? o.largeurImageMinPetite : o.largeurImageMin, contenu - largeurListe - o.ecartImage), h: o.hauteurImage }
    const t = contenir(im, zone)
    const x0 = (u.l - (t.l + o.ecartImage + lListe)) / 2
    const xListe = x0 + t.l + o.ecartImage
    const zoneH = Math.min(dispo, hListe)
    const yZone = (u.h - zoneH) / 2
    const ys = pileDe(hauteurs, ecart)
    const dec = defilement(hListe, zoneH, (ys[k] ?? 0) + (hauteurs[k] ?? 0) / 2)
    ys.forEach((y, i) => noterSousSujet(c, xListe + largeurDe(as[i]!) / 2, yZone + y - dec + hauteurs[i]! / 2))
    return (
      <>
        <Entete c={c} sujet={diapo.sujet} />
        <Image c={c} id={diapo.sujet} x={x0} y={(u.h - t.h) / 2} l={t.l} h={t.h} />
        <Zone x={xListe} y={yZone} l={lListe} h={zoneH} decalage={{ x: 0, y: dec }}>
          {diapo.items.map((item, i) => (
            <Texte key={item.id} boite={`${item.id}:titre`} x={0} y={ys[i]!} a={as[i]!} largeur={lListe} marqueurs={marqueursDe(c, item.id)} etat={item.etat} />
          ))}
        </Zone>
      </>
    )
  }
  // L'image en haut à gauche, la liste dessous.
  const o = dp.dessus
  const t = contenir(im, { l: o.largeurImage, h: o.hauteurImage })
  const as = textes.map((x) => aTaille(x, o.police, contenu, c.polices.texte, c.mesurer, o.lignesMax))
  const hauteurs = as.map((a) => a.hauteur)
  const hListe = hauteurPile(hauteurs, o.ecart)
  const yZone = s.marges.v + t.h + o.ecartImage + o.margeHaute
  const zoneH = Math.max(0, u.h - s.marges.v - yZone)
  const ys = pileDe(hauteurs, o.ecart)
  const dec = defilement(hListe, zoneH, (ys[k] ?? 0) + (hauteurs[k] ?? 0) / 2)
  ys.forEach((y, i) => noterSousSujet(c, s.marges.h + largeurDe(as[i]!) / 2, yZone + y - dec + hauteurs[i]! / 2))
  return (
    <>
      <Entete c={c} sujet={diapo.sujet} />
      <Image c={c} id={diapo.sujet} x={s.marges.h} y={s.marges.v} l={t.l} h={t.h} />
      <Zone x={s.marges.h} y={yZone} l={contenu} h={zoneH} decalage={{ x: 0, y: dec }} estompe={hListe > zoneH ? { sens: 'v', taille: s.estompe, debut: dec > 0, fin: dec < hListe - zoneH } : undefined}>
        {diapo.items.map((item, i) => (
          <Texte key={item.id} boite={`${item.id}:titre`} x={0} y={ys[i]!} a={as[i]!} largeur={contenu} marqueurs={marqueursDe(c, item.id)} etat={item.etat} />
        ))}
      </Zone>
    </>
  )
}

export function GabaritEnfantUniqueParentIllustre({ c, diapo }: PropsGabarit<DiapoListe>) {
  const { d, s, u } = c
  const de = d['enfant-unique-parent-illustre']
  const im = imageDe(c, diapo.sujet)
  const petite = estPetite(im)
  const contenu = u.l - 2 * s.marges.h
  const item = diapo.items[0]
  if (!item) return null
  const dispo = u.h - 2 * s.marges.v
  if (aCote(c, im, de.rapportLarge)) {
    const o = de.cote
    const largeurTexte = (petite ? 8 : 4) * s.marges.h
    const a = ajuster({ texte: titreDe(c, item.id), police: c.polices.texte, largeur: largeurTexte, paliers: [{ max: o.enfant.max, min: o.enfant.min, hauteur: dispo }], repli: { taille: o.enfant.min }, mesurer: c.mesurer })
    const zone = { l: Math.max((petite ? 2 : 6) * s.marges.h, contenu - largeurTexte - o.ecart), h: dispo }
    const t = contenir(im, zone)
    const lt = largeurDe(a)
    const x0 = (u.l - (t.l + o.ecart + lt)) / 2
    const yTexte = (u.h - a.hauteur) / 2
    noterSousSujet(c, x0 + t.l + o.ecart + lt / 2, u.h / 2)
    return (
      <>
        <Entete c={c} sujet={diapo.sujet} />
        <Image c={c} id={diapo.sujet} x={x0} y={(u.h - t.h) / 2} l={t.l} h={t.h} />
        {/* Le séparateur vertical, haut comme le texte, au milieu de l'écart. */}
        <Forme boite={`${diapo.sujet}:separateur`} x={x0 + t.l + o.ecart / 2 - o.separateur / 2} y={yTexte} l={o.separateur} h={a.hauteur} etat={item.etat}>
          {c.formes.filet(forme(o.separateur, a.hauteur, o.separateur))}
        </Forme>
        <Texte boite={`${item.id}:titre`} x={x0 + t.l + o.ecart} y={yTexte} a={a} largeur={lt} marqueurs={marqueursDe(c, item.id)} etat={item.etat} />
      </>
    )
  }
  const o = de.dessus
  const t = contenir(im, { l: contenu, h: petite ? o.hauteurImagePetite : o.hauteurImage })
  const a = ajuster({ texte: titreDe(c, item.id), police: c.polices.texte, largeur: contenu, paliers: [{ max: o.enfant.max, min: o.enfant.min, hauteur: Math.max(0, dispo - t.h - o.ecart) }], repli: { taille: o.enfant.min }, mesurer: c.mesurer })
  const longueur = s.portrait ? contenu : largeurDe(a)
  const total = t.h + o.ecart + a.hauteur
  const y0 = Math.max(s.marges.v, (u.h - total) / 2)
  noterSousSujet(c, s.marges.h + largeurDe(a) / 2, y0 + t.h + o.ecart + a.hauteur / 2)
  return (
    <>
      <Entete c={c} sujet={diapo.sujet} />
      <Image c={c} id={diapo.sujet} x={s.marges.h} y={y0} l={t.l} h={t.h} />
      <Forme boite={`${diapo.sujet}:separateur`} x={s.marges.h} y={y0 + t.h + o.ecart / 2 - o.separateur / 2} l={longueur} h={o.separateur} etat={item.etat}>
        {c.formes.filet(forme(longueur, o.separateur, o.separateur))}
      </Forme>
      <Texte boite={`${item.id}:titre`} x={s.marges.h} y={y0 + t.h + o.ecart} a={a} largeur={contenu} marqueurs={marqueursDe(c, item.id)} etat={item.etat} />
    </>
  )
}

/** Les images des enfants en rangées justifiées, posées depuis (x, y). */
function Galerie({ c, diapo, x, y, g }: { c: Ctx; diapo: DiapoListe; x: number; y: number; g: ReturnType<typeof galerie> }) {
  return (
    <>
      {g.cases.map((k) => {
        const item = diapo.items[k.i]!
        noterSousSujet(c, x + k.x + k.l / 2, y + k.y + k.h / 2)
        return <Image key={item.id} c={c} id={item.id} x={x + k.x} y={y + k.y} l={k.l} h={k.h} etat={item.etat} />
      })}
    </>
  )
}

export function GabaritEnfantsIllustres({ c, diapo }: PropsGabarit<DiapoListe>) {
  const { d, s, u } = c
  const de = d['enfants-illustres']
  const contenu = u.l - 2 * s.marges.h
  const titre = ajuster({ texte: titreDe(c, diapo.sujet), police: c.polices.titre, largeur: contenu, paliers: [{ max: de.titre.max, min: de.titre.min, lignes: 1 }], repli: { taille: de.titre.max, lignesMax: 1 }, derniereLigne: false, mesurer: c.mesurer })
  const dispo = u.h - 2 * s.marges.v - titre.hauteur - de.titreGalerie
  const g = galerie(diapo.items.map((i) => rapport(imageDe(c, i.id))), contenu, Math.max(0, dispo), de.ecart)
  const total = titre.hauteur + de.titreGalerie + g.h
  const y0 = (u.h - total) / 2
  // Centré, ou aligné sur la marge quand la galerie prend toute la largeur.
  const pleine = g.cases.some((k) => k.x <= 0.5) && g.cases.some((k) => k.x + k.l >= contenu - 0.5)
  noterTitre(c, s.marges.h, y0, contenu, titre.hauteur)
  return (
    <>
      <Entete c={c} sujet={diapo.sujet} />
      <Texte boite={`${diapo.sujet}:titre`} x={s.marges.h} y={y0} a={titre} largeur={contenu} align={pleine ? 'left' : 'center'} titre marqueurs={marqueursDe(c, diapo.sujet)} />
      {Galerie({ c, diapo, x: s.marges.h, y: y0 + titre.hauteur + de.titreGalerie, g })}
    </>
  )
}

export function GabaritListeIllustree({ c, diapo }: PropsGabarit<DiapoListe>) {
  const { d, u } = c
  const de = d['liste-illustree']
  const fond = couvrir(imageDe(c, diapo.sujet), { l: u.l, h: u.h })
  const g = galerie(diapo.items.map((i) => rapport(imageDe(c, i.id))), de.zone.l, de.zone.h, de.ecart)
  return (
    <>
      {/* L'image du parent couvre la diapositive, centrée, floutée. */}
      <Image c={c} id={diapo.sujet} x={(u.l - fond.l) / 2} y={(u.h - fond.h) / 2} l={fond.l} h={fond.h} className="notak-arbre-diapo-image-floue" style={{ filter: `blur(${de.flou}px)` }} />
      <Entete c={c} sujet={diapo.sujet} />
      {Galerie({ c, diapo, x: (u.l - g.l) / 2, y: (u.h - g.h) / 2, g })}
    </>
  )
}

export function GabaritEnfantUniqueIllustre({ c, diapo }: PropsGabarit<DiapoListe>) {
  const { d, s, u } = c
  const de = d['enfant-unique-illustre']
  const item = diapo.items[0]
  if (!item) return null
  const im = imageDe(c, item.id)
  const petite = estPetite(im)
  const contenu = u.l - 2 * s.marges.h
  if (aCote(c, im, de.rapportLarge)) {
    const o = de.cote
    const largeurTitre = petite ? o.largeurTitrePetite : o.largeurTitre
    const titre = ajusterPolice(titreDe(c, diapo.sujet), o.titre, largeurTitre, c.polices.titre, c.mesurer)
    const lt = largeurDe(titre)
    const t = contenir(im, { l: Math.max(o.largeurImageMin, contenu - lt - o.ecart), h: u.h - 2 * s.marges.v })
    const x0 = (u.l - (lt + o.ecart + t.l)) / 2
    const hBloc = titre.hauteur + o.trait.ecart + o.trait.epaisseur
    const yBloc = (u.h - hBloc) / 2
    noterTitre(c, x0, yBloc, lt, titre.hauteur)
    return (
      <>
        <Entete c={c} sujet={diapo.sujet} />
        <Texte boite={`${diapo.sujet}:titre`} x={x0} y={yBloc} a={titre} largeur={lt} titre marqueurs={marqueursDe(c, diapo.sujet)} />
        <Forme boite={`${diapo.sujet}:separateur`} x={x0} y={yBloc + titre.hauteur + o.trait.ecart} l={o.trait.longueur} h={o.trait.epaisseur} etat={item.etat}>
          {c.formes.filet(forme(o.trait.longueur, o.trait.epaisseur, o.trait.epaisseur))}
        </Forme>
        <Image c={c} id={item.id} x={x0 + lt + o.ecart} y={(u.h - t.h) / 2} l={t.l} h={t.h} etat={item.etat} />
      </>
    )
  }
  const o = de.dessus
  const titre = ajusterPolice(titreDe(c, diapo.sujet), o.titre, contenu, c.polices.titre, c.mesurer)
  const t = contenir(im, { l: contenu, h: o.hauteurImage })
  const longueur = o.trait.longueur ?? largeurDe(titre)
  const total = titre.hauteur + o.trait.ecart + t.h
  const y0 = Math.max(s.marges.v, (u.h - total) / 2)
  noterTitre(c, s.marges.h, y0, largeurDe(titre), titre.hauteur)
  return (
    <>
      <Entete c={c} sujet={diapo.sujet} />
      <Texte boite={`${diapo.sujet}:titre`} x={s.marges.h} y={y0} a={titre} largeur={contenu} titre marqueurs={marqueursDe(c, diapo.sujet)} />
      <Forme boite={`${diapo.sujet}:separateur`} x={s.marges.h} y={y0 + titre.hauteur + o.trait.ecart / 2 - o.trait.epaisseur / 2} l={longueur} h={o.trait.epaisseur} etat={item.etat}>
        {c.formes.filet(forme(longueur, o.trait.epaisseur, o.trait.epaisseur))}
      </Forme>
      <Image c={c} id={item.id} x={(u.l - t.l) / 2} y={y0 + titre.hauteur + o.trait.ecart} l={t.l} h={t.h} etat={item.etat} />
    </>
  )
}
