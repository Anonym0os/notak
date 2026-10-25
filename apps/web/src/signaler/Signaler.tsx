import { type Capture, capturerEcran } from '@notak/tableau'
import { type PointerEvent as PointeurReact, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { t } from '../langue'
import { contexteEnMarkdown, estLeRaccourci, releverContexte } from './contexte'
import { erreursRecentes, poserJournal } from './journal'
import './signaler.css'

/**
 * Signaler un bug, par-dessus tout (⌥⌘S) : l'écran est pris tout de suite, on l'annote au stylo ou on le recadre, on
 * écrit deux mots, Entrée envoie. La fenêtre se ferme aussitôt et l'envoi se fait derrière : on reprend là où on était,
 * le focus compris. Le serveur range le signalement dans sa file (`apps/serveur/src/signalements.ts`).
 */

type Point = readonly [number, number]
type Cadre = { x: number; y: number; l: number; h: number }
type Prise = { etat: 'en-cours' } | { etat: 'faite'; capture: Capture; image: string } | { etat: 'echec' }
type Avis = { texte: string; erreur?: boolean; reessayer?: () => void } | null

const SUR_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
const ROUGE = '#e5484d'
const DUREE_AVIS = 2600

async function versionCourante(): Promise<string> {
  if (import.meta.env.DEV) {
    const lue = await fetch('/__notak/version')
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null)
    if (lue) return lue
  }
  return (import.meta.env.VITE_NOTAK_COMMIT as string | undefined) ?? 'inconnue'
}

/** L'image envoyée : la capture, les traits par-dessus, puis le recadrage. */
function composer(capture: Capture, traits: readonly Point[][], cadre: Cadre | null): string {
  const k = capture.canevas.width / capture.largeur
  const plein = document.createElement('canvas')
  plein.width = capture.canevas.width
  plein.height = capture.canevas.height
  const ctx = plein.getContext('2d')!
  ctx.drawImage(capture.canevas, 0, 0)
  ctx.strokeStyle = ROUGE
  ctx.lineWidth = 4 * k
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const trait of traits) {
    ctx.beginPath()
    trait.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * k, y * k) : ctx.lineTo(x * k, y * k)))
    ctx.stroke()
  }
  if (!cadre || cadre.l < 8 || cadre.h < 8) return plein.toDataURL('image/png')
  const coupe = document.createElement('canvas')
  coupe.width = Math.round(cadre.l * k)
  coupe.height = Math.round(cadre.h * k)
  coupe.getContext('2d')!.drawImage(plein, cadre.x * k, cadre.y * k, coupe.width, coupe.height, 0, 0, coupe.width, coupe.height)
  return coupe.toDataURL('image/png')
}

const chemin = (trait: readonly Point[]) => trait.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')

function normaliser(a: Point, b: Point): Cadre {
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), l: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) }
}

interface ProprietesFenetre {
  prise: Prise
  texteInitial: string
  sombre: boolean
  envoyer: (texte: string, image: string | null) => void
  fermer: () => void
}

function FenetreSignaler({ prise, texteInitial, sombre, envoyer, fermer }: ProprietesFenetre) {
  const [texte, setTexte] = useState(texteInitial)
  const [outil, setOutil] = useState<'stylo' | 'recadrer'>('stylo')
  const [traits, setTraits] = useState<Point[][]>([])
  const [cadre, setCadre] = useState<Cadre | null>(null)
  const geste = useRef<{ depart: Point } | null>(null)
  const surface = useRef<SVGSVGElement>(null)
  const champ = useRef<HTMLTextAreaElement>(null)
  const racine = useRef<HTMLDivElement>(null)
  const capture = prise.etat === 'faite' ? prise.capture : null

  useEffect(() => setTexte(texteInitial), [texteInitial])
  // Le champ prend la main une fois l'écran pris : avant, un changement de focus aurait changé ce qu'on photographie.
  useLayoutEffect(() => {
    if (prise.etat === 'en-cours') return
    const c = champ.current
    c?.focus()
    c?.setSelectionRange(c.value.length, c.value.length)
  }, [prise.etat])

  const valider = () => {
    if (prise.etat === 'en-cours') return
    envoyer(texte, capture ? composer(capture, traits, cadre) : null)
  }

  // Les touches restent dans la fenêtre : la toile et ses raccourcis, dessous, ne les voient pas.
  useEffect(() => {
    const el = racine.current
    if (!el) return
    const touche = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        fermer()
      } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault()
        valider()
      } else if ((SUR_MAC ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'z' && document.activeElement !== champ.current) {
        e.preventDefault()
        if (cadre) setCadre(null)
        else setTraits((ts) => ts.slice(0, -1))
      }
    }
    el.addEventListener('keydown', touche)
    return () => el.removeEventListener('keydown', touche)
  })

  const pointDe = (e: PointeurReact): Point => {
    const r = surface.current!.getBoundingClientRect()
    const k = capture!.largeur / r.width
    return [Math.max(0, Math.min(capture!.largeur, (e.clientX - r.left) * k)), Math.max(0, Math.min(capture!.hauteur, (e.clientY - r.top) * k))]
  }
  const appui = (e: PointeurReact) => {
    if (!capture || e.button !== 0) return
    e.preventDefault()
    surface.current!.setPointerCapture(e.pointerId)
    const p = pointDe(e)
    geste.current = { depart: p }
    if (outil === 'stylo') setTraits((ts) => [...ts, [p]])
    else setCadre({ x: p[0], y: p[1], l: 0, h: 0 })
  }
  const glisse = (e: PointeurReact) => {
    if (!geste.current) return
    const p = pointDe(e)
    if (outil === 'stylo') setTraits((ts) => [...ts.slice(0, -1), [...ts[ts.length - 1]!, p]])
    else setCadre(normaliser(geste.current.depart, p))
  }
  const relache = () => {
    geste.current = null
    if (outil === 'recadrer') setCadre((c) => (c && (c.l < 8 || c.h < 8) ? null : c))
    champ.current?.focus()
  }

  return (
    <div className="notak-signaler" data-theme={sombre ? 'sombre' : undefined} ref={racine} onPointerDown={(e) => e.target === e.currentTarget && fermer()}>
      <div className="notak-signaler-fenetre" role="dialog" aria-modal="true" aria-label={t('signaler.titre')}>
        <div className="notak-signaler-entete">
          <span className="notak-signaler-titre">{t('signaler.titre')}</span>
          <div className="notak-signaler-outils" role="toolbar">
            <button type="button" aria-pressed={outil === 'stylo'} onClick={() => setOutil('stylo')} disabled={!capture}>
              {t('signaler.annoter')}
            </button>
            <button type="button" aria-pressed={outil === 'recadrer'} onClick={() => setOutil('recadrer')} disabled={!capture}>
              {t('signaler.recadrer')}
            </button>
            <button type="button" onClick={() => (setTraits([]), setCadre(null))} disabled={traits.length === 0 && !cadre}>
              {t('signaler.effacer')}
            </button>
          </div>
          <button type="button" className="notak-signaler-fermer" aria-label={t('signaler.fermer')} onClick={fermer}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="notak-signaler-capture">
          {prise.etat === 'en-cours' && <div className="notak-signaler-attente">{t('signaler.prise')}</div>}
          {prise.etat === 'echec' && <div className="notak-signaler-attente">{t('signaler.priseEchec')}</div>}
          {prise.etat === 'faite' && (
            <div className="notak-signaler-image">
              <img src={prise.image} alt="" draggable={false} />
              <svg
                ref={surface}
                viewBox={`0 0 ${prise.capture.largeur} ${prise.capture.hauteur}`}
                data-outil={outil}
                onPointerDown={appui}
                onPointerMove={glisse}
                onPointerUp={relache}
                onPointerCancel={relache}
              >
                {cadre && (
                  <path
                    className="notak-signaler-voile"
                    fillRule="evenodd"
                    d={`M0 0H${prise.capture.largeur}V${prise.capture.hauteur}H0Z M${cadre.x} ${cadre.y}h${cadre.l}v${cadre.h}h${-cadre.l}Z`}
                  />
                )}
                {cadre && <rect className="notak-signaler-cadre" x={cadre.x} y={cadre.y} width={cadre.l} height={cadre.h} />}
                {traits.map((tr, i) => (
                  <path key={i} d={chemin(tr)} className="notak-signaler-trait" />
                ))}
              </svg>
            </div>
          )}
        </div>
        <textarea
          ref={champ}
          className="notak-signaler-champ"
          rows={2}
          placeholder={t('signaler.indication')}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
        />
        <div className="notak-signaler-pied">
          <span>{t('signaler.aide')}</span>
          <button type="button" className="notak-signaler-envoyer" onClick={valider} disabled={prise.etat === 'en-cours'}>
            {t('signaler.envoyer')}
          </button>
        </div>
      </div>
    </div>
  )
}

function AvisSignaler({ avis }: { avis: Avis }) {
  if (!avis) return null
  return (
    <div className="notak-signaler-avis" role="status" data-erreur={avis.erreur || undefined}>
      {avis.texte}
      {avis.reessayer && (
        <button type="button" onClick={avis.reessayer}>
          {t('signaler.reessayer')}
        </button>
      )}
    </div>
  )
}

/**
 * Branche le raccourci sur toute la page, une fois. La fenêtre vit dans sa propre racine React, hors de l'application
 * (et hors de la capture, `data-hors-capture`) : elle passe par-dessus la toile, les documents, le Pitch et les panneaux.
 */
export function brancherSignaler(): void {
  poserJournal()
  const hote = document.createElement('div')
  hote.setAttribute('data-hors-capture', '')
  document.body.appendChild(hote)
  const racine = createRoot(hote)

  let ouverte = false
  let avis: Avis = null
  let minuterie: ReturnType<typeof setTimeout> | undefined
  let fenetre: ProprietesFenetre | null = null

  const rendre = () =>
    racine.render(
      <>
        {fenetre && <FenetreSignaler {...fenetre} />}
        <AvisSignaler avis={avis} />
      </>,
    )
  const montrerAvis = (a: Avis, duree = DUREE_AVIS) => {
    clearTimeout(minuterie)
    avis = a
    rendre()
    if (a && duree > 0) minuterie = setTimeout(() => ((avis = null), rendre()), duree)
  }

  const poster = async (corps: { texte: string; contexte: string; capture: string | null }) => {
    montrerAvis({ texte: t('signaler.envoi') }, 0)
    try {
      const r = await fetch('/api/signalements', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corps),
      })
      if (!r.ok) throw new Error(r.status === 404 ? t('signaler.ferme') : `${r.status}`)
      montrerAvis({ texte: t('signaler.envoye') })
    } catch (e) {
      montrerAvis({ texte: `${t('signaler.echec')} (${(e as Error).message})`, erreur: true, reessayer: () => void poster(corps) }, 10_000)
    }
  }

  const ouvrir = async () => {
    ouverte = true
    const avant = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Relevé avant tout geste de notre part : la sélection, le focus, l'élément en édition sont ceux qu'on voyait.
    const versionP = versionCourante()
    const releve = releverContexte('', erreursRecentes())
    const sombre = document.querySelector('.notak-espace')?.getAttribute('data-theme') === 'sombre'
    // Ce qu'on tape pendant la prise de vue rejoint le champ, au lieu de partir dans la page dessous.
    let tampon = ''
    const pendantLaPrise = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.key === 'Escape') return fermer()
      if (e.key === 'Backspace') tampon = tampon.slice(0, -1)
      else if (e.key.length === 1) tampon += e.key
      else return
      if (fenetre) ((fenetre = { ...fenetre, texteInitial: tampon }), rendre())
    }
    window.addEventListener('keydown', pendantLaPrise, true)

    const fermer = () => {
      window.removeEventListener('keydown', pendantLaPrise, true)
      fenetre = null
      ouverte = false
      rendre()
      if (avant?.isConnected) avant.focus({ preventScroll: true })
    }
    const envoyer = (texte: string, image: string | null) => {
      fermer()
      void versionP.then((version) => poster({ texte, contexte: contexteEnMarkdown({ ...releve, version }), capture: image }))
    }
    fenetre = { prise: { etat: 'en-cours' }, texteInitial: '', sombre, envoyer, fermer }
    rendre()

    let prise: Prise
    try {
      const capture = await capturerEcran()
      prise = { etat: 'faite', capture, image: capture.canevas.toDataURL('image/png') }
    } catch (e) {
      console.warn('Notak : capture du signalement impossible', e)
      prise = { etat: 'echec' }
    }
    window.removeEventListener('keydown', pendantLaPrise, true)
    if (!fenetre) return
    fenetre = { ...fenetre, prise, texteInitial: tampon }
    rendre()
  }

  window.addEventListener(
    'keydown',
    (e) => {
      if (!estLeRaccourci(e, SUR_MAC)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (!ouverte) void ouvrir()
    },
    true,
  )
}
