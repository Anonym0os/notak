import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { type Element, type Etiquette, annoter } from '../../coeur/tableau'
import { FilAttache } from '../commentaire/Attache'
import { AUTEUR_INCONNU, initiales } from '../commentaire/fil'
import { definition } from '../registre'
import type { ContexteToile } from '../types'
import { FOND_NOTE, contraste } from '../note/couleurs'
import { NOM_ETIQUETTE_MAX, basculerReaction, compterReactions, contourEtiquette, etatEcheance, etiquettesDe, libelleEcheance, quiReagit, renommerEtiquette, texteEtiquette } from './annotations'
import { choisirPuce, ouvrirFil, retenirContexte, useFilOuvert, usePuce } from './etat'
import { t, tn } from '../../langue'
import { Icone } from '../../icones'

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
  return (
    <>
      <Bande element={element} contexte={contexte} mode={mode} />
      <Epingle element={element} contexte={contexte} ouvert={ouvert} />
    </>
  )
}

/** La couleur d'une épingle sans couleur de fil : le bleu des liens de Milanote. */
const BLEU_EPINGLE = '#2f63f7'

/** Blanc ou presque noir pour le compte, selon la luminosité de l'épingle. */
const texteEpingle = (hex: string) => (contraste(hex, '#ffffff') >= contraste(hex, '#323b4a') ? '#ffffff' : '#323b4a')

/**
 * Le fil de commentaires attaché à un élément : une épingle au coin haut droit de la carte (sa pointe à 20 px du bord
 * droit et du haut), le nombre de messages dedans (99 au plus). Un clic ouvre le fil dans une bulle à sa droite.
 */
function Epingle({ element, contexte, ouvert }: { element: Element; contexte: ContexteToile; ouvert: boolean }) {
  const fil = element.commentaire
  const n = fil?.messages.length ?? 0
  if (n === 0 && !ouvert) return null
  const hex = (fil?.couleur && FOND_NOTE[fil.couleur as keyof typeof FOND_NOTE]) || BLEU_EPINGLE
  return (
    <div className="notak-epingle" onPointerDown={garder} onDoubleClick={garder}>
      <button
        type="button"
        className="notak-epingle-bouton"
        data-resolu={fil?.resolu || undefined}
        aria-expanded={ouvert}
        aria-label={`${ouvert ? t('decor.fermerCommentaires') : t('decor.ouvrirCommentaires')} (${n})`}
        title={ouvert ? t('decor.fermerCommentaires') : t('decor.ouvrirCommentaires')}
        onClick={() => ouvrirFil(ouvert ? null : element.id)}
      >
        <svg className="notak-epingle-forme" viewBox="0 0 24 29" width="24" height="29" aria-hidden>
          <path d="M12 28.5 3.2 18.2A11.2 11.2 0 0 1 1 11.5C1 5.4 5.9.5 12 .5s11 4.9 11 11c0 2.5-.8 4.8-2.2 6.7z" fill={hex} stroke="#fff" strokeWidth="1" />
        </svg>
        <span className="notak-epingle-compte" style={{ color: texteEpingle(hex) }}>
          {n > 99 ? 99 : n}
        </span>
      </button>
      {ouvert && <FilAttache element={element} contexte={contexte} fermer={() => ouvrirFil(null)} couleur={hex} />}
    </div>
  )
}

/** Le fond de la carte qui porte la bande, pour savoir si une étiquette s'y confond. */
const fondDeCarte = (e: Element): string => {
  const c = e.contenu
  if (c.type !== 'note') return '#ffffff'
  return c.fond ?? (c.couleur && c.couleur in FOND_NOTE ? FOND_NOTE[c.couleur as keyof typeof FOND_NOTE] : '#ffffff')
}

/** Le prénom, ou le nom, de chaque personne dont on a l'identifiant (celles qui ne sont pas là restent inconnues). */
function nomsDe(contexte: ContexteToile, ids: readonly string[], moi: string): string[] {
  const connus = new Map((contexte.services.presence?.autres() ?? []).map((p) => [p.utilisateur.id, p.utilisateur.nom]))
  return ids.filter((id) => id !== moi).map((id) => connus.get(id) ?? '')
}

/** Une pastille de réaction ; une info-bulle dit qui a réagi, après 300 ms de survol. */
function PastilleReaction({ r, ids, contexte, moi, ecrire, reagir }: { r: { emoji: string; n: number; moi: boolean }; ids: readonly string[]; contexte: ContexteToile; moi: string; ecrire: boolean; reagir(emoji: string): void }) {
  const [vue, setVue] = useState(false)
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined)
  const montrer = () => {
    clearTimeout(minuterie.current)
    minuterie.current = setTimeout(() => setVue(true), 300)
  }
  const cacher = () => {
    clearTimeout(minuterie.current)
    setVue(false)
  }
  useEffect(() => () => clearTimeout(minuterie.current), [])
  const { qui, n } = quiReagit(nomsDe(contexte, ids, moi), r.moi)
  return (
    <button
      type="button"
      className="notak-reaction"
      aria-pressed={r.moi}
      aria-disabled={!ecrire || undefined}
      aria-label={`${r.emoji} ${r.n}`}
      onClick={() => ecrire && reagir(r.emoji)}
      onPointerEnter={montrer}
      onPointerLeave={cacher}
      onBlur={cacher}
    >
      <span className="notak-reaction-emoji" aria-hidden>
        {r.emoji}
      </span>
      <span className="notak-reaction-compte">{r.n}</span>
      {vue && (
        <span className="notak-reaction-bulle" role="tooltip">
          <strong>{qui}</strong> {n === 1 && r.moi ? t('decor.avezReagi') : tn('decor.aReagi', n)}
        </span>
      )}
    </button>
  )
}

/**
 * Une pastille d'étiquette sur la carte. Un clic la choisit (anneau de 2 px) : Suppr ou Retour arrière la retire de
 * l'élément, Entrée, F2 ou un double-clic la renomme sur place (le nom change pour tout le tableau), Échap la lâche.
 */
function PastilleEtiquette({ et, element, contexte, fond, ecrire, choisie }: { et: Etiquette; element: Element; contexte: ContexteToile; fond: string; ecrire: boolean; choisie: boolean }) {
  const { magasin } = contexte
  const [renomme, setRenomme] = useState(false)
  const noeud = useRef<HTMLSpanElement>(null)
  const contour = contourEtiquette(et.couleur, fond)
  useEffect(() => {
    if (choisie && !renomme) noeud.current?.focus({ preventScroll: true })
  }, [choisie, renomme])
  // Un appui ailleurs que sur une pastille la lâche.
  useEffect(() => {
    if (!choisie) return
    const dehors = (e: PointerEvent) => !(e.target as HTMLElement | null)?.closest?.('.notak-etiquette') && choisirPuce(null)
    document.addEventListener('pointerdown', dehors, true)
    return () => document.removeEventListener('pointerdown', dehors, true)
  }, [choisie])
  const retirer = () => {
    const op = annoter(element, { etiquettes: (element.etiquettes ?? []).filter((x) => x !== et.id) })
    if (op) magasin.faire([op])
    choisirPuce(null)
  }
  const valider = (nom: string) => {
    const liste = magasin.lire().etiquettes ?? []
    const suite = renommerEtiquette(liste, et.id, nom)
    if (suite.find((x) => x.id === et.id)!.nom !== et.nom) magasin.faire([{ type: 'etiquettes', de: liste, vers: suite }])
    setRenomme(false)
  }
  const proprietes = {
    className: 'notak-etiquette',
    'data-fond': et.couleur,
    'data-contour': contour,
    'data-choisie': choisie || undefined,
    style: { color: texteEtiquette(et.couleur) },
    title: t('decor.etiquette', { nom: et.nom }),
  }
  if (!ecrire) return <span {...proprietes}>{et.nom}</span>
  if (renomme) {
    return (
      <span {...proprietes} data-renomme>
        <input
          autoFocus
          defaultValue={et.nom}
          maxLength={NOM_ETIQUETTE_MAX}
          aria-label={t('etiquettes.nom')}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => valider(e.currentTarget.value)}
          onPaste={(e) => {
            // Du texte brut sur une seule ligne.
            e.preventDefault()
            document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s+/g, ' '))
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              e.preventDefault()
              valider(e.currentTarget.value)
              choisirPuce(null)
            } else if (e.key === 'Escape') {
              setRenomme(false)
            } else if ((e.key === 'Backspace' || e.key === 'Delete') && e.currentTarget.value === '') {
              e.preventDefault()
              setRenomme(false)
              retirer()
            }
          }}
        />
      </span>
    )
  }
  return (
    <span
      {...proprietes}
      ref={noeud}
      role="button"
      tabIndex={choisie ? 0 : -1}
      aria-pressed={choisie}
      onClick={() => choisirPuce({ element: element.id, etiquette: et.id })}
      onDoubleClick={() => setRenomme(true)}
      onKeyDown={(e) => {
        if (!choisie) return
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          e.stopPropagation()
          retirer()
        } else if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault()
          e.stopPropagation()
          setRenomme(true)
        } else if (e.key === 'Escape') {
          e.stopPropagation()
          choisirPuce(null)
        }
      }}
    >
      {et.nom}
    </span>
  )
}

function Bande({ element, contexte, mode }: { element: Element; contexte: ContexteToile; mode: 'toile' | 'liste' }) {
  const { magasin } = contexte
  const tableau = useSyncExternalStore(magasin.ecouter, magasin.lire)
  const moi = moiDe(contexte).id
  const ecrire = !contexte.services.lectureSeule
  const etiquettes = etiquettesDe(element, tableau.etiquettes)
  const reactions = compterReactions(element.reactions, moi)
  const fond = fondDeCarte(element)
  const puce = usePuce()
  const reagir = (emoji: string) => {
    const op = annoter(element, { reactions: basculerReaction(element.reactions, emoji, moi) })
    if (op) magasin.faire([op])
  }
  const sansLigne = etiquettes.length === 0 && !element.echeance && !element.assigne && reactions.length === 0
  return (
    <div className="notak-decor" data-mode={mode} data-sans-ligne={sansLigne || undefined} onPointerDown={garder} onDoubleClick={garder}>
      {!sansLigne && (
        <div className="notak-decor-ligne">
          {etiquettes.map((et) => (
            <PastilleEtiquette key={et.id} et={et} element={element} contexte={contexte} fond={fond} ecrire={ecrire} choisie={puce?.element === element.id && puce.etiquette === et.id} />
          ))}
          {element.echeance && (
            <span className="notak-echeance" data-etat={etatEcheance(element.echeance)} title={t('decor.echeanceLe', { jour: element.echeance })}>
              <Icone nom="calendrier" taille={13} /> {libelleEcheance(element.echeance)}
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
          {reactions.map((r) => (
            <PastilleReaction key={r.emoji} r={r} ids={element.reactions?.[r.emoji] ?? []} contexte={contexte} moi={moi} ecrire={ecrire} reagir={reagir} />
          ))}
        </div>
      )}
    </div>
  )
}

/** L'élément replié : le glyphe de son type et ce qu'on y lit. Double-clic, on l'ouvre pour l'éditer. */
export function Pastille({ element, contexte }: { element: Element; contexte: ContexteToile }) {
  const def = definition(element.contenu.type)
  const glyphe: ReactNode = def?.outils?.[0]?.icone ?? <Icone nom="document" />
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
