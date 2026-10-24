import { Node as NoeudPM, type Schema } from '@tiptap/pm/model'
import type { NoeudTexte } from '../coeur/tableau'

/**
 * Le garde-fou des versions (docs/NOTION.md § 1) : un texte écrit par une version plus récente de Notak peut porter
 * des blocs ou des marques que ce schéma ignore. Tiptap remplacerait alors le texte par un document vide, que la
 * première frappe enregistrerait. Un tel texte s'ouvre en lecture seule, et se dessine dégradé.
 */

/** Le texte se lit-il entièrement avec ce schéma ? */
export function lisible(texte: NoeudTexte, schema: Schema): boolean {
  try {
    NoeudPM.fromJSON(schema, texte).check()
    return true
  } catch {
    return false
  }
}

/** Le texte brut d'un nœud, ses blocs séparés. */
function texteDe(n: NoeudTexte): string {
  if (n.text !== undefined) return n.text
  return (n.content ?? []).map(texteDe).join('')
}

/**
 * Le texte réduit à ce que le schéma connaît, pour le montrer sans rien perdre de lisible : une marque inconnue est
 * ôtée, un nœud en ligne inconnu devient son texte, un bloc inconnu devient ses blocs connus (ou un paragraphe de son
 * texte). Un nœud connu dont le contenu ne convient plus est réduit de même.
 */
export function degrader(texte: NoeudTexte, schema: Schema): NoeudTexte {
  if (lisible(texte, schema)) return texte
  const blocs = (texte.content ?? []).flatMap((b) => bloc(b, schema))
  return { type: 'doc', content: blocs.length ? blocs : [{ type: 'paragraph' }] }
}

function bloc(n: NoeudTexte, schema: Schema): NoeudTexte[] {
  const type = schema.nodes[n.type]
  if (type && lisible({ type: 'doc', content: [n] }, schema)) return [n]
  // Un bloc connu de texte (paragraphe, titre) garde son type, son contenu réduit au texte et aux marques connues.
  if (type?.isTextblock) {
    const reduit = { ...n, content: enLigne(n.content ?? [], schema) }
    if (lisible({ type: 'doc', content: [reduit] }, schema)) return [reduit]
  }
  // Un bloc qui contient des blocs : on garde ce qui se lit dedans.
  if ((n.content ?? []).some((e) => e.text === undefined && !schema.nodes[e.type]?.isInline)) {
    const dedans = (n.content ?? []).flatMap((e) => bloc(e, schema))
    if (dedans.length) return dedans
  }
  const ecrit = texteDe(n)
  return ecrit ? [{ type: 'paragraph', content: [{ type: 'text', text: ecrit }] }] : []
}

function enLigne(contenu: NoeudTexte[], schema: Schema): NoeudTexte[] {
  return contenu.flatMap((n): NoeudTexte[] => {
    if (n.text !== undefined) {
      const marks = n.marks?.filter((m) => schema.marks[m.type])
      return n.text ? [{ type: 'text', text: n.text, ...(marks?.length ? { marks } : {}) }] : []
    }
    if (schema.nodes[n.type]?.isInline && lisible({ type: 'doc', content: [{ type: 'paragraph', content: [n] }] }, schema)) return [n]
    const ecrit = texteDe(n)
    return ecrit ? [{ type: 'text', text: ecrit }] : []
  })
}
