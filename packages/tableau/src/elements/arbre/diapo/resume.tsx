import type { DiapoResume } from '../modele/diapositives'
import { Entete, Forme, type PropsGabarit, Texte, Zone, forme, noterTitre, titreDe } from './commun'
import { aTaille, ajusterPolice, hauteurPile, largeurDe } from './tailles'

/**
 * La diapositive d'un résumé (relevé 11 § 8). En paysage : les sujets résumés à gauche, alignés à droite (le premier et le
 * dernier s'ils sont plus de deux, séparés de « ... »), un crochet (un trait s'il n'y en a qu'un), le résumé à droite.
 * En portrait : une colonne, les deux derniers résumés, un trait barré, le résumé.
 */

export function GabaritResume({ c, diapo }: PropsGabarit<DiapoResume>) {
  const { d, s, u } = c
  const dr = d.resume
  const contenu = u.l - 2 * s.marges.h
  const trait = diapo.forme === 'trait'
  const f = dr.forme
  const zoneForme = f.margeGauche + f.largeur * (trait ? 2 : 1) + (trait ? f.margeDroiteTrait : f.margeDroite)
  const colonne = contenu - zoneForme - dr.zoneResume
  // Plus de deux : le premier et le dernier, et « ... » entre eux.
  const montres = diapo.plage.length > 2 ? [diapo.plage[0]!, null, diapo.plage.at(-1)!] : diapo.plage
  const textes = montres.map((id) => aTaille(id === null ? '...' : titreDe(c, id), dr.plage.police, colonne, c.polices.texte, c.mesurer, dr.plage.lignes))
  const hauteurs = textes.map((a) => a.hauteur)
  const dispo = u.h - 2 * s.marges.v
  const texteH = hauteurs.reduce((a, b) => a + b, 0)
  const ecart = montres.length > 2 ? dr.plage.ecart : Math.max(0, (dispo - texteH) / 3)
  const hColonne = hauteurPile(hauteurs, ecart)
  const titre = ajusterPolice(titreDe(c, diapo.sujet), dr.titre, dr.zoneResume, c.polices.titre, c.mesurer)
  const large = Math.max(0, ...textes.map(largeurDe))
  // Le trio centré, sans que la forme passe à gauche du milieu.
  const centre = s.marges.h + (contenu - (large + zoneForme + dr.zoneResume)) / 2
  const xForme = Math.max(centre + large, u.l / 2)
  let y = (u.h - hColonne) / 2
  const ys = hauteurs.map((h) => {
    const ici = y
    y += h + ecart
    return ici
  })
  const milieu = (i: number) => ys[i]! + hauteurs[i]! / 2
  const yA = milieu(0)
  const yB = milieu(textes.length - 1)
  const lForme = f.largeur * (trait ? 2 : 1)
  const hForme = Math.max(0, yB - yA)
  noterTitre(c, xForme + zoneForme, (u.h - titre.hauteur) / 2, dr.zoneResume, titre.hauteur)
  return (
    <>
      <Entete c={c} sujet={diapo.sujet} />
      {montres.map((id, i) => (
        <Texte key={id ?? 'ellipse'} boite={id === null ? `${diapo.sujet}:ellipse` : `${id}:titre`} x={xForme - large} y={ys[i]!} a={textes[i]!} largeur={large} align="right" />
      ))}
      {trait ? (
        <Forme boite={`${diapo.sujet}:forme`} x={xForme + f.margeGauche} y={yA - f.trait / 2} l={lForme} h={f.trait}>
          {c.formes.filet(forme(lForme, f.trait, f.trait))}
        </Forme>
      ) : (
        <Forme boite={`${diapo.sujet}:forme`} x={xForme + f.margeGauche} y={yA} l={lForme} h={hForme}>
          {c.formes.accoladeResume({ ...forme(lForme, hForme, f.trait), bec: hForme / 2 })}
        </Forme>
      )}
      <Texte boite={`${diapo.sujet}:titre`} x={xForme + zoneForme} y={(u.h - titre.hauteur) / 2} a={titre} largeur={dr.zoneResume} align="center" titre />
    </>
  )
}

export function GabaritResumeDefilant({ c, diapo }: PropsGabarit<DiapoResume>) {
  const { d, s, u } = c
  const dr = d['resume-defilant']
  const contenu = u.l - 2 * s.marges.h
  const textes = diapo.plage.map((id) => aTaille(titreDe(c, id), dr.plage.police, contenu, c.polices.texte, c.mesurer, dr.plage.lignes))
  const hauteurs = textes.map((a) => a.hauteur)
  const hListe = hauteurPile(hauteurs, dr.plage.ecart)
  // Les deux derniers se voient ; le reste est au-dessus, dans la zone qui défile.
  const zoneH = hauteurPile(hauteurs.slice(-dr.plage.visibles), dr.plage.ecart)
  const barre = dr.trait.barre
  const reste = u.h - 2 * s.marges.v - zoneH - 2 * dr.trait.ecart - barre
  const titre = ajusterPolice(titreDe(c, diapo.sujet), dr.titre, contenu, c.polices.titre, c.mesurer, { hauteur: Math.max(0, reste) })
  const total = zoneH + dr.trait.ecart + barre + dr.trait.ecart + titre.hauteur
  const y0 = Math.max(s.marges.v, (u.h - total) / 2)
  const yTrait = y0 + zoneH + dr.trait.ecart
  let y = 0
  const ys = hauteurs.map((h) => {
    const ici = y
    y += h + dr.plage.ecart
    return ici
  })
  const dec = Math.max(0, hListe - zoneH)
  return (
    <>
      <Entete c={c} sujet={diapo.sujet} />
      <Zone x={s.marges.h} y={y0} l={contenu} h={zoneH} decalage={{ x: 0, y: dec }} estompe={dec > 0 ? { sens: 'v', taille: dr.estompe, debut: true, fin: false } : undefined}>
        {diapo.plage.map((id, i) => (
          <Texte key={id} boite={`${id}:titre`} x={0} y={ys[i]!} a={textes[i]!} largeur={contenu} />
        ))}
      </Zone>
      <Forme boite={`${diapo.sujet}:forme`} x={s.marges.h} y={yTrait} l={contenu} h={barre}>
        {c.formes.filet(forme(contenu, 4, 4))}
        {/* La petite barre, au milieu, qui descend du trait. */}
        <g transform={`translate(${contenu / 2 - 2} 0)`}>{c.formes.filet(forme(4, barre, 4))}</g>
      </Forme>
      <Texte boite={`${diapo.sujet}:titre`} x={s.marges.h} y={yTrait + barre + dr.trait.ecart} a={titre} largeur={contenu} titre />
    </>
  )
}
