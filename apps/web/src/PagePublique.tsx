import { type Services, Toile, creerMagasin } from '@notak/tableau'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { ErreurApi, type TableauPublic, deverrouillerPublic, lirePublic } from './api'

type Etat = { type: 'chargement' } | { type: 'absent' } | { type: 'erreur' } | { type: 'protege' } | { type: 'pret'; tableau: TableauPublic }

/** `/p/<jeton>` : un tableau publié, qu'on regarde sans compte. Rien ne s'y modifie. */
export function PagePublique({ jeton }: { jeton: string }) {
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
    document.title = `${etat.tableau.titre || 'Sans titre'} · Notak`
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
          <h1>Notak</h1>
          <p>{etat.type === 'absent' ? 'Ce lien n’existe plus : son propriétaire l’a retiré.' : 'Le tableau ne se charge pas pour le moment.'}</p>
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
        enregistrer: () => Promise.reject(new Error('Lecture seule')),
        adresse: async (id) => `/api/public/${encodeURIComponent(jeton)}/fichiers/${encodeURIComponent(id)}`,
      },
      tableau: (id) => (tableau.titres[id] === undefined ? undefined : { titre: tableau.titres[id], elements: [] }),
    }),
    [jeton, tableau],
  )
  return (
    <div className="public">
      <header className="public-entete">
        <strong className="public-titre">{tableau.titre || 'Sans titre'}</strong>
        <span className="public-note">Lecture seule</span>
        <a className="bouton" href="/">
          Notak
        </a>
      </header>
      <div className="public-corps">
        <Toile magasin={magasin} services={services} />
      </div>
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
      setErreur(x instanceof Error ? x.message : 'Échec')
      setEnvoi(false)
    }
  }
  return (
    <main className="connexion">
      <form className="connexion-carte" onSubmit={valider} noValidate>
        <h1>Notak</h1>
        <p className="partage-note">Ce tableau est protégé par un mot de passe.</p>
        <label>
          Mot de passe
          <input type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} autoComplete="off" autoFocus />
        </label>
        {erreur && (
          <p className="connexion-erreur" role="alert">
            {erreur}
          </p>
        )}
        <button type="submit" className="bouton bouton-plein" disabled={envoi || !motDePasse}>
          Ouvrir
        </button>
      </form>
    </main>
  )
}
