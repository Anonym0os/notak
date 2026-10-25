import { type Services, Toile, creerMagasin, lireReglages, themeEffectif, useSystemeSombre } from '@notak/tableau'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { ErreurApi, type TableauPublic, deverrouillerPublic, lirePublic } from './api'
import { t } from './langue'
import { Marque } from './PageApp'

type Etat = { type: 'chargement' } | { type: 'absent' } | { type: 'erreur' } | { type: 'protege' } | { type: 'pret'; tableau: TableauPublic }

/** `/p/<jeton>` : un tableau publié, qu'on regarde sans compte. Rien ne s'y modifie. Le thème est celui de l'appareil. */
export function PagePublique({ jeton }: { jeton: string }) {
  const [reglages] = useState(lireReglages)
  const theme = themeEffectif(reglages.theme, useSystemeSombre())
  return (
    <div className="notak-espace" data-theme={theme}>
      <Contenu jeton={jeton} />
    </div>
  )
}

function Contenu({ jeton }: { jeton: string }) {
  const [etat, setEtat] = useState<Etat>({ type: 'chargement' })
  const charger = useCallback(() => {
    let vivant = true
    lirePublic(jeton).then(
      (t) => vivant && setEtat(t ? { type: 'pret', tableau: t } : { type: 'absent' }),
      (x: unknown) => vivant && setEtat({ type: x instanceof ErreurApi && x.statut === 401 ? 'protege' : 'erreur' }),
    )
    return () => {
      vivant = false
    }
  }, [jeton])
  useEffect(charger, [charger])

  useEffect(() => {
    if (etat.type !== 'pret') return
    const avant = document.title
    document.title = `${etat.tableau.titre || t('commun.sansTitre')} · Notak`
    return () => {
      document.title = avant
    }
  }, [etat])

  if (etat.type === 'chargement') return <div className="ecran-attente" aria-busy />
  if (etat.type === 'protege') return <MotDePasseRequis jeton={jeton} surOuverture={charger} />
  if (etat.type !== 'pret') {
    return (
      <main className="connexion">
        <div className="connexion-carte">
          <Marque />
          <h1>Notak</h1>
          <p className="connexion-aide">{etat.type === 'absent' ? t('publique.absent') : t('publique.erreur')}</p>
        </div>
      </main>
    )
  }
  return <Lecture jeton={jeton} tableau={etat.tableau} />
}

function Lecture({ jeton, tableau }: { jeton: string; tableau: TableauPublic }) {
  const magasin = useMemo(() => creerMagasin({ titre: tableau.titre, elements: tableau.elements }), [tableau])
  const services = useMemo<Services>(
    () => ({
      lectureSeule: true,
      fichiers: {
        enregistrer: () => Promise.reject(new Error(t('publique.lectureSeule'))),
        adresse: async (id) => `/api/public/${encodeURIComponent(jeton)}/fichiers/${encodeURIComponent(id)}`,
      },
      tableau: (id) => (tableau.titres[id] === undefined ? undefined : { titre: tableau.titres[id], elements: [] }),
    }),
    [jeton, tableau],
  )
  return (
    <div className="public">
      <header className="public-entete">
        <div className="notak-ilot">
          <strong className="public-titre">{tableau.titre || t('commun.sansTitre')}</strong>
          <span className="public-note">{t('publique.lectureSeule')}</span>
        </div>
        <a className="notak-ilot public-ouvrir" href="/">
          Notak
        </a>
      </header>
      <div className="public-corps">
        <Toile magasin={magasin} services={services} />
      </div>
      {/* Une bande à part, sous la toile : la mention ne recouvre jamais une carte. */}
      <footer className="public-pied">
        <a href="https://notak.app" target="_blank" rel="noopener">
          {t('publique.faitAvec')}
        </a>
      </footer>
    </div>
  )
}

/** Un lien protégé : on donne le mot de passe, puis le tableau se charge. */
function MotDePasseRequis({ jeton, surOuverture }: { jeton: string; surOuverture(): void }) {
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const valider = async (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    setEnvoi(true)
    try {
      await deverrouillerPublic(jeton, motDePasse)
      surOuverture()
    } catch (x) {
      setErreur(x instanceof Error ? x.message : t('commun.echec'))
      setEnvoi(false)
    }
  }
  return (
    <main className="connexion">
      <form className="connexion-carte" onSubmit={valider} noValidate>
        <Marque />
        <h1>Notak</h1>
        <p className="connexion-aide">{t('publique.protege')}</p>
        <label>
          {t('connexion.mdp')}
          <input type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} autoComplete="off" autoFocus />
        </label>
        {erreur && (
          <p className="connexion-erreur" role="alert">
            {erreur}
          </p>
        )}
        <button type="submit" className="bouton bouton-plein" disabled={envoi || !motDePasse}>
          {t('commun.ouvrir')}
        </button>
      </form>
    </main>
  )
}
