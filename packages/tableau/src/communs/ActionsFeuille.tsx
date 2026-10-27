import { type ReactNode, useState } from 'react'
import { Icone, type NomIcone } from '../icones'
import type { Entree } from './Menu'

type Ligne = Exclude<Entree, null>

/** Le presse-papiers et la duplication : une rangée de tuiles en tête, les gestes qu'on cherche le plus après un appui. */
const RAPIDES: readonly NomIcone[] = ['menuCouper', 'menuCopier', 'menuColler', 'menuDupliquer']

/**
 * Le menu d'actions d'un téléphone, en feuille, comme les réglages d'iOS : une rangée d'actions rapides, les autres
 * en cartes arrondies (un groupe par carte, là où le menu de la souris met un filet), Supprimer seul dans la sienne,
 * en rouge, et qui a créé et touché l'élément tout en bas, en petit. `avant` : ce qui vient sous la rangée rapide (les
 * outils de la barre qui n'y ont pas tenu).
 */
export function ActionsFeuille({ entrees, fermer, avant }: { entrees: Entree[]; fermer(): void; avant?: ReactNode }) {
  const rapides = entrees.filter((e): e is Ligne => !!e && !!e.icone && RAPIDES.includes(e.icone))
  const dangers = entrees.filter((e): e is Ligne => !!e && !!e.danger)
  const infos = entrees.filter((e): e is Ligne => !!e && !!e.info)
  const groupes: Ligne[][] = [[]]
  for (const e of entrees) {
    if (e === null) groupes.push([])
    else if (!rapides.includes(e) && !dangers.includes(e) && !infos.includes(e)) groupes[groupes.length - 1]!.push(e)
  }
  const faire = (e: Ligne) => {
    if (e.desactive) return
    e.faire()
    if (!e.reste) fermer()
  }
  return (
    <div className="notak-actions" role="menu">
      {rapides.length > 0 && (
        <div className="notak-actions-rapides">
          {rapides.map((e) => (
            <button key={e.libelle} type="button" role="menuitem" className="notak-actions-rapide" disabled={e.desactive} onClick={() => faire(e)}>
              <Icone nom={e.icone!} taille={24} />
              <span>{e.libelle}</span>
            </button>
          ))}
        </div>
      )}
      {avant}
      {groupes
        .filter((g) => g.length > 0)
        .map((g, i) => (
          <div key={i} className="notak-actions-carte">
            {g.map((e) => (
              <LigneAction key={e.libelle} entree={e} faire={faire} />
            ))}
          </div>
        ))}
      {dangers.length > 0 && (
        <div className="notak-actions-carte">
          {dangers.map((e) => (
            <LigneAction key={e.libelle} entree={e} faire={faire} />
          ))}
        </div>
      )}
      {infos.length > 0 && (
        <div className="notak-actions-infos">
          {infos.map((e) => (
            <p key={e.libelle}>{e.libelle}</p>
          ))}
        </div>
      )}
    </div>
  )
}

/** Une ligne de carte : l'icône, le libellé, et à droite la coche ou le chevron d'un sous-menu, qui se déplie sur place. */
function LigneAction({ entree: e, faire }: { entree: Ligne; faire(e: Ligne): void }) {
  const [ouvert, setOuvert] = useState(false)
  const sous = e.sous?.filter((x): x is Ligne => !!x)
  return (
    <>
      <button
        type="button"
        role="menuitem"
        className="notak-actions-ligne"
        data-danger={e.danger || undefined}
        aria-expanded={sous ? ouvert : undefined}
        aria-checked={e.coche}
        disabled={e.desactive}
        onClick={() => (sous ? setOuvert(!ouvert) : faire(e))}
      >
        <span className="notak-actions-icone">{e.pastille ? <span className="notak-actions-pastille" style={{ background: e.pastille }} /> : e.icone ? <Icone nom={e.icone} taille={22} /> : null}</span>
        <span className="notak-actions-libelle">{e.libelle}</span>
        {e.coche && <Icone nom="coche" taille={20} />}
        {sous && <span className="notak-actions-chevron" data-ouvert={ouvert || undefined}><Icone nom="chevronDroite" taille={18} /></span>}
      </button>
      {sous && ouvert && sous.map((x) => <LigneAction key={x.libelle} entree={x} faire={faire} />)}
    </>
  )
}
