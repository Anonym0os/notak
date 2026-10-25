import { useCallback, useEffect, useState } from 'react'
import { type GenreNotification, type ListeNotifications, type Notification, listerNotifications, marquerLues } from './api'
import { quand } from './Activite'
import { t, tn } from './langue'
import { Icone, Infobulle, PastillePersonne } from '@notak/tableau'
import { usePanneau } from './panneaux'

const RAFRAICHIR_MS = 30_000

const TEXTES: Record<GenreNotification, (n: Notification) => string> = {
  commentaire: (n) => t('cloche.commentaire', { nom: n.auteur.nom, tableau: n.titreTableau || t('commun.sansTitre') }),
  mention: (n) => t('cloche.mention', { nom: n.auteur.nom, tableau: n.titreTableau || t('commun.sansTitre') }),
  modification: (n) => t('cloche.modification', { nom: n.auteur.nom, tableau: n.titreTableau || t('commun.sansTitre') }),
  partage: (n) => t('cloche.partage', { nom: n.auteur.nom, tableau: n.titreTableau || t('commun.sansTitre') }),
}

/** La cloche de l'en-tête : le nombre de notifications non lues, et leur liste. */
export function Cloche({ ouvrir }: { ouvrir(tableau: string): void }) {
  const { ouvert, regler, basculer, ancre, bouton, panneau } = usePanneau<HTMLDivElement, HTMLButtonElement>()
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
    regler(false)
    ouvrir(n.tableau)
  }

  const nonLues = liste?.nonLues ?? 0
  return (
    <div className="cloche" ref={ancre}>
      <Infobulle libelle={nonLues > 0 ? tn('cloche.nonLues', nonLues) : t('cloche.titre')} desactivee={ouvert}>
        <button type="button" ref={bouton} className="bouton bouton-nu bouton-cloche" aria-expanded={ouvert} onClick={basculer}>
          <Icone nom="cloche" taille={22} trait={1.5} />
          <span className="sr-seulement">{t('cloche.titre')}</span>
          {nonLues > 0 && <span className="cloche-compte">{nonLues > 99 ? '99+' : nonLues}</span>}
        </button>
      </Infobulle>
      {ouvert && (
        <div className="app-panneau cloche-panneau" ref={panneau} role="dialog" aria-label={t('cloche.titre')}>
          <div className="app-panneau-tete">
            <span>{t('cloche.titre')}</span>
            <button type="button" className="bouton-lien" disabled={nonLues === 0} onClick={() => lire()}>
              {t('cloche.toutLu')}
            </button>
          </div>
          {((erreur && !liste) || liste?.notifications.length === 0) && (
            <p className="app-panneau-vide">
              <Icone nom="cloche" taille={22} trait={1.5} />
              {erreur && !liste ? t('cloche.indisponibles') : t('cloche.rien')}
            </p>
          )}
          <ul className="cloche-liste">
            {liste?.notifications.map((n) => (
              <li key={n.id} data-lu={n.lu || undefined}>
                <button type="button" onClick={() => aller(n)}>
                  <PastillePersonne className="app-pastille" nom={n.auteur.nom} couleur={n.auteur.couleur} titre="" />
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
