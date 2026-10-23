import * as Y from 'yjs'

// Ce que le serveur sait lire d'un tableau, sans la toile : le document Yjs, ses éléments et leur texte.
// Les types restent à la mesure de ce dont le serveur a besoin ; la toile (React) ne se charge jamais ici.

/** Un nœud de texte riche, au format JSON de Tiptap. */
export interface NoeudTexte {
  type: string
  attrs?: Record<string, unknown>
  content?: NoeudTexte[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

export interface ContenuLu {
  type: string
  [champ: string]: unknown
}

export interface ElementLu {
  id: string
  x: number
  y: number
  largeur: number
  contenu: ContenuLu
  parent?: string
  ordre?: string
  corbeille?: number
  nonTrie?: number
  /** Ce que tout élément peut porter ; la publication ne montre pas les trois derniers. */
  etiquettes?: string[]
  echeance?: string
  commentaire?: unknown
  reactions?: unknown
  assigne?: unknown
}

export interface TableauLu {
  titre: string
  couleur?: string
  /** Du plus bas au plus haut dans l'empilement. */
  elements: ElementLu[]
}

/** Le tableau d'un document Yjs, sans le plan d'empilement : ce que lit l'export, la recherche, la publication. */
export function lireTableau(doc: Y.Doc): TableauLu {
  const meta = doc.getMap<unknown>('meta')
  const brutes: { plan: string; id: string; element: ElementLu }[] = []
  doc.getMap<Record<string, unknown>>('elements').forEach((brut, id) => {
    // Un client a pu écrire n'importe quoi : seul un objet est un élément.
    if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) return
    const { plan, ...element } = brut
    if (!element.contenu || typeof (element.contenu as ContenuLu).type !== 'string') return
    brutes.push({ plan: typeof plan === 'string' ? plan : '', id, element: { ...(element as unknown as ElementLu), id } })
  })
  brutes.sort((a, b) => (a.plan < b.plan ? -1 : a.plan > b.plan ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const titre = meta.get('titre')
  const couleur = meta.get('couleur')
  return {
    titre: typeof titre === 'string' ? titre : '',
    ...(typeof couleur === 'string' ? { couleur } : {}),
    elements: brutes.map((b) => b.element),
  }
}

/** Le tableau d'un état Yjs enregistré. */
export function lireEtat(etat: Uint8Array): TableauLu {
  const doc = new Y.Doc()
  try {
    Y.applyUpdate(doc, etat)
    return lireTableau(doc)
  } finally {
    doc.destroy()
  }
}

/** Le texte d'un document, sans mise en forme : un bloc par ligne. */
export function texteBrut(n: NoeudTexte): string {
  if (n.text !== undefined) return n.text
  return (n.content ?? []).map(texteBrut).filter((t) => t !== '').join('\n')
}

const chaine = (v: unknown): string => (typeof v === 'string' ? v : '')
const doc = (v: unknown): NoeudTexte | null => (v && typeof v === 'object' ? (v as NoeudTexte) : null)

/** Tout le texte qu'on peut chercher dans un élément (comme la recherche de la toile). */
export function texteCherchable(e: ElementLu, titreDe: (id: string) => string | undefined): string {
  const c = e.contenu
  const apercu = (c.apercu ?? {}) as Record<string, unknown>
  switch (c.type) {
    case 'note': {
      const d = doc(c.texte)
      return d ? texteBrut(d) : ''
    }
    case 'taches': {
      const d = doc(c.texte)
      return [chaine(c.titre), d ? texteBrut(d) : ''].join('\n')
    }
    case 'lien':
      return [c.titre, c.legende, apercu.titre, apercu.description, c.url].map(chaine).filter(Boolean).join('\n')
    case 'colonne':
      return chaine(c.titre)
    case 'tableau':
      return titreDe(chaine(c.cible)) ?? chaine(c.titre)
    case 'image':
      return chaine(c.legende)
    case 'fichier':
      return [c.titre, c.nom].map(chaine).filter(Boolean).join('\n')
    case 'ligne':
      return chaine(c.libelle)
    case 'commentaire':
      return ((c.messages as { auteur?: { nom?: string }; texte?: string }[] | undefined) ?? [])
        .map((m) => `${chaine(m.auteur?.nom)}\n${chaine(m.texte)}`)
        .join('\n')
    default:
      return ''
  }
}

/** Les fichiers (images, pièces jointes) que portent ces éléments, avec le nom qu'on leur donnerait. */
export function fichiersDe(elements: readonly ElementLu[]): { id: string; nom: string; type: string }[] {
  const sortie: { id: string; nom: string; type: string }[] = []
  for (const e of elements) {
    if (e.corbeille !== undefined) continue
    const c = e.contenu
    if (c.type === 'image' && chaine(c.fichier)) {
      sortie.push({ id: chaine(c.fichier), nom: chaine(c.legende), type: chaine(c.typeMime) })
    } else if (c.type === 'fichier' && chaine(c.fichier)) {
      sortie.push({ id: chaine(c.fichier), nom: chaine(c.titre) || chaine(c.nom), type: chaine(c.typeMime) })
    }
  }
  return sortie
}

/** Tous les identifiants de fichier qu'un tableau montre, y compris les copies réduites d'une image et son original d'avant détourage. */
export function idsDeFichiers(elements: readonly ElementLu[]): Set<string> {
  const ids = new Set<string>()
  for (const e of elements) {
    if (e.corbeille !== undefined) continue
    const c = e.contenu
    if ((c.type === 'image' || c.type === 'fichier') && chaine(c.fichier)) ids.add(chaine(c.fichier))
    if (c.type === 'image' && Array.isArray(c.tailles)) {
      for (const t of c.tailles as { fichier?: unknown }[]) if (chaine(t?.fichier)) ids.add(chaine(t.fichier))
    }
    // « Rétablir l'original » le remontre : il doit rester servi.
    const o = c.type === 'image' ? (c.original as { fichier?: unknown; tailles?: unknown } | undefined) : undefined
    if (o && chaine(o.fichier)) ids.add(chaine(o.fichier))
    if (o && Array.isArray(o.tailles)) {
      for (const t of o.tailles as { fichier?: unknown }[]) if (chaine(t?.fichier)) ids.add(chaine(t.fichier))
    }
  }
  return ids
}
