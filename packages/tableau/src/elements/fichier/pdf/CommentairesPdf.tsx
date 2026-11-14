import { type KeyboardEvent as ToucheReact, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { type Commentaire, type Element, type Fichier, type Id, nouvelId } from '../../../coeur/tableau'
import { peutCommenter } from '../../../coeur/droitsElements'
import { t } from '../../../langue'
import type { ContexteToile } from '../../types'
import { BulleFil, GlypheEpingle, aDuNouveau, couleurEpingle, useFermerAuClicDehors } from '../../commentaire/Epingle'
import { AUTEUR_INCONNU } from '../../commentaire/fil'
import { prendreFil, useFilDemande } from '../../tableau/montrer'
import { pointSurPage } from './annotations'
import { type FilSurPage, cleFilPdf, filNeuf, filsDeLaPage, filsDesPages, poserFilPdf } from './filsPdf'

const garder = (e: React.SyntheticEvent) => e.stopPropagation()

/** Les services d'un PDF qu'on ne peut pas commenter : la saisie et les gestes du fil disparaissent, la lecture reste. */
function enLecture(contexte: ContexteToile): ContexteToile {
  const { droits: _, ...services } = contexte.services
  return { ...contexte, services: { ...services, lectureSeule: true } }
}

/** Au-delà de cette fraction de la largeur de la page, la bulle s'ouvre à gauche de son épingle : elle resterait dehors. */
const BULLE_A_GAUCHE = 0.55

/**
 * L'épingle d'un fil sur une page, à sa pointe (en pourcentage de la page : elle suit le zoom sans grossir). C'est
 * l'épingle de la toile et de la carte mentale : même dessin, compte des messages, point du nouveau ; un clic ouvre le
 * fil en bulle, la même que partout (mentions, émojis, réactions), ou en feuille au téléphone.
 */
function EpinglePdf({
  id,
  fil,
  x,
  y,
  ouvert,
  ouvrir,
  contexte,
  element,
  poser,
}: {
  id: Id
  fil: Commentaire
  x: number
  y: number
  ouvert: boolean
  ouvrir(id: Id | null): void
  contexte: ContexteToile
  element: Id
  poser(fil: Commentaire): void
}) {
  const racine = useRef<HTMLDivElement>(null)
  const cle = cleFilPdf(element, id)
  const jeSuis = (contexte.services.presence?.moi?.() ?? AUTEUR_INCONNU).id
  useFermerAuClicDehors(ouvert, racine, () => ouvrir(null))
  const n = fil.messages.length
  const titre = ouvert ? t('decor.fermerCommentaires') : t('decor.ouvrirCommentaires')
  return (
    <div
      ref={racine}
      className="notak-epingle notak-pdf-epingle"
      data-fil-pdf={id}
      data-gauche={x > BULLE_A_GAUCHE || undefined}
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
      onPointerDown={garder}
      onClick={garder}
      onDoubleClick={garder}
    >
      <button type="button" className="notak-epingle-bouton" data-resolu={fil.resolu || undefined} aria-expanded={ouvert} aria-label={`${titre} (${n})`} title={titre} onClick={() => ouvrir(ouvert ? null : id)}>
        <GlypheEpingle n={n} hex={couleurEpingle(fil)} nonLu={!ouvert && aDuNouveau(cle, fil, jeSuis)} />
      </button>
      {ouvert && <BulleFil fil={fil} maj={poser} contexte={contexte} element={element} cle={cle} cles={[cle]} signal={cle} fermer={() => ouvrir(null)} />}
    </div>
  )
}

/**
 * Commenter un PDF : « Commenter » (⌥⌘M), puis un clic sur une page y épingle un fil, ouvert pour écrire. Les fils
 * vivent dans l'élément (`Fichier.fils`) et suivent le chemin des autres commentaires (notifications, mentions, « lu »,
 * « est en train d'écrire »). Un commentateur y écrit ; en lecture seule, on les lit. Une notification qui parle d'un de
 * ces fils ouvre la visionneuse sur lui (`montrer` amène sa page dans la vue).
 */
export function useCommentairesPdf({
  element,
  contexte,
  contenu,
  pret,
  montrer,
}: {
  element: Element<Fichier> | undefined
  contexte: ContexteToile | undefined
  contenu: Fichier
  /** Les pages sont posées : on peut en amener une dans la vue. */
  pret: boolean
  montrer(page: number, y: number): void
}) {
  const visible = !!element && !!contexte
  const autorise = visible && peutCommenter(contexte.services, element.id)
  const ctx = useMemo(() => (contexte && !autorise ? enLecture(contexte) : contexte), [contexte, autorise])
  const [actif, setActif] = useState(false)
  const [ouvert, setOuvert] = useState<Id | null>(null)
  /** Le fil qu'on vient d'épingler, pas encore écrit : il n'existe que le temps d'y écrire le premier message. */
  const [nouveau, setNouveau] = useState<FilSurPage | null>(null)
  const fils = useMemo(() => filsDesPages(contenu), [contenu])
  const filsMontres = useMemo(() => (nouveau && !fils.some((f) => f.id === nouveau.id) ? [...fils, nouveau] : fils), [fils, nouveau])

  // Le fil neuf qu'on referme sans y avoir écrit, ou qu'on quitte pour un autre, s'en va.
  const ouvrir = (id: Id | null) => {
    setOuvert(id)
    setNouveau((n) => (n && n.id === id ? n : null))
  }
  const poser = (f: FilSurPage) => (apres: Commentaire) => {
    if (!element || !contexte) return
    const actuel = (contexte.magasin.lire().elements.find((e) => e.id === element.id)?.contenu as Fichier | undefined) ?? element.contenu
    const suite = poserFilPdf(actuel, f.id, apres, { page: f.page, x: f.x, y: f.y })
    if (suite !== actuel) contexte.magasin.faire([{ type: 'contenu', id: element.id, avant: actuel, apres: suite }])
  }

  // Arrivé par une notification qui parle d'un fil de ce PDF : sa page vient dans la vue, et son fil s'ouvre.
  const demande = useFilDemande(element?.id ?? '')
  useEffect(() => {
    if (!element || demande === null || !pret) return
    const f = fils.find((x) => x.id === demande)
    if (!f) return
    prendreFil(element.id)
    montrer(f.page, f.y)
    setOuvert(f.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demande, fils, element?.id, pret])

  /** Les épingles d'une page (1 pour la première). */
  const epingles = (page: number): ReactNode => {
    if (!visible || !ctx || !element) return null
    return filsDeLaPage(filsMontres, page).map((f) => (
      <EpinglePdf key={f.id} id={f.id} fil={f.fil} x={f.x} y={f.y} ouvert={ouvert === f.id} ouvrir={ouvrir} contexte={ctx} element={element.id} poser={poser(f)} />
    ))
  }

  /** En mode Commenter, la couche qui attend le clic sur une page : il y épingle un fil neuf, ouvert pour écrire. */
  const saisie = (page: number): ReactNode =>
    actif && (
      <div
        className="notak-pdf-saisie notak-pdf-saisie-fil"
        aria-hidden="true"
        onClick={(e) => {
          const [x, y] = pointSurPage(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
          const fil = filNeuf(page, x, y)
          const f: FilSurPage = { id: nouvelId(), fil, page: fil.surPage!.page, x: fil.surPage!.x, y: fil.surPage!.y }
          setNouveau(f)
          setOuvert(f.id)
          setActif(false)
        }}
      />
    )

  const basculer = () => {
    if (!autorise) return
    setActif((a) => !a)
  }
  /** Échap sort du mode Commenter (⌥⌘M, qui y entre, est à la visionneuse : elle range d'abord le dessin en cours). */
  const clavier = (e: ToucheReact): boolean => {
    if (actif && e.key === 'Escape') {
      e.preventDefault()
      setActif(false)
      return true
    }
    return false
  }

  return { visible, autorise, actif, basculer, quitter: () => setActif(false), epingles, saisie, clavier, nombre: fils.length, ouvert }
}
