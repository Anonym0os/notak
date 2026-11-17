import { useEffect, useRef, useState } from 'react'
import { type Auteur, type Commentaire, type Element, type NoeudTexte, nouvelId } from '../../coeur/tableau'
import type { ContexteToile, PropsOutils, PropsRendu } from '../types'
import { AUTEUR_INCONNU, ajouterMessage, filVide, plier, replier, resoudre } from './fil'
import { t } from '../../langue'
import { BoutonOutil, OutilAvecMenu } from '../../BoutonOutil'
import { useMenu } from '../../menuUnique'
import { COULEURS_NOTE, type CouleurNote } from '../../coeur/tableau'
import { LIBELLES_COULEUR } from '../note/couleurs'
import { ouvrirFil, useFilOuvert } from '../decor/etat'
import { CorpsFil } from './Corps'
import type { PoigneeCompositeur } from './Compositeur'
import { EpingleLibre, cleEpingleLibre } from './Epingle'
import { brouillonGarde } from './brouillon'
import { peutCommenter } from '../../coeur/droitsElements'

export { Avatar, Ligne } from './Corps'

/** La bande de 5 px en haut de la fiche, de la couleur du fil (passée par une variable CSS). */
const bande = (c: Commentaire) => (c.couleur ? { 'data-bande': '', style: { '--bande': `var(--notak-note-${c.couleur})` } as React.CSSProperties } : {})

/** Les boutons et le champ de la carte ne lancent pas de glisser. */
const garder = (e: React.PointerEvent) => e.stopPropagation()

const moi = (contexte: ContexteToile): Auteur => contexte.services.presence?.moi?.() ?? AUTEUR_INCONNU

/**
 * Un fil de la toile qui n'a plus rien à dire s'en va, d'un seul pas qu'Annuler rend : à la corbeille, comme tout élément
 * qu'on supprime, pour qui écrit le tableau ; retiré tout de suite pour un commentateur, qui n'a pas de corbeille (le
 * serveur le laisse faire : un fil qu'on vide n'avait que ses messages). Le fil part tel qu'il est rangé, son dernier
 * message compris : le remettre le rend entier.
 */
export function effacerFil(contexte: ContexteToile, id: string) {
  const e = contexte.magasin.lire().elements.find((x) => x.id === id)
  if (!e) return
  if (!contexte.services.lectureSeule) contexte.jeter([id])
  else contexte.magasin.faire([{ type: 'supprimer', element: e }])
}

/** Une ligne s'accroche à cet élément, par son départ ou son arrivée. */
const accrochee = (elements: readonly Element[], id: string) =>
  elements.some((x) => x.contenu.type === 'ligne' && [x.contenu.depart, x.contenu.arrivee].some((b) => 'element' in b && b.element === id))

/**
 * Un fil qui n'a jamais rien dit (posé sur la toile, puis quitté sans rien écrire ou son brouillon abandonné) s'en va
 * sans trace : ni corbeille, ni pas à annuler. Il n'existait dans le document que pour avoir sa place, être choisi et
 * dire aux autres qu'on y écrit ; `transferer` le retire hors historique, et l'historique oublie le pas qui l'avait
 * posé. Une ligne qui s'y accroche le fait passer par la corbeille, comme tout élément qu'on jette avec ses lignes.
 */
export function retirerFilVide(contexte: ContexteToile, id: string) {
  const elements = contexte.magasin.lire().elements
  const e = elements.find((x) => x.id === id)
  if (e?.contenu.type !== 'commentaire' || !filVide(e.contenu)) return
  if (accrochee(elements, id)) return effacerFil(contexte, id)
  contexte.magasin.transferer([{ type: 'supprimer', element: e }])
}

/** La clé du brouillon d'un fil posé sur la toile (`brouillon.ts`) : ce qu'on y a tapé sans le publier. */
export const cleBrouillonFil = (id: string) => `toile:${id}`

export function RenduCommentaire({ element, choisie, enEdition, contexte, changer }: PropsRendu<Commentaire>) {
  const c = element.contenu
  const n = c.messages.length
  // Son dernier message supprimé, le fil quitte la toile : pas de fiche vide ni d'épingle sans compte.
  const maj = (apres: Commentaire) => (apres.messages.length === 0 && n > 0 ? effacerFil(contexte, element.id) : changer(apres))
  if (c.replie && n > 0) return <EpingleLibre element={element} enEdition={enEdition} contexte={contexte} changer={maj} />
  if (enEdition) return <Fil id={element.id} contenu={c} contexte={contexte} changer={changer} />
  return <FilLu element={element} choisie={choisie} contexte={contexte} changer={maj} />
}

/** Le fil hors édition : les messages (les longs fils se replient sur le premier et le dernier), le lien « Répondre ». */
function FilLu({ element, choisie, contexte, changer }: { element: PropsRendu<Commentaire>['element']; choisie: boolean; contexte: ContexteToile; changer(c: Commentaire): void }) {
  const c = element.contenu
  const n = c.messages.length
  const { montres, caches } = choisie ? { montres: c.messages, caches: 0 } : replier(c.messages)
  const ecrire = peutCommenter(contexte.services, element.id)
  return (
    <div className="notak-commentaire" data-resolu={c.resolu || undefined} {...bande(c)}>
      <CorpsFil
        fil={c}
        resoudre={(oui) => changer(resoudre(c, oui))}
        messages={montres}
        caches={caches}
        contexte={contexte}
        element={element.id}
        cle={element.id}
        cles={[element.id]}
        vu={choisie}
        maj={changer}
        vide={n === 0 ? t('commentaire.vide') : undefined}
        pied={
          ecrire && (choisie || n > 0) ? (
            <button type="button" className="notak-commentaire-repondre" onPointerDown={garder} onClick={() => contexte.commencerEdition(element.id)}>
              {n > 0 ? t('commentaire.repondre') : t('commentaire.ecrire')}
            </button>
          ) : undefined
        }
      />
    </div>
  )
}

/**
 * Le fil en édition : on écrit sous les messages, dans le champ commun de tous les fils (`Compositeur`). Ce qu'on tape
 * reste chez soi tant qu'on ne l'a pas publié (Entrée, ⌘Entrée ou « Publier ») : les autres voient qu'on écrit, pas ce
 * qu'on écrit. La garde des brouillons (`brouillon.ts`) retient le premier geste de sortie et abandonne au second ; une
 * fiche démontée par le code garde le sien, rendu à la réouverture. Quitté sans rien d'écrit, ou son brouillon
 * abandonné, un fil qui n'a encore rien dit s'en va sans trace (`retirerFilVide`). Chaque message publié prend tout de
 * suite, d'un pas qu'Annuler défait : les autres le lisent, et en sont prévenus une fois.
 */
function Fil({ id, contenu, contexte, changer }: { id: string; contenu: Commentaire; contexte: ContexteToile; changer(c: Commentaire): void }) {
  // Le fil tel qu'il est publié : celui que la toile rend, ou ce qu'on vient d'y écrire tant qu'elle ne l'a pas rendu.
  const base = useRef(contenu)
  const recu = useRef(contenu)
  if (recu.current !== contenu) {
    recu.current = contenu
    base.current = contenu
  }
  const [, redessiner] = useState(0)
  const poser = (c: Commentaire) => {
    base.current = c
    redessiner((n) => n + 1)
    changer(c)
  }
  const [vide, setVide] = useState(true)
  const courant = useRef<{ texte: string; riche?: NoeudTexte }>({ texte: '' })
  const champ = useRef<PoigneeCompositeur>(null)
  const auteur = moi(contexte)
  const garde = cleBrouillonFil(id)
  // Sortir de l'édition d'un fil resté vide le retire. On regarde le tableau une fois la sortie inscrite, et on attend
  // un tour : en développement, React démonte puis remonte le composant sur-le-champ, ce n'est pas une sortie. Un
  // brouillon gardé (la fiche démontée par le code : un autre tableau, une autre édition) laisse le fil l'attendre.
  const monte = useRef(false)
  useEffect(() => {
    monte.current = true
    return () => {
      monte.current = false
      queueMicrotask(() => {
        if (monte.current || brouillonGarde(garde)) return
        retirerFilVide(contexte, id)
      })
    }
  }, [id, contexte, garde])

  const envoyer = (texte: string, riche: NoeudTexte | undefined) => {
    if (!texte.trim()) return
    courant.current = { texte: '' }
    setVide(true)
    poser(ajouterMessage(base.current, { id: nouvelId(), auteur, date: Date.now(), texte, ...(riche ? { riche } : {}) }))
    champ.current?.vider()
  }
  const maj = (apres: Commentaire) => {
    // Le dernier message supprimé, sans rien d'écrit dans le champ : l'édition se ferme et le fil s'en va.
    if (apres.messages.length === 0 && base.current.messages.length > 0 && !courant.current.texte.trim()) {
      contexte.finirEdition()
      return effacerFil(contexte, id)
    }
    poser(apres)
  }
  return (
    <div className="notak-commentaire" data-edition data-resolu={base.current.resolu || undefined} {...bande(contenu)}>
      <CorpsFil
        fil={base.current}
        resoudre={(oui) => maj(resoudre(base.current, oui))}
        contexte={contexte}
        cle={id}
        cles={[id]}
        vu
        maj={maj}
        saisie={{
          vide,
          poignee: champ,
          garde,
          surChangement: (texte, riche) => {
            courant.current = { texte, ...(riche ? { riche } : {}) }
            setVide(!texte.trim())
          },
          envoyer,
          publier: () => envoyer(courant.current.texte, courant.current.riche),
          // Le champ a déjà retenu son brouillon : l'Échap qui arrive jusqu'ici ferme la fiche.
          echapper: () => {
            contexte.finirEdition()
            return true
          },
          // Retour arrière dans le champ d'un fil neuf resté vide : la fiche se ferme, et le fil s'en va avec.
          retourVide: () => {
            if (base.current.messages.length === 0) contexte.finirEdition()
          },
        }}
        element={id}
      />
      <p className="notak-commentaire-aide">{t('commentaire.aide')}</p>
    </div>
  )
}

/** « Couleur » : la bande du haut de la fiche, une des teintes de la note ou aucune. */
function OutilCouleurFil({ elements, contexte }: PropsOutils<Commentaire>) {
  const menu = useMenu()
  const actuelle = elements.every((e) => e.contenu.couleur === elements[0]!.contenu.couleur) ? elements[0]!.contenu.couleur : undefined
  const choisir = (couleur: CouleurNote | undefined) => {
    contexte.magasin.faire(
      elements.map((e) => {
        const { couleur: _, ...reste } = e.contenu
        return { type: 'contenu' as const, id: e.id, avant: e.contenu, apres: couleur ? { ...reste, couleur } : reste }
      }),
    )
    menu[1](false)
  }
  return (
    <OutilAvecMenu menu={menu} icone="palette" titre={t('couleur.titre')} libelle={t('couleur.titre')} pastille={actuelle ? `var(--notak-note-${actuelle})` : undefined}>
      <div className="notak-note-palette notak-decor-menu" role="menu">
        <div className="notak-note-pastilles">
          <button type="button" role="menuitem" className="notak-pastille-aucune" title={t('couleur.aucune')} aria-label={t('couleur.aucune')} aria-pressed={actuelle === undefined} onClick={() => choisir(undefined)} />
          {COULEURS_NOTE.map((c) => (
            <button key={c} type="button" role="menuitem" data-fond={c} title={LIBELLES_COULEUR[c]} aria-label={LIBELLES_COULEUR[c]} aria-pressed={actuelle === c} onClick={() => choisir(c)} />
          ))}
        </div>
      </div>
    </OutilAvecMenu>
  )
}

/**
 * Les outils d'un fil choisi, comme chez Milanote : la couleur, puis l'épingle (le fil se réduit à une épingle de la
 * couleur du fil, qui s'ouvre d'un clic ; on le redéploie du même geste), puis Résoudre, ou Rouvrir le fil résolu.
 */
export function OutilsCommentaire({ elements, contexte }: PropsOutils<Commentaire>) {
  const ouvert = useFilOuvert()
  if (contexte.services.lectureSeule) return null
  const touteEpingle = elements.every((e) => e.contenu.replie)
  const basculer = () =>
    contexte.magasin.faire(
      elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: plier(e.contenu, !touteEpingle) })),
    )
  const epinglable = elements.every((e) => e.contenu.messages.length > 0)
  const toutResolu = elements.every((e) => e.contenu.resolu)
  return (
    <>
      <OutilCouleurFil elements={elements} contexte={contexte} />
      {epinglable && (
        <BoutonOutil
          icone="epingle"
          secondaire
          actif={touteEpingle}
          titre={touteEpingle ? t('commentaire.deployerFil') : t('commentaire.epinglerFil')}
          libelle={touteEpingle ? t('commentaire.deployer') : t('commentaire.epingler')}
          onClick={() => {
            if (ouvert && elements.some((e) => e.id === ouvert || cleEpingleLibre(e.id) === ouvert)) ouvrirFil(null)
            basculer()
          }}
        />
      )}
      {epinglable && (
        <BoutonOutil
          icone="resoudre"
          secondaire
          actif={toutResolu}
          titre={toutResolu ? t('commentaire.rouvrirFil') : t('commentaire.resoudreFil')}
          libelle={toutResolu ? t('commentaire.rouvrir') : t('commentaire.resoudre')}
          onClick={() => contexte.magasin.faire(elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: resoudre(e.contenu, !toutResolu) })))}
        />
      )}
    </>
  )
}
