import { useEffect, useState } from 'react'

/**
 * L'aperçu d'un PDF : sa première page, dessinée ici avec pdf.js (Apache-2.0), sans service d'aperçu. Le moteur et son
 * travailleur ne se chargent qu'à la première page à dessiner. Chez Milanote le serveur fabrique l'aperçu et dit
 * « Processing » en attendant ; ici le dessin tient lieu de fabrication, et la carte dit la même chose le temps qu'il dure.
 */

/** Au-delà, l'aperçu est tenu pour manqué (une minute, comme chez Milanote). */
export const DELAI_APERCU_MS = 60_000
/** La largeur du dessin, en pixels : de quoi rester net sur une carte large à l'écran dense. */
const LARGEUR_DESSIN = 720

const dessins = new Map<string, Promise<string | null>>()

async function moteur() {
  const [pdfjs, travailleur] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = travailleur.default
  return pdfjs
}

async function dessiner(adresse: string): Promise<string | null> {
  const [pdfjs, octets] = await Promise.all([moteur(), fetch(adresse).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))])
  const document = await pdfjs.getDocument({ data: new Uint8Array(octets) }).promise
  try {
    const page = await document.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: LARGEUR_DESSIN / base.width })
    const canvas = window.document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    const blob = await new Promise<Blob | null>((fini) => canvas.toBlob(fini, 'image/jpeg', 0.85))
    return blob ? URL.createObjectURL(blob) : null
  } finally {
    void document.destroy()
  }
}

/** La première page de ce PDF, en adresse d'image ; `null` s'il ne se lit pas ou si le dessin traîne trop. Gardée par adresse. */
export function premierePage(adresse: string, delai = DELAI_APERCU_MS): Promise<string | null> {
  let p = dessins.get(adresse)
  if (!p) {
    const limite = new Promise<null>((fini) => setTimeout(() => fini(null), delai))
    p = Promise.race([dessiner(adresse).catch(() => null), limite])
    dessins.set(adresse, p)
  }
  return p
}

export type ApercuPdf = { etat: 'prepare' } | { etat: 'pret'; adresse: string } | { etat: 'manque' }

/**
 * L'aperçu d'un PDF pour une carte : « prepare » le temps du dessin, puis « pret » avec l'image, ou « manque ».
 * Quand l'adresse change (la copie locale cède la place au fichier envoyé), l'image déjà dessinée reste jusqu'à la suivante.
 */
export function useApercuPdf(adresse: string | null | undefined, actif: boolean): ApercuPdf {
  const [etat, setEtat] = useState<ApercuPdf>({ etat: 'prepare' })
  useEffect(() => {
    if (!actif || !adresse) return
    let vivant = true
    void premierePage(adresse).then((a) => vivant && setEtat((avant) => (a ? { etat: 'pret', adresse: a } : avant.etat === 'pret' ? avant : { etat: 'manque' })))
    return () => {
      vivant = false
    }
  }, [adresse, actif])
  return actif && adresse === null ? { etat: 'manque' } : etat
}
