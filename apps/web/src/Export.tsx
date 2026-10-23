import { avecToutLeTableau } from '@notak/tableau'
import { t } from './langue'
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
const nomDeFichier = (titre: string, extension: string) => `${titre.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim().slice(0, 100) || t('exporter.nomFichier')}.${extension}`

/** Ce que la capture montre : la vue telle qu'elle est, ou le tableau entier (la toile cadre tout le contenu le temps de la prise). */
type Portee = 'ecran' | 'tout'

/**
 * La toile en image (`png`) ou en page PDF (`pdf`). La capture se fait dans le navigateur : sur ce qui est à
 * l'écran, ou, pour `tout`, sur le tableau cadré en entier (4000 px de large au plus), la vue revenant ensuite.
 */
function capturer(format: 'png' | 'pdf', titre: string, portee: Portee): Promise<void> {
  if (portee === 'ecran') return photographier(format, titre, ECHELLE_CAPTURE)
  return avecToutLeTableau(({ rapport }) => photographier(format, titre, rapport))
}

async function photographier(format: 'png' | 'pdf', titre: string, rapport: number): Promise<void> {
  const toile = document.querySelector<HTMLElement>('.notak-toile')
  if (!toile) throw new Error(t('exporter.aucun'))
  const options = {
    pixelRatio: rapport,
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
  const photographierVue = (format: 'png' | 'pdf', portee: Portee) => {
    setCapture(format)
    setEchec(false)
    // Le menu se ferme avant la prise de vue : il ne doit pas figurer sur l'image.
    setOuvert(false)
    requestAnimationFrame(() => {
      capturer(format, titre(), portee).then(
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
        {capture ? t('exporter.encours') : echec ? t('exporter.impossible') : t('exporter.titre')}
      </button>
      {ouvert && (
        <div className="compte-menu" role="menu">
          <a role="menuitem" href={`${base}/export?format=md`} download onClick={() => setOuvert(false)}>
            {t('exporter.markdown')}
          </a>
          <a role="menuitem" href={`${base}/export?format=txt`} download onClick={() => setOuvert(false)}>
            {t('exporter.texte')}
          </a>
          <a role="menuitem" href={`${base}/medias`} download onClick={() => setOuvert(false)}>
            {t('exporter.medias')}
          </a>
          <small className="compte-rubrique">{t('exporter.ecran')}</small>
          <button type="button" role="menuitem" disabled={capture !== null} onClick={() => photographierVue('png', 'ecran')}>
            {t('exporter.png')}
          </button>
          <button type="button" role="menuitem" disabled={capture !== null} onClick={() => photographierVue('pdf', 'ecran')}>
            {t('exporter.pdf')}
          </button>
          <small className="compte-rubrique">{t('exporter.tout')}</small>
          <button type="button" role="menuitem" disabled={capture !== null} onClick={() => photographierVue('png', 'tout')}>
            {t('exporter.png')}
          </button>
          <button type="button" role="menuitem" disabled={capture !== null} onClick={() => photographierVue('pdf', 'tout')}>
            {t('exporter.pdf')}
          </button>
        </div>
      )}
    </div>
  )
}
