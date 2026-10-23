import { useState } from 'react'
import { type Auteur, type Element, annoter } from '../../coeur/tableau'
import { AUTEUR_INCONNU } from '../commentaire/fil'
import type { ContexteToile } from '../types'
import { moiDe } from './Decor'
import { PanneauEtiquettes } from './Etiquettes'
import { appliquerAffichage, estReduit, peutSeReduire } from './affichage'
import { ECHEANCE, EMOJIS, basculerReaction, pasPour } from './annotations'
import { ouvrirFil, useFilOuvert } from './etat'
import { t } from '../../langue'
import { Icone } from '../../icones'

interface Props {
  elements: Element[]
  contexte: ContexteToile
}

/** Un bouton de la barre de sélection et la fenêtre qu'il ouvre dessous. */
function Menu({ titre, libelle, children }: { titre: string; libelle: string; children: (fermer: () => void) => React.ReactNode }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <div className="notak-note-menu-ancre">
      <button type="button" title={titre} aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        {libelle}
      </button>
      {ouvert && (
        <div className="notak-note-palette notak-decor-menu" role="menu">
          {children(() => setOuvert(false))}
        </div>
      )}
    </div>
  )
}

export function OutilEtiquettes({ elements, contexte }: Props) {
  return (
    <Menu titre={t('etiquettes.titre')} libelle={t('etiquettes.titre')}>
      {() => <PanneauEtiquettes elements={elements} contexte={contexte} />}
    </Menu>
  )
}

export function OutilReactions({ elements, contexte }: Props) {
  if (contexte.services.lectureSeule) return null
  const moi = moiDe(contexte).id
  const reagir = (emoji: string, fermer: () => void) => {
    // Si tous l'ont déjà posé, on le retire de tous ; sinon on le pose sur ceux qui ne l'ont pas.
    const tous = elements.every((e) => e.reactions?.[emoji]?.includes(moi))
    contexte.magasin.faire(
      pasPour(elements, (e) => {
        const a = e.reactions?.[emoji]?.includes(moi) ?? false
        return a === tous ? annoter(e, { reactions: basculerReaction(e.reactions, emoji, moi) }) : null
      }),
    )
    fermer()
  }
  return (
    <Menu titre={t('decor.reagirEmoji')} libelle={t('decor.reagir')}>
      {(fermer) => (
        <div className="notak-decor-emojis">
          {EMOJIS.map((m) => (
            <button key={m} type="button" role="menuitem" aria-label={t('decor.reagirAvec', { emoji: m })} onClick={() => reagir(m, fermer)}>
              {m}
            </button>
          ))}
        </div>
      )}
    </Menu>
  )
}

/** Les gens qu'on peut charger d'un élément : soi, puis ceux qui sont là. */
function personnes(contexte: ContexteToile): Auteur[] {
  const moi = contexte.services.presence?.moi?.()
  const vus = new Map<string, Auteur>()
  vus.set((moi ?? AUTEUR_INCONNU).id, { id: (moi ?? AUTEUR_INCONNU).id, nom: moi?.nom ?? AUTEUR_INCONNU.nom, ...(moi?.couleur ? { couleur: moi.couleur } : {}) })
  for (const p of contexte.services.presence?.autres() ?? []) {
    if (!vus.has(p.utilisateur.id)) vus.set(p.utilisateur.id, { id: p.utilisateur.id, nom: p.utilisateur.nom, couleur: p.utilisateur.couleur })
  }
  return [...vus.values()]
}

export function OutilEcheance({ elements, contexte }: Props) {
  if (contexte.services.lectureSeule) return null
  const commune = new Set(elements.map((e) => e.echeance)).size === 1 ? elements[0]!.echeance : undefined
  const assigneCommun = new Set(elements.map((e) => e.assigne?.id)).size === 1 ? elements[0]!.assigne?.id : undefined
  const echeance = (jour: string | null) => contexte.magasin.faire(pasPour(elements, (e) => annoter(e, { echeance: jour })))
  const assigner = (p: Auteur | null) => contexte.magasin.faire(pasPour(elements, (e) => annoter(e, { assigne: p })))
  return (
    <Menu titre={t('decor.echeanceTitre')} libelle={t('decor.echeance')}>
      {() => (
        <div className="notak-decor-echeance">
          <label>
            <span>{t('decor.pourLe')}</span>
            <input type="date" value={commune ?? ''} onChange={(e) => (ECHEANCE.test(e.target.value) ? echeance(e.target.value) : undefined)} aria-label={t('decor.echeance')} />
          </label>
          {elements.some((e) => e.echeance) && (
            <button type="button" className="notak-etiquettes-lien" onClick={() => echeance(null)}>
              {t('decor.retirerEcheance')}
            </button>
          )}
          <span className="notak-decor-titre">{t('decor.confieA')}</span>
          {personnes(contexte).map((p) => (
            <button key={p.id} type="button" role="menuitemradio" aria-checked={assigneCommun === p.id} onClick={() => assigner(assigneCommun === p.id ? null : p)}>
              {assigneCommun === p.id && <Icone nom="coche" taille={14} />}
              {p.nom}
            </button>
          ))}
          {elements.some((e) => e.assigne) && (
            <button type="button" className="notak-etiquettes-lien" onClick={() => assigner(null)}>
              {t('decor.neplusConfier')}
            </button>
          )}
        </div>
      )}
    </Menu>
  )
}

export function OutilAffichage({ elements, contexte }: Props) {
  if (contexte.services.lectureSeule) return null
  if (!elements.every(peutSeReduire)) return null
  const toutIcone = elements.every(estReduit)
  const basculer = () => appliquerAffichage(elements, !toutIcone, contexte)
  return (
    <button type="button" title={elements.every((e) => e.contenu.type === 'colonne') ? (toutIcone ? t('decor.deplier') : t('decor.replierIcone')) : toutIcone ? t('menu.enDetail') : t('menu.enIcone')} aria-pressed={toutIcone} onClick={basculer}>
      {toutIcone ? t('decor.detail') : t('tableau.icone')}
    </button>
  )
}

export function OutilCommentaire({ elements, contexte }: Props) {
  const ouvert = useFilOuvert()
  const e = elements[0]
  if (elements.length !== 1 || !e) return null
  // En lecture seule, on ne rouvre un fil que s'il y en a un.
  if (contexte.services.lectureSeule && !e.commentaire?.messages.length) return null
  return (
    <button type="button" title={t('decor.commentairesSur')} aria-pressed={ouvert === e.id} onClick={() => ouvrirFil(ouvert === e.id ? null : e.id)}>
      {t('menu.commenter')}
    </button>
  )
}
