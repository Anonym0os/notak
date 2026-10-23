import { useCallback, useEffect, useState } from 'react'
import { type GenreNotification, type ListeNotifications, type Notification, listerNotifications, marquerLues } from './api'
import { quand } from './Activite'

const RAFRAICHIR_MS = 30_000

const TEXTES: Record<GenreNotification, (n: Notification) => string> = {
  commentaire: (n) => `${n.auteur.nom} a commenté dans « ${n.titreTableau || 'Sans titre'} »`,
  mention: (n) => `${n.auteur.nom} vous a cité dans « ${n.titreTableau || 'Sans titre'} »`,
  modification: (n) => `${n.auteur.nom} a modifié « ${n.titreTableau || 'Sans titre'} »`,
  partage: (n) => `${n.auteur.nom} a partagé « ${n.titreTableau || 'Sans titre'} » avec vous`,
}

/** La cloche de l'en-tête : le nombre de notifications non lues, et leur liste. */
export function Cloche({ ouvrir }: { ouvrir(tableau: string): void }) {
  const [ouvert, setOuvert] = useState(false)
  const [liste, setListe] = useState<ListeNotifications | null>(null)
  const [erreur, setErreur] = useState(false)

  const charger = useCallback(() => {
    listerNotifications().then(
      (l) => {
        setListe(l)
        setErreur(false)
      },
      () => setErreur(true),
    )
  }, [])
  useEffect(() => {
    charger()
    const minuteur = setInterval(() => !document.hidden && charger(), RAFRAICHIR_MS)
    return () => clearInterval(minuteur)
  }, [charger])
  // Ouverte, la liste se relit : ce qui vient d'arriver s'y trouve.
  useEffect(() => {
    if (ouvert) charger()
  }, [ouvert, charger])

  useEffect(() => {
    if (!ouvert) return
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && setOuvert(false)
    const hors = (e: PointerEvent) => !(e.target as HTMLElement).closest('.cloche') && setOuvert(false)
    document.addEventListener('keydown', touche)
    document.addEventListener('pointerdown', hors)
    return () => {
      document.removeEventListener('keydown', touche)
      document.removeEventListener('pointerdown', hors)
    }
  }, [ouvert])

  const lire = (ids?: number[]) => {
    // Lues tout de suite à l'écran ; le serveur suit, et la relecture corrige si besoin.
    setListe((l) =>
      l
        ? {
            notifications: l.notifications.map((n) => (!ids || ids.includes(n.id) ? { ...n, lu: true } : n)),
            nonLues: ids ? Math.max(0, l.nonLues - l.notifications.filter((n) => !n.lu && ids.includes(n.id)).length) : 0,
          }
        : l,
    )
    marquerLues(ids).then(charger, charger)
  }
  const aller = (n: Notification) => {
    if (!n.lu) lire([n.id])
    setOuvert(false)
    ouvrir(n.tableau)
  }

  const nonLues = liste?.nonLues ?? 0
  return (
    <div className="cloche">
      <button
        type="button"
        className="bouton bouton-cloche"
        aria-expanded={ouvert}
        title={nonLues > 0 ? `${nonLues} notification${nonLues > 1 ? 's' : ''} non lue${nonLues > 1 ? 's' : ''}` : 'Notifications'}
        onClick={() => setOuvert((o) => !o)}
      >
        <span aria-hidden>🔔</span>
        <span className="sr-seulement">Notifications</span>
        {nonLues > 0 && <span className="cloche-compte">{nonLues > 99 ? '99+' : nonLues}</span>}
      </button>
      {ouvert && (
        <div className="cloche-panneau" role="dialog" aria-label="Notifications">
          <div className="cloche-tete">
            <strong>Notifications</strong>
            <button type="button" className="bouton-lien" disabled={nonLues === 0} onClick={() => lire()}>
              Tout marquer comme lu
            </button>
          </div>
          {erreur && !liste && <p className="partage-note">Notifications indisponibles.</p>}
          {liste && liste.notifications.length === 0 && <p className="partage-note">Rien de neuf. Les commentaires, les mentions et les modifications des autres arriveront ici.</p>}
          <ul className="cloche-liste">
            {liste?.notifications.map((n) => (
              <li key={n.id} data-lu={n.lu || undefined}>
                <button type="button" onClick={() => aller(n)}>
                  <span className="activite-pastille" style={{ background: n.auteur.couleur }} aria-hidden />
                  <span className="cloche-texte">
                    <span>{TEXTES[n.genre](n)}</span>
                    {n.extrait && n.genre !== 'partage' && <small className="activite-elements">{n.extrait}</small>}
                    <small>{quand(n.instant)}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
