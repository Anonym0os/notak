import {
  type GenreNeuf,
  type Id,
  type NomIcone,
  type ResultatRecherche,
  type ResumeContenu,
  creerSurLAccueil,
  demanderAMontrer,
  FeuilleBas,
  Icone,
  lireTableau,
  normaliser,
  quandPretes,
  resumesDuTableau,
  t,
  tn,
} from '@notak/tableau'
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Vignette } from '../bibliotheque/Vignettes'
import { type EspaceLocal, rechercherLocalement } from './espace'

/**
 * La bibliothèque de l'édition locale, celle de l'app iPhone : la page où l'on arrive. En tête, la toile d'accueil,
 * qui porte tout le reste ; puis ce qu'on a ouvert récemment, en rangée qui glisse ; puis les toiles, les cartes
 * mentales et les documents de l'appareil, quatre de chaque, le reste sur « Tout voir ». Le « + » du haut crée, la
 * recherche replie le grand titre comme celle des Notes d'iOS. Elle s'ouvre par la maison de l'en-tête (`/toiles`)
 * et se quitte en ouvrant ce qu'on touche, ou par le retour.
 */

const CLE_VUS = 'notak:local:vus'

/** Quand chaque toile (son id) ou chaque élément (`toile/e/élément`) a été ouvert pour la dernière fois ici (ms). */
export function lireVus(): Record<string, number> {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_VUS) ?? '{}') as unknown
    return brut && typeof brut === 'object' ? (brut as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function noterVu(id: string, quand = Date.now()) {
  try {
    localStorage.setItem(CLE_VUS, JSON.stringify({ ...lireVus(), [id]: quand }))
  } catch {
    // Sans stockage, la bibliothèque range par date de création.
  }
}

export const cleDe = (tableau: Id, element: Id | null) => (element ? `${tableau}/e/${element}` : tableau)

export interface EntreeLocale {
  /** La toile, ou `toile/e/élément` : la clé des récents. */
  cle: string
  /** La toile, ou celle qui porte l'élément. */
  tableau: Id
  element: Id | null
  genre: GenreNeuf
  titre: string
  /** La toile qui le porte, pour dire « dans … » (rien pour l'accueil, qui porte tout). */
  dans?: string
  vu?: number
  cree: number
  accueil: boolean
}

const titreDe = (e: Pick<EntreeLocale, 'titre' | 'accueil'>) => e.titre || (e.accueil ? t('biblio.accueil') : t('commun.sansTitre'))

/** Chaque mot de la requête dans le titre ou dans le nom de la toile qui le porte, sans casse ni accents. */
export function correspond(e: EntreeLocale, requete: string): boolean {
  const mots = normaliser(requete).split(/\s+/).filter(Boolean)
  const texte = normaliser(`${titreDe(e)} ${e.dans ?? ''}`)
  return mots.every((m) => texte.includes(m))
}

/** L'accueil d'abord, puis la plus récemment ouverte, puis la plus récemment créée ; `requete` filtre sur le titre. */
export function ordonner(entrees: readonly EntreeLocale[], requete = ''): EntreeLocale[] {
  return entrees.filter((e) => correspond(e, requete)).sort((a, b) => Number(b.accueil) - Number(a.accueil) || (b.vu ?? 0) - (a.vu ?? 0) || b.cree - a.cree)
}

/** Les récents : ce qu'on a déjà ouvert ici, hors accueil (il est en tête), le plus récent d'abord. */
export const recents = (entrees: readonly EntreeLocale[], combien = RECENTS) =>
  ordonner(entrees.filter((e) => !e.accueil && e.vu)).slice(0, combien)

/**
 * Les entrées de la page : les toiles de l'index, puis les cartes mentales et les documents que chacune porte, lus
 * dans leurs résumés à mesure qu'ils arrivent.
 */
export function entreesLocales(
  toiles: readonly { id: Id; titre: string; parent?: Id | null; cree: number }[],
  racine: Id,
  resumes: Readonly<Record<Id, readonly ResumeContenu[]>>,
  vus: Readonly<Record<string, number>>,
): EntreeLocale[] {
  const titres = new Map(toiles.map((e) => [e.id, e.id === racine ? e.titre || t('biblio.accueil') : e.titre || t('commun.sansTitre')]))
  const liste: EntreeLocale[] = []
  for (const e of toiles) {
    const accueil = e.id === racine
    liste.push({
      cle: e.id,
      tableau: e.id,
      element: null,
      genre: 'toile',
      titre: e.titre,
      cree: e.cree,
      accueil,
      ...(vus[e.id] ? { vu: vus[e.id] } : {}),
      ...(e.parent && e.parent !== racine && titres.has(e.parent) ? { dans: titres.get(e.parent) } : {}),
    })
    for (const r of resumes[e.id] ?? []) {
      if (r.genre === 'toile') continue
      const cle = cleDe(e.id, r.element)
      liste.push({
        cle,
        tableau: e.id,
        element: r.element,
        genre: r.genre,
        titre: r.titre,
        // L'élément n'a pas de date de création lisible : il suit sa toile.
        cree: e.cree,
        accueil: false,
        dans: titres.get(e.id),
        ...(vus[cle] ? { vu: vus[cle] } : {}),
      })
    }
  }
  return liste
}

/** Combien de récents dans la rangée, et de tuiles par rubrique avant « Tout voir ». */
const RECENTS = 8
const PAR_RUBRIQUE = 4
/** Au plus tant de passages trouvés dans le contenu avant « Afficher les … résultats ». */
const EXTRAITS = 3
/** Le temps d'attente avant la recherche dans le contenu : les titres, eux, répondent à chaque lettre. */
const ATTENTE_CONTENU = 200

/** L'icône de chaque genre ; `note` : un passage trouvé dans un élément qui ne s'ouvre pas en grand (note, liste…). */
const ICONE: Record<GenreNeuf | 'note', NomIcone> = { toile: 'tableau', arbre: 'carteMentale', document: 'document', note: 'note' }
const RUBRIQUES = [
  { genre: 'toile', titre: 'biblio.rubrique.toiles' },
  { genre: 'arbre', titre: 'biblio.rubrique.cartes' },
  { genre: 'document', titre: 'biblio.rubrique.documents' },
] as const

function quand(ms: number | undefined): string {
  if (!ms) return t('biblio.groupe.jamais')
  const jours = Math.floor((Date.now() - ms) / 86_400_000)
  if (jours < 1) return t('biblio.groupe.aujourdhui')
  if (jours < 7) return t('biblio.groupe.semaine')
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

const detailDe = (e: EntreeLocale) => (e.dans ? t('biblio.dans', { toile: e.dans }) : quand(e.vu))

/** Le thème de la toile (`data-theme` de la page, posé par elle) : la bibliothèque prend le même. */
function useTheme(): string | undefined {
  return useSyncExternalStore(
    (f) => {
      const obs = new MutationObserver(f)
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
      return () => obs.disconnect()
    },
    () => document.documentElement.dataset.theme,
  )
}

/** Le texte, les mots de la requête en gras : ce qui a fait trouver la ligne. */
export function Surligne({ texte, requete }: { texte: string; requete: string }) {
  const mots = normaliser(requete).split(/\s+/).filter(Boolean)
  if (mots.length === 0) return <>{texte}</>
  // `normaliser` garde la longueur lettre à lettre (il ôte les accents) : les positions valent pour le texte d'origine.
  const plat = normaliser(texte)
  if (plat.length !== texte.length) return <>{texte}</>
  const marques = new Array<boolean>(texte.length).fill(false)
  for (const m of mots) for (let i = plat.indexOf(m); i >= 0; i = plat.indexOf(m, i + m.length)) marques.fill(true, i, i + m.length)
  const morceaux: ReactNode[] = []
  for (let i = 0; i < texte.length; ) {
    let j = i
    while (j < texte.length && marques[j] === marques[i]) j++
    morceaux.push(marques[i] ? <mark key={i}>{texte.slice(i, j)}</mark> : <Fragment key={i}>{texte.slice(i, j)}</Fragment>)
    i = j
  }
  return <>{morceaux}</>
}

export function BibliothequeLocale({ el, ouvrir }: { el: EspaceLocal; ouvrir(tableau: Id, element?: Id | null): void }) {
  const { index, reseau, espace } = el
  const theme = useTheme()
  const [toiles, setToiles] = useState(() => index.lister())
  useEffect(() => index.ecouter(() => setToiles(index.lister())), [index])
  const [resumes, setResumes] = useState<Record<Id, ResumeContenu[]>>({})
  const [requete, setRequete] = useState('')
  const [cherche, setCherche] = useState(false)
  const [creation, setCreation] = useState(false)
  const [ouvertes, setOuvertes] = useState<ReadonlySet<GenreNeuf>>(new Set())
  const champ = useRef<HTMLInputElement>(null)
  const racine = index.racine()

  // Les résumés (vignettes, cartes et documents portés) se lisent un à un dans IndexedDB, sans retenir l'affichage.
  useEffect(() => {
    let fini = false
    void (async () => {
      for (const e of toiles) {
        if (fini) return
        const r = await reseau.avec(e.id, (doc) => resumesDuTableau(lireTableau(doc))).catch(() => undefined)
        if (r && !fini) setResumes((avant) => ({ ...avant, [e.id]: r }))
      }
    })()
    return () => {
      fini = true
    }
  }, [toiles, reseau])

  const entrees = useMemo(() => entreesLocales(toiles, racine, resumes, lireVus()), [toiles, racine, resumes])
  const accueil = entrees.find((e) => e.accueil)
  const resumeDe = (e: EntreeLocale): ResumeContenu | undefined => resumes[e.tableau]?.find((r) => (e.element ? r.element === e.element : r.genre === 'toile'))

  const aller = (e: Pick<EntreeLocale, 'tableau' | 'element'>) => {
    noterVu(cleDe(e.tableau, e.element))
    ouvrir(e.tableau, e.element)
  }

  const creer = async (genre: GenreNeuf, titre?: string) => {
    setCreation(false)
    // L'accueil doit être lu avant qu'on y pose la carte ou l'élément neuf.
    await quandPretes(espace, [espace.racine])
    const { tableau, element } = creerSurLAccueil(espace, genre)
    if (titre && element === null) espace.renommer(tableau, titre)
    // Une toile neuve s'ouvre ; une carte ou un document, posé sur l'accueil, s'ouvre en grand.
    aller({ tableau, element })
  }

  // La recherche dans le contenu, décalée : on garde les résultats d'avant pendant qu'elle cherche.
  const [contenu, setContenu] = useState<{ requete: string; resultats: ResultatRecherche[] }>({ requete: '', resultats: [] })
  const [tousExtraits, setTousExtraits] = useState(false)
  useEffect(() => {
    const r = requete.trim()
    setTousExtraits(false)
    if (!r) return setContenu({ requete: '', resultats: [] })
    let fini = false
    const minuteur = setTimeout(() => {
      void rechercherLocalement(el, r)
        .then((resultats) => !fini && setContenu({ requete: r, resultats: resultats.filter((x) => x.element) }))
        .catch(() => undefined)
    }, ATTENTE_CONTENU)
    return () => {
      fini = true
      clearTimeout(minuteur)
    }
  }, [requete, el])

  const quitterRecherche = () => {
    setCherche(false)
    setRequete('')
    champ.current?.blur()
  }

  const nombres = {
    toiles: entrees.filter((e) => e.genre === 'toile' && !e.accueil).length,
    cartes: entrees.filter((e) => e.genre === 'arbre').length,
    documents: entrees.filter((e) => e.genre === 'document').length,
  }
  const resumeAccueil = accueil && resumeDe(accueil)
  const accueilVide = resumeAccueil?.genre === 'toile' && resumeAccueil.boites.length === 0

  return (
    <div className="notak-espace biblio-locale" data-theme={theme} data-cherche={cherche || undefined}>
      <header className="biblio-locale-entete">
        <div className="biblio-locale-tete">
          <h1>{t('biblio.titre')}</h1>
          <button type="button" className="biblio-locale-plus" aria-label={t('biblio.nouveau')} aria-haspopup="dialog" onClick={() => setCreation(true)}>
            <Icone nom="ajouter" taille={22} />
          </button>
        </div>
        <div className="biblio-locale-barre">
          <label className="biblio-locale-recherche">
            <Icone nom="recherche" taille={17} />
            <input
              ref={champ}
              type="search"
              placeholder={t('biblio.chercherTout')}
              value={requete}
              onFocus={() => setCherche(true)}
              onChange={(e) => setRequete(e.target.value)}
              enterKeyHint="search"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {requete && (
              <button type="button" className="biblio-locale-effacer" aria-label={t('biblio.effacer')} onClick={() => (setRequete(''), champ.current?.focus())}>
                <Icone nom="fermer" taille={12} />
              </button>
            )}
          </label>
          <button type="button" className="biblio-locale-annuler" tabIndex={cherche ? 0 : -1} aria-hidden={!cherche} onClick={quitterRecherche}>
            {t('commun.annuler')}
          </button>
        </div>
      </header>

      {cherche ? (
        <Recherche
          requete={requete.trim()}
          entrees={entrees}
          contenu={contenu.requete && requete.trim() ? contenu : { requete: '', resultats: [] }}
          tousExtraits={tousExtraits}
          voirTout={() => setTousExtraits(true)}
          aller={aller}
          creer={(titre) => void creer('toile', titre)}
        />
      ) : (
        <>
          {accueil && (
            <button type="button" className="biblio-locale-vedette" onClick={() => aller(accueil)}>
              <span className="biblio-locale-vedette-plan">
                {accueilVide ? (
                  <span className="biblio-locale-vedette-vide">{t('biblio.accueilVide')}</span>
                ) : resumeAccueil ? (
                  <Vignette resume={resumeAccueil} />
                ) : (
                  <span className="biblio-vignette" aria-hidden />
                )}
              </span>
              <span className="biblio-locale-vedette-texte">
                <span className="biblio-locale-vedette-titre">
                  <Icone nom="maison" taille={17} />
                  {titreDe(accueil)}
                </span>
                <span className="biblio-locale-detail">
                  {[tn('biblio.compte.toiles', nombres.toiles), tn('biblio.compte.cartes', nombres.cartes), tn('biblio.compte.documents', nombres.documents)]
                    .filter((_, i) => [nombres.toiles, nombres.cartes, nombres.documents][i]! > 0)
                    .join(' · ') || quand(accueil.vu)}
                </span>
              </span>
            </button>
          )}

          {nombres.toiles + nombres.cartes + nombres.documents === 0 && (
            <div className="biblio-locale-premiers">
              <p>{t('biblio.premiers')}</p>
              <ChoixCreation creer={(g) => void creer(g)} />
            </div>
          )}

          {recents(entrees).length > 0 && (
            <section className="biblio-locale-rubrique" aria-labelledby="biblio-locale-recents">
              <h2 id="biblio-locale-recents">{t('biblio.rubrique.recents')}</h2>
              <ul className="biblio-locale-rangee">
                {recents(entrees).map((e) => (
                  <li key={e.cle}>
                    <Tuile entree={e} resume={resumeDe(e)} aller={aller} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {RUBRIQUES.map(({ genre, titre }) => {
            const liste = ordonner(entrees.filter((e) => e.genre === genre && !e.accueil))
            if (liste.length === 0) return null
            const toutes = ouvertes.has(genre)
            return (
              <section key={genre} className="biblio-locale-rubrique" aria-labelledby={`biblio-locale-${genre}`}>
                <div className="biblio-locale-rubrique-tete">
                  <h2 id={`biblio-locale-${genre}`}>
                    {t(titre)} <span className="biblio-locale-compte">{liste.length}</span>
                  </h2>
                  {liste.length > PAR_RUBRIQUE && (
                    <button
                      type="button"
                      className="biblio-locale-voir"
                      aria-expanded={toutes}
                      onClick={() => setOuvertes((avant) => new Set(toutes ? [...avant].filter((g) => g !== genre) : [...avant, genre]))}
                    >
                      {toutes ? t('biblio.voirMoins') : t('biblio.toutVoir')}
                    </button>
                  )}
                </div>
                <ul className="biblio-locale-grille">
                  {(toutes ? liste : liste.slice(0, PAR_RUBRIQUE)).map((e) => (
                    <li key={e.cle}>
                      <Tuile entree={e} resume={resumeDe(e)} aller={aller} />
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </>
      )}

      {creation && (
        <FeuilleBas titre={t('biblio.nouveau')} fermer={() => setCreation(false)} className="biblio-locale-feuille">
          <ChoixCreation creer={(g) => void creer(g)} />
        </FeuilleBas>
      )}
    </div>
  )
}

/** Les trois choses qu'on crée : une toile s'ouvre, une carte ou un document se pose sur l'accueil et s'ouvre en grand. */
function ChoixCreation({ creer }: { creer(genre: GenreNeuf): void }) {
  return (
    <div className="biblio-locale-neuf" role="group" aria-label={t('biblio.nouveau')}>
      {(['toile', 'arbre', 'document'] as const).map((g) => (
        <button key={g} type="button" data-genre={g} onClick={() => creer(g)}>
          <span className="biblio-locale-pastille" data-genre={g}>
            <Icone nom={ICONE[g]} taille={20} />
          </span>
          <span className="biblio-locale-neuf-texte">
            <span>{t(`biblio.genre.${g}`)}</span>
            <span className="biblio-locale-detail">{t(`biblio.neufAide.${g}`)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function Tuile({ entree: e, resume, aller }: { entree: EntreeLocale; resume: ResumeContenu | undefined; aller(e: EntreeLocale): void }) {
  return (
    <button type="button" className="biblio-locale-tuile" data-genre={e.genre} onClick={() => aller(e)}>
      {resume ? <Vignette resume={resume} /> : <span className="biblio-vignette" aria-hidden />}
      <span className="biblio-locale-titre">{titreDe(e)}</span>
      <span className="biblio-locale-detail">{detailDe(e)}</span>
    </button>
  )
}

/** Une ligne de résultat : l'icône du genre en pastille, le titre, et dessous où il est (ou le passage trouvé). */
function Ligne({ genre, titre, detail, requete, onClick }: { genre: GenreNeuf | 'note'; titre: string; detail: ReactNode; requete: string; onClick(): void }) {
  return (
    <li>
      <button type="button" className="biblio-locale-ligne" onClick={onClick}>
        <span className="biblio-locale-pastille" data-genre={genre}>
          <Icone nom={ICONE[genre]} taille={16} />
        </span>
        <span className="biblio-locale-ligne-texte">
          <span className="biblio-locale-titre">
            <Surligne texte={titre} requete={requete} />
          </span>
          <span className="biblio-locale-detail">{detail}</span>
        </span>
      </button>
    </li>
  )
}

/**
 * La recherche, à la façon des Notes d'iOS : sans requête, les récents en lignes ; en tapant, les titres répondent à
 * chaque lettre, puis ce que le contenu des toiles contient, trois passages d'abord.
 */
function Recherche({
  requete,
  entrees,
  contenu,
  tousExtraits,
  voirTout,
  aller,
  creer,
}: {
  requete: string
  entrees: readonly EntreeLocale[]
  contenu: { requete: string; resultats: ResultatRecherche[] }
  tousExtraits: boolean
  voirTout(): void
  aller(e: Pick<EntreeLocale, 'tableau' | 'element'>): void
  creer(titre: string): void
}) {
  if (!requete) {
    const liste = recents(entrees)
    return (
      <section className="biblio-locale-resultats" aria-label={t('biblio.rubrique.recents')}>
        {liste.length > 0 && <h2>{t('biblio.rubrique.recents')}</h2>}
        <ul>
          {liste.map((e) => (
            <Ligne key={e.cle} genre={e.genre} titre={titreDe(e)} detail={detailDe(e)} requete="" onClick={() => aller(e)} />
          ))}
        </ul>
      </section>
    )
  }
  const titres = ordonner(entrees, requete)
  const dejaVus = new Set(titres.map((e) => e.cle))
  const genreDe = new Map(entrees.map((e) => [e.cle, e.genre]))
  const extraits = contenu.resultats.filter((r) => !dejaVus.has(cleDe(r.tableau, r.element ?? null)))
  const montres = tousExtraits ? extraits : extraits.slice(0, EXTRAITS)
  return (
    <section className="biblio-locale-resultats" aria-live="polite">
      {titres.length > 0 && (
        <>
          <h2>{t('biblio.resultats.titres')}</h2>
          <ul>
            {titres.map((e) => (
              <Ligne key={e.cle} genre={e.genre} titre={titreDe(e)} detail={detailDe(e)} requete={requete} onClick={() => aller(e)} />
            ))}
          </ul>
        </>
      )}
      {extraits.length > 0 && (
        <>
          <h2>{t('biblio.resultats.contenu')}</h2>
          <ul>
            {montres.map((r) => {
              // Une carte mentale ou un document s'ouvre en grand ; une note, une liste… se montre sur sa toile.
              const genre = genreDe.get(cleDe(r.tableau, r.element ?? null))
              const ouvrirResultat = () => {
                if (genre || !r.element) return aller({ tableau: r.tableau, element: r.element ?? null })
                demanderAMontrer(r.element)
                aller({ tableau: r.tableau, element: null })
              }
              return (
                <Ligne
                  key={`${r.tableau}/${r.element}`}
                  genre={genre ?? (r.element ? 'note' : 'toile')}
                  titre={r.titre}
                  detail={<Surligne texte={r.extrait} requete={requete} />}
                  requete=""
                  onClick={ouvrirResultat}
                />
              )
            })}
          </ul>
          {montres.length < extraits.length && (
            <button type="button" className="biblio-locale-voir biblio-locale-voir-extraits" onClick={voirTout}>
              {tn('biblio.resultats.tous', extraits.length)}
            </button>
          )}
        </>
      )}
      {titres.length === 0 && extraits.length === 0 && (
        <div className="biblio-locale-vide">
          <Icone nom="recherche" taille={28} />
          <p>{t('biblio.aucunResultatPour', { requete })}</p>
          <button type="button" className="biblio-locale-voir" onClick={() => creer(requete)}>
            {t('biblio.creerToileNommee', { titre: requete })}
          </button>
        </div>
      )}
    </section>
  )
}
