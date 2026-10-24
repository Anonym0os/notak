import type { RefObject } from 'react'
import type { Arbre, Id } from '../../coeur/tableau'
import { t } from '../../langue'
import { Popover } from './controles-style'
import type { Geste } from './modele/gestes'
import { patchCouleurBordure, patchCouleurRemplissage, valeursDe } from './modele/style'
import type { Lecture } from './modele/sujets'
import { CLASSES_RAPIDES, ExempleSujet } from './OngletStyle'

const T = (cle: string) => t(`arbre.style.${cle}`)

/** La couleur de bordure proposée pour une teinte de la palette : la teinte à 30 %, comme Xmind (« 4D » en hexadécimal). */
export const bordureDe = (couleur: string) => `${couleur.slice(0, 7)}4D`

interface Props {
  /** Le pinceau de la barre du sujet, sous lequel la fenêtre se pose. */
  ancre: RefObject<HTMLElement | null>
  arbre: Arbre
  lecture: Lecture
  ids: Id[]
  /** Les teintes de la carte (son thème) : les mêmes pour le remplissage et la bordure. */
  palette: readonly string[]
  faire(g: Geste): void
  fermer(): void
}

/**
 * Le pinceau de la barre du sujet, comme celui de Xmind (« Style ») : une fenêtre sous le bouton, avec le style rapide,
 * puis la couleur de remplissage et celle de la bordure, prises dans la palette de la carte. Un choix s'applique aux
 * sujets choisis, en un seul geste annulable, et ferme la fenêtre.
 */
export function ChoixStyle({ ancre, arbre, lecture, ids, palette, faire, fermer }: Props) {
  const classes = new Set(ids.map((id) => lecture.sujets.get(id)?.classe))
  const classe = classes.size === 1 ? [...classes][0] : null
  const vals = ids.map((id) => valeursDe(arbre, lecture, id))
  const remplissage = new Set(vals.map((v) => v.remplissage?.toLowerCase()))
  const bordure = new Set(vals.map((v) => v.bordure?.toLowerCase()))
  const appliquer = (g: Geste) => {
    faire(g)
    fermer()
  }
  // Chaque sujet garde son motif : la couleur ne fait que réapparaître le remplissage ou la bordure s'il n'y en avait pas.
  const remplir = (c: string) => appliquer({ type: 'lot', gestes: ids.map((id, i): Geste => ({ type: 'style', ids: [id], style: patchCouleurRemplissage(vals[i]!.motifRemplissage, c) })) })
  const border = (c: string) => appliquer({ type: 'lot', gestes: ids.map((id, i): Geste => ({ type: 'style', ids: [id], style: patchCouleurBordure(vals[i]!.motifBordure, vals[i]!.epaisseurBordure, c) })) })
  const grille = (couleurs: readonly string[], titre: string, choisie: Set<string | undefined>, choisir: (c: string) => void) => (
    <section className="notak-arbre-choix-style-section">
      <span className="notak-arbre-choix-style-sous-titre">{titre}</span>
      <div className="notak-arbre-choix-style-couleurs" role="group" aria-label={titre}>
        {couleurs.map((c, i) => (
          <button
            key={`${c}${i}`}
            type="button"
            className="notak-arbre-style-pastille"
            style={{ background: c, ['--notak-arbre-style-anneau' as string]: c.slice(0, 7) }}
            title={c.toUpperCase()}
            aria-label={c.toUpperCase()}
            aria-pressed={choisie.size === 1 && choisie.has(c.toLowerCase())}
            onClick={() => choisir(c)}
          />
        ))}
      </div>
    </section>
  )
  return (
    <Popover ancre={ancre} fermer={fermer} largeur={248} className="notak-arbre-style-carte notak-arbre-choix-style">
      <strong className="notak-arbre-choix-style-titre">{t('arbre.style')}</strong>
      <section className="notak-arbre-choix-style-section">
        <span className="notak-arbre-choix-style-sous-titre">{T('styleRapide')}</span>
        <div className="notak-arbre-choix-style-rapides">
          {CLASSES_RAPIDES.map((c) => (
            <button
              key={c.cle}
              type="button"
              className="notak-arbre-style-rapide-ligne"
              title={T(`rapide.${c.cle}`)}
              aria-label={T(`rapide.${c.cle}`)}
              aria-pressed={classe !== null && classe === c.classe}
              onClick={() => appliquer({ type: 'porter', ids, champ: 'classe', valeur: c.classe })}
            >
              <ExempleSujet classe={c.classe} />
            </button>
          ))}
        </div>
      </section>
      <hr className="notak-arbre-choix-style-filet" />
      {grille(palette, T('couleurDeRemplissage'), remplissage, remplir)}
      <hr className="notak-arbre-choix-style-filet" />
      {grille(palette.map(bordureDe), T('couleurDeBordure'), bordure, border)}
    </Popover>
  )
}
