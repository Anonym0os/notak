import { useEffect, useRef, useState } from 'react'
import { t } from '../../langue'
import { Separateur } from '../../communs'
import { Points, Popover, Section } from './controles-style'
import { MULTIPLE, type Mixte } from './modele/style'

/**
 * Le sélecteur de couleur de l'onglet Style, d'après celui de Xmind (docs/XMIND.md § 5 bis) : un bouton de 72 × 24 px
 * qui montre la couleur, et son popover : un nuancier de 9 × 5, un champ hexadécimal, l'opacité, la couleur du système,
 * les couleurs du thème, les récentes, et « Par défaut ». Réutilisable par les autres onglets.
 *
 * La valeur est une couleur `#rrggbb` (ou `#rrggbbaa` avec une opacité), une couleur CSS quelconque (la couleur effective
 * d'un thème, qui peut être une variable), `null` (aucune couleur : le bouton est barré) ou `MULTIPLE`.
 */

/**
 * Les 45 couleurs du nuancier, ligne par ligne : une ligne de gris, puis quatre lignes de neuf teintes, du plus clair au
 * plus sombre. → Notak : nos teintes (Xmind a les siennes, qu'on ne reprend pas).
 */
export const NUANCIER: readonly string[] = [
  '#ffffff', '#ecedee', '#d4d6d9', '#b3b7bc', '#8d939a', '#696f77', '#484c51', '#26282b', '#000000',
  '#fddd87', '#fd9787', '#87fdc2', '#87fded', '#87ddfd', '#87befd', '#878ffd', '#ca87fd', '#fd87be',
  '#f3c649', '#f36049', '#49f39e', '#49f3dd', '#49c6f3', '#4998f3', '#4954f3', '#a949f3', '#f34998',
  '#d3a117', '#d33017', '#17d375', '#17d3ba', '#17a1d3', '#176fd3', '#1724d3', '#8217d3', '#d3176f',
  '#8e6e15', '#8e2515', '#158e52', '#158e7e', '#156e8e', '#154e8e', '#151d8e', '#5a158e', '#8e154e',
]

const RECENTES = 'notak.arbre.couleursRecentes'
const RECENTES_MAX = 9

/** Les couleurs récentes, la plus récente en tête. */
export function lireRecentes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTES) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENTES_MAX) : []
  } catch {
    return []
  }
}

/** Retient une couleur : en tête, sans doublon, neuf au plus. */
export function memoriserRecente(c: string): string[] {
  const liste = [c, ...lireRecentes().filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, RECENTES_MAX)
  try {
    localStorage.setItem(RECENTES, JSON.stringify(liste))
  } catch {
    // Pas de stockage (fenêtre privée) : les récentes ne durent pas.
  }
  return liste
}

/** Ce que le champ hexadécimal accepte : les caractères qui ne sont pas hexadécimaux valent 0, trois chiffres se doublent, plus de six donnent blanc. */
export function normaliserHex(saisie: string): string {
  let h = saisie.replace(/^#/, '').toUpperCase()
  if (h.length > 6) return 'FFFFFF'
  h = h.replace(/[^0-9A-F]/g, '0')
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  return h.padEnd(6, '0')
}

/** Une couleur `#rrggbb` avec une opacité en pour cent : en `#rrggbbaa` sous 100. */
export function avecOpacite(hex6: string, pourcent: number): string {
  const base = hex6.slice(0, 7).toLowerCase()
  const p = Math.max(0, Math.min(100, Math.round(pourcent)))
  return p >= 100 ? base : `${base}${Math.round((p / 100) * 255).toString(16).padStart(2, '0')}`
}

/** `#rrggbb` ou `#rrggbbaa` en couleur et opacité (en pour cent) ; `null` pour une couleur CSS autre. */
export function decouperCouleur(c: string | null | undefined): { hex: string; opacite: number } | null {
  const m = c?.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i)
  return m ? { hex: m[1]!.toUpperCase(), opacite: m[2] ? Math.round((parseInt(m[2], 16) / 255) * 100) : 100 } : null
}

interface Props {
  valeur: Mixte<string | null | undefined>
  /** `undefined` : la couleur du thème (« Par défaut »). */
  choisir(c: string | undefined): void
  titre: string
  inactif?: boolean
  /** L'opacité la plus haute qu'on puisse poser, en pour cent (une limite : 20). */
  opaciteMax?: number
  /** Les couleurs du thème de la carte. */
  theme?: readonly string[]
  /** Sans « Par défaut » (une couleur qui doit rester posée). */
  sansDefaut?: boolean
  className?: string
}

/** Le bouton de couleur : la couleur à plat, un trait en pointillé quand il n'y en a pas, trois points quand elles diffèrent. */
export function BoutonCouleur({ valeur, choisir, titre, inactif, opaciteMax = 100, theme, sansDefaut, className }: Props) {
  const ancre = useRef<HTMLButtonElement>(null)
  const [ouvert, setOuvert] = useState(false)
  const multiple = valeur === MULTIPLE
  const aucune = valeur === null || valeur === undefined || !!inactif
  return (
    <>
      <button
        ref={ancre}
        type="button"
        className={`notak-arbre-style-couleur${className ? ` ${className}` : ''}`}
        title={titre}
        aria-label={titre}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        disabled={inactif}
        data-aucune={!multiple && aucune ? '' : undefined}
        style={!multiple && !aucune ? { background: valeur as string } : undefined}
        onClick={() => setOuvert((o) => !o)}
      >
        {multiple && <Points />}
        <span className="notak-arbre-style-couleur-pipette" aria-hidden="true" />
      </button>
      {ouvert && <Selecteur ancre={ancre} fermer={() => setOuvert(false)} valeur={valeur} choisir={choisir} opaciteMax={opaciteMax} {...(theme ? { theme } : {})} {...(sansDefaut ? { sansDefaut } : {})} />}
    </>
  )
}

function Selecteur({ ancre, fermer, valeur, choisir, opaciteMax = 100, theme, sansDefaut }: Omit<Props, 'titre' | 'inactif' | 'className'> & { ancre: React.RefObject<HTMLElement | null>; fermer(): void }) {
  const courante = typeof valeur === 'string' ? decouperCouleur(valeur) : null
  const [hex, setHex] = useState(courante?.hex ?? '')
  const [opacite, setOpacite] = useState(String(courante?.opacite ?? 100))
  const [recentes, setRecentes] = useState(lireRecentes)
  const change = useRef<string | null>(null)
  // La couleur posée est retenue à la fermeture, pas à chaque pastille effleurée.
  useEffect(
    () => () => {
      if (change.current) memoriserRecente(change.current)
    },
    [],
  )
  const poser = (hex6: string, pourcent?: number) => {
    const p = Math.min(pourcent ?? courante?.opacite ?? 100, opaciteMax)
    const c = avecOpacite(hex6.startsWith('#') ? hex6 : `#${hex6}`, p)
    setHex(hex6.replace('#', '').toUpperCase().slice(0, 6))
    setOpacite(String(p))
    change.current = c
    choisir(c)
  }
  const poserHex = () => {
    if (hex.trim() === '') return
    poser(normaliserHex(hex))
  }
  const poserOpacite = () => {
    const n = Math.max(0, Math.min(opaciteMax, Math.round(Number(opacite.replace('%', '')) || 0)))
    setOpacite(String(n))
    const base = courante?.hex ?? (hex ? normaliserHex(hex) : null)
    if (base) poser(base, n)
  }
  const grille = (couleurs: readonly string[], etiquette: string) => (
    <div className="notak-arbre-style-nuancier" role="group" aria-label={etiquette}>
      {couleurs.map((c, i) => {
        const choisie = courante ? courante.hex.toLowerCase() === c.slice(1).toLowerCase() : typeof valeur === 'string' && valeur.toLowerCase() === c.toLowerCase()
        return (
          <button
            key={`${c}${i}`}
            type="button"
            className="notak-arbre-style-pastille"
            style={{ background: c, ['--notak-arbre-style-anneau' as string]: c }}
            title={c.toUpperCase()}
            aria-label={c.toUpperCase()}
            aria-pressed={choisie}
            data-claire={clair(c) ? '' : undefined}
            onClick={() => {
              poser(c)
              setRecentes((r) => [c, ...r.filter((x) => x !== c)].slice(0, RECENTES_MAX))
              fermer()
            }}
          />
        )
      })}
    </div>
  )
  const apercu = typeof valeur === 'string' ? valeur : undefined
  return (
    <Popover ancre={ancre} fermer={fermer} largeur={264} className="notak-arbre-style-selecteur">
      {grille(NUANCIER, t('arbre.style.couleur'))}
      <div className="notak-arbre-style-personnaliser">
        <div className="notak-arbre-style-hex">
          <span className="notak-arbre-style-diese">#</span>
          <input
            className="notak-arbre-style-hex-champ"
            value={hex}
            maxLength={8}
            spellCheck={false}
            title={t('arbre.style.hexAide')}
            aria-label={t('arbre.style.hexAide')}
            onChange={(e) => setHex(e.target.value.replace('#', ''))}
            onBlur={poserHex}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), poserHex())}
          />
          <span className="notak-arbre-style-hex-sep" />
          <input
            className="notak-arbre-style-opacite-champ"
            value={opacite}
            maxLength={3}
            inputMode="numeric"
            title={t('arbre.style.opaciteAide')}
            aria-label={t('arbre.style.opaciteAide')}
            onChange={(e) => setOpacite(e.target.value)}
            onBlur={poserOpacite}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), poserOpacite())}
          />
          <span className="notak-arbre-style-pourcent">%</span>
        </div>
        <span className="notak-arbre-style-apercu" title={apercu}>
          <span style={apercu ? { background: apercu } : undefined} />
        </span>
        <label className="notak-arbre-style-systeme" title={t('arbre.style.plusDeCouleurs')}>
          <input
            type="color"
            aria-label={t('arbre.style.plusDeCouleurs')}
            value={courante ? `#${courante.hex.toLowerCase()}` : '#000000'}
            onChange={(e) => poser(e.target.value.slice(1).toUpperCase())}
          />
        </label>
      </div>
      {!sansDefaut && (
        <button type="button" className="notak-arbre-style-bouton notak-arbre-style-pleine notak-arbre-style-bouton-pied" onClick={() => (change.current = null, choisir(undefined), fermer())}>
          {t('arbre.style.parDefaut')}
        </button>
      )}
      {((theme?.length ?? 0) + recentes.length) > 0 && <Separateur className="notak-arbre-style-fort" />}
      {!!theme?.length && (
        <Section titre={t('arbre.style.themeActuel')}>{grille(theme, t('arbre.style.themeActuel'))}</Section>
      )}
      {recentes.length > 0 && <Section titre={t('arbre.style.recentes')}>{grille(recentes, t('arbre.style.recentes'))}</Section>}
    </Popover>
  )
}

/** Une pastille très claire : son anneau s'assombrit pour rester visible. */
function clair(c: string): boolean {
  const v = parseInt(c.slice(1, 7), 16)
  return ((v >> 16) & 255) + ((v >> 8) & 255) + (v & 255) > 650
}
