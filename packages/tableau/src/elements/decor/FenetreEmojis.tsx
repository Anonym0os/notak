import { useEffect, useRef, useState } from 'react'
import { PanneauFlottant } from '../../PanneauFlottant'
import { t } from '../../langue'
import { Icone } from '../../icones'
import { SelecteurEmojis } from './SelecteurEmojis'

/** Le sélecteur d'émojis, accroché à droite de son bouton (à gauche s'il n'y a pas la place) ; un appui ailleurs ou Échap le ferme. */
export function FenetreEmojis({ ancre, fermer, choisir, posees }: { ancre: Element; fermer(): void; choisir(emoji: string): void; posees?: ReadonlySet<string> }) {
  const noeud = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const dehors = (e: PointerEvent) => !noeud.current?.contains(e.target as Node) && fermer()
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), fermer())
    document.addEventListener('pointerdown', dehors, true)
    document.addEventListener('keydown', touche, true)
    return () => {
      document.removeEventListener('pointerdown', dehors, true)
      document.removeEventListener('keydown', touche, true)
    }
  }, [fermer])
  return (
    <PanneauFlottant panneau={noeud} cible={() => ancre} cote="droite" distance={15} className="notak-decor-menu notak-fenetre-emojis" role="dialog" onPointerDown={(e) => e.stopPropagation()}>
      <SelecteurEmojis choisir={choisir} {...(posees ? { posees } : {})} />
    </PanneauFlottant>
  )
}

/**
 * Le « + » d'un message ou d'un fil : il ouvre le sélecteur d'émojis, et ferme la fenêtre une fois l'émoji choisi.
 * `posees` : les émojis que j'ai déjà posés, surlignés dans la grille.
 */
export function BoutonAjoutReaction({ choisir, posees, className = 'notak-reaction-ajout' }: { choisir(emoji: string): void; posees?: ReadonlySet<string>; className?: string }) {
  const [ancre, setAncre] = useState<Element | null>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={bouton}
        type="button"
        className={className}
        aria-expanded={ancre !== null}
        aria-label={t('decor.reagirEmoji')}
        title={t('decor.reagirEmoji')}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setAncre(ancre ? null : bouton.current)}
      >
        <Icone nom="reaction" taille={14} />
      </button>
      {ancre && (
        <FenetreEmojis
          ancre={ancre}
          fermer={() => setAncre(null)}
          {...(posees ? { posees } : {})}
          choisir={(e) => {
            choisir(e)
            setAncre(null)
          }}
        />
      )}
    </>
  )
}
