import { useMemo, useRef } from 'react'
import type { Arbre, Commentaire, Id } from '../../coeur/tableau'
import { t } from '../../langue'
import { BulleFil, GlypheEpingle, aDuNouveau, couleurEpingle, useFermerAuClicDehors } from '../commentaire/Epingle'
import { AUTEUR_INCONNU } from '../commentaire/fil'
import type { ContexteToile } from '../types'
import type { Camera } from './modele/camera'
import { sujetsCommentes } from './modele/commentaires'
import type { Disposition } from './disposition'
import type { Lecture } from './modele/sujets'

/**
 * Les épingles de commentaires d'une carte : une par sujet commenté, au coin haut droit du sujet, avec le nombre de
 * messages. C'est l'épingle de la toile (`commentaire/Epingle.tsx`) : même dessin, même fil, même saisie. Elles sont
 * posées en HTML par-dessus la carte, à l'endroit où la caméra met le sujet : elles le suivent au zoom et au
 * déplacement sans grossir. Un clic ouvre le fil à leur droite.
 */

/** La pointe de l'épingle tombe un peu en dedans du coin haut droit du sujet : le corps de l'épingle reste au-dessus. */
const DEDANS = { x: -4, y: 4 }

const garder = (e: React.SyntheticEvent) => e.stopPropagation()
const sansMenu = (e: React.MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()
}

/** Où le « lu » et la présence retiennent le fil d'un sujet. */
export const cleFil = (carte: Id, sujet: Id) => `fil:${carte}:${sujet}`

interface PropsEpingles {
  /** L'identifiant de l'élément carte (les fils de deux cartes ne se confondent pas). */
  carte: Id
  arbre: Arbre
  lecture: Lecture
  disposition: Disposition
  camera: Camera
  /** Le sujet dont le fil est ouvert. */
  ouvert: Id | null
  ouvrir(id: Id | null): void
  contexte: ContexteToile
  /** Écrire dans les fils : faux en lecture seule, où ils se lisent seulement. */
  ecrire: boolean
  /** Remplace le fil d'un sujet (`null` : le retirer). */
  poser(id: Id, fil: Commentaire | null): void
}

/** Les services d'une carte qu'on ne peut pas écrire : la saisie et les gestes du fil (réagir, résoudre, corriger) disparaissent. */
function enLecture(contexte: ContexteToile): ContexteToile {
  const { droits: _, ...services } = contexte.services
  return { ...contexte, services: { ...services, lectureSeule: true } }
}

export function EpinglesCarte({ carte, arbre, lecture, disposition, camera, ouvert, ouvrir, contexte, ecrire, poser }: PropsEpingles) {
  const ctx = useMemo(() => (ecrire ? contexte : enLecture(contexte)), [contexte, ecrire])
  // Le fil ouvert d'un sujet encore sans message se montre aussi : c'est lui qu'on est en train d'écrire.
  const ids = sujetsCommentes(arbre, lecture)
  if (ouvert && lecture.sujets.has(ouvert) && !ids.includes(ouvert)) ids.push(ouvert)
  return (
    <>
      {ids.map((id) => {
        const b = disposition.boites.get(id)
        if (!b) return null
        return (
          <EpingleSujet
            key={id}
            id={id}
            cle={cleFil(carte, id)}
            fil={arbre.fils?.[id] ?? { type: 'commentaire', messages: [] }}
            x={camera.x + (b.x + b.l) * camera.z + DEDANS.x}
            y={camera.y + b.y * camera.z + DEDANS.y}
            ouvert={ouvert === id}
            ouvrir={ouvrir}
            contexte={ctx}
            poser={poser}
          />
        )
      })}
    </>
  )
}

function EpingleSujet({ id, cle, fil, x, y, ouvert, ouvrir, contexte, poser }: {
  id: Id
  cle: string
  fil: Commentaire
  x: number
  y: number
  ouvert: boolean
  ouvrir(id: Id | null): void
  contexte: ContexteToile
  poser(id: Id, fil: Commentaire | null): void
}) {
  const racine = useRef<HTMLDivElement>(null)
  const jeSuis = (contexte.services.presence?.moi?.() ?? AUTEUR_INCONNU).id
  useFermerAuClicDehors(ouvert, racine, () => ouvrir(null))
  const n = fil.messages.length
  const titre = ouvert ? t('decor.fermerCommentaires') : t('decor.ouvrirCommentaires')
  return (
    <div ref={racine} className="notak-epingle" data-epingle-sujet={id} style={{ left: x, top: y }} onPointerDown={garder} onDoubleClick={garder} onContextMenu={sansMenu}>
      <button
        type="button"
        className="notak-epingle-bouton"
        data-resolu={fil.resolu || undefined}
        aria-expanded={ouvert}
        aria-label={`${titre} (${n})`}
        title={titre}
        onClick={() => ouvrir(ouvert ? null : id)}
      >
        <GlypheEpingle n={n} hex={couleurEpingle(fil)} nonLu={!ouvert && aDuNouveau(cle, fil, jeSuis)} />
      </button>
      {ouvert && <BulleFil fil={fil} maj={(apres) => poser(id, apres)} contexte={contexte} cle={cle} cles={[cle]} signal={cle} fermer={() => ouvrir(null)} />}
    </div>
  )
}
