import { useEffect, useRef, useState } from 'react'
import { type Auteur, type Commentaire, type Message, nouvelId } from '../../coeur/tableau'
import type { ContexteToile, PropsOutils, PropsRendu } from '../types'
import { AUTEUR_INCONNU, ajouterMessage, filVide, dateLisible, initiales, modifierMessage, morceauxDeTexte, plier, prenom, replier, resoudre, retirerMessage } from './fil'
import { langue, t, tn } from '../../langue'
import { Icone } from '../../icones'
import { BoutonOutil, OutilAvecMenu } from '../../BoutonOutil'
import { useMenu } from '../../menuUnique'
import { COULEURS_NOTE, type CouleurNote } from '../../coeur/tableau'
import { LIBELLES_COULEUR } from '../note/couleurs'

/** La bande de 5 px en haut de la fiche, de la couleur du fil (passée par une variable CSS). */
const bande = (c: Commentaire) => (c.couleur ? { 'data-bande': '', style: { '--bande': `var(--notak-note-${c.couleur})` } as React.CSSProperties } : {})

/** Les boutons et le champ de la carte ne lancent pas de glisser. */
const garder = (e: React.PointerEvent) => e.stopPropagation()

const moi = (contexte: ContexteToile): Auteur => contexte.services.presence?.moi?.() ?? AUTEUR_INCONNU

export function RenduCommentaire({ element, choisie, enEdition, contexte, brouillon, changer }: PropsRendu<Commentaire>) {
  const c = element.contenu
  if (enEdition) return <Fil id={element.id} contenu={c} contexte={contexte} ecrire={brouillon} />
  const n = c.messages.length
  if (c.resolu) {
    return (
      <div className="notak-commentaire" data-resolu>
        <span className="notak-commentaire-resolu"><Icone nom="coche" taille={13} /> {t('commentaire.resolu')} · {tn('commentaire.messages', n)}</span>
        {c.messages[0] && <p className="notak-commentaire-extrait">{c.messages[0].texte}</p>}
      </div>
    )
  }
  if (c.replie && n > 0) {
    const premier = c.messages[0]!.auteur
    return (
      <div className="notak-commentaire" data-replie>
        <span className="notak-commentaire-pastille" style={premier.couleur ? { background: premier.couleur } : undefined} aria-hidden>
          {initiales(premier.nom)}
        </span>
        <span className="notak-commentaire-ligne">{premier.nom} · {tn('commentaire.messages', n)}</span>
      </div>
    )
  }
  const { montres, caches } = choisie ? { montres: c.messages, caches: 0 } : replier(c.messages)
  const ecrire = !contexte.services.lectureSeule
  return (
    <div className="notak-commentaire" {...bande(c)}>
      {n > 0 && ecrire && (
        <button type="button" className="notak-commentaire-resoudre" title={t('commentaire.resoudreFil')} onPointerDown={garder} onClick={() => changer(resoudre(c, true))}>
          <Icone nom="coche" taille={16} />
        </button>
      )}
      {n === 0 && <p className="notak-commentaire-vide">{t('commentaire.vide')}</p>}
      {montres.map((m, i) => (
        <div key={m.id}>
          <Ligne message={m} {...(ecrire && m.auteur.id === moi(contexte).id ? { modifier: (texte: string) => changer(modifierMessage(c, m.id, texte)) } : {})} />
          {i === 0 && caches > 0 && <p className="notak-commentaire-caches">{tn('commentaire.autresReponses', caches)}</p>}
        </div>
      ))}
      {ecrire && (choisie || n > 0) && (
        <button type="button" className="notak-commentaire-repondre" onPointerDown={garder} onClick={() => contexte.commencerEdition(element.id)}>
          {n > 0 ? t('commentaire.repondre') : t('commentaire.ecrire')}
        </button>
      )}
    </div>
  )
}

/** Un battement par minute : les dates relatives (« il y a 5 min ») se rafraîchissent d'elles-mêmes. */
function useMinute(): number {
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  return maintenant
}

/** Le texte d'un message : les adresses web y sont des liens. */
function TexteMessage({ texte }: { texte: string }) {
  return (
    <>
      {morceauxDeTexte(texte).map((m, i) =>
        m.lien ? (
          <a key={i} className="notak-commentaire-lien" href={m.lien} target="_blank" rel="noopener noreferrer" onPointerDown={garder}>
            {m.texte}
          </a>
        ) : (
          m.texte
        ),
      )}
    </>
  )
}

/**
 * Un message : l'avatar, le prénom, la date, et le texte. `modifier` (mes messages seulement) montre « Modifier » au
 * survol, qui ouvre le texte dans un champ, « Enregistrer » le remplace.
 */
export function Ligne({ message, retirer, modifier }: { message: Message; retirer?: () => void; modifier?: (texte: string) => void }) {
  const { auteur } = message
  const maintenant = useMinute()
  const [edition, setEdition] = useState(false)
  const [brouillon, setBrouillon] = useState(message.texte)
  const enregistrer = () => {
    if (brouillon.trim() && brouillon.trim() !== message.texte) modifier?.(brouillon)
    setEdition(false)
  }
  return (
    <div className="notak-commentaire-message" data-edition={edition || undefined}>
      <span className="notak-commentaire-pastille" style={auteur.couleur ? { background: auteur.couleur } : undefined} aria-hidden>
        {initiales(auteur.nom)}
      </span>
      <div className="notak-commentaire-corps">
        <div className="notak-commentaire-entete">
          <strong title={auteur.nom}>{prenom(auteur.nom)}</strong>
          <time dateTime={new Date(message.date).toISOString()} title={new Date(message.date).toLocaleString(langue() === 'en' ? 'en-US' : 'fr-FR')}>
            {dateLisible(message.date, maintenant)}
          </time>
          {modifier && (
            <button
              type="button"
              className="notak-commentaire-modifier"
              onPointerDown={garder}
              onClick={() => {
                if (edition) enregistrer()
                else {
                  setBrouillon(message.texte)
                  setEdition(true)
                }
              }}
            >
              {edition ? t('commentaire.enregistrer') : t('commentaire.modifier')}
            </button>
          )}
          {retirer && (
            <button type="button" className="notak-commentaire-retirer" title={t('commentaire.supprimerMessage')} onPointerDown={garder} onClick={retirer}>
              <Icone nom="fermer" />
            </button>
          )}
        </div>
        {edition ? (
          <textarea
            className="notak-commentaire-champ"
            autoFocus
            rows={1}
            value={brouillon}
            maxLength={5000}
            placeholder={t('commentaire.modifierPoints')}
            onPointerDown={garder}
            onChange={(e) => setBrouillon(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') setEdition(false)
              else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                enregistrer()
              }
            }}
          />
        ) : (
          <p className="notak-commentaire-texte">
            <TexteMessage texte={message.texte} />
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Le fil en édition : on écrit sous les messages. Entrée envoie (Maj+Entrée va à la ligne). Ce qu'on tape fait
 * partie du brouillon : sortir de l'édition sans envoyer garde le message, et les autres le voient venir.
 */
function Fil({ id, contenu, contexte, ecrire }: { id: string; contenu: Commentaire; contexte: ContexteToile; ecrire(c: Commentaire): void }) {
  const [envoye, setEnvoye] = useState(contenu)
  const [texte, setTexte] = useState('')
  const enCours = useRef<{ id: string; date: number } | null>(null)
  const champ = useRef<HTMLTextAreaElement>(null)
  const auteur = moi(contexte)
  useEffect(() => {
    champ.current?.focus()
  }, [])
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

  const brouillonDe = (base: Commentaire, t: string) => {
    if (!t.trim()) return base
    enCours.current ??= { id: nouvelId(), date: Date.now() }
    return ajouterMessage(base, { ...enCours.current, auteur, texte: t })
  }
  const envoyer = () => {
    if (!texte.trim()) return
    const suite = brouillonDe(envoye, texte)
    enCours.current = null
    setEnvoye(suite)
    setTexte('')
    ecrire(suite)
  }
  const retirer = (id: string) => {
    const suite = retirerMessage(envoye, id)
    setEnvoye(suite)
    ecrire(brouillonDe(suite, texte))
  }
  const modifier = (id: string, nouveau: string) => {
    const suite = modifierMessage(envoye, id, nouveau)
    setEnvoye(suite)
    ecrire(brouillonDe(suite, texte))
  }
  const auto = (n: HTMLTextAreaElement | null) => {
    if (!n) return
    n.style.height = 'auto'
    n.style.height = `${n.scrollHeight}px`
  }
  useEffect(() => auto(champ.current), [texte])

  return (
    <div className="notak-commentaire" data-edition {...bande(contenu)}>
      {envoye.messages.map((m) => (
        <Ligne
          key={m.id}
          message={m}
          {...(m.auteur.id === auteur.id ? { retirer: () => retirer(m.id), modifier: (texte: string) => modifier(m.id, texte) } : {})}
        />
      ))}
      <div className="notak-commentaire-saisie">
        <span className="notak-commentaire-pastille" style={auteur.couleur ? { background: auteur.couleur } : undefined} aria-hidden>
          {initiales(auteur.nom)}
        </span>
        <div className="notak-commentaire-zone">
          <textarea
            ref={champ}
            rows={1}
            value={texte}
            maxLength={5000}
            placeholder={envoye.messages.length > 0 ? t('commentaire.repondrePoints') : t('commentaire.ecrire')}
            onPointerDown={garder}
            onChange={(e) => {
              setTexte(e.target.value)
              ecrire(brouillonDe(envoye, e.target.value))
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                envoyer()
              } else if (e.key === 'Backspace' && texte === '' && envoye.messages.length === 0) {
                // Retour arrière dans le champ d'un fil neuf resté vide : le fil est jeté.
                e.preventDefault()
                contexte.jeter([id])
              }
            }}
          />
          <button type="button" className="notak-commentaire-publier" disabled={!texte.trim()} onPointerDown={garder} onClick={envoyer}>
            {t('commentaire.publier')}
          </button>
        </div>
      </div>
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

export function OutilsCommentaire({ elements, contexte }: PropsOutils<Commentaire>) {
  if (contexte.services.lectureSeule) return null
  const tousResolus = elements.every((e) => e.contenu.resolu)
  const basculer = () =>
    contexte.magasin.faire(
      elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: resoudre(e.contenu, !tousResolus) })),
    )
  const tousReplies = elements.every((e) => e.contenu.replie)
  const plierTout = () =>
    contexte.magasin.faire(
      elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: plier(e.contenu, !tousReplies) })),
    )
  return (
    <>
      <OutilCouleurFil elements={elements} contexte={contexte} />
      {!elements.some((e) => e.contenu.resolu) && (
        <BoutonOutil icone={tousReplies ? 'chevronDroite' : 'chevronBas'} secondaire actif={tousReplies} titre={tousReplies ? t('commentaire.deplierFil') : t('commentaire.replierFil')} libelle={tousReplies ? t('commentaire.deplier') : t('commentaire.replier')} onClick={plierTout} />
      )}
      {elements.length === 1 && (
        <BoutonOutil icone="commenterPassage" secondaire titre={t('commentaire.repondreFil')} libelle={t('commentaire.repondre')} onClick={() => contexte.commencerEdition(elements[0]!.id)} />
      )}
      <BoutonOutil icone={tousResolus ? 'rouvrir' : 'resoudre'} secondaire titre={tousResolus ? t('commentaire.rouvrirFil') : t('commentaire.resoudreFil')} libelle={tousResolus ? t('commentaire.rouvrir') : t('commentaire.resoudre')} onClick={basculer} />
    </>
  )
}
