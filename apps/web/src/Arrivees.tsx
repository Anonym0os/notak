import type { Arrivee, DepotFichiers, EspaceDistant } from '@notak/tableau'
import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from './langue'
import { Marque } from './PageApp'
import { deposerDansAccueil, messageDuDepot } from './deposer'
import { apercuDeLArrivee, lireArrivee, oublierArrivee, origineDuPartage } from './recuDuPartage'

type EtatPartage =
  | { type: 'cours' }
  | { type: 'confirmer'; arrivee: Arrivee }
  | { type: 'annule' }
  | { type: 'vide' }
  | { type: 'fini'; message: string; local: boolean }
  | { type: 'echec' }

/**
 * La page `/partage`, où mène le partage d'une page, d'un texte ou d'images vers Notak : ce qui est arrivé va dans
 * les non triés de l'accueil, puis on rend la main à l'application. Ce qui arrive par l'adresse seule (n'importe quel
 * lien peut la fabriquer) est d'abord montré : rien n'est posé sans l'accord de la personne.
 */
export function PagePartage({ espace, fichiers }: { espace: EspaceDistant; fichiers: DepotFichiers }) {
  const [etat, setEtat] = useState<EtatPartage>({ type: 'cours' })
  const ouvrir = useRef<HTMLAnchorElement>(null)
  // Annulé, le bouton disparaît : le focus passe à « Ouvrir Notak » plutôt que de se perdre.
  useEffect(() => {
    if (etat.type === 'annule') ouvrir.current?.focus()
  }, [etat.type])
  // Une seule fois, même quand React monte la page deux fois : poser deux fois ferait des doublons.
  const lance = useRef(false)
  const deposer = useCallback(
    async (arrivee: Arrivee) => {
      setEtat({ type: 'cours' })
      try {
        const depot = await deposerDansAccueil(espace, arrivee, fichiers)
        await oublierArrivee(location.search)
        if (depot.ajoutes === 0) return setEtat({ type: 'vide' })
        setEtat({ type: 'fini', message: messageDuDepot(depot), local: depot.etat === 'local' })
      } catch {
        setEtat({ type: 'echec' })
      }
    },
    [espace, fichiers],
  )
  useEffect(() => {
    if (lance.current) return
    lance.current = true
    void (async () => {
      try {
        const arrivee = await lireArrivee(location.search)
        if (!arrivee) return setEtat({ type: 'vide' })
        // Un partage du système a été rangé par notre service worker ; celui de l'adresse peut venir de n'importe où.
        if (origineDuPartage(location.search) === 'adresse') {
          // Rien de montrable (des blancs) : rien à demander.
          return setEtat(Object.keys(apercuDeLArrivee(arrivee)).length > 0 ? { type: 'confirmer', arrivee } : { type: 'vide' })
        }
        await deposer(arrivee)
      } catch {
        setEtat({ type: 'echec' })
      }
    })()
  }, [deposer])

  // Reçu par le serveur : on rend la main à l'accueil. Gardé ici seulement : on laisse lire.
  useEffect(() => {
    if (etat.type !== 'fini' || etat.local) return
    const minuteur = setTimeout(() => location.replace('/'), 1500)
    return () => clearTimeout(minuteur)
  }, [etat])

  if (etat.type === 'confirmer') {
    return (
      <ConfirmationArrivee
        arrivee={etat.arrivee}
        ajouter={() => void deposer(etat.arrivee)}
        annuler={() => {
          // La fenêtre que le favori a ouverte se referme ; un onglet reste là, avec de quoi aller à Notak.
          if (window.opener) window.close()
          setEtat({ type: 'annule' })
        }}
      />
    )
  }

  return (
    <main className="arrivee">
      <div className="arrivee-carte" role="status">
        <Marque />
        <h1>Notak</h1>
        <p>
          {etat.type === 'cours' && t('arrivee.cours')}
          {etat.type === 'annule' && t('arrivee.annule')}
          {etat.type === 'vide' && t('arrivee.vide')}
          {etat.type === 'fini' && etat.message}
          {etat.type === 'echec' && t('arrivee.echec')}
        </p>
        {etat.type !== 'cours' && (
          <a ref={ouvrir} className="bouton bouton-plein" href="/">
            {t('arrivee.ouvrir')}
          </a>
        )}
      </div>
    </main>
  )
}

/** Ce qui est arrivé par un lien, en texte brut (jamais en lien cliquable), et le choix de l'ajouter ou non. */
function ConfirmationArrivee({ arrivee, ajouter, annuler }: { arrivee: Arrivee; ajouter(): void; annuler(): void }) {
  const titre = useRef<HTMLHeadingElement>(null)
  // Le focus va à la question, pas à un bouton : un Entrée distrait n'ajouterait pas ce qu'on n'a pas lu.
  useEffect(() => titre.current?.focus(), [])
  const apercu = apercuDeLArrivee(arrivee)
  const champs = [
    [t('arrivee.apercu.titre'), apercu.titre],
    [t('arrivee.apercu.texte'), apercu.texte],
    [t('arrivee.apercu.adresse'), apercu.adresse],
  ] as const
  return (
    <main className="arrivee">
      <form
        className="arrivee-carte"
        aria-labelledby="arrivee-question"
        onSubmit={(e) => {
          e.preventDefault()
          ajouter()
        }}
      >
        <Marque />
        <h1>Notak</h1>
        <h2 id="arrivee-question" ref={titre} tabIndex={-1} className="arrivee-question">
          {t('arrivee.confirmer.titre')}
        </h2>
        <p>{t('arrivee.confirmer')}</p>
        <dl className="arrivee-apercu">
          {champs.map(([libelle, valeur]) =>
            valeur ? (
              <div key={libelle}>
                <dt>{libelle}</dt>
                <dd>{valeur}</dd>
              </div>
            ) : null,
          )}
        </dl>
        <div className="arrivee-actions">
          <button type="submit" className="bouton bouton-plein">
            {t('arrivee.ajouter')}
          </button>
          <button type="button" className="bouton" onClick={annuler}>
            {t('commun.annuler')}
          </button>
        </div>
      </form>
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
