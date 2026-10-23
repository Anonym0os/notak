import type { EspaceDistant } from '@notak/tableau'
import { useEffect, useRef, useState } from 'react'
import { deposerDansAccueil, messageDuDepot } from './deposer'
import { lireArrivee, oublierArrivee } from './recuDuPartage'

/**
 * La page `/partage`, où mène le partage d'une page, d'un texte ou d'images vers Notak : ce qui est arrivé va dans
 * les non triés de l'accueil, puis on rend la main à l'application.
 */
export function PagePartage({ espace }: { espace: EspaceDistant }) {
  const [etat, setEtat] = useState<{ type: 'cours' } | { type: 'vide' } | { type: 'fini'; message: string; local: boolean } | { type: 'echec' }>({ type: 'cours' })
  // Une seule fois, même quand React monte la page deux fois : poser deux fois ferait des doublons.
  const lance = useRef(false)
  useEffect(() => {
    if (lance.current) return
    lance.current = true
    void (async () => {
      try {
        const arrivee = await lireArrivee(location.search)
        if (!arrivee) return setEtat({ type: 'vide' })
        const depot = await deposerDansAccueil(espace, arrivee)
        await oublierArrivee(location.search)
        if (depot.ajoutes === 0) return setEtat({ type: 'vide' })
        setEtat({ type: 'fini', message: messageDuDepot(depot), local: depot.etat === 'local' })
      } catch {
        setEtat({ type: 'echec' })
      }
    })()
  }, [espace])

  // Reçu par le serveur : on rend la main à l'accueil. Gardé ici seulement : on laisse lire.
  useEffect(() => {
    if (etat.type !== 'fini' || etat.local) return
    const t = setTimeout(() => location.replace('/'), 1500)
    return () => clearTimeout(t)
  }, [etat])

  return (
    <main className="arrivee">
      <div className="arrivee-carte" role="status">
        <h1>Notak</h1>
        <p>
          {etat.type === 'cours' && 'Ajout aux non triés…'}
          {etat.type === 'vide' && 'Rien à ajouter : ce partage ne contenait ni texte, ni adresse, ni image que Notak sache prendre.'}
          {etat.type === 'fini' && etat.message}
          {etat.type === 'echec' && 'Le partage n’a pas pu être posé. Il reste de côté : rouvrez cette page pour réessayer.'}
        </p>
        {etat.type !== 'cours' && (
          <a className="bouton bouton-plein" href="/">
            Ouvrir Notak
          </a>
        )}
      </div>
    </main>
  )
}
