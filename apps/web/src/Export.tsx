import { type NomIcone, type OptionsCopie, avecToutLeTableau } from '@notak/tableau'
import { langue, t } from './langue'
import { toJpeg, toPng } from 'html-to-image'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { octetsDeDataUrl, pdfDepuisJpeg } from './pdf'
import { Icone } from '@notak/tableau'
import { fermerPanneaux } from './panneaux'

/** Ce que la capture laisse de côté : les pastilles et les curseurs posés sur la toile, pas le tableau. */
const HORS_CAPTURE = ['notak-zoom-pastille', 'notak-choix-modele', 'notak-lecture', 'notak-lasso', 'notak-curseur']

export function telecharger(blob: Blob, nom: string) {
  const adresse = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = adresse
  a.download = nom
  a.click()
  setTimeout(() => URL.revokeObjectURL(adresse), 10_000)
}

/** Un nom de fichier sûr à partir d'un titre. */
export const nomDeFichier = (titre: string, extension: string) =>
  `${
    titre
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .trim()
      .slice(0, 100) || t('exporter.nomFichier')
  }.${extension}`

/** Ce que la capture montre : la vue telle qu'elle est, ou le tableau entier (la toile cadre tout le contenu le temps de la prise). */
type Portee = 'ecran' | 'tout'

/** Les formats, dans l'ordre du dialogue : le natif d'abord, les captures, puis le texte et les médias. */
type Format = 'notak' | 'pdf' | 'png' | 'md' | 'txt' | 'medias'
const FORMATS: readonly {
  format: Format
  icone: NomIcone
  extension: string
}[] = [
  { format: 'notak', icone: 'tableau', extension: 'notak' },
  { format: 'pdf', icone: 'fichierPdf', extension: 'pdf' },
  { format: 'png', icone: 'fichierImage', extension: 'png' },
  { format: 'md', icone: 'fichierTexte', extension: 'md' },
  { format: 'txt', icone: 'texte', extension: 'txt' },
  { format: 'medias', icone: 'fichierArchive', extension: 'zip' },
]
const AVANT_LE_TEXTE: Format = 'md'

interface Reglages extends OptionsCopie {
  format: Format
  portee: Portee
  /** Le PNG garde la couleur du canevas ; sans elle, il est transparent. */
  fond: boolean
  /** Le rapport de pixels d'une capture de l'écran (le tableau entier a le sien, borné en largeur). */
  resolution: 1 | 2 | 3
}

const PAR_DEFAUT: Reglages = {
  format: 'notak',
  sousTableaux: true,
  fichiers: true,
  portee: 'tout',
  fond: true,
  resolution: 2,
}
const CLE_REGLAGES = 'notak.export'

/** Les derniers réglages de cet appareil ; ce qu'on ne reconnaît pas reprend la valeur par défaut. */
function reglagesRetenus(): Reglages {
  try {
    const lu = JSON.parse(localStorage.getItem(CLE_REGLAGES) ?? '{}') as Partial<Reglages>
    return {
      format: FORMATS.some((f) => f.format === lu.format) ? lu.format! : PAR_DEFAUT.format,
      sousTableaux: typeof lu.sousTableaux === 'boolean' ? lu.sousTableaux : PAR_DEFAUT.sousTableaux,
      fichiers: typeof lu.fichiers === 'boolean' ? lu.fichiers : PAR_DEFAUT.fichiers,
      portee: lu.portee === 'ecran' ? 'ecran' : 'tout',
      fond: typeof lu.fond === 'boolean' ? lu.fond : PAR_DEFAUT.fond,
      resolution: lu.resolution === 1 || lu.resolution === 3 ? lu.resolution : 2,
    }
  } catch {
    return PAR_DEFAUT
  }
}

function retenir(r: Reglages) {
  try {
    localStorage.setItem(CLE_REGLAGES, JSON.stringify(r))
  } catch {
    // Sans stockage, les réglages valent pour cette ouverture.
  }
}

/**
 * La toile en image (`png`) ou en page PDF (`pdf`). La capture se fait dans le navigateur : sur ce qui est à
 * l'écran, ou, pour `tout`, sur le tableau cadré en entier (4000 px de large au plus), la vue revenant ensuite.
 */
function capturer(format: 'png' | 'pdf', titre: string, r: Reglages): Promise<void> {
  if (r.portee === 'ecran') return photographier(format, titre, r.resolution, r.fond)
  return avecToutLeTableau(({ rapport }) => photographier(format, titre, rapport, r.fond))
}

async function photographier(format: 'png' | 'pdf', titre: string, rapport: number, fond: boolean): Promise<void> {
  const toile = document.querySelector<HTMLElement>('.notak-toile')
  if (!toile) throw new Error(t('exporter.aucun'))
  // Un PDF n'a pas de transparence : il garde toujours le fond.
  const transparent = format === 'png' && !fond
  const options = {
    pixelRatio: rapport,
    ...(transparent ? { style: { background: 'none' } } : { backgroundColor: getComputedStyle(toile).backgroundColor }),
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

/**
 * Ce que l'édition locale sait faire elle-même, sans serveur : le texte du tableau, ses médias et son archive
 * `.notak`, fabriqués dans le navigateur. Sans lui, ce sont les routes du serveur.
 */
export interface ExportLocal {
  texte(tableau: string, format: 'md' | 'txt'): Promise<Blob>
  medias(tableau: string): Promise<Blob>
  notak(tableau: string, options: OptionsCopie): Promise<Blob>
}

/** Ce que rend le serveur pour un format de fichier ; une réponse en erreur fait échouer l'export. */
async function depuisServeur(adresse: string): Promise<Blob> {
  const r = await fetch(adresse, { credentials: 'same-origin' })
  if (!r.ok) throw new Error(String(r.status))
  return r.blob()
}

function fabriquer(format: Exclude<Format, 'pdf' | 'png'>, tableau: string, r: Reglages, local?: ExportLocal): Promise<Blob> {
  const base = `/api/tableaux/${encodeURIComponent(tableau)}`
  if (format === 'notak') {
    const options = { sousTableaux: r.sousTableaux, fichiers: r.fichiers }
    return local ? local.notak(tableau, options) : depuisServeur(`${base}/notak?sousTableaux=${+r.sousTableaux}&fichiers=${+r.fichiers}`)
  }
  if (format === 'medias') return local ? local.medias(tableau) : depuisServeur(`${base}/medias?langue=${langue()}`)
  return local ? local.texte(tableau, format) : depuisServeur(`${base}/export?format=${format}&langue=${langue()}`)
}

type Etat = { type: 'repos' } | { type: 'cours' } | { type: 'echec' }

/** Le bouton « Exporter » : il ouvre le dialogue où l'on choisit le format et ses options. */
export function Export({ tableau, titre, local }: { tableau: string; titre(): string; local?: ExportLocal }) {
  const dialogue = useRef<HTMLDialogElement>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  const [reglages, setReglages] = useState<Reglages>(reglagesRetenus)
  const [etat, setEtat] = useState<Etat>({ type: 'repos' })
  const [fait, setFait] = useState<string | null>(null)
  const regler = (r: Partial<Reglages>) =>
    setReglages((avant) => {
      const apres = { ...avant, ...r }
      retenir(apres)
      return apres
    })

  useEffect(() => {
    if (!fait) return
    const minuterie = setTimeout(() => setFait(null), 4000)
    return () => clearTimeout(minuterie)
  }, [fait])

  // Le dialogue vit hors du menu « … » qui porte le bouton : il survit à sa fermeture, et garde le thème de l'espace.
  const [hote, setHote] = useState<HTMLElement | null>(null)
  useEffect(() => setHote(bouton.current?.closest<HTMLElement>('.notak-espace') ?? document.body), [])

  const ouvrir = () => {
    setEtat({ type: 'repos' })
    fermerPanneaux()
    dialogue.current?.showModal()
  }
  const fermer = () => dialogue.current?.close()

  const exporter = () => {
    if (etat.type === 'cours') return
    const r = reglages
    const { format, extension } = FORMATS.find((f) => f.format === r.format)!
    const nom = nomDeFichier(titre(), extension)
    setEtat({ type: 'cours' })
    const reussi = () => {
      setEtat({ type: 'repos' })
      setFait(nom)
    }
    // Une capture ne se fait qu'une fois le dialogue fermé : il ne doit pas figurer sur l'image. Elle rouvre le
    // dialogue si elle échoue, pour qu'on y lise pourquoi.
    if (format === 'png' || format === 'pdf') {
      fermer()
      requestAnimationFrame(() => {
        capturer(format, titre(), r).then(reussi, () => {
          setEtat({ type: 'echec' })
          dialogue.current?.showModal()
        })
      })
      return
    }
    fabriquer(format, tableau, r, local).then(
      (blob) => {
        telecharger(blob, nom)
        fermer()
        reussi()
      },
      () => setEtat({ type: 'echec' }),
    )
  }

  const enCours = etat.type === 'cours'
  const choisi = reglages.format
  const extension = FORMATS.find((f) => f.format === choisi)!.extension

  return (
    <div className="export">
      <button type="button" ref={bouton} className="bouton" aria-haspopup="dialog" aria-label={t('exporter.titre')} title={t('exporter.titre')} onClick={ouvrir}>
        <Icone nom="exporter" taille={16} />
        <span className="bouton-texte">{enCours && !dialogue.current?.open ? t('exporter.encours') : t('exporter.titre')}</span>
      </button>
      {hote &&
        createPortal(
          <dialog
            ref={dialogue}
            className="export-dialogue"
            aria-labelledby="export-titre"
            onCancel={(e) => {
              if (enCours) e.preventDefault()
            }}
            onClose={() => bouton.current?.focus()}
            // Un clic sur le voile (le dialogue lui-même, hors de sa carte) le ferme, sauf pendant un export.
            onClick={(e) => {
              if (e.target === e.currentTarget && !enCours) fermer()
            }}
          >
            <form
              className="export-carte"
              method="dialog"
              onSubmit={(e) => {
                e.preventDefault()
                exporter()
              }}
            >
              <header className="export-entete">
                <h2 id="export-titre">
                  {t('exporter.dialogue', {
                    titre: titre() || t('commun.sansTitre'),
                  })}
                </h2>
                <button type="button" className="export-fermer" aria-label={t('commun.fermer')} disabled={enCours} onClick={fermer}>
                  <Icone nom="fermer" taille={16} />
                </button>
              </header>

              <fieldset className="export-formats" disabled={enCours}>
                <legend className="export-rubrique">{t('exporter.format')}</legend>
                {FORMATS.map(({ format, icone, extension: ext }) => (
                  <label key={format} className={`export-format${format === AVANT_LE_TEXTE ? ' export-format-filet' : ''}`}>
                    <input type="radio" name="format" value={format} checked={choisi === format} onChange={() => regler({ format })} />
                    <Icone nom={icone} taille={18} />
                    <span className="export-format-texte">
                      <strong>
                        {t(`exporter.f.${format}`)} <span className="export-ext">.{ext}</span>
                        {format === 'notak' && <span className="export-pastille">{t('exporter.recommande')}</span>}
                      </strong>
                      <small>{t(`exporter.f.${format}.aide`)}</small>
                    </span>
                  </label>
                ))}
              </fieldset>

              {choisi === 'notak' && (
                <fieldset className="export-options" disabled={enCours}>
                  <legend className="export-rubrique">{t('exporter.options')}</legend>
                  <label className="export-case">
                    <input type="checkbox" checked={reglages.sousTableaux} onChange={(e) => regler({ sousTableaux: e.target.checked })} />
                    {t('exporter.sousTableaux')}
                  </label>
                  <label className="export-case">
                    <input type="checkbox" checked={reglages.fichiers} onChange={(e) => regler({ fichiers: e.target.checked })} />
                    {t('exporter.fichiers')}
                  </label>
                </fieldset>
              )}

              {(choisi === 'png' || choisi === 'pdf') && (
                <fieldset className="export-options" disabled={enCours}>
                  <legend className="export-rubrique">{t('exporter.options')}</legend>
                  <div className="export-ligne">
                    <span id="export-portee">{t('exporter.portee')}</span>
                    <div className="export-segments" role="radiogroup" aria-labelledby="export-portee">
                      {(['tout', 'ecran'] as const).map((p) => (
                        <label key={p}>
                          <input type="radio" name="portee" checked={reglages.portee === p} onChange={() => regler({ portee: p })} />
                          {t(p === 'tout' ? 'exporter.tout' : 'exporter.ecran')}
                        </label>
                      ))}
                    </div>
                  </div>
                  {choisi === 'png' && reglages.portee === 'ecran' && (
                    <div className="export-ligne">
                      <span id="export-resolution">{t('exporter.resolution')}</span>
                      <div className="export-segments" role="radiogroup" aria-labelledby="export-resolution">
                        {([1, 2, 3] as const).map((n) => (
                          <label key={n}>
                            <input type="radio" name="resolution" checked={reglages.resolution === n} onChange={() => regler({ resolution: n })} />
                            {n}×
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {choisi === 'png' && (
                    <label className="export-case">
                      <input type="checkbox" checked={reglages.fond} onChange={(e) => regler({ fond: e.target.checked })} />
                      {t('exporter.fond')}
                    </label>
                  )}
                </fieldset>
              )}

              {etat.type === 'echec' && (
                <p className="connexion-erreur export-erreur" role="alert">
                  {t('exporter.echec')}
                </p>
              )}

              <footer className="export-pied">
                <small className="export-xmind">{t('exporter.xmind')}</small>
                <div className="export-actions">
                  <button type="button" className="bouton" disabled={enCours} onClick={fermer}>
                    {t('commun.annuler')}
                  </button>
                  <button type="submit" className="bouton bouton-plein" disabled={enCours} autoFocus>
                    {enCours ? t('exporter.encours') : t('exporter.action', { extension })}
                  </button>
                </div>
              </footer>
            </form>
          </dialog>,
          hote,
        )}
      {fait && (
        <div className="bandeau" role="status">
          {t('exporter.fait', { nom: fait })}
        </div>
      )}
    </div>
  )
}
