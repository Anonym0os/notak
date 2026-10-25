import {
  BullesDecouverte,
  EspaceNotak,
  type ServiceCompte,
  type EspaceDistant,
  type Declaration,
  creerEspaceDistant,
  creerReseauNavigateur,
} from '@notak/tableau'
import { StrictMode, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { type Moi, accepterInvitation, moi as lireMoi, rechercherPartout, reglerCompte, seDeconnecter } from '../api'
import { importDejaPropose, lireAncienEspace, noterImportPropose } from '../ancien'
import { PagePartage, PageRapide } from '../Arrivees'
import { PageEnvoyer } from '../Envoyer'
import { PageEspaces } from '../Espaces'
import { Activite } from '../Activite'
import { Cloche } from '../Cloche'
import { Compte } from '../Compte'
import { EcranConnexion } from '../connexion'
import { DroitsElement } from '../DroitsElement'
import { Export } from '../Export'
import { Favori } from '../Favori'
import { adressePhoto, apercu, banqueImages, envoyerFichier, fichiers, rapatrier } from '../fichiers'
import { localiser } from '../geocodage'
import { importerEspaceLocal } from '../importLocal'
import { Importer } from '../Importer'
import { creerRecents } from '../recents'
import { PagePublique } from '../PagePublique'
import { Partage } from '../Partage'
import { PlusEntete } from '../PlusEntete'
import { enregistrerServiceWorker } from '../pwa'
import { VerrouTableau } from '../Verrou'
import { t } from '../langue'
import { adressePour } from '../adresse'

/**
 * Les tableaux du compte, pour les citer avec `[[` dans une note : gardés en mémoire, relus au chargement et quand
 * la fenêtre reprend la main (la liste est demandée sans attendre, la note se contente de ce qu'on a).
 */
let tableauxConnus: { id: string; titre: string }[] = []
const relireTableaux = () =>
  fetch('/api/tableaux', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : []))
    .then((t: { id: string; titre: string }[]) => (tableauxConnus = t.map(({ id, titre }) => ({ id, titre }))))
    .catch(() => {})
void relireTableaux()
window.addEventListener('focus', () => void relireTableaux())
/** Ce que les autres viennent de faire sur le tableau ouvert : `Activite` le remplit, la toile le lit. */
const recents = creerRecents()

const services = {
  fichiers,
  apercu,
  rapatrier,
  banqueImages,
  rechercherPartout,
  localiser,
  listerTableaux: () => tableauxConnus,
  recemmentModifies: recents.lire,
  ecouterRecemmentModifies: recents.ecouter,
  adressePhoto,
  ouvrirDansOnglet: (id: string) => window.open(`/t/${encodeURIComponent(id)}`, '_blank'),
}

// Un espace par compte, créé une fois : React peut monter l'application deux fois, pas le réseau.
let ouvert: { id: string; espace: EspaceDistant } | null = null
function espacePour(moi: Moi): EspaceDistant {
  if (ouvert?.id === moi.id) return ouvert.espace
  ouvert?.espace.detruire()
  const cle = `notak:declarations:${moi.id}`
  const espace = creerEspaceDistant({
    racine: moi.racine,
    utilisateur: { id: moi.id, nom: moi.nom, couleur: moi.couleur, ...(moi.photo ? { photo: moi.photo } : {}) },
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
  // Une invitation dans un espace d'équipe (le lien du courriel) s'accepte une fois connecté, puis mène à l'espace.
  useEffect(() => {
    const invitation = new URLSearchParams(location.search).get('invitation')
    if (etat.type !== 'connecte' || !invitation) return
    accepterInvitation(invitation).then(
      (espace) => location.replace(`/espace?espace=${encodeURIComponent(espace)}`),
      (x: Error) => {
        history.replaceState(null, '', location.pathname)
        alert(x.message)
      },
    )
  }, [etat.type])
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
            {t('bandeau.reessayer')}
          </button>
        </div>
      </main>
    )
  }
  if (etat.type === 'anonyme') return <EcranConnexion surConnexion={(m) => setEtat({ type: 'connecte', moi: m })} />
  // Trois pages légères, sans la toile : le partage vers Notak, la note rapide du téléphone, et les jetons pour envoyer d'ailleurs.
  if (location.pathname === '/rapide') return <PageRapide espace={espacePour(etat.moi)} fichiers={fichiers} />
  if (location.pathname === '/partage') return <PagePartage espace={espacePour(etat.moi)} fichiers={fichiers} />
  if (location.pathname === '/envoyer') return <PageEnvoyer />
  if (location.pathname === '/espace') return <PageEspaces />
  return (
    <Espace
      moi={etat.moi}
      changerMoi={(m) => setEtat({ type: 'connecte', moi: m })}
      deconnexion={async () => {
        await seDeconnecter().catch(() => {})
        setEtat({ type: 'anonyme' })
      }}
    />
  )
}

function Espace({ moi, changerMoi, deconnexion }: { moi: Moi; changerMoi(m: Moi): void; deconnexion(): void }) {
  const espace = espacePour(moi)
  const [adresse] = useState(() => adressePour(moi.racine))
  // La section « Compte » des réglages : photo et couleur. Ce qui change se dit aussitôt aux autres, sur les tableaux ouverts.
  const compte = useMemo<ServiceCompte>(
    () => ({
      nom: moi.nom,
      email: moi.email,
      couleur: moi.couleur,
      photo: moi.photo ? adressePhoto(moi.photo) : null,
      changerCouleur: async (couleur) => changerMoi(await reglerCompte({ couleur })),
      changerPhoto: async (fichier) => changerMoi(await reglerCompte({ photo: fichier ? await envoyerFichier(fichier) : null })),
    }),
    [moi, changerMoi],
  )
  useEffect(() => {
    espace.changerUtilisateur({ id: moi.id, nom: moi.nom, couleur: moi.couleur, ...(moi.photo ? { photo: moi.photo } : {}) })
  }, [espace, moi])
  // Les droits d'un élément, réglés par le propriétaire du tableau depuis le menu de la toile.
  const [droitsElement, setDroitsElement] = useState<{ tableau: string; element: string } | null>(null)
  const servicesIci = useMemo(() => ({ ...services, reglerDroitsElementDe: (tableau: string, element: string) => setDroitsElement({ tableau, element }) }), [])
  return (
    <>
      {droitsElement && <DroitsElement {...droitsElement} fermer={() => setDroitsElement(null)} />}
      <EspaceNotak
        compte={compte}
        espace={espace}
        services={servicesIci}
        adresse={adresse}
        actions={(courant, ouvrir) => (
          <>
            <BullesDecouverte espace={espace} tableau={courant} compte={moi.id} />
            <Favori tableau={courant} accueil={moi.racine} />
            <PlusEntete>
              <Activite tableau={courant} moi={moi.id} surNouveaux={recents.noter} />
              <Importer espace={espace} tableau={courant} ouvrir={ouvrir} fichiers={fichiers} />
            </PlusEntete>
            <VerrouTableau tableau={courant} accueil={moi.racine} ouvrir={ouvrir} />
          </>
        )}
        actionsTableau={(courant) => <Export tableau={courant} titre={() => espace.tableau(courant)?.titre ?? ''} />}
        partage={(courant) => <Partage tableau={courant} moi={moi} />}
        actionsCompte={(_courant, ouvrir, aide) => (
          <>
            <Cloche ouvrir={ouvrir} />
            <Compte moi={moi} deconnexion={deconnexion} ouvrir={ouvrir} aide={aide} />
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
      await importerEspaceLocal(espace, fichiers)
      fermer()
    } catch {
      setEtat('echec')
    }
  }
  return (
    <aside className="bandeau" role="status">
      <span>{etat === 'echec' ? t('bandeau.echec') : t('bandeau.attend')}</span>
      <button type="button" className="bouton bouton-plein" disabled={etat === 'cours'} onClick={importer}>
        {etat === 'echec' ? t('bandeau.reessayer') : t('bandeau.importer')}
      </button>
      <button type="button" className="bouton-lien" onClick={fermer}>
        {t('bandeau.nonMerci')}
      </button>
    </aside>
  )
}

/** `/p/<jeton>` : un tableau publié, lu sans compte. */
const publie = /^\/p\/([A-Za-z0-9_-]+)\/?$/.exec(location.pathname)
enregistrerServiceWorker()

createRoot(document.getElementById('racine')!).render(
  <StrictMode>{publie ? <PagePublique jeton={publie[1]!} /> : <Application />}</StrictMode>,
)
