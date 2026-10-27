import { Icone, lireReglages, themeEffectif, useSystemeSombre } from '@notak/tableau'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type Acces, annulerJonction, estErreurCoque, joindreServeur, oublierServeur } from '../bureau'
import { t } from '../langue'
import { Marque } from '../PageApp'
import { type Echec, GUIDE, GUIDE_ORIGINE, concerneAdresse, surAppareil, echecDe, hoteDe, hoteSaisi, texteErreur } from './acces'
import { fermerDialogueAcces, relireAcces, useAcces, useDialogueAcces } from './etat'

/**
 * « Se connecter à un serveur Notak » : l'adresse du serveur, ce qu'il y a à faire quand il ne répond pas comme il faut,
 * et de quoi ouvrir les toiles de cet ordinateur ou oublier le serveur mémorisé. Le même formulaire sert d'écran entier
 * (la porte de l'app, `?acces`) et de fenêtre ouverte depuis l'édition locale.
 *
 * La page n'envoie jamais la fenêtre ailleurs d'elle-même : c'est la coque qui vérifie l'adresse, et elle la relit.
 * Pendant « Connexion… », « Annuler » arrête la jonction, comme la fermeture du formulaire : renoncer ne mène pas chez
 * le serveur. Sur l'écran entier, « Toiles de cet ordinateur » reste une sortie : sans menu (Windows, Linux), c'est la
 * seule tant qu'un serveur tarde.
 */

export interface PropsAcces {
  /** Les réglages de la coque : le serveur mémorisé, et où s'ouvre Notak. */
  acces: Acces | null
  mode: 'ecran' | 'dialogue'
  /** Ce qui a ramené ici, dit dès l'ouverture : le serveur mémorisé n'a pas répondu. */
  echecInitial?: Echec | undefined
  /** « Toiles de cet ordinateur » (l'écran entier) : l'édition locale prend la place, pour cette fois. */
  surLocal(): void
  /** La fenêtre se ferme sans rien choisir. */
  surFermer?(): void
}

export function FormulaireAcces({ acces, mode, echecInitial, surLocal, surFermer }: PropsAcces) {
  const id = useId()
  const [adresse, setAdresse] = useState(acces?.serveur ?? '')
  /** L'hôte qu'on est en train de joindre ; la coque vérifie, puis y envoie la fenêtre. */
  const [occupe, setOccupe] = useState<string | null>(null)
  /** Une jonction lancée d'ici, la fenêtre pas encore partie : la fermeture du formulaire l'arrête. */
  const enCours = useRef(false)
  /** La tentative en cours : une jonction annulée qui finit plus tard (sur `annule`) ne touche pas à la suivante. */
  const tentative = useRef(0)
  const [echec, setEchec] = useState<Echec | null>(echecInitial ?? null)
  const [retenu, setRetenu] = useState(acces?.serveur ?? null)
  const [ouvrirServeur, setOuvrirServeur] = useState(acces?.ouvrir === 'serveur' && !!acces.serveur)
  const [oubli, setOubli] = useState<'non' | 'confirme' | 'cours'>('non')
  const [avis, setAvis] = useState<string | null>(null)
  const champ = useRef<HTMLInputElement>(null)
  const utiliser = useRef<HTMLButtonElement>(null)
  const demander = useRef<HTMLButtonElement>(null)
  const annuler = useRef<HTMLButtonElement>(null)
  const arreter = useRef<HTMLButtonElement>(null)
  const bloque = occupe !== null
  const hote = retenu ? hoteDe(retenu) : ''

  // Échap, la croix ou le voile pendant « Connexion… » démontent la fenêtre : la coque n'emmène pas la fenêtre pour
  // autant (et ne retient pas ce serveur).
  useEffect(
    () => () => {
      if (enCours.current) void annulerJonction().catch((e: unknown) => console.warn('Notak : la connexion en cours n’a pas pu être arrêtée', e))
    },
    [],
  )

  // Une erreur ramène le curseur là où elle se corrige : le champ, ou le bouton qui propose la bonne adresse.
  useEffect(() => {
    if (!echec) return
    if (echec.code === 'redirige') utiliser.current?.focus()
    else champ.current?.focus()
  }, [echec])

  // Le bouton pressé (« Se connecter », « Utiliser ») est pris pendant « Connexion… » : le curseur va à « Annuler », la
  // sortie ; et revient au champ quand on a annulé.
  const occupeAvant = useRef(occupe)
  useEffect(() => {
    if (occupe !== null && occupeAvant.current === null) arreter.current?.focus()
    else if (occupe === null && occupeAvant.current !== null && document.activeElement === document.body) champ.current?.focus()
    occupeAvant.current = occupe
  }, [occupe])

  // Oublier demande confirmation : le curseur va à « Annuler », et revient à « Oublier » si l'on renonce.
  const avant = useRef(oubli)
  useEffect(() => {
    if (oubli === 'confirme') annuler.current?.focus()
    else if (avant.current === 'confirme' && oubli === 'non') demander.current?.focus()
    avant.current = oubli
  }, [oubli])

  const connecter = async (cible: string) => {
    if (bloque) return
    const saisie = cible.trim()
    if (!saisie) return setEchec({ code: 'adresse_invalide' })
    setEchec(null)
    setAvis(null)
    setOccupe(hoteSaisi(saisie))
    // Jusqu'à ce que la page du serveur remplace celle-ci : réussie, la jonction a seulement lancé la fenêtre.
    enCours.current = true
    const n = ++tentative.current
    try {
      // Réussie, la fenêtre part chez le serveur : le bouton reste « Connexion… » jusque-là.
      await joindreServeur(saisie, true)
    } catch (e) {
      if (n !== tentative.current) return
      enCours.current = false
      setOccupe(null)
      // Arrêtée parce qu'on a renoncé (« Annuler », la fenêtre fermée, le menu) : il n'y a rien à reprocher.
      if (!(estErreurCoque(e) && e.code === 'annule')) setEchec(echecDe(e))
    }
  }

  /**
   * Arrête la jonction en cours. La coque rend vrai si la fenêtre était déjà partie : elle la ramène à `ecran`, et cette
   * page va être remplacée. Sinon, le formulaire se rend tout de suite, sans attendre que la vérification finisse.
   */
  const renoncer = async (ecran: 'local' | 'acces'): Promise<boolean> => {
    enCours.current = false
    tentative.current++
    try {
      if (await annulerJonction(ecran)) return true
    } catch (e) {
      console.warn('Notak : la connexion en cours n’a pas pu être arrêtée', e)
    }
    setOccupe(null)
    return false
  }
  const toilesDIci = async () => {
    if (bloque && (await renoncer('local'))) return
    surLocal()
  }
  const envoyer = (e: FormEvent) => {
    e.preventDefault()
    void connecter(adresse)
  }
  const utiliserCelle = (vers: string) => {
    setAdresse(vers)
    void connecter(vers)
  }

  const oublier = async () => {
    if (!retenu) return
    const oublie = retenu
    setOubli('cours')
    try {
      await oublierServeur()
    } catch (e) {
      setEchec(echecDe(e))
      setOubli('non')
      return
    }
    setAdresse((a) => (a === oublie ? '' : a))
    setRetenu(null)
    setOuvrirServeur(false)
    setOubli('non')
    setEchec(null)
    setAvis(t('bureau.acces.oublie', { hote: hoteDe(oublie) }))
    champ.current?.focus()
    void relireAcces()
  }

  const Titre = mode === 'ecran' ? 'h1' : 'h2'
  const idErreur = `${id}-erreur`
  const idAide = `${id}-aide`
  return (
    <form className="connexion-carte acces-carte" onSubmit={envoyer} noValidate aria-labelledby={`${id}-titre`}>
      {mode === 'ecran' && <Marque />}
      <div className="acces-tete">
        <Titre id={`${id}-titre`}>{t('bureau.acces.titre')}</Titre>
        {mode === 'dialogue' && surFermer && (
          <button type="button" className="app-icone-bouton" aria-label={t('commun.fermer')} onClick={surFermer}>
            <Icone nom="fermer" taille={16} />
          </button>
        )}
      </div>

      <label>
        {t('bureau.acces.champ')}
        <input
          ref={champ}
          type="url"
          name="adresse"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          readOnly={bloque}
          value={adresse}
          placeholder={t('bureau.acces.exemple')}
          onChange={(e) => setAdresse(e.target.value)}
          aria-invalid={(echec && concerneAdresse(echec)) || undefined}
          aria-describedby={[idAide, echec && idErreur].filter(Boolean).join(' ')}
        />
      </label>
      <small id={idAide} className="connexion-indice">
        {t('bureau.acces.aide')}
      </small>

      {echec && (
        <p id={idErreur} className="connexion-erreur" role="alert">
          {texteErreur(echec, hote)}
        </p>
      )}
      {echec?.code === 'redirige' && (
        <button ref={utiliser} type="button" className="bouton bouton-plein" disabled={bloque} onClick={() => utiliserCelle(echec.vers)}>
          {t('bureau.erreur.redirigeUtiliser', { vers: echec.vers })}
        </button>
      )}
      {echec?.code === 'mal_regle' && (
        <a className="bouton-lien acces-guide" href={GUIDE_ORIGINE} target="_blank" rel="noopener noreferrer">
          {t('bureau.erreur.mal_regleGuide')}
        </a>
      )}
      {avis && (
        <p className="connexion-avis" role="status">
          {avis}
        </p>
      )}
      {occupe !== null && (
        <p className="connexion-avis acces-attente" role="status">
          <span className="bureau-roue" aria-hidden />
          {t('bureau.porte.connexion', { hote: occupe })}
        </p>
      )}

      <button type="submit" className="bouton bouton-plein" disabled={bloque}>
        {t(occupe !== null ? 'bureau.acces.connexion' : 'bureau.acces.seConnecter')}
      </button>
      {occupe !== null && (
        // Déjà partie, la fenêtre revient là d'où l'on venait : l'écran d'accès, ou les toiles d'ici sous la fenêtre.
        <button ref={arreter} type="button" className="bouton" onClick={() => void renoncer(mode === 'ecran' ? 'acces' : 'local')}>
          {t('commun.annuler')}
        </button>
      )}
      <a className="bouton-lien acces-guide" href={GUIDE} target="_blank" rel="noopener noreferrer">
        {t('bureau.acces.guide')}
      </a>

      <div className="acces-autres">
        <p className="connexion-aide">{t(surAppareil() ? 'bureau.acces.deuxLieux.appareil' : 'bureau.acces.deuxLieux')}</p>
        {/* Dans la fenêtre, on est déjà sur les toiles d'ici ; où Notak s'ouvre se règle dans les réglages de l'app. */}
        {mode === 'ecran' && (
          <>
            <button type="button" className="bouton" onClick={() => void toilesDIci()}>
              {t(surAppareil() ? 'bureau.acces.local.appareil' : 'bureau.acces.local')}
            </button>
            {ouvrirServeur && <small className="connexion-indice">{t(surAppareil() ? 'bureau.acces.localAide.appareil' : 'bureau.acces.localAide', { hote })}</small>}
          </>
        )}
        {retenu && (
          <div className="acces-retenu">
            <p className="connexion-aide">{t('bureau.acces.retenu', { hote })}</p>
            {oubli === 'non' ? (
              <button ref={demander} type="button" className="bouton-lien acces-oublier" disabled={bloque} onClick={() => setOubli('confirme')}>
                {t('bureau.acces.oublier')}
              </button>
            ) : (
              <div className="acces-confirme" role="group" aria-labelledby={`${id}-oubli`}>
                <p id={`${id}-oubli`} className="connexion-aide">
                  {t(surAppareil() ? 'bureau.acces.oublierConfirme.appareil' : 'bureau.acces.oublierConfirme', { hote })}
                </p>
                <div className="acces-actions">
                  <button ref={annuler} type="button" className="bouton" disabled={oubli === 'cours'} onClick={() => setOubli('non')}>
                    {t('commun.annuler')}
                  </button>
                  <button type="button" className="bouton bouton-danger" disabled={oubli === 'cours'} onClick={() => void oublier()}>
                    {t('bureau.acces.oublierOui')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </form>
  )
}

/** La porte de l'app : l'écran entier, au thème de l'appareil, avant même que l'édition locale ne soit là. */
export function EcranAcces(props: Omit<PropsAcces, 'mode'>) {
  const [reglages] = useState(lireReglages)
  const theme = themeEffectif(reglages.theme, useSystemeSombre())
  return (
    <div className="notak-espace" data-theme={theme}>
      <main className="connexion">
        <FormulaireAcces mode="ecran" {...props} />
      </main>
    </div>
  )
}

/**
 * La même chose, en fenêtre modale par-dessus l'édition locale (`ouvrirDialogueAcces`). Les réglages de l'app gardent le
 * clavier pour eux (Tab, Échap) : tant que la fenêtre est ouverte, ce qui s'y tape ne leur parvient pas. Elle se ferme
 * par `close()`, qui rend le curseur à ce qui l'avait avant elle, puis se démonte (`onClose`).
 */
export function DialogueAcces() {
  const ouvert = useDialogueAcces()
  const { acces } = useAcces()
  const dialogue = useRef<HTMLDialogElement>(null)
  const fermer = () => (dialogue.current?.open ? dialogue.current.close() : fermerDialogueAcces())

  useEffect(() => {
    const d = dialogue.current
    if (!ouvert || !d) return
    if (!d.open) d.showModal()
    // La première chose focalisable de la fenêtre serait sa croix : le curseur est dans le champ de l'adresse.
    d.querySelector('input')?.focus()
    const garder = (e: KeyboardEvent) => {
      if (e.target instanceof Node && d.contains(e.target)) e.stopPropagation()
    }
    window.addEventListener('keydown', garder, true)
    return () => window.removeEventListener('keydown', garder, true)
  }, [ouvert])

  if (!ouvert) return null
  // Dans l'espace : la fenêtre prend son thème.
  const hote = document.querySelector<HTMLElement>('.notak-espace') ?? document.body
  return createPortal(
    <dialog
      ref={dialogue}
      className="bureau-dialogue"
      aria-label={t('bureau.acces.titre')}
      onClose={fermerDialogueAcces}
      // Un clic sur le voile (le dialogue lui-même, hors de sa carte) le ferme.
      onClick={(e) => e.target === e.currentTarget && fermer()}
    >
      <FormulaireAcces mode="dialogue" acces={acces} surLocal={fermer} surFermer={fermer} />
    </dialog>,
    hote,
  )
}
