import { Champ, Choix } from '@notak/tableau'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { type DroitElement, type DroitPose, listerDroitsElement, reglerDroitElement } from './api'
import { t } from './langue'

const LIBELLE: Record<DroitElement, () => string> = {
  edition: () => t('droitsElement.edition'),
  commentaire: () => t('droitsElement.commentaire'),
  bloque: () => t('droitsElement.bloque'),
}

const cibleDe = (d: DroitPose) => ('tous' in d ? ({ tous: true } as const) : 'email' in d ? { email: d.email } : { equipe: d.equipe })

/**
 * Les droits propres d'un élément, réglés par le propriétaire du tableau : le figer pour tous, puis le rendre à
 * quelques-uns (écrire, ou seulement commenter). L'élément reste lisible par tous ceux qui lisent le tableau.
 */
export function DroitsElement({ tableau, element, fermer }: { tableau: string; element: string; fermer(): void }) {
  const [droits, setDroits] = useState<DroitPose[] | null>(null)
  const [email, setEmail] = useState('')
  const [droit, setDroit] = useState<'edition' | 'commentaire'>('edition')
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const charger = useCallback(() => {
    listerDroitsElement(tableau, element).then(setDroits, (x: Error) => setErreur(x.message))
  }, [tableau, element])
  useEffect(charger, [charger])
  useEffect(() => {
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && fermer()
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [fermer])

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
  const fige = droits?.some((d) => 'tous' in d && d.droit === 'bloque') ?? false
  const donner = (e: FormEvent) => {
    e.preventDefault()
    const adresse = email.trim().toLowerCase()
    if (!adresse.includes('@')) return setErreur(t('connexion.adresseInvalide'))
    void agir(async () => {
      await reglerDroitElement(tableau, element, { email: adresse }, droit)
      setEmail('')
    })
  }

  return (
    <div className="droits-element-fond" onPointerDown={(e) => e.target === e.currentTarget && fermer()}>
      <div className="arrivee-carte droits-element" role="dialog" aria-modal="true" aria-label={t('droitsElement.titre')}>
        <h2>{t('droitsElement.titre')}</h2>
        <p className="partage-note">{t('droitsElement.explique')}</p>
        <button type="button" className="bouton" disabled={occupe || droits === null} onClick={() => agir(() => reglerDroitElement(tableau, element, { tous: true }, fige ? null : 'bloque'))}>
          {fige ? t('droitsElement.liberer') : t('droitsElement.figer')}
        </button>
        {droits && droits.some((d) => !('tous' in d)) && (
          <ul className="partage-liste">
            {droits
              .filter((d) => !('tous' in d))
              .map((d) => (
                <li key={'email' in d ? d.email : 'equipe' in d ? d.equipe : 'tous'}>
                  <span className="partage-qui">
                    <strong>{'nom' in d ? d.nom : ''}</strong>
                    {'email' in d && <small>{d.email}</small>}
                  </span>
                  <span className="partage-role">{LIBELLE[d.droit]()}</span>
                  <button type="button" className="bouton-lien" disabled={occupe} onClick={() => agir(() => reglerDroitElement(tableau, element, cibleDe(d), null))}>
                    {t('partage.retirer')}
                  </button>
                </li>
              ))}
          </ul>
        )}
        <form className="partage-form" onSubmit={donner} noValidate>
          <Champ type="email" placeholder={t('connexion.adresse')} aria-label={t('droitsElement.adresse')} value={email} onChange={(e) => setEmail(e.target.value)} />
          <Choix
            haut
            valeur={droit}
            libelle={t('partage.droit')}
            onChange={(v) => setDroit(v as 'edition' | 'commentaire')}
            options={[
              { valeur: 'edition', libelle: t('droitsElement.edition') },
              { valeur: 'commentaire', libelle: t('droitsElement.commentaire') },
            ]}
          />
          <button type="submit" className="bouton bouton-plein" disabled={occupe}>
            {t('droitsElement.donner')}
          </button>
        </form>
        {erreur && (
          <p className="connexion-erreur" role="alert">
            {erreur}
          </p>
        )}
        <button type="button" className="bouton-lien" onClick={fermer}>
          {t('droitsElement.fermer')}
        </button>
      </div>
    </div>
  )
}
