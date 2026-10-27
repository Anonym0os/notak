import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BoutonIcone, Dialogue } from './communs'
import { enFeuille } from './communs/Feuille'
import { Icone } from './icones'
import { t, tn } from './langue'
import { touchesDe } from './communs'
import { touches } from './Menus'
import { PastillePersonne } from './pastille'
import { Recherche, Segments, Touches as TouchesRaccourci } from './communs'
import { type ContexteReglages, GROUPES, type Ligne, type Rubrique, chercher, lire, morceaux, nombreDeLignes, rubriquesVisibles } from './rubriquesReglages'
import { VERSION_NOTAK } from './version'
import './reglages.css'

/** La rubrique ouverte, retenue d'une ouverture à l'autre. */
const CLE_RUBRIQUE = 'notak:reglages-rubrique'
const RUBRIQUE_DEFAUT = 'apparence'

function lireRubrique(): string {
  try {
    return localStorage.getItem(CLE_RUBRIQUE) ?? RUBRIQUE_DEFAUT
  } catch {
    return RUBRIQUE_DEFAUT
  }
}
function ecrireRubrique(id: string) {
  try {
    localStorage.setItem(CLE_RUBRIQUE, id)
  } catch {
    // Sans stockage, la rubrique vaut pour la visite.
  }
}

/** Un texte où ce qu'on cherche est surligné. */
function Surligne({ texte, cherche }: { texte: string; cherche: string }) {
  return (
    <>
      {morceaux(texte, cherche).map((m, i) => (m.trouve ? <mark key={i}>{m.texte}</mark> : <Fragment key={i}>{m.texte}</Fragment>))}
    </>
  )
}

/** Les touches d'un raccourci, une pastille chacune ; plusieurs raccourcis se suivent, un peu plus écartés. */
function Touches({ combinaison }: { combinaison: string }) {
  return (
    <span className="notak-rg-touches">
      {combinaison.split('  ').map((groupe) => {
        const lu = touches(groupe)
        return (
          <span key={groupe}>
            {(lu === groupe ? touchesDe(groupe) : [lu]).map((k, i) => (
              <kbd key={i}>{k}</kbd>
            ))}
          </span>
        )
      })}
    </span>
  )
}

function LigneReglage({ ligne, c, cherche }: { ligne: Ligne; c: ContexteReglages; cherche: string }) {
  const libelle = lire(ligne.libelle)
  const { controle } = ligne
  return (
    <div className="notak-rg-ligne" data-haut={ligne.haut ? '' : undefined} data-touches={controle.type === 'touches' ? '' : undefined}>
      <span className="notak-rg-texte">
        <span className="notak-rg-libelle">
          <Surligne texte={libelle} cherche={cherche} />
        </span>
        {ligne.aide && (
          <span className="notak-rg-aide">
            <Surligne texte={lire(ligne.aide)} cherche={cherche} />
          </span>
        )}
      </span>
      {controle.type === 'choix' ? (
        <Segments libelle={libelle} options={controle.options(c)} valeur={controle.lire(c)} onChange={(v) => controle.ecrire(c, v)} />
      ) : controle.type === 'touches' ? (
        <Touches combinaison={controle.combinaison} />
      ) : (
        controle.rendre(c)
      )}
    </div>
  )
}

function Sections({ rubrique, c }: { rubrique: Rubrique; c: ContexteReglages }) {
  return rubrique.sections.map((s) => (
    <section key={lire(s.titre)} className="notak-rg-section" aria-label={lire(s.titre)}>
      <h3 className="notak-rg-section-titre">{lire(s.titre)}</h3>
      {s.lignes.map((l) => (
        <LigneReglage key={l.id} ligne={l} c={c} cherche="" />
      ))}
    </section>
  ))
}

/**
 * La page des réglages : les rubriques à gauche, groupées, sous le compte et la recherche ; la rubrique ouverte à
 * droite, en sections de lignes « libellé et aide, puis le contrôle ». Cmd+, l'ouvre ; Échap vide la recherche puis
 * ferme ; Cmd+F cherche. C'est un dialogue (communs/Dialogue) : le focus reste dans la fenêtre et revient, à la
 * fermeture, où il était.
 */
export function PageReglages({ fermer, ...c }: ContexteReglages & { fermer(): void }) {
  const visibles = rubriquesVisibles(c)
  const [rubriqueVoulue, setRubriqueVoulue] = useState(lireRubrique)
  const rubrique = visibles.find((r) => r.id === rubriqueVoulue) ?? visibles.find((r) => r.id === RUBRIQUE_DEFAUT) ?? visibles[0]
  const [cherche, setCherche] = useState('')
  const enRecherche = cherche.trim() !== ''
  const trouvees = enRecherche ? chercher(visibles, cherche) : []
  const total = trouvees.reduce((n, r) => n + nombreDeLignes(r), 0)

  const champ = useRef<HTMLInputElement>(null)
  const page = useRef<HTMLDivElement>(null)
  // Sur un téléphone, comme les Réglages d'iOS : la liste des rubriques en plein écran, puis la rubrique poussée par-dessus.
  const telephone = enFeuille()
  const [poussee, setPoussee] = useState(false)

  const ouvrir = (id: string) => {
    setRubriqueVoulue(id)
    ecrireRubrique(id)
    setCherche('')
    setPoussee(true)
  }
  // Une autre rubrique, ou d'autres résultats, se lisent depuis le haut.
  useLayoutEffect(() => {
    if (page.current) page.current.scrollTop = 0
  }, [rubrique?.id, enRecherche])

  // Cmd+F cherche, où que soit le focus dans la fenêtre.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        e.stopPropagation()
        champ.current?.focus()
        champ.current?.select()
      }
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [])
  // Échap vide d'abord la recherche, puis ferme.
  const echap = () => {
    if (telephone && poussee) setPoussee(false)
    else if (cherche) {
      setCherche('')
      champ.current?.focus()
    } else fermer()
  }

  const compteDe = (id: string) => trouvees.find((r) => r.id === id)
  return (
    <Dialogue
      nu
      className={telephone ? `notak-rg notak-rg-telephone${poussee || enRecherche ? ' notak-rg-poussee' : ''}` : 'notak-rg'}
      etiquette={t('reglages.titre')} fermer={fermer} echap={echap} retour={() => document.querySelector<HTMLElement>('.notak-reglages-bouton')}>
      <nav className="notak-rg-nav" aria-label={t('reglages.rubriques')}>
        {telephone && (
          <div className="notak-rg-tete">
            <h2>{t('reglages.titre')}</h2>
            <button type="button" className="notak-rg-ok" onClick={fermer}>
              {t('commun.fermer')}
            </button>
          </div>
        )}
        {c.compte && (
          <button type="button" className="notak-rg-moi" onClick={() => ouvrir('profil')}>
            <PastillePersonne taille={36} nom={c.compte.nom} couleur={c.compte.couleur} adresse={c.compte.photo ?? undefined} />
            <span>
              <strong>{c.compte.nom}</strong>
              {c.compte.email && <small>{c.compte.email}</small>}
            </span>
          </button>
        )}
        <Recherche ref={champ} autoFocus={!telephone} valeur={cherche} onChange={setCherche} placeholder={t('reglages.chercher')} aria-label={t('reglages.chercher')} fin={!cherche && !telephone && <TouchesRaccourci touches="⌘F" />} />
        <div className="notak-rg-liste">
          {GROUPES.map((g) => {
            const rubriques = visibles.filter((r) => r.groupe === g)
            if (rubriques.length === 0) return null
            return (
              <Fragment key={g}>
                <p className="notak-rg-groupe">{t(`reglages.groupe.${g}`)}</p>
                {rubriques.map((r) => {
                  const n = enRecherche ? nombreDeLignes(compteDe(r.id)!) : 0
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className="notak-rg-lien"
                      aria-current={!enRecherche && r.id === rubrique?.id ? 'page' : undefined}
                      data-hors={enRecherche && n === 0 ? '' : undefined}
                      onClick={() => ouvrir(r.id)}
                    >
                      {r.icone}
                      <span>{lire(r.titre)}</span>
                      {n > 0 && (
                        <span className="notak-rg-nombre" aria-label={tn('reglages.recherche.resultats', n)}>
                          {n}
                        </span>
                      )}
                    </button>
                  )
                })}
              </Fragment>
            )
          })}
        </div>
        <span className="notak-rg-version">{t('reglages.version', { version: VERSION_NOTAK })}</span>
      </nav>
      <div ref={page} className="notak-rg-page">
        {telephone && (
          <button
            type="button"
            className="notak-rg-retour"
            onClick={() => {
              setPoussee(false)
              setCherche('')
            }}
          >
            <Icone nom="gauche" taille={18} />
            {t('reglages.titre')}
          </button>
        )}
        <BoutonIcone className="notak-rg-fermer" aria-label={t('reglages.fermer')} onClick={fermer}>
          <Icone nom="fermer" taille={16} trait={2} />
        </BoutonIcone>
        {enRecherche ? (
          <>
            <h2>{total > 0 ? tn('reglages.recherche.titre', total, { q: cherche.trim() }) : t('reglages.recherche.aucun', { q: cherche.trim() })}</h2>
            <p className="notak-rg-phrase" aria-live="polite">
              {total > 0 ? t('reglages.recherche.phrase') : t('reglages.recherche.aucunePhrase')}
            </p>
            {trouvees
              .filter((r) => r.sections.length > 0)
              .map((r) => (
                <section key={r.id} className="notak-rg-section" aria-label={lire(r.titre)}>
                  <h3 className="notak-rg-section-titre">
                    <button type="button" onClick={() => ouvrir(r.id)}>
                      {lire(r.titre)}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                  </h3>
                  {r.sections.flatMap((s) => s.lignes).map((l) => (
                    <LigneReglage key={l.id} ligne={l} c={c} cherche={cherche} />
                  ))}
                </section>
              ))}
          </>
        ) : (
          rubrique && (
            <>
              <h2>{lire(rubrique.titre)}</h2>
              {rubrique.phrase && <p className="notak-rg-phrase">{lire(rubrique.phrase)}</p>}
              <Sections rubrique={rubrique} c={c} />
            </>
          )
        )}
      </div>
    </Dialogue>
  )
}
