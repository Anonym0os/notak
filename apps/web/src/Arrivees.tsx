import type { Arrivee, DepotFichiers, EspaceDistant } from '@notak/tableau'
import { useEffect, useRef, useState } from 'react'
import { t } from './langue'
import { Marque } from './PageApp'
import { deposerDansAccueil, messageDuDepot } from './deposer'
import { lireArrivee, oublierArrivee } from './recuDuPartage'

/**
 * La page `/partage`, où mène le partage d'une page, d'un texte ou d'images vers Notak : ce qui est arrivé va dans
 * les non triés de l'accueil, puis on rend la main à l'application.
 */
export function PagePartage({ espace, fichiers }: { espace: EspaceDistant; fichiers: DepotFichiers }) {
  const [etat, setEtat] = useState<{ type: 'cours' } | { type: 'vide' } | { type: 'fini'; message: string; local: boolean } | { type: 'echec' }>({ type: 'cours' })
  // Une seule fois, même quand React monte la page deux fois : poser deux fois ferait des doublons.
  const lance = useRef(false)
  useEffect(() => {
    if (lance.current) return
    lance.current = true
    void (async () => {
      try {
        const arrivee = await lireArrivee(location.search)
        if (!arrivee) return setEtat({ type: 'vide' })
        const depot = await deposerDansAccueil(espace, arrivee, fichiers)
        await oublierArrivee(location.search)
        if (depot.ajoutes === 0) return setEtat({ type: 'vide' })
        setEtat({ type: 'fini', message: messageDuDepot(depot), local: depot.etat === 'local' })
      } catch {
        setEtat({ type: 'echec' })
      }
    })()
  }, [espace, fichiers])

  // Reçu par le serveur : on rend la main à l'accueil. Gardé ici seulement : on laisse lire.
  useEffect(() => {
    if (etat.type !== 'fini' || etat.local) return
    const minuteur = setTimeout(() => location.replace('/'), 1500)
    return () => clearTimeout(minuteur)
  }, [etat])

  return (
    <main className="arrivee">
      <div className="arrivee-carte" role="status">
        <Marque />
        <h1>Notak</h1>
        <p>
          {etat.type === 'cours' && t('arrivee.cours')}
          {etat.type === 'vide' && t('arrivee.vide')}
          {etat.type === 'fini' && etat.message}
          {etat.type === 'echec' && t('arrivee.echec')}
        </p>
        {etat.type !== 'cours' && (
          <a className="bouton bouton-plein" href="/">
            {t('arrivee.ouvrir')}
          </a>
        )}
      </div>
    </main>
  )
}

/**
 * La page `/rapide`, pour jeter une idée depuis le téléphone : un champ, « Envoyer », et la note part dans les non
 * triés de l'accueil. Rien d'autre à charger, rien d'autre à regarder.
 */
export function PageRapide({ espace, fichiers }: { espace: EspaceDistant; fichiers: DepotFichiers }) {
  const [texte, setTexte] = useState('')
  const [etat, setEtat] = useState<{ type: 'repos' } | { type: 'envoi' } | { type: 'fait'; local: boolean } | { type: 'echec' }>({ type: 'repos' })
  const champ = useRef<HTMLTextAreaElement>(null)
  const vide = texte.trim() === ''

  const envoyer = async () => {
    if (vide || etat.type === 'envoi') return
    setEtat({ type: 'envoi' })
    const arrivee: Arrivee = { texte }
    try {
      const depot = await deposerDansAccueil(espace, arrivee, fichiers)
      if (depot.ajoutes === 0) return setEtat({ type: 'echec' })
      setTexte('')
      setEtat({ type: 'fait', local: depot.etat === 'local' })
      champ.current?.focus()
    } catch {
      setEtat({ type: 'echec' })
    }
  }

  return (
    <main className="arrivee">
      <form
        className="arrivee-carte rapide"
        onSubmit={(e) => {
          e.preventDefault()
          void envoyer()
        }}
      >
        <Marque />
        <h1>{t('rapide.titre')}</h1>
        <textarea
          ref={champ}
          className="rapide-champ"
          value={texte}
          autoFocus
          rows={6}
          placeholder={t('rapide.placeholder')}
          aria-label={t('rapide.champ')}
          onChange={(e) => {
            setTexte(e.target.value)
            if (etat.type !== 'envoi') setEtat({ type: 'repos' })
          }}
          onKeyDown={(e) => {
            // Cmd ou Ctrl + Entrée envoie, sur un clavier.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void envoyer()
            }
          }}
        />
        <button type="submit" className="bouton bouton-plein rapide-envoyer" disabled={vide || etat.type === 'envoi'}>
          {etat.type === 'envoi' ? t('rapide.envoi') : t('rapide.envoyer')}
        </button>
        <p className="rapide-etat" role="status">
          {etat.type === 'fait' && (etat.local ? t('rapide.local') : t('rapide.fait'))}
          {etat.type === 'echec' && t('rapide.echec')}
        </p>
        <a className="bouton-lien" href="/">
          {t('arrivee.ouvrir')}
        </a>
      </form>
    </main>
  )
}
