import { type DepotFichiers, ErreurNotak, type EspaceNavigable, type Id, decoderNotak } from '@notak/tableau'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type FichierOuvert, FICHIER_OUVERT, ecarterFichierOuvert, ecouter, estErreurCoque, estPageServeur, fichiersOuverts, lireFichierOuvert, revenirIci } from '../bureau'
import { poids } from '../DialogueExport'
import { t, tn } from '../langue'
import { poserNotak } from '../notak'

/** Ce que la coque dit d'une copie en attente, relu : une réponse à demi lisible n'ouvre aucun dialogue. */
const estCopie = (f: unknown): f is FichierOuvert => {
  const c = f as Partial<FichierOuvert> | null
  return typeof c?.id === 'string' && typeof c.nom === 'string' && typeof c.taille === 'number' && typeof c.confiee === 'boolean'
}

/** Le temps qu'on laisse à la coque pour emmener la fenêtre avant de rendre les choix. */
const ATTENTE_DEPART_MS = 3000

type Phase = { type: 'choix' } | { type: 'cours' } | { type: 'fini'; texte: string; tete: Id } | { type: 'echec'; texte: string }

/** Ce qu'on dit d'une copie qui ne s'est pas importée. */
function messageEchec(x: unknown): string {
  if (x instanceof ErreurNotak) return x.message.includes('récente') ? t('importer.notakRecent') : t('importer.pasNotak')
  if (estErreurCoque(x) && (x.code === 'introuvable' || x.code === 'illisible')) return t('serveur.ouverts.illisible')
  return t('importer.impossible')
}

/**
 * Les copies `.notak` que le système a remises à l'app (un double clic, « Ouvrir avec… »), et les toiles de cet ordinateur
 * qu'on a confiées à ce serveur en le rejoignant. La page les trouve dans la file de la coque, au chargement et à chaque
 * ouverture, et en propose une à la fois : l'importer ici, l'ouvrir sur cet ordinateur, ou « plus tard » (elle reste dans la file).
 * Une copie importée prend sa place sous l'accueil, comme n'importe quel import d'un `.notak`.
 */
export function FichiersOuverts({
  espace,
  racine,
  fichiers,
  ouvrir,
}: {
  espace: EspaceNavigable
  /** Le tableau où l'on pose les copies : l'accueil du compte. */
  racine: Id
  fichiers: DepotFichiers
  /** Va voir la toile qu'on vient d'importer. */
  ouvrir(id: Id): void
}) {
  const [file, setFile] = useState<FichierOuvert[]>([])
  /** Ce qu'on ne propose plus à cette page : importé, ouvert ailleurs, ou remis à plus tard. */
  const [ecartes, setEcartes] = useState<ReadonlySet<string>>(new Set())
  const [courant, setCourant] = useState<FichierOuvert | null>(null)
  const [phase, setPhase] = useState<Phase>({ type: 'choix' })
  const dialogue = useRef<HTMLDialogElement>(null)
  const titre = useRef<HTMLHeadingElement>(null)

  const relire = useCallback(() => {
    fichiersOuverts().then(
      (liste) => setFile(Array.isArray(liste) ? liste.filter(estCopie) : []),
      () => {},
    )
  }, [])
  useEffect(() => {
    if (!estPageServeur()) return
    relire()
    let vivant = true
    let arreter: (() => void) | undefined
    ecouter(FICHIER_OUVERT, relire).then(
      (a) => (vivant ? (arreter = a) : a()),
      () => {},
    )
    return () => {
      vivant = false
      arreter?.()
    }
  }, [relire])

  // Une seule copie à la fois : la suivante vient quand celle-ci est réglée.
  useEffect(() => {
    if (courant) return
    const suivante = file.find((f) => !ecartes.has(f.id))
    if (suivante) {
      setCourant(suivante)
      setPhase({ type: 'choix' })
    }
  }, [courant, file, ecartes])

  // Le dialogue prend le thème de l'espace, où il vit.
  const hote = useMemo(() => (courant ? (document.querySelector<HTMLElement>('.notak-espace') ?? document.body) : null), [courant])
  useEffect(() => {
    if (courant && hote && !dialogue.current?.open) dialogue.current?.showModal()
  }, [courant, hote])

  // Pendant l'import, le bouton qu'on vient de presser disparaît : le curseur reste dans le dialogue, sur son titre.
  const enCours = phase.type === 'cours'
  useEffect(() => {
    if (enCours) titre.current?.focus()
  }, [enCours])

  if (!courant || !hote) return null
  const confiee = courant.confiee
  const adresse = location.host

  /** Cette copie n'est plus à proposer : le dialogue passe à la suivante, s'il y en a. */
  const ecarter = () => {
    setEcartes((e) => new Set(e).add(courant.id))
    setCourant(null)
    // Les toiles de cet ordinateur ne se reproposent pas à chaque page ; un fichier du disque, lui, attend « plus tard ».
    if (courant.confiee) void ecarterFichierOuvert(courant.id).catch(() => {})
  }
  const importer = async () => {
    setPhase({ type: 'cours' })
    try {
      const { tete, tableaux, perdus } = await poserNotak(decoderNotak(await lireFichierOuvert(courant.id)), espace, racine, fichiers)
      setPhase({ type: 'fini', texte: tn('importer.tableaux', tableaux) + (perdus ? `, ${tn('importer.fichiersPerdus', perdus)}` : '') + '.', tete })
    } catch (x) {
      setPhase({ type: 'echec', texte: messageEchec(x) })
    }
  }
  const ouvrirIci = () => {
    // La page locale la lira : la fenêtre quitte ce serveur. Si elle reste (la coque n'a pas emmené la fenêtre), les choix reviennent.
    setPhase({ type: 'cours' })
    revenirIci('local').then(
      () => void setTimeout(() => setPhase((p) => (p.type === 'cours' ? { type: 'choix' } : p)), ATTENTE_DEPART_MS),
      () => setPhase({ type: 'echec', texte: t('serveur.ouverts.retourImpossible') }),
    )
  }

  return createPortal(
    <dialog
      key={courant.id}
      ref={dialogue}
      className="ouverts-dialogue"
      aria-labelledby="ouverts-titre"
      aria-describedby="ouverts-texte"
      // Échap : « plus tard » (la copie reste dans la file), ou fermer le compte rendu.
      onCancel={(e) => {
        e.preventDefault()
        if (!enCours) ecarter()
      }}
    >
      <div className="ouverts-carte" aria-busy={enCours}>
        <h2 id="ouverts-titre" ref={titre} tabIndex={-1}>
          {confiee ? t('serveur.ouverts.titreConfiee', { hote: adresse }) : t('serveur.ouverts.titre', { nom: courant.nom })}
        </h2>
        <div id="ouverts-texte" className="ouverts-texte">
          {phase.type === 'choix' && (
            <>
              <p>{confiee ? t('serveur.ouverts.confiee', { hote: adresse }) : t('serveur.ouverts.fichier', { taille: poids(courant.taille), hote: adresse })}</p>
              {!confiee && <p className="ouverts-note">{t('serveur.ouverts.ouvrirIciNote')}</p>}
            </>
          )}
          {phase.type === 'cours' && <p role="status">{t('serveur.ouverts.encours')}</p>}
          {phase.type === 'fini' && <p role="status">{phase.texte}</p>}
          {phase.type === 'echec' && (
            <p className="connexion-erreur" role="alert">
              {phase.texte}
            </p>
          )}
        </div>
        <div className="ouverts-actions">
          {phase.type === 'choix' && (
            <>
              <button type="button" className="bouton bouton-plein" autoFocus onClick={() => void importer()}>
                {confiee ? t('serveur.ouverts.importer') : t('serveur.ouverts.importerSur', { hote: adresse })}
              </button>
              {!confiee && (
                <button type="button" className="bouton" onClick={ouvrirIci}>
                  {t('serveur.ouverts.ouvrirIci')}
                </button>
              )}
              <button type="button" className="bouton-lien" onClick={ecarter}>
                {confiee ? t('serveur.ouverts.pasMaintenant') : t('maj.plusTard')}
              </button>
            </>
          )}
          {phase.type === 'fini' && (
            <>
              <button
                type="button"
                className="bouton bouton-plein"
                autoFocus
                onClick={() => {
                  ouvrir(phase.tete)
                  ecarter()
                }}
              >
                {t('commun.ouvrir')}
              </button>
              <button type="button" className="bouton-lien" onClick={ecarter}>
                {t('commun.fermer')}
              </button>
            </>
          )}
          {phase.type === 'echec' && (
            <button type="button" className="bouton bouton-plein" autoFocus onClick={ecarter}>
              {t('commun.fermer')}
            </button>
          )}
        </div>
      </div>
    </dialog>,
    hote,
  )
}
