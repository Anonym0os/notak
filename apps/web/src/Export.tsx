import { useEffect, useState } from 'react'

/** Le bouton « Exporter » : le texte du tableau en Markdown ou en texte brut, à télécharger. */
export function Export({ tableau }: { tableau: string }) {
  const [ouvert, setOuvert] = useState(false)
  useEffect(() => {
    if (!ouvert) return
    const hors = (e: PointerEvent) => !(e.target as HTMLElement).closest('.export') && setOuvert(false)
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && setOuvert(false)
    document.addEventListener('pointerdown', hors)
    document.addEventListener('keydown', touche)
    return () => {
      document.removeEventListener('pointerdown', hors)
      document.removeEventListener('keydown', touche)
    }
  }, [ouvert])
  const base = `/api/tableaux/${encodeURIComponent(tableau)}`
  return (
    <div className="export">
      <button type="button" className="bouton" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        Exporter
      </button>
      {ouvert && (
        <div className="compte-menu" role="menu">
          <a role="menuitem" href={`${base}/export?format=md`} download onClick={() => setOuvert(false)}>
            Texte en Markdown
          </a>
          <a role="menuitem" href={`${base}/export?format=txt`} download onClick={() => setOuvert(false)}>
            Texte brut
          </a>
        </div>
      )}
    </div>
  )
}
