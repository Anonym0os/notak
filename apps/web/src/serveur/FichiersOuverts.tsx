import { type DepotFichiers, ErreurNotak, type EspaceNavigable, type Id, decoderNotak } from '@notak/tableau'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type FichierOuvert, ecarterFichierOuvert, estErreurCoque, lireFichierOuvert, revenirIci } from '../bureau'
import { poids } from '../DialogueExport'
import { t, tn } from '../langue'
import { attendreEnvoi, poserNotak } from '../notak'
import { useFichiersEnAttente } from './fichiersEnAttente'

/** Le temps qu'on laisse à la coque pour emmener la fenêtre avant de rendre les choix. */
const ATTENTE_DEPART_MS = 3000

type Phase = { type: 'choix' } | { type: 'cours'; envoi?: true } | { type: 'fini'; texte: string; tete: Id } | { type: 'echec'; texte: string }

/** Ce qu'on dit d'une copie qui ne s'est pas importée : trop récente, abîmée, trop lourde, ou pas une copie du tout. */
function messageEchec(x: unknown): string {
  if (x instanceof ErreurNotak) {
    if (x.message.includes('récente')) return t('importer.notakRecent')
    if (x.message.includes('abîmé')) return t('serveur.ouverts.abimee')
    if (x.message.includes('trop gros')) return t('serveur.ouverts.tropGrosse')
    return t('importer.pasNotak')
  }
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
  const file = useFichiersEnAttente()
  /** Ce qu'on ne propose plus à cette page : importé, ouvert ailleurs, ou remis à plus tard. */
  const [ecartes, setEcartes] = useState<ReadonlySet<string>>(new Set())
  const [courant, setCourant] = useState<FichierOuvert | null>(null)
  const [phase, setPhase] = useState<Phase>({ type: 'choix' })
  const dialogue = useRef<HTMLDialogElement>(null)
  const titre = useRef<HTMLHeadingElement>(null)

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
      const { tete, tableaux, perdus, poses } = await poserNotak(decoderNotak(await lireFichierOuvert(courant.id)), espace, racine, fichiers)
      // « Importé » ne se dit qu'une fois les toiles arrivées au serveur : sinon, fermer l'app tout de suite les laisserait ici.
      setPhase({ type: 'cours', envoi: true })
      const arrive = await attendreEnvoi(espace, poses)
      const texte = tn('importer.tableaux', tableaux) + (perdus ? `, ${tn('importer.fichiersPerdus', perdus)}` : '') + '.'
      setPhase({ type: 'fini', texte: arrive ? texte : `${texte} ${t('importer.pasEncoreEnvoye')}`, tete })
    } catch (x) {
      setPhase({ type: 'echec', texte: messageEchec(x) })
    }
  }
  const ouvrirIci = () => {
    // La page locale la lira : la fenêtre quitte ce serveur. Si elle reste (la coque n'a pas emmené la fenêtre), les choix reviennent.
    setPhase({ type: 'cours' })
    revenirIci('local').then(
      () => void setTimeout(() => setPhase((p) => (p.type === 'cours' ? { type: 'choix' } : p)), ATTENTE_DEPART_MS),
      () => setPhase({ type: 'echec', texte: t('serveur.retourImpossible') }),
    )
  }

  return createPortal(
    <dialog
      key={courant.id}
      ref={dialogue}
      className="ouverts-dialogue"
      aria-labelledby="ouverts-titre"
      aria-describedby="ouverts-texte"
      // Échap : comme le bouton qui écarte la copie (« plus tard » pour un fichier, « ne pas importer » pour les toiles confiées), ou fermer le compte rendu.
      onCancel={(e) => {
        e.preventDefault()
        if (!enCours) ecarter()
      }}
    >
      <div className="ouverts-carte">
        {/* Le texte d'état décrit le titre pendant l'import, puis le bouton qui prend le curseur : le lecteur d'écran le dit avec eux. Pas d'`aria-busy` : il retarderait l'annonce. */}
        <h2 id="ouverts-titre" ref={titre} tabIndex={-1} aria-describedby={enCours ? 'ouverts-texte' : undefined}>
          {confiee ? t('serveur.ouverts.titreConfiee', { hote: adresse }) : t('serveur.ouverts.titre', { nom: courant.nom })}
        </h2>
        <div id="ouverts-texte" className="ouverts-texte">
          {phase.type === 'choix' && (
            <>
              <p>{confiee ? t('serveur.ouverts.confiee', { hote: adresse }) : t('serveur.ouverts.fichier', { taille: poids(courant.taille), hote: adresse })}</p>
              <p className="ouverts-note">{confiee ? t('serveur.ouverts.confieeNote', { hote: adresse }) : t('serveur.ouverts.ouvrirIciNote')}</p>
            </>
          )}
          {phase.type === 'cours' && <p role="status">{t(phase.envoi ? 'importer.envoi' : 'serveur.ouverts.encours')}</p>}
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
                aria-describedby="ouverts-texte"
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
            <button type="button" className="bouton bouton-plein" autoFocus aria-describedby="ouverts-texte" onClick={ecarter}>
              {t('commun.fermer')}
            </button>
          )}
        </div>
      </div>
    </dialog>,
    hote,
  )
}
