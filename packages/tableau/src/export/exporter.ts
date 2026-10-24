import type { ContenuLu, ElementLu, NoeudTexte, TableauLu } from './contenu.ts'

/** `md` : Markdown ; `txt` : texte brut, sans aucun signe de mise en forme. */
export type FormatExport = 'md' | 'txt'

export const estFormatExport = (v: unknown): v is FormatExport => v === 'md' || v === 'txt'

const chaine = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * La langue des quelques mots que l'export écrit lui-même (« Tableau : », « Non triés »). Ce n'est pas un
 * dictionnaire d'interface : le reste de l'export est le texte de l'utilisateur, tel quel.
 */
export type LangueExport = 'fr' | 'en'

export const langueExport = (v: unknown): LangueExport => (v === 'en' ? 'en' : 'fr')

const MOTS: Record<LangueExport, { tableau: string; image: string; fichier: string; resolu: string; sansTitre: string; nonTries: string; deuxPoints: string }> = {
  fr: { tableau: 'Tableau', image: 'Image', fichier: 'Fichier', resolu: 'résolu', sansTitre: 'Sans titre', nonTries: 'Non triés', deuxPoints: ' : ' },
  en: { tableau: 'Board', image: 'Image', fichier: 'File', resolu: 'resolved', sansTitre: 'Untitled', nonTries: 'Unsorted', deuxPoints: ': ' },
}

interface Rendu {
  md: boolean
  titreDe(id: string): string | undefined
  mots: (typeof MOTS)[LangueExport]
}

// ---- Le texte riche (Tiptap) ----

function enveloppe(texte: string, marques: NonNullable<NoeudTexte['marks']>, r: Rendu): string {
  if (!r.md || texte.trim() === '') return texte
  // Les espaces du bord restent dehors : `** gras**` ne fait pas du gras en Markdown.
  const [, avant = '', coeur = '', apres = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(texte) ?? []
  let sortie = coeur
  for (const m of marques) {
    if (m.type === 'bold') sortie = `**${sortie}**`
    else if (m.type === 'italic') sortie = `*${sortie}*`
    else if (m.type === 'strike') sortie = `~~${sortie}~~`
    else if (m.type === 'code') sortie = `\`${sortie}\``
    else if (m.type === 'link' && chaine(m.attrs?.href)) sortie = `[${sortie}](${chaine(m.attrs?.href)})`
  }
  return avant + sortie + apres
}

function enLigne(n: NoeudTexte, r: Rendu): string {
  if (n.type === 'hardBreak') return r.md ? '  \n' : '\n'
  if (n.text !== undefined) return enveloppe(n.text, n.marks ?? [], r)
  return (n.content ?? []).map((c) => enLigne(c, r)).join('')
}

const indenter = (lignes: string[], marge: string) => lignes.map((l) => (l === '' ? l : marge + l))

/** Les lignes d'un bloc ; `decalage` descend les titres d'une note sous ceux du tableau et des colonnes. */
function blocs(noeuds: readonly NoeudTexte[], r: Rendu, decalage: number, serre = false): string[] {
  const sortie: string[] = []
  for (const n of noeuds) {
    const lignes = bloc(n, r, decalage)
    if (lignes.length === 0) continue
    if (sortie.length > 0 && !serre) sortie.push('')
    sortie.push(...lignes)
  }
  return sortie
}

function elementsDeListe(n: NoeudTexte, r: Rendu, decalage: number): string[] {
  const sortie: string[] = []
  const debut = Number(n.attrs?.start ?? 1)
  ;(n.content ?? []).forEach((item, i) => {
    const interne = blocs(item.content ?? [], r, decalage, true)
    const marque =
      n.type === 'orderedList'
        ? `${(Number.isFinite(debut) ? debut : 1) + i}. `
        : n.type === 'taskList'
          ? item.attrs?.checked === true
            ? '[x] '
            : '[ ] '
          : ''
    const puce = n.type === 'orderedList' ? marque : r.md || n.type === 'bulletList' ? `- ${marque}` : marque
    const [premiere = '', ...suite] = interne
    sortie.push(puce + premiere, ...indenter(suite, ' '.repeat(puce.length)))
  })
  return sortie
}

function bloc(n: NoeudTexte, r: Rendu, decalage: number): string[] {
  switch (n.type) {
    case 'paragraph': {
      const t = enLigne(n, r)
      return t === '' ? [] : t.split('\n')
    }
    case 'heading': {
      const niveau = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1)) + decalage)
      const t = enLigne(n, r)
      return t === '' ? [] : [r.md ? `${'#'.repeat(niveau)} ${t}` : t]
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return elementsDeListe(n, r, decalage)
    case 'blockquote':
      return indenter(blocs(n.content ?? [], r, decalage), '> ').map((l) => (l === '' ? '>' : l))
    case 'codeBlock': {
      const code = (n.content ?? []).map((c) => c.text ?? '').join('')
      return r.md ? ['```' + chaine(n.attrs?.language), ...code.split('\n'), '```'] : code.split('\n')
    }
    case 'horizontalRule':
      return r.md ? ['---'] : []
    case 'listItem':
    case 'taskItem':
      return blocs(n.content ?? [], r, decalage)
    default:
      return n.content ? blocs(n.content, r, decalage) : n.text ? [n.text] : []
  }
}

/** Un texte riche en Markdown ou en texte brut. `decalage` : combien de niveaux de titre on le descend. */
export function texteRiche(n: NoeudTexte, format: FormatExport, titreDe: (id: string) => string | undefined = () => undefined, decalage = 0): string {
  return blocs(n.type === 'doc' ? (n.content ?? []) : [n], { md: format === 'md', titreDe, mots: MOTS.fr }, decalage).join('\n')
}

// ---- Les éléments ----

const doc = (v: unknown): NoeudTexte | null => (v && typeof v === 'object' ? (v as NoeudTexte) : null)

function titreDeLien(c: ContenuLu): string {
  const apercu = (c.apercu ?? {}) as Record<string, unknown>
  return chaine(c.titre) || chaine(apercu.titre) || chaine(c.url)
}

/** Les lignes d'un élément, ou rien s'il n'a pas de texte à donner (une ligne qui relie deux cartes). */
function lignesDe(e: ElementLu, r: Rendu, enfants: Map<string, ElementLu[]>, niveau: number): string[] {
  const c = e.contenu
  switch (c.type) {
    case 'note': {
      const d = doc(c.texte)
      if (!d) return []
      if (c.variante === 'titre') {
        const t = enLigne({ type: 'paragraph', content: d.content?.flatMap((p) => p.content ?? []) }, { ...r, md: false })
        return t === '' ? [] : [r.md ? `${'#'.repeat(Math.min(6, niveau))} ${t.replace(/\n/g, ' ')}` : t]
      }
      return blocs(d.content ?? [], r, niveau - 1)
    }
    case 'taches': {
      const d = doc(c.texte)
      const titre = chaine(c.titre)
      const liste = d ? blocs(d.content ?? [], r, niveau - 1) : []
      return [...(titre ? [r.md ? `**${titre}**` : titre] : []), ...(titre && liste.length ? [''] : []), ...liste]
    }
    case 'lien': {
      const titre = titreDeLien(c)
      const url = chaine(c.url)
      const apercu = (c.apercu ?? {}) as Record<string, unknown>
      const legende = chaine(c.legende) || chaine(apercu.description)
      const tete = r.md ? (url ? `[${titre}](${url})` : titre) : titre === url || !url ? titre : `${titre} (${url})`
      return legende && c.sansLegende !== true ? [tete, '', legende] : [tete]
    }
    case 'colonne': {
      const titre = chaine(c.titre)
      const entete = titre ? [r.md ? `${'#'.repeat(Math.min(6, niveau))} ${titre}` : titre] : []
      return assembler([entete, ...separes(enfants.get(e.id) ?? [], r, enfants, niveau + 1)])
    }
    case 'tableau': {
      const titre = r.titreDe(chaine(c.cible)) ?? chaine(c.titre)
      const ligne = `${r.mots.tableau}${r.mots.deuxPoints}${titre || r.mots.sansTitre}`
      return [r.md ? `*${ligne}*` : ligne]
    }
    case 'image': {
      const legende = chaine(c.legende)
      const ligne = `${r.mots.image}${legende ? `${r.mots.deuxPoints}${legende}` : ''}`
      return [r.md ? `*${ligne}*` : ligne]
    }
    case 'fichier': {
      const nom = chaine(c.titre) || chaine(c.nom)
      const ligne = `${r.mots.fichier}${r.mots.deuxPoints}${nom}`
      return [r.md ? `*${ligne}*` : ligne]
    }
    case 'arbre':
      return planDeCarte(c.sujets, r)
    case 'commentaire': {
      const messages = (c.messages as { auteur?: { nom?: string }; texte?: string }[] | undefined) ?? []
      const lignes = messages.map((m) => `${r.md ? '> ' : ''}${chaine(m.auteur?.nom)} : ${chaine(m.texte).replace(/\n/g, ' ')}`)
      if (lignes.length === 0) return []
      return c.resolu === true ? [...lignes, `${r.md ? '> ' : ''}(${r.mots.resolu})`] : lignes
    }
    default:
      return []
  }
}

/**
 * Une carte mentale, en plan : le central en tête, puis chaque sujet en liste indentée (en texte brut, deux espaces
 * par niveau). Les flottants suivent le central, à leur niveau. Lu sans le module de la carte : l'export tourne aussi
 * sur le serveur.
 */
function planDeCarte(brut: unknown, r: Rendu): string[] {
  type S = { parent?: unknown; ordre?: unknown; titre?: unknown; genre?: unknown }
  const sujets = Object.entries((brut && typeof brut === 'object' ? brut : {}) as Record<string, S>).filter(([, s]) => s && typeof s.titre === 'string')
  const enfants = new Map<string, [string, S][]>()
  for (const x of sujets) {
    if (typeof x[1].parent !== 'string' || x[1].genre === 'resume') continue
    const l = enfants.get(x[1].parent) ?? []
    l.push(x)
    enfants.set(x[1].parent, l)
  }
  const cle = (s: S) => chaine(s.ordre)
  for (const l of enfants.values()) l.sort(([a, x], [b, y]) => (cle(x) < cle(y) ? -1 : cle(x) > cle(y) ? 1 : a < b ? -1 : 1))
  const central = sujets.find(([, s]) => s.parent === undefined)
  if (!central) return []
  const sortie = [r.md ? `**${chaine(central[1].titre).replace(/\n/g, ' ')}**` : chaine(central[1].titre).replace(/\n/g, ' ')]
  const parcourir = (id: string, niveau: number, vus: Set<string>) => {
    for (const [e, s] of enfants.get(id) ?? []) {
      if (vus.has(e)) continue
      vus.add(e)
      sortie.push(`${'  '.repeat(niveau)}${r.md ? '- ' : ''}${chaine(s.titre).replace(/\n/g, ' ')}`)
      parcourir(e, niveau + 1, vus)
    }
  }
  parcourir(central[0], 0, new Set([central[0]]))
  return sortie
}

/** Les blocs de chaque enfant, un par élément qui a quelque chose à dire. */
function separes(liste: readonly ElementLu[], r: Rendu, enfants: Map<string, ElementLu[]>, niveau: number): string[][] {
  return liste.map((f) => lignesDe(f, r, enfants, niveau)).filter((l) => l.length > 0)
}

/** Des blocs de lignes, séparés par une ligne vide. */
function assembler(parties: readonly string[][]): string[] {
  const sortie: string[] = []
  for (const p of parties) {
    if (p.length === 0) continue
    if (sortie.length > 0) sortie.push('')
    sortie.push(...p)
  }
  return sortie
}

const comparer = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * L'ordre de lecture : de haut en bas, puis de gauche à droite ; ce qui est rangé dans une colonne la suit,
 * dans l'ordre de la colonne. Hors du compte : la corbeille et les lignes ; les non triés viennent à la fin.
 */
export function ordreDeLecture(elements: readonly ElementLu[]): { racines: ElementLu[]; enfants: Map<string, ElementLu[]>; nonTries: ElementLu[] } {
  const vivants = elements.filter((e) => e.corbeille === undefined)
  const ids = new Set(vivants.filter((e) => e.contenu.type === 'colonne').map((e) => e.id))
  const enfants = new Map<string, ElementLu[]>()
  const racines: ElementLu[] = []
  const nonTries: ElementLu[] = []
  for (const e of vivants) {
    if (e.contenu.type === 'ligne') continue
    if (e.parent && ids.has(e.parent)) {
      const l = enfants.get(e.parent) ?? []
      l.push(e)
      enfants.set(e.parent, l)
    } else if (e.nonTrie !== undefined) {
      nonTries.push(e)
    } else {
      racines.push(e)
    }
  }
  for (const l of enfants.values()) l.sort((a, b) => comparer(a.ordre ?? '', b.ordre ?? '') || comparer(a.id, b.id))
  racines.sort((a, b) => a.y - b.y || a.x - b.x || comparer(a.ordre ?? '', b.ordre ?? '') || comparer(a.id, b.id))
  nonTries.sort((a, b) => (a.nonTrie ?? 0) - (b.nonTrie ?? 0) || comparer(a.id, b.id))
  return { racines, enfants, nonTries }
}

/**
 * Le texte d'un tableau : son titre, puis chaque élément dans l'ordre de lecture (notes, listes de tâches,
 * liens, colonnes avec leur contenu, commentaires). Fonction pure : le tableau en entrée, une chaîne en sortie.
 * `titreDe` donne le titre d'un tableau imbriqué.
 */
export function exporterTexte(
  tableau: TableauLu,
  format: FormatExport,
  titreDe: (id: string) => string | undefined = () => undefined,
  langue: LangueExport = 'fr',
): string {
  const r: Rendu = { md: format === 'md', titreDe, mots: MOTS[langue] }
  const { racines, enfants, nonTries } = ordreDeLecture(tableau.elements)
  const titre = tableau.titre.trim() || r.mots.sansTitre
  const parties: string[][] = [[r.md ? `# ${titre}` : titre]]
  for (const e of racines) parties.push(lignesDe(e, r, enfants, 2))
  if (nonTries.length > 0) {
    parties.push([r.md ? `## ${r.mots.nonTries}` : r.mots.nonTries])
    for (const e of nonTries) parties.push(lignesDe(e, r, enfants, 3))
  }
  return assembler(parties).join('\n') + '\n'
}
