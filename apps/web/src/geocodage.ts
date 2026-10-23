/** Où est cette adresse ? Nominatim, le géocodeur d'OpenStreetMap : une recherche à la fois, sans cookie ni jeton. */
export async function localiser(requete: string): Promise<{ lat: number; lon: number } | null> {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(requete)}`, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  })
  if (!r.ok) return null
  const [premier] = (await r.json()) as { lat: string; lon: string }[]
  const lat = Number(premier?.lat)
  const lon = Number(premier?.lon)
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
}
