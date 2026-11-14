import { type GenreNeuf, Icone, type NomIcone, type ResultatRecherche, normaliser } from '@notak/tableau'
import { Fragment, type ReactNode, useCallback, useRef, useState, useSyncExternalStore } from 'react'
import type { EntreeBibliotheque } from '../api'
import { t, tn } from '../langue'

/**
 * Les pièces de la bibliothèque au doigt, celle d'un téléphone : le grand titre qui se replie quand on cherche, la
 * ligne d'un résultat, les passages trouvés dans le contenu, le choix de ce qu'on crée, la roue des réglages et la
 * carte de bienvenue du premier passage. La bibliothèque (`Bibliotheque.tsx`) les pose autour de ses
 * sections et de ses tuiles quand elle est au téléphone. Leur style est celui des classes `biblio-locale-*` (app.css).
 */

/** Le téléphone : un écran qu'on touche du doigt, assez étroit pour que menus et panneaux montent en feuille (`enFeuille`). */
const TELEPHONE = '(pointer: coarse) and (max-width: 640px)'

/** Sommes-nous sur un téléphone, à l'instant ? Sans `matchMedia`, non. */
export const auTelephone = (): boolean => typeof matchMedia === 'function' && matchMedia(TELEPHONE).matches

/** Sommes-nous sur un téléphone ? Suit l'écran qui tourne ou la fenêtre qu'on élargit. Sans `matchMedia`, non. */
export function useAuTelephone(): boolean {
  return useSyncExternalStore(
    (f) => {
      if (typeof matchMedia !== 'function') return () => {}
      const m = matchMedia(TELEPHONE)
      m.addEventListener('change', f)
      return () => m.removeEventListener('change', f)
    },
    auTelephone,
    () => false,
  )
}

/** Ce qu'une ligne ou une pastille montre : un genre de la bibliothèque, un dossier, ou `note`. */
export type GenreLigne = EntreeBibliotheque['genre'] | 'dossier' | 'note'

/** L'icône de chaque genre ; `note` : un passage trouvé dans un élément qui ne s'ouvre pas en grand (note, liste…). */
export const ICONE_GENRE: Record<GenreLigne, NomIcone> = {
  toile: 'tableau',
  arbre: 'carteMentale',
  document: 'document',
  image: 'photo',
  lien: 'lien',
  fichier: 'fichier',
  dossier: 'dossier',
  note: 'note',
}

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

/** La roue ronde du haut, à gauche du compte et du « + » : les réglages, les mêmes que ceux de la toile. */
export function BoutonReglages({ onClick }: { onClick(): void }) {
  return (
    <button type="button" className="biblio-locale-reglages" aria-label={t('reglages.titre')} aria-haspopup="dialog" onClick={onClick}>
      <Icone nom="reglages" taille={21} />
    </button>
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

/** Une ligne de résultat : l'icône du genre en pastille, le titre, et dessous où il est (ou le passage trouvé). */
export function LigneDoigt({ genre, titre, detail, requete, onClick }: { genre: GenreLigne; titre: string; detail: ReactNode; requete: string; onClick(): void }) {
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

/**
 * Les trois choses qu'on crée : une toile s'ouvre, une carte ou un document se pose à la racine (ou dans le dossier
 * qu'on parcourt) et s'ouvre en grand ; avec `dossier`, un dossier vide, rangé là, son nom prêt à changer.
 */
export function ChoixCreation({ creer, dossier, occupe = false }: { creer(genre: GenreNeuf): void; dossier?: () => void; occupe?: boolean }) {
  return (
    <div className="biblio-locale-neuf" role="group" aria-label={t('biblio.nouveau')}>
      {(['toile', 'document', 'arbre'] as const).map((g) => (
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
      {dossier && (
        <button type="button" data-genre="dossier" disabled={occupe} onClick={dossier}>
          <span className="biblio-locale-pastille" data-genre="dossier">
            <Icone nom="dossier" taille={20} />
          </span>
          <span className="biblio-locale-neuf-texte">
            <span>{t('biblio.dossier.titre')}</span>
            <span className="biblio-locale-detail">{t('biblio.dossier.aide')}</span>
          </span>
        </button>
      )}
    </div>
  )
}

/** Combien de passages trouvés dans le contenu avant « Afficher les … résultats ». */
export const PASSAGES = 3

/**
 * Les passages trouvés dans le contenu (le texte d'une note, d'une page, d'une carte mentale) : où ils sont écrits, et
 * le passage, les mots cherchés en gras ; trois d'abord. `genreDe` dit ce qu'est l'élément, s'il a sa tuile.
 */
export function Passages({
  passages,
  requete,
  tous,
  voirTout,
  genreDe,
  ouvrir,
}: {
  passages: readonly ResultatRecherche[]
  requete: string
  tous: boolean
  voirTout(): void
  genreDe(r: ResultatRecherche): GenreLigne | undefined
  ouvrir(r: ResultatRecherche): void
}) {
  if (passages.length === 0) return null
  const montres = tous ? passages : passages.slice(0, PASSAGES)
  return (
    <section className="biblio-locale-resultats biblio-passages" aria-labelledby="biblio-passages-titre">
      <h2 id="biblio-passages-titre">{t('biblio.resultats.contenu')}</h2>
      <ul>
        {montres.map((r) => (
          <LigneDoigt
            key={`${r.tableau}/${r.element ?? ''}`}
            genre={genreDe(r) ?? 'note'}
            titre={r.titre}
            detail={<Surligne texte={r.extrait} requete={requete} />}
            requete=""
            onClick={() => ouvrir(r)}
          />
        ))}
      </ul>
      {montres.length < passages.length && (
        <button type="button" className="biblio-locale-voir biblio-locale-voir-extraits" onClick={voirTout}>
          {tn('biblio.resultats.tous', passages.length)}
        </button>
      )}
    </section>
  )
}

/**
 * La carte de bienvenue est-elle encore à montrer ? Fermée, elle ne revient plus : retenue dans le navigateur, comme
 * les autres préférences d'ici. Sans stockage, on ne la montre pas (elle reviendrait à chaque visite).
 */
export function useBienvenue(cle: string): [visible: boolean, fermer: () => void] {
  const [vue, setVue] = useState(() => {
    try {
      return localStorage.getItem(cle) === '1'
    } catch {
      return true
    }
  })
  const fermer = useCallback(() => {
    try {
      localStorage.setItem(cle, '1')
    } catch {
      // Sans stockage, elle se ferme pour la visite.
    }
    setVue(true)
  }, [cle])
  return [!vue, fermer]
}

/**
 * La carte du premier passage, en tête de la bibliothèque, à la façon des astuces d'iOS : un titre, trois lignes et
 * leurs icônes, de quoi la fermer, et un bouton qui la referme d'un « C'est parti ». Pas de visite en plusieurs écrans.
 */
export function CarteBienvenue({
  titre,
  lignes,
  partir,
  fermer,
}: {
  titre: string
  lignes: readonly { icone: NomIcone; texte: string }[]
  /** « C'est parti » : la carte se ferme, et ce premier pas se fait, s'il y en a un. */
  partir?(): void
  fermer(): void
}) {
  return (
    <section className="biblio-bienvenue" aria-labelledby="biblio-bienvenue-titre">
      <div className="biblio-bienvenue-tete">
        <h2 id="biblio-bienvenue-titre">{titre}</h2>
        <button type="button" className="biblio-bienvenue-fermer" aria-label={t('commun.fermer')} onClick={fermer}>
          <Icone nom="fermer" taille={12} />
        </button>
      </div>
      <ul>
        {lignes.map((l) => (
          <li key={l.icone}>
            <span className="biblio-bienvenue-icone" aria-hidden>
              <Icone nom={l.icone} taille={18} />
            </span>
            <span>{l.texte}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="biblio-bienvenue-partir" onClick={() => (fermer(), partir?.())}>
        {t('biblio.bienvenue.partir')}
      </button>
    </section>
  )
}
