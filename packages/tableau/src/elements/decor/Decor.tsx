import { type ReactNode, useEffect, useSyncExternalStore } from 'react'
import { type Element, annoter } from '../../coeur/tableau'
import { FilAttache } from '../commentaire/Attache'
import { AUTEUR_INCONNU, initiales } from '../commentaire/fil'
import { definition } from '../registre'
import type { ContexteToile } from '../types'
import { basculerReaction, compterReactions, etatEcheance, etiquettesDe, libelleEcheance } from './annotations'
import { ouvrirFil, retenirContexte, useFilOuvert } from './etat'
import { t } from '../../langue'

const garder = (e: React.SyntheticEvent) => e.stopPropagation()

export const moiDe = (contexte: ContexteToile) => contexte.services.presence?.moi?.() ?? AUTEUR_INCONNU

/** Vrai si l'élément porte de quoi remplir la bande sous la carte. */
export const aDecor = (e: Element): boolean =>
  !!(e.etiquettes?.length || (e.reactions && Object.keys(e.reactions).length) || e.echeance || e.assigne || e.commentaire?.messages.length)

/**
 * Ce que le cadre commun ajoute sous chaque carte : étiquettes, échéance, personne, fil, réactions. Sur la toile,
 * la bande déborde sous la carte sans changer sa taille ; dans une colonne, elle prend sa place dans le flux.
 */
export function Decor({ element, contexte, mode }: { element: Element; contexte: ContexteToile; mode: 'toile' | 'liste' }) {
  useEffect(() => retenirContexte(contexte), [contexte])
  const ouvert = useFilOuvert() === element.id
  if (!aDecor(element) && !ouvert) return null
  return <Bande element={element} contexte={contexte} mode={mode} ouvert={ouvert} />
}

function Bande({ element, contexte, mode, ouvert }: { element: Element; contexte: ContexteToile; mode: 'toile' | 'liste'; ouvert: boolean }) {
  const { magasin } = contexte
  const tableau = useSyncExternalStore(magasin.ecouter, magasin.lire)
  const moi = moiDe(contexte).id
  const ecrire = !contexte.services.lectureSeule
  const etiquettes = etiquettesDe(element, tableau.etiquettes)
  const reactions = compterReactions(element.reactions, moi)
  const messages = element.commentaire?.messages.length ?? 0
  const reagir = (emoji: string) => {
    const op = annoter(element, { reactions: basculerReaction(element.reactions, emoji, moi) })
    if (op) magasin.faire([op])
  }
  return (
    <div className="notak-decor" data-mode={mode} onPointerDown={garder} onDoubleClick={garder}>
      {etiquettes.length > 0 && (
        <div className="notak-decor-ligne">
          {etiquettes.map((et) => (
            <span key={et.id} className="notak-etiquette" data-fond={et.couleur} title={t('decor.etiquette', { nom: et.nom })}>
              {et.nom}
            </span>
          ))}
        </div>
      )}
      {(element.echeance || element.assigne || messages > 0 || reactions.length > 0) && (
        <div className="notak-decor-ligne">
          {element.echeance && (
            <span className="notak-echeance" data-etat={etatEcheance(element.echeance)} title={t('decor.echeanceLe', { jour: element.echeance })}>
              <span aria-hidden>📅</span> {libelleEcheance(element.echeance)}
            </span>
          )}
          {element.assigne && (
            <span
              className="notak-assigne"
              style={element.assigne.couleur ? { background: element.assigne.couleur } : undefined}
              title={t('decor.confieANom', { nom: element.assigne.nom })}
              aria-label={t('decor.confieANom', { nom: element.assigne.nom })}
            >
              {initiales(element.assigne.nom)}
            </span>
          )}
          {messages > 0 && (
            <button
              type="button"
              className="notak-decor-fil"
              data-resolu={element.commentaire?.resolu || undefined}
              aria-expanded={ouvert}
              title={ouvert ? t('decor.fermerCommentaires') : t('decor.ouvrirCommentaires')}
              onClick={() => ouvrirFil(ouvert ? null : element.id)}
            >
              <span aria-hidden>💬</span> {messages}
            </button>
          )}
          {reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              className="notak-reaction"
              aria-pressed={r.moi}
              disabled={!ecrire}
              title={r.moi ? t('decor.retirerReaction') : t('decor.reagirAussi')}
              onClick={() => reagir(r.emoji)}
            >
              <span aria-hidden>{r.emoji}</span> {r.n}
            </button>
          ))}
        </div>
      )}
      {ouvert && <FilAttache element={element} contexte={contexte} fermer={() => ouvrirFil(null)} />}
    </div>
  )
}

/** L'élément replié : le glyphe de son type et ce qu'on y lit. Double-clic, on l'ouvre pour l'éditer. */
export function Pastille({ element, contexte }: { element: Element; contexte: ContexteToile }) {
  const def = definition(element.contenu.type)
  const glyphe: ReactNode = def?.outils?.[0]?.icone ?? '▫️'
  const texte = def?.resume?.(element.contenu as never, contexte).trim() || def?.nom || t('menu.element')
  return (
    <div className="notak-icone" title={texte}>
      <span className="notak-icone-glyphe" aria-hidden>
        {glyphe}
      </span>
      <span className="notak-icone-texte">{texte}</span>
    </div>
  )
}
