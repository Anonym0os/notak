import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { decaler, decalerJourDeMois, decalerMois, initialesDesJours, jourDe, lundiEnPremier, nomDuMois, semaines } from './dates'
import { t } from '../langue'
import { Icone } from '../icones'
import './calendrier.css'

export interface PropsCalendrier {
  /** Le jour choisi, `AAAA-MM-JJ`, ou `null`. */
  valeur: string | null
  /** Le jour qu'on cercle, `AAAA-MM-JJ` ; par défaut celui d'aujourd'hui. */
  aujourdhui?: string
  /** Un jour choisi (clic, Entrée ou Espace) ; `null` quand on efface la date. */
  choisir(jour: string | null): void
  /** Le jour dont on montre le mois à l'ouverture quand rien n'est choisi ; par défaut aujourd'hui. */
  depart?: string
  /** Le premier et le dernier jour qu'on peut choisir (le jour déjà choisi reste toujours atteignable). */
  min?: string
  max?: string
  /** Cliquer le jour déjà choisi efface la date. */
  effacable?: boolean
  /** Entrée sur le jour déjà choisi : on valide (la cellule d'une table se ferme), au lieu de le choisir encore. */
  confirmer?(): void
  /** Prend le focus à l'ouverture, sur le jour choisi (ou aujourd'hui), pour que les flèches marchent aussitôt. */
  autoFocus?: boolean
  /** Ce qui se pose sous les jours : l'heure, le rappel. */
  children?: ReactNode
}

/**
 * Le calendrier de Notak, partout où l'on choisit un jour : l'échéance d'une tâche ou d'un élément, une cellule de
 * date de table, le planning d'un sujet de la carte. 292 px, un mois à la fois (flèches pour passer à l'autre), six
 * semaines fixes, les jours des mois voisins masqués. Aujourd'hui est cerclé en gris, le jour choisi est en gras et
 * cerclé en foncé.
 *
 * Au clavier : les flèches changent de jour (et de mois au bord), Pag. préc./suiv. de mois, Début/Fin vont au
 * premier et au dernier jour du mois, Entrée ou Espace choisit. Échap n'est pas pris ici : il remonte à la fenêtre
 * qui porte le calendrier, qui se ferme.
 */
export function Calendrier({ valeur, aujourdhui, choisir, depart: debut, min, max, effacable, confirmer, autoFocus, children }: PropsCalendrier) {
  const auj = aujourdhui ?? jourDe(new Date())
  const depart = valeur ?? debut ?? auj
  const [vu, setVu] = useState(() => ({ annee: Number(depart.slice(0, 4)), mois: Number(depart.slice(5, 7)) - 1 }))
  const [actif, setActif] = useState(depart)
  const racine = useRef<HTMLDivElement>(null)
  // Le jour à focaliser une fois le mois redessiné (après une flèche du clavier).
  const aFocaliser = useRef<string | null>(null)
  const lundi = lundiEnPremier()
  const grille = semaines(vu.annee, vu.mois, lundi).flat()
  const jours = grille.filter((j): j is string => j !== null)
  // Le jour qu'on atteint avec Tab : le dernier visité, sinon le choisi, sinon le premier du mois.
  const tabule = jours.includes(actif) ? actif : valeur && jours.includes(valeur) ? valeur : jours.includes(auj) ? auj : jours[0]!
  const hors = (jour: string) => jour !== valeur && ((min !== undefined && jour < min) || (max !== undefined && jour > max))

  const focaliser = (jour: string) => racine.current?.querySelector<HTMLElement>(`[data-jour="${jour}"]`)?.focus({ preventScroll: true })
  useEffect(() => {
    if (autoFocus) focaliser(tabule)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Après une flèche du clavier, le jour visé prend le focus une fois le mois redessiné.
  useEffect(() => {
    const jour = aFocaliser.current
    aFocaliser.current = null
    if (jour) focaliser(jour)
  }, [vu, actif]) // eslint-disable-line react-hooks/exhaustive-deps

  const aller = (n: number) => setVu((v) => decalerMois(v.annee, v.mois, n))
  const poser = (jour: string) => {
    if (hors(jour)) return
    choisir(effacable && jour === valeur ? null : jour)
  }
  const deplacer = (jour: string) => {
    const borne = min !== undefined && jour < min ? min : max !== undefined && jour > max ? max : jour
    aFocaliser.current = borne
    setActif(borne)
    setVu({ annee: Number(borne.slice(0, 4)), mois: Number(borne.slice(5, 7)) - 1 })
  }
  const touche = (e: KeyboardEvent<HTMLElement>) => {
    const jour = (e.target as HTMLElement).closest<HTMLElement>('[data-jour]')?.dataset.jour
    if (!jour || e.altKey || e.ctrlKey || e.metaKey) return
    const suite: Record<string, string> = {
      ArrowLeft: decaler(jour, -1),
      ArrowRight: decaler(jour, 1),
      ArrowUp: decaler(jour, -7),
      ArrowDown: decaler(jour, 7),
      PageUp: decalerJourDeMois(jour, -1),
      PageDown: decalerJourDeMois(jour, 1),
      Home: `${jour.slice(0, 8)}01`,
      End: jours.at(-1)!,
    }
    if (e.key in suite) {
      e.preventDefault()
      e.stopPropagation()
      deplacer(suite[e.key]!)
    } else if (e.key === 'Enter' || e.key === ' ') {
      // Choisi ici, sans laisser Entrée valider la fenêtre qui porte le calendrier.
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Enter' && jour === valeur && confirmer) confirmer()
      else poser(jour)
    }
  }
  return (
    <div className="notak-cal" ref={racine}>
      <div className="notak-cal-tete">
        <button type="button" className="notak-cal-fleche" aria-label={t('taches.moisPrecedent')} onClick={() => aller(-1)}>
          <Icone nom="gauche" taille={16} />
        </button>
        <strong className="notak-cal-mois" aria-live="polite">
          {nomDuMois(vu.annee, vu.mois)}
        </strong>
        <button type="button" className="notak-cal-fleche" aria-label={t('taches.moisSuivant')} onClick={() => aller(1)}>
          <Icone nom="droite" taille={16} />
        </button>
      </div>
      <div className="notak-cal-grille" role="group" aria-label={nomDuMois(vu.annee, vu.mois)} onKeyDown={touche}>
        {initialesDesJours(lundi).map((j, i) => (
          <span key={i} className="notak-cal-initiale" aria-hidden>
            {j}
          </span>
        ))}
        {grille.map((jour, i) =>
          jour === null ? (
            <span key={i} className="notak-cal-vide" />
          ) : (
            <button
              key={i}
              type="button"
              className="notak-cal-jour"
              data-jour={jour}
              tabIndex={jour === tabule ? 0 : -1}
              aria-pressed={jour === valeur}
              data-aujourdhui={jour === auj ? '' : undefined}
              disabled={hors(jour)}
              onClick={() => poser(jour)}
            >
              {Number(jour.slice(8))}
            </button>
          ),
        )}
      </div>
      {children}
    </div>
  )
}
