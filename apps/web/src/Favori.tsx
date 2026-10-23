import { useEffect, useState } from 'react'
import { definirFavori, listerFavoris, noterVu } from './api'

/**
 * L'étoile du tableau ouvert : le mettre en favori ou l'en retirer. Montrer le tableau ici, c'est aussi
 * l'inscrire parmi les récents du compte.
 */
export function Favori({ tableau, accueil }: { tableau: string; accueil: string }) {
  const [favori, setFavori] = useState<boolean | null>(null)
  useEffect(() => {
    if (tableau === accueil) return
    void noterVu(tableau)
    let vivant = true
    setFavori(null)
    listerFavoris().then(
      (l) => vivant && setFavori(l.some((t) => t.id === tableau)),
      () => vivant && setFavori(null),
    )
    return () => {
      vivant = false
    }
  }, [tableau, accueil])

  if (tableau === accueil) return null
  const bascule = () => {
    if (favori === null) return
    const voulu = !favori
    setFavori(voulu)
    definirFavori(tableau, voulu).catch(() => setFavori(!voulu))
  }
  return (
    <button
      type="button"
      className="bouton bouton-etoile"
      disabled={favori === null}
      aria-pressed={favori === true}
      title={favori ? 'Retirer des favoris' : 'Mettre en favori'}
      onClick={bascule}
    >
      <span aria-hidden>{favori ? '★' : '☆'}</span>
      <span className="sr-seulement">{favori ? 'Retirer des favoris' : 'Mettre en favori'}</span>
    </button>
  )
}
