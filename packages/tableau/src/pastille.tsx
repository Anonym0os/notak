import { useEffect, useState } from 'react'

/** L'initiale d'un nom, en majuscule. */
export const initialeDe = (nom: string) => [...nom.trim()][0]?.toLocaleUpperCase('fr') ?? '?'

/**
 * Une pastille de personne : sa photo si elle en a une et qu'elle se charge, sinon son initiale sur sa couleur.
 * Une photo qui ne se charge pas (fichier retiré, réseau) laisse l'initiale.
 */
export function PastillePersonne({
  nom,
  couleur,
  adresse,
  className = 'notak-pastille',
  titre,
}: {
  nom: string
  couleur: string
  /** L'adresse de la photo, ou rien. */
  adresse?: string | undefined
  className?: string
  titre?: string
}) {
  const [cassee, setCassee] = useState(false)
  useEffect(() => setCassee(false), [adresse])
  const photo = adresse && !cassee
  return (
    <span className={className} style={{ background: couleur }} title={titre ?? nom} data-photo={photo ? '' : undefined}>
      {photo ? <img src={adresse} alt="" draggable={false} onError={() => setCassee(true)} /> : initialeDe(nom)}
    </span>
  )
}
