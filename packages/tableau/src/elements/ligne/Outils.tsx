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
const TRAITS = [
  { trait: 'plein', court: 'plein', icone: 'traitPlein', get titre() { return t('ligne.plein') } },
  { trait: 'tirets', court: 'tirets', icone: 'traitTirets', get titre() { return t('ligne.tirets') } },
  { trait: 'points', court: 'points', icone: 'traitPoints', get titre() { return t('ligne.points') } },
] as const

/** La barre des lignes choisies. Plusieurs lignes : chaque changement s'applique à toutes, en un seul pas d'historique. */
export function OutilsLigne({ elements, contexte }: PropsOutils<Ligne>) {
  const [palette, setPalette, ancre] = useMenu()
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
  // Chaque clic passe à la pointe suivante : flèche, rond, rien.
  const SUITE: Record<Pointe, Pointe> = { fleche: 'rond', rond: 'rien', rien: 'fleche' }
  const bascule = (clef: 'pointeDepart' | 'pointeArrivee') => {
    const premiere = elements[0]!.contenu[clef]
    const vers: Pointe = elements.every((e) => e.contenu[clef] === premiere) ? SUITE[premiere] : 'fleche'
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

  return (
    <>
      <BoutonOutil icone={nomPointe('pointeDepart', 'gauche')} titre={t('ligne.pointeDepart')} libelle={t('ligne.debut')} flottant={signe('pointeDepart', 'gauche')} actif={!tous((l) => l.pointeDepart, 'rien')} onClick={() => bascule('pointeDepart')} />
      <BoutonOutil icone={nomPointe('pointeArrivee', 'droite')} titre={t('ligne.pointeArrivee')} libelle={t('ligne.fin')} flottant={signe('pointeArrivee', 'droite')} actif={!tous((l) => l.pointeArrivee, 'rien')} onClick={() => bascule('pointeArrivee')} />
      <span className="notak-ligne-sep" />
      {TRAITS.map((x) => (
        <BoutonOutil key={x.trait} icone={x.icone} titre={x.titre} libelle={t(`ligne.court.${x.court}`)} flottant={<Icone nom={x.icone} />} secondaire actif={tous((l) => l.trait, x.trait)} onClick={() => modifier((l) => ({ ...l, trait: x.trait }))} />
      ))}
      <span className="notak-ligne-sep" />
      {EPAISSEURS.map((n) => (
        <BoutonOutil key={n} icone="traitPlein" titre={t('ligne.epaisseur', { n })} libelle={t('ligne.court.epaisseur', { n })} flottant={n} secondaire actif={tous((l) => l.epaisseur, n)} onClick={() => modifier((l) => ({ ...l, epaisseur: n }))} />
      ))}
      <span className="notak-ligne-sep" />
      <OutilAvecMenu menu={[palette, setPalette, ancre]} classeAncre="notak-ligne-ancre" icone="palette" titre={t('couleur.titre')} libelle={t('couleur.titre')} pastille={teinteDe(actuelle ?? undefined) ?? GRIS_LIGNE}>
          <div className="notak-ligne-palette" role="menu">
            <button type="button" role="menuitem" title={t('couleur.grisFonce')} aria-label={t('couleur.grisFonce')} aria-pressed={actuelle === undefined} style={{ background: GRIS_LIGNE }} onClick={() => colorier(undefined)} />
            {COULEURS_NOTE.map((c) => (
              <button key={c} type="button" role="menuitem" title={LIBELLES_COULEUR[c]} aria-label={LIBELLES_COULEUR[c]} aria-pressed={actuelle === c} style={{ background: FOND_NOTE[c] }} onClick={() => colorier(c)} />
            ))}
          </div>
      </OutilAvecMenu>
      {elements.length === 1 && (
        <BoutonOutil icone="legende" titre={t('ligne.libelle')} libelle={t('ligne.libelle')} actif={!!elements[0]!.contenu.libelle} onClick={() => editionLibelle.ouvrir(elements[0]!.id)} />
      )}
    </>
  )
}
