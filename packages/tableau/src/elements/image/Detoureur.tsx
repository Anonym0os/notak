import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Id, Image } from '../../coeur/tableau'
import { commencerEnvoi } from '../envois'
import type { ContexteToile } from '../types'
import { TOLERANCE_DEFAUT, TOLERANCE_MAX, avecDetourage, cotesBornes, detourer } from './detourage'
import { TAILLE_MAX, miseEnPage, proportionsAffichees } from './geometrie'
import { adresseALargeur, palierPour } from './tailles'
import { Traits } from './Annotateur'
import { BarreOutil, useAmenerALaVue } from './barreOutil'
import { t } from '../../langue'

/** L'image dont on règle le détourage, une seule à la fois, et où revenir quand on le termine (la visionneuse). */
let ouvert: Id | null = null
let retour: (() => void) | undefined
const ecouteurs = new Set<() => void>()

/**
 * Ouvre le détourage de cette image, ou le ferme (`null`). `depuis.retour` : ce qui l'a ouvert, à rouvrir quand on
 * le termine soi-même (valider, annuler) ; pas quand il se ferme parce qu'on a choisi autre chose.
 */
export function detourerImage(id: Id | null, depuis?: { retour?: () => void }) {
  if (ouvert === id) return
  ouvert = id
  retour = id === null ? undefined : depuis?.retour
  for (const f of ecouteurs) f()
}
/** Valider ou annuler : le détourage se ferme, et l'on revient d'où on l'a ouvert. */
function terminer() {
  const revenir = retour
  detourerImage(null)
  revenir?.()
}
const ecouter = (f: () => void) => {
  ecouteurs.add(f)
  return () => ecouteurs.delete(f)
}
export const useDetourageOuvert = () => useSyncExternalStore(ecouter, () => ouvert)

/** Le côté le plus long de l'aperçu : assez pour juger le contour, assez court pour suivre le curseur. */
const COTE_APERCU = 480
/** Un PNG trop lourd pour le dépôt est refait plus petit, au plus tant de fois. */
const ESSAIS_REDUITS = 3

/**
 * Le fichier dessiné dans un canevas aux côtés que `cotes` donne pour les siens. Le navigateur est prié de le décoder
 * déjà réduit (`resizeWidth`) : une photo de 48 Mpx décodée en entier pèse 200 Mo, et un iPad lâche la page.
 */
async function dessiner(adresse: string, cotes: (largeur: number, hauteur: number) => { largeur: number; hauteur: number }, connues?: { largeur: number; hauteur: number }): Promise<HTMLCanvasElement> {
  const fichier = await (await fetch(adresse)).blob()
  const voulues = connues && cotes(connues.largeur, connues.hauteur)
  let bitmap: ImageBitmap
  try {
    // La seule largeur : la hauteur suit les proportions du fichier, même si celles qu'on croyait connaître mentent.
    bitmap = voulues && voulues.largeur < connues.largeur ? await createImageBitmap(fichier, { resizeWidth: voulues.largeur, resizeQuality: 'high' }) : await createImageBitmap(fichier)
  } catch {
    bitmap = await createImageBitmap(fichier)
  }
  const { largeur, hauteur } = cotes(bitmap.width, bitmap.height)
  const canevas = document.createElement('canvas')
  canevas.width = largeur
  canevas.height = hauteur
  const ctx = canevas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, largeur, hauteur)
  bitmap.close()
  return canevas
}

/** Le même canevas, réduit de `k`. */
function reduire(source: HTMLCanvasElement, k: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(source.width * k))
  c.height = Math.max(1, Math.round(source.height * k))
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, c.width, c.height)
  return c
}

const lirePixels = (c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
const enPng = (c: HTMLCanvasElement) => new Promise<Blob | null>((fin) => c.toBlob(fin, 'image/png'))
/**
 * Laisse la page se peindre (« Détourage… ») avant un calcul qui la tient. Une page cachée ne peint plus : le délai
 * borne l'attente, le détourage ne reste pas suspendu jusqu'au retour de l'onglet.
 */
const souffler = () =>
  new Promise<void>((fin) => {
    const borne = setTimeout(fin, 50)
    requestAnimationFrame(() => setTimeout(() => (clearTimeout(borne), fin()), 0))
  })

/**
 * L'image montrée sur un damier, son fond déjà retiré, avec un curseur de tolérance dans la barre du bas (hors du zoom,
 * au thème de la toile). Entrée valide, Échap annule. Le fichier de départ est l'original quand l'image a déjà été
 * détourée : on règle toujours depuis la photo. L'aperçu se lit sur une copie réduite que le serveur fabrique quand il
 * le peut : une très grande photo ne se télécharge pas en entier pour 480 px.
 */
export function Detoureur({ id, contenu, adresse, contexte }: { id: Id; contenu: Image; adresse: string; contexte: ContexteToile }) {
  const [tolerance, setTolerance] = useState(TOLERANCE_DEFAUT)
  const [source, setSource] = useState<ImageData | null | undefined>(undefined)
  const [travail, setTravail] = useState(false)
  const [echec, setEchec] = useState(false)
  const toile = useRef<HTMLCanvasElement>(null)
  const racine = useRef<HTMLDivElement>(null)
  // Fermé pendant le calcul (Échap, autre image choisie) : le résultat n'est pas posé après coup.
  const ferme = useRef(false)
  const depot = contexte.services.fichiers
  const page = miseEnPage(contenu, true)
  useAmenerALaVue(racine, contexte, true)
  useEffect(() => {
    // Remis à faux au montage : en développement, React démonte et remonte une fois pour voir.
    ferme.current = false
    return () => {
      ferme.current = true
    }
  }, [])

  // L'aperçu part de la photo d'avant le détourage, s'il y en a un.
  const [adresseSource, setAdresseSource] = useState<string | null | undefined>(contenu.original ? undefined : adresse)
  const original = contenu.original?.fichier
  useEffect(() => {
    if (!original) return setAdresseSource(adresse)
    let vivant = true
    if (!depot) return setAdresseSource(null)
    depot.adresse(original).then(
      (a) => vivant && setAdresseSource(a),
      () => vivant && setAdresseSource(null),
    )
    return () => {
      vivant = false
    }
  }, [original, adresse, depot])

  // Ce que l'on sait du fichier de départ sans le lire : ses côtés, son format (pour la copie réduite du serveur).
  const depart: Image = contenu.original ? { ...contenu, ...contenu.original } : contenu
  const connues = { largeur: depart.largeurOrigine, hauteur: depart.hauteurOrigine }
  const palierApercu = palierPour(depart, COTE_APERCU, 1)

  useEffect(() => {
    if (!adresseSource) return void (adresseSource === null && setSource(null))
    let vivant = true
    setSource(undefined)
    const apercu = (l: number, h: number) => cotesBornes(l, h, COTE_APERCU, Number.POSITIVE_INFINITY)
    dessiner(adresseALargeur(adresseSource, palierApercu), apercu, connues)
      // La copie réduite manque (un serveur qui ne la fait pas) : l'original fera l'aperçu.
      .catch(() => dessiner(adresseSource, apercu, connues))
      .then(
        (c) => vivant && setSource(lirePixels(c)),
        () => vivant && setSource(null),
      )
    return () => {
      vivant = false
    }
    // Les côtés connus ne changent qu'avec le fichier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adresseSource, palierApercu])

  const resultat = useMemo(() => (source ? detourer(source, tolerance) : null), [source, tolerance])
  useEffect(() => {
    const c = toile.current
    if (!c || !source || !resultat) return
    c.width = source.width
    c.height = source.height
    c.getContext('2d')!.putImageData(new ImageData(resultat.data, source.width, source.height), 0, 0)
  }, [source, resultat])

  const valider = async () => {
    if (!depot || !adresseSource || travail || !resultat || resultat.retires === 0) return
    setTravail(true)
    setEchec(false)
    try {
      await souffler()
      let plein = await dessiner(adresseSource, (l, h) => cotesBornes(l, h), connues)
      if (ferme.current) return
      const pixels = lirePixels(plein)
      plein.getContext('2d')!.putImageData(new ImageData(detourer(pixels, tolerance).data, plein.width, plein.height), 0, 0)
      let png = await enPng(plein)
      // Au-delà de ce qu'un fichier peut peser, le dépôt le refuserait et l'image resterait cassée : plus petit.
      for (let essai = 0; png && png.size > TAILLE_MAX && essai < ESSAIS_REDUITS; essai++) {
        plein = reduire(plein, Math.sqrt(TAILLE_MAX / png.size) * 0.9)
        png = await enPng(plein)
      }
      if (!png || png.size > TAILLE_MAX) throw new Error('PNG')
      if (ferme.current) return
      const fichier = commencerEnvoi(png, depot)
      const apres = avecDetourage(contenu, fichier, { largeur: plein.width, hauteur: plein.height })
      contexte.magasin.faire([{ type: 'contenu', id, avant: contenu, apres }])
      terminer()
    } catch {
      if (ferme.current) return
      setTravail(false)
      setEchec(true)
    }
  }
  const valide = useRef(valider)
  valide.current = valider

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return
      // Dans le curseur, Entrée valide aussi ; ailleurs (un bouton) on laisse faire le bouton.
      if (e.key === 'Enter' && (e.target as HTMLElement | null)?.closest?.('button')) return
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Enter') void valide.current()
      else terminer()
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [])

  const note = echec ? t('detourage.impossible') : resultat && resultat.retires === 0 ? t('detourage.rien') : null
  return (
    <div ref={racine} className="notak-recadreur notak-detoureur" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="notak-image-cadre notak-damier" style={{ aspectRatio: String(proportionsAffichees(contenu, true)) }}>
        <div className="notak-image-plan" style={page.plan}>
          {source === null ? (
            <div className="notak-image notak-image-vide">
              <span>{t('detourage.illisible')}</span>
            </div>
          ) : (
            <canvas ref={toile} className="notak-image" style={page.image} />
          )}
          {contenu.traits && contenu.traits.length > 0 && <Traits contenu={contenu} traits={contenu.traits} style={page.image} />}
        </div>
        {(source === undefined || travail) && <span className="notak-roue" role="status" aria-label={t(travail ? 'detourage.encours' : 'detourage.lecture')} />}
      </div>
      <BarreOutil etiquette={t('image.detourer')} className="notak-outil-image-barre">
        {note && (
          <span className="notak-outil-image-note" role="status">
            {note}
          </span>
        )}
        <label className="notak-detoureur-reglage">
          <span>{t('detourage.tolerance')}</span>
          <input
            type="range"
            min={0}
            max={TOLERANCE_MAX}
            value={tolerance}
            disabled={travail}
            aria-label={t('detourage.toleranceDetail')}
            onChange={(e) => setTolerance(Number(e.target.value))}
          />
          <output>{tolerance}</output>
        </label>
        <span className="notak-croquis-espace" />
        <button type="button" className="notak-croquis-texte" title="Esc" onClick={terminer}>
          {t('commun.annuler')}
        </button>
        <button
          type="button"
          className="notak-croquis-texte notak-croquis-enregistrer"
          title="↵"
          disabled={!depot || !resultat || resultat.retires === 0 || travail}
          onClick={() => void valider()}
        >
          {travail ? t('detourage.encours') : t('recadreur.valider')}
        </button>
      </BarreOutil>
    </div>
  )
}
