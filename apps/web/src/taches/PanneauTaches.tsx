import { Calendrier, Case, Icone, PanneauFlottant, formaterInstant, jourDe, libelleEcheance, t, tn, useFermeture } from '@notak/tableau'
import { type FormEvent, type MouseEvent, useCallback, useEffect, useId, useRef, useState } from 'react'
import { ErreurApi, ajouterTacheDuDossier, cocherTacheDuDossier, lireTachesDuDossier } from '../api'
import { useAuTelephone } from '../bibliotheque/AuDoigt'
import { ouvrirDehors } from '../bureau'
import { ecrireMemoire, lireMemoire, oublierMemoire } from './memoire'
import { type EtatPanneau, type LigneTache, avecTache, enRetard, grouper, initiales, sansTache } from './modele'
import './panneau.css'

/**
 * Le panneau « Tâches » du dossier d'une fiche (23/11/2026) : les tâches que l'outil (Silak) tient sur la fiche, au même
 * endroit que ce que le dossier range. Elles restent chez l'outil : le panneau les lit, en coche, en ajoute, et ouvre
 * chacune chez l'outil pour le reste (rappels, récurrence, description, attribution). Une fenêtre étroite, pas un second
 * éditeur de tâches.
 *
 * Il se relit à l'ouverture du dossier, au retour sur l'onglet ou la fenêtre, et quand le réseau revient. Hors ligne, ou
 * l'outil muet, il montre le dernier état connu sur cet appareil (`memoire.ts`) et dit de quand il date ; on n'y écrit
 * alors rien. Il ne paraît pas à qui l'outil ne l'ouvre pas (le serveur répond `disponible: false`). Au téléphone, il
 * se replie sous son titre, qui dit le compte et les retards.
 */

type Etat = EtatPanneau

/** Ce que le panneau montre, et d'où : de l'outil à l'instant `quand`, ou de la mémoire de l'appareil. */
interface Vu {
  panneau: Etat
  quand: number
  source: 'outil' | 'memoire'
}

/** On ne relit pas plus souvent qu'ainsi au retour sur l'onglet (un aller-retour rapide entre deux fenêtres). */
const RELIRE_APRES_MS = 4000

const deLaMemoire = (compte: string, dossier: string): Vu | null => {
  const m = lireMemoire(compte, dossier)
  return m ? { panneau: m.panneau, quand: m.quand, source: 'memoire' } : null
}

const messageDe = (e: unknown) => (e instanceof Error && e.message ? e.message : t('tachesOutil.erreur.injoignable'))

export function PanneauTaches({ dossier, compte, outil }: {
  /** Le dossier de la fiche. */
  dossier: string
  /** Le compte qui lit : la mémoire de l'appareil est la sienne. */
  compte: string
  /** Le nom de l'outil (« Silak »), tel que le dossier le dit, pour parler de lui avant sa première réponse. */
  outil: string
}) {
  const [vu, setVu] = useState<Vu | null>(() => deLaMemoire(compte, dossier))
  const [absent, setAbsent] = useState(false)
  /** La dernière lecture n'a pas abouti : hors ligne, ou l'outil (ou ce serveur) ne répond pas. */
  const [muet, setMuet] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [annonce, setAnnonce] = useState('')
  const [deplie, setDeplie] = useState(false)
  const auTelephone = useAuTelephone()
  const enVol = useRef<string | null>(null)
  const derniere = useRef(0)
  const actuel = useRef(dossier)
  actuel.current = dossier
  const idListe = useId()

  const relire = useCallback(
    async (force = false) => {
      const pour = dossier
      if (enVol.current === pour) return
      if (!force && Date.now() - derniere.current < RELIRE_APRES_MS) return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return setMuet(true)
      enVol.current = pour
      try {
        const p = await lireTachesDuDossier(pour)
        if (actuel.current !== pour) return
        derniere.current = Date.now()
        setMuet(false)
        if (!p.disponible) {
          setAbsent(true)
          setVu(null)
          oublierMemoire(compte, pour)
          return
        }
        setAbsent(false)
        setVu({ panneau: p, quand: Date.now(), source: 'outil' })
      } catch (e) {
        if (actuel.current !== pour) return
        // Le dossier n'est plus lisible (accès retiré) : rien à montrer, pas même la mémoire.
        if (e instanceof ErreurApi && e.statut === 404) {
          setAbsent(true)
          setVu(null)
          return
        }
        setMuet(true)
      } finally {
        if (enVol.current === pour) enVol.current = null
      }
    },
    [dossier, compte],
  )

  // Un autre dossier : on repart de ce que l'appareil sait de lui, puis on le relit.
  useEffect(() => {
    setVu(deLaMemoire(compte, dossier))
    setAbsent(false)
    setMuet(false)
    setErreur(null)
    derniere.current = 0
    void relire(true)
  }, [dossier, compte, relire])

  useEffect(() => {
    const revenir = () => document.visibilityState === 'visible' && void relire()
    const enLigne = () => void relire(true)
    document.addEventListener('visibilitychange', revenir)
    window.addEventListener('focus', revenir)
    window.addEventListener('online', enLigne)
    return () => {
      document.removeEventListener('visibilitychange', revenir)
      window.removeEventListener('focus', revenir)
      window.removeEventListener('online', enLigne)
    }
  }, [relire])

  // Ce que l'outil a dit, sans geste en attente, est gardé pour la prochaine fois qu'il ne répondra pas.
  useEffect(() => {
    if (vu?.source === 'outil' && !vu.panneau.taches.some((x) => x.attend)) ecrireMemoire(compte, dossier, vu.panneau, vu.quand)
  }, [vu, compte, dossier])

  const maj = (f: (p: Etat) => Etat, confirme = false) =>
    setVu((v) => v && { ...v, panneau: f(v.panneau), quand: confirme && v.source === 'outil' ? Date.now() : v.quand })

  if (absent || (vu === null && !muet)) return null

  const nom = vu?.panneau.outil ?? outil
  const p = vu?.panneau
  const aujourdhui = (vu?.source === 'outil' && p?.aujourdhui) || jourDe(new Date())
  const ecrire = Boolean(p?.ecrire) && vu?.source === 'outil' && !muet
  const pliable = auTelephone
  const ouvert = !pliable || deplie

  const cocher = async (tache: LigneTache, fait: boolean) => {
    if (!ecrire || tache.attend) return
    setErreur(null)
    maj((x) => avecTache(x, { ...tache, fait, enRetard: fait ? false : tache.enRetard, attend: 'cocher' }))
    try {
      const rendue = await cocherTacheDuDossier(dossier, tache.id, { id: crypto.randomUUID(), fait })
      maj((x) => avecTache(x, rendue), true)
      setAnnonce(
        rendue.fait
          ? t('tachesOutil.faite', { titre: rendue.titre })
          : fait && rendue.echeance
            ? t('tachesOutil.revient', { jour: libelleEcheance(rendue.echeance, aujourdhui).toLocaleLowerCase() })
            : t('tachesOutil.aFaire', { titre: rendue.titre }),
      )
    } catch (e) {
      maj((x) => avecTache(x, tache))
      setErreur(messageDe(e))
    }
  }

  const ajouter = async (titre: string, echeance: string | null): Promise<boolean> => {
    if (!ecrire) return false
    setErreur(null)
    const geste = crypto.randomUUID()
    maj((x) => avecTache(x, { id: geste, titre, fait: false, enRetard: false, echeance, recurrente: false, projet: null, personnes: [], lien: null, attend: 'ajouter' }))
    try {
      const rendue = await ajouterTacheDuDossier(dossier, { id: geste, titre, echeance })
      maj((x) => avecTache(x, rendue, geste), true)
      setAnnonce(t('tachesOutil.ajoutee', { outil: nom }))
      return true
    } catch (e) {
      maj((x) => sansTache(x, geste))
      setErreur(messageDe(e))
      return false
    }
  }

  const { datees, sansDate } = grouper(p?.taches ?? [])
  const retards = enRetard(p?.taches ?? [])
  const total = p?.total ?? 0
  const ligne = (tache: LigneTache) => <Ligne key={tache.id} tache={tache} aujourdhui={aujourdhui} outil={nom} ecrire={ecrire} cocher={cocher} />

  return (
    <section className="taches-outil" aria-label={t('tachesOutil.region', { outil: nom })} data-pliable={pliable ? '' : undefined} data-ouvert={ouvert ? '' : undefined}>
      <header className="taches-outil-tete">
        <h2 className="taches-outil-titre">
          {pliable ? (
            <button type="button" className="taches-outil-bascule" aria-expanded={ouvert} aria-controls={idListe} onClick={() => setDeplie((d) => !d)}>
              <TitreEtCompte total={total} retards={retards} />
              <Icone nom="chevronBas" taille={16} className="taches-outil-chevron" />
            </button>
          ) : (
            <TitreEtCompte total={total} retards={retards} />
          )}
        </h2>
        {p?.lien && (
          <a className="taches-outil-outil" href={p.lien} target="_blank" rel="noopener noreferrer" onClick={dehors(p.lien)}>
            {t('tachesOutil.dansOutil', { outil: nom })}
            <Icone nom="ouvrir" taille={14} />
          </a>
        )}
      </header>
      <div className="taches-outil-corps" id={idListe} hidden={!ouvert}>
        {muet && (
          <p className="taches-outil-bandeau">
            {vu
              ? t(typeof navigator !== 'undefined' && navigator.onLine === false ? 'tachesOutil.horsLigne' : 'tachesOutil.muet', { outil: nom, quand: formaterInstant(vu.quand) })
              : t('tachesOutil.injoignable', { outil: nom })}
            <button type="button" className="taches-outil-reessayer" onClick={() => void relire(true)}>
              {t('tachesOutil.reessayer')}
            </button>
          </p>
        )}
        {ecrire && <Ajout outil={nom} aujourdhui={aujourdhui} ajouter={ajouter} />}
        {erreur && (
          <p className="taches-outil-erreur" role="alert">
            {erreur}
          </p>
        )}
        {p && datees.length + sansDate.length === 0 && <p className="taches-outil-vide">{t('tachesOutil.vide')}</p>}
        {datees.length > 0 && <ul className="taches-outil-liste">{datees.map(ligne)}</ul>}
        {sansDate.length > 0 && (
          <>
            <h3 className="taches-outil-groupe">{t('tachesOutil.sansDate')}</h3>
            <ul className="taches-outil-liste">{sansDate.map(ligne)}</ul>
          </>
        )}
        {p && !p.complet && p.lien && (
          <a className="taches-outil-toutes" href={p.lien} target="_blank" rel="noopener noreferrer" onClick={dehors(p.lien)}>
            {tn('tachesOutil.toutes', total, { outil: nom })}
          </a>
        )}
      </div>
      <p className="taches-outil-annonce" role="status" aria-live="polite">
        {annonce}
      </p>
    </section>
  )
}

/** Un lien vers l'outil : hors de Notak, dans le navigateur (l'app de bureau et l'iPhone le confient au système). */
const dehors = (adresse: string) => (e: MouseEvent) => {
  e.preventDefault()
  ouvrirDehors(adresse)
}

function TitreEtCompte({ total, retards }: { total: number; retards: number }) {
  return (
    <>
      <span>{t('tachesOutil.titre')}</span>
      {total > 0 && <span className="taches-outil-compte">{total}</span>}
      {retards > 0 && <span className="taches-outil-retards">{tn('tachesOutil.enRetard', retards)}</span>}
    </>
  )
}

function Ligne({ tache, aujourdhui, outil, ecrire, cocher }: {
  tache: LigneTache
  aujourdhui: string
  outil: string
  ecrire: boolean
  cocher(tache: LigneTache, fait: boolean): void
}) {
  const personnes = tache.personnes.slice(0, 3)
  return (
    <li className="taches-outil-ligne" data-fait={tache.fait ? '' : undefined} data-attend={tache.attend ? '' : undefined}>
      <Case
        cochee={tache.fait}
        large
        aria-label={tache.titre}
        aria-readonly={!ecrire || Boolean(tache.attend)}
        onChange={(fait) => cocher(tache, fait)}
      />
      <span className="taches-outil-texte">
        {tache.lien ? (
          <a className="taches-outil-nom" href={tache.lien} target="_blank" rel="noopener noreferrer" title={t('tachesOutil.ouvrirDansOutil', { outil })} onClick={dehors(tache.lien)}>
            {tache.titre}
          </a>
        ) : (
          <span className="taches-outil-nom">{tache.titre}</span>
        )}
        {tache.projet && <span className="taches-outil-projet">{tache.projet}</span>}
      </span>
      {personnes.length > 0 && (
        <span className="taches-outil-personnes" role="img" aria-label={t('tachesOutil.personnes', { noms: personnes.join(', ') })}>
          {personnes.map((p) => (
            <span key={p} className="notak-av notak-av-24" title={p}>
              {initiales(p)}
            </span>
          ))}
        </span>
      )}
      {tache.echeance && (
        <span className="taches-outil-jour" data-retard={tache.enRetard ? '' : undefined}>
          {libelleEcheance(tache.echeance, aujourdhui)}
        </span>
      )}
    </li>
  )
}

/** L'ajout : un titre, et un jour si l'on veut. Entrée l'envoie ; le champ reste prêt pour la suivante. */
function Ajout({ outil, aujourdhui, ajouter }: { outil: string; aujourdhui: string; ajouter(titre: string, echeance: string | null): Promise<boolean> }) {
  const [texte, setTexte] = useState('')
  const [jour, setJour] = useState<string | null>(null)
  const [calendrier, setCalendrier] = useState(false)
  const bouton = useRef<HTMLButtonElement>(null)
  const fenetre = useRef<HTMLDivElement>(null)
  useFermeture({ racine: fenetre, ancre: bouton, actif: calendrier, fermer: () => setCalendrier(false) })

  const envoyer = async (e: FormEvent) => {
    e.preventDefault()
    const titre = texte.replace(/\s+/g, ' ').trim()
    if (!titre) return
    const echeance = jour
    setTexte('')
    setJour(null)
    if (!(await ajouter(titre, echeance))) {
      setTexte((x) => x || titre)
      setJour((j) => j ?? echeance)
    }
  }

  return (
    <form className="taches-outil-ajout" onSubmit={(e) => void envoyer(e)}>
      <Icone nom="ajouter" taille={16} className="taches-outil-plus" />
      <input
        className="taches-outil-champ"
        value={texte}
        maxLength={200}
        placeholder={t('tachesOutil.ajouter')}
        aria-label={t('tachesOutil.ajouter')}
        title={t('tachesOutil.ajouterAide', { outil })}
        enterKeyHint="done"
        onChange={(e) => setTexte(e.target.value)}
      />
      <button
        ref={bouton}
        type="button"
        className="taches-outil-choix-jour"
        data-pose={jour ? '' : undefined}
        aria-label={jour ? t('tachesOutil.echeance', { jour: libelleEcheance(jour, aujourdhui) }) : t('tachesOutil.fixerEcheance')}
        aria-expanded={calendrier}
        onClick={() => setCalendrier((o) => !o)}
      >
        <Icone nom="calendrier" taille={16} />
        {jour && <span>{libelleEcheance(jour, aujourdhui)}</span>}
      </button>
      {calendrier && (
        <PanneauFlottant cible={() => bouton.current} panneau={fenetre} surface cote="bas" className="taches-outil-calendrier" role="dialog" aria-label={t('tachesOutil.fixerEcheance')}>
          <Calendrier
            valeur={jour}
            aujourdhui={aujourdhui}
            effacable
            autoFocus
            choisir={(j) => {
              setJour(j)
              setCalendrier(false)
              bouton.current?.focus()
            }}
          />
        </PanneauFlottant>
      )}
    </form>
  )
}
