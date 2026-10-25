import { Icone, Infobulle, capturerEcran } from '@notak/tableau'
import { type PointerEvent as PointeurReact, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { t } from '../langue'
import { contexteEnMarkdown, estLeRaccourci, releverContexte } from './contexte'
import { erreursRecentes, poserJournal } from './journal'
import './signaler.css'

/**
 * Signaler un bug, par-dessus tout (⇧⌘S) : l'écran est pris tout de suite, on l'annote au stylo ou on le recadre, on
 * colle d'autres images (⌘V), on écrit deux mots, Entrée envoie. La fenêtre se ferme aussitôt et l'envoi se fait
 * derrière : on reprend là où on était, le focus compris. Le serveur range le signalement dans sa file
 * (`apps/serveur/src/signalements.ts`).
 *
 * L'écran : dans Notak de bureau, la coque photographie la page peinte (`capturer_fenetre`, au pixel près) avant que
 * la fenêtre ne paraisse ; ailleurs, la fenêtre paraît d'abord, puis la page est recopiée (`capturerEcran`), ce qui
 * prend une à plusieurs secondes et déforme ce que le moteur rend mal.
 */

type Point = readonly [number, number]
type Cadre = { x: number; y: number; l: number; h: number }
/** Une image du signalement : sa taille en px d'écran (le canevas est plus grand de sa densité), ses traits, son cadre. */
interface Image {
  id: number
  canevas: HTMLCanvasElement
  largeur: number
  hauteur: number
  url: string
  traits: Point[][]
  cadre: Cadre | null
}
type Prise = { etat: 'en-cours' } | { etat: 'faite'; image: Image | null }
type Avis = { texte: string; erreur?: boolean; reessayer?: () => void } | null

const SUR_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
const ROUGE = '#e5484d'
const DUREE_AVIS = 2600
const IMAGES_MAX = 6
let prochainId = 1

interface Tauri {
  invoke<T>(commande: string, arguments_?: unknown): Promise<T>
}
const tauri = (): Tauri | undefined => (window as { __TAURI_INTERNALS__?: Tauri }).__TAURI_INTERNALS__

function imageDe(canevas: HTMLCanvasElement, densite: number): Image {
  return { id: prochainId++, canevas, largeur: canevas.width / densite, hauteur: canevas.height / densite, url: canevas.toDataURL('image/png'), traits: [], cadre: null }
}

async function canevasDe(source: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(source)
  const canevas = document.createElement('canvas')
  canevas.width = bitmap.width
  canevas.height = bitmap.height
  canevas.getContext('2d')!.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canevas
}

/** La photo de la fenêtre par la coque de bureau ; `null` hors de la coque, ou si elle ne sait pas (ancienne coque). */
async function photographierLaFenetre(): Promise<Image | null> {
  const coque = tauri()
  if (!coque) return null
  try {
    const octets = await coque.invoke<ArrayBuffer>('capturer_fenetre')
    const canevas = await canevasDe(new Blob([octets], { type: 'image/png' }))
    return imageDe(canevas, canevas.width / window.innerWidth)
  } catch (e) {
    console.warn('Notak : photo de la fenêtre impossible, la page sera recopiée', e)
    return null
  }
}

async function recopierLaPage(): Promise<Image | null> {
  try {
    const capture = await capturerEcran()
    return imageDe(capture.canevas, capture.canevas.width / capture.largeur)
  } catch (e) {
    console.warn('Notak : capture du signalement impossible', e)
    return null
  }
}

/** Deux images peintes : la fenêtre est à l'écran avant qu'on ne bloque le fil pour recopier la page. */
const apresPeinture = () => new Promise<void>((fin) => requestAnimationFrame(() => requestAnimationFrame(() => fin())))

async function versionCourante(): Promise<string> {
  if (import.meta.env.DEV) {
    const lue = await fetch('/__notak/version')
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null)
    if (lue) return lue
  }
  return (import.meta.env.VITE_NOTAK_COMMIT as string | undefined) ?? 'inconnue'
}

/** L'image envoyée : l'image, les traits par-dessus, puis le recadrage. */
function composer(image: Image): string {
  const k = image.canevas.width / image.largeur
  const plein = document.createElement('canvas')
  plein.width = image.canevas.width
  plein.height = image.canevas.height
  const ctx = plein.getContext('2d')!
  ctx.drawImage(image.canevas, 0, 0)
  ctx.strokeStyle = ROUGE
  ctx.lineWidth = 4 * k
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const trait of image.traits) {
    ctx.beginPath()
    trait.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * k, y * k) : ctx.lineTo(x * k, y * k)))
    ctx.stroke()
  }
  const { cadre } = image
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
  envoyer: (texte: string, images: string[]) => void
  fermer: () => void
}

function FenetreSignaler({ prise, texteInitial, sombre, envoyer, fermer }: ProprietesFenetre) {
  const [texte, setTexte] = useState(texteInitial)
  const [outil, setOutil] = useState<'stylo' | 'recadrer'>('stylo')
  const [images, setImages] = useState<Image[]>([])
  const [choisie, setChoisie] = useState(0)
  const geste = useRef<{ depart: Point } | null>(null)
  const surface = useRef<SVGSVGElement>(null)
  const champ = useRef<HTMLTextAreaElement>(null)
  const racine = useRef<HTMLDivElement>(null)
  const enCours = prise.etat === 'en-cours'
  const image = images[choisie] ?? null
  const nombre = useRef(0)
  nombre.current = images.length

  useEffect(() => setTexte(texteInitial), [texteInitial])
  // L'écran pris passe en tête des images (on a pu en coller pendant la prise).
  useEffect(() => {
    if (prise.etat !== 'faite' || !prise.image) return
    const ecran = prise.image
    setImages((is) => (is.some((i) => i.id === ecran.id) ? is : [ecran, ...is]))
    setChoisie(0)
  }, [prise])
  // Le champ prend la main une fois l'écran pris : avant, un changement de focus aurait changé ce qu'on photographie.
  useLayoutEffect(() => {
    if (enCours) return
    const c = champ.current
    c?.focus()
    c?.setSelectionRange(c.value.length, c.value.length)
  }, [enCours])

  // Un clic à côté ferme la fenêtre tant qu'on n'y a rien fait ; après, seuls Échap et la croix la ferment.
  const entame = texte.trim() !== '' || images.length > 1 || images.some((i) => i.traits.length > 0 || i.cadre)
  const majImage = (maj: (i: Image) => Image) => setImages((is) => is.map((i, n) => (n === choisie ? maj(i) : i)))
  const valider = () => {
    if (enCours) return
    envoyer(texte, images.map(composer))
  }
  const retirer = (n: number) => {
    setImages((is) => is.filter((_, m) => m !== n))
    setChoisie((c) => Math.max(0, c > n || c === images.length - 1 ? c - 1 : c))
  }

  // Les touches, où qu'ait été le focus : tant que la fenêtre est ouverte, la page dessous n'en voit aucune. Une
  // lettre tapée hors du champ y revient (le focus est rendu au champ avant que la touche n'écrive).
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (estLeRaccourci(e, SUR_MAC)) return
      e.stopImmediatePropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        fermer()
        return
      }
      if (enCours) return
      const dedans = racine.current?.contains(e.target as Node) ?? false
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault()
        valider()
      } else if ((SUR_MAC ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'z' && e.target !== champ.current) {
        e.preventDefault()
        majImage((i) => (i.cadre ? { ...i, cadre: null } : { ...i, traits: i.traits.slice(0, -1) }))
      } else if (!dedans) champ.current?.focus()
    }
    window.addEventListener('keydown', touche, true)
    return () => window.removeEventListener('keydown', touche, true)
  })

  // ⌘V : une image du presse-papiers devient une image de plus (une capture d'écran faite à côté, un fichier copié).
  useEffect(() => {
    const coller = (e: ClipboardEvent) => {
      const fichiers = [...(e.clipboardData?.items ?? [])].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile())
      if (fichiers.length === 0) return
      e.preventDefault()
      e.stopImmediatePropagation()
      for (const f of fichiers) {
        if (!f) continue
        void canevasDe(f).then((canevas) => {
          const n = nombre.current
          if (n >= IMAGES_MAX) return
          nombre.current = n + 1
          setImages((is) => [...is, imageDe(canevas, 1)])
          setChoisie(n)
        })
      }
    }
    window.addEventListener('paste', coller, true)
    return () => window.removeEventListener('paste', coller, true)
  }, [])

  const pointDe = (e: PointeurReact): Point => {
    const r = surface.current!.getBoundingClientRect()
    const k = image!.largeur / r.width
    return [Math.max(0, Math.min(image!.largeur, (e.clientX - r.left) * k)), Math.max(0, Math.min(image!.hauteur, (e.clientY - r.top) * k))]
  }
  const appui = (e: PointeurReact) => {
    if (!image || e.button !== 0) return
    e.preventDefault()
    surface.current!.setPointerCapture(e.pointerId)
    const p = pointDe(e)
    geste.current = { depart: p }
    if (outil === 'stylo') majImage((i) => ({ ...i, traits: [...i.traits, [p]] }))
    else majImage((i) => ({ ...i, cadre: { x: p[0], y: p[1], l: 0, h: 0 } }))
  }
  const glisse = (e: PointeurReact) => {
    const depart = geste.current?.depart
    if (!depart) return
    const p = pointDe(e)
    if (outil === 'stylo') majImage((i) => ({ ...i, traits: [...i.traits.slice(0, -1), [...i.traits[i.traits.length - 1]!, p]] }))
    else majImage((i) => ({ ...i, cadre: normaliser(depart, p) }))
  }
  const relache = () => {
    geste.current = null
    if (outil === 'recadrer') majImage((i) => (i.cadre && (i.cadre.l < 8 || i.cadre.h < 8) ? { ...i, cadre: null } : i))
    champ.current?.focus()
  }

  return (
    <div className="notak-signaler" data-theme={sombre ? 'sombre' : undefined} ref={racine} onPointerDown={(e) => e.target === e.currentTarget && !entame && fermer()}>
      <div className="notak-signaler-fenetre" role="dialog" aria-modal="true" aria-label={t('signaler.titre')}>
        <div className="notak-signaler-entete">
          <span className="notak-signaler-titre">{t('signaler.titre')}</span>
          <div className="notak-signaler-outils" role="toolbar">
            <button type="button" aria-pressed={outil === 'stylo'} onClick={() => setOutil('stylo')} disabled={!image}>
              {t('signaler.annoter')}
            </button>
            <button type="button" aria-pressed={outil === 'recadrer'} onClick={() => setOutil('recadrer')} disabled={!image}>
              {t('signaler.recadrer')}
            </button>
            <button type="button" onClick={() => majImage((i) => ({ ...i, traits: [], cadre: null }))} disabled={!image || (image.traits.length === 0 && !image.cadre)}>
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
          {enCours && <div className="notak-signaler-attente">{t('signaler.prise')}</div>}
          {!enCours && !image && <div className="notak-signaler-attente">{t('signaler.sansImage')}</div>}
          {image && (
            <div className="notak-signaler-image">
              <img src={image.url} alt="" draggable={false} />
              <svg
                ref={surface}
                viewBox={`0 0 ${image.largeur} ${image.hauteur}`}
                data-outil={outil}
                onPointerDown={appui}
                onPointerMove={glisse}
                onPointerUp={relache}
                onPointerCancel={relache}
              >
                {image.cadre && (
                  <path
                    className="notak-signaler-voile"
                    fillRule="evenodd"
                    d={`M0 0H${image.largeur}V${image.hauteur}H0Z M${image.cadre.x} ${image.cadre.y}h${image.cadre.l}v${image.cadre.h}h${-image.cadre.l}Z`}
                  />
                )}
                {image.cadre && <rect className="notak-signaler-cadre" x={image.cadre.x} y={image.cadre.y} width={image.cadre.l} height={image.cadre.h} />}
                {image.traits.map((tr, i) => (
                  <path key={i} d={chemin(tr)} className="notak-signaler-trait" />
                ))}
              </svg>
            </div>
          )}
        </div>
        <div className="notak-signaler-vignettes">
          {images.map((i, n) => (
            <div key={i.id} className="notak-signaler-vignette" data-choisie={n === choisie || undefined}>
              <button type="button" className="notak-signaler-vignette-image" aria-label={t('signaler.voirImage', { n: n + 1 })} onClick={() => setChoisie(n)}>
                <img src={i.url} alt="" draggable={false} />
              </button>
              <button type="button" className="notak-signaler-vignette-retirer" aria-label={t('signaler.retirerImage', { n: n + 1 })} onClick={() => retirer(n)}>
                <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
          {images.length < IMAGES_MAX && <span className="notak-signaler-coller">{t('signaler.coller')}</span>}
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
          <button type="button" className="notak-signaler-envoyer" onClick={valider} disabled={enCours}>
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

/** Ce qu'ouvre le bouton de l'en-tête ; posé par `brancherSignaler`. */
let ouvrirLaFenetre: (() => void) | null = null

/** Le petit insecte de l'en-tête, à côté de la cloche : la même fenêtre que ⇧⌘S. */
export function BoutonSignaler() {
  return (
    <Infobulle libelle={t('signaler.bouton')}>
      <button type="button" className="bouton bouton-nu" onClick={() => ouvrirLaFenetre?.()}>
        <Icone nom="bug" taille={22} trait={1.5} />
        <span className="sr-seulement">{t('signaler.titre')}</span>
      </button>
    </Infobulle>
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

  const poster = async (corps: { texte: string; contexte: string; captures: string[] }) => {
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
    const version = versionCourante()
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
    const envoyer = (texte: string, captures: string[]) => {
      fermer()
      void version.then((v) => poster({ texte, contexte: contexteEnMarkdown({ ...releve, version: v }), captures }))
    }

    // La photo de la coque se prend avant que la fenêtre ne paraisse : elle la montrerait.
    const photo = await photographierLaFenetre()
    fenetre = { prise: photo ? { etat: 'faite', image: photo } : { etat: 'en-cours' }, texteInitial: tampon, sombre, envoyer, fermer }
    rendre()
    if (!photo) {
      await apresPeinture()
      const image = await recopierLaPage()
      if (fenetre) {
        fenetre = { ...fenetre, prise: { etat: 'faite', image }, texteInitial: tampon }
        rendre()
      }
    }
    window.removeEventListener('keydown', pendantLaPrise, true)
  }

  ouvrirLaFenetre = () => {
    if (!ouverte) void ouvrir()
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
