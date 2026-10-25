import { type ReactNode, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { type Auteur, type Element, type Etiquette, annoter } from '../../coeur/tableau'
import { FilAttache } from '../commentaire/Attache'
import { GlypheEpingle, aDuNouveau, couleurEpingle, useFermerAuClicDehors } from '../commentaire/Epingle'
import { AUTEUR_INCONNU, epinglerEn, initiales, pointeEpingle } from '../commentaire/fil'
import { marquerLu } from '../commentaire/suivi'
import { definition } from '../registre'
import type { ContexteToile } from '../types'
import { FOND_NOTE } from '../note/couleurs'
import { NOM_ETIQUETTE_MAX, basculerReaction, compterReactions, contourEtiquette, etatEcheance, etiquettesDe, libelleEcheance, renommerEtiquette, texteEtiquette } from './annotations'
import { PastilleReaction } from './PastilleReaction'
import { changerEtiquettes } from './ecriture'
import { choisirPuce, ouvrirFil, retenirContexte, useFilOuvert, usePuce } from './etat'
import { t } from '../../langue'
import { Icone } from '../../icones'
import { personneAJour } from '../../personne'

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

/** Un appui qui bouge de moins que ça reste un clic. */
const SEUIL_GLISSER = 4
/** L'épingle s'aimante à la grille (10 px). */
const GRILLE_EPINGLE = 10

/**
 * Le fil de commentaires attaché à un élément : une épingle dont la pointe tombe où on l'a posée (à 20 px du bord
 * droit et du haut par défaut), le nombre de messages dedans (99 au plus). Un clic ouvre le fil dans une bulle à sa
 * droite. On la glisse ailleurs sur la carte, ou sur un autre élément, qui reprend alors le fil.
 */
function Epingle({ element, contexte, ouvert }: { element: Element; contexte: ContexteToile; ouvert: boolean }) {
  const fil = element.commentaire
  const n = fil?.messages.length ?? 0
  const racine = useRef<HTMLDivElement>(null)
  const carte = useRef<HTMLElement | null>(null)
  /** Un glisser vient de finir : le clic qui suit n'ouvre rien. */
  const suppression = useRef(false)
  const [taille, setTaille] = useState({ l: 0, h: 0 })
  const [glisse, setGlisse] = useState<{ x: number; y: number } | null>(null)
  const jeSuis = moiDe(contexte).id
  const ecrire = !contexte.services.lectureSeule && !element.verrou
  useLayoutEffect(() => {
    const c = racine.current?.closest<HTMLElement>('.notak-carte')
    carte.current = c ?? null
    if (!c) return
    const mesurer = () => setTaille((a) => (a.l === c.offsetWidth && a.h === c.offsetHeight ? a : { l: c.offsetWidth, h: c.offsetHeight }))
    mesurer()
    if (typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(mesurer)
    obs.observe(c)
    return () => obs.disconnect()
  })
  useEffect(() => {
    if (ouvert && fil) marquerLu(`fil:${element.id}`, fil.messages.reduce((d, m) => Math.max(d, m.date), 0))
  }, [ouvert, fil, element.id])
  useFermerAuClicDehors(ouvert, racine, () => ouvrirFil(null))
  if (n === 0 && !ouvert) return null
  const hex = couleurEpingle(fil)
  const pointe = glisse ?? (fil ? pointeEpingle(fil, taille.l, taille.h) : { x: Math.max(0, taille.l - 20), y: 20 })

  // Le glisser : la pointe suit le pointeur, bornée à la carte, aimantée ; lâchée sur un autre élément, elle y passe.
  const commencer = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const c = carte.current
    if (!ecrire || !fil || !c || e.button !== 0) return
    const depart = { x: e.clientX, y: e.clientY }
    let bouge = false
    const point = (ev: PointerEvent) => {
      const r = c.getBoundingClientRect()
      const echelle = c.offsetWidth > 0 ? r.width / c.offsetWidth : 1
      return { x: (ev.clientX - r.left) / echelle, y: (ev.clientY - r.top) / echelle }
    }
    const borne = (p: { x: number; y: number }) => ({
      x: Math.max(0, Math.min(c.offsetWidth, Math.round(p.x / GRILLE_EPINGLE) * GRILLE_EPINGLE)),
      y: Math.max(0, Math.min(c.offsetHeight, Math.round(p.y / GRILLE_EPINGLE) * GRILLE_EPINGLE)),
    })
    const bouton = e.currentTarget
    bouton.setPointerCapture(e.pointerId)
    const aller = (ev: PointerEvent) => {
      if (!bouge && Math.hypot(ev.clientX - depart.x, ev.clientY - depart.y) < SEUIL_GLISSER) return
      bouge = true
      setGlisse(borne(point(ev)))
    }
    const fin = (ev: PointerEvent) => {
      bouton.removeEventListener('pointermove', aller)
      bouton.removeEventListener('pointerup', fin)
      bouton.removeEventListener('pointercancel', fin)
      bouton.releasePointerCapture?.(ev.pointerId)
      setGlisse(null)
      if (!bouge || ev.type === 'pointercancel') return
      // Un clic n'a pas bougé : `onClick` s'en charge. Ici, on a glissé : plus de clic.
      suppression.current = true
      setTimeout(() => (suppression.current = false), 50)
      const lu = contexte.magasin.lire()
      const autre = document
        .elementsFromPoint(ev.clientX, ev.clientY)
        .map((x) => x.closest<HTMLElement>('.notak-carte[data-id]'))
        .find((x) => x && x.dataset.id !== element.id)
      const cible = autre ? lu.elements.find((x) => x.id === autre.dataset.id) : undefined
      if (cible && autre && cible.contenu.type !== 'commentaire' && !cible.commentaire?.messages.length) {
        // Un autre élément reprend le fil, à l'endroit où on l'a lâché.
        const r = autre.getBoundingClientRect()
        const echelle = autre.offsetWidth > 0 ? r.width / autre.offsetWidth : 1
        const p = { x: (ev.clientX - r.left) / echelle, y: (ev.clientY - r.top) / echelle }
        const sur = { x: Math.max(0, Math.min(autre.offsetWidth, Math.round(p.x / GRILLE_EPINGLE) * GRILLE_EPINGLE)), y: Math.max(0, Math.min(autre.offsetHeight, Math.round(p.y / GRILLE_EPINGLE) * GRILLE_EPINGLE)) }
        const ops = [annoter(element, { commentaire: null }), annoter(cible, { commentaire: epinglerEn(fil, sur.x, sur.y) })].flatMap((o) => o ?? [])
        if (ops.length === 2) contexte.magasin.faire(ops)
        return
      }
      const p = borne(point(ev))
      const op = annoter(element, { commentaire: epinglerEn(fil, p.x, p.y) })
      if (op) contexte.magasin.faire([op])
    }
    bouton.addEventListener('pointermove', aller)
    bouton.addEventListener('pointerup', fin)
    bouton.addEventListener('pointercancel', fin)
  }
  return (
    <div
      ref={racine}
      className="notak-epingle"
      data-glisse={glisse ? '' : undefined}
      style={{ left: pointe.x, top: pointe.y }}
      onPointerDown={garder}
      onDoubleClick={garder}
    >
      <button
        type="button"
        className="notak-epingle-bouton"
        data-resolu={fil?.resolu || undefined}
        aria-expanded={ouvert}
        aria-label={`${ouvert ? t('decor.fermerCommentaires') : t('decor.ouvrirCommentaires')} (${n})`}
        title={ouvert ? t('decor.fermerCommentaires') : t('decor.ouvrirCommentaires')}
        onPointerDown={commencer}
        onClick={() => {
          if (suppression.current) {
            suppression.current = false
            return
          }
          ouvrirFil(ouvert ? null : element.id)
        }}
      >
        <GlypheEpingle n={n} hex={hex} nonLu={!ouvert && aDuNouveau(`fil:${element.id}`, fil, jeSuis)} />
      </button>
      {ouvert && !glisse && <FilAttache element={element} contexte={contexte} fermer={() => ouvrirFil(null)} />}
    </div>
  )
}

/** Le fond de la carte qui porte la bande, pour savoir si une étiquette s'y confond. */
const fondDeCarte = (e: Element): string => {
  const c = e.contenu
  if (c.type !== 'note') return '#ffffff'
  return c.fond ?? (c.couleur && c.couleur in FOND_NOTE ? FOND_NOTE[c.couleur as keyof typeof FOND_NOTE] : '#ffffff')
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
  // « Renommer » de la barre de gauche.
  const demande = usePuce()?.renommer
  useEffect(() => {
    if (choisie && demande) {
      setRenomme(true)
      choisirPuce({ element: element.id, etiquette: et.id })
    }
  }, [choisie, demande, element.id, et.id])
  // Un appui ailleurs que sur une pastille la lâche.
  useEffect(() => {
    if (!choisie) return
    // La barre de gauche (Couleur, Renommer, Retirer) agit sur la pastille choisie : y appuyer ne la lâche pas.
    const dehors = (e: PointerEvent) => !(e.target as HTMLElement | null)?.closest?.('.notak-etiquette, .notak-barre-outils, .notak-barre-selection') && choisirPuce(null)
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
    if (suite.find((x) => x.id === et.id)!.nom !== et.nom) changerEtiquettes(contexte, suite)
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
      onClick={() => {
        // L'élément est choisi avec elle : la barre de gauche propose alors Couleur, Renommer, Retirer.
        contexte.choisir?.([element.id])
        choisirPuce({ element: element.id, etiquette: et.id })
      }}
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
          {element.assigne && <Assigne assigne={element.assigne} contexte={contexte} />}
          {reactions.map((r) => (
            <PastilleReaction key={r.emoji} r={r} ids={element.reactions?.[r.emoji] ?? []} contexte={contexte} moi={moi} ecrire={ecrire} reagir={reagir} />
          ))}
        </div>
      )}
    </div>
  )
}

/** La pastille de la personne chargée de l'élément, avec son profil d'aujourd'hui (photo comprise). */
function Assigne({ assigne, contexte }: { assigne: Auteur; contexte: ContexteToile }) {
  const p = personneAJour(assigne, contexte.services)
  const photo = p.photo ? contexte.services.adressePhoto?.(p.photo) : undefined
  return (
    <span className="notak-assigne" style={p.couleur ? { background: p.couleur } : undefined} title={t('decor.confieANom', { nom: p.nom })} aria-label={t('decor.confieANom', { nom: p.nom })}>
      {photo ? <img src={photo} alt="" draggable={false} /> : initiales(p.nom)}
    </span>
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
