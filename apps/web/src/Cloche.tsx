import { useCallback, useEffect, useState } from 'react'
import { type GenreNotification, type ListeNotifications, type Notification, listerNotifications, marquerLues } from './api'
import { quand } from './Activite'
import { t, tn } from './langue'
import { FeuilleBas, Icone, Infobulle, PastillePersonne, demanderLeFil, filDemande, montrerDemande } from '@notak/tableau'
import { usePanneau } from './panneaux'

const RAFRAICHIR_MS = 30_000

const TEXTES: Record<GenreNotification, (n: Notification) => string> = {
  commentaire: (n) => t('cloche.commentaire', { nom: n.auteur.nom, tableau: n.titreTableau || t('commun.sansTitre') }),
  mention: (n) => t('cloche.mention', { nom: n.auteur.nom, tableau: n.titreTableau || t('commun.sansTitre') }),
  modification: (n) => t('cloche.modification', { nom: n.auteur.nom, tableau: n.titreTableau || t('commun.sansTitre') }),
  partage: (n) => t('cloche.partage', { nom: n.auteur.nom, tableau: n.titreTableau || t('commun.sansTitre') }),
  reaction: (n) => t('cloche.reaction', { nom: n.auteur.nom, emojis: (n.emojis ?? []).join(' '), tableau: n.titreTableau || t('commun.sansTitre') }),
}

/** Ce que dit une notification ; `null` pour un genre que l'app ne sait pas dire (d'un serveur plus récent). */
export const texteDe = (n: Notification): string | null => (Object.hasOwn(TEXTES, n.genre) ? TEXTES[n.genre](n) : null)

/** Ce qui parle d'un message : un commentaire, une mention, une réaction. La notification mène à son fil. */
const DANS_UN_FIL: readonly GenreNotification[] = ['commentaire', 'mention', 'reaction']

/**
 * Les notifications du compte : relues toutes les 30 s, et dès que leur liste s'ouvre (`ouvert`). `lire` les marque
 * lues (toutes, sans ids).
 */
export function useNotifications(ouvert: boolean) {
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
  return { liste, erreur, lire, nonLues: liste?.nonLues ?? 0 }
}

export type Notifications = ReturnType<typeof useNotifications>

/**
 * Où mène une notification : son tableau, et pour un commentaire, une mention ou une réaction, le fil du message, comme
 * chez Notion, qui ouvre la page sur la discussion. La toile se pose sur l'élément qui le porte (l'épingle, la carte, la
 * note) et ouvre le fil ; un document ou une carte mentale s'ouvrent en grand, sur le passage ou le sujet.
 */
export function suivreNotification(n: Notification, ouvrir: (tableau: string) => void) {
  if (DANS_UN_FIL.includes(n.genre) && n.element) demanderLeFil(n.element, n.fil ?? '')
  ouvrir(n.tableau)
}

/**
 * L'élément dont une notification suivie veut ouvrir le fil, tant qu'aucune toile ne l'a pris ; sinon `null`. Un dossier
 * s'ouvre en liste, sans toile : c'est son adresse qui le porte, et la liste l'ouvre en grand (une page, une carte).
 */
export function elementDuFilDemande(): string | null {
  const element = montrerDemande()
  return element && filDemande(element) !== null ? element : null
}

/** La tête (« Tout marquer comme lu ») et la liste ; toucher une notification la lit et y mène (`suivreNotification`). */
function ListeDesNotifications({ notifications: { liste, erreur, lire, nonLues }, aller }: { notifications: Notifications; aller(n: Notification): void }) {
  // Un genre que l'app ne sait pas dire ne se montre pas, plutôt que de casser la liste.
  const montrees = liste?.notifications.flatMap((n) => {
    const texte = texteDe(n)
    return texte === null ? [] : [{ n, texte }]
  })
  return (
    <>
      <div className="app-panneau-tete">
        <span>{t('cloche.titre')}</span>
        <button type="button" className="bouton-lien" disabled={nonLues === 0} onClick={() => lire()}>
          {t('cloche.toutLu')}
        </button>
      </div>
      {((erreur && !liste) || montrees?.length === 0) && (
        <p className="app-panneau-vide">
          <Icone nom="cloche" taille={22} trait={1.5} />
          {erreur && !liste ? t('cloche.indisponibles') : t('cloche.rien')}
        </p>
      )}
      <ul className="cloche-liste">
        {montrees?.map(({ n, texte }) => (
          <li key={n.id} data-lu={n.lu || undefined}>
            <button
              type="button"
              onClick={() => {
                if (!n.lu) lire([n.id])
                aller(n)
              }}
            >
              <PastillePersonne nom={n.auteur.nom} couleur={n.auteur.couleur} titre="" />
              <span className="cloche-texte">
                <span>{texte}</span>
                {n.extrait && n.genre !== 'partage' && <small className="activite-elements">{n.extrait}</small>}
                <small>{quand(n.instant)}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

/** La cloche de l'en-tête : le nombre de notifications non lues, et leur liste. */
export function Cloche({ ouvrir }: { ouvrir(tableau: string): void }) {
  const { ouvert, regler, basculer, ancre, bouton, panneau } = usePanneau<HTMLDivElement, HTMLButtonElement>()
  const notifications = useNotifications(ouvert)
  const { nonLues } = notifications
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
          <ListeDesNotifications
            notifications={notifications}
            aller={(n) => {
              regler(false)
              suivreNotification(n, ouvrir)
            }}
          />
        </div>
      )}
    </div>
  )
}

/** Au téléphone, la même liste dans une feuille du bas : la cloche n'a plus de place dans la barre (`CompteTelephone`). */
export function NotificationsEnFeuille({ notifications, ouvrir, fermer }: { notifications: Notifications; ouvrir(tableau: string): void; fermer(): void }) {
  return (
    <FeuilleBas fermer={fermer} className="cloche-feuille">
      <div role="dialog" aria-label={t('cloche.titre')}>
        <ListeDesNotifications
          notifications={notifications}
          aller={(n) => {
            fermer()
            suivreNotification(n, ouvrir)
          }}
        />
      </div>
    </FeuilleBas>
  )
}
