import {
  BullesDecouverte,
  EspaceNotak,
  HoteNotak,
  reglerCapture,
  type ServiceCompte,
  type EspaceDistant,
  type Declaration,
  creerEspaceDistant,
  creerReseauNavigateur,
  type DetailImport,
  EVENEMENT_IMPORT,
  annoncer,
} from '@notak/tableau'
import { type ReactNode, StrictMode, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { type Instance, type Moi, accepterInvitation, lireInstance, moi as lireMoi, noterElementVu, rangerToile, rechercherPartout, reglerCompte, seDeconnecter } from '../api'
import { importDejaPropose, lireAncienEspace, noterImportPropose } from '../ancien'
import { PagePartage, PageRapide } from '../Arrivees'
import { PageEnvoyer } from '../Envoyer'
import { PageEspaces } from '../Espaces'
import { Activite } from '../Activite'
import { Cloche } from '../Cloche'
import { PageBibliotheque } from '../Bibliotheque'
import { Compte } from '../Compte'
import { EcranConnexion } from '../connexion'
import { DroitsElement } from '../DroitsElement'
import { Export } from '../Export'
import { DialogueExport } from '../DialogueExport'
import { Favori } from '../Favori'
import { adressePhoto, apercu, banqueImages, envoyerFichier, fichiers, rapatrier } from '../fichiers'
import { localiser } from '../geocodage'
import { importerEspaceLocal } from '../importLocal'
import { Importer } from '../Importer'
import { devientUneToile, importerFichiers } from '../importation'
import { ecouterImportBureau } from '../importBureau'
import { creerRecents } from '../recents'
import { PagePublique } from '../PagePublique'
import { ApercuInvitation, PageInvitation, jetonInvitation, useInvitation } from '../Invitation'
import { Partage, PartageEnFenetre } from '../Partage'
import { PlusEntete } from '../PlusEntete'
import { enregistrerServiceWorker } from '../pwa'
import { BoutonSignaler, brancherSignaler } from '../signaler/Signaler'
import { VerrouTableau } from '../Verrou'
import { t, tn } from '../langue'
import { adressePour } from '../adresse'
import { allerA, useChemin } from '../chemin'

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
// Les images d'un autre site, dans une capture d'export : le serveur les relaie, le navigateur refuse de les lire.
reglerCapture({ imageDistante: (adresse) => `/api/image-distante?url=${encodeURIComponent(adresse)}` })

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
  // Glissée sur une autre toile, une toile y est rangée sans rien demander, tant que personne n'y gagne l'accès ; sinon
  // ses accès restent ceux d'avant (la bibliothèque, elle, demande).
  toileRangee: (toile: string, dans: string) => void rangerToile(toile, dans, { siPersonne: true }).catch(() => {}),
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

/** L'écran de connexion, quand on arrive par une invitation : elle s'affiche au-dessus, et propose son adresse. */
function ConnexionInvitee({ jeton, instance, surConnexion }: { jeton: string; instance: Instance; surConnexion(m: Moi): void }) {
  const invitation = useInvitation(jeton)
  if (invitation === null) return <div className="ecran-attente" aria-busy />
  return (
    <EcranConnexion
      instance={instance}
      surConnexion={surConnexion}
      entete={<ApercuInvitation invitation={invitation} />}
      {...(typeof invitation === 'string' ? {} : { email: invitation.email })}
    />
  )
}

function Application() {
  const [etat, setEtat] = useState<Etat>({ type: 'chargement' })
  // Une invitation à une toile (`/invitation#<jeton>`), lue une fois : elle attend qu'on se connecte, puis qu'on l'accepte.
  const [invitation] = useState(jetonInvitation)
  // Lue une fois : le nom, les inscriptions et les thèmes ne changent qu'au redémarrage du serveur.
  const [instance, setInstance] = useState<Instance | null>(null)
  useEffect(() => void lireInstance().then(setInstance), [])
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
  // `/` est la bibliothèque, et les toiles sont sous `/t/` : on passe de l'une aux autres sans recharger.
  const chemin = useChemin()
  useEffect(() => {
    if (chemin === '/bibliotheque') allerA('/', { remplacer: true })
  }, [chemin])
  // ⌥⌘O ramène à la bibliothèque, d'où qu'on soit : écouté avant la carte ou le document ouverts, qui gardent leurs touches.
  useEffect(() => {
    if (etat.type !== 'connecte') return
    const touche = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.altKey || e.shiftKey || e.code !== 'KeyO') return
      e.preventDefault()
      e.stopPropagation()
      allerA('/')
    }
    window.addEventListener('keydown', touche, true)
    return () => window.removeEventListener('keydown', touche, true)
  }, [etat.type])

  if (etat.type === 'chargement' || !instance) return <div className="ecran-attente" aria-busy />
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
  if (etat.type === 'anonyme') {
    const surConnexion = (m: Moi) => setEtat({ type: 'connecte', moi: m })
    return invitation ? <ConnexionInvitee jeton={invitation} instance={instance} surConnexion={surConnexion} /> : <EcranConnexion instance={instance} surConnexion={surConnexion} />
  }
  if (invitation) return <PageInvitation jeton={invitation} moi={etat.moi} />
  // Trois pages légères, sans la toile : le partage vers Notak, la note rapide du téléphone, et les jetons pour envoyer d'ailleurs.
  const proprietes = {
    moi: etat.moi,
    instance,
    changerMoi: (m: Moi) => setEtat({ type: 'connecte', moi: m }),
    deconnexion: async () => {
      await seDeconnecter().catch(() => {})
      setEtat({ type: 'anonyme' })
    },
  }
  if (chemin === '/rapide') return <PageLegere {...proprietes}>{() => <PageRapide espace={espacePour(etat.moi)} fichiers={fichiers} />}</PageLegere>
  if (chemin === '/partage') return <PageLegere {...proprietes}>{() => <PagePartage espace={espacePour(etat.moi)} fichiers={fichiers} />}</PageLegere>
  if (chemin === '/envoyer') return <PageLegere {...proprietes}>{() => <PageEnvoyer />}</PageLegere>
  if (chemin === '/espace') return <PageLegere {...proprietes}>{() => <PageEspaces />}</PageLegere>
  return chemin === '/' || chemin === '/bibliotheque' ? <Accueil {...proprietes} /> : <Espace {...proprietes} />
}

type ProprietesEcran = { moi: Moi; instance: Instance; changerMoi(m: Moi): void; deconnexion(): void }

/** Les thèmes que l'instance fournit, impose ou propose. */
const useHabillagesInstance = (instance: Instance) =>
  useMemo(
    () => ({ fournis: instance.habillages, ...(instance.impose ? { impose: instance.impose } : {}), ...(instance.parDefaut ? { parDefaut: instance.parDefaut } : {}) }),
    [instance],
  )

/** La section « Compte » des réglages : photo et couleur. Ce qui change se dit aussitôt aux autres, sur les tableaux ouverts. */
const useCompte = (moi: Moi, changerMoi: (m: Moi) => void) =>
  useMemo<ServiceCompte>(
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

/** La page d'accueil : la bibliothèque, dans le thème et avec les réglages de Notak. */
function Accueil({ moi, instance, changerMoi, deconnexion }: ProprietesEcran) {
  const habillages = useHabillagesInstance(instance)
  const compte = useCompte(moi, changerMoi)
  const espace = espacePour(moi)
  return (
    <HoteNotak compte={compte} habillages={habillages} className="biblio-hote">
      {(fenetres) => (
        <PageBibliotheque
          espace={espace}
          fenetres={fenetres}
          partage={(tableau, fermer) => <PartageEnFenetre tableau={tableau} moi={moi} fermer={fermer} />}
          importer={(f, dans) => importerFichiers(f, dans, espace, services)}
          compte={
            <>
              <BoutonSignaler />
              <Cloche ouvrir={(id) => allerA(`/t/${encodeURIComponent(id)}`)} />
              <Compte moi={moi} deconnexion={deconnexion} aide={fenetres.aide} />
            </>
          }
        />
      )}
    </HoteNotak>
  )
}

/** Une page légère, sans la toile (note rapide, arrivée d'un partage, Envoyer vers Notak, espaces) : dans le thème de Notak. */
function PageLegere({ moi, instance, changerMoi, children }: ProprietesEcran & { children(): ReactNode }) {
  const habillages = useHabillagesInstance(instance)
  const compte = useCompte(moi, changerMoi)
  return (
    <HoteNotak compte={compte} habillages={habillages} className="app-hote">
      {children}
    </HoteNotak>
  )
}

function Espace({ moi, instance, changerMoi, deconnexion }: ProprietesEcran) {
  const habillages = useHabillagesInstance(instance)
  const espace = espacePour(moi)
  const [adresse] = useState(() => {
    // Chaque carte mentale ou document ouvert en grand entre dans les récents de la bibliothèque, qu'on l'ouvre sur la
    // toile ou qu'on arrive par son adresse.
    const a = adressePour(moi.racine, { accueilAPart: true })
    const ouvert = a.lireElement?.()
    if (ouvert) void noterElementVu(a.lire() ?? moi.racine, ouvert)
    return {
      ...a,
      ecrireElement(tableau: string, element: string | null) {
        a.ecrireElement?.(tableau, element)
        if (element) void noterElementVu(tableau, element)
      },
    }
  })
  const compte = useCompte(moi, changerMoi)
  useEffect(() => {
    espace.changerUtilisateur({ id: moi.id, nom: moi.nom, couleur: moi.couleur, ...(moi.photo ? { photo: moi.photo } : {}) })
  }, [espace, moi])
  // Fichier › Importer… dans Notak de bureau : la toile ouverte prend les fichiers au centre de sa vue ; un `.notak` ou un
  // export Milanote y devient une toile, comme par le bouton « Importer ». Sans toile à l'écran (un document ouvert en
  // grand), ils se posent à la suite sur la toile.
  useEffect(
    () =>
      ecouterImportBureau(async (choisis) => {
        const dans = adresse.lire() ?? moi.racine
        const ordinaires = choisis.filter((f) => !devientUneToile(f))
        const evenement = new CustomEvent<DetailImport>(EVENEMENT_IMPORT, { detail: { fichiers: ordinaires }, cancelable: true })
        if (ordinaires.length > 0) window.dispatchEvent(evenement)
        const restants = evenement.defaultPrevented ? choisis.filter(devientUneToile) : choisis
        if (restants.length === 0) return
        const b = await importerFichiers(restants, dans, espace, services)
        const nombre = b.elements.filter((e) => !e.parent).length + b.toiles.length
        const refus = b.refuses.length ? tn('biblio.import.refuses', b.refuses.length, { noms: b.refuses.map((nom) => t('biblio.import.nom', { nom })).join(', ') }) : ''
        const titre = espace.tableau(dans)?.titre || t('commun.sansTitre')
        annoncer({ texte: [nombre ? tn('biblio.import.fait', nombre, { toile: titre }) : '', refus].filter(Boolean).join(' ') || t('biblio.import.rien') })
      }),
    [adresse, espace, moi.racine],
  )
  // Les droits d'un élément, réglés par le propriétaire du tableau depuis le menu de la toile.
  const [droitsElement, setDroitsElement] = useState<{ tableau: string; element: string } | null>(null)
  const servicesIci = useMemo(() => ({ ...services, reglerDroitsElementDe: (tableau: string, element: string) => setDroitsElement({ tableau, element }) }), [])
  return (
    <>
      {droitsElement && <DroitsElement {...droitsElement} fermer={() => setDroitsElement(null)} />}
      <EspaceNotak
        compte={compte}
        habillages={habillages}
        espace={espace}
        services={servicesIci}
        adresse={adresse}
        bibliotheque={() => allerA('/')}
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
            <BoutonSignaler />
            <Cloche ouvrir={ouvrir} />
            <Compte moi={moi} deconnexion={deconnexion} aide={aide} />
          </>
        )}
      />
      <BandeauImport moi={moi} espace={espace} />
      <DialogueExport />
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
// ⇧⌘S, partout : un bug se signale sans quitter ce qu'on fait (`signaler/Signaler.tsx`).
brancherSignaler()

createRoot(document.getElementById('racine')!).render(
  <StrictMode>{publie ? <PagePublique jeton={publie[1]!} /> : <Application />}</StrictMode>,
)
