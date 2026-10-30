import { t } from './langue'
import { useEffect, useState } from 'react'
import { definirFavori, listerFavoris, noterVu } from './api'
import { Icone, Infobulle } from '@notak/tableau'

/**
 * Le tableau ouvert est-il en favori (`null` tant qu'on ne sait pas, et toujours pour l'accueil), et de quoi le changer.
 * Le montrer, c'est aussi l'inscrire parmi les récents du compte.
 */
export function useFavori(tableau: string, accueil: string) {
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

  const bascule = () => {
    if (favori === null) return
    const voulu = !favori
    setFavori(voulu)
    definirFavori(tableau, voulu).catch(() => setFavori(!voulu))
  }
  return { favori: tableau === accueil ? null : favori, sansObjet: tableau === accueil, bascule }
}

/** L'étoile du tableau ouvert : le mettre en favori ou l'en retirer. */
export function Favori({ tableau, accueil }: { tableau: string; accueil: string }) {
  const { favori, sansObjet, bascule } = useFavori(tableau, accueil)
  if (sansObjet) return null
  return (
    <Infobulle libelle={favori ? t('favori.retirer') : t('favori.mettre')}>
      <button type="button" className="bouton bouton-nu bouton-etoile" disabled={favori === null} aria-pressed={favori === true} onClick={bascule}>
        <Icone nom={favori ? 'favoriPlein' : 'favori'} taille={22} trait={1.5} />
        <span className="sr-seulement">{favori ? t('favori.retirer') : t('favori.mettre')}</span>
      </button>
    </Infobulle>
  )
}
