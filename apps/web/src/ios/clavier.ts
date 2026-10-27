/**
 * Le clavier à l'écran, sur iOS : il se pose par-dessus la page sans la rétrécir. La page le sait par deux voies, la
 * `visualViewport` (qui rétrécit, elle) et l'événement `clavier` de la coque (`plugin:appareil`, hauteur et durée de
 * l'animation), et le dit à tout le monde par une variable CSS (`--clavier`, en px) et l'attribut `data-clavier` sur
 * la racine : la barre du bas se cache, les panneaux raccourcissent, la toile cadre ce qu'on écrit (phase 4).
 */

export interface EtatClavier {
  /** En px CSS ; 0 quand il est rangé. */
  hauteur: number
}

const ecouteurs = new Set<(e: EtatClavier) => void>()
let etat: EtatClavier = { hauteur: 0 }
/** La coque a parlé : sa hauteur est la bonne, celle de la `visualViewport` (qui bouge avec le défilement) se tait. */
let coqueEntendue = false

export const lireClavier = () => etat
export function ecouterClavier(f: (e: EtatClavier) => void): () => void {
  ecouteurs.add(f)
  return () => void ecouteurs.delete(f)
}

/** Ce qu'une mesure devient : les hauteurs sous 1 px sont du bruit, un clavier n'a pas de hauteur négative. */
export function hauteurDepuisViewport(innerHeight: number, viewportHeight: number, offsetTop = 0): number {
  const h = Math.round(innerHeight - viewportHeight - offsetTop)
  return h > 1 ? h : 0
}

function poser(document: Document, hauteur: number) {
  if (hauteur === etat.hauteur) return
  etat = { hauteur }
  const racine = document.documentElement
  racine.style.setProperty('--clavier', `${hauteur}px`)
  racine.toggleAttribute('data-clavier', hauteur > 0)
  for (const f of ecouteurs) f(etat)
}

interface FenetreClavier {
  document: Document
  innerHeight: number
  visualViewport?: { height: number; offsetTop: number; addEventListener(type: 'resize' | 'scroll', f: () => void): void } | null
}

/**
 * Suit le clavier par la `visualViewport`. La coque mobile envoie en plus son propre événement, plus tôt et avec la
 * durée de l'animation (`appliquerClavierDeLaCoque`) : dès qu'elle a parlé, c'est elle seule qu'on écoute.
 */
export function suivreClavier(fenetre: FenetreClavier): void {
  const vv = fenetre.visualViewport
  if (!vv) return
  const mesurer = () => {
    if (!coqueEntendue) poser(fenetre.document, hauteurDepuisViewport(fenetre.innerHeight, vv.height, vv.offsetTop))
  }
  vv.addEventListener('resize', mesurer)
  vv.addEventListener('scroll', mesurer)
  mesurer()
}

/** Ce que la coque envoie (`AppareilPlugin.swift`, `clavier`). */
export interface EvenementClavierCoque {
  hauteur: number
  /** Secondes, le temps que met le système à monter ou ranger le clavier. */
  duree?: number
}

/** Branche l'événement de la coque : la hauteur qu'elle donne est en points, c'est-à-dire en px CSS. */
export function appliquerClavierDeLaCoque(document: Document, e: EvenementClavierCoque): void {
  if (typeof e?.hauteur !== 'number' || !Number.isFinite(e.hauteur)) return
  coqueEntendue = true
  document.documentElement.style.setProperty('--clavier-duree', `${Math.max(0, e.duree ?? 0.25)}s`)
  poser(document, Math.max(0, Math.round(e.hauteur)))
}
