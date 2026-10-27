import { lireReglages, themeEffectif, useSystemeSombre } from '@notak/tableau'
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { type Acces, acces as lireAcces, annulerJonction, estErreurCoque, joindreServeur } from '../bureau'
import { t } from '../langue'
import { Marque } from '../PageApp'
import { type Echec, decidePorte, echecDe, hoteDe, serveurMuet } from './acces'
import { EcranAcces } from './FormulaireAcces'

/**
 * La porte de l'app de bureau, sur sa page embarquée : avant de monter l'édition locale, on regarde où Notak doit
 * s'ouvrir (`acces`). Sur un serveur mémorisé, on y va (« Connexion à notak.exemple.fr… ») ; s'il ne répond pas, ou si
 * la coque nous a ramenés ici pour choisir (`?acces`), l'écran d'accès parle. Sinon, et pour un coup d'œil depuis un
 * serveur (`?ici`), les toiles de cet ordinateur.
 *
 * Tant qu'on se connecte, rien de l'édition locale ne tourne : les copies `.notak` ouvertes depuis le système restent en
 * file pour la page du serveur, qui les prend.
 */

/**
 * Passé ce délai sans réponse du serveur, on propose d'ouvrir les toiles de cet ordinateur en attendant, pour cette
 * fois : rien ne change aux réglages, le serveur reste mémorisé et Notak y retournera au prochain lancement. La
 * jonction en cours s'arrête (`annulerJonction`) : un serveur qui répond tard n'emmène pas la fenêtre en pleine
 * édition, et si elle était déjà partie le chercher, la coque la ramène ici.
 */
export const LENTEUR_MS = 10_000
/** Une coque qui ne répond pas aux réglages ne retient pas l'app : les toiles d'ici s'ouvrent. */
const ATTENTE_ACCES_MS = 3_000

type Phase = { type: 'connexion'; lent: boolean } | { type: 'ecran'; echec?: Echec }

export function Porte({ acces, recherche, surLocal }: { acces: Acces | null; recherche: string; surLocal(): void }) {
  const [reglages] = useState(lireReglages)
  const theme = themeEffectif(reglages.theme, useSystemeSombre())
  const [phase, setPhase] = useState<Phase>(() =>
    decidePorte(acces, recherche) === 'connecter'
      ? { type: 'connexion', lent: false }
      : { type: 'ecran', ...(serveurMuet(recherche) && acces?.serveur ? { echec: { code: 'muette' } as const } : {}) },
  )
  const lance = useRef(false)
  const renonce = useRef(false)
  const serveur = acces?.serveur ?? null

  useEffect(() => {
    if (phase.type !== 'connexion' || !serveur) return
    const lenteur = setTimeout(() => setPhase((p) => (p.type === 'connexion' ? { ...p, lent: true } : p)), LENTEUR_MS)
    if (!lance.current) {
      lance.current = true
      // Le serveur mémorisé le reste, quoi qu'il arrive ici : garder = Notak s'y rouvrira encore.
      joindreServeur(serveur, true).catch((e: unknown) => {
        // Annulée parce que la personne a ouvert les toiles d'ici : la porte n'est déjà plus là.
        if (estErreurCoque(e) && e.code === 'annule') return
        setPhase({ type: 'ecran', echec: echecDe(e) })
      })
    }
    return () => clearTimeout(lenteur)
    // Une seule tentative, au montage : un changement de phase ne la relance pas.
  }, [])

  if (phase.type === 'ecran') return <EcranAcces acces={acces} echecInitial={phase.echec} surLocal={surLocal} />
  const hote = serveur ? hoteDe(serveur) : ''
  return (
    <div className="notak-espace" data-theme={theme}>
      <main className="connexion">
        <div className="connexion-carte acces-carte acces-connexion">
          <Marque />
          <h1>{t('bureau.porte.connexion', { hote })}</h1>
          <span className="bureau-roue" aria-hidden />
          {phase.lent && (
            <>
              <p className="connexion-aide" role="status">
                {t('bureau.porte.lent', { hote })}
              </p>
              <button
                type="button"
                className="bouton"
                autoFocus
                onClick={() => {
                  if (renonce.current) return
                  renonce.current = true
                  // La fenêtre déjà partie chercher le serveur : la coque la ramène aux toiles d'ici, cette page s'en va.
                  annulerJonction().then(
                    (ramenee) => {
                      if (!ramenee) surLocal()
                    },
                    (e: unknown) => {
                      console.warn('Notak : la connexion en cours n’a pas pu être arrêtée', e)
                      surLocal()
                    },
                  )
                }}
              >
                {t('bureau.porte.ouvrirLocal')}
              </button>
              <small className="connexion-indice">{t('bureau.porte.ouvrirLocalAide', { hote })}</small>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

/** Ce que la coque met dans l'adresse de la page embarquée, pour une fois : l'écran d'accès, son erreur, un coup d'œil. */
const MARQUES = ['acces', 'erreur', 'ici']

/**
 * Le coup d'œil aux toiles d'ici vaut pour la séance, pas seulement pour cette page : l'édition locale se recharge
 * parfois d'elle-même (une copie devenue l'accueil), et ne doit pas rejoindre le serveur pour autant. Comme `?ici`, il ne
 * fait qu'empêcher une connexion d'office ; la séance finie (l'app quittée), Notak s'ouvre de nouveau où il doit.
 */
const ICI = 'notak.bureau.ici'

function retenirIci() {
  try {
    sessionStorage.setItem(ICI, '1')
  } catch {
    // Sans stockage, le coup d'œil vaut pour cette page seulement.
  }
}

function dejaIci(): boolean {
  try {
    return sessionStorage.getItem(ICI) === '1'
  } catch {
    return false
  }
}

/** Retire de l'adresse les marques de la coque, une fois lues, pour qu'un rechargement n'y revienne pas. */
function nettoyerAdresse() {
  const u = new URL(location.href)
  if (!MARQUES.some((m) => u.searchParams.has(m))) return
  for (const m of MARQUES) u.searchParams.delete(m)
  history.replaceState(history.state, '', u)
}

const attendre = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, refus) => setTimeout(() => refus(new Error('délai')), ms))])

/**
 * Décide où s'ouvre la page. Les toiles de cet ordinateur : `monterLocal` tout de suite. Sinon, la porte prend la
 * place, jusqu'à ce que la personne choisisse les toiles d'ici (elle se retire alors, et `monterLocal` s'exécute).
 */
export async function passerLaPorte(monterLocal: () => void): Promise<void> {
  let acces: Acces | null = null
  try {
    acces = await attendre(lireAcces(), ATTENTE_ACCES_MS)
  } catch {
    // Une coque d'avant les serveurs, ou qui ne répond pas : les toiles de cet ordinateur.
  }
  const recherche = location.search
  const porte = decidePorte(acces, recherche)
  if (porte === 'local' || (porte === 'connecter' && dejaIci())) {
    if (new URLSearchParams(recherche).has('ici')) retenirIci()
    nettoyerAdresse()
    return monterLocal()
  }
  const racine = createRoot(document.getElementById('racine')!)
  racine.render(
    <Porte
      acces={acces}
      recherche={recherche}
      surLocal={() => {
        racine.unmount()
        retenirIci()
        nettoyerAdresse()
        monterLocal()
      }}
    />,
  )
}
