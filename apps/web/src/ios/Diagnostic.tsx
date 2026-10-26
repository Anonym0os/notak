import { useEffect, useRef, useState } from 'react'
import { type InfosAppareil, idiome, infosAppareil, plateforme } from '../appareil'
import { t } from '../langue'
import { Marque } from '../PageApp'
import { type Capacite, type ReleveStylet, capacites, releveEnTexte, releverStylet } from './diagnostic'

/**
 * La page `/diagnostic` : ce que la webview sait faire, ce que l'appareil dit de lui, ce qu'un stylet envoie quand
 * on dessine dans le carré, et le clavier. Rien n'en part : le bouton copie le relevé pour le coller dans
 * `docs/IOS.md` (phase 0) ou dans un signalement.
 */
export function PageDiagnostic() {
  const [infos, setInfos] = useState<InfosAppareil | null>(null)
  const [stockage, setStockage] = useState<unknown>(null)
  const [stylet, setStylet] = useState<ReleveStylet | null>(null)
  const [survols, setSurvols] = useState(0)
  const [copie, setCopie] = useState(false)
  const [clavier, setClavier] = useState('0px')
  const carre = useRef<HTMLCanvasElement>(null)
  const liste: Capacite[] = capacites(window as unknown as Parameters<typeof capacites>[0])
  const p = plateforme()
  const i = idiome()

  useEffect(() => {
    void infosAppareil().then(setInfos)
    void navigator.storage?.estimate?.().then(setStockage, () => setStockage(null))
  }, [])

  // Le carré : chaque événement de stylet ou de doigt y laisse un point, large comme sa pression.
  useEffect(() => {
    const c = carre.current
    if (!c) return
    const ctx = c.getContext('2d')
    const echelle = window.devicePixelRatio || 1
    c.width = c.clientWidth * echelle
    c.height = c.clientHeight * echelle
    const relever = (e: PointerEvent) => {
      const r = releverStylet(e)
      setStylet(r)
      if (r.survol) setSurvols((n) => n + 1)
      if (!ctx || e.buttons === 0) return
      const rect = c.getBoundingClientRect()
      const points = e.getCoalescedEvents?.() ?? [e]
      ctx.fillStyle = e.pointerType === 'pen' ? '#2f6feb' : e.pointerType === 'touch' ? '#e8729f' : '#3c9d5b'
      for (const q of points.length ? points : [e]) {
        const rayon = (1 + 6 * (q.pressure || 0.3)) * echelle
        ctx.beginPath()
        ctx.arc((q.clientX - rect.left) * echelle, (q.clientY - rect.top) * echelle, rayon, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    c.addEventListener('pointerdown', relever)
    c.addEventListener('pointermove', relever)
    c.addEventListener('pointerup', relever)
    return () => {
      c.removeEventListener('pointerdown', relever)
      c.removeEventListener('pointermove', relever)
      c.removeEventListener('pointerup', relever)
    }
  }, [])

  useEffect(() => {
    const lire = () => setClavier(getComputedStyle(document.documentElement).getPropertyValue('--clavier').trim() || '0px')
    const o = new MutationObserver(lire)
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-clavier'] })
    return () => o.disconnect()
  }, [])

  const copier = async () => {
    const texte = releveEnTexte({ plateforme: p, idiome: i, agent: navigator.userAgent, infos, capacites: liste, stylet, stockage })
    try {
      await navigator.clipboard.writeText(texte)
      setCopie(true)
      setTimeout(() => setCopie(false), 2000)
    } catch {
      // Sans presse-papiers, le relevé reste lisible à l'écran.
    }
  }

  return (
    <main className="arrivee diagnostic">
      <div className="arrivee-carte">
        <Marque />
        <h1>{t('diag.titre')}</h1>

        <h2>{t('diag.appareil')}</h2>
        <dl className="diagnostic-liste">
          <dt>plateforme</dt>
          <dd>
            {p} · {i}
          </dd>
          {infos && (
            <>
              <dt>coque</dt>
              <dd>
                {infos.plateforme} {infos.systeme} · {infos.modele} · {infos.version} ({infos.build})
              </dd>
              {infos.zonesSures && (
                <>
                  <dt>zones sûres</dt>
                  <dd>
                    {infos.zonesSures.haut} / {infos.zonesSures.droite} / {infos.zonesSures.bas} / {infos.zonesSures.gauche}
                  </dd>
                </>
              )}
            </>
          )}
          <dt>écran</dt>
          <dd>
            {window.innerWidth}×{window.innerHeight} @{window.devicePixelRatio} · {navigator.maxTouchPoints} {t('diag.points')}
          </dd>
          <dt>agent</dt>
          <dd className="diagnostic-agent">{navigator.userAgent}</dd>
          {stockage !== null && (
            <>
              <dt>stockage</dt>
              <dd>{JSON.stringify(stockage)}</dd>
            </>
          )}
        </dl>

        <h2>{t('diag.capacites')}</h2>
        <ul className="diagnostic-capacites">
          {liste.map((c) => (
            <li key={c.nom} data-attendu={c.attenduSurIos} data-present={c.present || undefined}>
              <span>{c.present ? '✅' : '—'}</span>
              <code>{c.nom}</code>
              {p === 'ios' && c.attenduSurIos !== 'indifferent' && (c.attenduSurIos === 'present') !== c.present && <em>{t('diag.inattendu')}</em>}
            </li>
          ))}
        </ul>

        <h2>{t('diag.pencil')}</h2>
        <p>{t('diag.pencilAide')}</p>
        <canvas ref={carre} className="diagnostic-carre" />
        {stylet && (
          <dl className="diagnostic-liste">
            <dt>pointerType</dt>
            <dd>{stylet.type}</dd>
            <dt>pressure</dt>
            <dd>{stylet.pression}</dd>
            <dt>tilt</dt>
            <dd>
              {stylet.inclinaisonX} / {stylet.inclinaisonY}
            </dd>
            <dt>altitude / azimut</dt>
            <dd>
              {stylet.altitude ?? '—'} / {stylet.azimut ?? '—'}
            </dd>
            <dt>coalesced / predicted</dt>
            <dd>
              {stylet.groupes} / {stylet.predits}
            </dd>
            <dt>{t('diag.survol')}</dt>
            <dd>{survols}</dd>
          </dl>
        )}

        <h2>{t('diag.clavier')}</h2>
        <p>{t('diag.clavierAide')}</p>
        <input type="text" className="champ" placeholder="…" />
        <dl className="diagnostic-liste">
          <dt>--clavier</dt>
          <dd>{clavier}</dd>
          <dt>visualViewport</dt>
          <dd>
            {window.visualViewport ? `${Math.round(window.visualViewport.width)}×${Math.round(window.visualViewport.height)}` : '—'}
          </dd>
        </dl>

        <div className="diagnostic-actions">
          <button type="button" className="bouton bouton-plein" onClick={() => void copier()}>
            {copie ? t('diag.copie') : t('diag.copier')}
          </button>
          <a className="bouton" href="/">
            {t('arrivee.ouvrir')}
          </a>
        </div>
      </div>
    </main>
  )
}
