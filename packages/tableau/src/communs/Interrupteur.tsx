interface Props {
  actif: boolean
  /** Au geste (clic, Espace, Entrée), avec la valeur que prend l'interrupteur. */
  onChange?(actif: boolean): void
  inactif?: boolean | undefined
  /** Ce que lit un lecteur d'écran. */
  libelle?: string | undefined
  /** L'infobulle. */
  titre?: string | undefined
  className?: string | undefined
  /** Le seul dessin, sans bouton : pour une ligne de menu (`menuitemcheckbox`) qui porte déjà l'état et le clic. */
  decor?: boolean | undefined
}

/**
 * L'interrupteur de Notak (maquette « Composants communs », .nk-inter) : 30 × 18 px, poignée de 14 ; éteint, une piste
 * grise ; allumé, la couleur du texte. Un seul pour les réglages de la carte, de la présentation, du document.
 */
export function Interrupteur({ actif, onChange, inactif, libelle, titre, className, decor }: Props) {
  const classes = ['notak-inter', className].filter(Boolean).join(' ')
  if (decor) return <span className={classes} data-actif={actif ? '' : undefined} aria-hidden />
  return (
    <button type="button" role="switch" className={classes} aria-checked={actif} aria-label={libelle ?? titre} title={titre} disabled={inactif} onClick={() => onChange?.(!actif)} />
  )
}
