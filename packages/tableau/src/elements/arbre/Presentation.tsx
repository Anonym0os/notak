import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Arbre, Id } from '../../coeur/tableau'
import { Icone, type NomIcone } from '../../icones'
import { t } from '../../langue'
import { ChoixTheme, PopoverFixe } from './ChoixTheme'
import { Diapositive } from './Diapo'
import { diapositives, pasApresBranche, pasDe, pasDeDepart, pasParent } from './modele/diapositives'
import type { Geste } from './modele/gestes'
import type { Lecture } from './modele/sujets'
import { themeDe } from './themes'
import { RATIOS_PITCH, ratioEffectif, themePitchDe } from './themesPitch'

/**
 * Le mode présentation lancé par Pitch (docs/XMIND.md § 12) : la carte devient une suite de diapositives, plein écran.
 * Une barre flottante en haut à droite (quitter, réglages, navigation) s'estompe après trois secondes ; Espace et les
 * flèches avancent, Échap sort. Les préférences d'animation vivent dans ce navigateur, pas dans la carte.
 */

const CLE_PREFERENCES = 'notak:pitch'

function animationEnregistree(): boolean {
  try {
    return (JSON.parse(localStorage.getItem(CLE_PREFERENCES) ?? '{}') as { animation?: unknown }).animation !== false
  } catch {
    return true
  }
}

function enregistrerAnimation(animation: boolean) {
  try {
    localStorage.setItem(CLE_PREFERENCES, JSON.stringify({ animation }))
  } catch {
    /* Pas de stockage : la préférence ne dure que le temps de la présentation. */
  }
}

interface Props {
  arbre: Arbre
  lecture: Lecture
  /** Le sujet d'où l'on part ; absent : le central. */
  depart?: Id | undefined
  faire(g: Geste): void
  adresse?: ((fichier: Id) => string | undefined) | undefined
  lectureSeule: boolean
  quitter(): void
}

/** Les touches du modal des raccourcis : chaque ligne, ses touches. */
const RACCOURCIS: { libelle: string; touches: string[][] | null }[] = [
  { libelle: 'arbre.pitch.raccSuivant', touches: [['Espace'], ['→'], ['↓']] },
  { libelle: 'arbre.pitch.raccPrecedent', touches: [['←'], ['↑']] },
  { libelle: 'arbre.pitch.raccPasser', touches: [['⇧', '→']] },
  { libelle: 'arbre.pitch.raccParent', touches: [['⇧', '←']] },
  { libelle: '', touches: null },
  { libelle: 'arbre.pitch.raccQuitter', touches: [['Échap'], ['Q']] },
  { libelle: 'arbre.pitch.raccAnimation', touches: [['A']] },
  { libelle: 'arbre.pitch.raccAide', touches: [['?']] },
]

function Interrupteur({ actif, change, libelle, info }: { actif: boolean; change(v: boolean): void; libelle: string; info: string }) {
  return (
    <div className="notak-arbre-pitch-ligne">
      <span>{libelle}</span>
      <button type="button" role="switch" className="notak-arbre-pitch-interrupteur" aria-checked={actif} title={info} aria-label={libelle} onClick={() => change(!actif)}>
        <span />
      </button>
    </div>
  )
}

function BoutonOutil({ icone, info, inactif, onClick, refBouton, actif }: { icone: NomIcone; info: string; inactif?: boolean; onClick(): void; refBouton?: React.Ref<HTMLButtonElement>; actif?: boolean }) {
  return (
    <button
      ref={refBouton}
      type="button"
      className="notak-arbre-pitch-outil"
      aria-label={info}
      title={info}
      disabled={inactif}
      aria-expanded={actif}
      onClick={(e) => {
        // Le bouton rend la main à la présentation : Espace avance, il ne rappuie pas sur lui.
        e.currentTarget.blur()
        onClick()
      }}
    >
      <Icone nom={icone} taille={16} trait={1.6} />
    </button>
  )
}

export function Presentation({ arbre, lecture: l, depart, faire, adresse, lectureSeule, quitter }: Props) {
  const diapos = useMemo(() => diapositives(l), [l])
  const pas = useMemo(() => pasDe(diapos), [diapos])
  const [index, setIndex] = useState(() => pasDeDepart(l, diapos, pas, depart))
  const [anime, setAnime] = useState(animationEnregistree)
  const [reglages, setReglages] = useState(false)
  const [themes, setThemes] = useState(false)
  const [aide, setAide] = useState(false)
  const [discret, setDiscret] = useState(false)
  const [survol, setSurvol] = useState(false)
  const [puce, setPuce] = useState<'attente' | 'visible' | 'fermee'>(depart !== undefined && depart !== l.central && pasDeDepart(l, diapos, pas, depart) > 0 ? 'attente' : 'fermee')
  const scene = useRef<HTMLDivElement>(null)
  const boutonReglages = useRef<HTMLButtonElement>(null)
  const boutonTheme = useRef<HTMLButtonElement>(null)
  const [dim, setDim] = useState<{ l: number; h: number }>({ l: 1280, h: 720 })

  // La scène mesure son cadre : la diapositive y prend la plus grande place de son rapport.
  useLayoutEffect(() => {
    const el = scene.current
    if (!el) return
    const lire = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setDim({ l: r.width, h: r.height })
    }
    lire()
    if (typeof ResizeObserver === 'undefined') return
    const o = new ResizeObserver(lire)
    o.observe(el)
    return () => o.disconnect()
  }, [])
  const ratio = ratioEffectif(arbre.pitch, dim.l, dim.h)
  const theme = themePitchDe(arbre.pitch?.theme)
  const [rl, rh] = ratio.split(':').map(Number) as [number, number]
  const k = Math.min(dim.l / rl, dim.h / rh)
  const taille = { l: Math.floor(rl * k), h: Math.floor(rh * k) }

  // Plein écran : celui qu'on obtient ; en sortir (Échap du navigateur) termine la présentation.
  useEffect(() => {
    const fond = scene.current?.closest<HTMLElement>('.notak-arbre-fond')
    let demande = false
    if (fond?.requestFullscreen) {
      demande = true
      void fond.requestFullscreen().catch(() => {
        demande = false
      })
    }
    const change = () => {
      if (demande && !document.fullscreenElement) quitter()
    }
    document.addEventListener('fullscreenchange', change)
    return () => {
      document.removeEventListener('fullscreenchange', change)
      demande = false
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    }
    // Seulement au lancement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // La barre s'estompe après trois secondes, reparaît au survol.
  useEffect(() => {
    const m = setTimeout(() => setDiscret(true), 3000)
    return () => clearTimeout(m)
  }, [])

  // La pastille « lire depuis le début » : 1,5 s après le lancement, pour 4 s.
  useEffect(() => {
    if (puce !== 'attente') return
    const ouvre = setTimeout(() => setPuce('visible'), 1500)
    return () => clearTimeout(ouvre)
  }, [puce])
  useEffect(() => {
    if (puce !== 'visible') return
    const ferme = setTimeout(() => setPuce('fermee'), 4000)
    return () => clearTimeout(ferme)
  }, [puce])

  const total = pas.length
  const suivant = useCallback(() => {
    if (index >= total - 1) quitter()
    else setIndex(index + 1)
  }, [index, total, quitter])
  const precedent = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])
  const passer = useCallback(() => {
    const x = pasApresBranche(l, diapos, pas, index)
    if (x === null) quitter()
    else setIndex(x)
  }, [l, diapos, pas, index, quitter])
  const parent = useCallback(() => setIndex(pasParent(l, diapos, pas, index)), [l, diapos, pas, index])
  const basculerAnimation = useCallback(() => {
    setAnime((a) => {
      enregistrerAnimation(!a)
      return !a
    })
  }, [])

  // Les touches sont à la présentation tant qu'elle dure : la carte dessous n'en voit aucune.
  const touche = useRef<(e: KeyboardEvent) => void>(() => {})
  touche.current = (e) => {
    const dansPopover = (e.target as Element | null)?.closest?.('.notak-arbre-pitch-popover')
    if (e.key === 'Escape') {
      if (aide) setAide(false)
      else if (reglages || themes) return
      else quitter()
    } else if (dansPopover && e.key !== '?') {
      return
    } else if ((e.key === ' ' || e.key === 'Enter') && (e.target as Element | null)?.closest?.('button')) {
      // Un bouton qui a le focus (au clavier) garde Espace et Entrée.
      return
    } else if (e.metaKey || e.ctrlKey || e.altKey) {
      return
    } else if (e.key === 'ArrowRight' && e.shiftKey) passer()
    else if (e.key === 'ArrowLeft' && e.shiftKey) parent()
    else if ([' ', 'Enter', 'ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key)) suivant()
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) precedent()
    else if (e.key.toLowerCase() === 'q') quitter()
    else if (e.key.toLowerCase() === 'a') basculerAnimation()
    else if (e.key === '?' || e.code === 'Slash') setAide((x) => !x)
    else return
    e.preventDefault()
    e.stopPropagation()
  }
  useEffect(() => {
    const f = (e: KeyboardEvent) => touche.current(e)
    document.addEventListener('keydown', f, true)
    return () => document.removeEventListener('keydown', f, true)
  }, [])

  const courant = pas[index]
  const diapo = courant ? diapos[courant.diapo] : undefined
  const mettreAJour = (reglage: Extract<Geste, { type: 'pitch' }>['reglage']) => !lectureSeule && faire({ type: 'pitch', reglage })

  return (
    <div ref={scene} className="notak-arbre-pitch-scene" style={{ background: themeDe(arbre.theme).fond ?? 'var(--notak-arbre-fond)' }} onClick={suivant} aria-label={t('arbre.pitch.titre')} role="region" aria-live="polite">
      {diapo && courant && (
        <div key={courant.diapo} className="notak-arbre-pitch-diapo" data-anime={anime ? '' : undefined}>
          <Diapositive lecture={l} diapo={diapo} etape={courant.etape} theme={theme} ratio={ratio} adresse={adresse} anime={anime} taille={taille} />
        </div>
      )}
      <span className="notak-arbre-pitch-compte">{t('arbre.pitch.position', { i: index + 1, n: total })}</span>

      <div
        className="notak-arbre-pitch-outils"
        data-discret={discret && !survol && !reglages && !themes ? '' : undefined}
        onClick={(e) => e.stopPropagation()}
        onPointerEnter={() => setSurvol(true)}
        onPointerLeave={() => setSurvol(false)}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className="notak-arbre-pitch-groupe">
          <BoutonOutil icone="deconnexion" info={t('arbre.pitch.quitter')} onClick={quitter} />
        </div>
        <div className="notak-arbre-pitch-groupe">
          <BoutonOutil icone="reglages" info={t('arbre.pitch.reglages')} refBouton={boutonReglages} actif={reglages} onClick={() => setReglages((o) => !o)} />
        </div>
        <div className="notak-arbre-pitch-groupe">
          <BoutonOutil icone="triangleGauchePlein" info={t('arbre.pitch.parent')} inactif={index === 0} onClick={parent} />
          <BoutonOutil icone="triangleGauche" info={t('arbre.pitch.precedent')} inactif={index === 0} onClick={precedent} />
          <BoutonOutil icone="triangleDroite" info={t('arbre.pitch.suivant')} onClick={suivant} />
          <BoutonOutil icone="triangleDroitePlein" info={t('arbre.pitch.passer')} onClick={passer} />
        </div>
      </div>

      {reglages && (
        <PopoverFixe ancre={boutonReglages.current} fermer={() => (setReglages(false), setThemes(false))} largeur={290} className="notak-arbre-pitch-reglages">
          <h2>{t('arbre.pitch.reglages')}</h2>
          <button ref={boutonTheme} type="button" className="notak-arbre-pitch-bouton" title={t('arbre.pitch.themeInfo')} disabled={lectureSeule} onClick={() => setThemes((o) => !o)}>
            {t('arbre.pitch.changerTheme')}
          </button>
          <div className="notak-arbre-pitch-ligne">
            <span>{t('arbre.pitch.ratio')}</span>
            <select
              className="notak-arbre-pitch-menu"
              value={arbre.pitch?.ratio ?? 'auto'}
              title={t('arbre.pitch.ratioInfo')}
              aria-label={t('arbre.pitch.ratio')}
              disabled={lectureSeule}
              onChange={(e) => mettreAJour({ ratio: e.target.value === 'auto' ? null : (e.target.value as (typeof RATIOS_PITCH)[number]) })}
            >
              <option value="auto">{t('arbre.pitch.auto')}</option>
              {RATIOS_PITCH.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <Interrupteur actif={anime} change={basculerAnimation} libelle={t('arbre.pitch.animation')} info={t('arbre.pitch.animationInfo')} />
          {themes && <ChoixTheme ancre={boutonTheme.current} theme={theme.id} ratio={ratio} choisir={(id) => mettreAJour({ theme: id })} fermer={() => setThemes(false)} />}
        </PopoverFixe>
      )}

      {puce === 'visible' && (
        <div className="notak-arbre-pitch-puce" role="status" onClick={(e) => e.stopPropagation()}>
          <span>{t('arbre.pitch.depuisDebut')}</span>
          <button type="button" onClick={() => (setIndex(0), setPuce('fermee'))}>
            {t('arbre.pitch.debut')}
          </button>
          <button type="button" onClick={() => setPuce('fermee')}>
            {t('arbre.pitch.ignorer')}
          </button>
        </div>
      )}

      {aide && <Raccourcis fermer={() => setAide(false)} />}
    </div>
  )
}

function Touche({ children }: { children: ReactNode }) {
  return <kbd className="notak-arbre-pitch-touche">{children}</kbd>
}

/** La fenêtre des raccourcis : chaque action et ses touches. */
function Raccourcis({ fermer }: { fermer(): void }) {
  return (
    <div className="notak-arbre-pitch-raccourcis" role="dialog" aria-label={t('arbre.pitch.raccourcis')} onClick={(e) => e.stopPropagation()}>
      <header>
        <button type="button" aria-label={t('commun.fermer')} onClick={fermer}>
          <Icone nom="fermer" taille={14} trait={2} />
        </button>
        <strong>{t('arbre.pitch.raccourcis')}</strong>
      </header>
      <ul>
        {RACCOURCIS.map((r, i) =>
          r.touches ? (
            <li key={r.libelle}>
              <span>{t(r.libelle)}</span>
              <span className="notak-arbre-pitch-touches">
                {r.touches.map((groupe, j) => (
                  <span key={j}>
                    {j > 0 && <i>,</i>}
                    {groupe.map((k, m) => (
                      <span key={k}>
                        {m > 0 && <i>+</i>}
                        <Touche>{k}</Touche>
                      </span>
                    ))}
                  </span>
                ))}
              </span>
            </li>
          ) : (
            <li key={`sep${i}`} className="notak-arbre-pitch-sep" role="separator" />
          ),
        )}
      </ul>
    </div>
  )
}
