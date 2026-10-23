import { type ActionMenu, actionsSelection } from './actionsSelection'
import type { Element } from './coeur/tableau'
import type { ContexteToile } from './elements/types'
import { Icone } from './icones'

/** Les actions du « ••• » : des rangées de menu sous la grille des outils secondaires. */
export function MenuActions({ elements, contexte, fermer }: { elements: Element[]; contexte: ContexteToile; fermer(): void }) {
  const actions = actionsSelection(elements, contexte)
  const lancer = (a: ActionMenu) => {
    a.faire?.()
    fermer()
  }
  return (
    <div className="notak-menu-actions" role="menu">
      {actions.map((a) =>
        a.faire ? (
          <button key={a.cle} type="button" role={a.coche === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={a.coche} data-action={a.cle} onClick={() => lancer(a)}>
            <span className="notak-menu-actions-icone">{a.icone && <Icone nom={a.icone} taille={16} />}</span>
            <span className="notak-menu-actions-texte">{a.libelle}</span>
            {a.coche && <Icone nom="coche" taille={14} />}
            {a.raccourci && !a.coche && <kbd>{a.raccourci}</kbd>}
          </button>
        ) : (
          <p key={a.cle} className="notak-menu-actions-info" data-action={a.cle}>
            {a.icone && <Icone nom={a.icone} taille={14} />}
            <span>{a.libelle}</span>
          </p>
        ),
      )}
    </div>
  )
}
