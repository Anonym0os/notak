import type { ReactNode } from 'react'

/** Un bouton d'un contrôle segmenté. */
export interface OptionSegment<V = string> {
  valeur: V
  /** Son texte, ou son icône. */
  libelle?: ReactNode
  /** Un détail plus pâle à côté du libellé (« 8 px », la langue du navigateur). */
  detail?: string
  /** Son infobulle, et ce que lit un lecteur d'écran quand il n'a qu'une icône. */
  titre?: string
  /** Ce que lit un lecteur d'écran, quand ce n'est pas l'infobulle. */
  etiquette?: string
  inactif?: boolean
  lang?: string
  /** En mode `bascules` : ce bouton est enfoncé. */
  actif?: boolean
}

interface Props<V> {
  options: readonly OptionSegment<V>[]
  /**
   * `choix` : un seul est enfoncé, c'est `valeur` (radios) ; `onglets` : idem, pour des onglets ; `bascules` : chacun
   * porte son état dans `actif` (gras, italique…).
   */
  mode?: 'choix' | 'onglets' | 'bascules'
  valeur?: unknown
  onChange(valeur: V): void
  /** Ce que lit un lecteur d'écran sur le groupe. */
  libelle?: string | undefined
  /** Tout le groupe est inactif. */
  inactif?: boolean | undefined
  /** Le groupe prend toute la largeur et les boutons se les partagent. */
  large?: boolean | undefined
  /** Un contrôle de plus au bout du groupe, de la même hauteur (le menu de la casse). */
  suite?: ReactNode
  className?: string | undefined
}

/**
 * Le contrôle segmenté de Notak (maquette « Composants communs », .nk-seg) : un rail gris de rayon 10 et, dedans, des
 * boutons de 28 px ; celui qui est enfoncé est blanc. Il remplace la pilule des réglages, les boutons de style de la
 * carte, la mise en page de la présentation et les onglets en capsule.
 */
export function Segments<V = string>({ options, mode = 'choix', valeur, onChange, libelle, inactif, large, suite, className }: Props<V>) {
  const role = mode === 'choix' ? 'radiogroup' : mode === 'onglets' ? 'tablist' : 'group'
  return (
    <div className={['notak-seg', className].filter(Boolean).join(' ')} role={role} aria-label={libelle} data-large={large ? '' : undefined}>
      {options.map((o) => {
        const enfonce = mode === 'bascules' ? !!o.actif : o.valeur === valeur
        const etat = mode === 'choix' ? { role: 'radio', 'aria-checked': enfonce } : mode === 'onglets' ? { role: 'tab', 'aria-selected': enfonce } : { 'aria-pressed': enfonce }
        return (
          <button
            key={String(o.valeur)}
            type="button"
            title={o.titre}
            aria-label={o.etiquette ?? (typeof o.libelle === 'string' ? undefined : o.titre)}
            lang={o.lang}
            disabled={inactif || o.inactif}
            onClick={() => onChange(o.valeur)}
            {...etat}
          >
            {o.libelle}
            {o.detail && <small>{o.detail}</small>}
          </button>
        )
      })}
      {suite}
    </div>
  )
}
