import { type Editor, useEditorState } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { PanneauFlottant } from '../PanneauFlottant'
import { Icone } from '../icones'
import { t } from '../langue'
import { BulleLien } from './bulleLien'
import { BulleFixe } from './bulleFixe'
import { ATTENTE_BULLE, type Plage, boutonsBulle, bulleVisible, memeSelection } from './bullePosition'
import { COULEURS, type Couleur, type Entree, TRANSFORMATIONS, nomCouleur } from './catalogue'
import { type AncreFigee, defilement } from './menuAncre'
import { lireRecentes, retenirCouleur } from './menuCouleurs'
import { IconeEffacerFormat, IconeMenu, IconePlus } from './menuIcones'
import { CLE_CHOIX } from './selection'
import { colorer, couleurDuBloc, transformer, versActuel } from './transformer'

/**
 * La bulle de mise en forme (docs/NOTION.md § 4, relevé « 4-rendu-mesures » § 6.4) : un panneau de 192 px qui s'ouvre
 * en bas à droite de la fin du passage choisi, quand la sélection est restée stable 200 ms. Le type du bloc (qui ouvre
 * « Transformer en »), les marques, le lien, la couleur, « Effacer le format », « … » et le commentaire. Elle ne vient
 * pas dans du code, ni sur des blocs choisis, ni pendant qu'on tire la sélection, et ne suit pas une sélection qui
 * grandit ensuite au clavier.
 */

interface Props {
  editeur: Editor
  /**
   * Gardée pour l'ancien branchement : la bulle ouvre elle-même sa liste « Transformer en », sous le bouton du type.
   * @deprecated
   */
  transformerEn?: () => void
  /**
   * Gardée pour l'ancien branchement : l'éditeur de lien est celui de la bulle (⌘K l'ouvre sur la sélection).
   * @deprecated
   */
  lien?: () => void
  commenter?: () => void
  /** Ouvre le menu du bloc (le bouton « … ») ; absent, le bouton n'est pas proposé. */
  menuBloc?: () => void
  /** La dernière couleur utilisée ; la bulle garde ses propres récentes et la tient à jour. */
  derniere?: Couleur | null
  surCouleur(c: Couleur): void
}

const etat = ({ editor: ed }: { editor: Editor }) => {
  const { selection } = ed.state
  // Par son type JSON plutôt que par `instanceof` : le serveur de développement peut charger deux copies de la classe.
  const texte = selection.toJSON().type === 'text' && !selection.empty
  return {
    texteChoisi: texte,
    code: ed.isActive('codeBlock'),
    blocsChoisis: !!CLE_CHOIX.getState(ed.state),
    dansUnSeulBloc: selection.$from.sameParent(selection.$to),
    de: selection.from,
    a: selection.to,
    gras: ed.isActive('bold'),
    italique: ed.isActive('italic'),
    souligne: ed.isActive('underline'),
    barre: ed.isActive('strike'),
    code$: ed.isActive('code'),
    surLien: ed.isActive('link'),
    surFil: ed.isActive('commentaireTexte'),
    type: texte ? versActuel(ed) : 'texte',
    couleurTexte: (ed.getAttributes('textStyle').color as string | undefined) ?? null,
    couleurFond: (ed.getAttributes('highlight').color as string | undefined) ?? null,
  }
}

/** La fin de la sélection, au-dessus de laquelle la bulle se place : l'extrémité de la plage, en coordonnées d'écran. */
function mesurerFin(editeur: Editor, a: number): AncreFigee | null {
  try {
    const c = editeur.view.coordsAtPos(a)
    return { cle: a, boite: { left: c.left, right: c.left, top: c.top, bottom: c.bottom }, defil: defilement(editeur.view.dom) }
  } catch {
    return null
  }
}

/** La couleur que montre le bouton : celle du passage (texte, puis fond), à défaut celle du bloc. */
function couleurCourante(e: ReturnType<typeof etat>, bloc: Couleur | null): Couleur | null {
  const texte = /^var\(--notak-bloc-(\w+)\)$/.exec(e.couleurTexte ?? '')?.[1]
  if (texte && (COULEURS as readonly string[]).includes(texte)) return { nom: texte as Couleur['nom'], fond: false }
  const fond = /^fond-(\w+)$/.exec(e.couleurFond ?? '')?.[1]
  if (fond && (COULEURS as readonly string[]).includes(fond)) return { nom: fond as Couleur['nom'], fond: true }
  return bloc
}

const styleTeinte = (c: Couleur | null) => (!c || c.nom === 'defaut' ? undefined : c.fond ? { background: `var(--notak-bloc-${c.nom}-fond)` } : { color: `var(--notak-bloc-${c.nom})` })

export function Bulle({ editeur, commenter, menuBloc, surCouleur }: Props) {
  const e = useEditorState({ editor: editeur, selector: etat })
  // Tant qu'on tire la sélection à la souris, la bulle attend le lâcher.
  const [tire, setTire] = useState(false)
  const [popup, setPopup] = useState<'type' | 'couleur' | null>(null)
  const [recentes, setRecentes] = useState<Couleur[]>(() => lireRecentes())
  const [lien, setLien] = useState<{ plage: Plage; ancre: AncreFigee } | null>(null)
  const boutonType = useRef<HTMLButtonElement>(null)
  const boutonCouleur = useRef<HTMLButtonElement>(null)

  // Le focus de l'éditeur ne passe pas par une transaction : on relit quand il entre ou sort.
  const [, relire] = useState(0)
  useEffect(() => {
    // Partout dans la page : le focus peut partir de l'éditeur vers un champ (un commentaire) sans le traverser.
    const changer = () => window.setTimeout(() => relire((n) => n + 1), 0)
    document.addEventListener('focusin', changer, true)
    document.addEventListener('focusout', changer, true)
    return () => {
      document.removeEventListener('focusin', changer, true)
      document.removeEventListener('focusout', changer, true)
    }
  }, [editeur])
  useEffect(() => {
    const dom = editeur.view.dom
    const bas = () => setTire(true)
    const haut = () => setTire(false)
    // À la capture : la toile et la surcouche arrêtent le lâcher en route.
    dom.addEventListener('pointerdown', bas)
    window.addEventListener('pointerup', haut, true)
    window.addEventListener('pointercancel', haut, true)
    return () => {
      dom.removeEventListener('pointerdown', bas)
      window.removeEventListener('pointerup', haut, true)
      window.removeEventListener('pointercancel', haut, true)
    }
  }, [editeur])

  // Ce qui doit être vrai pour qu'elle paraisse ; l'antirebond de 200 ms la montre et la cache quand la sélection se stabilise.
  // `view.hasFocus()` (l'élément actif) plutôt que `isFocused`, qui ne suit pas quand la fenêtre n'a pas le focus.
  const voulue = bulleVisible({ texteChoisi: e.texteChoisi, focus: editeur.view.hasFocus(), code: e.code, blocsChoisis: e.blocsChoisis, glisse: tire, lien: !!lien })
  const [stable, setStable] = useState<{ voulue: boolean; de: number; a: number }>({ voulue: false, de: 0, a: 0 })
  useEffect(() => {
    const id = window.setTimeout(() => setStable({ voulue, de: e.de, a: e.a }), ATTENTE_BULLE)
    return () => window.clearTimeout(id)
  }, [voulue, e.de, e.a])

  // La place est prise à l'apparition, et gardée tant que la sélection n'est qu'étendue ou resserrée.
  const [place, setPlace] = useState<(AncreFigee & Plage) | null>(null)
  useEffect(() => {
    if (!stable.voulue) return setPlace(null)
    setPlace((avant) => {
      if (avant && memeSelection(avant, stable)) return avant
      const fin = mesurerFin(editeur, stable.a)
      return fin && { ...fin, de: stable.de, a: stable.a }
    })
  }, [editeur, stable])
  // Une sélection qui change de passage ferme ce que la bulle avait ouvert.
  useEffect(() => setPopup(null), [place?.de, place?.a])
  useEffect(() => {
    if (!popup) return
    const dehors = (ev: PointerEvent) => {
      if (!(ev.target as Element | null)?.closest?.('.notak-bulle, .notak-bulle-sous')) setPopup(null)
    }
    document.addEventListener('pointerdown', dehors, true)
    return () => document.removeEventListener('pointerdown', dehors, true)
  }, [popup])

  // ⌘K sur un passage choisi ouvre l'éditeur de lien, bulle visible ou non.
  useEffect(() => {
    const dom = editeur.view.dom
    const touche = (ev: KeyboardEvent) => {
      if (!(ev.metaKey || ev.ctrlKey) || ev.altKey || ev.shiftKey || ev.key.toLowerCase() !== 'k') return
      const { selection } = editeur.state
      if (selection.empty || selection.toJSON().type !== 'text' || editeur.isActive('codeBlock') || !selection.$from.sameParent(selection.$to)) return
      const fin = mesurerFin(editeur, selection.to)
      if (!fin) return
      ev.preventDefault()
      ev.stopImmediatePropagation()
      setPopup(null)
      setLien({ plage: { de: selection.from, a: selection.to }, ancre: fin })
    }
    dom.addEventListener('keydown', touche, true)
    return () => dom.removeEventListener('keydown', touche, true)
  }, [editeur])

  const hote = editeur.view.dom.closest<HTMLElement>('[aria-modal], .notak-espace')
  if (lien)
    return <BulleLien editeur={editeur} plage={lien.plage} ancre={lien.ancre} hote={hote} fermer={() => setLien(null)} />
  if (!place) return null

  const boutons = boutonsBulle(e.dansUnSeulBloc, { commenter: !!commenter, plus: !!menuBloc })
  const c = () => editeur.chain().focus()
  const couleur = couleurCourante(e, couleurDuBloc(editeur))
  const bouton = (icone: Parameters<typeof Icone>[0]['nom'], libelle: string, raccourci: string, actif: boolean, faire: () => void) => (
    <button type="button" className="notak-bulle-bouton" title={`${libelle} ${raccourci}`.trim()} aria-label={libelle} aria-pressed={actif} onClick={faire}>
      <Icone nom={icone} taille={20} trait={1.6} />
    </button>
  )
  const poser = (couleurPosee: Couleur) => {
    colorer(editeur, couleurPosee)
    setRecentes(retenirCouleur(couleurPosee))
    surCouleur(couleurPosee)
  }
  const ouvrirLien = () => setLien({ plage: { de: place.de, a: place.a }, ancre: place })
  const nomType = e.type === 'texte' ? t('menus.bulle.texteNormal') : t(`blocs.${e.type}`)
  const type = TRANSFORMATIONS.find((x) => x.effet.genre === 'vers' && x.effet.vers === e.type)

  return (
    <>
      <BulleFixe
        ancre={place}
        racine={editeur.view.dom}
        hote={hote}
        className="notak-bulle-panneau"
        // Un appui dans la bulle ne retire pas le focus à l'éditeur.
        onPointerDown={(ev) => ev.preventDefault()}
      >
        <div className="notak-bulle" role="toolbar" aria-label={t('document.outils')}>
          {boutons.type && (
            <>
              <button ref={boutonType} type="button" className="notak-bulle-type" aria-haspopup="menu" aria-expanded={popup === 'type'} onClick={() => setPopup(popup === 'type' ? null : 'type')}>
                {type ? <IconeMenu nom={type.icone} /> : <IconeMenu nom="texte" />}
                <span className="notak-bulle-type-nom">{nomType}</span>
                <Icone nom="chevronDroite" taille={16} className="notak-bulle-chevron" />
              </button>
              <div className="notak-bulle-trait" aria-hidden />
            </>
          )}
          <div className="notak-bulle-rangee">
            <button
              ref={boutonCouleur}
              type="button"
              className="notak-bulle-bouton"
              title={`${t('menus.bulle.couleur')} ⌘⇧H`}
              aria-label={t('menus.bulle.couleur')}
              aria-haspopup="menu"
              aria-expanded={popup === 'couleur'}
              onClick={() => setPopup(popup === 'couleur' ? null : 'couleur')}
            >
              <span className="notak-bulle-a" style={styleTeinte(couleur)}>
                A
              </span>
            </button>
            {bouton('gras', t('barre.gras'), '⌘B', e.gras, () => c().toggleBold().run())}
            {bouton('italique', t('barre.italique'), '⌘I', e.italique, () => c().toggleItalic().run())}
            {bouton('souligne', t('barre.souligne'), '⌘U', e.souligne, () => c().toggleUnderline().run())}
            <button type="button" className="notak-bulle-bouton" title={t('menus.bulle.effacerFormat')} aria-label={t('menus.bulle.effacerFormat')} onClick={() => c().unsetAllMarks().run()}>
              <IconeEffacerFormat />
            </button>
          </div>
          <div className="notak-bulle-rangee">
            {boutons.lien && bouton('lien', t('barre.lien'), '⌘K', e.surLien, ouvrirLien)}
            {bouton('barre', t('barre.barre'), '⌘⇧S', e.barre, () => c().toggleStrike().run())}
            {bouton('code', t('barre.codeLigne'), '⌘E', e.code$, () => c().toggleCode().run())}
            {boutons.plus && (
              <button type="button" className="notak-bulle-bouton" title={t('menus.bulle.plus')} aria-label={t('menus.bulle.plus')} onClick={menuBloc}>
                <IconePlus />
              </button>
            )}
          </div>
          {boutons.commenter && (
            <>
              <div className="notak-bulle-trait" aria-hidden />
              <button type="button" className="notak-bulle-commenter" aria-pressed={e.surFil} onClick={commenter}>
                <Icone nom="commenterPassage" taille={20} trait={1.6} />
                <span>{t('blocs.action.commenter')}</span>
              </button>
            </>
          )}
        </div>
      </BulleFixe>
      {popup === 'type' && (
        <PanneauFlottant cible={() => boutonType.current} hote={hote} cote="bas" alignement="debut" distance={4} fleche={false} className="notak-bulle-panneau" onPointerDown={(ev) => ev.preventDefault()}>
          <div className="notak-bulle-sous notak-bulle-transformer" role="menu">
            {TRANSFORMATIONS.map((x: Entree) => (
              <div
                key={x.id}
                role="menuitem"
                className="notak-menu-blocs-entree"
                onClick={() => {
                  if (x.effet.genre === 'vers') transformer(editeur, x.effet.vers)
                  setPopup(null)
                }}
              >
                <span className="notak-menu-blocs-icone">
                  <IconeMenu nom={x.icone} />
                </span>
                <span className="notak-menu-blocs-nom">{x.libelle}</span>
                {x.effet.genre === 'vers' && x.effet.vers === e.type && (
                  <span className="notak-menu-blocs-coche" aria-hidden>
                    ✓
                  </span>
                )}
              </div>
            ))}
          </div>
        </PanneauFlottant>
      )}
      {popup === 'couleur' && (
        <PanneauFlottant cible={() => boutonCouleur.current} hote={hote} cote="bas" alignement="debut" distance={4} fleche={false} className="notak-bulle-panneau" onPointerDown={(ev) => ev.preventDefault()}>
          <div className="notak-bulle-sous notak-bulle-couleurs" role="menu">
            <div className="notak-menu-blocs-categorie">{t('menus.section.recentes')}</div>
            <div className="notak-bulle-grille">{recentes.map((r) => pastille(r, couleur, poser))}</div>
            <div className="notak-menu-blocs-categorie">{t('menus.section.couleurTexte')}</div>
            <div className="notak-bulle-grille">{COULEURS.map((nom) => pastille({ nom, fond: false }, couleur, poser))}</div>
            <div className="notak-menu-blocs-categorie">{t('menus.section.couleurFond')}</div>
            <div className="notak-bulle-grille">{COULEURS.map((nom) => pastille({ nom, fond: true }, couleur, poser))}</div>
          </div>
        </PanneauFlottant>
      )}
    </>
  )
}

/** Une tuile « A » de 26 px : le nom de la couleur dans sa bulle d'aide, un liseré plus épais sur celle qui est posée. */
function pastille(c: Couleur, actuelle: Couleur | null, poser: (c: Couleur) => void) {
  const pose = !!actuelle && actuelle.nom === c.nom && actuelle.fond === c.fond
  return (
    <button key={`${c.nom}${c.fond ? '-fond' : ''}`} type="button" role="menuitem" className="notak-bulle-pastille" title={nomCouleur(c)} aria-label={nomCouleur(c)} aria-pressed={pose} style={styleTeinte(c)} onClick={() => poser(c)}>
      A
    </button>
  )
}
