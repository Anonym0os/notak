import { useEffect, useRef, useState } from 'react'
import { type Auteur, type Commentaire, type NoeudTexte, nouvelId } from '../../coeur/tableau'
import type { ContexteToile, PropsOutils, PropsRendu } from '../types'
import { AUTEUR_INCONNU, ajouterMessage, filVide, plier, replier } from './fil'
import { t } from '../../langue'
import { BoutonOutil, OutilAvecMenu } from '../../BoutonOutil'
import { useMenu } from '../../menuUnique'
import { COULEURS_NOTE, type CouleurNote } from '../../coeur/tableau'
import { LIBELLES_COULEUR } from '../note/couleurs'
import { ouvrirFil, useFilOuvert } from '../decor/etat'
import { CorpsFil } from './Corps'
import type { PoigneeCompositeur } from './Compositeur'
import { EpingleLibre } from './Epingle'

export { Avatar, Ligne } from './Corps'

/** La bande de 5 px en haut de la fiche, de la couleur du fil (passée par une variable CSS). */
const bande = (c: Commentaire) => (c.couleur ? { 'data-bande': '', style: { '--bande': `var(--notak-note-${c.couleur})` } as React.CSSProperties } : {})

/** Les boutons et le champ de la carte ne lancent pas de glisser. */
const garder = (e: React.PointerEvent) => e.stopPropagation()

const moi = (contexte: ContexteToile): Auteur => contexte.services.presence?.moi?.() ?? AUTEUR_INCONNU

export function RenduCommentaire({ element, choisie, enEdition, contexte, brouillon, changer }: PropsRendu<Commentaire>) {
  const c = element.contenu
  const n = c.messages.length
  if (c.replie && n > 0) return <EpingleLibre element={element} enEdition={enEdition} contexte={contexte} changer={changer} />
  if (enEdition) return <Fil id={element.id} contenu={c} contexte={contexte} ecrire={brouillon} />
  return <FilLu element={element} choisie={choisie} contexte={contexte} changer={changer} />
}

/** Le fil hors édition : les messages (les longs fils se replient sur le premier et le dernier), le lien « Répondre ». */
function FilLu({ element, choisie, contexte, changer }: { element: PropsRendu<Commentaire>['element']; choisie: boolean; contexte: ContexteToile; changer(c: Commentaire): void }) {
  const c = element.contenu
  const n = c.messages.length
  const { montres, caches } = choisie ? { montres: c.messages, caches: 0 } : replier(c.messages)
  const ecrire = !contexte.services.lectureSeule
  return (
    <div className="notak-commentaire" {...bande(c)}>
      <CorpsFil
        fil={c}
        messages={montres}
        caches={caches}
        contexte={contexte}
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
 * Le fil en édition : on écrit sous les messages. Entrée envoie (Maj+Entrée va à la ligne). Ce qu'on tape fait
 * partie du brouillon : sortir de l'édition sans envoyer garde le message, et les autres le voient venir.
 */
function Fil({ id, contenu, contexte, ecrire }: { id: string; contenu: Commentaire; contexte: ContexteToile; ecrire(c: Commentaire): void }) {
  // Le fil tel qu'il est posté (sans le brouillon) : une référence, car le champ se vide pendant qu'on envoie.
  const base = useRef(contenu)
  const [, redessiner] = useState(0)
  const poser = (c: Commentaire) => {
    base.current = c
    redessiner((n) => n + 1)
  }
  const [vide, setVide] = useState(true)
  const courant = useRef<{ texte: string; riche?: NoeudTexte }>({ texte: '' })
  const enCours = useRef<{ id: string; date: number } | null>(null)
  const champ = useRef<PoigneeCompositeur>(null)
  const auteur = moi(contexte)
  // Sortir de l'édition d'un fil resté vide le jette. On regarde le tableau une fois la sortie inscrite, et on
  // attend un tour : en développement, React démonte puis remonte le composant sur-le-champ, ce n'est pas une sortie.
  const monte = useRef(false)
  useEffect(() => {
    monte.current = true
    return () => {
      monte.current = false
      queueMicrotask(() => {
        if (monte.current) return
        const e = contexte.magasin.lire().elements.find((x) => x.id === id)
        if (e?.contenu.type === 'commentaire' && filVide(e.contenu)) contexte.jeter([id])
      })
    }
  }, [id, contexte])

  const brouillonDe = (fil: Commentaire, texte: string, riche?: NoeudTexte) => {
    if (!texte.trim()) return fil
    enCours.current ??= { id: nouvelId(), date: Date.now() }
    return ajouterMessage(fil, { ...enCours.current, auteur, texte, ...(riche ? { riche } : {}) })
  }
  const envoyer = (texte: string, riche: NoeudTexte | undefined) => {
    const suite = brouillonDe(base.current, texte, riche)
    enCours.current = null
    courant.current = { texte: '' }
    setVide(true)
    poser(suite)
    ecrire(suite)
    champ.current?.vider()
  }
  const maj = (apres: Commentaire) => {
    poser(apres)
    ecrire(brouillonDe(apres, courant.current.texte, courant.current.riche))
  }
  return (
    <div className="notak-commentaire" data-edition {...bande(contenu)}>
      <CorpsFil
        fil={base.current}
        contexte={contexte}
        cle={id}
        cles={[id]}
        vu
        maj={maj}
        saisie={{
          vide,
          poignee: champ,
          surChangement: (texte, riche) => {
            courant.current = { texte, ...(riche ? { riche } : {}) }
            setVide(!texte.trim())
            ecrire(brouillonDe(base.current, texte, riche))
          },
          envoyer,
          publier: () => envoyer(courant.current.texte, courant.current.riche),
          // Retour arrière dans le champ d'un fil neuf resté vide : le fil est jeté.
          retourVide: () => {
            if (base.current.messages.length > 0) return
            contexte.jeter([id])
          },
        }}
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
 * couleur du fil, qui s'ouvre d'un clic ; on le redéploie du même geste).
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
            if (!touteEpingle && ouvert && elements.some((e) => e.id === ouvert)) ouvrirFil(null)
            basculer()
          }}
        />
      )}
    </>
  )
}
