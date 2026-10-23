import { useEffect, useRef, useState } from 'react'
import { type Commentaire, type Element, annoter, nouvelId } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { Ligne } from './Commentaire'
import { AUTEUR_INCONNU, ajouterMessage, resoudre, retirerMessage } from './fil'
import { t } from '../../langue'

const garder = (e: React.SyntheticEvent) => e.stopPropagation()

/** Le fil vide sur lequel repart un élément qui n'en avait pas. */
const VIDE: Commentaire = { type: 'commentaire', messages: [] }

/** Un fil, ou plus rien : un fil sans message n'a pas à rester accroché. */
const poser = (e: Element, fil: Commentaire) => annoter(e, { commentaire: fil.messages.length > 0 ? fil : null })

/**
 * Le fil de discussion accroché à un élément : les mêmes messages, auteurs et dates que l'élément Commentaire
 * (voir `fil.ts`), mais rangés dans l'élément lui-même plutôt que posés sur la toile.
 */
export function FilAttache({ element, contexte, fermer }: { element: Element; contexte: ContexteToile; fermer(): void }) {
  const [texte, setTexte] = useState('')
  const champ = useRef<HTMLTextAreaElement>(null)
  const fil = element.commentaire ?? VIDE
  const auteur = contexte.services.presence?.moi?.() ?? AUTEUR_INCONNU
  const ecrire = !contexte.services.lectureSeule
  useEffect(() => {
    if (ecrire) champ.current?.focus()
  }, [ecrire])

  const agir = (apres: Commentaire) => {
    const op = poser(element, apres)
    if (op) contexte.magasin.faire([op])
  }
  const envoyer = () => {
    if (!texte.trim()) return
    agir(ajouterMessage(fil, { id: nouvelId(), auteur, date: Date.now(), texte }))
    setTexte('')
  }
  return (
    <div className="notak-fil-attache" role="dialog" aria-label={t('commentaire.titre')} onPointerDown={garder} onDoubleClick={garder} onKeyDown={(e) => {
      e.stopPropagation()
      if (e.key === 'Escape') fermer()
    }}>
      <div className="notak-fil-attache-entete">
        <strong>{t('commentaire.titre')}</strong>
        {ecrire && fil.messages.length > 0 && (
          <button type="button" onClick={() => agir(resoudre(fil, !fil.resolu))}>
            {fil.resolu ? t('commentaire.rouvrir') : t('commentaire.resoudre')}
          </button>
        )}
        <button type="button" aria-label={t('commun.fermer')} onClick={fermer}>
          ×
        </button>
      </div>
      {fil.messages.length === 0 && <p className="notak-commentaire-vide">{t('commentaire.aucun')}</p>}
      {fil.resolu && <p className="notak-commentaire-resolu">✓ {t('commentaire.resolu')}</p>}
      {fil.messages.map((m) => (
        <Ligne key={m.id} message={m} retirer={ecrire && m.auteur.id === auteur.id ? () => agir(retirerMessage(fil, m.id)) : undefined} />
      ))}
      {ecrire && (
        <div className="notak-commentaire-saisie">
          <textarea
            ref={champ}
            rows={2}
            value={texte}
            maxLength={5000}
            placeholder={fil.messages.length > 0 ? t('commentaire.repondrePoints') : t('commentaire.ecrire')}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                envoyer()
              }
            }}
          />
          <button type="button" disabled={!texte.trim()} onClick={envoyer}>
            {t('commentaire.envoyer')}
          </button>
        </div>
      )}
    </div>
  )
}
