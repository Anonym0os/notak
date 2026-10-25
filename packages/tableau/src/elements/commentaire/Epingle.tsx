import { useEffect, useRef, useState } from 'react'
import { type Commentaire, type Element, type NoeudTexte, nouvelId } from '../../coeur/tableau'
import { t } from '../../langue'
import { ouvrirFil, useFilOuvert } from '../decor/etat'
import { FOND_NOTE, contraste } from '../note/couleurs'
import type { ContexteToile } from '../types'
import { CorpsFil } from './Corps'
import { AUTEUR_INCONNU, ajouterMessage } from './fil'
import { type PoigneeCompositeur } from './Compositeur'
import { marquerLu, nonLus, useSignalerFrappe } from './suivi'
import { peutCommenter } from '../../coeur/droitsElements'

/** La couleur d'une épingle sans couleur de fil : le bleu des liens de Milanote. */
export const BLEU_EPINGLE = '#2f63f7'

/** La couleur d'une épingle : celle du fil, sinon le bleu. */
export const couleurEpingle = (fil: Commentaire | undefined): string => (fil?.couleur && FOND_NOTE[fil.couleur as keyof typeof FOND_NOTE]) || BLEU_EPINGLE

/** Blanc ou presque noir pour le compte, selon la luminosité de l'épingle. */
const texteEpingle = (hex: string) => (contraste(hex, '#ffffff') >= contraste(hex, '#323b4a') ? '#ffffff' : '#323b4a')

/**
 * Le dessin d'une épingle de commentaire : 24 × 29 px, la pointe en bas, le nombre de messages dedans (99 au plus),
 * un point orange quand le fil a du nouveau. Elle ne grossit pas avec le zoom : la contre-échelle, ancrée à sa
 * pointe, la garde à sa taille d'écran.
 */
export function GlypheEpingle({ n, hex, nonLu }: { n: number; hex: string; nonLu?: boolean }) {
  return (
    <>
      <svg className="notak-epingle-forme" viewBox="0 0 24 29" width="24" height="29" aria-hidden>
        <path d="M12 28.5 3.2 18.2A11.2 11.2 0 0 1 1 11.5C1 5.4 5.9.5 12 .5s11 4.9 11 11c0 2.5-.8 4.8-2.2 6.7z" fill={hex} stroke="#fff" strokeWidth="1" />
      </svg>
      <span className="notak-epingle-compte" style={{ color: texteEpingle(hex) }}>
        {n > 99 ? 99 : n}
      </span>
      {nonLu && <span className="notak-epingle-nonlu" role="img" aria-label={t('commentaire.nonLu')} />}
    </>
  )
}

/** Ferme la bulle ouverte quand on appuie ailleurs : hors d'elle, de ses fenêtres (émojis, mentions) et des barres. */
export function useFermerAuClicDehors(actif: boolean, racine: React.RefObject<HTMLElement | null>, fermer: () => void) {
  const dernier = useRef(fermer)
  dernier.current = fermer
  useEffect(() => {
    if (!actif) return
    const dehors = (e: PointerEvent) => {
      const cible = e.target as HTMLElement | null
      if (!cible || racine.current?.contains(cible)) return
      if (cible.closest?.('.notak-fenetre-emojis, .notak-propositions, .notak-barre-outils, .notak-barre-selection')) return
      dernier.current()
    }
    document.addEventListener('pointerdown', dehors, true)
    return () => document.removeEventListener('pointerdown', dehors, true)
  }, [actif, racine])
}

/**
 * La bulle d'un fil accroché ou épinglé : le fil déployé, sans en-tête, à droite de l'épingle. Entrée envoie, Échap
 * ferme ; ce qu'on écrit ici part tout de suite, comme un message (pas de brouillon).
 */
export function BulleFil({
  fil,
  maj,
  contexte,
  cle,
  cles,
  signal,
  fermer,
}: {
  fil: Commentaire
  maj(apres: Commentaire): void
  contexte: ContexteToile
  /** Où le « lu » du fil est retenu. */
  cle: string
  /** Les clés de présence où l'on écrit dans ce fil. */
  cles: string[]
  /** Ce que je dis de moi pendant que j'écris (`null` : rien). */
  signal: string | null
  fermer(): void
}) {
  const auteur = contexte.services.presence?.moi?.() ?? AUTEUR_INCONNU
  const ecrire = peutCommenter(contexte.services)
  const champ = useRef<PoigneeCompositeur>(null)
  const frappe = useSignalerFrappe(contexte, signal)
  const [vide, setVide] = useState(true)
  const envoyer = (texte: string, riche: NoeudTexte | undefined) => {
    maj(ajouterMessage(fil, { id: nouvelId(), auteur, date: Date.now(), texte, ...(riche ? { riche } : {}) }))
    champ.current?.vider()
    setVide(true)
  }
  const texteCourant = useRef<{ texte: string; riche?: NoeudTexte }>({ texte: '' })
  return (
    <div
      className="notak-fil-attache"
      data-bande={fil.couleur ? '' : undefined}
      style={fil.couleur ? ({ '--bande': couleurEpingle(fil) } as React.CSSProperties) : undefined}
      role="dialog"
      aria-label={t('commentaire.titre')}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') fermer()
      }}
    >
      <div className="notak-commentaire">
        <CorpsFil
          fil={fil}
          contexte={contexte}
          cle={cle}
          cles={cles}
          vu
          maj={maj}
          vide={t('commentaire.aucun')}
          {...(ecrire
            ? {
                saisie: {
                  vide,
                  poignee: champ,
                  surFrappe: frappe,
                  surChangement: (texte: string, riche: NoeudTexte | undefined) => {
                    texteCourant.current = { texte, ...(riche ? { riche } : {}) }
                    setVide(!texte.trim())
                  },
                  envoyer,
                  echapper: () => {
                    fermer()
                    return true
                  },
                  publier: () => texteCourant.current.texte.trim() && envoyer(texteCourant.current.texte, texteCourant.current.riche),
                },
              }
            : {})}
        />
      </div>
    </div>
  )
}

/** Un point orange sur l'épingle quand le fil a du nouveau pour moi (et qu'il n'est pas ouvert). */
export function aDuNouveau(cle: string, fil: Commentaire | undefined, moi: string): boolean {
  return !!fil && nonLus(cle, fil.messages, moi).length > 0
}

/**
 * Un fil réduit en épingle sur la toile : l'élément n'est plus que l'épingle (24 × 29 px, de la couleur du fil), qui
 * se glisse comme tout élément. Un clic l'ouvre en bulle à sa droite ; on la ferme d'Échap, de sa croix ou d'un appui
 * ailleurs. La modifier (double-clic, Entrée) ouvre la bulle, champ en main.
 */
export function EpingleLibre({ element, enEdition, contexte, changer }: { element: Element<Commentaire>; enEdition: boolean; contexte: ContexteToile; changer(c: Commentaire): void }) {
  const fil = element.contenu
  const ouvert = useFilOuvert() === element.id
  const racine = useRef<HTMLDivElement>(null)
  const jeSuis = (contexte.services.presence?.moi?.() ?? AUTEUR_INCONNU).id
  // Éditer une épingle, c'est l'ouvrir.
  useEffect(() => {
    if (!enEdition) return
    ouvrirFil(element.id)
    contexte.finirEdition()
  }, [enEdition, element.id, contexte])
  useEffect(() => {
    if (ouvert) marquerLu(element.id, fil.messages.reduce((d, m) => Math.max(d, m.date), 0))
  }, [ouvert, element.id, fil.messages])
  useFermerAuClicDehors(ouvert, racine, () => ouvrirFil(null))
  return (
    <div ref={racine} className="notak-commentaire notak-commentaire-epingle" data-epingle>
      <button
        type="button"
        className="notak-epingle-bouton notak-epingle-libre"
        aria-expanded={ouvert}
        aria-label={`${t('decor.ouvrirCommentaires')} (${fil.messages.length})`}
        onClick={() => !ouvert && ouvrirFil(element.id)}
      >
        <GlypheEpingle n={fil.messages.length} hex={couleurEpingle(fil)} nonLu={!ouvert && aDuNouveau(element.id, fil, jeSuis)} />
      </button>
      {ouvert && (
        <div className="notak-epingle-bulle">
          <BulleFil fil={fil} maj={changer} contexte={contexte} cle={element.id} cles={[element.id, `fil:${element.id}`]} signal={`fil:${element.id}`} fermer={() => ouvrirFil(null)} />
        </div>
      )}
    </div>
  )
}
