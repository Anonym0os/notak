import { type Services, Toile, creerMagasin } from '@notak/tableau'
import { useEffect, useMemo, useState } from 'react'
import { type TableauPublic, lirePublic } from './api'

type Etat = { type: 'chargement' } | { type: 'absent' } | { type: 'erreur' } | { type: 'pret'; tableau: TableauPublic }

/** `/p/<jeton>` : un tableau publié, qu'on regarde sans compte. Rien ne s'y modifie. */
export function PagePublique({ jeton }: { jeton: string }) {
  const [etat, setEtat] = useState<Etat>({ type: 'chargement' })
  useEffect(() => {
    let vivant = true
    lirePublic(jeton).then(
      (t) => vivant && setEtat(t ? { type: 'pret', tableau: t } : { type: 'absent' }),
      () => vivant && setEtat({ type: 'erreur' }),
    )
    return () => {
      vivant = false
    }
  }, [jeton])

  useEffect(() => {
    if (etat.type !== 'pret') return
    const avant = document.title
    document.title = `${etat.tableau.titre || 'Sans titre'} · Notak`
    return () => {
      document.title = avant
    }
  }, [etat])

  if (etat.type === 'chargement') return <div className="ecran-attente" aria-busy />
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
