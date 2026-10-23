import { useSyncExternalStore } from 'react'
import { COULEURS_NOTE, type CouleurNote, type Element, annoter } from '../../coeur/tableau'
import { BoutonOutil, ContexteOutils, OutilAvecMenu } from '../../BoutonOutil'
import { Icone } from '../../icones'
import { Infobulle } from '../../Infobulle'
import { t } from '../../langue'
import { useMenu } from '../../menuUnique'
import { LIBELLES_COULEUR } from '../note/couleurs'
import type { ContexteToile } from '../types'
import { colorerEtiquette } from './annotations'
import { type PuceChoisie, choisirPuce } from './etat'
import { changerEtiquettes } from './ecriture'

/** Une pastille choisie sur une carte : les trois gestes qu'on lui fait. */
function Outils({ element, puce, contexte }: { element: Element; puce: PuceChoisie; contexte: ContexteToile }) {
  const { magasin } = contexte
  const tableau = useSyncExternalStore(magasin.ecouter, magasin.lire)
  const menu = useMenu()
  const et = (tableau.etiquettes ?? []).find((x) => x.id === puce.etiquette)
  if (!et) return null
  const colorer = (c: CouleurNote) => {
    changerEtiquettes(contexte, colorerEtiquette(tableau.etiquettes ?? [], et.id, c))
    menu[1](false)
  }
  const retirer = () => {
    const op = annoter(element, { etiquettes: (element.etiquettes ?? []).filter((x) => x !== et.id) })
    if (op) magasin.faire([op])
    choisirPuce(null)
  }
  return (
    <>
      <OutilAvecMenu menu={menu} icone="palette" titre={t('couleur.titre')} libelle={t('couleur.titre')} pastille={`var(--notak-note-${et.couleur})`}>
        <div className="notak-note-palette notak-decor-menu" role="menu">
          <div className="notak-note-pastilles">
            {COULEURS_NOTE.map((c) => (
              <button key={c} type="button" role="menuitem" data-fond={c} title={LIBELLES_COULEUR[c]} aria-label={LIBELLES_COULEUR[c]} aria-pressed={et.couleur === c} onClick={() => colorer(c)} />
            ))}
          </div>
        </div>
      </OutilAvecMenu>
      <BoutonOutil icone="modifier" titre={t('etiquettes.renommer')} libelle={t('etiquettes.renommer')} onClick={() => choisirPuce({ ...puce, renommer: true })} />
      <BoutonOutil icone="corbeille" titre={t('etiquettes.retirerElement')} libelle={t('commentaire.retirer')} onClick={retirer} />
    </>
  )
}

/**
 * La barre de sélection quand une pastille d'étiquette est choisie sur la carte : Couleur (celle de l'étiquette, pour
 * tout le tableau), Renommer, Retirer (de cette carte seulement). La flèche la lâche.
 */
export function BarreEtiquette({ element, puce, contexte, aGauche, position }: { element: Element; puce: PuceChoisie; contexte: ContexteToile; aGauche: boolean; position: { x: number; y: number } }) {
  if (!aGauche) {
    return (
      <div className="notak-barre-selection" style={{ left: position.x, top: position.y }} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <Outils element={element} puce={puce} contexte={contexte} />
      </div>
    )
  }
  return (
    <nav className="notak-barre-outils" data-selection data-etiquette onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <Infobulle libelle={t('barre.retour')} cote="droite" contenu>
        <button type="button" className="notak-barre-retour" aria-label={t('barre.retour')} onClick={() => choisirPuce(null)}>
          <Icone nom="gauche" taille={22} />
        </button>
      </Infobulle>
      <ContexteOutils.Provider value={{ aGauche: true, plus: null }}>
        <div className="notak-barre-selection" data-a-gauche>
          <Outils element={element} puce={puce} contexte={contexte} />
        </div>
      </ContexteOutils.Provider>
    </nav>
  )
}
