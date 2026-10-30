import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  type Acces,
  type Blocage,
  type Cible,
  type EquipeEspace,
  type LienVisiteur,
  type Moi,
  type NiveauVisiteur,
  type Partage as ReponsePartage,
  type Role,
  type RoleDonne,
  adresseInvitation,
  adressePublique,
  bloquer,
  creerLien,
  etatVerrou,
  fermerLien,
  listerAcces,
  listerBlocages,
  listerEquipes,
  listerEspaces,
  listerLiens,
  modifierAcces,
  modifierLien,
  motDePasseDuLien,
  nouveauLienInvitation,
  partager,
  poserMotDePasse,
  retirerAcces,
  retirerMotDePasse,
} from './api'
import { langue, t, tn } from './langue'
import { Icone } from '@notak/tableau'
import { usePanneau } from './panneaux'

// Partager un tableau, c'est deux portes, et le panneau les sépare :
// - des personnes invitées, qui ont un compte : elles modifient, commentent ou lisent, et peuvent n'avoir qu'un accès
//   temporaire ; une adresse sans compte (ou jamais vérifiée) reçoit une invitation, dont le lien est le seul passage ;
// - des liens visiteurs, pour qui n'a pas de compte : ils voient le tableau, ou le commentent, jamais ne le modifient.
//   Un lien par destinataire, chacun avec son échéance et son mot de passe : on en ferme un sans toucher aux autres.
// La protection du tableau entier (mot de passe, blocage) reste repliée en bas.

const LIBELLE_ROLE: Record<Role, () => string> = {
  proprietaire: () => t('partage.proprietaire'),
  edition: () => t('partage.edition'),
  commentaire: () => t('partage.commentaire'),
  lecture: () => t('partage.lecture'),
}

const JOUR = 24 * 3600 * 1000

/** « 12 nov. », avec l'année si ce n'est pas celle-ci. */
function dateCourte(ms: number): string {
  const d = new Date(ms)
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }
  return new Intl.DateTimeFormat(langue(), options).format(d)
}

/** « expire dans 3 jours », « expire dans 5 h », ou « expiré le 12 nov. ». */
function echeanceLisible(expire: number, maintenant = Date.now()): string {
  const reste = expire - maintenant
  if (reste <= 0) return t('partage.expireLe', { date: dateCourte(expire) })
  if (reste < 3600_000) return t('partage.expireHeure')
  if (reste < JOUR) return t('partage.expireHeures', { n: Math.round(reste / 3600_000) })
  const jours = Math.round(reste / JOUR)
  return jours < 14 ? tn('partage.expireDans', jours) : t('partage.jusquAu', { date: dateCourte(expire) })
}

/** « ouvert il y a 2 h », « jamais ouvert ». */
function visiteLisible(quand: number | null, maintenant = Date.now()): string {
  if (quand === null) return t('partage.jamaisOuvert')
  const s = Math.max(0, (maintenant - quand) / 1000)
  if (s < 3600) return t('partage.ouvertMinutes', { n: Math.max(1, Math.floor(s / 60)) })
  if (s < 86_400) return t('partage.ouvertHeures', { n: Math.floor(s / 3600) })
  return t('partage.ouvertLe', { date: dateCourte(quand) })
}

const copier = async (texte: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(texte)
    return true
  } catch {
    return false
  }
}

/** La pastille d'une ligne d'accès : l'initiale de la personne, ou l'icône d'une équipe, d'un lien. */
function PastilleAcces({ nom, icone }: { nom: string; icone?: 'equipe' | 'lien' }) {
  return (
    <span className="app-pastille app-pastille-neutre" aria-hidden>
      {icone ? <Icone nom={icone} taille={15} /> : ([...nom.trim()][0]?.toLocaleUpperCase() ?? '?')}
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

type Duree = 'jamais' | '1' | '7' | '30' | 'date'
const DUREES: Exclude<Duree, 'date'>[] = ['jamais', '1', '7', '30']

/** La fin du jour choisi (23 h 59, heure de l'appareil) : « jusqu'au 12 » laisse tout le 12. */
const finDuJour = (jour: string) => new Date(`${jour}T23:59:59`).getTime()
const jourDe = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Jusqu'à quand : sans limite, un jour, une semaine, un mois, ou jusqu'à une date. `valeur` : l'échéance (ms) ou
 * `null` ; une échéance déjà posée se montre par sa date.
 */
function ChoixEcheance({ valeur, changer, libelle, id, depart }: { valeur: number | null; changer(v: number | null): void; libelle: string; id?: string; depart?: Duree }) {
  const [duree, setDuree] = useState<Duree>(depart ?? (valeur === null ? 'jamais' : 'date'))
  const [jour, setJour] = useState(valeur === null ? jourDe(Date.now() + 7 * JOUR) : jourDe(valeur))
  const demain = jourDe(Date.now() + JOUR)
  const choisir = (d: Duree) => {
    setDuree(d)
    if (d === 'jamais') changer(null)
    else if (d === 'date') changer(finDuJour(jour))
    else changer(Date.now() + Number(d) * JOUR)
  }
  return (
    <span className="partage-echeance">
      <select id={id} className="champ" aria-label={libelle} value={duree} onChange={(e) => choisir(e.target.value as Duree)}>
        {DUREES.map((d) => (
          <option key={d} value={d}>
            {d === 'jamais' ? t('partage.sansLimite') : tn('partage.pendant', Number(d))}
          </option>
        ))}
        <option value="date">{t('partage.jusquAuChoix')}</option>
      </select>
      {duree === 'date' && (
        <input
          type="date"
          className="champ"
          aria-label={t('partage.dateFin')}
          min={demain}
          value={jour}
          onChange={(e) => {
            setJour(e.target.value)
            if (e.target.value) changer(finDuJour(e.target.value))
          }}
        />
      )}
    </span>
  )
}

/** Les équipes des espaces d'équipe dont on est membre : on peut leur partager un tableau. */
async function equipesPossibles(): Promise<(EquipeEspace & { espace: string })[]> {
  const espaces = (await listerEspaces()).filter((e) => !e.personnel)
  const listes = await Promise.all(espaces.map(async (e) => (await listerEquipes(e.id).catch(() => [])).map((q) => ({ ...q, espace: e.nom }))))
  return listes.flat()
}

/** Le bouton « Partager » et son panneau. */
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

/**
 * Le même panneau en fenêtre, au centre : la bibliothèque le propose au clic droit sur une toile, le téléphone dans sa
 * feuille « ••• ». `protection` l'ouvre sur la protection de la toile (son mot de passe), dépliée.
 */
export function PartageEnFenetre({ tableau, moi, fermer, protection }: { tableau: string; moi: Moi; fermer(): void; protection?: boolean }) {
  const boite = useRef<HTMLDialogElement>(null)
  const appuiSurLeFond = useRef(false)
  useEffect(() => {
    const d = boite.current
    if (d && !d.open) d.showModal?.()
    return () => {
      if (d?.open) d.close?.()
    }
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
      onPointerDown={(e) => {
        appuiSurLeFond.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (appuiSurLeFond.current && e.target === e.currentTarget) fermer()
        appuiSurLeFond.current = false
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Panneau tableau={tableau} moi={moi} reference={() => {}} enFenetre {...(protection ? { protection } : {})} />
    </dialog>
  )
}

/** Ce qu'il reste à faire après une invitation : le lien à transmettre, s'il n'est pas parti tout seul. */
type Suite = { email: string } & ReponsePartage

function Panneau({ tableau, moi, reference, enFenetre, protection }: { tableau: string; moi: Moi; reference(el: HTMLElement | null): void; enFenetre?: boolean; protection?: boolean }) {
  const [acces, setAcces] = useState<Acces[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const charger = useCallback(() => {
    listerAcces(tableau).then(setAcces, (x: Error) => setErreur(x.message))
  }, [tableau])
  useEffect(charger, [charger])
  const proprietaire = acces?.some((a) => a.utilisateur === moi.id && a.role === 'proprietaire') ?? false

  return (
    <div className="app-panneau partage-panneau" ref={reference} role={enFenetre ? undefined : 'dialog'} aria-label={enFenetre ? undefined : t('partage.titre')}>
      <div className="app-panneau-tete">{t('partage.titre')}</div>
      {proprietaire && <Inviter tableau={tableau} apres={charger} />}
      <Personnes tableau={tableau} moi={moi} acces={acces} proprietaire={proprietaire} recharger={charger} />
      {acces && !proprietaire && <p className="partage-note">{t('partage.seulProprio')}</p>}
      {proprietaire && <LiensVisiteurs tableau={tableau} />}
      {proprietaire && (
        <details className="partage-avance" open={protection || undefined}>
          <summary>
            <Icone nom="chevronDroite" taille={14} />
            {t('partage.protection')}
          </summary>
          <MotDePasse tableau={tableau} />
          <Blocages tableau={tableau} />
        </details>
      )}
      {erreur && (
        <p className="connexion-erreur" role="alert">
          {erreur}
        </p>
      )}
    </div>
  )
}

/** Inviter une adresse ou une équipe : un rôle, et une durée si l'accès ne doit pas durer. */
function Inviter({ tableau, apres }: { tableau: string; apres(): void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<RoleDonne>('edition')
  const [expire, setExpire] = useState<number | null>(null)
  // À qui : une adresse (`''`) ou une équipe (son identifiant).
  const [equipe, setEquipe] = useState('')
  const [equipes, setEquipes] = useState<(EquipeEspace & { espace: string })[]>([])
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [suite, setSuite] = useState<Suite | null>(null)
  useEffect(() => {
    void equipesPossibles().then(setEquipes, () => {})
  }, [])

  const envoyer = (e: FormEvent) => {
    e.preventDefault()
    const adresse = email.trim().toLowerCase()
    if (!equipe && !/^[^\s@]+@[^\s@]+$/.test(adresse)) return setErreur(t('connexion.adresseInvalide'))
    setErreur(null)
    setSuite(null)
    setOccupe(true)
    partager(tableau, equipe ? { equipe } : { email: adresse }, role, expire).then(
      (r) => {
        setOccupe(false)
        if (!equipe) setEmail('')
        if (r.enAttente) setSuite({ email: adresse, ...r })
        apres()
      },
      (x: Error) => {
        setOccupe(false)
        setErreur(x.message)
      },
    )
  }

  return (
    <form className="partage-form" onSubmit={envoyer} noValidate>
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
      <div className="partage-form-ligne">
        {!equipe && (
          <input type="email" placeholder={t('connexion.adresse')} aria-label={t('partage.adresseInviter')} value={email} onChange={(e) => setEmail(e.target.value)} />
        )}
        <button type="submit" className="bouton bouton-plein" disabled={occupe || (!equipe && !email.trim())}>
          {t('partage.inviter')}
        </button>
      </div>
      <div className="partage-form-ligne partage-form-reglages">
        <select value={role} aria-label={t('partage.droit')} onChange={(e) => setRole(e.target.value as RoleDonne)}>
          <option value="edition">{t('partage.edition')}</option>
          <option value="commentaire">{t('partage.commentaire')}</option>
          <option value="lecture">{t('partage.lecture')}</option>
        </select>
        <ChoixEcheance valeur={expire} changer={setExpire} libelle={t('partage.dureeAcces')} />
      </div>
      {suite && <SuiteInvitation suite={suite} />}
      {erreur && (
        <p className="connexion-erreur" role="alert">
          {erreur}
        </p>
      )}
    </form>
  )
}

/**
 * L'invitation est faite, l'accès pas encore : elle est partie par courriel, ou il faut donner son lien soi-même.
 * Le lien ne se montre qu'ici : le serveur n'en garde que l'empreinte.
 */
function SuiteInvitation({ suite }: { suite: Suite }) {
  const [copie, setCopie] = useState<boolean | null>(null)
  return (
    <div className="partage-suite" role="status">
      <Icone nom={suite.envoye ? 'courrier' : 'lien'} taille={16} />
      <div>
        <p>{suite.envoye ? t('partage.invitationEnvoyee', { email: suite.email }) : t('partage.invitationADonner', { email: suite.email })}</p>
        {suite.inscriptionsFermees && <p className="partage-note">{t('partage.inscriptionsFermees')}</p>}
        {suite.jeton && (
          <button type="button" className="bouton-lien" onClick={async () => setCopie(await copier(adresseInvitation(suite.jeton!)))}>
            {copie ? t('partage.lienCopie') : t('partage.copierLienInvitation')}
          </button>
        )}
        {copie === false && <p className="connexion-erreur">{t('partage.copieImpossible')}</p>}
      </div>
    </div>
  )
}

/** Qui a accès : les comptes, les équipes, les invitations en attente ; le propriétaire change un rôle, une durée. */
function Personnes({ tableau, moi, acces, proprietaire, recharger }: { tableau: string; moi: Moi; acces: Acces[] | null; proprietaire: boolean; recharger(): void }) {
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [duree, setDuree] = useState<string | null>(null)
  const [copie, setCopie] = useState<string | null>(null)
  const agir = async (f: () => Promise<unknown>) => {
    setErreur(null)
    setOccupe(true)
    try {
      await f()
      recharger()
    } catch (x) {
      setErreur(x instanceof Error ? x.message : t('commun.echec'))
    } finally {
      setOccupe(false)
    }
  }
  const cibleDe = (a: Acces): Cible => (a.equipe ? { equipe: a.equipe } : { email: a.email })
  const cle = (a: Acces) => a.equipe ?? a.utilisateur ?? a.email

  return (
    <>
      <div className="partage-rubrique">{t('partage.personnes')}</div>
      <ul className="partage-liste">
        {acces?.map((a) => {
          const modifiable = proprietaire && a.role !== 'proprietaire' && !a.herite
          const nom = a.nom || a.email
          const detail = [
            a.utilisateur === moi.id ? t('partage.vous') : a.equipe ? t('partage.equipe') : a.nom && a.email ? a.email : '',
            a.enAttente ? (a.invitation?.valable === false ? t('partage.invitationExpiree') : t('partage.invitationEnAttente')) : '',
            a.herite ? t('partage.parent') : '',
            a.expire ? echeanceLisible(a.expire) : '',
          ].filter(Boolean)
          return (
            <li key={cle(a)} className={a.enAttente ? 'partage-attente' : undefined}>
              <PastilleAcces nom={nom} icone={a.equipe ? 'equipe' : undefined} />
              <span className="partage-qui">
                <strong>{nom}</strong>
                {detail.length > 0 && <small>{detail.join(' · ')}</small>}
                {a.enAttente && proprietaire && (
                  <button
                    type="button"
                    className="bouton-lien partage-qui-action"
                    disabled={occupe}
                    onClick={() =>
                      agir(async () => {
                        const r = await nouveauLienInvitation(tableau, a.email)
                        setCopie((await copier(adresseInvitation(r.jeton))) ? a.email : null)
                      })
                    }
                  >
                    {copie === a.email ? t('partage.lienCopie') : t('partage.nouveauLienInvitation')}
                  </button>
                )}
              </span>
              {modifiable ? (
                <>
                  <select
                    className="partage-role-choix"
                    aria-label={`${t('partage.droit')} · ${nom}`}
                    value={a.role}
                    disabled={occupe}
                    onChange={(e) => void agir(() => modifierAcces(tableau, cibleDe(a), { role: e.target.value as RoleDonne }))}
                  >
                    <option value="edition">{t('partage.edition')}</option>
                    <option value="commentaire">{t('partage.commentaire')}</option>
                    <option value="lecture">{t('partage.lecture')}</option>
                  </select>
                  <button
                    type="button"
                    className="app-icone-bouton"
                    aria-label={`${t('partage.dureeAcces')} · ${nom}`}
                    title={t('partage.dureeAcces')}
                    aria-expanded={duree === cle(a)}
                    onClick={() => setDuree(duree === cle(a) ? null : cle(a))}
                  >
                    <Icone nom="horloge" taille={16} />
                  </button>
                  <Retirer libelle={`${t('partage.retirer')} ${nom}`} disabled={occupe} onClick={() => agir(() => retirerAcces(tableau, cibleDe(a)))} />
                </>
              ) : (
                <span className="partage-role">{LIBELLE_ROLE[a.role]()}</span>
              )}
              {duree === cle(a) && (
                <div className="partage-ligne-reglage">
                  <span className="partage-note">{t('partage.accesJusqua')}</span>
                  <ChoixEcheance
                    valeur={a.expire ?? null}
                    libelle={`${t('partage.dureeAcces')} · ${nom}`}
                    changer={(expire) => void agir(() => modifierAcces(tableau, cibleDe(a), { expire }))}
                  />
                </div>
              )}
            </li>
          )
        })}
        {!acces && !erreur && (
          <li className="partage-vide">
            <span className="notak-roue" aria-hidden />
          </li>
        )}
      </ul>
      {erreur && (
        <p className="connexion-erreur" role="alert">
          {erreur}
        </p>
      )}
    </>
  )
}

const libelleNiveau = (n: NiveauVisiteur) => (n === 'commentaire' ? t('partage.visiteurCommente') : t('partage.visiteurVoit'))

/** Voir, ou voir et commenter : deux boutons côte à côte, l'un enfoncé. */
function ChoixNiveau({ valeur, changer, disabled }: { valeur: NiveauVisiteur; changer(n: NiveauVisiteur): void; disabled?: boolean }) {
  return (
    <span className="partage-segments" role="radiogroup" aria-label={t('partage.lienPermet')}>
      {(['lecture', 'commentaire'] as const).map((n) => (
        <button key={n} type="button" role="radio" aria-checked={valeur === n} disabled={disabled} onClick={() => changer(n)}>
          <Icone nom={n === 'lecture' ? 'oeil' : 'commentaire'} taille={14} />
          {libelleNiveau(n)}
        </button>
      ))}
    </span>
  )
}

/** Les liens visiteurs du tableau : chacun pour quelqu'un sans compte, qui voit ou commente, et rien d'autre. */
function LiensVisiteurs({ tableau }: { tableau: string }) {
  const [liens, setLiens] = useState<LienVisiteur[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [nouveau, setNouveau] = useState(false)
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [copie, setCopie] = useState<string | null>(null)
  const charger = useCallback(() => {
    listerLiens(tableau).then(setLiens, (x: Error) => setErreur(x.message))
  }, [tableau])
  useEffect(charger, [charger])
  const copierLien = async (l: LienVisiteur) => {
    setErreur(null)
    if (await copier(adressePublique(l.jeton))) return setCopie(l.id)
    // Le presse-papiers refuse : l'adresse se montre, dépliée, pour qu'on la sélectionne.
    setOuvert(l.id)
    setErreur(t('partage.copieImpossible'))
  }
  const remplacer = (l: LienVisiteur) => setLiens((avant) => avant?.map((x) => (x.id === l.id ? l : x)) ?? [l])

  return (
    <section className="partage-section">
      <div className="partage-rubrique">
        <span>{t('partage.liensVisiteurs')}</span>
        {!nouveau && (
          <button type="button" className="bouton" onClick={() => setNouveau(true)}>
            <Icone nom="ajouter" taille={14} />
            {t('partage.nouveauLien')}
          </button>
        )}
      </div>
      <p className="partage-note">{t('partage.liensVisiteursNote')}</p>
      {nouveau && (
        <NouveauLien
          tableau={tableau}
          annuler={() => setNouveau(false)}
          cree={(l) => {
            setNouveau(false)
            setLiens((avant) => [...(avant ?? []), l])
            // Déplié, il montre son adresse : la copie qui suit peut échouer, le geste de l'utilisateur étant passé.
            setOuvert(l.id)
            void copier(adressePublique(l.jeton)).then((ok) => ok && setCopie(l.id))
          }}
        />
      )}
      {liens && liens.length > 0 && (
        <ul className="partage-liste partage-liens">
          {liens.map((l) => (
            <li key={l.id} className={l.echu ? 'partage-echu' : undefined}>
              <div className="partage-lien-tete">
                <PastilleAcces nom={l.nom} icone="lien" />
                <button type="button" className="partage-qui partage-lien-ouvrir" aria-expanded={ouvert === l.id} onClick={() => setOuvert(ouvert === l.id ? null : l.id)}>
                  <strong>{l.nom || t('partage.lienSansNom')}</strong>
                  <small>
                    {[libelleNiveau(l.niveau), l.expire ? echeanceLisible(l.expire) : t('partage.sansLimite'), l.protege ? t('partage.protegeCourt') : '', visiteLisible(l.derniereVisite)]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </button>
                <button type="button" className="bouton" disabled={l.echu} title={l.echu ? t('partage.lienEchuCopie') : undefined} onClick={() => void copierLien(l)}>
                  {copie === l.id ? t('partage.copie') : t('partage.copier')}
                </button>
              </div>
              {ouvert === l.id && (
                <ReglagesLien
                  copie={copie === l.id}
                  copierLien={() => void copierLien(l)}
                  tableau={tableau}
                  lien={l}
                  change={remplacer}
                  ferme={() => {
                    setOuvert(null)
                    setLiens((avant) => avant?.filter((x) => x.id !== l.id) ?? null)
                  }}
                />
              )}
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
  )
}

/** Un lien neuf : pour qui, ce qu'il permet, jusqu'à quand (un mois, par défaut), et un mot de passe s'il le faut. */
function NouveauLien({ tableau, annuler, cree }: { tableau: string; annuler(): void; cree(l: LienVisiteur): void }) {
  const [nom, setNom] = useState('')
  const [niveau, setNiveau] = useState<NiveauVisiteur>('lecture')
  const [expire, setExpire] = useState<number | null>(() => Date.now() + 30 * JOUR)
  const [motDePasse, setMotDePasse] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const id = useId()
  const envoyer = (e: FormEvent) => {
    e.preventDefault()
    if (motDePasse && motDePasse.length < 6) return setErreur(t('partage.mdp6'))
    setErreur(null)
    setOccupe(true)
    creerLien(tableau, { nom: nom.trim(), niveau, expire, ...(motDePasse ? { motDePasse } : {}) }).then(cree, (x: Error) => {
      setOccupe(false)
      setErreur(x.message)
    })
  }
  return (
    <form className="partage-carte" onSubmit={envoyer} noValidate>
      <label className="partage-champ">
        <span>{t('partage.pourQui')}</span>
        <input className="champ" maxLength={60} placeholder={t('partage.pourQuiExemple')} value={nom} onChange={(e) => setNom(e.target.value)} autoFocus />
      </label>
      <div className="partage-champ">
        <span>{t('partage.lienPermet')}</span>
        <ChoixNiveau valeur={niveau} changer={setNiveau} />
        <small className="partage-note">{niveau === 'commentaire' ? t('partage.visiteurCommenteNote') : t('partage.visiteurVoitNote')}</small>
      </div>
      <div className="partage-champ">
        <label htmlFor={id}>{t('partage.lienExpire')}</label>
        <ChoixEcheance id={id} valeur={expire} depart="30" changer={setExpire} libelle={t('partage.lienExpire')} />
      </div>
      <label className="partage-champ">
        <span>{t('partage.mdpFacultatif')}</span>
        <input className="champ" type="password" autoComplete="new-password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
      </label>
      {erreur && (
        <p className="connexion-erreur" role="alert">
          {erreur}
        </p>
      )}
      <div className="partage-carte-pied">
        <button type="button" className="bouton" onClick={annuler}>
          {t('commun.annuler')}
        </button>
        <button type="submit" className="bouton bouton-plein" disabled={occupe}>
          {t('partage.creerEtCopier')}
        </button>
      </div>
    </form>
  )
}

/** Les réglages d'un lien, dépliés sous lui : son nom, ce qu'il permet, son échéance, son mot de passe ; le fermer. */
function ReglagesLien({
  tableau,
  lien,
  change,
  ferme,
  copie,
  copierLien,
}: {
  tableau: string
  lien: LienVisiteur
  change(l: LienVisiteur): void
  ferme(): void
  copie: boolean
  copierLien(): void
}) {
  const [nom, setNom] = useState(lien.nom)
  const [motDePasse, setMotDePasse] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [confirmer, setConfirmer] = useState(false)
  const agir = async (f: () => Promise<LienVisiteur | void>) => {
    setErreur(null)
    setOccupe(true)
    try {
      const l = await f()
      if (l) change(l)
    } catch (x) {
      setErreur(x instanceof Error ? x.message : t('commun.echec'))
    } finally {
      setOccupe(false)
    }
  }
  return (
    <div className="partage-carte">
      <div className="partage-champ">
        <span>{t('partage.adresseLien')}</span>
        <span className="partage-adresse">
          <input className="champ" readOnly aria-label={t('partage.adresseLien')} value={adressePublique(lien.jeton)} onFocus={(e) => e.target.select()} />
          <button type="button" className="bouton" disabled={lien.echu} onClick={copierLien}>
            {copie ? t('partage.copie') : t('partage.copier')}
          </button>
        </span>
      </div>
      <label className="partage-champ">
        <span>{t('partage.pourQui')}</span>
        <input
          className="champ"
          maxLength={60}
          placeholder={t('partage.pourQuiExemple')}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          onBlur={() => nom.trim() !== lien.nom && void agir(() => modifierLien(tableau, lien.id, { nom: nom.trim() }))}
        />
      </label>
      <div className="partage-champ">
        <span>{t('partage.lienPermet')}</span>
        <ChoixNiveau valeur={lien.niveau} disabled={occupe} changer={(niveau) => niveau !== lien.niveau && void agir(() => modifierLien(tableau, lien.id, { niveau }))} />
      </div>
      <div className="partage-champ">
        <span>{t('partage.lienExpire')}</span>
        <ChoixEcheance valeur={lien.expire} libelle={t('partage.lienExpire')} changer={(expire) => void agir(() => modifierLien(tableau, lien.id, { expire }))} />
        {lien.echu && <small className="connexion-erreur">{t('partage.lienEchu')}</small>}
      </div>
      <form
        className="partage-champ"
        onSubmit={(e) => {
          e.preventDefault()
          if (motDePasse.length < 6) return setErreur(t('partage.mdp6'))
          void agir(async () => {
            const l = await motDePasseDuLien(tableau, lien.id, motDePasse)
            setMotDePasse('')
            return l
          })
        }}
      >
        <span>{lien.protege ? t('partage.lienMdpActif') : t('partage.mdpFacultatif')}</span>
        <span className="partage-lien-ligne">
          <input
            className="champ"
            type="password"
            autoComplete="new-password"
            aria-label={lien.protege ? t('partage.nouveauMdpLien') : t('partage.mdpLien')}
            placeholder={lien.protege ? t('partage.nouveauMdp') : ''}
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
          />
          <button type="submit" className="bouton" disabled={occupe || !motDePasse}>
            {lien.protege ? t('partage.changer') : t('partage.proteger')}
          </button>
        </span>
        {lien.protege && (
          <button type="button" className="bouton-lien" disabled={occupe} onClick={() => void agir(() => motDePasseDuLien(tableau, lien.id, null))}>
            {t('partage.retirerMdpLien')}
          </button>
        )}
      </form>
      {erreur && (
        <p className="connexion-erreur" role="alert">
          {erreur}
        </p>
      )}
      <div className="partage-carte-pied">
        {confirmer ? (
          <>
            <span className="partage-note">{t('partage.fermerLienConfirmer')}</span>
            <button type="button" className="bouton" onClick={() => setConfirmer(false)}>
              {t('commun.annuler')}
            </button>
            <button type="button" className="bouton bouton-danger" disabled={occupe} onClick={() => void agir(async () => (await fermerLien(tableau, lien.id), ferme()))}>
              {t('partage.fermerLien')}
            </button>
          </>
        ) : (
          <button type="button" className="bouton bouton-danger" onClick={() => setConfirmer(true)}>
            {t('partage.fermerLien')}
          </button>
        )}
      </div>
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
        <span className="partage-note">
          <span className="notak-roue" aria-hidden />
        </span>
      ) : (
        <>
          <span className="partage-note">{protege ? t('partage.mdpActif') : t('partage.mdpInactif')}</span>
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

const nomDuBlocage = (b: Blocage) => ('tous' in b ? t('partage.tousLeMonde') : b.nom)

/**
 * Bloquer le tableau (et ce qu'il contient) pour tout le monde sauf ses propriétaires, liens visiteurs compris ; un
 * blocage venu d'un tableau au-dessus se lève ici pour quelqu'un.
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
                <PastilleAcces nom={nomDuBlocage(b)} icone={'equipe' in b ? 'equipe' : undefined} />
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
