import { t } from '../langue'

/**
 * Le catalogue du menu « / », de « Transformer en » et du menu du bloc (docs/NOTION.md § 3), et la recherche qui le
 * parcourt. Rien ici ne touche à l'éditeur : ce sont des données, des scores et des règles de déclenchement.
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
export type Insertion = 'separateur' | 'image' | 'apercuLien' | 'tableau' | 'colonnes2' | 'colonnes3' | 'colonnes4' | 'colonnes5'

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

/** Le nom de la couleur à afficher : « Texte bleu », « Fond bleu » (NOTION.md § 3). */
export const nomCouleur = (c: Couleur): string => t(c.fond ? 'menus.couleur.fond' : 'menus.couleur.texte', { couleur: t(`menus.teinte.${c.nom}`) })

export type Action = 'dupliquer' | 'supprimer' | 'transformer' | 'couleur' | 'lien' | 'commenter'

/**
 * Les sections du menu, dans l'ordre d'affichage. Les trois dernières « bloc » rangent le menu du bloc : sa première
 * section porte le type du bloc, les suivantes n'ont pas de titre et sont séparées d'un trait.
 */
export type Section = 'base' | 'media' | 'avances' | 'transformer' | 'actions' | 'couleurTexte' | 'couleurFond' | 'blocPrincipal' | 'blocGestion' | 'blocCommentaire'

export const SECTIONS_SLASH: readonly Section[] = ['base', 'media', 'avances', 'transformer', 'actions', 'couleurTexte', 'couleurFond']

/** Le titre d'une section ; vide pour celles du menu du bloc, dont le titre dépend du bloc. */
export const titreSection = (s: Section): string => (s.startsWith('bloc') ? '' : t(`menus.section.${s}`))

/** Les noms des icônes que dessine `menuIcones.tsx`. */
export type NomIconeMenu =
  | 'texte'
  | 'titre1'
  | 'titre2'
  | 'titre3'
  | 'puce'
  | 'numero'
  | 'tache'
  | 'deroulant'
  | 'citation'
  | 'encadre'
  | 'code'
  | 'tableau'
  | 'separateur'
  | 'image'
  | 'colonnes'
  | 'transformer'
  | 'couleur'
  | 'lien'
  | 'dupliquer'
  | 'supprimer'
  | 'commenter'

export type Effet =
  | { genre: 'vers'; vers: Vers }
  | { genre: 'inserer'; quoi: Insertion }
  | { genre: 'couleur'; couleur: Couleur }
  | { genre: 'action'; action: Action }

export interface Entree {
  id: string
  section: Section
  libelle: string
  /** Ce que la recherche lit : les mots-clés français, puis anglais (le nom de l'entrée est parmi eux). */
  mots: readonly string[]
  motsEn: readonly string[]
  /** L'exemple de raccourci markdown, lu par la recherche et montré à droite. */
  markdown?: string
  /** La touche qui fait la même chose (menu du bloc) ; elle prend la place de l'exemple markdown. */
  raccourci?: string
  icone: NomIconeMenu
  effet: Effet
  /** Une entrée qui ouvre un sous-menu (menu du bloc) plutôt que d'agir. */
  sousMenu?: 'transformer' | 'couleur'
}

const entree = (e: Omit<Entree, 'libelle'> & { cle: string }): Entree => {
  const { cle, ...reste } = e
  return {
    ...reste,
    get libelle() {
      return t(cle)
    },
  }
}

const vers = (section: Section, id: Vers, icone: NomIconeMenu, mots: string[], motsEn: string[], markdown?: string): Entree =>
  entree({ id: section === 'transformer' ? `vers-${id}` : id, section, cle: `blocs.${id}`, mots, motsEn, ...(markdown ? { markdown } : {}), icone, effet: { genre: 'vers', vers: id } })

const inserer = (section: Section, id: Insertion, icone: NomIconeMenu, mots: string[], motsEn: string[], markdown?: string): Entree =>
  entree({ id, section, cle: `blocs.${id}`, mots, motsEn, ...(markdown ? { markdown } : {}), icone, effet: { genre: 'inserer', quoi: id } })

/** Les types de bloc, avec leurs mots-clés ; chacun sert deux fois : à insérer (section) et à transformer. */
const TYPES: readonly { id: Vers; icone: NomIconeMenu; section: Section; mots: string[]; motsEn: string[]; markdown?: string }[] = [
  { id: 'texte', icone: 'texte', section: 'base', mots: ['texte'], motsEn: ['text'] },
  { id: 'titre1', icone: 'titre1', section: 'base', mots: ['titre 1', '#', 'h1'], motsEn: ['heading 1', 'h1'], markdown: '#' },
  { id: 'titre2', icone: 'titre2', section: 'base', mots: ['sous-titre 2', '##', 'titre 2', 'h2', 'deux'], motsEn: ['sub heading 2', 'h2', 'two'], markdown: '##' },
  { id: 'titre3', icone: 'titre3', section: 'base', mots: ['sous sous-titre 3', '###', 'titre 3', 'h3', 'trois'], motsEn: ['subsub heading 3', 'h3', 'three'], markdown: '###' },
  { id: 'puce', icone: 'puce', section: 'base', mots: ['liste à puces'], motsEn: ['bulleted list'], markdown: '-' },
  { id: 'numero', icone: 'numero', section: 'base', mots: ['liste numérotée'], motsEn: ['numbered list'], markdown: '1.' },
  { id: 'tache', icone: 'tache', section: 'base', mots: ['à faire', 'liste de cases à cocher', 'faire'], motsEn: ['todo', 'to-do', 'checkbox', 'list', 'do'], markdown: '[]' },
  { id: 'deroulant', icone: 'deroulant', section: 'base', mots: ['liste dépliante', 'déplier', 'réduire', 'accordéon', 'détails'], motsEn: ['toggle list', 'expand', 'collapse', 'details'], markdown: '>' },
  { id: 'encadre', icone: 'encadre', section: 'base', mots: ['encadré'], motsEn: ['callout'] },
  { id: 'citation', icone: 'citation', section: 'base', mots: ['citation'], motsEn: ['quote', '“”'], markdown: '"' },
  { id: 'code', icone: 'code', section: 'media', mots: ['code'], motsEn: ['code'], markdown: '```' },
  { id: 'titreDeroulant1', icone: 'titre1', section: 'avances', mots: ['déplier le titre 1', 'h1', 'th1'], motsEn: ['toggle', 'heading', 'expand', '1', 'h1', 'th1'], markdown: '# >' },
  { id: 'titreDeroulant2', icone: 'titre2', section: 'avances', mots: ['déplier le sous-titre 2', 'h2', 'deux', 'th2'], motsEn: ['toggle', 'sub heading', 'expand', '2', 'h2', 'two', 'th2'], markdown: '## >' },
  { id: 'titreDeroulant3', icone: 'titre3', section: 'avances', mots: ['déplier le sous sous-titre 3', 'h3', 'trois', 'th3'], motsEn: ['toggle', 'subsub heading', 'expand', '3', 'h3', 'three', 'th3'], markdown: '### >' },
]

const colonnes = (n: 2 | 3 | 4 | 5, fr: string, en: string): Entree =>
  inserer('avances', `colonnes${n}`, 'colonnes', ['col', `c${n}`, `col${n}`, `${n}colonne`, 'colonnes', `${n}col`, fr], ['col', `c${n}`, `col${n}`, `column${n}`, 'columns', `${n}col`, en, ...(n === 2 ? ['block', 'vertical'] : [])])

/** L'ordre de Notion : les blocs de base, le média (le code y est), les blocs avancés. */
const INSERTIONS: readonly Entree[] = [
  ...TYPES.filter((x) => x.section === 'base').map((x) => vers('base', x.id, x.icone, x.mots, x.motsEn, x.markdown)),
  // Le tableau et le séparateur suivent la citation.
  inserer('base', 'tableau', 'tableau', ['tableau'], ['table']),
  inserer('base', 'separateur', 'separateur', ['ligne horizontale', 'séparateur', 'ligne', 'hr', 'section', '—-'], ['horizontal rule', 'divider', 'line', 'hr', 'section', 'separator', '—-'], '---'),
  inserer('media', 'image', 'image', ['image', 'photo', 'gif', 'giphy', 'img'], ['image', 'picture', 'gif', 'giphy', 'photo', 'img']),
  ...TYPES.filter((x) => x.section === 'media').map((x) => vers('media', x.id, x.icone, x.mots, x.motsEn, x.markdown)),
  // Le signet : le champ du lien s'ouvre sous le bloc (NOTION.md § 10.3).
  inserer('media', 'apercuLien', 'lien', ['aperçu de lien web', 'miniature', 'lien', 'web', 'aperçu'], ['link preview', 'web link', 'bookmark', 'web', 'link', 'preview']),
  ...TYPES.filter((x) => x.section === 'avances').map((x) => vers('avances', x.id, x.icone, x.mots, x.motsEn, x.markdown)),
  colonnes(2, 'deux', 'two'),
  colonnes(3, 'trois', 'three'),
  colonnes(4, 'quatre', 'four'),
  colonnes(5, 'cinq', 'five'),
]

/** Les blocs qu'on insère, dans l'ordre du menu. */
export const BLOCS: readonly Entree[] = INSERTIONS

/** L'ordre de « Transformer en » chez Notion : le code et la citation avant l'encadré, puis les titres dépliants. */
const ORDRE_TRANSFORMER: readonly Vers[] = ['texte', 'titre1', 'titre2', 'titre3', 'puce', 'numero', 'tache', 'deroulant', 'code', 'citation', 'encadre', 'titreDeroulant1', 'titreDeroulant2', 'titreDeroulant3']

/** « Transformer en » : les types de bloc de texte, mêmes mots-clés que l'insertion du même bloc. */
export const TRANSFORMATIONS: readonly Entree[] = ORDRE_TRANSFORMER.map((id) => {
  const x = TYPES.find((y) => y.id === id)!
  return vers('transformer', x.id, x.icone, x.mots, x.motsEn, x.markdown)
})

/** Les noms de couleur en mots-clés, avec les variantes d'orthographe (NOTION.md § 2.2.2). */
const MOTS_COULEUR: Record<NomCouleur, { fr: string[]; en: string[] }> = {
  defaut: { fr: ['noir blanc par défaut', 'défaut'], en: ['black white default'] },
  gris: { fr: ['gris', 'gri'], en: ['gray', 'grey'] },
  brun: { fr: ['marron', 'brun', 'maron'], en: ['brown'] },
  orange: { fr: ['orange'], en: ['orange'] },
  jaune: { fr: ['jaune'], en: ['yellow'] },
  vert: { fr: ['vert', 'turquoise'], en: ['green', 'teal'] },
  bleu: { fr: ['bleu'], en: ['blue'] },
  violet: { fr: ['violet', 'mauve'], en: ['purple'] },
  rose: { fr: ['rose'], en: ['pink'] },
  rouge: { fr: ['rouge'], en: ['red'] },
}

/** Les entrées de couleur : les dix du texte, puis les dix du fond. */
export const ENTREES_COULEURS: readonly Entree[] = [false, true].flatMap((fond) =>
  COULEURS.map((nom): Entree => {
    const { fr, en } = MOTS_COULEUR[nom]
    return {
      id: `couleur-${nom}${fond ? '-fond' : ''}`,
      section: fond ? 'couleurFond' : 'couleurTexte',
      get libelle() {
        return nomCouleur({ nom, fond })
      },
      // « fondbleu » s'écrit aussi sans espace.
      mots: fond ? [`fond ${fr[0]}`, `fond${fr[0]}`, ...fr] : [`texte ${fr[0]}`, ...fr],
      motsEn: [`${fond ? 'background' : 'text'} ${en[0]}`, ...en],
      icone: 'couleur',
      effet: { genre: 'couleur', couleur: { nom, fond } },
    }
  }),
)

const action = (a: Action, section: Section, icone: NomIconeMenu, mots: string[], motsEn: string[], raccourci?: string, sousMenu?: 'transformer' | 'couleur', id = `action-${a}`): Entree =>
  entree({ id, section, cle: `blocs.action.${a}`, mots, motsEn, ...(raccourci ? { raccourci } : {}), ...(sousMenu ? { sousMenu } : {}), icone, effet: { genre: 'action', action: a } })

/** Les actions du menu du bloc, dans l'ordre de Notion (§ 3.2). */
export const ACTIONS_BLOC: readonly Entree[] = [
  action('transformer', 'blocPrincipal', 'transformer', ['transformer', 'convertir'], ['turn into', 'transform', 'convert'], undefined, 'transformer'),
  action('couleur', 'blocPrincipal', 'couleur', ['couleur', 'surligner'], ['color', 'colour', 'highlight'], undefined, 'couleur'),
  action('lien', 'blocGestion', 'lien', ['copier le lien du bloc', 'lien', 'adresse'], ['copy link to block', 'link', 'url'], '⌘⌃L'),
  action('dupliquer', 'blocGestion', 'dupliquer', ['dupliquer', 'copier'], ['duplicate', 'copy'], '⌘D'),
  action('supprimer', 'blocGestion', 'supprimer', ['supprimer', 'effacer', 'retirer'], ['delete', 'remove'], 'Suppr'),
  action('commenter', 'blocCommentaire', 'commenter', ['commenter', 'commentaire'], ['comment'], '⌘⇧M'),
]

/** Le menu « / » : les insertions, transformer, les actions sans sous-menu (« commenter » s'y cache), les couleurs. */
export const CATALOGUE: readonly Entree[] = [
  ...BLOCS,
  ...TRANSFORMATIONS,
  action('lien', 'actions', 'lien', ['copier le lien du bloc', 'lien', 'adresse'], ['copy link to block', 'link', 'url'], '⌘⌃L', undefined, 'slash-lien'),
  action('dupliquer', 'actions', 'dupliquer', ['dupliquer', 'copier'], ['duplicate', 'copy'], '⌘D', undefined, 'slash-dupliquer'),
  action('supprimer', 'actions', 'supprimer', ['supprimer', 'effacer', 'retirer'], ['delete', 'remove'], 'Suppr', undefined, 'slash-supprimer'),
  ...ENTREES_COULEURS,
]

/* --- La recherche (NOTION.md § 2.3) --- */

/** NFKD et minuscules : les lettres accentuées se décomposent, la sous-séquence les lit lettre à lettre. */
const normaliser = (s: string) => s.normalize('NFKD').toLocaleLowerCase()
const sansAccents = (s: string) => normaliser(s).replace(/\p{M}/gu, '')

/** Tous les caractères de `q` apparaissent, dans l'ordre, dans `h`. */
function sousSequence(q: string, h: string): boolean {
  let i = 0
  for (const c of h) if (c === q[i] && ++i === q.length) return true
  return q.length === 0
}

/**
 * La meilleure sous-séquence de `q` dans `h`, essayée à chaque occurrence de sa première lettre : chaque caractère
 * d'une suite continue vaut 1, 3, 7, 15… (une suite de quatre vaut 26, des paires isolées 4 chacune).
 */
function scoreFlou(q: string, h: string): number {
  const a = [...q]
  const b = [...h]
  let meilleur = 0
  for (let depart = 0; depart < b.length; depart++) {
    if (b[depart] !== a[0]) continue
    let score = 0
    let suite = 0
    let precedent = -2
    let j = 0
    for (let i = depart; i < b.length && j < a.length; i++) {
      if (b[i] !== a[j]) continue
      suite = i === precedent + 1 ? suite + 1 : 0
      score += 2 ** (suite + 1) - 1
      precedent = i
      j++
    }
    if (j === a.length) meilleur = Math.max(meilleur, score)
  }
  return meilleur
}

/** Le seuil au-dessous duquel une correspondance approchée n'est pas retenue. */
export const SEUIL = 25

/**
 * Le score de `requete` dans `texte` : un palier selon la nature de la correspondance (exacte, préfixe, début de mot,
 * sous-chaîne, sans accents, mots dans l'ordre), sinon le score de la correspondance approchée. 0 : écarté.
 */
export function score(texte: string, requete: string): number {
  const q = normaliser(requete.trim().replace(/^\//, '').trim())
  const h = normaliser(texte)
  if (!q) return 1
  if (!sousSequence(q, h)) return 0
  if (h === q) return 1_000_000
  if (h.startsWith(q)) return 100_000
  if (h.includes(` ${q}`)) return 10_000
  if (h.includes(q)) return 1_000
  if (sansAccents(h).includes(sansAccents(q))) return 950
  if (q.includes(' ')) {
    let depuis = 0
    let ecarts = 0
    const dans = q.split(/\s+/).every((m) => {
      const i = h.indexOf(m, depuis)
      if (i < 0) return false
      ecarts += i - depuis
      depuis = i + m.length
      return true
    })
    if (dans) return Math.max(SEUIL, 900 - ecarts)
  }
  const flou = scoreFlou(q, h)
  return flou >= SEUIL ? flou : 0
}

/** Ce que la recherche lit pour une entrée : ses mots-clés, le titre de sa section, ses mots-clés encore. */
export function texteCherche(e: Entree): string {
  const mots = [...e.mots, ...e.motsEn, ...(e.markdown ? [e.markdown] : [])].join(' ')
  return `${mots} ${titreSection(e.section)} ${mots}`
}

/**
 * Les entrées qui répondent à `requete`, par score décroissant puis dans l'ordre du catalogue. Sans requête, toutes,
 * dans leur ordre.
 */
export function chercher(entrees: readonly Entree[], requete: string): Entree[] {
  if (!requete.trim().replace(/^\//, '').trim()) return [...entrees]
  return entrees
    .map((e, i) => ({ e, i, s: score(texteCherche(e), requete) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.e)
}

/* --- Le déclenchement et la fermeture du menu « / » (NOTION.md § 2.1 et § 2.4) --- */

export interface Declencheur {
  /** Ce qui est tapé après le `/`, espaces comprises. */
  requete: string
  /** Combien de caractères, depuis la fin du texte lu, appartiennent au déclencheur (`/` compris). */
  longueur: number
}

/**
 * Le `/` (ou sa forme pleine chasse) ouvre le menu au tout début du texte ou derrière un séparateur Unicode (pas un
 * saut de ligne, pas un mot), jamais derrière un chiffre ni dans une adresse `http:`. Le filtre n'a ni `/` ni saut de
 * ligne, et pas de longueur maximale.
 */
export function declencheurSlash(avant: string): Declencheur | null {
  const m = /[/／]([^/／\n￼]*)$/u.exec(avant)
  if (!m) return null
  const devant = avant.slice(0, m.index)
  if (devant) {
    const dernier = [...devant].at(-1)!
    if (!/^\p{Z}$/u.test(dernier) || /\d/.test(dernier)) return null
    if (/https?:\/?$/i.test(devant)) return null
  }
  return { requete: m[1] ?? '', longueur: (m[1] ?? '').length + 1 }
}

/**
 * Le menu se ferme de lui-même quand la requête ne trouve plus rien depuis quatre caractères (la quatrième lettre sans
 * résultat) : `trouvee` est la longueur de la dernière requête qui trouvait quelque chose.
 */
export const tropLoin = (requete: string, trouvee: number) => requete.length - trouvee > 3

/**
 * Les règles sur les espaces : une espace seule fermait le menu (sauf si le bloc est exactement `/` et une espace), un
 * filtre d'au moins deux caractères qui finit par deux espaces aussi.
 */
export function fermeParEspaces(requete: string, texteDuBloc: string): boolean {
  if (requete === ' ') return texteDuBloc.replace('／', '/') !== '/ '
  return requete.length >= 2 && requete.endsWith('  ')
}
