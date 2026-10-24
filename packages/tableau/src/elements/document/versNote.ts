import { getSchema } from '@tiptap/react'
import type { DocumentTexte, NoeudTexte, Note } from '../../coeur/tableau'
import { degrader } from '../../blocs/lisible'
import { documentEnNote } from '../note/conversion'
import { EXTENSIONS_NOTE } from '../note/extensions'

const SCHEMA_NOTE = getSchema(EXTENSIONS_NOTE)

/** Les titres au deuxième rang au plus : la note n'en a pas de troisième. */
function titresAuPlus2(n: NoeudTexte): NoeudTexte {
  const attrs = n.type === 'heading' && Number(n.attrs?.level) > 2 ? { ...n.attrs, level: 2 } : n.attrs
  return { ...n, ...(attrs ? { attrs } : {}), ...(n.content ? { content: n.content.map(titresAuPlus2) } : {}) }
}

/**
 * Un document devient une note : les blocs que la note ne sait pas dessiner (dépliants, colonnes, tâches, images)
 * sont défaits en ce qu'elle connaît, sans perdre leur texte (docs/NOTION.md § 1).
 */
export const documentVersNote = (c: DocumentTexte): Note => documentEnNote({ ...c, texte: degrader(titresAuPlus2(c.texte), SCHEMA_NOTE) })
