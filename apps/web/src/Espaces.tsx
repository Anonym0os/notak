import { Case, Champ, Choix } from '@notak/tableau'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { t } from './langue'
import { PageApp } from './PageApp'
import {
  type EquipeEspace,
  type EspaceLu,
  type FournisseurSso,
  type InvitationEspace,
  type MembreEspace,
  type RoleCompose,
  type RoleEspace,
  ajouterAEquipe,
  annulerInvitation,
  changerRoleMembre,
  creerEquipe,
  creerEspace,
  creerRole,
  declarerSsoOidc,
  inviterDansEspace,
  jetonDomaine,
  listerEquipes,
  listerEspaces,
  listerFournisseursSso,
  listerInvitations,
  listerMembres,
  listerMembresEquipe,
  listerRoles,
  quitterEspace,
  retirerDEquipe,
  retirerMembre,
  supprimerEquipe,
  supprimerEspace,
  supprimerRole,
  supprimerSso,
  verifierDomaine,
} from './api'

// La page des espaces d'équipe : on y crée un espace, on y fait entrer des gens avec un rôle, on y forme des équipes,
// on y compose des rôles, et on y branche le SSO de l'entreprise. Les gestes sont ceux de Better Auth.

const ROLES_FIXES = ['owner', 'admin', 'member', 'guest'] as const

/** Les gestes qu'un rôle composé peut accorder, par ressource, dans l'ordre où la page les propose. */
const GESTES: Record<string, string[]> = {
  tableau: ['lire', 'commenter', 'modifier', 'administrer', 'creer'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  team: ['create', 'update', 'delete'],
}

const nomDuRole = (r: RoleEspace) => ((ROLES_FIXES as readonly string[]).includes(r) ? t(`espaces.role.${r}`) : r)
const administre = (e: EspaceLu) => e.role.split(',').some((r) => r === 'owner' || r === 'admin')

/** Le nom d'un rôle composé tel que Better Auth l'accepte : minuscules, sans espace ni accent. */
const nomDeRole = (brut: string) =>
  brut
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export function PageEspaces() {
  const [espaces, setEspaces] = useState<EspaceLu[] | null>(null)
  const [choisi, setChoisi] = useState<string | null>(() => new URLSearchParams(location.search).get('espace'))
  const [nom, setNom] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  const charger = useCallback(() => {
    listerEspaces().then(setEspaces, (x: Error) => setErreur(x.message))
  }, [])
  useEffect(charger, [charger])

  const agir = async (f: () => Promise<unknown>) => {
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
    if (!nom.trim()) return setErreur(t('espaces.nomRequis'))
    void agir(async () => {
      const { id } = await creerEspace(nom.trim())
      setNom('')
      setChoisi(id)
    })
  }

  const espace = espaces?.find((e) => e.id === choisi && !e.personnel) ?? null

  return (
    <PageApp titre={t('espaces.titre')} intro={t('espaces.intro')}>
      <section className="app-carte" aria-labelledby="espaces-liste">
        <h2 id="espaces-liste">{t('espaces.mesEspaces')}</h2>
        {espaces && (
          <ul className="app-liste">
            {espaces.map((e) => (
              <li key={e.id}>
                <span className="app-qui">
                  <strong>{e.personnel ? t('espaces.personnel') : e.nom}</strong>
                  <small>{e.role.split(',').map(nomDuRole).join(', ')}</small>
                </span>
                <span className="app-actions">
                  <a className="bouton" href={`/t/${e.racine}`}>
                    {t('espaces.ouvrir')}
                  </a>
                  {!e.personnel && (
                    <button type="button" className="bouton" aria-pressed={choisi === e.id} onClick={() => setChoisi(choisi === e.id ? null : e.id)}>
                      {administre(e) ? t('espaces.gerer') : t('espaces.details')}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <form className="app-form" onSubmit={creer} noValidate>
          <Champ aria-label={t('espaces.nomNouveau')} placeholder={t('espaces.nomNouveau')} maxLength={80} value={nom} onChange={(e) => setNom(e.target.value)} />
          <button type="submit" className="bouton bouton-plein" disabled={occupe}>
            {t('espaces.creer')}
          </button>
        </form>
        {erreur && (
          <p className="connexion-erreur" role="alert">
            {erreur}
          </p>
        )}
      </section>

      {espace && <GestionEspace key={espace.id} espace={espace} agir={agir} occupe={occupe} apresDepart={() => setChoisi(null)} />}
    </PageApp>
  )
}

type Agir = (f: () => Promise<unknown>) => Promise<void>

function GestionEspace({ espace, agir, occupe, apresDepart }: { espace: EspaceLu; agir: Agir; occupe: boolean; apresDepart(): void }) {
  const admin = administre(espace)
  const [membres, setMembres] = useState<MembreEspace[]>([])
  const [invitations, setInvitations] = useState<InvitationEspace[]>([])
  const [roles, setRoles] = useState<RoleCompose[]>([])
  const [version, setVersion] = useState(0)
  const relire = () => setVersion((v) => v + 1)

  useEffect(() => {
    void listerMembres(espace.id).then(setMembres, () => {})
    if (!admin) return
    void listerInvitations(espace.id).then((l) => setInvitations(l.filter((i) => i.status === 'pending')), () => {})
    void listerRoles(espace.id).then(setRoles, () => {})
  }, [espace.id, admin, version])

  const agirPuisRelire = (f: () => Promise<unknown>) => agir(f).then(relire)
  const rolesPossibles: RoleEspace[] = [...ROLES_FIXES, ...roles.map((r) => r.role)]

  return (
    <>
      <section className="app-carte" aria-labelledby="espace-membres">
        <h2 id="espace-membres">{t('espaces.membresDe', { nom: espace.nom })}</h2>
        <ul className="app-liste">
          {membres.map((m) => (
            <li key={m.id}>
              <span className="app-qui">
                <strong>{m.user.name}</strong>
                <small>{m.user.email}</small>
              </span>
              {admin && m.role !== 'owner' ? (
                <span className="app-actions">
                  <Choix
                    haut
                    libelle={t('espaces.roleDe', { nom: m.user.name })}
                    valeur={m.role}
                    inactif={occupe}
                    onChange={(r) => void agirPuisRelire(() => changerRoleMembre(espace.id, m.id, r))}
                    options={rolesPossibles.filter((r) => r !== 'owner').map((r) => ({ valeur: r, libelle: nomDuRole(r) }))}
                  />
                  <button type="button" className="bouton bouton-danger" disabled={occupe} onClick={() => void agirPuisRelire(() => retirerMembre(espace.id, m.id))}>
                    {t('espaces.retirer')}
                  </button>
                </span>
              ) : (
                <small>{nomDuRole(m.role)}</small>
              )}
            </li>
          ))}
        </ul>
        {admin && <Inviter espace={espace} roles={rolesPossibles} agir={agirPuisRelire} occupe={occupe} />}
        {invitations.length > 0 && (
          <>
            <h3>{t('espaces.enAttente')}</h3>
            <ul className="app-liste">
              {invitations.map((i) => (
                <li key={i.id}>
                  <span className="app-qui">
                    <strong>{i.email}</strong>
                    <small>{nomDuRole(i.role)}</small>
                  </span>
                  <button type="button" className="bouton bouton-danger" disabled={occupe} onClick={() => void agirPuisRelire(() => annulerInvitation(i.id))}>
                    {t('espaces.annuler')}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {admin && <Equipes espace={espace} membres={membres} agir={agir} occupe={occupe} />}
      {admin && <Roles espace={espace} roles={roles} agir={agirPuisRelire} occupe={occupe} />}
      {admin && <Sso espace={espace} agir={agir} occupe={occupe} />}

      <section className="app-carte">
        {espace.role.split(',').includes('owner') ? (
          <button
            type="button"
            className="bouton bouton-danger"
            disabled={occupe}
            onClick={() => {
              if (confirm(t('espaces.supprimerConfirme', { nom: espace.nom }))) void agir(() => supprimerEspace(espace.id)).then(apresDepart)
            }}
          >
            {t('espaces.supprimer')}
          </button>
        ) : (
          <button type="button" className="bouton bouton-danger" disabled={occupe} onClick={() => void agir(() => quitterEspace(espace.id)).then(apresDepart)}>
            {t('espaces.quitter')}
          </button>
        )}
      </section>
    </>
  )
}

function Inviter({ espace, roles, agir, occupe }: { espace: EspaceLu; roles: RoleEspace[]; agir: Agir; occupe: boolean }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<RoleEspace>('member')
  const inviter = (e: FormEvent) => {
    e.preventDefault()
    const adresse = email.trim().toLowerCase()
    if (!adresse.includes('@')) return
    void agir(async () => {
      await inviterDansEspace(espace.id, adresse, role)
      setEmail('')
    })
  }
  return (
    <form className="app-form" onSubmit={inviter} noValidate>
      <Champ type="email" aria-label={t('espaces.inviterAdresse')} placeholder={t('espaces.inviterAdresse')} value={email} onChange={(e) => setEmail(e.target.value)} />
      <Choix haut libelle={t('espaces.role')} valeur={role} onChange={setRole} options={roles.filter((r) => r !== 'owner').map((r) => ({ valeur: r, libelle: nomDuRole(r) }))} />
      <button type="submit" className="bouton bouton-plein" disabled={occupe}>
        {t('espaces.inviter')}
      </button>
    </form>
  )
}

function Equipes({ espace, membres, agir, occupe }: { espace: EspaceLu; membres: MembreEspace[]; agir: Agir; occupe: boolean }) {
  const [equipes, setEquipes] = useState<EquipeEspace[]>([])
  const [dans, setDans] = useState<Record<string, string[]>>({})
  const [nom, setNom] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    void listerEquipes(espace.id).then(async (l) => {
      setEquipes(l)
      const paires = await Promise.all(l.map(async (e) => [e.id, (await listerMembresEquipe(e.id).catch(() => [])).map((m) => m.userId)] as const))
      setDans(Object.fromEntries(paires))
    }, () => {})
  }, [espace.id, version])
  const faire = (f: () => Promise<unknown>) => agir(f).then(() => setVersion((v) => v + 1))
  const creer = (e: FormEvent) => {
    e.preventDefault()
    if (nom.trim()) void faire(async () => {
      await creerEquipe(espace.id, nom.trim())
      setNom('')
    })
  }
  return (
    <section className="app-carte" aria-labelledby="espace-equipes">
      <h2 id="espace-equipes">{t('espaces.equipes')}</h2>
      <p className="app-note">{t('espaces.equipesExplique')}</p>
      {equipes.map((e) => (
        <div key={e.id} className="espaces-equipe">
          <div className="espaces-equipe-tete">
            <strong>{e.name}</strong>
            <button type="button" className="bouton bouton-danger" disabled={occupe} onClick={() => void faire(() => supprimerEquipe(espace.id, e.id))}>
              {t('espaces.supprimer')}
            </button>
          </div>
          <div className="espaces-coches">
            {membres.map((m) => {
              const coche = dans[e.id]?.includes(m.user.id) ?? false
              return (
                <label key={m.id}>
                  <Case
                    option
                    cochee={coche}
                    disabled={occupe}
                    onChange={() => void faire(() => (coche ? retirerDEquipe(e.id, m.user.id) : ajouterAEquipe(e.id, m.user.id)))}
                  />
                  {m.user.name}
                </label>
              )
            })}
          </div>
        </div>
      ))}
      <form className="app-form" onSubmit={creer} noValidate>
        <Champ aria-label={t('espaces.nomEquipe')} placeholder={t('espaces.nomEquipe')} maxLength={60} value={nom} onChange={(e) => setNom(e.target.value)} />
        <button type="submit" className="bouton" disabled={occupe}>
          {t('espaces.creerEquipe')}
        </button>
      </form>
    </section>
  )
}

function Roles({ espace, roles, agir, occupe }: { espace: EspaceLu; roles: RoleCompose[]; agir: Agir; occupe: boolean }) {
  const [nom, setNom] = useState('')
  const [choix, setChoix] = useState<Record<string, string[]>>({ tableau: ['lire'] })
  const basculer = (ressource: string, geste: string) =>
    setChoix((c) => {
      const avant = c[ressource] ?? []
      return { ...c, [ressource]: avant.includes(geste) ? avant.filter((g) => g !== geste) : [...avant, geste] }
    })
  const creer = (e: FormEvent) => {
    e.preventDefault()
    const propre = nomDeRole(nom)
    if (!propre || (ROLES_FIXES as readonly string[]).includes(propre)) return
    const permission = Object.fromEntries(Object.entries(choix).filter(([, g]) => g.length > 0))
    void agir(async () => {
      await creerRole(espace.id, propre, permission)
      setNom('')
    })
  }
  const lirePermission = (p: RoleCompose['permission'] | string) => (typeof p === 'string' ? (JSON.parse(p) as Record<string, string[]>) : p)
  return (
    <section className="app-carte" aria-labelledby="espace-roles">
      <h2 id="espace-roles">{t('espaces.roles')}</h2>
      <p className="app-note">{t('espaces.rolesExplique')}</p>
      {roles.length > 0 && (
        <ul className="app-liste">
          {roles.map((r) => (
            <li key={r.id}>
              <span className="app-qui">
                <strong>{r.role}</strong>
                <small>
                  {Object.entries(lirePermission(r.permission))
                    .map(([res, gestes]) => `${t(`espaces.ressource.${res}`)} : ${gestes.map((g) => t(`espaces.geste.${g}`)).join(', ')}`)
                    .join(' · ')}
                </small>
              </span>
              <button type="button" className="bouton bouton-danger" disabled={occupe} onClick={() => void agir(() => supprimerRole(espace.id, r.role))}>
                {t('espaces.supprimer')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="espaces-role" onSubmit={creer} noValidate>
        <Champ aria-label={t('espaces.nomRole')} placeholder={t('espaces.nomRole')} maxLength={40} value={nom} onChange={(e) => setNom(e.target.value)} />
        {Object.entries(GESTES).map(([ressource, gestes]) => (
          <fieldset key={ressource} className="espaces-coches">
            <legend>{t(`espaces.ressource.${ressource}`)}</legend>
            {gestes.map((g) => (
              <label key={g}>
                <Case option cochee={choix[ressource]?.includes(g) ?? false} onChange={() => basculer(ressource, g)} />
                {t(`espaces.geste.${g}`)}
              </label>
            ))}
          </fieldset>
        ))}
        <button type="submit" className="bouton" disabled={occupe}>
          {t('espaces.creerRole')}
        </button>
      </form>
    </section>
  )
}

function Sso({ espace, agir, occupe }: { espace: EspaceLu; agir: Agir; occupe: boolean }) {
  const [fournisseurs, setFournisseurs] = useState<FournisseurSso[]>([])
  const [jetons, setJetons] = useState<Record<string, string>>({})
  const [champs, setChamps] = useState({ providerId: '', issuer: '', domain: '', clientId: '', clientSecret: '' })
  const [version, setVersion] = useState(0)
  useEffect(() => {
    void listerFournisseursSso(espace.id).then(setFournisseurs, () => {})
  }, [espace.id, version])
  const faire = (f: () => Promise<unknown>) => agir(f).then(() => setVersion((v) => v + 1))
  const declarer = (e: FormEvent) => {
    e.preventDefault()
    if (Object.values(champs).some((v) => !v.trim())) return
    void faire(async () => {
      const r = await declarerSsoOidc(espace.id, { ...champs, providerId: nomDeRole(champs.providerId) })
      if (r.domainVerificationToken) setJetons((j) => ({ ...j, [nomDeRole(champs.providerId)]: r.domainVerificationToken! }))
      setChamps({ providerId: '', issuer: '', domain: '', clientId: '', clientSecret: '' })
    })
  }
  const champ = (cle: keyof typeof champs, type = 'text') => (
    <Champ
      type={type}
      aria-label={t(`espaces.sso.${cle}`)}
      placeholder={t(`espaces.sso.${cle}`)}
      value={champs[cle]}
      onChange={(e) => setChamps((c) => ({ ...c, [cle]: e.target.value }))}
      autoComplete="off"
    />
  )
  return (
    <section className="app-carte" aria-labelledby="espace-sso">
      <h2 id="espace-sso">{t('espaces.sso')}</h2>
      <p className="app-note">{t('espaces.ssoExplique', { retour: `${location.origin}/api/auth/sso/callback/` })}</p>
      {fournisseurs.length > 0 && (
        <ul className="app-liste">
          {fournisseurs.map((f) => (
            <li key={f.providerId} className="espaces-sso">
              <span className="app-qui">
                <strong>
                  {f.providerId} · {f.domain}
                </strong>
                <small>{f.issuer}</small>
                {!f.domainVerified && (
                  <small>
                    {jetons[f.providerId] ? (
                      <>
                        {t('espaces.sso.dns')} <code>{`_better-auth-token-${f.providerId}.${f.domain}`}</code> = <code>{jetons[f.providerId]}</code>
                      </>
                    ) : (
                      t('espaces.sso.domaineAProuver')
                    )}
                  </small>
                )}
              </span>
              <span className="app-actions">
                {f.domainVerified ? (
                  <small>{t('espaces.sso.domaineProuve')}</small>
                ) : jetons[f.providerId] ? (
                  <button type="button" className="bouton" disabled={occupe} onClick={() => void faire(() => verifierDomaine(f.providerId))}>
                    {t('espaces.sso.verifier')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="bouton"
                    disabled={occupe}
                    onClick={() =>
                      void agir(async () => {
                        const { domainVerificationToken } = await jetonDomaine(f.providerId)
                        setJetons((j) => ({ ...j, [f.providerId]: domainVerificationToken }))
                      })
                    }
                  >
                    {t('espaces.sso.prouver')}
                  </button>
                )}
                <button type="button" className="bouton bouton-danger" disabled={occupe} onClick={() => void faire(() => supprimerSso(f.providerId))}>
                  {t('espaces.supprimer')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form className="espaces-role" onSubmit={declarer} noValidate>
        {champ('providerId')}
        {champ('issuer', 'url')}
        {champ('domain')}
        {champ('clientId')}
        {champ('clientSecret', 'password')}
        <button type="submit" className="bouton" disabled={occupe}>
          {t('espaces.sso.declarer')}
        </button>
      </form>
    </section>
  )
}
