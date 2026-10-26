import { type CSSProperties, type KeyboardEvent, type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icone } from '../icones'
import { t } from '../langue'
import { Bouton, BoutonIcone } from './Bouton'
import './dialogue.css'

const FOCALISABLES =
  'button:not(:disabled), input:not(:disabled):not([hidden]):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'

interface PropsDialogue {
  /** Le titre, en tête de la boîte. Sans lui (`etiquette` seule), le contenu dessine tout. */
  titre?: ReactNode
  /** Le nom du dialogue pour qui le lit à haute voix, quand il n'a pas de titre visible. */
  etiquette?: string
  /**
   * Le ferme (croix, Échap, clic sur le voile). Sans lui, le dialogue ne se ferme pas de lui-même : un tableau
   * verrouillé ne se quitte qu'avec le mot de passe, un export en cours ne s'abandonne pas.
   */
  fermer?(): void
  /** Où rendre le focus si ce qui a ouvert le dialogue n'est plus là (un raccourci clavier l'a ouvert). */
  retour?(): HTMLElement | null
  /** Une opération est en cours : ni Échap, ni le voile, ni la croix (grisée) ne ferment. */
  occupe?: boolean
  /** Échap fait autre chose que fermer (vider une recherche d'abord). */
  echap?(): void
  /** Faux : pas de croix en tête, même avec `fermer` (le contenu en pose une à sa place). */
  croix?: boolean
  /** Les boutons du pied, à droite : `Annuler` puis l'action. */
  actions?: ReactNode
  /** Sans marge ni défilement : le contenu dessine tout. */
  nu?: boolean
  /** Sa largeur en px, ou une valeur CSS. 440 par défaut. */
  largeur?: number | string
  /** `sombre` : un voile à 70 %, pour montrer un fichier en grand. Le voile clair (24 %) est celui des dialogues. */
  voile?: 'clair' | 'sombre'
  /** `alertdialog` pour une question qui demande une réponse. */
  role?: 'dialog' | 'alertdialog'
  /** Où le poser, pour qu'il prenne le thème de cet élément ; sans lui, là où il est rendu. */
  hote?: Element | null | undefined
  /** Une classe de plus sur la boîte, pour ce qui lui est propre (hauteur, fond). */
  className?: string
  children?: ReactNode
}

/**
 * Le dialogue commun : voile, boîte, titre, croix, corps, pied d'actions. Modal : la page derrière ne reçoit plus rien.
 * Échap et un clic sur le voile le ferment (`fermer`), le focus tourne dans la boîte et revient, à la fermeture, à ce
 * qui l'a ouverte. Le contenu se monte une fois la boîte ouverte, si bien qu'un `autoFocus` y prend le focus.
 */
export function Dialogue({
  titre,
  etiquette,
  fermer,
  occupe,
  echap,
  retour,
  croix = true,
  actions,
  nu,
  largeur,
  voile,
  role = 'dialog',
  hote,
  className,
  children,
}: PropsDialogue) {
  const id = useId()
  const dialogue = useRef<HTMLDialogElement>(null)
  const [ouvert, setOuvert] = useState(false)
  const dernier = useRef({ fermer, echap, occupe, retour })
  dernier.current = { fermer, echap, occupe, retour }

  useLayoutEffect(() => {
    const d = dialogue.current
    if (!d) return
    const ouvreur = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    // jsdom (et les vieux navigateurs) n'ont pas showModal : la boîte s'ouvre sans voile natif, le reste est identique.
    if (typeof d.showModal === 'function') {
      if (!d.open) d.showModal()
    } else d.setAttribute('open', '')
    setOuvert(true)
    return () => {
      if (typeof d.close === 'function' && d.open) d.close()
      // Le focus revient à l'ouvreur ; s'il a disparu, il ne reste pas sur la page.
      const cible = ouvreur?.isConnected ? ouvreur : dernier.current.retour?.()
      cible?.focus({ preventScroll: true })
    }
  }, [])

  // Le contenu monté, le focus entre dans la boîte s'il n'y est pas déjà (un `autoFocus` l'y a mis) : le premier champ, à
  // défaut le premier bouton, jamais la croix.
  useLayoutEffect(() => {
    const d = dialogue.current
    if (!ouvert || !d || d.contains(document.activeElement)) return
    const liste = [...d.querySelectorAll<HTMLElement>(FOCALISABLES)].filter((el) => !el.closest('.notak-dialogue-tete'))
    const cible = liste.find((el) => el.matches('input, textarea, select')) ?? liste[0]
    if (cible) cible.focus({ preventScroll: true })
    else {
      d.tabIndex = -1
      d.focus({ preventScroll: true })
    }
  }, [ouvert])

  // Échap tombe en même temps en `keydown` (qu'on traite) et en `cancel` (que le navigateur envoie ensuite) : une fois suffit.
  const vu = useRef(false)
  const echapper = () => {
    const { fermer: f, echap: e, occupe: o } = dernier.current
    if (o) return
    if (e) e()
    else f?.()
  }
  const touche = (e: KeyboardEvent<HTMLDialogElement>) => {
    // Ce qu'on tape ici n'est pas pour la page.
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      vu.current = true
      setTimeout(() => (vu.current = false), 0)
      echapper()
    } else if (e.key === 'Tab') {
      const liste = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCALISABLES)].filter((el) => el.offsetParent !== null || el === document.activeElement)
      const premier = liste[0]
      const dernierEl = liste[liste.length - 1]
      if (!premier || !dernierEl) return
      const dedans = e.currentTarget.contains(document.activeElement) && document.activeElement !== e.currentTarget
      if (e.shiftKey && (document.activeElement === premier || !dedans)) {
        e.preventDefault()
        dernierEl.focus()
      } else if (!e.shiftKey && (document.activeElement === dernierEl || !dedans)) {
        e.preventDefault()
        premier.focus()
      }
    }
  }

  const rendu = (
    <dialog
      ref={dialogue}
      className="notak-dialogue-hote"
      data-voile={voile === 'sombre' ? 'sombre' : undefined}
      role={role}
      aria-modal="true"
      aria-labelledby={titre ? id : undefined}
      aria-label={titre ? undefined : etiquette}
      onKeyDown={touche}
      onCancel={(e) => {
        e.preventDefault()
        if (!vu.current) echapper()
      }}
      // Un clic sur le voile (le <dialog> lui-même, hors de sa boîte) le ferme.
      onClick={(e) => {
        if (e.target === e.currentTarget && !occupe) fermer?.()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div
        className={['notak-dialogue', nu && 'notak-dialogue-nu', className].filter(Boolean).join(' ')}
        style={largeur === undefined ? undefined : ({ '--notak-dialogue-largeur': typeof largeur === 'number' ? `${largeur}px` : largeur } as CSSProperties)}
      >
        {ouvert && (
          <>
            {titre && (
              <div className="notak-dialogue-tete">
                <h2 id={id} className="notak-dialogue-titre">
                  {titre}
                </h2>
                {fermer && croix && (
                  <BoutonIcone aria-label={t('commun.fermer')} title={t('commun.fermer')} disabled={occupe} onClick={fermer}>
                    <Icone nom="fermer" taille={16} trait={2} />
                  </BoutonIcone>
                )}
              </div>
            )}
            {children}
            {actions && <div className="notak-dialogue-actions">{actions}</div>}
          </>
        )}
      </div>
    </dialog>
  )
  return hote ? createPortal(rendu, hote) : rendu
}

interface PropsConfirmation {
  titre: ReactNode
  /** Ce qui disparaît, ce qui reste : une phrase. */
  texte?: ReactNode
  /** Le libellé de l'action (« Effacer », « Supprimer ») : un bouton rouge, le second rang étant « Annuler ». */
  oui: string
  /** Vrai : la confirmation d'une suppression (fond rouge). Faux : un bouton plein et sombre. */
  danger?: boolean
  repondre(oui: boolean): void
  hote?: Element | null | undefined
}

/**
 * La confirmation, d'une seule forme : un titre, une phrase, Annuler et l'action. Échap, la croix et le voile disent non.
 * Le focus part sur l'action, comme un « Entrée » qui confirme.
 */
export function Confirmation({ titre, texte, oui, danger = true, repondre, hote }: PropsConfirmation) {
  return (
    <Dialogue
      titre={titre}
      role="alertdialog"
      fermer={() => repondre(false)}
      hote={hote}
      actions={
        <>
          <Bouton variante="second" onClick={() => repondre(false)}>
            {t('commun.annuler')}
          </Bouton>
          <Bouton variante={danger ? 'danger' : 'principal'} autoFocus onClick={() => repondre(true)}>
            {oui}
          </Bouton>
        </>
      }
    >
      {texte && <p className="notak-dialogue-texte">{texte}</p>}
    </Dialogue>
  )
}
