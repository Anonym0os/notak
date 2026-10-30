import { type ContexteReglages, Icone, type NomIcone, PastillePersonne, type ServiceCompte, reglerRubriqueCompte } from '@notak/tableau'
import { useState } from 'react'
import { estErreurCoque, estServeurDansApp, joindreServeur, oublierServeur, peutJoindreUnServeur, revenirIci } from '../bureau'
import { t } from '../langue'
import { type Echec, echecDe, hoteDe, surAppareil, texteErreur } from './acces'
import { relireAcces, useAcces } from './etat'
import { FormulaireAcces } from './FormulaireAcces'
import './compteEtServeur.css'

/**
 * Le compte et le serveur, au téléphone : le même contenu dans la feuille « Compte » de la bibliothèque de l'appareil
 * (le rond en haut à droite) et dans la rubrique « Compte » des réglages, comme l'identifiant Apple d'iOS.
 *
 * - Sur la page embarquée (l'édition locale de l'app) : sans serveur, ce qu'un serveur apporte et de quoi s'y
 *   connecter ; avec un serveur retenu, son adresse, l'ouvrir, en changer, l'oublier. La coque fait le reste
 *   (`acces.rs`), comme sur un ordinateur.
 * - Sur la page d'un serveur : le compte connecté, le serveur, et dans l'app de quoi en changer ou revenir aux toiles
 *   de l'appareil ; partout, la déconnexion.
 *
 * Se connecter ou changer de serveur montre le formulaire de l'app de bureau à la place, aux mesures du doigt : une
 * feuille de plus serait cachée sous les réglages, qui sont une fenêtre modale.
 */

/** Ce que les réglages savent du compte connecté ; rien sur la page embarquée. */
type CompteLu = Pick<ServiceCompte, 'nom' | 'email' | 'couleur' | 'photo'>

/** L'édition serveur : la page vient d'un serveur, où l'on est connecté. */
const surServeur = () => import.meta.env.VITE_EDITION !== 'locale'

/** Ce que montre le rond, le titre et la ligne dessous : le compte, le serveur retenu, ou « Pas de compte ». */
function useResume(compte: CompteLu | undefined) {
  const { acces } = useAcces()
  if (surServeur() && compte) return { compte, titre: compte.nom, detail: location.host, initiale: null }
  const retenu = acces?.serveur ?? null
  if (!retenu) return { compte: undefined, titre: t('compteServeur.sansCompte'), detail: t('compteServeur.surAppareil'), initiale: null }
  const hote = hoteDe(retenu)
  return { compte: undefined, titre: hote, detail: t('compteServeur.retenu'), initiale: hote.replace(/^www\./, '').charAt(0).toUpperCase() }
}

/** Le rond du compte : sa photo ou sa pastille ; l'initiale du serveur retenu ; sinon une silhouette. */
export function RondCompte({ compte, taille }: { compte?: CompteLu | undefined; taille: number }) {
  const r = useResume(compte)
  // La pastille s'arrête à 36 px : plus grande, on l'agrandit telle quelle.
  if (r.compte)
    return (
      <span className="compte-serveur-photo" style={{ zoom: taille / 36 }}>
        <PastillePersonne taille={36} nom={r.compte.nom} couleur={r.compte.couleur} adresse={r.compte.photo ?? undefined} titre="" />
      </span>
    )
  return (
    <span className="compte-serveur-rond" data-initiale={r.initiale ? '' : undefined} style={{ width: taille, height: taille, fontSize: taille * 0.45 }} aria-hidden>
      {r.initiale ?? <Icone nom="compte" taille={Math.round(taille * 0.55)} />}
    </span>
  )
}

/** Le dedans de la carte en tête des réglages : le rond, puis le nom (ou « Pas de compte ») et le serveur dessous. */
export function ResumeCompte({ compte }: { compte?: CompteLu | undefined }) {
  const r = useResume(compte)
  return (
    <>
      <RondCompte compte={compte} taille={36} />
      <span className="notak-rgt-libelle">
        <strong>{r.titre}</strong>
        <small>{r.detail}</small>
      </span>
    </>
  )
}

/** Une ligne du groupe : l'icône, le libellé (et un détail), le chevron quand elle mène ailleurs. */
function Ligne({
  icone,
  libelle,
  detail,
  suite,
  danger,
  occupe,
  desactive,
  onClick,
}: {
  icone: NomIcone
  libelle: string
  detail?: string
  suite?: boolean
  danger?: boolean
  occupe?: boolean
  desactive?: boolean
  onClick(): void
}) {
  return (
    <button type="button" className="compte-serveur-ligne" data-danger={danger || undefined} aria-busy={occupe || undefined} disabled={desactive} onClick={onClick}>
      <Icone nom={icone} taille={20} />
      <span className="compte-serveur-texte">
        <span>{libelle}</span>
        {detail && <small>{detail}</small>}
      </span>
      {occupe ? <span className="bureau-roue" aria-hidden /> : suite && <Icone nom="chevronDroite" taille={18} />}
    </button>
  )
}

export function CompteEtServeur({ compte }: { compte?: CompteLu | undefined }) {
  const { acces } = useAcces()
  const r = useResume(compte)
  const [vue, setVue] = useState<'compte' | 'formulaire' | 'oublier'>('compte')
  const [occupe, setOccupe] = useState(false)
  const [echec, setEchec] = useState<Echec | null>(null)
  const retenu = acces?.serveur ?? null
  const hote = retenu ? hoteDe(retenu) : ''

  if (vue === 'formulaire')
    return (
      <div className="compte-serveur compte-serveur-formulaire">
        <FormulaireAcces mode="dialogue" acces={acces} surLocal={() => setVue('compte')} surFermer={() => setVue('compte')} />
      </div>
    )

  /** Un geste qui passe par la coque : on attend, et ce qui manque se dit sous les lignes. */
  const agir = async (geste: () => Promise<unknown>, apres?: () => void) => {
    if (occupe) return
    setOccupe(true)
    setEchec(null)
    try {
      await geste()
      apres?.()
    } catch (e) {
      if (!(estErreurCoque(e) && e.code === 'annule')) setEchec(echecDe(e))
    } finally {
      setOccupe(false)
    }
  }
  // Réussie, la fenêtre part chez le serveur : la ligne reste « Connexion… » jusque-là.
  const ouvrir = () => {
    if (!retenu || occupe) return
    setOccupe(true)
    setEchec(null)
    joindreServeur(retenu, true).catch((e: unknown) => {
      setOccupe(false)
      if (!(estErreurCoque(e) && e.code === 'annule')) setEchec(echecDe(e))
    })
  }
  const oublier = () =>
    agir(oublierServeur, () => {
      setVue('compte')
      void relireAcces()
    })
  const deconnecter = () =>
    agir(async () => {
      // Seule l'édition serveur sait se déconnecter : l'édition locale n'emporte pas son code.
      if (!surServeur()) return
      const { seDeconnecter } = await import('../api')
      await seDeconnecter().catch(() => {})
      location.replace('/')
    })

  let lignes
  if (surServeur() && compte) {
    lignes = (
      <>
        {estServeurDansApp() && (
          <>
            <Ligne icone="convertir" libelle={t('compteServeur.changer')} desactive={occupe} onClick={() => void agir(() => revenirIci('acces'))} />
            <Ligne
              icone="ordinateur"
              libelle={t(surAppareil() ? 'serveur.compte.toilesLocales.appareil' : 'serveur.compte.toilesLocales')}
              detail={t('serveur.compte.toilesLocales.detail')}
              desactive={occupe}
              onClick={() => void agir(() => revenirIci('local'))}
            />
          </>
        )}
        <Ligne icone="deconnexion" libelle={t('compte.deconnexion')} danger desactive={occupe} onClick={() => void deconnecter()} />
      </>
    )
  } else if (!peutJoindreUnServeur()) {
    lignes = null
  } else if (!retenu) {
    lignes = <Ligne icone="compte" libelle={t('telephone.serveur.connecter')} detail={t('telephone.serveur.connecterDetail')} suite onClick={() => setVue('formulaire')} />
  } else {
    lignes = (
      <>
        <Ligne
          icone="tableau"
          libelle={occupe ? t('bureau.porte.connexion', { hote }) : t('compteServeur.ouvrir')}
          detail={t('compteServeur.ouvrirDetail', { hote })}
          occupe={occupe}
          suite
          onClick={ouvrir}
        />
        <Ligne icone="convertir" libelle={t('compteServeur.changer')} suite desactive={occupe} onClick={() => setVue('formulaire')} />
        <Ligne icone="corbeille" libelle={t('bureau.acces.oublier')} danger desactive={occupe} onClick={() => setVue('oublier')} />
      </>
    )
  }

  return (
    <div className="compte-serveur">
      <div className="compte-serveur-tete">
        <RondCompte compte={compte} taille={72} />
        <strong>{r.titre}</strong>
        <small>{r.detail}</small>
      </div>
      {!retenu && !compte && peutJoindreUnServeur() && <p className="compte-serveur-phrase">{t('compteServeur.phrase')}</p>}
      {vue === 'oublier' ? (
        <div className="compte-serveur-confirme" role="group" aria-label={t('bureau.acces.oublier')}>
          <p>{t(surAppareil() ? 'bureau.acces.oublierConfirme.appareil' : 'bureau.acces.oublierConfirme', { hote })}</p>
          <div className="compte-serveur-groupe">
            <Ligne icone="corbeille" libelle={t('bureau.acces.oublierOui')} danger occupe={occupe} desactive={occupe} onClick={() => void oublier()} />
            <Ligne icone="fermer" libelle={t('commun.annuler')} desactive={occupe} onClick={() => setVue('compte')} />
          </div>
        </div>
      ) : (
        lignes && <div className="compte-serveur-groupe">{lignes}</div>
      )}
      {echec && (
        <p className="connexion-erreur" role="alert">
          {texteErreur(echec, hote || location.host)}
        </p>
      )}
    </div>
  )
}

/**
 * Donne aux réglages d'un téléphone leur carte « Compte » et sa rubrique (`main.tsx`) : dans l'édition serveur, et dans
 * l'app quand la page embarquée peut joindre un serveur.
 */
export function brancherReglagesCompte() {
  reglerRubriqueCompte({
    carte: (c: ContexteReglages) => <ResumeCompte compte={c.compte} />,
    rendre: (c: ContexteReglages) => <CompteEtServeur compte={c.compte} />,
  })
}
