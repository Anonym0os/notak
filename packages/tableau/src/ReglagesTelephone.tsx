import { type ReactNode, type Ref, type TouchEvent, useEffect, useRef, useState } from 'react'
import { Dialogue } from './communs'
import { t } from './langue'
import { PastillePersonne } from './pastille'
import { Coche } from './reglages'
import { type ContexteReglages, GROUPES, type Ligne, RUBRIQUES, type Rubrique, carteCompte, lire, rubriquesVisibles } from './rubriquesReglages'
import { VERSION_NOTAK } from './version'

/** Le défilement au-delà duquel le grand titre de la liste passe dans la barre, petit et centré. */
const TITRE_REPLIE = 34
/** Le retour au doigt part du bord gauche, comme dans iOS : à moins de 24 px. */
const BORD_RETOUR = 24
/** Lâché au-delà d'un tiers de la largeur, ou lancé vers la droite, le doigt ramène à la liste. */
const PART_RETOUR = 1 / 3
const ELAN_RETOUR = 0.5

const Chevron = () => (
  <svg className="notak-rgt-chevron" width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M1.5 1.5L6.5 7l-5 5.5" />
  </svg>
)

/** Un écran de la pile : la barre du haut (retour, titre, action), puis ce qui défile. */
function Ecran({ titre, grandTitre, gauche, droite, cache, defile, children, ...reste }: {
  titre: string
  grandTitre?: boolean
  gauche?: ReactNode
  droite?: ReactNode
  cache: boolean
  defile?: Ref<HTMLDivElement>
  children: ReactNode
  className: string
  onTouchStart?(e: TouchEvent): void
  onTouchMove?(e: TouchEvent): void
  onTouchEnd?(e: TouchEvent): void
  onTouchCancel?(e: TouchEvent): void
  ref?: Ref<HTMLElement>
}) {
  const [replie, setReplie] = useState(!grandTitre)
  return (
    <section {...reste} inert={cache} aria-hidden={cache || undefined} aria-label={titre}>
      <header className="notak-rgt-barre" data-replie={replie ? '' : undefined}>
        <span className="notak-rgt-barre-gauche">{gauche}</span>
        <span className="notak-rgt-barre-titre" aria-hidden={grandTitre || undefined}>
          {titre}
        </span>
        <span className="notak-rgt-barre-droite">{droite}</span>
      </header>
      <div ref={defile} className="notak-rgt-defile" onScroll={grandTitre ? (e) => setReplie(e.currentTarget.scrollTop > TITRE_REPLIE) : undefined}>
        {grandTitre && <h2 className="notak-rgt-titre">{titre}</h2>}
        {children}
      </div>
    </section>
  )
}

/** Un réglage : son libellé en tête de groupe, le contrôle dans la carte, l'aide dessous. Un choix se coche, ligne à ligne. */
function GroupeReglage({ ligne, c }: { ligne: Ligne; c: ContexteReglages }) {
  const libelle = lire(ligne.libelle)
  const { controle } = ligne
  let contenu: ReactNode = null
  if (controle.type === 'choix') {
    const valeur = controle.lire(c)
    contenu = (
      <div role="radiogroup" aria-label={libelle}>
        {controle.options(c).map((o) => {
          const choisi = o.valeur === valeur
          return (
            <button key={String(o.valeur)} type="button" role="radio" aria-checked={choisi} className="notak-rgt-rangee" lang={o.lang} onClick={() => controle.ecrire(c, o.valeur)}>
              <span className="notak-rgt-libelle">{o.libelle}</span>
              {o.detail && <span className="notak-rgt-valeur">{o.detail}</span>}
              <span className="notak-rgt-coche">{choisi && <Coche />}</span>
            </button>
          )
        })}
      </div>
    )
  } else if (controle.type === 'libre') {
    contenu = <div className="notak-rgt-libre">{controle.rendre(c)}</div>
  }
  if (contenu === null) return null
  return (
    <div className="notak-rgt-groupe">
      <h3 className="notak-rgt-entete">{libelle}</h3>
      <div className="notak-rgt-carte">{contenu}</div>
      {ligne.aide && <p className="notak-rgt-pied">{lire(ligne.aide)}</p>}
    </div>
  )
}

/**
 * Les réglages sur un téléphone, dessinés comme l'app Réglages d'iOS : la liste des rubriques en cartes arrondies, sous
 * un grand titre qui se replie dans la barre quand on descend ; une rubrique touchée glisse depuis la droite par-dessus,
 * « ‹ Réglages » ou le doigt tiré depuis le bord gauche la renvoient. N'y paraît que ce qui a un sens au doigt
 * (`rubriquesVisibles`, `bureauSeul`) : ni raccourcis clavier, ni barre de gauche, ni app de bureau. Pas de recherche :
 * trois rubriques se lisent d'un coup d'œil.
 */
export function ReglagesTelephone({ fermer, ...c }: ContexteReglages & { fermer(): void }) {
  const visibles = rubriquesVisibles(c, RUBRIQUES, true)
  // La rubrique montrée reste montée après le retour : elle repart vers la droite au lieu de disparaître.
  const [montree, setMontree] = useState<string | null>(null)
  const [poussee, setPoussee] = useState(false)
  const rubrique = visibles.find((r) => r.id === montree)
  const pile = useRef<HTMLDivElement>(null)
  const defile = useRef<HTMLDivElement>(null)
  const retourBouton = useRef<HTMLButtonElement>(null)

  const ouvrir = (r: Rubrique) => {
    setMontree(r.id)
    setPoussee(true)
  }
  const revenir = () => setPoussee(false)

  useEffect(() => {
    if (poussee) {
      if (defile.current) defile.current.scrollTop = 0
      retourBouton.current?.focus({ preventScroll: true })
    } else if (montree) {
      // Revenu à la liste, le focus retrouve la rubrique qu'on avait ouverte.
      pile.current?.querySelector<HTMLElement>(`[data-rubrique="${montree}"]`)?.focus({ preventScroll: true })
    }
    // `montree` ne change qu'avec `poussee` : on ne réagit qu'au mouvement de la pile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poussee])

  // Le retour au doigt : depuis le bord gauche, la rubrique suit le doigt, la liste glisse dessous un peu moins vite.
  const geste = useRef<{ x: number; y: number; t: number; dx: number; pris: boolean | null } | null>(null)
  const suivre = (dx: number | null) => {
    const p = pile.current
    if (!p) return
    if (dx === null) {
      p.style.removeProperty('--rgt-tire')
      p.removeAttribute('data-tire')
    } else {
      p.style.setProperty('--rgt-tire', `${dx}px`)
      p.setAttribute('data-tire', '')
    }
  }
  const debut = (e: TouchEvent) => {
    const doigt = e.touches[0]
    const bord = pile.current?.getBoundingClientRect().left ?? 0
    geste.current = doigt && e.touches.length === 1 && doigt.clientX - bord < BORD_RETOUR ? { x: doigt.clientX, y: doigt.clientY, t: e.timeStamp, dx: 0, pris: null } : null
  }
  const mouvement = (e: TouchEvent) => {
    const g = geste.current
    const doigt = e.touches[0]
    if (!g || !doigt) return
    const dx = doigt.clientX - g.x
    const dy = doigt.clientY - g.y
    if (g.pris === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      g.pris = dx > Math.abs(dy)
    }
    if (!g.pris) return
    g.dx = Math.max(0, dx)
    suivre(g.dx)
  }
  const fin = (e: TouchEvent) => {
    const g = geste.current
    geste.current = null
    if (!g?.pris) return
    const largeur = pile.current?.clientWidth ?? 1
    const elan = g.dx / Math.max(1, e.timeStamp - g.t)
    suivre(null)
    if (g.dx > largeur * PART_RETOUR || elan > ELAN_RETOUR) revenir()
  }

  // En tête, le compte et son serveur quand l'application les dit (`reglerRubriqueCompte`) ; sinon le profil du compte.
  const carte = carteCompte(c)
  const compte = carte ? visibles.find((r) => r.id === 'compte') : undefined
  const profil = !compte && c.compte ? visibles.find((r) => r.id === 'profil') : undefined
  return (
    <Dialogue
      nu
      className={`notak-rg notak-rg-telephone${poussee ? ' notak-rg-poussee' : ''}`}
      etiquette={t('reglages.titre')}
      fermer={fermer}
      echap={poussee ? revenir : fermer}
      retour={() => document.querySelector<HTMLElement>('.notak-reglages-bouton')}
    >
      <div ref={pile} className="notak-rgt-pile">
        <Ecran
          className="notak-rgt-ecran notak-rgt-racine"
          titre={t('reglages.titre')}
          grandTitre
          cache={poussee}
          droite={
            <button type="button" className="notak-rgt-lien notak-rg-ok" onClick={fermer}>
              {t('commun.fermer')}
            </button>
          }
        >
          {compte && (
            <div className="notak-rgt-carte">
              <button type="button" className="notak-rgt-rangee notak-rgt-moi" data-rubrique={compte.id} onClick={() => ouvrir(compte)}>
                {carte}
                <Chevron />
              </button>
            </div>
          )}
          {profil && c.compte && (
            <div className="notak-rgt-carte">
              <button type="button" className="notak-rgt-rangee notak-rgt-moi" data-rubrique={profil.id} onClick={() => ouvrir(profil)}>
                <PastillePersonne taille={36} nom={c.compte.nom} couleur={c.compte.couleur} adresse={c.compte.photo ?? undefined} />
                <span className="notak-rgt-libelle">
                  <strong>{c.compte.nom}</strong>
                  {c.compte.email && <small>{c.compte.email}</small>}
                </span>
                <Chevron />
              </button>
            </div>
          )}
          {GROUPES.map((g) => {
            // La photo et la couleur sont dans « Compte » quand il est là : « Profil » ne se répète pas.
            const rubriques = visibles.filter((r) => r.groupe === g && r !== profil && r.id !== 'compte' && !(compte && r.id === 'profil'))
            if (rubriques.length === 0) return null
            return (
              <nav key={g} className="notak-rgt-carte" aria-label={t(`reglages.groupe.${g}`)}>
                {rubriques.map((r) => (
                  <button key={r.id} type="button" className="notak-rgt-rangee" data-rubrique={r.id} data-icone="" onClick={() => ouvrir(r)}>
                    <span className="notak-rgt-pastille" style={{ background: r.teinte }}>
                      {r.icone}
                    </span>
                    <span className="notak-rgt-libelle">{lire(r.titre)}</span>
                    <Chevron />
                  </button>
                ))}
              </nav>
            )
          })}
          <p className="notak-rgt-version">{t('reglages.version', { version: VERSION_NOTAK })}</p>
        </Ecran>
        <Ecran
          className="notak-rgt-ecran notak-rgt-rubrique"
          titre={rubrique ? lire(rubrique.titre) : ''}
          cache={!poussee}
          defile={defile}
          onTouchStart={debut}
          onTouchMove={mouvement}
          onTouchEnd={fin}
          onTouchCancel={fin}
          gauche={
            <button ref={retourBouton} type="button" className="notak-rgt-lien notak-rg-retour" onClick={revenir}>
              <svg width="13" height="21" viewBox="0 0 13 21" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M10.5 2L2.5 10.5l8 8.5" />
              </svg>
              {t('reglages.titre')}
            </button>
          }
        >
          {rubrique?.sections.flatMap((s) => s.lignes).map((l) => (
            <GroupeReglage key={l.id} ligne={l} c={c} />
          ))}
        </Ecran>
      </div>
    </Dialogue>
  )
}
