import type { ReactNode } from 'react'
import type { Arbre, Id } from '../../../coeur/tableau'
import { useVue } from '../Arbre'
import { Dessin } from '../Dessin'
import { emprise } from '../disposition/commun'
import { ECRAN_DE_FIN } from '../modele/gabarits'
import { TAILLES_DE_BASE } from '../modele/dimensions'
import type { RatioPitch } from '../themesPitch'
import { themeDe } from '../themes'

/**
 * L'écran de fin (relevé 10 § 5.5, relevé 12 § 8.3) : toute la carte, contenue dans la diapositive avec une marge de 20,
 * et la dernière diapositive (« Merci ») en vignette en haut à droite, à l'échelle 0,2 (0,233 en 4:3), à 30 des bords.
 */
export function EcranDeFin({ arbre, ratio, taille, adresse, vignette }: { arbre: Arbre; ratio: RatioPitch; taille: { l: number; h: number }; adresse?: ((fichier: Id) => string | undefined) | undefined; vignette: (taille: { l: number; h: number }) => ReactNode }) {
  const { lecture, mesures, disposition } = useVue(arbre)
  const cadre = emprise(disposition.boites.values())
  const k = taille.l / TAILLES_DE_BASE[ratio].l
  const marge = ECRAN_DE_FIN.margeCarte * k
  const echelle = ECRAN_DE_FIN.echelle(ratio)
  const petite = { l: Math.round(taille.l * echelle), h: Math.round(taille.h * echelle) }
  return (
    <div className="notak-arbre-diapo-fin" style={{ width: taille.l, height: taille.h, left: '50%', top: '50%', transform: 'translate(-50%, -50%)', background: themeDe(arbre.theme).fond ?? 'var(--notak-arbre-fond)' }}>
      <svg className="notak-arbre-diapo-fin-carte" style={{ left: marge, top: marge, width: taille.l - 2 * marge, height: taille.h - 2 * marge }} viewBox={`${cadre.x} ${cadre.y} ${Math.max(1, cadre.l)} ${Math.max(1, cadre.h)}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
        <Dessin arbre={arbre} lecture={lecture} disposition={disposition} mesures={mesures} adresse={adresse} />
      </svg>
      <div className="notak-arbre-diapo-fin-vignette" style={{ top: ECRAN_DE_FIN.marge * k, right: ECRAN_DE_FIN.marge * k, borderRadius: ECRAN_DE_FIN.rayon * k, border: `1px solid ${ECRAN_DE_FIN.bordure}` }}>
        {vignette(petite)}
      </div>
    </div>
  )
}
