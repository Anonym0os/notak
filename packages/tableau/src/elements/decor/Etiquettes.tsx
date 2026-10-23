import { useState, useSyncExternalStore } from 'react'
import { COULEURS_NOTE, type CouleurNote, type Element, type Etiquette, annoter } from '../../coeur/tableau'
import { LIBELLES_COULEUR } from '../note/couleurs'
import type { ContexteToile } from '../types'
import {
  NOM_ETIQUETTE_MAX,
  basculerEtiquette,
  colorerEtiquette,
  etatEtiquette,
  nouvelleEtiquette,
  renommerEtiquette,
  supprimerEtiquette,
} from './annotations'
import { basculerFiltre, useFiltre, viderFiltre } from './etat'
import { t } from '../../langue'
import { Icone } from '../../icones'

/**
 * Les étiquettes du tableau : en créer, les renommer, les colorer, les poser sur la sélection, et filtrer le
 * tableau par étiquette (ce qui n'en porte aucune des voulues s'estompe). Sans sélection, on gère et on filtre ;
 * en lecture seule, on filtre seulement.
 */
export function PanneauEtiquettes({ elements, contexte }: { elements: readonly Element[]; contexte: ContexteToile }) {
  const { magasin } = contexte
  const tableau = useSyncExternalStore(magasin.ecouter, magasin.lire)
  const filtre = useFiltre()
  const [nom, setNom] = useState('')
  const [couleurDe, setCouleurDe] = useState<string | null>(null)
  const liste = tableau.etiquettes ?? []
  const ecrire = !contexte.services.lectureSeule

  const changerListe = (vers: Etiquette[]) => magasin.faire([{ type: 'etiquettes', de: liste, vers }])
  const creer = () => {
    const et = nouvelleEtiquette(liste, nom)
    if (!et) return
    // Une étiquette créée avec des éléments choisis se pose aussitôt dessus.
    const pas = [
      { type: 'etiquettes' as const, de: liste, vers: [...liste, et] },
      ...elements.flatMap((e) => annoter(e, { etiquettes: basculerEtiquette(e.etiquettes, et.id) }) ?? []),
    ]
    magasin.faire(pas)
    setNom('')
  }
  // Tous l'ont : on la leur ôte. Sinon seuls ceux qui ne l'ont pas la reçoivent.
  const poser = (id: string) => {
    const tous = etatEtiquette(elements, id) === 'tous'
    magasin.faire(
      elements.flatMap((e) => {
        const a = e.etiquettes?.includes(id) ?? false
        return a === tous ? (annoter(e, { etiquettes: basculerEtiquette(e.etiquettes, id) }) ?? []) : []
      }),
    )
  }
  const retirer = (id: string) => {
    const { etiquettes, elements: portent } = supprimerEtiquette(liste, tableau.elements, id)
    magasin.faire([
      { type: 'etiquettes', de: liste, vers: etiquettes },
      ...portent.flatMap((e) => annoter(e, { etiquettes: (e.etiquettes ?? []).filter((x) => x !== id) }) ?? []),
    ])
    if (filtre.has(id)) basculerFiltre(id)
  }

  return (
    <div className="notak-etiquettes" role="group" aria-label={t('etiquettes.titre')} onKeyDown={(e) => e.stopPropagation()}>
      {liste.length === 0 && <p className="notak-etiquettes-vide">{t('etiquettes.aucune')}</p>}
      {liste.map((et) => {
        const etat = etatEtiquette(elements, et.id)
        return (
          <div key={et.id} className="notak-etiquettes-ligne">
            {ecrire && elements.length > 0 && (
              <input
                type="checkbox"
                aria-label={t('etiquettes.poser', { nom: et.nom })}
                checked={etat === 'tous'}
                ref={(n) => {
                  if (n) n.indeterminate = etat === 'certains'
                }}
                onChange={() => poser(et.id)}
              />
            )}
            <button
              type="button"
              className="notak-etiquettes-pastille"
              data-fond={et.couleur}
              title={t('etiquettes.couleur', { couleur: LIBELLES_COULEUR[et.couleur] })}
              disabled={!ecrire}
              onClick={() => setCouleurDe(couleurDe === et.id ? null : et.id)}
            />
            {ecrire ? (
              <input
                className="notak-etiquettes-nom"
                defaultValue={et.nom}
                maxLength={NOM_ETIQUETTE_MAX}
                aria-label={t('etiquettes.nom')}
                onBlur={(e) => {
                  const suite = renommerEtiquette(liste, et.id, e.target.value)
                  if (suite.find((x) => x.id === et.id)!.nom !== et.nom) changerListe(suite)
                  else e.target.value = et.nom
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
            ) : (
              <span className="notak-etiquettes-nom">{et.nom}</span>
            )}
            <button
              type="button"
              className="notak-etiquettes-filtre"
              aria-pressed={filtre.has(et.id)}
              aria-label={t('etiquettes.filtrerPar', { nom: et.nom })}
              title={filtre.has(et.id) ? t('etiquettes.nePlusFiltrer') : t('etiquettes.filtrer')}
              onClick={() => basculerFiltre(et.id)}
            >
              <Icone nom="oeil" taille={16} />
            </button>
            {ecrire && (
              <button type="button" className="notak-etiquettes-retirer" title={t('etiquettes.supprimer')} aria-label={t('etiquettes.supprimerNom', { nom: et.nom })} onClick={() => retirer(et.id)}>
                <Icone nom="fermer" />
              </button>
            )}
            {couleurDe === et.id && (
              <div className="notak-note-pastilles notak-etiquettes-palette">
                {COULEURS_NOTE.map((c: CouleurNote) => (
                  <button
                    key={c}
                    type="button"
                    data-fond={c}
                    title={LIBELLES_COULEUR[c]}
                    aria-label={LIBELLES_COULEUR[c]}
                    aria-pressed={et.couleur === c}
                    onClick={() => {
                      changerListe(colorerEtiquette(liste, et.id, c))
                      setCouleurDe(null)
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
      {filtre.size > 0 && (
        <button type="button" className="notak-etiquettes-lien" onClick={viderFiltre}>
          {t('etiquettes.toutMontrer')}
        </button>
      )}
      {ecrire && (
        <form
          className="notak-etiquettes-nouvelle"
          onSubmit={(e) => {
            e.preventDefault()
            creer()
          }}
        >
          <input value={nom} maxLength={NOM_ETIQUETTE_MAX} placeholder={t('etiquettes.nouvelle')} aria-label={t('etiquettes.nomNouvelle')} onChange={(e) => setNom(e.target.value)} />
          <button type="submit" disabled={!nom.trim()}>
            {t('etiquettes.creer')}
          </button>
        </form>
      )}
    </div>
  )
}
