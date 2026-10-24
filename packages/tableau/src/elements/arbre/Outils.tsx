import { useState } from 'react'
import type { Arbre, Id } from '../../coeur/tableau'
import { Icone } from '../../icones'
import { t } from '../../langue'
import { BoutonIcone, Deroulant, Entree } from './Fenetre'
import type { Geste } from './modele/gestes'
import type { Lecture } from './modele/sujets'
import type { Section } from './Panneau'

interface Props {
  arbre: Arbre
  lecture: Lecture
  /** Les sujets choisis. */
  choisis: Id[]
  /** Le sujet sur lequel agir quand rien n'est choisi. */
  courant: Id
  faire(g: Geste): void
  /** Commencer une relation depuis le sujet courant. */
  relier(): void
  /** Ouvrir le panneau de format sur une section du sujet. */
  ouvrir(section: Section): void
}

/**
 * La barre d'outils flottante, au centre en haut de la carte, comme celle de Xmind (docs/XMIND.md § 8.2) : Relation,
 * Résumé, Limite, Zone, Étiquette, Tâche, puis « + » et son menu Insérer.
 */
export function Outils({ lecture: l, choisis, faire, relier, ouvrir }: Props) {
  const [inserer, setInserer] = useState(false)
  const [lien, setLien] = useState(false)
  const un = choisis.length === 1 ? choisis[0]! : null
  const sansCentral = choisis.length > 0 && !choisis.includes(l.central)
  const fermer = () => (setInserer(false), setLien(false))
  return (
    // Un clic sur la barre ne prend pas le focus : le clavier reste à la carte.
    <div className="notak-arbre-outils notak-arbre-pilule notak-arbre-barre" role="toolbar" aria-label={t('type.arbre')} onMouseDown={(e) => e.preventDefault()}>
      <BoutonIcone icone="arbreRelation" libelle={t('arbre.relationAide')} touche="⌘ ⇧ R" inactif={choisis.length > 2} onClick={relier} />
      <BoutonIcone icone="arbreResume" libelle={t('arbre.resumeAide')} inactif={!sansCentral} onClick={() => faire({ type: 'resume', ids: choisis })} />
      <BoutonIcone icone="arbreLimite" libelle={t('arbre.limiteAide')} touche="⌘ ⇧ B" inactif={!sansCentral} onClick={() => faire({ type: 'limite', ids: choisis })} />
      <BoutonIcone icone="arbreEncadre" libelle={t('arbre.zoneAide')} touche="⌘ ⌥ Z" inactif />
      <BoutonIcone icone="etiquette" libelle={t('arbre.etiquetteAide')} touche="⌘ ⇧ L" inactif={choisis.length === 0} onClick={() => ouvrir('etiquettes')} />
      <BoutonIcone icone="arbreTache" libelle={t('arbre.tacheAide')} inactif={!un} />
      <div className="notak-arbre-menu-hote">
        <button type="button" className="notak-arbre-bouton notak-arbre-plus" aria-label={t('arbre.inserer')} aria-haspopup="menu" aria-expanded={inserer} onClick={() => setInserer((x) => !x)}>
          <Icone nom="ajouter" taille={20} trait={1.5} />
          <Icone nom="chevronBas" taille={12} trait={2} />
        </button>
        <Deroulant ouvert={inserer} fermer={fermer}>
          <Entree icone="note" libelle={t('arbre.note')} touche="⌘ ⇧ N" inactif={!un} onClick={() => (ouvrir('note'), fermer())} />
          <Entree icone="coche" libelle={t('arbre.aFaire')} touche="⌘ ⌥ T" inactif={choisis.length === 0} onClick={() => (faire({ type: 'tache', ids: choisis }), fermer())} />
          <div className="notak-arbre-menu-hote">
            <Entree icone="lien" libelle={t('arbre.lien')} onClick={() => setLien((x) => !x)} />
            {lien && (
              <div className="notak-arbre-deroulant notak-arbre-sous-menu" role="menu">
                <Entree icone="lien" libelle={t('arbre.pageWeb')} touche="⌘ K" inactif={choisis.length === 0} onClick={() => (ouvrir('lien'), fermer())} />
                <Entree icone="arbreSousSujet" libelle={t('arbre.lienSujet')} inactif={!un} onClick={() => (ouvrir('lien'), fermer())} />
              </div>
            )}
          </div>
          <hr />
          <Entree icone="trombone" libelle={t('arbre.pieceJointe')} inactif />
          <Entree icone="micro" libelle={t('arbre.noteAudio')} inactif />
          <hr />
          <Entree icone="humeurSourire" libelle={t('arbre.ongletAutocollants')} inactif />
          <Entree icone="palette" libelle={t('arbre.ongletIllustrations')} inactif />
          <Entree icone="image" libelle={t('arbre.imageLocale')} touche="⌘ ⇧ I" inactif={!un} onClick={() => (ouvrir('image'), fermer())} />
          <Entree icone="formule" libelle={t('arbre.equation')} inactif />
        </Deroulant>
      </div>
    </div>
  )
}
