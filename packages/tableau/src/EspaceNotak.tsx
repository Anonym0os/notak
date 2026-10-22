import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Camera } from './coeur/camera'
import {
  type EspaceNavigable,
  type Vues,
  avancer,
  courantDe,
  lireVues,
  memoriserVue,
  ouvrir as ouvrirParcours,
  parcoursDepart,
  reculer,
  tronquerFil,
} from './coeur/espace'
import type { Id } from './coeur/tableau'
import { demanderRenommage } from './elements/tableau/renommage'
import type { Presence, Services } from './elements/types'
import { Toile } from './Toile'

const CLE_VUES = 'notak:vues'
const LIBELLE_RACINE = 'Accueil'
/** Largeur estimée d'un segment du fil (texte, séparateur), en pixels : le titre est coupé à 160. */
const largeurSegment = (titre: string) => Math.min(160, 8 + titre.length * 7.2) + 24
const LARGEUR_SUSPENSION = 44
const MARGE_ENTETE = 32

function lireVuesEnregistrees(): Vues {
  try {
    return lireVues(JSON.parse(localStorage.getItem(CLE_VUES) ?? 'null'))
  } catch {
    return {}
  }
}
function ecrireVues(v: Vues) {
  try {
    localStorage.setItem(CLE_VUES, JSON.stringify(v))
  } catch {
    // Stockage plein ou interdit : la vue reste en mémoire.
  }
}

const saisissable = (cible: EventTarget | null) =>
  cible instanceof HTMLElement && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName))

interface Segment {
  id: Id
  titre: string
}

/** L'espace de tableaux : un en-tête avec le fil d'Ariane, puis la toile du tableau courant. */
export function EspaceNotak({
  espace,
  services: hote = {},
  actions,
}: {
  espace: EspaceNavigable
  services?: Services
  /** Ce que l'application ajoute à droite de l'en-tête (partage, compte), pour le tableau ouvert. */
  actions?(courant: Id): ReactNode
}) {
  const racine = espace.racine
  const [parcours, setParcours] = useState(() => parcoursDepart(racine))
  const [avis, setAvis] = useState<string | null>(null)
  const courant = courantDe(parcours)
  const lectureSeule = useSyncExternalStore(espace.ecouter, () => espace.lectureSeule?.(courant) ?? false)
  const vues = useRef<Vues | null>(null)
  vues.current ??= lireVuesEnregistrees()

  const ouvrir = useCallback(
    (id: Id) => {
      if (!espace.existe(id)) return
      demanderRenommage(null)
      setParcours((p) => {
        espace.entrer?.(id, courantDe(p))
        return ouvrirParcours(p, id)
      })
    },
    [espace],
  )

  const services = useMemo<Services>(
    () => ({
      ...hote,
      ouvrirTableau: ouvrir,
      tableau: espace.tableau,
      ecouterEspace: espace.ecouter,
      creerTableau: (titre) => espace.creerTableau(titre, courant),
      renommerTableau: espace.renommer,
      presence: espace.presence?.(courant),
      lectureSeule: lectureSeule || hote.lectureSeule,
    }),
    [hote, espace, ouvrir, courant, lectureSeule],
  )

  // Le tableau regardé reste ouvert, avec ceux vers lesquels il renvoie.
  useEffect(() => espace.retenir?.(courant), [espace, courant])

  // Un accès retiré ramène à l'accueil, une fois, avec un mot.
  const refuse = useSyncExternalStore(espace.ecouter, () => espace.refuse?.(courant) ?? false)
  useEffect(() => {
    if (!refuse || courant === racine) return
    setAvis('Accès retiré')
    setParcours(parcoursDepart(racine))
  }, [refuse, courant, racine])
  useEffect(() => {
    if (!avis) return
    const t = setTimeout(() => setAvis(null), 4000)
    return () => clearTimeout(t)
  }, [avis])

  // Le fil, lu comme une chaîne : l'en-tête ne se redessine que si le chemin ou un titre change.
  const fil = useSyncExternalStore(espace.ecouter, () => {
    const chemin = espace.chemin(courant)
    return JSON.stringify(chemin.map((id) => [id, espace.tableau(id)?.titre ?? '']))
  })
  const segments = useMemo(() => {
    const chemin = (JSON.parse(fil) as [Id, string][]).map(([id, titre]): Segment => ({ id, titre }))
    // Un tableau orphelin n'est pas sous l'accueil, mais on garde une sortie.
    if (chemin[0]?.id !== racine) chemin.unshift({ id: racine, titre: LIBELLE_RACINE })
    else chemin[0] = { id: racine, titre: LIBELLE_RACINE }
    return chemin
  }, [fil, racine])

  // Les raccourcis de navigation, sur le document : la toile qui avait le focus disparaît à chaque changement.
  const etat = useRef({ courant, ouvrir, espace })
  etat.current = { courant, ouvrir, espace }
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || saisissable(e.target)) return
      const { courant: ici, ouvrir: aller, espace: esp } = etat.current
      if (e.key.toLowerCase() === 'u') {
        const parent = esp.parent(ici)
        if (parent) aller(parent)
      } else if (e.key === '[' || e.code === 'BracketLeft') setParcours(reculer)
      else if (e.key === ']' || e.code === 'BracketRight') setParcours(avancer)
      else return
      e.preventDefault()
    }
    document.addEventListener('keydown', touche)
    return () => document.removeEventListener('keydown', touche)
  }, [])

  const corps = useRef<HTMLDivElement>(null)
  // Le focus suit la navigation : sans lui, les raccourcis de la toile ne répondent plus.
  useEffect(() => {
    demanderRenommage(null)
    corps.current?.querySelector<HTMLElement>('.notak-toile')?.focus({ preventScroll: true })
  }, [courant])

  const surCamera = useCallback(
    (c: Camera) => {
      vues.current = memoriserVue(vues.current ?? {}, courant, c, Date.now())
      ecrireVues(vues.current)
    },
    [courant],
  )

  return (
    <div className="notak-espace">
      <Entete segments={segments} courant={courant} ouvrir={ouvrir} presence={espace.presence?.(courant)} actions={actions?.(courant)} />
      {avis && <div className="notak-avis" role="status">{avis}</div>}
      <div className="notak-espace-corps" ref={corps}>
        <Toile
          key={courant}
          magasin={espace.magasin(courant)}
          services={services}
          cameraInitiale={vues.current[courant]?.camera}
          surCamera={surCamera}
        />
      </div>
    </div>
  )
}

function Entete({
  segments,
  courant,
  ouvrir,
  presence,
  actions,
}: {
  segments: Segment[]
  courant: Id
  ouvrir(id: Id): void
  presence?: Services['presence']
  actions?: ReactNode
}) {
  const entete = useRef<HTMLElement>(null)
  const [largeur, setLargeur] = useState(Number.POSITIVE_INFINITY)
  const [menu, setMenu] = useState(false)

  useLayoutEffect(() => {
    const n = entete.current!
    const mesurer = () => setLargeur(n.clientWidth - MARGE_ENTETE)
    mesurer()
    const obs = new ResizeObserver(mesurer)
    obs.observe(n)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!menu) return
    const hors = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.notak-fil-menu, .notak-fil-suspension')) setMenu(false)
    }
    document.addEventListener('pointerdown', hors)
    return () => document.removeEventListener('pointerdown', hors)
  }, [menu])

  const { visibles, caches } = tronquerFil(segments.map((s) => largeurSegment(s.titre)), largeur, LARGEUR_SUSPENSION)

  const aller = (id: Id) => {
    setMenu(false)
    ouvrir(id)
  }
  const segment = (i: number) => {
    const s = segments[i]!
    const ici = i === segments.length - 1 && s.id === courant
    return (
      <button
        key={`${s.id}:${i}`}
        type="button"
        className="notak-fil-segment"
        aria-current={ici ? 'page' : undefined}
        title={s.titre}
        onClick={() => aller(s.id)}
      >
        {s.titre || 'Sans titre'}
      </button>
    )
  }

  return (
    <header className="notak-entete" ref={entete}>
      <nav className="notak-fil" aria-label="Fil d’Ariane">
        {visibles.flatMap((i, rang) => [
          rang > 0 && <span key={`s${i}`} className="notak-fil-sep" aria-hidden>›</span>,
          rang === 1 && caches.length > 0 && (
            <span key="susp" className="notak-fil-bloc">
              <button
                type="button"
                className="notak-fil-segment notak-fil-suspension"
                title="Niveaux cachés"
                aria-expanded={menu}
                onClick={() => setMenu((m) => !m)}
              >
                …
              </button>
              {menu && (
                <div className="notak-fil-menu" role="menu">
                  {caches.map((c) => (
                    <button key={c} type="button" role="menuitem" onClick={() => aller(segments[c]!.id)}>
                      {segments[c]!.titre || 'Sans titre'}
                    </button>
                  ))}
                </div>
              )}
            </span>
          ),
          rang === 1 && caches.length > 0 && <span key="s-susp" className="notak-fil-sep" aria-hidden>›</span>,
          segment(i),
        ])}
      </nav>
      <Pastilles presence={presence} />
      {actions && <div className="notak-entete-actions">{actions}</div>}
    </header>
  )
}

const sansEcoute = () => () => {}
const aucune: Presence[] = []

/** Les personnes présentes sur ce tableau, une pastille chacune (initiale, couleur), sans doublon. */
function Pastilles({ presence }: { presence?: Services['presence'] }) {
  const autres = useSyncExternalStore(presence?.ecouter ?? sansEcoute, presence ? presence.autres : () => aucune)
  const personnes = [...new Map(autres.map((a) => [a.utilisateur.id, a.utilisateur])).values()]
  return (
    <div className="notak-pastilles">
      {personnes.map((u) => (
        <span key={u.id} className="notak-pastille" style={{ background: u.couleur }} title={u.nom}>
          {[...u.nom.trim()][0]?.toLocaleUpperCase('fr') ?? '?'}
        </span>
      ))}
    </div>
  )
}
