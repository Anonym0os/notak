import type { DiapoListe, ItemListe } from '../modele/diapositives'
import { type Ajuste, ajuster, interligne } from '../modele/dimensions'
import { COULEUR, type Ctx, Entete, Forme, type PropsGabarit, Texte, Zone, attrEtat, forme, marqueursDe, noterSousSujet, noterTitre, titreDe } from './commun'
import { flecheParDefaut } from './formes'
import { defilement, departTrio, ecartAccolade } from './geometrie'
import { interlettrage, largeurTexte } from './mesure'
import { ajusterPolice, hauteurPile, largeurDe, tailleCommune } from './tailles'

/**
 * Les listes sans image (relevé 11 § 3 à § 7) : l'accolade, les puces, les paroles, l'arbre portrait, l'enfant unique.
 * Chaque étape est une diapositive : les éléments à venir sont cachés (0, 0,3 dans la vue du présentateur), la liste
 * défile pour garder l'élément courant en vue. Le titre d'un enfant porte la même boîte qu'au centre de sa diapositive.
 */

/** Les positions verticales d'une pile de hauteurs séparées d'un écart. */
function pile(hauteurs: readonly number[], ecart: number): number[] {
  let y = 0
  return hauteurs.map((h) => {
    const ici = y
    y += h + ecart
    return ici
  })
}

/** L'élément sur lequel la liste se règle : le courant, sinon celui que la séquence désigne. */
const indiceCourant = (items: readonly ItemListe[], centre: number) => {
  const i = items.findIndex((x) => x.etat === 'courant')
  return i >= 0 ? i : Math.min(Math.max(0, centre), items.length - 1)
}

/** La hauteur d'une première ligne, pour y centrer une puce, un bec, une branche. */
const premiereLigne = (a: Ajuste) => a.taille * a.interligne

function ItemTexte({ c, item, x, y, a, largeur }: { c: Ctx; item: ItemListe; x: number; y: number; a: Ajuste; largeur: number }) {
  return <Texte boite={`${item.id}:titre`} x={x} y={y} a={a} largeur={largeur} marqueurs={marqueursDe(c, item.id)} etat={item.etat} />
}

// — Accolade (§ 3) —

export function GabaritAccolade({ c, diapo }: PropsGabarit<DiapoListe>) {
  const { d, s, u } = c
  const da = d.accolade
  const contenu = u.l - 2 * s.marges.h
  const zoneH = u.h - 2 * s.marges.v
  const largeurListe = contenu - da.zoneParent - da.zoneAccolade - da.margeDroiteListe
  const parent = ajusterPolice(titreDe(c, diapo.sujet), da.parent, da.zoneParent, c.polices.titre, c.mesurer)
  // La place prévue pour cinq lignes simples donne l'écart minimal.
  const ecartMin = (zoneH - da.lignesPrevues * da.elements.max * interligne(da.elements.max)) / (da.lignesPrevues - 1)
  const tc = tailleCommune(
    diapo.items.map((i) => titreDe(c, i.id)),
    da.elements,
    largeurListe,
    c.polices.texte,
    c.mesurer,
    (as) => hauteurPile(as.map((a) => a.hauteur), ecartMin),
    zoneH,
  )
  const hauteurs = tc.ajustes.map((a) => a.hauteur)
  const ecart = ecartAccolade(hauteurs, zoneH, ecartMin)
  const ys = pile(hauteurs, ecart)
  const hListe = hauteurPile(hauteurs, ecart)
  const large = Math.max(0, ...tc.ajustes.map(largeurDe))
  const x0 = departTrio({ marge: s.marges.h, contenu, largeurDiapo: u.l, parent: da.zoneParent, accolade: da.zoneAccolade, liste: large })
  const xListe = x0 + da.zoneParent + da.zoneAccolade
  const k = indiceCourant(diapo.items, diapo.centre)
  const debord = hListe > zoneH
  const haut = debord ? 0 : (zoneH - hListe) / 2
  const dec = defilement(hListe, zoneH, ys[k]! + hauteurs[k]! / 2)
  // L'accolade va du milieu de la première ligne du premier élément à celui du dernier, dans la zone visible.
  const yA = Math.max(s.marges.v, s.marges.v + haut + ys[0]! + premiereLigne(tc.ajustes[0]!) / 2 - dec)
  const dernier = tc.ajustes.length - 1
  const yB = Math.min(s.marges.v + zoneH, s.marges.v + haut + ys[dernier]! + premiereLigne(tc.ajustes[dernier]!) / 2 - dec)
  const hA = Math.max(0, yB - yA)
  noterTitre(c, x0, (u.h - parent.hauteur) / 2, da.zoneParent, parent.hauteur)
  ys.forEach((y, i) => noterSousSujet(c, xListe + largeurDe(tc.ajustes[i]!) / 2, s.marges.v + haut + y - dec + hauteurs[i]! / 2))
  return (
    <>
      <Entete c={c} sujet={diapo.sujet} />
      <Texte boite={`${diapo.sujet}:titre`} x={x0} y={(u.h - parent.hauteur) / 2} a={parent} largeur={da.zoneParent} align="center" titre marqueurs={marqueursDe(c, diapo.sujet)} />
      <Forme boite={`${diapo.sujet}:accolade`} x={x0 + da.zoneParent} y={yA} l={da.zoneAccolade} h={hA}>
        {c.formes.accolade({ ...forme(da.zoneAccolade, hA, da.trait), bec: hA / 2 })}
      </Forme>
      <Zone x={xListe} y={s.marges.v} l={largeurListe} h={zoneH} decalage={{ x: 0, y: dec }} estompe={debord ? { sens: 'v', taille: s.estompe, debut: dec > 0, fin: dec < hListe - zoneH } : undefined}>
        {diapo.items.map((item, i) => (
          <ItemTexte key={item.id} c={c} item={item} x={0} y={haut + ys[i]!} a={tc.ajustes[i]!} largeur={largeurListe} />
        ))}
      </Zone>
    </>
  )
}

// — Puces et paroles : le titre en haut à gauche, sur une ligne (§ 4, § 5) —

function titreDeListe(c: Ctx, diapo: DiapoListe, p: Parameters<typeof ajusterPolice>[1]) {
  const contenu = c.u.l - 2 * c.s.marges.h
  // Une seule ligne : la plus grande taille qui tient, sinon la taille maxi tronquée.
  const a = ajuster({ texte: titreDe(c, diapo.sujet), police: c.polices.titre, largeur: contenu, paliers: [{ max: p.max, min: p.min, lignes: 1 }], repli: { taille: p.max, lignesMax: 1 }, derniereLigne: false, mesurer: c.mesurer })
  noterTitre(c, c.s.marges.h, c.s.marges.v, largeurDe(a), a.hauteur)
  return { a, noeud: <Texte boite={`${diapo.sujet}:titre`} x={c.s.marges.h} y={c.s.marges.v} a={a} largeur={contenu} titre marqueurs={marqueursDe(c, diapo.sujet)} /> }
}

export function GabaritPuces({ c, diapo }: PropsGabarit<DiapoListe>) {
  const { d, s, u } = c
  const dp = d.puces
  const contenu = u.l - 2 * s.marges.h
  const titre = titreDeListe(c, diapo, dp.titre)
  const y0 = s.marges.v + titre.a.hauteur + dp.titreListe + dp.margeHaute
  const zoneH = Math.max(0, u.h - s.marges.v - y0)
  const retrait = dp.puce * dp.elements.max + dp.margePuce
  const tc = tailleCommune(
    diapo.items.map((i) => titreDe(c, i.id)),
    dp.elements,
    contenu - retrait,
    c.polices.texte,
    c.mesurer,
    (as) => hauteurPile(as.map((a) => a.hauteur), dp.ecart),
    zoneH,
  )
  const hauteurs = tc.ajustes.map((a) => a.hauteur)
  const ys = pile(hauteurs, dp.ecart)
  const hListe = hauteurPile(hauteurs, dp.ecart)
  const k = indiceCourant(diapo.items, diapo.centre)
  const dec = defilement(hListe, zoneH, ys[k]! + hauteurs[k]! / 2)
  const diametre = dp.puce * tc.taille
  const xTexte = diametre + dp.margePuce
  ys.forEach((y, i) => noterSousSujet(c, s.marges.h + xTexte + largeurDe(tc.ajustes[i]!) / 2, y0 + y - dec + hauteurs[i]! / 2))
  return (
    <>
      <Entete c={c} sujet={diapo.sujet} />
      {titre.noeud}
      <Zone x={s.marges.h} y={y0} l={contenu} h={zoneH} decalage={{ x: 0, y: dec }} estompe={hListe > zoneH ? { sens: 'v', taille: s.estompe, debut: dec > 0, fin: dec < hListe - zoneH } : undefined}>
        {diapo.items.map((item, i) => {
          const a = tc.ajustes[i]!
          // La puce se centre sur la première ligne.
          const yPuce = ys[i]! + (premiereLigne(a) - diametre) / 2
          return (
            <span key={item.id}>
              <Forme boite={`${item.id}:puce`} x={0} y={yPuce} l={diametre} h={diametre} etat={item.etat}>
                {c.formes.puce({ ...forme(diametre, diametre, 0), niveau: 0 })}
              </Forme>
              <ItemTexte c={c} item={item} x={xTexte} y={ys[i]!} a={a} largeur={contenu - xTexte} />
            </span>
          )
        })}
      </Zone>
    </>
  )
}

/**
 * Les paroles : l'élément courant en gras, les autres en graisse normale ; pour que rien ne saute, chacun porte ses deux
 * versions superposées, la normale élargie par l'interlettrage jusqu'à la largeur de la grasse.
 */
export function GabaritParoles({ c, diapo }: PropsGabarit<DiapoListe>) {
  const { d, s, u } = c
  const dp = d.paroles
  const titre = titreDeListe(c, diapo, dp.titre)
  const yZone = s.marges.v + titre.a.hauteur + dp.titreListe
  const zoneH = Math.max(0, u.h - yZone)
  const largeur = u.l - dp.margeGauche - s.marges.h
  // La coupe est celle du gras : c'est la plus large.
  // Sans marqueurs : les deux versions superposées ne portent que le texte.
  const tc = tailleCommune(diapo.items.map((i) => titreDe(c, i.id, false)), dp.elements, largeur, c.polices.gras, c.mesurer)
  const hauteurs = tc.ajustes.map((a) => a.hauteur)
  const ys = pile(hauteurs, dp.ecart)
  const k = indiceCourant(diapo.items, diapo.centre)
  // L'élément courant amène le milieu de sa première ligne sur la mi-hauteur, devant la flèche.
  const dec = yZone + ys[k]! + premiereLigne(tc.ajustes[k]!) / 2 - u.h / 2
  const f = dp.fleche
  ys.forEach((y, i) => noterSousSujet(c, dp.margeGauche + largeurDe(tc.ajustes[i]!) / 2, yZone + y - dec + hauteurs[i]! / 2))
  return (
    <>
      <Entete c={c} sujet={diapo.sujet} />
      {titre.noeud}
      <Forme boite={`${diapo.sujet}:fleche`} x={0} y={(u.h - f.h) / 2} l={f.l} h={f.h}>
        {flecheParDefaut(forme(f.l, f.h, 0))}
      </Forme>
      <Zone x={dp.margeGauche} y={yZone} l={largeur} h={zoneH} decalage={{ x: 0, y: dec }} estompe={{ sens: 'v', taille: s.estompe, debut: dec > 0, fin: false }}>
        {diapo.items.map((item, i) => {
          const a = tc.ajustes[i]!
          const gras = i === k
          // L'interlettrage de la version normale : sa plus longue ligne rejoint celle du gras.
          const espacement = Math.max(
            0,
            ...a.lignes.map((li) => interlettrage(largeurTexte(li.texte, a.taille, c.polices.texte), li.largeur, [...li.texte].length, a.taille, dp.interlettrage.pas, dp.interlettrage.max)),
          )
          return (
            <div key={item.id} className="notak-arbre-diapo-texte notak-arbre-diapo-parole" data-boite={`${item.id}:titre`} data-courant={gras ? '' : undefined} {...attrEtat(item.etat)} style={{ left: 0, top: ys[i]!, width: largeur, fontSize: a.taille, lineHeight: a.interligne }}>
              <span className="notak-arbre-diapo-parole-gras" aria-hidden={!gras}>
                {a.lignes.map((li, j) => (
                  <span key={j}>{li.texte}</span>
                ))}
              </span>
              <span className="notak-arbre-diapo-parole-normale" aria-hidden={gras} style={{ letterSpacing: `${espacement}em` }}>
                {a.lignes.map((li, j) => (
                  <span key={j}>{li.texte}</span>
                ))}
              </span>
            </div>
          )
        })}
      </Zone>
    </>
  )
}

// — L'arbre portrait (§ 6) —

export function GabaritArbre({ c, diapo }: PropsGabarit<DiapoListe>) {
  const { d, s, u } = c
  const da = d.arbre
  const contenu = u.l - 2 * s.marges.h
  const titre = ajusterPolice(titreDe(c, diapo.sujet), da.titre, contenu, c.polices.titre, c.mesurer)
  const y0 = s.marges.v + titre.hauteur + da.titreListe + da.margeHaute
  const zoneH = Math.max(0, u.h - s.marges.v - y0)
  const b = da.branche
  const xTexte = b.margeGauche + b.largeur + b.margeDroite
  const tc = tailleCommune(diapo.items.map((i) => titreDe(c, i.id)), da.elements, contenu - xTexte, c.polices.texte, c.mesurer)
  const hauteurs = tc.ajustes.map((a) => a.hauteur)
  const ys = pile(hauteurs, da.ecart)
  const hListe = hauteurPile(hauteurs, da.ecart)
  const k = indiceCourant(diapo.items, diapo.centre)
  // On garde l'élément courant en bas de la zone.
  const dec = hListe <= zoneH ? 0 : Math.min(hListe - zoneH, Math.max(0, ys[k]! + hauteurs[k]! - zoneH))
  const milieu = (i: number) => ys[i]! + premiereLigne(tc.ajustes[i]!) / 2
  const t = b.trait
  noterTitre(c, s.marges.h, s.marges.v, largeurDe(titre), titre.hauteur)
  ys.forEach((y, i) => noterSousSujet(c, s.marges.h + xTexte + largeurDe(tc.ajustes[i]!) / 2, y0 + y - dec + hauteurs[i]! / 2))
  return (
    <>
      <Entete c={c} sujet={diapo.sujet} />
      <Texte boite={`${diapo.sujet}:titre`} x={s.marges.h} y={s.marges.v} a={titre} largeur={contenu} titre marqueurs={marqueursDe(c, diapo.sujet)} />
      <Zone x={s.marges.h} y={y0} l={contenu} h={zoneH} decalage={{ x: 0, y: dec }} estompe={hListe > zoneH ? { sens: 'v', taille: s.estompe, debut: dec > 0, fin: dec < hListe - zoneH } : undefined}>
        {diapo.items.map((item, i) => {
          // Un coude : du milieu de la ligne précédente (le haut de la liste pour la première), jusqu'au texte.
          const de = i === 0 ? 0 : milieu(i - 1)
          const a = milieu(i)
          const l = b.largeur + 2 * t
          const h = a - de + 2 * t
          const points: [number, number][] = [
            [t, t],
            [t, a - de + t],
            [t + b.largeur, a - de + t],
          ]
          return (
            <span key={item.id}>
              <Forme boite={`${item.id}:branche`} x={b.margeGauche - t} y={de - t} l={l} h={h} etat={item.etat}>
                {c.formes.branche({ ...forme(l, h, t), points })}
              </Forme>
              {i === 0 && (
                // Le capuchon plein de la première branche.
                <Forme boite={`${diapo.sujet}:capuchon`} x={b.margeGauche - t} y={-t} l={2 * t} h={2 * t} etat={item.etat}>
                  {c.formes.point(forme(2 * t, 2 * t, 0))}
                </Forme>
              )}
              <ItemTexte c={c} item={item} x={xTexte} y={ys[i]!} a={tc.ajustes[i]!} largeur={contenu - xTexte} />
            </span>
          )
        })}
      </Zone>
    </>
  )
}

// — Un seul enfant (§ 7) —

export function GabaritEnfantUnique({ c, diapo }: PropsGabarit<DiapoListe>) {
  const { d, s, u } = c
  const de = d['enfant-unique']
  const contenu = u.l - 2 * s.marges.h
  const item = diapo.items[0]
  const parent = ajusterPolice(titreDe(c, diapo.sujet), de.parent, contenu, c.polices.titre, c.mesurer)
  const sep = de.separateur
  const dispo = u.h - 2 * s.marges.v - parent.hauteur - 2 * sep.ecart - sep.trait
  const enfant = item
    ? ajuster({ texte: titreDe(c, item.id), police: c.polices.texte, largeur: contenu, paliers: [{ max: de.enfant.max, min: de.enfant.min, hauteur: dispo }], repli: { taille: de.repli.taille, lignesMax: de.repli.lignesMax }, mesurer: c.mesurer })
    : null
  const longueur = Math.min(contenu, Math.max(largeurDe(parent), enfant ? largeurDe(enfant) : 0))
  const total = parent.hauteur + 2 * sep.ecart + sep.trait + (enfant?.hauteur ?? 0)
  const y0 = total <= u.h ? (u.h - total) / 2 : s.marges.v
  const ySep = y0 + parent.hauteur + sep.ecart
  noterTitre(c, s.marges.h, y0, largeurDe(parent), parent.hauteur)
  if (enfant) noterSousSujet(c, s.marges.h + largeurDe(enfant) / 2, ySep + sep.trait + sep.ecart + enfant.hauteur / 2)
  return (
    <>
      <Entete c={c} sujet={diapo.sujet} />
      <Texte boite={`${diapo.sujet}:titre`} x={s.marges.h} y={y0} a={parent} largeur={contenu} titre marqueurs={marqueursDe(c, diapo.sujet)} />
      <Forme boite={`${diapo.sujet}:separateur`} x={s.marges.h} y={ySep} l={longueur} h={sep.trait} etat={item?.etat}>
        {c.formes.filet({ ...forme(longueur, sep.trait, sep.trait), couleur: COULEUR })}
      </Forme>
      {item && enfant && <ItemTexte c={c} item={item} x={s.marges.h} y={ySep + sep.trait + sep.ecart} a={enfant} largeur={contenu} />}
    </>
  )
}
