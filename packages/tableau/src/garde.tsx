import { Component, type ReactNode } from 'react'
import { t } from './langue'

/**
 * Une erreur dans la toile ne blanchit plus toute l'application : l'en-tête reste, et la toile laisse place à une
 * phrase et un bouton qui la remonte. L'erreur part dans la console pour qu'on la retrouve.
 */
export class GardeToile extends Component<{ children: ReactNode }, { erreur: Error | null; essai: number }> {
  override state = { erreur: null as Error | null, essai: 0 }

  static getDerivedStateFromError(erreur: Error) {
    return { erreur }
  }

  override componentDidCatch(erreur: Error) {
    console.error('Notak : la toile a planté', erreur)
  }

  override render() {
    if (!this.state.erreur) return <div key={this.state.essai} className="notak-garde">{this.props.children}</div>
    return (
      <div className="notak-garde notak-garde-erreur" role="alert">
        <p>{t('garde.titre')}</p>
        <button type="button" onClick={() => this.setState((s) => ({ erreur: null, essai: s.essai + 1 }))}>
          {t('garde.reessayer')}
        </button>
      </div>
    )
  }
}

/**
 * Un élément qui plante à l'affichage (écrit de travers par un autre appareil, une autre version) ne fait pas
 * tomber la toile : sa carte dit qu'elle ne peut pas s'afficher, les autres continuent. Quand l'élément change,
 * on réessaie.
 */
export class GardeElement extends Component<
  { element: unknown; repli?: ReactNode; children: ReactNode },
  { erreur: Error | null; pour: unknown }
> {
  override state = { erreur: null as Error | null, pour: undefined as unknown }

  static getDerivedStateFromError(erreur: Error) {
    return { erreur }
  }

  static getDerivedStateFromProps(props: { element: unknown }, state: { erreur: Error | null; pour: unknown }) {
    return props.element === state.pour ? null : { erreur: null, pour: props.element }
  }

  override componentDidCatch(erreur: Error) {
    console.error('Notak : un élément n’a pas pu s’afficher', erreur)
  }

  override render() {
    if (!this.state.erreur) return this.props.children
    if (this.props.repli !== undefined) return this.props.repli
    return (
      <div className="notak-element-casse" role="note">
        {t('garde.element')}
      </div>
    )
  }
}
