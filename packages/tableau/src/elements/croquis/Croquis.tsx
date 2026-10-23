import { useMemo, useRef, useState } from 'react'
import type { Croquis, Trait } from '../../coeur/tableau'
import { Surcouche } from '../surcouche'
import type { PropsOutils, PropsRendu } from '../types'
import {
  COULEURS_TRAIT,
  type CroquisFeuille,
  EPAISSEURS_TRAIT,
  EPAISSEUR_DEFAUT,
  LARGEUR_FEUILLE,
  ajouterPoint,
  arrondir,
  cheminLisse,
  ecrireReglage,
  epaisseurFeuille,
  gommer,
  hauteurFeuille,
  lireReglage,
  traitVise,
} from './trace'
import { t } from '../../langue'
import { BoutonOutil } from '../../BoutonOutil'
import { ico } from '../../icones'

const CLE_COULEUR = 'notak.croquis.couleur'
const CLE_EPAISSEUR = 'notak.croquis.epaisseur'
const ROUGE_GOMME = '#ff0000'
/** Le rayon de la gomme, en pixels d'écran. */
const GOMME_PX = 3
/** Le contour rouge du trait visé déborde de ce nombre de pixels d'écran. */
const CONTOUR_GOMME_PX = 4

/** Les traits d'une feuille, en SVG : un chemin lissé par trait. `vise` : le trait que la gomme viserait, cerné de rouge. */
function Traits({ traits, vise }: { traits: readonly Trait[]; vise?: { i: number; extra: number } | null }) {
  const chemins = useMemo(() => traits.map((t) => cheminLisse(t.points)), [traits])
  return (
    <>
      {traits.map((t, i) => (
        <g key={i}>
          {vise?.i === i && (
            <path d={chemins[i]} fill="none" stroke={ROUGE_GOMME} strokeWidth={t.epaisseur + vise.extra} strokeLinecap="round" strokeLinejoin="round" />
          )}
          <path d={chemins[i]} fill="none" stroke={t.couleur} strokeWidth={t.epaisseur} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
    </>
  )
}

export function RenduCroquis({ element, enEdition, contexte, brouillon }: PropsRendu<Croquis>) {
  const c = element.contenu as CroquisFeuille
  return (
    <div className="notak-croquis">
      <svg viewBox={`0 0 ${LARGEUR_FEUILLE} ${hauteurFeuille(c)}`} role="img" aria-label={t('type.croquis')}>
        <Traits traits={c.traits} />
      </svg>
      {c.traits.length === 0 && <p className="notak-croquis-vide">{t('croquis.vide')}</p>}
      {enEdition && <Feuille contenu={c} ecrire={brouillon} finir={contexte.finirEdition} />}
    </div>
  )
}

type Outil = 'crayon' | 'gomme'
type Volet = 'couleur' | 'epaisseur' | null

const couleurValide = (v: string | null): v is string => v !== null && /^#[0-9a-f]{6}$/i.test(v)

/** L'allure d'une épaisseur, pour son bouton : une barre plus ou moins grasse. */
function BarreEpaisseur({ i }: { i: number }) {
  const e = [1.5, 3, 5, 9][i] ?? 3
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true">
      <line x1="3" y1="9" x2="19" y2="9" stroke="currentColor" strokeWidth={e} strokeLinecap="round" />
    </svg>
  )
}

/**
 * Le croquis ouvert en grand : une feuille centrée au-dessus de la toile, sa barre d'outils en pilule dessous. Un
 * trait se pose au crayon, avec tous les points du pointeur ; la gomme retire le trait entier qu'elle touche (le
 * trait visé se cerne de rouge). Chaque geste est un pas (Annuler, Rétablir) et la feuille part au brouillon à chaque
 * pas. Enregistrer (ou ⌘S, ou un appui hors de la feuille) referme en gardant ; Échap ou Abandonner restaurent
 * la feuille d'avant.
 */
function Feuille({ contenu, ecrire, finir }: { contenu: CroquisFeuille; ecrire(c: Croquis): void; finir(): void }) {
  const depart = useRef(contenu)
  const hauteur = hauteurFeuille(contenu)
  const [traits, setTraits] = useState<Trait[]>(contenu.traits)
  const [passe, setPasse] = useState<Trait[][]>([])
  const [futur, setFutur] = useState<Trait[][]>([])
  const [outil, setOutil] = useState<Outil>('crayon')
  const [couleur, setCouleur] = useState<string>(() => {
    const v = lireReglage(CLE_COULEUR)
    return couleurValide(v) ? v : COULEURS_TRAIT[0]
  })
  const [precedente, setPrecedente] = useState<string>(couleur)
  const [epaisseur, setEpaisseur] = useState<number>(() => {
    const n = Number(lireReglage(CLE_EPAISSEUR))
    return Number.isInteger(n) && n >= 0 && n < EPAISSEURS_TRAIT.length ? n : EPAISSEUR_DEFAUT
  })
  const [volet, setVolet] = useState<Volet>(null)
  const [vise, setVise] = useState<{ i: number; extra: number } | null>(null)
  // Le trait qu'on est en train de tirer, et l'état d'avant un geste de gomme.
  const [enCours, setEnCours] = useState<number[] | null>(null)
  const tire = useRef<{ points: number[]; avant: Trait[]; epaisseur: number } | null>(null)
  const surface = useRef<SVGSVGElement>(null)
  const modifie = passe.length > 0

  const valider = (suite: Trait[], avant: Trait[]) => {
    setPasse((p) => [...p.slice(-99), avant])
    setFutur([])
    setTraits(suite)
    ecrire({ ...contenu, traits: suite })
  }
  const annuler = () => {
    const avant = passe.at(-1)
    if (!avant) return
    setPasse(passe.slice(0, -1))
    setFutur([...futur, traits])
    setTraits(avant)
    ecrire({ ...contenu, traits: avant })
  }
  const retablir = () => {
    const apres = futur.at(-1)
    if (!apres) return
    setFutur(futur.slice(0, -1))
    setPasse([...passe, traits])
    setTraits(apres)
    ecrire({ ...contenu, traits: apres })
  }
  const abandonner = () => {
    if (modifie) ecrire(depart.current)
    finir()
  }

  const choisirCouleur = (c: string) => {
    if (c !== couleur) setPrecedente(couleur)
    setCouleur(c)
    setOutil('crayon')
    ecrireReglage(CLE_COULEUR, c)
  }
  const choisirEpaisseur = (i: number) => {
    setEpaisseur(i)
    setOutil('crayon')
    ecrireReglage(CLE_EPAISSEUR, String(i))
  }

  /** Pixels d'écran par unité de feuille, tel que la feuille s'affiche à cet instant. */
  const echelle = () => (surface.current ? surface.current.getBoundingClientRect().width / LARGEUR_FEUILLE : 1) || 1
  const dansFeuille = (e: { clientX: number; clientY: number }) => {
    const r = surface.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * LARGEUR_FEUILLE, y: ((e.clientY - r.top) / r.height) * hauteur }
  }
  const debut = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    setVolet(null)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Un pointeur que le navigateur ne suit plus : le trait se fait sans capture.
    }
    const { x, y } = dansFeuille(e)
    if (outil === 'crayon') {
      tire.current = { points: [x, y], avant: traits, epaisseur: epaisseurFeuille(EPAISSEURS_TRAIT[epaisseur]!.px, echelle()) }
      setEnCours([x, y])
    } else {
      tire.current = { points: [], avant: traits, epaisseur: 0 }
      setVise(null)
      setTraits((t) => gommer(t, x, y, GOMME_PX / echelle()))
    }
  }
  const deplacement = (e: React.PointerEvent) => {
    const g = tire.current
    if (!g) {
      if (outil === 'gomme') {
        const { x, y } = dansFeuille(e)
        const k = echelle()
        const i = traitVise(traits, x, y, GOMME_PX / k)
        setVise((v) => (i < 0 ? (v ? null : v) : v?.i === i ? v : { i, extra: CONTOUR_GOMME_PX / k }))
      }
      return
    }
    // Le navigateur regroupe parfois plusieurs mouvements en un : on les reprend tous.
    const evenements = e.nativeEvent.getCoalescedEvents?.() ?? []
    const sources = evenements.length > 0 ? evenements : [e.nativeEvent]
    if (outil === 'crayon') {
      let suite = g.points
      for (const m of sources) {
        const { x, y } = dansFeuille(m)
        suite = ajouterPoint(suite, x, y)
      }
      if (suite !== g.points) {
        g.points = suite
        setEnCours(suite)
      }
    } else {
      const k = echelle()
      for (const m of sources) {
        const { x, y } = dansFeuille(m)
        setTraits((t) => gommer(t, x, y, GOMME_PX / k))
      }
    }
  }
  const fin = () => {
    const g = tire.current
    tire.current = null
    if (!g) return
    if (outil === 'crayon') {
      setEnCours(null)
      valider([...g.avant, { points: arrondir(g.points), couleur, epaisseur: g.epaisseur }], g.avant)
    } else if (traits !== g.avant) {
      valider(traits, g.avant)
    }
  }

  const encours = useMemo(
    () => (enCours ? [{ points: enCours, couleur, epaisseur: epaisseurFeuille(EPAISSEURS_TRAIT[epaisseur]!.px, echelle()) }] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enCours, couleur, epaisseur],
  )

  const touche = (e: React.KeyboardEvent) => {
    const cmd = e.metaKey || e.ctrlKey
    const k = e.key.toLowerCase()
    if (cmd && k === 'z') {
      e.preventDefault()
      if (e.shiftKey) retablir()
      else annuler()
      return true
    }
    if (cmd && k === 's') {
      e.preventDefault()
      finir()
      return true
    }
    if (e.key === 'Escape') {
      if (volet) setVolet(null)
      else abandonner()
      return true
    }
    if (cmd || e.altKey || (e.target as HTMLElement).tagName === 'INPUT') return false
    if (k === 'd' || k === 'm' || k === 'b') setOutil('crayon')
    else if (k === 'e') setOutil('gomme')
    else if (k === 'c') setVolet((v) => (v === 'couleur' ? null : 'couleur'))
    else if (k === 'x') choisirCouleur(precedente)
    else if (k >= '1' && k <= '4') choisirEpaisseur(Number(k) - 1)
    else return false
    e.preventDefault()
    return true
  }

  return (
    <Surcouche etiquette={t('croquis.dessiner')} className="notak-croquis-fond" fermer={finir} surTouche={touche}>
      <div className="notak-croquis-feuille" style={{ '--croquis-rapport': LARGEUR_FEUILLE / hauteur } as React.CSSProperties}>
        <svg
          ref={surface}
          className="notak-croquis-surface"
          data-outil={outil}
          viewBox={`0 0 ${LARGEUR_FEUILLE} ${hauteur}`}
          onPointerDown={debut}
          onPointerMove={deplacement}
          onPointerUp={fin}
          onPointerCancel={fin}
          onPointerLeave={() => setVise(null)}
        >
          <Traits traits={traits} vise={outil === 'gomme' ? vise : null} />
          <Traits traits={encours} />
        </svg>
        <div className="notak-croquis-barre" role="toolbar" aria-label={t('croquis.outil')}>
          <button type="button" title={`${t('dessin.crayon')} (D)`} aria-label={t('dessin.crayon')} aria-pressed={outil === 'crayon'} onClick={() => setOutil('crayon')}>
            {ico('croquis')}
          </button>
          <button type="button" title={`${t('dessin.gomme')} (E)`} aria-label={t('dessin.gomme')} aria-pressed={outil === 'gomme'} onClick={() => setOutil('gomme')}>
            {ico('gomme')}
          </button>
          <span className="notak-croquis-sep" role="separator" />
          <span className="notak-croquis-volet-hote">
            <button type="button" title={`${t('couleur.titre')} (C)`} aria-label={t('couleur.titre')} aria-expanded={volet === 'couleur'} onClick={() => setVolet(volet === 'couleur' ? null : 'couleur')}>
              <span className="notak-croquis-pastille" style={{ background: couleur }} />
            </button>
            {volet === 'couleur' && (
              <div className="notak-croquis-volet notak-croquis-couleurs" role="group" aria-label={t('couleur.titre')}>
                {COULEURS_TRAIT.map((c) => (
                  <button key={c} type="button" className="notak-croquis-pastille" style={{ background: c }} aria-label={c} aria-pressed={couleur === c} onClick={() => choisirCouleur(c)} />
                ))}
                <label className="notak-croquis-libre" title={t('croquis.couleurLibre')}>
                  <input type="color" value={couleur} aria-label={t('croquis.couleurLibre')} onChange={(e) => choisirCouleur(e.target.value)} />
                </label>
              </div>
            )}
          </span>
          <span className="notak-croquis-volet-hote">
            <button type="button" title={`${t('croquis.epaisseur')} (1-4)`} aria-label={t('croquis.epaisseur')} aria-expanded={volet === 'epaisseur'} onClick={() => setVolet(volet === 'epaisseur' ? null : 'epaisseur')}>
              <BarreEpaisseur i={epaisseur} />
            </button>
            {volet === 'epaisseur' && (
              <div className="notak-croquis-volet" role="group" aria-label={t('croquis.epaisseur')}>
                {EPAISSEURS_TRAIT.map((e, i) => (
                  <button key={e.px} type="button" title={`${e.libelle} (${i + 1})`} aria-label={e.libelle} aria-pressed={epaisseur === i} onClick={() => choisirEpaisseur(i)}>
                    <BarreEpaisseur i={i} />
                  </button>
                ))}
              </div>
            )}
          </span>
          <span className="notak-croquis-sep" role="separator" />
          <button type="button" title={`${t('espace.annuler')} (⌘Z)`} aria-label={t('espace.annuler')} disabled={passe.length === 0} onClick={annuler}>
            {ico('annuler')}
          </button>
          <button type="button" title={`${t('espace.retablir')} (⌘⇧Z)`} aria-label={t('espace.retablir')} disabled={futur.length === 0} onClick={retablir}>
            {ico('retablir')}
          </button>
          <span className="notak-croquis-espace" />
          <button type="button" className="notak-croquis-texte" title="Esc" onClick={abandonner}>
            {modifie ? t('croquis.abandonner') : t('commun.annuler')}
          </button>
          <button type="button" className="notak-croquis-texte notak-croquis-enregistrer" title="⌘S" disabled={!modifie} onClick={finir}>
            {t('croquis.enregistrer')}
          </button>
        </div>
      </div>
    </Surcouche>
  )
}

export function OutilsCroquis({ elements, contexte }: PropsOutils<Croquis>) {
  if (contexte.services.lectureSeule || elements.length !== 1) return null
  return (
    <BoutonOutil icone="croquis" titre={t('croquis.ouvrir')} libelle={t('croquis.dessiner')} onClick={() => contexte.commencerEdition(elements[0]!.id)} />
  )
}
