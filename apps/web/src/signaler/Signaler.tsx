import { Icone, Infobulle, type NomIcone, auDoigt, capturerEcran, enFeuille } from '@notak/tableau'
import { type PointerEvent as PointeurReact, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { estMobile, vibrer } from '../appareil'
import { octetsDe } from '../bureau'
import { t } from '../langue'
import { contexteEnMarkdown, estLeRaccourci, releverContexte } from './contexte'
import { EVENEMENT_SIGNALER, type Geste, gesteRetenu } from './geste'
import { erreursRecentes, poserJournal } from './journal'
import {
  type Cadre,
  type Marque,
  type Outil,
  type Point,
  cadreEntre,
  cadreUtile,
  commencer,
  ellipseDe,
  EPAISSEUR_ECRAN,
  geometrieDeFleche,
  marqueUtile,
  peindreMarques,
  prolonger,
} from './marques'
import './signaler.css'

/**
 * Signaler un bug, par-dessus tout (⇧⌘S) : l'écran est pris tout de suite, on y pose un trait, une flèche ou un
 * cercle, on le recadre, on colle d'autres images (⌘V), on écrit deux mots, Entrée envoie. La fenêtre se ferme aussitôt et l'envoi se fait
 * derrière : on reprend là où on était, le focus compris. Le serveur range le signalement dans sa file
 * (`apps/serveur/src/signalements.ts`).
 *
 * L'écran : dans les coques (Notak de bureau sur macOS, l'app d'iPhone et d'iPad), la coque photographie la page
 * peinte (`capturer_fenetre`, au pixel près) avant que la fenêtre ne paraisse ; ailleurs, la fenêtre paraît d'abord,
 * puis la page est recopiée (`capturerEcran`), ce qui prend une à plusieurs secondes et déforme ce que le moteur rend
 * mal (les ombres des îlots devenaient des rectangles gris).
 *
 * Au doigt, rien ne parle de touches : pas de ⌘V ni d'Entrée, un bouton pour ajouter une image et un autre pour défaire
 * le dernier trait ; Entrée va à la ligne. Sur un téléphone, la fenêtre est une feuille plein écran comme celles
 * d'iOS : Annuler et Envoyer en haut, l'image au milieu, les outils dessous, le champ au-dessus du clavier.
 *
 * Dans l'app d'iPhone et d'iPad, elle s'ouvre aussi d'un geste : secouer l'appareil, ou faire une capture d'écran
 * (`geste.ts`), sur un serveur qui reçoit les signalements. Au doigt, elle est persistante : un toucher à côté ne la
 * ferme pas (la vignette de la capture d'iOS s'y pose, et on la balaie), seuls Annuler et Envoyer la ferment.
 */

/** Une image du signalement : sa taille en px d'écran (le canevas est plus grand de sa densité) et ses marques. */
interface Image {
  id: number
  canevas: HTMLCanvasElement
  largeur: number
  hauteur: number
  url: string
  marques: Marque[]
  /** Le cadre qu'on trace pour recadrer, tant qu'il n'est pas validé (Entrée) ; validé, l'image devient la zone gardée. */
  cadre: Cadre | null
  /** L'image d'avant le dernier recadrage, que ⌘Z rend ; « Effacer » remonte à l'image prise. */
  avant: Image | null
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
  const largeur = canevas.width / densite
  return { id: prochainId++, canevas, largeur, hauteur: canevas.height / densite, url: canevas.toDataURL('image/png'), marques: [], cadre: null, avant: null }
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

/** Qui photographie la page : la coque de bureau elle-même (macOS), ou son plugin `appareil` sur iOS (`takeSnapshot`). */
export const commandeDePhoto = (mobile: boolean): string => (mobile ? 'plugin:appareil|capturer_fenetre' : 'capturer_fenetre')

/** Les octets du PNG que rend le plugin d'iOS (`AppareilPlugin.swift`, `capturerFenetre`) : `{ png }`, en base64. */
export function octetsDePhotoMobile(reponse: unknown): Uint8Array {
  const png = (reponse as { png?: unknown } | null)?.png
  if (typeof png !== 'string' || png === '') throw new Error('photo vide')
  const binaire = atob(png)
  const octets = new Uint8Array(binaire.length)
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i)
  return octets
}

/** La photo de la fenêtre par la coque ; `null` hors de la coque, ou si elle ne sait pas (ancienne coque). */
async function photographierLaFenetre(): Promise<Image | null> {
  const coque = tauri()
  if (!coque) return null
  try {
    const mobile = estMobile()
    const reponse = await coque.invoke<unknown>(commandeDePhoto(mobile))
    // Sur le bureau, en `ArrayBuffer` par le canal de la coque, en tableau de nombres si la page est passée par
    // `postMessage` ; sur iOS, en base64 dans la réponse du plugin.
    const octets = mobile ? octetsDePhotoMobile(reponse) : octetsDe(reponse)
    const canevas = await canevasDe(new Blob([octets as Uint8Array<ArrayBuffer>], { type: 'image/png' }))
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

const densiteDe = (image: Image) => image.canevas.width / image.largeur

/** L'image et ses marques, peintes à la densité de l'image. */
function peindre(image: Image): HTMLCanvasElement {
  const plein = document.createElement('canvas')
  plein.width = image.canevas.width
  plein.height = image.canevas.height
  const ctx = plein.getContext('2d')!
  ctx.drawImage(image.canevas, 0, 0)
  const k = densiteDe(image)
  ctx.scale(k, k)
  peindreMarques(ctx, image.marques, ROUGE)
  return plein
}

function decouper(source: HTMLCanvasElement, cadre: Cadre, k: number): HTMLCanvasElement {
  const coupe = document.createElement('canvas')
  coupe.width = Math.round(cadre.l * k)
  coupe.height = Math.round(cadre.h * k)
  coupe.getContext('2d')!.drawImage(source, cadre.x * k, cadre.y * k, coupe.width, coupe.height, 0, 0, coupe.width, coupe.height)
  return coupe
}

/** L'image envoyée : celle qu'on voit, un cadre tracé mais pas encore validé compris. */
function composer(image: Image): string {
  const plein = peindre(image)
  return (cadreUtile(image.cadre) ? decouper(plein, image.cadre, densiteDe(image)) : plein).toDataURL('image/png')
}

/** Valide le recadrage : l'image devient la zone gardée, ses marques peintes dedans ; l'ancienne reste pour ⌘Z. */
function recadrer(image: Image): Image {
  if (!cadreUtile(image.cadre)) return { ...image, cadre: null }
  const k = densiteDe(image)
  const coupe = decouper(peindre(image), image.cadre, k)
  return { ...imageDe(coupe, k), id: image.id, avant: { ...image, cadre: null } }
}

/** ⌘Z : le cadre en cours, sinon la dernière marque, sinon le dernier recadrage. */
function defaire(image: Image): Image {
  if (image.cadre) return { ...image, cadre: null }
  if (image.marques.length > 0) return { ...image, marques: image.marques.slice(0, -1) }
  return image.avant ?? image
}

/** « Effacer » : l'image telle qu'elle a été prise ou collée. */
function effacer(image: Image): Image {
  let i = image
  while (i.avant) i = i.avant
  return { ...i, marques: [], cadre: null }
}

const retouchee = (i: Image) => i.marques.length > 0 || i.cadre !== null || i.avant !== null

const chemin = (points: readonly Point[]) => points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')

function MarqueSvg({ marque }: { marque: Marque }) {
  const { e } = marque
  if (marque.genre === 'stylo') return <path d={chemin(marque.points)} className="notak-signaler-trait" strokeWidth={e} />
  if (marque.genre === 'cercle') return <ellipse {...ellipseDe(marque.de, marque.vers)} className="notak-signaler-trait" strokeWidth={e} />
  const { tige, pointe } = geometrieDeFleche(marque.de, marque.vers, e)
  return (
    <g>
      <line x1={tige[0][0]} y1={tige[0][1]} x2={tige[1][0]} y2={tige[1][1]} className="notak-signaler-trait" strokeWidth={e} />
      <polygon points={pointe.map((p) => p.join(',')).join(' ')} className="notak-signaler-pointe" />
    </g>
  )
}

const OUTILS: { outil: Outil; libelle: string; icone: NomIcone }[] = [
  { outil: 'stylo', libelle: 'signaler.stylo', icone: 'menuCrayon' },
  { outil: 'fleche', libelle: 'signaler.fleche', icone: 'ligne' },
  { outil: 'cercle', libelle: 'signaler.entourer', icone: 'entourer' },
  { outil: 'recadrer', libelle: 'signaler.recadrer', icone: 'recadrer' },
]

/** Au doigt sur un téléphone (la règle des feuilles de la toile) ; suit la rotation de l'écran. */
const ecouterTaille = (f: () => void) => {
  window.addEventListener('resize', f)
  return () => window.removeEventListener('resize', f)
}
const useTelephone = () => useSyncExternalStore(ecouterTaille, enFeuille)

export interface ProprietesFenetre {
  prise: Prise
  texteInitial: string
  sombre: boolean
  envoyer: (texte: string, images: string[]) => void
  fermer: () => void
}

export function FenetreSignaler({ prise, texteInitial, sombre, envoyer, fermer }: ProprietesFenetre) {
  const [texte, setTexte] = useState(texteInitial)
  const [outil, setOutil] = useState<Outil>('stylo')
  const [images, setImages] = useState<Image[]>([])
  const [choisie, setChoisie] = useState(0)
  /** Au doigt, pas de clavier à supposer : ni raccourci affiché, ni Entrée qui envoie, ni clavier sorti d'office. */
  const [tactile] = useState(auDoigt)
  const telephone = useTelephone()
  const geste = useRef<{ depart: Point } | null>(null)
  /** Ce que ⌘Z défait : le champ garde le focus, mais si l'on vient de dessiner, c'est le dessin. */
  const dernier = useRef<'texte' | 'image'>('texte')
  const surface = useRef<SVGSVGElement>(null)
  const champ = useRef<HTMLTextAreaElement>(null)
  const racine = useRef<HTMLDivElement>(null)
  const choixFichier = useRef<HTMLInputElement>(null)
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
  // Au doigt, non : le clavier sortirait par-dessus l'image qu'on va annoter ; on touche le champ pour écrire.
  useLayoutEffect(() => {
    if (enCours || tactile) return
    const c = champ.current
    c?.focus()
    c?.setSelectionRange(c.value.length, c.value.length)
  }, [enCours])

  // À la souris, un clic à côté ferme la fenêtre tant qu'on n'y a rien fait ; après, seuls Échap et la croix la
  // ferment. Au doigt, jamais : la vignette qu'iOS pose après une capture d'écran se balaie à côté, et un toucher
  // manqué ne doit pas perdre le signalement.
  const retenue = tactile || texte.trim() !== '' || images.length > 1 || images.some(retouchee)
  const majImage = (maj: (i: Image) => Image) => {
    dernier.current = 'image'
    setImages((is) => is.map((i, n) => (n === choisie ? maj(i) : i)))
  }
  const enRecadrage = outil === 'recadrer' && cadreUtile(image?.cadre ?? null)
  const choisirOutil = (o: Outil) => {
    if (o !== 'recadrer') majImage((i) => ({ ...i, cadre: null }))
    setOutil(o)
  }
  const validerRecadrage = () => {
    majImage(recadrer)
    setOutil('stylo')
    if (!tactile) champ.current?.focus()
  }
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
      // Un cadre tracé prend Échap et Entrée pour lui : l'un l'abandonne, l'autre recadre.
      if (e.key === 'Escape') {
        e.preventDefault()
        if (image?.cadre) majImage((i) => ({ ...i, cadre: null }))
        else fermer()
        return
      }
      if (enCours) return
      const dedans = racine.current?.contains(e.target as Node) ?? false
      // Au doigt, la touche Retour du clavier de l'écran va à la ligne : on envoie par le bouton.
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && (enRecadrage || !tactile)) {
        e.preventDefault()
        if (enRecadrage) validerRecadrage()
        else valider()
      } else if ((SUR_MAC ? e.metaKey : e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && image && retouchee(image) && (dernier.current === 'image' || e.target !== champ.current)) {
        e.preventDefault()
        majImage(defaire)
      } else if (!dedans) champ.current?.focus()
    }
    window.addEventListener('keydown', touche, true)
    return () => window.removeEventListener('keydown', touche, true)
  })

  /** Des images de plus, collées ou choisies (une capture d'écran faite à côté, une photo) : jusqu'à `IMAGES_MAX`. */
  const ajouterImages = (fichiers: readonly (Blob | null)[]) => {
    for (const f of fichiers) {
      if (!f) continue
      void canevasDe(f)
        .then((canevas) => {
          const n = nombre.current
          if (n >= IMAGES_MAX) return
          nombre.current = n + 1
          setImages((is) => [...is, imageDe(canevas, 1)])
          setChoisie(n)
        })
        .catch((e) => console.warn('Notak : image illisible pour le signalement', e))
    }
  }

  // ⌘V : une image du presse-papiers devient une image de plus. `ajouterImages` ne lit que des références et des
  // setters : celle du premier rendu suffit.
  useEffect(() => {
    const coller = (e: ClipboardEvent) => {
      const fichiers = [...(e.clipboardData?.items ?? [])].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile())
      if (fichiers.length === 0) return
      e.preventDefault()
      e.stopImmediatePropagation()
      ajouterImages(fichiers)
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
    // Au doigt, dessiner range le clavier de l'écran : il cachait le bas de l'image.
    if (tactile) champ.current?.blur()
    surface.current!.setPointerCapture(e.pointerId)
    const p = pointDe(e)
    geste.current = { depart: p }
    if (outil === 'recadrer') majImage((i) => ({ ...i, cadre: { x: p[0], y: p[1], l: 0, h: 0 } }))
    else {
      const e = (EPAISSEUR_ECRAN * image.largeur) / surface.current!.getBoundingClientRect().width
      majImage((i) => ({ ...i, marques: [...i.marques, commencer(outil, p, e)] }))
    }
  }
  const glisse = (e: PointeurReact) => {
    const depart = geste.current?.depart
    if (!depart) return
    const p = pointDe(e)
    if (outil === 'recadrer') majImage((i) => ({ ...i, cadre: cadreEntre(depart, p) }))
    else majImage((i) => ({ ...i, marques: [...i.marques.slice(0, -1), prolonger(i.marques[i.marques.length - 1]!, p)] }))
  }
  const relache = () => {
    if (!geste.current) return
    geste.current = null
    if (outil === 'recadrer') majImage((i) => (cadreUtile(i.cadre) ? i : { ...i, cadre: null }))
    else majImage((i) => (i.marques.length > 0 && !marqueUtile(i.marques[i.marques.length - 1]!) ? { ...i, marques: i.marques.slice(0, -1) } : i))
    if (!tactile) champ.current?.focus()
  }

  const boutonEnvoyer = (
    <button type="button" className="notak-signaler-envoyer" onClick={valider} disabled={enCours}>
      {t('signaler.envoyer')}
    </button>
  )
  // Au téléphone, chaque outil a son icône au-dessus de son nom, comme une barre d'iOS ; et la flèche qui défait le
  // dernier trait remplace « Effacer » : sans ⌘Z, c'est le geste qui manque, et on efface tout en le répétant.
  const outils = (
    <div className="notak-signaler-outils" role="toolbar">
      {OUTILS.map((o) => (
        <button key={o.outil} type="button" aria-pressed={outil === o.outil} onClick={() => choisirOutil(o.outil)} disabled={!image}>
          {telephone && <Icone nom={o.icone} taille={22} />}
          <span>{t(o.libelle)}</span>
        </button>
      ))}
      <span className="notak-signaler-separe" />
      {tactile && (
        <button type="button" className="notak-signaler-defaire" aria-label={t('signaler.defaire')} onClick={() => majImage(defaire)} disabled={!image || !retouchee(image)}>
          <Icone nom="annuler" taille={telephone ? 22 : 16} />
        </button>
      )}
      {!telephone && (
        <button type="button" onClick={() => majImage(effacer)} disabled={!image || !retouchee(image)}>
          {t('signaler.effacer')}
        </button>
      )}
    </div>
  )

  return (
    <div
      className="notak-signaler"
      data-theme={sombre ? 'sombre' : undefined}
      data-telephone={telephone || undefined}
      ref={racine}
      onPointerDown={(e) => e.target === e.currentTarget && !retenue && fermer()}
    >
      <div className="notak-signaler-fenetre" role="dialog" aria-modal="true" aria-label={t('signaler.titre')}>
        {telephone ? (
          <div className="notak-signaler-entete">
            <button type="button" className="notak-signaler-annuler" onClick={fermer}>
              {t('signaler.annuler')}
            </button>
            <span className="notak-signaler-titre">{t('signaler.titre')}</span>
            {boutonEnvoyer}
          </div>
        ) : (
          <div className="notak-signaler-entete">
            <span className="notak-signaler-titre">{t('signaler.titre')}</span>
            {outils}
            <button type="button" className="notak-signaler-fermer" aria-label={t('signaler.fermer')} onClick={fermer}>
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
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
                {image.marques.map((m, i) => (
                  <MarqueSvg key={i} marque={m} />
                ))}
              </svg>
              {enRecadrage && image.cadre && (
                // Sous le coin bas-droit du cadre, ou dedans quand il touche le bas : elle ne cache pas ce qu'on garde.
                <div
                  className="notak-signaler-recadrage"
                  style={{
                    left: `${((image.cadre.x + image.cadre.l) / image.largeur) * 100}%`,
                    top: `${((image.cadre.y + image.cadre.h) / image.hauteur) * 100}%`,
                    transform: image.cadre.y + image.cadre.h > image.hauteur * 0.85 ? 'translate(-100%, calc(-100% - 8px))' : 'translate(-100%, 8px)',
                  }}
                >
                  <button type="button" onClick={() => majImage((i) => ({ ...i, cadre: null }))}>
                    {t('signaler.recadrerAnnuler')}
                  </button>
                  <button type="button" className="notak-signaler-recadrage-ok" onClick={validerRecadrage}>
                    {t('signaler.recadrerOk')}
                    {!tactile && ' ↵'}
                  </button>
                </div>
              )}
            </div>
          )}
          {image && outil === 'recadrer' && !enRecadrage && <div className="notak-signaler-recadrage notak-signaler-recadrage-aide">{t('signaler.recadrerAide')}</div>}
        </div>
        {telephone && outils}
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
          {images.length < IMAGES_MAX && (
            <>
              {/* Sur iOS, le choix ouvre la photothèque (une capture d'écran faite avant), l'appareil photo ou Fichiers. */}
              <button type="button" className="notak-signaler-ajouter" onClick={() => choixFichier.current?.click()}>
                <Icone nom="ajouter" taille={telephone ? 18 : 14} />
                <span>{t('signaler.ajouterImage')}</span>
              </button>
              {!tactile && <span className="notak-signaler-coller">{t('signaler.coller', { touche: SUR_MAC ? '⌘V' : 'Ctrl+V' })}</span>}
            </>
          )}
          <input
            ref={choixFichier}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              ajouterImages([...(e.target.files ?? [])])
              e.target.value = ''
            }}
          />
        </div>
        <textarea
          ref={champ}
          className="notak-signaler-champ"
          rows={telephone ? 3 : 2}
          placeholder={t('signaler.indication')}
          value={texte}
          onChange={(e) => {
            dernier.current = 'texte'
            setTexte(e.target.value)
          }}
        />
        {!telephone && (
          <div className="notak-signaler-pied">
            {!tactile && <span>{t('signaler.aide')}</span>}
            {boutonEnvoyer}
          </div>
        )}
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

let reception: Promise<boolean> | null = null

/**
 * Le serveur reçoit-il les signalements (`/api/instance`) ? Un geste n'ouvre la fenêtre que là où l'envoi aboutira :
 * ailleurs, chaque capture d'écran ouvrirait pour rien. Demandé une fois ; redemandé si le réseau a manqué.
 */
export function recoitLesSignalements(): Promise<boolean> {
  reception ??= fetch('/api/instance', { credentials: 'same-origin' })
    .then((r) => (r.ok ? (r.json() as Promise<{ signalements?: unknown }>) : null))
    .then((instance) => instance?.signalements === true)
    .catch(() => {
      reception = null
      return false
    })
  return reception
}

/** Pour les essais : oublie la réponse du serveur. */
export const oublierReception = () => void (reception = null)

/** Ce qu'ouvre le bouton de l'en-tête ; posé par `brancherSignaler`. */
let ouvrirLaFenetre: (() => void) | null = null

/** La fenêtre de ⇧⌘S, ouverte d'ailleurs : le bouton de l'en-tête, ou la feuille « ••• » du téléphone. */
export const ouvrirSignaler = () => ouvrirLaFenetre?.()

/** Le petit insecte de l'en-tête, à côté de la cloche : la même fenêtre que ⇧⌘S. */
export function BoutonSignaler() {
  return (
    <Infobulle libelle={t('signaler.bouton')}>
      <button type="button" className="bouton bouton-nu" onClick={ouvrirSignaler}>
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

  const ouvrir = async (geste?: Geste) => {
    ouverte = true
    // Une secousse se sent : le retour au doigt dit qu'elle a été prise. La capture d'écran a déjà son flash.
    if (geste === 'secousse') vibrer()
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

    // La photo de la coque se prend avant que la fenêtre ne paraisse : elle la montrerait. Mais après que la page a
    // repeint ce qui l'a ouverte : sur iPhone, la feuille « ••• » vient d'être retirée, elle serait encore sur la photo.
    await apresPeinture()
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
  // Une secousse ou une capture d'écran, relayée par la coque d'iOS ; la fenêtre déjà ouverte n'en fait rien.
  window.addEventListener(EVENEMENT_SIGNALER, (e) => {
    const geste = (e as CustomEvent<Geste>).detail
    if (ouverte || !gesteRetenu(geste, document.activeElement)) return
    void recoitLesSignalements().then((oui) => {
      if (oui && !ouverte) void ouvrir(geste)
    })
  })
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
