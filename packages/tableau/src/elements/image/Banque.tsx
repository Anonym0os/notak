import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icone } from '../../icones'
import { t } from '../../langue'
import type { ContexteToile, ImageDeBanque } from '../types'
import { envoyerFichiers, fermerBanque, lireHistorique, motsDuMenu, noterRecherche, poserImageDeBanque, useBanqueOuverte } from './banqueImages'
import './banque.css'

/** Le libellé de l'outil Image : c'est lui qui nomme son bouton dans la barre, où le panneau s'accroche. */
const boutonOutil = (libelle: string) => [...document.querySelectorAll('.notak-barre-outils .notak-outil')].find((b) => b.getAttribute('title') === libelle) ?? null
const estLOutil = (cible: Element, libelle: string) => cible.closest('.notak-barre-outils .notak-outil')?.getAttribute('title') === libelle

type Mode = { genre: 'recommande' } | { genre: 'mot'; mot: string } | { genre: 'envoyer' }

type Etat = { statut: 'charge' | 'ok' | 'erreur' | 'non_configuree'; images: ImageDeBanque[]; total: number; page: number }
const ETAT_VIDE: Etat = { statut: 'charge', images: [], total: 0, page: 0 }

/** Le panneau d'images : s'ouvre au clic sur l'outil Image, se pose à sa droite, se ferme hors de lui. */
export function PanneauBanque({ contexte, libelleOutil }: { contexte: ContexteToile; libelleOutil: string }) {
  const ouverte = useBanqueOuverte()
  // La toile qui s'en va emporte son panneau : le suivant repart fermé.
  useEffect(() => fermerBanque, [])
  return ouverte ? <Banque contexte={contexte} libelleOutil={libelleOutil} /> : null
}

function Banque({ contexte, libelleOutil }: { contexte: ContexteToile; libelleOutil: string }) {
  const recherche = contexte.services.banqueImages
  const titre = contexte.magasin.lire().titre
  const [mode, setMode] = useState<Mode>(recherche ? { genre: 'recommande' } : { genre: 'envoyer' })
  const [historique, setHistorique] = useState(lireHistorique)
  const [saisie, setSaisie] = useState('')
  const [etat, setEtat] = useState<Etat>(ETAT_VIDE)
  const [bulle, setBulle] = useState<number | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number; fleche: number } | null>(null)
  const panneau = useRef<HTMLDivElement>(null)
  const champ = useRef<HTMLInputElement>(null)
  const appel = useRef(0)
  const sansBanque = etat.statut === 'non_configuree' || !recherche

  const requete = mode.genre === 'mot' ? mode.mot : mode.genre === 'recommande' ? titre.trim() : null

  const charger = useCallback(
    async (q: string, page: number, garder: ImageDeBanque[]) => {
      if (!recherche) return
      const n = ++appel.current
      setEtat((e) => ({ ...e, statut: 'charge', images: garder, page }))
      try {
        const r = await recherche(q, page)
        if (n !== appel.current) return
        const vus = new Set(garder.map((i) => i.id))
        setEtat({ statut: 'ok', images: [...garder, ...r.resultats.filter((i) => !vus.has(i.id))], total: r.total, page })
      } catch (e) {
        if (n !== appel.current) return
        const cause = e instanceof Error ? e.cause : undefined
        setEtat({ statut: cause === 'non_configuree' ? 'non_configuree' : 'erreur', images: garder, total: 0, page: page - 1 })
      }
    },
    [recherche],
  )

  // Un nouveau mode repart de la première page.
  useEffect(() => {
    if (requete === null) return
    void charger(requete, 1, [])
  }, [requete, charger])

  // À gauche de la barre, à la hauteur de l'outil ; la flèche le désigne même si le panneau remonte pour tenir à l'écran.
  useLayoutEffect(() => {
    const place = () => {
      const bouton = boutonOutil(libelleOutil)
      const p = panneau.current
      if (!bouton || !p) return
      const r = bouton.getBoundingClientRect()
      const h = p.offsetHeight
      const milieu = r.top + r.height / 2
      const top = Math.max(8, Math.min(milieu - 60, window.innerHeight - h - 8))
      setPos({ left: r.right + 15, top, fleche: Math.max(16, Math.min(milieu - top, h - 16)) })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [libelleOutil, sansBanque])

  useEffect(() => {
    if (!sansBanque && mode.genre !== 'envoyer') champ.current?.focus({ preventScroll: true })
  }, [sansBanque, mode.genre])

  // Un appui hors du panneau le ferme (sauf sur l'outil lui-même, dont le clic le referme) ; Échap aussi.
  useEffect(() => {
    const appui = (e: PointerEvent) => {
      const cible = e.target as Element | null
      if (!cible || panneau.current?.contains(cible) || estLOutil(cible, libelleOutil)) return
      fermerBanque()
    }
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      fermerBanque()
    }
    document.addEventListener('pointerdown', appui, true)
    document.addEventListener('keydown', touche, true)
    return () => {
      document.removeEventListener('pointerdown', appui, true)
      document.removeEventListener('keydown', touche, true)
    }
  }, [libelleOutil])

  // La molette fait défiler la liste, pas la toile derrière.
  useEffect(() => {
    const p = panneau.current
    const arreter = (e: WheelEvent) => e.stopPropagation()
    p?.addEventListener('wheel', arreter)
    return () => p?.removeEventListener('wheel', arreter)
  }, [])

  const valider = () => {
    const terme = saisie.trim().toLowerCase()
    if (!terme) return
    setHistorique(noterRecherche(terme))
    setMode({ genre: 'mot', mot: terme })
    setSaisie('')
    champ.current?.focus()
  }

  const mots = motsDuMenu(titre, historique)
  const actif = (m: Mode) => mode.genre === m.genre && (m.genre !== 'mot' || (mode.genre === 'mot' && mode.mot === m.mot))

  const poser = async (image: ImageDeBanque, ou: { x: number; y: number }) => {
    try {
      await poserImageDeBanque(image, contexte.versTableau(ou), contexte)
    } catch {
      // l'image n'a pas pu être rapatriée : rien n'est posé
    }
  }

  const surFichiers = (fichiers: Iterable<File>) => {
    if (envoyerFichiers(fichiers, contexte)) fermerBanque()
  }

  const envoi = <Envoi surFichiers={surFichiers} />

  return (
    <div
      ref={panneau}
      className="notak-banque"
      role="dialog"
      aria-label={t('image.banque.titre')}
      data-sans-banque={sansBanque ? '' : undefined}
      style={pos ? { left: pos.left, top: pos.top, ['--notak-banque-fleche' as string]: `${pos.fleche}px` } : { visibility: 'hidden' }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {sansBanque ? (
        <div className="notak-banque-seule">
          {envoi}
          <p className="notak-banque-note">{t('image.banque.nonConfiguree')}</p>
        </div>
      ) : (
        <>
          <div className="notak-banque-menu">
            <ul className="notak-banque-modes">
              <li>
                <button type="button" data-actif={actif({ genre: 'recommande' }) ? '' : undefined} onClick={() => setMode({ genre: 'recommande' })}>
                  {t('image.banque.recommandees')}
                </button>
              </li>
              {mots.map((mot) => (
                <li key={mot}>
                  <button type="button" data-actif={actif({ genre: 'mot', mot }) ? '' : undefined} title={mot} onClick={() => setMode({ genre: 'mot', mot })}>
                    {mot}
                  </button>
                </li>
              ))}
              <li>
                <button type="button" data-actif={actif({ genre: 'envoyer' }) ? '' : undefined} onClick={() => setMode({ genre: 'envoyer' })}>
                  {t('image.banque.envoyer')}
                </button>
              </li>
            </ul>
            <p className="notak-banque-attribution">
              {t('image.banque.attribution')}{' '}
              <a href="https://www.pexels.com" target="_blank" rel="noreferrer noopener">
                Pexels
              </a>
            </p>
            <div className="notak-banque-champ">
              <input
                ref={champ}
                type="text"
                value={saisie}
                placeholder={t('image.banque.rechercher')}
                aria-label={t('image.banque.rechercher')}
                onChange={(e) => setSaisie(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    valider()
                  }
                }}
              />
              {saisie && (
                <button type="button" aria-label={t('image.banque.effacer')} title={t('image.banque.effacer')} onClick={() => { setSaisie(''); champ.current?.focus() }}>
                  <Icone nom="fermer" taille={14} />
                </button>
              )}
            </div>
          </div>
          <div className="notak-banque-contenu">
            {mode.genre === 'envoyer' ? (
              envoi
            ) : (
              <>
                <ul className="notak-banque-liste">
                  {etat.images.map((image) => (
                    <Vignette key={image.id} image={image} bulle={bulle === image.id} surClic={() => {
                      setBulle(image.id)
                      setTimeout(() => setBulle((b) => (b === image.id ? null : b)), 3000)
                    }} poser={poser} />
                  ))}
                </ul>
                {etat.statut === 'charge' && <div className="notak-banque-attente" role="status" aria-label="…" />}
                {etat.statut === 'ok' && etat.images.length === 0 && <p className="notak-banque-note">{t('image.banque.vide')}</p>}
                {etat.statut === 'erreur' && (
                  <p className="notak-banque-note">
                    {t('image.banque.erreur')}{' '}
                    <button type="button" className="notak-banque-lien" onClick={() => void charger(requete ?? '', etat.page + 1, etat.images)}>
                      {t('image.banque.reessayer')}
                    </button>
                  </p>
                )}
                {etat.statut === 'ok' && etat.images.length > 0 && etat.images.length < etat.total && (
                  <button type="button" className="notak-banque-plus" onClick={() => void charger(requete ?? '', etat.page + 1, etat.images)}>
                    {t('image.banque.plus')}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Le bouton d'envoi et la zone de dépôt : les fichiers pris ou lâchés ici partent aux récepteurs de la toile. */
function Envoi({ surFichiers }: { surFichiers(f: Iterable<File>): void }) {
  const [survol, setSurvol] = useState(false)
  const choisir = () => {
    const champ = document.createElement('input')
    champ.type = 'file'
    champ.multiple = true
    champ.accept = 'image/*'
    champ.addEventListener('change', () => champ.files && surFichiers(champ.files))
    champ.click()
  }
  return (
    <div
      className="notak-banque-envoi"
      data-survol={survol ? '' : undefined}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setSurvol(true)
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setSurvol(false)
        surFichiers(e.dataTransfer.files)
      }}
    >
      <svg viewBox="0 0 96 64" width="96" height="64" aria-hidden>
        <rect x="6" y="6" width="84" height="52" rx="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 4" />
        <path d="M48 44V22m0 0-8 8m8-8 8 8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <button type="button" className="notak-banque-principal" onClick={choisir}>
        {t('image.banque.choisir')}
      </button>
      <p>{t('image.banque.astuce')}</p>
    </div>
  )
}

const SEUIL_GLISSER = 5

/** Une vignette : on la glisse sur la toile (une image y naît au lâcher) ; un simple clic dit de la glisser. */
function Vignette({ image, bulle, surClic, poser }: { image: ImageDeBanque; bulle: boolean; surClic(): void; poser(i: ImageDeBanque, ou: { x: number; y: number }): Promise<void> }) {
  const depart = useRef<{ x: number; y: number; fantome: HTMLElement | null } | null>(null)

  const finir = (e: React.PointerEvent<HTMLLIElement>, valider: boolean) => {
    const d = depart.current
    depart.current = null
    if (!d) return
    d.fantome?.remove()
    if (!valider) return
    if (!d.fantome) return surClic()
    // Seul un lâcher sur la toile, hors panneau et hors barre, pose l'image.
    const sur = document.elementFromPoint(e.clientX, e.clientY)
    const toile = sur?.closest('.notak-toile')
    if (!toile || sur?.closest('.notak-banque, .notak-barre-outils')) return
    const r = toile.getBoundingClientRect()
    void poser(image, { x: e.clientX - r.left, y: e.clientY - r.top })
  }

  return (
    <li
      className="notak-banque-vignette"
      title={t('image.banque.glissezMoi')}
      onPointerDown={(e) => {
        if (e.button !== 0 || e.pointerType === 'touch') return
        e.preventDefault()
        depart.current = { x: e.clientX, y: e.clientY, fantome: null }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = depart.current
        if (!d) return
        if (!d.fantome && Math.hypot(e.clientX - d.x, e.clientY - d.y) > SEUIL_GLISSER) {
          const f = document.createElement('img')
          f.src = image.vignette
          f.alt = ''
          f.className = 'notak-banque-fantome'
          document.body.append(f)
          d.fantome = f
        }
        if (d.fantome) {
          d.fantome.style.left = `${e.clientX}px`
          d.fantome.style.top = `${e.clientY}px`
        }
      }}
      onPointerUp={(e) => finir(e, true)}
      onPointerCancel={(e) => finir(e, false)}
      onClick={(e) => (e.nativeEvent as PointerEvent).pointerType === 'touch' && surClic()}
    >
      <img src={image.vignette} alt="" loading="lazy" draggable={false} style={{ aspectRatio: `${image.largeur || 3} / ${image.hauteur || 2}` }} />
      {bulle && (
        <span className="notak-banque-bulle" role="status">
          {t('image.banque.glissezMoi')}
        </span>
      )}
    </li>
  )
}
