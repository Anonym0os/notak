import { type Habillage, type RoleCouleur, type RolePolice, type RoleRayon, pileCss } from './format'

/**
 * La feuille d'un habillage. Il est porté par `<html data-habillage="<id>" data-mode="clair|sombre">` (`appliquer.ts`) :
 * les jetons de l'application (`app.css`, l'écran de connexion) vivent sur `:root`, ceux de la toile sont redéclarés
 * sur `.notak-espace`, `.notak-toile` et les menus. La règle vise donc la racine et ces éléments à la fois.
 *
 * Les couleurs d'un mode ne valent que dans ce mode : un habillage sans variante sombre laisse le thème sombre de
 * Notak (`theme.css`) intact, et n'y apporte que ses rayons et ses polices. Avec `:root[…]` devant, chaque règle passe
 * au-dessus de `theme.css`, quelle que soit sa place dans la page.
 */

/** Chaque rôle et les jetons qu'il repeint ; un jeton qui n'est pas ici ne suit pas l'habillage (docs/HABILLAGES.md). */
export const JETONS_COULEUR: Record<RoleCouleur, readonly string[]> = {
  fond: ['--notak-fond', '--fond'],
  point: ['--notak-point'],
  carte: ['--notak-carte', '--notak-table-corps', '--notak-m-fond', '--notak-page-fond', '--carte'],
  texte: ['--notak-texte', '--notak-m-texte', '--texte'],
  accent: ['--notak-accent', '--notak-m-accent', '--notak-m-focus', '--accent'],
  selection: ['--notak-selection'],
}

export const JETONS_RAYON: Record<RoleRayon, string> = {
  carte: '--notak-rayon-carte',
  controle: '--notak-rayon-controle',
  panneau: '--notak-rayon-panneau',
}

export const JETONS_POLICE: Record<RolePolice, readonly string[]> = {
  texte: ['--notak-police'],
  titre: ['--notak-police-titre', '--notak-serif'],
  code: ['--notak-police-code'],
}

/** Les éléments qui redéclarent des jetons : sans eux, la valeur posée sur la racine serait masquée plus bas. */
const PORTEURS = ':is(.notak-espace, .notak-toile, .notak-blocs, .notak-menu-blocs, .notak-bulle, .notak-bulle-sous, .notak-image-barre)'

const regle = (racine: string, declarations: string[]) =>
  declarations.length === 0 ? '' : `${racine},\n${racine} ${PORTEURS} {\n${declarations.map((d) => `  ${d};`).join('\n')}\n}\n`

export function cssDeHabillage(h: Habillage): string {
  // L'identifiant est déjà passé par la liste blanche de `lireHabillage` : il ne peut pas sortir des guillemets.
  const racine = `:root[data-habillage='${h.id}']`
  const communes: string[] = []
  for (const [role, jeton] of Object.entries(JETONS_RAYON) as [RoleRayon, string][]) {
    const v = h.rayons?.[role]
    if (v !== undefined) communes.push(`${jeton}: ${v}px`)
  }
  for (const [role, jetons] of Object.entries(JETONS_POLICE) as [RolePolice, readonly string[]][]) {
    const pile = h.polices?.[role]
    if (pile) for (const j of jetons) communes.push(`${j}: ${pileCss(pile)}`)
  }
  const couleurs = (mode: 'clair' | 'sombre') => {
    const c = h.couleurs?.[mode]
    if (!c) return []
    return (Object.entries(JETONS_COULEUR) as [RoleCouleur, readonly string[]][]).flatMap(([role, jetons]) => (c[role] ? jetons.map((j) => `${j}: ${c[role]}`) : []))
  }
  return [
    regle(racine, communes),
    regle(`${racine}:not([data-mode='sombre'])`, couleurs('clair')),
    regle(`${racine}[data-mode='sombre']`, couleurs('sombre')),
  ].join('')
}
