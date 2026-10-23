import { useState } from 'react'
import { type Auteur, type Element, annoter } from '../../coeur/tableau'
import { AUTEUR_INCONNU } from '../commentaire/fil'
import { definition } from '../registre'
import type { ContexteToile } from '../types'
import { moiDe } from './Decor'
import { PanneauEtiquettes } from './Etiquettes'
import { ECHEANCE, EMOJIS, basculerReaction, pasPour, peutEtreIcone } from './annotations'
import { ouvrirFil, useFilOuvert } from './etat'

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
    <Menu titre="Étiquettes" libelle="Étiquettes">
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
    <Menu titre="Réagir avec un émoji" libelle="Réagir">
      {(fermer) => (
        <div className="notak-decor-emojis">
          {EMOJIS.map((m) => (
            <button key={m} type="button" role="menuitem" aria-label={`Réagir avec ${m}`} onClick={() => reagir(m, fermer)}>
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
    <Menu titre="Échéance et personne assignée" libelle="Échéance">
      {() => (
        <div className="notak-decor-echeance">
          <label>
            <span>Pour le</span>
            <input type="date" value={commune ?? ''} onChange={(e) => (ECHEANCE.test(e.target.value) ? echeance(e.target.value) : undefined)} aria-label="Échéance" />
          </label>
          {elements.some((e) => e.echeance) && (
            <button type="button" className="notak-etiquettes-lien" onClick={() => echeance(null)}>
              Retirer l’échéance
            </button>
          )}
          <span className="notak-decor-titre">Confié à</span>
          {personnes(contexte).map((p) => (
            <button key={p.id} type="button" role="menuitemradio" aria-checked={assigneCommun === p.id} onClick={() => assigner(assigneCommun === p.id ? null : p)}>
              {assigneCommun === p.id ? '✓ ' : ''}
              {p.nom}
            </button>
          ))}
          {elements.some((e) => e.assigne) && (
            <button type="button" className="notak-etiquettes-lien" onClick={() => assigner(null)}>
              Ne plus confier
            </button>
          )}
        </div>
      )}
    </Menu>
  )
}

export function OutilAffichage({ elements, contexte }: Props) {
  if (contexte.services.lectureSeule) return null
  if (!elements.every((e) => peutEtreIcone(definition(e.contenu.type)))) return null
  const toutIcone = elements.every((e) => e.affichage === 'icone')
  const basculer = () => contexte.magasin.faire(pasPour(elements, (e) => annoter(e, { affichage: toutIcone ? null : 'icone' })))
  return (
    <button type="button" title={toutIcone ? 'Afficher en détail' : 'Afficher en icône'} aria-pressed={toutIcone} onClick={basculer}>
      {toutIcone ? 'Détail' : 'Icône'}
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
    <button type="button" title="Commentaires sur cet élément" aria-pressed={ouvert === e.id} onClick={() => ouvrirFil(ouvert === e.id ? null : e.id)}>
      Commenter
    </button>
  )
}
