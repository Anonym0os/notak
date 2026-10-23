import { useEffect, useRef, useState } from 'react'
import { type Auteur, type Commentaire, type Message, nouvelId } from '../../coeur/tableau'
import type { ContexteToile, PropsOutils, PropsRendu } from '../types'
import { AUTEUR_INCONNU, ajouterMessage, filVide, dateLisible, initiales, replier, resoudre, retirerMessage } from './fil'
import { langue, t, tn } from '../../langue'
import { Icone } from '../../icones'
import { BoutonOutil } from '../../BoutonOutil'

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
  const { montres, caches } = choisie ? { montres: c.messages, caches: 0 } : replier(c.messages)
  const ecrire = !contexte.services.lectureSeule
  return (
    <div className="notak-commentaire">
      {n > 0 && ecrire && (
        <button type="button" className="notak-commentaire-resoudre" title={t('commentaire.resoudreFil')} onPointerDown={garder} onClick={() => changer(resoudre(c, true))}>
          <Icone nom="coche" taille={16} />
        </button>
      )}
      {n === 0 && <p className="notak-commentaire-vide">{t('commentaire.vide')}</p>}
      {montres.map((m, i) => (
        <div key={m.id}>
          <Ligne message={m} />
          {i === 0 && caches > 0 && <p className="notak-commentaire-caches">{tn('commentaire.autresReponses', caches)}</p>}
        </div>
      ))}
      {choisie && ecrire && (
        <button type="button" className="notak-commentaire-repondre" onPointerDown={garder} onClick={() => contexte.commencerEdition(element.id)}>
          {n > 0 ? t('commentaire.repondrePoints') : t('commentaire.ecrire')}
        </button>
      )}
    </div>
  )
}

export function Ligne({ message, retirer }: { message: Message; retirer?: () => void }) {
  const { auteur } = message
  return (
    <div className="notak-commentaire-message">
      <span className="notak-commentaire-pastille" style={auteur.couleur ? { background: auteur.couleur } : undefined} aria-hidden>
        {initiales(auteur.nom)}
      </span>
      <div className="notak-commentaire-corps">
        <div className="notak-commentaire-entete">
          <strong>{auteur.nom}</strong>
          <time dateTime={new Date(message.date).toISOString()} title={new Date(message.date).toLocaleString(langue() === 'en' ? 'en-US' : 'fr-FR')}>
            {dateLisible(message.date)}
          </time>
          {retirer && (
            <button type="button" className="notak-commentaire-retirer" title={t('commentaire.supprimerMessage')} onPointerDown={garder} onClick={retirer}>
              <Icone nom="fermer" />
            </button>
          )}
        </div>
        <p className="notak-commentaire-texte">{message.texte}</p>
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
  const auto = (n: HTMLTextAreaElement | null) => {
    if (!n) return
    n.style.height = 'auto'
    n.style.height = `${n.scrollHeight}px`
  }
  useEffect(() => auto(champ.current), [texte])

  return (
    <div className="notak-commentaire" data-edition>
      {envoye.messages.map((m) => (
        <Ligne key={m.id} message={m} retirer={m.auteur.id === auteur.id ? () => retirer(m.id) : undefined} />
      ))}
      <div className="notak-commentaire-saisie">
        <span className="notak-commentaire-pastille" style={auteur.couleur ? { background: auteur.couleur } : undefined} aria-hidden>
          {initiales(auteur.nom)}
        </span>
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
            }
          }}
        />
      </div>
      <p className="notak-commentaire-aide">{t('commentaire.aide')}</p>
    </div>
  )
}

export function OutilsCommentaire({ elements, contexte }: PropsOutils<Commentaire>) {
  if (contexte.services.lectureSeule) return null
  const tousResolus = elements.every((e) => e.contenu.resolu)
  const basculer = () =>
    contexte.magasin.faire(
      elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: resoudre(e.contenu, !tousResolus) })),
    )
  return (
    <>
      {elements.length === 1 && (
        <BoutonOutil icone="commenterPassage" titre={t('commentaire.repondreFil')} libelle={t('commentaire.repondre')} onClick={() => contexte.commencerEdition(elements[0]!.id)} />
      )}
      <BoutonOutil icone={tousResolus ? 'rouvrir' : 'resoudre'} titre={tousResolus ? t('commentaire.rouvrirFil') : t('commentaire.resoudreFil')} libelle={tousResolus ? t('commentaire.rouvrir') : t('commentaire.resoudre')} onClick={basculer} />
    </>
  )
}
