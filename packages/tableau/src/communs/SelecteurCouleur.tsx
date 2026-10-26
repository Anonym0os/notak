import { useEffect, useRef, useState } from 'react'
import { t } from '../langue'
import { assemblerCouleur, decouperCouleur, estCouleur, normaliserHex } from './couleurs'

interface Props {
  /** La couleur courante : `#rrggbb`, `#rrggbbaa`, ou autre chose (une variable CSS : elle se montre mais ne se découpe pas). */
  valeur: string | null | undefined
  /** La grille, ligne par ligne : c'est une donnée du produit (la carte a la sienne, le style la sienne). */
  palette: readonly string[]
  colonnes?: number
  /** Une couleur est posée ; `undefined` : le retour à celle du thème. */
  choisir(couleur: string | undefined): void
  /** Après le choix d'une pastille ou du bouton de retour : le popover qui porte le sélecteur se ferme. */
  fermer(): void
  /** L'opacité la plus haute qu'on puisse poser, en pour cent (une limite : 20). */
  opaciteMax?: number
  /** Les couleurs du thème de la carte, et celles prises récemment. */
  theme?: readonly string[]
  recentes?: readonly string[]
  /** Le libellé du bouton qui rend la main au thème (« Par défaut ») ; absent, il n'y a pas de bouton. */
  retour?: string | undefined
}

/** Une pastille très claire : son anneau s'assombrit pour rester visible. */
function claire(c: string): boolean {
  const v = parseInt(c.slice(1, 7), 16)
  return ((v >> 16) & 255) + ((v >> 8) & 255) + (v & 255) > 650
}

/**
 * Le sélecteur de couleur de Notak, le seul : une grille de pastilles, un champ hexadécimal, l'opacité, la couleur du
 * système, les couleurs du thème, les récentes, et le retour au thème. Il se pose dans un popover ; les palettes et les
 * couleurs récentes sont celles que le produit lui passe. Une pastille pose et ferme ; l'hexadécimal et l'opacité posent
 * à Entrée ou en quittant le champ ; le sélecteur du système, quand on le lâche (une pose à chaque mouvement noierait
 * l'historique).
 */
export function SelecteurCouleur({ valeur, palette, colonnes = 9, choisir, fermer, opaciteMax = 100, theme, recentes, retour }: Props) {
  const courante = estCouleur(valeur) ? decouperCouleur(valeur) : null
  const [hex, setHex] = useState(courante?.hex.slice(1) ?? '')
  const [opacite, setOpacite] = useState(String(courante?.opacite ?? 100))
  const natif = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setHex(courante?.hex.slice(1) ?? '')
    setOpacite(String(courante?.opacite ?? 100))
  }, [courante?.hex, courante?.opacite])
  const poser = (hexa: string, pourcent?: number) => {
    const p = Math.min(pourcent ?? courante?.opacite ?? 100, opaciteMax)
    setOpacite(String(p))
    choisir(assemblerCouleur(hexa, p))
  }
  const poserHex = () => hex.trim() !== '' && poser(normaliserHex(hex))
  const poserOpacite = () => {
    const n = Math.max(0, Math.min(opaciteMax, Math.round(Number(opacite.replace('%', '')) || 0)))
    setOpacite(String(n))
    const base = courante?.hex ?? (hex ? normaliserHex(hex) : null)
    if (base) poser(base, n)
  }
  const surEntree = (faire: () => void) => (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    faire()
  }
  // Le sélecteur du système émet un `input` à chaque mouvement : on ne pose qu'à son `change`.
  useEffect(() => {
    const n = natif.current
    if (!n) return
    const fin = () => poser(n.value)
    n.addEventListener('change', fin)
    return () => n.removeEventListener('change', fin)
  })
  const grille = (couleurs: readonly string[], etiquette: string) => (
    <div className="notak-couleurs-grille" role="group" aria-label={etiquette} style={{ gridTemplateColumns: `repeat(${colonnes}, 24px)` }}>
      {couleurs.map((c, i) => {
        const choisie = courante ? courante.hex === c.slice(0, 7).toLowerCase() && courante.opacite === 100 : typeof valeur === 'string' && valeur.toLowerCase() === c.toLowerCase()
        return (
          <button
            key={`${c}${i}`}
            type="button"
            className="notak-teinte-carree"
            style={{ background: c, ['--notak-teinte-anneau' as string]: c }}
            title={c.toUpperCase()}
            aria-label={c.toUpperCase()}
            aria-pressed={choisie}
            data-claire={claire(c) ? '' : undefined}
            onClick={() => {
              poser(c)
              fermer()
            }}
          />
        )
      })}
    </div>
  )
  const apercu = typeof valeur === 'string' ? valeur : undefined
  return (
    <div className="notak-couleurs">
      {grille(palette, t('arbre.style.couleur'))}
      <div className="notak-couleurs-perso">
        <div className="notak-couleurs-hex">
          <span className="notak-couleurs-diese">#</span>
          <input
            className="notak-couleurs-saisie"
            data-hex=""
            value={hex}
            maxLength={8}
            spellCheck={false}
            title={t('arbre.style.hexAide')}
            aria-label={t('arbre.style.hexAide')}
            onChange={(e) => setHex(e.target.value.replace('#', ''))}
            onBlur={poserHex}
            onKeyDown={surEntree(poserHex)}
          />
          <span className="notak-couleurs-filet" />
          <input
            className="notak-couleurs-saisie"
            data-opacite=""
            value={opacite}
            maxLength={3}
            inputMode="numeric"
            title={t('arbre.style.opaciteAide')}
            aria-label={t('arbre.style.opaciteAide')}
            onChange={(e) => setOpacite(e.target.value)}
            onBlur={poserOpacite}
            onKeyDown={surEntree(poserOpacite)}
          />
          <span className="notak-couleurs-diese">%</span>
        </div>
        <span className="notak-couleurs-apercu" title={apercu}>
          <span style={apercu ? { background: apercu } : undefined} />
        </span>
        <label className="notak-couleurs-systeme" title={t('arbre.style.plusDeCouleurs')}>
          <input ref={natif} type="color" aria-label={t('arbre.style.plusDeCouleurs')} value={courante ? courante.hex : '#000000'} onChange={(e) => setHex(e.target.value.slice(1))} />
        </label>
      </div>
      {retour && (
        <button
          type="button"
          className="notak-couleurs-retour"
          onClick={() => {
            choisir(undefined)
            fermer()
          }}
        >
          {retour}
        </button>
      )}
      {!!theme?.length && (
        <>
          <p className="notak-couleurs-titre">{t('arbre.style.themeActuel')}</p>
          {grille(theme, t('arbre.style.themeActuel'))}
        </>
      )}
      {!!recentes?.length && (
        <>
          <p className="notak-couleurs-titre">{t('arbre.style.recentes')}</p>
          {grille(recentes, t('arbre.style.recentes'))}
        </>
      )}
    </div>
  )
}
