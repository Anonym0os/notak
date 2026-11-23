/** Lit un corps de requête jusqu'à `max` octets : `null` s'il est vide, `'trop gros'` s'il dépasse (la lecture s'arrête alors). */
export async function lireBorne(flux: ReadableStream<Uint8Array> | null, max: number): Promise<Buffer | null | 'trop gros'> {
  if (!flux) return null
  const morceaux: Uint8Array[] = []
  let taille = 0
  const lecteur = flux.getReader()
  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    taille += value.length
    if (taille > max) {
      void lecteur.cancel().catch(() => {})
      return 'trop gros'
    }
    morceaux.push(value)
  }
  return taille === 0 ? null : Buffer.concat(morceaux)
}
