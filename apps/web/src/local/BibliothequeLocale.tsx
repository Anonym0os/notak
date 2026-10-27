import { type Id, type ResumeContenu, creerSurLAccueil, Icone, lireTableau, resumesDuTableau } from '@notak/tableau'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Vignette } from '../bibliotheque/Vignettes'
import { t } from '../langue'
import type { EspaceLocal } from './espace'

/**
 * La bibliothèque de l'édition locale, celle de l'app iPhone : les toiles de cet appareil en grille, la plus récemment
 * ouverte d'abord, l'accueil en tête. Elle s'ouvre par la maison de l'en-tête (`/toiles`) et se quitte en ouvrant une
 * toile, ou par le retour. Les toiles d'un serveur ou d'un dossier iCloud y viendront en rubriques à côté de « Sur cet
 * appareil ».
 */

const CLE_VUS = 'notak:local:vus'

/** Quand chaque toile a été ouverte pour la dernière fois sur cet appareil (ms). */
export function lireVus(): Record<Id, number> {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_VUS) ?? '{}') as unknown
    return brut && typeof brut === 'object' ? (brut as Record<Id, number>) : {}
  } catch {
    return {}
  }
}

export function noterVu(id: Id, quand = Date.now()) {
  try {
    localStorage.setItem(CLE_VUS, JSON.stringify({ ...lireVus(), [id]: quand }))
  } catch {
    // Sans stockage, la bibliothèque range par date de création.
  }
}

export interface EntreeToile {
  id: Id
  titre: string
  /** La toile qui porte sa carte, pour dire « dans … ». */
  dans?: string
  vu?: number
  cree: number
  accueil: boolean
}

/** L'accueil d'abord, puis la plus récemment ouverte, puis la plus récemment créée ; `requete` filtre sur le titre. */
export function ordonner(entrees: readonly EntreeToile[], requete = ''): EntreeToile[] {
  const mots = requete.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const garde = (e: EntreeToile) => mots.every((m) => (e.titre || t('commun.sansTitre')).toLocaleLowerCase().includes(m))
  return entrees.filter(garde).sort((a, b) => Number(b.accueil) - Number(a.accueil) || (b.vu ?? 0) - (a.vu ?? 0) || b.cree - a.cree)
}

function quand(ms: number | undefined): string {
  if (!ms) return t('biblio.groupe.jamais')
  const jours = Math.floor((Date.now() - ms) / 86_400_000)
  if (jours < 1) return t('biblio.groupe.aujourdhui')
  if (jours < 7) return t('biblio.groupe.semaine')
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

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

export function BibliothequeLocale({ el, ouvrir }: { el: EspaceLocal; ouvrir(id: Id): void }) {
  const { index, reseau, espace } = el
  const theme = useTheme()
  const [version, setVersion] = useState(() => index.lister())
  useEffect(() => index.ecouter(() => setVersion(index.lister())), [index])
  const [requete, setRequete] = useState('')
  const [resumes, setResumes] = useState<Record<Id, ResumeContenu>>({})

  const entrees = useMemo(() => {
    const vus = lireVus()
    const racine = index.racine()
    const titres = new Map(version.map((e) => [e.id, e.titre]))
    return version.map<EntreeToile>((e) => ({
      id: e.id,
      titre: e.titre,
      cree: e.cree,
      accueil: e.id === racine,
      ...(vus[e.id] ? { vu: vus[e.id] } : {}),
      ...(e.parent && e.parent !== racine && titres.has(e.parent) ? { dans: titres.get(e.parent) || t('commun.sansTitre') } : {}),
    }))
  }, [version, index])
  const visibles = ordonner(entrees, requete)

  // Les vignettes se lisent une à une dans IndexedDB, sans retenir l'affichage.
  useEffect(() => {
    let fini = false
    void (async () => {
      for (const e of entrees) {
        if (fini) return
        const r = await reseau.avec(e.id, (doc) => resumesDuTableau(lireTableau(doc))[0]).catch(() => undefined)
        if (r && !fini) setResumes((avant) => ({ ...avant, [e.id]: r }))
      }
    })()
    return () => {
      fini = true
    }
  }, [entrees, reseau])

  const creer = (genre: 'toile' | 'arbre' | 'document') => {
    const { tableau } = creerSurLAccueil(espace, genre)
    // Une carte ou un document se pose sur l'accueil, où on le retrouve ; une toile neuve s'ouvre.
    ouvrir(genre === 'toile' ? tableau : index.racine())
  }

  return (
    <div className="notak-espace biblio-locale" data-theme={theme}>
      <header className="biblio-locale-entete">
        <h1>{t('biblio.titre')}</h1>
        <label className="biblio-locale-recherche">
          <Icone nom="recherche" taille={18} />
          <input type="search" placeholder={t('biblio.chercher')} value={requete} onChange={(e) => setRequete(e.target.value)} enterKeyHint="search" />
        </label>
        <div className="biblio-locale-neuf" role="group" aria-label={t('biblio.nouveau')}>
          <button type="button" onClick={() => creer('toile')}>
            <Icone nom="tableau" taille={20} />
            {t('biblio.genre.toile')}
          </button>
          <button type="button" onClick={() => creer('arbre')}>
            <Icone nom="carteMentale" taille={20} />
            {t('biblio.genre.arbre')}
          </button>
          <button type="button" onClick={() => creer('document')}>
            <Icone nom="document" taille={20} />
            {t('biblio.genre.document')}
          </button>
        </div>
      </header>
      <section className="biblio-locale-rubrique" aria-labelledby="biblio-locale-appareil">
        <h2 id="biblio-locale-appareil">{t('biblio.surAppareil')}</h2>
        {visibles.length === 0 ? (
          <p className="biblio-locale-vide">{t('biblio.aucunResultat', { requete })}</p>
        ) : (
          <ul className="biblio-locale-grille">
            {visibles.map((e) => {
              const r = resumes[e.id]
              return (
                <li key={e.id}>
                  <button type="button" className="biblio-locale-tuile" onClick={() => ouvrir(e.id)}>
                    {r ? <Vignette resume={r} /> : <span className="biblio-vignette" aria-hidden />}
                    <span className="biblio-locale-titre">{e.titre || (e.accueil ? t('biblio.accueil') : t('commun.sansTitre'))}</span>
                    <span className="biblio-locale-detail">{e.dans ? t('biblio.dans', { toile: e.dans }) : quand(e.vu)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
