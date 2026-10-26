import { type ActionMenu, actionsSelection } from './actionsSelection'
import { LigneMenu } from './communs'
import type { Element } from './coeur/tableau'
import type { ContexteToile } from './elements/types'
import { Icone } from './icones'

/** Les actions du « ••• » : des lignes de menu sous la grille des outils secondaires. */
export function MenuActions({ elements, contexte, fermer }: { elements: Element[]; contexte: ContexteToile; fermer(): void }) {
  const actions = actionsSelection(elements, contexte)
  const lancer = (a: ActionMenu) => {
    a.faire?.()
    fermer()
  }
  return (
    <div className="notak-menu-actions notak-menu-nu" role="menu">
      {actions.map((a) =>
        a.faire ? (
          <LigneMenu key={a.cle} icone={a.icone} reserverIcone reserverCoche={actions.some((x) => x.coche !== undefined)} libelle={a.libelle} raccourci={a.coche ? undefined : a.raccourci} coche={a.coche} data-action={a.cle} onClick={() => lancer(a)} />
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
