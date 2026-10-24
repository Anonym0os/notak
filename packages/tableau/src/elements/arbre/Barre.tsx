import { useState } from 'react'
import type { Arbre, Id, StructureArbre } from '../../coeur/tableau'
import { t } from '../../langue'
import type { Geste } from './modele/gestes'
import { type Lecture, enfantsDe } from './modele/sujets'

/** Les structures dans l'ordre du menu, par famille (docs/XMIND.md § 2). */
export const STRUCTURES: readonly (readonly StructureArbre[])[] = [
  ['carte', 'carte-libre', 'carte-horaire', 'carte-antihoraire'],
  ['logique-droite', 'logique-gauche', 'accolade-droite', 'accolade-gauche'],
  ['organigramme-bas', 'organigramme-haut', 'arbre-droite', 'arbre-gauche'],
  ['chronologie-horizontale', 'chronologie-verticale', 'arete-gauche', 'arete-droite'],
  ['matrice-lignes', 'matrice-colonnes'],
]

const nomDe = (s: StructureArbre) => t(`arbre.s.${s}`)

interface Props {
  arbre: Arbre
  lecture: Lecture
  /** Les sujets choisis : la structure choisie s'applique à eux. */
  choisis: Id[]
  faire(g: Geste): void
}

/**
 * La barre de la carte ouverte : la structure des sujets choisis (celle du central si rien n'est choisi), et les
 * réglages de la carte entière. Les mots seuls, comme le menu « Structure » de Xmind.
 */
export function Barre({ arbre, lecture: l, choisis, faire }: Props) {
  const [ouvert, setOuvert] = useState(false)
  const cibles = choisis.length > 0 ? choisis : [l.central]
  const actuelle = l.sujets.get(cibles[0]!)?.structure ?? null
  const options = arbre.options ?? {}
  const central = l.sujets.get(l.central)
  const nonEquilibree = central?.structure === 'carte-libre'
  const principaux = enfantsDe(l, l.central).length
  const aDroite = Math.min(principaux, central?.aDroite ?? principaux)
  const aucunCentral = !cibles.includes(l.central)
  return (
    // Un clic sur la barre ne prend pas le focus : le clavier reste à la carte (Tab crée toujours un sous-sujet).
    <div className="notak-arbre-barre" role="toolbar" aria-label={t('type.arbre')} onMouseDown={(e) => e.preventDefault()}>
      <div className="notak-arbre-menu-hote">
        <button type="button" aria-expanded={ouvert} aria-haspopup="menu" onClick={() => setOuvert((o) => !o)}>
          {t('arbre.structure')} · {actuelle ? nomDe(actuelle) : t('arbre.suivre')}
        </button>
        {ouvert && (
          <div className="notak-arbre-menu" role="menu">
            {aucunCentral && (
              <button type="button" role="menuitemradio" aria-checked={actuelle === null} onClick={() => (faire({ type: 'structure', ids: cibles, structure: null }), setOuvert(false))}>
                {t('arbre.suivre')}
              </button>
            )}
            {STRUCTURES.map((groupe, i) => (
              <div key={i} className="notak-arbre-menu-groupe" role="group">
                {groupe.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="menuitemradio"
                    aria-checked={actuelle === s}
                    onClick={() => {
                      faire({ type: 'structure', ids: cibles, structure: s })
                      setOuvert(false)
                    }}
                  >
                    {nomDe(s)}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      {nonEquilibree && (
        <span className="notak-arbre-pas" role="group" aria-label={t('arbre.aDroite')}>
          {t('arbre.aDroite')}
          <button type="button" aria-label="−" disabled={aDroite <= 0} onClick={() => faire({ type: 'aDroite', n: aDroite - 1 })}>
            −
          </button>
          <output>{aDroite}</output>
          <button type="button" aria-label="+" disabled={aDroite >= principaux} onClick={() => faire({ type: 'aDroite', n: aDroite + 1 })}>
            +
          </button>
        </span>
      )}
      <label className="notak-arbre-case">
        <input type="checkbox" checked={!!options.compacte} onChange={(e) => faire({ type: 'options', options: { ...options, compacte: e.target.checked } })} />
        {t('arbre.compacte')}
      </label>
      <label className="notak-arbre-case">
        <input type="checkbox" checked={!!options.libre} onChange={(e) => faire({ type: 'options', options: { ...options, libre: e.target.checked } })} />
        {t('arbre.libre')}
      </label>
      {options.libre && (
        <button type="button" onClick={() => faire({ type: 'realigner' })}>
          {t('arbre.realigner')}
        </button>
      )}
    </div>
  )
}
