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
import { point } from './coeur/geometrie'
import { deballer } from './coeur/pressePapiers'
import { type Element, type Id, type Tableau, surLeTableau } from './coeur/tableau'
import { demanderRenommage } from './elements/tableau/renommage'
import type { Presence, Services } from './elements/types'
import { Toile } from './Toile'
import { annoncer } from './avis'

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

/**
 * L'adresse du tableau ouvert, que l'application tient (la barre du navigateur, `/t/<id>`) : on l'écrit à
 * chaque changement de tableau, et le bouton retour du navigateur ramène au précédent.
 */
export interface Adresse {
  lire(): Id | null
  ecrire(id: Id): void
  /** Prévenu quand l'adresse change sans nous (retour, avance) ; `null` : l'accueil. */
  ecouter(f: (id: Id | null) => void): () => void
}

/**
 * Des éléments venus d'un autre tableau, rangés à droite de ce qu'il y a déjà (4 UG d'écart, en haut du contenu),
 * ou à 5 UG du coin si le tableau est vide ; ils gardent leur disposition et reçoivent des identifiants neufs.
 */
export function placerALaSuite(t: Tableau, elements: Element[]): Element[] {
  const posables = (els: readonly Element[]) => els.filter((e) => !e.parent && e.contenu.type !== 'ligne')
  const venus = posables(elements)
  if (venus.length === 0) return deballer({ elements, cadre: { min: point(0, 0), max: point(0, 0) } }, point(0, 0))
  const [minX, minY] = [Math.min(...venus.map((e) => e.x)), Math.min(...venus.map((e) => e.y))]
  const la = posables(surLeTableau(t))
  const d =
    la.length === 0
      ? point(5 - minX, 5 - minY)
      : point(Math.max(...la.map((e) => e.x + e.largeur)) + 4 - minX, Math.min(...la.map((e) => e.y)) - minY)
  return deballer({ elements, cadre: { min: point(minX, minY), max: point(minX, minY) } }, d)
}

interface Segment {
  id: Id
  titre: string
}

/** L'espace de tableaux : un en-tête avec le fil d'Ariane, puis la toile du tableau courant. */
export function EspaceNotak({
  espace,
  services: hote = {},
  actions,
  adresse,
}: {
  espace: EspaceNavigable
  services?: Services
  adresse?: Adresse
  /** Ce que l'application ajoute à droite de l'en-tête (partage, compte), pour le tableau ouvert. */
  actions?(courant: Id, ouvrir: (id: Id) => void): ReactNode
}) {
  const racine = espace.racine
  const [parcours, setParcours] = useState(() => parcoursDepart(racine))
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
      colorerTableau: (id, couleur) => {
        if (espace.lectureSeule?.(id)) return
        const m = espace.magasin(id)
        m.remplacer({ ...m.lire(), couleur })
      },
      presence: espace.presence?.(courant),
      lectureSeule: lectureSeule || hote.lectureSeule,
      deposerDans: (cible, elements) => {
        if (espace.lectureSeule?.(cible)) return
        const m = espace.magasin(cible)
        const neufs = placerALaSuite(m.lire(), elements)
        m.appliquerSeulement(neufs.map((element) => ({ type: 'creer' as const, element })))
        return neufs
      },
    }),
    [hote, espace, ouvrir, courant, lectureSeule],
  )

  // L'adresse suit le tableau ouvert ; une adresse qu'on suit (retour du navigateur) ne se réécrit pas.
  const suivie = useRef<Id | null>(null)
  // Tant que le tableau de l'adresse de départ n'est pas ouvert, l'adresse attend : on ne l'écrase pas.
  const enAttente = useRef(adresse ? adresse.lire() !== racine : false)
  useEffect(() => {
    if (!adresse || enAttente.current) return
    // Un tableau qu'on suit depuis l'adresse est en route : rien à écrire, ni avant ni à son arrivée.
    if (suivie.current !== null) {
      if (suivie.current === courant) suivie.current = null
      return
    }
    if (adresse.lire() !== courant) adresse.ecrire(courant)
  }, [adresse, courant])
  useEffect(() => {
    if (!adresse) return
    // Le tableau de l'adresse n'est peut-être pas encore connu (un partage qui se charge) : on l'attend un peu.
    const aller = (id: Id | null) => {
      const cible = id ?? racine
      if (cible === etat.current.courant) {
        enAttente.current = false
        return
      }
      const essayer = () => {
        if (!espace.existe(cible)) return false
        enAttente.current = false
        suivie.current = cible
        ouvrir(cible)
        return true
      }
      if (essayer()) return
      const fin = espace.ecouter(() => essayer() && arret())
      // Introuvable : on reste où l'on est, et l'adresse le redit.
      const minuteur = setTimeout(() => {
        arret()
        enAttente.current = false
        adresse.ecrire(etat.current.courant)
      }, 10_000)
      const arret = () => {
        fin()
        clearTimeout(minuteur)
      }
    }
    aller(adresse.lire())
    return adresse.ecouter(aller)
  }, [adresse, espace, ouvrir, racine])

  // Le tableau regardé reste ouvert, avec ceux vers lesquels il renvoie.
  useEffect(() => espace.retenir?.(courant), [espace, courant])

  // Un accès retiré ramène à l'accueil, une fois, avec un mot.
  const refuse = useSyncExternalStore(espace.ecouter, () => espace.refuse?.(courant) ?? false)
  useEffect(() => {
    if (!refuse || courant === racine) return
    annoncer({ texte: 'Accès retiré' })
    setParcours(parcoursDepart(racine))
  }, [refuse, courant, racine])

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
  const etat = useRef({ courant, ouvrir, espace, parcours })
  etat.current = { courant, ouvrir, espace, parcours }
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || saisissable(e.target)) return
      const { courant: ici, ouvrir: aller, espace: esp, parcours: p } = etat.current
      if (e.key.toLowerCase() === 'u' && e.shiftKey) {
        // Redescendre : dans le tableau qu'on vient de quitter, s'il est rangé dans celui-ci.
        const quitte = p.pile[p.index - 1]
        if (quitte && esp.parent(quitte) === ici) aller(quitte)
      } else if (e.shiftKey) return
      else if (e.key.toLowerCase() === 'u') {
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
      <Entete
        segments={segments}
        courant={courant}
        ouvrir={ouvrir}
        renommer={courant === racine || lectureSeule ? undefined : (titre) => espace.renommer(courant, titre)}
        presence={espace.presence?.(courant)}
        actions={actions?.(courant, ouvrir)}
      />
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
  renommer,
  presence,
  actions,
}: {
  segments: Segment[]
  courant: Id
  ouvrir(id: Id): void
  /** Le titre du tableau ouvert se change en cliquant dessus (pas celui de l'accueil). */
  renommer?(titre: string): void
  presence?: Services['presence']
  actions?: ReactNode
}) {
  const entete = useRef<HTMLElement>(null)
  const [largeur, setLargeur] = useState(Number.POSITIVE_INFINITY)
  const [menu, setMenu] = useState(false)
  const [enRenommage, setEnRenommage] = useState(false)
  useEffect(() => setEnRenommage(false), [courant])

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
    if (ici && enRenommage && renommer) {
      const valider = (v: string) => {
        setEnRenommage(false)
        const titre = v.trim()
        if (titre && titre !== s.titre) renommer(titre)
      }
      return (
        <input
          key="renommage"
          className="notak-fil-saisie"
          aria-label="Titre du tableau"
          defaultValue={s.titre}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => valider(e.currentTarget.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') valider(e.currentTarget.value)
            if (e.key === 'Escape') setEnRenommage(false)
          }}
        />
      )
    }
    return (
      <button
        key={`${s.id}:${i}`}
        type="button"
        className="notak-fil-segment"
        aria-current={ici ? 'page' : undefined}
        title={s.titre}
        data-depot-tableau={s.id}
        onClick={() => (ici && renommer ? setEnRenommage(true) : aller(s.id))}
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
