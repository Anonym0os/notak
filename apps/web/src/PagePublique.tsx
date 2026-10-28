import { type DroitsTableau, Icone, type ServicePresence, type Services, type Tableau, Toile, lireReglages, themeEffectif, useSystemeSombre } from '@notak/tableau'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ErreurApi, type RefusPublic, type TableauPublic, commenterEnVisiteur, deverrouillerPublic, lirePublic } from './api'
import { langue, t, tn } from './langue'
import { EcranAttente, Marque } from './PageApp'
import { magasinVisiteur } from './visiteur'

// `/p/<jeton>` : un tableau ouvert par un lien visiteur, sans compte. Le visiteur le regarde, et, si le lien le
// permet, le commente sous le nom qu'il se donne. Il ne se synchronise jamais : la page relit le tableau toutes les
// vingt secondes, tant qu'elle est visible. Le thème est celui de l'appareil.

type Etat = { type: 'chargement' } | { type: 'erreur' } | { type: RefusPublic } | { type: 'pret'; tableau: TableauPublic; etiquette: string | null }

/** Toutes les combien le visiteur relit le tableau. */
const RELECTURE_MS = 20_000
const CLE_NOM = 'notak:visiteur:nom'

const lireNom = (): string => {
  try {
    return localStorage.getItem(CLE_NOM) ?? ''
  } catch {
    return ''
  }
}
const garderNom = (nom: string) => {
  try {
    localStorage.setItem(CLE_NOM, nom)
  } catch {
    // stockage fermé : le nom vaut pour cette page
  }
}

const enTableau = (p: TableauPublic): Tableau => ({ titre: p.titre, elements: p.elements })
const PERSONNE: ReturnType<ServicePresence['autres']> = []

export function PagePublique({ jeton }: { jeton: string }) {
  const [reglages] = useState(lireReglages)
  const theme = themeEffectif(reglages.theme, useSystemeSombre())
  // L'adresse porte le secret du lien : rien ne la répète à un autre site, ni une image, ni un clic sur un lien.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'referrer'
    meta.content = 'no-referrer'
    document.head.append(meta)
    return () => meta.remove()
  }, [])
  return (
    <div className="notak-espace" data-theme={theme}>
      <Contenu jeton={jeton} />
    </div>
  )
}

function Contenu({ jeton }: { jeton: string }) {
  const [etat, setEtat] = useState<Etat>({ type: 'chargement' })
  const etiquette = useRef<string | null>(null)
  const charger = useCallback(async (): Promise<TableauPublic | null> => {
    try {
      const r = await lirePublic(jeton, etiquette.current ?? undefined)
      if (r === 'inchange') return null
      if (typeof r === 'string') {
        setEtat({ type: r })
        return null
      }
      etiquette.current = r.etiquette
      setEtat({ type: 'pret', tableau: r.tableau, etiquette: r.etiquette })
      return r.tableau
    } catch {
      setEtat((e) => (e.type === 'pret' ? e : { type: 'erreur' }))
      return null
    }
  }, [jeton])
  useEffect(() => void charger(), [charger])

  const titre = etat.type === 'pret' ? etat.tableau.titre : null
  useEffect(() => {
    if (titre === null) return
    const avant = document.title
    document.title = `${titre || t('commun.sansTitre')} · Notak`
    return () => {
      document.title = avant
    }
  }, [titre])

  if (etat.type === 'chargement') return <EcranAttente />
  if (etat.type === 'protege')
    return (
      <MotDePasseRequis
        jeton={jeton}
        surOuverture={() => {
          etiquette.current = null
          void charger()
        }}
      />
    )
  if (etat.type !== 'pret') {
    const message = { absent: t('publique.absent'), expire: t('publique.expire'), erreur: t('publique.erreur') }[etat.type]
    return (
      <main className="connexion">
        <div className="connexion-carte">
          <Marque />
          <h1>Notak</h1>
          <p className="connexion-aide">{message}</p>
        </div>
      </main>
    )
  }
  return <Lecture key={etat.tableau.niveau} jeton={jeton} initial={etat.tableau} relire={charger} />
}

function Lecture({ jeton, initial, relire }: { jeton: string; initial: TableauPublic; relire(): Promise<TableauPublic | null> }) {
  const [nom, setNom] = useState(lireNom)
  const [vue, setVue] = useState(initial)
  const [refus, setRefus] = useState<string | null>(null)
  const commente = vue.niveau === 'commentaire'
  const ecrit = commente && !!nom && !!vue.moi
  const nomActuel = useRef(nom)
  nomActuel.current = nom

  const visiteur = useMemo(
    () =>
      magasinVisiteur(
        enTableau(initial),
        async (changements) => {
          const t = await commenterEnVisiteur(jeton, nomActuel.current, changements)
          setVue(t)
          return enTableau(t)
        },
        (e) => setRefus(e instanceof ErreurApi ? e.message : t('commun.echec')),
        () => void relire(),
      ),
    // Une seule fois par page : la vue suivante passe par `recevoir`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jeton],
  )

  // Relire le tableau tant qu'on le regarde ; une relecture n'interrompt pas un envoi.
  useEffect(() => {
    const suivante = async () => {
      if (document.visibilityState !== 'visible' || visiteur.occupe()) return
      const t = await relire()
      if (t) {
        setVue(t)
        visiteur.recevoir(enTableau(t))
      }
    }
    const minuterie = setInterval(() => void suivante(), RELECTURE_MS)
    // Caché, on porte ce qu'on écrivait (on quitte peut-être la page) ; revenu, on relit.
    const visible = () => (document.visibilityState === 'hidden' ? visiteur.vider() : void suivante())
    const quitter = () => visiteur.vider()
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('pagehide', quitter)
    return () => {
      clearInterval(minuterie)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('pagehide', quitter)
    }
  }, [relire, visiteur])

  const droits = useMemo<DroitsTableau | undefined>(
    () => (ecrit ? { role: 'commentaire', elements: Object.fromEntries((vue.figes ?? []).map((id) => [id, { ecrire: false, commenter: false }])) } : undefined),
    [ecrit, vue.figes],
  )
  // Un visiteur ne voit personne et n'est vu de personne : il ne sert qu'à signer ses messages. La toile lit ces
  // valeurs comme un magasin : elles restent les mêmes tant que rien ne change.
  const presence = useMemo<ServicePresence | undefined>(() => {
    if (!ecrit) return undefined
    const soi = { id: vue.moi!.id, nom, couleur: vue.moi!.couleur }
    return { signaler() {}, autres: () => PERSONNE, moi: () => soi, ecouter: () => () => {} }
  }, [ecrit, vue.moi?.id, vue.moi?.couleur, nom])
  const services = useMemo<Services>(
    () => ({
      lectureSeule: true,
      ...(droits && vue.moi ? { droits, auteurId: vue.moi.id } : {}),
      ...(presence ? { presence } : {}),
      fichiers: {
        enregistrer: () => Promise.reject(new Error(t('publique.lectureSeule'))),
        adresse: async (id) => `/api/public/${encodeURIComponent(jeton)}/fichiers/${encodeURIComponent(id)}`,
      },
      tableau: (id) => (vue.titres[id] === undefined ? undefined : { titre: vue.titres[id], elements: [] }),
    }),
    [jeton, vue.titres, vue.moi, droits, presence],
  )

  return (
    <div className="public">
      <header className="public-entete">
        {/* « Lecture seule » : la toile le dit déjà, dans son coin. */}
        <strong className="notak-ilot public-titre">{vue.titre || t('commun.sansTitre')}</strong>
        <Visiteur
          niveau={vue.niveau}
          expire={vue.expire}
          nom={nom}
          changerNom={(n) => {
            garderNom(n)
            setNom(n)
          }}
        />
        <a className="notak-ilot public-ouvrir" href="/">
          Notak
        </a>
      </header>
      {refus && (
        <p className="notak-ilot public-refus" role="alert">
          {refus}
          <button type="button" className="app-icone-bouton" aria-label={t('commun.fermer')} onClick={() => setRefus(null)}>
            <Icone nom="fermer" taille={14} />
          </button>
        </p>
      )}
      <div className="public-corps">
        <Toile magasin={visiteur.magasin} services={services} />
      </div>
      {/* Une bande à part, sous la toile : la mention ne recouvre jamais une carte. */}
      <footer className="public-pied">
        <a href="https://notak.app" target="_blank" rel="noopener noreferrer">
          {t('publique.faitAvec')}
        </a>
      </footer>
    </div>
  )
}

/** « jusqu'au 12 nov. », « encore 3 jours ». */
function finLisible(expire: number): string {
  const jours = Math.round((expire - Date.now()) / (24 * 3600_000))
  if (jours < 1) return t('publique.finAujourdhui')
  if (jours < 14) return tn('publique.finDans', jours)
  return t('publique.finLe', { date: new Intl.DateTimeFormat(langue(), { day: 'numeric', month: 'long' }).format(new Date(expire)) })
}

/**
 * Ce que le visiteur peut faire ici, dit sans détour : il regarde, ou il commente sous le nom qu'il se donne. Le nom
 * se demande avant le premier commentaire, et se change ensuite.
 */
function Visiteur({ niveau, expire, nom, changerNom }: { niveau: TableauPublic['niveau']; expire: number | null; nom: string; changerNom(n: string): void }) {
  const [saisie, setSaisie] = useState(nom)
  const [edition, setEdition] = useState(niveau === 'commentaire' && !nom)
  const valider = (e: FormEvent) => {
    e.preventDefault()
    const propre = saisie.replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!propre) return
    changerNom(propre)
    setEdition(false)
  }
  const fin = expire ? <span className="public-visiteur-fin">{finLisible(expire)}</span> : null
  if (niveau === 'lecture') {
    return (
      <span className="notak-ilot public-visiteur">
        <Icone nom="oeil" taille={15} />
        <span>{t('publique.visiteurVoit')}</span>
        {fin}
      </span>
    )
  }
  if (edition) {
    return (
      <form className="notak-ilot public-visiteur public-visiteur-nom" onSubmit={valider}>
        <Icone nom="commentaire" taille={15} />
        <label>
          <span>{t('publique.votreNom')}</span>
          <input value={saisie} maxLength={60} placeholder={t('publique.votreNomExemple')} onChange={(e) => setSaisie(e.target.value)} autoFocus />
        </label>
        <button type="submit" className="bouton bouton-plein" disabled={!saisie.trim()}>
          {t('publique.commencer')}
        </button>
      </form>
    )
  }
  return (
    <span className="notak-ilot public-visiteur" title={t('publique.commentAide')}>
      <Icone nom="commentaire" taille={15} />
      <span>{t('publique.visiteurCommente', { nom })}</span>
      <button type="button" className="bouton-lien" onClick={() => setEdition(true)}>
        {t('publique.changerNom')}
      </button>
      <span className="public-visiteur-aide">{t('publique.commentAide')}</span>
      {fin}
    </span>
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
