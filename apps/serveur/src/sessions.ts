import { createHash, randomBytes } from 'node:crypto'

export const NOM_COOKIE = 'notak_session'
export const DUREE_SESSION_S = 30 * 24 * 3600

/** Un jeton aléatoire de 32 octets, et son empreinte : seule l'empreinte va en base. */
export function nouveauJeton(): { jeton: string; empreinte: string } {
  const jeton = randomBytes(32).toString('base64url')
  return { jeton, empreinte: empreinteDe(jeton) }
}

export function empreinteDe(jeton: string): string {
  return createHash('sha256').update(jeton).digest('hex')
}

/** La valeur du cookie `nom` dans un en-tête `Cookie`. */
export function lireCookie(entete: string | null | undefined, nom: string): string | null {
  if (!entete) return null
  for (const morceau of entete.split(';')) {
    const egal = morceau.indexOf('=')
    if (egal < 0) continue
    if (morceau.slice(0, egal).trim() !== nom) continue
    const valeur = morceau.slice(egal + 1).trim()
    try {
      return decodeURIComponent(valeur.replace(/^"|"$/g, ''))
    } catch {
      return null
    }
  }
  return null
}

export function cookieSession(jeton: string, securise: boolean): string {
  return `${NOM_COOKIE}=${jeton}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DUREE_SESSION_S}${securise ? '; Secure' : ''}`
}

export function cookieEfface(securise: boolean): string {
  return `${NOM_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${securise ? '; Secure' : ''}`
}
