import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Arbre, Id } from '../../coeur/tableau'
import { Icone, type NomIcone } from '../../icones'
import { t } from '../../langue'
import { Choix, Interrupteur, LigneReglage } from '../../communs'
import { Agrandissement, BoutonAgrandir, type ImageVisee } from './Agrandissement'
import { ChoixTheme, PopoverFixe } from './ChoixTheme'
import { Diapositive } from './Diapo'
import { EcranDeFin } from './diapo/EcranDeFin'
import { FINIE, type Jeu, jouerAffichage, jouerFin, jouerSortieFin, jouerTransition, mouvementPermis } from './diapo/jouer'
import { fondSombre } from './diapo/morphing'
import { type Diapo, type Position, type Saut, depart as diapoDeDepart, precedente, sequence, trajet, versParent } from './modele/diapositives'
import { type Commande, effetDeTransition, estPortrait } from './modele/gabarits'
import type { Geste } from './modele/gestes'
import type { Lecture } from './modele/sujets'
import { RATIOS_PITCH, ratioEffectif, themeDuPitch } from './themesPitch'

/**
 * Le mode présentation lancé par Pitch (docs/XMIND.md § 12) : la carte devient une suite de diapositives, plein écran.
 * Une barre flottante en haut à droite (quitter, réglages, navigation) s'estompe après trois secondes ; Espace et les
 * flèches avancent, Échap sort. Les préférences d'animation vivent dans ce navigateur, pas dans la carte.
 *
 * Chaque pas joue sa transition (diapo/transitions.ts) : la diapositive quittée et la nouvelle sont montées l'une sur
 * l'autre le temps de l'effet, puis la nouvelle reste seule. Notak s'écarte ici de Xmind, qui fait attendre la fin d'une
 * transition et jette les demandes en trop (relevé 10 § 5.6) : une touche pressée pendant une transition l'achève
 * aussitôt et joue la suivante. Plusieurs appuis rapprochés passent leurs pas d'un coup, seul le dernier s'anime ; une
 * touche maintenue fait défiler sans animation.
 */

type Demande = Exclude<Commande, 'depart'>

/** Une demande en attente ; `instant` : elle passe sans animation (une touche maintenue). */
interface Attente {
  commande: Demande
  instant: boolean
}

/** Un pas animé en cours : d'où, vers où, avec quoi ensuite. `n` le distingue du pas suivant vers la même diapositive. */
interface EnCours {
  saut: Saut
  reste: Saut[]
  n: number
}

/**
 * Un pas qui passe d'un coup : l'effet nul, sauf vers l'écran de fin et hors de lui, qui ignorent le réglage d'animation
 * (relevé 10 § 5.5) ; reculer depuis l'écran de fin, lui, ne s'anime jamais. Sans mouvement permis, rien ne s'anime.
 */
function instantane(s: Saut, mouvement: boolean): boolean {
  if (s.de === 'ecran-de-fin') return s.vers !== 'terminer' || !mouvement
  if (s.vers === 'ecran-de-fin') return !mouvement
  return s.effet.nom === 'aucun'
}

/** Ce que le modèle sait d'une diapositive et que sa transition regarde. */
const ficheDe = (d: Diapo | undefined) => ({ niveau: d?.niveau, premiere: d?.type === 'liste' ? d.premiere : undefined })

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
  // Les indices de la suite ne dépendent pas du rapport (seuls les gabarits en dépendent) : on part d'une suite sans lui.
  const [position, setPosition] = useState<Position>(() => diapoDeDepart(sequence(l, { resumes: arbre.resumes }), l, depart))
  const premiere = useMemo(() => diapoDeDepart(sequence(l, { resumes: arbre.resumes }), l), [l, arbre.resumes])
  const [anime, setAnime] = useState(animationEnregistree)
  // Le mélange des décors : tiré une fois par présentation.
  const [graine] = useState(() => Math.floor(Math.random() * 2 ** 31))
  const [reglages, setReglages] = useState(false)
  const [themes, setThemes] = useState(false)
  const [aide, setAide] = useState(false)
  const [discret, setDiscret] = useState(false)
  const [survol, setSurvol] = useState(false)
  const [puce, setPuce] = useState<'attente' | 'visible' | 'fermee'>(depart !== undefined && depart !== l.central && position !== premiere ? 'attente' : 'fermee')
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
  const theme = themeDuPitch(arbre.pitch)
  const [rl, rh] = ratio.split(':').map(Number) as [number, number]
  const k = Math.min(dim.l / rl, dim.h / rh)
  const taille = { l: Math.floor(rl * k), h: Math.floor(rh * k) }
  const seq = useMemo(() => sequence(l, { ratio, resumes: arbre.resumes }), [l, ratio, arbre.resumes])

  // Plein écran : celui qu'on obtient ; en sortir (Échap du navigateur) termine la présentation. On croit le navigateur
  // sur ce qu'il fait, pas sur la promesse : WebKit (Safari, l'app de bureau) n'émet que l'événement préfixé, et sa
  // promesse peut échouer alors que la fenêtre est passée en plein écran. Il fallait alors un second Échap pour sortir.
  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void }
    const plein = () => !!(document.fullscreenElement ?? doc.webkitFullscreenElement)
    const fond = scene.current?.closest<HTMLElement>('.notak-arbre-fond') as (HTMLElement & { webkitRequestFullscreen?: () => void }) | null | undefined
    let entre = plein()
    try {
      const r = fond?.requestFullscreen ? fond.requestFullscreen() : fond?.webkitRequestFullscreen?.()
      void r?.catch(() => {})
    } catch {
      /* Pas de plein écran (une iframe, un navigateur qui refuse) : la présentation occupe la fenêtre. */
    }
    const change = () => {
      if (plein()) entre = true
      else if (entre) ((entre = false), quitter())
    }
    document.addEventListener('fullscreenchange', change)
    document.addEventListener('webkitfullscreenchange', change)
    return () => {
      document.removeEventListener('fullscreenchange', change)
      document.removeEventListener('webkitfullscreenchange', change)
      entre = false
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
      else if (doc.webkitFullscreenElement) doc.webkitExitFullscreen?.()
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

  // Chaque commande joue ses pas (les enchaînements automatiques compris), un par un, chacun avec sa transition. Les
  // pas sans effet passent d'un coup ; un pas animé joue jusqu'au bout, ou jusqu'à la demande suivante qui l'achève.
  const [enCours, setEnCours] = useState<EnCours | null>(null)
  const attentes = useRef<Attente[]>([])
  // Un pas animé joue (ou le démarrage) : une nouvelle demande l'achève au lieu d'attendre.
  const occupe = useRef(false)
  const jeu = useRef<Jeu | null>(null)
  const ici = useRef(position)
  ici.current = position
  const compteur = useRef(0)
  const contexte = useRef({ seq, l, anime, quitter })
  contexte.current = { seq, l, anime, quitter }
  const terminer = () => {
    attentes.current = []
    occupe.current = false
    setEnCours(null)
    contexte.current.quitter()
  }
  /** Joue des sauts : ceux sans effet d'un coup, puis le premier animé ; `presse` : tous d'un coup, d'autres attendent. */
  const enchainer = useRef<(sauts: Saut[], presse: boolean) => void>(() => {})
  enchainer.current = (sauts, presse) => {
    const mouvement = mouvementPermis()
    let reste = sauts
    while (reste.length && (presse || instantane(reste[0]!, mouvement))) {
      const s = reste[0]!
      reste = reste.slice(1)
      if (s.vers === 'terminer') return terminer()
      ici.current = s.vers
      setPosition(s.vers)
    }
    if (reste.length) {
      const [saut, ...suite] = reste as [Saut, ...Saut[]]
      occupe.current = true
      setEnCours({ saut, reste: suite, n: ++compteur.current })
      if (saut.vers !== 'terminer') ((ici.current = saut.vers), setPosition(saut.vers))
      return
    }
    occupe.current = false
    setEnCours(null)
    suivante.current()
  }
  /** La demande suivante : animée seulement si c'est la dernière en attente. */
  const suivante = useRef<() => void>(() => {})
  suivante.current = () => {
    const a = attentes.current.shift()
    if (!a) return
    const presse = a.instant || attentes.current.length > 0
    const { seq: s, l: lec, anime: an } = contexte.current
    enchainer.current(trajet(s, lec, ici.current, a.commande, an && mouvementPermis() && !presse), presse)
  }
  const jouer = useCallback((commande: Demande, instant = false) => {
    attentes.current.push({ commande, instant })
    // Ce qui joue va à son terme tout de suite ; la fin du pas reprend la file.
    if (occupe.current) jeu.current?.achever()
    else suivante.current()
  }, [])
  /** Un saut direct (« depuis le début ») : ce qui joue s'arrête, ce qui attendait est oublié. */
  const allerA = useCallback((p: Position) => {
    attentes.current = []
    occupe.current = false
    setEnCours(null)
    ici.current = p
    setPosition(p)
  }, [])
  const suivant = useCallback((instant = false) => jouer('avancer', instant), [jouer])
  const precedent = useCallback((instant = false) => jouer('reculer', instant), [jouer])
  const passer = useCallback((instant = false) => jouer('passer', instant), [jouer])
  const parent = useCallback((instant = false) => jouer('remonter', instant), [jouer])
  const montrees = seq.diapos.filter((d) => !d.sautee).length
  const rang = position === 'ecran-de-fin' ? montrees : seq.diapos.slice(0, position + 1).filter((d) => !d.sautee).length
  const auDebut = typeof position === 'number' && precedente(seq, position) === null
  const basculerAnimation = useCallback(() => {
    setAnime((a) => {
      enregistrerAnimation(!a)
      return !a
    })
  }, [])

  // L'image survolée porte le bouton d'agrandissement ; ouverte, elle couvre la scène.
  const [visee, setVisee] = useState<ImageVisee | null>(null)
  const [zoom, setZoom] = useState<(ImageVisee & { sombre: boolean }) | null>(null)
  const refermeur = useRef<(() => void) | null>(null)
  const viser = (e: React.PointerEvent) => {
    const sc = scene.current
    const cible = e.target as Element
    if (!sc || cible.closest('.notak-arbre-pitch-agrandir')) return
    const img = cible.closest<HTMLElement>(`[data-couche="${String(position)}"] .notak-arbre-diapo-image`)
    const valable = img && !img.classList.contains('notak-arbre-diapo-image-floue') && img.firstElementChild && img.getAttribute('data-etat') !== 'cache'
    if (!valable) return visee && setVisee(null)
    if (visee?.el === img) return
    const r = img.getBoundingClientRect()
    const o = sc.getBoundingClientRect()
    setVisee({ el: img, rect: { x: r.left - o.left, y: r.top - o.top, l: r.width, h: r.height } })
  }
  // Changer de diapositive ferme l'agrandissement sans animation et oublie l'image survolée.
  useEffect(() => {
    setVisee(null)
    setZoom(null)
  }, [position])
  const agrandir = () => {
    if (!visee) return
    const cadre = visee.el.closest('.notak-arbre-diapo-cadre')
    setZoom({ ...visee, sombre: fondSombre(cadre ? getComputedStyle(cadre).backgroundColor : undefined) })
    setVisee(null)
  }

  // Les touches sont à la présentation tant qu'elle dure : la carte dessous n'en voit aucune.
  const touche = useRef<(e: KeyboardEvent) => void>(() => {})
  touche.current = (e) => {
    // Pendant l'agrandissement d'une image, aucune demande n'est prise ; Échap le referme.
    if (zoom) {
      if (e.key === 'Escape') refermeur.current?.()
      e.preventDefault()
      e.stopPropagation()
      return
    }
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
    } else if (e.key === 'ArrowRight' && e.shiftKey) passer(e.repeat)
    else if (e.key === 'ArrowLeft' && e.shiftKey) parent(e.repeat)
    else if ([' ', 'Enter', 'ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key)) suivant(e.repeat)
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) precedent(e.repeat)
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

  const merci = seq.diapos.at(-1)
  // Pendant un pas animé, la diapositive quittée reste montée sous la nouvelle.
  const quittee = enCours && typeof enCours.saut.de === 'number' && enCours.saut.de !== position ? enCours.saut.de : null
  const couches = [...(quittee !== null ? [quittee] : []), ...(typeof position === 'number' ? [position] : [])]

  // Le pas animé se joue sur les couches montées, avant la première image.
  useLayoutEffect(() => {
    if (!enCours) return
    const sc = scene.current
    if (!sc) return
    const racine = (p: Position | null | 'terminer') => (typeof p === 'number' ? sc.querySelector<HTMLElement>(`[data-couche="${p}"] .notak-arbre-diapo`) : null)
    const { saut } = enCours
    const fin = sc.querySelector<HTMLElement>('.notak-arbre-diapo-fin')
    let lecture: Jeu = FINIE
    try {
      if (saut.vers === 'terminer') lecture = fin ? jouerSortieFin(fin) : FINIE
      else if (saut.vers === 'ecran-de-fin') lecture = fin ? jouerFin(sc.querySelector<HTMLElement>(`[data-couche="${String(saut.de)}"]`), fin) : FINIE
      else {
        const cible = racine(saut.vers)
        const source = racine(saut.de)
        const d = contexte.current.seq.diapos
        if (cible) lecture = jouerTransition(saut.effet, source ? { racine: source, fiche: ficheDe(typeof saut.de === 'number' ? d[saut.de] : undefined) } : null, { racine: cible, fiche: ficheDe(d[saut.vers]) })
      }
    } catch (erreur) {
      // Une transition qui ne sait pas se jouer passe d'un coup : la présentation ne reste jamais bloquée.
      console.error(erreur)
      lecture = FINIE
    }
    jeu.current = lecture
    let vivant = true
    void lecture.fini.then((auBout) => {
      if (!vivant || !auBout) return
      jeu.current = null
      if (saut.vers === 'terminer') return terminer()
      enchainer.current(enCours.reste, attentes.current.length > 0)
    })
    return () => {
      vivant = false
      if (jeu.current === lecture) jeu.current = null
      lecture.arreter()
    }
  }, [enCours])

  // Le démarrage : la première diapositive paraît en fondu (600 ms pour le central, 400 sinon), avant la première image.
  useLayoutEffect(() => {
    const p = ici.current
    const d = typeof p === 'number' ? seq.diapos[p] : undefined
    if (!d || !anime || !mouvementPermis()) return
    occupe.current = true
    setEnCours({ saut: { de: null, vers: p, effet: effetDeTransition(null, d, 'depart', true), automatique: false }, reste: [], n: ++compteur.current })
    // Seulement au lancement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Une fois arrivée, la diapositive joue son animation d'affichage (les bulles de Hubble Bubble), sans rien retenir.
  useEffect(() => {
    if (enCours || typeof position !== 'number' || !anime || !mouvementPermis()) return
    const racine = scene.current?.querySelector<HTMLElement>(`[data-couche="${position}"] .notak-arbre-diapo`)
    if (!racine) return
    const lecture = jouerAffichage(racine)
    return () => lecture.arreter()
  }, [enCours, position, anime, theme.id])

  const mettreAJour = (reglage: Extract<Geste, { type: 'pitch' }>['reglage']) => !lectureSeule && faire({ type: 'pitch', reglage })

  return (
    <div ref={scene} className="notak-arbre-pitch-scene" style={{ background: '#000' }} onClick={() => suivant()} onPointerMove={viser} onPointerLeave={() => setVisee(null)} aria-label={t('arbre.pitch.titre')} role="region" aria-live="polite">
      {couches.map((p) => {
        const d = seq.diapos[p]
        return (
          d && (
            <div key={p} className="notak-arbre-pitch-diapo" data-couche={p} aria-hidden={p !== position ? true : undefined}>
              <Diapositive lecture={l} diapo={d} theme={theme} ratio={ratio} adresse={adresse} anime={anime} graine={graine} taille={taille} />
            </div>
          )
        )
      })}
      {position === 'ecran-de-fin' && merci && (
        <div className="notak-arbre-pitch-fin" style={{ position: 'absolute', inset: 0 }}>
          <EcranDeFin arbre={arbre} ratio={ratio} taille={taille} adresse={adresse} vignette={(petite) => <Diapositive lecture={l} diapo={merci} theme={theme} ratio={ratio} adresse={adresse} anime={false} graine={graine} taille={petite} />} />
        </div>
      )}
      {visee && !zoom && !enCours && <BoutonAgrandir image={visee} ouvrir={agrandir} />}
      {zoom && <Agrandissement image={zoom} scene={dim} sombre={zoom.sombre} portrait={estPortrait(ratio)} fermer={() => setZoom(null)} refermeur={refermeur} />}
      <span className="notak-arbre-pitch-compte">{t('arbre.pitch.position', { i: rang, n: montrees })}</span>

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
          <BoutonOutil icone="triangleGauchePlein" info={t('arbre.pitch.parent')} inactif={typeof position !== 'number' || versParent(seq, position) === null} onClick={parent} />
          <BoutonOutil icone="triangleGauche" info={t('arbre.pitch.precedent')} inactif={auDebut} onClick={precedent} />
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
          <LigneReglage className="notak-arbre-pitch-ligne" libelle={t('arbre.pitch.ratio')}>
            <Choix
              valeur={arbre.pitch?.ratio ?? 'auto'}
              options={[{ valeur: 'auto', libelle: t('arbre.pitch.auto') }, ...RATIOS_PITCH.map((r) => ({ valeur: r, libelle: r }))]}
              titre={t('arbre.pitch.ratioInfo')}
              libelle={t('arbre.pitch.ratio')}
              inactif={lectureSeule}
              onChange={(v) => mettreAJour({ ratio: v === 'auto' ? null : (v as (typeof RATIOS_PITCH)[number]) })}
            />
          </LigneReglage>
          <LigneReglage className="notak-arbre-pitch-ligne" libelle={t('arbre.pitch.animation')}>
            <Interrupteur actif={anime} onChange={basculerAnimation} libelle={t('arbre.pitch.animation')} titre={t('arbre.pitch.animationInfo')} />
          </LigneReglage>
          {themes && <ChoixTheme ancre={boutonTheme.current} pitch={arbre.pitch} ratio={ratio} choisir={mettreAJour} fermer={() => setThemes(false)} />}
        </PopoverFixe>
      )}

      {puce === 'visible' && (
        <div className="notak-arbre-pitch-puce" role="status" onClick={(e) => e.stopPropagation()}>
          <span>{t('arbre.pitch.depuisDebut')}</span>
          <button type="button" onClick={() => (allerA(premiere), setPuce('fermee'))}>
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
