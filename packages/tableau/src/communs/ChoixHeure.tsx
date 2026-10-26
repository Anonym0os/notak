import { useState } from 'react'
import { heureDe, lireHeure } from './dates'
import { t } from '../langue'
import { Icone } from '../icones'
import './calendrier.css'

/** Les deux chiffres d'un nombre. */
const deux = (n: number) => String(n).padStart(2, '0')

/** Un des deux champs de l'heure : on tape les chiffres, ↑ ↓ changent la valeur d'un pas, qui reboucle. */
function ChampNombre({ valeur, max, pas, nom, changer }: { valeur: number; max: number; pas: number; nom: string; changer(n: number): void }) {
  // Pendant la frappe, ce qu'on a tapé (« 1 » avant « 17 ») ; sinon la valeur, sur deux chiffres.
  const [saisie, setSaisie] = useState<string | null>(null)
  return (
    <input
      className="notak-heure-champ"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={2}
      aria-label={nom}
      value={saisie ?? deux(valeur)}
      onFocus={(e) => e.target.select()}
      onBlur={() => setSaisie(null)}
      onChange={(e) => {
        const chiffres = e.target.value.replace(/\D/g, '').slice(0, 2)
        setSaisie(chiffres)
        if (chiffres !== '') changer(Math.min(Number(chiffres), max))
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        e.preventDefault()
        setSaisie(null)
        const n = valeur + (e.key === 'ArrowUp' ? pas : -pas)
        changer(((n % (max + 1)) + (max + 1)) % (max + 1))
      }}
    />
  )
}

/**
 * L'heure qui se pose sous un calendrier quand le champ en porte une : sans heure, un bouton « Ajouter une heure… » ;
 * avec, une ligne (horloge, heures et minutes, « Retirer l'heure »). `valeur` s'écrit `HH:MM` ; `null` : pas d'heure.
 */
export function ChoixHeure({ valeur, changer, parDefaut = '17:00', desactive }: {
  valeur: string | null
  /** La nouvelle heure `HH:MM`, ou `null` quand on la retire. */
  changer(heure: string | null): void
  /** L'heure proposée quand on en ajoute une. */
  parDefaut?: string
  desactive?: boolean
}) {
  const lue = valeur === null ? null : (lireHeure(valeur) ?? { h: 0, m: 0 })
  if (lue === null) {
    return (
      <button type="button" className="notak-heure-ajout" disabled={desactive} onClick={() => changer(parDefaut)}>
        <Icone nom="horloge" taille={16} />
        {t('taches.ajouterHeure')}
      </button>
    )
  }
  return (
    <div className="notak-heure" role="group" aria-label={t('taches.heure')}>
      <Icone nom="horloge" taille={16} />
      <span className="notak-heure-champs">
        <ChampNombre valeur={lue.h} max={23} pas={1} nom={t('heure.heures')} changer={(h) => changer(heureDe(h, lue.m))} />
        <span aria-hidden>:</span>
        <ChampNombre valeur={lue.m} max={59} pas={5} nom={t('heure.minutes')} changer={(m) => changer(heureDe(lue.h, m))} />
      </span>
      <button type="button" className="notak-heure-retirer" onClick={() => changer(null)}>
        {t('taches.retirerHeure')}
      </button>
    </div>
  )
}
