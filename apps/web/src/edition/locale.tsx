import { BullesDecouverte, type CouleurNote, EspaceNotak, type Id, ErreurNotak, type Services, TYPE_NOTAK } from '@notak/tableau'
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { adressePour } from '../adresse'
import { importDejaPropose, lireAncienEspace, noterImportPropose } from '../ancien'
import { PagePartage, PageRapide } from '../Arrivees'
import { Export, type ExportLocal } from '../Export'
import { localiser } from '../geocodage'
import { importerEspaceLocal } from '../importLocal'
import { Importer } from '../Importer'
import { PlusEntete } from '../PlusEntete'
import { enregistrerServiceWorker } from '../pwa'
import { t, tn } from '../langue'
import { fabriquerCopie, rouvrirCopie } from '../local/copie'
import { choisirCopie, estCopie, nomDeCopie, rangerCopie } from '../local/enregistrement'
import { type EspaceLocal, espaceLocal, exportLocal, rechercherLocalement } from '../local/espace'
import { fichiersLocaux } from '../local/fichiers'
import { Rangement } from '../local/Rangement'
import { initialiserSynchro } from '../local/synchro'

/**
 * L'édition locale, celle de notak.app : pas de compte, pas de serveur. Les tableaux vivent dans ce navigateur
 * (IndexedDB), et l'on en garde des copies dans des fichiers `.notak`, où l'on veut. Pour le travail à plusieurs en
 * temps réel, il y a l'édition serveur, à installer chez soi.
 */

function Application() {
  const [el, setEl] = useState<EspaceLocal | null>(null)
  const [echec, setEchec] = useState(false)
  useEffect(() => {
    espaceLocal().then((e) => {
      setEl(e)
      void initialiserSynchro(e)
    }, () => setEchec(true))
  }, [])
  if (echec) {
    return (
      <main className="connexion">
        <div className="connexion-carte">
          <h1>Notak</h1>
          <p className="connexion-erreur">{t('local.indisponible')}</p>
        </div>
      </main>
    )
  }
  if (!el) return <div className="ecran-attente" aria-busy />
  // Le partage vers Notak et la note rapide du téléphone, sans la toile.
  if (location.pathname === '/rapide') return <PageRapide espace={el.espace} fichiers={fichiersLocaux} />
  if (location.pathname === '/partage') return <PagePartage espace={el.espace} fichiers={fichiersLocaux} />
  return <Espace el={el} />
}

function Espace({ el }: { el: EspaceLocal }) {
  const { espace, index } = el
  const [adresse] = useState(() => adressePour(index.racine()))
  const [message, setMessage] = useState<string | null>(null)
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined)
  const dire = useCallback((texte: string) => {
    setMessage(texte)
    clearTimeout(minuteur.current)
    minuteur.current = setTimeout(() => setMessage(null), 4000)
  }, [])
  /** Le tableau ouvert, pour y ranger ce qu'on rouvre. */
  const courant = useRef<Id>(index.racine())
  const ouvrirTableau = useRef<(id: Id) => void>(() => {})

  const services = useMemo<Services>(
    () => ({
      fichiers: fichiersLocaux,
      localiser,
      rechercherPartout: (requete) => rechercherLocalement(el, requete),
      listerTableaux: () => index.lister().map((e) => ({ id: e.id, titre: e.titre, ...(e.couleur ? { couleur: e.couleur as CouleurNote } : {}) })),
      ouvrirDansOnglet: (id: string) => window.open(`/t/${encodeURIComponent(id)}`, '_blank'),
    }),
    [el, index],
  )
  const exporter = useMemo<ExportLocal>(
    () => ({
      ...exportLocal(el),
      notak: async (tableau, options) => new Blob([(await fabriquerCopie(el, tableau, options)) as Uint8Array<ArrayBuffer>], { type: TYPE_NOTAK }),
    }),
    [el],
  )

  const enregistrer = useCallback(
    async (nouveau = false) => {
      try {
        dire(t('local.copieEnCours'))
        const octets = await fabriquerCopie(el)
        const r = await rangerCopie(octets, nomDeCopie(index.entree(index.racine())?.titre || 'Notak'), nouveau)
        if (r.ou === 'annule') return setMessage(null)
        index.noterCopie(Date.now())
        // Le navigateur garde mieux ce qu'on lui demande de garder.
        void navigator.storage?.persist?.()
        dire(r.ou === 'fichier' ? t('local.copieDans', { nom: r.nom }) : r.ou === 'partage' ? t('local.copiePartagee') : t('local.copieTelechargee'))
      } catch {
        dire(t('local.copieImpossible'))
      }
    },
    [el, index, dire],
  )

  const rouvrirFichier = useCallback(
    async (f: File) => {
      try {
        const r = await rouvrirCopie(el, new Uint8Array(await f.arrayBuffer()), courant.current)
        // La copie est devenue l'accueil : on repart d'elle.
        if (r.accueil) {
          // Le temps qu'IndexedDB ait tout écrit, puis l'on repart de l'accueil neuf.
          await new Promise((fin) => setTimeout(fin, 300))
          return location.assign('/')
        }
        dire(r.fusion ? tn('local.rouvertFusion', r.tableaux) : tn('local.rouvert', r.tableaux))
        if (!r.fusion) ouvrirTableau.current(r.tete)
      } catch (e) {
        dire(e instanceof ErreurNotak ? t('local.pasUneCopie') : t('local.rouvrirImpossible'))
      }
    },
    [el, dire],
  )
  const rouvrir = useCallback(async () => {
    const f = await choisirCopie().catch(() => null)
    if (f) await rouvrirFichier(f)
  }, [rouvrirFichier])

  // Un fichier .notak déposé sur la fenêtre se rouvre, au lieu de devenir une carte « fichier ».
  useEffect(() => {
    const deposer = (e: DragEvent) => {
      const f = [...(e.dataTransfer?.files ?? [])].find(estCopie)
      if (!f) return
      e.preventDefault()
      e.stopPropagation()
      void rouvrirFichier(f)
    }
    window.addEventListener('drop', deposer, true)
    return () => window.removeEventListener('drop', deposer, true)
  }, [rouvrirFichier])

  // L'application installée ouvre les fichiers .notak (manifeste, `file_handlers`).
  useEffect(() => {
    const file = (window as unknown as { launchQueue?: { setConsumer(f: (p: { files: { getFile(): Promise<File> }[] }) => void): void } }).launchQueue
    file?.setConsumer(async (p) => {
      for (const h of p.files) await rouvrirFichier(await h.getFile())
    })
  }, [rouvrirFichier])

  // Cmd+Maj+S range la copie ailleurs ; Cmd+O rouvre.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      if (e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void enregistrer(true)
      } else if (!e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void rouvrir()
      }
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [enregistrer, rouvrir])

  return (
    <>
      <EspaceNotak
        espace={espace}
        services={services}
        adresse={adresse}
        enregistrer={() => void enregistrer()}
        actions={(ici, ouvrir, _aide) => {
          courant.current = ici
          ouvrirTableau.current = ouvrir
          return (
            <>
              <BullesDecouverte espace={espace} tableau={ici} compte="local" />
              <PlusEntete>
                <Importer espace={espace} tableau={ici} ouvrir={ouvrir} fichiers={fichiersLocaux} rouvrirNotak={rouvrirFichier} />
                <Export tableau={ici} titre={() => espace.tableau(ici)?.titre ?? ''} local={exporter} />
              </PlusEntete>
              <Rangement el={el} enregistrer={() => void enregistrer()} rouvrir={() => void rouvrir()} message={message} />
            </>
          )
        }}
      />
      <Accueil el={el} />
    </>
  )
}

const CLE_ACCUEILLI = 'notak:local:accueilli'
/** Une fois, à la première visite : la vérité en une ligne, sans rien bloquer. */
function Accueil({ el }: { el: EspaceLocal }) {
  const [vu, setVu] = useState(() => {
    try {
      return localStorage.getItem(CLE_ACCUEILLI) === '1'
    } catch {
      return true
    }
  })
  // Ensuite seulement, s'il y a lieu : l'espace d'avant les comptes resté dans ce navigateur.
  if (vu) return <BandeauAncien el={el} />
  const fermer = () => {
    try {
      localStorage.setItem(CLE_ACCUEILLI, '1')
    } catch {
      // Sans stockage, on le redira à la prochaine visite.
    }
    setVu(true)
  }
  return (
    <aside className="bandeau" role="status">
      <span>{t('local.accueil')}</span>
      <button type="button" className="bouton bouton-plein" onClick={fermer}>
        {t('local.compris')}
      </button>
    </aside>
  )
}

/** Une seule fois, si un espace d'avant les comptes traîne dans ce navigateur et que l'accueil est vide. */
function BandeauAncien({ el }: { el: EspaceLocal }) {
  const [clos, setClos] = useState(() => importDejaPropose('local') || lireAncienEspace() === null)
  const [etat, setEtat] = useState<'attente' | 'cours' | 'echec'>('attente')
  const { espace } = el
  const racine = espace.racine
  const vide = useSyncExternalStore(espace.ecouter, () => espace.synchronise(racine) && espace.magasin(racine).lire().elements.length === 0)
  if (clos || !vide) return null
  const fermer = () => {
    noterImportPropose('local')
    setClos(true)
  }
  return (
    <aside className="bandeau" role="status">
      <span>{etat === 'echec' ? t('bandeau.echec') : t('bandeau.attend')}</span>
      <button
        type="button"
        className="bouton bouton-plein"
        disabled={etat === 'cours'}
        onClick={async () => {
          setEtat('cours')
          try {
            await importerEspaceLocal(espace, fichiersLocaux)
            fermer()
          } catch {
            setEtat('echec')
          }
        }}
      >
        {etat === 'echec' ? t('bandeau.reessayer') : t('bandeau.importer')}
      </button>
      <button type="button" className="bouton-lien" onClick={fermer}>
        {t('bandeau.nonMerci')}
      </button>
    </aside>
  )
}

enregistrerServiceWorker()
createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <Application />
  </StrictMode>,
)
