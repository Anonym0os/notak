import {
  type FormatExport,
  type OptionExport,
  type Prepare,
  type ReglagesExport,
  type SujetExport,
  Case,
  ErreurExport,
  Icone,
  REGLAGES_PAR_DEFAUT,
  Segments,
  brancherExport,
  nomDeFichier,
} from '@notak/tableau'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type Emplacement, choisirEmplacement } from './enregistrer'
import { langue, t } from './langue'

/**
 * Le dialogue d'export, le même d'où qu'on exporte : le tableau, une carte mentale ou un document ouverts en grand.
 * À gauche l'aperçu de ce qui sera écrit, à droite le format et ses réglages. L'aperçu porte le fichier lui-même
 * quand il le peut : on enregistre exactement ce qu'on a vu, sans le refaire.
 */

interface Retenu extends ReglagesExport {
  format?: string
}

/** Le tableau garde la clé d'avant ; la carte et le document ont chacun la leur. */
const cleDe = (genre: SujetExport['genre']) => (genre === 'tableau' ? 'notak.export' : `notak.export.${genre}`)

/** Les derniers réglages de cet appareil pour ce genre ; ce qu'on ne reconnaît pas reprend la valeur par défaut. */
function retenus(genre: SujetExport['genre']): Retenu {
  try {
    const lu = JSON.parse(localStorage.getItem(cleDe(genre)) ?? '{}') as Partial<Retenu>
    const d = REGLAGES_PAR_DEFAUT
    return {
      ...(typeof lu.format === 'string' ? { format: lu.format } : {}),
      sousTableaux: typeof lu.sousTableaux === 'boolean' ? lu.sousTableaux : d.sousTableaux,
      fichiers: typeof lu.fichiers === 'boolean' ? lu.fichiers : d.fichiers,
      portee: lu.portee === 'ecran' ? 'ecran' : 'tout',
      fond: typeof lu.fond === 'boolean' ? lu.fond : d.fond,
      resolution: lu.resolution === 1 || lu.resolution === 3 ? lu.resolution : 2,
    }
  } catch {
    return { ...REGLAGES_PAR_DEFAUT }
  }
}

function retenir(genre: SujetExport['genre'], r: Retenu) {
  try {
    localStorage.setItem(cleDe(genre), JSON.stringify(r))
  } catch {
    // Sans stockage, les réglages valent pour cette ouverture.
  }
}

/** La résolution ne compte que pour une capture de l'écran : le tableau entier a la sienne. */
const optionsVisibles = (f: FormatExport, r: ReglagesExport): OptionExport[] => (f.options ?? []).filter((o) => o !== 'resolution' || r.portee === 'ecran')

/** Ce qui distingue un aperçu d'un autre : le format, et les réglages qu'il montre. */
const cleApercu = (f: FormatExport, r: ReglagesExport) =>
  `${f.id}|${optionsVisibles(f, r)
    .map((o) => `${o}=${String(r[o])}`)
    .join('|')}`

/** Le poids d'un fichier, dans la langue de la personne. */
export function poids(octets: number): string {
  const fr = langue() === 'fr'
  const nombre = (n: number) => n.toLocaleString(fr ? 'fr-FR' : 'en-GB', { maximumFractionDigits: n < 10 ? 1 : 0 })
  if (octets < 1024) return `${octets} ${fr ? 'o' : 'B'}`
  if (octets < 1024 * 1024) return `${nombre(octets / 1024)} ${fr ? 'ko' : 'KB'}`
  return `${nombre(octets / 1024 / 1024)} ${fr ? 'Mo' : 'MB'}`
}

type EtatApercu = { type: 'cours' } | { type: 'pret'; prepare: Prepare } | { type: 'echec'; code?: string }
type Etat = { type: 'repos' } | { type: 'cours' } | { type: 'echec'; code?: string }

const message = (code?: string) => (code === 'aucun_media' ? t('exporter.aucunMedia') : code === 'bureau_a_mettre_a_jour' ? t('exporter.bureauAncien') : t('exporter.echec'))

/** Le texte montré en aperçu : le début, au-delà la page ralentirait sans rien apprendre de plus. */
const TEXTE_MAX = 20_000

export function DialogueExport() {
  const dialogue = useRef<HTMLDialogElement>(null)
  const [sujet, setSujet] = useState<SujetExport | null>(null)
  const [reglages, setReglages] = useState<Retenu>(REGLAGES_PAR_DEFAUT)
  const [format, setFormat] = useState<FormatExport | null>(null)
  const [apercu, setApercu] = useState<EtatApercu>({ type: 'cours' })
  const [etat, setEtat] = useState<Etat>({ type: 'repos' })
  const [fait, setFait] = useState<string | null>(null)
  const [hote, setHote] = useState<HTMLElement | null>(null)
  // Les aperçus déjà faits pour ce sujet : revenir à un format ou à un réglage est immédiat.
  const caches = useRef(new Map<string, Promise<Prepare>>())

  useEffect(
    () =>
      brancherExport((s) => {
        const r = retenus(s.genre)
        const choisi = s.formats.find((f) => f.id === s.format) ?? s.formats.find((f) => f.id === r.format) ?? s.formats.find((f) => f.recommande) ?? s.formats[0] ?? null
        caches.current = new Map()
        // Le dialogue prend le thème de l'espace : il vit dedans.
        setHote(document.querySelector<HTMLElement>('.notak-espace') ?? document.body)
        setSujet(s)
        setReglages(r)
        setFormat(choisi)
        setEtat({ type: 'repos' })
      }),
    [],
  )

  // Le dialogue s'ouvre une fois posé dans son hôte.
  useEffect(() => {
    if (sujet && hote && !dialogue.current?.open) dialogue.current?.showModal()
  }, [sujet, hote])

  useEffect(() => {
    if (!fait) return
    const minuterie = setTimeout(() => setFait(null), 4000)
    return () => clearTimeout(minuterie)
  }, [fait])

  const cle = sujet && format ? cleApercu(format, reglages) : null
  const preparer = (f: FormatExport, r: ReglagesExport): Promise<Prepare> => {
    const k = cleApercu(f, r)
    let p = caches.current.get(k)
    if (!p) {
      p = f.preparer(r)
      // Un échec ne reste pas en cache : on peut réessayer.
      p.catch(() => caches.current.delete(k))
      caches.current.set(k, p)
    }
    return p
  }

  // L'aperçu se fait à l'ouverture, puis à chaque format ou réglage qui le change.
  useEffect(() => {
    if (!sujet || !format) return
    let vivant = true
    setApercu({ type: 'cours' })
    preparer(format, reglages).then(
      (prepare) => vivant && setApercu({ type: 'pret', prepare }),
      (e: unknown) => vivant && setApercu({ type: 'echec', ...(e instanceof ErreurExport ? { code: e.message } : {}) }),
    )
    return () => {
      vivant = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sujet, cle])

  const regler = (r: Partial<Retenu>) =>
    setReglages((avant) => {
      const apres = { ...avant, ...r }
      if (sujet) retenir(sujet.genre, apres)
      return apres
    })
  const choisir = (f: FormatExport) => {
    setFormat(f)
    setEtat({ type: 'repos' })
    regler({ format: f.id })
  }

  const fermer = () => dialogue.current?.close()
  const enCours = etat.type === 'cours'

  const exporter = async () => {
    if (!sujet || !format || enCours) return
    const f = format
    const r = reglages
    setEtat({ type: 'cours' })
    // L'emplacement se demande d'abord, au clic : la fenêtre « Enregistrer sous » n'accepte pas d'attendre.
    let ou: Emplacement | null
    try {
      ou = await choisirEmplacement({ nom: nomDeFichier(sujet.titre, f.extension, t('exporter.nomFichier')), extension: f.extension, type: f.type, description: f.libelle })
    } catch (e) {
      return setEtat({ type: 'echec', ...(e instanceof ErreurExport ? { code: e.message } : {}) })
    }
    if (!ou) return setEtat({ type: 'repos' })
    try {
      const prepare = await preparer(f, r)
      const blob = prepare.fichier ?? (await f.fabriquer?.(r))
      if (!blob) throw new Error('rien à écrire')
      await ou.ecrire(blob)
      setEtat({ type: 'repos' })
      setFait(ou.nom)
      fermer()
    } catch (e) {
      setEtat({ type: 'echec', ...(e instanceof ErreurExport ? { code: e.message } : {}) })
    }
  }

  const visibles = format ? optionsVisibles(format, reglages) : []
  const pret = apercu.type === 'pret' ? apercu.prepare : null

  return (
    <>
      {hote &&
        sujet &&
        createPortal(
          <dialog
            ref={dialogue}
            className="export-dialogue"
            aria-labelledby="export-titre"
            onCancel={(e) => {
              if (enCours) e.preventDefault()
            }}
            onClose={() => setSujet(null)}
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
                void exporter()
              }}
            >
              <header className="export-entete">
                <h2 id="export-titre">{t('exporter.dialogue', { titre: sujet.titre || t('commun.sansTitre') })}</h2>
                <button type="button" className="export-fermer" aria-label={t('commun.fermer')} disabled={enCours} onClick={fermer}>
                  <Icone nom="fermer" taille={16} />
                </button>
              </header>

              <div className="export-corps">
                <ApercuExport etat={apercu} />

                <div className="export-reglages">
                  <fieldset className="export-formats" disabled={enCours}>
                    <legend className="export-rubrique">{t('exporter.format')}</legend>
                    {sujet.formats.map((f) => (
                      <label key={f.id} className={`export-format${f.filet ? ' export-format-filet' : ''}`}>
                        <input type="radio" name="format" value={f.id} checked={format?.id === f.id} onChange={() => choisir(f)} />
                        <Icone nom={f.icone} taille={18} />
                        <span className="export-format-texte">
                          <strong>
                            {f.libelle} <span className="export-ext">.{f.extension}</span>
                            {f.recommande && <span className="export-pastille">{t('exporter.recommande')}</span>}
                          </strong>
                          <small>{f.aide}</small>
                        </span>
                      </label>
                    ))}
                  </fieldset>

                  {visibles.length > 0 && (
                    <fieldset className="export-options" disabled={enCours}>
                      <legend className="export-rubrique">{t('exporter.options')}</legend>
                      {visibles.map((o) => (
                        <Option key={o} option={o} reglages={reglages} regler={regler} />
                      ))}
                    </fieldset>
                  )}

                  {sujet.note && <small className="export-xmind">{sujet.note}</small>}
                </div>
              </div>

              {etat.type === 'echec' && (
                <p className="connexion-erreur export-erreur" role="alert">
                  {message(etat.code)}
                </p>
              )}

              <footer className="export-pied">
                <small className="export-poids" aria-live="polite">
                  {pret?.fichier && format ? t('exporter.poids', { extension: format.extension, poids: poids(pret.fichier.size) }) : ''}
                </small>
                <div className="export-actions">
                  <button type="button" className="bouton" disabled={enCours} onClick={fermer}>
                    {t('commun.annuler')}
                  </button>
                  <button type="submit" className="bouton bouton-plein" disabled={enCours || apercu.type === 'echec'} autoFocus>
                    {enCours ? t('exporter.encours') : t('exporter.action', { extension: format?.extension ?? '' })}
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
    </>
  )
}

function Option({ option, reglages, regler }: { option: OptionExport; reglages: ReglagesExport; regler(r: Partial<ReglagesExport>): void }) {
  if (option === 'sousTableaux' || option === 'fichiers' || option === 'fond')
    return (
      <label className="export-case">
        <Case option cochee={reglages[option]} onChange={(v) => regler({ [option]: v })} />
        {t(`exporter.${option}`)}
      </label>
    )
  if (option === 'portee')
    return (
      <div className="export-ligne">
        <span>{t('exporter.portee')}</span>
        <Segments
          libelle={t('exporter.portee')}
          options={(['tout', 'ecran'] as const).map((p) => ({ valeur: p, libelle: t(p === 'tout' ? 'exporter.tout' : 'exporter.ecran') }))}
          valeur={reglages.portee}
          onChange={(p) => regler({ portee: p })}
        />
      </div>
    )
  return (
    <div className="export-ligne">
      <span>{t('exporter.resolution')}</span>
      <Segments libelle={t('exporter.resolution')} options={([1, 2, 3] as const).map((n) => ({ valeur: n, libelle: `${n}×` }))} valeur={reglages.resolution} onChange={(n) => regler({ resolution: n })} />
    </div>
  )
}

/** L'aperçu : les images (une capture, ou les pages, une à la fois), le texte, ou ce que contient l'archive. */
function ApercuExport({ etat }: { etat: EtatApercu }) {
  const images = etat.type === 'pret' && etat.prepare.apercu.type === 'images' ? etat.prepare.apercu.images : null
  const adresses = useMemo(() => images?.map((b) => URL.createObjectURL(b)) ?? [], [images])
  useEffect(() => () => adresses.forEach((a) => URL.revokeObjectURL(a)), [adresses])
  const [page, setPage] = useState(0)
  useEffect(() => setPage(0), [adresses])

  let contenu: React.ReactNode
  if (etat.type === 'cours')
    contenu = (
      <div className="export-apercu-attente">
        <span className="export-roue" aria-hidden />
        {t('exporter.preparation')}
      </div>
    )
  else if (etat.type === 'echec') contenu = <p className="export-apercu-attente">{etat.code === 'aucun_media' ? t('exporter.aucunMedia') : t('exporter.apercuEchec')}</p>
  else {
    const a = etat.prepare.apercu
    if (a.type === 'images') {
      const n = adresses.length
      const i = Math.min(page, n - 1)
      contenu = (
        <>
          <div className="export-apercu-image">{adresses[i] && <img src={adresses[i]} alt="" />}</div>
          {n > 1 && (
            <div className="export-pages">
              <button type="button" className="export-fermer" aria-label={t('exporter.pagePrecedente')} disabled={i === 0} onClick={() => setPage(i - 1)}>
                <Icone nom="precedent" taille={16} />
              </button>
              <span>{t('exporter.page', { n: i + 1, total: n })}</span>
              <button type="button" className="export-fermer" aria-label={t('exporter.pageSuivante')} disabled={i === n - 1} onClick={() => setPage(i + 1)}>
                <Icone nom="chevronDroite" taille={16} />
              </button>
            </div>
          )}
          {a.legende && <small className="export-apercu-legende">{a.legende}</small>}
        </>
      )
    } else if (a.type === 'texte')
      contenu =
        a.texte.trim() === '' ? (
          <p className="export-apercu-attente">{t('exporter.apercuVide')}</p>
        ) : (
          <pre className="export-apercu-texte">{a.texte.length > TEXTE_MAX ? `${a.texte.slice(0, TEXTE_MAX)}\n…` : a.texte}</pre>
        )
    else
      contenu = (
        <div className="export-apercu-contenu">
          <strong>{a.resume}</strong>
          <ul>
            {a.lignes.map((l, i) => (
              <li key={i}>
                <Icone nom={l.icone} taille={16} />
                <span>{l.texte}</span>
                {l.detail && <small>{l.detail}</small>}
              </li>
            ))}
          </ul>
        </div>
      )
  }
  return (
    <section className="export-apercu" aria-label={t('exporter.apercu')} aria-busy={etat.type === 'cours'}>
      {contenu}
    </section>
  )
}
