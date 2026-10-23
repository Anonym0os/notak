import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { t, langue } from './langue'
import { type JetonArrivee, creerJeton, listerJetons, revoquerJeton } from './api'
import { jetonARemplacer, adresseArrivee, enteteAutorisation, etapesRaccourciImage, etapesRaccourciTexte, favori } from './raccourcis'

const quand = (instant: number) => new Date(instant).toLocaleString(langue() === 'en' ? 'en-US' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

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
function Copier({ valeur, libelle }: { valeur: string; libelle?: string }) {
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
      {etat === 'copie' ? t('envoyer.copie') : etat === 'echec' ? t('envoyer.copieImpossible') : (libelle ?? t('commun.copier'))}
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
      {t('compte.envoyer')}
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
      setErreur(x instanceof Error ? x.message : t('commun.echec'))
    } finally {
      setOccupe(false)
    }
  }

  const creer = (e: FormEvent) => {
    e.preventDefault()
    const propre = nom.trim()
    if (!propre) return setErreur(t('envoyer.nomRequis'))
    void agir(async () => {
      const j = await creerJeton(propre)
      setNeuf({ nom: j.nom, jeton: j.jeton })
    })
  }

  const jeton = neuf?.jeton ?? jetonARemplacer()
  const origine = location.origin

  return (
    <main className="envoyer">
      <div className="arrivee-carte envoyer-carte">
        <h1>{t('compte.envoyer')}</h1>
        <p>{t('envoyer.intro')}</p>
        <a className="bouton-lien" href="/">
          {t('envoyer.retour')}
        </a>
      </div>

      <section className="arrivee-carte envoyer-carte" aria-labelledby="envoyer-jetons">
        <h2 id="envoyer-jetons">{t('envoyer.jeton')}</h2>
        <p>{t('envoyer.jetonExplique')}</p>
        <form className="envoyer-form" onSubmit={creer} noValidate>
          <input aria-label={t('envoyer.nomJeton')} placeholder={t('envoyer.nomExemple')} maxLength={60} value={nom} onChange={(e) => setNom(e.target.value)} />
          <button type="submit" className="bouton bouton-plein" disabled={occupe}>
            {t('envoyer.creer')}
          </button>
        </form>
        {neuf && (
          <div className="envoyer-neuf" role="status">
            <strong>{t('envoyer.jetonNom', { nom: neuf.nom })}</strong>
            <code className="envoyer-jeton">{neuf.jeton}</code>
            <p>{t('envoyer.copiezLe')}</p>
            <Copier valeur={neuf.jeton} libelle={t('envoyer.copierJeton')} />
          </div>
        )}
        {jetons && jetons.length > 0 && (
          <ul className="envoyer-liste">
            {jetons.map((j) => (
              <li key={j.id}>
                <span className="envoyer-qui">
                  <strong>{j.nom}</strong>
                  <small>
                    {t('envoyer.cree', { date: quand(j.cree) })} · {j.dernierUsage ? t('envoyer.servi', { date: quand(j.dernierUsage) }) : t('envoyer.jamaisServi')}
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
                  {t('envoyer.revoquer')}
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
        <h2 id="envoyer-iphone">{t('envoyer.iphone')}</h2>
        {!neuf && (
          <p className="envoyer-note">
            <Ligne texte={t('envoyer.sansJeton', { jeton: jetonARemplacer() })} />
          </p>
        )}
        <h3>{t('envoyer.pourTexte')}</h3>
        <Etapes etapes={etapesRaccourciTexte(origine, jeton)} />
        <h3>{t('envoyer.pourImage')}</h3>
        <Etapes etapes={etapesRaccourciImage(origine, jeton)} />
        <p className="envoyer-note">
          <Ligne texte={t('envoyer.adresse', { adresse: adresseArrivee(origine), entete: enteteAutorisation(jeton) })} />
        </p>
      </section>

      <section className="arrivee-carte envoyer-carte" aria-labelledby="envoyer-bureau">
        <h2 id="envoyer-bureau">{t('envoyer.bureau')}</h2>
        {neuf ? (
          <>
            <p>{t('envoyer.glisser')}</p>
            <div className="envoyer-form">
              <LienFavori code={favori(origine, neuf.jeton)} />
              <Copier valeur={favori(origine, neuf.jeton)} libelle={t('envoyer.copierCode')} />
            </div>
            <p className="envoyer-note">{t('envoyer.pasDeBarre')}</p>
          </>
        ) : (
          <p>{t('envoyer.favoriSansJeton')}</p>
        )}
      </section>
    </main>
  )
}
