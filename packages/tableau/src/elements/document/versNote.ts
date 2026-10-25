import { getSchema } from '@tiptap/react'
import type { DocumentTexte, NoeudTexte, Note } from '../../coeur/tableau'
import { degrader } from '../../blocs/lisible'
import { aplatir, deplier } from '../../blocs/migration'
import { documentEnNote } from '../note/conversion'
import { EXTENSIONS_NOTE } from '../note/extensions'

const SCHEMA_NOTE = getSchema(EXTENSIONS_NOTE)

/** Les titres au deuxième rang au plus : la note n'en a pas de troisième. */
function titresAuPlus2(n: NoeudTexte): NoeudTexte {
  const attrs = n.type === 'heading' && Number(n.attrs?.level) > 2 ? { ...n.attrs, level: 2 } : n.attrs
  return { ...n, ...(attrs ? { attrs } : {}), ...(n.content ? { content: n.content.map(titresAuPlus2) } : {}) }
}

/**
 * Une carte d'aperçu de lien (`apercuLien`) n'existe pas dans la note : elle devient un paragraphe dont le titre (à défaut,
 * l'adresse) est un lien vers l'adresse. Une carte sans adresse n'a rien à garder.
 */
function cartesEnLiens(n: NoeudTexte): NoeudTexte[] {
  if (n.type === 'apercuLien') {
    const url = typeof n.attrs?.url === 'string' ? n.attrs.url : ''
    const titre = typeof n.attrs?.titre === 'string' && n.attrs.titre.trim() ? n.attrs.titre.trim() : url
    return url ? [{ type: 'paragraph', content: [{ type: 'text', text: titre, marks: [{ type: 'link', attrs: { href: url } }] }] }] : []
  }
  return [n.content ? { ...n, content: n.content.flatMap(cartesEnLiens) } : n]
}

/**
 * Un document devient une note : les blocs que la note ne sait pas dessiner (dépliants, colonnes, tâches, images)
 * sont défaits en ce qu'elle connaît, sans perdre leur texte (docs/NOTION.md § 1).
 */
export const documentVersNote = (c: DocumentTexte): Note => documentEnNote({ ...c, texte: degrader(titresAuPlus2(cartesEnLiens(deplier(aplatir(c.texte)))[0]!), SCHEMA_NOTE) })
