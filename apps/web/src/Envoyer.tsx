import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Champ, Icone, formaterInstant } from '@notak/tableau'
import { t } from './langue'
import { type JetonArrivee, creerJeton, listerJetons, revoquerJeton } from './api'
import { estBureau } from './bureau'
import { PageApp } from './PageApp'
import { jetonARemplacer, adresseJoignable, etapesRaccourciImage, etapesRaccourciTexte, favori } from './raccourcis'

const quand = formaterInstant

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

/** Une étape de la page : son numéro dans une pastille, à gauche, puis son titre et ce qu'elle demande. */
function Etape({ id, numero, titre, children }: { id: string; numero: number; titre: string; children: ReactNode }) {
  return (
    <section className="app-carte envoyer-etape" aria-labelledby={id}>
      <span className="app-etape" aria-hidden="true">
        {numero}
      </span>
      <div className="envoyer-etape-corps">
        <h2 id={id}>{titre}</h2>
        {children}
      </div>
    </section>
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
 * Dans l'app de bureau, le favori n'a pas de barre où se glisser : le Raccourci, que le Mac range dans son menu
 * Partager, en tient lieu. `adresseDeclaree` est l'adresse publique que dit le serveur (`GET /api/instance`).
 */
export function PageEnvoyer({ adresseDeclaree }: { adresseDeclaree?: string }) {
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
  const bureau = estBureau()
  // Ce qu'un iPhone joint ; le favori, lui, tourne sur cet ordinateur et se contente au besoin de l'adresse de la page.
  const adresse = adresseJoignable(adresseDeclaree, location.origin)

  return (
    <PageApp titre={t('compte.envoyer')} intro={t(bureau ? 'envoyer.introBureau' : 'envoyer.intro')}>
      <Etape id="envoyer-jetons" numero={1} titre={t('envoyer.jeton')}>
        <p className="app-note">{t('envoyer.jetonExplique')}</p>
        <form className="app-form" onSubmit={creer} noValidate>
          <Champ aria-label={t('envoyer.nomJeton')} placeholder={t('envoyer.nomExemple')} maxLength={60} value={nom} onChange={(e) => setNom(e.target.value)} />
          <button type="submit" className="bouton bouton-plein" disabled={occupe}>
            {t('envoyer.creer')}
          </button>
        </form>
        {neuf && (
          <div role="status">
            <div className="envoyer-neuf">
              <code className="envoyer-jeton">{neuf.jeton}</code>
              <Copier valeur={neuf.jeton} libelle={t('envoyer.copierJeton')} />
            </div>
            <p className="app-note">{t('envoyer.copiezLe')}</p>
          </div>
        )}
        {jetons && jetons.length > 0 && (
          <ul className="app-liste envoyer-jetons">
            {jetons.map((j) => (
              <li key={j.id}>
                <span className="app-qui">
                  <strong>{j.nom}</strong>
                  <small>
                    {t('envoyer.cree', { date: quand(j.cree) })} · {j.dernierUsage ? t('envoyer.servi', { date: quand(j.dernierUsage) }) : t('envoyer.jamaisServi')}
                  </small>
                </span>
                <button
                  type="button"
                  className="bouton bouton-danger"
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
      </Etape>

      <Etape id="envoyer-iphone" numero={2} titre={t(bureau ? 'envoyer.iphoneMac' : 'envoyer.iphone')}>
        {adresse ? (
          <>
            {!neuf && (
              <p className="app-note">
                <Ligne texte={t('envoyer.sansJeton', { jeton: jetonARemplacer() })} />
              </p>
            )}
            <Etapes etapes={etapesRaccourciTexte(adresse, jeton)} />
            <details className="envoyer-image">
              <summary>
                <Icone nom="chevronDroite" taille={14} />
                {t('envoyer.pourImage')}
              </summary>
              <Etapes etapes={etapesRaccourciImage(adresse, jeton)} />
            </details>
            {bureau && <p className="app-note">{t('envoyer.surMac')}</p>}
          </>
        ) : (
          <p className="envoyer-injoignable">
            <Ligne texte={t('envoyer.injoignable', { origine: location.origin })} />
          </p>
        )}
      </Etape>

      {!bureau && (
        <Etape id="envoyer-bureau" numero={3} titre={t('envoyer.bureau')}>
          {neuf ? (
            <>
              <p className="app-note">{t('envoyer.glisser')}</p>
              <div className="app-form">
                <LienFavori code={favori(adresse ?? location.origin, neuf.jeton)} />
                <Copier valeur={favori(adresse ?? location.origin, neuf.jeton)} libelle={t('envoyer.copierCode')} />
              </div>
              <p className="app-note">{t('envoyer.pasDeBarre')}</p>
            </>
          ) : (
            <p className="app-note">{t('envoyer.favoriSansJeton')}</p>
          )}
        </Etape>
      )}
    </PageApp>
  )
}
