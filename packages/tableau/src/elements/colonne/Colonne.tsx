import { useLayoutEffect, useRef, useState } from 'react'
import { Rangees, useEmpreintes, useRanges } from '../../Cadre'
import { COULEURS_NOTE, type Colonne, type CouleurNote } from '../../coeur/tableau'
import { composition } from '../composition'
import { LIBELLES_COULEUR } from '../note/couleurs'
import type { PropsOutils, PropsRendu } from '../types'
import { t } from '../../langue'
import { Icone } from '../../icones'

/** Le titre en édition : tout le texte est choisi à l'ouverture, Entrée valide (Échap est géré par la toile). */
function Saisie({ titre, surChangement, valider }: { titre: string; surChangement(t: string): void; valider(): void }) {
  const champ = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    champ.current?.focus({ preventScroll: true })
    champ.current?.select()
  }, [])
  return (
    <input
      ref={champ}
      className="notak-colonne-saisie"
      defaultValue={titre}
      aria-label={t('colonne.titre')}
      maxLength={100}
      spellCheck={false}
      onChange={(e) => surChangement(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
        e.preventDefault()
        valider()
      }}
    />
  )
}

export function RenduColonne({ element, choisie, enEdition, contexte, brouillon, changer }: PropsRendu<Colonne>) {
  const { contenu } = element
  const enfants = useRanges(element.id)
  const empreintes = useEmpreintes(element.id)

  const replier = () => {
    const { repliee: _, ...reste } = contenu
    if (!contenu.repliee) {
      // Ce qui disparaît de l'écran ne reste pas choisi.
      const caches = new Set(enfants.map((e) => e.id))
      const restants = [...contexte.selection].filter((id) => !caches.has(id))
      contexte.choisir(restants.length > 0 ? restants : [element.id])
    }
    changer(contenu.repliee ? reste : { ...reste, repliee: true })
  }

  return (
    <div
      className="notak-colonne"
      data-couleur={contenu.couleur}
      data-repliee={contenu.repliee || undefined}
      data-choisie={choisie || undefined}
    >
      <div className="notak-colonne-tete">
        {enEdition ? (
          <Saisie titre={contenu.titre} surChangement={(titre) => brouillon({ ...contenu, titre: titre.trim() ? titre : contenu.titre })} valider={contexte.finirEdition} />
        ) : (
          <span className="notak-colonne-titre" data-vide={contenu.titre ? undefined : true}>
            {contenu.titre || t('type.colonne')}
          </span>
        )}
        <button
          type="button"
          className="notak-colonne-plier"
          title={contenu.repliee ? t('decor.deplier') : t('colonne.replier')}
          aria-label={contenu.repliee ? t('decor.deplier') : t('colonne.replier')}
          aria-expanded={!contenu.repliee}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={replier}
        >
          <Icone nom="chevronBas" taille={14} />
        </button>
      </div>
      {contenu.repliee && <div className="notak-colonne-repliee" data-depot />}
      {!contenu.repliee &&
        (enfants.length > 0 || empreintes.length > 0 ? (
          <div className="notak-colonne-corps">
            <Rangees enfants={enfants} empreintes={empreintes} contexte={contexte} />
          </div>
        ) : (
          <div className="notak-colonne-vide" data-depot>
            {t('colonne.deposer')}
          </div>
        ))}
      {enfants.length > 0 && <div className="notak-colonne-compte">{composition(enfants)}</div>}
    </div>
  )
}

/** « Couleur » : la palette des colonnes choisies. Un seul pas d'historique. */
export function OutilsColonne({ elements, contexte }: PropsOutils<Colonne>) {
  const [ouvert, setOuvert] = useState(false)
  const choisir = (couleur: CouleurNote | undefined) => {
    contexte.magasin.faire(
      elements.map((e) => {
        const { couleur: _, ...reste } = e.contenu
        return { type: 'contenu', id: e.id, avant: e.contenu, apres: couleur ? { ...reste, couleur } : reste }
      }),
    )
    setOuvert(false)
  }
  const actuelle = elements.every((e) => e.contenu.couleur === elements[0]!.contenu.couleur) ? elements[0]!.contenu.couleur : undefined
  return (
    <div className="notak-colonne-menu-ancre">
      <button type="button" title={t('couleur.titre')} aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        {t('couleur.titre')}
      </button>
      {ouvert && (
        <div className="notak-colonne-palette" role="menu">
          <button type="button" role="menuitem" aria-pressed={actuelle === undefined} onClick={() => choisir(undefined)}>
            {t('couleur.aucune')}
          </button>
          <div className="notak-colonne-pastilles">
            {COULEURS_NOTE.map((c) => (
              <button
                key={c}
                type="button"
                role="menuitem"
                title={LIBELLES_COULEUR[c]}
                aria-label={LIBELLES_COULEUR[c]}
                aria-pressed={actuelle === c}
                style={{ background: `var(--notak-colonne-${c})` }}
                onClick={() => choisir(c)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
