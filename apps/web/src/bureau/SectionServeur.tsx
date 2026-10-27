import { useEffect } from 'react'
import { t } from '../langue'
import { fabriquerCopie } from '../local/copie'
import type { EspaceLocal } from '../local/espace'
import { GUIDE, type Echec, hoteDe, texteErreur } from './acces'
import { emporterSurServeur, oublierEchecServeur, revenirSurServeur, useEtatServeur } from './emporter'
import { ouvrirDialogueAcces, useAcces } from './etat'

/**
 * « Travailler à plusieurs », dans « Où sont mes toiles ? » de l'app de bureau : se connecter à un serveur Notak ; et,
 * si l'on en a mémorisé un, y revenir, ou y copier les toiles de cet ordinateur (une copie, que le serveur proposera à
 * l'import : rien n'est supprimé ici).
 */
export function SectionServeur({ el, fermer }: { el: EspaceLocal; fermer(): void }) {
  const { acces } = useAcces()
  const etat = useEtatServeur()
  const serveur = acces?.serveur ?? null
  const hote = serveur ? hoteDe(serveur) : ''
  const occupe = etat.type === 'cours'

  useEffect(oublierEchecServeur, [])

  return (
    <>
      <h3>{t('local.plusieurs')}</h3>
      <p>{t('bureau.serveur.texte')}</p>
      <div className="rangement-actions">
        <button
          type="button"
          className="bouton"
          disabled={occupe}
          onClick={() => {
            // Le panneau se referme : la fenêtre qui s'ouvre n'a pas à se superposer à lui.
            fermer()
            void ouvrirDialogueAcces()
          }}
        >
          {t('bureau.serveur.seConnecter')}
        </button>
        {serveur && (
          <>
            <button type="button" className="bouton" disabled={occupe} onClick={() => void revenirSurServeur(serveur)}>
              {t('bureau.serveur.revenir', { hote })}
            </button>
            <button type="button" className="bouton" disabled={occupe} onClick={() => void emporterSurServeur(serveur, () => fabriquerCopie(el))}>
              {t('bureau.serveur.copier', { hote })}
            </button>
          </>
        )}
      </div>
      {serveur && <small className="rangement-note">{t('bureau.serveur.copierNote', { hote })}</small>}
      {etat.type === 'cours' && (
        <small className="rangement-note" role="status">
          {etat.quoi === 'emporter' ? t('bureau.serveur.copierCours') : t('bureau.porte.connexion', { hote })}
        </small>
      )}
      {etat.type === 'echec' && (
        <p className="rangement-attention" role="alert">
          {texteEchec(etat.echec, hote)}
        </p>
      )}
      <small className="rangement-note">
        <a href={GUIDE} target="_blank" rel="noopener noreferrer">
          {t('bureau.acces.guide')}
        </a>
      </small>
    </>
  )
}

/** Un refus de la coque, dit pour ce panneau : une copie trop lourde pour lui est le seul cas qui lui soit propre. */
const texteEchec = (e: Echec, hote: string) => (e.code === 'trop_gros' ? t('bureau.serveur.copierTrop', { hote }) : texteErreur(e, hote))
