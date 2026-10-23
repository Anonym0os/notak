import { useState } from 'react'
import { t } from '../../langue'
import { CATEGORIES_EMOJIS, FREQUENTS, chercherEmojis } from './catalogueEmojis'

const CLE_RECENTS = 'notak:emojis-recents'
const RECENTS_MAX = 8

const recents = (): string[] => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CLE_RECENTS) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENTS_MAX) : []
  } catch {
    return []
  }
}

const retenir = (emoji: string) => {
  try {
    localStorage.setItem(CLE_RECENTS, JSON.stringify([emoji, ...recents().filter((x) => x !== emoji)].slice(0, RECENTS_MAX)))
  } catch {
    // Le navigateur refuse de garder quoi que ce soit : les fréquents restent ceux d'origine.
  }
}

/**
 * Le sélecteur d'émojis des réactions : une recherche, des catégories en onglets (les fréquents d'abord : les derniers
 * employés, complétés par les huit d'origine) et une grille de huit colonnes qui défile.
 */
export function SelecteurEmojis({ choisir }: { choisir(emoji: string): void }) {
  const [requete, setRequete] = useState('')
  const [categorie, setCategorie] = useState('frequents')
  const frequents = [...new Set([...recents(), ...FREQUENTS])].slice(0, 16)
  const trouves = chercherEmojis(requete).map((m) => m.e)
  const liste = requete.trim() ? trouves : categorie === 'frequents' ? frequents : CATEGORIES_EMOJIS.find((c) => c.cle === categorie)?.emojis.map((m) => m.e) ?? []
  const poser = (e: string) => {
    retenir(e)
    choisir(e)
  }
  return (
    <div className="notak-emojis">
      <input
        type="text"
        className="notak-emojis-recherche"
        value={requete}
        placeholder={t('emojis.chercher')}
        aria-label={t('emojis.chercher')}
        onChange={(e) => setRequete(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      {!requete.trim() && (
        <div className="notak-emojis-categories" role="tablist">
          {[{ cle: 'frequents', icone: '🕘' }, ...CATEGORIES_EMOJIS].map((c) => (
            <button key={c.cle} type="button" role="tab" aria-selected={c.cle === categorie} title={t(`emojis.${c.cle}`)} aria-label={t(`emojis.${c.cle}`)} data-categorie={c.cle} onClick={() => setCategorie(c.cle)}>
              {c.icone}
            </button>
          ))}
        </div>
      )}
      <div className="notak-emojis-grille" role="group" aria-label={requete.trim() ? t('emojis.resultats') : t(`emojis.${categorie}`)}>
        {liste.map((m) => (
          <button key={m} type="button" role="menuitem" aria-label={t('decor.reagirAvec', { emoji: m })} onClick={() => poser(m)}>
            {m}
          </button>
        ))}
        {liste.length === 0 && <span className="notak-emojis-vide">{t('emojis.aucun')}</span>}
      </div>
    </div>
  )
}
