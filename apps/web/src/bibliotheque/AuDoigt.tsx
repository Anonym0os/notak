import { type GenreNeuf, Icone, type NomIcone, type ResumeContenu, normaliser } from '@notak/tableau'
import { Fragment, type ReactNode, useRef, useSyncExternalStore } from 'react'
import { t } from '../langue'
import { Vignette } from './Vignettes'

/**
 * Les pièces de la bibliothèque au doigt, celle d'un téléphone : le grand titre qui se replie quand on cherche, la
 * tuile et sa vignette, la ligne d'un résultat, la rubrique et son « Tout voir », le choix de ce qu'on crée. La
 * bibliothèque de l'appareil (`local/BibliothequeLocale.tsx`) et celle d'un serveur au téléphone
 * (`bibliotheque/Telephone.tsx`) les partagent ; chacune garde ses données. Leur style est celui des classes
 * `biblio-locale-*` (app.css).
 */

/** Le téléphone : un écran qu'on touche du doigt, assez étroit pour que menus et panneaux montent en feuille (`enFeuille`). */
const TELEPHONE = '(pointer: coarse) and (max-width: 640px)'

/** Sommes-nous sur un téléphone ? Suit l'écran qui tourne ou la fenêtre qu'on élargit. Sans `matchMedia`, non. */
export function useAuTelephone(): boolean {
  return useSyncExternalStore(
    (f) => {
      if (typeof matchMedia !== 'function') return () => {}
      const m = matchMedia(TELEPHONE)
      m.addEventListener('change', f)
      return () => m.removeEventListener('change', f)
    },
    () => typeof matchMedia === 'function' && matchMedia(TELEPHONE).matches,
    () => false,
  )
}

/** L'icône de chaque genre ; `note` : un passage trouvé dans un élément qui ne s'ouvre pas en grand (note, liste…). */
export const ICONE_GENRE: Record<GenreNeuf | 'note', NomIcone> = { toile: 'tableau', arbre: 'carteMentale', document: 'document', note: 'note' }

/** Quand on l'a ouvert : aujourd'hui, cette semaine, ou sa date. */
export function quand(ms: number | null | undefined): string {
  if (!ms) return t('biblio.groupe.jamais')
  const jours = Math.floor((Date.now() - ms) / 86_400_000)
  if (jours < 1) return t('biblio.groupe.aujourdhui')
  if (jours < 7) return t('biblio.groupe.semaine')
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
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

/**
 * L'en-tête : le grand titre et ses boutons à droite, puis la recherche. Toucher le champ replie le titre et fait
 * entrer « Annuler », comme dans les Notes d'iOS ; la page le sait par `data-cherche`, que l'appelante pose.
 */
export function EnteteDoigt({
  titre,
  actions,
  requete,
  changer,
  cherche,
  chercher,
}: {
  titre: string
  /** À droite du titre : le « + », et sur un serveur la pastille du compte. */
  actions: ReactNode
  requete: string
  changer(requete: string): void
  cherche: boolean
  chercher(oui: boolean): void
}) {
  const champ = useRef<HTMLInputElement>(null)
  const quitter = () => {
    chercher(false)
    changer('')
    champ.current?.blur()
  }
  return (
    <header className="biblio-locale-entete">
      <div className="biblio-locale-tete">
        <h1>{titre}</h1>
        <div className="biblio-locale-actions">{actions}</div>
      </div>
      <div className="biblio-locale-barre">
        <label className="biblio-locale-recherche">
          <Icone nom="recherche" taille={17} />
          <input
            ref={champ}
            type="search"
            placeholder={t('biblio.chercherTout')}
            value={requete}
            onFocus={() => chercher(true)}
            onChange={(e) => changer(e.target.value)}
            enterKeyHint="search"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {requete && (
            <button type="button" className="biblio-locale-effacer" aria-label={t('biblio.effacer')} onClick={() => (changer(''), champ.current?.focus())}>
              <Icone nom="fermer" taille={12} />
            </button>
          )}
        </label>
        <button type="button" className="biblio-locale-annuler" tabIndex={cherche ? 0 : -1} aria-hidden={!cherche} onClick={quitter}>
          {t('commun.annuler')}
        </button>
      </div>
    </header>
  )
}

/** Le « + » rond du haut : il ouvre la feuille de ce qu'on crée. */
export function BoutonPlus({ onClick }: { onClick(): void }) {
  return (
    <button type="button" className="biblio-locale-plus" aria-label={t('biblio.nouveau')} aria-haspopup="dialog" onClick={onClick}>
      <Icone nom="ajouter" taille={22} />
    </button>
  )
}

/** Une rubrique : son titre, combien elle en a, et « Tout voir » quand elle en cache. */
export function RubriqueDoigt({
  id,
  titre,
  nombre,
  plus,
  children,
}: {
  id: string
  titre: string
  nombre?: number
  /** Ouverte, elle montre tout ; sans `plus`, rien n'est caché. */
  plus?: { ouverte: boolean; basculer(): void }
  children: ReactNode
}) {
  return (
    <section className="biblio-locale-rubrique" aria-labelledby={id}>
      <div className="biblio-locale-rubrique-tete">
        <h2 id={id}>
          {titre} {nombre !== undefined && <span className="biblio-locale-compte">{nombre}</span>}
        </h2>
        {plus && (
          <button type="button" className="biblio-locale-voir" aria-expanded={plus.ouverte} onClick={plus.basculer}>
            {plus.ouverte ? t('biblio.voirMoins') : t('biblio.toutVoir')}
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

/** Une tuile : la vignette, le titre, et dessous où elle est ou quand on l'a ouverte. */
export function TuileDoigt({ genre, resume, titre, detail, onClick }: { genre: GenreNeuf; resume: ResumeContenu | undefined; titre: string; detail: string; onClick(): void }) {
  return (
    <button type="button" className="biblio-locale-tuile" data-genre={genre} onClick={onClick}>
      {resume ? <Vignette resume={resume} /> : <span className="biblio-vignette" aria-hidden />}
      <span className="biblio-locale-titre">{titre}</span>
      <span className="biblio-locale-detail">{detail}</span>
    </button>
  )
}

/** Une ligne de résultat : l'icône du genre en pastille, le titre, et dessous où il est (ou le passage trouvé). */
export function LigneDoigt({ genre, titre, detail, requete, onClick }: { genre: GenreNeuf | 'note'; titre: string; detail: ReactNode; requete: string; onClick(): void }) {
  return (
    <li>
      <button type="button" className="biblio-locale-ligne" onClick={onClick}>
        <span className="biblio-locale-pastille" data-genre={genre}>
          <Icone nom={ICONE_GENRE[genre]} taille={16} />
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

/** Les trois choses qu'on crée : une toile s'ouvre, une carte ou un document se pose sur l'accueil et s'ouvre en grand. */
export function ChoixCreation({ creer, occupe = false }: { creer(genre: GenreNeuf): void; occupe?: boolean }) {
  return (
    <div className="biblio-locale-neuf" role="group" aria-label={t('biblio.nouveau')}>
      {(['toile', 'arbre', 'document'] as const).map((g) => (
        <button key={g} type="button" data-genre={g} disabled={occupe} onClick={() => creer(g)}>
          <span className="biblio-locale-pastille" data-genre={g}>
            <Icone nom={ICONE_GENRE[g]} taille={20} />
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
