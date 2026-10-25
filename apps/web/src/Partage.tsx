import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  type Acces,
  type Blocage,
  type EquipeEspace,
  type Moi,
  type NiveauLien,
  type Role,
  type RoleDonne,
  adressePublique,
  bloquer,
  definirNiveauLien,
  listerBlocages,
  listerEquipes,
  listerEspaces,
  niveauLien,
  creerLienPublic,
  etatVerrou,
  lienPublic,
  lienProtege,
  listerAcces,
  partager,
  poserMotDePasse,
  poserMotDePasseDuLien,
  retirerAcces,
  retirerLienPublic,
  retirerMotDePasse,
  retirerMotDePasseDuLien,
} from './api'
import { t } from './langue'
import { Icone } from '@notak/tableau'
import { usePanneau } from './panneaux'

const LIBELLE_ROLE: Record<Role, () => string> = {
  proprietaire: () => t('partage.proprietaire'),
  edition: () => t('partage.edition'),
  commentaire: () => t('partage.commentaire'),
  lecture: () => t('partage.lecture'),
}

/** La pastille d'une ligne d'accès : l'initiale de la personne, ou l'icône d'une équipe. */
function PastilleAcces({ nom, equipe }: { nom: string; equipe?: boolean }) {
  return (
    <span className="app-pastille app-pastille-neutre" aria-hidden>
      {equipe ? <Icone nom="equipe" taille={15} /> : ([...nom.trim()][0]?.toLocaleUpperCase() ?? '?')}
    </span>
  )
}

/** Retirer une ligne : une croix pâle, dont le nom se lit à l'infobulle et au lecteur d'écran. */
function Retirer({ libelle, disabled, onClick }: { libelle: string; disabled: boolean; onClick(): void }) {
  return (
    <button type="button" className="app-icone-bouton" aria-label={libelle} title={libelle} disabled={disabled} onClick={onClick}>
      <Icone nom="fermer" taille={16} />
    </button>
  )
}

/** Les équipes des espaces d'équipe dont on est membre : on peut leur partager un tableau. */
async function equipesPossibles(): Promise<(EquipeEspace & { espace: string })[]> {
  const espaces = (await listerEspaces()).filter((e) => !e.personnel)
  const listes = await Promise.all(espaces.map(async (e) => (await listerEquipes(e.id).catch(() => [])).map((q) => ({ ...q, espace: e.nom }))))
  return listes.flat()
}

/** Le bouton « Partager » et son panneau : qui a accès à ce tableau, et l'invitation d'une adresse. */
export function Partage({ tableau, moi }: { tableau: string; moi: Moi }) {
  const { ouvert, basculer, ancre, bouton, panneau } = usePanneau<HTMLDivElement, HTMLButtonElement>()
  return (
    <div className="partage" ref={ancre}>
      <button type="button" ref={bouton} className="bouton" aria-expanded={ouvert} aria-label={t('partage.titre')} title={t('partage.titre')} onClick={basculer}>
        <Icone nom="partager" taille={16} />
        <span className="bouton-texte">{t('partage.titre')}</span>
      </button>
      {ouvert && <Panneau key={tableau} tableau={tableau} moi={moi} reference={panneau} />}
    </div>
  )
}

/** Le même panneau en fenêtre, au centre : la bibliothèque le propose au clic droit sur une toile. */
export function PartageEnFenetre({ tableau, moi, fermer }: { tableau: string; moi: Moi; fermer(): void }) {
  const boite = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = boite.current
    if (d && !d.open) d.showModal?.()
  }, [])
  return (
    <dialog
      ref={boite}
      className="partage-fenetre"
      aria-label={t('partage.titre')}
      onCancel={(e) => {
        e.preventDefault()
        fermer()
      }}
      onClick={(e) => e.target === e.currentTarget && fermer()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Panneau tableau={tableau} moi={moi} reference={() => {}} />
    </dialog>
  )
}

function Panneau({ tableau, moi, reference }: { tableau: string; moi: Moi; reference(el: HTMLElement | null): void }) {
  const [acces, setAcces] = useState<Acces[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<RoleDonne>('edition')
  // À qui : une adresse (`''`) ou une équipe (son identifiant).
  const [equipe, setEquipe] = useState('')
  const [equipes, setEquipes] = useState<(EquipeEspace & { espace: string })[]>([])
  const [occupe, setOccupe] = useState(false)
  useEffect(() => {
    void equipesPossibles().then(setEquipes, () => {})
  }, [])

  const charger = useCallback(() => {
    listerAcces(tableau).then(setAcces, (x: Error) => setErreur(x.message))
  }, [tableau])
  useEffect(charger, [charger])

  const proprietaire = acces?.some((a) => a.utilisateur === moi.id && a.role === 'proprietaire') ?? false

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

  const inviter = (e: FormEvent) => {
    e.preventDefault()
    if (equipe) return void agir(() => partager(tableau, { equipe }, role))
    const adresse = email.trim().toLowerCase()
    if (!adresse.includes('@')) return setErreur(t('connexion.adresseInvalide'))
    void agir(async () => {
      await partager(tableau, { email: adresse }, role)
      setEmail('')
    })
  }

  return (
    <div className="app-panneau partage-panneau" ref={reference} role="dialog" aria-label={t('partage.titre')}>
      <div className="app-panneau-tete">{t('partage.titre')}</div>
      <ul className="partage-liste">
        {acces?.map((a) => (
          <li key={a.equipe ?? a.email}>
            <PastilleAcces nom={a.nom || a.email} equipe={!!a.equipe} />
            <span className="partage-qui">
              <strong>{a.nom || a.email}</strong>
              {a.equipe ? <small>{t('partage.equipe')}</small> : a.nom && <small>{a.email}</small>}
            </span>
            <span className="partage-role">
              {LIBELLE_ROLE[a.role]()}
              {a.enAttente && <em> · {t('partage.enAttente')}</em>}
              {a.herite && <em> · {t('partage.parent')}</em>}
            </span>
            {proprietaire && a.role !== 'proprietaire' && !a.herite && (
              <Retirer
                libelle={`${t('partage.retirer')} ${a.nom || a.email}`}
                disabled={occupe}
                onClick={() => agir(() => retirerAcces(tableau, a.equipe ? { equipe: a.equipe } : { email: a.email }))}
              />
            )}
          </li>
        ))}
        {!acces && !erreur && <li className="partage-vide"><span className="notak-roue" aria-hidden /></li>}
      </ul>
      {(proprietaire || acces === null) && (
        <form className="partage-form" onSubmit={inviter} noValidate>
          {equipes.length > 0 && (
            <select className="partage-cible" value={equipe} aria-label={t('partage.aQui')} onChange={(e) => setEquipe(e.target.value)}>
              <option value="">{t('partage.uneAdresse')}</option>
              {equipes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name} · {q.espace}
                </option>
              ))}
            </select>
          )}
          {!equipe && (
            <input
              type="email"
              placeholder={t('connexion.adresse')}
              aria-label={t('partage.adresseInviter')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
          <select value={role} aria-label={t('partage.droit')} onChange={(e) => setRole(e.target.value as RoleDonne)}>
            <option value="edition">{t('partage.edition')}</option>
            <option value="commentaire">{t('partage.commentaire')}</option>
            <option value="lecture">{t('partage.lecture')}</option>
          </select>
          <button type="submit" className="bouton bouton-plein" disabled={occupe}>
            {t('partage.inviter')}
          </button>
        </form>
      )}
      {proprietaire && <MotDePasse tableau={tableau} />}
      {proprietaire && <Blocages tableau={tableau} />}
      {proprietaire && <LienPublic tableau={tableau} />}
      {acces && !proprietaire && <p className="partage-note">{t('partage.seulProprio')}</p>}
      {erreur && (
        <p className="connexion-erreur" role="alert">
          {erreur}
        </p>
      )}
    </div>
  )
}

/**
 * « Protéger par mot de passe » : le tableau (et ce qu'il contient) ne s'ouvre plus, pour les autres comptes, qu'avec
 * ce mot de passe. Celui qui le pose n'a pas à le redonner sur cet appareil.
 */
function MotDePasse({ tableau }: { tableau: string }) {
  const [protege, setProtege] = useState<boolean | undefined>(undefined)
  const [saisie, setSaisie] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  useEffect(() => {
    etatVerrou(tableau).then((e) => setProtege(e.protege), (x: Error) => setErreur(x.message))
  }, [tableau])

  const agir = async (f: () => Promise<boolean>) => {
    setErreur(null)
    setOccupe(true)
    try {
      setProtege(await f())
      setSaisie('')
    } catch (x) {
      setErreur(x instanceof Error ? x.message : t('commun.echec'))
    } finally {
      setOccupe(false)
    }
  }
  const poser = (e: FormEvent) => {
    e.preventDefault()
    if (saisie.length < 6) return setErreur(t('partage.mdp6'))
    void agir(async () => (await poserMotDePasse(tableau, saisie), true))
  }
  return (
    <div className="partage-lien">
      <strong>{t('partage.mdpTableau')}</strong>
      {protege === undefined ? (
        <span className="partage-note"><span className="notak-roue" aria-hidden /></span>
      ) : (
        <>
          <span className="partage-note">
            {protege ? t('partage.mdpActif') : t('partage.mdpInactif')}
          </span>
          <form className="partage-lien-ligne" onSubmit={poser} noValidate>
            <input
              type="password"
              autoComplete="new-password"
              aria-label={protege ? t('partage.nouveauMdpTableau') : t('partage.mdpTableau')}
              placeholder={protege ? t('partage.nouveauMdp') : t('connexion.mdp')}
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
            />
            <button type="submit" className="bouton" disabled={occupe || !saisie}>
              {protege ? t('partage.changer') : t('partage.proteger')}
            </button>
          </form>
          {protege && (
            <button type="button" className="bouton-lien" disabled={occupe} onClick={() => agir(async () => (await retirerMotDePasse(tableau), false))}>
              {t('partage.retirerMdp')}
            </button>
          )}
        </>
      )}
      {erreur && (
        <p className="connexion-erreur" role="alert">
          {erreur}
        </p>
      )}
    </div>
  )
}

/** Le lien de lecture : toute personne qui l'a voit le tableau, sans compte. Le retirer le ferme. */
function LienPublic({ tableau }: { tableau: string }) {
  const [jeton, setJeton] = useState<string | null | undefined>(undefined)
  const [erreur, setErreur] = useState<string | null>(null)
  const [copie, setCopie] = useState(false)
  const [occupe, setOccupe] = useState(false)
  useEffect(() => {
    lienPublic(tableau).then(setJeton, (x: Error) => setErreur(x.message))
  }, [tableau])

  const agir = async (f: () => Promise<string | null>) => {
    setErreur(null)
    setOccupe(true)
    try {
      setJeton(await f())
      setCopie(false)
    } catch (x) {
      setErreur(x instanceof Error ? x.message : t('commun.echec'))
    } finally {
      setOccupe(false)
    }
  }
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(adressePublique(jeton!))
      setCopie(true)
    } catch {
      setErreur(t('partage.copieImpossible'))
    }
  }

  return (
    <div className="partage-lien">
      <strong>{t('partage.lienLecture')}</strong>
      {jeton === undefined ? (
        <span className="partage-note"><span className="notak-roue" aria-hidden /></span>
      ) : jeton === null ? (
        <>
          <span className="partage-note">{t('partage.lienNote')}</span>
          <button type="button" className="bouton" disabled={occupe} onClick={() => agir(() => creerLienPublic(tableau))}>
            {t('partage.creerLien')}
          </button>
        </>
      ) : (
        <>
          <div className="partage-lien-ligne">
            <input readOnly aria-label={t('partage.adresseLien')} value={adressePublique(jeton)} onFocus={(e) => e.target.select()} />
            <button type="button" className="bouton" onClick={copier}>
              {copie ? t('partage.copie') : t('partage.copier')}
            </button>
          </div>
          <NiveauDuLien tableau={tableau} />
          <MotDePasseDuLien tableau={tableau} />
          <button type="button" className="bouton-lien" disabled={occupe} onClick={() => agir(async () => (await retirerLienPublic(tableau), null))}>
            {t('partage.fermerLien')}
          </button>
        </>
      )}
      {erreur && (
        <p className="connexion-erreur" role="alert">
          {erreur}
        </p>
      )}
    </div>
  )
}

/** Un mot de passe sur le lien de lecture : qui n'a pas de compte le donne avant de voir le tableau. */
function MotDePasseDuLien({ tableau }: { tableau: string }) {
  const [protege, setProtege] = useState<boolean | undefined>(undefined)
  const [saisie, setSaisie] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  useEffect(() => {
    lienProtege(tableau).then(setProtege, (x: Error) => setErreur(x.message))
  }, [tableau])

  const agir = async (f: () => Promise<boolean>) => {
    setErreur(null)
    setOccupe(true)
    try {
      setProtege(await f())
      setSaisie('')
    } catch (x) {
      setErreur(x instanceof Error ? x.message : t('commun.echec'))
    } finally {
      setOccupe(false)
    }
  }
  const poser = (e: FormEvent) => {
    e.preventDefault()
    if (saisie.length < 6) return setErreur(t('partage.mdp6'))
    void agir(async () => (await poserMotDePasseDuLien(tableau, saisie), true))
  }
  return (
    <div className="partage-mdp-lien">
      <span className="partage-note">{protege ? t('partage.lienMdpActif') : t('partage.lienMdpInactif')}</span>
      <form className="partage-lien-ligne" onSubmit={poser} noValidate>
        <input
          type="password"
          autoComplete="new-password"
          aria-label={protege ? t('partage.nouveauMdpLien') : t('partage.mdpLien')}
          placeholder={protege ? t('partage.nouveauMdp') : t('partage.mdpLien')}
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
        />
        <button type="submit" className="bouton" disabled={occupe || protege === undefined || !saisie}>
          {protege ? t('partage.changer') : t('partage.proteger')}
        </button>
      </form>
      {protege && (
        <button type="button" className="bouton-lien" disabled={occupe} onClick={() => agir(async () => (await retirerMotDePasseDuLien(tableau), false))}>
          {t('partage.retirerMdpLien')}
        </button>
      )}
      {erreur && (
        <p className="connexion-erreur" role="alert">
          {erreur}
        </p>
      )}
    </div>
  )
}

/** Ce que permet le lien : lire, commenter ou modifier, sans compte. */
function NiveauDuLien({ tableau }: { tableau: string }) {
  const [niveau, setNiveau] = useState<NiveauLien | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  useEffect(() => {
    niveauLien(tableau).then(setNiveau, (x: Error) => setErreur(x.message))
  }, [tableau])
  return (
    <label className="partage-niveau">
      <span className="partage-note">{t('partage.lienPermet')}</span>
      <select
        value={niveau ?? 'lecture'}
        disabled={niveau === null}
        onChange={(e) => {
          const n = e.target.value as NiveauLien
          setErreur(null)
          definirNiveauLien(tableau, n).then(() => setNiveau(n), (x: Error) => setErreur(x.message))
        }}
      >
        <option value="lecture">{t('partage.lienLire')}</option>
        <option value="commentaire">{t('partage.lienCommenter')}</option>
        <option value="edition">{t('partage.lienModifier')}</option>
      </select>
      {erreur && (
        <span className="connexion-erreur" role="alert">
          {erreur}
        </span>
      )}
    </label>
  )
}

const nomDuBlocage = (b: Blocage) => ('tous' in b ? t('partage.tousLeMonde') : b.nom)

/**
 * Bloquer le tableau (et ce qu'il contient) pour tout le monde sauf ses propriétaires ; un blocage venu d'un tableau
 * au-dessus se lève ici pour quelqu'un.
 */
function Blocages({ tableau }: { tableau: string }) {
  const [blocages, setBlocages] = useState<Blocage[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [occupe, setOccupe] = useState(false)
  const charger = useCallback(() => {
    listerBlocages(tableau).then(setBlocages, (x: Error) => setErreur(x.message))
  }, [tableau])
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
  const pourTous = blocages?.some((b) => 'tous' in b && b.etat === 'bloque') ?? false
  const lever = (e: FormEvent) => {
    e.preventDefault()
    const adresse = email.trim().toLowerCase()
    if (!adresse.includes('@')) return setErreur(t('connexion.adresseInvalide'))
    void agir(async () => {
      await bloquer(tableau, { email: adresse }, 'debloque')
      setEmail('')
    })
  }
  return (
    <div className="partage-lien">
      <strong>{t('partage.blocage')}</strong>
      <span className="partage-note">{t(pourTous ? 'partage.blocageActif' : 'partage.blocageNote')}</span>
      <button type="button" className="bouton" disabled={occupe || blocages === null} onClick={() => agir(() => bloquer(tableau, { tous: true }, pourTous ? null : 'bloque'))}>
        {t(pourTous ? 'partage.debloquerTous' : 'partage.bloquerTous')}
      </button>
      {blocages && blocages.filter((b) => !('tous' in b)).length > 0 && (
        <ul className="partage-liste">
          {blocages
            .filter((b) => !('tous' in b))
            .map((b) => (
              <li key={'email' in b ? b.email : 'equipe' in b ? b.equipe : 'tous'}>
                <PastilleAcces nom={nomDuBlocage(b)} equipe={'equipe' in b} />
                <span className="partage-qui">
                  <strong>{nomDuBlocage(b)}</strong>
                </span>
                <span className="partage-role">{t(b.etat === 'bloque' ? 'partage.bloque' : 'partage.debloque')}</span>
                <Retirer
                  libelle={`${t('partage.retirer')} ${nomDuBlocage(b)}`}
                  disabled={occupe}
                  onClick={() => agir(() => bloquer(tableau, 'email' in b ? { email: b.email } : { equipe: (b as { equipe: string }).equipe }, null))}
                />
              </li>
            ))}
        </ul>
      )}
      <form className="partage-lien-ligne" onSubmit={lever} noValidate>
        <input type="email" placeholder={t('connexion.adresse')} aria-label={t('partage.leverPour')} value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" className="bouton" disabled={occupe || !email}>
          {t('partage.lever')}
        </button>
      </form>
      {erreur && (
        <p className="connexion-erreur" role="alert">
          {erreur}
        </p>
      )}
    </div>
  )
}
