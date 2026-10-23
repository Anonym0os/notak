import '@fontsource-variable/inter'
import '@notak/tableau/toile.css'
import './app.css'
import {
  type Adresse,
  EspaceNotak,
  type EspaceDistant,
  type Declaration,
  creerEspaceDistant,
  creerReseauNavigateur,
} from '@notak/tableau'
import { StrictMode, useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { type Moi, moi as lireMoi, rechercherPartout, seDeconnecter } from './api'
import { importDejaPropose, lireAncienEspace, noterImportPropose } from './ancien'
import { Activite } from './Activite'
import { Cloche } from './Cloche'
import { Compte } from './Compte'
import { EcranConnexion } from './connexion'
import { Export } from './Export'
import { Favori } from './Favori'
import { apercu, fichiers, rapatrier } from './fichiers'
import { importerEspaceLocal } from './importLocal'
import { creerRecents } from './recents'
import { PagePublique } from './PagePublique'
import { Partage } from './Partage'

/** Ce que les autres viennent de faire sur le tableau ouvert : `Activite` le remplit, la toile le lit. */
const recents = creerRecents()

const services = {
  fichiers,
  apercu,
  rapatrier,
  rechercherPartout,
  recemmentModifies: recents.lire,
  ecouterRecemmentModifies: recents.ecouter,
  ouvrirDansOnglet: (id: string) => window.open(`/t/${encodeURIComponent(id)}`, '_blank'),
}

/** Chaque tableau a son adresse, `/t/<id>` ; l'accueil est `/`. Le retour du navigateur ramène au précédent. */
function adressePour(racine: string): Adresse {
  const lire = () => {
    const m = /^\/t\/([^/]+)\/?$/.exec(location.pathname)
    return m ? decodeURIComponent(m[1]!) : null
  }
  return {
    lire: () => lire() ?? racine,
    ecrire(id) {
      history.pushState(null, '', id === racine ? '/' : `/t/${encodeURIComponent(id)}`)
    },
    ecouter(f) {
      const surRetour = () => f(lire())
      window.addEventListener('popstate', surRetour)
      return () => window.removeEventListener('popstate', surRetour)
    },
  }
}

// Un espace par compte, créé une fois : React peut monter l'application deux fois, pas le réseau.
let ouvert: { id: string; espace: EspaceDistant } | null = null
function espacePour(moi: Moi): EspaceDistant {
  if (ouvert?.id === moi.id) return ouvert.espace
  ouvert?.espace.detruire()
  const cle = `notak:declarations:${moi.id}`
  const espace = creerEspaceDistant({
    racine: moi.racine,
    utilisateur: { id: moi.id, nom: moi.nom, couleur: moi.couleur },
    reseau: creerReseauNavigateur(moi.id),
    memoire: {
      lire() {
        try {
          return JSON.parse(localStorage.getItem(cle) ?? '[]') as Declaration[]
        } catch {
          return []
        }
      },
      ecrire(d) {
        try {
          localStorage.setItem(cle, JSON.stringify(d))
        } catch {
          // Sans stockage, une déclaration perdue au rechargement se refait à la prochaine ouverture.
        }
      },
    },
  })
  ouvert = { id: moi.id, espace }
  return espace
}
function fermerEspace() {
  ouvert?.espace.detruire()
  ouvert = null
}

type Etat = { type: 'chargement' } | { type: 'anonyme' } | { type: 'erreur'; message: string } | { type: 'connecte'; moi: Moi }

function Application() {
  const [etat, setEtat] = useState<Etat>({ type: 'chargement' })
  const charger = useCallback(() => {
    setEtat({ type: 'chargement' })
    lireMoi().then(
      (m) => setEtat(m ? { type: 'connecte', moi: m } : { type: 'anonyme' }),
      (x: Error) => setEtat({ type: 'erreur', message: x.message }),
    )
  }, [])
  useEffect(charger, [charger])
  // L'espace se ferme une fois l'écran rendu : fermé avant, un dernier rendu le rouvrirait.
  useEffect(() => {
    if (etat.type === 'anonyme') fermerEspace()
  }, [etat.type])

  if (etat.type === 'chargement') return <div className="ecran-attente" aria-busy />
  if (etat.type === 'erreur') {
    return (
      <main className="connexion">
        <div className="connexion-carte">
          <h1>Notak</h1>
          <p className="connexion-erreur">{etat.message}</p>
          <button type="button" className="bouton bouton-plein" onClick={charger}>
            Réessayer
          </button>
        </div>
      </main>
    )
  }
  if (etat.type === 'anonyme') return <EcranConnexion surConnexion={(m) => setEtat({ type: 'connecte', moi: m })} />
  return (
    <Espace
      moi={etat.moi}
      deconnexion={async () => {
        await seDeconnecter().catch(() => {})
        setEtat({ type: 'anonyme' })
      }}
    />
  )
}

function Espace({ moi, deconnexion }: { moi: Moi; deconnexion(): void }) {
  const espace = espacePour(moi)
  const [adresse] = useState(() => adressePour(moi.racine))
  return (
    <>
      <EspaceNotak
        espace={espace}
        services={services}
        adresse={adresse}
        actions={(courant, ouvrir) => (
          <>
            <Favori tableau={courant} accueil={moi.racine} />
            <Cloche ouvrir={ouvrir} />
            <Activite tableau={courant} moi={moi.id} surNouveaux={recents.noter} />
            <Export tableau={courant} />
            <Partage tableau={courant} moi={moi} />
            <Compte moi={moi} deconnexion={deconnexion} ouvrir={ouvrir} />
          </>
        )}
      />
      <BandeauImport moi={moi} espace={espace} />
    </>
  )
}

/** Une seule fois, à un compte dont l'accueil est vide : reprendre le tableau d'avant les comptes. */
function BandeauImport({ moi, espace }: { moi: Moi; espace: EspaceDistant }) {
  const [clos, setClos] = useState(() => importDejaPropose(moi.id) || lireAncienEspace() === null)
  const [etat, setEtat] = useState<'attente' | 'cours' | 'echec'>('attente')
  const vide = useSyncExternalStore(
    espace.ecouter,
    () => espace.synchronise(moi.racine) && espace.magasin(moi.racine).lire().elements.length === 0,
  )
  if (clos || !vide) return null

  const fermer = () => {
    noterImportPropose(moi.id)
    setClos(true)
  }
  const importer = async () => {
    setEtat('cours')
    try {
      await importerEspaceLocal(espace)
      fermer()
    } catch {
      setEtat('echec')
    }
  }
  return (
    <aside className="bandeau" role="status">
      <span>{etat === 'echec' ? 'Import impossible pour le moment.' : 'Un tableau de cet appareil attend.'}</span>
      <button type="button" className="bouton bouton-plein" disabled={etat === 'cours'} onClick={importer}>
        {etat === 'echec' ? 'Réessayer' : 'Importer mon tableau local'}
      </button>
      <button type="button" className="bouton-lien" onClick={fermer}>
        Non merci
      </button>
    </aside>
  )
}

/** `/p/<jeton>` : un tableau publié, lu sans compte. */
const publie = /^\/p\/([A-Za-z0-9_-]+)\/?$/.exec(location.pathname)

createRoot(document.getElementById('racine')!).render(
  <StrictMode>{publie ? <PagePublique jeton={publie[1]!} /> : <Application />}</StrictMode>,
)
