import { type KeyboardEvent as ToucheReact, type PointerEvent as PointeurReact, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { type Commentaire, type Element, type Fichier, type Id, nouvelId } from '../../../coeur/tableau'
import { peutCommenter, permis } from '../../../coeur/droitsElements'
import { Icone } from '../../../icones'
import { t } from '../../../langue'
import type { ContexteToile } from '../../types'
import { BulleFil, GlypheEpingle, aDuNouveau, couleurEpingle, useFermerAuClicDehors } from '../../commentaire/Epingle'
import { AUTEUR_INCONNU, dateLisible, resoudre } from '../../commentaire/fil'
import { prendreFil, useFilDemande } from '../../tableau/montrer'
import { pointSurPage } from './annotations'
import { type FilSurPage, auteurDuFil, cleFilPdf, deplacerFilPdf, filNeuf, filVoisin, filsDeLaPage, filsDesPages, poserFilPdf, resumeDuFil } from './filsPdf'

const garder = (e: React.SyntheticEvent) => e.stopPropagation()

/** Les services d'un PDF qu'on ne peut pas commenter : la saisie et les gestes du fil disparaissent, la lecture reste. */
function enLecture(contexte: ContexteToile): ContexteToile {
  const { droits: _, ...services } = contexte.services
  return { ...contexte, services: { ...services, lectureSeule: true } }
}

/** Au-delà de cette fraction de la largeur de la page, la bulle s'ouvre à gauche de son épingle : elle resterait dehors. */
const BULLE_A_GAUCHE = 0.55
/** Un appui sur l'épingle qui bouge de moins que ça (en pixels) reste un clic : il ouvre le fil. */
const SEUIL_GLISSER = 4

/** La page sous ce point de l'écran, et le point en fractions de cette page ; `null` hors des pages. */
function pageSous(x: number, y: number): { page: number; x: number; y: number } | null {
  const page = (document.elementsFromPoint?.(x, y) ?? []).find((n): n is HTMLElement => n instanceof HTMLElement && n.classList.contains('notak-pdf-page'))
  const numero = Number(page?.dataset.page)
  if (!page || !Number.isInteger(numero) || numero < 1) return null
  const [fx, fy] = pointSurPage(x, y, page.getBoundingClientRect())
  return { page: numero, x: fx, y: fy }
}

/**
 * L'épingle d'un fil sur une page, à sa pointe (en pourcentage de la page : elle suit le zoom sans grossir). C'est
 * l'épingle de la toile et de la carte mentale : même dessin, compte des messages, point du nouveau ; un clic ouvre le
 * fil en bulle, la même que partout (mentions, émojis, réactions), ou en feuille au téléphone. Celui qui a ouvert le fil,
 * ou qui peut modifier le PDF, la glisse ailleurs, sur cette page ou une autre.
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
  deplacer,
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
  /** Glisser l'épingle la pose là ; absent : elle ne se déplace pas. */
  deplacer?: ((page: number, x: number, y: number) => void) | undefined
}) {
  const racine = useRef<HTMLDivElement>(null)
  const cle = cleFilPdf(element, id)
  const jeSuis = (contexte.services.presence?.moi?.() ?? AUTEUR_INCONNU).id
  useFermerAuClicDehors(ouvert, racine, () => ouvrir(null))
  const glisse = useRef<{ pointeur: number; x: number; y: number; bouge: boolean } | null>(null)
  const sansClic = useRef(false)
  const [decalage, setDecalage] = useState<{ x: number; y: number } | null>(null)
  const n = fil.messages.length
  const titre = ouvert ? t('decor.fermerCommentaires') : t('decor.ouvrirCommentaires')

  const appuyer = (e: PointeurReact<HTMLButtonElement>) => {
    if (!deplacer || e.button !== 0) return
    glisse.current = { pointeur: e.pointerId, x: e.clientX, y: e.clientY, bouge: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const bouger = (e: PointeurReact<HTMLButtonElement>) => {
    const g = glisse.current
    if (!g || g.pointeur !== e.pointerId) return
    const d = { x: e.clientX - g.x, y: e.clientY - g.y }
    if (!g.bouge && Math.hypot(d.x, d.y) < SEUIL_GLISSER) return
    g.bouge = true
    setDecalage(d)
  }
  const lacher = (e: PointeurReact<HTMLButtonElement>) => {
    const g = glisse.current
    if (!g || g.pointeur !== e.pointerId) return
    glisse.current = null
    if (!g.bouge) return
    setDecalage(null)
    sansClic.current = true
    // Lâchée hors des pages, l'épingle revient où elle était.
    const cible = e.type === 'pointerup' ? pageSous(e.clientX, e.clientY) : null
    if (cible) deplacer?.(cible.page, cible.x, cible.y)
  }

  return (
    <div
      ref={racine}
      className="notak-epingle notak-pdf-epingle"
      data-fil-pdf={id}
      data-gauche={x > BULLE_A_GAUCHE || undefined}
      data-deplacable={deplacer ? '' : undefined}
      data-glisse={decalage ? '' : undefined}
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, ...(decalage ? { transform: `translate(${decalage.x}px, ${decalage.y}px)` } : {}) }}
      onPointerDown={garder}
      onClick={garder}
      onDoubleClick={garder}
    >
      <button
        type="button"
        className="notak-epingle-bouton"
        data-resolu={fil.resolu || undefined}
        aria-expanded={ouvert}
        aria-label={`${titre} (${n})`}
        title={deplacer ? `${titre} · ${t('pdf.epingle.deplacer')}` : titre}
        onPointerDown={appuyer}
        onPointerMove={bouger}
        onPointerUp={lacher}
        onPointerCancel={lacher}
        onClick={() => {
          if (sansClic.current) return void (sansClic.current = false)
          ouvrir(ouvert ? null : id)
        }}
      >
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
 * ces fils ouvre la visionneuse sur lui (`montrer` amène sa page dans la vue). La liste des fils, à droite, les dit
 * tous dans l'ordre de lecture (page, auteur, début du texte, résolu ou non) ; « précédent » et « suivant » vont de l'un
 * à l'autre, en amenant chaque épingle dans la vue.
 */
export function useCommentairesPdf({
  element,
  contexte,
  contenu,
  pret,
  page,
  montrer,
}: {
  element: Element<Fichier> | undefined
  contexte: ContexteToile | undefined
  contenu: Fichier
  /** Les pages sont posées : on peut en amener une dans la vue. */
  pret: boolean
  /** La page qu'on lit (1 pour la première) : « suivant » part de là quand aucun fil n'est ouvert. */
  page: number
  montrer(page: number, y: number): void
}) {
  const visible = !!element && !!contexte
  const autorise = visible && peutCommenter(contexte.services, element.id)
  // Qui peut modifier le PDF déplace toutes les épingles ; un commentateur, celles des fils qu'il a ouverts.
  const ecrit = visible && !contexte.services.lectureSeule && !contexte.services.presentation && (!contexte.services.droits || permis(contexte.services.droits, element.id, 'ecriture'))
  const moi = (contexte?.services.presence?.moi?.() ?? AUTEUR_INCONNU).id
  const ctx = useMemo(() => (contexte && !autorise ? enLecture(contexte) : contexte), [contexte, autorise])
  const [actif, setActif] = useState(false)
  const [liste, setListe] = useState(false)
  const [ouvert, setOuvert] = useState<Id | null>(null)
  /** Le fil qu'on vient d'épingler, pas encore écrit : il n'existe que le temps d'y écrire le premier message. */
  const [nouveau, setNouveau] = useState<FilSurPage | null>(null)
  const fils = useMemo(() => filsDesPages(contenu), [contenu])
  const filsMontres = useMemo(() => (nouveau && !fils.some((f) => f.id === nouveau.id) ? [...fils, nouveau] : fils), [fils, nouveau])

  /**
   * Le dernier fil ouvert : « suivant » part de lui même quand sa bulle s'est refermée (un appui sur la liste la ferme
   * avant que le bouton ne réponde), et la liste le marque.
   */
  const [courant, setCourant] = useState<Id | null>(null)
  // Le fil neuf qu'on referme sans y avoir écrit, ou qu'on quitte pour un autre, s'en va.
  const ouvrir = (id: Id | null) => {
    setOuvert(id)
    if (id !== null) setCourant(id)
    setNouveau((n) => (n && n.id === id ? n : null))
  }
  const actuel = (): Fichier => (contexte?.magasin.lire().elements.find((e) => e.id === element?.id)?.contenu as Fichier | undefined) ?? contenu
  const ecrire = (f: (c: Fichier) => Fichier) => {
    if (!element || !contexte) return
    const avant = actuel()
    const apres = f(avant)
    if (apres !== avant) contexte.magasin.faire([{ type: 'contenu', id: element.id, avant, apres }])
  }
  const poser = (f: FilSurPage) => (apres: Commentaire) => ecrire((c) => poserFilPdf(c, f.id, apres, { page: f.page, x: f.x, y: f.y }))
  const peutDeplacer = (f: FilSurPage) => f.fil.messages.length > 0 && (ecrit || (autorise && auteurDuFil(f.fil) === moi))
  /** Amène l'épingle de ce fil dans la vue, et l'ouvre. */
  const aller = (f: FilSurPage | undefined) => {
    if (!f) return
    montrer(f.page, f.y)
    ouvrir(f.id)
  }
  const voisin = (pas: 1 | -1) => aller(filVoisin(fils, fils.some((f) => f.id === courant) ? courant : null, pas, page))

  // Arrivé par une notification qui parle d'un fil de ce PDF : sa page vient dans la vue, et son fil s'ouvre.
  const demande = useFilDemande(element?.id ?? '')
  useEffect(() => {
    if (!element || demande === null || !pret) return
    const f = fils.find((x) => x.id === demande)
    if (!f) return
    prendreFil(element.id)
    montrer(f.page, f.y)
    ouvrir(f.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demande, fils, element?.id, pret])

  /** Les épingles d'une page (1 pour la première). */
  const epingles = (numero: number): ReactNode => {
    if (!visible || !ctx || !element) return null
    return filsDeLaPage(filsMontres, numero).map((f) => (
      <EpinglePdf
        key={f.id}
        id={f.id}
        fil={f.fil}
        x={f.x}
        y={f.y}
        ouvert={ouvert === f.id}
        ouvrir={ouvrir}
        contexte={ctx}
        element={element.id}
        poser={poser(f)}
        deplacer={peutDeplacer(f) ? (p, x, y) => ecrire((c) => deplacerFilPdf(c, f.id, p, x, y)) : undefined}
      />
    ))
  }

  /** En mode Commenter, la couche qui attend le clic sur une page : il y épingle un fil neuf, ouvert pour écrire. */
  const saisie = (numero: number): ReactNode =>
    actif && (
      <div
        className="notak-pdf-saisie notak-pdf-saisie-fil"
        aria-hidden="true"
        onClick={(e) => {
          const [x, y] = pointSurPage(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
          const fil = filNeuf(numero, x, y)
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

  /** La liste des fils, à droite des pages : chacun mène à son épingle ; « Résoudre » le range sans l'effacer. */
  const panneau = visible && liste && (
    <aside className="notak-pdf-fils" aria-label={t('pdf.fils.titre')} onPointerDown={garder}>
      <div className="notak-pdf-fils-tete">
        <span className="notak-pdf-fils-titre">
          {t('pdf.fils')} <span className="notak-pdf-fils-compte">{fils.length}</span>
        </span>
        <button type="button" className="notak-pdf-fils-bouton" aria-label={t('pdf.fils.precedent')} title={t('pdf.fils.precedent')} disabled={fils.length === 0} onClick={() => voisin(-1)}>
          <Icone nom="haut" taille={16} />
        </button>
        <button type="button" className="notak-pdf-fils-bouton" aria-label={t('pdf.fils.suivant')} title={t('pdf.fils.suivant')} disabled={fils.length === 0} onClick={() => voisin(1)}>
          <Icone nom="bas" taille={16} />
        </button>
        <button type="button" className="notak-pdf-fils-bouton" aria-label={t('pdf.fils.fermer')} title={t('pdf.fils.fermer')} onClick={() => setListe(false)}>
          <Icone nom="fermer" taille={16} />
        </button>
      </div>
      {fils.length === 0 ? (
        <p className="notak-pdf-fils-vide">{t('pdf.fils.aucun')}</p>
      ) : (
        <ol className="notak-pdf-fils-liste">
          {fils.map((f) => {
            const r = resumeDuFil(f.fil)
            return (
              <li key={f.id} data-fil={f.id} data-courant={courant === f.id || undefined} data-resolu={f.fil.resolu || undefined}>
                <button type="button" className="notak-pdf-fil" onClick={() => aller(f)}>
                  <span className="notak-pdf-fil-ligne">
                    <span className="notak-pdf-fil-page">{t('pdf.pageN', { n: f.page })}</span>
                    <span className="notak-pdf-fil-auteur">{r.auteur}</span>
                    {r.date > 0 && <span className="notak-pdf-fil-date">{dateLisible(r.date)}</span>}
                  </span>
                  <span className="notak-pdf-fil-texte">{r.texte}</span>
                  <span className="notak-pdf-fil-ligne">
                    <span className="notak-pdf-fil-etat">{f.fil.resolu ? t('commentaire.resolu') : t('pdf.fils.ouvert')}</span>
                    {r.reponses > 0 && <span className="notak-pdf-fil-reponses">{t('pdf.fils.reponses', { n: r.reponses })}</span>}
                  </span>
                </button>
                {autorise && (
                  <button type="button" className="notak-pdf-fil-resoudre" onClick={() => ecrire((c) => poserFilPdf(c, f.id, resoudre(f.fil, !f.fil.resolu)))}>
                    {f.fil.resolu ? t('pdf.fils.rouvrir') : t('commentaire.resoudre')}
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </aside>
  )

  return {
    visible,
    autorise,
    actif,
    basculer,
    quitter: () => setActif(false),
    epingles,
    saisie,
    clavier,
    nombre: fils.length,
    ouvert,
    liste,
    basculerListe: () => setListe((l) => !l),
    voisin,
    panneau,
  }
}
