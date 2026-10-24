import { t } from '../langue'

/**
 * Le catalogue du menu « / » et de « Transformer en » (docs/NOTION.md § 3) : chaque entrée a un nom, des mots-clés,
 * une catégorie, et ce qu'elle fait. Rien ici ne touche à l'éditeur.
 */

/** Ce en quoi un bloc de texte se transforme. */
export type Vers =
  | 'texte'
  | 'titre1'
  | 'titre2'
  | 'titre3'
  | 'puce'
  | 'numero'
  | 'tache'
  | 'deroulant'
  | 'titreDeroulant1'
  | 'titreDeroulant2'
  | 'titreDeroulant3'
  | 'citation'
  | 'encadre'
  | 'code'

/** Ce qu'on insère sans transformer : un bloc qui n'a pas de texte. */
export type Insertion = 'separateur' | 'image' | 'tableau' | 'colonnes2' | 'colonnes3' | 'colonnes4' | 'colonnes5'

/** Les couleurs d'un bloc ou d'un passage (NOTION.md § 1) ; `defaut` les retire. */
export const COULEURS = ['defaut', 'gris', 'brun', 'orange', 'jaune', 'vert', 'bleu', 'violet', 'rose', 'rouge'] as const
export type NomCouleur = (typeof COULEURS)[number]

/** Une couleur posée : le texte (`rouge`) ou le fond (`rouge-fond`). */
export type Couleur = { nom: NomCouleur; fond: boolean }

export const couleurEnAttribut = (c: Couleur): string | null => (c.nom === 'defaut' ? null : c.fond ? `${c.nom}-fond` : c.nom)

export function couleurDeAttribut(v: unknown): Couleur | null {
  if (typeof v !== 'string' || !v) return null
  const fond = v.endsWith('-fond')
  const nom = (fond ? v.slice(0, -5) : v) as NomCouleur
  return COULEURS.includes(nom) ? { nom, fond } : null
}

export type Action = 'dupliquer' | 'supprimer' | 'transformer'

export type Categorie = 'base' | 'medias' | 'miseEnPage' | 'couleurs' | 'actions'

export type Effet = { genre: 'vers'; vers: Vers } | { genre: 'inserer'; quoi: Insertion } | { genre: 'couleur'; couleur: Couleur } | { genre: 'action'; action: Action }

export interface Entree {
  id: string
  categorie: Categorie
  libelle: string
  /** Ce que la recherche lit en plus du nom, dans les deux langues. */
  mots: readonly string[]
  /** Un aperçu en un ou deux signes, dessiné dans la tuile de l'entrée. */
  signe: string
  /** La touche qui fait la même chose, à montrer à droite. */
  raccourci?: string
  effet: Effet
}

const vers = (id: Vers, signe: string, mots: string[], raccourci?: string): Entree => ({
  id,
  categorie: 'base',
  get libelle() {
    return t(`blocs.${id}`)
  },
  mots,
  signe,
  ...(raccourci ? { raccourci } : {}),
  effet: { genre: 'vers', vers: id },
})

const inserer = (id: Insertion, categorie: Categorie, signe: string, mots: string[]): Entree => ({
  id,
  categorie,
  get libelle() {
    return t(`blocs.${id}`)
  },
  mots,
  signe,
  effet: { genre: 'inserer', quoi: id },
})

/** Les blocs, dans l'ordre du menu. */
export const BLOCS: readonly Entree[] = [
  vers('texte', 'Aa', ['texte', 'paragraphe', 'text', 'plain', 'p'], '⌘⌥0'),
  vers('titre1', 'H1', ['titre', 'heading', 'h1', '#'], '⌘⌥1'),
  vers('titre2', 'H2', ['titre', 'heading', 'h2', '##'], '⌘⌥2'),
  vers('titre3', 'H3', ['titre', 'heading', 'h3', '###'], '⌘⌥3'),
  vers('tache', '☐', ['tache', 'case', 'cocher', 'todo', 'to-do', 'checkbox', 'task', '[]'], '⌘⌥4'),
  vers('puce', '•', ['puce', 'liste', 'bullet', 'list', 'ul', '-'], '⌘⌥5'),
  vers('numero', '1.', ['numero', 'numerotee', 'liste', 'numbered', 'number', 'ordered', 'ol', '1.'], '⌘⌥6'),
  vers('deroulant', '▸', ['deroulant', 'replier', 'deplier', 'toggle', 'collapse', '>'], '⌘⌥7'),
  vers('titreDeroulant1', '▸H1', ['titre', 'deroulant', 'toggle', 'heading', 'h1']),
  vers('titreDeroulant2', '▸H2', ['titre', 'deroulant', 'toggle', 'heading', 'h2']),
  vers('titreDeroulant3', '▸H3', ['titre', 'deroulant', 'toggle', 'heading', 'h3']),
  vers('citation', '❝', ['citation', 'quote', 'blockquote', '"']),
  vers('encadre', '💡', ['encadre', 'note', 'avertissement', 'callout', 'info', 'tip']),
  vers('code', '</>', ['code', 'programme', 'snippet', '```'], '⌘⌥8'),
  inserer('separateur', 'base', '—', ['separateur', 'ligne', 'divider', 'rule', 'hr', '---']),
  inserer('image', 'medias', '🖼', ['image', 'photo', 'picture', 'img']),
  inserer('tableau', 'miseEnPage', '▦', ['tableau', 'table', 'grille', 'grid']),
  inserer('colonnes2', 'miseEnPage', '▥', ['colonnes', 'columns', 'col', '2col', 'col2']),
  inserer('colonnes3', 'miseEnPage', '▥', ['colonnes', 'columns', 'col', '3col', 'col3']),
  inserer('colonnes4', 'miseEnPage', '▥', ['colonnes', 'columns', 'col', '4col', 'col4']),
  inserer('colonnes5', 'miseEnPage', '▥', ['colonnes', 'columns', 'col', '5col', 'col5']),
]

/** Les entrées de couleur : le texte, puis le fond. */
export const ENTREES_COULEURS: readonly Entree[] = [false, true].flatMap((fond) =>
  COULEURS.map(
    (nom): Entree => ({
      id: `couleur-${nom}${fond ? '-fond' : ''}`,
      categorie: 'couleurs',
      get libelle() {
        const couleur = nom === 'defaut' ? t('blocs.couleurDefaut') : t(`couleur.${nom}`)
        return fond ? t('blocs.couleurFond', { couleur }) : couleur
      },
      mots: ['couleur', 'color', fond ? 'fond' : 'texte', fond ? 'background' : 'text', nom],
      signe: 'A',
      effet: { genre: 'couleur', couleur: { nom, fond } },
    }),
  ),
)

export const ACTIONS: readonly Entree[] = (['transformer', 'dupliquer', 'supprimer'] as const).map((action) => ({
  id: `action-${action}`,
  categorie: 'actions',
  get libelle() {
    return t(`blocs.action.${action}`)
  },
  mots: { transformer: ['transformer', 'turn', 'convertir'], dupliquer: ['dupliquer', 'copier', 'duplicate'], supprimer: ['supprimer', 'effacer', 'delete', 'remove'] }[action],
  signe: { transformer: '⇄', dupliquer: '⧉', supprimer: '⌫' }[action],
  ...(action === 'dupliquer' ? { raccourci: '⌘D' } : action === 'transformer' ? { raccourci: '⌘/' } : {}),
  effet: { genre: 'action', action },
}))

/** Le catalogue du menu « / » : les blocs, puis, dès qu'on cherche, les couleurs et les actions. */
export const CATALOGUE: readonly Entree[] = [...BLOCS, ...ENTREES_COULEURS, ...ACTIONS]

/** Ce que « Transformer en » propose : les blocs de texte seulement. */
export const TRANSFORMATIONS: readonly Entree[] = BLOCS.filter((e) => e.effet.genre === 'vers')

const sansAccent = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr')
const mots = (s: string) => sansAccent(s).split(/[\s/,()]+/u).filter(Boolean)

/**
 * Les entrées qui répondent à `requete` : chaque mot tapé commence un mot du nom ou un mot-clé, sans accent ni
 * majuscule. Le nom passe avant les mots-clés. Sans requête : les blocs seuls (les couleurs et actions se cherchent).
 */
export function chercher(entrees: readonly Entree[], requete: string): Entree[] {
  const q = mots(requete)
  if (q.length === 0) return entrees.filter((e) => e.categorie !== 'couleurs' && e.categorie !== 'actions')
  const notes = entrees.flatMap((e) => {
    const nom = mots(e.libelle)
    const cles = e.mots.map(sansAccent)
    const tous = [...nom, ...cles]
    if (!q.every((m) => tous.some((x) => x.startsWith(m)))) return []
    // Le nom commence par la requête, ou un mot-clé lui est égal : en tête.
    const exact = cles.includes(q.join('')) || cles.includes(q.join(' '))
    const parNom = q.every((m) => nom.some((x) => x.startsWith(m)))
    return [{ e, note: exact ? 0 : parNom ? 1 : 2 }]
  })
  return notes.sort((a, b) => a.note - b.note).map((n) => n.e)
}

/** Ce qui ouvre le menu : `/` en tête de bloc ou après une espace, puis ce qu'on tape (sans `/`, ni espace en tête). */
const SLASH = /(?:^|\s)\/((?:[^\s/][^/\n]{0,23})?)$/u

export interface Declencheur {
  requete: string
  /** Combien de caractères, depuis la fin du texte lu, appartiennent au déclencheur (`/` compris). */
  longueur: number
}

export function declencheurSlash(avant: string): Declencheur | null {
  const m = SLASH.exec(avant)
  if (!m) return null
  return { requete: m[1] ?? '', longueur: (m[1] ?? '').length + 1 }
}

/**
 * Le menu se ferme de lui-même quand la requête ne trouve plus rien depuis trois caractères (NOTION.md § 3) :
 * `trouvee` est la longueur de la dernière requête qui trouvait quelque chose.
 */
export const tropLoin = (requete: string, trouvee: number) => requete.length - trouvee >= 3
