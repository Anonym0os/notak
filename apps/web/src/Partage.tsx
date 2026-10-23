import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { type Acces, type Moi, type Role, adressePublique, creerLienPublic, lienPublic, listerAcces, partager, retirerAcces, retirerLienPublic } from './api'

const LIBELLE_ROLE: Record<Role, string> = { proprietaire: 'Propriétaire', edition: 'Édition', lecture: 'Lecture' }

/** Le bouton « Partager » et son panneau : qui a accès à ce tableau, et l'invitation d'une adresse. */
export function Partage({ tableau, moi }: { tableau: string; moi: Moi }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <div className="partage">
      <button type="button" className="bouton" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        Partager
      </button>
      {ouvert && <Panneau key={tableau} tableau={tableau} moi={moi} fermer={() => setOuvert(false)} />}
    </div>
  )
}

function Panneau({ tableau, moi, fermer }: { tableau: string; moi: Moi; fermer(): void }) {
  const [acces, setAcces] = useState<Acces[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'edition' | 'lecture'>('edition')
  const [occupe, setOccupe] = useState(false)

  const charger = useCallback(() => {
    listerAcces(tableau).then(setAcces, (x: Error) => setErreur(x.message))
  }, [tableau])
  useEffect(charger, [charger])

  useEffect(() => {
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && fermer()
    const hors = (e: PointerEvent) => !(e.target as HTMLElement).closest('.partage') && fermer()
    document.addEventListener('keydown', touche)
    document.addEventListener('pointerdown', hors)
    return () => {
      document.removeEventListener('keydown', touche)
      document.removeEventListener('pointerdown', hors)
    }
  }, [fermer])

  const proprietaire = acces?.some((a) => a.utilisateur === moi.id && a.role === 'proprietaire') ?? false

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

  const inviter = (e: FormEvent) => {
    e.preventDefault()
    const adresse = email.trim().toLowerCase()
    if (!adresse.includes('@')) return setErreur('Adresse invalide')
    void agir(async () => {
      await partager(tableau, adresse, role)
      setEmail('')
    })
  }

  return (
    <div className="partage-panneau" role="dialog" aria-label="Partager">
      <ul className="partage-liste">
        {acces?.map((a) => (
          <li key={a.email}>
            <span className="partage-qui">
              <strong>{a.nom || a.email}</strong>
              {a.nom && <small>{a.email}</small>}
            </span>
            <span className="partage-role">
              {LIBELLE_ROLE[a.role]}
              {a.enAttente && <em> · en attente</em>}
              {a.herite && <em> · par le tableau parent</em>}
            </span>
            {proprietaire && a.role !== 'proprietaire' && !a.herite && (
              <button
                type="button"
                className="bouton-lien"
                disabled={occupe}
                onClick={() => agir(() => retirerAcces(tableau, a.email))}
              >
                Retirer
              </button>
            )}
          </li>
        ))}
        {!acces && !erreur && <li className="partage-vide">…</li>}
      </ul>
      {(proprietaire || acces === null) && (
        <form className="partage-form" onSubmit={inviter} noValidate>
          <input
            type="email"
            placeholder="Adresse"
            aria-label="Adresse à inviter"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select value={role} aria-label="Droit" onChange={(e) => setRole(e.target.value as 'edition' | 'lecture')}>
            <option value="edition">Édition</option>
            <option value="lecture">Lecture</option>
          </select>
          <button type="submit" className="bouton bouton-plein" disabled={occupe}>
            Inviter
          </button>
        </form>
      )}
      {proprietaire && <LienPublic tableau={tableau} />}
      {acces && !proprietaire && <p className="partage-note">Seul le propriétaire invite.</p>}
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
      setErreur(x instanceof Error ? x.message : 'Échec')
    } finally {
      setOccupe(false)
    }
  }
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(adressePublique(jeton!))
      setCopie(true)
    } catch {
      setErreur('Copie impossible : sélectionnez l’adresse')
    }
  }

  return (
    <div className="partage-lien">
      <strong>Lien de lecture</strong>
      {jeton === undefined ? (
        <span className="partage-note">…</span>
      ) : jeton === null ? (
        <>
          <span className="partage-note">Toute personne qui a le lien voit ce tableau, sans compte.</span>
          <button type="button" className="bouton" disabled={occupe} onClick={() => agir(() => creerLienPublic(tableau))}>
            Créer un lien
          </button>
        </>
      ) : (
        <>
          <div className="partage-lien-ligne">
            <input readOnly aria-label="Adresse du lien de lecture" value={adressePublique(jeton)} onFocus={(e) => e.target.select()} />
            <button type="button" className="bouton" onClick={copier}>
              {copie ? 'Copié' : 'Copier'}
            </button>
          </div>
          <button type="button" className="bouton-lien" disabled={occupe} onClick={() => agir(async () => (await retirerLienPublic(tableau), null))}>
            Fermer le lien
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
