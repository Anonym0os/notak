import { useEffect, useRef } from 'react'
import { type Auteur, type Element, annoter } from '../../coeur/tableau'
import { AUTEUR_INCONNU } from '../commentaire/fil'
import type { ContexteToile } from '../types'
import { moiDe } from './Decor'
import { PanneauEtiquettes } from './Etiquettes'
import { appliquerAffichage, estReduit, peutSeReduire } from './affichage'
import { ECHEANCE, basculerReaction, pasPour } from './annotations'
import { SelecteurEmojis } from './SelecteurEmojis'
import { ouvrirFil, useFilOuvert } from './etat'
import { t } from '../../langue'
import { BoutonOutil, OutilAvecMenu } from '../../BoutonOutil'
import { type NomIcone, Icone } from '../../icones'
import { useMenu } from '../../menuUnique'

interface Props {
  elements: Element[]
  contexte: ContexteToile
}

/** Un bouton de la barre de sélection et la fenêtre qu'il ouvre dessous (à droite, dans la barre de gauche). */
function Menu({ titre, libelle, icone, secondaire, children }: { titre: string; libelle: string; icone: NomIcone; secondaire?: boolean; children: (fermer: () => void) => React.ReactNode }) {
  const menu = useMenu()
  return (
    <OutilAvecMenu menu={menu} titre={titre} libelle={libelle} icone={icone} secondaire={secondaire}>
      <div className="notak-note-palette notak-decor-menu" role="menu">
        {children(() => menu[1](false))}
      </div>
    </OutilAvecMenu>
  )
}

export function OutilEtiquettes({ elements, contexte }: Props) {
  return (
    <Menu titre={t('etiquettes.titre')} libelle={t('etiquettes.titre')} icone="etiquette">
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
    <Menu titre={t('decor.reagirEmoji')} libelle={t('decor.reagir')} icone="reaction">
      {(fermer) => <SelecteurEmojis choisir={(m) => reagir(m, fermer)} />}
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
    <Menu titre={t('decor.echeanceTitre')} libelle={t('decor.echeance')} icone="calendrier" secondaire>
      {() => (
        <div className="notak-decor-echeance">
          <label className="notak-decor-champ">
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
            <button key={p.id} type="button" className="notak-menu-rang" role="menuitemradio" aria-checked={assigneCommun === p.id} onClick={() => assigner(assigneCommun === p.id ? null : p)}>
              <span className="notak-decor-personne" style={p.couleur ? { background: p.couleur } : undefined}>
                {p.nom.trim().charAt(0).toUpperCase()}
              </span>
              <span className="notak-menu-rang-texte">{p.nom}</span>
              {assigneCommun === p.id && <Icone nom="coche" taille={14} />}
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
    <BoutonOutil
      icone={toutIcone ? 'agrandir' : 'reduire'}
      secondaire
      titre={elements.every((e) => e.contenu.type === 'colonne') ? (toutIcone ? t('decor.deplier') : t('decor.replierIcone')) : toutIcone ? t('menu.enDetail') : t('menu.enIcone')}
      libelle={toutIcone ? t('decor.detail') : t('tableau.icone')}
      actif={toutIcone}
      onClick={basculer}
    />
  )
}

export function OutilCommentaire({ elements, contexte }: Props) {
  const ouvert = useFilOuvert()
  // Le panneau des commentaires est un menu comme les autres : en ouvrir un autre le ferme, et l'inverse.
  // Il s'affiche ailleurs que sous le bouton, donc un appui hors de l'ancre ne le ferme pas.
  const [menuOuvert, setMenuOuvert] = useMenu({ fermerAuClicDehors: false })
  const e = elements[0]
  const parMoi = useRef(false)
  const id = e?.id
  const ici = !!id && ouvert === id
  useEffect(() => {
    // Un autre menu s'est ouvert : le fil que ce bouton avait ouvert se referme.
    if (!menuOuvert && parMoi.current) {
      parMoi.current = false
      if (ici) ouvrirFil(null)
    }
  }, [menuOuvert, ici])
  if (elements.length !== 1 || !e) return null
  // En lecture seule, on ne rouvre un fil que s'il y en a un.
  if (contexte.services.lectureSeule && !e.commentaire?.messages.length) return null
  const basculer = () => {
    if (ici) {
      parMoi.current = false
      setMenuOuvert(false)
      ouvrirFil(null)
    } else {
      setMenuOuvert(true)
      parMoi.current = true
      ouvrirFil(e.id)
    }
  }
  return <BoutonOutil icone="commenterPassage" titre={t('decor.commentairesSur')} libelle={t('menu.commenter')} actif={ici} onClick={basculer} />
}
