import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { type Camera, TAILLES_GRILLE, definirTailleGrille } from './coeur/camera'
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
import { type Element, type Id, type Tableau, nouvelId, surLeTableau } from './coeur/tableau'
import { ChoixModele } from './elements/tableau/ChoixModele'
import { poserModele } from './elements/tableau/poserModele'
import { demanderRenommage } from './elements/tableau/renommage'
import type { Presence, Services } from './elements/types'
import { Toile } from './Toile'
import { annoncer } from './avis'
import { ecouterEnvois, envoisEnCours } from './elements/envois'
import { t, tn, useLangue } from './langue'
import { FenetreRaccourcis } from './Menus'
import { BoutonVue } from './BoutonVue'
import { Infobulle } from './Infobulle'
import { modelesDe } from './modeles/langues'
import { elementsDuModele, sansExemple } from './modeles/construire'
import { PanneauModeles, modelesProposes } from './PanneauModeles'
import { TitreTableau } from './TitreTableau'
import { PastillePersonne } from './pastille'
import { FenetreReglages, type ServiceCompte, useReglages } from './reglages'
import './theme.css'
import { Icone } from './icones'
import { GardeToile } from './garde'

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
  actionsTableau,
  adresse,
  compte,
}: {
  espace: EspaceNavigable
  services?: Services
  adresse?: Adresse
  /** La section « Compte » des réglages (photo, couleur) ; sans elle, les réglages restent ceux de l'interface. */
  compte?: ServiceCompte
  /**
   * Ce que l'application ajoute à droite de l'en-tête (partage, compte), pour le tableau ouvert. `aide` ouvre la
   * fenêtre des raccourcis, la même que « / ».
   */
  actions?(courant: Id, ouvrir: (id: Id) => void, aide: () => void): ReactNode
  /** Ce que l'application ajoute à droite de la seconde rangée, à côté du bouton de vue (partager, exporter). */
  actionsTableau?(courant: Id, ouvrir: (id: Id) => void): ReactNode
}) {
  const racine = espace.racine
  const [parcours, setParcours] = useState(() => parcoursDepart(racine))
  const courant = courantDe(parcours)
  const lectureSeule = useSyncExternalStore(espace.ecouter, () => espace.lectureSeule?.(courant) ?? false)
  const [reglages, changerReglages] = useReglages()
  // Posée avant de dessiner la toile, qui la lit à chaque mesure.
  definirTailleGrille(reglages.grille)
  // Un changement de langue redessine l'en-tête et la toile : les textes se relisent à la nouvelle langue.
  const langue = useLangue()
  const [reglagesOuverts, setReglagesOuverts] = useState(false)
  const [presentation, setPresentation] = useState(false)
  const [aideOuverte, setAideOuverte] = useState(false)
  const fermerAide = useCallback(() => setAideOuverte(false), [])
  const ouvrirAide = useCallback(() => setAideOuverte(true), [])
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
      lectureSeule: lectureSeule || hote.lectureSeule || presentation,
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
      deposerDans: (cible, elements) => {
        if (espace.lectureSeule?.(cible)) return
        const m = espace.magasin(cible)
        const neufs = placerALaSuite(m.lire(), elements)
        m.appliquerSeulement(neufs.map((element) => ({ type: 'creer' as const, element })))
        return neufs
      },
    }),
    [hote, espace, ouvrir, courant, lectureSeule, reglages.doubleClic, reglages.barre, presentation],
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
  const etat = useRef({ courant, ouvrir, espace, parcours })
  etat.current = { courant, ouvrir, espace, parcours }
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
  const basculerTheme = useCallback(() => changerReglages({ theme: reglages.theme === 'sombre' ? 'clair' : 'sombre' }), [reglages.theme, changerReglages])
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

  return (
    <div ref={racineEspace} className="notak-espace" data-theme={reglages.theme} data-taille={reglages.taille} data-presentation={presentation || undefined}>
      <Entete
        key={`entete:${langue}`}
        segments={segments}
        charge={charge}
        courant={courant}
        ouvrir={ouvrir}
        renommer={courant === racine || lectureSeule ? undefined : (titre) => espace.renommer(courant, titre)}
        presence={espace.presence?.(courant)}
        adressePhoto={hote.adressePhoto}
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
      {aideOuverte && <FenetreRaccourcis fermer={fermerAide} />}
      {reglagesOuverts && <FenetreReglages reglages={reglages} changer={changerReglages} fermer={() => setReglagesOuverts(false)} {...(compte ? { compte } : {})} />}
    </div>
  )
}

function Entete({
  segments,
  courant,
  ouvrir,
  renommer,
  presence,
  adressePhoto,
  actions,
  actionsTableau,
  historique,
  peutAnnuler = true,
  peutRetablir = true,
  envoi,
  charge = true,
}: {
  segments: Segment[]
  courant: Id
  ouvrir(id: Id): void
  /** Le titre du tableau ouvert se change en place, dans la seconde rangée (pas celui de l'accueil). */
  renommer?(titre: string): void
  presence?: Services['presence']
  adressePhoto?: Services['adressePhoto']
  actions?: ReactNode
  /** À droite de la seconde rangée, avant le bouton de vue. */
  actionsTableau?: ReactNode
  /** Annuler et rétablir le tableau ouvert ; absent en lecture seule. */
  historique?: { annuler(): void; retablir(): void }
  /** Les piles du magasin : un bouton dont la pile est vide est grisé. */
  peutAnnuler?: boolean
  peutRetablir?: boolean
  envoi?: EtatEnvoi
  /** Faux tant que le tableau ouvert n'a pas rattrapé le serveur. */
  charge?: boolean
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
        title={ici && !charge ? t('espace.chargement') : s.titre}
        data-depot-tableau={s.id}
        data-charge={(ici && !charge) || undefined}
        // Le maillon du tableau ouvert mène à son titre, qui se change dans la seconde rangée.
        onClick={() => (ici ? document.querySelector<HTMLInputElement>('.notak-titre-champ')?.focus() : aller(s.id))}
      >
        {s.titre || t('commun.sansTitre')}
      </button>
    )
  }
  const titre = segments.at(-1)?.titre ?? ''

  return (
    <header className="notak-entete" ref={entete}>
      <div className="notak-entete-haut">
        <nav className="notak-fil" aria-label={t('espace.fil')}>
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
        </nav>
        <div className="notak-entete-droite">
          {historique && (
            <>
              <div className="notak-historique">
                <Infobulle libelle={t('espace.annuler')} raccourci="⌘Z">
                  <button type="button" aria-label={t('espace.annuler')} disabled={!peutAnnuler} onClick={historique.annuler}>
                    <Icone nom="annuler" taille={24} />
                  </button>
                </Infobulle>
                <Infobulle libelle={t('espace.retablir')} raccourci="⇧⌘Z">
                  <button type="button" aria-label={t('espace.retablir')} disabled={!peutRetablir} onClick={historique.retablir}>
                    <Icone nom="retablir" taille={24} />
                  </button>
                </Infobulle>
              </div>
              <span className="notak-entete-filet" aria-hidden />
            </>
          )}
          <Pastilles presence={presence} adressePhoto={adressePhoto} />
          {actions && <div className="notak-entete-actions">{actions}</div>}
        </div>
      </div>
      <div className="notak-entete-bas">
        <div className="notak-entete-gauche">
          <EtatEnregistrement etat={envoi} />
        </div>
        <TitreTableau titre={titre} {...(renommer ? { renommer } : {})} />
        <div className="notak-entete-droite notak-entete-actions">
          {actionsTableau}
          <BoutonVue />
        </div>
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
    <div className="notak-pastilles">
      {vus.map((u) => (
        <PastillePersonne key={u.id} nom={u.nom} couleur={u.couleur} adresse={u.photo ? adressePhoto?.(u.photo) : undefined} />
      ))}
      {reste.length > 0 && (
        <span className="notak-pastille notak-pastille-reste" title={reste.map((u) => u.nom).join(', ')}>
          +{reste.length}
        </span>
      )}
    </div>
  )
}
