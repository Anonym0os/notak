import { type FormEvent, useCallback, useEffect, useState } from 'react'
import {
  type Acces,
  type Moi,
  type Role,
  adressePublique,
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
  lecture: () => t('partage.lecture'),
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

function Panneau({ tableau, moi, reference }: { tableau: string; moi: Moi; reference(el: HTMLElement | null): void }) {
  const [acces, setAcces] = useState<Acces[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'edition' | 'lecture'>('edition')
  const [occupe, setOccupe] = useState(false)

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
    const adresse = email.trim().toLowerCase()
    if (!adresse.includes('@')) return setErreur(t('connexion.adresseInvalide'))
    void agir(async () => {
      await partager(tableau, adresse, role)
      setEmail('')
    })
  }

  return (
    <div className="partage-panneau" ref={reference} role="dialog" aria-label={t('partage.titre')}>
      <ul className="partage-liste">
        {acces?.map((a) => (
          <li key={a.email}>
            <span className="partage-qui">
              <strong>{a.nom || a.email}</strong>
              {a.nom && <small>{a.email}</small>}
            </span>
            <span className="partage-role">
              {LIBELLE_ROLE[a.role]()}
              {a.enAttente && <em> · {t('partage.enAttente')}</em>}
              {a.herite && <em> · {t('partage.parent')}</em>}
            </span>
            {proprietaire && a.role !== 'proprietaire' && !a.herite && (
              <button
                type="button"
                className="bouton-lien"
                disabled={occupe}
                onClick={() => agir(() => retirerAcces(tableau, a.email))}
              >
                {t('partage.retirer')}
              </button>
            )}
          </li>
        ))}
        {!acces && !erreur && <li className="partage-vide"><span className="notak-roue" aria-hidden /></li>}
      </ul>
      {(proprietaire || acces === null) && (
        <form className="partage-form" onSubmit={inviter} noValidate>
          <input
            type="email"
            placeholder={t('connexion.adresse')}
            aria-label={t('partage.adresseInviter')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select value={role} aria-label={t('partage.droit')} onChange={(e) => setRole(e.target.value as 'edition' | 'lecture')}>
            <option value="edition">{t('partage.edition')}</option>
            <option value="lecture">{t('partage.lecture')}</option>
          </select>
          <button type="submit" className="bouton bouton-plein" disabled={occupe}>
            {t('partage.inviter')}
          </button>
        </form>
      )}
      {proprietaire && <MotDePasse tableau={tableau} />}
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
