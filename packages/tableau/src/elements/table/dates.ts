import { serieDe } from './actions'
import { serieVersDate } from './formules'

/**
 * Le calendrier de la table parle en jours « 2026-02-01 » (et « 2026-02-01 14:30 » avec l'heure), la cellule en
 * numéros de série. Ces deux fonctions font le pont.
 */

const deux = (n: number) => String(n).padStart(2, '0')

/** Le jour (et l'heure, s'il y en a une) d'un numéro de série ; `null` si le texte n'en est pas un. */
export function isoDeSerie(brut: string): string | null {
  const t = brut.trim()
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  if (n < 1 || n > 2_958_465) return null
  const d = serieVersDate(n)
  const jour = `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
  if (n - Math.floor(n) < 1e-9) return jour
  return `${jour} ${deux(d.getHours())}:${deux(d.getMinutes())}${d.getSeconds() ? `:${deux(d.getSeconds())}` : ''}`
}

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/

/** Les deux moitiés d'un texte du calendrier. */
export function moitiesIso(texte: string): { jour: string; heure: string } | null {
  const m = RE_ISO.exec(texte.trim())
  if (!m) return null
  return { jour: `${m[1]}-${m[2]}-${m[3]}`, heure: m[4] ? `${m[4]}:${m[5]}${m[6] ? `:${m[6]}` : ''}` : '' }
}

/** Le numéro de série d'un texte du calendrier ; `null` si ce n'en est pas un. */
export function serieDeIso(texte: string): string | null {
  const m = RE_ISO.exec(texte.trim())
  if (!m) return null
  const jour = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (jour.getMonth() !== Number(m[2]) - 1) return null
  return serieDe(jour, Number(m[4] ?? 0) * 3600 + Number(m[5] ?? 0) * 60 + Number(m[6] ?? 0))
}
