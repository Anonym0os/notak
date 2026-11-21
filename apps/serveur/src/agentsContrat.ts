// Le contrat de la porte des agents (`POST /api/outils/:source/agent`, docs/AGENTS.md) : les opérations qu'un agent
// d'un outil rattaché (Fram, l'assistant de Silak) peut demander, et le schéma JSON des arguments de chacune. C'est la
// seule source de vérité : la porte valide chaque demande contre ces schémas, et `docs/agents.schemas.json` en est tiré
// (`node scripts/schemas-agents.ts`), pour que l'outil les recopie tels quels dans les outils de son modèle.
// Ce fichier n'importe rien à l'exécution : le serveur le lit sous Node, sans bundler.

/** Un schéma JSON, dans le sous-ensemble que la porte sait valider (`validerSchema`). */
export interface Schema {
  type?: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean'
  description?: string
  properties?: Record<string, Schema>
  required?: readonly string[]
  additionalProperties?: false
  items?: Schema
  minItems?: number
  maxItems?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  minimum?: number
  maximum?: number
  enum?: readonly (string | number | boolean)[]
  $ref?: string
  $defs?: Record<string, Schema>
}

/** La version du contrat : elle change quand un argument ou un résultat change de sens. */
export const VERSION_CONTRAT = 1
/** Le corps d'une demande, au plus. */
export const CORPS_AGENT_MAX = 512 * 1024

export const COULEURS = ['gris', 'cyan', 'vert', 'brun', 'jaune', 'orange', 'rouge', 'rose', 'violet', 'bleu', 'bleu_nuit'] as const
/** Les dispositions d'une carte mentale que la porte propose (docs/XMIND.md § 2), la carte d'abord. */
export const STRUCTURES = ['carte', 'logique-droite', 'organigramme-bas', 'arbre-droite', 'chronologie-horizontale', 'accolade-droite', 'arete-droite'] as const
export const TYPES_NEUFS = ['note', 'titre', 'taches', 'lien', 'colonne', 'table', 'carte_mentale'] as const
export type TypeNeuf = (typeof TYPES_NEUFS)[number]

const ID_TABLEAU: Schema = { type: 'string', pattern: '^[A-Za-z0-9_-]{8,64}$', description: 'L’identifiant d’un tableau (ou d’un dossier), tel que `trouver` ou `lire_tableau` le rendent.' }
const ID_ELEMENT: Schema = { type: 'string', minLength: 1, maxLength: 64, description: 'L’identifiant d’un élément, tel que `lire_tableau` le rend.' }
const COULEUR: Schema = { type: 'string', enum: COULEURS, description: 'Une couleur de la palette des notes.' }
const IDS: Schema = { type: 'array', items: ID_ELEMENT, minItems: 1, maxItems: 200 }

const BRANCHE: Schema = {
  type: 'object',
  additionalProperties: false,
  description: 'Une branche d’une carte mentale : son titre, court (quelques mots), et ses sous-branches.',
  properties: {
    titre: { type: 'string', minLength: 1, maxLength: 300 },
    note: { type: 'string', maxLength: 4000, description: 'Une note sous le sujet (texte simple), pour le détail qui n’a pas sa place dans le titre.' },
    enfants: { type: 'array', maxItems: 40, items: { $ref: '#/$defs/branche' } },
  },
  required: ['titre'],
}

const TACHES: Schema = {
  type: 'array',
  maxItems: 200,
  description: 'Les tâches, dans l’ordre.',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: { texte: { type: 'string', minLength: 1, maxLength: 2000 }, faite: { type: 'boolean' } },
    required: ['texte'],
  },
}

const LIGNES: Schema = {
  type: 'array',
  minItems: 1,
  maxItems: 200,
  description: 'Les lignes de la table ; la première est l’en-tête. Toutes de la même longueur (complétées sinon).',
  items: { type: 'array', minItems: 1, maxItems: 30, items: { type: 'string', maxLength: 2000 } },
}

/** Ce qu'on peut poser d'un coup : le contenu d'une colonne est le même, sans colonne dans une colonne. */
const champsElementNeuf = (dansColonne: boolean): Record<string, Schema> => ({
  type: {
    type: 'string',
    enum: dansColonne ? TYPES_NEUFS.filter((t) => t !== 'colonne' && t !== 'carte_mentale') : TYPES_NEUFS,
    description:
      'note : un texte (Markdown simple : titres #, listes -, gras **, italique _, liens). titre : un titre posé sur la toile, sans fond. ' +
      'taches : une liste de cases à cocher. lien : une adresse web, avec son aperçu. colonne : une colonne qui range des éléments. ' +
      'table : un petit tableur. carte_mentale : une carte mentale, depuis un plan imbriqué.',
  },
  texte: { type: 'string', maxLength: 20000, description: 'note, titre : le texte, en Markdown simple.' },
  titre: { type: 'string', maxLength: 300, description: 'taches, colonne, table, lien : le titre.' },
  couleur: COULEUR,
  url: { type: 'string', maxLength: 2000, description: 'lien : l’adresse, en http(s).' },
  taches: TACHES,
  lignes: LIGNES,
  ...(dansColonne
    ? {}
    : {
        elements: {
          type: 'array',
          maxItems: 60,
          description: 'colonne : ce qu’elle range, de haut en bas.',
          items: { $ref: '#/$defs/element_de_colonne' },
        },
        central: { type: 'string', maxLength: 300, description: 'carte_mentale : le sujet central.' },
        branches: { type: 'array', maxItems: 40, items: { $ref: '#/$defs/branche' }, description: 'carte_mentale : les branches principales, avec leurs sous-branches.' },
        structure: { type: 'string', enum: STRUCTURES, description: 'carte_mentale : la disposition ; absente, la carte (branches tout autour du centre).' },
      }),
  largeur: { type: 'integer', minimum: 8, maximum: 120, description: 'La largeur en unités de grille ; absente, celle que l’app donne à ce type.' },
})

const ELEMENT_NEUF: Schema = { type: 'object', additionalProperties: false, properties: champsElementNeuf(false), required: ['type'] }
const ELEMENT_DE_COLONNE: Schema = { type: 'object', additionalProperties: false, properties: champsElementNeuf(true), required: ['type'] }

const DEFS = { branche: BRANCHE, element: ELEMENT_NEUF, element_de_colonne: ELEMENT_DE_COLONNE }

const objet = (description: string, properties: Record<string, Schema>, required: readonly string[] = []): Schema => ({
  type: 'object',
  additionalProperties: false,
  description,
  properties,
  ...(required.length ? { required } : {}),
})

const OPERATION_BRANCHE: Schema = objet(
  'Un geste sur les branches d’une carte mentale. ajouter : de nouvelles branches sous `sujet` (le central s’il manque). ' +
    'renommer : change le titre de `sujet`. deplacer : rattache `sujet` sous `vers`. remplacer : les sous-branches de `sujet` ' +
    'deviennent `enfants` (les anciennes partent). retirer : retire `sujet` et ses sous-branches.',
  {
    action: { type: 'string', enum: ['ajouter', 'renommer', 'deplacer', 'remplacer', 'retirer'] },
    sujet: { type: 'string', maxLength: 64, description: 'L’identifiant d’un sujet, tel que `lire_tableau` le rend dans `plan`.' },
    titre: { type: 'string', minLength: 1, maxLength: 300 },
    note: { type: 'string', maxLength: 4000 },
    enfants: { type: 'array', maxItems: 40, items: { $ref: '#/$defs/branche' } },
    vers: { type: 'string', maxLength: 64, description: 'deplacer : le nouveau parent.' },
    position: { type: 'integer', minimum: 0, maximum: 1000, description: 'Le rang parmi les frères, à partir de 0 ; absent : en dernier.' },
  },
  ['action'],
)

/** Une opération : ce qu'elle fait (lu par le modèle), le schéma de ses arguments, et si elle change quelque chose. */
export interface Operation {
  description: string
  ecrit: boolean
  arguments: Schema
}

export const OPERATIONS = {
  trouver: {
    ecrit: false,
    description:
      'Trouve où travailler. Sans argument : les espaces de la personne (et leur accueil) et ses tableaux récents. ' +
      '`texte` cherche dans les titres et dans le contenu de tous les tableaux qu’elle lit. `dans` liste ce que range un tableau ' +
      'ou un dossier. `fiche` rend le dossier d’une fiche de l’outil par sa clé de rattachement (societe:42).',
    arguments: objet('', {
      texte: { type: 'string', minLength: 1, maxLength: 200 },
      dans: ID_TABLEAU,
      fiche: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$' },
      limite: { type: 'integer', minimum: 1, maximum: 50, description: 'Combien de résultats au plus (20 par défaut).' },
    }),
  },
  lire_tableau: {
    ecrit: false,
    description:
      'Lit un tableau : chaque élément avec son type, son texte lisible, sa place et sa taille en unités de grille, sa colonne ; ' +
      'les cartes mentales en plan imbriqué, les tables en lignes. `structure` décrit la mise en page : les zones (groupes ' +
      'd’éléments proches), les chevauchements, et une place libre où poser du neuf. Relis le tableau avant de modifier ou de ranger.',
    arguments: objet(
      '',
      {
        tableau: ID_TABLEAU,
        elements: { ...IDS, description: 'Seulement ces éléments (et ce que rangent leurs colonnes).' },
        corbeille: { type: 'boolean', description: 'Inclure les éléments jetés à la corbeille du tableau.' },
      },
      ['tableau'],
    ),
  },
  creer_tableau: {
    ecrit: true,
    description:
      'Crée un tableau (une toile vide), dans un tableau ou un dossier (`dans`), dans le dossier d’une fiche de l’outil (`fiche`), ' +
      'ou à défaut dans l’accueil de l’espace personnel. Sa carte y est posée, il en hérite les accès. Rend son identifiant.',
    arguments: objet(
      '',
      {
        titre: { type: 'string', minLength: 1, maxLength: 200 },
        dans: ID_TABLEAU,
        fiche: objet('Le dossier d’une fiche de l’outil, créé s’il manque et que `titre` est donné.', {
          cle: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$' },
          titre: { type: 'string', minLength: 1, maxLength: 200, description: 'Le titre du dossier de la fiche, s’il faut le créer (le nom du client).' },
        }, ['cle']),
        couleur: COULEUR,
        dossier: { type: 'boolean', description: 'Le tableau se montre en dossier dans la bibliothèque.' },
      },
      ['titre'],
    ),
  },
  ajouter_elements: {
    ecrit: true,
    description:
      'Pose des éléments sur un tableau, exactement comme les crée l’app : notes, titres, listes de tâches, liens, colonnes avec ' +
      'leur contenu, tables, cartes mentales depuis un plan imbriqué. Placement : `place.pres_de` (à côté d’un élément), ' +
      '`place.dans_colonne` (au bout d’une colonne), `place.x`/`place.y`, ou à défaut dans une place libre. Jamais par-dessus un ' +
      'autre élément. Plusieurs éléments se rangent de gauche à droite (`disposition`).',
    arguments: objet(
      '',
      {
        tableau: ID_TABLEAU,
        elements: { type: 'array', minItems: 1, maxItems: 60, items: { $ref: '#/$defs/element' } },
        place: objet('Où poser les éléments ; absente : dans une place libre, à droite de ce qui est là.', {
          pres_de: ID_ELEMENT,
          cote: { type: 'string', enum: ['droite', 'dessous', 'gauche', 'dessus'], description: 'Avec `pres_de` ; à droite par défaut.' },
          dans_colonne: ID_ELEMENT,
          x: { type: 'integer', minimum: -15000, maximum: 15000 },
          y: { type: 'integer', minimum: -15000, maximum: 15000 },
          disposition: { type: 'string', enum: ['ligne', 'pile', 'grille'], description: 'ligne : côte à côte (par défaut). pile : les uns sous les autres. grille : en rangées.' },
        }),
      },
      ['tableau', 'elements'],
    ),
  },
  modifier_elements: {
    ecrit: true,
    description:
      'Modifie des éléments : le texte d’une note ou d’un titre (Markdown simple), un titre, une couleur, les tâches d’une liste ' +
      '(les remplacer, ou en cocher), les lignes d’une table, les branches d’une carte mentale. Ce qui n’est pas donné ne change pas.',
    arguments: objet(
      '',
      {
        tableau: ID_TABLEAU,
        modifications: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: objet(
            '',
            {
              id: ID_ELEMENT,
              texte: { type: 'string', maxLength: 20000, description: 'note, titre : le nouveau texte, en Markdown simple.' },
              titre: { type: 'string', maxLength: 300, description: 'taches, colonne, table, lien ; carte_mentale : le sujet central.' },
              couleur: { type: 'string', enum: [...COULEURS, 'aucune'], description: '`aucune` retire la couleur.' },
              taches: { ...TACHES, description: 'taches : la liste entière, qui remplace l’ancienne.' },
              cocher: {
                type: 'array',
                maxItems: 200,
                description: 'taches : coche ou décoche des tâches par leur rang (à partir de 0, celui que rend `lire_tableau`).',
                items: objet('', { rang: { type: 'integer', minimum: 0, maximum: 1000 }, faite: { type: 'boolean' } }, ['rang', 'faite']),
              },
              lignes: { ...LIGNES, description: 'table : toutes les lignes, qui remplacent les anciennes.' },
              branches: { type: 'array', minItems: 1, maxItems: 100, items: OPERATION_BRANCHE, description: 'carte_mentale : les gestes, dans l’ordre.' },
            },
            ['id'],
          ),
        },
      },
      ['tableau', 'modifications'],
    ),
  },
  ranger: {
    ecrit: true,
    description:
      'Range des éléments selon un plan logique : des groupes, dans l’ordre, chacun empilé de haut en bas, côte à côte ' +
      '(`disposition`). Un groupe titré reçoit un titre au-dessus de lui ; `en_colonne` le range dans une colonne de ce titre. ' +
      'La porte calcule les positions, sans chevauchement. Ne supprime jamais rien ; ce qui n’est pas nommé ne bouge pas.',
    arguments: objet(
      '',
      {
        tableau: ID_TABLEAU,
        groupes: {
          type: 'array',
          minItems: 1,
          maxItems: 40,
          items: objet(
            '',
            {
              titre: { type: 'string', maxLength: 200 },
              elements: IDS,
              en_colonne: { type: 'boolean', description: 'Range le groupe dans une colonne (créée, ou celle qui porte déjà ce titre).' },
              couleur: COULEUR,
            },
            ['elements'],
          ),
        },
        disposition: { type: 'string', enum: ['colonnes', 'lignes'], description: 'colonnes : les groupes côte à côte (par défaut). lignes : les uns sous les autres.' },
        origine: objet('Le coin haut gauche du rangement ; absent : celui des éléments rangés.', {
          x: { type: 'integer', minimum: -15000, maximum: 15000 },
          y: { type: 'integer', minimum: -15000, maximum: 15000 },
        }, ['x', 'y']),
      },
      ['tableau', 'groupes'],
    ),
  },
  jeter_elements: {
    ecrit: true,
    description: 'Jette des éléments à la corbeille du tableau, d’où la personne (ou `remettre_elements`) les remet. Rien ne s’efface.',
    arguments: objet('', { tableau: ID_TABLEAU, elements: IDS }, ['tableau', 'elements']),
  },
  remettre_elements: {
    ecrit: true,
    description: 'Remet sur la toile des éléments jetés à la corbeille du tableau, là où ils étaient.',
    arguments: objet('', { tableau: ID_TABLEAU, elements: IDS }, ['tableau', 'elements']),
  },
} as const satisfies Record<string, Operation>

export type NomOperation = keyof typeof OPERATIONS
export const NOMS_OPERATIONS = Object.keys(OPERATIONS) as NomOperation[]

/** L'enveloppe d'une demande : ce que la porte valide avant de regarder l'opération. */
export const SCHEMA_DEMANDE: Schema = objet(
  'Une demande d’un agent, signée du secret de son outil.',
  {
    id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$', description: 'Unique par demande : la même renvoyée rend la même réponse, sans rien refaire.' },
    au_nom_de: objet(
      'La personne pour qui l’agent agit : son identifiant chez l’outil (le sujet de son compte lié par le SSO), sinon son courriel vérifié.',
      { sujet: { type: 'string', minLength: 1, maxLength: 255 }, courriel: { type: 'string', minLength: 3, maxLength: 320 } },
    ),
    operation: { type: 'string', enum: NOMS_OPERATIONS },
    arguments: { type: 'object' },
  },
  ['id', 'au_nom_de', 'operation'],
)

/** Le schéma complet des arguments d'une opération, ses définitions comprises : ce que l'outil donne à son modèle. */
export function schemaDesArguments(nom: NomOperation): Schema {
  const s: Schema = OPERATIONS[nom].arguments
  // Les définitions que le schéma vise, et celles qu'elles visent à leur tour.
  const defs: Record<string, Schema> = {}
  const visees = (x: Schema) => [...JSON.stringify(x).matchAll(/#\/\$defs\/([a-z_]+)/g)].map((m) => m[1] as keyof typeof DEFS)
  const aVoir = visees(s)
  while (aVoir.length) {
    const nomDef = aVoir.pop()!
    if (defs[nomDef] || !DEFS[nomDef]) continue
    defs[nomDef] = DEFS[nomDef]
    aVoir.push(...visees(DEFS[nomDef]))
  }
  return Object.keys(defs).length ? { ...s, $defs: Object.fromEntries(Object.keys(DEFS).filter((k) => defs[k]).map((k) => [k, defs[k]!])) } : s
}

/** Tout le contrat, tel que `docs/agents.schemas.json` le garde. */
export function contrat() {
  return {
    version: VERSION_CONTRAT,
    route: 'POST /api/outils/{source}/agent',
    signature: 'Notak-Signature: t=<secondes>,v1=<hex de HMAC-SHA256(secret, "<t>.<corps>")>',
    corps_max: CORPS_AGENT_MAX,
    demande: SCHEMA_DEMANDE,
    operations: Object.fromEntries(
      NOMS_OPERATIONS.map((nom) => [nom, { description: OPERATIONS[nom].description, ecrit: OPERATIONS[nom].ecrit, arguments: schemaDesArguments(nom) }]),
    ),
  }
}

// ---- La validation : le sous-ensemble de JSON Schema que ces schémas emploient ----

/** Ce qui ne va pas dans `valeur`, dit pour qu'un modèle le corrige (`elements[2].type : …`) ; `null` : rien. */
export function validerSchema(schema: Schema, valeur: unknown, chemin = '', defs: Record<string, Schema> = schema.$defs ?? {}): string | null {
  const ici = chemin || 'arguments'
  if (schema.$ref) {
    const nom = schema.$ref.replace('#/$defs/', '')
    const cible = defs[nom]
    return cible ? validerSchema(cible, valeur, chemin, defs) : `${ici} : schéma ${schema.$ref} inconnu`
  }
  if (schema.enum && !schema.enum.includes(valeur as string)) return `${ici} : une de ces valeurs attendue : ${schema.enum.join(', ')}`
  switch (schema.type) {
    case 'object': {
      if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) return `${ici} : un objet attendu`
      const o = valeur as Record<string, unknown>
      for (const r of schema.required ?? []) if (o[r] === undefined) return `${chemin ? `${chemin}.` : ''}${r} : manque`
      for (const [k, v] of Object.entries(o)) {
        const sous = schema.properties?.[k]
        if (!sous) {
          if (schema.additionalProperties === false) {
            const permis = Object.keys(schema.properties ?? {})
            return `${chemin ? `${chemin}.` : ''}${k} : champ inconnu${permis.length ? ` (permis : ${permis.join(', ')})` : ''}`
          }
          continue
        }
        if (v === undefined) continue
        const e = validerSchema(sous, v, chemin ? `${chemin}.${k}` : k, defs)
        if (e) return e
      }
      return null
    }
    case 'array': {
      if (!Array.isArray(valeur)) return `${ici} : une liste attendue`
      if (schema.minItems !== undefined && valeur.length < schema.minItems) return `${ici} : au moins ${schema.minItems} attendu(s)`
      if (schema.maxItems !== undefined && valeur.length > schema.maxItems) return `${ici} : au plus ${schema.maxItems} à la fois ; découpe la demande`
      if (schema.items) {
        for (const [i, v] of valeur.entries()) {
          const e = validerSchema(schema.items, v, `${ici}[${i}]`, defs)
          if (e) return e
        }
      }
      return null
    }
    case 'string': {
      if (typeof valeur !== 'string') return `${ici} : un texte attendu`
      if (schema.minLength !== undefined && valeur.length < schema.minLength) return `${ici} : vide`
      if (schema.maxLength !== undefined && valeur.length > schema.maxLength) return `${ici} : ${schema.maxLength} caractères au plus`
      if (schema.pattern && !new RegExp(schema.pattern).test(valeur)) return `${ici} : forme invalide`
      return null
    }
    case 'integer':
    case 'number': {
      if (typeof valeur !== 'number' || !Number.isFinite(valeur) || (schema.type === 'integer' && !Number.isInteger(valeur))) {
        return `${ici} : un ${schema.type === 'integer' ? 'entier' : 'nombre'} attendu`
      }
      if (schema.minimum !== undefined && valeur < schema.minimum) return `${ici} : ${schema.minimum} au moins`
      if (schema.maximum !== undefined && valeur > schema.maximum) return `${ici} : ${schema.maximum} au plus`
      return null
    }
    case 'boolean':
      return typeof valeur === 'boolean' ? null : `${ici} : vrai ou faux attendu`
    default:
      return null
  }
}

/** Les arguments d'une opération, validés ; ou ce qui ne va pas. */
export function validerArguments(nom: NomOperation, valeur: unknown): string | null {
  const s = schemaDesArguments(nom)
  return validerSchema(s, valeur ?? {}, '', s.$defs ?? {})
}
