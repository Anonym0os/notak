import { t } from './langue'

/**
 * Au doigt et au Pencil, un élément touché montre aussitôt ses gestes les plus courants juste au-dessus de lui, comme
 * le menu d'édition d'iOS : couper, copier, dupliquer, supprimer, et « ••• » pour tout le reste (le menu de l'appui
 * long). Ses outils de mise en forme restent dans la barre de gauche (tablette) ou la capsule du bas (téléphone).
 */
export function ActionsRapides({
  x,
  y,
  dessous,
  couper,
  copier,
  dupliquer,
  supprimer,
  plus,
}: {
  /** Le milieu de la sélection, et le bord où la barre s'accroche, en pixels de la toile. */
  x: number
  y: number
  /** Trop près du haut : la barre passe sous la sélection. */
  dessous: boolean
  couper(): void
  copier(): void
  dupliquer(): void
  supprimer(): void
  plus(): void
}) {
  const bouton = (libelle: string, faire: () => void, danger = false) => (
    <button type="button" data-danger={danger || undefined} onClick={faire}>
      {libelle}
    </button>
  )
  return (
    <div
      className="notak-actions-rapides"
      role="toolbar"
      data-dessous={dessous || undefined}
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {bouton(t('toile.couper'), couper)}
      {bouton(t('commun.copier'), copier)}
      {bouton(t('raccourcis.dupliquer'), dupliquer)}
      {bouton(t('menu.supprimer'), supprimer, true)}
      <button type="button" aria-label={t('barre.plusOutils')} onClick={plus}>
        •••
      </button>
    </div>
  )
}
