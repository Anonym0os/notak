import { useEffect, useRef, useState } from 'react'
import { t } from '../../langue'
import { SelecteurCouleur } from '../../communs'
import { Points, Popover } from './controles-style'
import { MULTIPLE, type Mixte } from './modele/style'

/**
 * Le sélecteur de couleur de l'onglet Style, d'après celui de Xmind (docs/XMIND.md § 5 bis) : un bouton de 72 × 24 px
 * qui montre la couleur, et son popover : un nuancier de 9 × 5, un champ hexadécimal, l'opacité, la couleur du système,
 * les couleurs du thème, les récentes, et « Par défaut ». Réutilisable par les autres onglets.
 *
 * La valeur est une couleur `#rrggbb` (ou `#rrggbbaa` avec une opacité), une couleur CSS quelconque (la couleur effective
 * d'un thème, qui peut être une variable), `null` (aucune couleur : le bouton est barré) ou `MULTIPLE`.
 */

/**
 * Les 45 couleurs du nuancier, ligne par ligne : une ligne de gris, puis quatre lignes de neuf teintes, du plus clair au
 * plus sombre. → Notak : nos teintes (Xmind a les siennes, qu'on ne reprend pas).
 */
export const NUANCIER: readonly string[] = [
  '#ffffff', '#ecedee', '#d4d6d9', '#b3b7bc', '#8d939a', '#696f77', '#484c51', '#26282b', '#000000',
  '#fddd87', '#fd9787', '#87fdc2', '#87fded', '#87ddfd', '#87befd', '#878ffd', '#ca87fd', '#fd87be',
  '#f3c649', '#f36049', '#49f39e', '#49f3dd', '#49c6f3', '#4998f3', '#4954f3', '#a949f3', '#f34998',
  '#d3a117', '#d33017', '#17d375', '#17d3ba', '#17a1d3', '#176fd3', '#1724d3', '#8217d3', '#d3176f',
  '#8e6e15', '#8e2515', '#158e52', '#158e7e', '#156e8e', '#154e8e', '#151d8e', '#5a158e', '#8e154e',
]

const RECENTES = 'notak.arbre.couleursRecentes'
const RECENTES_MAX = 9

/** Les couleurs récentes, la plus récente en tête. */
export function lireRecentes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTES) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENTES_MAX) : []
  } catch {
    return []
  }
}

/** Retient une couleur : en tête, sans doublon, neuf au plus. */
export function memoriserRecente(c: string): string[] {
  const liste = [c, ...lireRecentes().filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, RECENTES_MAX)
  try {
    localStorage.setItem(RECENTES, JSON.stringify(liste))
  } catch {
    // Pas de stockage (fenêtre privée) : les récentes ne durent pas.
  }
  return liste
}

interface Props {
  valeur: Mixte<string | null | undefined>
  /** `undefined` : la couleur du thème (« Par défaut »). */
  choisir(c: string | undefined): void
  titre: string
  inactif?: boolean
  /** L'opacité la plus haute qu'on puisse poser, en pour cent (une limite : 20). */
  opaciteMax?: number
  /** Les couleurs du thème de la carte. */
  theme?: readonly string[]
  /** Sans « Par défaut » (une couleur qui doit rester posée). */
  sansDefaut?: boolean
  className?: string
}

/** Le bouton de couleur : la couleur à plat, un trait en pointillé quand il n'y en a pas, trois points quand elles diffèrent. */
export function BoutonCouleur({ valeur, choisir, titre, inactif, opaciteMax = 100, theme, sansDefaut, className }: Props) {
  const ancre = useRef<HTMLButtonElement>(null)
  const [ouvert, setOuvert] = useState(false)
  const multiple = valeur === MULTIPLE
  const aucune = valeur === null || valeur === undefined || !!inactif
  return (
    <>
      <button
        ref={ancre}
        type="button"
        className={`notak-arbre-style-couleur${className ? ` ${className}` : ''}`}
        title={titre}
        aria-label={titre}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        disabled={inactif}
        data-aucune={!multiple && aucune ? '' : undefined}
        style={!multiple && !aucune ? { background: valeur as string } : undefined}
        onClick={() => setOuvert((o) => !o)}
      >
        {multiple && <Points />}
        <span className="notak-arbre-style-couleur-pipette" aria-hidden="true" />
      </button>
      {ouvert && <Selecteur ancre={ancre} fermer={() => setOuvert(false)} valeur={valeur} choisir={choisir} opaciteMax={opaciteMax} {...(theme ? { theme } : {})} {...(sansDefaut ? { sansDefaut } : {})} />}
    </>
  )
}

function Selecteur({ ancre, fermer, valeur, choisir, opaciteMax = 100, theme, sansDefaut }: Omit<Props, 'titre' | 'inactif' | 'className'> & { ancre: React.RefObject<HTMLElement | null>; fermer(): void }) {
  const [recentes] = useState(lireRecentes)
  const change = useRef<string | null>(null)
  // La couleur posée est retenue à la fermeture, pas à chaque pastille effleurée.
  useEffect(
    () => () => {
      if (change.current) memoriserRecente(change.current)
    },
    [],
  )
  return (
    <Popover ancre={ancre} fermer={fermer} largeur={264} className="notak-arbre-style-selecteur">
      <SelecteurCouleur
        valeur={typeof valeur === 'string' ? valeur : undefined}
        palette={NUANCIER}
        opaciteMax={opaciteMax}
        {...(theme ? { theme } : {})}
        recentes={recentes}
        retour={sansDefaut ? undefined : t('arbre.style.parDefaut')}
        fermer={fermer}
        choisir={(c) => {
          change.current = c ?? null
          choisir(c)
        }}
      />
    </Popover>
  )
}
