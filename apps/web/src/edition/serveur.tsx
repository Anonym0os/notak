import {
  BullesDecouverte,
  EspaceNotak,
  HoteNotak,
  reglerCapture,
  type ServiceCompte,
  type Services,
  type EspaceDistant,
  type Declaration,
  creerEspaceDistant,
  creerReseauNavigateur,
} from '@notak/tableau'
import { type ReactNode, StrictMode, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import {
  type Instance,
  type Moi,
  accepterInvitation,
  ecouterSessionFinie,
  lireInstance,
  listerTableaux,
  moi as lireMoi,
  noterElementVu,
  rechercherPartout,
  reglerCompte,
  seDeconnecter,
  sessionEncoreValide,
} from '../api'
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
import { creerRecents } from '../recents'
import { PagePublique } from '../PagePublique'
import { Partage } from '../Partage'
import { PlusEntete } from '../PlusEntete'
import { estPageServeur } from '../bureau'
import { lancerMisesAJour } from '../MiseAJour'
import { enregistrerServiceWorker, signalerNouvelleVersion } from '../pwa'
import { PageAutoriser } from '../serveur/Autoriser'
import { BandeauxServeur } from '../serveur/Bandeaux'
import { FichiersOuverts } from '../serveur/FichiersOuverts'
import { LigneServeur } from '../serveur/LigneServeur'
import { servicesDeLaFenetre } from '../serveur/ouvrirAilleurs'
import { type SurveillanceVersion, surveillerVersionDuServeur } from '../serveur/versionServeur'
import { BoutonSignaler, brancherSignaler } from '../signaler/Signaler'
import { VerrouTableau } from '../Verrou'
import { t } from '../langue'
import { adressePour } from '../adresse'
import { allerA, useChemin } from '../chemin'

/**
 * Les tableaux du compte, pour les citer avec `[[` dans une note : gardés en mémoire, relus au chargement et quand
 * la fenêtre reprend la main (la liste est demandée sans attendre, la note se contente de ce qu'on a).
 */
let tableauxConnus: { id: string; titre: string }[] = []
// Par l'API : refaite à chaque retour sur la fenêtre, une lecture qui répond « non connecté » dit aussi que la session a fini.
const relireTableaux = () =>
  listerTableaux()
    .then((t) => (tableauxConnus = t.map(({ id, titre }) => ({ id, titre }))))
    .catch(() => {})
void relireTableaux()
window.addEventListener('focus', () => void relireTableaux())
/** Ce que les autres viennent de faire sur le tableau ouvert : `Activite` le remplit, la toile le lit. */
const recents = creerRecents()
// Les images d'un autre site, dans une capture d'export : le serveur les relaie, le navigateur refuse de les lire.
reglerCapture({ imageDistante: (adresse) => `/api/image-distante?url=${encodeURIComponent(adresse)}` })

const services: Services = {
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
  // Un onglet dans un navigateur ; dans l'app de bureau, qui n'a qu'une fenêtre, un fichier qui s'ouvre dans l'application du système.
  ...servicesDeLaFenetre(),
}

/** Ce que la page sait de la version du serveur : la synchronisation qui se rétablit l'invite à la relire (`serveur/versionServeur.ts`). */
let surveillance: SurveillanceVersion | null = null

// Un espace par compte, créé une fois : React peut monter l'application deux fois, pas le réseau.
let ouvert: { id: string; espace: EspaceDistant } | null = null
function espacePour(moi: Moi): EspaceDistant {
  if (ouvert?.id === moi.id) return ouvert.espace
  ouvert?.espace.detruire()
  const cle = `notak:declarations:${moi.id}`
  const espace = creerEspaceDistant({
    racine: moi.racine,
    utilisateur: { id: moi.id, nom: moi.nom, couleur: moi.couleur, ...(moi.photo ? { photo: moi.photo } : {}) },
    reseau: creerReseauNavigateur(moi.id, {
      // Un tableau refusé : un accès retiré, ou une session finie. `/api/moi` le dit, et la page revient à la connexion s'il le faut.
      surRefus: () => void sessionEncoreValide(),
      surConnexion: () => surveillance?.verifier(),
    }),
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

type Etat =
  | { type: 'chargement' }
  /** `sessionFinie` : on était connecté, et le serveur ne reconnaît plus la session. */
  | { type: 'anonyme'; sessionFinie?: boolean }
  | { type: 'erreur'; message: string }
  | { type: 'connecte'; moi: Moi }

function Application() {
  const [etat, setEtat] = useState<Etat>({ type: 'chargement' })
  // Lue une fois : le nom, les inscriptions et les thèmes ne changent qu'au redémarrage du serveur.
  const [instance, setInstance] = useState<Instance | null>(null)
  useEffect(() => void lireInstance().then(setInstance), [])
  // Dans l'app de bureau, un serveur mis à jour sous la fenêtre ouverte : la page le voit à sa version (pas de service worker ici).
  useEffect(() => {
    if (!instance || !estPageServeur()) return
    const s = surveillerVersionDuServeur({ depart: instance.version ?? null, signaler: signalerNouvelleVersion })
    surveillance = s
    return () => {
      s.arreter()
      if (surveillance === s) surveillance = null
    }
  }, [instance])
  // Une session qui prend fin : retour à la connexion, avec un mot. Ce qu'on a écrit sans réseau reste dans l'appareil (IndexedDB,
  // par compte) : l'espace se ferme sans rien effacer, et la même personne le retrouve en se reconnectant.
  useEffect(
    () =>
      ecouterSessionFinie(() => {
        // Un 401 isolé (une réponse en retard) ne suffit pas : `/api/moi` tranche. Sans réponse, on garde ce qu'on croyait.
        void lireMoi().then(
          (m) => {
            if (!m) setEtat((e) => (e.type === 'connecte' ? { type: 'anonyme', sessionFinie: true } : e))
          },
          () => {},
        )
      }),
    [],
  )
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
          {/* Un serveur qui ne répond pas : dans l'app de bureau, la sortie reste là. */}
          {estPageServeur() && <LigneServeur />}
        </div>
      </main>
    )
  }
  if (etat.type === 'anonyme') {
    // Ce que la personne doit savoir en arrivant ici : sa session a fini, ou elle vient confirmer la connexion de l'app de bureau.
    const notice = etat.sessionFinie
      ? { texte: t('serveur.session.finie'), urgent: true }
      : chemin === '/bureau/autoriser'
        ? { texte: t('serveur.autoriser.connexion') }
        : undefined
    return <EcranConnexion instance={instance} surConnexion={(m) => setEtat({ type: 'connecte', moi: m })} {...(notice ? { notice } : {})} />
  }
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
  const page = (() => {
    if (chemin === '/rapide') return <PageLegere {...proprietes}>{() => <PageRapide espace={espacePour(etat.moi)} fichiers={fichiers} />}</PageLegere>
    if (chemin === '/partage') return <PageLegere {...proprietes}>{() => <PagePartage espace={espacePour(etat.moi)} fichiers={fichiers} />}</PageLegere>
    if (chemin === '/envoyer') return <PageLegere {...proprietes}>{() => <PageEnvoyer />}</PageLegere>
    if (chemin === '/espace') return <PageLegere {...proprietes}>{() => <PageEspaces />}</PageLegere>
    // Où l'on confirme la connexion de l'app de bureau (le lien que le navigateur ouvre).
    if (chemin === '/bureau/autoriser') return <PageLegere {...proprietes}>{() => <PageAutoriser moi={etat.moi} />}</PageLegere>
    return chemin === '/' || chemin === '/bibliotheque' ? <Accueil {...proprietes} /> : <Espace {...proprietes} />
  })()
  return (
    <>
      {page}
      {/* Au-dessus des pages : l'état d'une copie remise à plus tard ne se perd pas quand on change de page. */}
      <FichiersOuverts espace={espacePour(etat.moi)} racine={etat.moi.racine} fichiers={fichiers} ouvrir={(id) => allerA(`/t/${encodeURIComponent(id)}`)} />
    </>
  )
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
    <>
      <HoteNotak compte={compte} habillages={habillages} className="biblio-hote">
        {(fenetres) => (
          <PageBibliotheque
            espace={espace}
            fenetres={fenetres}
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
      <BandeauxServeur moi={moi} />
    </>
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
      <BandeauxServeur moi={moi} />
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
// Dans l'app de bureau : la recherche des mises à jour signées (`MiseAJour.tsx`).
if (estPageServeur()) lancerMisesAJour()
// ⇧⌘S, partout : un bug se signale sans quitter ce qu'on fait (`signaler/Signaler.tsx`).
brancherSignaler()

createRoot(document.getElementById('racine')!).render(
  <StrictMode>{publie ? <PagePublique jeton={publie[1]!} /> : <Application />}</StrictMode>,
)
