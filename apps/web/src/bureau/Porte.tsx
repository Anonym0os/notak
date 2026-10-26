import { lireReglages, themeEffectif, useSystemeSombre } from '@notak/tableau'
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { type Acces, acces as lireAcces, joindreServeur } from '../bureau'
import { t } from '../langue'
import { Marque } from '../PageApp'
import { type Echec, decidePorte, echecDe, hoteDe, serveurMuet } from './acces'
import { EcranAcces } from './FormulaireAcces'

/**
 * La porte de l'app de bureau, sur sa page embarquée : avant de monter l'édition locale, on regarde où Notak doit
 * s'ouvrir (`acces`). Sur un serveur retenu, on y va (« Connexion à notak.exemple.fr… ») ; s'il ne répond pas, ou si la
 * coque nous a ramenés ici pour choisir (`?acces`), l'écran d'accès parle. Sinon, les toiles de cet ordinateur.
 *
 * Tant qu'on se connecte, rien de l'édition locale ne tourne : les copies `.notak` ouvertes depuis le système restent en
 * file pour la page du serveur, qui les prend.
 */

/**
 * Passé ce délai sans réponse du serveur, on propose d'ouvrir les toiles de cet ordinateur en attendant. Ce bouton ne
 * change rien aux réglages (pas de `revenirIci('local')` : ce serait « Notak s'ouvre désormais ici », que seul l'écran
 * d'accès propose) : le serveur reste retenu, et Notak y retournera au prochain lancement. La coque ne sait pas annuler
 * la connexion en cours : si le serveur répond tard, la fenêtre part encore chez lui.
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
  const serveur = acces?.serveur ?? null

  useEffect(() => {
    if (phase.type !== 'connexion' || !serveur) return
    const lenteur = setTimeout(() => setPhase((p) => (p.type === 'connexion' ? { ...p, lent: true } : p)), LENTEUR_MS)
    if (!lance.current) {
      lance.current = true
      // Le serveur retenu reste retenu, quoi qu'il arrive ici : garder = Notak s'y rouvrira encore.
      joindreServeur(serveur, true).catch((e: unknown) => setPhase({ type: 'ecran', echec: echecDe(e) }))
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
              <button type="button" className="bouton" autoFocus onClick={surLocal}>
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

/** Retire de l'adresse ce que la coque y a mis (`?acces`, `erreur=…`), pour qu'un rechargement n'y revienne pas. */
function nettoyerAdresse() {
  const u = new URL(location.href)
  u.searchParams.delete('acces')
  u.searchParams.delete('erreur')
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
  if (decidePorte(acces, recherche) === 'local') return monterLocal()
  const racine = createRoot(document.getElementById('racine')!)
  racine.render(
    <Porte
      acces={acces}
      recherche={recherche}
      surLocal={() => {
        racine.unmount()
        nettoyerAdresse()
        monterLocal()
      }}
    />,
  )
}
