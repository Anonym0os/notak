import { ErreurApercu, ouvrir, sousDelai } from './apercu.ts'

// La découverte OIDC d'un fournisseur d'identité d'entreprise : son document `.well-known/openid-configuration`
// donne les adresses où envoyer la personne et vérifier ses jetons. Better Auth ne la fait que vers des origines
// déclarées d'avance, ce qui ne va pas à des fournisseurs déclarés espace par espace : Notak la fait donc lui-même,
// avec la même garde que pour les aperçus de liens (pas d'adresse du réseau local, redirections vérifiées). Un
// fournisseur sur le réseau interne passe s'il est déclaré par l'administrateur du serveur (`NOTAK_IDP_INTERNES`).

export interface AdressesOidc {
  discoveryEndpoint: string
  authorizationEndpoint: string
  tokenEndpoint: string
  jwksEndpoint: string
  userInfoEndpoint?: string
}

const sansBarre = (u: string) => u.replace(/\/+$/, '')

export async function decouvrirOidc(emetteur: string, internes: readonly string[], lire: typeof fetch = fetch): Promise<AdressesOidc> {
  let u: URL
  try {
    u = new URL(emetteur)
  } catch {
    throw new Error('émetteur illisible')
  }
  const interne = internes.includes(u.origin)
  if (u.protocol !== 'https:' && !interne) throw new Error('l’émetteur doit être en https')
  const adresse = `${sansBarre(emetteur)}/.well-known/openid-configuration`

  let doc: Record<string, unknown>
  try {
    doc = await sousDelai(async (signal) => {
      const reponse = interne ? await lire(adresse, { signal, redirect: 'error' }) : (await ouvrir(adresse, signal, 'application/json')).reponse
      if (!reponse.ok) throw new Error(`découverte : statut ${reponse.status}`)
      return (await reponse.json()) as Record<string, unknown>
    })
  } catch (e) {
    throw new Error(e instanceof ErreurApercu ? `découverte impossible (${e.cause})` : (e as Error).message)
  }

  // Le document doit parler pour cet émetteur-là : sinon un autre pourrait se faire passer pour lui.
  if (typeof doc.issuer !== 'string' || sansBarre(doc.issuer) !== sansBarre(emetteur)) throw new Error('le document ne vient pas de cet émetteur')
  const champ = (nom: string, requis: boolean): string | undefined => {
    const v = doc[nom]
    if (v === undefined && !requis) return undefined
    if (typeof v !== 'string') throw new Error(`le document n’a pas de ${nom}`)
    const w = new URL(v)
    if (w.protocol !== 'https:' && !internes.includes(w.origin)) throw new Error(`${nom} n’est pas en https`)
    return v
  }
  return {
    discoveryEndpoint: adresse,
    authorizationEndpoint: champ('authorization_endpoint', true)!,
    tokenEndpoint: champ('token_endpoint', true)!,
    jwksEndpoint: champ('jwks_uri', true)!,
    userInfoEndpoint: champ('userinfo_endpoint', false),
  }
}
