import { useCallback, useEffect, useState } from 'react'

/**
 * Les réglages de l'interface, gardés par navigateur : thème, taille de l'interface, et ce que fait un double-clic
 * sur le vide. Cmd+, ouvre la fenêtre ; Cmd+Maj+D bascule le thème sans l'ouvrir.
 */
export interface Reglages {
  theme: 'clair' | 'sombre'
  taille: 'petite' | 'moyenne' | 'grande'
  /** Un double-clic sur le vide crée une note. */
  doubleClic: boolean
}

const CLE = 'notak:reglages'
const DEFAUT: Reglages = { theme: 'clair', taille: 'moyenne', doubleClic: true }

function lire(): Reglages {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? '{}') as Partial<Reglages>
    // L'ancienne clé du thème seul, d'avant la fenêtre des réglages.
    const theme = brut.theme ?? (localStorage.getItem('notak:theme') === 'sombre' ? 'sombre' : undefined)
    return {
      theme: theme === 'sombre' ? 'sombre' : 'clair',
      taille: brut.taille === 'petite' || brut.taille === 'grande' ? brut.taille : 'moyenne',
      doubleClic: brut.doubleClic !== false,
    }
  } catch {
    return DEFAUT
  }
}

export function useReglages() {
  const [reglages, setReglages] = useState(lire)
  useEffect(() => {
    try {
      localStorage.setItem(CLE, JSON.stringify(reglages))
    } catch {
      // Sans stockage (navigation privée), les réglages valent pour la page.
    }
  }, [reglages])
  const changer = useCallback((r: Partial<Reglages>) => setReglages((v) => ({ ...v, ...r })), [])
  return [reglages, changer] as const
}

export function FenetreReglages({ reglages, changer, fermer }: { reglages: Reglages; changer(r: Partial<Reglages>): void; fermer(): void }) {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      fermer()
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [fermer])
  const choix = <K extends keyof Reglages>(cle: K, valeurs: [Reglages[K], string][]) => (
    <div className="notak-reglages-choix" role="radiogroup">
      {valeurs.map(([v, libelle]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={reglages[cle] === v} onClick={() => changer({ [cle]: v } as Partial<Reglages>)}>
          {libelle}
        </button>
      ))}
    </div>
  )
  return (
    <div className="notak-raccourcis-fond" onPointerDown={(e) => (e.stopPropagation(), e.target === e.currentTarget && fermer())}>
      <div className="notak-raccourcis notak-reglages" role="dialog" aria-label="Réglages">
        <div className="notak-raccourcis-tete">
          <strong>Réglages</strong>
          <button type="button" aria-label="Fermer" onClick={fermer}>
            ×
          </button>
        </div>
        <div className="notak-reglages-corps">
          <label>Thème</label>
          {choix('theme', [
            ['clair', 'Clair'],
            ['sombre', 'Sombre'],
          ])}
          <label>Taille de l’interface</label>
          {choix('taille', [
            ['petite', 'Petite'],
            ['moyenne', 'Moyenne'],
            ['grande', 'Grande'],
          ])}
          <label>Double-clic sur le vide</label>
          {choix('doubleClic', [
            [true, 'Crée une note'],
            [false, 'Ne fait rien'],
          ])}
        </div>
      </div>
    </div>
  )
}
