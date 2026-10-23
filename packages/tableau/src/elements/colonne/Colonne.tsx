import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Rangees, useEmpreintes, useRanges } from '../../Cadre'
import type { Colonne, CouleurNote } from '../../coeur/tableau'
import { composition } from '../composition'
import { ecouterRecherche, ouverteParRecherche } from './recherche'
import { LIBELLES_COULEUR } from '../note/couleurs'
import type { PropsOutils, PropsRendu } from '../types'
import { t } from '../../langue'
import { Icone } from '../../icones'
import { useMenu } from '../../menuUnique'
import { BoutonOutil, OutilAvecMenu } from '../../BoutonOutil'

/** Le titre en édition : tout le texte est choisi à l'ouverture, Entrée valide et désélectionne (Échap, géré par la toile, garde le choix). */
function Saisie({ titre, surChangement, valider }: { titre: string; surChangement(t: string): void; valider(garder: boolean): void }) {
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
        // Entrée valide et désélectionne ; avec Maj, Alt ou Cmd, la colonne reste choisie.
        valider(e.shiftKey || e.altKey || e.metaKey || e.ctrlKey)
      }}
    />
  )
}

export function RenduColonne({ element, choisie, enEdition, contexte, brouillon, changer }: PropsRendu<Colonne>) {
  const { contenu } = element
  const enfants = useRanges(element.id)
  const empreintes = useEmpreintes(element.id)
  // En lecture seule, le repli reste utilisable, mais ne s'enregistre pas : il vaut pour cet écran seulement.
  const lectureSeule = !!contexte.services.lectureSeule
  const [local, setLocal] = useState<boolean>()
  // Repliée, elle s'ouvre d'elle-même quand la recherche trouve un de ses éléments.
  const ouverteParLaRecherche = useSyncExternalStore(ecouterRecherche, () => ouverteParRecherche(element.id))
  const repliee = !ouverteParLaRecherche && (lectureSeule && local !== undefined ? local : !!contenu.repliee)

  const replier = () => {
    const { repliee: _, ...reste } = contenu
    if (!repliee) {
      // Ce qui disparaît de l'écran ne reste pas choisi.
      const caches = new Set(enfants.map((e) => e.id))
      const restants = [...contexte.selection].filter((id) => !caches.has(id))
      contexte.choisir(restants.length > 0 ? restants : [element.id])
    }
    if (lectureSeule) return setLocal(!repliee)
    changer(repliee ? reste : { ...reste, repliee: true })
  }
  const libelleRepli = repliee ? t('decor.deplier') : t('colonne.replier')

  return (
    <div
      className="notak-colonne"
      data-couleur={contenu.couleur}
      data-repliee={repliee || undefined}
      data-choisie={choisie || undefined}
    >
      <div className="notak-colonne-tete">
        {enEdition ? (
          <Saisie
            titre={contenu.titre}
            surChangement={(titre) => brouillon({ ...contenu, titre: titre.trim() ? titre : contenu.titre })}
            valider={(garder) => {
              contexte.finirEdition()
              if (!garder) contexte.choisir([])
            }}
          />
        ) : (
          <span className="notak-colonne-titre" data-vide={contenu.titre ? undefined : true}>
            {contenu.titre || t('type.colonne')}
          </span>
        )}
        <button
          type="button"
          className="notak-colonne-plier"
          title={libelleRepli}
          aria-label={libelleRepli}
          aria-expanded={!repliee}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={replier}
        >
          <Icone nom={repliee ? 'colonneDeplier' : 'colonneReplier'} taille={16} />
        </button>
      </div>
      <div className="notak-colonne-compte">{enfants.length > 0 ? composition(enfants) : t('colonne.vide')}</div>
      {repliee && <div className="notak-colonne-repliee" data-depot />}
      {!repliee &&
        (enfants.length > 0 || empreintes.length > 0 ? (
          <div className="notak-colonne-corps">
            <Rangees enfants={enfants} empreintes={empreintes} contexte={contexte} />
          </div>
        ) : (
          <div className="notak-colonne-vide" data-depot />
        ))}
    </div>
  )
}

/** Les teintes d'une colonne, dans l'ordre de Milanote : dix, sans le brun, le gris en tête. */
const COULEURS_COLONNE = ['gris', 'cyan', 'vert', 'jaune', 'orange', 'rouge', 'rose', 'violet', 'bleu', 'bleu_nuit'] as const satisfies readonly CouleurNote[]

/** « Couleur » (la palette des colonnes choisies, un seul pas d'historique) et « Renommer » pour une colonne seule. */
export function OutilsColonne({ elements, contexte }: PropsOutils<Colonne>) {
  const [ouvert, setOuvert, ancre] = useMenu()
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
    <>
    <OutilAvecMenu menu={[ouvert, setOuvert, ancre]} classeAncre="notak-colonne-menu-ancre" icone="palette" titre={t('couleur.titre')} libelle={t('couleur.titre')} pastille={actuelle ? `var(--notak-colonne-${actuelle})` : undefined}>
      <div className="notak-colonne-palette" role="menu">
          <div className="notak-colonne-pastilles">
            <button type="button" role="menuitem" className="notak-pastille-aucune" title={t('couleur.aucune')} aria-label={t('couleur.aucune')} aria-pressed={actuelle === undefined} onClick={() => choisir(undefined)} />
            {COULEURS_COLONNE.map((c) => (
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
    </OutilAvecMenu>
    {elements.length === 1 && !contexte.services.lectureSeule && (
      <BoutonOutil icone="modifier" titre={t('colonne.renommer')} libelle={t('menu.renommer')} onClick={() => contexte.commencerEdition(elements[0]!.id)} />
    )}
    </>
  )
}
