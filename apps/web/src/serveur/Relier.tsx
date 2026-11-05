import { Icone } from '@notak/tableau'
import { useEffect, useRef, useState } from 'react'
import { type DossierDeFiche, ErreurApi, creerDossierDeFiche, lireDossierDeFiche, remettreDossierDeFiche } from '../api'
import { allerA, surLien } from '../chemin'
import { t } from '../langue'
import { PageApp } from '../PageApp'

/** Ce que l'adresse demande : l'outil, la fiche, le titre du dossier à créer, et où la fiche s'ouvre dans l'outil. */
export interface FicheDemandee {
  source: string
  cle: string
  titre: string
  retour?: string
}

/** La fiche que porte l'adresse (`/relier?source=&cle=&titre=&retour=`), ou `null` s'il manque l'outil ou la fiche. */
export function ficheDeLAdresse(recherche: string): FicheDemandee | null {
  const p = new URLSearchParams(recherche)
  const source = p.get('source')?.trim().slice(0, 32)
  const cle = p.get('cle')?.trim().slice(0, 128)
  if (!source || !cle) return null
  const retour = p.get('retour')?.trim()
  return { source, cle, titre: p.get('titre')?.trim().slice(0, 200) || cle, ...(retour ? { retour } : {}) }
}

type Etat =
  | { type: 'charge' }
  | { type: 'absent'; source: string; dossier: string; creation: boolean; erreur: string | null }
  | { type: 'corbeille'; titre: string; source: string; dossier: string; remise: boolean; erreur: string | null }
  | { type: 'cache' }
  | { type: 'impossible'; message: string }

/** L'adresse du dossier dans la bibliothèque, sans revenir ici au retour du navigateur. */
const ouvrirLeDossier = (tableau: string) => allerA(`/?dossier=${encodeURIComponent(tableau)}`, { remplacer: true })

/**
 * La page qu'ouvre le bouton d'une fiche d'un autre outil (un CRM…) : elle mène au dossier de la fiche, ou propose de
 * le créer. Rien ne se crée sans le clic : un lien seul n'écrit rien. Sans session, l'écran de connexion passe avant,
 * puis revient à cette adresse.
 */
export function PageRelier({ recherche = location.search }: { recherche?: string }) {
  // Lue une fois : l'adresse change dès qu'on part vers le dossier.
  const [fiche] = useState(() => ficheDeLAdresse(recherche))
  const [etat, setEtat] = useState<Etat>(() => (fiche ? { type: 'charge' } : { type: 'impossible', message: t('relier.incomplete') }))
  const carte = useRef<HTMLElement>(null)

  const suivre = (d: DossierDeFiche): Etat | null => {
    if (d.etat === 'present') {
      ouvrirLeDossier(d.tableau)
      return null
    }
    if (d.etat === 'corbeille') return { type: 'corbeille', titre: d.titre, source: d.source, dossier: d.dossier, remise: false, erreur: null }
    return d.etat === 'cache' ? { type: 'cache' } : { type: 'absent', source: d.source, dossier: d.dossier, creation: false, erreur: null }
  }

  useEffect(() => {
    if (!fiche) return
    let vivant = true
    lireDossierDeFiche(fiche.source, fiche.cle).then(
      (d) => {
        if (!vivant) return
        const suite = suivre(d)
        if (suite) setEtat(suite)
      },
      (x: Error) => vivant && setEtat({ type: 'impossible', message: x.message || t('commun.echec') }),
    )
    return () => {
      vivant = false
    }
  }, [fiche])

  // Chaque écran nouveau reprend le curseur sur sa carte : un lecteur d'écran la lit.
  useEffect(() => {
    carte.current?.focus()
  }, [etat.type])

  const creer = async () => {
    if (!fiche || etat.type !== 'absent' || etat.creation) return
    setEtat({ ...etat, creation: true, erreur: null })
    try {
      const suite = suivre(await creerDossierDeFiche(fiche.source, fiche.cle, fiche.titre, fiche.retour))
      if (suite) setEtat(suite)
    } catch (x) {
      // Un refus qui vaudra encore au prochain essai (une adresse de retour refusée, aucun droit) : la page le dit, et
      // le bouton se retire ; un échec du réseau laisse réessayer.
      if (x instanceof ErreurApi && x.statut >= 400 && x.statut < 500) return setEtat({ type: 'impossible', message: x.message })
      setEtat({ ...etat, creation: false, erreur: x instanceof Error ? x.message : t('commun.echec') })
    }
  }

  // Le dossier jeté à la corbeille : on le remet, plutôt que d'en faire un second.
  const remettre = async () => {
    if (!fiche || etat.type !== 'corbeille' || etat.remise) return
    setEtat({ ...etat, remise: true, erreur: null })
    try {
      const suite = suivre(await remettreDossierDeFiche(fiche.source, fiche.cle))
      if (suite) setEtat(suite.type === 'corbeille' ? { ...suite, erreur: t('commun.echec') } : suite)
    } catch (x) {
      if (x instanceof ErreurApi && x.statut >= 400 && x.statut < 500) return setEtat({ type: 'impossible', message: x.message })
      setEtat({ ...etat, remise: false, erreur: x instanceof Error ? x.message : t('commun.echec') })
    }
  }

  const versLaBibliotheque = (
    <a className="bouton" href="/" onClick={(e) => surLien(e, '/')}>
      {t('relier.bibliotheque')}
    </a>
  )

  return (
    <PageApp titre={t('relier.titre')}>
      {etat.type === 'charge' && (
        <section className="app-carte relier-carte" ref={carte} tabIndex={-1} aria-label={t('relier.titre')}>
          <p role="status">{t('relier.attente')}</p>
        </section>
      )}

      {etat.type === 'absent' && fiche && (
        <section className="app-carte relier-carte" ref={carte} tabIndex={-1} aria-labelledby="relier-absent" aria-busy={etat.creation}>
          <h2 id="relier-absent">
            <Icone nom="dossier" taille={18} />
            {t('relier.absent.titre', { titre: fiche.titre })}
          </h2>
          <p>{t('relier.absent.texte', { dossier: etat.dossier, source: etat.source })}</p>
          {etat.erreur && (
            <p className="connexion-erreur" role="alert">
              {etat.erreur}
            </p>
          )}
          <div className="relier-actions">
            <button type="button" className="bouton bouton-plein" disabled={etat.creation} onClick={() => void creer()}>
              {etat.creation ? t('relier.creation') : t('relier.creer')}
            </button>
            <a className="bouton" href="/" onClick={(e) => surLien(e, '/')}>
              {t('relier.annuler')}
            </a>
          </div>
        </section>
      )}

      {etat.type === 'corbeille' && (
        <section className="app-carte relier-carte" ref={carte} tabIndex={-1} aria-labelledby="relier-corbeille" aria-busy={etat.remise}>
          <h2 id="relier-corbeille">
            <Icone nom="corbeille" taille={18} />
            {t('relier.corbeille.titre')}
          </h2>
          <p>{t('relier.corbeille.texte', { titre: etat.titre, dossier: etat.dossier })}</p>
          {etat.erreur && (
            <p className="connexion-erreur" role="alert">
              {etat.erreur}
            </p>
          )}
          <div className="relier-actions">
            <button type="button" className="bouton bouton-plein" disabled={etat.remise} onClick={() => void remettre()}>
              {etat.remise ? t('relier.remise') : t('relier.remettre')}
            </button>
            <a className="bouton" href="/" onClick={(e) => surLien(e, '/')}>
              {t('relier.annuler')}
            </a>
          </div>
        </section>
      )}

      {etat.type === 'cache' && (
        <section className="app-carte relier-carte" ref={carte} tabIndex={-1} aria-labelledby="relier-cache">
          <h2 id="relier-cache">{t('relier.cache.titre')}</h2>
          <p>{t('relier.cache.texte')}</p>
          <div className="relier-actions">{versLaBibliotheque}</div>
        </section>
      )}

      {etat.type === 'impossible' && (
        <section className="app-carte relier-carte" ref={carte} tabIndex={-1} aria-labelledby="relier-impossible">
          <h2 id="relier-impossible">{t('relier.impossible')}</h2>
          <p className="connexion-erreur" role="alert">
            {etat.message}
          </p>
          <div className="relier-actions">{versLaBibliotheque}</div>
        </section>
      )}
    </PageApp>
  )
}
