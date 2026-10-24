import { useState } from 'react'
import type { Arbre, Id } from '../../coeur/tableau'
import { Icone } from '../../icones'
import { t } from '../../langue'
import { BoutonIcone, Deroulant, Entree } from './Fenetre'
import type { ActionsInsertion } from './actionsMenu'
import type { Geste } from './modele/gestes'
import type { Lecture } from './modele/sujets'

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
  /** Ce que la barre et le menu « + » posent sur la carte : chaque entrée ouvre son éditeur ou son sélecteur. */
  actions: ActionsInsertion
}

/** Ce qui est actif selon la sélection (docs/XMIND.md § 15) : l'étiquette et l'insertion de lien attendent un sujet, la tâche et la pièce jointe un seul. */
export function etatBarre(choisis: readonly Id[]) {
  const n = choisis.length
  return {
    etiquette: n >= 1,
    tache: n === 1,
    aFaire: n >= 1,
    note: n === 1,
    lienWeb: n >= 1,
    lienSujet: n === 1,
    piece: n === 1,
    audio: n === 1,
    vignette: n >= 1,
    image: n === 1,
    equation: n === 1,
  }
}

/**
 * La barre d'outils flottante, au centre en haut de la carte, comme celle de Xmind (docs/XMIND.md § 8.2) : Relation,
 * Résumé, Limite, Zone, Étiquette, Tâche, puis « + » et son menu Insérer.
 */
export function Outils({ lecture: l, choisis, faire, relier, actions }: Props) {
  const [inserer, setInserer] = useState(false)
  const [lien, setLien] = useState(false)
  const etat = etatBarre(choisis)
  const sansCentral = choisis.length > 0 && !choisis.includes(l.central)
  const fermer = () => (setInserer(false), setLien(false))
  return (
    // Un clic sur la barre ne prend pas le focus : le clavier reste à la carte.
    <div className="notak-arbre-outils notak-arbre-pilule notak-arbre-barre" role="toolbar" aria-label={t('type.arbre')} onMouseDown={(e) => e.preventDefault()}>
      <BoutonIcone icone="arbreRelation" libelle={t('arbre.relationAide')} touche="⌘ ⇧ R" inactif={choisis.length > 2} onClick={relier} />
      <BoutonIcone icone="arbreResume" libelle={t('arbre.resumeAide')} inactif={!sansCentral} onClick={() => faire({ type: 'resume', ids: choisis })} />
      <BoutonIcone icone="arbreLimite" libelle={t('arbre.limiteAide')} touche="⌘ ⇧ B" inactif={!sansCentral} onClick={() => faire({ type: 'limite', ids: choisis })} />
      <BoutonIcone icone="arbreEncadre" libelle={t('arbre.zoneAide')} touche="⌘ ⌥ Z" onClick={actions.zone} />
      <BoutonIcone icone="etiquette" libelle={t('arbre.etiquetteAide')} touche="⌘ ⇧ L" inactif={!etat.etiquette} onClick={actions.etiquettes} />
      <BoutonIcone icone="arbreTache" libelle={t('arbre.tacheAide')} inactif={!etat.tache} onClick={actions.tache} />
      <div className="notak-arbre-menu-hote">
        <button type="button" className="notak-arbre-bouton notak-arbre-plus" aria-label={t('arbre.inserer')} aria-haspopup="menu" aria-expanded={inserer} onClick={() => setInserer((x) => !x)}>
          <Icone nom="ajouter" taille={20} trait={1.5} />
          <Icone nom="chevronBas" taille={12} trait={2} />
        </button>
        <Deroulant ouvert={inserer} fermer={fermer}>
          <Entree icone="note" libelle={t('arbre.note')} touche="⌘ ⇧ N" inactif={!etat.note} onClick={() => (actions.note(), fermer())} />
          <Entree icone="coche" libelle={t('arbre.aFaire')} touche="⌘ ⌥ T" inactif={!etat.aFaire} onClick={() => (actions.aFaire(), fermer())} />
          <div className="notak-arbre-menu-hote">
            <Entree icone="lien" libelle={t('arbre.lien')} touche="›" onClick={() => setLien((x) => !x)} />
            {lien && (
              <div className="notak-arbre-deroulant notak-arbre-sous-menu" role="menu">
                <Entree icone="lien" libelle={t('arbre.pageWeb')} touche="⌘ K" inactif={!etat.lienWeb} onClick={() => (actions.lienWeb(), fermer())} />
                <Entree icone="arbreSousSujet" libelle={t('arbre.lienSujet')} inactif={!etat.lienSujet} onClick={() => (actions.lienSujet(), fermer())} />
              </div>
            )}
          </div>
          <hr />
          <Entree icone="trombone" libelle={t('arbre.pieceJointe')} inactif={!etat.piece} onClick={() => (actions.pieceJointe(), fermer())} />
          <Entree icone="micro" libelle={t('arbre.noteAudio')} inactif={!etat.audio} onClick={() => (actions.noteAudio(), fermer())} />
          <hr />
          <Entree icone="humeurSourire" libelle={t('arbre.ongletAutocollants')} inactif={!etat.vignette} onClick={() => (actions.autocollant(), fermer())} />
          <Entree icone="palette" libelle={t('arbre.ongletIllustrations')} inactif={!etat.vignette} onClick={() => (actions.illustration(), fermer())} />
          <Entree icone="image" libelle={t('arbre.imageLocale')} touche="⌘ ⇧ I" inactif={!etat.image} onClick={() => (actions.imageLocale(), fermer())} />
          <Entree icone="formule" libelle={t('arbre.equation')} inactif={!etat.equation} onClick={() => (actions.equation(), fermer())} />
        </Deroulant>
      </div>
    </div>
  )
}
