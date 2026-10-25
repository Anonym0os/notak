import {
  type BoitePlan,
  BoutonIlot,
  type EspaceNavigable,
  FOND_NOTE,
  type FenetresNotak,
  type GenreNeuf,
  Icone,
  Ilot,
  type NomIcone,
  type ResumeContenu,
  creerSurLAccueil,
} from '@notak/tableau'
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { type EntreeBibliotheque, lireBibliotheque } from './api'
import { allerA, surLien } from './chemin'
import { t } from './langue'

/**
 * La bibliothèque, page d'accueil de l'édition serveur : tout ce que le compte peut ouvrir, en vignettes, comme chez
 * Xmind. Une colonne de rubriques à gauche, la barre de l'application en haut, et des tuiles rangées par date
 * d'ouverture ou par dossier (la toile qui les porte). Les toiles restent la façon de ranger ; ici, on parcourt.
 */

export const RUBRIQUES = ['recents', 'favoris', 'partages', 'toiles', 'cartes', 'documents'] as const
export type Rubrique = (typeof RUBRIQUES)[number]
export type Tri = 'date' | 'dossier'

const ICONE_RUBRIQUE: Record<Rubrique, NomIcone> = {
  recents: 'horloge',
  favoris: 'etoile',
  partages: 'equipe',
  toiles: 'tableau',
  cartes: 'carteMentale',
  documents: 'document',
}
const ICONE_GENRE: Record<EntreeBibliotheque['genre'], NomIcone> = { toile: 'tableau', arbre: 'carteMentale', document: 'document' }
/** Ce que crée la première tuile de chaque rubrique ; rien dans les favoris et les partages. */
const NEUF_DE: Partial<Record<Rubrique, GenreNeuf>> = { recents: 'toile', toiles: 'toile', cartes: 'arbre', documents: 'document' }

/** Les récents s'arrêtent là : au-delà, on passe par les rubriques d'un genre. */
const RECENTS_MAX = 60
const JOUR = 86_400_000

const parTitre = (a: EntreeBibliotheque, b: EntreeBibliotheque) =>
  (a.titre || '￿').localeCompare(b.titre || '￿', undefined, { sensitivity: 'base', numeric: true })
const parOuverture = (a: EntreeBibliotheque, b: EntreeBibliotheque) => (b.vu ?? -1) - (a.vu ?? -1) || parTitre(a, b)

/** Ce que montre chaque rubrique, la plus récemment ouverte d'abord, puis par titre. */
export function entreesDe(rubrique: Rubrique, toutes: readonly EntreeBibliotheque[]): EntreeBibliotheque[] {
  const garder = (f: (e: EntreeBibliotheque) => boolean) => toutes.filter(f).sort(parOuverture)
  switch (rubrique) {
    case 'recents':
      return garder((e) => e.vu !== null).slice(0, RECENTS_MAX)
    case 'favoris':
      return garder((e) => e.favori)
    case 'partages':
      return garder((e) => e.partage)
    case 'toiles':
      return garder((e) => e.genre === 'toile')
    case 'cartes':
      return garder((e) => e.genre === 'arbre')
    case 'documents':
      return garder((e) => e.genre === 'document')
  }
}

/** Une suite de tuiles sous un titre ; `dans` : la toile que la section regroupe (tri par dossier). */
export interface Section {
  cle: string
  titre: string
  dans?: string | null
  entrees: EntreeBibliotheque[]
}

/** Les tuiles rangées par date d'ouverture : aujourd'hui, les sept derniers jours, plus tôt, puis jamais ouvertes. */
export function sectionsParDate(entrees: readonly EntreeBibliotheque[], maintenant = Date.now()): Section[] {
  const minuit = new Date(maintenant).setHours(0, 0, 0, 0)
  const groupes: Section[] = [
    { cle: 'aujourdhui', titre: t('biblio.groupe.aujourdhui'), entrees: [] },
    { cle: 'semaine', titre: t('biblio.groupe.semaine'), entrees: [] },
    { cle: 'avant', titre: t('biblio.groupe.avant'), entrees: [] },
    { cle: 'jamais', titre: t('biblio.groupe.jamais'), entrees: [] },
  ]
  for (const e of [...entrees].sort(parOuverture)) {
    const i = e.vu === null ? 3 : e.vu >= minuit ? 0 : e.vu >= maintenant - 7 * JOUR ? 1 : 2
    groupes[i]!.entrees.push(e)
  }
  return groupes.filter((g) => g.entrees.length > 0)
}

/**
 * Les tuiles rangées par dossier : une section par toile qui les porte, titrée de son nom, la plus récemment ouverte
 * d'abord. Ce dont on ne lit pas la toile (un partage venu d'ailleurs) va à part, en dernier.
 */
export function sectionsParDossier(entrees: readonly EntreeBibliotheque[]): Section[] {
  const parDossier = new Map<string, Section>()
  for (const e of [...entrees].sort(parOuverture)) {
    const cle = e.dans ?? ''
    let s = parDossier.get(cle)
    if (!s) parDossier.set(cle, (s = { cle: `dossier:${cle}`, titre: e.dans ? e.ou || t('commun.sansTitre') : t('biblio.sansDossier'), dans: e.dans, entrees: [] }))
    s.entrees.push(e)
  }
  const recent = (s: Section) => s.entrees[0]?.vu ?? -1
  return [...parDossier.values()].sort(
    (a, b) => Number(!a.dans) - Number(!b.dans) || recent(b) - recent(a) || a.titre.localeCompare(b.titre, undefined, { sensitivity: 'base', numeric: true }),
  )
}

const sansAccents = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Ce qui répond à une recherche : chaque mot dans le titre ou dans le nom de la toile qui le porte. */
export function filtrer(entrees: readonly EntreeBibliotheque[], requete: string): EntreeBibliotheque[] {
  const mots = sansAccents(requete).split(/\s+/).filter(Boolean)
  if (mots.length === 0) return [...entrees]
  return entrees.filter((e) => {
    const texte = sansAccents(`${e.titre} ${e.ou ?? ''}`)
    return mots.every((m) => texte.includes(m))
  })
}

/** L'adresse qui ouvre une entrée : la toile, ou l'élément en grand sur sa toile. */
export const adresseDe = (e: Pick<EntreeBibliotheque, 'tableau' | 'element'>) =>
  e.element === null ? `/t/${encodeURIComponent(e.tableau)}` : `/t/${encodeURIComponent(e.tableau)}/e/${encodeURIComponent(e.element)}`

const rubriqueDeLAdresse = (): Rubrique | null => {
  const v = new URLSearchParams(location.search).get('vue')
  return (RUBRIQUES as readonly string[]).includes(v ?? '') ? (v as Rubrique) : null
}

const CLE_TRI = 'notak:bibliotheque-tri'
function lireTri(): Tri {
  try {
    return localStorage.getItem(CLE_TRI) === 'dossier' ? 'dossier' : 'date'
  } catch {
    return 'date'
  }
}
function ecrireTri(tri: Tri) {
  try {
    localStorage.setItem(CLE_TRI, tri)
  } catch {
    // Sans stockage, le choix vaut pour la visite.
  }
}

/** Ce que la page sait de l'espace : sa toile d'accueil (pour son titre), et de quoi y créer. */
type EspaceBibliotheque = Pick<EspaceNavigable, 'racine' | 'tableau' | 'ecouter' | 'magasin' | 'creerTableau'> & { synchronise?(id: string): boolean }

/** Crée sur l'accueil, une fois son contenu arrivé du serveur (au plus quelques secondes), pour se poser à la suite. */
async function creerQuandPret(espace: EspaceBibliotheque, genre: GenreNeuf) {
  const pret = () => espace.synchronise?.(espace.racine) ?? true
  espace.tableau(espace.racine)
  if (!pret())
    await new Promise<void>((fini) => {
      const arret = setTimeout(() => (fin(), fini()), 4000)
      const fin = espace.ecouter(() => {
        if (!pret()) return
        clearTimeout(arret)
        fin()
        fini()
      })
    })
  return creerSurLAccueil(espace as EspaceNavigable, genre)
}

export function PageBibliotheque({
  charger = lireBibliotheque,
  espace,
  fenetres,
  compte,
  creer = (genre) => creerQuandPret(espace!, genre),
}: {
  charger?: () => Promise<EntreeBibliotheque[]>
  espace?: EspaceBibliotheque
  fenetres?: FenetresNotak
  /** Les notifications et le compte, que l'application prête à la barre. */
  compte?: ReactNode
  creer?: (genre: GenreNeuf) => Promise<{ tableau: string; element: string | null }>
}) {
  const [toutes, setToutes] = useState<EntreeBibliotheque[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [choisie, setChoisie] = useState<Rubrique | null>(rubriqueDeLAdresse)
  const [tri, setTri] = useState<Tri>(lireTri)
  const [requete, setRequete] = useState('')
  const [menuNeuf, setMenuNeuf] = useState(false)
  const champ = useRef<HTMLInputElement>(null)
  const nav = useRef<HTMLElement>(null)
  const titreAccueil = useSyncExternalStore(espace?.ecouter ?? (() => () => {}), () => (espace ? espace.tableau(espace.racine)?.titre : '') ?? '')

  const lire = useCallback(() => {
    setErreur(null)
    charger().then(setToutes, (x: Error) => setErreur(x.message || t('commun.echec')))
  }, [charger])
  useEffect(lire, [lire])

  // ⌘F cherche dans la bibliothèque ; Échap vide la recherche.
  useEffect(() => {
    const touche = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        champ.current?.focus()
        champ.current?.select()
      }
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [])

  const parRubrique = useMemo(
    () => (toutes ? (Object.fromEntries(RUBRIQUES.map((r) => [r, entreesDe(r, toutes)])) as Record<Rubrique, EntreeBibliotheque[]>) : null),
    [toutes],
  )
  // On commence par les récents ; tant qu'on n'a rien ouvert, par les toiles.
  const rubrique: Rubrique = choisie ?? (parRubrique && parRubrique.recents.length === 0 ? 'toiles' : 'recents')
  const cherche = requete.trim() !== ''
  const visibles = toutes && parRubrique ? (cherche ? filtrer(toutes, requete).sort(parOuverture) : parRubrique[rubrique]) : []
  const sections = tri === 'dossier' ? sectionsParDossier(visibles) : sectionsParDate(visibles)
  const neuf = cherche ? undefined : NEUF_DE[rubrique]

  const choisir = (r: Rubrique) => {
    setChoisie(r)
    setRequete('')
    history.replaceState(null, '', r === 'recents' ? '/' : `/?vue=${r}`)
  }
  const trier = (x: Tri) => {
    setTri(x)
    ecrireTri(x)
  }
  const [creation, setCreation] = useState(false)
  const creerPuisOuvrir = async (genre: GenreNeuf) => {
    setMenuNeuf(false)
    if (creation) return
    setCreation(true)
    try {
      allerA(adresseDe(await creer(genre)))
    } finally {
      setCreation(false)
    }
  }
  // Les flèches passent d'une rubrique à l'autre dans la colonne, comme dans une liste.
  const surTouche = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const boutons = [...(nav.current?.querySelectorAll<HTMLButtonElement>('[data-rubrique]') ?? [])]
    const i = boutons.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    e.preventDefault()
    boutons[(i + (e.key === 'ArrowDown' ? 1 : -1) + boutons.length) % boutons.length]?.focus()
  }

  const bouton = (r: Rubrique) => (
    <button key={r} type="button" className="biblio-rubrique" data-rubrique={r} aria-current={!cherche && rubrique === r ? 'page' : undefined} onClick={() => choisir(r)}>
      <Icone nom={ICONE_RUBRIQUE[r]} taille={18} />
      <span>{t(`biblio.rubrique.${r}`)}</span>
      {parRubrique && r !== 'recents' && parRubrique[r].length > 0 && <small>{parRubrique[r].length}</small>}
    </button>
  )
  const accueil = espace ? `/t/${encodeURIComponent(espace.racine)}` : '/'

  return (
    <div className="biblio">
      <nav className="biblio-colonne" aria-label={t('biblio.titre')} ref={nav} onKeyDown={surTouche} data-tauri-drag-region="deep">
        <div className="biblio-nouveau">
          <button type="button" className="biblio-nouveau-bouton" aria-expanded={menuNeuf} aria-haspopup="menu" disabled={creation} onClick={() => setMenuNeuf((o) => !o)}>
            <Icone nom="ajouter" taille={18} trait={2} />
            {t('biblio.nouveau')}
            <Icone nom="chevronBas" taille={14} trait={2} />
          </button>
          {menuNeuf && <MenuNeuf creer={creerPuisOuvrir} fermer={() => setMenuNeuf(false)} />}
        </div>
        {bouton('recents')}
        {bouton('favoris')}
        {bouton('partages')}
        <p className="biblio-groupe">{t('biblio.mesContenus')}</p>
        {bouton('toiles')}
        {bouton('cartes')}
        {bouton('documents')}
        <p className="biblio-groupe">{t('biblio.maToile')}</p>
        <a className="biblio-rubrique" href={accueil} onClick={(e) => surLien(e, accueil)}>
          <span className="biblio-maison" aria-hidden>
            <Icone nom="maison" taille={12} trait={2.4} />
          </span>
          <span>{titreAccueil || t('biblio.accueil')}</span>
        </a>
        <div className="biblio-bas">
          {fenetres && (
            <>
              <button type="button" className="biblio-rubrique" onClick={fenetres.aide}>
                <Icone nom="aide" taille={18} />
                <span>{t('biblio.aide')}</span>
              </button>
              <button type="button" className="biblio-rubrique" onClick={fenetres.reglages}>
                <Icone nom="reglages" taille={18} />
                <span>{t('reglages.titre')}</span>
              </button>
            </>
          )}
        </div>
      </nav>

      <header className="biblio-tete" data-tauri-drag-region="deep">
        <h1>{cherche ? t('biblio.resultats') : t(`biblio.rubrique.${rubrique}`)}</h1>
        <div className="biblio-tete-droite">
          <Ilot className="biblio-tri" etiquette={t('biblio.tri')}>
            {(['date', 'dossier'] as const).map((x) => (
              <button key={x} type="button" className="biblio-tri-choix" aria-pressed={tri === x} onClick={() => trier(x)}>
                <Icone nom={x === 'date' ? 'horloge' : 'dossier'} taille={16} />
                {t(`biblio.tri.${x}`)}
              </button>
            ))}
          </Ilot>
          <Ilot className="biblio-recherche">
            <label className="biblio-recherche-champ">
              <Icone nom="recherche" taille={17} />
              <input
                ref={champ}
                type="search"
                placeholder={t('biblio.chercher')}
                aria-label={t('biblio.chercher')}
                value={requete}
                onChange={(e) => setRequete(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && (setRequete(''), e.currentTarget.blur())}
              />
              {!cherche && <kbd>⌘F</kbd>}
            </label>
          </Ilot>
          {(compte || fenetres) && (
            <Ilot className="notak-ilot-compte">
              {compte}
              {fenetres && <BoutonIlot icone="reglages" libelle={t('reglages.titre')} raccourci="⌘," onClick={fenetres.reglages} />}
            </Ilot>
          )}
        </div>
      </header>

      <main className="biblio-corps" aria-busy={!toutes && !erreur}>
        {erreur ? (
          <div className="biblio-vide" role="alert">
            <p>{erreur}</p>
            <button type="button" className="bouton" onClick={lire}>
              {t('bandeau.reessayer')}
            </button>
          </div>
        ) : !toutes ? (
          <ul className="biblio-grille" aria-hidden>
            {Array.from({ length: 10 }, (_, i) => (
              <li key={i} className="biblio-attente">
                <span />
                <span />
              </li>
            ))}
          </ul>
        ) : visibles.length === 0 && !neuf ? (
          <div className="biblio-vide">
            <Icone nom={cherche ? 'recherche' : ICONE_RUBRIQUE[rubrique]} taille={28} trait={1.5} />
            <p>{cherche ? t('biblio.aucunResultat', { requete: requete.trim() }) : t(`biblio.vide.${rubrique}`)}</p>
            {!cherche && <small>{t(`biblio.vide.${rubrique}.aide`)}</small>}
          </div>
        ) : (
          <>
            {(sections.length > 0 ? sections : [{ cle: 'vide', titre: '', entrees: [] } as Section]).map((s, i) => (
              <section key={s.cle} className="biblio-section" aria-label={s.titre || undefined}>
                {s.titre && (
                  <h2>
                    {s.dans !== undefined && <Icone nom={s.dans ? 'tableau' : 'equipe'} taille={15} />}
                    {s.dans ? (
                      <a href={`/t/${encodeURIComponent(s.dans)}`} onClick={(e) => surLien(e, `/t/${encodeURIComponent(s.dans!)}`)}>
                        {s.titre}
                      </a>
                    ) : (
                      s.titre
                    )}
                  </h2>
                )}
                <ul className="biblio-grille">
                  {i === 0 && neuf && (
                    <li>
                      <button type="button" className="biblio-tuile biblio-tuile-neuve" disabled={creation} onClick={() => void creerPuisOuvrir(neuf)}>
                        <span className="biblio-vignette" aria-hidden>
                          <Icone nom="ajouter" taille={36} trait={1.2} />
                        </span>
                        <span className="biblio-tuile-titre">{t(`biblio.neuf.${neuf}`)}</span>
                        <span className="biblio-tuile-ou">{t('biblio.neuf.aide')}</span>
                      </button>
                    </li>
                  )}
                  {s.entrees.map((e) => (
                    <li key={`${e.tableau}/${e.element ?? ''}`}>
                      <Tuile entree={e} parDossier={tri === 'dossier'} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {visibles.length === 0 && (
              <div className="biblio-vide biblio-vide-bas">
                <p>{t(`biblio.vide.${rubrique}`)}</p>
                <small>{t(`biblio.vide.${rubrique}.aide`)}</small>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

/** Le menu du bouton « Nouveau » : une toile, une carte mentale ou un document, posés sur l'accueil. */
function MenuNeuf({ creer, fermer }: { creer(genre: GenreNeuf): void; fermer(): void }) {
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    menu.current?.querySelector('button')?.focus()
    const dehors = (e: PointerEvent) => !(e.target as HTMLElement).closest('.biblio-nouveau') && fermer()
    const touche = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && fermer()
    document.addEventListener('pointerdown', dehors)
    document.addEventListener('keydown', touche)
    return () => {
      document.removeEventListener('pointerdown', dehors)
      document.removeEventListener('keydown', touche)
    }
  }, [fermer])
  return (
    <div className="biblio-menu" role="menu" ref={menu}>
      {(['toile', 'arbre', 'document'] as const).map((g) => (
        <button key={g} type="button" role="menuitem" onClick={() => creer(g)}>
          <Icone nom={ICONE_GENRE[g]} taille={18} />
          <span>
            {t(`biblio.genre.${g}`)}
            <small>{t(`biblio.neuf.${g}.aide`)}</small>
          </span>
        </button>
      ))}
    </div>
  )
}

function Tuile({ entree: e, parDossier }: { entree: EntreeBibliotheque; parDossier: boolean }) {
  const adresse = adresseDe(e)
  return (
    <a className="biblio-tuile" href={adresse} onClick={(ev) => surLien(ev, adresse)}>
      <Vignette resume={e.resume} />
      <span className="biblio-tuile-titre">{e.titre || t('commun.sansTitre')}</span>
      <span className="biblio-tuile-ou">
        <Icone nom={ICONE_GENRE[e.genre]} taille={13} />
        <span>{e.ou && !parDossier ? t('biblio.dans', { toile: e.ou }) : t(`biblio.genre.${e.genre}`)}</span>
      </span>
    </a>
  )
}

/** Le dessin d'une entrée : le plan d'une toile, une carte mentale et ses branches, la page d'un document. */
function Vignette({ resume }: { resume: ResumeContenu }) {
  if (resume.genre === 'document') return <VignetteDocument titre={resume.titre} lignes={resume.lignes} />
  if (resume.genre === 'arbre') return <VignetteCarte central={resume.titre} branches={resume.branches} />
  return (
    <span className="biblio-vignette" data-genre="toile" aria-hidden>
      {resume.boites.length === 0 ? <span className="biblio-vignette-vide">{t('tableau.vide')}</span> : <PlanToile boites={resume.boites} />}
    </span>
  )
}

/** Le format des vignettes, celui des tuiles de Xmind. */
const [VL, VH] = [206, 136]
/** Les largeurs des barres de texte, d'une ligne à l'autre, pour qu'un paragraphe ait l'air d'en être un. */
const BARRES = [0.92, 0.78, 0.86, 0.6, 0.84, 0.7]

const fondNote = (couleur: string) => (couleur in FOND_NOTE ? FOND_NOTE[couleur as keyof typeof FOND_NOTE] : 'var(--notak-carte, #fff)')

/** Au plus tant d'UG de large dans une vignette : au-delà, le texte des cartes ne se devine plus. */
const PLAN_LARGEUR_MAX = 120

/**
 * Le plan d'une toile : ses éléments à leur place, chacun dessiné selon ce qu'il est. Une petite toile s'y montre
 * entière ; d'une grande, on voit le coin où elle commence, à une échelle où l'on reconnaît ses cartes.
 */
export function PlanToile({ boites }: { boites: BoitePlan[] }) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y, l, h] of boites) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x + l), Math.max(y1, y + h)]
  // Pas moins qu'une toile de quelques cartes, et au format de la tuile : une seule note ne la remplit pas.
  const marge = 8
  let [l, h] = [Math.max(x1 - x0, 90) + 2 * marge, Math.max(y1 - y0, 50) + 2 * marge]
  if (l / h > VL / VH) h = (l * VH) / VL
  else l = (h * VL) / VH
  const rogne = l > PLAN_LARGEUR_MAX
  if (rogne) [l, h] = [PLAN_LARGEUR_MAX, (PLAN_LARGEUR_MAX * VH) / VL]
  const [gauche, haut] = rogne ? [x0 - marge, y0 - marge] : [(x0 + x1) / 2 - l / 2, (y0 + y1) / 2 - h / 2]
  return (
    <svg viewBox={`${gauche} ${haut} ${l} ${h}`} preserveAspectRatio="xMidYMid meet">
      {boites.map((b, i) => (
        <Boite key={i} boite={b} />
      ))}
    </svg>
  )
}

function Barres({ x, y, l, n, pas = 2.6, couleur = 'rgb(50 59 74 / 0.26)' }: { x: number; y: number; l: number; n: number; pas?: number; couleur?: string }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x} y={y + i * pas} width={Math.max(2, l * BARRES[i % BARRES.length]!)} height={1.1} rx={0.55} fill={couleur} />
      ))}
    </>
  )
}

function Boite({ boite: [x, y, l, h, couleur, type = 'note', lignes = 1] }: { boite: BoitePlan }) {
  const trait = { stroke: 'rgb(27 37 54 / 0.12)', strokeWidth: 0.35 }
  switch (type) {
    case 'colonne': {
      const cartes = Math.max(0, Math.min(lignes, Math.floor((h - 5) / 9)))
      return (
        <g>
          <rect x={x} y={y} width={l} height={h} rx={1.2} fill={couleur ? fondNote(couleur) : 'rgb(50 59 74 / 0.12)'} />
          <rect x={x + 1.6} y={y + 1.6} width={Math.min(l * 0.45, 12)} height={1.4} rx={0.7} fill="rgb(50 59 74 / 0.55)" />
          {Array.from({ length: cartes }, (_, i) => (
            <g key={i}>
              <rect x={x + 1.5} y={y + 5 + i * 9} width={l - 3} height={7.6} rx={0.7} fill="var(--notak-carte, #fff)" {...trait} />
              <Barres x={x + 3} y={y + 7.4 + i * 9} l={l - 7} n={2} />
            </g>
          ))}
        </g>
      )
    }
    case 'image':
      return (
        <g>
          <rect x={x} y={y} width={l} height={h} rx={0.8} fill="#cfd4da" />
          <path d={`M${x} ${y + h * 0.82} L${x + l * 0.32} ${y + h * 0.5} L${x + l * 0.52} ${y + h * 0.7} L${x + l * 0.7} ${y + h * 0.56} L${x + l} ${y + h * 0.84} V${y + h} H${x} Z`} fill="#b3bac3" />
          <circle cx={x + l * 0.72} cy={y + h * 0.28} r={Math.min(l, h) * 0.08} fill="#e6e9ec" />
        </g>
      )
    case 'tableau': {
      const c = Math.min(l, h - 3.5)
      return (
        <g>
          <rect x={x + (l - c) / 2} y={y} width={c} height={c} rx={c * 0.2} fill={couleur in FOND_NOTE ? fondNote(couleur) : '#5b6cf0'} />
          <rect x={x + (l - c) / 2 + c * 0.2} y={y + c * 0.24} width={c * 0.6} height={c * 0.18} rx={0.5} fill="#fff" opacity={0.85} />
          <rect x={x + (l - c) / 2 + c * 0.2} y={y + c * 0.5} width={c * 0.27} height={c * 0.27} rx={0.5} fill="#fff" opacity={0.85} />
          <rect x={x + (l - c) / 2 + c * 0.53} y={y + c * 0.5} width={c * 0.27} height={c * 0.27} rx={0.5} fill="#fff" opacity={0.85} />
          <rect x={x + l * 0.2} y={y + c + 1.6} width={l * 0.6} height={1.2} rx={0.6} fill="rgb(50 59 74 / 0.4)" />
        </g>
      )
    }
    case 'arbre':
      return (
        <g>
          <rect x={x} y={y} width={l} height={h} rx={1} fill="var(--notak-carte, #fff)" {...trait} />
          {[-0.28, 0, 0.28].map((d, i) => (
            <path key={i} d={`M${x + l * 0.5} ${y + h / 2} C${x + l * 0.65} ${y + h / 2} ${x + l * 0.65} ${y + h * (0.5 + d)} ${x + l * 0.78} ${y + h * (0.5 + d)} h${l * 0.12}`} fill="none" stroke={BRANCHES[i]} strokeWidth={0.5} />
          ))}
          <rect x={x + l * 0.3} y={y + h / 2 - 1.8} width={l * 0.26} height={3.6} rx={1} fill="#323b4a" />
        </g>
      )
    case 'document':
      return (
        <g>
          <rect x={x} y={y} width={l} height={h} rx={0.8} fill="var(--notak-carte, #fff)" {...trait} />
          <rect x={x + 2} y={y + 2.2} width={l * 0.5} height={1.6} rx={0.8} fill="rgb(50 59 74 / 0.7)" />
          <Barres x={x + 2} y={y + 5.6} l={l - 4} n={Math.max(1, Math.floor((h - 7) / 2.4))} pas={2.4} />
        </g>
      )
    case 'table':
      return (
        <g>
          <rect x={x} y={y} width={l} height={h} rx={0.6} fill="var(--notak-carte, #fff)" {...trait} />
          <rect x={x} y={y} width={l} height={Math.min(4, h / 4)} fill="rgb(50 59 74 / 0.08)" />
          {[1, 2, 3].map((k) => (
            <path key={k} d={`M${x + (l * k) / 4} ${y} V${y + h} M${x} ${y + (h * k) / 4} H${x + l}`} {...trait} />
          ))}
        </g>
      )
    default: {
      const n = Math.max(1, Math.min(lignes, Math.floor((h - 2.4) / 2.6)))
      return (
        <g>
          <rect x={x} y={y} width={l} height={h} rx={0.8} fill={fondNote(couleur)} {...trait} />
          <Barres x={x + 2} y={y + (h - (n - 1) * 2.6 - 1.1) / 2} l={l - 4} n={n} couleur={couleur in FOND_NOTE ? 'rgb(27 37 54 / 0.3)' : 'rgb(50 59 74 / 0.26)'} />
        </g>
      )
    }
  }
}

/** Les couleurs des branches principales, dans l'ordre, comme le thème par défaut de Xmind. */
const BRANCHES = ['#e5534b', '#ef8a2b', '#d6b11d', '#4aa24f', '#3d7be0', '#8a5bd6', '#d64f9a', '#2fa39a']

/** Le central au milieu, ses branches de part et d'autre, chacune de sa couleur, le titre posé sur son trait. */
export function VignetteCarte({ central, branches }: { central: string; branches: string[] }) {
  const coupe = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
  const titre = coupe(central || t('commun.sansTitre'), 18)
  const lc = Math.min(110, titre.length * 5.6 + 22)
  const droite = branches.slice(0, Math.ceil(branches.length / 2))
  const gauche = branches.slice(droite.length)
  const cote = (liste: string[], sens: 1 | -1, decalage: number) =>
    liste.map((b, i) => {
      const y = (VH / (liste.length + 1)) * (i + 1) + 3
      const texte = coupe(b || '·', 12)
      const lb = Math.min(64, texte.length * 4.6 + 6)
      const couleur = BRANCHES[(decalage + i) % BRANCHES.length]!
      const depart = VL / 2 + (sens * lc) / 2
      const bout = sens === 1 ? VL - 12 - lb : 12 + lb
      const milieu = (depart + bout) / 2
      return (
        <g key={`${sens}${i}`}>
          <path d={`M${depart} ${VH / 2} C${milieu} ${VH / 2} ${milieu} ${y} ${bout} ${y} h${sens * lb}`} fill="none" stroke={couleur} strokeWidth={1.5} strokeLinecap="round" />
          <text x={sens === 1 ? bout + 1 : bout - 1} y={y - 3} textAnchor={sens === 1 ? 'start' : 'end'} fontSize={8.2} fill="var(--notak-texte, #323b4a)">
            {texte}
          </text>
        </g>
      )
    })
  return (
    <span className="biblio-vignette" data-genre="arbre" aria-hidden>
      <svg viewBox={`0 0 ${VL} ${VH}`} preserveAspectRatio="xMidYMid meet">
        {cote(droite, 1, 0)}
        {cote(gauche, -1, droite.length)}
        <rect x={(VL - lc) / 2} y={VH / 2 - 11} width={lc} height={22} rx={6} fill="#323b4a" />
        <text x={VL / 2} y={VH / 2 + 3.4} textAnchor="middle" fontSize={9.2} fontWeight={600} fill="#fff">
          {titre}
        </text>
      </svg>
    </span>
  )
}

/** La page d'un document : son titre, puis une barre par ligne, à la longueur de la ligne. */
export function VignetteDocument({ titre, lignes }: { titre: string; lignes: string[] }) {
  const coupe = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
  const largeur = 98
  return (
    <span className="biblio-vignette" data-genre="document" aria-hidden>
      <svg viewBox={`0 0 ${VL} ${VH}`} preserveAspectRatio="xMidYMid meet">
        <rect x={40} y={16} width={126} height={140} rx={4} fill="var(--notak-carte, #fff)" stroke="rgb(27 37 54 / 0.1)" />
        <text x={54} y={38} fontSize={11} fontWeight={700} fill="var(--notak-texte, #323b4a)">
          {coupe(titre || t('commun.sansTitre'), 19)}
        </text>
        {lignes.slice(0, 6).map((l, i) => (
          <rect key={i} x={54} y={50 + i * 11} width={Math.max(14, Math.min(largeur, (l.length / 60) * largeur))} height={3} rx={1.5} fill="rgb(50 59 74 / 0.22)" />
        ))}
      </svg>
    </span>
  )
}

