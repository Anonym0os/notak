import { createHash, randomBytes } from 'node:crypto'

// Les sessions de compte sont à Better Auth (`auth.ts`) ; restent ici les jetons de Notak : jetons d'arrivée et
// accès aux liens publics protégés.

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

/** Le cookie qui porte l'accès au lien public d'un tableau protégé : limité aux adresses de ce lien. */
export function cookieAccesPublic(nom: string, jetonLien: string, acces: string, dureeS: number, securise: boolean): string {
  return `${nom}=${acces}; HttpOnly; SameSite=Lax; Path=/api/public/${jetonLien}; Max-Age=${dureeS}${securise ? '; Secure' : ''}`
}
