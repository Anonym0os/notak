import { type Editor, useEditorState } from '@tiptap/react'
import { useEffect, useRef } from 'react'
import type { CouleurNote } from '../../coeur/tableau'
import { BoutonOutil, ContexteOutils } from '../../BoutonOutil'
import { Icone } from '../../icones'
import { Infobulle } from '../../Infobulle'
import { t } from '../../langue'
import { fermerMenus } from '../../menuUnique'
import { ChampLien } from '../note/Barre'
import { MenuCouleur } from '../note/MenuCouleur'
import { OutilTexte } from '../note/OutilsTexte'
import { basculerPuce, peutRetrait, puceActive, retrait, tacheCourante } from './extensions'
import { ajouterTitre, retirerTitre, titreDe } from './titre'

interface Props {
  editor: Editor
  couleur: CouleurNote | undefined
  choisirCouleur(c: CouleurNote | undefined): void
  /** Le texte du titre qu'on avait retiré, s'il y en a un : il revient avec le titre. */
  titreCache(): string | undefined
  /** Le champ d'adresse du lien : `null` fermé, sinon l'adresse en cours de saisie. */
  lien: string | null
  surLien(adresse: string | null): void
  /** Ouvre le fil de commentaires de la liste ; absent en lecture seule. */
  commenter?(): void
  /** Terminer l'édition : la liste reste choisie. */
  finir(): void
}

/** Ce que la barre lit de l'éditeur à chaque transaction. */
const etatBarre = ({ editor }: { editor: Editor }) => {
  const tache = tacheCourante(editor)
  const { empty } = editor.state.selection
  return {
    vide: empty,
    titre: !!titreDe(editor.state.doc),
    dansTitre: editor.state.selection.$from.parent.type.name === 'titreListe',
    dansTache: !!tache,
    echeance: !!tache && puceActive(tache.noeud.attrs, 'echeance'),
    assigne: !!tache && puceActive(tache.noeud.attrs, 'assigne'),
    descendre: peutRetrait(editor, 1),
    remonter: peutRetrait(editor, -1),
    gras: editor.isActive('bold'),
    italique: editor.isActive('italic'),
    barre: editor.isActive('strike'),
    surLien: editor.isActive('link'),
    debut: editor.state.selection.from,
  }
}

/**
 * La barre de gauche d'une liste en édition (dans l'emplacement que la toile prête), comme chez Milanote. Le curseur
 * seul : Couleur, Titre, Échéance, Assigner, Retrait, Retrait inverse, Commentaire. Un passage de texte choisi :
 * Gras, Italique, Barré, Lien, Commentaire. Rien ici ne prend le focus à l'éditeur.
 * Réaction et Étiquette de la tâche viendront avec les annotations par tâche (voir `elements/decor`).
 */
export function OutilsEdition({ editor, couleur, choisirCouleur, titreCache, lien, surLien, commenter, finir }: Props) {
  const etat = useEditorState({ editor, selector: etatBarre })
  const barre = useRef<HTMLDivElement>(null)
  // Échap referme d'abord le menu ouvert, sans sortir de l'édition.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !barre.current?.querySelector('[aria-expanded="true"]')) return
      e.stopPropagation()
      e.preventDefault()
      fermerMenus()
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [])
  const arreter = (e: { stopPropagation(): void }) => e.stopPropagation()
  const sansFocus = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('input')) e.preventDefault()
  }
  const chaine = () => editor.chain().focus()
  const sansSelection = etat.vide && !etat.surLien
  const retour = () => {
    // Replier la sélection d'abord ; sinon sortir.
    if (!etat.vide) chaine().setTextSelection(etat.debut).run()
    else finir()
  }
  const texte = !etat.vide && !etat.dansTitre

  return (
    // Le portail garde les événements de React : rien de ce qui se passe ici ne doit remonter à la liste ni à la toile.
    <div className="notak-edition-outils" onPointerDown={arreter} onDoubleClick={arreter} onClick={arreter} onContextMenu={arreter} onMouseDown={sansFocus}>
      <Infobulle libelle={etat.vide ? t('barre.retourEdition') : t('barre.retourTexte')} cote="droite" contenu>
        <button type="button" className="notak-barre-retour" aria-label={etat.vide ? t('barre.retourEdition') : t('barre.retourTexte')} onClick={retour}>
          <Icone nom="gauche" taille={22} />
        </button>
      </Infobulle>
      <div ref={barre} className={`notak-barre-selection${texte ? ' notak-barre-edition' : ''}`} data-a-gauche role="toolbar" aria-label={t('barre.miseEnForme')}>
        {texte ? (
          <>
            <OutilTexte icone="gras" libelle={t('barre.gras')} raccourci="⌘B" actif={etat.gras} onClick={() => chaine().toggleBold().run()} />
            <OutilTexte icone="italique" libelle={t('barre.italique')} raccourci="⌘I" actif={etat.italique} onClick={() => chaine().toggleItalic().run()} />
            <OutilTexte icone="barre" libelle={t('barre.barre')} raccourci="⌘⇧X" actif={etat.barre} onClick={() => chaine().toggleStrike().run()} />
            <div className="notak-note-menu-ancre">
              <OutilTexte
                icone="lien"
                libelle={t('barre.lien')}
                raccourci="⌘K"
                actif={etat.surLien || lien !== null}
                grise={sansSelection}
                onClick={() => {
                  if (!sansSelection) surLien((editor.getAttributes('link').href as string | undefined) ?? '')
                }}
              />
              {lien !== null && (
                <div className="notak-lien-popup">
                  <ChampLien editor={editor} depart={lien} fini={() => surLien(null)} />
                </div>
              )}
            </div>
          </>
        ) : (
          <ContexteOutils.Provider value={{ aGauche: true, plus: null }}>
            <MenuCouleur actuelle={couleur} choisir={choisirCouleur} />
            <BoutonOutil
              icone="titre"
              libelle={t('taches.titre')}
              actif={etat.titre}
              onClick={() => (etat.titre ? retirerTitre(editor) : ajouterTitre(editor, titreCache()))}
            />
            <BoutonOutil icone="calendrier" libelle={t('decor.echeance')} actif={etat.echeance} desactive={!etat.dansTache} onClick={() => basculerPuce(editor, 'echeance')} />
            <BoutonOutil icone="personne" libelle={t('taches.assigner')} actif={etat.assigne} desactive={!etat.dansTache} onClick={() => basculerPuce(editor, 'assigne')} />
            <BoutonOutil icone="retraitPlus" libelle={t('barre.retraitPlus')} desactive={!etat.descendre} onClick={() => retrait(editor, 1)} />
            <BoutonOutil icone="retraitMoins" libelle={t('barre.retraitMoins')} desactive={!etat.remonter} onClick={() => retrait(editor, -1)} />
            {commenter && <BoutonOutil icone="commentaire" libelle={t('menu.commenter')} onClick={commenter} />}
          </ContexteOutils.Provider>
        )}
        {texte && commenter && (
          <ContexteOutils.Provider value={{ aGauche: true, plus: null }}>
            <BoutonOutil icone="commentaire" libelle={t('menu.commenter')} onClick={commenter} />
          </ContexteOutils.Provider>
        )}
      </div>
    </div>
  )
}
