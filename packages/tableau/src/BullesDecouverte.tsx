import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { type EspaceNavigable } from './coeur/espace'
import { type Id, surLeTableau } from './coeur/tableau'
import { type GesteDecouverte, bulleAMontrer, vuesDuCompte } from './decouverte'

/**
 * Les bulles de découverte du tableau ouvert. Une seule à la fois, une seule fois par geste et par compte.
 * Une bulle qu'on a laissée derrière soi (le tableau n'est plus vide) compte pour vue.
 */
export function BullesDecouverte({
  espace,
  tableau,
  compte,
}: {
  espace: EspaceNavigable & { synchronise?(id: Id): boolean }
  tableau: Id
  compte: string
}) {
  const vues = useMemo(() => vuesDuCompte(compte), [compte])
  const [vu, setVu] = useState(() => vues.lire())
  // Tant que le tableau n'a pas rattrapé le serveur, « vide » ne veut encore rien dire.
  const nombre = useSyncExternalStore(espace.ecouter, () => {
    if (espace.synchronise && !espace.synchronise(tableau)) return -1
    return surLeTableau(espace.magasin(tableau).lire()).length
  })
  const lectureSeule = useSyncExternalStore(espace.ecouter, () => espace.lectureSeule?.(tableau) ?? false)
  const bulle = nombre < 0 ? null : bulleAMontrer(vu, { nombre, lectureSeule })

  const noter = (geste: GesteDecouverte) => {
    vues.noter(geste)
    setVu(vues.lire())
  }
  const affichee = useRef<GesteDecouverte | null>(null)
  useEffect(() => {
    const avant = affichee.current
    affichee.current = bulle?.geste ?? null
    if (avant && avant !== bulle?.geste) noter(avant)
  }, [bulle?.geste])

  if (!bulle) return null
  return (
    <div className="notak-bulle-decouverte" data-ou={bulle.ou} role="status">
      <span>{bulle.texte}</span>
      <button type="button" onClick={() => noter(bulle.geste)}>
        Compris
      </button>
    </div>
  )
}
