import type { DiapoListe } from '../modele/diapositives'
import { enfantsDe } from '../modele/sujets'
import { type Ctx, Entete, Forme, type PropsGabarit, Texte, Zone, forme, marqueursDe, noterSousSujet, noterTitre, titreDe } from './commun'
import { aretes, jalons } from './geometrie'
import { aTaille, ajusterPolice, hauteurPile, largeurDe, tailleCommune } from './tailles'

/**
 * L'arête de poisson et la chronologie (relevé 11 § 9 à § 12) : le parent dans une zone à gauche, centré ; à droite,
 * jusqu'au bord, l'épine (ou l'axe) et les enfants en alternance haut / bas, qui défile horizontalement pour cadrer la
 * colonne courante. Les têtes reprennent l'épine (l'axe) du parent, bien plus grande, et listent les enfants du sujet le
 * long de son arête (de sa tige).
 */

const indiceCourant = (diapo: DiapoListe) => {
  const i = diapo.items.findIndex((x) => x.etat === 'courant')
  return i >= 0 ? i : Math.min(Math.max(0, diapo.centre), diapo.items.length - 1)
}

/** Le parent dans sa zone de gauche, centré dans la zone et sur la mi-hauteur. */
function Parent({ c, diapo, largeur, police }: { c: Ctx; diapo: DiapoListe; largeur: number; police: Parameters<typeof ajusterPolice>[1] }) {
  const a = ajusterPolice(titreDe(c, diapo.sujet), police, largeur, c.polices.titre, c.mesurer)
  noterTitre(c, c.s.marges.h, (c.u.h - a.hauteur) / 2, largeur, a.hauteur)
  return <Texte boite={`${diapo.sujet}:titre`} x={c.s.marges.h} y={(c.u.h - a.hauteur) / 2} a={a} largeur={largeur} align="center" titre marqueurs={marqueursDe(c, diapo.sujet)} />
}

export function GabaritArete({ c, diapo }: PropsGabarit<DiapoListe>) {
  const { d, s, u } = c
  const da = d.arete
  const xZone = s.marges.h + da.zoneParent + da.ecart
  const zoneL = u.l - xZone
  const yEpine = u.h / 2
  const geo = aretes(diapo.items.length, { debut: s.marges.h, intervalle: da.intervalle, decalageBas: da.decalageBas, longueur: da.longueur, angle: da.angle })
  const tc = tailleCommune(diapo.items.map((i) => titreDe(c, i.id)), da.elements, da.largeurEtiquette, c.polices.texte, c.mesurer)
  // Toutes les étiquettes se centrent dans la hauteur de la plus haute.
  const hMax = Math.max(0, ...tc.ajustes.map((a) => a.hauteur))
  const fin = Math.max(0, ...geo.map((g, i) => g.x + g.dx + largeurDe(tc.ajustes[i]!))) + s.marges.h
  const k = indiceCourant(diapo)
  const dec = fin > zoneL ? Math.min(fin - zoneL, da.intervalle * (geo[k]?.colonne ?? 0)) : 0
  const longueurEpine = Math.max(fin, zoneL + dec)
  return (
    <>
      <Entete c={c} sujet={diapo.sujet} />
      {Parent({ c, diapo, largeur: da.zoneParent, police: da.parent })}
      <Zone x={xZone} y={0} l={zoneL} h={u.h} decalage={{ x: dec, y: 0 }} estompe={fin > zoneL ? { sens: 'h', taille: s.estompe, debut: dec > 0, fin: dec < fin - zoneL } : undefined}>
        <Forme boite={`${diapo.sujet}:epine`} x={0} y={yEpine - da.epine / 2} l={longueurEpine} h={da.epine}>
          {c.formes.epine(forme(longueurEpine, da.epine, da.epine))}
        </Forme>
        {diapo.items.map((item, i) => {
          const g = geo[i]!
          const a = tc.ajustes[i]!
          const yBout = g.haut ? yEpine - g.dy : yEpine + g.dy
          const yTexte = g.haut ? yBout - hMax + (hMax - a.hauteur) / 2 : yBout + (hMax - a.hauteur) / 2
          noterSousSujet(c, xZone + g.x + g.dx - dec + largeurDe(a) / 2, yTexte + a.hauteur / 2)
          return (
            <span key={item.id}>
              <Forme boite={`${item.id}:arete`} x={g.x} y={g.haut ? yBout : yEpine} l={g.dx} h={g.dy} etat={item.etat}>
                {c.formes.arete({ ...forme(g.dx, g.dy, da.areteTrait, i), angle: g.haut ? da.angle : -da.angle })}
              </Forme>
              <Texte boite={`${item.id}:titre`} x={g.x + g.dx} y={yTexte} a={a} largeur={da.largeurEtiquette} marqueurs={marqueursDe(c, item.id)} etat={item.etat} />
            </span>
          )
        })}
      </Zone>
    </>
  )
}

/** Le sujet de la liste parmi ses frères : leur liste, son rang. */
function freres(c: Ctx, diapo: DiapoListe) {
  const p = c.l.sujets.get(diapo.sujet)?.parent
  const liste = p !== undefined ? enfantsDe(c.l, p) : [diapo.sujet]
  return { liste, rang: Math.max(0, liste.indexOf(diapo.sujet)) }
}

/**
 * La tête d'arête (relevé 11 § 10) : l'épine du parent, l'arête du sujet à 80 vmin et 20°, celle de son voisin de paire,
 * les titres des frères en 10 vmin ; le long de l'arête du sujet, ses enfants, chacun précédé d'un petit trait.
 */
export function GabaritTeteArete({ c, diapo }: PropsGabarit<DiapoListe>) {
  const { d, s, u } = c
  const dt = d['tete-arete']
  const { liste, rang } = freres(c, diapo)
  const haut = rang % 2 === 0
  const a = (dt.angle * Math.PI) / 180
  const dx = dt.longueur * Math.sin(a)
  const dy = dt.longueur * Math.cos(a)
  // La scène est translatée pour cadrer l'arête du sujet : l'épine près du bord opposé à l'arête.
  const yEpine = haut ? u.h - s.marges.v / 2 : s.marges.v / 2
  const xSujet = s.marges.h
  const xFrere = (j: number) => xSujet + (Math.floor(j / 2) - Math.floor(rang / 2)) * dt.intervalle + ((j % 2) - (rang % 2)) * dt.decalageTete
  // Les frères montrés : la paire du sujet et la suivante.
  const debut = rang - (rang % 2)
  const montres = liste.slice(debut, debut + dt.soeurs.nombre).map((id, n) => ({ id, j: debut + n }))
  const xBout = xSujet + dx
  const bout = haut ? yEpine - dy : yEpine + dy
  // Les enfants du sujet, le long de son arête : à l'abscisse de l'arête à leur hauteur, après un petit trait.
  const largeurItems = u.l - s.marges.h - xBout - dt.trait.longueur - c.u.vmin(1)
  const tc = tailleCommune(diapo.items.map((i) => titreDe(c, i.id)), dt.elements, Math.max(0, largeurItems), c.polices.texte, c.mesurer)
  const court = tc.ajustes.length <= 3 && tc.ajustes.every((x) => x.lignes.length <= 1)
  const ecart = court ? dt.ecart.court : dt.ecart.long
  const hauteurs = tc.ajustes.map((x) => x.hauteur)
  const hListe = hauteurPile(hauteurs, ecart)
  const titreSujet = aTaille(titreDe(c, diapo.sujet, false), dt.soeurs.police, u.l - xBout - s.marges.h, c.polices.titre, c.mesurer, dt.soeurs.lignes)
  // Au-dessus de l'épine, la liste part du haut (sous le titre) ; au-dessous, elle finit au-dessus du titre.
  const yTitre = haut ? bout - titreSujet.hauteur : bout
  const y0 = haut ? bout + dt.margeTitre : bout - dt.margeTitre - hListe
  const xArete = (y: number) => xSujet + (dx * Math.abs(yEpine - y)) / dy
  noterTitre(c, xBout, yTitre, largeurDe(titreSujet), titreSujet.hauteur)
  let y = y0
  return (
    <>
      <Entete c={c} sujet={diapo.sujet} />
      <Forme boite={`${c.l.sujets.get(diapo.sujet)?.parent ?? diapo.sujet}:epine`} x={0} y={yEpine - d.arete.epine / 2} l={u.l} h={d.arete.epine}>
        {c.formes.epine(forme(u.l, d.arete.epine, d.arete.epine))}
      </Forme>
      {montres.map(({ id, j }) => {
        const x = xFrere(j)
        const enHaut = j % 2 === 0
        if (x > u.l || x + dx < 0) return null
        const yB = enHaut ? yEpine - dy : yEpine + dy
        const t = id === diapo.sujet ? titreSujet : aTaille(titreDe(c, id, false), dt.soeurs.police, Math.max(0, u.l - x - dx), c.polices.titre, c.mesurer, dt.soeurs.lignes)
        return (
          <span key={id}>
            <Forme boite={`${id}:arete`} x={x} y={enHaut ? yB : yEpine} l={dx} h={dy}>
              {c.formes.arete({ ...forme(dx, dy, d.arete.areteTrait, j), angle: enHaut ? dt.angle : -dt.angle })}
            </Forme>
            <Texte boite={`${id}:titre`} x={x + dx} y={enHaut ? yB - t.hauteur : yB} a={t} titre />
          </span>
        )
      })}
      {diapo.items.map((item, i) => {
        const ici = y
        y += hauteurs[i]! + ecart
        const a1 = tc.ajustes[i]!
        const milieu = ici + (a1.taille * a1.interligne) / 2
        const x = xArete(milieu)
        noterSousSujet(c, x + dt.trait.longueur + largeurDe(a1) / 2, ici + a1.hauteur / 2)
        return (
          <span key={item.id}>
            <Forme boite={`${item.id}:trait`} x={x} y={milieu - dt.trait.epaisseur / 2} l={dt.trait.longueur} h={dt.trait.epaisseur} etat={item.etat}>
              {c.formes.filet(forme(dt.trait.longueur, dt.trait.epaisseur, dt.trait.epaisseur))}
            </Forme>
            <Texte boite={`${item.id}:titre`} x={x + dt.trait.longueur + c.u.vmin(1)} y={ici} a={a1} largeur={largeurItems} marqueurs={marqueursDe(c, item.id)} etat={item.etat} />
          </span>
        )
      })}
    </>
  )
}

// — La chronologie (§ 11) —

export function GabaritChronologie({ c, diapo }: PropsGabarit<DiapoListe>) {
  const { d, s, u } = c
  const dc = d.chronologie
  const xZone = s.marges.h + dc.zoneParent + d.arete.ecart
  const zoneL = u.l - xZone
  const yAxe = u.h / 2
  const C = dc.colonne.c
  const geo = jalons(diapo.items.length, { debut: s.marges.h, c: C, o: dc.colonne.o, s: dc.colonne.s })
  const tc = tailleCommune(diapo.items.map((i) => titreDe(c, i.id)), dc.elements, C, c.polices.texte, c.mesurer)
  const hMax = Math.max(0, ...tc.ajustes.map((a) => a.hauteur))
  const fin = Math.max(0, ...geo.map((g) => g.x + C / 2)) + s.marges.h
  const k = indiceCourant(diapo)
  // Par pas de C + O : la paire courante centrée.
  const col = geo[k]?.colonne ?? 0
  const paire = geo.filter((g) => g.colonne === col)
  const centre = paire.reduce((sx, g) => sx + g.x, 0) / Math.max(1, paire.length)
  const dec = fin > zoneL ? Math.min(fin - zoneL, Math.max(0, centre - zoneL / 2)) : 0
  const longueurAxe = Math.max(fin, zoneL + dec)
  const tige = dc.tige
  return (
    <>
      <Entete c={c} sujet={diapo.sujet} />
      {Parent({ c, diapo, largeur: dc.zoneParent, police: dc.parent })}
      <Zone x={xZone} y={0} l={zoneL} h={u.h} decalage={{ x: dec, y: 0 }} estompe={fin > zoneL ? { sens: 'h', taille: s.estompe, debut: dec > 0, fin: dec < fin - zoneL } : undefined}>
        <Forme boite={`${diapo.sujet}:axe`} x={0} y={yAxe - dc.axe / 2} l={longueurAxe} h={dc.axe}>
          {c.formes.axe(forme(longueurAxe, dc.axe, dc.axe))}
        </Forme>
        {diapo.items.map((item, i) => {
          const g = geo[i]!
          const a = tc.ajustes[i]!
          const bout = g.haut ? yAxe - tige.longueur - dc.margeEtiquette : yAxe + tige.longueur + dc.margeEtiquette
          const yTexte = g.haut ? bout - hMax + (hMax - a.hauteur) / 2 : bout + (hMax - a.hauteur) / 2
          noterSousSujet(c, xZone + g.x - dec, yTexte + a.hauteur / 2)
          return (
            <span key={item.id}>
              <Forme boite={`${item.id}:tige`} x={g.x - tige.trait / 2} y={g.haut ? yAxe - tige.longueur : yAxe} l={tige.trait} h={tige.longueur} etat={item.etat}>
                {c.formes.filet(forme(tige.trait, tige.longueur, tige.trait))}
              </Forme>
              <Forme boite={`${item.id}:point`} x={g.x - dc.point} y={yAxe - dc.point} l={2 * dc.point} h={2 * dc.point} etat={item.etat}>
                {c.formes.point(forme(2 * dc.point, 2 * dc.point, 0, i))}
              </Forme>
              <Texte boite={`${item.id}:titre`} x={g.x - C / 2} y={yTexte} a={a} largeur={C} align="center" marqueurs={marqueursDe(c, item.id)} etat={item.etat} />
            </span>
          )
        })}
      </Zone>
    </>
  )
}

/**
 * La tête de chronologie (relevé 11 § 12) : l'axe du parent et quatre points frères, titres en 10 vmin ; du point du
 * sujet, la tige s'allonge à 80 vmin et porte ses enfants, chacun précédé d'un petit trait horizontal.
 */
export function GabaritTeteChronologie({ c, diapo }: PropsGabarit<DiapoListe>) {
  const { d, s, u } = c
  const dt = d['tete-chronologie']
  const { liste, rang } = freres(c, diapo)
  const haut = rang % 2 === 0
  const yAxe = haut ? u.h - s.marges.v / 2 : s.marges.v / 2
  const xSujet = s.marges.h + u.vmin(4)
  // Les frères se suivent d'une colonne de la chronologie du parent, agrandie à la taille de la tête.
  const pas = (d.chronologie.colonne.c + d.chronologie.colonne.o) * (dt.tige / d.chronologie.tige.longueur) * 0.5
  const debut = rang - (rang % 2)
  const montres = liste.slice(debut, debut + dt.soeurs.nombre).map((id, n) => ({ id, j: debut + n }))
  const longueur = Math.min(dt.tige, haut ? yAxe - s.marges.v / 2 : u.h - s.marges.v / 2 - yAxe)
  const bout = haut ? yAxe - longueur : yAxe + longueur
  const trait = d['tete-arete'].trait
  const xTexte = xSujet + trait.longueur + u.vmin(1)
  const largeur = u.l - s.marges.h - xTexte
  const titre = aTaille(titreDe(c, diapo.sujet, false), dt.soeurs.police, largeur, c.polices.titre, c.mesurer, dt.soeurs.lignes)
  const tc = tailleCommune(diapo.items.map((i) => titreDe(c, i.id)), dt.elements, Math.max(0, largeur), c.polices.texte, c.mesurer)
  const court = tc.ajustes.length <= 3 && tc.ajustes.every((x) => x.lignes.length <= 1)
  const ecart = court ? dt.ecart.court : dt.ecart.long
  const hauteurs = tc.ajustes.map((x) => x.hauteur)
  const hListe = hauteurPile(hauteurs, ecart)
  const yTitre = haut ? bout : bout - titre.hauteur
  const y0 = haut ? bout + Math.max(dt.margeTitre, titre.hauteur + u.vmin(2)) : bout - Math.max(dt.margeTitre, titre.hauteur + u.vmin(2)) - hListe
  const tige = d.chronologie.tige.trait
  noterTitre(c, xTexte, yTitre, largeurDe(titre), titre.hauteur)
  let y = y0
  return (
    <>
      <Entete c={c} sujet={diapo.sujet} />
      <Forme boite={`${c.l.sujets.get(diapo.sujet)?.parent ?? diapo.sujet}:axe`} x={0} y={yAxe - d.chronologie.axe / 2} l={u.l} h={d.chronologie.axe}>
        {c.formes.axe(forme(u.l, d.chronologie.axe, d.chronologie.axe))}
      </Forme>
      <Forme boite={`${diapo.sujet}:tige`} x={xSujet - tige / 2} y={Math.min(yAxe, bout)} l={tige} h={longueur}>
        {c.formes.filet(forme(tige, longueur, tige))}
      </Forme>
      {montres.map(({ id, j }) => {
        const x = xSujet + (j - rang) * pas
        if (x < -dt.point || x > u.l + dt.point) return null
        const enHaut = j % 2 === 0
        const t = id === diapo.sujet ? null : aTaille(titreDe(c, id, false), dt.soeurs.police, Math.max(0, u.l - x), c.polices.titre, c.mesurer, dt.soeurs.lignes)
        return (
          <span key={id}>
            <Forme boite={`${id}:point`} x={x - dt.point} y={yAxe - dt.point} l={2 * dt.point} h={2 * dt.point}>
              {c.formes.point(forme(2 * dt.point, 2 * dt.point, 0, j))}
            </Forme>
            {t && <Texte boite={`${id}:titre`} x={x + u.vmin(2)} y={enHaut ? yAxe - u.vmin(2) - t.hauteur : yAxe + u.vmin(2)} a={t} titre />}
          </span>
        )
      })}
      <Texte boite={`${diapo.sujet}:titre`} x={xTexte} y={yTitre} a={titre} titre />
      {diapo.items.map((item, i) => {
        const ici = y
        y += hauteurs[i]! + ecart
        const a = tc.ajustes[i]!
        const milieu = ici + (a.taille * a.interligne) / 2
        noterSousSujet(c, xTexte + largeurDe(a) / 2, ici + a.hauteur / 2)
        return (
          <span key={item.id}>
            <Forme boite={`${item.id}:trait`} x={xSujet} y={milieu - trait.epaisseur / 2} l={trait.longueur} h={trait.epaisseur} etat={item.etat}>
              {c.formes.filet(forme(trait.longueur, trait.epaisseur, trait.epaisseur))}
            </Forme>
            <Texte boite={`${item.id}:titre`} x={xTexte} y={ici} a={a} largeur={largeur} marqueurs={marqueursDe(c, item.id)} etat={item.etat} />
          </span>
        )
      })}
    </>
  )
}
