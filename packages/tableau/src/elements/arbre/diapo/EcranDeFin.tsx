import type { ReactNode } from 'react'
import type { Arbre, Id } from '../../../coeur/tableau'
import { useVue } from '../Arbre'
import { Dessin } from '../Dessin'
import { emprise } from '../disposition/commun'
import { ECRAN_DE_FIN } from '../modele/gabarits'
import { TAILLES_DE_BASE } from '../modele/dimensions'
import type { RatioPitch } from '../themesPitch'
import { fondDe } from '../themes'

/**
 * L'écran de fin (relevé 10 § 5.5, relevé 12 § 8.3) : toute la carte, contenue dans la diapositive avec une marge de 20,
 * et la dernière diapositive (« Merci ») en vignette en haut à droite, à l'échelle 0,2 (0,233 en 4:3), à 30 des bords.
 * `haut` : la vignette descend jusque-là (px d'écran, depuis le haut de l'écran de fin), pour passer sous la barre.
 *
 * Le fond est celui de la carte, le sien d'abord (`fondDe`), comme dans l'éditeur. Il est posé en `background-color`, la
 * propriété même que l'apparition anime (`jouerFin`) : la rendre la laisse intacte.
 */
export function EcranDeFin({ arbre, ratio, taille, adresse, vignette, haut }: { arbre: Arbre; ratio: RatioPitch; taille: { l: number; h: number }; adresse?: ((fichier: Id) => string | undefined) | undefined; vignette: (taille: { l: number; h: number }) => ReactNode; haut?: number | undefined }) {
  const { lecture, mesures, disposition } = useVue(arbre)
  const cadre = emprise(disposition.boites.values())
  const k = taille.l / TAILLES_DE_BASE[ratio].l
  const marge = ECRAN_DE_FIN.margeCarte * k
  const echelle = ECRAN_DE_FIN.echelle(ratio)
  const petite = { l: Math.round(taille.l * echelle), h: Math.round(taille.h * echelle) }
  return (
    <div className="notak-arbre-diapo-fin" style={{ width: taille.l, height: taille.h, left: '50%', top: '50%', transform: 'translate(-50%, -50%)', backgroundColor: fondDe(arbre) ?? 'var(--notak-arbre-fond)' }}>
      <svg className="notak-arbre-diapo-fin-carte" style={{ left: marge, top: marge, width: taille.l - 2 * marge, height: taille.h - 2 * marge }} viewBox={`${cadre.x} ${cadre.y} ${Math.max(1, cadre.l)} ${Math.max(1, cadre.h)}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
        <Dessin arbre={arbre} lecture={lecture} disposition={disposition} mesures={mesures} adresse={adresse} />
      </svg>
      <div className="notak-arbre-diapo-fin-vignette" style={{ top: Math.max(ECRAN_DE_FIN.marge * k, haut ?? 0), right: ECRAN_DE_FIN.marge * k, borderRadius: ECRAN_DE_FIN.rayon * k, border: `1px solid ${ECRAN_DE_FIN.bordure}` }}>
        {vignette(petite)}
      </div>
    </div>
  )
}
