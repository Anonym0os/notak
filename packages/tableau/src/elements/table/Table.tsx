import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Table } from '../../coeur/tableau'
import type { PropsOutils, PropsRendu } from '../types'
import {
  ajouterColonne,
  ajouterLigne,
  celluleSuivante,
  changerCellule,
  nombreColonnes,
  normaliser,
  retirerColonne,
  retirerLigne,
  COLONNES_MAX,
  COLONNES_MIN,
  LIGNES_MAX,
  LIGNES_MIN,
} from './grille'
import { t } from '../../langue'

/** Les boutons et les champs de la table ne lancent pas de glisser. */
const garder = (e: React.PointerEvent) => e.stopPropagation()

const sansEntete = ({ sansEntete: _, ...reste }: Table): Table => reste

export function RenduTable({ element, enEdition, contexte, brouillon }: PropsRendu<Table>) {
  const c = element.contenu
  if (enEdition) return <Edition contenu={c} contexte={contexte} ecrire={brouillon} />
  const cellules = normaliser(c.cellules)
  return (
    <div className="notak-table">
      <table>
        <tbody>
          {cellules.map((ligne, i) => (
            <tr key={i} data-entete={i === 0 && !c.sansEntete ? '' : undefined}>
              {ligne.map((texte, j) => (
                <td key={j}>{texte}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * La table en édition : chaque cellule est un champ. Tab passe à la suivante (en dernier, il ajoute une ligne),
 * Entrée descend d'une ligne, Maj+Entrée va à la ligne dans la cellule. Ce qu'on tape part au brouillon.
 */
function Edition({ contenu, contexte, ecrire }: { contenu: Table; contexte: PropsRendu<Table>['contexte']; ecrire(c: Table): void }) {
  const [cellules, setCellules] = useState(() => normaliser(contenu.cellules))
  const champs = useRef(new Map<string, HTMLTextAreaElement>())
  const focus = useRef<[number, number] | null>(null)
  const colonnes = nombreColonnes(cellules)

  const poser = (suite: string[][], vers?: [number, number]) => {
    setCellules(suite)
    ecrire({ ...contenu, cellules: suite })
    if (vers) focus.current = vers
  }

  // Le curseur va dans la cellule cliquée, sinon dans la première ; ensuite là où une touche l'a demandé.
  useEffect(() => {
    const ou = contexte.prendrePointEdition()
    const cible = ou && (document.elementFromPoint(ou.x, ou.y) as HTMLElement | null)?.closest<HTMLElement>('[data-cellule]')
    const [i, j] = cible?.dataset.cellule?.split(',').map(Number) ?? [0, 0]
    champs.current.get(`${i},${j}`)?.focus()
  }, [contexte])
  useLayoutEffect(() => {
    for (const n of champs.current.values()) {
      n.style.height = 'auto'
      n.style.height = `${n.scrollHeight}px`
    }
    if (focus.current) {
      champs.current.get(focus.current.join(','))?.focus()
      focus.current = null
    }
  })

  const touche = (e: React.KeyboardEvent<HTMLTextAreaElement>, i: number, j: number) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Tab') {
      e.preventDefault()
      const suivante = celluleSuivante(cellules, i, j, e.shiftKey)
      if (suivante) champs.current.get(suivante.join(','))?.focus()
      else if (!e.shiftKey && cellules.length < LIGNES_MAX) poser(ajouterLigne(cellules), [cellules.length, 0])
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (i + 1 < cellules.length) champs.current.get(`${i + 1},${j}`)?.focus()
      else if (cellules.length < LIGNES_MAX) poser(ajouterLigne(cellules), [cellules.length, j])
    }
  }

  return (
    <div className="notak-table" data-edition>
      <table>
        <tbody>
          <tr className="notak-table-retraits">
            {cellules[0]!.map((_, j) => (
              <td key={j}>
                {colonnes > COLONNES_MIN && (
                  <button type="button" title={t('table.retirerColonne')} onPointerDown={garder} onClick={() => poser(retirerColonne(cellules, j))}>
                    ×
                  </button>
                )}
              </td>
            ))}
          </tr>
          {cellules.map((ligne, i) => (
            <tr key={i} data-entete={i === 0 && !contenu.sansEntete ? '' : undefined}>
              {ligne.map((texte, j) => (
                <td key={j} data-cellule={`${i},${j}`}>
                  <textarea
                    ref={(n) => {
                      if (n) champs.current.set(`${i},${j}`, n)
                      else champs.current.delete(`${i},${j}`)
                    }}
                    rows={1}
                    value={texte}
                    maxLength={2000}
                    aria-label={t('table.cellule', { ligne: i + 1, colonne: j + 1 })}
                    onPointerDown={garder}
                    onChange={(e) => poser(changerCellule(cellules, i, j, e.target.value))}
                    onKeyDown={(e) => touche(e, i, j)}
                  />
                </td>
              ))}
              <td className="notak-table-retrait-ligne">
                {cellules.length > LIGNES_MIN && (
                  <button type="button" title={t('table.retirerLigne')} onPointerDown={garder} onClick={() => poser(retirerLigne(cellules, i))}>
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="notak-table-ajouts">
        <button type="button" disabled={cellules.length >= LIGNES_MAX} onPointerDown={garder} onClick={() => poser(ajouterLigne(cellules), [cellules.length, 0])}>
          + Ligne
        </button>
        <button type="button" disabled={colonnes >= COLONNES_MAX} onPointerDown={garder} onClick={() => poser(ajouterColonne(cellules), [0, colonnes])}>
          + Colonne
        </button>
      </div>
    </div>
  )
}

export function OutilsTable({ elements, contexte }: PropsOutils<Table>) {
  if (contexte.services.lectureSeule) return null
  const appliquer = (f: (c: Table) => Table) =>
    contexte.magasin.faire(elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: f(e.contenu) })))
  const un = elements.length === 1 ? elements[0]!.contenu : null
  const avecEntete = elements.every((e) => !e.contenu.sansEntete)
  const lignes = un?.cellules.length ?? 0
  const cols = un ? nombreColonnes(un.cellules) : 0
  return (
    <>
      <button
        type="button"
        title={t('table.entete.titre')}
        aria-pressed={avecEntete}
        onClick={() => appliquer((c) => (avecEntete ? { ...c, sansEntete: true } : sansEntete(c)))}
      >
        {t('table.entete')}
      </button>
      {un && (
        <>
          <button type="button" title={t('table.ajouterLigne')} disabled={lignes >= LIGNES_MAX} onClick={() => appliquer((c) => ({ ...c, cellules: ajouterLigne(c.cellules) }))}>
            + {t('table.ligne')}
          </button>
          <button type="button" title={t('table.ajouterColonne')} disabled={cols >= COLONNES_MAX} onClick={() => appliquer((c) => ({ ...c, cellules: ajouterColonne(c.cellules) }))}>
            + {t('type.colonne')}
          </button>
          <button type="button" title={t('table.retirerDerniereLigne')} disabled={lignes <= LIGNES_MIN} onClick={() => appliquer((c) => ({ ...c, cellules: retirerLigne(c.cellules, c.cellules.length - 1) }))}>
            − {t('table.ligne')}
          </button>
          <button type="button" title={t('table.retirerDerniereColonne')} disabled={cols <= COLONNES_MIN} onClick={() => appliquer((c) => ({ ...c, cellules: retirerColonne(c.cellules, nombreColonnes(c.cellules) - 1) }))}>
            − {t('type.colonne')}
          </button>
        </>
      )}
    </>
  )
}
