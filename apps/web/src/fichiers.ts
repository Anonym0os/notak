import type { DepotFichiers } from '@notak/tableau'

/** Les fichiers vivent sur le serveur : l'adresse d'un fichier est une route, le cookie de session suffit. */
export const adresseFichier = (id: string) => `/api/fichiers/${encodeURIComponent(id)}`

export async function envoyerFichier(blob: Blob): Promise<string> {
  const r = await fetch('/api/fichiers', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  })
  if (!r.ok) throw new Error(r.status === 413 ? 'Fichier trop gros (25 Mo au plus)' : 'Envoi impossible')
  return ((await r.json()) as { id: string }).id
}

export const fichiers: DepotFichiers = {
  enregistrer: envoyerFichier,
  adresse: async (id) => adresseFichier(id),
}

/** Un aperçu manqué porte sa cause (`introuvable`, `refuse`…) : la carte la dit. */
export async function apercu(url: string) {
  const r = await fetch('/api/apercu?url=' + encodeURIComponent(url), { credentials: 'same-origin' })
  if (r.ok) return r.json()
  const { cause } = (await r.json().catch(() => ({}))) as { cause?: unknown }
  throw new Error('Aperçu indisponible', { cause })
}
