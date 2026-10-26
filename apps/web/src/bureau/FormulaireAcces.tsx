import { Icone, lireReglages, themeEffectif, useSystemeSombre } from '@notak/tableau'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type Acces, joindreServeur, oublierServeur, revenirIci } from '../bureau'
import { t } from '../langue'
import { Marque } from '../PageApp'
import { type Echec, GUIDE, concerneAdresse, detailErreur, echecDe, hoteDe, hoteSaisi, texteErreur } from './acces'
import { fermerDialogueAcces, relireAcces, useAcces, useDialogueAcces } from './etat'

/**
 * « Se connecter à un serveur Notak » : l'adresse du serveur, ce qu'il y a à faire quand il ne répond pas comme il faut,
 * et de quoi revenir aux toiles de cet ordinateur ou oublier le serveur retenu. Le même formulaire sert d'écran entier
 * (la porte de l'app, `?acces`) et de fenêtre ouverte depuis l'édition locale.
 *
 * La page n'envoie jamais la fenêtre ailleurs d'elle-même : c'est la coque qui vérifie l'adresse, et elle la relit.
 */

export interface PropsAcces {
  /** Les réglages de la coque : le serveur retenu, et où s'ouvre Notak. */
  acces: Acces | null
  mode: 'ecran' | 'dialogue'
  /** Ce qui a ramené ici, dit dès l'ouverture : le serveur retenu n'a pas répondu. */
  echecInitial?: Echec | undefined
  /** « Toiles de cet ordinateur » : l'écran ou la fenêtre se ferme, l'édition locale reste. */
  surLocal(): void
  /** La fenêtre se ferme sans rien choisir. */
  surFermer?(): void
}

export function FormulaireAcces({ acces, mode, echecInitial, surLocal, surFermer }: PropsAcces) {
  const id = useId()
  const [adresse, setAdresse] = useState(acces?.serveur ?? '')
  /** L'hôte qu'on est en train de joindre ; la coque vérifie, puis y envoie la fenêtre. */
  const [occupe, setOccupe] = useState<string | null>(null)
  const [retour, setRetour] = useState(false)
  const [echec, setEchec] = useState<Echec | null>(echecInitial ?? null)
  const [retenu, setRetenu] = useState(acces?.serveur ?? null)
  const [ouvrirServeur, setOuvrirServeur] = useState(acces?.ouvrir === 'serveur' && !!acces.serveur)
  const [oubli, setOubli] = useState<'non' | 'confirme' | 'cours'>('non')
  const [avis, setAvis] = useState<string | null>(null)
  const champ = useRef<HTMLInputElement>(null)
  const utiliser = useRef<HTMLButtonElement>(null)
  const demander = useRef<HTMLButtonElement>(null)
  const annuler = useRef<HTMLButtonElement>(null)
  const bloque = occupe !== null || retour
  const hote = retenu ? hoteDe(retenu) : ''

  // Une erreur ramène le curseur là où elle se corrige : le champ, ou le bouton qui propose la bonne adresse.
  useEffect(() => {
    if (!echec) return
    if (echec.code === 'redirige') utiliser.current?.focus()
    else champ.current?.focus()
  }, [echec])

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
    try {
      // Réussie, la fenêtre part chez le serveur : le bouton reste « Connexion… » jusque-là.
      await joindreServeur(saisie, true)
    } catch (e) {
      setEchec(echecDe(e))
      setOccupe(null)
    }
  }
  const envoyer = (e: FormEvent) => {
    e.preventDefault()
    void connecter(adresse)
  }
  const utiliserCelle = (vers: string) => {
    setAdresse(vers)
    void connecter(vers)
  }

  const ouvrirLocal = async () => {
    // Un serveur qui s'ouvre d'office : choisir les toiles d'ici, c'est y ouvrir Notak désormais (la coque le retient).
    if (!ouvrirServeur) return surLocal()
    setRetour(true)
    try {
      await revenirIci('local')
    } catch (e) {
      setEchec(echecDe(e))
      setRetour(false)
    }
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
  const detail = echec ? detailErreur(echec) : null
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
      {detail && <small className="connexion-indice acces-detail">{detail}</small>}
      {echec?.code === 'redirige' && (
        <button ref={utiliser} type="button" className="bouton bouton-plein" disabled={bloque} onClick={() => utiliserCelle(echec.vers)}>
          {t('bureau.erreur.redirigeUtiliser', { vers: echec.vers })}
        </button>
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
      <a className="bouton-lien acces-guide" href={GUIDE} target="_blank" rel="noopener noreferrer">
        {t('bureau.acces.guide')}
      </a>

      <div className="acces-autres">
        <p className="connexion-aide">{t('bureau.acces.deuxLieux')}</p>
        {(mode === 'ecran' || ouvrirServeur) && (
          <>
            <button type="button" className="bouton" disabled={bloque} onClick={() => void ouvrirLocal()}>
              {t('bureau.acces.local')}
            </button>
            {ouvrirServeur && <small className="connexion-indice">{t('bureau.acces.localAide', { hote })}</small>}
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
                  {t('bureau.acces.oublierConfirme', { hote })}
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
 * clavier pour eux (Tab, Échap) : tant que la fenêtre est ouverte, ce qui s'y tape ne leur parvient pas.
 */
export function DialogueAcces() {
  const ouvert = useDialogueAcces()
  const { acces } = useAcces()
  const dialogue = useRef<HTMLDialogElement>(null)

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
      onClick={(e) => e.target === e.currentTarget && fermerDialogueAcces()}
    >
      <FormulaireAcces mode="dialogue" acces={acces} surLocal={fermerDialogueAcces} surFermer={fermerDialogueAcces} />
    </dialog>,
    hote,
  )
}
