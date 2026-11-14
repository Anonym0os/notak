import { renderToReactElement } from '@tiptap/static-renderer/pm/react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Auteur, Commentaire, Id, Message, NoeudTexte } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { AUTEUR_INCONNU, dateLisible, initiales, modifierMessage, morceauxDeTexte, prenom, reagirAuMessage, retirerMessage } from './fil'
import { langue, t, tn } from '../../langue'
import { Icone } from '../../icones'
import { adressesEnLiens } from '../note/conversion'
import { BoutonAjoutReaction } from '../decor/FenetreEmojis'
import { PastilleReaction } from '../decor/PastilleReaction'
import { compterReactions } from '../decor/annotations'
import { Compositeur, EXTENSIONS_MESSAGE, type PoigneeCompositeur } from './Compositeur'
import { useNonLus, useQuiEcrit } from './suivi'
import { estVisiteur, peutCommenter, peutSupprimerMessage } from '../../coeur/droitsElements'
import { personneAJour } from '../../personne'
import { Confirmation, type Entree } from '../../communs'
import { MenuMessage } from './MenuMessage'

/** Les boutons et le champ de la carte ne lancent pas de glisser. */
const garder = (e: React.PointerEvent) => e.stopPropagation()

const moi = (contexte: ContexteToile): Auteur => contexte.services.presence?.moi?.() ?? AUTEUR_INCONNU

/** Un battement par minute : les dates relatives (« il y a 5 min ») se rafraîchissent d'elles-mêmes. */
function useMinute(): number {
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  return maintenant
}

/** Un message en texte simple : les adresses web y sont des liens. */
function TexteSimple({ texte }: { texte: string }) {
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

/** Un message mis en forme, tel que l'éditeur l'a écrit ; les adresses y sont des liens. */
const TexteRiche = memo(function TexteRiche({ riche }: { riche: NoeudTexte }) {
  const rendu = useMemo(() => renderToReactElement({ content: adressesEnLiens(riche), extensions: EXTENSIONS_MESSAGE }), [riche])
  return <div className="notak-commentaire-riche" onPointerDown={(e) => (e.target as HTMLElement).closest('a') && e.stopPropagation()}>{rendu}</div>
})

/**
 * L'avatar d'un auteur : un rond de 24 px et ses initiales (sa photo s'il en a une) ; un anneau de sa couleur quand il
 * écrit. Avec le contexte, l'auteur noté dans le message prend son profil d'aujourd'hui.
 */
export function Avatar({ auteur: note, ecrit, contexte }: { auteur: Auteur; ecrit?: boolean; contexte?: ContexteToile | undefined }) {
  const auteur: Auteur & { photo?: string } = contexte ? personneAJour(note, contexte.services) : note
  const photo = auteur.photo ? contexte?.services.adressePhoto?.(auteur.photo) : undefined
  const [cassee, setCassee] = useState(false)
  useEffect(() => setCassee(false), [photo])
  return (
    <span
      className="notak-commentaire-pastille"
      data-ecrit={ecrit || undefined}
      style={{ ...(auteur.couleur ? { background: auteur.couleur } : {}), ...(ecrit && auteur.couleur ? { '--anneau': auteur.couleur } : {}) } as React.CSSProperties}
      aria-hidden
    >
      {photo && !cassee ? <img src={photo} alt="" draggable={false} onError={() => setCassee(true)} /> : initiales(auteur.nom)}
    </span>
  )
}

interface PropsLigne {
  message: Message
  /** Supprime le message, sans plus rien demander : la ligne demande d'abord confirmation. Absent : pas d'ici. */
  retirer?: () => void
  /** Le dernier message du fil : le supprimer emporte le fil, la confirmation le dit. */
  dernier?: boolean
  modifier?: (texte: string, riche?: NoeudTexte) => void
  /** Pour lire les réactions et modifier le message sur place ; sans lui, le message se lit seulement. */
  contexte?: ContexteToile
  /** Pose ou retire ma réaction à ce message. */
  reagir?: (emoji: string) => void
  /** Écrit depuis peu et pas encore lu. */
  nonLu?: boolean
  /** Son auteur est en train d'écrire. */
  ecrit?: boolean
  /**
   * La fiche d'un passage commenté, en marge du texte (NOTION.md § 9, mesuré dans Notion) : les gestes du message sont
   * des icônes dans une petite barre au survol, le champ de correction prend la place du texte, Annuler et Enregistrer
   * dans son coin bas droit.
   */
  enMarge?: boolean
  /** Des gestes en plus dans la barre au survol (ceux du fil, sur son premier message). */
  actionsFil?: React.ReactNode
  /** Des lignes en plus dans le menu « ⋯ » du message, avant Supprimer (Détacher, sur le premier message d'un passage). */
  entreesFil?: Entree[]
  /** Le passage commenté, cité sous l'en-tête (le fil ouvert sous son passage, NOTION.md § 9). */
  citation?: string
}

/**
 * Un message : l'avatar, le prénom, la date, le texte et les réactions. `modifier` (mes messages seulement) montre
 * « Modifier » au survol, qui ouvre le message dans le champ, « Enregistrer » le remplace ; `reagir` montre le « + »
 * au survol d'un message d'un autre, puis les pastilles. Comme chez Notion, chaque message a son menu « ⋯ » (au survol,
 * toujours là au doigt) : Modifier, et Supprimer quand `retirer` est donné, après une confirmation. Vider le message en
 * le modifiant, puis Retour arrière ou Enregistrer, demande aussi de le supprimer.
 */
export function Ligne({ message, retirer, dernier, modifier, contexte, reagir, nonLu, ecrit, enMarge, actionsFil, entreesFil, citation }: PropsLigne) {
  const { auteur } = message
  const maintenant = useMinute()
  const [edition, setEdition] = useState(false)
  const racine = useRef<HTMLDivElement>(null)
  // La suppression attend qu'on la confirme : le message part pour tout le monde.
  const [confirmer, setConfirmer] = useState(false)
  const brouillon = useRef<{ texte: string; riche?: NoeudTexte }>({ texte: message.texte, ...(message.riche ? { riche: message.riche } : {}) })
  const enregistrer = () => {
    const { texte, riche } = brouillon.current
    if (texte.trim() && (texte.trim() !== message.texte || riche)) modifier?.(texte, riche)
    // Un message vidé qu'on enregistre, c'est un message qu'on veut retirer.
    else if (!texte.trim() && retirer) setConfirmer(true)
    setEdition(false)
  }
  const date = new Date(message.date)
  const quand = date.toLocaleString(langue() === 'en' ? 'en-US' : 'fr-FR')
  const jeSuis = contexte ? moi(contexte).id : ''
  const ecrire = !!contexte && peutCommenter(contexte.services)
  const reactions = compterReactions(message.reactions, jeSuis)
  const miennes = new Set(reactions.filter((r) => r.moi).map((r) => r.emoji))
  const ouvrirEdition = () => {
    brouillon.current = { texte: message.texte, ...(message.riche ? { riche: message.riche } : {}) }
    setEdition(true)
  }
  const entrees: Entree[] = [
    ...(contexte && modifier ? [{ libelle: t('commentaire.modifier'), icone: 'modifier' as const, faire: ouvrirEdition }] : []),
    ...(entreesFil ?? []),
    ...(retirer ? [null, { libelle: t('commentaire.supprimer'), icone: 'corbeille' as const, danger: true, faire: () => setConfirmer(true) }] : []),
  ]
  // La barre de Notion, en marge : réagir, les gestes du fil, puis « ⋯ ».
  const barre = enMarge && !edition && (
    <div className="notak-commentaire-survol" onPointerDown={garder}>
      {ecrire && reagir && <BoutonAjoutReaction className="notak-commentaire-geste" choisir={reagir} posees={miennes} />}
      {actionsFil}
      <MenuMessage entrees={entrees} className="notak-commentaire-geste" />
    </div>
  )
  return (
    <div ref={racine} className="notak-commentaire-message" data-edition={edition || undefined}>
      <Avatar auteur={auteur} ecrit={ecrit} contexte={contexte} />
      <div className="notak-commentaire-corps">
        {barre}
        <div className="notak-commentaire-entete">
          <strong title={auteur.nom}>{prenom(auteur.nom)}</strong>
          {/* Le nom d'un visiteur est celui qu'il s'est donné : on le dit, pour que personne ne passe pour un membre. */}
          {estVisiteur(auteur.id) && (
            <span className="notak-commentaire-visiteur" title={t('commentaire.visiteurAide')}>
              {t('commentaire.visiteur')}
            </span>
          )}
          <time dateTime={date.toISOString()} title={quand}>
            {dateLisible(message.date, maintenant)}
          </time>
          {nonLu && <span className="notak-commentaire-nonlu" role="img" aria-label={t('commentaire.nonLu')} title={t('commentaire.nonLuPar', { nom: prenom(auteur.nom), quand: dateLisible(message.date, maintenant) })} />}
          {!enMarge && contexte && modifier && (
            <button
              type="button"
              className="notak-commentaire-modifier"
              onPointerDown={garder}
              onClick={() => {
                if (edition) enregistrer()
                else {
                  brouillon.current = { texte: message.texte, ...(message.riche ? { riche: message.riche } : {}) }
                  setEdition(true)
                }
              }}
            >
              {edition ? t('commentaire.enregistrer') : t('commentaire.modifier')}
            </button>
          )}
          {!enMarge && ecrire && reagir && reactions.length === 0 && auteur.id !== jeSuis && <BoutonAjoutReaction className="notak-commentaire-reagir" choisir={reagir} />}
          {!enMarge && !edition && <MenuMessage entrees={entrees} className="notak-commentaire-plus" />}
        </div>
        {citation && <blockquote className="notak-commentaire-citation">{citation}</blockquote>}
        {edition && contexte && modifier ? (
          <Compositeur
            contexte={contexte}
            initial={{ texte: message.texte, ...(message.riche ? { riche: message.riche } : {}) }}
            placeholder={t('commentaire.modifierPoints')}
            autoFocus
            className="notak-commentaire-champ"
            surChangement={(texte, riche) => (brouillon.current = { texte, ...(riche ? { riche } : {}) })}
            envoyer={enregistrer}
            echapper={() => {
              setEdition(false)
              return true
            }}
            {...(retirer
              ? {
                  retourVide: () => {
                    setEdition(false)
                    setConfirmer(true)
                  },
                }
              : {})}
          >
            {enMarge && (
              <span className="notak-compositeur-gestes">
                <button type="button" className="notak-compositeur-rond" data-genre="annuler" aria-label={t('commentaire.annulerModif')} title={t('commentaire.annulerModif')} onMouseDown={(e) => e.preventDefault()} onClick={() => setEdition(false)}>
                  <Icone nom="fermer" taille={14} trait={2.5} />
                </button>
                <button type="button" className="notak-compositeur-rond" data-genre="valider" aria-label={t('commentaire.enregistrer')} title={t('commentaire.enregistrer')} onMouseDown={(e) => e.preventDefault()} onClick={enregistrer}>
                  <Icone nom="coche" taille={14} trait={2.5} />
                </button>
              </span>
            )}
          </Compositeur>
        ) : (
          <div className="notak-commentaire-texte">{message.riche ? <TexteRiche riche={message.riche} /> : <p><TexteSimple texte={message.texte} /></p>}</div>
        )}
        {contexte && reactions.length > 0 && (
          <div className="notak-commentaire-reactions">
            {reactions.map((r) => (
              <PastilleReaction key={r.emoji} r={r} ids={message.reactions?.[r.emoji] ?? []} contexte={contexte} moi={jeSuis} ecrire={ecrire} reagir={(e) => reagir?.(e)} />
            ))}
            {ecrire && reagir && <BoutonAjoutReaction choisir={reagir} posees={miennes} />}
          </div>
        )}
      </div>
      {confirmer && retirer && (
        <Confirmation
          titre={t('commentaire.supprimerTitre')}
          texte={dernier ? t('commentaire.supprimerDernier') : t('commentaire.supprimerTexte')}
          oui={t('commentaire.supprimer')}
          // Posée dans l'espace, pour son thème : dans le fil, ses boutons prendraient le style des boutons du fil.
          hote={hoteDialogue(racine.current)}
          repondre={(oui) => {
            // Le message (et le menu qui a ouvert la confirmation) partis, le clavier revient à la toile : ⌘Z y rend le message.
            const toile = racine.current?.closest<HTMLElement>('.notak-toile')
            setConfirmer(false)
            if (oui) retirer()
            requestAnimationFrame(() => {
              const actif = document.activeElement
              if (!actif || actif === document.body) toile?.focus({ preventScroll: true })
            })
          }}
        />
      )}
    </div>
  )
}

/** Où poser la confirmation : l'espace qui porte le fil (son thème), sinon la page. */
const hoteDialogue = (n: HTMLElement | null) => n?.closest<HTMLElement>('.notak-espace') ?? document.body

/** Ce qu'il faut pour écrire dans un fil : le champ et ses gestes. */
export interface SaisieFil {
  /** Le curseur y est dès l'ouverture. */
  focus?: boolean
  surChangement?(texte: string, riche: NoeudTexte | undefined): void
  envoyer(texte: string, riche: NoeudTexte | undefined): void
  /** Échap. */
  echapper?(): boolean | void
  /** Retour arrière dans le champ resté vide. */
  retourVide?(): void
  surFrappe?(): void
  poignee?: React.Ref<PoigneeCompositeur>
  /** Le texte tapé est-il vide ? Grise « Publier ». */
  vide: boolean
  /** « Publier » : envoie ce qui est tapé. */
  publier(): void
}

/**
 * Le corps d'un fil, pour la fiche sur la toile comme pour la bulle d'une épingle : les messages (qui défilent
 * dedans quand le fil est borné en hauteur, calés en bas), qui écrit en ce moment, et le champ.
 */
export function CorpsFil({
  fil,
  messages = fil.messages,
  caches = 0,
  contexte,
  element,
  cle,
  cles,
  vu,
  maj,
  saisie,
  vide,
  pied,
}: {
  fil: Commentaire
  /** Les messages montrés, quand le fil est abrégé. */
  messages?: Message[]
  caches?: number
  contexte: ContexteToile
  /** L'élément qui porte le fil, pour ses droits propres ; absent : ceux du tableau. */
  element?: Id
  /** Où le « lu » de ce fil est retenu. */
  cle: string
  /** Les clés de présence où l'on dit écrire dans ce fil. */
  cles: string[]
  /** Le fil est sous mes yeux : ce qu'il a de nouveau est repéré, puis lu. */
  vu: boolean
  /** Un changement qui prend tout de suite (une réaction, un message corrigé ou retiré) ; un fil vidé, l'hôte le retire. */
  maj(apres: Commentaire): void
  saisie?: SaisieFil
  vide?: string
  pied?: React.ReactNode
}) {
  const auteur = moi(contexte)
  const ecrire = peutCommenter(contexte.services)
  const defile = useRef<HTMLDivElement>(null)
  const [deborde, setDeborde] = useState(false)
  const nonLus = useNonLus(cle, fil.messages, auteur.id, vu)
  const ecrivent = useQuiEcrit(contexte, cles)
  // Le fil borné défile ; un message qui arrive le cale en bas.
  useLayoutEffect(() => {
    const d = defile.current
    if (d) d.scrollTop = d.scrollHeight
  }, [fil.messages.length])
  useLayoutEffect(() => {
    const d = defile.current
    if (!d) return
    const mesurer = () => setDeborde(d.scrollHeight > d.clientHeight + 1)
    mesurer()
    if (typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(mesurer)
    obs.observe(d)
    for (const f of d.children) obs.observe(f)
    return () => obs.disconnect()
  })
  const lesNonLus = new Set(nonLus.map((m) => m.id))
  const lesEcrivent = new Set(ecrivent.map((u) => u.id))
  return (
    <div ref={defile} className="notak-commentaire-defile" data-defile={deborde || undefined}>
      {vide && fil.messages.length === 0 && <p className="notak-commentaire-vide">{vide}</p>}
      {messages.map((m, i) => {
        const mien = ecrire && m.auteur.id === auteur.id
        // Le sien, partout où l'on commente ; celui d'un autre, seul le propriétaire du tableau (`reglesDroits.ts`).
        const supprimable = peutSupprimerMessage(contexte.services, element, m.auteur.id, auteur.id)
        return (
          <div key={m.id} className="notak-commentaire-rang">
            <Ligne
              message={m}
              contexte={contexte}
              nonLu={lesNonLus.has(m.id)}
              ecrit={lesEcrivent.has(m.auteur.id)}
              reagir={ecrire ? (emoji) => maj(reagirAuMessage(fil, m.id, emoji, auteur.id)) : undefined}
              {...(mien ? { modifier: (texte: string, riche?: NoeudTexte) => maj(modifierMessage(fil, m.id, texte, riche)) } : {})}
              {...(supprimable ? { retirer: () => maj(retirerMessage(fil, m.id)), dernier: fil.messages.length === 1 } : {})}
            />
            {i === 0 && caches > 0 && <p className="notak-commentaire-caches">{tn('commentaire.autresReponses', caches)}</p>}
          </div>
        )
      })}
      {ecrivent.map((u) => (
        <p key={u.id} className="notak-commentaire-frappe" role="status">
          <Avatar auteur={{ id: u.id, nom: u.nom, couleur: u.couleur }} ecrit contexte={contexte} />
          <span>{t('commentaire.ecrit', { nom: prenom(u.nom) })}</span>
          <span className="notak-commentaire-points" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </p>
      ))}
      {saisie && ecrire && (
        <div className="notak-commentaire-saisie">
          <Avatar auteur={auteur} contexte={contexte} />
          <Compositeur
            contexte={contexte}
            placeholder={fil.messages.length > 0 ? t('commentaire.repondrePoints') : t('commentaire.ecrire')}
            autoFocus={saisie.focus ?? true}
            {...(saisie.poignee ? { poignee: saisie.poignee } : {})}
            {...(saisie.surChangement ? { surChangement: saisie.surChangement } : {})}
            {...(saisie.surFrappe ? { surFrappe: saisie.surFrappe } : {})}
            {...(saisie.echapper ? { echapper: saisie.echapper } : {})}
            {...(saisie.retourVide ? { retourVide: saisie.retourVide } : {})}
            envoyer={saisie.envoyer}
          >
            <button
              type="button"
              className="notak-commentaire-publier"
              disabled={saisie.vide}
              onPointerDown={garder}
              onMouseDown={(e) => e.preventDefault()}
              onClick={saisie.publier}
            >
              {t('commentaire.publier')}
            </button>
          </Compositeur>
        </div>
      )}
      {pied}
    </div>
  )
}
