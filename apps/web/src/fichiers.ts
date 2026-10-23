import type { ChercheurBanque, DepotFichiers } from '@notak/tableau'
import { t } from './langue'

/** Les fichiers vivent sur le serveur : l'adresse d'un fichier est une route, le cookie de session suffit. */
export const adresseFichier = (id: string) => `/api/fichiers/${encodeURIComponent(id)}`

export async function envoyerFichier(blob: Blob): Promise<string> {
  const r = await fetch('/api/fichiers', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  })
  if (!r.ok) throw new Error(r.status === 413 ? t('fichiers.tropGros') : t('fichiers.envoiImpossible'))
  return ((await r.json()) as { id: string }).id
}

/** Une photo de compte n'a besoin que d'une petite copie : la plus étroite que le serveur sait servir. */
export const adressePhoto = (id: string) => `${adresseFichier(id)}?l=400`

export const fichiers: DepotFichiers = {
  enregistrer: envoyerFichier,
  adresse: async (id) => adresseFichier(id),
}

/** Un aperçu manqué porte sa cause (`introuvable`, `refuse`…) : la carte la dit. */
export async function apercu(url: string) {
  const r = await fetch('/api/apercu?url=' + encodeURIComponent(url), { credentials: 'same-origin' })
  if (r.ok) return r.json()
  const { cause } = (await r.json().catch(() => ({}))) as { cause?: unknown }
  throw new Error(t('fichiers.apercuIndispo'), { cause })
}

/** L'image d'une adresse, rangée avec les fichiers du tableau. La cause d'un refus voyage dans l'erreur. */
export async function rapatrier(url: string): Promise<{ id: string; type: string }> {
  const r = await fetch('/api/fichiers/rapatrier', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (r.ok) return r.json()
  const { cause } = (await r.json().catch(() => ({}))) as { cause?: unknown }
  throw new Error(t('fichiers.imageIndispo'), { cause })
}

/** La banque d'images : le serveur interroge le fournisseur avec sa clé. Sans clé (503), l'échec le dit en `cause`. */
export const banqueImages: ChercheurBanque = async (requete, page) => {
  const r = await fetch(`/api/images/recherche?q=${encodeURIComponent(requete)}&page=${page}`, { credentials: 'same-origin' })
  if (r.ok) return r.json()
  const { code } = (await r.json().catch(() => ({}))) as { code?: unknown }
  throw new Error(t('fichiers.imagesIndispo'), { cause: code === 'images_non_configurees' ? 'non_configuree' : 'indisponible' })
}
