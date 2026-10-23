import { useEffect, useState } from 'react'
import { t } from './langue'
import { type Moi, type TableauAccessible, listerFavoris, listerRecents, listerTableaux } from './api'
import { adressePhoto } from './fichiers'
import { Icone, PastillePersonne } from '@notak/tableau'

/** Le menu au nom de la personne connectée, avec les tableaux que d'autres lui partagent. */
export function Compte({ moi, deconnexion, ouvrir, aide }: { moi: Moi; deconnexion(): void; ouvrir(id: string): void; aide(): void }) {
  const [ouvert, setOuvert] = useState(false)
  const [partages, setPartages] = useState<TableauAccessible[] | null>(null)
  const [favoris, setFavoris] = useState<TableauAccessible[]>([])
  const [recents, setRecents] = useState<TableauAccessible[]>([])
  useEffect(() => {
    if (!ouvert) return
    const hors = (e: PointerEvent) => !(e.target as HTMLElement).closest('.compte') && setOuvert(false)
    document.addEventListener('pointerdown', hors)
    // La liste se relit à chaque ouverture : un partage peut arriver à tout moment.
    let vivant = true
    listerTableaux().then(
      (tb) => vivant && setPartages(tb.filter((x) => x.role !== 'proprietaire')),
      () => vivant && setPartages([]),
    )
    listerFavoris().then((l) => vivant && setFavoris(l), () => {})
    listerRecents().then((l) => vivant && setRecents(l), () => {})
    return () => {
      vivant = false
      document.removeEventListener('pointerdown', hors)
    }
  }, [ouvert])
  const aller = (id: string) => {
    setOuvert(false)
    ouvrir(id)
  }
  return (
    <div className="compte">
      <button type="button" className="bouton compte-nom" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        <PastillePersonne className="compte-pastille" nom={moi.nom} couleur={moi.couleur} adresse={moi.photo ? adressePhoto(moi.photo) : undefined} titre="" />
        {moi.nom}
      </button>
      {ouvert && (
        <div className="compte-menu" role="menu">
          <small>{moi.email}</small>
          <Rubrique titre={t('compte.favoris')} tableaux={favoris} ouvrir={aller} />
          <Rubrique titre={t('compte.recents')} tableaux={recents} ouvrir={aller} />
          {partages && partages.length > 0 && (
            <>
              <small className="compte-rubrique">{t('compte.partages')}</small>
              {partages.map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOuvert(false)
                    ouvrir(tb.id)
                  }}
                >
                  {tb.titre || t('commun.sansTitre')}
                  {tb.role === 'lecture' && <small> · {t('compte.lecture')}</small>}
                </button>
              ))}
            </>
          )}
          <button
            type="button"
            role="menuitem"
            className="compte-ligne"
            onClick={() => {
              setOuvert(false)
              aide()
            }}
          >
            <Icone nom="aide" taille={16} />
            <span>{t('compte.aide')} <small>· {t('compte.raccourcis')}</small></span>
          </button>
          <a role="menuitem" className="compte-ligne" href="/envoyer">
            <Icone nom="envoyer" taille={16} />
            <span>{t('compte.envoyer')} <small>· {t('compte.envoyer.detail')}</small></span>
          </a>
          <button type="button" role="menuitem" className="compte-ligne" onClick={deconnexion}>
            <Icone nom="deconnexion" taille={16} />
            {t('compte.deconnexion')}
          </button>
        </div>
      )}
    </div>
  )
}

/** Une liste de tableaux dans le menu du compte ; rien si elle est vide. */
function Rubrique({ titre, tableaux, ouvrir }: { titre: string; tableaux: TableauAccessible[]; ouvrir(id: string): void }) {
  if (tableaux.length === 0) return null
  return (
    <>
      <small className="compte-rubrique">{titre}</small>
      {tableaux.map((tb) => (
        <button key={tb.id} type="button" role="menuitem" onClick={() => ouvrir(tb.id)}>
          {tb.titre || t('commun.sansTitre')}
          {tb.role === 'lecture' && <small> · {t('compte.lecture')}</small>}
        </button>
      ))}
    </>
  )
}
