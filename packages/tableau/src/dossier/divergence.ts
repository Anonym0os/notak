import * as Y from 'yjs'

/**
 * Deux copies d'un tableau qui ont reçu les mêmes mises à jour ont le même contenu : c'est ce que Yjs garantit, tant
 * que personne n'écrit sous l'identité d'un autre. Un participant malveillant (ou une copie trafiquée) peut fabriquer
 * une mise à jour qui reprend l'identifiant et l'horloge d'un autre : Yjs garde alors, chez chacun, celle qu'il a
 * reçue en premier, et les copies divergent sans que rien ne le montre (C8).
 *
 * Pour le voir, chaque appareil publie, par tableau, son vecteur d'état et une empreinte de son contenu. Deux copies
 * au même vecteur d'état mais d'empreintes différentes ont divergé.
 *
 * L'empreinte ne dépend que du contenu : chaque unité vivante (un caractère, une valeur, un type), avec son
 * identifiant, son parent et sa clé. Le découpage des éléments, qui varie d'une copie à l'autre, n'y entre pas.
 */
export function texteCanonique(doc: Y.Doc): string {
  const racines = new Map<unknown, string>()
  for (const [nom, type] of doc.share) racines.set(type, nom)
  const unites: string[] = []
  for (const [client, structs] of doc.store.clients) {
    for (const s of structs) {
      if (!(s instanceof Y.Item) || s.deleted) continue
      const parent = s.parent as { _item?: Y.Item | null } | null
      const p = parent?._item ? `${parent._item.id.client}:${parent._item.id.clock}` : `/${racines.get(s.parent) ?? '?'}`
      const cle = s.parentSub ?? ''
      const contenu = s.content.getContent()
      for (let i = 0; i < s.length; i++) {
        const v = contenu.length === s.length ? contenu[i] : i === 0 ? contenu : undefined
        const valeur = v instanceof Y.AbstractType ? `#${genreDe(v)}` : v instanceof Y.Doc ? `#Doc:${v.guid}` : JSON.stringify(v ?? null)
        unites.push(`${client}:${s.id.clock + i}|${p}|${cle}|${valeur}`)
      }
    }
  }
  return unites.sort().join('\n')
}

/** Le genre d'un type partagé, sans dépendre du nom de sa classe (qu'une compilation peut raccourcir). */
function genreDe(v: Y.AbstractType<unknown>): string {
  if (v instanceof Y.XmlText) return 'XmlText'
  if (v instanceof Y.Text) return 'Text'
  if (v instanceof Y.XmlElement) return `XmlElement:${v.nodeName}`
  if (v instanceof Y.XmlFragment) return 'XmlFragment'
  if (v instanceof Y.Map) return 'Map'
  if (v instanceof Y.Array) return 'Array'
  return 'Type'
}

/** Une empreinte courte (128 bits) d'un texte ou d'octets. */
export async function empreinte(donnees: string | Uint8Array): Promise<string> {
  const entree = typeof donnees === 'string' ? new TextEncoder().encode(donnees) : donnees
  const octets = new Uint8Array(await crypto.subtle.digest('SHA-256', entree as Uint8Array<ArrayBuffer>))
  return Array.from(octets.subarray(0, 16), (o) => o.toString(16).padStart(2, '0')).join('')
}

export function versBase64(o: Uint8Array): string {
  let s = ''
  for (const x of o) s += String.fromCharCode(x)
  return btoa(s)
}
