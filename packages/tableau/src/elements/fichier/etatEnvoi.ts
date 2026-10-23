import { useSyncExternalStore } from 'react'
import { fermerBanque } from '../image/banqueImages'

// — Ouvert ou fermé : l'outil d'envoi de la barre et son panneau ne se connaissent pas, ils se parlent ici. —
let ouvert = false
const abonnes = new Set<() => void>()
const changer = (v: boolean) => {
  if (ouvert === v) return
  ouvert = v
  abonnes.forEach((f) => f())
}

/** Ouvre ou ferme le panneau d'envoi ; l'ouvrir referme celui des images. */
export const basculerEnvoi = () => {
  if (!ouvert) fermerBanque()
  changer(!ouvert)
}
export const fermerEnvoi = () => changer(false)
export const envoiOuvert = () => ouvert
export const useEnvoiOuvert = () =>
  useSyncExternalStore(
    (f) => {
      abonnes.add(f)
      return () => abonnes.delete(f)
    },
    () => ouvert,
    () => false,
  )
