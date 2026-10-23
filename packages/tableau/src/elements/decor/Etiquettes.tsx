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
    const t = nouvelleEtiquette(liste, nom)
    if (!t) return
    // Une étiquette créée avec des éléments choisis se pose aussitôt dessus.
    const pas = [
      { type: 'etiquettes' as const, de: liste, vers: [...liste, t] },
      ...elements.flatMap((e) => annoter(e, { etiquettes: basculerEtiquette(e.etiquettes, t.id) }) ?? []),
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
    <div className="notak-etiquettes" role="group" aria-label="Étiquettes" onKeyDown={(e) => e.stopPropagation()}>
      {liste.length === 0 && <p className="notak-etiquettes-vide">Aucune étiquette</p>}
      {liste.map((t) => {
        const etat = etatEtiquette(elements, t.id)
        return (
          <div key={t.id} className="notak-etiquettes-ligne">
            {ecrire && elements.length > 0 && (
              <input
                type="checkbox"
                aria-label={`Poser « ${t.nom} » sur la sélection`}
                checked={etat === 'tous'}
                ref={(n) => {
                  if (n) n.indeterminate = etat === 'certains'
                }}
                onChange={() => poser(t.id)}
              />
            )}
            <button
              type="button"
              className="notak-etiquettes-pastille"
              data-fond={t.couleur}
              title={`Couleur : ${LIBELLES_COULEUR[t.couleur]}`}
              disabled={!ecrire}
              onClick={() => setCouleurDe(couleurDe === t.id ? null : t.id)}
            />
            {ecrire ? (
              <input
                className="notak-etiquettes-nom"
                defaultValue={t.nom}
                maxLength={NOM_ETIQUETTE_MAX}
                aria-label="Nom de l’étiquette"
                onBlur={(e) => {
                  const suite = renommerEtiquette(liste, t.id, e.target.value)
                  if (suite.find((x) => x.id === t.id)!.nom !== t.nom) changerListe(suite)
                  else e.target.value = t.nom
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
            ) : (
              <span className="notak-etiquettes-nom">{t.nom}</span>
            )}
            <button
              type="button"
              className="notak-etiquettes-filtre"
              aria-pressed={filtre.has(t.id)}
              aria-label={`Filtrer par « ${t.nom} »`}
              title={filtre.has(t.id) ? 'Ne plus filtrer par cette étiquette' : 'Filtrer le tableau par cette étiquette'}
              onClick={() => basculerFiltre(t.id)}
            >
              👁
            </button>
            {ecrire && (
              <button type="button" className="notak-etiquettes-retirer" title="Supprimer l’étiquette" aria-label={`Supprimer « ${t.nom} »`} onClick={() => retirer(t.id)}>
                ×
              </button>
            )}
            {couleurDe === t.id && (
              <div className="notak-note-pastilles notak-etiquettes-palette">
                {COULEURS_NOTE.map((c: CouleurNote) => (
                  <button
                    key={c}
                    type="button"
                    data-fond={c}
                    title={LIBELLES_COULEUR[c]}
                    aria-label={LIBELLES_COULEUR[c]}
                    aria-pressed={t.couleur === c}
                    onClick={() => {
                      changerListe(colorerEtiquette(liste, t.id, c))
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
          Tout montrer
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
          <input value={nom} maxLength={NOM_ETIQUETTE_MAX} placeholder="Nouvelle étiquette…" aria-label="Nom de la nouvelle étiquette" onChange={(e) => setNom(e.target.value)} />
          <button type="submit" disabled={!nom.trim()}>
            Créer
          </button>
        </form>
      )}
    </div>
  )
}
