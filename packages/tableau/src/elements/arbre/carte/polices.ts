/**
 * Les polices qu'on propose dans l'onglet Carte. Notak ne fournit pas de fichier de police : on nomme des familles que
 * les systèmes ont (ou pas : une famille absente retombe sur la police par défaut de la carte). Le nom est celui qu'écrit
 * un `.xmind` (`fo:font-family`).
 */
export interface Police {
  /** Le nom de la famille, tel qu'on l'écrit dans la carte et dans le fichier. */
  nom: string
  /** La pile CSS qui l'affiche, avec un repli. */
  pile: string
}

const pile = (nom: string, repli: 'sans-serif' | 'serif' | 'monospace' | 'cursive') => ({ nom, pile: `"${nom}", ${repli}` })

/** Les polices latines : sans empattement, avec, à chasse fixe, d'écriture. */
export const POLICES: readonly Police[] = [
  pile('Inter', 'sans-serif'),
  pile('Arial', 'sans-serif'),
  pile('Helvetica Neue', 'sans-serif'),
  pile('Verdana', 'sans-serif'),
  pile('Trebuchet MS', 'sans-serif'),
  pile('Tahoma', 'sans-serif'),
  pile('Avenir', 'sans-serif'),
  pile('Futura', 'sans-serif'),
  pile('Gill Sans', 'sans-serif'),
  pile('Optima', 'sans-serif'),
  pile('Georgia', 'serif'),
  pile('Times New Roman', 'serif'),
  pile('Palatino', 'serif'),
  pile('Baskerville', 'serif'),
  pile('Didot', 'serif'),
  pile('Rockwell', 'serif'),
  pile('Courier New', 'monospace'),
  pile('Menlo', 'monospace'),
  pile('Comic Sans MS', 'cursive'),
  pile('Brush Script MT', 'cursive'),
]

/** Les polices des caractères chinois, japonais et coréens : celles que les systèmes courants ont. */
export const POLICES_CJK: readonly Police[] = [
  pile('PingFang SC', 'sans-serif'),
  pile('PingFang TC', 'sans-serif'),
  pile('Hiragino Sans', 'sans-serif'),
  pile('Hiragino Mincho ProN', 'serif'),
  pile('Yu Gothic', 'sans-serif'),
  pile('Yu Mincho', 'serif'),
  pile('Noto Sans CJK SC', 'sans-serif'),
  pile('Noto Sans JP', 'sans-serif'),
  pile('Noto Sans KR', 'sans-serif'),
  pile('Noto Serif CJK SC', 'serif'),
  pile('Microsoft YaHei', 'sans-serif'),
  pile('SimSun', 'serif'),
  pile('Malgun Gothic', 'sans-serif'),
  pile('Apple SD Gothic Neo', 'sans-serif'),
]

/** La pile CSS d'un nom de famille, connu ou non (un nom inconnu se met entre guillemets). */
export const pileDe = (nom: string, liste: readonly Police[] = [...POLICES, ...POLICES_CJK]): string =>
  /[,"']/.test(nom) ? nom : (liste.find((p) => p.nom === nom)?.pile ?? `"${nom}", sans-serif`)

/** Combien de polices récentes on garde, et combien on en montre en tête de liste. */
export const RECENTES_GARDEES = 10
export const RECENTES_MONTREES = 6

/**
 * L'ordre de la liste : d'abord les polices récentes (hors la courante) puis la courante, un séparateur,
 * « Par défaut », puis toutes les polices.
 */
export function polices(liste: readonly Police[], recentes: readonly string[], courante: string | undefined): { recentes: Police[]; toutes: readonly Police[] } {
  const parNom = new Map(liste.map((p) => [p.nom, p]))
  const vues = recentes.filter((n) => n !== courante && parNom.has(n)).slice(0, RECENTES_MONTREES).map((n) => parNom.get(n)!)
  const actuelle = courante ? parNom.get(courante) : undefined
  return { recentes: [...vues, ...(actuelle ? [actuelle] : [])], toutes: liste }
}

/** Ajoute une police aux récentes : en tête, sans doublon. */
export const recentePolice = (recentes: readonly string[], nom: string): string[] => [nom, ...recentes.filter((x) => x !== nom)].slice(0, RECENTES_GARDEES)
