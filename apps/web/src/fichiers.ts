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

export const apercu = (url: string) =>
  fetch('/api/apercu?url=' + encodeURIComponent(url)).then((r) => (r.ok ? r.json() : Promise.reject(new Error('Aperçu indisponible'))))
