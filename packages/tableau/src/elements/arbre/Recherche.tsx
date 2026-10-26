import { useEffect, useRef } from 'react'
import { type Id, texteBrut } from '../../coeur/tableau'
import { t } from '../../langue'
import { Recherche as RechercheCommune } from '../../communs'
import type { Lecture } from './modele/sujets'

const normaliser = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Les sujets dont le titre, les étiquettes ou la note contiennent tous les mots cherchés, dans l'ordre de la carte. */
export function correspondances(l: Lecture, requete: string): Id[] {
  const mots = normaliser(requete).split(/\s+/).filter(Boolean)
  if (mots.length === 0) return []
  return [...l.sujets]
    .filter(([, s]) => {
      const texte = normaliser([s.titre, ...(s.etiquettes ?? []), s.note ? texteBrut(s.note) : ''].join('\n'))
      return mots.every((m) => texte.includes(m))
    })
    .map(([id]) => id)
}

/** Le champ de recherche dans une carte (Cmd+F) : Entrée va au suivant, Maj+Entrée au précédent, Échap ferme. */
export function Recherche({ texte, trouves, rang, changer, suivant, fermer }: { texte: string; trouves: number; rang: number; changer(t: string): void; suivant(sens: 1 | -1): void; fermer(): void }) {
  const champ = useRef<HTMLInputElement>(null)
  useEffect(() => {
    champ.current?.focus()
    champ.current?.select()
  }, [])
  return (
    <div className="notak-arbre-recherche" role="search">
      <RechercheCommune
        ref={champ}
        valeur={texte}
        placeholder={t('arbre.chercher')}
        aria-label={t('arbre.chercher')}
        onChange={changer}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            suivant(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            fermer()
            champ.current?.closest<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true })
          }
        }}
      />
      <output>{texte.trim() ? `${rang} / ${trouves}` : ''}</output>
      <button type="button" aria-label={t('commun.fermer')} onClick={fermer}>
        ×
      </button>
    </div>
  )
}
