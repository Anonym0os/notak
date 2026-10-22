import { useState } from 'react'
import { COULEURS_NOTE, type CouleurNote, type Ligne, type Pointe } from '../../coeur/tableau'
import { FOND_NOTE, LIBELLES_COULEUR } from '../note/couleurs'
import type { PropsOutils } from '../types'
import { GRIS_LIGNE } from './couleur'
import { editionLibelle } from './edition'

const EPAISSEURS = [1, 2, 4] as const
const TRAITS = [
  { trait: 'plein', icone: '—', titre: 'Trait plein' },
  { trait: 'tirets', icone: '┄', titre: 'Tirets' },
] as const

/** La barre des lignes choisies. Plusieurs lignes : chaque changement s'applique à toutes, en un seul pas d'historique. */
export function OutilsLigne({ elements, contexte }: PropsOutils<Ligne>) {
  const [palette, setPalette] = useState(false)
  const modifier = (f: (l: Ligne) => Ligne) => {
    const pas = elements.flatMap((e) => {
      const apres = f(e.contenu)
      return JSON.stringify(apres) === JSON.stringify(e.contenu)
        ? []
        : [{ type: 'contenu' as const, id: e.id, avant: e.contenu, apres }]
    })
    contexte.magasin.faire(pas)
  }
  const tous = <T,>(lire: (l: Ligne) => T, valeur: T) => elements.every((e) => lire(e.contenu) === valeur)
  const bascule = (clef: 'pointeDepart' | 'pointeArrivee') => {
    const vers: Pointe = tous((l) => l[clef], 'fleche') ? 'rien' : 'fleche'
    modifier((l) => ({ ...l, [clef]: vers }))
  }
  const colorier = (couleur: CouleurNote | undefined) => {
    modifier((l) => {
      const { couleur: _, ...reste } = l
      return couleur ? { ...reste, couleur } : reste
    })
    setPalette(false)
  }
  const actuelle = elements.every((e) => e.contenu.couleur === elements[0]!.contenu.couleur) ? elements[0]!.contenu.couleur : null

  return (
    <>
      <button type="button" title="Pointe de départ" aria-pressed={tous((l) => l.pointeDepart, 'fleche')} onClick={() => bascule('pointeDepart')}>
        ◀
      </button>
      <button type="button" title="Pointe d’arrivée" aria-pressed={tous((l) => l.pointeArrivee, 'fleche')} onClick={() => bascule('pointeArrivee')}>
        ▶
      </button>
      <span className="notak-ligne-sep" />
      {TRAITS.map((t) => (
        <button key={t.trait} type="button" title={t.titre} aria-pressed={tous((l) => l.trait, t.trait)} onClick={() => modifier((l) => ({ ...l, trait: t.trait }))}>
          {t.icone}
        </button>
      ))}
      <span className="notak-ligne-sep" />
      {EPAISSEURS.map((n) => (
        <button key={n} type="button" title={`Épaisseur ${n}`} aria-pressed={tous((l) => l.epaisseur, n)} onClick={() => modifier((l) => ({ ...l, epaisseur: n }))}>
          {n}
        </button>
      ))}
      <span className="notak-ligne-sep" />
      <div className="notak-ligne-ancre">
        <button type="button" title="Couleur" aria-expanded={palette} onClick={() => setPalette(!palette)}>
          Couleur
        </button>
        {palette && (
          <div className="notak-ligne-palette" role="menu">
            <button type="button" role="menuitem" title="Gris foncé" aria-label="Gris foncé" aria-pressed={actuelle === undefined} style={{ background: GRIS_LIGNE }} onClick={() => colorier(undefined)} />
            {COULEURS_NOTE.map((c) => (
              <button key={c} type="button" role="menuitem" title={LIBELLES_COULEUR[c]} aria-label={LIBELLES_COULEUR[c]} aria-pressed={actuelle === c} style={{ background: FOND_NOTE[c] }} onClick={() => colorier(c)} />
            ))}
          </div>
        )}
      </div>
      {elements.length === 1 && (
        <button type="button" title="Libellé" aria-pressed={!!elements[0]!.contenu.libelle} onClick={() => editionLibelle.ouvrir(elements[0]!.id)}>
          Libellé
        </button>
      )}
    </>
  )
}
