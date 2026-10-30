import { BandeauAvis, FeuilleBas, type GenreNeuf, Icone } from '@notak/tableau'
import { type ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { EntreeBibliotheque } from '../api'
import { RUBRIQUES, type Rubrique, adresseDe, entreesDe, filtrer, rubriqueDeLAdresse } from '../Bibliotheque'
import { allerA } from '../chemin'
import { t } from '../langue'
import { BoutonPlus, ChoixCreation, EnteteDoigt, LigneDoigt, RubriqueDoigt, TuileDoigt, quand } from './AuDoigt'
import type { EspaceRangement } from './actions'
import { cleDe } from './selection'

/**
 * La bibliothèque d'un serveur au téléphone, sur le modèle de celle de l'appareil (`local/BibliothequeLocale.tsx`) : le
 * grand titre, le « + » et la pastille du compte en haut à droite, la recherche ; puis une rangée qui glisse au doigt,
 * la toile d'accueil (l'espace) et les filtres ; puis les récents en rangée, et tout le reste en grilles de deux, par
 * genre, quatre de chaque avant « Tout voir ». Les données sont celles de la page du bureau ; ni tri, ni sélection, ni
 * glisser : au doigt, on parcourt et on ouvre.
 */

/** Combien de récents dans la rangée, et de tuiles par genre avant « Tout voir ». */
const RECENTS = 8
const PAR_RUBRIQUE = 4
const GENRES = [
  { rubrique: 'toiles', genre: 'toile' },
  { rubrique: 'cartes', genre: 'arbre' },
  { rubrique: 'documents', genre: 'document' },
] as const

const titreDe = (e: EntreeBibliotheque) => e.titre || t('commun.sansTitre')

export function BibliothequeTelephone({
  charger,
  espace,
  creer,
  avatar,
}: {
  charger(): Promise<EntreeBibliotheque[]>
  espace?: EspaceRangement
  /** Crée sur l'accueil ; rend où aller. */
  creer(genre: GenreNeuf): Promise<{ tableau: string; element: string | null }>
  /** La pastille du compte, qui ouvre sa feuille. */
  avatar?: ReactNode
}) {
  const [toutes, setToutes] = useState<EntreeBibliotheque[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  // Sans filtre, la vue d'ensemble ; `?vue=` de l'adresse en choisit un, comme au bureau.
  const [filtre, setFiltre] = useState<Rubrique | null>(rubriqueDeLAdresse)
  const [requete, setRequete] = useState('')
  const [cherche, setCherche] = useState(false)
  const [feuille, setFeuille] = useState(false)
  const [creation, setCreation] = useState(false)
  const [ouvertes, setOuvertes] = useState<ReadonlySet<Rubrique>>(new Set())
  const page = useRef<HTMLDivElement>(null)
  const titreAccueil = useSyncExternalStore(espace?.ecouter ?? (() => () => {}), () => (espace ? espace.tableau(espace.racine)?.titre : '') ?? '')

  /** Sous la tuile : la toile qui la porte, sauf l'accueil, qui porte tout ; sinon quand on l'a ouverte. */
  const detailDe = (e: EntreeBibliotheque) => (e.ou && e.dans !== espace?.racine ? t('biblio.dans', { toile: e.ou }) : quand(e.vu))

  const lire = useCallback(() => {
    setErreur(null)
    charger().then(setToutes, (x: Error) => setErreur(x.message || t('commun.echec')))
  }, [charger])
  useEffect(lire, [lire])

  const choisir = (r: Rubrique | null) => {
    setFiltre(r)
    history.replaceState(null, '', r ? `/?vue=${r}` : '/')
    page.current?.scrollTo?.({ top: 0 })
  }
  const ouvrir = (e: EntreeBibliotheque) => allerA(adresseDe(e))
  const creerPuisOuvrir = async (genre: GenreNeuf) => {
    setFeuille(false)
    if (creation) return
    setCreation(true)
    try {
      allerA(adresseDe(await creer(genre)))
    } finally {
      setCreation(false)
    }
  }
  const basculer = (r: Rubrique) => setOuvertes((avant) => new Set(avant.has(r) ? [...avant].filter((x) => x !== r) : [...avant, r]))

  const tuiles = (liste: readonly EntreeBibliotheque[]) =>
    liste.map((e) => (
      <li key={cleDe(e)}>
        <TuileDoigt genre={e.genre} resume={e.resume} titre={titreDe(e)} detail={detailDe(e)} onClick={() => ouvrir(e)} />
      </li>
    ))

  const corps = () => {
    if (erreur)
      return (
        <div className="biblio-locale-vide" role="alert">
          <p>{erreur}</p>
          <button type="button" className="biblio-locale-voir" onClick={lire}>
            {t('bandeau.reessayer')}
          </button>
        </div>
      )
    if (!toutes)
      return (
        <ul className="biblio-locale-grille" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="biblio-attente">
              <span />
              <span />
            </li>
          ))}
        </ul>
      )
    if (filtre) {
      const liste = entreesDe(filtre, toutes)
      const genre = GENRES.find((g) => g.rubrique === filtre)?.genre
      return (
        <RubriqueDoigt id={`biblio-tel-${filtre}`} titre={t(`biblio.rubrique.${filtre}`)} nombre={liste.length}>
          {liste.length > 0 ? (
            <ul className="biblio-locale-grille">{tuiles(liste)}</ul>
          ) : (
            <div className="biblio-locale-vide">
              <p>{t(`biblio.vide.${filtre}`)}</p>
              {genre ? (
                <button type="button" className="biblio-locale-voir" disabled={creation} onClick={() => void creerPuisOuvrir(genre)}>
                  {t(`biblio.neuf.${genre}`)}
                </button>
              ) : (
                <small>{t(`biblio.vide.${filtre}.aide`)}</small>
              )}
            </div>
          )}
        </RubriqueDoigt>
      )
    }
    const recents = entreesDe('recents', toutes).slice(0, RECENTS)
    return (
      <>
        {toutes.length === 0 && (
          <div className="biblio-locale-premiers">
            <p>{t('biblio.premiers')}</p>
            <ChoixCreation creer={(g) => void creerPuisOuvrir(g)} occupe={creation} />
          </div>
        )}
        {recents.length > 0 && (
          <RubriqueDoigt id="biblio-tel-recents" titre={t('biblio.rubrique.recents')}>
            <ul className="biblio-locale-rangee">{tuiles(recents)}</ul>
          </RubriqueDoigt>
        )}
        {GENRES.map(({ rubrique }) => {
          const liste = entreesDe(rubrique, toutes)
          if (liste.length === 0) return null
          const ouverte = ouvertes.has(rubrique)
          return (
            <RubriqueDoigt
              key={rubrique}
              id={`biblio-tel-${rubrique}`}
              titre={t(`biblio.rubrique.${rubrique}`)}
              nombre={liste.length}
              {...(liste.length > PAR_RUBRIQUE ? { plus: { ouverte, basculer: () => basculer(rubrique) } } : {})}
            >
              <ul className="biblio-locale-grille">{tuiles(ouverte ? liste : liste.slice(0, PAR_RUBRIQUE))}</ul>
            </RubriqueDoigt>
          )
        })}
      </>
    )
  }

  /** La recherche : sans requête, les récents en lignes ; en tapant, les titres qui répondent, à chaque lettre. */
  const resultats = () => {
    const r = requete.trim()
    const liste = !toutes ? [] : r ? filtrer(toutes, r) : entreesDe('recents', toutes).slice(0, RECENTS)
    return (
      <section className="biblio-locale-resultats" aria-live={r ? 'polite' : undefined}>
        {liste.length > 0 && <h2>{t(r ? 'biblio.resultats.titres' : 'biblio.rubrique.recents')}</h2>}
        <ul>
          {liste.map((e) => (
            <LigneDoigt key={cleDe(e)} genre={e.genre} titre={titreDe(e)} detail={detailDe(e)} requete={r} onClick={() => ouvrir(e)} />
          ))}
        </ul>
        {r && toutes && liste.length === 0 && (
          <div className="biblio-locale-vide">
            <Icone nom="recherche" taille={28} />
            <p>{t('biblio.aucunResultatPour', { requete: r })}</p>
          </div>
        )}
      </section>
    )
  }

  const accueil = espace ? `/t/${encodeURIComponent(espace.racine)}` : null
  const filtres: (Rubrique | null)[] = [null, ...RUBRIQUES]

  return (
    <div className="biblio-locale biblio-telephone" ref={page} data-cherche={cherche || undefined}>
      <EnteteDoigt
        titre={t('biblio.titre')}
        actions={
          <>
            {espace && <BoutonPlus onClick={() => setFeuille(true)} />}
            {avatar && <span className="biblio-locale-avatar">{avatar}</span>}
          </>
        }
        requete={requete}
        changer={setRequete}
        cherche={cherche}
        chercher={setCherche}
      />

      {cherche ? (
        resultats()
      ) : (
        <>
          <nav className="biblio-locale-filtres" aria-label={t('biblio.telephone.filtres')}>
            {accueil && (
              <button type="button" className="biblio-locale-filtre" data-espace onClick={() => allerA(accueil)}>
                <Icone nom="maison" taille={15} />
                {titreAccueil || t('biblio.accueil')}
              </button>
            )}
            {accueil && <span className="biblio-locale-filtres-sep" aria-hidden />}
            {filtres.map((r) => {
              const nombre = r && r !== 'recents' && toutes ? entreesDe(r, toutes).length : 0
              return (
                <button key={r ?? 'tout'} type="button" className="biblio-locale-filtre" data-rubrique={r ?? 'tout'} aria-pressed={filtre === r} onClick={() => choisir(r)}>
                  {r ? t(`biblio.rubrique.${r}`) : t('biblio.telephone.tout')}
                  {nombre > 0 && <small>{nombre}</small>}
                </button>
              )
            })}
          </nav>
          {corps()}
        </>
      )}

      {feuille && (
        <FeuilleBas titre={t('biblio.nouveau')} fermer={() => setFeuille(false)} className="biblio-locale-feuille">
          <ChoixCreation creer={(g) => void creerPuisOuvrir(g)} occupe={creation} />
        </FeuilleBas>
      )}
      <BandeauAvis />
    </div>
  )
}
