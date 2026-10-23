import { t } from './langue'
import { useEffect, useState } from 'react'
import { definirFavori, listerFavoris, noterVu } from './api'
import { Icone } from '@notak/tableau'

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
      title={favori ? t('favori.retirer') : t('favori.mettre')}
      onClick={bascule}
    >
      <Icone nom={favori ? 'favoriPlein' : 'favori'} />
      <span className="sr-seulement">{favori ? t('favori.retirer') : t('favori.mettre')}</span>
    </button>
  )
}
