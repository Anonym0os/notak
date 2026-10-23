import { COULEURS_NOTE, type CouleurNote, type Ligne, type Pointe } from '../../coeur/tableau'
import { FOND_NOTE, LIBELLES_COULEUR, teinteDe } from '../note/couleurs'
import type { PropsOutils } from '../types'
import { GRIS_LIGNE } from './couleur'
import { editionLibelle } from './edition'
import { t } from '../../langue'
import { type NomIcone, Icone } from '../../icones'
import { useMenu } from '../../menuUnique'
import { BoutonOutil, OutilAvecMenu } from '../../BoutonOutil'

const EPAISSEURS = [1, 2, 4] as const

/**
 * La barre des lignes choisies, dans l'ordre de Milanote : Couleur, Début, Fin, Libellé, Pointillé, Épaisseur.
 * Plusieurs lignes : chaque changement s'applique à toutes, en un seul pas d'historique. Les pointes rondes et le
 * trait en points, propres à Notak, sont au menu « ••• ».
 */
export function OutilsLigne({ elements, contexte }: PropsOutils<Ligne>) {
  const [palette, setPalette, ancre] = useMenu()
  const epaisseurs = useMenu()
  const modifier = (f: (l: Ligne) => Ligne) => {
    const pas = elements.flatMap((e) => {
      const apres = f(e.contenu)
      return JSON.stringify(apres) === JSON.stringify(e.contenu)
        ? []
        : [{ type: 'contenu' as const, id: e.id, avant: e.contenu, apres }]
    })
    contexte.magasin.faire(pas)
  }
  const tous = <T,>(lire: (l: Ligne) => T, valeur: T) => elements.every((e) => lire(e.contenu) === valeur)
  // Début et Fin : une flèche, ou rien. Allumés, ils ont leur contour ; un rond reste un choix du menu « ••• ».
  const bascule = (clef: 'pointeDepart' | 'pointeArrivee') => {
    const vers: Pointe = tous((l) => l[clef], 'fleche') ? 'rien' : 'fleche'
    modifier((l) => ({ ...l, [clef]: vers }))
  }
  const basculeRond = (clef: 'pointeDepart' | 'pointeArrivee') => {
    const vers: Pointe = tous((l) => l[clef], 'rond') ? 'rien' : 'rond'
    modifier((l) => ({ ...l, [clef]: vers }))
  }
  const nomPointe = (clef: 'pointeDepart' | 'pointeArrivee', fleche: NomIcone): NomIcone => {
    const p = elements[0]!.contenu[clef]
    return p === 'fleche' ? fleche : p === 'rond' ? 'rond' : 'retirer'
  }
  const signe = (clef: 'pointeDepart' | 'pointeArrivee', fleche: NomIcone) => <Icone nom={nomPointe(clef, fleche)} />
  const colorier = (couleur: CouleurNote | undefined) => {
    modifier((l) => {
      const { couleur: _, ...reste } = l
      return couleur ? { ...reste, couleur } : reste
    })
    setPalette(false)
  }
  const actuelle = elements.every((e) => e.contenu.couleur === elements[0]!.contenu.couleur) ? elements[0]!.contenu.couleur : null
  const epaisseurCommune = elements.every((e) => e.contenu.epaisseur === elements[0]!.contenu.epaisseur) ? elements[0]!.contenu.epaisseur : undefined

  return (
    <>
      <OutilAvecMenu menu={[palette, setPalette, ancre]} classeAncre="notak-ligne-ancre" icone="palette" titre={t('couleur.titre')} libelle={t('couleur.titre')} pastille={teinteDe(actuelle ?? undefined) ?? GRIS_LIGNE}>
          <div className="notak-ligne-palette" role="menu">
            <button type="button" role="menuitem" title={t('couleur.grisFonce')} aria-label={t('couleur.grisFonce')} aria-pressed={actuelle === undefined} style={{ background: GRIS_LIGNE }} onClick={() => colorier(undefined)} />
            {COULEURS_NOTE.map((c) => (
              <button key={c} type="button" role="menuitem" title={LIBELLES_COULEUR[c]} aria-label={LIBELLES_COULEUR[c]} aria-pressed={actuelle === c} style={{ background: FOND_NOTE[c] }} onClick={() => colorier(c)} />
            ))}
          </div>
      </OutilAvecMenu>
      <BoutonOutil icone={nomPointe('pointeDepart', 'gauche')} titre={t('ligne.pointeDepart')} libelle={t('ligne.debut')} flottant={signe('pointeDepart', 'gauche')} actif={tous((l) => l.pointeDepart, 'fleche')} onClick={() => bascule('pointeDepart')} />
      <BoutonOutil icone={nomPointe('pointeArrivee', 'droite')} titre={t('ligne.pointeArrivee')} libelle={t('ligne.fin')} flottant={signe('pointeArrivee', 'droite')} actif={tous((l) => l.pointeArrivee, 'fleche')} onClick={() => bascule('pointeArrivee')} />
      {elements.length === 1 && (
        <BoutonOutil icone="legende" titre={t('ligne.libelle')} libelle={t('ligne.libelle')} actif={!!elements[0]!.contenu.libelle} onClick={() => editionLibelle.ouvrir(elements[0]!.id)} />
      )}
      <BoutonOutil icone="traitTirets" titre={t('ligne.pointilleTitre')} libelle={t('ligne.pointille')} flottant={<Icone nom="traitTirets" />} actif={tous((l) => l.trait, 'tirets')} onClick={() => modifier((l) => ({ ...l, trait: tous((x) => x.trait, 'tirets') ? 'plein' : 'tirets' }))} />
      <OutilAvecMenu menu={epaisseurs} classeAncre="notak-ligne-ancre" icone="traitPlein" titre={t('ligne.epaisseurChoix')} libelle={t('ligne.epaisseurCourt')}>
        <div className="notak-note-palette notak-ligne-epaisseurs" role="menu">
          {EPAISSEURS.map((n) => (
            <button key={n} type="button" role="menuitem" title={t('ligne.epaisseur', { n })} aria-label={t('ligne.epaisseur', { n })} aria-pressed={epaisseurCommune === n} data-epaisseur={n} onClick={() => modifier((l) => ({ ...l, epaisseur: n }))}>
              <span style={{ height: n }} />
            </button>
          ))}
        </div>
      </OutilAvecMenu>
      <BoutonOutil icone="traitPoints" secondaire titre={t('ligne.points')} libelle={t('ligne.court.points')} flottant={<Icone nom="traitPoints" />} actif={tous((l) => l.trait, 'points')} onClick={() => modifier((l) => ({ ...l, trait: tous((x) => x.trait, 'points') ? 'plein' : 'points' }))} />
      <BoutonOutil icone="rond" secondaire titre={t('ligne.rondDebut')} libelle={t('ligne.rondDebut')} actif={tous((l) => l.pointeDepart, 'rond')} onClick={() => basculeRond('pointeDepart')} />
      <BoutonOutil icone="rond" secondaire titre={t('ligne.rondFin')} libelle={t('ligne.rondFin')} actif={tous((l) => l.pointeArrivee, 'rond')} onClick={() => basculeRond('pointeArrivee')} />
    </>
  )
}
