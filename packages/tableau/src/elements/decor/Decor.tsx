import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { type Element, annoter } from '../../coeur/tableau'
import { FilAttache } from '../commentaire/Attache'
import { AUTEUR_INCONNU, initiales } from '../commentaire/fil'
import { definition } from '../registre'
import type { ContexteToile } from '../types'
import { FOND_NOTE } from '../note/couleurs'
import { basculerReaction, compterReactions, contourEtiquette, etatEcheance, etiquettesDe, libelleEcheance, quiReagit, texteEtiquette } from './annotations'
import { ouvrirFil, retenirContexte, useFilOuvert } from './etat'
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
  return <Bande element={element} contexte={contexte} mode={mode} ouvert={ouvert} />
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

function Bande({ element, contexte, mode, ouvert }: { element: Element; contexte: ContexteToile; mode: 'toile' | 'liste'; ouvert: boolean }) {
  const { magasin } = contexte
  const tableau = useSyncExternalStore(magasin.ecouter, magasin.lire)
  const moi = moiDe(contexte).id
  const ecrire = !contexte.services.lectureSeule
  const etiquettes = etiquettesDe(element, tableau.etiquettes)
  const reactions = compterReactions(element.reactions, moi)
  const messages = element.commentaire?.messages.length ?? 0
  const fond = fondDeCarte(element)
  const reagir = (emoji: string) => {
    const op = annoter(element, { reactions: basculerReaction(element.reactions, emoji, moi) })
    if (op) magasin.faire([op])
  }
  const sansLigne = etiquettes.length === 0 && !element.echeance && !element.assigne && messages === 0 && reactions.length === 0
  return (
    <div className="notak-decor" data-mode={mode} data-sans-ligne={sansLigne || undefined} onPointerDown={garder} onDoubleClick={garder}>
      {!sansLigne && (
        <div className="notak-decor-ligne">
          {etiquettes.map((et) => {
            const contour = contourEtiquette(et.couleur, fond)
            return (
              <span
                key={et.id}
                className="notak-etiquette"
                data-fond={et.couleur}
                data-contour={contour}
                style={{ color: texteEtiquette(et.couleur) }}
                title={t('decor.etiquette', { nom: et.nom })}
              >
                {et.nom}
              </span>
            )
          })}
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
          {messages > 0 && (
            <button
              type="button"
              className="notak-decor-fil"
              data-resolu={element.commentaire?.resolu || undefined}
              aria-expanded={ouvert}
              title={ouvert ? t('decor.fermerCommentaires') : t('decor.ouvrirCommentaires')}
              onClick={() => ouvrirFil(ouvert ? null : element.id)}
            >
              <Icone nom="commentaire" taille={13} /> {messages}
            </button>
          )}
          {reactions.map((r) => (
            <PastilleReaction key={r.emoji} r={r} ids={element.reactions?.[r.emoji] ?? []} contexte={contexte} moi={moi} ecrire={ecrire} reagir={reagir} />
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
