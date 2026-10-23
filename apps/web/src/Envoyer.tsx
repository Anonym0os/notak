import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { type JetonArrivee, creerJeton, listerJetons, revoquerJeton } from './api'
import { JETON_A_REMPLACER, adresseArrivee, enteteAutorisation, etapesRaccourciImage, etapesRaccourciTexte, favori } from './raccourcis'

const quand = (instant: number) => new Date(instant).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

/** Les segments entre accents graves se lisent en police de code. */
function Ligne({ texte }: { texte: string }) {
  return (
    <>
      {texte.split('`').map((morceau, i) => (i % 2 === 1 ? <code key={i}>{morceau}</code> : morceau))}
    </>
  )
}

function Etapes({ etapes }: { etapes: string[] }) {
  return (
    <ol className="envoyer-etapes">
      {etapes.map((e, i) => (
        <li key={i}>
          <Ligne texte={e} />
        </li>
      ))}
    </ol>
  )
}

/** Un bouton qui copie `valeur` dans le presse-papiers et le dit un instant. */
function Copier({ valeur, libelle = 'Copier' }: { valeur: string; libelle?: string }) {
  const [etat, setEtat] = useState<'repos' | 'copie' | 'echec'>('repos')
  return (
    <button
      type="button"
      className="bouton"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(valeur)
          setEtat('copie')
        } catch {
          setEtat('echec')
        }
        setTimeout(() => setEtat('repos'), 2000)
      }}
    >
      {etat === 'copie' ? 'Copié' : etat === 'echec' ? 'Copie impossible' : libelle}
    </button>
  )
}

/**
 * Le lien du favori. React refuse un `href` en `javascript:` : on le pose à la main, une fois monté, pour que le
 * navigateur le prenne comme un favori qu'on glisse dans sa barre.
 */
function LienFavori({ code }: { code: string }) {
  const lien = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    lien.current?.setAttribute('href', code)
  }, [code])
  return (
    <a ref={lien} className="bouton bouton-plein envoyer-favori" onClick={(e) => e.preventDefault()} draggable>
      Envoyer vers Notak
    </a>
  )
}

/**
 * La page `/envoyer` : des jetons personnels pour poser des choses dans les non triés depuis un endroit où Notak ne
 * reçoit pas les partages (un iPhone, un autre navigateur), et de quoi s'en servir : un Raccourci iOS et un favori.
 */
export function PageEnvoyer() {
  const [jetons, setJetons] = useState<JetonArrivee[] | null>(null)
  const [nom, setNom] = useState('iPhone')
  // Le jeton qu'on vient de créer : le serveur ne le redonne plus, la page le garde tant qu'elle reste ouverte.
  const [neuf, setNeuf] = useState<{ nom: string; jeton: string } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  const charger = useCallback(() => {
    listerJetons().then(setJetons, (x: Error) => setErreur(x.message))
  }, [])
  useEffect(charger, [charger])

  const agir = async (f: () => Promise<void>) => {
    setErreur(null)
    setOccupe(true)
    try {
      await f()
      charger()
    } catch (x) {
      setErreur(x instanceof Error ? x.message : 'Échec')
    } finally {
      setOccupe(false)
    }
  }

  const creer = (e: FormEvent) => {
    e.preventDefault()
    const propre = nom.trim()
    if (!propre) return setErreur('Donnez un nom à ce jeton')
    void agir(async () => {
      const j = await creerJeton(propre)
      setNeuf({ nom: j.nom, jeton: j.jeton })
    })
  }

  const jeton = neuf?.jeton ?? JETON_A_REMPLACER
  const origine = location.origin

  return (
    <main className="envoyer">
      <div className="arrivee-carte envoyer-carte">
        <h1>Envoyer vers Notak</h1>
        <p>
          Safari sur iPhone ne laisse pas une application web recevoir un partage. Un jeton personnel permet de le faire à sa place : un Raccourci de
          l’iPhone, ou un favori sur le bureau, envoie une page, un texte ou une image dans les non triés de votre accueil.
        </p>
        <a className="bouton-lien" href="/">
          Retour à Notak
        </a>
      </div>

      <section className="arrivee-carte envoyer-carte" aria-labelledby="envoyer-jetons">
        <h2 id="envoyer-jetons">1. Un jeton</h2>
        <p>
          Un jeton par appareil. Il n’ouvre que cette porte : poser des éléments dans vos non triés. Il ne lit rien et ne donne pas accès à votre compte, et on le
          révoque d’un geste.
        </p>
        <form className="envoyer-form" onSubmit={creer} noValidate>
          <input aria-label="Nom du jeton" placeholder="iPhone de Samy" maxLength={60} value={nom} onChange={(e) => setNom(e.target.value)} />
          <button type="submit" className="bouton bouton-plein" disabled={occupe}>
            Créer un jeton
          </button>
        </form>
        {neuf && (
          <div className="envoyer-neuf" role="status">
            <strong>Jeton « {neuf.nom} »</strong>
            <code className="envoyer-jeton">{neuf.jeton}</code>
            <p>Copiez-le maintenant : il ne sera plus affiché. Les étapes ci-dessous l’ont déjà repris tant que cette page reste ouverte.</p>
            <Copier valeur={neuf.jeton} libelle="Copier le jeton" />
          </div>
        )}
        {jetons && jetons.length > 0 && (
          <ul className="envoyer-liste">
            {jetons.map((j) => (
              <li key={j.id}>
                <span className="envoyer-qui">
                  <strong>{j.nom}</strong>
                  <small>
                    Créé le {quand(j.cree)} · {j.dernierUsage ? `servi le ${quand(j.dernierUsage)}` : 'jamais servi'}
                  </small>
                </span>
                <button
                  type="button"
                  className="bouton-lien"
                  disabled={occupe}
                  onClick={() =>
                    agir(async () => {
                      await revoquerJeton(j.id)
                      setNeuf((n) => (n && n.nom === j.nom ? null : n))
                    })
                  }
                >
                  Révoquer
                </button>
              </li>
            ))}
          </ul>
        )}
        {erreur && (
          <p className="connexion-erreur" role="alert">
            {erreur}
          </p>
        )}
      </section>

      <section className="arrivee-carte envoyer-carte" aria-labelledby="envoyer-iphone">
        <h2 id="envoyer-iphone">2. Un Raccourci sur l’iPhone</h2>
        {!neuf && (
          <p className="envoyer-note">
            Créez un jeton plus haut pour que les étapes le reprennent. Sinon, remplacez <code>{JETON_A_REMPLACER}</code> par le vôtre.
          </p>
        )}
        <h3>Pour une page, un lien ou un texte</h3>
        <Etapes etapes={etapesRaccourciTexte(origine, jeton)} />
        <h3>Pour une photo ou une image</h3>
        <Etapes etapes={etapesRaccourciImage(origine, jeton)} />
        <p className="envoyer-note">
          L’adresse d’envoi est <code>{adresseArrivee(origine)}</code> et l’en-tête <code>Authorization</code> vaut <code>{enteteAutorisation(jeton)}</code>.
        </p>
      </section>

      <section className="arrivee-carte envoyer-carte" aria-labelledby="envoyer-bureau">
        <h2 id="envoyer-bureau">3. Un favori sur le bureau</h2>
        {neuf ? (
          <>
            <p>
              Glissez ce bouton dans votre barre de favoris. Sur une page, un clic l’envoie vers vos non triés, avec le texte que vous avez sélectionné s’il y en a. Ce
              favori contient votre jeton : ne le partagez pas.
            </p>
            <div className="envoyer-form">
              <LienFavori code={favori(origine, neuf.jeton)} />
              <Copier valeur={favori(origine, neuf.jeton)} libelle="Copier le code" />
            </div>
            <p className="envoyer-note">
              Pas de barre de favoris ? Créez un favori à la main et collez le code copié à la place de son adresse. Si une page refuse l’envoi, le favori ouvre à la place
              la page de partage de Notak, qui passe par votre session.
            </p>
          </>
        ) : (
          <p>Créez un jeton plus haut : le favori en porte un, et on ne peut le fabriquer que le temps où le jeton est affiché.</p>
        )}
      </section>
    </main>
  )
}
