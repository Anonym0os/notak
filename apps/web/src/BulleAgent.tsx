import { type EspaceNavigable, FeuilleBas, Icone } from '@notak/tableau'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { FilAgent, extraitDe, ouvertDe, useAgent } from './Agent'
import { useAuTelephone } from './bibliotheque/AuDoigt'
import { type Ici, useIci } from './ici'
import { t } from './langue'

/**
 * Où la bulle se range : l'espace de la page (la bibliothèque, la toile), dont elle prend le thème. Les couleurs de
 * Notak vivent sur `.notak-espace` ; posée ailleurs, la bulle resterait claire sur une toile sombre.
 */
const hoteDe = (): HTMLElement | null => document.querySelector<HTMLElement>('.notak-espace:not(.notak-par-dessus)')

/**
 * Ce que la tête du panneau dit d'où l'on écrit : la page ou la carte ouverte, la toile, le dossier, ou la
 * bibliothèque. Une demande s'y rattache ; le dire évite de croire qu'on parle d'autre chose.
 */
function ouJEcris(ici: Ici, espace: EspaceNavigable): string {
  if (ici.vue === 'bibliotheque') return t('agent.ici.bibliotheque')
  const tableau = espace.tableau(ici.tableau)
  const titre = tableau?.titre?.trim()
  if (ici.vue === 'dossier') return titre ? t('agent.ici.dossier', { titre }) : t('agent.ici.ceDossier')
  const ouvert = ouvertDe(espace, ici)
  const contenu = ouvert ? tableau?.elements.find((e) => e.id === ouvert)?.contenu : undefined
  if (contenu) {
    const nom = (contenu.type === 'document' ? (contenu as { titre?: string }).titre?.trim() : extraitDe(contenu).split(' ').slice(0, 6).join(' ')) || t('commun.sansTitre')
    return t(contenu.type === 'document' ? 'agent.ici.page' : 'agent.ici.carte', { titre: nom })
  }
  return titre ? t('agent.ici.toile', { titre }) : t('agent.ici.cetteToile')
}

/** D'où l'on écrit, relu quand l'espace change (une toile renommée, un document qui arrive). */
function useOuJEcris(ici: Ici | null, espace: EspaceNavigable): string {
  return useSyncExternalStore(espace.ecouter, () => (ici ? ouJEcris(ici, espace) : ''))
}

/**
 * La bulle de l'agent (Fram, pour Silak) : un bouton rond dans le coin bas droit, sur chaque vue où l'on peut lui
 * écrire (la bibliothèque, un dossier, une toile, une page ou une carte ouverte en grand), et sa conversation, une seule
 * par personne, qui la suit d'une vue à l'autre. Montée une fois au-dessus des pages, elle garde le fil et le tour en
 * cours quand l'agent mène la personne ailleurs.
 *
 * Au bureau, le panneau s'ouvre au-dessus d'elle, en dialogue non modal : il reste ouvert pendant qu'on choisit sur la
 * toile ce dont on parle, et ne se ferme que par la bulle, sa croix, ou Échap quand on y est. Au téléphone, c'est la
 * feuille du bas. Un anneau tourne pendant que l'agent travaille ; une pastille dit qu'il a répondu bulle fermée ; et
 * ces états se disent aussi à qui lit l'écran à haute voix.
 *
 * Elle prend le coin bas droit : `data-bulle-agent` sur la racine du document pose `--notak-coin-droit`, et le zoom,
 * la mini-carte et la barre de la carte glissent à sa gauche (`app.css`). Rien ne paraît si le serveur n'a pas d'agent,
 * si la personne n'est pas liée à l'outil, ou si l'outil ne le lui ouvre pas.
 */
export function BulleAgent({ racine, espace }: { racine: string; espace: EspaceNavigable }) {
  const ici = useIci(racine)
  const agent = useAgent(ici, espace)
  const telephone = useAuTelephone()
  const [ouvert, setOuvert] = useState(false)
  const bouton = useRef<HTMLButtonElement>(null)
  const id = useId()
  const visible = ici !== null && agent.disponible

  // La page change de vue sous la bulle (la bibliothèque, puis une toile) : elle suit l'espace de la page affichée.
  const [hote, setHote] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const h = hoteDe()
    if (h !== hote) setHote(h)
  })
  useEffect(() => {
    if (hote?.isConnected) return
    // L'espace n'est pas encore là (la page se monte) : on le guette.
    const suivi = new MutationObserver(() => {
      const h = hoteDe()
      if (h) setHote(h)
    })
    suivi.observe(document.body, { childList: true, subtree: true })
    return () => suivi.disconnect()
  }, [hote])

  // Le coin bas droit est à elle tant qu'elle paraît.
  useLayoutEffect(() => {
    const racineDoc = document.documentElement
    racineDoc.toggleAttribute('data-bulle-agent', visible)
    return () => racineDoc.removeAttribute('data-bulle-agent')
  }, [visible])

  // La pastille : une réponse arrivée pendant que la bulle était fermée. Ouvrir la bulle la lit.
  const [lues, setLues] = useState(0)
  useEffect(() => {
    if (ouvert) setLues(agent.reponses)
  }, [ouvert, agent.reponses])
  const nonLue = !ouvert && agent.reponses > lues

  const fermer = useCallback(() => {
    setOuvert(false)
    bouton.current?.focus({ preventScroll: true })
  }, [])

  // Au téléphone, la feuille couvre l'écran : quand l'agent mène la personne ailleurs (« ouvre-la »), elle se range,
  // pour qu'on voie où. La réponse attend sous la pastille. Au bureau, le panneau reste à côté de ce qui s'ouvre.
  const menes = useRef(agent.menes)
  useEffect(() => {
    if (agent.menes === menes.current) return
    menes.current = agent.menes
    if (!telephone) return
    setOuvert(false)
    // Le tour a fini en même temps qu'il menait ailleurs : sa réponse n'a pas été lue, la feuille se rangeant.
    if (agent.tour === null) setLues((l) => Math.min(l, agent.reponses - 1))
  }, [agent.menes, agent.tour, agent.reponses, telephone])

  // Ce que la bulle dit à qui lit l'écran à haute voix : la région ne parle que quand son texte change. L'agent travaille
  // dès que la demande part : sur une machine lente, l'envoi seul peut prendre quelques secondes.
  const attend = agent.cartes.length > 0
  const travaille = agent.tour !== null || agent.envoi
  const annonce = attend
    ? t('agent.attendAccord', { nom: agent.nom })
    : travaille
      ? t('agent.travaille', { nom: agent.nom })
      : agent.reponses > 0
        ? t('agent.aRepondu', { nom: agent.nom })
        : ''
  const ou = useOuJEcris(ici, espace)

  if (!visible || !hote || !ici) return null
  const libelle = t('agent.bulle', { nom: agent.nom })
  return createPortal(
    <div className="bulle-agent" data-travaille={travaille ? '' : undefined} data-attend={attend ? '' : undefined}>
      {ouvert && !telephone && (
        <section
          id={`${id}-panneau`}
          className="bulle-agent-panneau"
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${id}-titre`}
          onKeyDown={(e) => {
            if (e.key !== 'Escape' || e.nativeEvent.isComposing) return
            e.preventDefault()
            e.stopPropagation()
            fermer()
          }}
        >
          <header className="bulle-agent-tete">
            <div>
              <h2 id={`${id}-titre`}>{agent.nom}</h2>
              <p>{ou}</p>
            </div>
            <button type="button" className="bouton bouton-nu bulle-agent-fermer" aria-label={t('commun.fermer')} onClick={fermer}>
              <Icone nom="fermer" taille={16} />
            </button>
          </header>
          <FilAgent agent={agent} />
        </section>
      )}
      {ouvert && telephone && (
        <FeuilleBas
          titre={
            <span className="bulle-agent-titre">
              {agent.nom}
              <small className="bulle-agent-ici">{ou}</small>
            </span>
          }
          fermer={fermer}
          className="agent-feuille"
        >
          <FilAgent agent={agent} />
        </FeuilleBas>
      )}
      <button
        ref={bouton}
        type="button"
        className="bulle-agent-bouton"
        aria-label={libelle}
        title={libelle}
        aria-expanded={ouvert}
        aria-controls={ouvert && !telephone ? `${id}-panneau` : undefined}
        onClick={() => (ouvert ? fermer() : setOuvert(true))}
      >
        <Icone nom="discussion" taille={24} trait={1.75} />
        {nonLue && <span className="bulle-agent-pastille" />}
      </button>
      <span className="sr-seulement" role="status" aria-live="polite">
        {annonce}
      </span>
    </div>,
    hote,
  )
}
