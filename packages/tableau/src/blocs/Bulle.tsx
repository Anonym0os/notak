import { TextSelection } from '@tiptap/pm/state'
import { type Editor, useEditorState } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { PanneauFlottant } from '../PanneauFlottant'
import { Icone } from '../icones'
import { t } from '../langue'
import { COULEURS, type Couleur } from './catalogue'
import { colorer } from './transformer'

/**
 * La bulle de mise en forme (docs/NOTION.md § 10) : au-dessus du passage choisi, « Transformer en », les marques, le
 * lien, la couleur et le commentaire. Elle s'efface pendant qu'on tire la sélection, et ne vient pas dans du code.
 */

interface Props {
  editeur: Editor
  /** Ouvre « Transformer en » sur le bloc du passage. */
  transformerEn(): void
  /** Ouvre le champ d'adresse du lien. */
  lien(): void
  commenter?: () => void
  derniere: Couleur | null
  surCouleur(c: Couleur): void
}

const etat = ({ editor: ed }: { editor: Editor }) => {
  const { selection } = ed.state
  const texte = selection instanceof TextSelection && !selection.empty
  return {
    ouverte: texte && ed.isFocused && !ed.isActive('codeBlock'),
    de: selection.from,
    a: selection.to,
    gras: ed.isActive('bold'),
    italique: ed.isActive('italic'),
    souligne: ed.isActive('underline'),
    barre: ed.isActive('strike'),
    code: ed.isActive('code'),
    surLien: ed.isActive('link'),
    surFil: ed.isActive('commentaireTexte'),
  }
}

export function Bulle({ editeur, transformerEn, lien, commenter, derniere, surCouleur }: Props) {
  const e = useEditorState({ editor: editeur, selector: etat })
  // Tant qu'on tire la sélection à la souris, la bulle attend le lâcher.
  const [tire, setTire] = useState(false)
  const [couleurs, setCouleurs] = useState(false)
  useEffect(() => {
    const dom = editeur.view.dom
    const bas = () => setTire(true)
    const haut = () => setTire(false)
    dom.addEventListener('pointerdown', bas)
    window.addEventListener('pointerup', haut)
    return () => {
      dom.removeEventListener('pointerdown', bas)
      window.removeEventListener('pointerup', haut)
    }
  }, [editeur])
  useEffect(() => setCouleurs(false), [e.de, e.a])
  if (!e.ouverte || tire) return null

  const cible = () => {
    try {
      const debut = editeur.view.coordsAtPos(e.de)
      const fin = editeur.view.coordsAtPos(e.a)
      return { left: Math.min(debut.left, fin.left), right: Math.max(debut.right, fin.right), top: Math.min(debut.top, fin.top), bottom: debut.bottom }
    } catch {
      return null
    }
  }
  const c = () => editeur.chain().focus()
  const bouton = (icone: Parameters<typeof Icone>[0]['nom'], libelle: string, actif: boolean, faire: () => void) => (
    <button type="button" className="notak-bulle-bouton" title={libelle} aria-label={libelle} aria-pressed={actif} onClick={faire}>
      <Icone nom={icone} taille={16} />
    </button>
  )
  const poser = (couleur: Couleur) => {
    colorer(editeur, couleur)
    surCouleur(couleur)
    setCouleurs(false)
  }
  return (
    <PanneauFlottant cible={cible} cote="haut" distance={8} fleche={false} className="notak-bulle-panneau" onPointerDown={(ev) => ev.preventDefault()}>
      <div className="notak-bulle" role="toolbar" aria-label={t('document.outils')}>
        <button type="button" className="notak-bulle-texte" onClick={transformerEn}>
          {t('blocs.action.transformer')} <Icone nom="chevronBas" taille={14} />
        </button>
        <span className="notak-bulle-trait" aria-hidden />
        {bouton('gras', t('barre.gras'), e.gras, () => c().toggleBold().run())}
        {bouton('italique', t('barre.italique'), e.italique, () => c().toggleItalic().run())}
        {bouton('souligne', t('barre.souligne'), e.souligne, () => c().toggleUnderline().run())}
        {bouton('barre', t('barre.barre'), e.barre, () => c().toggleStrike().run())}
        {bouton('code', t('barre.codeLigne'), e.code, () => c().toggleCode().run())}
        {bouton('lien', t('barre.lien'), e.surLien, lien)}
        <span className="notak-bulle-trait" aria-hidden />
        <button type="button" className="notak-bulle-texte" aria-expanded={couleurs} aria-label={t('blocs.couleur')} onClick={() => setCouleurs(!couleurs)}>
          <span className="notak-bulle-a" data-couleur={derniere ? `${derniere.nom}${derniere.fond ? '-fond' : ''}` : undefined}>
            A
          </span>
          <Icone nom="chevronBas" taille={14} />
        </button>
        {commenter && (
          <>
            <span className="notak-bulle-trait" aria-hidden />
            {bouton('commenterPassage', t('barre.commenterPassageNom'), e.surFil, commenter)}
          </>
        )}
        {couleurs && (
          <div className="notak-bulle-couleurs" role="menu">
            {derniere && (
              <>
                <div className="notak-menu-blocs-categorie">{t('blocs.derniere')}</div>
                <Pastille couleur={derniere} poser={poser} />
              </>
            )}
            {[false, true].map((fond) => (
              <div key={String(fond)}>
                <div className="notak-menu-blocs-categorie">{fond ? t('blocs.couleurDeFond') : t('blocs.couleurTexte')}</div>
                {COULEURS.map((nom) => (
                  <Pastille key={nom} couleur={{ nom, fond }} poser={poser} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </PanneauFlottant>
  )
}

function Pastille({ couleur, poser }: { couleur: Couleur; poser(c: Couleur): void }) {
  const nom = couleur.nom === 'defaut' ? t('blocs.couleurDefaut') : t(`couleur.${couleur.nom}`)
  const libelle = couleur.fond ? t('blocs.couleurFond', { couleur: nom }) : nom
  return (
    <button type="button" role="menuitem" className="notak-menu-blocs-entree" onClick={() => poser(couleur)}>
      <span className="notak-menu-blocs-signe" data-couleur={`${couleur.nom}${couleur.fond ? '-fond' : ''}`} aria-hidden>
        A
      </span>
      <span className="notak-menu-blocs-nom">{libelle}</span>
    </button>
  )
}
