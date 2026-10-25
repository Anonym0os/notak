import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { Arbre, Id, ReglagesDiapo } from '../../coeur/tableau'
import { Icone, type NomIcone } from '../../icones'
import { t } from '../../langue'
import { ChoixTheme } from './ChoixTheme'
import { Diapositive } from './Diapo'
import {
  type ChampVisibilite,
  LIVRAISON_DEFAUT,
  MISES_EN_PAGE,
  type MiseEnPage,
  miseEnPageDe,
  placeImageAutoDe,
  sequence,
  visibilite,
  visibiliteAuto,
} from './modele/diapositives'
import type { Geste } from './modele/gestes'
import { type Lecture, enfantsDe, structureDe } from './modele/sujets'
import { RATIOS_PITCH, dimensionsDuRatio, ratioEffectif, themePitchDe } from './themesPitch'

/**
 * L'onglet Pitch du panneau de côté (docs/XMIND.md § 12) : un aperçu de la diapositive du sujet, le thème et le
 * rapport de la carte, puis, pour les sujets choisis, ce qui devient diapositive et comment. Chaque réglage Auto
 * retire son champ.
 */

interface Props {
  arbre: Arbre
  lecture: Lecture
  /** Les sujets choisis dans la carte. */
  choisis: readonly Id[]
  faire(g: Geste): void
  adresse?: ((fichier: Id) => string | undefined) | undefined
}

type Reglage = keyof ReglagesDiapo

/** La valeur commune d'un réglage aux sujets choisis : `undefined` s'ils sont tous en Auto, `'multiple'` s'ils diffèrent. */
function commun(l: Lecture, ids: readonly Id[], champ: Reglage): string | undefined | 'multiple' {
  const premier = l.sujets.get(ids[0]!)?.diapo?.[champ]
  return ids.every((x) => l.sujets.get(x)?.diapo?.[champ] === premier) ? premier : 'multiple'
}

const LIGNE_VIDE = 'auto'

/**
 * Un menu à 24 de haut. Le menu natif garde la liste et l'accessibilité ; ce qu'on voit est une valeur courte posée par
 * dessus (« Auto », jamais « Auto (Visible) » dans les 72 px d'une rangée courte : le détail vit dans la liste ouverte).
 */
function Menu({ valeur, options, change, info, libelle, large }: { valeur: string; options: { valeur: string; libelle: string }[]; change(v: string): void; info: string; libelle: string; large?: boolean }) {
  const courante = options.find((o) => o.valeur === valeur)
  const affiche = valeur === 'multiple' ? t('arbre.pitch.multiple') : valeur === LIGNE_VIDE && !large ? t('arbre.pitch.auto') : (courante?.libelle ?? valeur)
  return (
    <span className="notak-arbre-pitch-select" data-large={large ? '' : undefined}>
      <select value={valeur} title={info} aria-label={libelle} onChange={(e) => change(e.target.value)}>
        {valeur === 'multiple' && (
          <option value="multiple" disabled>
            {t('arbre.pitch.multiple')}
          </option>
        )}
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
      <span className="notak-arbre-pitch-valeur" aria-hidden>
        {affiche}
      </span>
      <Icone nom="chevronBas" taille={12} trait={2} />
    </span>
  )
}

/**
 * Une rangée du panneau : courte (libellé à gauche, contrôle de 72 à droite) ou, en `vertical`, une légende de 11 puis
 * le contrôle sur toute la largeur. Le libellé tient sur une ligne, quelle que soit la colonne.
 */
function Ligne({ libelle, children, vertical, ample }: { libelle: string; children: ReactNode; vertical?: boolean; ample?: boolean }) {
  return (
    <div className="notak-arbre-pitch-ligne" data-vertical={vertical ? '' : undefined} data-ample={ample ? '' : undefined}>
      <span title={libelle}>{libelle}</span>
      {children}
    </div>
  )
}

export function OngletPresenter({ arbre, lecture: l, choisis, faire, adresse }: Props) {
  const ids = choisis.filter((x) => l.sujets.has(x))
  const [themes, setThemes] = useState(false)
  const bouton = useRef<HTMLButtonElement>(null)
  const ratio = ratioEffectif(arbre.pitch, typeof window === 'undefined' ? undefined : window.innerWidth, typeof window === 'undefined' ? undefined : window.innerHeight)
  const theme = themePitchDe(arbre.pitch?.theme)

  if (ids.length === 0)
    return (
      <div className="notak-arbre-pitch-vide">
        <Icone nom="fichierPresentation" taille={60} trait={1} />
        <p>{t('arbre.pitch.vide')}</p>
      </div>
    )

  const poser = (reglage: Parameters<typeof faireDiapo>[2]) => faireDiapo(faire, ids, reglage)
  const tous = (garde: (id: Id) => boolean) => ids.every(garde)
  const unAuMoins = (garde: (id: Id) => boolean) => ids.some(garde)

  /** Un menu Auto / Visible / Masqué, dont « Auto » dit ce qu'il décide. */
  const menuVisibilite = (champ: ChampVisibilite) => {
    const dit = commun(l, ids, champ)
    // « Auto (…) » dit ce que la règle déciderait sans le réglage du sujet.
    const resolus = new Set(ids.map((x) => visibiliteAuto(l, x, champ)))
    const auto = resolus.size === 1 ? `${t('arbre.pitch.auto')} (${t(`arbre.pitch.${[...resolus][0]}`)})` : t('arbre.pitch.auto')
    return (
      <Menu
        valeur={dit === undefined ? LIGNE_VIDE : dit}
        libelle={t(champ === 'sujet' ? 'arbre.pitch.sujet' : champ === 'liste' ? 'arbre.pitch.liste' : 'arbre.pitch.resume')}
        info={t(champ === 'sujet' ? 'arbre.pitch.sujetInfo' : champ === 'liste' ? 'arbre.pitch.listeInfo' : 'arbre.pitch.resumeInfo')}
        options={[
          { valeur: LIGNE_VIDE, libelle: auto },
          { valeur: 'visible', libelle: t('arbre.pitch.visible') },
          { valeur: 'masque', libelle: t('arbre.pitch.masque') },
        ]}
        change={(v) => poser({ [champ]: v === LIGNE_VIDE ? null : v })}
      />
    )
  }

  const toutesImages = tous((x) => !!l.sujets.get(x)?.image)
  const avecEnfants = ids.filter((x) => enfantsDe(l, x).length > 0)
  const listeVisible = avecEnfants.some((x) => visibilite(l, x, 'liste').valeur === 'visible')
  const resumes = tous((x) => l.sujets.get(x)?.genre === 'resume')
  const tete = ids.some((x) => /^(arete|chronologie)/.test(structureDe(l, x)))
  const dispositions = new Set(avecEnfants.map((x) => miseEnPageDe(l, x).valeur))
  const dispo = dispositions.size === 1 ? [...dispositions][0] : null
  const placeImage = commun(l, ids, 'image')
  const placeAuto = new Set(ids.map((x) => placeImageAutoDe(l, x, ratio)))

  const livraison = commun(l, avecEnfants, 'livraison')

  return (
    <div className="notak-arbre-pitch">
      <section className="notak-arbre-pitch-section">
        <h3>{t('arbre.pitch.affichage')}</h3>
        <Apercu lecture={l} ids={ids} arbre={arbre} ratio={ratio} adresse={adresse} />
      </section>
      <section className="notak-arbre-pitch-section">
        <button ref={bouton} type="button" className="notak-arbre-pitch-bouton" title={t('arbre.pitch.themeInfo')} aria-haspopup="dialog" aria-expanded={themes} onClick={() => setThemes((o) => !o)}>
          {t('arbre.pitch.changerTheme')}
        </button>
        {themes && <ChoixTheme ancre={bouton.current} theme={theme.id} ratio={ratio} choisir={(id) => faire({ type: 'pitch', reglage: { theme: id } })} fermer={() => setThemes(false)} />}
        <Ligne libelle={t('arbre.pitch.ratio')}>
          <Menu
            valeur={arbre.pitch?.ratio ?? LIGNE_VIDE}
            libelle={t('arbre.pitch.ratio')}
            info={t('arbre.pitch.ratioInfo')}
            options={[{ valeur: LIGNE_VIDE, libelle: t('arbre.pitch.auto') }, ...RATIOS_PITCH.map((r) => ({ valeur: r, libelle: r }))]}
            change={(v) => faire({ type: 'pitch', reglage: { ratio: v === LIGNE_VIDE ? null : (v as (typeof RATIOS_PITCH)[number]) } })}
          />
        </Ligne>
        <hr />
        {resumes && (
          <>
            <Ligne libelle={t('arbre.pitch.resumeLigne')}>{menuVisibilite('resume')}</Ligne>
            <hr />
          </>
        )}
        <Ligne libelle={t('arbre.pitch.sujetLigne')}>{menuVisibilite('sujet')}</Ligne>
        {toutesImages && (
          <Ligne libelle={t('arbre.pitch.imagePlace')} vertical ample>
            <Menu
              valeur={placeImage === undefined ? LIGNE_VIDE : placeImage}
              libelle={t('arbre.pitch.imagePlace')}
              info={t('arbre.pitch.imageInfo')}
              large
              options={[
                { valeur: LIGNE_VIDE, libelle: placeAuto.size === 1 ? `${t('arbre.pitch.auto')} (${t(`arbre.pitch.image.${[...placeAuto][0]}`)})` : t('arbre.pitch.auto') },
                ...(['gauche', 'droite', 'dessus', 'dessous', 'fond'] as const).map((p) => ({ valeur: p, libelle: t(`arbre.pitch.image.${p}`) })),
              ]}
              change={(v) => poser({ image: v === LIGNE_VIDE ? null : (v as ReglagesDiapo['image']) })}
            />
          </Ligne>
        )}
        {unAuMoins((x) => enfantsDe(l, x).length > 0) && (
          <>
            <hr />
            <Ligne libelle={t('arbre.pitch.listeLigne')}>{menuVisibilite('liste')}</Ligne>
            {listeVisible && (
              <>
                <Ligne libelle={t('arbre.pitch.livraison')} vertical>
                  <Menu
                    valeur={livraison === undefined ? LIGNE_VIDE : livraison}
                    libelle={t('arbre.pitch.livraison')}
                    info={t('arbre.pitch.livraisonInfo')}
                    large
                    options={[
                      { valeur: LIGNE_VIDE, libelle: `${t('arbre.pitch.auto')} (${t(`arbre.pitch.livraison.${LIVRAISON_DEFAUT}`)})` },
                      ...(['percer', 'un-par-un', 'tout'] as const).map((v) => ({ valeur: v, libelle: t(`arbre.pitch.livraison.${v}`) })),
                    ]}
                    change={(v) => faireDiapo(faire, avecEnfants, { livraison: v === LIGNE_VIDE ? null : (v as ReglagesDiapo['livraison']) })}
                  />
                </Ligne>
                {dispo && (
                  <Ligne libelle={t('arbre.pitch.miseEnPage')} vertical>
                    <div className="notak-arbre-pitch-segments" role="radiogroup" aria-label={t('arbre.pitch.miseEnPage')}>
                      {MISES_EN_PAGE.map((m) => (
                        <button key={m} type="button" role="radio" aria-checked={dispo === m} disabled={tete} title={t(`arbre.pitch.mise.${m}Info`)} aria-label={t(`arbre.pitch.mise.${m}`)} onClick={() => faireDiapo(faire, avecEnfants, { miseEnPage: m })}>
                          <Icone nom={ICONE_MISE[m]} taille={18} trait={1.5} />
                        </button>
                      ))}
                    </div>
                  </Ligne>
                )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  )
}

const ICONE_MISE: Record<MiseEnPage, NomIcone> = { accolade: 'listeAccolade', puces: 'puces', paroles: 'centrer', arete: 'listeArete', chronologie: 'listeChronologie' }

function faireDiapo(faire: (g: Geste) => void, ids: readonly Id[], reglage: Extract<Geste, { type: 'diapo' }>['reglage']) {
  faire({ type: 'diapo', ids: [...ids], reglage })
}

/** La hauteur de l'aperçu ; sa largeur suit le rapport. */
const HAUTEUR_APERCU = 128

/**
 * L'aperçu de la diapositive du sujet choisi. Au survol il se rejoue : les diapositives du sujet, étape après étape,
 * toutes les 2 s. Plusieurs sujets ou aucune diapositive : un texte à la place.
 */
function Apercu({ lecture: l, ids, arbre, ratio, adresse }: { lecture: Lecture; ids: readonly Id[]; arbre: Arbre; ratio: ReturnType<typeof ratioEffectif>; adresse: Props['adresse'] }) {
  const diapos = useMemo(() => sequence(l, { ratio, resumes: arbre.resumes }).diapos, [l, ratio, arbre.resumes])
  const id = ids.length === 1 ? ids[0]! : null
  // Les diapositives montrées de ce sujet : la sienne, puis les étapes de sa liste.
  const siens = useMemo(() => (id ? diapos.filter((d) => d.sujet === id && d.type !== 'fin' && !d.sautee) : []), [diapos, id])
  const [rang, setRang] = useState(0)
  const [survol, setSurvol] = useState(false)
  useEffect(() => setRang(0), [id, arbre.pitch, siens.length])
  useEffect(() => {
    if (!survol || siens.length < 2) return
    const minuterie = setInterval(() => setRang((r) => (r + 1) % siens.length), 2000)
    return () => clearInterval(minuterie)
  }, [survol, siens.length])
  const { l: rl, h: rh } = dimensionsDuRatio(ratio)
  const largeur = ratio === '16:9' ? 227 : Math.round((HAUTEUR_APERCU * rl) / rh)
  if (ids.length > 1) return <p className="notak-arbre-pitch-apercu-texte">{t('arbre.pitch.plusieurs')}</p>
  const courant = siens[Math.min(rang, siens.length - 1)]
  if (!courant) return <p className="notak-arbre-pitch-apercu-texte">{t('arbre.pitch.invisibles')}</p>
  return (
    <div className="notak-arbre-pitch-apercu" key={`${id}:${arbre.pitch?.theme ?? ''}:${arbre.pitch?.ratio ?? ''}`} onMouseEnter={() => setSurvol(true)} onMouseLeave={() => (setSurvol(false), setRang(0))}>
      <Diapositive lecture={l} diapo={courant} theme={themePitchDe(arbre.pitch?.theme)} ratio={ratio} adresse={adresse} taille={{ l: largeur, h: HAUTEUR_APERCU }} />
    </div>
  )
}

