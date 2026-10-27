import { createPortal } from 'react-dom'
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { type Camera, TAILLES_GRILLE, definirTailleGrille } from './coeur/camera'
import { definirAffichageMinicarte } from './minicarteModele'
import {
  type EspaceNavigable,
  type EtatEnvoi,
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
import { creerMagasin } from './coeur/magasin'
import { type Element, type Id, type Tableau, nonTriesDe, nouvelId, surLeTableau } from './coeur/tableau'
import { ChoixModele } from './elements/tableau/ChoixModele'
import { poserModele } from './elements/tableau/poserModele'
import { marquerVu } from './elements/tableau/activite'
import { demanderRenommage } from './elements/tableau/renommage'
import type { Presence, Services } from './elements/types'
import { Toile } from './Toile'
import { annoncer } from './avis'
import { ecouterEnvois, envoisEnCours } from './elements/envois'
import { t, tn, useLangue } from './langue'
import { FenetreRaccourcis } from './Menus'
import { BoutonVue } from './BoutonVue'
import { Infobulle } from './Infobulle'
import { BoutonIlot, ContexteEntete, type EnteteEspace, FiletIlot, Ilot, IlotCompte, IlotHistorique, IlotPartage } from './Ilots'
import { modelesDe } from './modeles/langues'
import { elementsDuModele, sansExemple } from './modeles/construire'
import { PanneauModeles, modelesProposes } from './PanneauModeles'
import { TitreTableau } from './TitreTableau'
import { PastillePersonne } from './pastille'
import { type ServiceCompte, useReglages } from './reglages'
import { PageReglages } from './PageReglages'
import { themeEffectif, useSystemeSombre } from './themeVivant'
import { useHabillages } from './habillage/appliquer'
import type { OffreHabillages } from './habillage/bibliotheque'
import './theme.css'
import { Icone } from './icones'
import { auDoigt } from './doigt'
import { GardeToile } from './garde'
import { useApercuOutils, useBarreRetenue } from './apercuOutils'

const CLE_VUES = 'notak:vues'
/**
 * La largeur d'un segment du fil (texte, marges, séparateur), en pixels : le titre est mesuré dans la police du fil,
 * puis coupé à 160. Sans canvas (un test), on retombe sur une estimation.
 */
let mesureur: CanvasRenderingContext2D | null | undefined
function largeurSegment(titre: string): number {
  mesureur ??= typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  // La police vraiment employée par un segment déjà dessiné, sinon celle de la page.
  const modele = mesureur && (document.querySelector('.notak-fil-segment') ?? document.body)
  if (mesureur && modele) mesureur.font = getComputedStyle(modele).font
  const texte = mesureur ? mesureur.measureText(titre || t('commun.sansTitre')).width : (titre.length || 10) * 7.2
  return Math.min(160, 8 + texte) + 24
}
const LARGEUR_SUSPENSION = 44

/** La barre des outils de gauche, montrée ou cachée : un choix de la machine, gardé d'une visite à l'autre. */
const CLE_OUTILS = 'notak:outils-caches'
export function lireOutilsCaches(): boolean {
  try {
    return localStorage.getItem(CLE_OUTILS) === '1'
  } catch {
    return false
  }
}
export function ecrireOutilsCaches(caches: boolean) {
  try {
    if (caches) localStorage.setItem(CLE_OUTILS, '1')
    else localStorage.removeItem(CLE_OUTILS)
  } catch {
    // Sans stockage, le choix vaut pour la visite.
  }
}

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
  /** L'élément que l'adresse ouvre en grand (`/t/<tableau>/e/<élément>`), s'il y en a un. */
  lireElement?(): Id | null
  /** Écrit (ou retire, avec `null`) l'élément ouvert en grand ; fermer ramène à l'adresse du tableau. */
  ecrireElement?(tableau: Id, element: Id | null): void
  /** Prévenu quand l'adresse change sans nous (retour, avance) ; `null` : l'accueil. */
  ecouter(f: (id: Id | null, element?: Id | null) => void): () => void
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

/**
 * Des éléments venus d'un autre tableau, rangés dans ses non triés à la suite de ceux qui y attendent, dans l'ordre
 * où ils arrivent. Les lignes ne les suivent pas : rien ne les relierait sur la toile.
 */
export function versLesNonTries(t: Tableau, elements: Element[], maintenant = Date.now()): Element[] {
  const apres = Math.max(maintenant, ...nonTriesDe(t).map((e) => e.nonTrie! + 1))
  return deballer({ elements, cadre: { min: point(0, 0), max: point(0, 0) } }, point(0, 0))
    .filter((e) => e.contenu.type !== 'ligne')
    .map((e, i) => (e.parent ? e : { ...e, x: 0, y: 0, nonTrie: apres + i }))
}

/**
 * Le contenu d'un tableau pour sa copie : mêmes éléments, identifiants neufs, lignes recâblées, verrous et non
 * triés gardés. Ce qui est à la corbeille n'est pas copié.
 */
export function copieDuContenu(elements: readonly Element[]): Element[] {
  const gardes = elements.filter((e) => e.corbeille === undefined)
  return deballer({ elements: gardes, cadre: { min: point(0, 0), max: point(0, 0) } }, point(0, 0)).map((e, i) => {
    const source = gardes[i]!
    return { ...e, ...(source.verrou ? { verrou: source.verrou } : {}), ...(source.nonTrie !== undefined ? { nonTrie: source.nonTrie } : {}) }
  })
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
  actionsTableau,
  partage,
  actionsCompte,
  adresse,
  compte,
  enregistrer,
  habillages: offreHabillages,
  bibliotheque,
}: {
  espace: EspaceNavigable
  services?: Services
  adresse?: Adresse
  /** La section « Compte » des réglages (photo, couleur) ; sans elle, les réglages restent ceux de l'interface. */
  compte?: ServiceCompte
  /**
   * Les boutons que l'application ajoute au dernier îlot du tableau (favori, plus, verrou…), pour le tableau ouvert.
   * `aide` ouvre la fenêtre des raccourcis, la même que « / ».
   */
  actions?(courant: Id, ouvrir: (id: Id) => void, aide: () => void): ReactNode
  /** L'export du tableau, en tête du dernier îlot. */
  actionsTableau?(courant: Id, ouvrir: (id: Id) => void): ReactNode
  /** Le bouton « Partager », après les présents : il suit aussi dans la carte et le document ouverts en grand. */
  partage?(courant: Id): ReactNode
  /** Les notifications et le compte, avant les réglages : ils suivent aussi dans la carte et le document. */
  actionsCompte?(courant: Id, ouvrir: (id: Id) => void, aide: () => void): ReactNode
  /**
   * Ce que fait Cmd+S. Sans lui, tout s'enregistre déjà seul et la toile le dit ; l'édition locale, elle, y range une
   * copie dans un fichier `.notak`.
   */
  enregistrer?(): void
  /** Les thèmes que fournit l'application (un serveur), et celui qu'elle impose ou propose. */
  habillages?: OffreHabillages
  /** Mène à la bibliothèque, la page d'accueil de l'application : une maison en tête de la barre. */
  bibliotheque?(): void
}) {
  const racine = espace.racine
  const [parcours, setParcours] = useState(() => parcoursDepart(racine))
  const courant = courantDe(parcours)
  const lectureSeule = useSyncExternalStore(espace.ecouter, () => espace.lectureSeule?.(courant) ?? false)
  const droits = useSyncExternalStore(espace.ecouter, () => espace.droits?.(courant) ?? null)
  const [reglages, changerReglages] = useReglages()
  // Le thème qui s'applique : « Système » suit macOS en direct.
  const theme = themeEffectif(reglages.theme, useSystemeSombre())
  const habillages = useHabillages(offreHabillages, reglages.habillage, theme)
  // Posée avant de dessiner la toile, qui la lit à chaque mesure.
  definirTailleGrille(reglages.grille)
  // De même pour la mini-carte : le tableau et la carte la lisent sans la recevoir.
  definirAffichageMinicarte(reglages.minicarte)
  // Un changement de langue redessine l'en-tête et la toile : les textes se relisent à la nouvelle langue.
  const langue = useLangue()
  const [reglagesOuverts, setReglagesOuverts] = useState(false)
  const fermerReglages = useCallback(() => setReglagesOuverts(false), [])
  const [presentation, setPresentation] = useState(false)
  const [aideOuverte, setAideOuverte] = useState(false)
  const fermerAide = useCallback(() => setAideOuverte(false), [])
  const ouvrirAide = useCallback(() => setAideOuverte(true), [])
  const vues = useRef<Vues | null>(null)
  vues.current ??= lireVuesEnregistrees()
  const [outilsCaches, setOutilsCaches] = useState(lireOutilsCaches)
  const basculerOutils = useCallback(() => setOutilsCaches((c) => (ecrireOutilsCaches(!c), !c)), [])

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

  // Le tableau qu'on regarde est vu tel qu'il est, à chaque changement : la pastille d'activité des cartes ne s'allume
  // que pour ce qui change pendant qu'on est ailleurs.
  useEffect(() => {
    const voir = () => {
      const t = espace.tableau(courant)
      if (t && t.elements.length > 0) marquerVu(courant, t)
    }
    voir()
    return espace.ecouter(voir)
  }, [espace, courant])

  // L'élément que l'adresse ouvre en grand, avec son tableau : la toile de ce tableau l'ouvre une fois prête.
  const [elementAdresse, setElementAdresse] = useState<{ tableau: Id; element: Id | null } | null>(() => {
    const element = adresse?.lireElement?.() ?? null
    return adresse && element ? { tableau: adresse.lire() ?? racine, element } : null
  })
  const pleinEcran = useCallback(
    (element: Id | null) => {
      const tableau = etat.current.courant
      setElementAdresse(element ? { tableau, element } : null)
      adresse?.ecrireElement?.(tableau, element)
    },
    [adresse],
  )

  const services = useMemo<Services>(
    () => ({
      ...hote,
      pleinEcran,
      elementAdresse: elementAdresse?.tableau === courant ? elementAdresse.element : null,
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
      etiquettesDesAutres: () => {
        // Le chemin d'abord, du plus proche au plus loin, puis les autres tableaux que l'hôte connaît.
        const ids = [...espace.chemin(courant)].reverse().concat((hote.listerTableaux?.() ?? []).map((x) => x.id))
        const vus = new Set<Id>([courant])
        return ids.flatMap((id) => {
          if (vus.has(id)) return []
          vus.add(id)
          const t = espace.tableau(id)
          return t?.etiquettes?.length ? [{ id, titre: t.titre, etiquettes: t.etiquettes }] : []
        })
      },
      propagerEtiquette: (et) => {
        const ids = [...espace.chemin(courant), ...(hote.listerTableaux?.() ?? []).map((x) => x.id)]
        for (const id of new Set(ids)) {
          if (id === courant || espace.lectureSeule?.(id)) continue
          const liste = espace.tableau(id)?.etiquettes
          const ici = liste?.find((x) => x.id === et.id)
          if (!liste || !ici || (ici.nom === et.nom && ici.couleur === et.couleur)) continue
          // Hors historique : ce n'est pas un geste de ce tableau-là.
          espace.magasin(id).appliquerSeulement([{ type: 'etiquettes', de: liste, vers: liste.map((x) => (x.id === et.id ? { ...x, nom: et.nom, couleur: et.couleur } : x)) }])
        }
      },
      presence: espace.presence?.(courant),
      // Un commentateur regarde le tableau sans le modifier ; ses fils, eux, s'écrivent (voir `peutCommenter`).
      lectureSeule: lectureSeule || hote.lectureSeule || presentation || droits?.role === 'commentaire',
      droits: droits ?? undefined,
      reglerDroitsElement:
        droits?.role === 'proprietaire' && hote.reglerDroitsElementDe && !presentation ? (id: Id) => hote.reglerDroitsElementDe!(courant, id) : undefined,
      presentation,
      doubleClicCreeNote: reglages.doubleClic,
      barreAGauche: reglages.barre === 'gauche',
      annulerNavigation: () => {
        const p = etat.current.parcours
        if (p.index === 0) return false
        setParcours(reculer)
        return true
      },
      retablirNavigation: () => {
        const p = etat.current.parcours
        if (p.index >= p.pile.length - 1) return false
        setParcours(avancer)
        return true
      },
      dupliquerTableau: (id) => {
        const source = espace.tableau(id)
        if (!source) return undefined
        const neuf = espace.creerTableau(source.titre, courant)
        const m = espace.magasin(neuf)
        m.appliquerSeulement(copieDuContenu(source.elements).map((element) => ({ type: 'creer' as const, element })))
        if (source.couleur) m.remplacer({ ...m.lire(), couleur: source.couleur })
        return neuf
      },
      retrouverOriginal: (cible) => {
        // Le tableau qui le contient, puis celui où l'on est : la carte qui n'est pas un raccourci.
        for (const id of [espace.parent(cible), courant]) {
          const carte = id ? espace.tableau(id)?.elements.find((e) => e.contenu.type === 'tableau' && e.contenu.cible === cible && !e.contenu.raccourci && e.corbeille === undefined && e.nonTrie === undefined) : undefined
          if (id && carte) return { tableau: id, element: carte.id }
        }
        return undefined
      },
      deposerDans: (cible, elements, nonTries) => {
        if (espace.lectureSeule?.(cible)) return
        const m = espace.magasin(cible)
        const neufs = nonTries ? versLesNonTries(m.lire(), elements) : placerALaSuite(m.lire(), elements)
        m.appliquerSeulement(neufs.map((element) => ({ type: 'creer' as const, element })))
        for (const e of neufs) if (e.contenu.type === 'tableau' && !e.contenu.raccourci) hote.toileRangee?.(e.contenu.cible, cible)
        return neufs
      },
    }),
    [hote, espace, ouvrir, courant, lectureSeule, droits, reglages.doubleClic, reglages.barre, presentation, pleinEcran, elementAdresse],
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
    const aller = (id: Id | null, element: Id | null = null) => {
      const cible = id ?? racine
      // L'élément de l'adresse s'ouvre (ou se referme, au retour du navigateur) dans le tableau visé.
      setElementAdresse((avant) => (avant?.tableau === cible && avant.element === element ? avant : element ? { tableau: cible, element } : null))
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
    aller(adresse.lire(), adresse.lireElement?.() ?? null)
    return adresse.ecouter(aller)
  }, [adresse, espace, ouvrir, racine])

  // Le tableau regardé reste ouvert, avec ceux vers lesquels il renvoie.
  useEffect(() => espace.retenir?.(courant), [espace, courant])

  // Un accès retiré ramène à l'accueil, une fois, avec un mot.
  const refuse = useSyncExternalStore(espace.ecouter, () => espace.refuse?.(courant) ?? false)
  useEffect(() => {
    if (!refuse || courant === racine) return
    annoncer({ texte: t('espace.accesRetire') })
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
    if (chemin[0]?.id !== racine) chemin.unshift({ id: racine, titre: t('espace.accueil') })
    else chemin[0] = { id: racine, titre: t('espace.accueil') }
    return chemin
  }, [fil, racine, langue])

  // Les raccourcis de navigation, sur le document : la toile qui avait le focus disparaît à chaque changement.
  const basculerThemeRef = useRef(() => {})
  const ouvrirReglagesRef = useRef(() => {})
  const basculerPresentationRef = useRef(() => {})
  const changerGrilleRef = useRef((_sens: 1 | -1) => {})
  const etat = useRef({ courant, ouvrir, espace, parcours, enregistrer })
  etat.current = { courant, ouvrir, espace, parcours, enregistrer }
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      // Cmd+S, même en écrivant : tout s'enregistre seul, on le dit plutôt que d'ouvrir « Enregistrer la page ».
      if ((e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey && e.code === 'KeyP') {
        e.preventDefault()
        return basculerPresentationRef.current()
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === ',') {
        e.preventDefault()
        return ouvrirReglagesRef.current()
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (etat.current.enregistrer) return etat.current.enregistrer()
        const envoi = etat.current.espace.envoi?.(etat.current.courant)
        annoncer({ texte: envoi === 'hors-ligne' ? t('espace.horsLigneGarde') : t('espace.toutSEnregistre') })
        return
      }
      if (!(e.metaKey || e.ctrlKey) || e.altKey || saisissable(e.target)) return
      const { courant: ici, ouvrir: aller, espace: esp, parcours: p } = etat.current
      if (e.key.toLowerCase() === 'd' && e.shiftKey) basculerThemeRef.current()
      else if (e.shiftKey && (e.code === 'Comma' || e.code === 'Period')) changerGrilleRef.current(e.code === 'Period' ? 1 : -1)
      else if (e.key.toLowerCase() === 'u' && e.shiftKey) {
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

  const envoi = useSyncExternalStore(espace.ecouter, () => espace.envoi?.(courant))
  const charge = useSyncExternalStore(espace.ecouter, () => espace.synchronise?.(courant) ?? true)
  const basculerTheme = useCallback(() => changerReglages({ theme: theme === 'sombre' ? 'clair' : 'sombre' }), [theme, changerReglages])
  ouvrirReglagesRef.current = () => setReglagesOuverts(true)
  basculerPresentationRef.current = () => setPresentation((p) => !p)
  changerGrilleRef.current = (sens) => {
    const i = TAILLES_GRILLE.indexOf(reglages.grille)
    const suivante = TAILLES_GRILLE[Math.max(0, Math.min(TAILLES_GRILLE.length - 1, i + sens))]!
    if (suivante === reglages.grille) return
    changerReglages({ grille: suivante })
    annoncer({ texte: t(suivante === 8 ? 'espace.grille.serree' : suivante === 9 ? 'espace.grille.moyenne' : 'espace.grille.large', { px: suivante }) })
  }
  // La présentation passe en plein écran ; en sortir (Échap du navigateur compris) la referme.
  const racineEspace = useRef<HTMLDivElement>(null)
  const apercuOutils = useApercuOutils(racineEspace, outilsCaches)
  const outilsRetenus = useBarreRetenue(racineEspace)
  useEffect(() => {
    if (!presentation) return
    if (!document.fullscreenElement) void racineEspace.current?.requestFullscreen?.().catch(() => {})
    const sortie = () => !document.fullscreenElement && setPresentation(false)
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.notak-focus')) return
      setPresentation(false)
    }
    document.addEventListener('fullscreenchange', sortie)
    document.addEventListener('keydown', touche)
    return () => {
      document.removeEventListener('fullscreenchange', sortie)
      document.removeEventListener('keydown', touche)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    }
  }, [presentation])
  basculerThemeRef.current = basculerTheme
  const historique = useMemo(
    () => ({
      annuler: () => void (espace.magasin(courant).annuler() || services.annulerNavigation?.()),
      retablir: () => void (espace.magasin(courant).retablir() || services.retablirNavigation?.()),
    }),
    [espace, courant, services],
  )

  const magasinCourant = espace.magasin(courant)
  const peutAnnuler = useSyncExternalStore(magasinCourant.ecouter, magasinCourant.peutAnnuler)
  const peutRetablir = useSyncExternalStore(magasinCourant.ecouter, magasinCourant.peutRetablir)

  // [modèles] Le choix d'un modèle sur un tableau vide qu'on vient d'ouvrir.
  const vide = useSyncExternalStore(espace.ecouter, () => espace.tableau(courant)?.elements.length === 0)
  const [fermes, setFermes] = useState<ReadonlySet<Id>>(() => new Set())
  const [modeleChoisi, setModeleChoisi] = useState<string | null>(null)
  const [garderExemple, setGarderExemple] = useState(false)
  const [plusDeModeles, setPlusDeModeles] = useState(false)
  const [clignote, setClignote] = useState(0)
  const [modelesPrets, setModelesPrets] = useState(false)
  const modelesVus = useRef(false)
  const peutChoisir = vide && charge && courant !== racine && !lectureSeule && !hote.lectureSeule && !presentation && !fermes.has(courant)
  // Un délai de 200 ms : un élément qu'on dépose en arrivant ne fait pas clignoter le panneau.
  useEffect(() => {
    if (!peutChoisir) return setModelesPrets(false)
    const minuteur = setTimeout(() => setModelesPrets(true), 200)
    return () => clearTimeout(minuteur)
  }, [peutChoisir, courant])
  const modelesAffiches = modelesPrets && peutChoisir
  const fermerModeles = useCallback(() => {
    setFermes((f) => new Set(f).add(etat.current.courant))
    setModeleChoisi(null)
    setPlusDeModeles(false)
  }, [])
  useEffect(() => {
    setModeleChoisi(null)
    setPlusDeModeles(false)
    modelesVus.current = false
  }, [courant])
  // Un élément posé ferme le choix pour de bon (annuler ne le ramène pas) ; commencer à glisser aussi.
  useEffect(() => {
    if (modelesAffiches) modelesVus.current = true
    else if (modelesVus.current && !vide) {
      modelesVus.current = false
      fermerModeles()
    }
  }, [modelesAffiches, vide, fermerModeles])
  useEffect(() => {
    if (!modelesAffiches) return
    document.addEventListener('dragstart', fermerModeles)
    return () => document.removeEventListener('dragstart', fermerModeles)
  }, [modelesAffiches, fermerModeles])
  const catalogue = modelesDe(langue)
  const proposes = useMemo(() => modelesProposes(catalogue), [catalogue])
  const modeleVoulu = modelesAffiches ? (catalogue.find((m) => m.id === modeleChoisi) ?? null) : null
  const apercu = useMemo(
    () => (modeleVoulu ? creerMagasin({ titre: '', elements: elementsDuModele(garderExemple ? modeleVoulu : sansExemple(modeleVoulu), nouvelId) }) : null),
    [modeleVoulu, garderExemple],
  )
  const appliquerModele = (m: (typeof catalogue)[number] | null) => {
    fermerModeles()
    if (!m) return
    poserModele(garderExemple ? m : sansExemple(m), courant, services, { identite: !espace.tableau(courant)?.titre })
  }
  const servicesApercu = useMemo<Services>(() => ({ ...services, lectureSeule: true, apercuModele: true, presence: undefined }), [services])

  const surCamera = useCallback(
    (c: Camera) => {
      vues.current = memoriserVue(vues.current ?? {}, courant, c, Date.now())
      ecrireVues(vues.current)
    },
    [courant],
  )

  const presence = espace.presence?.(courant)
  const entete: EnteteEspace = {
    fil: segments,
    ouvrir,
    ...(bibliotheque ? { bibliotheque } : {}),
    // Sans partage ni présence (l'édition locale), pas d'îlot vide.
    partage: (partage || presence) && (
      <>
        <Pastilles presence={presence} adressePhoto={hote.adressePhoto} />
        {partage?.(courant)}
      </>
    ),
    compte: (
      <>
        {actionsCompte?.(courant, ouvrir, ouvrirAide)}
        <Infobulle libelle={t('reglages.titre')} raccourci="⌘,">
          <button type="button" className="notak-reglages-bouton" aria-label={t('reglages.titre')} onClick={() => setReglagesOuverts(true)}>
            <Icone nom="reglages" taille={20} trait={1.5} />
          </button>
        </Infobulle>
      </>
    ),
  }

  return (
    <ContexteEntete.Provider value={entete}>
    <div ref={racineEspace} className="notak-espace" data-theme={theme} data-taille={reglages.taille} data-presentation={presentation || undefined} data-outils={outilsCaches ? 'caches' : undefined} data-outils-apercu={apercuOutils.apercu || undefined}>
      {outilsCaches && <div className="notak-outils-bord" aria-hidden onPointerEnter={apercuOutils.entrer} onPointerLeave={apercuOutils.quitter} />}
      <Entete
        outils={{ caches: outilsCaches, retenus: outilsRetenus, basculer: basculerOutils }}
        bibliotheque={bibliotheque}
        key={`entete:${langue}`}
        segments={segments}
        charge={charge}
        courant={courant}
        ouvrir={ouvrir}
        renommer={courant === racine || lectureSeule ? undefined : (titre) => espace.renommer(courant, titre)}
        actions={actions?.(courant, ouvrir, ouvrirAide)}
        actionsTableau={actionsTableau?.(courant, ouvrir)}
        historique={lectureSeule ? undefined : historique}
        peutAnnuler={peutAnnuler}
        peutRetablir={peutRetablir}
        envoi={envoi}
      />
      <div className="notak-espace-corps" ref={corps}>
        <GardeToile key={courant}>
          {apercu ? (
            // L'aperçu vivant : le modèle dans la toile, sans l'écrire, derrière un voile qui bloque les gestes.
            <div className="notak-modele-apercu">
              <Toile key={`apercu:${courant}:${modeleChoisi}:${garderExemple}:${langue}`} magasin={apercu} services={servicesApercu} />
              <div className="notak-modele-voile" onPointerDown={() => setClignote((n) => n + 1)} />
            </div>
          ) : (
            <Toile
              // Une autre grille ou une autre langue redessine tout : pixels et textes changent.
              key={`${courant}:${reglages.grille}:${langue}`}
              magasin={espace.magasin(courant)}
              services={services}
              cameraInitiale={vues.current[courant]?.camera}
              surCamera={surCamera}
            />
          )}
        </GardeToile>
        {/* Le zoom, en bas à droite comme sur la carte mentale ; l'accueil n'en a pas, comme avant. */}
        {segments.length > 1 && (
          <div className="notak-vue-bas">
            <Ilot>
              <BoutonVue minicarte={{ valeur: reglages.minicarte ?? 'mouvement', changer: (minicarte) => changerReglages({ minicarte }) }} />
            </Ilot>
          </div>
        )}
        {modelesAffiches && (
          <PanneauModeles
            modeles={proposes}
            choisi={modeleChoisi}
            surChoix={setModeleChoisi}
            garder={garderExemple}
            surGarder={setGarderExemple}
            continuer={() => appliquerModele(modeleVoulu)}
            plus={() => setPlusDeModeles(true)}
            fermer={fermerModeles}
            signal={clignote}
          />
        )}
        {plusDeModeles && (
          // La fenêtre du choix complet prend ses couleurs à la toile qui l'entoure : elle lui en trouve une, cachée.
          <div className="notak-toile" hidden>
            <ChoixModele choisir={(m) => (setPlusDeModeles(false), appliquerModele(m))} laisser={() => setPlusDeModeles(false)} />
          </div>
        )}
      </div>
      {/* Par-dessus tout, la carte et le document ouverts en grand compris : leur barre ouvre aussi ces fenêtres. */}
      {(aideOuverte || reglagesOuverts) &&
        createPortal(
          <div className="notak-espace notak-par-dessus" data-theme={theme} data-taille={reglages.taille}>
            {aideOuverte && <FenetreRaccourcis fermer={fermerAide} />}
            {reglagesOuverts && <PageReglages reglages={reglages} changer={changerReglages} fermer={fermerReglages} habillages={habillages} compte={compte} outils={{ caches: outilsCaches, basculer: basculerOutils }} />}
          </div>,
          document.body,
        )}
    </div>
    </ContexteEntete.Provider>
  )
}

function Entete({
  segments,
  courant,
  ouvrir,
  renommer,
  actions,
  actionsTableau,
  historique,
  peutAnnuler = true,
  peutRetablir = true,
  envoi,
  charge = true,
  outils,
  bibliotheque,
}: {
  segments: Segment[]
  courant: Id
  ouvrir(id: Id): void
  /** Le titre du tableau ouvert se change en place, au bout du fil (pas celui de l'accueil). */
  renommer?(titre: string): void
  /** Les boutons de l'application propres au tableau (favori, plus…), dans le dernier îlot avant le compte. */
  actions?: ReactNode
  /** L'export du tableau, en tête du dernier îlot. */
  actionsTableau?: ReactNode
  /** Annuler et rétablir le tableau ouvert ; absent en lecture seule. */
  historique?: { annuler(): void; retablir(): void }
  /** Les piles du magasin : un bouton dont la pile est vide est grisé. */
  peutAnnuler?: boolean
  peutRetablir?: boolean
  envoi?: EtatEnvoi
  /** Faux tant que le tableau ouvert n'a pas rattrapé le serveur. */
  charge?: boolean
  /** La barre des outils de gauche, qu'un bouton du premier îlot montre ou cache ; retenue ouverte par une sélection. */
  outils?: { caches: boolean; retenus?: boolean; basculer(): void }
  /** Mène à la bibliothèque : une maison en tête de l'îlot. */
  bibliotheque?(): void
}) {
  const fil = useRef<HTMLElement>(null)
  const [largeur, setLargeur] = useState(Number.POSITIVE_INFINITY)
  const [menu, setMenu] = useState(false)

  useLayoutEffect(() => {
    const n = fil.current!
    // Le fil vit au bout de l'îlot de gauche, qui se règle sur lui : sa place est celle que l'îlot peut prendre (la
    // bande à gauche des îlots de droite, et au plus sa largeur maximale), moins ses boutons. C'est elle qui dit
    // combien de maillons tiennent.
    const ilot = n.parentElement!
    const gauche = ilot.parentElement!
    const mesurer = () => {
      if (!gauche.clientWidth) return setLargeur(Number.POSITIVE_INFINITY)
      const plafond = Math.min(gauche.clientWidth, Number.parseFloat(getComputedStyle(ilot).maxWidth) || Number.POSITIVE_INFINITY)
      setLargeur(plafond - (ilot.offsetWidth - n.offsetWidth))
    }
    mesurer()
    const obs = new ResizeObserver(mesurer)
    obs.observe(gauche)
    obs.observe(ilot)
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

  // Le titre du tableau ouvert se change en place, au bout du fil ; l'accueil n'a que son nom.
  const avecTitre = segments.length > 1
  // Sur un téléphone, ‹ et la maison remontent : le fil n'a que la toile ouverte, et son titre prend toute la place.
  const telephone = auDoigt() && typeof innerWidth === 'number' && innerWidth <= 640
  const { visibles, caches } = telephone
    ? { visibles: [segments.length - 1], caches: [] as number[] }
    : tronquerFil(segments.map((s) => largeurSegment(s.titre)), largeur, LARGEUR_SUSPENSION)

  const aller = (id: Id) => {
    setMenu(false)
    ouvrir(id)
  }
  const segment = (i: number) => {
    const s = segments[i]!
    const ici = i === segments.length - 1 && s.id === courant
    if (ici && avecTitre)
      return (
        <span key={`${s.id}:${i}`} className="notak-fil-titre" aria-current="page" data-depot-tableau={s.id} data-charge={!charge || undefined} title={!charge ? t('espace.chargement') : s.titre}>
          <TitreTableau titre={s.titre} {...(renommer ? { renommer } : {})} />
        </span>
      )
    return (
      <button
        key={`${s.id}:${i}`}
        type="button"
        className="notak-fil-segment"
        aria-current={ici ? 'page' : undefined}
        title={ici && !charge ? t('espace.chargement') : s.titre}
        data-depot-tableau={s.id}
        data-charge={(ici && !charge) || undefined}
        onClick={() => (ici ? undefined : aller(s.id))}
      >
        {s.titre || t('commun.sansTitre')}
      </button>
    )
  }
  const parent = segments.length > 1 ? segments.at(-2) : undefined

  return (
    // Dans l'application de bureau, la barre tient lieu de barre de titre : on la saisit partout hors des îlots pour déplacer la fenêtre.
    <header className="notak-entete" data-tauri-drag-region="deep">
      <div className="notak-entete-gauche">
        {/* Un seul îlot : remonter, la barre des outils, puis le fil et l'état de l'enregistrement. Le reste de la bande
            reste vide et transparent. */}
        <Ilot className="notak-ilot-fil">
          {bibliotheque && <BoutonIlot icone="maison" libelle={t('espace.bibliotheque')} raccourci="⌥⌘O" onClick={bibliotheque} />}
          {bibliotheque && (parent || outils) && <FiletIlot />}
          {parent && <BoutonIlot icone="gauche" libelle={t('espace.remonter')} onClick={() => aller(parent.id)} />}
          {parent && outils && <FiletIlot />}
          {outils && (
            <BoutonIlot
              icone="panneauGauche"
              libelle={outils.retenus ? t('espace.outilsRetenus') : outils.caches ? t('espace.outilsAfficher') : t('espace.outilsMasquer')}
              actif={outils.retenus || !outils.caches}
              retenu={outils.retenus}
              onClick={outils.basculer}
            />
          )}
          {(bibliotheque || parent || outils) && <FiletIlot />}
          <nav className="notak-fil" aria-label={t('espace.fil')} ref={fil}>
            {visibles.flatMap((i, rang) => [
              rang > 0 && <span key={`s${i}`} className="notak-fil-sep" aria-hidden><Icone nom="chevronDroite" taille={14} /></span>,
              rang === 1 && caches.length > 0 && (
                <span key="susp" className="notak-fil-bloc">
                  <button
                    type="button"
                    className="notak-fil-segment notak-fil-suspension"
                    title={t('espace.niveauxCaches')}
                    aria-expanded={menu}
                    onClick={() => setMenu((m) => !m)}
                  >
                    <Icone nom="plus" taille={16} />
                  </button>
                  {menu && (
                    <div className="notak-fil-menu" role="menu">
                      {caches.map((c) => (
                        <button key={c} type="button" role="menuitem" onClick={() => aller(segments[c]!.id)}>
                          {segments[c]!.titre || t('commun.sansTitre')}
                        </button>
                      ))}
                    </div>
                  )}
                </span>
              ),
              rang === 1 && caches.length > 0 && <span key="s-susp" className="notak-fil-sep" aria-hidden><Icone nom="chevronDroite" taille={14} /></span>,
              segment(i),
            ])}
            {avecTitre && <EtatEnregistrement etat={envoi} />}
          </nav>
        </Ilot>
      </div>
      <div className="notak-entete-droite">
        {historique && <IlotHistorique annuler={historique.annuler} retablir={historique.retablir} peutAnnuler={peutAnnuler} peutRetablir={peutRetablir} />}
        <IlotPartage />
        <IlotCompte>
          {actionsTableau}
          {actions}
        </IlotCompte>
      </div>
    </header>
  )
}

/**
 * Où en est l'enregistrement : rien tant que tout va bien, « Enregistrement… » si un envoi traîne, un mot
 * bref quand il aboutit, et « Hors ligne » tant que le réseau manque (rien n'est perdu : tout part au retour).
 */
function EtatEnregistrement({ etat }: { etat: EtatEnvoi | undefined }) {
  const fichiers = useSyncExternalStore(ecouterEnvois, envoisEnCours)
  const [vu, setVu] = useState<'envoi' | 'fait' | 'hors-ligne' | null>(null)
  const passe = useRef(etat)
  useEffect(() => {
    const avant = passe.current
    passe.current = etat
    if (etat === 'hors-ligne') {
      // Au chargement, la connexion met un instant à s'ouvrir : ce n'est pas une coupure.
      const t = setTimeout(() => setVu('hors-ligne'), 1500)
      return () => clearTimeout(t)
    }
    if (etat === 'envoi') {
      // Un envoi ordinaire dure quelques dizaines de millisecondes : on n'en parle que s'il traîne.
      const t = setTimeout(() => setVu('envoi'), 600)
      return () => clearTimeout(t)
    }
    if (etat === 'enregistre' && (avant === 'envoi' || avant === 'hors-ligne')) {
      setVu((v) => (v ? 'fait' : null))
      const t = setTimeout(() => setVu(null), 1800)
      return () => clearTimeout(t)
    }
    setVu(null)
  }, [etat])
  if (vu === 'hors-ligne')
    return (
      <span className="notak-enregistrement" data-etat="hors-ligne" title={t('espace.horsLigneInfo')}>
        {t('espace.horsLigne')}
      </span>
    )
  // Un fichier en route se dit tout de suite : il peut durer, et quitter la page le perdrait.
  if (fichiers > 0)
    return (
      <span className="notak-enregistrement" data-etat="envoi" role="status">
        <span className="notak-roue" aria-hidden /> {tn('espace.envoiFichiers', fichiers)}
      </span>
    )
  if (!vu) return null
  return (
    <span className="notak-enregistrement" data-etat={vu} role="status">
      {vu === 'envoi' ? t('espace.enregistrement') : t('espace.enregistre')}
    </span>
  )
}

const sansEcoute = () => () => {}
const aucune: Presence[] = []

/** Les personnes présentes sur ce tableau, une pastille chacune (initiale, couleur), sans doublon. */
const PASTILLES_MAX = 5

function Pastilles({ presence, adressePhoto }: { presence?: Services['presence']; adressePhoto?: Services['adressePhoto'] }) {
  const autres = useSyncExternalStore(presence?.ecouter ?? sansEcoute, presence ? presence.autres : () => aucune)
  const personnes = [...new Map(autres.map((a) => [a.utilisateur.id, a.utilisateur])).values()]
  // Au-delà de cinq, les suivants se comptent dans une dernière pastille, qui les nomme au survol.
  const vus = personnes.length > PASTILLES_MAX ? personnes.slice(0, PASTILLES_MAX - 1) : personnes
  const reste = personnes.slice(vus.length)
  return (
    <div className="notak-pastilles notak-pile">
      {vus.map((u) => (
        <PastillePersonne key={u.id} taille={24} nom={u.nom} couleur={u.couleur} adresse={u.photo ? adressePhoto?.(u.photo) : undefined} />
      ))}
      {reste.length > 0 && (
        <span className="notak-av notak-av-24 notak-pastille-reste" title={reste.map((u) => u.nom).join(', ')}>
          +{reste.length}
        </span>
      )}
    </div>
  )
}
