import { Bouton, Confirmation as ConfirmationCommune, Dialogue, Icone } from '@notak/tableau'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { EntreeBibliotheque } from '../api'
import { t, tn } from '../langue'
import { filtrer } from '../Bibliotheque'
import { horsDAtteinte, porteuseDe } from './selection'

/**
 * Choisir où ranger : l'accueil, puis chaque toile par son nom, avec ce qui la porte. Celles où l'on ne peut pas
 * ranger (les toiles déplacées, et ce qu'elles contiennent) n'y sont pas ; celle où tout est déjà est grisée.
 */
export function DeplacerVers({
  entrees,
  toutes,
  accueil,
  choisir,
  fermer,
}: {
  entrees: readonly EntreeBibliotheque[]
  toutes: readonly EntreeBibliotheque[]
  accueil: { id: string; titre: string }
  choisir(vers: { id: string; titre: string }): void
  fermer(): void
}) {
  const [requete, setRequete] = useState('')
  const [courante, setCourante] = useState<number | null>(null)
  const liste = useRef<HTMLUListElement>(null)
  const exclues = useMemo(() => horsDAtteinte(toutes, entrees), [toutes, entrees])
  const toiles = useMemo(
    () => toutes.filter((e) => e.element === null && !exclues.has(e.tableau)).sort((a, b) => (a.titre || '￿').localeCompare(b.titre || '￿', undefined, { sensitivity: 'base', numeric: true })),
    [toutes, exclues],
  )
  const cibles = [
    ...(requete.trim() === '' ? [{ id: accueil.id, titre: accueil.titre, ou: null as string | null, maison: true }] : []),
    ...filtrer(toiles, requete).map((e) => ({ id: e.tableau, titre: e.titre || t('commun.sansTitre'), ou: e.ou, maison: false })),
  ]
  const ici = (id: string) => entrees.every((e) => porteuseDe(e) === id)
  // On part de la première toile où l'on peut ranger : celle où tout est déjà ne se choisit pas.
  const premiere = Math.max(0, cibles.findIndex((c) => !ici(c.id)))
  const n = Math.min(courante ?? premiere, Math.max(0, cibles.length - 1))
  useEffect(() => {
    liste.current?.querySelectorAll('li')[n]?.scrollIntoView?.({ block: 'nearest' })
  }, [n])
  const titre = entrees.length === 1 ? tn('biblio.deplacer.titre', 1, { titre: entrees[0]!.titre || t('commun.sansTitre') }) : tn('biblio.deplacer.titre', entrees.length)
  const valider = (i: number) => {
    const c = cibles[i]
    if (c && !ici(c.id)) choisir({ id: c.id, titre: c.titre })
  }
  return (
    <Dialogue
      titre={titre}
      fermer={fermer}
      className="biblio-deplacer"
      actions={
        <>
          <Bouton variante="second" onClick={fermer}>
            {t('commun.annuler')}
          </Bouton>
          <Bouton variante="principal" disabled={!cibles[n] || ici(cibles[n]!.id)} onClick={() => valider(n)}>
            {t('biblio.deplacer.valider')}
          </Bouton>
        </>
      }
    >
      <label className="biblio-recherche-champ biblio-deplacer-champ">
        <Icone nom="recherche" taille={17} />
        <input
          autoFocus
          type="search"
          placeholder={t('biblio.deplacer.chercher')}
          aria-label={t('biblio.deplacer.chercher')}
          value={requete}
          onChange={(e) => {
            setRequete(e.target.value)
            setCourante(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setCourante(Math.max(0, Math.min(cibles.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1))))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              valider(n)
            }
          }}
        />
      </label>
      {cibles.length === 0 ? (
        <p className="biblio-deplacer-vide">{t('biblio.deplacer.aucune')}</p>
      ) : (
        <ul className="biblio-deplacer-liste" role="listbox" ref={liste} aria-label={titre}>
          {cibles.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === n} aria-disabled={ici(c.id) || undefined} onPointerEnter={() => setCourante(i)} onClick={() => valider(i)}>
              <Icone nom={c.maison ? 'maison' : 'tableau'} taille={17} />
              <span className="biblio-deplacer-nom">{c.titre}</span>
              {ici(c.id) ? <small>{t('biblio.deplacer.ici')}</small> : c.ou && <small>{t('biblio.dans', { toile: c.ou })}</small>}
            </li>
          ))}
        </ul>
      )}
    </Dialogue>
  )
}

/** Une question avant un geste qui ouvre à d'autres ce qu'on range : la confirmation commune, sans rouge (rien n'est perdu). */
export function Confirmation({ titre, texte, oui, repondre }: { titre: string; texte: string; oui: string; repondre(oui: boolean): void }) {
  return <ConfirmationCommune titre={titre} texte={texte} oui={oui} danger={false} repondre={repondre} />
}
