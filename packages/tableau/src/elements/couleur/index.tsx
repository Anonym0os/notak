import { useSyncExternalStore } from 'react'
import { COULEURS_NOTE, type CouleurNote, type Element, type Operation } from '../../coeur/tableau'
import { LIBELLES_COULEUR } from '../note/couleurs'
import { definition, registre } from '../registre'
import type { ContexteToile } from '../types'
import { t } from '../../langue'
import { useMenu } from '../../menuUnique'

const sans = () => () => {}

/**
 * « Couleur » pour une sélection de types mêlés (des notes, une colonne, un tableau) : la même palette pour tous.
 * Elle ne paraît que si chaque type choisi sait se colorer ; une sélection d'un seul type garde son propre outil.
 */
function OutilCouleur({ elements, contexte }: { elements: Element[]; contexte: ContexteToile }) {
  const [ouvert, setOuvert, ancre] = useMenu()
  const types = new Set(elements.map((e) => e.contenu.type))
  const colorations = [...types].map((t) => definition(t)?.couleur)
  const actuelle = useSyncExternalStore(contexte.services.ecouterEspace ?? sans, () => {
    const vues = new Set(elements.map((e) => definition(e.contenu.type)?.couleur?.lire(e as never, contexte)))
    return vues.size === 1 ? [...vues][0] : null
  })
  if (types.size < 2 || colorations.some((c) => !c)) return null
  // « Aucune » n'a de sens que si chacun sait revenir sans couleur (un tableau en a toujours une).
  const sansCouleur = colorations.every((c) => c!.vers)

  const choisir = (couleur: CouleurNote | undefined) => {
    const pas: Operation[] = []
    for (const e of elements) {
      const c = definition(e.contenu.type)!.couleur!
      if (c.vers) pas.push({ type: 'contenu', id: e.id, avant: e.contenu, apres: c.vers(e.contenu as never, couleur) })
      else if (couleur) c.ailleurs?.(e as never, couleur, contexte)
    }
    if (pas.length > 0) contexte.magasin.faire(pas)
    setOuvert(false)
  }
  return (
    <div className="notak-note-menu-ancre" ref={ancre}>
      <button type="button" title={t('couleur.titre')} aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        {t('couleur.titre')}
      </button>
      {ouvert && (
        <div className="notak-note-palette" role="menu">
          <div className="notak-note-pastilles">
            {sansCouleur && <button type="button" role="menuitem" className="notak-pastille-aucune" title={t('couleur.aucune')} aria-label={t('couleur.aucune')} aria-pressed={actuelle === undefined} onClick={() => choisir(undefined)} />}
            {COULEURS_NOTE.map((c) => (
              <button key={c} type="button" role="menuitem" title={LIBELLES_COULEUR[c]} aria-label={LIBELLES_COULEUR[c]} aria-pressed={actuelle === c} data-fond={c} onClick={() => choisir(c)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

registre.outilCommun(OutilCouleur)

/** La couleur rangée dans le contenu (`couleur`), qu'on retire pour « Aucune ». */
export function couleurDuContenu<C extends { couleur?: CouleurNote }>() {
  return {
    lire: (e: Element<C & Element['contenu']>) => e.contenu.couleur,
    vers: (c: C, couleur: CouleurNote | undefined): C => {
      const { couleur: _, ...reste } = c
      return (couleur ? { ...reste, couleur } : reste) as C
    },
  }
}
