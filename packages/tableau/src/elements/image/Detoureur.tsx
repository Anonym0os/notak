import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Id, Image } from '../../coeur/tableau'
import { commencerEnvoi } from '../envois'
import type { ContexteToile } from '../types'
import { TOLERANCE_DEFAUT, TOLERANCE_MAX, avecDetourage, detourer } from './detourage'
import { miseEnPage, proportionsAffichees } from './geometrie'
import { t } from '../../langue'

/** L'image dont on règle le détourage, une seule à la fois. */
let ouvert: Id | null = null
const ecouteurs = new Set<() => void>()

export function detourerImage(id: Id | null) {
  if (ouvert === id) return
  ouvert = id
  for (const f of ecouteurs) f()
}
const ecouter = (f: () => void) => {
  ecouteurs.add(f)
  return () => ecouteurs.delete(f)
}
export const useDetourageOuvert = () => useSyncExternalStore(ecouter, () => ouvert)

/** Le côté le plus long de l'aperçu : assez pour juger le contour, assez court pour suivre le curseur. */
const COTE_APERCU = 480
/** Le côté le plus long du PNG qu'on envoie : au-delà, l'image est réduite. */
const COTE_MAX = 4096

/** Le fichier dessiné dans un canevas, réduit pour que son plus long côté ne dépasse pas `cote`. */
async function dessiner(adresse: string, cote: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(await (await fetch(adresse)).blob())
  const k = Math.min(1, cote / Math.max(bitmap.width, bitmap.height))
  const canevas = document.createElement('canvas')
  canevas.width = Math.max(1, Math.round(bitmap.width * k))
  canevas.height = Math.max(1, Math.round(bitmap.height * k))
  canevas.getContext('2d', { willReadFrequently: true })!.drawImage(bitmap, 0, 0, canevas.width, canevas.height)
  bitmap.close()
  return canevas
}

const lirePixels = (c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, c.width, c.height)

/**
 * L'image montrée sur un damier, son fond déjà retiré, avec un curseur de tolérance. Entrée valide, Échap annule.
 * Le fichier de départ est l'original quand l'image a déjà été détourée : on règle toujours depuis la photo.
 */
export function Detoureur({ id, contenu, adresse, contexte }: { id: Id; contenu: Image; adresse: string; contexte: ContexteToile }) {
  const [tolerance, setTolerance] = useState(TOLERANCE_DEFAUT)
  const [source, setSource] = useState<ImageData | null | undefined>(undefined)
  const [travail, setTravail] = useState(false)
  const [echec, setEchec] = useState(false)
  const toile = useRef<HTMLCanvasElement>(null)
  const depot = contexte.services.fichiers
  const page = miseEnPage(contenu, true)

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

  useEffect(() => {
    if (!adresseSource) return void (adresseSource === null && setSource(null))
    let vivant = true
    setSource(undefined)
    dessiner(adresseSource, COTE_APERCU).then(
      (c) => vivant && setSource(lirePixels(c)),
      () => vivant && setSource(null),
    )
    return () => {
      vivant = false
    }
  }, [adresseSource])

  const resultat = useMemo(() => (source ? detourer(source, tolerance) : null), [source, tolerance])
  useEffect(() => {
    const c = toile.current
    if (!c || !source || !resultat) return
    c.width = source.width
    c.height = source.height
    c.getContext('2d')!.putImageData(new ImageData(resultat.data, source.width, source.height), 0, 0)
  }, [source, resultat])

  const valider = async () => {
    if (!depot || !adresseSource || travail) return
    setTravail(true)
    setEchec(false)
    try {
      const plein = await dessiner(adresseSource, COTE_MAX)
      const pixels = lirePixels(plein)
      plein.getContext('2d')!.putImageData(new ImageData(detourer(pixels, tolerance).data, plein.width, plein.height), 0, 0)
      const png = await new Promise<Blob | null>((fin) => plein.toBlob(fin, 'image/png'))
      if (!png) throw new Error('PNG')
      const fichier = commencerEnvoi(png, depot)
      const apres = avecDetourage(contenu, fichier, { largeur: plein.width, hauteur: plein.height })
      contexte.magasin.faire([{ type: 'contenu', id, avant: contenu, apres }])
      detourerImage(null)
    } catch {
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
      if (e.key === 'Enter' && (e.target as HTMLElement | null)?.closest('button')) return
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Enter') void valide.current()
      else detourerImage(null)
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [])

  return (
    <div className="notak-recadreur notak-detoureur" onPointerDown={(e) => e.stopPropagation()}>
      <div className="notak-image-cadre notak-damier" style={{ aspectRatio: String(proportionsAffichees(contenu, true)) }}>
        <div className="notak-image-plan" style={page.plan}>
          {source === null ? (
            <div className="notak-image notak-image-vide">
              <span>{t('detourage.illisible')}</span>
            </div>
          ) : (
            <canvas ref={toile} className="notak-image" style={page.image} />
          )}
        </div>
        {source === undefined && <span className="notak-roue" role="status" aria-label={t('detourage.lecture')} />}
      </div>
      <label className="notak-detoureur-reglage">
        <span>{t('detourage.tolerance')}</span>
        <input
          type="range"
          min={0}
          max={TOLERANCE_MAX}
          value={tolerance}
          aria-label={t('detourage.toleranceDetail')}
          onChange={(e) => setTolerance(Number(e.target.value))}
        />
        <output>{tolerance}</output>
      </label>
      {resultat && resultat.retires === 0 && <p className="notak-detoureur-note">{t('detourage.rien')}</p>}
      {echec && <p className="notak-detoureur-note">{t('detourage.impossible')}</p>}
      <div className="notak-recadreur-actions">
        <button type="button" disabled={!depot || !resultat || resultat.retires === 0 || travail} onClick={() => void valider()}>
          {travail ? t('detourage.encours') : t('recadreur.valider')}
        </button>
        <button type="button" onClick={() => detourerImage(null)}>
          {t('commun.annuler')}
        </button>
      </div>
    </div>
  )
}
