import { useState } from 'react'
import { THEMES, cleNomTheme } from './themes'
import type { Arbre, Id, Relation, StructureArbre } from '../../coeur/tableau'
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
  /** Commencer une relation depuis le sujet courant. */
  relier(): void
  /** Ouvrir ou fermer le panneau du sujet. */
  panneau(): void
  /** La relation choisie, s'il y en a une : ses réglages remplacent les boutons d'insertion. */
  relation: Id | null
}

/**
 * La barre de la carte ouverte : la structure des sujets choisis (celle du central si rien n'est choisi), et les
 * réglages de la carte entière. Les mots seuls, comme le menu « Structure » de Xmind.
 */
export function Barre({ arbre, lecture: l, choisis, faire, relier, panneau, relation }: Props) {
  const [themes, setThemes] = useState(false)
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
      <div className="notak-arbre-menu-hote">
        <button type="button" aria-expanded={themes} aria-haspopup="menu" onClick={() => setThemes((o) => !o)}>
          {t('arbre.theme')} · {t(cleNomTheme(arbre.theme ?? 'classique'))}
        </button>
        {themes && (
          <div className="notak-arbre-menu" role="menu">
            {THEMES.map((th) => (
              <button
                key={th.id}
                type="button"
                role="menuitemradio"
                aria-checked={(arbre.theme ?? 'classique') === th.id}
                onClick={() => {
                  faire({ type: 'theme', theme: th.id })
                  setThemes(false)
                }}
              >
                <span className="notak-arbre-nuancier" aria-hidden>
                  {th.palette.slice(0, 6).map((c, i) => (
                    <i key={i} style={{ background: c }} />
                  ))}
                </span>
                {t(cleNomTheme(th.id))}
              </button>
            ))}
          </div>
        )}
      </div>
      <label className="notak-arbre-case">
        <input type="checkbox" checked={!options.uneCouleur} onChange={(e) => faire({ type: 'options', options: { ...options, uneCouleur: !e.target.checked } })} />
        {t('arbre.arcEnCiel')}
      </label>
      <span className="notak-arbre-sep" role="separator" />
      {relation && arbre.relations?.[relation] ? (
        <ReglagesRelation id={relation} r={arbre.relations[relation]!} faire={faire} />
      ) : (
        <>
      <button type="button" title="⇧⌘R" onClick={relier}>
        {t('arbre.relation')}
      </button>
      <button type="button" title="⇧⌘B" disabled={choisis.length === 0 || !aucunCentral} onClick={() => faire({ type: 'limite', ids: choisis })}>
        {t('arbre.limite')}
      </button>
      <button type="button" disabled={choisis.length === 0 || !aucunCentral} onClick={() => faire({ type: 'resume', ids: choisis })}>
        {t('arbre.resume')}
      </button>
      <button type="button" title="⌘]" onClick={panneau}>
        {t('arbre.panneau')}
      </button>
        </>
      )}
      <span className="notak-arbre-sep" role="separator" />
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

/** Les réglages d'une relation choisie : sa forme et ses pointes. */
function ReglagesRelation({ id, r, faire }: { id: Id; r: Relation; faire(g: Geste): void }) {
  const pointes = { depart: false, arrivee: true, ...r.pointes }
  return (
    <span className="notak-arbre-pas" role="group" aria-label={t('arbre.relation')}>
      {(['courbe', 'droite', 'coudee'] as const).map((f) => (
        <button key={f} type="button" aria-pressed={(r.forme ?? 'courbe') === f} onClick={() => faire({ type: 'relationStyle', id, forme: f })}>
          {t(`arbre.b.${f}`)}
        </button>
      ))}
      <label className="notak-arbre-case">
        <input type="checkbox" checked={pointes.depart} onChange={(e) => faire({ type: 'relationStyle', id, pointes: { ...pointes, depart: e.target.checked } })} />
        {t('arbre.pointeDepart')}
      </label>
      <label className="notak-arbre-case">
        <input type="checkbox" checked={pointes.arrivee} onChange={(e) => faire({ type: 'relationStyle', id, pointes: { ...pointes, arrivee: e.target.checked } })} />
        {t('arbre.pointeArrivee')}
      </label>
    </span>
  )
}
