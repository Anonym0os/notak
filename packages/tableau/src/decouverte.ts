/**
 * Les bulles de découverte : un mot sur un geste, la première fois qu'il sert, et plus jamais ensuite.
 * Ce qu'on a vu est gardé par compte, dans le navigateur.
 */
export type GesteDecouverte = 'outil' | 'note' | 'aide'

export interface Bulle {
  geste: GesteDecouverte
  /** La clé du texte dans les dictionnaires (`decouverte.*`). */
  texte: string
  /** Où elle se pose : près de la barre d'outils, au milieu, ou près du menu du compte. */
  ou: 'barre' | 'milieu' | 'compte'
}

export const BULLES: readonly Bulle[] = [
  { geste: 'outil', ou: 'barre', texte: 'decouverte.outil' },
  { geste: 'note', ou: 'milieu', texte: 'decouverte.note' },
  { geste: 'aide', ou: 'compte', texte: 'decouverte.aide' },
]

/** Ce que la toile montre, au moment de choisir une bulle. */
export interface EtatToile {
  /** Ce qui est posé sur la toile (hors colonnes ouvertes, corbeille et non triés). */
  nombre: number
  lectureSeule: boolean
}

/**
 * La bulle à montrer maintenant, ou `null`. Une seule à la fois, dans l'ordre : le tableau vide appelle un outil,
 * le premier élément appelle le double-clic, le quatrième l'aide. Rien en lecture seule, rien pour un geste déjà vu.
 */
export function bulleAMontrer(vues: ReadonlySet<string>, etat: EtatToile): Bulle | null {
  if (etat.lectureSeule) return null
  const convient = (g: GesteDecouverte) =>
    g === 'outil' ? etat.nombre === 0 : g === 'note' ? etat.nombre >= 1 && etat.nombre <= 2 : etat.nombre >= 4
  return BULLES.find((b) => !vues.has(b.geste) && convient(b.geste)) ?? null
}

type Stock = Pick<Storage, 'getItem' | 'setItem'>

/** Les gestes déjà vus par ce compte. Sans stockage (navigation privée), on les oublie à la fermeture de la page. */
export interface Vues {
  lire(): Set<string>
  noter(geste: string): void
}

export const cleDecouverte = (compte: string) => `notak:decouverte:${compte}`

export function vuesDuCompte(compte: string, stock?: Stock | null): Vues {
  const cle = cleDecouverte(compte)
  const memoire = new Set<string>()
  const source = (): Stock | null => {
    try {
      return stock ?? globalThis.localStorage ?? null
    } catch {
      return null
    }
  }
  return {
    lire() {
      try {
        const brut = JSON.parse(source()?.getItem(cle) ?? '[]') as unknown
        const gardes = Array.isArray(brut) ? brut.filter((g): g is string => typeof g === 'string') : []
        return new Set([...gardes, ...memoire])
      } catch {
        return new Set(memoire)
      }
    },
    noter(geste) {
      memoire.add(geste)
      try {
        source()?.setItem(cle, JSON.stringify([...this.lire()]))
      } catch {
        // Le geste reste vu pour cette page.
      }
    },
  }
}
