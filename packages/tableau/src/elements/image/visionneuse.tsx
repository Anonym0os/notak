import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { Id } from '../../coeur/tableau'

/** L'image montrée en grand, une seule à la fois : la carte qui la porte l'affiche par-dessus la page. */
let ouverte: Id | null = null
const ecouteurs = new Set<() => void>()

export const imageOuverte = () => ouverte
export function ouvrirImage(id: Id | null) {
  if (ouverte === id) return
  ouverte = id
  for (const f of ecouteurs) f()
}
const ecouter = (f: () => void) => {
  ecouteurs.add(f)
  return () => ecouteurs.delete(f)
}

export const useImageOuverte = () => useSyncExternalStore(ecouter, imageOuverte)

/** L'image en grand, sur un voile sombre. Un clic, Échap ou Espace la referment. */
export function Visionneuse({ adresse, legende }: { adresse: string; legende?: string }) {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== ' ') return
      e.preventDefault()
      e.stopPropagation()
      ouvrirImage(null)
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [])
  return createPortal(
    <div className="notak-visionneuse" role="dialog" aria-label={legende || 'Image'} onPointerDown={() => ouvrirImage(null)}>
      <img src={adresse} alt={legende ?? ''} />
      {legende && <p>{legende}</p>}
    </div>,
    document.body,
  )
}
