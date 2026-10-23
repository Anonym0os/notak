import { toJpeg, toPng } from 'html-to-image'
import { useEffect, useState } from 'react'
import { octetsDeDataUrl, pdfDepuisJpeg } from './pdf'

/** Ce que la capture laisse de côté : les pastilles et les curseurs posés sur la toile, pas le tableau. */
const HORS_CAPTURE = ['notak-echelle', 'notak-lecture', 'notak-lasso', 'notak-curseur']
const ECHELLE_CAPTURE = 2

function telecharger(blob: Blob, nom: string) {
  const adresse = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = adresse
  a.download = nom
  a.click()
  setTimeout(() => URL.revokeObjectURL(adresse), 10_000)
}

/** Un nom de fichier sûr à partir d'un titre. */
const nomDeFichier = (titre: string, extension: string) => `${titre.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim().slice(0, 100) || 'tableau'}.${extension}`

/**
 * Ce qu'on voit de la toile, en image (`png`) ou en page PDF (`pdf`). La capture se fait dans le navigateur, sur ce
 * qui est à l'écran : pour exporter tout le tableau, on le cadre d'abord.
 */
async function capturer(format: 'png' | 'pdf', titre: string): Promise<void> {
  const toile = document.querySelector<HTMLElement>('.notak-toile')
  if (!toile) throw new Error('Aucun tableau à exporter')
  const options = {
    pixelRatio: ECHELLE_CAPTURE,
    backgroundColor: getComputedStyle(toile).backgroundColor,
    filter: (n: Node) => !(n instanceof HTMLElement && HORS_CAPTURE.some((c) => n.classList.contains(c))),
  }
  if (format === 'png') {
    const adresse = await toPng(toile, options)
    telecharger(await (await fetch(adresse)).blob(), nomDeFichier(titre, 'png'))
  } else {
    const adresse = await toJpeg(toile, { ...options, quality: 0.92 })
    const pdf = pdfDepuisJpeg(octetsDeDataUrl(adresse), toile.clientWidth, toile.clientHeight)
    telecharger(new Blob([pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), nomDeFichier(titre, 'pdf'))
  }
}

/** Le bouton « Exporter » : le texte du tableau, ses médias, ou une capture de la vue, à télécharger. */
export function Export({ tableau, titre }: { tableau: string; titre(): string }) {
  const [ouvert, setOuvert] = useState(false)
  const [capture, setCapture] = useState<'png' | 'pdf' | null>(null)
  const [echec, setEchec] = useState(false)
  const photographier = (format: 'png' | 'pdf') => {
    setCapture(format)
    setEchec(false)
    // Le menu se ferme avant la prise de vue : il ne doit pas figurer sur l'image.
    setOuvert(false)
    requestAnimationFrame(() => {
      capturer(format, titre()).then(
        () => setCapture(null),
        () => {
          setCapture(null)
          setEchec(true)
          setTimeout(() => setEchec(false), 6000)
        },
      )
    })
  }
  useEffect(() => {
    if (!ouvert) return
    const hors = (e: PointerEvent) => !(e.target as HTMLElement).closest('.export') && setOuvert(false)
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && setOuvert(false)
    document.addEventListener('pointerdown', hors)
    document.addEventListener('keydown', touche)
    return () => {
      document.removeEventListener('pointerdown', hors)
      document.removeEventListener('keydown', touche)
    }
  }, [ouvert])
  const base = `/api/tableaux/${encodeURIComponent(tableau)}`
  return (
    <div className="export">
      <button type="button" className="bouton" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        {capture ? 'Export…' : echec ? 'Export impossible' : 'Exporter'}
      </button>
      {ouvert && (
        <div className="compte-menu" role="menu">
          <a role="menuitem" href={`${base}/export?format=md`} download onClick={() => setOuvert(false)}>
            Texte en Markdown
          </a>
          <a role="menuitem" href={`${base}/export?format=txt`} download onClick={() => setOuvert(false)}>
            Texte brut
          </a>
          <a role="menuitem" href={`${base}/medias`} download onClick={() => setOuvert(false)}>
            Images et fichiers (zip)
          </a>
          <small className="compte-rubrique">Ce qui est à l’écran</small>
          <button type="button" role="menuitem" disabled={capture !== null} onClick={() => photographier('png')}>
            Image (PNG)
          </button>
          <button type="button" role="menuitem" disabled={capture !== null} onClick={() => photographier('pdf')}>
            Page PDF
          </button>
        </div>
      )}
    </div>
  )
}
