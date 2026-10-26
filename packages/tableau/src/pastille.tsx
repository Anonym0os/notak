import { useEffect, useState } from 'react'

/** L'initiale d'un nom, en majuscule. */
export const initialeDe = (nom: string) => [...nom.trim()][0]?.toLocaleUpperCase('fr') ?? '?'

/** Les tailles de l'avatar (maquette « Composants communs », .nk-av) : 28 par défaut. */
export type TailleAvatar = 20 | 24 | 28 | 36

/**
 * L'avatar de Notak, le seul : la photo de la personne si elle en a une et qu'elle se charge, sinon son initiale sur sa
 * couleur. Une photo qui ne se charge pas (fichier retiré, réseau) laisse l'initiale. Soi-même est toujours vert
 * (`--notak-soi`). `className` ne sert qu'à placer l'avatar, jamais à le redessiner.
 */
export function PastillePersonne({
  nom,
  couleur,
  adresse,
  taille = 28,
  soi,
  className,
  titre,
  etiquette,
}: {
  nom: string
  /** Sa couleur ; absente, le gris des personnes sans couleur. */
  couleur?: string | undefined
  /** L'adresse de la photo, ou rien. */
  adresse?: string | undefined
  taille?: TailleAvatar
  /** C'est la personne qui regarde : l'avatar est vert, quelle que soit sa couleur. */
  soi?: boolean
  className?: string
  titre?: string
  /** Ce que lit un lecteur d'écran, quand l'avatar dit quelque chose en plus du nom. */
  etiquette?: string
}) {
  const [cassee, setCassee] = useState(false)
  useEffect(() => setCassee(false), [adresse])
  const photo = adresse && !cassee
  const classes = ['notak-av', taille !== 28 && `notak-av-${taille}`, soi && 'notak-soi', className].filter(Boolean).join(' ')
  return (
    <span className={classes} style={couleur && !soi ? { background: couleur } : undefined} title={titre ?? nom} aria-label={etiquette} data-photo={photo ? '' : undefined}>
      {photo ? <img src={adresse} alt="" draggable={false} onError={() => setCassee(true)} /> : initialeDe(nom)}
    </span>
  )
}
