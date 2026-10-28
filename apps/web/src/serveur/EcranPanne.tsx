import { lireReglages, themeEffectif, useSystemeSombre } from '@notak/tableau'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { ErreurApi } from '../api'
import { estServeurDansApp } from '../bureau'
import { t } from '../langue'
import { Marque } from '../PageApp'
import { LigneServeur } from './LigneServeur'

/** Les attentes entre deux essais faits seuls, en secondes : vite au début, puis toutes les 30 s. */
const ATTENTES = [5, 10, 20, 30]

/**
 * Le serveur ne répond pas au chargement : la carte dit lequel, ce qui se passe et ce qu'on y peut, puis réessaie seule
 * jusqu'à ce qu'il revienne, sans repasser par l'écran d'attente. Dans l'app de bureau, les toiles de cet ordinateur
 * restent à un bouton.
 */
export function EcranPanne({ erreur, reessayer, children }: { erreur: Error; reessayer(): Promise<unknown>; children?: ReactNode }) {
  const [reglages] = useState(lireReglages)
  const theme = themeEffectif(reglages.theme, useSystemeSombre())
  const [cours, setCours] = useState(false)
  const [rang, setRang] = useState(0)
  const [dans, setDans] = useState(ATTENTES[0]!)
  const monte = useRef(true)
  // Remis à vrai à chaque montage : le mode strict démonte puis remonte une fois.
  useEffect(() => {
    monte.current = true
    return () => {
      monte.current = false
    }
  }, [])

  const essayer = () => {
    if (cours) return
    setCours(true)
    // Réussi, l'écran laisse sa place ; manqué, on attend un peu plus avant le suivant.
    reessayer().catch(() => {
      if (!monte.current) return
      const suivant = Math.min(rang + 1, ATTENTES.length - 1)
      setRang(suivant)
      setDans(ATTENTES[suivant]!)
      setCours(false)
    })
  }

  useEffect(() => {
    if (cours) return
    if (dans <= 0) return essayer()
    const minuteur = setTimeout(() => setDans((n) => n - 1), 1000)
    return () => clearTimeout(minuteur)
  }, [cours, dans])

  const hote = location.host
  const muet = injoignable(erreur)
  return (
    <div className="notak-espace" data-theme={theme}>
      <main className="connexion">
        <div className="connexion-carte panne-carte" role="alert" aria-labelledby="panne-titre">
          <Marque />
          <h1 id="panne-titre">{t(muet ? 'serveur.panne.muetTitre' : 'serveur.panne.erreurTitre', { hote })}</h1>
          <p className="panne-texte">{t(muet ? 'serveur.panne.muet' : 'serveur.panne.erreur')}</p>
          <button type="button" className="bouton bouton-plein" disabled={cours} onClick={essayer}>
            {cours ? (
              <>
                <span className="bureau-roue" aria-hidden />
                {t('serveur.panne.essai')}
              </>
            ) : (
              t('bandeau.reessayer')
            )}
          </button>
          <p className="panne-auto" aria-hidden={cours}>
            {!cours && t('serveur.panne.dans', { n: String(dans) })}
          </p>
          {/* Dans l'app de bureau, la sortie : les toiles de cet ordinateur, ou un autre serveur. */}
          {estServeurDansApp() && <LigneServeur localEnBouton />}
        </div>
        {children}
      </main>
    </div>
  )
}

/**
 * Personne n'a répondu : pas de réseau, ou ce qui se tient devant Notak (un proxy, le Vite du développement) a répondu
 * à sa place, sans le corps JSON que Notak met à chacune de ses erreurs.
 */
function injoignable(e: Error): boolean {
  if (!(e instanceof ErreurApi)) return true
  return e.statut === 0 || e.statut === 502 || e.statut === 503 || e.statut === 504 || (e.statut === 500 && !e.code && e.message === t('erreur.serveur'))
}
