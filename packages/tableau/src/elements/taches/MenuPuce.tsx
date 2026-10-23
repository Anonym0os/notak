import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type GenrePuce, type Personne, decaler, initiales, jourDe, teinteDe } from './puces'
import { t } from '../../langue'

/** Où le menu s'ouvre : sous la puce touchée, en coordonnées d'écran. */
export interface OuverturePuce {
  genre: GenrePuce
  ancre: { left: number; bottom: number }
  /** Le nœud qui porte la toile, où le menu se range pour garder ses couleurs. */
  hote: HTMLElement
}

const LARGEUR_MENU = 232

/**
 * Le petit menu d'une puce : l'échéance se choisit au calendrier ou d'un raccourci, la personne parmi ceux qui
 * sont là ou en tapant un nom. Il se ferme d'un clic ailleurs ou d'Échap ; `regler(null)` retire ce qui était posé.
 */
export function MenuPuce({ ouverture, valeur, personnes, regler, fermer }: {
  ouverture: OuverturePuce
  valeur: string | null
  /** Ceux qu'on propose d'assigner. */
  personnes: Personne[]
  regler(valeur: string | null): void
  fermer(): void
}) {
  const [nom, setNom] = useState('')
  const racine = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const hors = (e: PointerEvent) => {
      if (!racine.current?.contains(e.target as Node)) fermer()
    }
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      fermer()
    }
    document.addEventListener('pointerdown', hors, true)
    document.addEventListener('keydown', touche, true)
    return () => {
      document.removeEventListener('pointerdown', hors, true)
      document.removeEventListener('keydown', touche, true)
    }
  }, [fermer])
  const { ancre } = ouverture
  const aujourdhui = jourDe(new Date())
  const choisir = (v: string | null) => {
    regler(v)
    fermer()
  }
  return createPortal(
    <div
      ref={racine}
      className="notak-menu-puce"
      role="menu"
      style={{ left: Math.max(8, Math.min(ancre.left, window.innerWidth - LARGEUR_MENU - 8)), top: ancre.bottom + 6 }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {ouverture.genre === 'echeance' ? (
        <>
          <input
            type="date"
            aria-label={t('decor.echeance')}
            value={valeur ?? ''}
            autoFocus
            onChange={(e) => e.target.value && choisir(e.target.value)}
          />
          <div className="notak-menu-puce-raccourcis">
            <button type="button" role="menuitem" onClick={() => choisir(aujourdhui)}>
              {t('taches.aujourdhui')}
            </button>
            <button type="button" role="menuitem" onClick={() => choisir(decaler(aujourdhui, 1))}>
              {t('taches.demain')}
            </button>
            <button type="button" role="menuitem" onClick={() => choisir(decaler(aujourdhui, 7))}>
              {t('taches.semaine')}
            </button>
          </div>
        </>
      ) : (
        <>
          <input
            type="text"
            aria-label={t('taches.nom')}
            placeholder={t('taches.unNom')}
            value={nom}
            autoFocus
            onChange={(e) => setNom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && nom.trim() !== '') choisir(nom.trim())
            }}
          />
          <div className="notak-menu-puce-raccourcis">
            {personnes.map((p) => (
              <button key={p.nom} type="button" role="menuitem" aria-pressed={p.nom === valeur} onClick={() => choisir(p.nom)}>
                <span className="notak-menu-puce-pastille" style={{ background: p.couleur ?? teinteDe(p.nom) }}>
                  {initiales(p.nom)}
                </span>
                {p.nom}
              </button>
            ))}
          </div>
        </>
      )}
      <button type="button" role="menuitem" className="notak-menu-puce-retirer" onClick={() => choisir(null)}>
        {ouverture.genre === 'echeance' ? t('taches.retirerEcheance') : t('taches.retirerPersonne')}
      </button>
    </div>,
    ouverture.hote,
  )
}
