import { type RefObject, useEffect, useRef, useState } from 'react'
import { Icone } from '../../icones'
import { t } from '../../langue'

/** Les lecteurs du son et de la vidéo : les contrôles sont à nous (le navigateur ne donne que les siens). */

/** « m:ss », ou « h:mm:ss » au-delà d'une heure. */
export function dureeLisible(secondes: number): string {
  const s = Number.isFinite(secondes) && secondes > 0 ? Math.floor(secondes) : 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const reste = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${reste}` : `${m}:${reste}`
}

/** « 1:05 / 3:20 ». */
export const tempsLisible = (courant: number, total: number) => `${dureeLisible(courant)} / ${dureeLisible(total)}`

/** Les relances avant d'annoncer une erreur de lecture : une seconde, puis deux. */
const RELANCES_MS = [1000, 2000]

interface Etat {
  lit: boolean
  courant: number
  duree: number
  volume: number
  muet: boolean
  erreur: 'type' | 'lecture' | null
}

/** L'état d'un `<audio>` ou d'un `<video>`, et de quoi le commander. */
function useMedia(ref: RefObject<HTMLMediaElement | null>, adresse: string, boucle: boolean, auto: boolean) {
  const [etat, setEtat] = useState<Etat>({ lit: false, courant: 0, duree: 0, volume: 1, muet: false, erreur: null })
  const relances = useRef(0)
  const maj = (p: Partial<Etat>) => setEtat((e) => ({ ...e, ...p }))

  useEffect(() => {
    const m = ref.current
    if (!m) return
    relances.current = 0
    const lire = () => maj({ courant: m.currentTime, duree: m.duration || 0, lit: !m.paused, volume: m.volume, muet: m.muted })
    // Une erreur de lecture se retente deux fois avant de s'afficher ; un format que le navigateur ne connaît pas, jamais.
    let attente: ReturnType<typeof setTimeout> | undefined
    const echec = () => {
      if (m.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return maj({ erreur: 'type', lit: false })
      const delai = RELANCES_MS[relances.current++]
      if (delai === undefined) return maj({ erreur: 'lecture', lit: false })
      attente = setTimeout(() => m.load(), delai)
    }
    const evenements = ['timeupdate', 'durationchange', 'loadedmetadata', 'play', 'pause', 'ended', 'volumechange'] as const
    for (const e of evenements) m.addEventListener(e, lire)
    m.addEventListener('error', echec)
    lire()
    if (auto) void m.play().catch(() => {})
    return () => {
      clearTimeout(attente)
      for (const e of evenements) m.removeEventListener(e, lire)
      m.removeEventListener('error', echec)
    }
  }, [ref, adresse, auto])

  useEffect(() => {
    if (ref.current) ref.current.loop = boucle
  }, [ref, boucle])

  return {
    etat,
    basculer: () => {
      const m = ref.current
      if (!m) return
      if (m.paused) void m.play().catch(() => maj({ erreur: 'lecture' }))
      else m.pause()
    },
    aller: (fraction: number) => {
      const m = ref.current
      if (m && m.duration) m.currentTime = Math.max(0, Math.min(1, fraction)) * m.duration
    },
    volume: (v: number) => {
      const m = ref.current
      if (!m) return
      m.volume = Math.max(0, Math.min(1, v))
      m.muted = m.volume === 0
    },
    muet: () => {
      const m = ref.current
      if (m) m.muted = !m.muted
    },
  }
}

/** Un curseur qu'on tire (la progression, le volume) : renvoie la fraction 0 à 1 où se trouve le pointeur. */
function Curseur({ valeur, vertical, onChange, libelle, classe }: { valeur: number; vertical?: boolean; onChange(v: number): void; libelle: string; classe: string }) {
  const piste = useRef<HTMLDivElement>(null)
  const fraction = (e: React.PointerEvent) => {
    const r = piste.current!.getBoundingClientRect()
    return vertical ? 1 - (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width
  }
  const pct = `${Math.max(0, Math.min(1, valeur)) * 100}%`
  return (
    <div
      ref={piste}
      className={`notak-curseur ${classe}`}
      data-vertical={vertical || undefined}
      role="slider"
      tabIndex={0}
      aria-label={libelle}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(valeur * 100)}
      onPointerDown={(e) => {
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        onChange(fraction(e))
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && onChange(fraction(e))}
      onKeyDown={(e) => {
        const pas = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 0.05 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.05 : 0
        if (!pas) return
        e.preventDefault()
        e.stopPropagation()
        onChange(valeur + pas)
      }}
    >
      <span className="notak-curseur-plein" style={vertical ? { height: pct } : { width: pct }} />
      <span className="notak-curseur-rond" style={vertical ? { bottom: pct } : { left: pct }} />
    </div>
  )
}

/** Le volume : un bouton, et au survol un curseur vertical de 32 × 100 px. */
function Volume({ etat, volume, muet }: { etat: Etat; volume(v: number): void; muet(): void }) {
  const sourd = etat.muet || etat.volume === 0
  return (
    <div className="notak-lecteur-volume">
      <button type="button" className="notak-lecteur-bouton" aria-label={t(sourd ? 'lecteur.activerSon' : 'lecteur.couperSon')} onClick={muet}>
        <Icone nom={sourd ? 'muet' : 'volume'} taille={16} trait={1.75} />
      </button>
      <div className="notak-lecteur-volume-volet">
        <Curseur valeur={sourd ? 0 : etat.volume} vertical onChange={volume} libelle={t('lecteur.volume')} classe="notak-curseur-volume" />
      </div>
    </div>
  )
}

const Erreur = ({ erreur }: { erreur: NonNullable<Etat['erreur']> }) => (
  <span className="notak-lecteur-erreur" role="alert">
    {t(erreur === 'type' ? 'lecteur.typeNonPris' : 'lecteur.erreurLecture')}
  </span>
)

/** Le son : une bande de 50 px, lecture ronde, volume, progression et durée. */
export function LecteurSon({ adresse, boucle, auto }: { adresse: string; boucle: boolean; auto: boolean }) {
  const ref = useRef<HTMLAudioElement>(null)
  const m = useMedia(ref, adresse, boucle, auto)
  const { etat } = m
  return (
    <div className="notak-lecteur-son" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <audio ref={ref} src={adresse} preload="metadata" />
      {etat.erreur ? (
        <Erreur erreur={etat.erreur} />
      ) : (
        <>
          <button type="button" className="notak-lecteur-lecture" aria-label={t(etat.lit ? 'lecteur.pause' : 'lecteur.lecture')} onClick={m.basculer}>
            <Icone nom={etat.lit ? 'pause' : 'lecture'} taille={16} />
          </button>
          <Volume etat={etat} volume={m.volume} muet={m.muet} />
          <Curseur valeur={etat.duree ? etat.courant / etat.duree : 0} onChange={m.aller} libelle={t('lecteur.progression')} classe="notak-curseur-progression" />
          <span className="notak-lecteur-temps">{tempsLisible(etat.courant, etat.duree)}</span>
        </>
      )}
    </div>
  )
}

/**
 * La vidéo : sa première image, un cercle de lecture au centre (40 % du plus petit côté, de 20 à 56 px), puis une barre
 * de contrôle sur l'image — lecture, volume, progression, durée, plein écran — visible au survol ou si la carte est choisie.
 */
export function LecteurVideo({ adresse, boucle, auto }: { adresse: string; boucle: boolean; auto: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const boite = useRef<HTMLDivElement>(null)
  const m = useMedia(ref, adresse, boucle, auto)
  const { etat } = m
  const [diametre, setDiametre] = useState(56)
  useEffect(() => {
    const b = boite.current
    if (!b) return
    const mesurer = () => setDiametre(Math.max(20, Math.min(56, Math.min(b.clientWidth, b.clientHeight) * 0.4)))
    mesurer()
    const obs = new ResizeObserver(mesurer)
    obs.observe(b)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={boite} className="notak-lecteur-video" data-lit={etat.lit || undefined} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <video ref={ref} src={adresse} preload="metadata" playsInline onClick={m.basculer} />
      {etat.erreur ? (
        <Erreur erreur={etat.erreur} />
      ) : (
        <>
          {!etat.lit && (
            <button type="button" className="notak-lecteur-rond" style={{ width: diametre, height: diametre }} aria-label={t('lecteur.lecture')} onClick={m.basculer}>
              <Icone nom="lecture" taille={Math.round(diametre * 0.45)} />
            </button>
          )}
          <div className="notak-lecteur-barre">
            <button type="button" className="notak-lecteur-bouton" aria-label={t(etat.lit ? 'lecteur.pause' : 'lecteur.lecture')} onClick={m.basculer}>
              <Icone nom={etat.lit ? 'pause' : 'lecture'} taille={14} />
            </button>
            <Volume etat={etat} volume={m.volume} muet={m.muet} />
            <Curseur valeur={etat.duree ? etat.courant / etat.duree : 0} onChange={m.aller} libelle={t('lecteur.progression')} classe="notak-curseur-progression" />
            <span className="notak-lecteur-temps">{tempsLisible(etat.courant, etat.duree)}</span>
            <button type="button" className="notak-lecteur-bouton" aria-label={t('lecteur.pleinEcran')} onClick={() => void ref.current?.requestFullscreen?.().catch(() => {})}>
              <Icone nom="pleinEcran" taille={14} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
