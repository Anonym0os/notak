import { Icone } from '../icones'

export interface OptionDeChoix {
  valeur: string
  libelle: string
  inactif?: boolean
}

interface Props {
  valeur: string
  options: readonly OptionDeChoix[]
  onChange(valeur: string): void
  /** Ce que lit un lecteur d'écran. */
  libelle: string
  titre?: string | undefined
  inactif?: boolean | undefined
  /** Ce qu'on lit dans la pilule quand ce n'est pas le libellé de l'option choisie (« Auto » au lieu de « Auto (Visible) »). */
  affiche?: string | undefined
  /** À côté d'un champ de 36 px, dans un formulaire : 36 px, un filet à la place du fond gris. */
  haut?: boolean
  /** Toute la largeur de la ligne. */
  large?: boolean
  className?: string | undefined
}

/**
 * La liste déroulante compacte de Notak (maquette « Composants communs », .nk-choix) : une pilule de 30 px (le choix, un
 * chevron de 12 px). C'est le menu natif qui s'ouvre, posé par-dessus, transparent : il garde le clavier, le défilement
 * et l'accessibilité du navigateur.
 */
export function Choix({ valeur, options, onChange, libelle, titre, inactif, affiche, haut, large, className }: Props) {
  const courante = options.find((o) => o.valeur === valeur)
  return (
    <span className={['notak-choix', className].filter(Boolean).join(' ')} data-haut={haut ? '' : undefined} data-large={large ? '' : undefined} data-inactif={inactif ? '' : undefined}>
      <span className="notak-choix-texte" aria-hidden>
        {affiche ?? courante?.libelle ?? valeur}
      </span>
      <Icone nom="chevronBas" taille={12} trait={2} />
      <select value={valeur} title={titre} aria-label={libelle} disabled={inactif} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur} disabled={o.inactif}>
            {o.libelle}
          </option>
        ))}
      </select>
    </span>
  )
}
